/* ============================================================
   db.js — strat de date persistent (fișier JSON local, fără DB
   externă). v0.1.6: adăugat portofel StudyPoints (SP) pe fiecare
   user + catalog de shop (teme de culoare, cadru avatar) și
   funcțiile de câștig/cheltuire SP. Restul schemei (courses, notes,
   tasks, resources, grading) neschimbat față de v0.1.5.
   ============================================================ */

const fs = require("fs");
const { Pool } = require("pg");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const DB_FILE = path.join(__dirname, "studyapp-data.json");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

function uid() {
  return crypto.randomBytes(9).toString("hex");
}

/* ===================== CATALOG SHOP (fix, definit în cod) =====================
   Fiecare item are un id stabil, folosit și de frontend pentru afișare.
   type: "theme" schimbă --accent global; "frame" adaugă un cadru avatarului. */
const SHOP_CATALOG = [
  { id: "theme-sunset", type: "theme", name: "Sunset", price: 60, colors: { primary: "#f97316", accent: "#ec4899" } },
  { id: "theme-ocean", type: "theme", name: "Ocean", price: 60, colors: { primary: "#06b6d4", accent: "#3b82f6" } },
  { id: "theme-forest", type: "theme", name: "Forest", price: 60, colors: { primary: "#22c55e", accent: "#14b8a6" } },
  { id: "theme-rosegold", type: "theme", name: "Rose Gold", price: 90, colors: { primary: "#e0a899", accent: "#c9895a" } },
  { id: "theme-neon", type: "theme", name: "Neon Nights", price: 150, colors: { primary: "#a855f7", accent: "#22d3ee" } },
  { id: "frame-gold", type: "frame", name: "Cadru auriu avatar", price: 120 }
];

/* SP_PACKAGES = pachete cumpărabile — momentan doar simulate (fără bani
   reali), utile pentru a testa fluxul de shop înainte de integrarea Stripe. */
const SP_PACKAGES = [
  { id: "pack-small", sp: 100, label: "100 SP" },
  { id: "pack-medium", sp: 300, label: "300 SP" },
  { id: "pack-large", sp: 700, label: "700 SP" }
];

