/* ============================================================
   StudyApp v0.1.6 — frontend conectat la serverul real (Express).
   Nou: portofel StudyPoints (SP) — pilulă în topbar, bonus zilnic,
   simulare "vizionare reclamă", shop cu teme de culoare + cadru
   avatar, pachete SP simulate (fără plăți reale încă). Restul
   logicii neschimbat față de v0.1.5.2.
   ============================================================ */

const API = "/api";
const AUTH = "/auth";

let state = {
  user: null,
  courses: [],
  notes: [],
  tasks: [],
  wallet: null,
  shopCatalog: [],
  spPackages: [],
  proPlans: [],
  scheduleEntries: []
};
let token = localStorage.getItem("studyapp_token") || null;
let activeGradesCourseId = null;
let activeCategoryIdForGrade = null;
let activeScheduleView = "classic";
let activeScheduleCarouselOffset = 0;
let gradesChartInstance = null;

function authHeaders(json = true) {
  const h = { Authorization: `Bearer ${token}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function api(method, path, body, isForm = false) {
  const opts = { method, headers: isForm ? authHeaders(false) : authHeaders() };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Server error.");
    err.data = data;
    throw err;
  }
  return data;
}

async function authApi(path, body) {
  const res = await fetch(AUTH + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Server error.");
  return data;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(window.currentLang === "en" ? "en-GB" : "ro-RO", { day: "numeric", month: "short" });
}
function daysUntil(iso) {
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / 86400000);
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ================= I18N ================= */
window.currentLang = localStorage.getItem("studyapp_lang") || "ro";

function applyTranslations() {
  document.documentElement.lang = window.currentLang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  const langLabel = window.currentLang === "en" ? "🌐 RO" : "🌐 EN";
  const loginToggle = document.getElementById("lang-toggle-login");
  if (loginToggle) loginToggle.textContent = langLabel;
}

function setLang(lang) {
  window.currentLang = lang;
  localStorage.setItem("studyapp_lang", lang);
  applyTranslations();
  populatePeriodOptions();
  if (state.user) renderAll();
}

document.getElementById("lang-toggle-login").addEventListener("click", () => {
  setLang(window.currentLang === "en" ? "ro" : "en");
});
document.getElementById("lang-toggle").addEventListener("click", () => {
  setLang(window.currentLang === "en" ? "ro" : "en");
});
document.getElementById("lang-toggle-sb").addEventListener("click", () => {
  setLang(window.currentLang === "en" ? "ro" : "en");
});

applyTranslations();

/* ================= LOGO → HOME ================= */
function goHome() {
  if (!state.user) return;
  switchTab("home");
  document.querySelector(".content").scrollTo({ top: 0, behavior: "smooth" });
}
document.getElementById("logo-home-sidebar").addEventListener("click", goHome);

const mobileSidebar = document.querySelector(".sidebar");
const mobileLogo = document.getElementById("logo-home-topbar");

function closeMobileMenu() {
  if (mobileSidebar) {
    mobileSidebar.classList.remove("mobile-open");
  }
}

function toggleMobileMenu(event) {
  event.stopPropagation();

  if (!isMobileNav()) {
    goHome();
    return;
  }

  mobileSidebar.classList.toggle("mobile-open");
}

mobileLogo.addEventListener("click", toggleMobileMenu);

document.addEventListener("click", (event) => {
  if (!mobileSidebar || !mobileSidebar.classList.contains("mobile-open")) {
    return;
  }

  if (!mobileSidebar.contains(event.target) && event.target !== mobileLogo) {
    closeMobileMenu();
  }
});

/* ================= TOPBAR SHADOW ON SCROLL ================= */
document.addEventListener("DOMContentLoaded", () => {
  const content = document.querySelector(".content");
  const topbar = document.getElementById("topbar");
  if (content && topbar) {
    content.addEventListener("scroll", () => {
      topbar.classList.toggle("scrolled", content.scrollTop > 4);
    });
  }
});

/* ================= PERIOADE ACADEMICE ================= */
function getPeriods() {
  const level = state.user ? state.user.education_level : "facultate";
  if (level === "liceu") {
    return window.currentLang === "en"
      ? ["Module 1", "Module 2", "Module 3", "Module 4", "Module 5"]
      : ["Modulul 1", "Modulul 2", "Modulul 3", "Modulul 4", "Modulul 5"];
  }
  return window.currentLang === "en"
    ? ["Semester 1", "Semester 2"]
    : ["Semestrul 1", "Semestrul 2"];
}
function populatePeriodOptions() {
  ["course-period", "course-detail-period"].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const current = select.value;
    const periods = getPeriods();
    select.innerHTML = `<option value="">—</option>` + periods.map((p) => `<option value="${p}">${p}</option>`).join("");
    if (periods.includes(current)) select.value = current;
  });
}

/* ================= THEME (dark/light + culoare din shop) ================= */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("studyapp_theme", theme);
  const icon = theme === "dark" ? "☀️" : "🌙";
  ["theme-toggle", "theme-toggle-sb"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
  if (gradesChartInstance) renderGradesChart();
}
function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
}
(function initTheme() {
  const saved = localStorage.getItem("studyapp_theme");
  applyTheme(saved || "dark");
})();
document.getElementById("theme-toggle").addEventListener("click", toggleTheme);
document.getElementById("theme-toggle-sb").addEventListener("click", toggleTheme);

/* Aplică o temă de culoare cumpărată din shop (schimbă --primary/--accent).
   activeTheme=null → revine la culorile implicite ale aplicației. */
function applyColorTheme(activeThemeId) {
  const root = document.documentElement.style;
  const item = state.shopCatalog.find((i) => i.id === activeThemeId && i.type === "theme");
  if (item && item.colors) {
    root.setProperty("--primary", item.colors.primary);
    root.setProperty("--accent", item.colors.accent);
    root.setProperty("--primary-light", item.colors.accent);
    root.setProperty("--primary-dark", item.colors.primary);
  } else {
    root.removeProperty("--primary");
    root.removeProperty("--accent");
    root.removeProperty("--primary-light");
    root.removeProperty("--primary-dark");
  }
}

function applyAvatarFrame(activeFrameId) {
  const wrap = document.getElementById("user-avatar-wrap");
  wrap.className = "user-avatar-wrap";
  if (activeFrameId === "frame-gold") wrap.classList.add("frame-gold");
}

/* ================= PWA: SERVICE WORKER ================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { });
  });
}

/* ================= AUTH SCREENS ================= */
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app");

document.querySelectorAll(".auth-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".auth-form").forEach((f) => f.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.auth}-form`).classList.add("active");
  });
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const identifier = document.getElementById("login-identifier").value.trim();
  const password = document.getElementById("login-password").value;
  const errBox = document.getElementById("login-error");
  errBox.classList.add("hidden");
  try {
    const data = await authApi("/login", { identifier, password });
    token = data.token;
    localStorage.setItem("studyapp_token", token);
    state.user = data.user;
    await bootstrapApp();
  } catch (err) {
    errBox.textContent = t(err.message) || err.message;
    errBox.classList.remove("hidden");
  }
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("register-name").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const accessCode = document
  .getElementById("register-access-code")
  .value
  .trim();
  const educationLevel = document.getElementById("register-level").value;
  const errBox = document.getElementById("register-error");
  errBox.classList.add("hidden");
  try {
   const data = await authApi("/register", {
  name,
  email,
  password,
  educationLevel,
  accessCode
});
    token = data.token;
    localStorage.setItem("studyapp_token", token);
    state.user = data.user;
    await bootstrapApp();
  } catch (err) {
    errBox.textContent = t(err.message) || err.message;
    errBox.classList.remove("hidden");
  }
});

