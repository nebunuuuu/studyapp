/* ============================================================
   auth.js — JWT, register/login, Google OAuth, middleware.
   v0.1.6.1: BUGFIX — codul folosea `passwordHash` (camelCase) la
   verificarea login-ului, dar toate conturile existente în
   studyapp-data.json stochează parola sub `password_hash`
   (snake_case). Asta făcea ca ORICE login să eșueze cu
   "Credențiale incorecte", indiferent de parola introdusă.
   Standardizat acum pe `password_hash` peste tot (register,
   login, Google OAuth), consistent cu datele deja salvate.
   ============================================================ */

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "studyapp-dev-secret-schimba-in-productie";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/auth/google/callback";
function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    education_level: user.education_level,
    study_group: user.study_group,
    study_subgroup: user.study_subgroup,
    class_name: user.class_name,
    schedule_onboarding_dismissed: user.schedule_onboarding_dismissed,
    language: user.language,
    moodle_ics_url: user.moodle_ics_url,
    reminder_hours_before: user.reminder_hours_before,
    sp_balance: user.sp_balance,
    owned_items: user.owned_items,
    active_theme: user.active_theme,
    active_frame: user.active_frame,
    is_pro: user.is_pro,
    last_daily_bonus_date: user.last_daily_bonus_date,
    needs_onboarding: user.password_hash === null,
    last_ad_watch_at: user.last_ad_watch_at
  };
}
function signToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const tokenFromHeader = header.startsWith("Bearer ") ? header.slice(7) : null;
  const tokenFromQuery = req.query.token || null;
  const token = tokenFromHeader || tokenFromQuery;
  if (!token) return res.status(401).json({ error: "Neautentificat." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalid sau expirat." });
  }
}

router.post("/register", async (req, res) => {
  const {
    name,
    email,
    password,
    educationLevel
  } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      error: "Toate câmpurile sunt necesare."
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "Parola trebuie să aibă minim 8 caractere."
    });
  }

  if (await db.findUserByIdentifierPg(email)) {
    return res.status(409).json({
      error: "Există deja un cont cu acest email."
    });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const username = email.split("@")[0];

  const user = await db.insertUserPg({
    name,
    email,
    username,
    password_hash,
    education_level: ["facultate", "liceu", "scoala"].includes(educationLevel)
      ? educationLevel
      : null
  });

  const token = signToken(user);

  res.status(201).json({
    token,
    user: publicUser(user)
  });
});

router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: "Completează toate câmpurile." });
  const user = await db.findUserByIdentifierPg(identifier);
  if (!user || !user.password_hash) return res.status(401).json({ error: "Credențiale incorecte." });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Credențiale incorecte." });
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await db.findUserByIdPg(req.userId);
  if (!user) return res.status(404).json({ error: "Utilizator inexistent." });
  res.json({ user: publicUser(user) });
});
router.put("/onboarding", authMiddleware, async (req, res) => {
  const {
    username,
    password,
    educationLevel,
    studyGroup,
    studySubgroup,
    className
  } = req.body;

  const user = await db.findUserByIdPg(req.userId);

  if (!user) {
    return res.status(404).json({
      error: "Utilizator inexistent."
    });
  }

  const needsPasswordSetup = !user.password_hash;

  if (!educationLevel || !["facultate", "liceu", "scoala"].includes(educationLevel)) {
    return res.status(400).json({
      error: "Nivel de studiu invalid."
    });
  }

  const patch = {
    education_level: educationLevel
  };

  if (educationLevel === "facultate") {
    if (!studyGroup) {
      return res.status(400).json({
        error: "Grupa este necesară pentru facultate."
      });
    }
    patch.study_group = studyGroup;
    patch.study_subgroup = studySubgroup || null;
    patch.class_name = null;
  } else {
    patch.study_group = null;
    patch.study_subgroup = null;
    patch.class_name = className || null;
  }

  if (needsPasswordSetup) {
    const cleanUsername = String(username || "").trim();
    const cleanPassword = String(password || "");

    if (!cleanUsername || !cleanPassword) {
      return res.status(400).json({
        error: "Username și parolă sunt necesare."
      });
    }

    if (cleanPassword.length < 8) {
      return res.status(400).json({
        error: "Parola trebuie să aibă cel puțin 8 caractere."
      });
    }

    const existingUser = await db.findUserByIdentifierPg(cleanUsername);

    if (existingUser && existingUser.id !== user.id) {
      return res.status(409).json({
        error: "Username-ul este deja folosit."
      });
    }

    patch.username = cleanUsername;
    patch.password_hash = await bcrypt.hash(cleanPassword, 12);
  }

  const updatedUser = await db.updateUserPg(req.userId, patch);

  res.json({
    user: publicUser(updatedUser)
  });
});
/* ===================== GOOGLE OAUTH ===================== */

router.get("/google", (req, res) => {
  res.redirect("/");
});

router.post("/google/start", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return res.status(500).json({
      error: "Google OAuth nu este configurat."
    });
  }

  const oauthState = jwt.sign(
    {
      flow: "google"
    },
    JWT_SECRET,
    { expiresIn: "10m" }
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state: oauthState
  });

  res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  });
});
router.get("/google/callback", async (req, res) => {
  const { code, state } = req.query;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!code || !state || !clientId || !clientSecret) {
    return res.redirect("/?error=oauth_config");
  }

  let oauthState;

  try {
    oauthState = jwt.verify(state, JWT_SECRET);
  } catch (error) {
    console.error("Google OAuth state invalid:", error.message);
    return res.redirect("/?error=oauth_state");
  }

  if (!oauthState || oauthState.flow !== "google") {
    console.error("Google OAuth unexpected state:", oauthState);
    return res.redirect("/?error=oauth_state");
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Google OAuth token error:", tokenData);
      return res.redirect("/?error=oauth_token");
    }

    const profileResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const profile = await profileResponse.json();

    if (!profileResponse.ok || !profile.email) {
      console.error("Google OAuth profile error:", profile);
      return res.redirect("/?error=oauth_profile");
    }

    let user = await db.findUserByIdentifierPg(profile.email);

    if (!user) {
      user = await db.insertUserPg({
        name: profile.name || profile.email.split("@")[0],
        email: profile.email,
        username: profile.email.split("@")[0],
        password_hash: null,
        education_level: null
      });
    }

    const token = signToken(user);

    return res.redirect(`/?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error("Google OAuth callback failed:", error);
    return res.redirect("/?error=oauth_failed");
  }
});

module.exports = { router, authMiddleware, publicUser, signToken };
