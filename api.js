/* ============================================================
   api.js — rute CRUD pentru courses, notes, tasks, resources.
   v0.1.6: adăugate rute pentru portofel StudyPoints (SP) și shop
   (catalog, cumpărare, echipare temă/cadru, bonus zilnic, "vizionare
   reclamă" simulată, pachete SP simulate — fără plăți reale încă).
   Restul rutelor neschimbat față de v0.1.5.
   ============================================================ */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const db = require("./db");
const { authMiddleware, publicUser } = require("./auth");

const router = express.Router();
router.use(authMiddleware);

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${db.uid()}-${file.originalname}`)
  }),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("Doar fișiere PDF sunt acceptate."));
    cb(null, true);
  }
});

/* ===================== SETĂRI UTILIZATOR ===================== */
router.get("/settings", async (req, res) => {
  const user = await db.findUserByIdPg(req.userId);
  res.json(publicUser(user));
});
router.put("/settings", async (req, res) => {
  const {
  moodleIcsUrl,
  reminderHoursBefore,
  educationLevel,
  language
} = req.body;
  const patch = {};
  if (moodleIcsUrl !== undefined) patch.moodle_ics_url = moodleIcsUrl || null;
  if (Array.isArray(reminderHoursBefore)) patch.reminder_hours_before = reminderHoursBefore;
  if (educationLevel && ["facultate", "liceu"].includes(educationLevel)) patch.education_level = educationLevel;
  if (language && ["ro", "en"].includes(language)) patch.language = language;
  const updated = await db.updateUserPg(req.userId, patch);
  res.json(publicUser(updated));
});

/* ===================== WALLET (StudyPoints) ===================== */
router.get("/wallet", async (req, res) => {
  const wallet = await db.getWalletPg(req.userId);
  if (!wallet) return res.status(404).json({ error: "Utilizator inexistent." });
  res.json(wallet);
});
router.get("/wallet/packages", (req, res) => {
  res.json(db.getSPPackages());
});

router.post("/wallet/daily-bonus", async (req, res) => {
  const result = await db.claimDailyBonusPg(req.userId);
  if (result.error === "already_claimed") {
    return res.status(409).json({ error: "Ai revendicat deja bonusul de azi.", balance: result.balance });
  }
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});
router.get("/wallet/transactions", async (req, res) => {
  const limit = Number(req.query.limit) || 50;

  const transactions = await db.listStudyPointsTransactionsPg(
    req.userId,
    limit
  );

  res.json({
    transactions
  });
});
router.post("/wallet/watch-ad", async (req, res) => {
  const result = await db.claimAdWatchPg(req.userId);
  if (result.error === "cooldown") {
    return res.status(429).json({ error: `Mai poți viziona una în ${result.remainingMin} min.`, remainingMin: result.remainingMin });
  }
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

router.post("/wallet/redeem-package", async (req, res) => {
  const { packageId } = req.body;
  const result = await db.redeemPackagePg(req.userId, packageId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post("/wallet/activate-pro", async (req, res) => {
  try {
    const { planId } = req.body;

    const result = await db.activateProPg(
      req.userId,
      planId
    );

    if (result.error === "insufficient_funds") {
      return res.status(402).json({
        error: "Nu ai suficiente StudyPoints.",
        needed: result.needed
      });
    }

    if (result.error) {
      return res.status(400).json({
        error: result.error
      });
    }

    res.json(result);
  } catch (err) {
    console.error("POST /wallet/activate-pro error:", err);

    res.status(500).json({
      error: "Eroare la activarea planului Pro."
    });
  }
});
/* Simulare de cumpărare pachet — fără procesare de plăți reale încă.
   Când vei conecta Stripe, acest endpoint devine cel apelat DUPĂ ce
   Stripe confirmă plata (webhook), nu direct din frontend. */

router.get("/wallet/pro-plans", (req, res) => {
  res.json(db.getProPlans());
});

/* ===================== SHOP ===================== */
router.get("/shop/catalog", (req, res) => {
  res.json(db.getShopCatalog());
});
router.post("/shop/purchase", async (req, res) => {
  const { itemId } = req.body;
  const result = await db.purchaseItemPg(req.userId, itemId);
  if (result.error === "already_owned") return res.status(409).json({ error: "Ai deja acest item." });
  if (result.error === "insufficient_funds") {
    return res.status(402).json({ error: `Îți mai sunt necesare ${result.needed} SP.`, needed: result.needed });
  }
  if (result.error) return res.status(404).json({ error: result.error });
  res.status(201).json(result);
});

router.post("/shop/equip", async (req, res) => {
  const { itemId } = req.body;
  const result = await db.equipItemPg(req.userId, itemId);
  if (result.error === "not_owned") return res.status(403).json({ error: "Nu deții acest item." });
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

/* ===================== COURSES ===================== */

router.get("/courses", async (req, res) => {
  try {
    const courses = await db.listCoursesPg(req.userId);
    res.json(courses);
  } catch (err) {
    console.error("GET /courses error:", err);
    res.status(500).json({ error: "Eroare la încărcarea materiilor." });
  }
});

router.post("/courses", async (req, res) => {
  try {
    const { name, professor, color, period } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Nume materie necesar."
      });
    }

    const course = await db.insertCoursePg(req.userId, {
      name,
      professor,
      color,
      period
    });

    res.status(201).json(course);
  } catch (err) {
    console.error("POST /courses error:", err);
    res.status(500).json({ error: "Eroare la crearea materiei." });
  }
});

router.patch("/courses/:id", async (req, res) => {
  try {
    const course = await db.findCoursePg(
      req.params.id,
      req.userId
    );

    if (!course) {
      return res.status(404).json({
        error: "Materie inexistentă."
      });
    }

    const { name, professor, color, period } = req.body;
    const patch = {};

    if (name !== undefined) patch.name = name;
    if (professor !== undefined) patch.professor = professor;
    if (color !== undefined) patch.color = color;
    if (period !== undefined) patch.period = period;

    const updatedCourse = await db.updateCoursePg(
      req.params.id,
      req.userId,
      patch
    );

    res.json(updatedCourse);
  } catch (err) {
    console.error("PATCH /courses/:id error:", err);
    res.status(500).json({
      error: "Eroare la actualizarea materiei."
    });
  }
});

router.delete("/courses/:id", async (req, res) => {
  try {
    const removedResources = await db.deleteCoursePg(
      req.params.id,
      req.userId
    );

    if (!removedResources) {
      return res.status(404).json({
        error: "Materie inexistentă."
      });
    }

    removedResources.forEach((resource) => {
      const filePath = path.join(uploadDir, resource.filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /courses/:id error:", err);
    res.status(500).json({
      error: "Eroare la ștergerea materiei."
    });
  }
});
/* ===================== GRADING (note ponderate) ===================== */

router.post(
  "/courses/:courseId/grading-categories",
  async (req, res) => {
    try {
      const { name, weight } = req.body;

      if (!name || weight === undefined) {
        return res.status(400).json({
          error: "Nume și pondere necesare."
        });
      }

      const course = await db.addGradingCategoryPg(
        req.params.courseId,
        req.userId,
        { name, weight }
      );

      if (course?.error === "invalid_weight") {
        return res.status(400).json({
          error: "Ponderea trebuie să fie un număr pozitiv."
        });
      }

      if (course?.error === "weight_exceeds_total") {
        return res.status(400).json({
          error: `Mai poți adăuga cel mult ${course.remainingWeight}% pondere.`
        });
      }

      if (!course) {
        return res.status(404).json({
          error: "Materie inexistentă."
        });
      }

      res.status(201).json(course);
    } catch (err) {
      console.error("POST grading category error:", err);

      res.status(500).json({
        error: "Eroare la adăugarea categoriei."
      });
    }
  }
);

router.patch(
  "/courses/:courseId/grading-categories/:categoryId",
  async (req, res) => {
    try {
      const course = await db.updateGradingCategoryPg(
        req.params.courseId,
        req.userId,
        req.params.categoryId,
        req.body
      );

      if (!course) {
        return res.status(404).json({
          error: "Categorie sau materie inexistentă."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("PATCH grading category error:", err);
      res.status(500).json({
        error: "Eroare la actualizarea categoriei."
      });
    }
  }
);

router.delete(
  "/courses/:courseId/grading-categories/:categoryId",
  async (req, res) => {
    try {
      const course = await db.deleteGradingCategoryPg(
        req.params.courseId,
        req.userId,
        req.params.categoryId
      );

      if (!course) {
        return res.status(404).json({
          error: "Categorie sau materie inexistentă."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("DELETE grading category error:", err);
      res.status(500).json({
        error: "Eroare la ștergerea categoriei."
      });
    }
  }
);

router.post(
  "/courses/:courseId/grades",
  async (req, res) => {
    try {
      const {
        categoryId,
        label,
        value,
        maxValue
      } = req.body;

      if (!categoryId || value === undefined) {
        return res.status(400).json({
          error: "Categorie și notă necesare."
        });
      }

      const course = await db.addGradePg(
        req.params.courseId,
        req.userId,
        {
          categoryId,
          label,
          value,
          maxValue
        }
      );
      if (course?.error === "grade_out_of_range") {
        return res.status(400).json({
          error: `Nota trebuie să fie între 0 și ${course.maxValue}.`
        });
      }
      if (!course) {
        return res.status(404).json({
          error: "Materie sau categorie inexistentă."
        });
      }

      res.status(201).json(course);
    } catch (err) {
      console.error("POST grade error:", err);
      res.status(500).json({
        error: "Eroare la adăugarea notei."
      });
    }
  }
);

router.delete(
  "/courses/:courseId/grades/:gradeId",
  async (req, res) => {
    try {
      const course = await db.deleteGradePg(
        req.params.courseId,
        req.userId,
        req.params.gradeId
      );

      if (!course) {
        return res.status(404).json({
          error: "Notă sau materie inexistentă."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("DELETE grade error:", err);
      res.status(500).json({
        error: "Eroare la ștergerea notei."
      });
    }
  }
);
/* ===================== NOTES (notebook) ===================== */
router.get("/notes", async (req, res) => {
  try {
    const notes = await db.listNotesPg(req.userId);
    res.json(notes);
  } catch (err) {
    console.error("GET notes error:", err);
    res.status(500).json({
      error: "Eroare la încărcarea notițelor."
    });
  }
});


router.post("/notes", async (req, res) => {
  try {
    const note = await db.insertNotePg(req.userId);
    res.status(201).json(note);
  } catch (err) {
    console.error("POST note error:", err);
    res.status(500).json({
      error: "Eroare la crearea notiței."
    });
  }
});


router.put("/notes/:id", async (req, res) => {
  try {
    const updated = await db.updateNotePg(
      req.params.id,
      req.userId,
      req.body
    );

    if (!updated) {
      return res.status(404).json({
        error: "Notiță inexistentă."
      });
    }

    res.json(updated);
  } catch (err) {
    console.error("PUT note error:", err);
    res.status(500).json({
      error: "Eroare la salvarea notiței."
    });
  }
});


router.delete("/notes/:id", async (req, res) => {
  try {
    await db.deleteNotePg(
      req.params.id,
      req.userId
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE note error:", err);
    res.status(500).json({
      error: "Eroare la ștergerea notiței."
    });
  }
});
/* ===================== TASKS ===================== */
router.get("/tasks", async (req, res) => {
  const tasks = await db.listTasksPg(req.userId);
  res.json(tasks);
});


router.post("/tasks", async (req, res) => {
  const { title, courseId, type, due } = req.body;

  if (!title || !due) {
    return res.status(400).json({
      error: "Titlu și dată necesare."
    });
  }

  const task = await db.insertTaskPg(req.userId, {
    title,
    courseId,
    type,
    due
  });

  res.status(201).json(task);
});


router.post("/tasks/import-ics", async (req, res) => {
  const { events, courseId } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({
      error: "Niciun eveniment de importat."
    });
  }

  const inserted = await db.bulkInsertTasksPg(
    req.userId,
    events,
    courseId
  );

  res.status(201).json({
    imported: inserted.length,
    skipped: events.length - inserted.length
  });
});
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchText(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Moodle a răspuns cu status ${res.statusCode}.`));
        }
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function parseICS(text) {
  const events = [];
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  blocks.forEach((block) => {
    const summaryMatch = block.match(/SUMMARY:(.+)/);
    const dtstartMatch = block.match(/DTSTART[^:]*:(\d{4})(\d{2})(\d{2})/);
    if (summaryMatch && dtstartMatch) {
      const [, y, m, d] = dtstartMatch;
      events.push({ title: summaryMatch[1].trim().replace(/\\,/g, ","), due: `${y}-${m}-${d}` });
    }
  });
  return events;
}