document.getElementById("google-login-btn").addEventListener("click", async () => {
  const code = document.getElementById("oauth-access-code").value.trim();
  const errorBox = document.getElementById("oauth-error");

  errorBox.classList.add("hidden");

  if (!code) {
    errorBox.textContent = t("alpha_code_required");
    errorBox.classList.remove("hidden");
    return;
  }

  try {
    const response = await fetch(`${AUTH}/google/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        accessCode: code
      })
    });

    const data = await response.json();

    if (!response.ok) {
     throw new Error(
  data.error === "alpha_code_invalid"
    ? t("alpha_code_invalid")
    : data.error || t("alpha_code_invalid")
);
    }

    window.location.href = data.url;
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  }
});
document.getElementById("apple-login-btn").addEventListener("click", () => {
  showToast(t("toast_apple_soon"));
});

function logout() {
  token = null;
  localStorage.removeItem("studyapp_token");
  state = { user: null, courses: [], notes: [], tasks: [], wallet: null, shopCatalog: [], spPackages: [], scheduleEntries: [] };
  applyColorTheme(null);
  loginScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}
document.getElementById("logout-btn").addEventListener("click", logout);
document.getElementById("logout-btn-sb").addEventListener("click", logout);

function consumeGoogleRedirectToken() {
  const params = new URLSearchParams(window.location.search);
  const t2 = params.get("token");
  if (t2) {
    token = t2;
    localStorage.setItem("studyapp_token", token);
    window.history.replaceState({}, "", "/");
    return true;
  }
  return false;
}

/* ================= BOOTSTRAP ================= */
async function bootstrapApp() {
  try {
    const me = await fetch(AUTH + "/me", { headers: authHeaders() }).then((r) => {
      if (!r.ok) throw new Error("unauthorized");
      return r.json();
    });
    state.user = me.user;
    if (state.user.language && state.user.language !== window.currentLang) {
      window.currentLang = state.user.language;
      localStorage.setItem("studyapp_lang", window.currentLang);
    }
  } catch {
    token = null;
    localStorage.removeItem("studyapp_token");
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    return;
  }

  const [
  courses,
  notes,
  tasks,
  wallet,
  shopCatalog,
  spPackages,
  proPlans,
  scheduleEntries
] = await Promise.all([
    api("GET", "/courses"),
    api("GET", "/notes"),
    api("GET", "/tasks"),
    api("GET", "/wallet"),
    api("GET", "/shop/catalog"),
 api("GET", "/wallet/packages"),
api("GET", "/wallet/pro-plans"),
api("GET", "/schedule")
  ]);

  state.courses = courses;
  state.notes = notes;
  state.tasks = tasks;
  state.wallet = wallet;
  state.shopCatalog = shopCatalog;
  state.spPackages = spPackages;
  state.proPlans = proPlans;
  state.scheduleEntries = scheduleEntries;

  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
if (state.user.needs_onboarding) {
  const savedLang = localStorage.getItem("studyapplang");

  if (savedLang) {
    window.currentLang = savedLang;
  }

  applyTranslations();

  const usernameInput = document.getElementById("onboarding-username");

  usernameInput.value =
    state.user.username ||
    state.user.email?.split("@")[0] ||
    "";

  openModal("modal-onboarding");
}

  applyTranslations();
  populatePeriodOptions();
  document.getElementById("greeting").textContent = `${t("greeting_hello")}, ${state.user.name.split(" ")[0]}!`;
  document.getElementById("user-avatar").textContent = getInitials(state.user.name);
  const roleBadge = document.getElementById("role-badge");
  if (state.user.role === "admin") roleBadge.classList.remove("hidden");
  else roleBadge.classList.add("hidden");

  applyColorTheme(wallet.activeTheme);
  applyAvatarFrame(wallet.activeFrame);
  updateWalletPill();

  renderAll();
  requestNotificationPermission();
}
document
  .getElementById("complete-onboarding-btn")
  .addEventListener("click", async () => {
    const usernameInput = document.getElementById("onboarding-username");
    const passwordInput = document.getElementById("onboarding-password");
    const errorBox = document.getElementById("onboarding-error");
    const onboarding = document.getElementById("modal-onboarding");

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    errorBox.classList.add("hidden");

    if (!username) {
      errorBox.textContent = t("onboarding_username_required");
      errorBox.classList.remove("hidden");
      usernameInput.focus();

      onboarding.classList.remove("onboarding-shake");
      void onboarding.offsetWidth;
      onboarding.classList.add("onboarding-shake");
      return;
    }

    if (!password) {
      errorBox.textContent = t("onboarding_password_required");
      errorBox.classList.remove("hidden");
      passwordInput.focus();

      onboarding.classList.remove("onboarding-shake");
      void onboarding.offsetWidth;
      onboarding.classList.add("onboarding-shake");
      return;
    }

   const button = document.getElementById("complete-onboarding-btn");

button.disabled = true;

try {
  const response = await fetch(AUTH + "/onboarding", {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username,
      password,
      educationLevel: document.getElementById("onboarding-level").value
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || t("onboarding_save_error"));
  }

  state.user = data.user;

  closeModal();
  applyTranslations();
  renderAll();

  showToast(t("onboarding_saved"));
} catch (error) {
  errorBox.textContent = error.message;
  errorBox.classList.remove("hidden");

  onboarding.classList.remove("onboarding-shake");
  void onboarding.offsetWidth;
  onboarding.classList.add("onboarding-shake");
} finally {
  button.disabled = false;
}
  });
function getStudyPointsTransactionDescription(transaction) {
  const type = transaction.type;
  const rawDescription = transaction.description || "";
  const amount = Math.abs(Number(transaction.amount || 0));

  if (type === "daily_bonus") {
    return t("shop_history_daily_bonus");
  }

  if (type === "ad_watch") {
    return t("shop_history_ad_watch");
  }

  if (type === "sp_package") {
    return t("shop_history_sp_package", { n: amount });
  }

  if (type === "pro_purchase") {
    const names = {
      "Pro 1 zi": t("pro_day_name"),
      "Pro 7 zile": t("pro_week_name"),
      "Pro 30 zile": t("pro_month_name")
    };

    const planName = rawDescription.replace("Activare Pro: ", "");

    return t("shop_history_pro_purchase", {
      name: names[planName] || planName
    });
  }

  if (type === "shop_purchase") {
    const itemName = rawDescription.replace("Cumpărare: ", "");

    return t("shop_history_shop_purchase", {
      name: itemName
    });
  }

  return rawDescription || type;
}


async function loadStudyPointsHistory() {
  const list = document.getElementById("study-points-history-list");

  if (!list) return;

  list.innerHTML = `
    <div class="shop-history-empty">
      ${t("shop_history_loading")}
    </div>
  `;

   try {
    console.log("History request started");

    const result = await Promise.race([
      api("GET", "/wallet/transactions"),

      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("History request timeout"));
        }, 8000);
      })
    ]);

    console.log("History response received:", result);

    const transactions = result.transactions || [];

    if (transactions.length === 0) {
      list.innerHTML = `
        <div class="shop-history-empty">
          ${t("shop_history_empty")}
        </div>
      `;
      return;
    }

    list.innerHTML = transactions.map((transaction) => {
      const amount = Number(transaction.amount || 0);

      const amountClass = amount >= 0
        ? "shop-history-positive"
        : "shop-history-negative";

      const amountText = amount >= 0
        ? `+${amount} SP`
        : `${amount} SP`;

      const date = new Date(transaction.created_at);

      const dateText = date.toLocaleString(
        window.currentLang === "en" ? "en-GB" : "ro-RO",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }
      );

      return `
        <div class="shop-history-item">
          <div class="shop-history-item-main">
            <span class="shop-history-description">
              ${getStudyPointsTransactionDescription(transaction)}
            </span>

            <span class="shop-history-date">
              ${dateText}
            </span>
          </div>

          <div class="shop-history-item-side">
            <span class="${amountClass}">
              ${amountText}
            </span>

            <span class="shop-history-balance">
              ${t("shop_history_balance", {
                n: transaction.balance_after
              })}
            </span>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    list.innerHTML = `
      <div class="shop-history-empty">
        ${t("shop_history_error")}
      </div>
    `;
  }
}
/* ================= TABS ================= */
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  closeMobileMenu();
  document.querySelectorAll(".tab").forEach((tEl) => tEl.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  document.querySelectorAll(`.tab-btn[data-tab="${name}"]`).forEach((b) => b.classList.add("active"));
  if (name === "home") renderHome();
  if (name === "notes") renderNotes();
  if (name === "courses") renderCourses();
  if (name === "tasks") renderTasks();
  if (name === "grades") renderGradesTab();
  if (name === "summary") renderSummaryTab();
  if (name === "schedule") renderSchedule();
}

/* ================= SWIPE GESTURES (mobil/tabletă) ================= */
const TAB_ORDER = ["home", "notes", "courses", "tasks", "grades", "summary", "schedule"];
let swipeStartX = 0, swipeStartY = 0, swipeTracking = false;

function isMobileNav() {
  return window.matchMedia("(max-width: 859px)").matches;
}
function currentTabName() {
  const activeBtn = document.querySelector(".tabbar .tab-btn.active") || document.querySelector(".sidebar-nav .tab-btn.active");
  return activeBtn ? activeBtn.dataset.tab : "home";
}
function swipeToTab(direction) {
  const current = currentTabName();
  const idx = TAB_ORDER.indexOf(current);
  if (idx === -1) return;
  const nextIdx = direction === "left" ? idx + 1 : idx - 1;
  if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return;
  switchTab(TAB_ORDER[nextIdx]);
}
(function initSwipe() {
  const area = document.getElementById("swipe-area");
  if (!area) return;
  area.addEventListener("touchstart", (e) => {
    if (!isMobileNav() || !state.user) { swipeTracking = false; return; }
    if (e.target.closest(".carousel") || e.target.closest("textarea") || e.target.closest("select") || e.target.closest(".scrollable")) {
      swipeTracking = false;
      return;
    }
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swipeTracking = true;
  }, { passive: true });
  area.addEventListener("touchend", (e) => {
    if (!swipeTracking) return;
    swipeTracking = false;
    const deltaX = e.changedTouches[0].clientX - swipeStartX;
    const deltaY = e.changedTouches[0].clientY - swipeStartY;
    if (Math.abs(deltaX) > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.8) {
      swipeToTab(deltaX < 0 ? "left" : "right");
    }
  }, { passive: true });
})();

/* ================= MODALS ================= */
const overlay = document.getElementById("modal-overlay");
function openModal(id) {
  overlay.classList.remove("hidden");
  document.querySelectorAll(".modal").forEach((m) => m.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}
function closeModal() { overlay.classList.add("hidden"); }
document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModal));
overlay.addEventListener("click", e => {
  if (e.target !== overlay) return;

  const onboarding = document.getElementById("modal-onboarding");

  if (onboarding && !onboarding.classList.contains("hidden")) {
    const errorBox = document.getElementById("onboarding-error");

    errorBox.textContent = t("onboarding_password_required");
    errorBox.classList.remove("hidden");

    onboarding.classList.remove("onboarding-shake");
    void onboarding.offsetWidth;
    onboarding.classList.add("onboarding-shake");

    return;
  }

  closeModal();
});

/* ================= SETTINGS ================= */
function openSettingsModal() {
  document.getElementById("settings-moodle-url").value =
    state.user.moodle_ics_url || "";

  document.getElementById("settings-language").value =
    window.currentLang;

  document.getElementById("settings-education-level").value =
    state.user.education_level || "facultate";

  const activeHours =
    state.user.reminder_hours_before || [24, 1];

  document
    .querySelectorAll("#reminder-options input[type=checkbox]")
    .forEach((cb) => {
      cb.checked = activeHours.includes(Number(cb.value));
    });

  openModal("modal-settings");
}
document.getElementById("settings-btn").addEventListener("click", openSettingsModal);
document.getElementById("settings-btn-sb").addEventListener("click", openSettingsModal);

document.getElementById("save-settings-btn").addEventListener("click", async () => {
  const moodleIcsUrl = document.getElementById("settings-moodle-url").value.trim();
  const reminderHoursBefore = Array.from(document.querySelectorAll("#reminder-options input[type=checkbox]:checked"))
    .map((cb) => Number(cb.value));
  const language = document.getElementById("settings-language").value;
  const educationLevel = document.getElementById("settings-education-level").value;

  const payload = {
  moodleIcsUrl,
  reminderHoursBefore,
  language,
  educationLevel
};

  try {
    const updated = await api("PUT", "/settings", payload);
    state.user.moodle_ics_url = updated.moodle_ics_url;
    state.user.reminder_hours_before = updated.reminder_hours_before;
    state.user.education_level = updated.education_level;
    state.user.language = updated.language;
    closeModal();
    if (window.currentLang !== language) setLang(language);
    else populatePeriodOptions();
    showToast(t("toast_settings_saved"));
  } catch (err) { showToast(err.message); }
});

/* ================= WALLET (StudyPoints) ================= */
function updateWalletPill() {
  document.getElementById("wallet-balance").textContent = state.wallet ? state.wallet.balance : "—";
  const shopBalanceEl = document.getElementById("shop-balance-value");
  if (shopBalanceEl && state.wallet) shopBalanceEl.textContent = state.wallet.balance;
}

document.getElementById("wallet-pill").addEventListener("click", () => openShop());

function checkDailyBonusAvailable() {
  const card = document.getElementById("daily-bonus-card");
  const shopButton = document.getElementById("shop-claim-daily-bonus-btn");

  if (!state.wallet) {
    if (card) card.classList.add("hidden");
    if (shopButton) shopButton.classList.add("hidden");
    return;
  }

  const alreadyClaimed = state.wallet.lastDailyBonusDate === todayISO();

  if (alreadyClaimed) {
    if (card) card.classList.add("hidden");
    if (shopButton) shopButton.classList.add("hidden");
  } else {
    if (card) card.classList.remove("hidden");
    if (shopButton) shopButton.classList.remove("hidden");
  }
}


async function claimDailyBonusFromAnyPlace() {
  try {
    const result = await api("POST", "/wallet/daily-bonus", {});

    state.wallet.balance = result.balance;
    state.wallet.lastDailyBonusDate = todayISO();

    updateWalletPill();
    checkDailyBonusAvailable();

    showToast(t("toast_daily_bonus_claimed", { n: result.gained }));
  } catch (err) {
    if (err.data && err.data.balance !== undefined) {
      state.wallet.balance = err.data.balance;
    }

    state.wallet.lastDailyBonusDate = todayISO();

    updateWalletPill();
    checkDailyBonusAvailable();

    showToast(t("toast_daily_bonus_already"));
  }
}


document
  .getElementById("claim-daily-bonus-btn")
  .addEventListener("click", claimDailyBonusFromAnyPlace);


const shopDailyBonusButton = document.getElementById(
  "shop-claim-daily-bonus-btn"
);

if (shopDailyBonusButton) {
  shopDailyBonusButton.addEventListener(
    "click",
    claimDailyBonusFromAnyPlace
  );
}

document.getElementById("claim-daily-bonus-btn").addEventListener("click", async () => {
  try {
    const result = await api("POST", "/wallet/daily-bonus", {});
    state.wallet.balance = result.balance;
    state.wallet.lastDailyBonusDate = todayISO();
    updateWalletPill();
    checkDailyBonusAvailable();
    showToast(t("toast_daily_bonus_claimed", { n: result.gained }));
  } catch (err) {
    if (err.data && err.data.balance !== undefined) state.wallet.balance = err.data.balance;
    showToast(t("toast_daily_bonus_already"));
  }
});

/* ================= SHOP ================= */
function openShop() {
  updateWalletPill();
  renderShopItems();
  renderShopPackages();
  renderProPlans();
  loadStudyPointsHistory();
  openModal("modal-shop");
}

document.querySelectorAll(".shop-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".shop-tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.shopTab;
    document.getElementById("shop-panel-items").classList.toggle("hidden", target !== "items");
    document.getElementById("shop-panel-packages").classList.toggle("hidden", target !== "packages");
  });
});
function getShopItemDisplayName(item) {
  const keys = {
    "theme-sunset": "shop_item_theme_sunset",
    "theme-ocean": "shop_item_theme_ocean",
    "theme-forest": "shop_item_theme_forest",
    "theme-rosegold": "shop_item_theme_rosegold",
    "theme-neon": "shop_item_theme_neon",
    "frame-gold": "shop_item_frame_gold"
  };

  return keys[item.id] ? t(keys[item.id]) : item.name;
}


