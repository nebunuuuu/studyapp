/* StudyApp Orbit UI. Load AFTER app.js. Presentation-only, no API writes. */
(() => {
  "use strict";
  if (window.__studyOrbitUI) return;
  window.__studyOrbitUI = true;
  const $ = (selector, root = document) => root.querySelector(selector);
  const app = $("#app");
  const content = $("#swipe-area");
  const home = $("#tab-home");
  if (!app || !content || !home) return;

  const strings = {
    ro: { kicker: "SPAȚIUL TĂU DE STUDIU", home: "Ziua ta, în echilibru.", menu: "Explorează", task: "Task nou", note: "Notiță nouă", course: "Materie nouă", openMenu: "Deschide meniul", controls: "Acțiuni rapide", close: "Închide meniul" },
    en: { kicker: "YOUR STUDY SPACE", home: "Your day, in balance.", menu: "Explore", task: "New task", note: "New note", course: "New subject", openMenu: "Open menu", controls: "Quick actions", close: "Close menu" }
  };
  const lang = () => window.currentLang === "en" ? "en" : "ro";
  const heading = document.createElement("div");

heading.className = "workspace-heading";

heading.innerHTML = `
  <div>
    <div class="workspace-kicker"></div>
    <h2 class="workspace-title"></h2>
  </div>

  <div class="workspace-mark" aria-hidden="true">
    ✦
  </div>
`;

content.prepend(heading);
const hero = $(".hero-card", home);
  

  const actions = document.createElement("div");
  actions.className = "quick-actions";
  actions.setAttribute("role", "group");
  const actionSpecs = [
    { key: "task", icon: "+", tab: "tasks", target: "new-task-btn" },
    { key: "note", icon: "✎", tab: "notes", target: "new-note-btn" },
    { key: "course", icon: "▤", tab: "courses", target: "new-course-btn" }
  ];
  for (const spec of actionSpecs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-action";
    button.dataset.uiLabel = spec.key;
    const icon = document.createElement("span");
    icon.className = "quick-action-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = spec.icon;
    const label = document.createElement("span");
    label.className = "quick-action-label";
    button.append(icon, label);
    button.addEventListener("click", () => {
      const original = document.getElementById(spec.target);
      if (!original || original.disabled) return;
      if (typeof window.switchTab === "function") window.switchTab(spec.tab);
      else $( '.sidebar-nav [data-tab="' + spec.tab + '"]')?.click();
      original.click();
    });
    actions.append(button);
  }
  if (hero) hero.after(actions);
  else home.prepend(actions);

  // Recompose the existing dashboard, without duplicating live-data elements.
  const scheduleCard = $(".schedule-preview-card", home);
  const taskList = $("#home-today-tasks", home);
  const taskCard = taskList?.closest(".card");
  if (scheduleCard && taskCard) {
    const focus = document.createElement("div");
    focus.className = "home-focus-grid";
    const coursesSection = $(".section-block", home);
    if (coursesSection) home.insertBefore(focus, coursesSection);
    else actions.after(focus);
    focus.append(scheduleCard, taskCard);
  }
  const remainingBento = $(".bento-grid", home);
  if (remainingBento?.children.length === 1) remainingBento.style.gridTemplateColumns = "minmax(0,1fr)";

  const sidebar = $(".sidebar");
  const nav = $(".sidebar-nav");
  let caption = null;
  if (nav) {
    caption = document.createElement("p");
    caption.className = "sidebar-caption";
    nav.before(caption);
  }
  const dock = $(".tabbar");
  if (dock) dock.classList.add("ui-dock-ready");
  const mobileLogo = $("#logo-home-topbar");
  mobileLogo?.setAttribute("aria-controls", "study-orbit-sidebar");
  if (sidebar) sidebar.id = sidebar.id || "study-orbit-sidebar";
  if (mobileLogo && sidebar) mobileLogo.setAttribute("aria-controls", sidebar.id);

  let scheduled = false;
  function refreshPresentation() {
    scheduled = false;
    const t = strings[lang()];
    $(".workspace-kicker", heading).textContent = t.kicker;
    const current = $(".tab.active", content);
    const tab = current?.id?.replace(/^tab-/, "") || "home";
    heading.classList.toggle("workspace-heading-home", tab === "home");
    const sourceLabel = $('.sidebar-nav [data-tab="' + tab + '"] small');
    const originalTitle = current
  ?.querySelector(".page-header .page-title")
  ?.textContent
  ?.trim();

const title = tab === "home"
  ? t.home
  : (originalTitle || sourceLabel?.textContent?.trim());
    $(".workspace-title", heading).textContent = title || "StudyApp";
    if (caption) caption.textContent = t.menu;
    actions.setAttribute("aria-label", t.controls);
    for (const button of actions.children) {
      $(".quick-action-label", button).textContent = t[button.dataset.uiLabel];
    }
    if (dock) {
      const buttons = Array.from(dock.querySelectorAll(".tab-btn"));
      const index = buttons.findIndex(button => button.dataset.tab === tab);
      dock.style.setProperty("--dock-visible", index < 0 ? "0" : "1");
      if (index >= 0) dock.style.setProperty("--dock-index", String(index));
    }
    document.querySelectorAll(".sidebar-nav .tab-btn,.tabbar .tab-btn").forEach(button => {
      if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (mobileLogo && sidebar) {
      const opened = sidebar.classList.contains("mobile-open");
      mobileLogo.setAttribute("aria-expanded", String(opened));
      mobileLogo.setAttribute("aria-label", opened ? t.close : t.openMenu);
    }
  }
  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refreshPresentation);
  }
  // Observe only navigation state and language, not every task/chart mutation.
  const observer = new MutationObserver(scheduleRefresh);
  content.querySelectorAll(".tab").forEach(tab => observer.observe(tab, { attributes: true, attributeFilter: ["class"] }));
  if (sidebar) observer.observe(sidebar, { attributes: true, attributeFilter: ["class"] });
  if (nav) observer.observe(nav, { childList: true, subtree: true, characterData: true });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  refreshPresentation();

  const timers = new WeakMap();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.addEventListener("pointerdown", event => {
    if (reduced.matches || event.button !== 0) return;
    const control = event.target.closest(".btn,.btn-icon,.arrow-btn,.quick-action,.schedule-filter-btn");
    if (!control || control.disabled) return;
    const rect = control.getBoundingClientRect();
    control.style.setProperty("--tap-x", (event.clientX - rect.left) + "px");
    control.style.setProperty("--tap-y", (event.clientY - rect.top) + "px");
    control.classList.remove("ui-tap");
    clearTimeout(timers.get(control));
    requestAnimationFrame(() => {
      control.classList.add("ui-tap");
      timers.set(control, setTimeout(() => control.classList.remove("ui-tap"), 650));
    });
  }, { passive: true });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !sidebar?.classList.contains("mobile-open")) return;
    sidebar.classList.remove("mobile-open");
    mobileLogo?.focus();
  });
  function startOrbitalMotion() 
})();