const DAILY_BONUS_SP = 20;
const AD_WATCH_SP = 15;
const AD_WATCH_COOLDOWN_MIN = 30;
const TASK_ON_TIME_SP = 5;

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = { users: [], courses: [], notes: [], tasks: [], resources: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  const data = JSON.parse(raw || "{}");
  data.users = data.users || [];
  data.courses = data.courses || [];
  data.notes = data.notes || [];
  data.tasks = data.tasks || [];
  data.resources = data.resources || [];
  data.scheduleEntries = data.scheduleEntries || [];
  migrate(data);
  return data;
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* ===================== MIGRARE (backward compatible) =====================
   Rulează la fiecare load; adaugă câmpuri lipsă userilor vechi fără să
   șteargă nimic. Sigur de rulat de mai multe ori (idempotent). */
function migrate(data) {
  let changed = false;
  data.users.forEach((u) => {
    if (u.education_level === undefined) { u.education_level = "facultate"; changed = true; }
    if (u.language === undefined) { u.language = "ro"; changed = true; }
    if (u.reminder_hours_before === undefined) { u.reminder_hours_before = [24, 1]; changed = true; }
    if (u.moodle_ics_url === undefined) { u.moodle_ics_url = null; changed = true; }
    if (u.sp_balance === undefined) { u.sp_balance = 50; changed = true; }
    if (u.last_daily_bonus_date === undefined) { u.last_daily_bonus_date = null; changed = true; }
    if (u.last_ad_watch_at === undefined) { u.last_ad_watch_at = null; changed = true; }
    if (u.owned_items === undefined) { u.owned_items = []; changed = true; }
    if (u.active_theme === undefined) { u.active_theme = null; changed = true; }
    if (u.active_frame === undefined) { u.active_frame = null; changed = true; }
    if (u.is_pro === undefined) { u.is_pro = false; changed = true; }
    if (u.openai_api_key === undefined) { u.openai_api_key = null; changed = true; }
  });
  data.courses.forEach((c) => {
    if (c.gradingCategories === undefined) { c.gradingCategories = []; changed = true; }
    if (c.grades === undefined) { c.grades = []; changed = true; }
    if (c.period === undefined) { c.period = null; changed = true; }
    if (c.attendance === undefined) { c.attendance = { present: 0, absent: 0 }; changed = true; }
    if (c.flashcardDecks === undefined) { c.flashcardDecks = []; changed = true; }
  });
  data.tasks.forEach((t) => {
    if (t.spAwarded === undefined) { t.spAwarded = false; changed = true; }
  });
  if (data.scheduleEntries === undefined) { data.scheduleEntries = []; changed = true; }
  if (changed) saveDB(data);
}

/* ===================== USERS ===================== */
function findUserById(id) {
  const db = loadDB();
  return db.users.find((u) => u.id === id) || null;
}
function findUserByIdentifier(identifier) {
  const db = loadDB();
  return db.users.find((u) => u.email === identifier || u.username === identifier) || null;
}
function insertUser(user) {
  const db = loadDB();
  const newUser = {
    id: uid(),
    sp_balance: 50,
    last_daily_bonus_date: null,
    last_ad_watch_at: null,
    owned_items: [],
    active_theme: null,
    active_frame: null,
    is_pro: false,
    education_level: "facultate",
    language: "ro",
    reminder_hours_before: [24, 1],
    moodle_ics_url: null,
    role: "user",
    ...user
  };
  db.users.push(newUser);
  saveDB(db);
  return newUser;
}
function updateUser(id, patch) {
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  db.users[idx] = { ...db.users[idx], ...patch };
  saveDB(db);
  return db.users[idx];
}

/* ===================== WALLET (StudyPoints) ===================== */
function getWallet(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  return {
    balance: user.sp_balance,
    ownedItems: user.owned_items,
    activeTheme: user.active_theme,
    activeFrame: user.active_frame,
    isPro: user.is_pro,
    lastDailyBonusDate: user.last_daily_bonus_date,
    lastAdWatchAt: user.last_ad_watch_at
  };
}

function addSP(userId, amount, reason) {
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  db.users[idx].sp_balance = Math.max(0, (db.users[idx].sp_balance || 0) + amount);
  saveDB(db);
  return { balance: db.users[idx].sp_balance, delta: amount, reason };
}

function claimDailyBonus(userId) {
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return { error: "Utilizator inexistent." };
  const today = new Date().toISOString().slice(0, 10);
  if (db.users[idx].last_daily_bonus_date === today) {
    return { error: "already_claimed", balance: db.users[idx].sp_balance };
  }
  db.users[idx].sp_balance += DAILY_BONUS_SP;
  db.users[idx].last_daily_bonus_date = today;
  saveDB(db);
  return { balance: db.users[idx].sp_balance, gained: DAILY_BONUS_SP };
}

function claimAdWatch(userId) {
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return { error: "Utilizator inexistent." };
  const now = Date.now();
  const last = db.users[idx].last_ad_watch_at ? new Date(db.users[idx].last_ad_watch_at).getTime() : 0;
  const cooldownMs = AD_WATCH_COOLDOWN_MIN * 60 * 1000;
  if (now - last < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - (now - last)) / 60000);
    return { error: "cooldown", remainingMin };
  }
  db.users[idx].sp_balance += AD_WATCH_SP;
  db.users[idx].last_ad_watch_at = new Date().toISOString();
  saveDB(db);
  return { balance: db.users[idx].sp_balance, gained: AD_WATCH_SP };
}

function redeemPackage(userId, packageId) {
  const pkg = SP_PACKAGES.find((p) => p.id === packageId);
  if (!pkg) return { error: "Pachet inexistent." };
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return { error: "Utilizator inexistent." };
  db.users[idx].sp_balance += pkg.sp;
  saveDB(db);
  return { balance: db.users[idx].sp_balance, gained: pkg.sp, package: pkg };
}

function purchaseItem(userId, itemId) {
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return { error: "Item inexistent." };
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return { error: "Utilizator inexistent." };
  const user = db.users[idx];
  if (user.owned_items.includes(itemId)) return { error: "already_owned" };
  if (user.sp_balance < item.price) return { error: "insufficient_funds", needed: item.price - user.sp_balance };

  user.sp_balance -= item.price;
  user.owned_items.push(itemId);
  saveDB(db);
  return { balance: user.sp_balance, item };
}

function equipItem(userId, itemId) {
  const item = SHOP_CATALOG.find((i) => i.id === itemId);
  if (!item) return { error: "Item inexistent." };
  const db = loadDB();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return { error: "Utilizator inexistent." };
  const user = db.users[idx];
  if (!user.owned_items.includes(itemId)) return { error: "not_owned" };

  if (item.type === "theme") user.active_theme = itemId;
  if (item.type === "frame") user.active_frame = user.active_frame === itemId ? null : itemId;
  saveDB(db);
  return { activeTheme: user.active_theme, activeFrame: user.active_frame };
}