function getProPlanDisplayName(plan) {
  const keys = {
    "pro-day": "pro_day_name",
    "pro-week": "pro_week_name",
    "pro-month": "pro_month_name"
  };

  return keys[plan.id] ? t(keys[plan.id]) : plan.name;
}
function renderShopItems() {
  const grid = document.getElementById("shop-items-grid");
  grid.innerHTML = state.shopCatalog
    .map((item) => {
      const owned = state.wallet.ownedItems.includes(item.id);
      const isActiveTheme = item.type === "theme" && state.wallet.activeTheme === item.id;
      const isActiveFrame = item.type === "frame" && state.wallet.activeFrame === item.id;
      const isEquipped = isActiveTheme || isActiveFrame;

      const preview = item.type === "theme"
        ? `<div class="shop-item-swatch" style="background:linear-gradient(135deg, ${item.colors.primary}, ${item.colors.accent})"></div>`
        : `<div class="shop-item-frame-preview">👤</div>`;

      let btnHtml;
      if (!owned) {
        btnHtml = `<button class="btn btn-secondary shop-item-btn" data-buy="${item.id}">${t("shop_buy_btn")} · ${item.price} SP</button>`;
      } else if (isEquipped) {
        btnHtml = item.type === "frame"
          ? `<button class="btn shop-item-btn equipped" data-equip="${item.id}">${t("shop_unequip_btn")}</button>`
          : `<button class="btn shop-item-btn equipped" disabled>${t("shop_equipped_btn")}</button>`;
      } else {
        btnHtml = `<button class="btn btn-secondary shop-item-btn" data-equip="${item.id}">${t("shop_equip_btn")}</button>`;
      }

      return `<div class="shop-item-card">
        ${preview}
       <div class="shop-item-name">${getShopItemDisplayName(item)}</div>
        ${!owned ? `<div class="shop-item-price">${item.price} SP</div>` : ""}
        ${btnHtml}
      </div>`;
    })
    .join("");

  grid.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", () => purchaseShopItem(btn.dataset.buy));
  });
  grid.querySelectorAll("[data-equip]").forEach((btn) => {
    btn.addEventListener("click", () => equipShopItem(btn.dataset.equip));
  });
}

async function purchaseShopItem(itemId) {
  try {
    const result = await api("POST", "/shop/purchase", { itemId });
    state.wallet.balance = result.balance;
    state.wallet.ownedItems.push(itemId);
    updateWalletPill();
    renderShopItems();
    showToast(t("toast_item_purchased", { name: result.item.name }));
  } catch (err) {
    if (err.data && err.data.needed !== undefined) {
      showToast(t("toast_insufficient_funds", { n: err.data.needed }));
    } else {
      showToast(err.message);
    }
  }
}

async function equipShopItem(itemId) {
  try {
    const result = await api("POST", "/shop/equip", { itemId });
    state.wallet.activeTheme = result.activeTheme;
    state.wallet.activeFrame = result.activeFrame;
    applyColorTheme(result.activeTheme);
    applyAvatarFrame(result.activeFrame);
    renderShopItems();
    const item = state.shopCatalog.find((i) => i.id === itemId);
    if (item) showToast(t("toast_item_equipped", { name: item.name }));
  } catch (err) {
    showToast(err.message);
  }
}

