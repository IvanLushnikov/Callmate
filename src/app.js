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

const FLOW_NAV = [
  { id: "sec-telephony", label: "Телефония" },
  { id: "sec-campaign", label: "Кампания" },
  { id: "sec-scenario", label: "Сценарий" },
  { id: "sec-contacts", label: "Контакты" },
  { id: "sec-launch", label: "Запуск" },
  { id: "sec-statuses", label: "Статусы" },
  { id: "sec-analytics", label: "Аналитика" },
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
  activeCampaignId: localStorage.getItem("cm_active_campaign") || "",
  uiFlash: null,
  ui: {
    telephonyPanel: null,
    showNewCampaign: false,
    adminExpandedId: null,
    statusExpandKey: null,
  },
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

function persistActiveCampaign() {
  if (state.activeCampaignId) {
    localStorage.setItem("cm_active_campaign", state.activeCampaignId);
  } else {
    localStorage.removeItem("cm_active_campaign");
  }
}

function setActiveCampaignId(id) {
  state.activeCampaignId = id ? String(id) : "";
  persistActiveCampaign();
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

/** Redirect legacy deep links; preserve campaign id when present. */
function normalizeRoute(path) {
  if (path.startsWith("/cabinet") && path !== "/cabinet") {
    if (path === "/cabinet/campaigns/new") {
      state.ui.showNewCampaign = true;
      navigate("/cabinet");
      return true;
    }
    const fromCamp =
      matchPath(path, "/cabinet/campaigns/:id") ||
      matchPath(path, "/cabinet/campaigns/:id/scenario") ||
      matchPath(path, "/cabinet/campaigns/:id/contacts") ||
      matchPath(path, "/cabinet/campaigns/:id/schedule") ||
      matchPath(path, "/cabinet/campaigns/:id/launch");
    const fromStatus = matchPath(path, "/cabinet/statuses/:campId/:phone");
    const fromStatusCamp = matchPath(path, "/cabinet/statuses/:campId");
    if (fromCamp?.id && fromCamp.id !== "new") setActiveCampaignId(fromCamp.id);
    else if (fromStatus?.campId) {
      setActiveCampaignId(fromStatus.campId);
      state.ui.statusExpandKey = `${fromStatus.campId}|${fromStatus.phone}`;
    } else if (fromStatusCamp?.campId) setActiveCampaignId(fromStatusCamp.campId);
    navigate("/cabinet");
    return true;
  }
  if (path.startsWith("/admin") && path !== "/admin") {
    if (path !== "/admin/companies/new" && path !== "/admin/settings") {
      const card = matchPath(path, "/admin/companies/:id");
      const topup = matchPath(path, "/admin/companies/:id/topup");
      if (card?.id && card.id !== "new") state.ui.adminExpandedId = card.id;
      if (topup?.id) state.ui.adminExpandedId = topup.id;
    }
    navigate("/admin");
    return true;
  }
  return false;
}

function campaignById(id) {
  return state.campaigns.find((c) => String(c.id) === String(id));
}

function companyById(id) {
  return state.companies.find((c) => String(c.id) === String(id));
}

function activeCampaign() {
  if (!state.campaigns.length) return null;
  const byId = campaignById(state.activeCampaignId);
  if (byId) return byId;
  const first = state.campaigns[0];
  setActiveCampaignId(first.id);
  return first;
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

function flowNavHtml() {
  return `<nav class="flow-nav" aria-label="Разделы кабинета">
    ${FLOW_NAV.map(
      (item) =>
        `<a href="#/cabinet" data-jump="${item.id}">${item.label}</a>`
    ).join("")}
  </nav>`;
}

function cabinetShell() {
  return `<div class="page-shell">
    <header class="page-topbar">
      <p class="brand">CallMate</p>
      <div class="page-topbar-actions">
        ${themeControls()}
        <button class="btn secondary" id="logout" type="button">Выйти</button>
      </div>
    </header>
    ${flowNavHtml()}
    <main class="page">
      ${impersonateBanner()}
      ${lockedBanner()}
      ${flashHtml()}
      ${cabinetPage()}
    </main>
  </div>`;
}

function adminShell() {
  return `<div class="page-shell">
    <header class="page-topbar">
      <p class="brand">CallMate · Админка</p>
      <div class="page-topbar-actions">
        ${themeControls()}
        <button class="btn secondary" id="logout" type="button">Выйти</button>
      </div>
    </header>
    <main class="page">
      ${flashHtml()}
      ${adminPage()}
    </main>
  </div>`;
}

/* ---------- admin (one page) ---------- */

function adminPage() {
  return `${adminNewCompany()}
  ${adminCompanyList()}
  <section class="flow-section" id="sec-admin-settings">
    <h2>Настройки продукта</h2>
    ${adminSettings()}
  </section>`;
}

function adminCompanyList() {
  if (!state.companies.length) {
    return `<section class="flow-section">
      <h2>Компании</h2>
      <div class="panel wide"><p>Пока нет компаний</p></div>
    </section>`;
  }
  const rows = state.companies
    .map((c) => {
      const access = c.access_status === "locked" ? "Заблокирована" : "Активна";
      const tariff = c.price_per_minute != null ? c.price_per_minute : "—";
      const expanded = String(state.ui.adminExpandedId) === String(c.id);
      return `<tr>
        <td>
          <button type="button" class="linkish" data-expand-company="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>
        </td>
        <td>${access}</td>
        <td>${escapeHtml(c.created_at || "")}</td>
        <td>Тариф за минуту: ${escapeHtml(String(tariff))}</td>
      </tr>
      ${expanded ? `<tr class="expand-row"><td colspan="4">${adminCompanyCardInline(c)}</td></tr>` : ""}`;
    })
    .join("");
  return `<section class="flow-section">
    <h2>Компании</h2>
    <div class="panel wide">
      <table class="data">
        <thead><tr><th>Компания</th><th>Доступ</th><th>Создана</th><th>Тариф</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function adminNewCompany() {
  return `<section class="flow-section">
    <h2>Создать компанию</h2>
    <form class="panel" id="new-company-form">
      <label>Название компании</label><input id="co-name" />
      <label>Логин</label><input id="co-login" placeholder="Ваш логин" />
      <label>Пароль</label><input id="co-password" type="password" placeholder="Пароль" />
      <div class="error" id="co-error" hidden></div>
      <p class="hint ok-line" id="co-ok" hidden>Компания создана</p>
      <button class="btn" type="submit">Создать</button>
    </form>
  </section>`;
}

function adminCompanyCardInline(c) {
  const lockedCo = c.access_status === "locked";
  const mins =
    c.price_per_minute > 0 ? Math.floor((c.balance || 0) / c.price_per_minute) : 0;
  const hist = (c.history || [])
    .slice(-8)
    .reverse()
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join("") || "<li class='hint'>Пока пусто</li>";
  return `<div class="panel nested" data-company-card="${escapeHtml(c.id)}">
    <p><strong>${escapeHtml(c.name)}</strong> · ${escapeHtml(c.login || "")}</p>
    <p>Статус: ${lockedCo ? "Заблокирована" : "Активна"}</p>
    <p>Баланс: ${escapeHtml(String(c.balance || 0))} ₽
      <span class="hint">≈ ${mins} мин по тарифу</span></p>
    <p>Тариф за минуту: ${escapeHtml(String(c.price_per_minute ?? "—"))}</p>
    <form id="topup-form" data-id="${escapeHtml(c.id)}" class="nested-form">
      <label>Пополнить, ₽</label>
      <input id="topup-amount" type="number" min="0" step="1" />
      <div class="error" id="topup-error" hidden></div>
      <p class="hint ok-line" id="topup-ok" hidden>Баланс пополнен</p>
      <button class="btn" type="submit">Пополнить</button>
    </form>
    <div class="row-actions">
      <button class="btn secondary" type="button" id="change-tariff" data-id="${escapeHtml(c.id)}">Сменить тариф</button>
      <button class="btn secondary" type="button" id="open-cabinet" data-id="${escapeHtml(c.id)}">Открыть кабинет</button>
      <button class="btn secondary" type="button" id="toggle-lock" data-id="${escapeHtml(c.id)}">
        ${lockedCo ? "Разблокировать" : "Заблокировать"}
      </button>
      <button class="btn secondary" type="button" data-collapse-company>Свернуть</button>
    </div>
    <div id="lock-dialog" class="panel nested" hidden>
      <p>Заблокировать компанию? Клиент сможет только смотреть. Обзвон остановится</p>
      <button class="btn" type="button" id="lock-confirm" data-id="${escapeHtml(c.id)}">Заблокировать</button>
      <button class="btn secondary" type="button" id="lock-cancel">Отмена</button>
    </div>
    <h3>История</h3>
    <ul>${hist}</ul>
  </div>`;
}

function adminSettings() {
  const interval = localStorage.getItem("cm_interval") || "30";
  const tariff = localStorage.getItem("cm_default_tariff") || "0";
  return `<div>
    <form class="panel" id="interval-form">
      <h3>Интервал подачи пачек</h3>
      <label>Интервал подачи пачек (секунды)</label>
      <input id="interval-sec" type="number" min="1" value="${escapeHtml(interval)}" />
      <p class="hint">Клиенты компаний это значение не видят и не меняют</p>
      <p class="hint">Обычно 30 секунд</p>
      <div class="error" id="interval-error" hidden></div>
      <p class="hint ok-line" id="interval-ok" hidden>Интервал сохранён</p>
      <button class="btn" type="submit">Сохранить</button>
    </form>
    <form class="panel" id="default-tariff-form" style="margin-top:1rem">
      <h3>Тариф по умолчанию</h3>
      <label>Цена минуты для новых компаний</label>
      <input id="default-tariff" type="number" min="0" step="0.01" value="${escapeHtml(tariff)}" />
      <p class="hint">Подставится при создании компании. Потом можно сменить в карточке</p>
      <div class="error" id="tariff-error" hidden></div>
      <p class="hint ok-line" id="tariff-ok" hidden>Сохранено</p>
      <button class="btn" type="submit">Сохранить</button>
    </form>
  </div>`;
}

/* ---------- cabinet sections ---------- */

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

function cabinetPage() {
  const camp = activeCampaign();
  return `
    ${sectionTelephony()}
    ${sectionCampaign(camp)}
    ${sectionScenario(camp)}
    ${sectionContacts(camp)}
    ${sectionSchedule(camp)}
    ${sectionLaunch(camp)}
    ${sectionStatuses(camp)}
    ${sectionAnalytics(camp)}
  `;
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

function sipFormInline() {
  return `<form class="panel nested" id="sip-form">
    <h3>SIP</h3>
    <label>Адрес</label><input id="sip-host" placeholder="sip.example.com" ${roAttr()} />
    <label>Логин</label><input id="sip-login" placeholder="Ваш логин" ${roAttr()} />
    <label>Пароль</label><input id="sip-password" type="password" placeholder="Пароль" ${roAttr()} />
    <p class="hint">Пароль сохраним, но снова не покажем</p>
    ${linesField(state.telephony.lines != null ? state.telephony.lines : "", { standalone: false })}
    <div class="error" id="sip-error" hidden></div>
    <div class="row-actions">
      <button class="btn" type="submit" ${roAttr()}>Сохранить</button>
      <button class="btn secondary" type="button" id="sip-check" ${roAttr()}>Проверить подключение</button>
      <button class="btn secondary" type="button" data-close-tel-panel>Свернуть</button>
    </div>
  </form>`;
}

function mangoFormInline() {
  return `<form class="panel nested" id="mango-form">
    <h3>Манго Телеком</h3>
    <label>Логин</label><input id="mango-login" placeholder="Ваш логин" ${roAttr()} />
    <label>Пароль</label><input id="mango-password" type="password" placeholder="Пароль" ${roAttr()} />
    <p class="hint">Пароль сохраним, но снова не покажем</p>
    ${linesField(state.telephony.lines != null ? state.telephony.lines : "", { standalone: false })}
    <div class="error" id="mango-error" hidden></div>
    <p class="hint ok-line" id="mango-ok" hidden>Телефония подключена</p>
    <div class="row-actions">
      <button class="btn" type="submit" ${roAttr()}>Подключить</button>
      <button class="btn secondary" type="button" data-close-tel-panel>Свернуть</button>
    </div>
  </form>`;
}

function sectionTelephony() {
  const t = state.telephony;
  const linesVal = t.lines != null ? t.lines : "";
  const panel = state.ui.telephonyPanel;
  let body = "";
  if (t.checking) {
    body = `<p><strong>Проверяем подключение…</strong></p>
      <p class="hint">Это не обзвон — только проверка связи</p>`;
  } else if (t.status === "ok") {
    body = `<p><strong>Телефония подключена</strong></p>
      <p class="hint">Можно создавать кампанию и запускать обзвон</p>
      ${linesField(linesVal)}
      <div class="row-actions">
        <button class="btn secondary" type="button" data-open-tel="sip" ${roAttr()}>Изменить данные</button>
      </div>`;
  } else if (t.status === "error") {
    const msg = ERROR_BY_CODE[t.lastError] || ERROR_BY_CODE.sip_unknown;
    body = `<h3>Не удалось подключить телефонию</h3>
      <p class="error">${escapeHtml(msg)}</p>
      <div class="row-actions">
        <button class="btn" type="button" id="sip-recheck" ${roAttr()}>Проверить снова</button>
        <button class="btn secondary" type="button" data-open-tel="sip" ${roAttr()}>Изменить данные</button>
      </div>
      ${linesField(linesVal)}`;
  } else {
    body = `<p>Подключите телефонию, чтобы звонить</p>
      <div class="row-actions">
        <button class="btn" type="button" data-open-tel="sip" ${roAttr()}>Подключить SIP</button>
        <button class="btn secondary" type="button" data-open-tel="mango" ${roAttr()}>Подключить через Манго</button>
      </div>
      ${linesField(linesVal)}`;
  }
  const expand =
    panel === "sip" ? sipFormInline() : panel === "mango" ? mangoFormInline() : "";
  return `<section class="flow-section" id="sec-telephony">
    <h2>Телефония</h2>
    <div class="panel wide">${body}${expand}</div>
  </section>`;
}

function newCampaignFormInline() {
  return `<form class="panel nested" id="new-campaign-form">
    <h3>Новая кампания</h3>
    <label>Название</label><input id="camp-name" ${roAttr()} />
    <p class="hint">Пустое имя — не мешает запуску</p>
    <label>Цель звонка</label>
    <input id="camp-goal" placeholder="Например: напомнить о записи" ${roAttr()} />
    <p class="hint">К чему должен привести разговор</p>
    <label>Сведения</label>
    <textarea id="camp-details" rows="4" placeholder="Что важно сказать абоненту" ${roAttr()}></textarea>
    <p class="hint">Что роботу знать о продукте и ситуации</p>
    <div class="error" id="camp-error" hidden></div>
    <div class="row-actions">
      <button class="btn" type="submit" ${roAttr()}>Сохранить</button>
      <button class="btn secondary" type="button" id="cancel-new-campaign">Отмена</button>
    </div>
  </form>`;
}

function sectionCampaign(camp) {
  if (!state.campaigns.length || state.ui.showNewCampaign) {
    const create = locked()
      ? `<button class="btn" type="button" disabled>Создать кампанию</button>
         <p class="hint">Аккаунт заблокирован</p>`
      : state.ui.showNewCampaign || !state.campaigns.length
        ? newCampaignFormInline()
        : "";
    const emptyHint = !state.campaigns.length
      ? `<p>Создайте первую кампанию</p>`
      : "";
    const showCreateBtn =
      state.campaigns.length && !state.ui.showNewCampaign && !locked()
        ? `<button class="btn" type="button" id="show-new-campaign">Создать кампанию</button>`
        : "";
    if (!state.campaigns.length) {
      return `<section class="flow-section" id="sec-campaign">
        <h2>Кампания</h2>
        <div class="panel wide">${emptyHint}${create}</div>
      </section>`;
    }
  }

  const options = state.campaigns
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}" ${String(c.id) === String(camp?.id) ? "selected" : ""}>${escapeHtml(c.name || "Без названия")} · ${dialLabel(c.dial_state)}</option>`
    )
    .join("");

  const started = camp && isStarted(camp);
  const weak = camp && isWeakScenario(camp);
  const verdicts = camp ? ensureVerdicts(camp) : [];

  return `<section class="flow-section" id="sec-campaign">
    <h2>Кампания</h2>
    <div class="panel wide">
      <label>Активная кампания</label>
      <select id="active-campaign-select">${options}</select>
      <div class="row-actions">
        ${
          locked()
            ? `<button class="btn" type="button" disabled>Создать кампанию</button>`
            : `<button class="btn secondary" type="button" id="show-new-campaign">Создать кампанию</button>`
        }
      </div>
      ${state.ui.showNewCampaign && !locked() ? newCampaignFormInline() : ""}
      ${
        camp
          ? `<h3 style="margin-top:1rem">${escapeHtml(camp.name || "Без названия")}</h3>
        <p>Состояние: ${dialLabel(camp.dial_state)}</p>
        <p>Цель: ${escapeHtml(camp.goal || "—")}</p>
        ${started ? `<div class="banner banner-warn">После старта сценарий и расписание только смотрим. Чтобы изменить — создайте новую кампанию</div>` : ""}
        ${
          weak && !started
            ? `<div class="banner banner-warn">
          <strong>Сценарий пока слишком слабый для обзвона</strong>
          <p class="hint">Допишите цель и сведения или поправьте текст</p>
        </div>`
            : ""
        }
        <section class="preview-blocks" style="margin-top:1rem">
          <h3>Робот так понял сценарий</h3>
          ${
            !camp.goal
              ? `<p class="hint">Сначала сохраните цель и сведения</p>`
              : (() => {
                  const preview = buildPreview(camp);
                  return `<div class="preview-grid">
            <div><h4>Приветствие</h4><p>${escapeHtml(preview.greeting)}</p>
              <p class="hint">Нет имени — в приветствии обойдёмся без обращения</p>
              <p class="hint">Если имени нет — робот его не говорит</p>
              <p class="hint">Пример: Здравствуйте!</p></div>
            <div><h4>Что говорит</h4><p>${escapeHtml(preview.says)}</p></div>
            <div><h4>Как отвечает</h4><p>${escapeHtml(preview.replies)}</p></div>
            <div><h4>Тон</h4><p>${escapeHtml(preview.tone)}</p>
              <p class="hint">Спокойно и по делу, без давления оформить любой ценой</p></div>
          </div>`;
                })()
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
        </section>`
          : ""
      }
    </div>
  </section>`;
}

function needCampPanel(title, id) {
  return `<section class="flow-section" id="${id}">
    <h2>${title}</h2>
    <div class="panel wide"><p class="hint">Сначала создайте кампанию выше</p></div>
  </section>`;
}

function sectionScenario(camp) {
  if (!camp) return needCampPanel("Сценарий", "sec-scenario");
  const started = isStarted(camp);
  const dis = started || locked() ? "disabled" : "";
  const stages =
    camp.stages && camp.stages.length
      ? camp.stages
      : camp.goal
        ? [{ goal: camp.goal, input: "Приветствие", output: "Переход к сути" }]
        : [];
  const attrs = camp.columns || [];
  return `<section class="flow-section" id="sec-scenario">
    <h2>Сценарий</h2>
    <div class="panel wide">
      ${started ? `<div class="banner banner-warn">После старта сценарий и расписание только смотрим. Чтобы изменить — создайте новую кампанию</div>` : ""}
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
            ? attrs
                .map(
                  (a) =>
                    `<button type="button" class="btn secondary attr-pick" data-attr="${escapeHtml(a)}">{${escapeHtml(a)}}</button>`
                )
                .join(" ")
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
      ${
        started
          ? `<p class="hint">После старта менять нельзя</p>
        <button class="btn" type="button" id="show-new-campaign-from-scenario">Создать кампанию</button>`
          : ""
      }
    </div>
  </section>`;
}

function sectionContacts(camp) {
  if (!camp) return needCampPanel("Контакты", "sec-contacts");
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
              <td><button type="button" class="linkish" data-jump="sec-statuses" data-expand-status="${escapeHtml(camp.id)}|${escapeHtml(r.phone)}">${escapeHtml(maskPhone(r.phone))}</button></td>
              <td>${escapeHtml(statusLabel(r.status))}</td>
              <td>${escapeHtml(r.name || "")}</td>
            </tr>`
            )
            .join("")}</tbody>
        </table>`;

  return `<section class="flow-section" id="sec-contacts">
    <h2>Контакты</h2>
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
      ${
        started
          ? `<button class="btn secondary" type="button" id="reload-entry" ${roAttr()}>Догрузить файл</button>
        <p class="hint">Серого статуса нет: пока вы не подтвердите догрузку, новые номера в обзвон не попадут</p>`
          : ""
      }
    </div>
  </section>`;
}

function sectionSchedule(camp) {
  if (!camp) {
    return `<section class="flow-section" id="sec-schedule">
      <h2>Расписание и перезвоны</h2>
      <div class="panel wide"><p class="hint">Сначала создайте кампанию выше</p></div>
    </section>`;
  }
  const started = isStarted(camp);
  const dis = started || locked() ? "disabled" : "";
  const sch = camp.schedule || { days: [], from: "10:00", to: "18:00", tz: "Europe/Moscow" };
  const dayChecks = DAYS.map(
    (d) =>
      `<label class="inline"><input type="checkbox" name="day" value="${d.id}" ${sch.days?.includes(d.id) ? "checked" : ""} ${dis} /> ${d.label}</label>`
  ).join(" ");
  return `<section class="flow-section" id="sec-schedule">
    <h2>Расписание и перезвоны</h2>
    <form class="panel wide" id="schedule-form">
      ${started ? `<div class="banner banner-warn">После старта менять нельзя</div>` : ""}
      <h3>Дни звонков</h3>
      <div class="days">${dayChecks}</div>
      <div class="error" id="days-error" hidden></div>
      <h3>Время звонков</h3>
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
    </form>
  </section>`;
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

function sectionLaunch(camp) {
  if (!camp) return needCampPanel("Запуск", "sec-launch");
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
                extra += ` <a href="#/cabinet" data-jump="sec-contacts">Загрузить файл</a>`;
              if (r.action === "tel") extra += ` <a href="#/cabinet" data-jump="sec-telephony">Телефония</a>`;
              if (r.action === "schedule")
                extra += ` <a href="#/cabinet" data-jump="sec-schedule">Расписание</a>`;
              if (r.weak) extra = ` <span class="hint">Допишите цель и сведения или поправьте текст</span>`;
              return `<li>${escapeHtml(r.text)}${extra}</li>`;
            })
            .join("")}</ul>
          <p class="hint">Пустое имя — не мешает запуску</p>
        </div>`
      : "";
  return `<section class="flow-section" id="sec-launch">
    <h2>Запуск</h2>
    <div class="panel wide" data-camp="${escapeHtml(camp.id)}">
      <p>Состояние: ${dialLabel(camp.dial_state)}</p>
      <p class="hint">Баланс: ${escapeHtml(String(state.companyBalance))} ₽ · тариф ${escapeHtml(String(state.companyTariff))} ₽/мин</p>
      ${reasonList}
      ${controls}
      <div id="stop-confirm" class="panel nested" hidden>
        <p>Остановить обзвон? Текущий разговор договорим</p>
        <button class="btn" type="button" id="stop-yes">Стоп</button>
        <button class="btn secondary" type="button" id="stop-no">Отмена</button>
      </div>
    </div>
  </section>`;
}

function contactDrawerHtml(camp, contact) {
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
  return `<div class="panel nested contact-drawer">
    <h3>Номер</h3>
    <p>${escapeHtml(maskPhone(contact.phone))}</p>
    <p><strong>Статус</strong>: ${escapeHtml(statusLabel(contact.status))}
      ${contact.status === STATUS.done ? `<span class="hint">Поговорили с человеком</span>` : ""}</p>
    <p><strong>Вердикт</strong>: ${
      contact.verdict ? escapeHtml(contact.verdict) : "Вердикта нет — разговора не было"
    }</p>
    <p class="hint">Вердикт — про цель, не про статус обзвона</p>
    <p class="hint">Вердикт — про цель кампании, не про статус</p>
    <h4>Попытки</h4>
    <table class="data">
      <thead><tr><th>№</th><th>Когда</th><th>Исход</th></tr></thead>
      <tbody>${attemptRows}</tbody>
    </table>
    <h4>Разговор</h4>
    <p class="hint">${contact.transcript ? escapeHtml(contact.transcript) : "Записи разговора пока нет"}</p>
    <button class="btn secondary" type="button" data-collapse-status>Свернуть</button>
  </div>`;
}

function sectionStatuses(camp) {
  if (!camp) return needCampPanel("Статусы", "sec-statuses");

  const f = localStorage.getItem("cm_status_filter") || "all";
  const q = (localStorage.getItem("cm_status_q") || "").trim();
  const outcomeF = localStorage.getItem("cm_outcome_filter") || "all";

  let list = (camp.contacts || []).map((ct) => ({
    ...ct,
    campaignId: camp.id,
    campaignName: camp.name,
  }));

  if (!list.length) {
    return `<section class="flow-section" id="sec-statuses">
      <h2>Статусы</h2>
      <div class="panel wide">
        <p>Пока нет звонков</p>
        <p class="hint">Когда начнёте обзвон, здесь появятся номера и статусы</p>
        <a class="btn" href="#/cabinet" data-jump="sec-campaign" style="display:inline-block">К кампании</a>
      </div>
    </section>`;
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

  return `<section class="flow-section" id="sec-statuses">
    <h2>Статусы</h2>
    <div class="panel wide">
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
        <thead><tr><th>Телефон</th><th>Статус</th><th>Имя</th></tr></thead>
        <tbody>${list
          .map((r) => {
            const key = `${r.campaignId}|${r.phone}`;
            const open = state.ui.statusExpandKey === key;
            const contact = camp.contacts.find((c) => c.phone === r.phone);
            return `<tr>
            <td><button type="button" class="linkish" data-expand-status="${escapeHtml(key)}">${escapeHtml(maskPhone(r.phone))}</button></td>
            <td><span class="badge">${escapeHtml(statusLabel(r.status))}</span></td>
            <td>${escapeHtml(r.name || "")}</td>
          </tr>
          ${open && contact ? `<tr class="expand-row"><td colspan="3">${contactDrawerHtml(camp, contact)}</td></tr>` : ""}`;
          })
          .join("")}</tbody>
      </table>`
      }
      <!-- FE-055: клиенту не показываем аварию обзвона -->
    </div>
  </section>`;
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

function sectionAnalytics(camp) {
  if (!camp || !camp.analytics) {
    return `<section class="flow-section" id="sec-analytics">
      <h2>Аналитика</h2>
      <div class="panel wide">
        <p>Пока нет данных по кампании</p>
        <button class="btn secondary" type="button" disabled title="Пока нечего выгружать">Скачать Excel</button>
        <p class="hint">Пока нечего выгружать</p>
      </div>
    </section>`;
  }
  const a = camp.analytics;
  return `<section class="flow-section" id="sec-analytics">
    <h2>Аналитика</h2>
    <div class="panel wide">
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
    </div>
  </section>`;
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
    action = `<button class="btn" id="forbidden-action" type="button">В кабинет</button>`;
  } else if (state.session && state.role === "superadmin") {
    action = `<button class="btn" id="forbidden-action" type="button">В админку</button>`;
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
  const path = route();
  if (normalizeRoute(path)) return;

  const app = document.getElementById("app");

  if (path === "/cabinet") {
    const canCabinet =
      state.session && (state.role === "company" || (state.role === "superadmin" && state.impersonate));
    if (!canCabinet) {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = cabinetShell();
    bindShell();
    clearFlashSoon();
    return;
  }
  if (path === "/admin") {
    if (!state.session || state.role !== "superadmin") {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = adminShell();
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
    else if (state.role === "company" || state.impersonate) navigate("/cabinet");
    else if (state.role === "superadmin") navigate("/admin");
    else navigate("/login");
  };
  document.getElementById("forbidden-logout").onclick = async () => {
    await apiLogout(state.session);
    clearSession();
    navigate("/login");
  };
}

function bindJumpNav() {
  document.querySelectorAll("[data-jump]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const id = el.getAttribute("data-jump");
      const expand = el.getAttribute("data-expand-status");
      if (expand) {
        state.ui.statusExpandKey = expand;
        render();
        requestAnimationFrame(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
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
      navigate("/admin");
      render();
    };
  }

  bindJumpNav();
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
      const id = `co-${Date.now()}`;
      state.companies.push({
        id,
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
      state.ui.adminExpandedId = id;
      render();
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

  document.querySelectorAll("[data-expand-company]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-expand-company");
      state.ui.adminExpandedId = String(state.ui.adminExpandedId) === String(id) ? null : id;
      render();
    };
  });
  const collapse = document.querySelector("[data-collapse-company]");
  if (collapse) {
    collapse.onclick = () => {
      state.ui.adminExpandedId = null;
      render();
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
      render();
    };
  }

  const openCab = document.getElementById("open-cabinet");
  if (openCab) {
    openCab.onclick = () => {
      const c = companyById(openCab.getAttribute("data-id"));
      state.impersonate = { id: c.id, name: c.name };
      saveJson("cm_impersonate", state.impersonate);
      state.companyLocked = c.access_status === "locked";
      navigate("/cabinet");
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
  if (lockCancel)
    lockCancel.onclick = () => {
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
  const select = document.getElementById("active-campaign-select");
  if (select) {
    select.onchange = () => {
      setActiveCampaignId(select.value);
      state.ui.statusExpandKey = null;
      state.ui.showNewCampaign = false;
      render();
    };
  }

  const showNew = document.getElementById("show-new-campaign");
  if (showNew) {
    showNew.onclick = () => {
      state.ui.showNewCampaign = true;
      render();
      document.getElementById("sec-campaign")?.scrollIntoView({ behavior: "smooth" });
    };
  }
  const showFromScenario = document.getElementById("show-new-campaign-from-scenario");
  if (showFromScenario) {
    showFromScenario.onclick = () => {
      state.ui.showNewCampaign = true;
      render();
      document.getElementById("sec-campaign")?.scrollIntoView({ behavior: "smooth" });
    };
  }
  const cancelNew = document.getElementById("cancel-new-campaign");
  if (cancelNew) {
    cancelNew.onclick = () => {
      state.ui.showNewCampaign = false;
      render();
    };
  }

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
      setActiveCampaignId(camp.id);
      state.ui.showNewCampaign = false;
      flash("Кампания создана");
      render();
      document.getElementById("sec-scenario")?.scrollIntoView({ behavior: "smooth" });
    };
  }

  const saveScenario = document.getElementById("save-scenario");
  if (saveScenario) {
    const camp = activeCampaign();
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
    const insertAttr = document.getElementById("insert-attr");
    if (insertAttr) {
      insertAttr.onclick = () => {
        const picker = document.getElementById("attr-picker");
        picker.hidden = !picker.hidden;
      };
    }
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
      const camp = activeCampaign();
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
  document.querySelectorAll("[data-open-tel]").forEach((btn) => {
    btn.onclick = () => {
      state.ui.telephonyPanel = btn.getAttribute("data-open-tel");
      render();
    };
  });
  document.querySelectorAll("[data-close-tel-panel]").forEach((btn) => {
    btn.onclick = () => {
      state.ui.telephonyPanel = null;
      render();
    };
  });

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
        state.ui.telephonyPanel = null;
        persistTelephony();
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
      state.ui.telephonyPanel = null;
    } else {
      state.telephony.status = "error";
      state.telephony.lastError = result;
    }
    persistTelephony();
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

  const camp = activeCampaign();

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
  const camp = activeCampaign();
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
      showReloadPrecheck(camp, good, brandNew);
      return;
    }

    if (brandNew.length && had.length) {
      showNewColumnAlert(camp, good, brandNew);
      return;
    }

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
    render();
  };
}

function bindLaunch() {
  const camp = activeCampaign();
  if (!camp) return;

  const start = document.getElementById("dial-start");
  if (start) {
    start.onclick = () => {
      if (locked() || launchBlockReasons(camp).length) return;
      const prog = document.getElementById("dial-progress");
      if (prog) prog.hidden = false;
      setTimeout(() => {
        camp.dial_state = "running";
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
  if (stopNo)
    stopNo.onclick = () => {
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

  document.querySelectorAll("[data-expand-status]").forEach((btn) => {
    if (btn.hasAttribute("data-jump")) return;
    btn.onclick = () => {
      const key = btn.getAttribute("data-expand-status");
      state.ui.statusExpandKey = state.ui.statusExpandKey === key ? null : key;
      render();
    };
  });
  const collapse = document.querySelector("[data-collapse-status]");
  if (collapse) {
    collapse.onclick = () => {
      state.ui.statusExpandKey = null;
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
      navigate(data.role === "superadmin" ? "/admin" : "/cabinet");
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
