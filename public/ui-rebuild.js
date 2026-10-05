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
  document.querySelectorAll(".modal").forEach(modal => {
    if (
      modal.id === "modal-onboarding" ||
      modal.querySelector(".modal-close-btn")
    ) {
      return;
    }

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "modal-close-btn";
    closeButton.dataset.closeModal = "";
    closeButton.setAttribute("aria-label", "Închide");
    closeButton.setAttribute("title", "Închide");
    closeButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6 18 18M18 6 6 18"></path>
    </svg>
  `;
    closeButton.addEventListener("click", () => {
      const overlay = document.getElementById("modal-overlay");

      modal.classList.add("hidden");
      overlay?.classList.add("hidden");
    });
    modal.prepend(closeButton);
  });
  function orbitGraphic(sizeClass = "") {
    return `
    <svg
      class="orbit-svg ${sizeClass}"
      viewBox="0 0 240 240"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="study-orbit-core" cx="35%" cy="30%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="35%" stop-color="var(--accent)" stop-opacity="0.95" />
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.96" />
        </radialGradient>
      </defs>

      <g class="orbit-paths">
        <ellipse
          class="orbit-path orbit-path-a"
          cx="120"
          cy="120"
          rx="101"
          ry="39"
          pathLength="100"
          transform="rotate(-27 120 120)"
        />
        <ellipse
          class="orbit-path orbit-path-b"
          cx="120"
          cy="120"
          rx="84"
          ry="46"
          pathLength="100"
          transform="rotate(38 120 120)"
        />
      </g>

      <circle
        class="orbit-core-svg"
        cx="120"
        cy="120"
        r="29"
        fill="url(#study-orbit-core)"
      />

      <circle class="orbit-dot orbit-dot-a" cx="29" cy="96" r="4.4">
        <animateMotion
          dur="13s"
          repeatCount="indefinite"
          rotate="auto"
          path="M120,120 m-101,0 a101,39 0 1,0 202,0 a101,39 0 1,0 -202,0"
        />
      </circle>

      <circle class="orbit-dot orbit-dot-b" cx="197" cy="140" r="3.5">
        <animateMotion
          dur="18s"
          repeatCount="indefinite"
          rotate="auto"
          path="M120,120 m-84,0 a84,46 0 1,1 168,0 a84,46 0 1,1 -168,0"
        />
      </circle>
    </svg>
  `;
  }
  function homeNavIcon() {
    return `
    <svg
      class="study-nav-svg study-nav-home-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        class="study-nav-stroke"
        d="M3.6 10.6 12 3.8l8.4 6.8v8.1a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8v-8.1Z"
      />
      <path
        class="study-nav-stroke"
        d="M9.2 20.5v-5.7a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2v5.7"
      />
      <circle class="study-nav-core" cx="16.8" cy="7.4" r="1.6" />
      <path
        class="study-nav-orbit"
        d="M13.8 7.4c0-1.45 1.34-2.62 3-2.62s3 1.17 3 2.62-1.34 2.62-3 2.62-3-1.17-3-2.62Z"
      />
    </svg>
  `;
  }
  function coursesNavIcon() {
    return `
    <svg
      class="study-nav-svg study-nav-courses-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        class="study-nav-connector"
        d="M7.2 8.1h4.2M7.2 15.9h4.2M13 8.1l3.8 3.9M13 15.9l3.8-3.9"
      />

      <rect
        class="study-nav-module study-nav-module-a"
        x="3.2"
        y="5"
        width="6.2"
        height="6.2"
        rx="1.8"
      />

      <rect
        class="study-nav-module study-nav-module-b"
        x="3.2"
        y="12.8"
        width="6.2"
        height="6.2"
        rx="1.8"
      />

      <rect
        class="study-nav-module study-nav-module-c"
        x="14.2"
        y="8.9"
        width="6.4"
        height="6.4"
        rx="1.8"
      />

      <path
        class="study-nav-module-line"
        d="M5.2 8.1h2.2M5.2 15.9h2.2M16.2 12.1h2.4"
      />

      <circle class="study-nav-module-dot" cx="19.2" cy="19.1" r="1.25" />
    </svg>
  `;
  }

  function scheduleNavIcon() {
    return `
    <svg
      class="study-nav-svg study-nav-schedule-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        class="study-nav-calendar"
        x="3.3"
        y="4.9"
        width="17.4"
        height="15.3"
        rx="3"
      />
      <path class="study-nav-stroke" d="M7.4 3.2v3.4M16.6 3.2v3.4M3.3 9.1h17.4" />
      <path class="study-nav-schedule-row" d="M7 12.5h3.1M13.7 12.5h3.3M7 16.3h3.1M13.7 16.3h3.3" />
      <path class="study-nav-scan" d="M5.4 10.8h13.2" />
      <circle class="study-nav-calendar-dot" cx="17.1" cy="16.3" r="1.25" />
    </svg>
  `;
  }
  function notesNavIcon() {
    return `
    <svg
      class="study-nav-svg study-nav-notes-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        class="study-nav-note-sheet"
        d="M6.2 3.5h8.4l3.2 3.2v13.1a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7V5.2a1.7 1.7 0 0 1 1.7-1.7Z"
      />
      <path class="study-nav-note-fold" d="M14.6 3.5v3.2h3.2" />
      <path class="study-nav-note-lines" d="M8 10h6.9M8 13.2h6.9M8 16.4h4.4" />
      <circle class="study-nav-note-dot" cx="17.3" cy="17.7" r="1.3" />
    </svg>
  `;
  }

  function tasksNavIcon() {
    return `
    <svg
      class="study-nav-svg study-nav-tasks-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        class="study-nav-task-ring"
        d="M12 3.4a8.6 8.6 0 1 1-8.6 8.6A8.6 8.6 0 0 1 12 3.4Z"
      />
      <path class="study-nav-task-check" d="m7.8 12.2 2.8 2.8 5.8-6.2" />
      <circle class="study-nav-task-dot" cx="18.2" cy="6.1" r="1.25" />
    </svg>
  `;
  }

  function summaryNavIcon() {
    return `
    <svg
      class="study-nav-svg study-nav-summary-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path class="study-nav-summary-axis" d="M4.3 19.6h15.4M5 18.8V5.3" />
      <rect class="study-nav-summary-bar study-nav-summary-bar-a" x="7.2" y="13.1" width="2.8" height="5.7" rx="1.1" />
      <rect class="study-nav-summary-bar study-nav-summary-bar-b" x="11.2" y="9.5" width="2.8" height="9.3" rx="1.1" />
      <rect class="study-nav-summary-bar study-nav-summary-bar-c" x="15.2" y="6.3" width="2.8" height="12.5" rx="1.1" />
      <path class="study-nav-summary-line" d="m6.1 12.1 3.1-2.2 3.5 1.4 5.3-5" />
      <circle class="study-nav-summary-dot" cx="18.1" cy="6.3" r="1.25" />
    </svg>
  `;
  }
  function studyPointsIcon() {
  return `
    <svg
      class="sp-orbit-svg"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="sp-core-gradient" cx="34%" cy="28%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
          <stop offset="42%" stop-color="var(--accent)" stop-opacity="0.96" />
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="1" />
        </radialGradient>
      </defs>

      <ellipse
        class="sp-orbit-ring sp-orbit-ring-a"
        cx="16"
        cy="16"
        rx="13"
        ry="5.2"
        transform="rotate(-25 16 16)"
      />
      <ellipse
        class="sp-orbit-ring sp-orbit-ring-b"
        cx="16"
        cy="16"
        rx="11.4"
        ry="6.5"
        transform="rotate(35 16 16)"
      />

      <circle
        class="sp-core"
        cx="16"
        cy="16"
        r="5.1"
        fill="url(#sp-core-gradient)"
      />

      <circle class="sp-orbit-dot" r="1.45">
        <animateMotion
          dur="7s"
          repeatCount="indefinite"
          path="M16,16 m-13,0 a13,5.2 0 1,0 26,0 a13,5.2 0 1,0 -26,0"
        />
      </circle>
    </svg>
  `;
}


  document.querySelectorAll(".logo-link").forEach(logo => {
    if (logo.querySelector(".orbit-logo")) return;

    const mark = document.createElement("span");
    mark.className = "orbit-logo";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = orbitGraphic("orbit-svg-small");

    const oldIcon = logo.querySelector(".logo-sm");
    if (oldIcon) oldIcon.replaceWith(mark);
    else logo.prepend(mark);
  });
  const loginBrandMark = document.querySelector(".login-brand-mark");

  if (loginBrandMark) {
    loginBrandMark.innerHTML = orbitGraphic("orbit-svg-small");
  }
  const walletIcon = document.querySelector("#wallet-pill .wallet-icon");

if (walletIcon) {
  walletIcon.classList.add("sp-wallet-icon");
  walletIcon.innerHTML = studyPointsIcon();
}
  document
    .querySelectorAll('.tab-btn[data-tab="home"] > span:first-child')
    .forEach(iconSlot => {
      if (iconSlot.dataset.studyIcon === "home") return;

      iconSlot.dataset.studyIcon = "home";
      iconSlot.classList.add("study-nav-icon");
      iconSlot.innerHTML = homeNavIcon();
    });
  const customNavIcons = {
    notes: notesNavIcon,
    courses: coursesNavIcon,
    tasks: tasksNavIcon,
    summary: summaryNavIcon,
    schedule: scheduleNavIcon
  };

  Object.entries(customNavIcons).forEach(([tab, iconFactory]) => {
    document
      .querySelectorAll(`.tab-btn[data-tab="${tab}"] > span:first-child`)
      .forEach(iconSlot => {
        if (iconSlot.dataset.studyIcon === tab) return;

        iconSlot.dataset.studyIcon = tab;
        iconSlot.classList.add("study-nav-icon");
        iconSlot.innerHTML = iconFactory();
      });
  });

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
      else $('.sidebar-nav [data-tab="' + spec.tab + '"]')?.click();
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
})();