function renderShopPackages() {
  const grid = document.getElementById("shop-packages-grid");
  grid.innerHTML = state.spPackages
    .map(
      (pkg) => `<div class="shop-package-card">
        <div class="shop-package-sp">🪙 ${pkg.sp}</div>
        <div class="shop-package-price">${pkg.label}</div>
        <button class="btn btn-secondary shop-item-btn" data-redeem="${pkg.id}">${t("shop_buy_btn")}</button>
      </div>`
    )
    .join("");
  grid.querySelectorAll("[data-redeem]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const result = await api("POST", "/wallet/redeem-package", { packageId: btn.dataset.redeem });
      state.wallet.balance = result.balance;
      updateWalletPill();
      showToast(t("toast_ad_watched", { n: result.gained }));
    });
  });
}
function renderProPlans() {
  const grid = document.getElementById("shop-pro-plans-grid");

  if (!grid) return;

  if (!state.proPlans || state.proPlans.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        ${t("shop_no_pro_plans")}
      </div>
    `;
    return;
  }

  grid.innerHTML = state.proPlans
    .map((plan) => {
      return `
        <div class="shop-package-card shop-pro-card">
          <div class="shop-package-sp">
           ${getProPlanDisplayName(plan)}
          </div>

          <div class="shop-package-price">
            ${plan.price} SP
          </div>

          <button
            class="btn btn-primary shop-item-btn"
            data-activate-pro="${plan.id}"
          >
           ${t("shop_activate_pro_btn")}
          </button>
        </div>
      `;
    })
    .join("");

  grid.querySelectorAll("[data-activate-pro]").forEach((button) => {
    button.addEventListener("click", () => {
      activateProPlan(button.dataset.activatePro);
    });
  });
}
async function activateProPlan(planId) {
  try {
    const result = await api(
      "POST",
      "/wallet/activate-pro",
      { planId }
    );

    state.wallet.balance = result.balance;
    state.wallet.isPro = result.isPro;
    state.wallet.proExpiresAt = result.proExpiresAt;

    updateWalletPill();
    renderProPlans();

    showToast(
      `Pro activ până la ${new Date(result.proExpiresAt).toLocaleDateString()}`
    );
  } catch (err) {
    if (err.data && err.data.needed !== undefined) {
      showToast(
        `Nu ai suficiente StudyPoints. Îți mai trebuie ${err.data.needed} SP.`
      );
    } else {
      showToast(err.message || "Activarea Pro a eșuat.");
    }
  }
}

/* ================= AD WATCH SIMULATION ================= */
document.getElementById("shop-watch-ad-btn").addEventListener("click", () => {
  openModal("modal-ad-watch");
  startAdSimulation();
});

function startAdSimulation() {
  const fill = document.getElementById("ad-progress-fill");
  const countdown = document.getElementById("ad-countdown");
  let secondsLeft = 5;
  fill.style.width = "0%";
  countdown.textContent = secondsLeft;

  const interval = setInterval(async () => {
    secondsLeft -= 1;
    const pct = ((5 - secondsLeft) / 5) * 100;
    fill.style.width = `${pct}%`;
    countdown.textContent = secondsLeft > 0 ? secondsLeft : "✓";
    if (secondsLeft <= 0) {
      clearInterval(interval);
      try {
        const result = await api("POST", "/wallet/watch-ad", {});
        state.wallet.balance = result.balance;
        state.wallet.lastAdWatchAt = new Date().toISOString();
        updateWalletPill();
        renderShopItems();
        closeModal();
        showToast(t("toast_ad_watched", { n: result.gained }));
      } catch (err) {
        closeModal();
        if (err.data && err.data.remainingMin !== undefined) {
          showToast(t("toast_ad_cooldown", { n: err.data.remainingMin }));
        } else {
          showToast(err.message);
        }
      }
    }
  }, 1000);
}
/* ================= SCHEDULE (orar) ================= */
const DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_KEYS = {
  1: "schedule_day_mon",
  2: "schedule_day_tue",
  3: "schedule_day_wed",
  4: "schedule_day_thu",
  5: "schedule_day_fri",
  6: "schedule_day_sat",
  0: "schedule_day_sun"
};

let activeScheduleFilter = "all";
let activeScheduleEntryId = null;
let currentScheduleDay = null;
let dynamicScheduleDay = null;

function dayLabel(day) {
  return t(DAY_KEYS[day] || "schedule_day_mon");
}
function formatFullDayLabel(day) {
  const dt = new Date();
  const diff = (day - dt.getDay() + 7) % 7;
  dt.setDate(dt.getDate() + diff);
  return dt.toLocaleDateString(window.currentLang === "en" ? "en-GB" : "ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}
function buildSingleDayCard(day, highlighted = false) {
  const now = new Date();
  const today = now.getDay();
  const entries = [...(state.scheduleEntries || [])]
    .filter((e) => activeScheduleFilter === "all" ? true : e.type === activeScheduleFilter)
    .filter((e) => Number(e.day) === Number(day))
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  const dayDate = new Date();
  const diff = (day - today + 7) % 7;
  dayDate.setDate(dayDate.getDate() + diff);
  const dateLabel = dayDate.toLocaleDateString(window.currentLang === "en" ? "en-GB" : "ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "short"
  });

  return `
    <div class="schedule-day-card ${highlighted ? "today-highlight schedule-dynamic-card" : ""}" data-day="${day}">
      <div class="schedule-day-head">
        <div class="schedule-day-name">${dayLabel(day)}</div>
        <div class="schedule-day-date">${dateLabel}${day === today ? ` • ${t("schedule_weekday_today")}` : ""}</div>
      </div>
      <div class="schedule-entry-list">
        ${
          entries.length === 0
            ? `<div class="schedule-empty-day">${t("schedule_empty_preview") || t("schedule_empty_day")}</div>`
            : entries.map((e) => {
                const course = state.courses.find((c) => c.id === e.course_id);
                const bg = e.color || course?.color || "#5b5bf0";
                return `
                  <div class="schedule-entry" data-entry="${e.id}" style="background:${bg}">
                    <div class="schedule-entry-title">${e.title || course?.name || "—"}</div>
                    <div class="schedule-entry-time">${e.startTime} – ${e.endTime}</div>
                    <div class="schedule-entry-meta">
                      ${e.room ? `📍 ${e.room}` : ""}
                      ${e.parity !== "all" ? `· ${e.parity === "odd" ? t("schedule_parity_odd") : t("schedule_parity_even")}` : ""}
                      ${e.type ? `· ${e.type}` : ""}
                    </div>
                  </div>`;
              }).join("")
        }
      </div>
    </div>
  `;
}
function isSchoolSchedule() {
  if (!state.user) return false;

  const educationLevel =
    state.user.education_level ||
    state.user.educationLevel ||
    state.user.educationlevel;

  return educationLevel === "liceu";
}
function renderSchedule() {
  const grid = document.getElementById("schedule-grid");
  const carouselNav = document.getElementById("schedule-carousel-nav");
  const currentDayLabel = document.getElementById("schedule-current-day-label");

  if (!grid) return;

  const today = new Date().getDay();

  const isClassic = activeScheduleView === "classic";
  const isCarousel = activeScheduleView === "carousel";
  const isDynamic = activeScheduleView === "dynamic";

  grid.classList.toggle("schedule-grid-dynamic", isDynamic);

  const entries = [...(state.scheduleEntries || [])]
    .filter((entry) => {
      return activeScheduleFilter === "all" ||
        entry.type === activeScheduleFilter;
    })
    .sort((a, b) => {
      if (Number(a.day) !== Number(b.day)) {
        return DAYS_ORDER.indexOf(Number(a.day)) -
          DAYS_ORDER.indexOf(Number(b.day));
      }

      return (a.startTime || "").localeCompare(b.startTime || "");
    });

  function buildDayEntries(day) {
    return entries
      .filter((entry) => Number(entry.day) === Number(day))
      .map((entry) => {
        const course = state.courses.find(
          (courseItem) => courseItem.id === entry.course_id
        );

        const backgroundColor =
          entry.color ||
          course?.color ||
          "#5b5bf0";

        return `
          <div
            class="schedule-entry"
            data-entry="${entry.id}"
            style="background:${backgroundColor}"
          >
            <div class="schedule-entry-title">
              ${entry.title || course?.name || "—"}
            </div>

            <div class="schedule-entry-time">
              ${entry.startTime} – ${entry.endTime}
            </div>

            <div class="schedule-entry-meta">
              ${entry.room ? `📍 ${entry.room}` : ""}
              ${
                entry.parity !== "all"
                  ? ` · ${
                      entry.parity === "odd"
                        ? t("schedule_parity_odd")
                        : t("schedule_parity_even")
                    }`
                  : ""
              }
              ${
                entry.type && !isSchoolSchedule()
                  ? ` · ${entry.type}`
                  : ""
              }
            </div>
          </div>
        `;
      })
      .join("");
  }

  function buildDayCard(day, highlighted = false) {
    const dayDate = new Date();
    const difference = (day - today + 7) % 7;

    dayDate.setDate(dayDate.getDate() + difference);

    const dateLabel = dayDate.toLocaleDateString(
      window.currentLang === "en" ? "en-GB" : "ro-RO",
      {
        weekday: "long",
        day: "numeric",
        month: "short"
      }
    );

    const dayEntries = buildDayEntries(day);

    return `
      <div
        class="schedule-day-card ${
          highlighted ? "today-highlight schedule-dynamic-card" : ""
        }"
        data-day="${day}"
      >
        <div class="schedule-day-head">
          <div class="schedule-day-name">
            ${dayLabel(day)}
          </div>

          <div class="schedule-day-date">
            ${dateLabel}
            ${
              day === today
                ? ` · ${t("schedule_weekday_today")}`
                : ""
            }
          </div>
        </div>

        <div class="schedule-entry-list">
          ${
            dayEntries
              ? dayEntries
              : `<div class="schedule-empty-day">
                  ${t("schedule_empty_day")}
                </div>`
          }
        </div>
      </div>
    `;
  }

  if (carouselNav) {
    carouselNav.classList.toggle("hidden", isClassic);
  }

  if (isClassic) {
    grid.innerHTML = DAYS_ORDER
      .map((day) => buildDayCard(day, day === today))
      .join("");
  }

  if (isCarousel) {
    currentScheduleDay = currentScheduleDay ?? today;

    if (currentDayLabel) {
      currentDayLabel.textContent =
        formatFullDayLabel(currentScheduleDay);
    }

    grid.innerHTML = buildDayCard(
      currentScheduleDay,
      currentScheduleDay === today
    );
  }

  if (isDynamic) {
    dynamicScheduleDay = dynamicScheduleDay ?? today;

    if (currentDayLabel) {
      currentDayLabel.textContent =
        `${formatFullDayLabel(dynamicScheduleDay)} · ${todayDateLabel()}`;
    }

    const dynamicCard = buildDayCard(
      dynamicScheduleDay,
      dynamicScheduleDay === today
    );

    grid.innerHTML = `
      <div class="schedule-dynamic-shell">
        ${dynamicCard}
      </div>
    `;
  }

  grid.querySelectorAll("[data-entry]").forEach((entryElement) => {
    entryElement.addEventListener("click", () => {
      openScheduleModal(entryElement.dataset.entry);
    });
  });

  grid.querySelectorAll("[data-day]").forEach((dayElement) => {
    dayElement.addEventListener("click", () => {
      if (isCarousel) {
        currentScheduleDay = Number(dayElement.dataset.day);
        renderSchedule();
      }
    });
  });
}

function todayDateLabel() {
  return new Date().toLocaleDateString(window.currentLang === "en" ? "en-GB" : "ro-RO", {
    day: "numeric",
    month: "short"
  });
}
function applyScheduleTypeVisibility() {
  const typeGroup = document.getElementById("schedule-type-group");

  if (!typeGroup || !state.user) return;

  const educationLevel =
    state.user.education_level ||
    state.user.educationLevel ||
    state.user.educationlevel;

  const isSchool = educationLevel === "liceu";

  typeGroup.classList.toggle("hidden", isSchool);
}
function openScheduleModal(entryId = null) {
  activeScheduleEntryId = entryId;
  const entry = state.scheduleEntries.find((e) => e.id === entryId) || null;

  document.getElementById("schedule-modal-title").textContent = entry ? t("modal_save") : t("new_schedule_entry_btn");
  document.getElementById("schedule-title").value = entry?.title || "";
  document.getElementById("schedule-course").innerHTML = courseOptionsHTML(entry?.course_id || "");
  document.getElementById("schedule-use-course-color").checked = true;
  document.getElementById("schedule-auto-title").checked = true;
  document.getElementById("schedule-day").value = entry?.day ?? 1;
  document.getElementById("schedule-start-time").value = entry?.startTime || "08:00";
  document.getElementById("schedule-end-time").value = entry?.endTime || "09:50";
  document.getElementById("schedule-room").value = entry?.room || "";
  document.getElementById("schedule-type").value = entry?.type || "curs";
  document.getElementById("schedule-parity").value = entry?.parity || "all";
  document.getElementById("schedule-color").value = entry?.color || (state.courses.find((c) => c.id === entry?.course_id)?.color || "#5b5bf0");
  document.getElementById("delete-schedule-entry-btn").classList.toggle("hidden", !entryId);

  const courseSelect = document.getElementById("schedule-course");
  courseSelect.onchange = () => {
    const course = state.courses.find((c) => c.id === courseSelect.value);
    if (!course) return;
    if (document.getElementById("schedule-use-course-color").checked) {
      document.getElementById("schedule-color").value = course.color || "#5b5bf0";
    }
    if (document.getElementById("schedule-auto-title").checked && !activeScheduleEntryId) {
      document.getElementById("schedule-title").value = course.name || "";
    }
  };
  applyScheduleTypeVisibility();
openModal("modal-schedule");

}

document.getElementById("new-schedule-entry-btn").addEventListener("click", () => openScheduleModal());
document.getElementById("export-schedule-btn").addEventListener("click", exportScheduleJSON);
document.querySelectorAll("[data-schedule-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".schedule-view-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeScheduleView = btn.dataset.scheduleView;
    renderSchedule();
  });
});

document.getElementById("schedule-prev-day-btn").addEventListener("click", () => {
  if (activeScheduleView === "dynamic") {
    dynamicScheduleDay = (dynamicScheduleDay + 6) % 7;
  } else {
    currentScheduleDay = (currentScheduleDay + 6) % 7;
  }

  renderSchedule();
});

document.getElementById("schedule-next-day-btn").addEventListener("click", () => {
  if (activeScheduleView === "dynamic") {
    dynamicScheduleDay = (dynamicScheduleDay + 1) % 7;
  } else {
    currentScheduleDay = (currentScheduleDay + 1) % 7;
  }

  renderSchedule();
});
document.getElementById("import-schedule-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  importScheduleJSON(file);
  e.target.value = "";
});
function renderHomeSchedulePreview() {
  const box = document.getElementById("home-schedule-preview");
  if (!box) return;

  const now = new Date();
  const today = now.getDay();
  const todayEntries = (state.scheduleEntries || [])
    .filter((e) => Number(e.day) === Number(today))
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

  if (todayEntries.length === 0) {
    box.innerHTML = `<div class="empty-state">${t("schedule_empty_preview")}</div>`;
    return;
  }

  box.innerHTML = todayEntries.slice(0, 3).map((e) => {
    const course = state.courses.find((c) => c.id === e.course_id);
    return `
      <div class="list-item" style="cursor:pointer" data-preview-entry="${e.id}">
        <div class="li-main">
          <span class="schedule-preview-course">${e.title || course?.name || "—"}</span>
          <span class="schedule-preview-time">${e.startTime} – ${e.endTime}${e.room ? " · " + e.room : ""}</span>
        </div>
      </div>
    `;
  }).join("");

  box.querySelectorAll("[data-preview-entry]").forEach((el) => {
    el.addEventListener("click", () => openScheduleModal(el.dataset.previewEntry));
  });
}

function exportScheduleJSON() {
  const dataStr = JSON.stringify(state.scheduleEntries || [], null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "studyapp-schedule.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importScheduleJSON(file) {
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (!Array.isArray(parsed)) throw new Error("invalid");
      for (const item of parsed) {
        await api("POST", "/schedule", {
          courseId: item.course_id || null,
          title: item.title || "",
          day: item.day,
          startTime: item.startTime,
          endTime: item.endTime,
          room: item.room || "",
          type: item.type || "curs",
          parity: item.parity || "all",
          color: item.color || null
        });
      }
      const refreshed = await api("GET", "/schedule");
      state.scheduleEntries = refreshed;
      renderSchedule();
      renderHomeSchedulePreview();
      showToast(t("toast_settings_saved"));
    } catch (err) {
      showToast("JSON invalid.");
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll("[data-schedule-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".schedule-filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeScheduleFilter = btn.dataset.scheduleFilter;
    renderSchedule();
  });
});

document.getElementById("save-schedule-entry-btn").addEventListener("click", async () => {
  const selectedCourseId = document.getElementById("schedule-course").value || null;
  const course = state.courses.find((c) => c.id === selectedCourseId);

  const useCourseColor = document.getElementById("schedule-use-course-color").checked;
  const autoTitle = document.getElementById("schedule-auto-title").checked;

  const payload = {
    courseId: selectedCourseId,
    title: autoTitle && course && !document.getElementById("schedule-title").value.trim()
      ? course.name
      : document.getElementById("schedule-title").value.trim(),
    day: Number(document.getElementById("schedule-day").value),
    startTime: document.getElementById("schedule-start-time").value,
    endTime: document.getElementById("schedule-end-time").value,
    room: document.getElementById("schedule-room").value.trim(),
    type: document.getElementById("schedule-type").value,
    parity: document.getElementById("schedule-parity").value,
    color: useCourseColor ? (course?.color || document.getElementById("schedule-color").value) : document.getElementById("schedule-color").value
  };

  try {
    let result;
    if (activeScheduleEntryId) {
      result = await api("PATCH", `/schedule/${activeScheduleEntryId}`, payload);
      state.scheduleEntries = state.scheduleEntries.map((e) => e.id === activeScheduleEntryId ? result : e);
    } else {
      result = await api("POST", "/schedule", payload);
      state.scheduleEntries.push(result);
    }
    closeModal();
    renderSchedule();
    showToast(t("toast_settings_saved"));
  } catch (err) {
    showToast(err.message);
  }
});

document.getElementById("delete-schedule-entry-btn").addEventListener("click", async () => {
  if (!activeScheduleEntryId) return;
  if (!confirm(t("schedule_delete_confirm"))) return;
  await api("DELETE", `/schedule/${activeScheduleEntryId}`);
  state.scheduleEntries = state.scheduleEntries.filter((e) => e.id !== activeScheduleEntryId);
  closeModal();
  renderSchedule();
});


/* ================= COURSES ================= */
function courseOptionsHTML(selectedId) {
  return (
    `<option value="">— </option>` +
    state.courses.map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${c.name}</option>`).join("")
  );
}

