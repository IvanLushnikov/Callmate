import { login as apiLogin, logout as apiLogout } from "./api.js";

/** Канон статусов контакта (DESIGN-062). */
const STATUS = {
  in_progress: "в_процессе",
  done: "завершённые_темы",
  no_answer: "недозвон",
  cancel: "отмена",
};

const STATUS_LABEL = {
  [STATUS.in_progress]: "В процессе",
  [STATUS.done]: "Завершён",
  [STATUS.no_answer]: "Недозвон",
  [STATUS.cancel]: "Отмена",
};

/** FE-070 / DESIGN-079 */
const ERROR_BY_CODE = {
  auth_failed: "Неверный логин или пароль",
  insufficient_balance: "Недостаточно средств",
  company_locked: "Аккаунт заблокирован",
  sip_error: "Не удалось подключить телефонию",
  validation: "Проверьте поля",
  server: "Что-то пошло не так. Попробуйте ещё раз",
  sip_auth_failed: "Не приняли логин или пароль. Проверьте данные",
  sip_network: "Нет связи с сервером телефонии. Проверьте адрес и сеть",
  sip_rejected: "Сервер телефонии отклонил подключение",
  sip_unknown: "Не удалось подключить телефонию. Попробуйте ещё раз",
};

const DAYS = [
  { id: "mon", label: "Пн" },
  { id: "tue", label: "Вт" },
  { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" },
  { id: "fri", label: "Пт" },
  { id: "sat", label: "Сб" },
  { id: "sun", label: "Вс" },
];

const TIMEZONES = [
  "Europe/Moscow",
  "Europe/Samara",
  "Asia/Yekaterinburg",
  "Asia/Novosibirsk",
  "Asia/Vladivostok",
];

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureCompanyIds(list) {
  let changed = false;
  const out = list.map((c, i) => {
    if (c.id) return c;
    changed = true;
    return {
      ...c,
      id: `co-${i + 1}-${Date.now()}`,
      balance: c.balance ?? 0,
      history: c.history || [],
    };
  });
  if (changed) saveJson("cm_companies", out);
  return out;
}

const state = {
  session: localStorage.getItem("cm_session") || "",
  role: localStorage.getItem("cm_role") || "",
  theme: localStorage.getItem("cm_theme") || "light",
  companyLocked: localStorage.getItem("cm_locked") === "1",
  impersonate: loadJson("cm_impersonate", null),
  companies: ensureCompanyIds(loadJson("cm_companies", [])),
  campaigns: loadJson("cm_campaigns", []),
  telephony: loadJson("cm_telephony", {
    status: "unknown",
    provider: null,
    lines: null,
    sipSaved: false,
    lastError: null,
    checking: false,
  }),
  companyBalance: Number(localStorage.getItem("cm_co_balance") || "500"),
  companyTariff: Number(localStorage.getItem("cm_co_tariff") || "5"),
  uiFlash: null,
};

function persistCampaigns() {
  saveJson("cm_campaigns", state.campaigns);
}

function persistCompanies() {
  saveJson("cm_companies", state.companies);
}

function persistTelephony() {
  saveJson("cm_telephony", state.telephony);
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem("cm_theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}

function route() {
  return (location.hash || "#/login").replace(/^#/, "") || "/login";
}

function navigate(path) {
  location.hash = path.startsWith("#") ? path : `#${path}`;
}

function matchPath(path, pattern) {
  const pp = pattern.split("/").filter(Boolean);
  const ps = path.split("/").filter(Boolean);
  if (pp.length !== ps.length) return null;
  const params = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) params[pp[i].slice(1)] = decodeURIComponent(ps[i]);
    else if (pp[i] !== ps[i]) return null;
  }
  return params;
}

function campaignById(id) {
  return state.campaigns.find((c) => String(c.id) === String(id));
}

function companyById(id) {
  return state.companies.find((c) => String(c.id) === String(id));
}

function dialLabel(stateName) {
  if (stateName === "running") return "Идёт обзвон";
  if (stateName === "stopped") return "Остановлен";
  if (stateName === "paused") return "На паузе";
  return "Черновик";
}

function statusLabel(code) {
  return STATUS_LABEL[code] || code || "—";
}

function isStarted(camp) {
  return camp && camp.dial_state && camp.dial_state !== "draft";
}

function isWeakScenario(camp) {
  const goal = (camp?.goal || "").trim();
  const details = (camp?.details || "").trim();
  const greeting = (camp?.preview?.greeting || "").trim();
  return !goal || details.length < 8 || !greeting;
}

function flash(msg, kind = "ok") {
  state.uiFlash = { msg, kind, at: Date.now() };
}

function flashHtml() {
  if (!state.uiFlash) return "";
  const cls = state.uiFlash.kind === "error" ? "error" : "hint ok-line";
  return `<p class="${cls}" id="ui-flash">${escapeHtml(state.uiFlash.msg)}</p>`;
}

function clearFlashSoon() {
  if (!state.uiFlash) return;
  const at = state.uiFlash.at;
  setTimeout(() => {
    if (state.uiFlash && state.uiFlash.at === at) {
      state.uiFlash = null;
      const el = document.getElementById("ui-flash");
      if (el) el.remove();
    }
  }, 3500);
}

function locked() {
  return state.companyLocked && !state.impersonate;
}

function roAttr() {
  return locked() ? "disabled" : "";
}

/* ---------- shells ---------- */

function themeControls() {
  return `<div class="theme-switch">
    <button class="btn secondary" data-theme-set="light" type="button">Светлая</button>
    <button class="btn secondary" data-theme-set="dark" type="button">Тёмная</button>
  </div>`;
}

function lockedBanner() {
  if (!state.companyLocked || state.impersonate) return "";
  return `<div class="banner banner-danger">
    <strong>Аккаунт заблокирован. Можно смотреть, менять и запускать нельзя</strong>
    <p class="hint">Чтобы снять блокировку, напишите в поддержку CallMate</p>
  </div>`;
}

function impersonateBanner() {
  if (!state.impersonate) return "";
  const name = state.impersonate.name || "";
  return `<div class="banner banner-info">
    <strong>Вы в кабинете «${escapeHtml(name)}» как суперадмин</strong>
    <button class="btn secondary" type="button" id="exit-impersonate">Выйти в админку</button>
  </div>`;
}

function cabinetShell(path) {
  const item = (href, label) =>
    `<a href="#${href}" class="${path.startsWith(href) ? "active" : ""}">${label}</a>`;
  return `<div class="app-shell">
    <aside class="sidebar">
      <p class="brand">CallMate</p>
      <nav class="nav">
        ${item("/cabinet/campaigns", "Кампании")}
        ${item("/cabinet/telephony", "Телефония")}
        ${item("/cabinet/statuses", "Статусы")}
        ${item("/cabinet/analytics", "Аналитика")}
      </nav>
      ${themeControls()}
      <p class="hint desktop-note">Удобнее на компьютере. Телефонную вёрстку сделаем позже</p>
    </aside>
    <main class="main">
      <div class="topbar">
        <h1>${titleFor(path)}</h1>
        <button class="btn secondary" id="logout" type="button">Выйти</button>
      </div>
      ${impersonateBanner()}
      ${lockedBanner()}
      ${flashHtml()}
      ${cabinetContent(path)}
    </main>
  </div>`;
}

function adminShell(path) {
  return `<div class="app-shell">
    <aside class="sidebar">
      <p class="brand">CallMate · Админка</p>
      <nav class="nav">
        <a href="#/admin/companies" class="${path.startsWith("/admin/companies") ? "active" : ""}">Компании</a>
        <a href="#/admin/settings" class="${path.startsWith("/admin/settings") ? "active" : ""}">Настройки продукта</a>
      </nav>
      ${themeControls()}
    </aside>
    <main class="main">
      <div class="topbar">
        <h1>${adminTitle(path)}</h1>
        <button class="btn secondary" id="logout" type="button">Выйти</button>
      </div>
      ${flashHtml()}
      ${adminContent(path)}
    </main>
  </div>`;
}

function adminTitle(path) {
  if (path.startsWith("/admin/settings")) return "Настройки продукта";
  if (matchPath(path, "/admin/companies/:id/topup")) return "Пополнить баланс";
  if (matchPath(path, "/admin/companies/:id")) return "Компания";
  if (path === "/admin/companies/new") return "Создать компанию";
  return "Компании";
}

function titleFor(path) {
  if (path.includes("telephony")) return "Телефония";
  if (path.includes("statuses")) return "Статусы";
  if (path.includes("analytics")) return "Аналитика";
  if (path.includes("_checklist")) return "Чеклист выпуска";
  return "Кампании";
}

/* ---------- admin ---------- */

function adminContent(path) {
  if (path === "/admin/companies/new") return adminNewCompany();
  if (path.startsWith("/admin/settings")) return adminSettings();
  const topup = matchPath(path, "/admin/companies/:id/topup");
  if (topup) return adminTopUp(topup.id);
  const card = matchPath(path, "/admin/companies/:id");
  if (card) return adminCompanyCard(card.id);
  return adminCompanyList();
}

function adminCompanyList() {
  if (!state.companies.length) {
    return `<div class="panel">
      <p>Пока нет компаний</p>
      <a class="btn" href="#/admin/companies/new" style="display:inline-block">Создать компанию</a>
    </div>`;
  }
  const rows = state.companies
    .map((c) => {
      const access = c.access_status === "locked" ? "Заблокирована" : "Активна";
      const tariff = c.price_per_minute != null ? c.price_per_minute : "—";
      return `<tr>
        <td><a href="#/admin/companies/${encodeURIComponent(c.id)}">${escapeHtml(c.name)}</a></td>
        <td>${access}</td>
        <td>${escapeHtml(c.created_at || "")}</td>
        <td>Тариф за минуту: ${escapeHtml(String(tariff))}</td>
      </tr>`;
    })
    .join("");
  return `<div class="panel wide">
    <a class="btn" href="#/admin/companies/new" style="display:inline-block">Создать компанию</a>
    <table class="data">
      <thead><tr><th>Компания</th><th>Доступ</th><th>Создана</th><th>Тариф</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function adminNewCompany() {
  return `<form class="panel" id="new-company-form">
    <h2>Создать компанию</h2>
    <label>Название компании</label><input id="co-name" />
    <label>Логин</label><input id="co-login" placeholder="Ваш логин" />
    <label>Пароль</label><input id="co-password" type="password" placeholder="Пароль" />
    <div class="error" id="co-error" hidden></div>
    <p class="hint ok-line" id="co-ok" hidden>Компания создана</p>
    <button class="btn" type="submit">Создать</button>
  </form>`;
}

function adminCompanyCard(id) {
  const c = companyById(id);
  if (!c) return `<div class="panel"><p>Компанию не нашли</p><a href="#/admin/companies">К компаниям</a></div>`;
  const lockedCo = c.access_status === "locked";
  const mins =
    c.price_per_minute > 0 ? Math.floor((c.balance || 0) / c.price_per_minute) : 0;
  const hist = (c.history || [])
    .slice(-8)
    .reverse()
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join("") || "<li class='hint'>Пока пусто</li>";
  return `<div class="panel wide">
    <h2>Компания</h2>
    <p><strong>${escapeHtml(c.name)}</strong> · ${escapeHtml(c.login || "")}</p>
    <p>Статус: ${lockedCo ? "Заблокирована" : "Активна"}</p>
    <p>Баланс: ${escapeHtml(String(c.balance || 0))} ₽
      <span class="hint">≈ ${mins} мин по тарифу</span></p>
    <p>Тариф за минуту: ${escapeHtml(String(c.price_per_minute ?? "—"))}</p>
    <div class="row-actions">
      <a class="btn" href="#/admin/companies/${encodeURIComponent(c.id)}/topup">Пополнить</a>
      <button class="btn secondary" type="button" id="change-tariff" data-id="${escapeHtml(c.id)}">Сменить тариф</button>
      <button class="btn secondary" type="button" id="open-cabinet" data-id="${escapeHtml(c.id)}">Открыть кабинет</button>
      <button class="btn secondary" type="button" id="toggle-lock" data-id="${escapeHtml(c.id)}">
        ${lockedCo ? "Разблокировать" : "Заблокировать"}
      </button>
    </div>
    <div id="lock-dialog" class="panel nested" hidden>
      <p>Заблокировать компанию? Клиент сможет только смотреть. Обзвон остановится</p>
      <button class="btn" type="button" id="lock-confirm" data-id="${escapeHtml(c.id)}">Заблокировать</button>
      <button class="btn secondary" type="button" id="lock-cancel">Отмена</button>
    </div>
    <h3>История</h3>
    <ul>${hist}</ul>
    <a class="hint" href="#/admin/companies">← К компаниям</a>
  </div>`;
}

function adminTopUp(id) {
  const c = companyById(id);
  if (!c) return `<div class="panel"><p>Компанию не нашли</p></div>`;
  const mins =
    c.price_per_minute > 0 ? Math.floor((c.balance || 0) / c.price_per_minute) : 0;
  return `<form class="panel" id="topup-form" data-id="${escapeHtml(c.id)}">
    <h2>Пополнить баланс</h2>
    <p class="hint">Сейчас: ${escapeHtml(String(c.balance || 0))} ₽ · ≈ ${mins} мин по текущему тарифу</p>
    <label>Сумма, ₽</label>
    <input id="topup-amount" type="number" min="0" step="1" />
    <div class="error" id="topup-error" hidden></div>
    <p class="hint ok-line" id="topup-ok" hidden>Баланс пополнен</p>
    <button class="btn" type="submit">Пополнить</button>
    <a class="btn secondary" href="#/admin/companies/${encodeURIComponent(c.id)}" style="display:inline-block;margin-left:.5rem">Назад</a>
  </form>`;
}

function adminSettings() {
  const interval = localStorage.getItem("cm_interval") || "30";
  const tariff = localStorage.getItem("cm_default_tariff") || "0";
  return `<div>
    <form class="panel" id="interval-form">
      <h2>Интервал подачи пачек</h2>
      <label>Интервал подачи пачек (секунды)</label>
      <input id="interval-sec" type="number" min="1" value="${escapeHtml(interval)}" />
      <p class="hint">Клиенты компаний это значение не видят и не меняют</p>
      <p class="hint">Обычно 30 секунд</p>
      <div class="error" id="interval-error" hidden></div>
      <p class="hint ok-line" id="interval-ok" hidden>Интервал сохранён</p>
      <button class="btn" type="submit">Сохранить</button>
    </form>
    <form class="panel" id="default-tariff-form" style="margin-top:1rem">
      <h2>Тариф по умолчанию</h2>
      <label>Цена минуты для новых компаний</label>
      <input id="default-tariff" type="number" min="0" step="0.01" value="${escapeHtml(tariff)}" />
      <p class="hint">Подставится при создании компании. Потом можно сменить в карточке</p>
      <div class="error" id="tariff-error" hidden></div>
      <p class="hint ok-line" id="tariff-ok" hidden>Сохранено</p>
      <button class="btn" type="submit">Сохранить</button>
    </form>
  </div>`;
}

/* ---------- cabinet: telephony ---------- */

function telephonyOverview() {
  const t = state.telephony;
  const linesVal = t.lines != null ? t.lines : "";
  if (t.checking) {
    return `<div class="panel wide">
      <p><strong>Проверяем подключение…</strong></p>
      <p class="hint">Это не обзвон — только проверка связи</p>
    </div>`;
  }
  if (t.status === "ok") {
    return `<div class="panel wide">
      <p><strong>Телефония подключена</strong></p>
      <p class="hint">Можно создавать кампанию и запускать обзвон</p>
      ${linesField(linesVal)}
      <div class="row-actions">
        <a class="btn" href="#/cabinet/campaigns">К кампаниям</a>
        <a class="btn secondary" href="#/cabinet/telephony/sip">Изменить данные</a>
      </div>
    </div>`;
  }
  if (t.status === "error") {
    const msg = ERROR_BY_CODE[t.lastError] || ERROR_BY_CODE.sip_unknown;
    return `<div class="panel wide">
      <h2>Не удалось подключить телефонию</h2>
      <p class="error">${escapeHtml(msg)}</p>
      <div class="row-actions">
        <button class="btn" type="button" id="sip-recheck" ${roAttr()}>Проверить снова</button>
        <a class="btn secondary" href="#/cabinet/telephony/sip">Изменить данные</a>
      </div>
      ${linesField(linesVal)}
    </div>`;
  }
  return `<div class="panel wide">
    <p>Подключите телефонию, чтобы звонить</p>
    <div class="row-actions">
      <a class="btn" href="#/cabinet/telephony/sip" style="display:inline-block">Подключить SIP</a>
      <a class="btn secondary" href="#/cabinet/telephony/mango" style="display:inline-block ${locked() ? ";pointer-events:none;opacity:.5" : ""}">Подключить через Манго</a>
    </div>
    ${linesField(linesVal)}
  </div>`;
}

function linesField(value, { standalone = true } = {}) {
  const body = `
    <label>Число линий</label>
    <input id="lines-input" type="number" min="1" placeholder="Например: 5" value="${escapeHtml(String(value))}" ${roAttr()} />
    <p class="hint">Сколько одновременных звонков позволяет ваша телефония</p>
    <div class="error" id="lines-error" hidden></div>
    ${standalone ? `<button class="btn secondary" type="submit" ${roAttr()}>Сохранить</button>` : ""}`;
  if (!standalone) return `<div class="lines-block">${body}</div>`;
  return `<form id="lines-form" class="lines-block">${body}</form>`;
}

function sipForm() {
  return `<form class="panel" id="sip-form">
    <h2>SIP</h2>
    <label>Адрес</label><input id="sip-host" placeholder="sip.example.com" ${roAttr()} />
    <label>Логин</label><input id="sip-login" placeholder="Ваш логин" ${roAttr()} />
    <label>Пароль</label><input id="sip-password" type="password" placeholder="Пароль" ${roAttr()} />
    <p class="hint">Пароль сохраним, но снова не покажем</p>
    ${linesField(state.telephony.lines != null ? state.telephony.lines : "", { standalone: false })}
    <div class="error" id="sip-error" hidden></div>
    <div class="row-actions">
      <button class="btn" type="submit" ${roAttr()}>Сохранить</button>
      <button class="btn secondary" type="button" id="sip-check" ${roAttr()}>Проверить подключение</button>
    </div>
    <a class="hint" href="#/cabinet/telephony">← К обзору телефонии</a>
  </form>`;
}

function mangoForm() {
  return `<form class="panel" id="mango-form">
    <h2>Манго Телеком</h2>
    <label>Логин</label><input id="mango-login" placeholder="Ваш логин" ${roAttr()} />
    <label>Пароль</label><input id="mango-password" type="password" placeholder="Пароль" ${roAttr()} />
    <p class="hint">Пароль сохраним, но снова не покажем</p>
    ${linesField(state.telephony.lines != null ? state.telephony.lines : "", { standalone: false })}
    <div class="error" id="mango-error" hidden></div>
    <p class="hint ok-line" id="mango-ok" hidden>Телефония подключена</p>
    <button class="btn" type="submit" ${roAttr()}>Подключить</button>
    <a class="btn secondary" href="#/cabinet/telephony" style="display:inline-block;margin-left:.5rem">К обзору телефонии</a>
  </form>`;
}

/* ---------- cabinet: campaigns ---------- */

function emptyCampaign(partial = {}) {
  return {
    id: String(Date.now()),
    name: "",
    dial_state: "draft",
    goal: "",
    details: "",
    preview: { greeting: "", says: "", replies: "", tone: "" },
    scenarioText: "",
    stages: [],
    verdicts: [],
    schedule: { days: ["mon", "tue", "wed", "thu", "fri"], from: "10:00", to: "18:00", tz: "Europe/Moscow" },
    retries: 2,
    contacts: [],
    columns: [],
    uploadWarnings: [],
    analytics: null,
    ...partial,
  };
}

function buildPreview(camp) {
  const nameHint = "Если имени нет — робот его не говорит";
  return {
    greeting: camp.preview?.greeting || `Здравствуйте! ${nameHint}`,
    says: camp.preview?.says || (camp.details || "Сначала сохраните цель и сведения"),
    replies: camp.preview?.replies || "Отвечает коротко по сути вопроса",
    tone: camp.preview?.tone || "Спокойно и по делу, без давления оформить любой ценой",
  };
}

function ensureVerdicts(camp) {
  if (camp.verdicts && camp.verdicts.length) return camp.verdicts;
  if (!camp.goal) return [];
  return ["Дошли до цели", "Не дошли", "Перезвонить позже"];
}

function campaignList() {
  if (!state.campaigns.length) {
    const create =
      locked()
        ? `<button class="btn" type="button" disabled>Создать кампанию</button>
           <p class="hint">Аккаунт заблокирован</p>`
        : `<a class="btn" href="#/cabinet/campaigns/new" style="display:inline-block">Создать кампанию</a>`;
    return `<div class="panel"><p>Создайте первую кампанию</p>${create}</div>`;
  }
  const rows = state.campaigns
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name || "Без названия")}</td><td>${dialLabel(c.dial_state)}</td>
        <td><a href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">Открыть</a></td></tr>`
    )
    .join("");
  const createBtn = locked()
    ? `<button class="btn" type="button" disabled>Создать кампанию</button>`
    : `<a class="btn" href="#/cabinet/campaigns/new" style="display:inline-block">Создать кампанию</a>`;
  return `<div class="panel wide">
    ${createBtn}
    <table class="data">
      <thead><tr><th>Кампании</th><th>Состояние</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function newCampaignForm() {
  return `<form class="panel" id="new-campaign-form">
    <h2>Новая кампания</h2>
    <label>Название</label><input id="camp-name" ${roAttr()} />
    <p class="hint">Пустое имя — не мешает запуску</p>
    <label>Цель звонка</label>
    <input id="camp-goal" placeholder="Например: напомнить о записи" ${roAttr()} />
    <p class="hint">К чему должен привести разговор</p>
    <label>Сведения</label>
    <textarea id="camp-details" rows="4" placeholder="Что важно сказать абоненту" ${roAttr()}></textarea>
    <p class="hint">Что роботу знать о продукте и ситуации</p>
    <div class="error" id="camp-error" hidden></div>
    <button class="btn" type="submit" ${roAttr()}>Сохранить</button>
  </form>`;
}

function campaignTabs(id, active) {
  const tabs = [
    ["", "Обзор"],
    ["/scenario", "Сценарий"],
    ["/contacts", "Контакты"],
    ["/schedule", "Расписание"],
    ["/launch", "Запуск"],
  ];
  return `<nav class="subnav">${tabs
    .map(([suffix, label]) => {
      const href = `#/cabinet/campaigns/${encodeURIComponent(id)}${suffix}`;
      const isActive =
        (suffix === "" && active === "overview") ||
        (suffix && active === suffix.slice(1));
      return `<a href="${href}" class="${isActive ? "active" : ""}">${label}</a>`;
    })
    .join("")}</nav>`;
}

function campaignOverview(camp) {
  const started = isStarted(camp);
  const preview = buildPreview(camp);
  const weak = isWeakScenario(camp);
  const verdicts = ensureVerdicts(camp);
  return `${campaignTabs(camp.id, "overview")}
  <div class="panel wide">
    <h2>${escapeHtml(camp.name || "Без названия")}</h2>
    <p>Состояние: ${dialLabel(camp.dial_state)}</p>
    <p>Цель: ${escapeHtml(camp.goal || "—")}</p>
    ${started ? `<div class="banner banner-warn">После старта сценарий и расписание только смотрим. Чтобы изменить — создайте новую кампанию</div>` : ""}
    ${weak && !started ? `<div class="banner banner-warn">
      <strong>Сценарий пока слишком слабый для обзвона</strong>
      <p class="hint">Допишите цель и сведения или поправьте текст</p>
    </div>` : ""}
    <section class="preview-blocks">
      <h3>Робот так понял сценарий</h3>
      ${
        !camp.goal
          ? `<p class="hint">Сначала сохраните цель и сведения</p>`
          : `<div class="preview-grid">
        <div><h4>Приветствие</h4><p>${escapeHtml(preview.greeting)}</p>
          <p class="hint">Нет имени — в приветствии обойдёмся без обращения</p>
          <p class="hint">Если имени нет — робот его не говорит</p>
          <p class="hint">Пример: Здравствуйте!</p></div>
        <div><h4>Что говорит</h4><p>${escapeHtml(preview.says)}</p></div>
        <div><h4>Как отвечает</h4><p>${escapeHtml(preview.replies)}</p></div>
        <div><h4>Тон</h4><p>${escapeHtml(preview.tone)}</p>
          <p class="hint">Спокойно и по делу, без давления оформить любой ценой</p></div>
      </div>
      ${!started ? `<a class="btn secondary" href="#/cabinet/campaigns/${encodeURIComponent(camp.id)}/scenario">Править сценарий</a>` : ""}`
      }
    </section>
    <section style="margin-top:1.25rem">
      <h3>Возможные итоги разговора</h3>
      <p class="hint">Система собрала список по цели. Менять его нельзя</p>
      ${
        verdicts.length
          ? `<ul>${verdicts.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul>`
          : `<p class="hint">Пока нет итогов — уточните цель и соберите сценарий снова</p>`
      }
    </section>
  </div>`;
}

function campaignScenario(camp) {
  const started = isStarted(camp);
  const dis = started || locked() ? "disabled" : "";
  const stages =
    (camp.stages && camp.stages.length
      ? camp.stages
      : camp.goal
        ? [{ goal: camp.goal, input: "Приветствие", output: "Переход к сути" }]
        : []);
  const attrs = camp.columns || [];
  return `${campaignTabs(camp.id, "scenario")}
  <div class="panel wide">
    ${started ? `<div class="banner banner-warn">После старта сценарий и расписание только смотрим. Чтобы изменить — создайте новую кампанию</div>` : ""}
    <h2>Сценарий</h2>
    <p class="hint">Можно править текст; ветки диалога рисовать не нужно</p>
    <p class="hint">Название столбца в файле должно совпадать с полем в сценарии</p>
    <label>Текст сценария</label>
    <textarea id="scenario-text" rows="6" ${dis}>${escapeHtml(camp.scenarioText || camp.details || "")}</textarea>
    <div class="row-actions">
      <button class="btn secondary" type="button" id="insert-attr" ${dis}>Вставить поле</button>
      <button class="btn" type="button" id="save-scenario" ${dis}>Сохранить черновик</button>
    </div>
    <p class="hint ok-line" id="scenario-ok" hidden>Черновик сохранён</p>
    <div id="attr-picker" class="panel nested" hidden>
      <h4>Поля из файла</h4>
      <p class="hint">Имя поля = название столбца в файле</p>
      ${
        attrs.length
          ? attrs.map((a) => `<button type="button" class="btn secondary attr-pick" data-attr="${escapeHtml(a)}">{${escapeHtml(a)}}</button>`).join(" ")
          : `<p class="hint">Сначала загрузите контакты или добавьте поле</p>`
      }
    </div>
    <h3>Этапы разговора</h3>
    ${
      stages.length
        ? stages
            .map(
              (s, i) => `<form class="panel nested stage-form" data-idx="${i}">
          <label>Цель этапа</label><input name="goal" value="${escapeHtml(s.goal || "")}" ${dis} />
          <label>Что на входе</label><input name="input" value="${escapeHtml(s.input || "")}" ${dis} />
          <label>Что на выходе</label><input name="output" value="${escapeHtml(s.output || "")}" ${dis} />
          <button class="btn secondary" type="submit" ${dis}>Сохранить этап</button>
        </form>`
            )
            .join("")
        : `<p class="hint">Этапы появятся после сборки сценария</p>`
    }
    ${started ? `<p class="hint">После старта менять нельзя</p>
      <a class="btn" href="#/cabinet/campaigns/new">Создать кампанию</a>` : ""}
  </div>`;
}

function campaignContacts(camp) {
  const started = isStarted(camp);
  const contacts = camp.contacts || [];
  const warnings = camp.uploadWarnings || [];
  const reloadHint = started
    ? `<p class="hint">Номера догрузить можно. Новое поле в сценарий — уже нет</p>`
    : "";
  const table =
    contacts.length === 0
      ? `<p>Загрузите контакты</p>`
      : `<div class="row-actions">
          <button class="btn secondary" type="button" id="cancel-contacts" ${roAttr()}>Снять с обзвона</button>
          <button class="btn secondary" type="button" id="restore-contacts" ${roAttr()}>Вернуть в обзвон</button>
        </div>
        <p class="hint" id="contacts-action-msg"></p>
        <table class="data" id="contacts-table">
          <thead><tr><th></th><th>Телефон</th><th>Статус</th><th>Имя</th></tr></thead>
          <tbody>${contacts
            .map(
              (r) => `<tr>
              <td><input type="checkbox" class="contact-check" data-phone="${escapeHtml(r.phone)}" ${roAttr()} /></td>
              <td><a href="#/cabinet/statuses/${encodeURIComponent(camp.id)}/${encodeURIComponent(r.phone)}">${escapeHtml(maskPhone(r.phone))}</a></td>
              <td>${escapeHtml(statusLabel(r.status))}</td>
              <td>${escapeHtml(r.name || "")}</td>
            </tr>`
            )
            .join("")}</tbody>
        </table>`;

  return `${campaignTabs(camp.id, "contacts")}
  <div class="panel wide">
    ${reloadHint}
    <div class="upload-zone" id="upload-zone">
      <p>Перетащите файл или выберите на компьютере</p>
      <p class="hint">Excel или CSV</p>
      <button class="btn" type="button" id="pick-file" ${roAttr()}>Выбрать файл</button>
      <input type="file" id="contact-file" accept=".csv,.xlsx,.xls" hidden ${roAttr()} />
      <p class="hint consent">Загружая номера, вы подтверждаете, что у вас есть законные основания звонить этим людям. CallMate согласия за вас не собирает</p>
      <p class="hint">Храните согласия и документы у себя</p>
    </div>
    <p id="upload-progress" class="hint" hidden>Загружаем контакты…</p>
    <p class="hint" id="upload-progress-hint" hidden>Большой файл может занять несколько минут</p>
    <p class="hint ok-line" id="upload-ok" hidden>Контакты загружены</p>
    <div id="upload-errors"></div>
    ${warnings.map((w) => `<p class="error">${escapeHtml(w)}</p>`).join("")}
    <p class="hint">Название столбца в файле должно совпадать с полем в сценарии</p>
    <div id="reload-precheck" class="panel nested" hidden></div>
    <div id="new-col-alert" class="panel nested" hidden></div>
    <h3 style="margin-top:1rem">Список</h3>
    ${table}
    ${started ? `<button class="btn secondary" type="button" id="reload-entry" ${roAttr()}>Догрузить файл</button>
      <p class="hint">Серого статуса нет: пока вы не подтвердите догрузку, новые номера в обзвон не попадут</p>` : ""}
  </div>`;
}

function campaignSchedule(camp) {
  const started = isStarted(camp);
  const dis = started || locked() ? "disabled" : "";
  const sch = camp.schedule || { days: [], from: "10:00", to: "18:00", tz: "Europe/Moscow" };
  const dayChecks = DAYS.map(
    (d) =>
      `<label class="inline"><input type="checkbox" name="day" value="${d.id}" ${sch.days?.includes(d.id) ? "checked" : ""} ${dis} /> ${d.label}</label>`
  ).join(" ");
  return `${campaignTabs(camp.id, "schedule")}
  <form class="panel wide" id="schedule-form">
    ${started ? `<div class="banner banner-warn">После старта менять нельзя</div>` : ""}
    <h2>Дни звонков</h2>
    <div class="days">${dayChecks}</div>
    <div class="error" id="days-error" hidden></div>
    <h2>Время звонков</h2>
    <label>С</label><input id="sch-from" type="time" value="${escapeHtml(sch.from || "10:00")}" ${dis} />
    <label>До</label><input id="sch-to" type="time" value="${escapeHtml(sch.to || "18:00")}" ${dis} />
    <div class="error" id="time-error" hidden></div>
    <label>Часовой пояс</label>
    <select id="sch-tz" ${dis}>
      ${TIMEZONES.map((tz) => `<option value="${tz}" ${sch.tz === tz ? "selected" : ""}>${tz}</option>`).join("")}
    </select>
    <p class="hint">Дни и время считаем в этом поясе</p>
    <div class="error" id="tz-error" hidden></div>
    <label>Перезвоны при недозвоне</label>
    <input id="sch-retries" type="number" min="0" max="4" value="${escapeHtml(String(camp.retries ?? 2))}" ${dis} />
    <p class="hint">Не больше 4</p>
    <div class="error" id="retries-error" hidden></div>
    <p class="hint ok-line" id="sch-ok" hidden>Сохранено</p>
    <button class="btn" type="submit" ${dis}>Сохранить</button>
  </form>`;
}

function launchBlockReasons(camp) {
  const reasons = [];
  if (!(camp.contacts && camp.contacts.length)) reasons.push({ text: "Загрузите контакты", action: "contacts" });
  const missingCol = (camp.uploadWarnings || []).find((w) => w.includes("столбца") || w.includes("столбц"));
  if (missingCol) reasons.push({ text: "В файле нет столбца для поля сценария" });
  const emptyAttr = (camp.uploadWarnings || []).find((w) => w.includes("пустое поле") || w.includes("нет значения"));
  if (emptyAttr) reasons.push({ text: "У части номеров нет значения поля из сценария" });
  if (state.telephony.status !== "ok") reasons.push({ text: "Подключите телефонию", action: "tel" });
  if (!camp.schedule?.days?.length || !camp.schedule?.tz) reasons.push({ text: "Задайте расписание", action: "schedule" });
  if (state.companyBalance <= 0 && !state.impersonate) reasons.push({ text: "Недостаточно средств", money: true });
  if (locked()) reasons.push({ text: "Аккаунт заблокирован" });
  if (isWeakScenario(camp) && camp.dial_state === "draft") reasons.push({ text: "Пока нельзя начать обзвон", weak: true });
  return reasons;
}

function campaignLaunch(camp) {
  const reasons = launchBlockReasons(camp);
  const canStart =
    camp.dial_state === "draft" || camp.dial_state === "stopped"
      ? reasons.length === 0 && !locked()
      : false;
  let controls = "";
  if (camp.dial_state === "running") {
    controls = `<div class="row-actions">
      <button class="btn" type="button" id="dial-pause" ${roAttr()}>Пауза</button>
      <button class="btn secondary" type="button" id="dial-stop" ${roAttr()}>Стоп</button>
    </div>
    <p class="hint">Текущий разговор закончим. Новые звонки не начнём</p>
    <p class="hint">Обзвон уже идёт</p>`;
  } else if (camp.dial_state === "paused") {
    controls = `<div class="row-actions">
      <button class="btn" type="button" id="dial-resume" ${roAttr()}>Продолжить</button>
      <button class="btn secondary" type="button" id="dial-stop" ${roAttr()}>Стоп</button>
    </div>
    <p class="hint">Текущий разговор закончим. Новые звонки не начнём</p>`;
  } else {
    const disabled = !canStart || locked();
    controls = `<button class="btn" type="button" id="dial-start" ${disabled ? "disabled" : ""}>Начать обзвон</button>
      ${locked() ? `<p class="hint">Аккаунт заблокирован</p>` : ""}
      <p class="hint" id="dial-progress" hidden>Запускаем…</p>`;
  }
  const reasonList =
    reasons.length && (camp.dial_state === "draft" || camp.dial_state === "stopped")
      ? `<div class="banner banner-warn">
          <strong>Нельзя начать обзвон</strong>
          <ul>${reasons
            .map((r) => {
              let extra = "";
              if (r.money) extra = ` <span class="hint">Пополнение делает поддержка CallMate</span>`;
              if (r.action === "contacts")
                extra += ` <a href="#/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts">Загрузить файл</a>`;
              if (r.action === "tel") extra += ` <a href="#/cabinet/telephony">Телефония</a>`;
              if (r.action === "schedule")
                extra += ` <a href="#/cabinet/campaigns/${encodeURIComponent(camp.id)}/schedule">Расписание</a>`;
              if (r.weak) extra = ` <span class="hint">Допишите цель и сведения или поправьте текст</span>`;
              return `<li>${escapeHtml(r.text)}${extra}</li>`;
            })
            .join("")}</ul>
          <p class="hint">Пустое имя — не мешает запуску</p>
        </div>`
      : "";
  return `${campaignTabs(camp.id, "launch")}
  <div class="panel wide" data-camp="${escapeHtml(camp.id)}">
    <h2>Запуск</h2>
    <p>Состояние: ${dialLabel(camp.dial_state)}</p>
    ${reasonList}
    ${controls}
    <div id="stop-confirm" class="panel nested" hidden>
      <p>Остановить обзвон? Текущий разговор договорим</p>
      <button class="btn" type="button" id="stop-yes">Стоп</button>
      <button class="btn secondary" type="button" id="stop-no">Отмена</button>
    </div>
  </div>`;
}

/* ---------- statuses / analytics ---------- */

function allContactsFlat() {
  const rows = [];
  for (const c of state.campaigns) {
    for (const ct of c.contacts || []) {
      rows.push({ ...ct, campaignId: c.id, campaignName: c.name });
    }
  }
  return rows;
}

function statusesView(path) {
  const card = matchPath(path, "/cabinet/statuses/:campId/:phone");
  if (card) return contactCard(card.campId, card.phone);

  const f = localStorage.getItem("cm_status_filter") || "all";
  const q = (localStorage.getItem("cm_status_q") || "").trim();
  const outcomeF = localStorage.getItem("cm_outcome_filter") || "all";

  let list = allContactsFlat();
  if (!list.length) {
    return `<div class="panel wide">
      <p>Пока нет звонков</p>
      <p class="hint">Когда начнёте обзвон, здесь появятся номера и статусы</p>
      <a class="btn" href="#/cabinet/campaigns">К кампании</a>
    </div>`;
  }

  if (f !== "all") list = list.filter((r) => r.status === f);
  if (q) list = list.filter((r) => String(r.phone).includes(q.replace(/\D/g, "")) || String(r.phone).includes(q));
  if (outcomeF !== "all") {
    list = list.filter((r) => (r.attempts || []).some((a) => a.outcome === outcomeF));
  }

  const filters = [
    ["all", "Все"],
    [STATUS.in_progress, "В процессе"],
    [STATUS.done, "Завершённые темы"],
    [STATUS.no_answer, "Недозвон"],
    [STATUS.cancel, "Отмена"],
  ];

  return `<div class="panel wide">
    <div class="filters">
      <label>Телефон</label>
      <input id="status-q" placeholder="Номер или часть номера" value="${escapeHtml(q)}" />
      <p class="hint">Поиск по номеру</p>
      <label>Статус</label>
      <select id="status-filter">
        ${filters.map(([v, l]) => `<option value="${v}" ${f === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <label>Исход попытки</label>
      <select id="outcome-filter">
        <option value="all" ${outcomeF === "all" ? "selected" : ""}>Все</option>
        <option value="busy" ${outcomeF === "busy" ? "selected" : ""}>Занято</option>
        <option value="no_pickup" ${outcomeF === "no_pickup" ? "selected" : ""}>Не берёт</option>
        <option value="voicemail" ${outcomeF === "voicemail" ? "selected" : ""}>Автоответчик</option>
        <option value="early" ${outcomeF === "early" ? "selected" : ""}>Ранний сброс</option>
        <option value="connected" ${outcomeF === "connected" ? "selected" : ""}>Дозвонились</option>
      </select>
      <button class="btn secondary" type="button" id="status-reset">Сбросить</button>
    </div>
    ${
      list.length === 0
        ? `<p>Ничего не нашли</p>`
        : `<table class="data">
      <thead><tr><th>Телефон</th><th>Статус</th><th>Имя</th><th>Кампания</th></tr></thead>
      <tbody>${list
        .map(
          (r) => `<tr>
          <td><a href="#/cabinet/statuses/${encodeURIComponent(r.campaignId)}/${encodeURIComponent(r.phone)}">${escapeHtml(maskPhone(r.phone))}</a></td>
          <td><span class="badge">${escapeHtml(statusLabel(r.status))}</span></td>
          <td>${escapeHtml(r.name || "")}</td>
          <td>${escapeHtml(r.campaignName || "")}</td>
        </tr>`
        )
        .join("")}</tbody>
    </table>`
    }
    <!-- FE-055: клиенту не показываем аварию обзвона -->
  </div>`;
}

function contactCard(campId, phone) {
  const camp = campaignById(campId);
  const contact = camp?.contacts?.find((c) => c.phone === phone);
  if (!contact) {
    return `<div class="panel"><p>Номер не найден</p><a href="#/cabinet/statuses">К статусам</a></div>`;
  }
  const attempts = contact.attempts || [];
  const attemptRows = attempts.length
    ? attempts
        .map(
          (a, i) => `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(a.when || "")}</td>
          <td>${escapeHtml(outcomeLabel(a.outcome))}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="3">Попыток ещё не было</td></tr>`;
  return `<div class="panel wide">
    <p><a href="#/cabinet/statuses">← Статусы</a></p>
    <h2>Номер</h2>
    <p>${escapeHtml(maskPhone(contact.phone))}</p>
    <p><strong>Статус</strong>: ${escapeHtml(statusLabel(contact.status))}
      ${contact.status === STATUS.done ? `<span class="hint">Поговорили с человеком</span>` : ""}</p>
    <p><strong>Вердикт</strong>: ${
      contact.verdict
        ? escapeHtml(contact.verdict)
        : "Вердикта нет — разговора не было"
    }</p>
    <p class="hint">Вердикт — про цель, не про статус обзвона</p>
    <p class="hint">Вердикт — про цель кампании, не про статус</p>
    <h3>Попытки</h3>
    <table class="data">
      <thead><tr><th>№</th><th>Когда</th><th>Исход</th></tr></thead>
      <tbody>${attemptRows}</tbody>
    </table>
    <h3>Разговор</h3>
    <p class="hint">${contact.transcript ? escapeHtml(contact.transcript) : "Записи разговора пока нет"}</p>
  </div>`;
}

function outcomeLabel(code) {
  const map = {
    busy: "Занято",
    no_pickup: "Не берёт",
    voicemail: "Автоответчик",
    early: "Ранний сброс",
    connected: "Дозвонились",
  };
  return map[code] || code || "—";
}

function analyticsView() {
  const camp = state.campaigns.find(isStarted) || state.campaigns[0];
  if (!camp || !camp.analytics) {
    return `<div class="panel wide">
      <p>Пока нет данных по кампании</p>
      <button class="btn secondary" type="button" disabled title="Пока нечего выгружать">Скачать Excel</button>
      <p class="hint">Пока нечего выгружать</p>
    </div>`;
  }
  const a = camp.analytics;
  return `<div class="panel wide">
    <div>Звонков: ${escapeHtml(String(a.calls ?? 0))}</div>
    <div>Средняя длительность: ${escapeHtml(a.avgDuration || "—")}</div>
    <div><strong>До цели</strong>: ${escapeHtml(String(a.goalReached ?? 0))}</div>
    <p class="hint">По итогам разговора относительно цели кампании</p>
    <div><strong>Минуты разговора</strong>: ${escapeHtml(String(a.minutes ?? 0))}</div>
    <div><strong>Ваш тариф за минуту</strong>: ${escapeHtml(String(state.companyTariff))}</div>
    <div><strong>Стоимость кампании</strong>: ${escapeHtml(String(a.cost ?? a.minutes * state.companyTariff))}</div>
    <p class="hint">Стоимость = минуты × ваш тариф</p>
    <p class="hint">Минуты × тариф</p>
    <div class="row-actions">
      <button class="btn" type="button" id="export-excel">Скачать Excel</button>
    </div>
    <p class="hint" id="export-status" hidden></p>
    <div class="error" id="export-error" hidden></div>
  </div>`;
}

function checklistView() {
  return `<div class="panel wide">
    <h2>Чеклист выпуска</h2>
    <ul>
      <li>Вход общий; суперадмин → админка</li>
      <li>Создать компанию = поля регистрации</li>
      <li>Lock; баланс; пауза/стоп</li>
      <li>Вердикты read-only; фильтр исходов</li>
      <li>Темы; только десктоп</li>
    </ul>
    <p class="hint">Внутренняя сверка; не для клиента кабинета</p>
  </div>`;
}

function cabinetContent(path) {
  if (path === "/cabinet/_checklist") return checklistView();
  if (path.startsWith("/cabinet/telephony/sip")) return sipForm();
  if (path.startsWith("/cabinet/telephony/mango")) return mangoForm();
  if (path.startsWith("/cabinet/telephony")) return telephonyOverview();
  if (path.startsWith("/cabinet/statuses")) return statusesView(path);
  if (path.startsWith("/cabinet/analytics")) return analyticsView();
  if (path === "/cabinet/campaigns/new") return newCampaignForm();

  const launch = matchPath(path, "/cabinet/campaigns/:id/launch");
  if (launch) {
    const c = campaignById(launch.id);
    return c ? campaignLaunch(c) : notFoundCamp();
  }
  const scenario = matchPath(path, "/cabinet/campaigns/:id/scenario");
  if (scenario) {
    const c = campaignById(scenario.id);
    return c ? campaignScenario(c) : notFoundCamp();
  }
  const contacts = matchPath(path, "/cabinet/campaigns/:id/contacts");
  if (contacts) {
    const c = campaignById(contacts.id);
    return c ? campaignContacts(c) : notFoundCamp();
  }
  const schedule = matchPath(path, "/cabinet/campaigns/:id/schedule");
  if (schedule) {
    const c = campaignById(schedule.id);
    return c ? campaignSchedule(c) : notFoundCamp();
  }
  const one = matchPath(path, "/cabinet/campaigns/:id");
  if (one) {
    const c = campaignById(one.id);
    return c ? campaignOverview(c) : notFoundCamp();
  }
  return campaignList();
}

function notFoundCamp() {
  return `<div class="panel"><p>Кампанию не нашли</p><a href="#/cabinet/campaigns">К кампаниям</a></div>`;
}

function maskPhone(phone) {
  const s = String(phone || "");
  if (s.length < 5) return s;
  return s.slice(0, 2) + "•••" + s.slice(-4);
}

/* ---------- auth views ---------- */

function loginView() {
  return `<div class="login-wrap">
    <section class="login-hero" aria-label="CallMate">
      <p class="login-brand">CallMate</p>
      <p class="login-lead">Кабинет голосовых кампаний</p>
    </section>
    <aside class="login-aside">
      <form class="panel" id="login-form">
        <h1>Вход</h1>
        <p class="hint">В кабинет компании или в админку</p>
        <label for="login">Логин</label>
        <input id="login" name="login" autocomplete="username" placeholder="Ваш логин" />
        <label for="password">Пароль</label>
        <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Пароль" />
        <button class="btn" id="submit" type="submit">Войти</button>
        <div class="error" id="form-error" hidden></div>
        <p class="hint desktop-note">Удобнее на компьютере. Телефонную вёрстку сделаем позже</p>
      </form>
    </aside>
  </div>`;
}

function forbiddenView() {
  let action = `<button class="btn" id="forbidden-action" type="button">Войти</button>`;
  if (state.session && state.role === "company") {
    action = `<button class="btn" id="forbidden-action" type="button">К кампаниям</button>`;
  } else if (state.session && state.role === "superadmin") {
    action = `<button class="btn" id="forbidden-action" type="button">К компаниям</button>`;
  }
  return `<div class="login-wrap">
    <section class="login-hero" aria-label="CallMate">
      <p class="login-brand">CallMate</p>
      <p class="login-lead">Нужен другой доступ — вернитесь ко входу.</p>
    </section>
    <aside class="login-aside"><div class="panel">
      <h1>Нет доступа</h1>
      <p class="hint">У вас нет доступа к этой странице</p>
      ${action}
      <button class="btn secondary" id="forbidden-logout" type="button">Выйти</button>
    </div></aside>
  </div>`;
}

/* ---------- render / bind ---------- */

function render() {
  setTheme(state.theme);
  const app = document.getElementById("app");
  const path = route();

  if (path.startsWith("/cabinet")) {
    const canCabinet =
      state.session && (state.role === "company" || (state.role === "superadmin" && state.impersonate));
    if (!canCabinet) {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = cabinetShell(path);
    bindShell();
    clearFlashSoon();
    return;
  }
  if (path.startsWith("/admin")) {
    if (!state.session || state.role !== "superadmin") {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = adminShell(path);
    bindShell();
    clearFlashSoon();
    return;
  }
  if (path === "/forbidden") {
    app.innerHTML = forbiddenView();
    bindForbidden();
    return;
  }
  app.innerHTML = loginView();
  bindLogin();
}

function bindForbidden() {
  document.getElementById("forbidden-action").onclick = () => {
    if (!state.session) navigate("/login");
    else if (state.role === "company" || state.impersonate) navigate("/cabinet/campaigns");
    else if (state.role === "superadmin") navigate("/admin/companies");
    else navigate("/login");
  };
  document.getElementById("forbidden-logout").onclick = async () => {
    await apiLogout(state.session);
    clearSession();
    navigate("/login");
  };
}

function bindShell() {
  document.querySelectorAll("[data-theme-set]").forEach((btn) => {
    btn.addEventListener("click", () => setTheme(btn.getAttribute("data-theme-set")));
  });
  const logoutBtn = document.getElementById("logout");
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      await apiLogout(state.session);
      clearSession();
      navigate("/login");
    };
  }
  const exitImp = document.getElementById("exit-impersonate");
  if (exitImp) {
    exitImp.onclick = () => {
      state.impersonate = null;
      localStorage.removeItem("cm_impersonate");
      navigate("/admin/companies");
      render();
    };
  }

  bindAdminForms();
  bindCampaignForms();
  bindTelephony();
  bindContacts();
  bindLaunch();
  bindStatuses();
  bindAnalytics();
}

function bindAdminForms() {
  const intervalForm = document.getElementById("interval-form");
  if (intervalForm) {
    intervalForm.onsubmit = (e) => {
      e.preventDefault();
      const v = Number(document.getElementById("interval-sec").value);
      const err = document.getElementById("interval-error");
      const ok = document.getElementById("interval-ok");
      if (!Number.isFinite(v) || v < 1) {
        err.hidden = false;
        ok.hidden = true;
        err.textContent = "Укажите число не меньше 1";
        return;
      }
      err.hidden = true;
      ok.hidden = false;
      localStorage.setItem("cm_interval", String(v));
    };
  }

  const newCompanyForm = document.getElementById("new-company-form");
  if (newCompanyForm) {
    newCompanyForm.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById("co-name").value.trim();
      const login = document.getElementById("co-login").value.trim();
      const password = document.getElementById("co-password").value;
      const err = document.getElementById("co-error");
      if (!name || !login || !password) {
        err.hidden = false;
        err.textContent = "Заполните все поля";
        return;
      }
      if (state.companies.some((c) => c.login === login)) {
        err.hidden = false;
        err.textContent = "Такой логин уже есть";
        return;
      }
      state.companies.push({
        id: `co-${Date.now()}`,
        name,
        login,
        access_status: "active",
        created_at: new Date().toISOString().slice(0, 10),
        price_per_minute: Number(localStorage.getItem("cm_default_tariff") || 0),
        balance: 0,
        history: [],
      });
      persistCompanies();
      document.getElementById("co-ok").hidden = false;
      err.hidden = true;
    };
  }

  const tariffForm = document.getElementById("default-tariff-form");
  if (tariffForm) {
    tariffForm.onsubmit = (e) => {
      e.preventDefault();
      const v = Number(document.getElementById("default-tariff").value);
      const err = document.getElementById("tariff-error");
      const ok = document.getElementById("tariff-ok");
      if (!(v > 0)) {
        err.hidden = false;
        ok.hidden = true;
        err.textContent = "Укажите цену больше нуля";
        return;
      }
      err.hidden = true;
      ok.hidden = false;
      localStorage.setItem("cm_default_tariff", String(v));
    };
  }

  const topup = document.getElementById("topup-form");
  if (topup) {
    topup.onsubmit = (e) => {
      e.preventDefault();
      const id = topup.getAttribute("data-id");
      const c = companyById(id);
      const amount = Number(document.getElementById("topup-amount").value);
      const err = document.getElementById("topup-error");
      const ok = document.getElementById("topup-ok");
      if (!(amount > 0)) {
        err.hidden = false;
        ok.hidden = true;
        err.textContent = "Укажите сумму больше нуля";
        return;
      }
      c.balance = (c.balance || 0) + amount;
      c.history = c.history || [];
      c.history.push(`Пополнение +${amount} ₽`);
      persistCompanies();
      err.hidden = true;
      ok.hidden = false;
      const mins = c.price_per_minute > 0 ? Math.floor(c.balance / c.price_per_minute) : 0;
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = `≈ ${mins} мин по текущему тарифу`;
      ok.after(hint);
    };
  }

  const openCab = document.getElementById("open-cabinet");
  if (openCab) {
    openCab.onclick = () => {
      const c = companyById(openCab.getAttribute("data-id"));
      state.impersonate = { id: c.id, name: c.name };
      saveJson("cm_impersonate", state.impersonate);
      state.companyLocked = c.access_status === "locked";
      navigate("/cabinet/campaigns");
      render();
    };
  }

  const toggleLock = document.getElementById("toggle-lock");
  if (toggleLock) {
    toggleLock.onclick = () => {
      const c = companyById(toggleLock.getAttribute("data-id"));
      if (c.access_status === "locked") {
        c.access_status = "active";
        c.history = c.history || [];
        c.history.push("Компания разблокирована");
        persistCompanies();
        flash("Компания разблокирована");
        render();
        return;
      }
      document.getElementById("lock-dialog").hidden = false;
    };
  }
  const lockCancel = document.getElementById("lock-cancel");
  if (lockCancel) lockCancel.onclick = () => {
    document.getElementById("lock-dialog").hidden = true;
  };
  const lockConfirm = document.getElementById("lock-confirm");
  if (lockConfirm) {
    lockConfirm.onclick = () => {
      const c = companyById(lockConfirm.getAttribute("data-id"));
      c.access_status = "locked";
      c.history = c.history || [];
      c.history.push("Компания заблокирована");
      persistCompanies();
      flash("Компания заблокирована");
      render();
    };
  }

  const changeTariff = document.getElementById("change-tariff");
  if (changeTariff) {
    changeTariff.onclick = () => {
      const c = companyById(changeTariff.getAttribute("data-id"));
      const v = prompt("Тариф за минуту", String(c.price_per_minute || 0));
      if (v == null) return;
      const n = Number(v);
      if (!(n > 0)) {
        flash(ERROR_BY_CODE.validation, "error");
        return;
      }
      c.price_per_minute = n;
      c.history = c.history || [];
      c.history.push("Тариф изменён");
      persistCompanies();
      render();
    };
  }
}

function bindCampaignForms() {
  const newCampaignForm = document.getElementById("new-campaign-form");
  if (newCampaignForm) {
    newCampaignForm.onsubmit = (e) => {
      e.preventDefault();
      if (locked()) return;
      const goal = document.getElementById("camp-goal").value.trim();
      const err = document.getElementById("camp-error");
      if (!goal) {
        err.hidden = false;
        err.textContent = "Опишите цель звонка";
        return;
      }
      const details = document.getElementById("camp-details").value;
      const name = document.getElementById("camp-name").value.trim();
      const camp = emptyCampaign({
        name,
        goal,
        details,
        preview: {
          greeting: "Здравствуйте!",
          says: details || goal,
          replies: "Отвечает коротко по сути вопроса",
          tone: "Спокойно и по делу, без давления оформить любой ценой",
        },
        scenarioText: details,
        stages: [{ goal, input: "Приветствие", output: "Суть" }],
        verdicts: ensureVerdicts({ goal }),
      });
      state.campaigns.push(camp);
      persistCampaigns();
      navigate(`/cabinet/campaigns/${camp.id}`);
    };
  }

  const saveScenario = document.getElementById("save-scenario");
  if (saveScenario) {
    const campId = route().split("/")[3];
    const camp = campaignById(campId);
    saveScenario.onclick = () => {
      if (!camp || isStarted(camp) || locked()) return;
      camp.scenarioText = document.getElementById("scenario-text").value;
      camp.preview = buildPreview({
        ...camp,
        preview: {
          ...camp.preview,
          says: camp.scenarioText,
          greeting: camp.preview?.greeting || "Здравствуйте!",
        },
      });
      persistCampaigns();
      document.getElementById("scenario-ok").hidden = false;
    };
    document.getElementById("insert-attr").onclick = () => {
      const picker = document.getElementById("attr-picker");
      picker.hidden = !picker.hidden;
    };
    document.querySelectorAll(".attr-pick").forEach((btn) => {
      btn.onclick = () => {
        const ta = document.getElementById("scenario-text");
        const token = `{${btn.getAttribute("data-attr")}}`;
        const start = ta.selectionStart || ta.value.length;
        ta.value = ta.value.slice(0, start) + token + ta.value.slice(start);
        ta.focus();
      };
    });
    document.querySelectorAll(".stage-form").forEach((form) => {
      form.onsubmit = (e) => {
        e.preventDefault();
        if (!camp || isStarted(camp) || locked()) return;
        const idx = Number(form.getAttribute("data-idx"));
        camp.stages = camp.stages || [];
        camp.stages[idx] = {
          goal: form.goal.value,
          input: form.input.value,
          output: form.output.value,
        };
        persistCampaigns();
        flash("Черновик сохранён");
      };
    });
  }

  const scheduleForm = document.getElementById("schedule-form");
  if (scheduleForm) {
    scheduleForm.onsubmit = (e) => {
      e.preventDefault();
      const campId = route().split("/")[3];
      const camp = campaignById(campId);
      if (!camp || isStarted(camp) || locked()) return;
      const days = [...scheduleForm.querySelectorAll("input[name=day]:checked")].map((el) => el.value);
      const daysErr = document.getElementById("days-error");
      const timeErr = document.getElementById("time-error");
      const tzErr = document.getElementById("tz-error");
      const retriesErr = document.getElementById("retries-error");
      daysErr.hidden = true;
      timeErr.hidden = true;
      tzErr.hidden = true;
      retriesErr.hidden = true;
      if (!days.length) {
        daysErr.hidden = false;
        daysErr.textContent = "Выберите хотя бы один день";
        return;
      }
      const from = document.getElementById("sch-from").value;
      const to = document.getElementById("sch-to").value;
      if (from && to && from >= to) {
        timeErr.hidden = false;
        timeErr.textContent = "Укажите время окончания позже начала";
        return;
      }
      const tz = document.getElementById("sch-tz").value;
      if (!tz) {
        tzErr.hidden = false;
        tzErr.textContent = "Выберите часовой пояс";
        return;
      }
      const retries = Number(document.getElementById("sch-retries").value);
      if (!Number.isFinite(retries) || retries > 4) {
        retriesErr.hidden = false;
        retriesErr.textContent = "Максимум 4 перезвона";
        return;
      }
      camp.schedule = { days, from, to, tz };
      camp.retries = retries;
      persistCampaigns();
      document.getElementById("sch-ok").hidden = false;
    };
  }
}

function saveLinesFromForm() {
  const input = document.getElementById("lines-input");
  const err = document.getElementById("lines-error");
  if (!input) return true;
  const v = Number(input.value);
  if (!Number.isFinite(v) || v < 1) {
    if (err) {
      err.hidden = false;
      err.textContent = "Укажите число линий не меньше 1";
    }
    return false;
  }
  if (err) err.hidden = true;
  state.telephony.lines = v;
  persistTelephony();
  return true;
}

function bindTelephony() {
  const linesForm = document.getElementById("lines-form");
  if (linesForm) {
    linesForm.onsubmit = (e) => {
      e.preventDefault();
      if (locked()) return;
      if (saveLinesFromForm()) flash("Сохранено");
    };
  }

  const sipFormEl = document.getElementById("sip-form");
  if (sipFormEl) {
    sipFormEl.onsubmit = (e) => {
      e.preventDefault();
      if (locked()) return;
      if (!saveLinesFromForm()) return;
      state.telephony.sipSaved = true;
      state.telephony.provider = "sip";
      // password never stored in demo state
      document.getElementById("sip-password").value = "";
      persistTelephony();
      flash("Сохранено");
    };
    const check = document.getElementById("sip-check");
    if (check) check.onclick = () => runSipCheck("ok");
  }

  const recheck = document.getElementById("sip-recheck");
  if (recheck) recheck.onclick = () => runSipCheck("ok");

  const mango = document.getElementById("mango-form");
  if (mango) {
    mango.onsubmit = (e) => {
      e.preventDefault();
      if (locked()) return;
      if (!saveLinesFromForm()) return;
      document.getElementById("mango-password").value = "";
      state.telephony.checking = true;
      persistTelephony();
      render();
      setTimeout(() => {
        state.telephony.checking = false;
        state.telephony.status = "ok";
        state.telephony.provider = "mango";
        state.telephony.lastError = null;
        persistTelephony();
        navigate("/cabinet/telephony");
        flash("Телефония подключена");
        render();
      }, 600);
    };
  }
}

function runSipCheck(result) {
  if (locked()) return;
  state.telephony.checking = true;
  persistTelephony();
  render();
  setTimeout(() => {
    state.telephony.checking = false;
    if (result === "ok") {
      state.telephony.status = "ok";
      state.telephony.provider = state.telephony.provider || "sip";
      state.telephony.lastError = null;
    } else {
      state.telephony.status = "error";
      state.telephony.lastError = result;
    }
    persistTelephony();
    navigate("/cabinet/telephony");
    render();
  }, 700);
}

function bindContacts() {
  const pick = document.getElementById("pick-file");
  const file = document.getElementById("contact-file");
  if (pick && file) {
    pick.onclick = () => file.click();
    file.onchange = () => simulateUpload(file.files?.[0]);
  }
  const zone = document.getElementById("upload-zone");
  if (zone) {
    zone.ondragover = (e) => {
      e.preventDefault();
    };
    zone.ondrop = (e) => {
      e.preventDefault();
      if (locked()) return;
      simulateUpload(e.dataTransfer.files?.[0]);
    };
  }

  const campId = (() => {
    const m = matchPath(route(), "/cabinet/campaigns/:id/contacts");
    return m?.id;
  })();
  const camp = campId ? campaignById(campId) : null;

  const cancelBtn = document.getElementById("cancel-contacts");
  if (cancelBtn && camp) {
    cancelBtn.onclick = () => {
      const selected = [...document.querySelectorAll(".contact-check:checked")].map((el) =>
        el.getAttribute("data-phone")
      );
      const msg = document.getElementById("contacts-action-msg");
      if (!selected.length) {
        msg.textContent = "Выберите номера";
        return;
      }
      if (!confirm("Снять выбранные номера с обзвона?")) return;
      for (const p of selected) {
        const row = camp.contacts.find((c) => c.phone === p);
        if (row) row.status = STATUS.cancel;
      }
      persistCampaigns();
      msg.textContent = "Сняли с обзвона";
      render();
    };
  }
  const restoreBtn = document.getElementById("restore-contacts");
  if (restoreBtn && camp) {
    restoreBtn.onclick = () => {
      const selected = [...document.querySelectorAll(".contact-check:checked")].map((el) =>
        el.getAttribute("data-phone")
      );
      const msg = document.getElementById("contacts-action-msg");
      if (!selected.length) {
        msg.textContent = "Выберите номера";
        return;
      }
      for (const p of selected) {
        const row = camp.contacts.find((c) => c.phone === p);
        if (row && row.status === STATUS.cancel) row.status = STATUS.in_progress;
      }
      persistCampaigns();
      msg.textContent = "Вернули в обзвон";
      render();
    };
  }

  const reloadEntry = document.getElementById("reload-entry");
  if (reloadEntry && camp) {
    reloadEntry.onclick = () => showReloadPrecheck(camp);
  }
}

function simulateUpload(file) {
  if (!file || locked()) return;
  const campId = matchPath(route(), "/cabinet/campaigns/:id/contacts")?.id;
  const camp = campaignById(campId);
  if (!camp) return;

  const progress = document.getElementById("upload-progress");
  const hint = document.getElementById("upload-progress-hint");
  const ok = document.getElementById("upload-ok");
  const errors = document.getElementById("upload-errors");
  progress.hidden = false;
  progress.textContent = "Загружаем контакты…";
  hint.hidden = false;
  ok.hidden = true;
  errors.innerHTML = "";

  setTimeout(() => {
    progress.hidden = true;
    hint.hidden = true;
    // demo parse: good + bad phone + column warning
    const demoContacts = [
      { phone: "+79001112233", name: "Анна", status: STATUS.in_progress, attempts: [], verdict: null },
      { phone: "bad", name: "", status: STATUS.in_progress, attempts: [], verdict: null, bad: true },
      { phone: "+79005556677", name: "", status: STATUS.in_progress, attempts: [], verdict: null },
    ];
    const bad = demoContacts.filter((c) => c.bad);
    const good = demoContacts.filter((c) => !c.bad);
    if (bad.length) {
      errors.innerHTML = `<p class="error">Непонятный телефон — строка не в обзвоне</p>
        <p class="error">${bad.length} строк с ошибкой телефона не загрузили</p>
        <p class="hint">Нужен российский номер: 8…, 7… или +7…</p>`;
    }

    const newCols = ["имя", "город"];
    const had = camp.columns || [];
    const brandNew = newCols.filter((c) => !had.includes(c));
    camp.columns = [...new Set([...had, ...newCols])];

    if (camp.contacts?.length) {
      // reload path
      showReloadPrecheck(camp, good, brandNew);
      return;
    }

    if (brandNew.length && had.length) {
      showNewColumnAlert(camp, good, brandNew);
      return;
    }

    // name column may be empty — OK (FE-051)
    camp.uploadWarnings = [];
    if (!camp.scenarioText?.includes("{город}") && camp.scenarioText?.includes("{компания}")) {
      camp.uploadWarnings.push('Нет столбца «компания» в файле');
    }
    camp.contacts = good;
    persistCampaigns();
    ok.hidden = false;
    ok.textContent = "Контакты загружены";
    render();
  }, 500);
}

function showNewColumnAlert(camp, good, brandNew) {
  const box = document.getElementById("new-col-alert");
  if (!box) return;
  box.hidden = false;
  const afterStart = isStarted(camp);
  box.innerHTML = afterStart
    ? `<p><strong>В новой порции есть поле, которого не было у старых номеров</strong></p>
       <p class="hint">${escapeHtml(brandNew.join(", "))}</p>
       <button class="btn secondary" type="button" id="newcol-cancel">Отменить</button>`
    : `<p><strong>В файле новое поле</strong></p>
       <p class="hint">${escapeHtml(brandNew.join(", "))}</p>
       <button class="btn secondary" type="button" id="newcol-cancel">Отменить</button>
       <button class="btn" type="button" id="newcol-add">Добавить поле в сценарий и подтвердить</button>`;
  document.getElementById("newcol-cancel").onclick = () => {
    box.hidden = true;
    flash("Догрузка отменена — в кампанию ничего не добавили");
  };
  const add = document.getElementById("newcol-add");
  if (add) {
    add.onclick = () => {
      camp.contacts = [...(camp.contacts || []), ...good];
      persistCampaigns();
      box.hidden = true;
      flash("Номера добавлены");
      render();
    };
  }
}

function showReloadPrecheck(camp, incoming, brandNew) {
  const box = document.getElementById("reload-precheck");
  if (!box) return;
  const neu = incoming || [
    { phone: "+79009998877", name: "Игорь", status: STATUS.in_progress, attempts: [], verdict: null },
  ];
  const dupCount = (camp.contacts || []).filter((c) => neu.some((n) => n.phone === c.phone)).length || 1;
  box.hidden = false;
  box.innerHTML = `<h4>Предпроверка</h4>
    <p class="hint">Покажите расхождения до подтверждения</p>
    <p>Обновим данные у ${dupCount} уже загруженных номеров</p>
    <p class="hint">Тот же телефон — не второй контакт, а обновление полей</p>
    ${
      brandNew?.length
        ? `<p class="error">В файле новое поле: ${escapeHtml(brandNew.join(", "))}</p>`
        : ""
    }
    <button class="btn" type="button" id="reload-confirm">Подтвердить догрузку</button>
    <button class="btn secondary" type="button" id="reload-cancel">Отменить</button>`;
  document.getElementById("reload-cancel").onclick = () => {
    box.hidden = true;
  };
  document.getElementById("reload-confirm").onclick = () => {
    if (brandNew?.length && isStarted(camp)) {
      showNewColumnAlert(camp, neu, brandNew);
      box.hidden = true;
      return;
    }
    let added = 0;
    let updated = 0;
    for (const n of neu) {
      const existing = camp.contacts.find((c) => c.phone === n.phone);
      if (existing) {
        existing.name = n.name || existing.name;
        updated++;
      } else {
        camp.contacts.push(n);
        added++;
      }
    }
    persistCampaigns();
    box.hidden = true;
    flash(`Догрузка принята: +${added} новых, обновлено ${updated}`);
    const tip = document.createElement("p");
    tip.className = "hint";
    tip.textContent = "В живой обзвон сразу не попадёт — возьмёт очередь";
    document.querySelector(".main")?.appendChild(tip);
    render();
  };
}

function bindLaunch() {
  const campId = matchPath(route(), "/cabinet/campaigns/:id/launch")?.id;
  const camp = campId ? campaignById(campId) : null;
  if (!camp) return;

  const start = document.getElementById("dial-start");
  if (start) {
    start.onclick = () => {
      if (locked() || launchBlockReasons(camp).length) return;
      const prog = document.getElementById("dial-progress");
      if (prog) prog.hidden = false;
      setTimeout(() => {
        camp.dial_state = "running";
        // seed demo status data
        for (const ct of camp.contacts || []) {
          if (!ct.attempts?.length) {
            ct.status = STATUS.in_progress;
            ct.attempts = [{ when: new Date().toISOString().slice(0, 16).replace("T", " "), outcome: "no_pickup" }];
          }
        }
        if (camp.contacts?.[0]) {
          camp.contacts[0].status = STATUS.done;
          camp.contacts[0].verdict = "Дошли до цели";
          camp.contacts[0].attempts = [
            { when: new Date().toISOString().slice(0, 16).replace("T", " "), outcome: "connected" },
          ];
          camp.contacts[0].transcript = "Краткий текст разговора (демо)";
        }
        camp.analytics = {
          calls: camp.contacts?.length || 0,
          avgDuration: "0:42",
          goalReached: 1,
          minutes: 3,
          cost: 3 * state.companyTariff,
        };
        persistCampaigns();
        render();
      }, 400);
    };
  }
  const pause = document.getElementById("dial-pause");
  if (pause) {
    pause.onclick = () => {
      camp.dial_state = "paused";
      persistCampaigns();
      render();
    };
  }
  const resume = document.getElementById("dial-resume");
  if (resume) {
    resume.onclick = () => {
      camp.dial_state = "running";
      persistCampaigns();
      render();
    };
  }
  const stop = document.getElementById("dial-stop");
  if (stop) {
    stop.onclick = () => {
      document.getElementById("stop-confirm").hidden = false;
    };
  }
  const stopYes = document.getElementById("stop-yes");
  if (stopYes) {
    stopYes.onclick = () => {
      camp.dial_state = "stopped";
      persistCampaigns();
      render();
    };
  }
  const stopNo = document.getElementById("stop-no");
  if (stopNo) stopNo.onclick = () => {
    document.getElementById("stop-confirm").hidden = true;
  };
}

function bindStatuses() {
  const q = document.getElementById("status-q");
  const f = document.getElementById("status-filter");
  const outcome = document.getElementById("outcome-filter");
  const reset = document.getElementById("status-reset");
  if (q) {
    q.onchange = () => {
      localStorage.setItem("cm_status_q", q.value);
      render();
    };
  }
  if (f) {
    f.onchange = () => {
      localStorage.setItem("cm_status_filter", f.value);
      render();
    };
  }
  if (outcome) {
    outcome.onchange = () => {
      localStorage.setItem("cm_outcome_filter", outcome.value);
      render();
    };
  }
  if (reset) {
    reset.onclick = () => {
      localStorage.removeItem("cm_status_q");
      localStorage.removeItem("cm_status_filter");
      localStorage.removeItem("cm_outcome_filter");
      render();
    };
  }
}

function bindAnalytics() {
  const btn = document.getElementById("export-excel");
  if (!btn) return;
  btn.onclick = () => {
    const st = document.getElementById("export-status");
    const err = document.getElementById("export-error");
    err.hidden = true;
    st.hidden = false;
    st.textContent = "Готовим файл…";
    btn.disabled = true;
    setTimeout(() => {
      st.textContent = "";
      st.hidden = true;
      btn.disabled = false;
      // demo download of CSV stand-in
      const blob = new Blob(["campaign,minutes,cost\n"], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "analytics.csv";
      a.click();
    }, 700);
  };
}

function clearSession() {
  state.session = "";
  state.role = "";
  state.companyLocked = false;
  state.impersonate = null;
  localStorage.removeItem("cm_session");
  localStorage.removeItem("cm_role");
  localStorage.removeItem("cm_locked");
  localStorage.removeItem("cm_impersonate");
}

function bindLogin() {
  const form = document.getElementById("login-form");
  const err = document.getElementById("form-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const loginName = document.getElementById("login").value.trim();
    const password = document.getElementById("password").value;
    if (!loginName) {
      err.hidden = false;
      err.textContent = "Введите логин";
      return;
    }
    if (!password) {
      err.hidden = false;
      err.textContent = "Введите пароль";
      return;
    }
    const submit = document.getElementById("submit");
    submit.textContent = "Входим…";
    submit.disabled = true;
    try {
      const data = await apiLogin(loginName, password);
      state.session = data.session;
      state.role = data.role;
      state.companyLocked = Boolean(data.company_locked);
      localStorage.setItem("cm_session", data.session);
      localStorage.setItem("cm_role", data.role);
      localStorage.setItem("cm_locked", state.companyLocked ? "1" : "0");
      navigate(data.role === "superadmin" ? "/admin/companies" : "/cabinet/campaigns");
    } catch {
      document.getElementById("password").value = "";
      err.hidden = false;
      err.textContent = ERROR_BY_CODE.auth_failed;
    } finally {
      submit.textContent = "Войти";
      submit.disabled = false;
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

window.addEventListener("hashchange", render);
render();