function getShopCatalog() {
  return SHOP_CATALOG;
}
function getSPPackages() {
  return SP_PACKAGES;
}

/* Apelat de api.js când un task e marcat "done" înainte de deadline —
   recompensează o singură dată per task (flag spAwarded). */
function awardTaskOnTimeIfEligible(taskId, userId) {
  const db = loadDB();
  const task = db.courses ? null : null; // no-op guard
  const t = db.tasks.find((x) => x.id === taskId && x.user_id === userId);
  if (!t || t.spAwarded) return null;
  const dueDate = new Date(t.due + "T23:59:59");
  if (new Date() > dueDate) return null;
  t.spAwarded = true;
  const uidx = db.users.findIndex((u) => u.id === userId);
  if (uidx !== -1) db.users[uidx].sp_balance += TASK_ON_TIME_SP;
  saveDB(db);
  return { gained: TASK_ON_TIME_SP, balance: uidx !== -1 ? db.users[uidx].sp_balance : null };
}

/* ===================== COURSES ===================== */
function listCourses(userId) {
  const db = loadDB();
  return db.courses.filter((c) => c.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
function findCourse(id, userId) {
  const db = loadDB();
  return db.courses.find((c) => c.id === id && c.user_id === userId) || null;
}
function insertCourse(userId, { name, professor, color, period }) {
  const db = loadDB();
  const course = {
    id: uid(),
    user_id: userId,
    name,
    professor: professor || "",
    color: color || "#5b5bf0",
    period: period || null,
    gradingCategories: [],
    grades: [],
    created_at: new Date().toISOString()
  };
  db.courses.push(course);
  saveDB(db);
  return course;
}
function updateCourse(id, userId, patch) {
  const db = loadDB();
  const idx = db.courses.findIndex((c) => c.id === id && c.user_id === userId);
  if (idx === -1) return null;
  db.courses[idx] = { ...db.courses[idx], ...patch };
  saveDB(db);
  return db.courses[idx];
}
function deleteCourse(id, userId) {
  const db = loadDB();
  const removedResources = db.resources.filter((r) => r.course_id === id && r.user_id === userId);
  db.courses = db.courses.filter((c) => !(c.id === id && c.user_id === userId));
  db.notes.forEach((n) => { if (n.course_id === id) n.course_id = null; });
  db.tasks = db.tasks.filter((t) => !(t.course_id === id && t.user_id === userId));
  db.resources = db.resources.filter((r) => !(r.course_id === id && r.user_id === userId));
  saveDB(db);
  return removedResources;
}

/* ===================== GRADING ===================== */
function addGradingCategory(courseId, userId, { name, weight }) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  course.gradingCategories.push({ id: uid(), name, weight: Number(weight) });
  saveDB(db);
  return course;
}
function updateGradingCategory(courseId, userId, categoryId, patch) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  const cat = course.gradingCategories.find((c) => c.id === categoryId);
  if (!cat) return null;
  if (patch.name !== undefined) cat.name = patch.name;
  if (patch.weight !== undefined) cat.weight = Number(patch.weight);
  saveDB(db);
  return course;
}
function deleteGradingCategory(courseId, userId, categoryId) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  course.gradingCategories = course.gradingCategories.filter((c) => c.id !== categoryId);
  course.grades = course.grades.filter((g) => g.categoryId !== categoryId);
  saveDB(db);
  return course;
}
function addGrade(courseId, userId, { categoryId, label, value, maxValue }) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  course.grades.push({
    id: uid(), categoryId, label: label || "", value: Number(value), maxValue: Number(maxValue) || 10,
    added_at: new Date().toISOString()
  });
  saveDB(db);
  return course;
}
function deleteGrade(courseId, userId, gradeId) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  course.grades = course.grades.filter((g) => g.id !== gradeId);
  saveDB(db);
  return course;
}

/* ===================== NOTES ===================== */
function listNotes(userId) {
  const db = loadDB();
  return db.notes.filter((n) => n.user_id === userId);
}
function insertNote(userId) {
  const db = loadDB();
  const note = {
    id: uid(), user_id: userId, title: "", content: "", course_id: null,
    updated_at: new Date().toISOString()
  };
  db.notes.push(note);
  saveDB(db);
  return note;
}
function updateNote(id, userId, patch) {
  const db = loadDB();
  const idx = db.notes.findIndex((n) => n.id === id && n.user_id === userId);
  if (idx === -1) return null;
  db.notes[idx] = { ...db.notes[idx], ...patch, updated_at: new Date().toISOString() };
  saveDB(db);
  return db.notes[idx];
}
function deleteNote(id, userId) {
  const db = loadDB();
  db.notes = db.notes.filter((n) => !(n.id === id && n.user_id === userId));
  saveDB(db);
}