document.getElementById("new-course-btn").addEventListener("click", () => {
  document.getElementById("course-name").value = "";
  document.getElementById("course-professor").value = "";
  document.getElementById("course-color").value = "#5b5bf0";
  populatePeriodOptions();
  document.getElementById("course-period").value = "";
  openModal("modal-course");
});

document.getElementById("save-course-btn").addEventListener("click", async () => {
  const name = document.getElementById("course-name").value.trim();
  if (!name) return showToast(t("toast_enter_course_name"));
  try {
    const course = await api("POST", "/courses", {
      name,
      professor: document.getElementById("course-professor").value.trim(),
      color: document.getElementById("course-color").value,
      period: document.getElementById("course-period").value || null
    });
    state.courses.unshift(course);
    closeModal();
    renderCourses();
    renderHome();
    showToast(t("toast_course_created"));
  } catch (err) { showToast(err.message); }
});

let activeCourseDetailId = null;

const COURSE_GRADIENTS = [
  "linear-gradient(135deg, #5b5bf0, #8b5cf6)",
  "linear-gradient(135deg, #ec4899, #f97316)",
  "linear-gradient(135deg, #06b6d4, #3b82f6)",
  "linear-gradient(135deg, #22c55e, #14b8a6)",
  "linear-gradient(135deg, #f59e0b, #ef4444)",
  "linear-gradient(135deg, #8b5cf6, #ec4899)"
];
function courseGradient(course, index) {
  if (course.color) return `linear-gradient(135deg, ${course.color}, ${course.color}cc)`;
  return COURSE_GRADIENTS[index % COURSE_GRADIENTS.length];
}

async function renderCourses() {
  const grid = document.getElementById("courses-grid");
  if (state.courses.length === 0) {
    grid.innerHTML = `<div class="empty-state">${t("empty_no_courses_full")}</div>`;
    return;
  }
  grid.innerHTML = state.courses
    .map((c) => {
      const noteCount = state.notes.filter((n) => n.course_id === c.id).length;
      const taskCount = state.tasks.filter((t2) => t2.course_id === c.id && t2.status !== "done").length;
      return `
      <div class="card course-card" data-id="${c.id}" style="cursor:pointer">
        <h3 style="display:flex;align-items:center;gap:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${c.color};display:inline-block;"></span>
          ${c.name}
        </h3>
        <p class="muted">${c.professor || t("no_professor")}${c.period ? " · " + c.period : ""}</p>
        <p class="muted">${noteCount} ${t("notes_count")} · ${taskCount} ${t("active_tasks_count")}</p>
      </div>`;
    })
    .join("");

  grid.querySelectorAll(".course-card").forEach((el) => {
    el.addEventListener("click", () => openCourseDetail(el.dataset.id));
  });
}

async function openCourseDetail(id) {
  const c = state.courses.find((x) => x.id === id);
  if (!c) return;
  activeCourseDetailId = id;
  document.getElementById("course-detail-name").textContent = c.name;
  document.getElementById("course-detail-professor").textContent = c.professor || t("no_professor");
  populatePeriodOptions();
  document.getElementById("course-detail-period").value = c.period || "";
  await renderCourseResources(id);
  renderAttendanceWidget(c);
  renderFlashcardDecks(c);
  openModal("modal-course-detail");
}

document.getElementById("course-detail-period").addEventListener("change", async (e) => {
  if (!activeCourseDetailId) return;
  const updated = await api("PATCH", `/courses/${activeCourseDetailId}`, { period: e.target.value || null });
  const idx = state.courses.findIndex((c) => c.id === activeCourseDetailId);
  if (idx !== -1) state.courses[idx] = updated;
  renderCourses();
  renderHome();
});

async function renderCourseResources(courseId) {
  const box = document.getElementById("course-detail-resources");
  const resources = await api(
    "GET",
    `/courses/${courseId}/resources`
  );

  if (resources.length === 0) {
    box.innerHTML = `
      <div class="empty-state">
        ${t("no_pdf_yet")}
      </div>
    `;
    return;
  }

  box.innerHTML = resources
    .map((r) => {
      const resourceName =
        r.originalName ||
        r.original_name ||
        r.originalname ||
        "Document PDF";

      const sizeKb =
        r.sizeKb ??
        r.size_kb ??
        0;

      const addedAt =
        r.addedAt ||
        r.addedAt ||
        r.addedAt ||
        null;

      const dateText = addedAt
        ? fmtDate(addedAt.slice(0, 10))
        : "";

      return `
        <div class="list-item" data-download="${r.id}">
          <div class="li-main">
            <span class="li-title">📄 ${resourceName}</span>
            <span class="li-sub">
              ${sizeKb} KB${dateText ? ` · ${dateText}` : ""}
            </span>
          </div>
        </div>
      `;
    })
    .join("");

  box.querySelectorAll("[data-download]").forEach((el) => {
    el.addEventListener("click", () => {
      window.open(
        `${API}/resources/${el.dataset.download}/download?token=${token}`,
        "_blank"
      );
    });
  });
}
/* ================= ATTENDANCE (absence tracker) ================= */
function renderAttendanceWidget(course) {
  const box = document.getElementById("attendance-widget");
  const att = course.attendance || { present: 0, absent: 0 };
  const total = att.present + att.absent;
  const percent = total > 0 ? (att.present / total) * 100 : null;
  const isDanger = percent !== null && percent < 75;

  box.innerHTML = `
    <div class="attendance-summary">
      <div class="attendance-percent ${isDanger ? "attendance-danger" : ""}">${percent !== null ? percent.toFixed(0) + "%" : "—"}</div>
      <div class="attendance-detail">
        <span>${att.present} ${t("attendance_present").toLowerCase()} · ${att.absent} ${t("attendance_absent").toLowerCase()}</span>
        ${isDanger ? `<span class="attendance-alert-text">${t("attendance_alert")}</span>` : ""}
      </div>
    </div>
    <div class="attendance-buttons">
      <button class="btn btn-secondary" data-att="present">✅ ${t("attendance_present")}</button>
      <button class="btn btn-secondary" data-att="absent">❌ ${t("attendance_absent")}</button>
      <button class="btn btn-ghost" data-att-undo>↩ ${t("attendance_undo")}</button>
      <button class="btn btn-ghost" data-att-reset>🔄 ${t("attendance_reset")}</button>
    </div>
  `;

  box.querySelectorAll("[data-att]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const updated = await api("POST", `/courses/${activeCourseDetailId}/attendance/${btn.dataset.att}`, {});
      updateCourseInState(updated);
      renderAttendanceWidget(updated);
    });
  });
  const undoBtn = box.querySelector("[data-att-undo]");
  if (undoBtn) undoBtn.addEventListener("click", async () => {
    const updated = await api("POST", `/courses/${activeCourseDetailId}/attendance/present/undo`, {});
    updateCourseInState(updated);
    renderAttendanceWidget(updated);
  });
  const resetBtn = box.querySelector("[data-att-reset]");
  if (resetBtn) resetBtn.addEventListener("click", async () => {
    if (!confirm("?")) return;
    const updated = await api("POST", `/courses/${activeCourseDetailId}/attendance/reset`, {});
    updateCourseInState(updated);
    renderAttendanceWidget(updated);
  });
}