router.post("/tasks/sync-moodle", async (req, res) => {
  const user = await db.findUserByIdPg(req.userId);
  const { courseId } = req.body;
  if (!user.moodle_ics_url) {
    return res.status(400).json({ error: "Nu ai salvat încă un URL de calendar Moodle în Setări." });
  }
  try {
    const text = await fetchText(user.moodle_ics_url);
    if (!text.includes("BEGIN:VEVENT")) {
      return res.status(400).json({ error: "Răspunsul de la Moodle nu conține un calendar valid." });
    }
    const events = parseICS(text);
    const inserted = await db.bulkInsertTasksPg(
      req.userId,
      events,
      courseId
    );
    res.json({ imported: inserted.length, skipped: events.length - inserted.length, total: events.length });
  } catch (err) {
    res.status(502).json({ error: `Nu am putut contacta Moodle: ${err.message}` });
  }
});

router.patch("/tasks/:id", async (req, res) => {
  try {
    const task = await db.findTaskPg(
      req.params.id,
      req.userId
    );

    if (!task) {
      return res.status(404).json({
        error: "Task inexistent."
      });
    }

    const newStatus = req.body.status || task.status;

    const updated = await db.updateTaskStatusPg(
      req.params.id,
      req.userId,
      newStatus
    );

    let spResult = null;

    if (newStatus === "done" && task.status !== "done") {
      spResult = await db.awardTaskOnTimeIfEligiblePg(
        req.params.id,
        req.userId
      );
    }

    res.json({
      ...updated,
      spAwardedNow: spResult
    });
  } catch (err) {
    console.error("PATCH task error:", err);

    res.status(500).json({
      error: "Eroare la actualizarea task-ului."
    });
  }
});