/* ===================== TASKS ===================== */
function listTasks(userId) {
  const db = loadDB();
  return db.tasks.filter((t) => t.user_id === userId);
}
function findTask(id, userId) {
  const db = loadDB();
  return db.tasks.find((t) => t.id === id && t.user_id === userId) || null;
}
function insertTask(userId, { title, courseId, type, due }) {
  const db = loadDB();
  const task = {
    id: uid(), user_id: userId, title, course_id: courseId || null,
    type: type || "tema", due, status: "todo", source: "manual", spAwarded: false
  };
  db.tasks.push(task);
  saveDB(db);
  return task;
}
function bulkInsertTasks(userId, events, courseId) {
  const db = loadDB();
  const existingKeys = new Set(db.tasks.filter((t) => t.user_id === userId).map((t) => `${t.title}|${t.due}`));
  const inserted = [];
  events.forEach((ev) => {
    const key = `${ev.title}|${ev.due}`;
    if (existingKeys.has(key)) return;
    const task = {
      id: uid(), user_id: userId, title: ev.title, course_id: courseId || null,
      type: "tema", due: ev.due, status: "todo", source: "moodle", spAwarded: false
    };
    db.tasks.push(task);
    inserted.push(task);
    existingKeys.add(key);
  });
  saveDB(db);
  return inserted;
}
function updateTaskStatus(id, userId, status) {
  const db = loadDB();
  const idx = db.tasks.findIndex((t) => t.id === id && t.user_id === userId);
  if (idx === -1) return null;
  db.tasks[idx].status = status;
  saveDB(db);
  return db.tasks[idx];
}
function deleteTask(id, userId) {
  const db = loadDB();
  db.tasks = db.tasks.filter((t) => !(t.id === id && t.user_id === userId));
  saveDB(db);
}
/* ===================== ATTENDANCE (absence tracker) ===================== */
function recordAttendance(courseId, userId, type) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  if (!course.attendance) course.attendance = { present: 0, absent: 0 };
  if (type === "present") course.attendance.present += 1;
  else if (type === "absent") course.attendance.absent += 1;
  else return null;
  saveDB(db);
  return course;
}
function undoLastAttendance(courseId, userId, type) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course || !course.attendance) return null;
  if (type === "present" && course.attendance.present > 0) course.attendance.present -= 1;
  if (type === "absent" && course.attendance.absent > 0) course.attendance.absent -= 1;
  saveDB(db);
  return course;
}
function resetAttendance(courseId, userId) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  course.attendance = { present: 0, absent: 0 };
  saveDB(db);
  return course;
}

/* ===================== FLASHCARDS ===================== */
function addFlashcardDeck(courseId, userId, { name, cards }) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  if (!course.flashcardDecks) course.flashcardDecks = [];
  const deck = {
    id: uid(), name: name || "Deck", created_at: new Date().toISOString(),
    cards: (cards || []).map((c) => ({ id: uid(), front: c.front, back: c.back }))
  };
  course.flashcardDecks.push(deck);
  saveDB(db);
  return course;
}
function deleteFlashcardDeck(courseId, userId, deckId) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  course.flashcardDecks = (course.flashcardDecks || []).filter((d) => d.id !== deckId);
  saveDB(db);
  return course;
}
function addFlashcard(courseId, userId, deckId, { front, back }) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  const deck = (course.flashcardDecks || []).find((d) => d.id === deckId);
  if (!deck) return null;
  deck.cards.push({ id: uid(), front, back });
  saveDB(db);
  return course;
}
function deleteFlashcard(courseId, userId, deckId, cardId) {
  const db = loadDB();
  const course = db.courses.find((c) => c.id === courseId && c.user_id === userId);
  if (!course) return null;
  const deck = (course.flashcardDecks || []).find((d) => d.id === deckId);
  if (!deck) return null;
  deck.cards = deck.cards.filter((c) => c.id !== cardId);
  saveDB(db);
  return course;
}