/* ================= FLASHCARDS ================= */
let activeStudyDeckId = null;
let studyCardIndex = 0;

function renderFlashcardDecks(course) {
  const list = document.getElementById("flashcard-decks-list");
  const decks = course.flashcardDecks || [];
  if (decks.length === 0) {
    list.innerHTML = `<div class="empty-state">${t("flashcards_no_decks")}</div>`;
    return;
  }
  list.innerHTML = decks
    .map((d) => `<div class="deck-row" data-deck="${d.id}">
      <div class="li-main">
        <span class="li-title">${d.name}</span>
        <span class="li-sub">${d.cards.length} cards</span>
      </div>
    </div>`)
    .join("");
  list.querySelectorAll("[data-deck]").forEach((el) => {
    el.addEventListener("click", () => openStudyDeck(course, el.dataset.deck));
  });
}

document.getElementById("new-deck-btn").addEventListener("click", async () => {
  const name = prompt(t("flashcards_new_deck") + ":");
  if (!name) return;
  const updated = await api("POST", `/courses/${activeCourseDetailId}/flashcard-decks`, { name, cards: [] });
  updateCourseInState(updated);
  renderFlashcardDecks(updated);
});

document.getElementById("generate-ai-deck-btn").addEventListener("click", () => {
  document.getElementById("ai-generate-form").classList.toggle("hidden");
});

document.getElementById("ai-generate-confirm-btn").addEventListener("click", async () => {
  const topic = document.getElementById("ai-topic-input").value.trim();
  const count = document.getElementById("ai-count-input").value;
  if (!topic) return showToast(t("toast_fill_title_date"));
  const btn = document.getElementById("ai-generate-confirm-btn");
  btn.disabled = true;
  try {
    const updated = await api("POST", `/courses/${activeCourseDetailId}/flashcard-decks/generate-ai`, { topic, count });
    updateCourseInState(updated);
    renderFlashcardDecks(updated);
    document.getElementById("ai-generate-form").classList.add("hidden");
    document.getElementById("ai-topic-input").value = "";
  } catch (err) {
    if (err.data && err.data.error === "no_api_key") showToast(t("flashcards_no_key"));
    else showToast(err.message);
  }
  btn.disabled = false;
});

function openStudyDeck(course, deckId) {
  const deck = (course.flashcardDecks || []).find((d) => d.id === deckId);
  if (!deck) return;
  activeStudyDeckId = deckId;
  studyCardIndex = 0;
  document.getElementById("study-deck-name").textContent = deck.name;
  renderStudyCard(course, deckId);
  openModal("modal-flashcards-study");
}

function renderStudyCard(course, deckId) {
  const deck = (course.flashcardDecks || []).find((d) => d.id === deckId);
  if (!deck || deck.cards.length === 0) {
    document.getElementById("flip-card-front").textContent = t("flashcards_no_decks");
    document.getElementById("flip-card-back").textContent = "";
    document.getElementById("flip-position").textContent = "0 / 0";
    return;
  }
  const card = deck.cards[studyCardIndex];
  const flipEl = document.getElementById("flip-card");
  flipEl.classList.remove("flipped");
  document.getElementById("flip-card-front").textContent = card.front;
  document.getElementById("flip-card-back").textContent = card.back;
  document.getElementById("flip-position").textContent = `${studyCardIndex + 1} / ${deck.cards.length}`;
}

document.getElementById("flip-card").addEventListener("click", () => {
  document.getElementById("flip-card").classList.toggle("flipped");
});

document.getElementById("flip-prev-btn").addEventListener("click", () => {
  const course = state.courses.find((c) => c.id === activeCourseDetailId);
  const deck = (course.flashcardDecks || []).find((d) => d.id === activeStudyDeckId);
  if (!deck) return;
  studyCardIndex = (studyCardIndex - 1 + deck.cards.length) % deck.cards.length;
  renderStudyCard(course, activeStudyDeckId);
});
document.getElementById("flip-next-btn").addEventListener("click", () => {
  const course = state.courses.find((c) => c.id === activeCourseDetailId);
  const deck = (course.flashcardDecks || []).find((d) => d.id === activeStudyDeckId);
  if (!deck) return;
  studyCardIndex = (studyCardIndex + 1) % deck.cards.length;
  renderStudyCard(course, activeStudyDeckId);
});

document.getElementById("delete-deck-btn").addEventListener("click", async () => {
  if (!confirm(t("delete_category_confirm"))) return;
  const updated = await api("DELETE", `/courses/${activeCourseDetailId}/flashcard-decks/${activeStudyDeckId}`);
  updateCourseInState(updated);
  renderFlashcardDecks(updated);
  closeModal();
});

document.getElementById("pdf-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !activeCourseDetailId) return;
  const formData = new FormData();
  formData.append("file", file);
  try {
    await api("POST", `/courses/${activeCourseDetailId}/resources`, formData, true);
    await renderCourseResources(activeCourseDetailId);
    showToast(t("toast_pdf_uploaded", { name: file.name }));
  } catch (err) {
    showToast(err.message);
  }
  e.target.value = "";
});

document.getElementById("delete-course-btn").addEventListener("click", async () => {
  if (!activeCourseDetailId) return;
  if (!confirm(t("delete_course_confirm"))) return;
  await api("DELETE", `/courses/${activeCourseDetailId}`);
  state.courses = state.courses.filter((c) => c.id !== activeCourseDetailId);
  closeModal();
  renderCourses();
  renderHome();
  renderTasks();
});

/* ================= NOTES (notebook) ================= */
let activeNoteId = null;

document.getElementById("new-note-btn").addEventListener("click", async () => {
  const note = await api("POST", "/notes");
  state.notes.unshift(note);
  renderNotes(note.id);
});

function renderNotes(selectId) {
  const list = document.getElementById("notes-list");
  const courseSelect = document.getElementById("note-course");
  courseSelect.innerHTML = courseOptionsHTML();

  if (state.notes.length === 0) {
    list.innerHTML = `<div class="empty-state">${t("empty_no_notes")}</div>`;
    document.getElementById("note-title").value = "";
    document.getElementById("note-content").value = "";
    activeNoteId = null;
    return;
  }

  const sorted = [...state.notes].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  if (!activeNoteId && !selectId) selectId = sorted[0].id;
  if (selectId) activeNoteId = selectId;

  renderNotesListOnly();

  const active = state.notes.find((n) => n.id === activeNoteId);
  if (active) {
    document.getElementById("note-title").value = active.title;
    document.getElementById("note-content").value = active.content;
    courseSelect.value = active.course_id || "";
  }
}

function renderNotesListOnly() {
  const list = document.getElementById("notes-list");
  const sorted = [...state.notes].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  list.innerHTML = sorted
    .map((n) => {
      const course = state.courses.find((c) => c.id === n.course_id);
      return `<div class="list-item ${n.id === activeNoteId ? "selected" : ""}" data-id="${n.id}">
        <div class="li-main">
          <span class="li-title">${n.title || "—"}</span>
          <span class="li-sub">${course ? course.name : t("no_course")}</span>
        </div>
      </div>`;
    })
    .join("");
  list.querySelectorAll(".list-item").forEach((el) => {
    el.addEventListener("click", () => renderNotes(el.dataset.id));
  });
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  const indicator = document.getElementById("save-indicator");
  indicator.textContent = t("note_save_saving");
  saveTimer = setTimeout(async () => {
    if (!activeNoteId) return;
    const title = document.getElementById("note-title").value;
    const content = document.getElementById("note-content").value;
    const courseId = document.getElementById("note-course").value;
    const updated = await api("PUT", `/notes/${activeNoteId}`, { title, content, courseId });
    const idx = state.notes.findIndex((n) => n.id === activeNoteId);
    if (idx !== -1) state.notes[idx] = updated;
    indicator.textContent = t("note_save_done");
    renderNotesListOnly();
    renderHome();
  }, 600);
}

document.getElementById("note-title").addEventListener("input", scheduleSave);
document.getElementById("note-content").addEventListener("input", scheduleSave);
document.getElementById("note-course").addEventListener("change", scheduleSave);

document.getElementById("delete-note-btn").addEventListener("click", async () => {
  if (!activeNoteId) return;
  if (!confirm(t("delete_note_confirm"))) return;
  await api("DELETE", `/notes/${activeNoteId}`);
  state.notes = state.notes.filter((n) => n.id !== activeNoteId);
  activeNoteId = null;
  renderNotes();
  renderHome();
});

/* ================= TASKS ================= */
document.getElementById("new-task-btn").addEventListener("click", () => {
  document.getElementById("task-title").value = "";
  document.getElementById("task-course").innerHTML = courseOptionsHTML();
  document.getElementById("task-type").value = "tema";
  document.getElementById("task-due-date").value = todayISO();
  openModal("modal-task");
});

document.getElementById("save-task-btn").addEventListener("click", async () => {
  const title = document.getElementById("task-title").value.trim();
  const due = document.getElementById("task-due-date").value;
  if (!title || !due) return showToast(t("toast_fill_title_date"));
  try {
    const task = await api("POST", "/tasks", {
      title,
      courseId: document.getElementById("task-course").value,
      type: document.getElementById("task-type").value,
      due
    });
    state.tasks.push(task);
    closeModal();
    renderTasks();
    renderHome();
    showToast(t("toast_task_added"));
  } catch (err) { showToast(err.message); }
});

function urgencyBadge(due, status) {
  if (status === "done") return `<span class="badge badge-done">${t("badge_done")}</span>`;
  const d = daysUntil(due);
  if (d < 0) return `<span class="badge badge-urgent">${t("badge_late")}</span>`;
  if (d === 0) return `<span class="badge badge-urgent">${t("badge_today")}</span>`;
  if (d <= 2) return `<span class="badge badge-soon">${t("badge_in_days", { d })}</span>`;
  return `<span class="badge badge-ok">${fmtDate(due)}</span>`;
}