router.delete("/tasks/:id", async (req, res) => {
  try {
    await db.deleteTaskPg(
      req.params.id,
      req.userId
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE task error:", err);

    res.status(500).json({
      error: "Eroare la ștergerea task-ului."
    });
  }
});
/* ===================== ATTENDANCE (absence tracker) ===================== */

const ATTENDANCE_ALERT_THRESHOLD = 75;

router.post(
  "/courses/:courseId/attendance/:type",
  async (req, res) => {
    try {
      const { type } = req.params;

      if (!["present", "absent"].includes(type)) {
        return res.status(400).json({
          error: "Tip invalid."
        });
      }

      const course = await db.recordAttendancePg(
        req.params.courseId,
        req.userId,
        type
      );

      if (!course) {
        return res.status(404).json({
          error: "Materie inexistentă."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("POST attendance error:", err);
      res.status(500).json({
        error: "Eroare la înregistrarea prezenței."
      });
    }
  }
);

router.post(
  "/courses/:courseId/attendance/:type/undo",
  async (req, res) => {
    try {
      const { type } = req.params;

      if (!["present", "absent"].includes(type)) {
        return res.status(400).json({
          error: "Tip invalid."
        });
      }

      const course = await db.undoLastAttendancePg(
        req.params.courseId,
        req.userId,
        type
      );

      if (!course) {
        return res.status(404).json({
          error: "Materie inexistentă."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("POST attendance undo error:", err);
      res.status(500).json({
        error: "Eroare la anularea prezenței."
      });
    }
  }
);

router.post(
  "/courses/:courseId/attendance/reset",
  async (req, res) => {
    try {
      const course = await db.resetAttendancePg(
        req.params.courseId,
        req.userId
      );

      if (!course) {
        return res.status(404).json({
          error: "Materie inexistentă."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("POST attendance reset error:", err);
      res.status(500).json({
        error: "Eroare la resetarea prezenței."
      });
    }
  }
);

router.get(
  "/attendance/overview",
  async (req, res) => {
    try {
      const courses = await db.listCoursesPg(req.userId);

      const overview = courses.map((course) => {
        const attendance = course.attendance || {
          present: 0,
          absent: 0
        };

        const total =
          attendance.present + attendance.absent;

        const percent =
          total > 0
            ? (attendance.present / total) * 100
            : null;

        return {
          id: course.id,
          name: course.name,
          color: course.color,
          present: attendance.present,
          absent: attendance.absent,
          total,
          percent,
          belowThreshold:
            percent !== null &&
            percent < ATTENDANCE_ALERT_THRESHOLD
        };
      });

      res.json({
        threshold: ATTENDANCE_ALERT_THRESHOLD,
        courses: overview
      });
    } catch (err) {
      console.error("GET attendance overview error:", err);
      res.status(500).json({
        error: "Eroare la încărcarea prezențelor."
      });
    }
  }
);
/* ===================== FLASHCARDS ===================== */
router.post(
  "/courses/:courseId/flashcard-decks",
  async (req, res) => {
    try {
      const { name, cards } = req.body;

      const course = await db.addFlashcardDeckPg(
        req.params.courseId,
        req.userId,
        { name, cards }
      );

      if (!course) {
        return res.status(404).json({
          error: "Materie inexistentă."
        });
      }

      res.status(201).json(course);
    } catch (err) {
      console.error("POST flashcard deck error:", err);
      res.status(500).json({
        error: "Eroare la adăugarea deck-ului."
      });
    }
  }
);


router.delete(
  "/courses/:courseId/flashcard-decks/:deckId",
  async (req, res) => {
    try {
      const course = await db.deleteFlashcardDeckPg(
        req.params.courseId,
        req.userId,
        req.params.deckId
      );

      if (!course) {
        return res.status(404).json({
          error: "Materie sau deck inexistent."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("DELETE flashcard deck error:", err);
      res.status(500).json({
        error: "Eroare la ștergerea deck-ului."
      });
    }
  }
);

router.post(
  "/courses/:courseId/flashcard-decks/:deckId/cards",
  async (req, res) => {
    try {
      const { front, back } = req.body;

      if (!front || !back) {
        return res.status(400).json({
          error: "Față și verso necesare."
        });
      }

      const course = await db.addFlashcardPg(
        req.params.courseId,
        req.userId,
        req.params.deckId,
        { front, back }
      );

      if (!course) {
        return res.status(404).json({
          error: "Materie sau deck inexistent."
        });
      }

      res.status(201).json(course);
    } catch (err) {
      console.error("POST flashcard error:", err);
      res.status(500).json({
        error: "Eroare la adăugarea cardului."
      });
    }
  }
);


router.delete(
  "/courses/:courseId/flashcard-decks/:deckId/cards/:cardId",
  async (req, res) => {
    try {
      const course = await db.deleteFlashcardPg(
        req.params.courseId,
        req.userId,
        req.params.deckId,
        req.params.cardId
      );

      if (!course) {
        return res.status(404).json({
          error: "Card inexistent."
        });
      }

      res.json(course);
    } catch (err) {
      console.error("DELETE flashcard error:", err);
      res.status(500).json({
        error: "Eroare la ștergerea cardului."
      });
    }
  }
);

/* Generare AI de flashcards — necesită cheie OpenAI salvată în Setări.
   Fără cheie, returnăm o eroare clară în loc să eșuăm silențios. */
router.post("/courses/:courseId/flashcard-decks/generate-ai", async (req, res) => {
  const user = await db.findUserByIdPg(req.userId);
  const openaiApiKey = process.env.OPENAI_API_KEY;

if (!openaiApiKey) {
  return res.status(500).json({
    error: "openai_not_configured",
    message: "Serviciul AI nu este configurat pe server."
  });
}
  const { topic, count } = req.body;
  if (!topic) return res.status(400).json({ error: "Subiectul e necesar." });
  const numCards = Math.min(Math.max(Number(count) || 8, 3), 20);

  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Generezi flashcards de studiu. Răspunde STRICT cu JSON valid: un array de obiecte {front, back}, fără text suplimentar." },
          { role: "user", content: `Generează ${numCards} flashcards despre: ${topic}. Limba: română.` }
        ],
        temperature: 0.7
      })
    });
    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      return res.status(502).json({ error: `Eroare OpenAI: ${aiData.error?.message || "necunoscută"}` });
    }
    const raw = aiData.choices?.[0]?.message?.content || "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    let cards;
    try {
      cards = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: "Răspunsul AI nu a putut fi interpretat. Încearcă din nou." });
    }
    const course = await db.addFlashcardDeckPg(
      req.params.courseId,
      req.userId,
      { name: topic, cards }
    );
    if (!course) return res.status(404).json({ error: "Materie inexistentă." });
    res.status(201).json(course);
  } catch (err) {
    res.status(502).json({ error: `Nu am putut contacta OpenAI: ${err.message}` });
  }
});

/* ===================== RESOURCES (PDF upload real) ===================== */

router.post(
  "/courses/:courseId/resources",
  upload.single("file"),
  async (req, res) => {
    try {
      const course = await db.findCoursePg(
        req.params.courseId,
        req.userId
      );

      if (!course) {
        return res.status(404).json({
          error: "Materie inexistentă."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "Niciun fișier primit."
        });
      }

      const resource = await db.insertResourcePg(
        req.userId,
        req.params.courseId,
        {
          filename: req.file.filename,
          originalName: req.file.originalname,
          sizeKb: Math.round(req.file.size / 1024)
        }
      );

      res.status(201).json(resource);
    } catch (err) {
      console.error("POST resource error:", err);
      res.status(500).json({
        error: "Eroare la încărcarea fișierului."
      });
    }
  }
);

router.get(
  "/courses/:courseId/resources",
  async (req, res) => {
    try {
      const resources = await db.listResourcesPg(
        req.params.courseId,
        req.userId
      );

      if (resources === null) {
        return res.status(404).json({
          error: "Materie inexistentă."
        });
      }

      res.json(resources);
    } catch (err) {
      console.error("GET resources error:", err);
      res.status(500).json({
        error: "Eroare la încărcarea resurselor."
      });
    }
  }
);

router.get(
  "/resources/:id/download",
  async (req, res) => {
    try {
      const resource = await db.findResourcePg(
        req.params.id,
        req.userId
      );

      if (!resource) {
        return res.status(404).json({
          error: "Resursă inexistentă."
        });
      }

      res.download(
        path.join(uploadDir, resource.filename),
        resource.originalName
      );
    } catch (err) {
      console.error("GET resource download error:", err);
      res.status(500).json({
        error: "Eroare la descărcarea resursei."
      });
    }
  }
);
/* ===================== SCHEDULE (orar) ===================== */

router.get("/schedule", async (req, res) => {
  try {
    const entries = await db.listScheduleEntriesPg(req.userId);
    res.json(entries);
  } catch (err) {
    console.error("GET schedule error:", err);
    res.status(500).json({
      error: "Eroare la încărcarea orarului."
    });
  }
});

router.post("/schedule", async (req, res) => {
  try {
    const {
      courseId,
      title,
      day,
      startTime,
      endTime,
      room,
      type,
      parity,
      color
    } = req.body;

    if (
      day === undefined ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        error: "Ziua și orele de început/sfârșit sunt necesare."
      });
    }

    const numericDay = Number(day);

    if (
      !Number.isInteger(numericDay) ||
      numericDay < 0 ||
      numericDay > 6
    ) {
      return res.status(400).json({
        error: "Ziua introdusă nu este validă."
      });
    }

    const entry = await db.insertScheduleEntryPg(req.userId, {
      courseId,
      title,
      day: numericDay,
      startTime,
      endTime,
      room,
      type,
      parity,
      color
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error("POST schedule error:", err);
    res.status(500).json({
      error: "Eroare la crearea intrării de orar."
    });
  }
});

router.patch("/schedule/:id", async (req, res) => {
  try {
    const updated = await db.updateScheduleEntryPg(
      req.params.id,
      req.userId,
      req.body
    );

    if (!updated) {
      return res.status(404).json({
        error: "Intrare de orar inexistentă."
      });
    }

    res.json(updated);
  } catch (err) {
    console.error("PATCH schedule error:", err);
    res.status(500).json({
      error: "Eroare la actualizarea intrării de orar."
    });
  }
});

router.delete("/schedule/:id", async (req, res) => {
  try {
    const deleted = await db.deleteScheduleEntryPg(
      req.params.id,
      req.userId
    );

    if (!deleted) {
      return res.status(404).json({
        error: "Intrare de orar inexistentă."
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE schedule error:", err);
    res.status(500).json({
      error: "Eroare la ștergerea intrării de orar."
    });
  }
});

/* ===================== SUMMARY (rezumat pe semestru/modul) ===================== */
function weightedAverage(course) {
  const categories = course.gradingCategories || [];
  const grades = course.grades || [];
  let weightedSum = 0;
  let weightUsed = 0;
  categories.forEach((cat) => {
    const catGrades = grades.filter((g) => g.categoryId === cat.id);
    if (catGrades.length === 0) return;
    const catAvg = catGrades.reduce((sum, g) => sum + (g.value / (g.maxValue || 10)) * 10, 0) / catGrades.length;
    weightedSum += catAvg * cat.weight;
    weightUsed += cat.weight;
  });
  if (weightUsed === 0) return null;
  return weightedSum / weightUsed;
}

router.get("/summary/periods", async (req, res) => {
  const courses = await db.listCoursesPg(req.userId);
  const tasks = db.listTasks(req.userId);

  const periodsMap = {};
  courses.forEach((c) => {
    const key = c.period || "—";
    if (!periodsMap[key]) periodsMap[key] = { period: key, courses: [] };

    const avg = weightedAverage(c);
    const activeTasks = tasks.filter((t) => t.course_id === c.id && t.status !== "done").length;
    const doneTasks = tasks.filter((t) => t.course_id === c.id && t.status === "done").length;

    periodsMap[key].courses.push({
      id: c.id, name: c.name, color: c.color, average: avg,
      activeTasks, doneTasks
    });
  });

  const periods = Object.values(periodsMap).map((p) => {
    const withAvg = p.courses.filter((c) => c.average !== null);
    const overallAverage = withAvg.length
      ? withAvg.reduce((sum, c) => sum + c.average, 0) / withAvg.length
      : null;
    return { ...p, overallAverage };
  });

  res.json(periods);
});

module.exports = router;