/* ===================== SCHEDULE (orar) ===================== */
function listScheduleEntries(userId) {
  const db = loadDB();
  return db.scheduleEntries.filter((e) => e.user_id === userId);
}
function insertScheduleEntry(userId, { courseId, title, day, startTime, endTime, room, type, parity, color }) {
  const db = loadDB();
  const entry = {
    id: uid(), user_id: userId,
    course_id: courseId || null,
    title: title || "",
    day: Number(day),
    startTime, endTime,
    room: room || "",
    type: type || "curs",
    parity: parity || "all",
    color: color || null
  };
  db.scheduleEntries.push(entry);
  saveDB(db);
  return entry;
}
function updateScheduleEntry(id, userId, patch) {
  const db = loadDB();
  const idx = db.scheduleEntries.findIndex((e) => e.id === id && e.user_id === userId);
  if (idx === -1) return null;
  db.scheduleEntries[idx] = { ...db.scheduleEntries[idx], ...patch };
  saveDB(db);
  return db.scheduleEntries[idx];
}
function deleteScheduleEntry(id, userId) {
  const db = loadDB();
  db.scheduleEntries = db.scheduleEntries.filter((e) => !(e.id === id && e.user_id === userId));
  saveDB(db);
}

/* ===================== RESOURCES ===================== */
function insertResource(userId, courseId, { filename, originalName, sizeKb }) {
  const db = loadDB();
  const resource = {
    id: uid(), user_id: userId, course_id: courseId, filename,
    original_name: originalName, size_kb: sizeKb, added_at: new Date().toISOString()
  };
  db.resources.push(resource);
  saveDB(db);
  return resource;
}
function listResources(courseId, userId) {
  const db = loadDB();
  return db.resources.filter((r) => r.course_id === courseId && r.user_id === userId);
}
function findResource(id, userId) {
  const db = loadDB();
  return db.resources.find((r) => r.id === id && r.user_id === userId) || null;
}
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim();
  const username = (process.env.ADMIN_USERNAME || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !username || !password) {
    console.warn("ADMIN_* nu sunt configurate; adminul nu a fost creat.");
    return null;
  }

  let user =
    (await findUserByIdentifierPg(email)) ||
    (await findUserByIdentifierPg(username));

  const password_hash = await bcrypt.hash(password, 10);

  if (!user) {
    user = await insertUserPg({
      name: username,
      email,
      username,
      password_hash,
      role: "admin"
    });

    console.log(`Cont admin PostgreSQL creat pentru ${email}`);
    return user;
  }

  user = await updateUserPg(user.id, {
    email,
    username,
    password_hash,
    role: "admin"
  });

  console.log(`Cont admin PostgreSQL actualizat pentru ${email}`);
  return user;
}
async function findUserByIdPg(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
  return rows[0] || null;
}

async function findUserByIdentifierPg(identifier) {
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1",
    [identifier]
  );
  return rows[0] || null;
}

async function insertUserPg(user) {
  const newUser = {
    id: uid(),
    sp_balance: 50,
    last_daily_bonus_date: null,
    last_ad_watch_at: null,
    owned_items: [],
    active_theme: null,
    active_frame: null,
    is_pro: false,
    education_level: "facultate",
    language: "ro",
    reminder_hours_before: [24, 1],
    moodle_ics_url: null,
    role: "user",
    ...user
  };

  const query = `
    INSERT INTO users (
      id, name, email, username, password_hash, role,
      education_level, language, moodle_ics_url, reminder_hours_before,
      sp_balance, owned_items, active_theme, active_frame, is_pro,
      last_daily_bonus_date, last_ad_watch_at, openai_api_key, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, $18, NOW()
    )
    RETURNING *;
  `;

  const values = [
    newUser.id,
    newUser.name,
    newUser.email,
    newUser.username,
    newUser.password_hash || null,
    newUser.role,
    newUser.education_level,
    newUser.language,
    newUser.moodle_ics_url,
    JSON.stringify(newUser.reminder_hours_before),
    newUser.sp_balance,
    JSON.stringify(newUser.owned_items),
    newUser.active_theme,
    newUser.active_frame,
    newUser.is_pro,
    newUser.last_daily_bonus_date,
    newUser.last_ad_watch_at,
    newUser.openai_api_key || null
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}

async function updateUserPg(id, patch) {
  const current = await findUserByIdPg(id);
  if (!current) return null;

  const updated = { ...current, ...patch };

  const query = `
    UPDATE users SET
      name = $2,
      email = $3,
      username = $4,
      password_hash = $5,
      role = $6,
      education_level = $7,
      language = $8,
      moodle_ics_url = $9,
      reminder_hours_before = $10,
      sp_balance = $11,
      owned_items = $12,
      active_theme = $13,
      active_frame = $14,
      is_pro = $15,
      last_daily_bonus_date = $16,
      last_ad_watch_at = $17,
      openai_api_key = $18
    WHERE id = $1
    RETURNING *;
  `;

  const values = [
    id,
    updated.name,
    updated.email,
    updated.username,
    updated.password_hash || null,
    updated.role,
    updated.education_level,
    updated.language,
    updated.moodle_ics_url,
    JSON.stringify(updated.reminder_hours_before || [24, 1]),
    updated.sp_balance,
    JSON.stringify(updated.owned_items || []),
    updated.active_theme,
    updated.active_frame,
    updated.is_pro,
    updated.last_daily_bonus_date,
    updated.last_ad_watch_at,
    updated.openai_api_key || null
  ];

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
}
function mapCourseRow(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    professor: row.professor || "",
    color: row.color || "#5b5bf0",
    period: row.period || null,
    gradingCategories: row.grading_categories || [],
    grades: row.grades || [],
    attendance: row.attendance || { present: 0, absent: 0 },
    flashcardDecks: row.flashcard_decks || [],
    resources: row.resources || [],
    created_at: row.created_at
  };
}