function typeLabel(type) {
  const map = { tema: "task_type_homework", examen: "task_type_exam", proiect: "task_type_project", checklist: "task_type_checklist" };
  return t(map[type] || "task_type_homework");
}

function renderTasks() {
  const courseFilter = document.getElementById("task-filter-course");
  const currentFilterVal = courseFilter.value || "all";
  courseFilter.innerHTML =
    `<option value="all">${t("filter_all_courses")}</option>` +
    state.courses.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  courseFilter.value = currentFilterVal;

  const statusFilter = document.getElementById("task-filter-status").value;
  let list = [...state.tasks];
  if (courseFilter.value !== "all") list = list.filter((t2) => t2.course_id === courseFilter.value);
  if (statusFilter !== "all") list = list.filter((t2) => t2.status === statusFilter);
  list.sort((a, b) => new Date(a.due) - new Date(b.due));

  const box = document.getElementById("tasks-list");
  if (list.length === 0) {
    box.innerHTML = `<div class="empty-state">${t("no_tasks")}</div>`;
    return;
  }

  box.innerHTML = list
    .map((t2) => {
      const course = state.courses.find((c) => c.id === t2.course_id);
      const typeClass = ["tema", "examen", "proiect", "checklist"].includes(t2.type) ? t2.type : "tema";
      return `<div class="list-item" data-id="${t2.id}">
        <div class="task-type-strip type-${typeClass}"></div>
        <div class="task-checkbox ${t2.status === "done" ? "checked" : ""}" data-check="${t2.id}">${t2.status === "done" ? "✓" : ""}</div>
        <div class="li-main" style="flex:1">
          <span class="li-title" style="${t2.status === "done" ? "text-decoration:line-through;opacity:0.5;" : ""}">${t2.title}</span>
          <span class="li-sub">${course ? course.name : t("no_course")}${t2.source === "moodle" ? " · Moodle" : ""}</span>
        </div>
        <span class="type-tag type-${typeClass}">${typeLabel(t2.type)}</span>
        ${urgencyBadge(t2.due, t2.status)}
      </div>`;
    })
    .join("");

  box.querySelectorAll("[data-check]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.stopPropagation();
      const task = state.tasks.find((t2) => t2.id === el.dataset.check);
      const newStatus = task.status === "done" ? "todo" : "done";
      const updated = await api("PATCH", `/tasks/${task.id}`, { status: newStatus });
      const idx = state.tasks.findIndex((t2) => t2.id === task.id);
      state.tasks[idx] = updated;
      renderTasks();
      renderHome();
      if (updated.spAwardedNow && updated.spAwardedNow.gained) {
        state.wallet.balance = updated.spAwardedNow.balance;
        updateWalletPill();
        showToast(t("toast_task_sp_gained", { n: updated.spAwardedNow.gained }));
      }
    });
  });
}

document.getElementById("task-filter-course").addEventListener("change", renderTasks);
document.getElementById("task-filter-status").addEventListener("change", renderTasks);

/* ================= SYNC AUTOMAT MOODLE ================= */
document.getElementById("sync-moodle-btn").addEventListener("click", async () => {
  if (!state.user.moodle_ics_url) {
    showToast(t("toast_save_moodle_first"));
    return;
  }
  const btn = document.getElementById("sync-moodle-btn");
  btn.disabled = true;
  btn.textContent = t("toast_syncing");
  try {
    const result = await api("POST", "/tasks/sync-moodle", {});
    const tasks = await api("GET", "/tasks");
    state.tasks = tasks;
    renderTasks();
    renderHome();
    showToast(`${result.imported} / ${result.skipped || 0}`);
  } catch (err) {
    showToast(err.message);
  }
  btn.disabled = false;
  btn.textContent = t("sync_moodle_btn");
});

/* ================= IMPORT MANUAL ICS ================= */
document.getElementById("import-ics-btn").addEventListener("click", () => {
  document.getElementById("ics-paste").value = "";
  document.getElementById("ics-course").innerHTML = courseOptionsHTML();
  openModal("modal-ics");
});

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

document.getElementById("import-ics-confirm-btn").addEventListener("click", async () => {
  const raw = document.getElementById("ics-paste").value;
  if (!raw.includes("BEGIN:VEVENT")) return showToast(t("toast_invalid_ics"));
  const events = parseICS(raw);
  if (events.length === 0) return showToast(t("toast_no_events"));
  const courseId = document.getElementById("ics-course").value;
  try {
    const result = await api("POST", "/tasks/import-ics", { events, courseId });
    const tasks = await api("GET", "/tasks");
    state.tasks = tasks;
    closeModal();
    renderTasks();
    renderHome();
    showToast(t("toast_events_imported", { n: result.imported }));
  } catch (err) { showToast(err.message); }
});

/* ================= HOME ================= */
function renderCoursesCarousel() {
  const carousel = document.getElementById("home-courses-carousel");
  if (state.courses.length === 0) {
    carousel.innerHTML = `<div class="carousel-empty">${t("empty_no_courses")}</div>`;
    return;
  }
  carousel.innerHTML = state.courses
    .map((c, i) => {
      const noteCount = state.notes.filter((n) => n.course_id === c.id).length;
      const taskCount = state.tasks.filter((t2) => t2.course_id === c.id && t2.status !== "done").length;
      return `<div class="carousel-card" style="background:${courseGradient(c, i)}" data-id="${c.id}">
        <div class="cc-name">${c.name}</div>
        <div class="cc-prof">${c.professor || t("no_professor")}${c.period ? " · " + c.period : ""}</div>
        <div class="cc-meta"><span>📝 ${noteCount}</span><span>✅ ${taskCount}</span></div>
      </div>`;
    })
    .join("");
  carousel.querySelectorAll(".carousel-card").forEach((el) => {
    el.addEventListener("click", () => openCourseDetail(el.dataset.id));
  });
}

document.getElementById("courses-carousel-prev").addEventListener("click", () => {
  document.getElementById("home-courses-carousel").scrollBy({ left: -240, behavior: "smooth" });
});
document.getElementById("courses-carousel-next").addEventListener("click", () => {
  document.getElementById("home-courses-carousel").scrollBy({ left: 240, behavior: "smooth" });
});

function renderHome() {
  document.getElementById("home-date").textContent = new Date().toLocaleDateString(
    window.currentLang === "en" ? "en-GB" : "ro-RO",
    { weekday: "long", day: "numeric", month: "long" }
  );

  const firstName = state.user ? state.user.name.split(" ")[0] : "";
  const activeTasks = state.tasks.filter((t2) => t2.status !== "done");
  const dueSoon = activeTasks.filter((t2) => daysUntil(t2.due) <= 2 && daysUntil(t2.due) >= 0).length;

  document.getElementById("hero-greeting").textContent = `${t("greeting_hello")}, ${firstName}! 👋`;
  document.getElementById("hero-sub").textContent =
    dueSoon > 0
      ? (window.currentLang === "en"
        ? `You have ${dueSoon} deadline${dueSoon > 1 ? "s" : ""} in the next 2 days.`
        : `Ai ${dueSoon} deadline${dueSoon > 1 ? "-uri" : ""} în următoarele 2 zile.`)
      : t("hero_no_urgent");

  document.getElementById("hero-stats").innerHTML = `
    <div class="hero-stat"><strong>${state.courses.length}</strong><span>${t("stat_courses")}</span></div>
    <div class="hero-stat"><strong>${activeTasks.length}</strong><span>${t("stat_tasks")}</span></div>
    <div class="hero-stat"><strong>${state.notes.length}</strong><span>${t("stat_notes")}</span></div>
  `;

  checkDailyBonusAvailable();
  renderHomeSchedulePreview();
  renderCoursesCarousel();

  const upcoming = [...activeTasks].sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 5);
  const todayBox = document.getElementById("home-today-tasks");
  todayBox.innerHTML = upcoming.length
    ? upcoming
      .map((t2) => {
        const course = state.courses.find((c) => c.id === t2.course_id);
        return `<div class="list-item">
            <div class="li-main">
              <span class="li-title">${t2.title}</span>
              <span class="li-sub">${course ? course.name : t("no_course")}</span>
            </div>
            ${urgencyBadge(t2.due, t2.status)}
          </div>`;
      })
      .join("")
    : `<div class="empty-state">${t("empty_nothing_urgent")}</div>`;

  const notesBox = document.getElementById("home-recent-notes");
  const recentNotes = [...state.notes].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 3);
  notesBox.innerHTML = recentNotes.length
    ? recentNotes
      .map((n) => `<div class="list-item">
          <div class="li-main">
            <span class="li-title">${n.title || "—"}</span>
            <span class="li-sub">${new Date(n.updated_at).toLocaleDateString(window.currentLang === "en" ? "en-GB" : "ro-RO")}</span>
          </div>
        </div>`)
      .join("")
    : `<div class="empty-state">${t("empty_no_notes")}</div>`;
}

/* ================= GRADES (note ponderate + grafic evoluție) ================= */

function populateGradesCourseSelect() {
  const select = document.getElementById("grades-course-select");
  select.innerHTML = state.courses.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
  if (activeGradesCourseId && state.courses.some((c) => c.id === activeGradesCourseId)) {
    select.value = activeGradesCourseId;
  } else if (state.courses.length > 0) {
    activeGradesCourseId = state.courses[0].id;
    select.value = activeGradesCourseId;
  }
}

