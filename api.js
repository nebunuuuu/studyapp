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
router.get("/settings", (req, res) => {
  const user = db.findUserById(req.userId);
  res.json(publicUser(user));
});

router.put("/settings", (req, res) => {
  const { moodleIcsUrl, reminderHoursBefore, educationLevel, language, openaiApiKey } = req.body;
  const patch = {};
  if (moodleIcsUrl !== undefined) patch.moodle_ics_url = moodleIcsUrl || null;
  if (Array.isArray(reminderHoursBefore)) patch.reminder_hours_before = reminderHoursBefore;
  if (educationLevel && ["facultate", "liceu"].includes(educationLevel)) patch.education_level = educationLevel;
  if (language && ["ro", "en"].includes(language)) patch.language = language;
  if (openaiApiKey !== undefined && openaiApiKey !== "") patch.openai_api_key = openaiApiKey;
  const updated = db.updateUser(req.userId, patch);
  res.json(publicUser(updated));
});

/* ===================== WALLET (StudyPoints) ===================== */
router.get("/wallet", (req, res) => {
  const wallet = db.getWallet(req.userId);
  if (!wallet) return res.status(404).json({ error: "Utilizator inexistent." });
  res.json(wallet);
});

router.post("/wallet/daily-bonus", (req, res) => {
  const result = db.claimDailyBonus(req.userId);
  if (result.error === "already_claimed") {
    return res.status(409).json({ error: "Ai revendicat deja bonusul de azi.", balance: result.balance });
  }
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

router.post("/wallet/watch-ad", (req, res) => {
  const result = db.claimAdWatch(req.userId);
  if (result.error === "cooldown") {
    return res.status(429).json({ error: `Mai poți viziona una în ${result.remainingMin} min.`, remainingMin: result.remainingMin });
  }
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

router.get("/wallet/packages", (req, res) => {
  res.json(db.getSPPackages());
});

/* Simulare de cumpărare pachet — fără procesare de plăți reale încă.
   Când vei conecta Stripe, acest endpoint devine cel apelat DUPĂ ce
   Stripe confirmă plata (webhook), nu direct din frontend. */
router.post("/wallet/redeem-package", (req, res) => {
  const { packageId } = req.body;
  const result = db.redeemPackage(req.userId, packageId);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

/* ===================== SHOP ===================== */
router.get("/shop/catalog", (req, res) => {
  res.json(db.getShopCatalog());
});

router.post("/shop/purchase", (req, res) => {
  const { itemId } = req.body;
  const result = db.purchaseItem(req.userId, itemId);
  if (result.error === "already_owned") return res.status(409).json({ error: "Ai deja acest item." });
  if (result.error === "insufficient_funds") {
    return res.status(402).json({ error: `Îți mai sunt necesare ${result.needed} SP.`, needed: result.needed });
  }
  if (result.error) return res.status(404).json({ error: result.error });
  res.status(201).json(result);
});

router.post("/shop/equip", (req, res) => {
  const { itemId } = req.body;
  const result = db.equipItem(req.userId, itemId);
  if (result.error === "not_owned") return res.status(403).json({ error: "Nu deții acest item." });
  if (result.error) return res.status(404).json({ error: result.error });
  res.json(result);
});

/* ===================== COURSES ===================== */
router.get("/courses", (req, res) => res.json(db.listCourses(req.userId)));

router.post("/courses", (req, res) => {
  const { name, professor, color, period } = req.body;
  if (!name) return res.status(400).json({ error: "Nume materie necesar." });
  res.status(201).json(db.insertCourse(req.userId, { name, professor, color, period }));
});

router.patch("/courses/:id", (req, res) => {
  const course = db.findCourse(req.params.id, req.userId);
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  const { name, professor, color, period } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (professor !== undefined) patch.professor = professor;
  if (color !== undefined) patch.color = color;
  if (period !== undefined) patch.period = period;
  res.json(db.updateCourse(req.params.id, req.userId, patch));
});

router.delete("/courses/:id", (req, res) => {
  const course = db.findCourse(req.params.id, req.userId);
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  const removedResources = db.deleteCourse(req.params.id, req.userId);
  removedResources.forEach((r) => {
    const filePath = path.join(uploadDir, r.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  res.json({ ok: true });
});

/* ===================== GRADING (note ponderate) ===================== */
router.post("/courses/:courseId/grading-categories", (req, res) => {
  const { name, weight } = req.body;
  if (!name || weight === undefined) return res.status(400).json({ error: "Nume și pondere necesare." });
  const course = db.addGradingCategory(req.params.courseId, req.userId, { name, weight });
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  res.status(201).json(course);
});

router.patch("/courses/:courseId/grading-categories/:categoryId", (req, res) => {
  const course = db.updateGradingCategory(req.params.courseId, req.userId, req.params.categoryId, req.body);
  if (!course) return res.status(404).json({ error: "Categorie sau materie inexistentă." });
  res.json(course);
});

router.delete("/courses/:courseId/grading-categories/:categoryId", (req, res) => {
  const course = db.deleteGradingCategory(req.params.courseId, req.userId, req.params.categoryId);
  if (!course) return res.status(404).json({ error: "Categorie sau materie inexistentă." });
  res.json(course);
});

router.post("/courses/:courseId/grades", (req, res) => {
  const { categoryId, label, value, maxValue } = req.body;
  if (!categoryId || value === undefined) return res.status(400).json({ error: "Categorie și notă necesare." });
  const course = db.addGrade(req.params.courseId, req.userId, { categoryId, label, value, maxValue });
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  res.status(201).json(course);
});

router.delete("/courses/:courseId/grades/:gradeId", (req, res) => {
  const course = db.deleteGrade(req.params.courseId, req.userId, req.params.gradeId);
  if (!course) return res.status(404).json({ error: "Notă sau materie inexistentă." });
  res.json(course);
});

/* ===================== NOTES (notebook) ===================== */
router.get("/notes", (req, res) => res.json(db.listNotes(req.userId)));

router.post("/notes", (req, res) => res.status(201).json(db.insertNote(req.userId)));

router.put("/notes/:id", (req, res) => {
  const updated = db.updateNote(req.params.id, req.userId, req.body);
  if (!updated) return res.status(404).json({ error: "Notiță inexistentă." });
  res.json(updated);
});

router.delete("/notes/:id", (req, res) => {
  db.deleteNote(req.params.id, req.userId);
  res.json({ ok: true });
});

/* ===================== TASKS ===================== */
router.get("/tasks", (req, res) => res.json(db.listTasks(req.userId)));

router.post("/tasks", (req, res) => {
  const { title, courseId, type, due } = req.body;
  if (!title || !due) return res.status(400).json({ error: "Titlu și dată necesare." });
  res.status(201).json(db.insertTask(req.userId, { title, courseId, type, due }));
});

router.post("/tasks/import-ics", (req, res) => {
  const { events, courseId } = req.body;
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: "Niciun eveniment de importat." });
  }
  const inserted = db.bulkInsertTasks(req.userId, events, courseId);
  res.status(201).json({ imported: inserted.length, skipped: events.length - inserted.length });
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
  const user = db.findUserById(req.userId);
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
    const inserted = db.bulkInsertTasks(req.userId, events, courseId);
    res.json({ imported: inserted.length, skipped: events.length - inserted.length, total: events.length });
  } catch (err) {
    res.status(502).json({ error: `Nu am putut contacta Moodle: ${err.message}` });
  }
});

router.patch("/tasks/:id", (req, res) => {
  const task = db.findTask(req.params.id, req.userId);
  if (!task) return res.status(404).json({ error: "Task inexistent." });
  const newStatus = req.body.status || task.status;
  const updated = db.updateTaskStatus(req.params.id, req.userId, newStatus);

  let spResult = null;
  if (newStatus === "done" && task.status !== "done") {
    spResult = db.awardTaskOnTimeIfEligible(req.params.id, req.userId);
  }
  res.json({ ...updated, spAwardedNow: spResult });
});

router.delete("/tasks/:id", (req, res) => {
  db.deleteTask(req.params.id, req.userId);
  res.json({ ok: true });
});
/* ===================== ATTENDANCE (absence tracker) ===================== */
const ATTENDANCE_ALERT_THRESHOLD = 75;

router.post("/courses/:courseId/attendance/:type", (req, res) => {
  const { type } = req.params;
  if (!["present", "absent"].includes(type)) return res.status(400).json({ error: "Tip invalid." });
  const course = db.recordAttendance(req.params.courseId, req.userId, type);
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  res.json(course);
});

router.post("/courses/:courseId/attendance/:type/undo", (req, res) => {
  const { type } = req.params;
  if (!["present", "absent"].includes(type)) return res.status(400).json({ error: "Tip invalid." });
  const course = db.undoLastAttendance(req.params.courseId, req.userId, type);
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  res.json(course);
});

router.post("/courses/:courseId/attendance/reset", (req, res) => {
  const course = db.resetAttendance(req.params.courseId, req.userId);
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  res.json(course);
});

router.get("/attendance/overview", (req, res) => {
  const courses = db.listCourses(req.userId);
  const overview = courses.map((c) => {
    const att = c.attendance || { present: 0, absent: 0 };
    const total = att.present + att.absent;
    const percent = total > 0 ? (att.present / total) * 100 : null;
    return {
      id: c.id, name: c.name, color: c.color,
      present: att.present, absent: att.absent, total,
      percent, belowThreshold: percent !== null && percent < ATTENDANCE_ALERT_THRESHOLD
    };
  });
  res.json({ threshold: ATTENDANCE_ALERT_THRESHOLD, courses: overview });
});

/* ===================== FLASHCARDS ===================== */
router.post("/courses/:courseId/flashcard-decks", (req, res) => {
  const { name, cards } = req.body;
  const course = db.addFlashcardDeck(req.params.courseId, req.userId, { name, cards });
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  res.status(201).json(course);
});

router.delete("/courses/:courseId/flashcard-decks/:deckId", (req, res) => {
  const course = db.deleteFlashcardDeck(req.params.courseId, req.userId, req.params.deckId);
  if (!course) return res.status(404).json({ error: "Materie sau deck inexistent." });
  res.json(course);
});

router.post("/courses/:courseId/flashcard-decks/:deckId/cards", (req, res) => {
  const { front, back } = req.body;
  if (!front || !back) return res.status(400).json({ error: "Față și verso necesare." });
  const course = db.addFlashcard(req.params.courseId, req.userId, req.params.deckId, { front, back });
  if (!course) return res.status(404).json({ error: "Materie sau deck inexistent." });
  res.status(201).json(course);
});

router.delete("/courses/:courseId/flashcard-decks/:deckId/cards/:cardId", (req, res) => {
  const course = db.deleteFlashcard(req.params.courseId, req.userId, req.params.deckId, req.params.cardId);
  if (!course) return res.status(404).json({ error: "Card inexistent." });
  res.json(course);
});

/* Generare AI de flashcards — necesită cheie OpenAI salvată în Setări.
   Fără cheie, returnăm o eroare clară în loc să eșuăm silențios. */
router.post("/courses/:courseId/flashcard-decks/generate-ai", async (req, res) => {
  const user = db.findUserById(req.userId);
  if (!user.openai_api_key) {
    return res.status(400).json({ error: "no_api_key", message: "Adaugă o cheie API OpenAI în Setări pentru a genera flashcards cu AI." });
  }
  const { topic, count } = req.body;
  if (!topic) return res.status(400).json({ error: "Subiectul e necesar." });
  const numCards = Math.min(Math.max(Number(count) || 8, 3), 20);

  try {
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.openai_api_key}`
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
    const course = db.addFlashcardDeck(req.params.courseId, req.userId, { name: topic, cards });
    if (!course) return res.status(404).json({ error: "Materie inexistentă." });
    res.status(201).json(course);
  } catch (err) {
    res.status(502).json({ error: `Nu am putut contacta OpenAI: ${err.message}` });
  }
});

/* ===================== RESOURCES (PDF upload real) ===================== */
router.post("/courses/:courseId/resources", upload.single("file"), (req, res) => {
  const course = db.findCourse(req.params.courseId, req.userId);
  if (!course) return res.status(404).json({ error: "Materie inexistentă." });
  if (!req.file) return res.status(400).json({ error: "Niciun fișier primit." });

  const record = db.insertResource(req.userId, req.params.courseId, {
    filename: req.file.filename,
    originalName: req.file.originalname,
    sizeKb: Math.round(req.file.size / 1024)
  });
  res.status(201).json(record);
});

router.get("/courses/:courseId/resources", (req, res) => {
  res.json(db.listResources(req.params.courseId, req.userId));
});

router.get("/resources/:id/download", (req, res) => {
  const resource = db.findResource(req.params.id, req.userId);
  if (!resource) return res.status(404).json({ error: "Resursă inexistentă." });
  res.download(path.join(uploadDir, resource.filename), resource.original_name);
});
/* ===================== SCHEDULE (orar) ===================== */
router.get("/schedule", (req, res) => {
  res.json(db.listScheduleEntries(req.userId));
});

router.post("/schedule", (req, res) => {
  const { courseId, title, day, startTime, endTime, room, type, parity, color } = req.body;
  if (day === undefined || !startTime || !endTime) {
    return res.status(400).json({ error: "Ziua și orele de început/sfârșit sunt necesare." });
  }
  const entry = db.insertScheduleEntry(req.userId, { courseId, title, day, startTime, endTime, room, type, parity, color });
  res.status(201).json(entry);
});

router.patch("/schedule/:id", (req, res) => {
  const updated = db.updateScheduleEntry(req.params.id, req.userId, req.body);
  if (!updated) return res.status(404).json({ error: "Intrare de orar inexistentă." });
  res.json(updated);
});

router.delete("/schedule/:id", (req, res) => {
  db.deleteScheduleEntry(req.params.id, req.userId);
  res.json({ ok: true });
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

router.get("/summary/periods", (req, res) => {
  const courses = db.listCourses(req.userId);
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