async function listCoursesPg(userId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM courses
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map(mapCourseRow);
}

async function findCoursePg(id, userId) {
  const { rows } = await pool.query(
    `SELECT *
     FROM courses
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, userId]
  );

  return mapCourseRow(rows[0]);
}

async function insertCoursePg(userId, { name, professor, color, period }) {
  const { rows } = await pool.query(
    `INSERT INTO courses (
       id, user_id, name, professor, color, period
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      uid(),
      userId,
      name,
      professor || "",
      color || "#5b5bf0",
      period || null
    ]
  );

  return mapCourseRow(rows[0]);
}

async function updateCoursePg(id, userId, patch) {
  const current = await findCoursePg(id, userId);
  if (!current) return null;

  const updated = {
    ...current,
    ...patch
  };

  const { rows } = await pool.query(
    `UPDATE courses SET
       name = $3,
       professor = $4,
       color = $5,
       period = $6,
       grading_categories = $7,
       grades = $8,
       attendance = $9,
       flashcard_decks = $10
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      updated.name,
      updated.professor || "",
      updated.color || "#5b5bf0",
      updated.period || null,
      JSON.stringify(updated.gradingCategories || []),
      JSON.stringify(updated.grades || []),
      JSON.stringify(updated.attendance || { present: 0, absent: 0 }),
      JSON.stringify(updated.flashcardDecks || [])
    ]
  );

  return mapCourseRow(rows[0]);
}
async function addGradingCategoryPg(courseId, userId, { name, weight }) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const category = {
    id: uid(),
    name,
    weight: Number(weight),
    createdAt: new Date().toISOString()
  };

  return updateCoursePg(courseId, userId, {
    gradingCategories: [
      ...(course.gradingCategories || []),
      category
    ]
  });
}

async function updateGradingCategoryPg(
  courseId,
  userId,
  categoryId,
  patch
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const categories = course.gradingCategories || [];
  const exists = categories.some((category) => category.id === categoryId);

  if (!exists) return null;

  const updatedCategories = categories.map((category) =>
    category.id === categoryId
      ? {
          ...category,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.weight !== undefined
            ? { weight: Number(patch.weight) }
            : {})
        }
      : category
  );

  return updateCoursePg(courseId, userId, {
    gradingCategories: updatedCategories
  });
}

async function deleteGradingCategoryPg(
  courseId,
  userId,
  categoryId
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const categories = course.gradingCategories || [];
  const exists = categories.some((category) => category.id === categoryId);

  if (!exists) return null;

  return updateCoursePg(courseId, userId, {
    gradingCategories: categories.filter(
      (category) => category.id !== categoryId
    ),
    grades: (course.grades || []).filter(
      (grade) => grade.categoryId !== categoryId
    )
  });
}

async function addGradePg(
  courseId,
  userId,
  { categoryId, label, value, maxValue }
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const categoryExists = (course.gradingCategories || []).some(
    (category) => category.id === categoryId
  );

  if (!categoryExists) return null;

  const grade = {
    id: uid(),
    categoryId,
    label: label || "",
    value: Number(value),
    maxValue: Number(maxValue) || 10,
    addedAt: new Date().toISOString()
  };

  return updateCoursePg(courseId, userId, {
    grades: [
      ...(course.grades || []),
      grade
    ]
  });
}

async function deleteGradePg(courseId, userId, gradeId) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const grades = course.grades || [];
  const exists = grades.some((grade) => grade.id === gradeId);

  if (!exists) return null;

  return updateCoursePg(courseId, userId, {
    grades: grades.filter((grade) => grade.id !== gradeId)
  });
}
async function recordAttendancePg(courseId, userId, type) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const attendance = {
    present: Number(course.attendance?.present || 0),
    absent: Number(course.attendance?.absent || 0)
  };

  attendance[type] += 1;

  return updateCoursePg(courseId, userId, {
    attendance
  });
}

async function undoLastAttendancePg(courseId, userId, type) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const attendance = {
    present: Number(course.attendance?.present || 0),
    absent: Number(course.attendance?.absent || 0)
  };

  if (attendance[type] > 0) {
    attendance[type] -= 1;
  }

  return updateCoursePg(courseId, userId, {
    attendance
  });
}

async function resetAttendancePg(courseId, userId) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  return updateCoursePg(courseId, userId, {
    attendance: {
      present: 0,
      absent: 0
    }
  });
}
async function addFlashcardDeckPg(
  courseId,
  userId,
  { name, cards }
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const deck = {
    id: uid(),
    name: name || "Deck nou",
    cards: Array.isArray(cards) ? cards : [],
    createdAt: new Date().toISOString()
  };

  return updateCoursePg(courseId, userId, {
    flashcardDecks: [
      ...(course.flashcardDecks || []),
      deck
    ]
  });
}

async function deleteFlashcardDeckPg(
  courseId,
  userId,
  deckId
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const decks = course.flashcardDecks || [];
  const exists = decks.some((deck) => deck.id === deckId);

  if (!exists) return null;

  return updateCoursePg(courseId, userId, {
    flashcardDecks: decks.filter(
      (deck) => deck.id !== deckId
    )
  });
}

async function addFlashcardPg(
  courseId,
  userId,
  deckId,
  { front, back }
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const decks = course.flashcardDecks || [];
  const deckExists = decks.some((deck) => deck.id === deckId);

  if (!deckExists) return null;

  const card = {
    id: uid(),
    front,
    back,
    createdAt: new Date().toISOString()
  };

  const updatedDecks = decks.map((deck) =>
    deck.id === deckId
      ? {
          ...deck,
          cards: [
            ...(deck.cards || []),
            card
          ]
        }
      : deck
  );

  return updateCoursePg(courseId, userId, {
    flashcardDecks: updatedDecks
  });
}

async function deleteFlashcardPg(
  courseId,
  userId,
  deckId,
  cardId
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const decks = course.flashcardDecks || [];
  const deck = decks.find((item) => item.id === deckId);

  if (!deck) return null;

  const cards = deck.cards || [];
  const cardExists = cards.some((card) => card.id === cardId);

  if (!cardExists) return null;

  const updatedDecks = decks.map((item) =>
    item.id === deckId
      ? {
          ...item,
          cards: cards.filter((card) => card.id !== cardId)
        }
      : item
  );

  return updateCoursePg(courseId, userId, {
    flashcardDecks: updatedDecks
  });
}
async function deleteCoursePg(id, userId) {
  const course = await findCoursePg(id, userId);
  if (!course) return null;

  await pool.query(
    `DELETE FROM courses
     WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );

  return course.resources || [];
}
async function getWalletPg(userId) {
  const user = await findUserByIdPg(userId);
  if (!user) return null;
  return {
    balance: user.sp_balance,
    ownedItems: user.owned_items,
    activeTheme: user.active_theme,
    activeFrame: user.active_frame,
    isPro: user.is_pro,
    lastDailyBonusDate: user.last_daily_bonus_date,
    lastAdWatchAt: user.last_ad_watch_at
  };
}