function computeWeightedAverage(course) {
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

function categoryAverage(course, categoryId) {
  const catGrades = (course.grades || []).filter((g) => g.categoryId === categoryId);
  if (catGrades.length === 0) return null;
  return catGrades.reduce((sum, g) => sum + (g.value / (g.maxValue || 10)) * 10, 0) / catGrades.length;
}

function renderGradesTab() {
  populateGradesCourseSelect();
  const emptyState = document.getElementById("grades-empty-state");
  const body = document.getElementById("grades-body");

  if (state.courses.length === 0) {
    emptyState.classList.remove("hidden");
    body.classList.add("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  body.classList.remove("hidden");
  renderGradesBody();
}

function computeAverageEvolution(course) {
  const categories = course.gradingCategories || [];
  if (categories.length === 0) return [];

  const gradeDate = (grade) =>
    grade.addedAt ||
    grade.added_at ||
    grade.addedat ||
    new Date().toISOString();

  const allGrades = (course.grades || [])
    .slice()
    .sort(
      (a, b) =>
        new Date(gradeDate(a)) -
        new Date(gradeDate(b))
    );

  if (allGrades.length === 0) return [];

  const points = [];
  const seenGradeIds = new Set();

  allGrades.forEach((grade) => {
    seenGradeIds.add(grade.id);

    let weightedSum = 0;
    let weightUsed = 0;

    categories.forEach((category) => {
      const categoryGrades = allGrades.filter(
        (item) =>
          item.categoryId === category.id &&
          seenGradeIds.has(item.id)
      );

      if (categoryGrades.length === 0) return;

      const categoryAverage =
        categoryGrades.reduce(
          (sum, item) =>
            sum +
            (item.value / (item.maxValue || 10)) * 10,
          0
        ) / categoryGrades.length;

      weightedSum += categoryAverage * category.weight;
      weightUsed += category.weight;
    });

    if (weightUsed > 0) {
      const date = gradeDate(grade);

      points.push({
        label: grade.label || fmtDate(date.slice(0, 10)),
        value: weightedSum / weightUsed
      });
    }
  });

  return points;
}
function renderGradesChart() {
  const course = state.courses.find((c) => c.id === activeGradesCourseId);
  const canvas = document.getElementById("grades-chart");
  const emptyState = document.getElementById("chart-empty-state");
  if (!course || typeof Chart === "undefined") return;

  const points = computeAverageEvolution(course);
  if (gradesChartInstance) {
    gradesChartInstance.destroy();
    gradesChartInstance = null;
  }

  if (points.length === 0) {
    canvas.classList.add("hidden");
    emptyState.classList.remove("hidden");
    return;
  }
  canvas.classList.remove("hidden");
  emptyState.classList.add("hidden");

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const textColor = isDark ? "#9294ab" : "#6b6d80";
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#5b5bf0";

  gradesChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: points.map((p) => p.label),
      datasets: [{
        label: t("weighted_average"),
        data: points.map((p) => p.value.toFixed(2)),
        borderColor: primaryColor,
        backgroundColor: primaryColor + "20",
        fill: true,
        tension: 0.35,
        pointBackgroundColor: primaryColor,
        pointRadius: 4,
        borderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 10, grid: { color: gridColor }, ticks: { color: textColor } },
        x: { grid: { display: false }, ticks: { color: textColor } }
      }
    }
  });
}

function renderGradesBody() {
  const course = state.courses.find((c) => c.id === activeGradesCourseId);
  if (!course) return;

  const avg = computeWeightedAverage(course);
  document.getElementById("grades-average").textContent = avg !== null ? avg.toFixed(2) : "—";

  const totalWeight = (course.gradingCategories || []).reduce((sum, c) => sum + c.weight, 0);
  const warningBox = document.getElementById("grades-weight-warning");
  if ((course.gradingCategories || []).length > 0) {
    warningBox.innerHTML =
      totalWeight === 100
        ? `<span class="weight-ok">${t("weight_total_warning")} 100% ✓</span>`
        : `<span class="weight-warning">${t("weight_total_warning")} ${totalWeight}%</span>`;
  } else {
    warningBox.innerHTML = "";
  }

  renderGradesChart();

  const list = document.getElementById("categories-list");
  if ((course.gradingCategories || []).length === 0) {
    list.innerHTML = `<div class="empty-state">${t("no_categories_yet")}</div>`;
    return;
  }

  list.innerHTML = course.gradingCategories
    .map((cat) => {
      const catGrades = (course.grades || []).filter((g) => g.categoryId === cat.id);
      const catAvg = categoryAverage(course, cat.id);
      return `<div class="category-card">
        <div class="category-card-head">
          <div class="category-card-title">
            <strong>${cat.name}</strong>
            <span>${cat.weight}%</span>
          </div>
          <div class="category-actions">
            <button class="btn-icon" data-del-cat="${cat.id}" title="Delete">🗑</button>
          </div>
        </div>
        ${catAvg !== null ? `<div class="category-avg">${t("weighted_average")}: <strong>${catAvg.toFixed(2)}</strong></div>` : ""}
        <div class="grades-mini-list">
          ${catGrades
          .map(
            (g) => `<div class="grade-row">
                <span>${g.label || "—"}</span>
                <span class="gr-value">${g.value}/${g.maxValue}</span>
                <span class="gr-remove" data-del-grade="${g.id}">✕</span>
              </div>`
          )
          .join("")}
        </div>
        <button class="btn btn-secondary add-grade-inline-btn" data-add-grade="${cat.id}">${t("add_grade_btn")}</button>
      </div>`;
    })
    .join("");

  list.querySelectorAll("[data-del-cat]").forEach((el) => {
    el.addEventListener("click", async () => {
      if (!confirm(t("delete_category_confirm"))) return;
      const updated = await api("DELETE", `/courses/${course.id}/grading-categories/${el.dataset.delCat}`);
      updateCourseInState(updated);
      renderGradesBody();
    });
  });
  list.querySelectorAll("[data-del-grade]").forEach((el) => {
    el.addEventListener("click", async () => {
      const updated = await api("DELETE", `/courses/${course.id}/grades/${el.dataset.delGrade}`);
      updateCourseInState(updated);
      renderGradesBody();
    });
  });
  list.querySelectorAll("[data-add-grade]").forEach((el) => {
    el.addEventListener("click", () => {
      activeCategoryIdForGrade = el.dataset.addGrade;
      document.getElementById("grade-label").value = "";
      document.getElementById("grade-value").value = "";
      document.getElementById("grade-max").value = "10";
      openModal("modal-grade");
    });
  });
}

function updateCourseInState(updatedCourse) {
  const idx = state.courses.findIndex((c) => c.id === updatedCourse.id);
  if (idx !== -1) state.courses[idx] = updatedCourse;
}

document.getElementById("grades-course-select").addEventListener("change", (e) => {
  activeGradesCourseId = e.target.value;
  renderGradesBody();
});

document.getElementById("add-category-btn").addEventListener("click", () => {
  document.getElementById("category-name").value = "";
  document.getElementById("category-weight").value = "";
  openModal("modal-category");
});

document.getElementById("save-category-btn").addEventListener("click", async () => {
  const name = document.getElementById("category-name").value.trim();
  const weight = Number(document.getElementById("category-weight").value);
  if (!name || !weight || weight <= 0) return showToast(t("toast_fill_title_date"));
  try {
    const updated = await api("POST", `/courses/${activeGradesCourseId}/grading-categories`, { name, weight });
    updateCourseInState(updated);
    closeModal();
    renderGradesBody();
  } catch (err) { showToast(err.message); }
});

document
  .getElementById("save-grade-btn")
  .addEventListener("click", async () => {
    const label = document
      .getElementById("grade-label")
      .value
      .trim();

    const value = Number(
      document.getElementById("grade-value").value
    );

    const maxValue =
      Number(document.getElementById("grade-max").value) || 10;

    if (!Number.isFinite(value)) {
      return showToast(t("toast_fill_title_date"));
    }

    if (
      !Number.isFinite(maxValue) ||
      maxValue <= 0 ||
      value < 0 ||
      value > maxValue
    ) {
      return showToast(
        `Nota trebuie să fie între 0 și ${maxValue}.`
      );
    }

    try {
      const updated = await api(
        "POST",
        `/courses/${activeGradesCourseId}/grades`,
        {
          categoryId: activeCategoryIdForGrade,
          label,
          value,
          maxValue
        }
      );

      updateCourseInState(updated);
      closeModal();
      renderGradesBody();
    } catch (err) {
      showToast(err.message);
    }
  });

/* ================= SUMMARY (rezumat pe perioadă) ================= */
async function renderSummaryTab() {
  const emptyState = document.getElementById("summary-empty-state");
  const body = document.getElementById("summary-body");
  let periods;
  try {
    periods = await api("GET", "/summary/periods");
  } catch (err) {
    showToast(err.message);
    return;
  }

  const withPeriod = periods.filter((p) => p.period && p.period !== "—");
  if (withPeriod.length === 0) {
    emptyState.classList.remove("hidden");
    body.innerHTML = "";
    return;
  }
  emptyState.classList.add("hidden");

  body.innerHTML = withPeriod
    .map((p) => {
      const avgText = p.overallAverage !== null ? p.overallAverage.toFixed(2) : t("no_average_yet");
      return `<div class="period-card">
        <div class="period-card-head">
          <h3>${p.period}</h3>
          <div>
            <span class="muted">${t("overall_average_label")}: </span>
            <span class="period-overall-avg">${avgText}</span>
          </div>
        </div>
        <div class="muted" style="margin-bottom:10px">${p.courses.length} ${t("courses_in_period")}</div>
        ${p.courses
          .map(
            (c) => `<div class="period-course-row">
              <div class="pcr-name"><span class="pcr-dot" style="background:${c.color}"></span>${c.name}</div>
              <div class="${c.average !== null ? "pcr-avg" : "pcr-avg no-avg"}">${c.average !== null ? c.average.toFixed(2) : t("no_average_yet")}</div>
            </div>`
          )
          .join("")}
      </div>`;
    })
    .join("");
}

/* ================= REMINDERS (configurabile din Setări) ================= */
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function hoursUntil(due) {
  const target = new Date(due + "T23:59:59");
  return (target - new Date()) / 3600000;
}

function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!state.user) return;
  const thresholds = state.user.reminder_hours_before || [24, 1];

  state.tasks
    .filter((t2) => t2.status !== "done")
    .forEach((t2) => {
      const hoursLeft = hoursUntil(t2.due);
      thresholds.forEach((threshold) => {
        const key = `notified_${t2.id}_${threshold}`;
        if (hoursLeft <= threshold && hoursLeft > threshold - 1 && !sessionStorage.getItem(key)) {
          new Notification("Deadline", { body: `${t2.title} — ~${threshold}h` });
          sessionStorage.setItem(key, "1");
        }
      });
    });
}
setInterval(checkReminders, 60000);

/* ================= INIT ================= */
function renderAll() {
  renderHome();
  renderNotes();
  renderCourses();
  renderTasks();
  renderSchedule();
  const gradesTab = document.getElementById("tab-grades");
  if (gradesTab.classList.contains("active")) renderGradesTab();
  const summaryTab = document.getElementById("tab-summary");
  if (summaryTab.classList.contains("active")) renderSummaryTab();
}
const params = new URLSearchParams(window.location.search);

if (params.get("authError") === "invalid_alpha") {
  const errorBox = document.getElementById("oauth-error");

  errorBox.textContent = t("alpha_code_invalid");
  errorBox.classList.remove("hidden");

  window.history.replaceState({}, "", window.location.pathname);
}
(async function init() {
  consumeGoogleRedirectToken();
  if (token) {
    await bootstrapApp();
  } else {
    loginScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
})();
