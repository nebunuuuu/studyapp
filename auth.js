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

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    education_level: user.education_level,
    language: user.language,
    moodle_ics_url: user.moodle_ics_url,
    reminder_hours_before: user.reminder_hours_before,
    sp_balance: user.sp_balance,
    owned_items: user.owned_items,
    active_theme: user.active_theme,
    active_frame: user.active_frame,
    is_pro: user.is_pro,
    last_daily_bonus_date: user.last_daily_bonus_date,
    last_ad_watch_at: user.last_ad_watch_at ,has_openai_key: !!user.openai_api_key
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
  const { name, email, password, educationLevel } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "Toate câmpurile sunt necesare." });
  if (password.length < 8) return res.status(400).json({ error: "Parola trebuie să aibă minim 8 caractere." });
  if (db.findUserByIdentifier(email)) return res.status(409).json({ error: "Există deja un cont cu acest email." });

  const password_hash = await bcrypt.hash(password, 10);
  const username = email.split("@")[0];
  const user = db.insertUser({
    name, email, username, password_hash,
    education_level: educationLevel === "liceu" ? "liceu" : "facultate"
  });
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: "Completează toate câmpurile." });
  const user = db.findUserByIdentifier(identifier);
  if (!user || !user.password_hash) return res.status(401).json({ error: "Credențiale incorecte." });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Credențiale incorecte." });
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

router.get("/me", authMiddleware, (req, res) => {
  const user = db.findUserById(req.userId);
  if (!user) return res.status(404).json({ error: "Utilizator inexistent." });
  res.json({ user: publicUser(user) });
});

/* ===================== GOOGLE OAUTH ===================== */
router.get("/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send("Google OAuth nu este configurat (GOOGLE_CLIENT_ID lipsă din .env).");
  }
  const redirectUri = `${req.protocol}://${req.get("host")}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account"
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/google/callback", async (req, res) => {
  const { code } = req.query;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!code || !clientId || !clientSecret) return res.redirect("/?error=oauth_config");

  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect("/?error=oauth_token");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();

    let user = db.findUserByIdentifier(profile.email);
    if (!user) {
      user = db.insertUser({
        name: profile.name || profile.email.split("@")[0],
        email: profile.email,
        username: profile.email.split("@")[0],
        password_hash: null,
        education_level: "facultate"
      });
    }
    const token = signToken(user);
    res.redirect(`/?token=${token}`);
  } catch (err) {
    res.redirect("/?error=oauth_failed");
  }
});

module.exports = { router, authMiddleware, publicUser, signToken };