async function claimDailyBonusPg(userId) {
  const user = await findUserByIdPg(userId);
  if (!user) return { error: "Utilizator inexistent." };
  const today = new Date().toISOString().slice(0, 10);
  if (user.last_daily_bonus_date === today) {
    return { error: "already_claimed", balance: user.sp_balance };
  }
  const updated = await updateUserPg(userId, {
    sp_balance: user.sp_balance + 20,
    last_daily_bonus_date: today
  });
  return { balance: updated.sp_balance, gained: 20 };
}

async function claimAdWatchPg(userId) {
  const user = await findUserByIdPg(userId);
  if (!user) return { error: "Utilizator inexistent." };
  const now = Date.now();
  const last = user.last_ad_watch_at ? new Date(user.last_ad_watch_at).getTime() : 0;
  const cooldownMs = 30 * 60 * 1000;
  if (now - last < cooldownMs) {
    return { error: "cooldown", remainingMin: Math.ceil((cooldownMs - (now - last)) / 60000) };
  }
  const updated = await updateUserPg(userId, {
    sp_balance: user.sp_balance + 15,
    last_ad_watch_at: new Date().toISOString()
  });
  return { balance: updated.sp_balance, gained: 15 };
}

async function purchaseItemPg(userId, itemId) {
  const item = getShopCatalog().find((i) => i.id === itemId);
  if (!item) return { error: "Item inexistent." };
  const user = await findUserByIdPg(userId);
  if (!user) return { error: "Utilizator inexistent." };
  if (user.owned_items.includes(itemId)) return { error: "already_owned" };
  if (user.sp_balance < item.price) return { error: "insufficient_funds", needed: item.price - user.sp_balance };

  const updated = await updateUserPg(userId, {
    sp_balance: user.sp_balance - item.price,
    owned_items: [...user.owned_items, itemId]
  });
  return { balance: updated.sp_balance, item };
}

async function equipItemPg(userId, itemId) {
  const item = getShopCatalog().find((i) => i.id === itemId);
  if (!item) return { error: "Item inexistent." };
  const user = await findUserByIdPg(userId);
  if (!user) return { error: "Utilizator inexistent." };
  if (!user.owned_items.includes(itemId)) return { error: "not_owned" };

  const patch = {};
  if (item.type === "theme") patch.active_theme = itemId;
  if (item.type === "frame") patch.active_frame = user.active_frame === itemId ? null : itemId;

  const updated = await updateUserPg(userId, patch);
  return { activeTheme: updated.active_theme, activeFrame: updated.active_frame };
}

async function redeemPackagePg(userId, packageId) {
  const pkg = getSPPackages().find((p) => p.id === packageId);
  if (!pkg) return { error: "Pachet inexistent." };
  const user = await findUserByIdPg(userId);
  if (!user) return { error: "Utilizator inexistent." };
  const updated = await updateUserPg(userId, { sp_balance: user.sp_balance + pkg.sp });
  return { balance: updated.sp_balance, gained: pkg.sp, package: pkg };
}
async function insertResourcePg(
  userId,
  courseId,
  { filename, originalName, sizeKb }
) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  const resource = {
    id: uid(),
    filename,
    originalName,
    sizeKb: Number(sizeKb) || 0,
    addedAt: new Date().toISOString()
  };

  await pool.query(
    `UPDATE courses
     SET resources = resources || $1::jsonb
     WHERE id = $2 AND user_id = $3`,
    [
      JSON.stringify([resource]),
      courseId,
      userId
    ]
  );

  return resource;
}

async function listResourcesPg(courseId, userId) {
  const course = await findCoursePg(courseId, userId);
  if (!course) return null;

  return course.resources || [];
}

async function findResourcePg(resourceId, userId) {
  const { rows } = await pool.query(
    `SELECT jsonb_array_elements(resources) AS resource
     FROM courses
     WHERE user_id = $1
       AND resources @> $2::jsonb
     LIMIT 1`,
    [
      userId,
      JSON.stringify([{ id: resourceId }])
    ]
  );

  return rows[0]?.resource || null;
}
module.exports = {
  uid, loadDB, saveDB, ensureAdmin, findUserByIdPg,
  findUserByIdentifierPg, insertUserPg, updateUserPg,
  findUserById, findUserByIdentifier, insertUser, updateUser,
  getWallet, addSP, claimDailyBonus, claimAdWatch, redeemPackage,
  purchaseItem, equipItem, getShopCatalog, getSPPackages, awardTaskOnTimeIfEligible,
  listCourses, findCourse, insertCourse, updateCourse, deleteCourse,
  addGradingCategory, updateGradingCategory, deleteGradingCategory, addGrade, deleteGrade,
  listNotes, insertNote, updateNote, deleteNote,
  listTasks, findTask, insertTask, bulkInsertTasks, updateTaskStatus, deleteTask,
  insertResource, listResources, findResource, recordAttendance, undoLastAttendance, resetAttendance,
  addFlashcardDeck, deleteFlashcardDeck, addFlashcard, deleteFlashcard,
  listScheduleEntries, insertScheduleEntry, updateScheduleEntry, deleteScheduleEntry, getWalletPg, claimDailyBonusPg, claimAdWatchPg,
purchaseItemPg, equipItemPg, redeemPackagePg,  listCoursesPg,
  findCoursePg,
  insertCoursePg,
  updateCoursePg,  deleteCoursePg,   addGradingCategoryPg,
  updateGradingCategoryPg,
  deleteGradingCategoryPg,
  addGradePg,
  deleteGradePg,   recordAttendancePg,
  undoLastAttendancePg,
  resetAttendancePg,  addFlashcardDeckPg,
  deleteFlashcardDeckPg,
  addFlashcardPg,
  deleteFlashcardPg,   insertResourcePg,
  listResourcesPg,
  findResourcePg,
};
