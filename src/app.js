import { login as apiLogin, logout as apiLogout, hasApi, apiFetch, errorMessage, fetchSession } from "./api.js";

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

/** FE-070 / DESIGN-079 — локальные SIP/валидации; API-коды → errorMessage() */
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

const CABINET_TABS = [
  { id: "campaigns", label: "Кампании", href: "#/cabinet/campaigns" },
  { id: "integrations", label: "Интеграции", href: "#/cabinet/integrations" },
  { id: "analytics", label: "Аналитика", href: "#/cabinet/analytics" },
  { id: "tariffs", label: "Тарифы", href: "#/cabinet/tariffs" },
  { id: "account", label: "Аккаунт", href: "#/cabinet/account" },
];

const ADMIN_TABS = [
  { id: "companies", label: "Компании", href: "#/admin" },
  { id: "settings", label: "Настройки", href: "#/admin/settings" },
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
    adminEditId: null,
    adminDeleteId: null,
    adminLoaded: false,
    contactsUploading: false,
    telephonyLoaded: false,
    campaignsLoaded: false,
    gateErrors: [],
    statusExpandKey: null,
    scheduleDrawerOpen: false,
    launchReasonsDrawerOpen: false,
    contactStatusFilter: "all",
    contactOutcomeFilter: "all",
    generatePending: false,
    generateError: null,
    newCampaignDraft: { name: "", goal: "", details: "" },
    newCampaignError: null,
    saveRebuildOpen: false,
    pendingPreviewSave: null,
    contactSelectAll: false,
    contactsBulkConfirm: null,
  },
  adminSettings: {
    batch_interval_sec: Number(localStorage.getItem("cm_interval") || "30"),
    default_price_per_minute: Number(localStorage.getItem("cm_default_tariff") || "0"),
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

/** Parse cabinet hash into page descriptor. */
function parseCabinet(path) {
  if (path === "/cabinet" || path === "/cabinet/campaigns") return { tab: "campaigns", page: "list" };
  if (path === "/cabinet/campaigns/new") return { tab: "campaigns", page: "new" };
  const ws = matchPath(path, "/cabinet/campaigns/:id");
  if (ws?.id && ws.id !== "new") return { tab: "campaigns", page: "workspace", id: ws.id };
  if (path === "/cabinet/integrations") return { tab: "integrations", page: "integrations" };
  if (path === "/cabinet/analytics") return { tab: "analytics", page: "analytics" };
  if (path === "/cabinet/tariffs") return { tab: "tariffs", page: "tariffs" };
  if (path === "/cabinet/account") return { tab: "account", page: "account" };
  return null;
}

/** Redirect legacy / unknown deep links; keep valid cabinet routes. */
function normalizeRoute(path) {
  if (path.startsWith("/cabinet")) {
    if (path === "/cabinet") {
      navigate("/cabinet/campaigns");
      return true;
    }
    if (parseCabinet(path)) {
      const parsed = parseCabinet(path);
      if (parsed.page === "workspace") setActiveCampaignId(parsed.id);
      if (parsed.page === "new") state.ui.showNewCampaign = true;
      return false;
    }
    const legacySub =
      matchPath(path, "/cabinet/campaigns/:id/scenario") ||
      matchPath(path, "/cabinet/campaigns/:id/contacts") ||
      matchPath(path, "/cabinet/campaigns/:id/schedule") ||
      matchPath(path, "/cabinet/campaigns/:id/launch");
    if (legacySub?.id && legacySub.id !== "new") {
      setActiveCampaignId(legacySub.id);
      navigate(`/cabinet/campaigns/${legacySub.id}`);
      return true;
    }
    const fromStatus = matchPath(path, "/cabinet/statuses/:campId/:phone");
    const fromStatusCamp = matchPath(path, "/cabinet/statuses/:campId");
    if (fromStatus?.campId) {
      setActiveCampaignId(fromStatus.campId);
      state.ui.statusExpandKey = `${fromStatus.campId}|${fromStatus.phone}`;
      navigate(`/cabinet/campaigns/${fromStatus.campId}`);
      return true;
    }
    if (fromStatusCamp?.campId) {
      setActiveCampaignId(fromStatusCamp.campId);
      navigate(`/cabinet/campaigns/${fromStatusCamp.campId}`);
      return true;
    }
    navigate("/cabinet/campaigns");
    return true;
  }
  if (path.startsWith("/admin") && path !== "/admin" && path !== "/admin/settings") {
    if (path !== "/admin/companies/new") {
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
  const says = (camp?.preview?.says || "").trim();
  const replies = (camp?.preview?.replies || "").trim();
  const tone = (camp?.preview?.tone || "").trim();
  return !goal || details.length < 8 || !greeting || !says || !replies || !tone;
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
  const light = state.theme !== "dark";
  return `<div class="theme-segmented" role="group" aria-label="Тема">
    <button class="theme-seg${light ? " active" : ""}" data-theme-set="light" type="button" aria-pressed="${light ? "true" : "false"}">Светлая</button>
    <button class="theme-seg${!light ? " active" : ""}" data-theme-set="dark" type="button" aria-pressed="${!light ? "true" : "false"}">Тёмная</button>
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

function appTabsHtml(activeTab, tabs = CABINET_TABS) {
  return `<nav class="app-tabs" aria-label="Разделы кабинета">
    ${tabs
      .map(
        (t) =>
          `<a href="${t.href}" class="${t.id === activeTab ? "active" : ""}">${escapeHtml(t.label)}</a>`
      )
      .join("")}
  </nav>`;
}

function cabinetShell(activeTab, bodyHtml) {
  return `<div class="page-shell page-shell-desk">
    <header class="page-topbar page-topbar-desk">
      <p class="brand"><span class="brand-mark" aria-hidden="true"></span>CallMate</p>
      ${appTabsHtml(activeTab)}
      <div class="page-topbar-actions">
        ${themeControls()}
        <button class="btn secondary" id="logout" type="button">Выйти</button>
      </div>
    </header>
    <main class="page page-desk">
      ${impersonateBanner()}
      ${lockedBanner()}
      ${flashHtml()}
      ${bodyHtml}
    </main>
  </div>`;
}

function adminShell(activeTab = "companies") {
  const body =
    activeTab === "settings"
      ? `<section class="flow-section" id="sec-admin-settings">
        <h2>Настройки продукта</h2>
        ${adminSettings()}
      </section>`
      : `${adminNewCompany()}${adminCompanyList()}`;
  return `<div class="page-shell">
    <header class="page-topbar">
      <p class="brand">CallMate · Админка</p>
      ${appTabsHtml(activeTab, ADMIN_TABS)}
      <div class="page-topbar-actions">
        ${themeControls()}
        <button class="btn secondary" id="logout" type="button">Выйти</button>
      </div>
    </header>
    <main class="page">
      ${flashHtml()}
      ${body}
    </main>
  </div>`;
}

/* ---------- admin ---------- */

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
  const editing = String(state.ui.adminEditId) === String(c.id);
  const deleting = String(state.ui.adminDeleteId) === String(c.id);
  const bal = Number(c.balance || 0);
  const hist = (c.history || [])
    .slice(-8)
    .reverse()
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join("") || "<li class='hint'>Пока пусто</li>";
  const editForm = editing
    ? `<form id="edit-company-form" class="admin-edit-form" data-id="${escapeHtml(c.id)}">
        <h3>Изменить компанию</h3>
        <label>Название</label>
        <input id="edit-company-name" type="text" required value="${escapeHtml(c.name || "")}" autocomplete="organization" />
        <label>Логин</label>
        <input id="edit-company-login" type="text" required value="${escapeHtml(c.login || "")}" autocomplete="username" />
        <label>Новый пароль</label>
        <input id="edit-company-password" type="password" value="" autocomplete="new-password" />
        <p class="hint">Оставьте пустым, если пароль менять не нужно</p>
        <div class="error" id="edit-company-error" hidden></div>
        <p class="hint ok-line" id="edit-company-ok" hidden>Сохранено</p>
        <div class="row-actions">
          <button class="btn" type="submit">Сохранить</button>
          <button class="btn secondary" type="button" id="edit-company-cancel">Отменить</button>
        </div>
      </form>`
    : "";
  const deleteModal = deleting
    ? `<div class="modal-backdrop" id="delete-company-backdrop" role="presentation">
        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-company-title">
          <h3 id="delete-company-title">Удалить компанию?</h3>
          <p>Компания, кабинет, кампании и номера будут удалены без восстановления.</p>
          ${
            bal > 0
              ? `<label class="check-line"><input type="checkbox" id="delete-forfeit-balance" /> Списать остаток баланса: ${escapeHtml(String(bal))} ₽</label>`
              : ""
          }
          <div class="error" id="delete-company-error" hidden></div>
          <div class="row-actions">
            <button class="btn secondary" type="button" id="delete-company-cancel" autofocus>Отменить</button>
            <button class="btn danger" type="button" id="delete-company-confirm" data-id="${escapeHtml(c.id)}">Удалить</button>
          </div>
        </div>
      </div>`
    : "";
  return `<div class="admin-company-card" data-company-card="${escapeHtml(c.id)}">
    <div class="admin-company-head">
      <p class="admin-company-title"><strong>${escapeHtml(c.name)}</strong> · ${escapeHtml(c.login || "")}</p>
      <p class="admin-company-balance">${escapeHtml(String(bal))} ₽
        <span class="hint">≈ ${mins} мин по тарифу</span></p>
      <p class="hint">Тариф за минуту: ${escapeHtml(String(c.price_per_minute ?? "—"))}</p>
      <p class="admin-company-status">Статус: ${lockedCo ? "Заблокирована" : "Активна"}</p>
    </div>
    ${editForm}
    <div class="nested-form" data-packages="${escapeHtml(c.id)}">
      <h3>Пакеты минут</h3>
      <p class="hint">Пополнение по пакету ставит тариф ступени. Уже лежащий баланс не пересчитываем.</p>
      <table class="data">
        <thead><tr><th>Пакет</th><th>₽/мин</th><th>Сумма</th><th></th></tr></thead>
        <tbody>
          <tr><td>1 000 мин</td><td>8</td><td>8 000 ₽</td><td><button class="btn secondary" type="button" data-apply-package="pkg_1000" data-id="${escapeHtml(c.id)}" data-label="1 000 мин / 8 000 ₽ / 8 ₽/мин">Выбрать</button></td></tr>
          <tr><td>3 000 мин</td><td>7</td><td>21 000 ₽</td><td><button class="btn secondary" type="button" data-apply-package="pkg_3000" data-id="${escapeHtml(c.id)}" data-label="3 000 мин / 21 000 ₽ / 7 ₽/мин">Выбрать</button></td></tr>
          <tr><td>5 000 мин</td><td>6</td><td>30 000 ₽</td><td><button class="btn secondary" type="button" data-apply-package="pkg_5000" data-id="${escapeHtml(c.id)}" data-label="5 000 мин / 30 000 ₽ / 6 ₽/мин">Выбрать</button></td></tr>
          <tr><td>10 000 мин</td><td>5</td><td>50 000 ₽</td><td><button class="btn secondary" type="button" data-apply-package="pkg_10000" data-id="${escapeHtml(c.id)}" data-label="10 000 мин / 50 000 ₽ / 5 ₽/мин">Выбрать</button></td></tr>
          <tr><td>25 000 мин</td><td>4</td><td>100 000 ₽</td><td><button class="btn secondary" type="button" data-apply-package="pkg_25000" data-id="${escapeHtml(c.id)}" data-label="25 000 мин / 100 000 ₽ / 4 ₽/мин">Выбрать</button></td></tr>
        </tbody>
      </table>
      <p class="hint ok-line" id="package-ok" hidden>Баланс и тариф обновлены</p>
      <div class="error" id="package-error" hidden></div>
    </div>
    <form id="topup-form" data-id="${escapeHtml(c.id)}" class="nested-form">
      <label>Пополнить, ₽</label>
      <input id="topup-amount" type="number" min="0" step="1" />
      <div class="error" id="topup-error" hidden></div>
      <p class="hint ok-line" id="topup-ok" hidden>Баланс пополнен</p>
      <button class="btn" type="submit">Пополнить</button>
    </form>
    <div class="row-actions admin-card-actions">
      <button class="btn secondary" type="button" id="change-tariff" data-id="${escapeHtml(c.id)}">Сменить тариф</button>
      <button class="btn secondary" type="button" id="open-cabinet" data-id="${escapeHtml(c.id)}">Открыть кабинет</button>
      <button class="btn secondary" type="button" id="toggle-lock" data-id="${escapeHtml(c.id)}">
        ${lockedCo ? "Разблокировать" : "Заблокировать"}
      </button>
      <button class="btn secondary" type="button" id="edit-company" data-id="${escapeHtml(c.id)}">Изменить</button>
      <button class="btn secondary" type="button" data-collapse-company>Свернуть</button>
    </div>
    <div class="admin-danger-row">
      <button class="btn ghost danger-ghost" type="button" id="delete-company" data-id="${escapeHtml(c.id)}">Удалить компанию</button>
    </div>
    <div id="lock-dialog" class="admin-lock-dialog" hidden>
      <p>Заблокировать компанию? Клиент сможет только смотреть. Обзвон остановится</p>
      <div class="row-actions">
        <button class="btn" type="button" id="lock-confirm" data-id="${escapeHtml(c.id)}">Заблокировать</button>
        <button class="btn secondary" type="button" id="lock-cancel">Отмена</button>
      </div>
    </div>
    <div class="admin-company-history">
      <h3>История</h3>
      <ul>${hist}</ul>
    </div>
    ${deleteModal}
  </div>`;
}

function adminSettings() {
  const interval = String(state.adminSettings.batch_interval_sec ?? 30);
  const tariff = String(state.adminSettings.default_price_per_minute ?? 0);
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

function formatLedgerEntry(e) {
  if (typeof e === "string") return e;
  if (!e || typeof e !== "object") return "";
  if (e.type === "top_up") return `Пополнение +${e.amount_rub} ₽`;
  if (e.type === "tariff_change" || e.type === "set_tariff") return `Тариф: ${e.price_per_minute} ₽/мин`;
  if (e.comment) return String(e.comment);
  return String(e.type || "Операция");
}

function mapAdminCompany(c) {
  const ledger = c.ledger_preview || c.entries || c.history || [];
  return {
    id: c.id,
    name: c.name || "",
    login: c.login || "",
    access_status: c.access_status || "active",
    created_at: String(c.created_at || "").slice(0, 10),
    price_per_minute: c.price_per_minute,
    balance: c.balance_rub != null ? c.balance_rub : c.balance || 0,
    history: Array.isArray(ledger) ? ledger.map(formatLedgerEntry) : [],
  };
}

async function refreshAdminCompanies() {
  if (!hasApi()) return;
  const data = await apiFetch("/api/admin/companies", { session: state.session });
  const items = (data?.items || []).map(mapAdminCompany);
  const expanded = state.ui.adminExpandedId;
  if (expanded) {
    try {
      const card = await apiFetch(`/api/admin/companies/${encodeURIComponent(expanded)}`, {
        session: state.session,
      });
      const mapped = mapAdminCompany(card);
      state.companies = items.map((c) => (String(c.id) === String(expanded) ? { ...c, ...mapped } : c));
    } catch {
      state.companies = items;
    }
  } else {
    state.companies = items;
  }
  state.ui.adminLoaded = true;
}

async function refreshAdminSettings() {
  if (!hasApi()) return;
  const data = await apiFetch("/api/admin/settings", { session: state.session });
  state.adminSettings = {
    batch_interval_sec: data.batch_interval_sec ?? 30,
    default_price_per_minute: data.default_price_per_minute ?? 0,
  };
}

async function ensureAdminData() {
  if (!hasApi() || state.role !== "superadmin" || state.impersonate) return;
  try {
    await Promise.all([refreshAdminCompanies(), refreshAdminSettings()]);
    render();
  } catch (e) {
    flash(errorMessage(e?.code), "error");
  }
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
    ever_started: false,
    ...partial,
  };
}

function mapCampaignFromApi(c, existing = {}) {
  const schedule =
    c.schedule && (c.schedule.days || c.schedule.from || c.schedule.tz)
      ? {
          days: c.schedule.days || existing.schedule?.days || ["mon", "tue", "wed", "thu", "fri"],
          from: c.schedule.from || c.schedule.start_hour || existing.schedule?.from || "10:00",
          to: c.schedule.to || c.schedule.end_hour || existing.schedule?.to || "18:00",
          tz: c.schedule.tz || c.schedule.region || existing.schedule?.tz || "Europe/Moscow",
        }
      : existing.schedule || emptyCampaign().schedule;
  return emptyCampaign({
    ...existing,
    id: c.id,
    name: existing.name || (c.goal || "").slice(0, 48),
    goal: c.goal || "",
    details: c.details || "",
    dial_state: c.dial_state || "draft",
    ever_started: Boolean(c.ever_started),
    scenarioText: c.scenario_text != null ? c.scenario_text : existing.scenarioText || "",
    stages: Array.isArray(c.stages) ? c.stages : existing.stages || [],
    verdicts: Array.isArray(c.verdicts) ? c.verdicts : existing.verdicts || [],
    schedule,
    retries: c.retries_max != null ? c.retries_max : existing.retries ?? 2,
    contacts: existing.contacts || [],
    columns: existing.columns || [],
    preview: mapPreviewFromApi(c.preview, existing.preview),
  });
}

function mapPreviewFromApi(fromApi, existing) {
  const fallback = existing || { greeting: "", says: "", replies: "", tone: "" };
  if (!fromApi || typeof fromApi !== "object") return fallback;
  return {
    greeting: fromApi.greeting != null ? String(fromApi.greeting) : fallback.greeting || "",
    says: fromApi.says != null ? String(fromApi.says) : fallback.says || "",
    replies: fromApi.replies != null ? String(fromApi.replies) : fallback.replies || "",
    tone: fromApi.tone != null ? String(fromApi.tone) : fallback.tone || "",
  };
}

/** Display preview: with API — only server/local saved values; stub may invent defaults. */
function previewForDisplay(camp) {
  if (!hasApi()) return buildPreview(camp);
  const p = camp.preview || {};
  return {
    goal: camp.goal || "",
    details: camp.details || "",
    greeting: (p.greeting || "").trim(),
    says: (p.says || "").trim(),
    replies: (p.replies || "").trim(),
    tone: (p.tone || "").trim(),
  };
}

function verdictsForDisplay(camp) {
  if (camp.verdicts && camp.verdicts.length) return camp.verdicts;
  if (!hasApi()) return ensureVerdicts(camp);
  return [];
}

function isGenerateErrorCode(code) {
  return code === "generate_failed" || code === "provider_down" || code === "weak_goal";
}

async function refreshCampaigns() {
  if (!hasApi()) return;
  const data = await apiFetch("/api/cabinet/campaigns", { session: state.session });
  const byId = Object.fromEntries(state.campaigns.map((c) => [String(c.id), c]));
  state.campaigns = (data?.items || []).map((item) => mapCampaignFromApi(item, byId[String(item.id)] || {}));
  state.ui.campaignsLoaded = true;
  persistCampaigns();
}

async function refreshCampaignDialState(camp) {
  if (!hasApi() || !camp?.id) return camp;
  const data = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}`, {
    session: state.session,
  });
  if (data?.dial_state) camp.dial_state = data.dial_state;
  if (data?.ever_started != null) camp.ever_started = Boolean(data.ever_started);
  persistCampaigns();
  return camp;
}

function ensureDialStatePoll() {
  if (state.ui._dialPollTimer) return;
  state.ui._dialPollTimer = setInterval(() => {
    const camp = workspaceCampaign();
    if (!hasApi() || !camp) return;
    if (camp.dial_state !== "running" && camp.dial_state !== "paused") return;
    void (async () => {
      try {
        await refreshCampaignDialState(camp);
        await refreshCampaignContacts(camp);
        render();
      } catch {
        /* keep prior table; no fake status churn */
      }
    })();
  }, 5000);
}

function buildPreview(camp) {
  const goal = (camp.goal || "").trim();
  const details = (camp.details || "").trim();
  const nameHint = "Если имени нет — робот его не говорит";
  const repliesDefault = goal
    ? `Отвечает коротко по сути вопроса. Цель звонка: ${goal}`
    : "Отвечает коротко по сути вопроса";
  return {
    goal,
    details,
    greeting: (camp.preview?.greeting ?? "").trim() || `Здравствуйте! ${nameHint}`,
    says: (camp.preview?.says ?? "").trim() || details || goal || "Сначала сохраните цель и сведения",
    replies: (camp.preview?.replies ?? "").trim() || repliesDefault,
    tone: (camp.preview?.tone ?? "").trim() || "Спокойно и по делу, без давления оформить любой ценой",
  };
}

function mergePreviewDefaults(camp) {
  const p = buildPreview(camp);
  return {
    greeting: camp.preview?.greeting?.trim() ? camp.preview.greeting : p.greeting,
    says: camp.preview?.says?.trim() ? camp.preview.says : p.says,
    replies: camp.preview?.replies?.trim() ? camp.preview.replies : p.replies,
    tone: camp.preview?.tone?.trim() ? camp.preview.tone : p.tone,
  };
}

function ensureVerdicts(camp) {
  if (camp.verdicts && camp.verdicts.length) return camp.verdicts;
  if (!camp.goal) return [];
  return ["Дошли до цели", "Не дошли", "Перезвонить позже"];
}

function cabinetBody(parsed) {
  if (parsed.page !== "workspace") {
    state.ui.scheduleDrawerOpen = false;
    state.ui.launchReasonsDrawerOpen = false;
  }
  if (parsed.page === "integrations") return sectionTelephony();
  if (parsed.page === "analytics") return pageAnalytics();
  if (parsed.page === "tariffs") return pageTariffs();
  if (parsed.page === "account") return pageAccount();
  if (parsed.page === "new") return pageCampaignNew();
  if (parsed.page === "workspace") {
    const camp = campaignById(parsed.id);
    if (!camp) {
      return deskPage(
        "Кампания не найдена",
        "",
        `<p class="hint">Возможно, её удалили или ссылка устарела</p>
        <a class="btn secondary" href="#/cabinet/campaigns">К списку кампаний</a>`,
        { backHref: "#/cabinet/campaigns", backLabel: "← К кампаниям" }
      );
    }
    return campaignWorkspace(camp);
  }
  return pageCampaignList();
}

function pageCampaignList() {
  const createBtn = locked()
    ? `<button class="btn" type="button" disabled>Создать кампанию</button>
       <p class="hint">Аккаунт заблокирован</p>`
    : `<a class="btn" href="#/cabinet/campaigns/new">Создать кампанию</a>`;

  if (!state.campaigns.length) {
    return deskPage(
      "Кампании",
      "",
      `<div class="empty-state empty-state-hero desk-empty-hero">
        <div class="empty-state-mark" aria-hidden="true"></div>
        <h3 class="empty-state-title">Пока нет кампаний</h3>
        <p class="empty-state-lead">Создайте первую — от цели до обзвона</p>
        ${createBtn}
      </div>`,
      { id: "sec-campaign", className: "desk-page-empty" }
    );
  }

  const rows = state.campaigns
    .map(
      (c) => `<tr class="camp-row" data-href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">
        <td><a class="camp-name" href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">${escapeHtml(c.name || "Без названия")}</a></td>
        <td><span class="badge badge-quiet">${escapeHtml(dialLabel(c.dial_state))}</span></td>
        <td class="camp-goal">${escapeHtml(c.goal || "—")}</td>
        <td class="camp-count">${(c.contacts || []).length}</td>
      </tr>`
    )
    .join("");

  return `${deskPageHeadRow("Кампании", "От цели до обзвона в одном месте", createBtn, { id: "sec-campaign" })}
    ${deskSurface(
      `<table class="data data-camps">
        <thead><tr><th>Название</th><th>Состояние</th><th>Цель</th><th>Номеров</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
      { className: "desk-table-surface" }
    )}
  </section>`;
}

function pageCampaignNew() {
  if (locked()) {
    return deskPage(
      "Новая кампания",
      "",
      `<p class="hint">Аккаунт заблокирован</p>`,
      {
        id: "sec-campaign",
        backHref: "#/cabinet/campaigns",
        backLabel: "← К кампаниям",
        className: "desk-page-form",
      }
    );
  }
  return deskPage(
    "Новая кампания",
    "Задайте цель — система соберёт сценарий и этапы",
    newCampaignFormInline(),
    {
      id: "sec-campaign",
      backHref: "#/cabinet/campaigns",
      backLabel: "← К кампаниям",
      className: "desk-page-form",
    }
  );
}

function pageAccount() {
  const who = state.impersonate
    ? `Кабинет «${escapeHtml(state.impersonate.name || "")}» (суперадмин)`
    : "Кабинет компании";
  const lockedNote =
    state.companyLocked && !state.impersonate
      ? `<div class="banner banner-danger desk-banner"><strong>Аккаунт заблокирован. Можно смотреть, менять и запускать нельзя</strong>
         <p class="hint">Чтобы снять блокировку, напишите в поддержку CallMate</p></div>`
      : "";
  const body = `<div class="desk-stat-row">
      ${deskStatCard("Кто вошёл", who)}
      ${deskStatCard(
        "Доступ",
        state.companyLocked && !state.impersonate ? "Ограничен" : "Активен",
        state.companyLocked && !state.impersonate ? "Только просмотр" : "",
        { tone: state.companyLocked && !state.impersonate ? "warn" : "ok" }
      )}
    </div>
    ${lockedNote}
    <div class="desk-link-cards">
      <a class="desk-link-card" href="#/cabinet/tariffs">
        <span class="desk-link-kicker">Баланс и тариф</span>
        <strong class="desk-link-title">${escapeHtml(String(state.companyBalance))} ₽ · ${escapeHtml(String(state.companyTariff))} ₽/мин</strong>
        <span class="hint">Открыть раздел «Тарифы»</span>
      </a>
      <div class="desk-link-card desk-link-card-static">
        <span class="desk-link-kicker">Оформление</span>
        <strong class="desk-link-title">Светлая и тёмная тема</strong>
        <span class="hint">Переключатель в шапке страницы</span>
      </div>
    </div>`;
  return deskPage("Аккаунт", "Настройки входа и статус компании", body, { id: "sec-account" });
}

const TARIFF_PACKAGES = [
  { minutes: 1000, price: 8, amount: 8000 },
  { minutes: 3000, price: 7, amount: 21000 },
  { minutes: 5000, price: 6, amount: 30000 },
  { minutes: 10000, price: 5, amount: 50000 },
  { minutes: 25000, price: 4, amount: 100000 },
];

function pageTariffs() {
  const bal = Number(state.companyBalance) || 0;
  const tariff = Number(state.companyTariff) || 0;
  const approx = tariff > 0 ? Math.floor(bal / tariff) : null;
  const rows = TARIFF_PACKAGES.map((p) => {
    const yours = tariff > 0 && Number(tariff) === p.price ? ' <span class="badge badge-quiet">Ваш тариф</span>' : "";
    return `<tr>
      <td>${escapeHtml(String(p.minutes.toLocaleString("ru-RU")))} мин${yours}</td>
      <td>${escapeHtml(String(p.price))} ₽</td>
      <td>${escapeHtml(String(p.amount.toLocaleString("ru-RU")))} ₽</td>
    </tr>`;
  }).join("");
  const body = `<div class="desk-stat-row desk-stat-row-3">
      ${deskStatCard("Баланс", `${escapeHtml(String(bal))} ₽`)}
      ${deskStatCard(
        "Тариф",
        tariff > 0 ? `${escapeHtml(String(tariff))} ₽/мин` : "Не задан",
        tariff > 0 ? "За минуту разговора" : "Попросите поддержку назначить тариф"
      )}
      ${deskStatCard(
        "Хватит примерно",
        approx == null ? "—" : `${escapeHtml(String(approx))} мин`,
        approx == null ? "Тариф ещё не задан" : "По текущему балансу"
      )}
    </div>
    <div class="desk-section-block">
      <h3 class="desk-block-title">Пакеты минут</h3>
      <p class="hint desk-block-lead">Чем больше пакет, тем ниже цена минуты. Минимальный пакет — 1 000 минут.</p>
      ${deskSurface(
        `<table class="data">
          <thead><tr><th>Пакет</th><th>Цена за минуту</th><th>Сумма</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`,
        { className: "desk-table-surface" }
      )}
      <p class="hint">Считаем минуты состоявшегося разговора. Недозвон не тарифицируем.</p>
      <p class="hint">Пополнить баланс может поддержка CallMate. В кабинете оплаты нет.</p>
    </div>`;
  return deskPage("Тарифы", "Баланс, тариф и пакеты минут", body, { id: "sec-tariffs" });
}

async function refreshCabinetMe() {
  if (!hasApi() || !state.session) return;
  const me = await apiFetch("/api/cabinet/me", { session: state.session });
  if (me.balance_rub != null) {
    state.companyBalance = Number(me.balance_rub);
    localStorage.setItem("cm_co_balance", String(state.companyBalance));
  }
  if (me.price_per_minute != null) {
    state.companyTariff = Number(me.price_per_minute);
    localStorage.setItem("cm_co_tariff", String(state.companyTariff));
  }
  if (me.locked != null) state.companyLocked = Boolean(me.locked);
}

function pageAnalytics() {
  const camp = activeCampaign();
  const listMetrics = state.campaigns.length
    ? deskSurface(
        `<table class="data">
          <thead><tr><th>Кампания</th><th>Состояние</th><th>Звонков</th><th>До цели</th></tr></thead>
          <tbody>${state.campaigns
            .map((c) => {
              const a = c.analytics;
              return `<tr>
              <td><a href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">${escapeHtml(c.name || "Без названия")}</a></td>
              <td>${escapeHtml(dialLabel(c.dial_state))}</td>
              <td>${escapeHtml(String(a?.calls ?? "—"))}</td>
              <td>${escapeHtml(String(a?.goalReached ?? "—"))}</td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>`,
        { className: "desk-table-surface" }
      )
    : `<p class="hint">Пока нет кампаний</p>`;

  const body = `<div class="desk-section-block">
      <h3 class="desk-block-title">${camp ? escapeHtml(camp.name || "Без названия") : "Выбранная кампания"}</h3>
      <p class="hint desk-block-lead">${camp ? "Метрики активной кампании" : "Откройте кампанию в разделе «Кампании»"}</p>
      <div class="metrics-band analytics-page-metrics">
        ${camp ? blockCampaignAnalytics(camp) : `<p class="hint">Пока нет данных по кампании</p>`}
      </div>
    </div>
    <div class="desk-section-block">
      <h3 class="desk-block-title">Все кампании</h3>
      ${listMetrics}
    </div>`;

  return deskPage("Аналитика", "Звонки, минуты, стоимость и выгрузка Excel", body, { id: "sec-analytics" });
}

function analyticsMetric(label, value, hint = "") {
  return `<div class="metric-card">
    <span class="metric-label">${escapeHtml(label)}</span>
    <strong class="metric-value">${escapeHtml(String(value))}</strong>
    ${hint ? `<span class="hint metric-hint">${escapeHtml(hint)}</span>` : ""}
  </div>`;
}

function blockCampaignAnalytics(camp) {
  const a = camp.analytics;
  if (!a) {
    return `<div class="metrics-grid metrics-grid-compact">
      ${analyticsMetric("Звонков", "0")}
      ${analyticsMetric("До цели", "0", "По итогам разговора")}
      ${analyticsMetric("Минуты", "0")}
      ${analyticsMetric("Стоимость", "0 ₽", `Тариф ${state.companyTariff} ₽/мин`)}
    </div>
      <div class="row-actions">
        <button class="btn secondary" type="button" id="export-excel">Скачать Excel</button>
      </div>
      <p class="hint">Нули до звонков допустимы — можно выгрузить пустой отчёт</p>
      <p class="hint" id="export-status" hidden></p>
      <div class="error" id="export-error" hidden></div>`;
  }
  const cost = a.cost ?? a.cost_rub ?? (a.minutes || 0) * state.companyTariff;
  return `<div class="metrics-grid">
      ${analyticsMetric("Звонков", a.calls ?? a.calls_total ?? 0)}
      ${analyticsMetric("Средняя длительность", a.avgDuration || a.avg_duration || "—")}
      ${analyticsMetric("До цели", a.goalReached ?? a.goal_reached ?? 0, "По итогам разговора")}
      ${analyticsMetric("Минуты разговора", a.minutes ?? a.minutes_total ?? 0)}
      ${analyticsMetric("Тариф за минуту", `${state.companyTariff} ₽`)}
      ${analyticsMetric("Стоимость", `${cost} ₽`, "Минуты × тариф")}
    </div>
      <div class="row-actions">
        <button class="btn" type="button" id="export-excel">Скачать Excel</button>
      </div>
      <p class="hint" id="export-status" hidden></p>
      <div class="error" id="export-error" hidden></div>`;
}

function telephonyStatusLine() {
  const t = state.telephony;
  if (t.checking) return "Проверяем подключение…";
  if (t.status === "ok") {
    return t.lines != null
      ? `Телефония подключена · линий: ${t.lines}`
      : "Телефония подключена";
  }
  if (t.status === "error") {
    return ERROR_BY_CODE[t.lastError] || errorMessage(t.lastError) || ERROR_BY_CODE.sip_unknown;
  }
  return "Телефония не подключена";
}

function scheduleIsSet(camp) {
  return !!(camp.schedule?.days?.length && camp.schedule?.tz);
}

function contactCountsByStatus(contacts) {
  const counts = { in_progress: 0, done: 0, no_answer: 0, cancel: 0 };
  for (const c of contacts || []) {
    for (const [key, val] of Object.entries(STATUS)) {
      if (c.status === val) counts[key] += 1;
    }
  }
  return counts;
}

function reasonJumpTarget(reason) {
  if (!reason) return null;
  if (reason.action === "contacts") return "sec-contacts";
  if (reason.action === "schedule") return "sec-schedule";
  if (reason.action === "tel") return "integrations";
  if (reason.weak) return "sec-preview";
  if (reason.money) return "account";
  return null;
}

function reasonLinkHtml(reason, { asButton = true } = {}) {
  const jump = reasonJumpTarget(reason);
  const text = escapeHtml(reason.text);
  if (jump === "integrations") {
    return `<a class="ready-reason" href="#/cabinet/integrations">${text}</a>`;
  }
  if (jump === "account") {
    return `<a class="ready-reason" href="#/cabinet/tariffs">${text}</a>`;
  }
  if (jump) {
    return asButton
      ? `<button type="button" class="ready-reason" data-jump="${escapeHtml(jump)}">${text}</button>`
      : `<a class="ready-reason" href="#${escapeHtml(jump)}" data-jump="${escapeHtml(jump)}">${text}</a>`;
  }
  return `<span class="ready-reason ready-reason-static">${text}</span>`;
}

function reasonCtaHtml(reason) {
  const jump = reasonJumpTarget(reason);
  const text = escapeHtml(reason.text);
  if (jump === "integrations") {
    return `<a class="btn secondary ready-cta-btn" href="#/cabinet/integrations">${text}</a>`;
  }
  if (jump === "account") {
    return `<a class="btn secondary ready-cta-btn" href="#/cabinet/tariffs">${text}</a>`;
  }
  if (jump) {
    return `<button type="button" class="btn secondary ready-cta-btn" data-jump="${escapeHtml(jump)}">${text}</button>`;
  }
  return `<span class="ready-reason ready-reason-static">${text}</span>`;
}

function readinessStripHtml(camp) {
  const t = state.telephony;
  const telOk = t.status === "ok" && !t.checking;
  const telLabel = t.checking
    ? "Проверяем…"
    : telOk
      ? "Подключена"
      : "Не подключена";

  const schOk = scheduleIsSet(camp);
  const schStatus = schOk ? "Настроено" : "Не задано";
  const schPreview = schOk ? scheduleSummaryLine(camp) : "Дни не заданы";

  const contacts = camp.contacts || [];
  const n = contacts.length;
  const counts = contactCountsByStatus(contacts);
  const countBits = n
    ? Object.entries(counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${STATUS_LABEL[STATUS[k]]} ${v}`)
        .join(" · ")
    : "";
  const numbersValue = n
    ? `${n}${countBits ? ` · ${countBits}` : ""}`
    : "Загрузите контакты";

  const reasons = launchBlockReasons(camp);
  const canLaunch =
    (camp.dial_state === "draft" || camp.dial_state === "stopped") &&
    reasons.length === 0 &&
    !locked();

  let readyTitle = "Готово";
  let readyBody = "";
  let readyClass = "ready-ok";
  if (camp.dial_state === "running") {
    readyTitle = "Идёт обзвон";
    readyBody = `<p class="ready-hint">Текущий разговор закончим. Новые не начнём</p>`;
    readyClass = "ready-ok";
  } else if (camp.dial_state === "paused") {
    readyTitle = "На паузе";
    readyBody = `<p class="ready-hint">Текущий разговор закончим. Новые не начнём</p>`;
    readyClass = "ready-warn";
  } else if (!canLaunch) {
    readyTitle = reasons.length ? "Нельзя запустить" : "Запуск";
    const shown = reasons.slice(0, 2);
    const rest = reasons.length - shown.length;
    readyBody = shown.length
      ? `<div class="ready-reasons">${shown.map((r) => reasonLinkHtml(r)).join("")}${
          rest > 0
            ? `<button type="button" class="ready-reason ready-more" id="launch-reasons-open">ещё ${rest}</button>`
            : ""
        }</div>`
      : `<p class="ready-hint">Нельзя запустить</p>`;
    readyClass = "ready-warn";
  }

  return `<div class="ready-strip" id="sec-ops">
    <a class="ready-cell${telOk ? " ready-cell-ok" : " ready-cell-warn"}" href="#/cabinet/integrations" id="sec-telephony-summary">
      <span class="ready-kicker-row"><span class="ready-kicker">Телефония</span><span class="ready-dot${telOk ? " ready-dot-ok" : " ready-dot-warn"}" aria-hidden="true"></span></span>
      <span class="ready-cell-value">${escapeHtml(telLabel)}</span>
      <span class="ready-cell-action">${telOk ? "Изменить" : "Настроить"}</span>
    </a>
    <button class="ready-cell${schOk ? " ready-cell-ok" : " ready-cell-warn"}" type="button" id="schedule-open">
      <span class="ready-kicker-row"><span class="ready-kicker">Когда звоним</span><span class="ready-dot${schOk ? " ready-dot-ok" : " ready-dot-warn"}" aria-hidden="true"></span></span>
      <span class="ready-cell-value" title="${escapeHtml(schOk ? schPreview : schStatus)}">${escapeHtml(schOk ? schPreview : schStatus)}</span>
      <span class="ready-cell-action">${schOk ? "Изменить" : "Задать"}</span>
    </button>
    <button class="ready-cell${n ? " ready-cell-ok" : " ready-cell-warn"}" type="button" data-jump="sec-contacts" id="sec-ops-numbers">
      <span class="ready-kicker-row"><span class="ready-kicker">Номера</span><span class="ready-dot${n ? " ready-dot-ok" : " ready-dot-warn"}" aria-hidden="true"></span></span>
      <span class="ready-cell-value">${escapeHtml(numbersValue)}</span>
      <span class="ready-cell-action">${n ? "К списку" : "Загрузить"}</span>
    </button>
    <div class="ready-cell ready-cell--launch ${readyClass}" id="sec-launch">
      <span class="ready-kicker-row"><span class="ready-kicker">Запуск</span><span class="ready-dot${readyClass === "ready-ok" ? " ready-dot-ok" : " ready-dot-warn"}" aria-hidden="true"></span></span>
      <strong class="ready-title">${escapeHtml(readyTitle)}</strong>
      ${readyBody ? `<div class="ready-next">${readyBody}</div>` : ""}
    </div>
  </div>`;
}

function launchReasonsDrawerHtml(camp) {
  if (!camp || !state.ui.launchReasonsDrawerOpen) return "";
  const reasons = launchBlockReasons(camp);
  return `<div class="drawer-backdrop" id="launch-reasons-backdrop"></div>
    <aside class="drawer" id="launch-reasons-drawer" role="dialog" aria-labelledby="launch-reasons-title">
      <header class="drawer-head">
        <h2 id="launch-reasons-title">Почему нельзя запустить</h2>
        <button class="btn ghost" type="button" id="launch-reasons-close" aria-label="Закрыть">×</button>
      </header>
      <div class="drawer-body launch-reasons-body">
        <ul class="launch-reasons-list">${reasons
          .map((r) => `<li>${reasonLinkHtml(r)}</li>`)
          .join("")}</ul>
      </div>
    </aside>`;
}

function dialActionsHtml(camp) {
  const reasons = launchBlockReasons(camp);
  const canStart =
    camp.dial_state === "draft" || camp.dial_state === "stopped"
      ? reasons.length === 0 && !locked()
      : false;
  if (camp.dial_state === "running") {
    return `<div class="launch-cluster launch-cluster-compact">
      <button class="btn" type="button" id="dial-pause" ${roAttr()}>Пауза</button>
      <button class="btn secondary" type="button" id="dial-stop" ${roAttr()}>Стоп</button>
      <p class="hint" id="dial-progress" hidden></p>
    </div>`;
  }
  if (camp.dial_state === "paused") {
    return `<div class="launch-cluster launch-cluster-compact">
      <button class="btn" type="button" id="dial-resume" ${roAttr()}>Продолжить</button>
      <button class="btn secondary" type="button" id="dial-stop" ${roAttr()}>Стоп</button>
      <p class="hint" id="dial-progress" hidden></p>
    </div>`;
  }
  const disabled = !canStart || locked();
  return `<div class="launch-cluster">
      <button class="btn" type="button" id="dial-start" ${disabled ? "disabled" : ""}>Начать обзвон</button>
      <p class="hint" id="dial-progress" hidden>Запускаем…</p>
    </div>`;
}

function flowStep(num, title, hint, bodyHtml, { id = "" } = {}) {
  return `<div class="flow-step"${id ? ` id="${escapeHtml(id)}"` : ""}>
    <div class="flow-step-head">
      <span class="flow-step-num" aria-hidden="true">${num}</span>
      <div class="flow-step-titles">
        <h3 class="flow-step-title">${escapeHtml(title)}</h3>
        ${hint ? `<p class="hint flow-step-hint">${escapeHtml(hint)}</p>` : ""}
      </div>
    </div>
    <div class="flow-step-body">${bodyHtml}</div>
  </div>`;
}

function deskPage(title, lead, bodyHtml, { id = "", backHref = "", backLabel = "← Назад", className = "" } = {}) {
  return `<section class="desk-page${className ? ` ${escapeHtml(className)}` : ""}"${id ? ` id="${escapeHtml(id)}"` : ""}>
    ${backHref ? `<a class="back-link quiet" href="${escapeHtml(backHref)}">${escapeHtml(backLabel)}</a>` : ""}
    <header class="desk-page-head">
      <h2 class="desk-page-title">${escapeHtml(title)}</h2>
      ${lead ? `<p class="hint desk-page-lead">${escapeHtml(lead)}</p>` : ""}
    </header>
    <div class="desk-page-body">${bodyHtml}</div>
  </section>`;
}

function deskPageHeadRow(title, lead, actionsHtml, { id = "" } = {}) {
  return `<section class="desk-page campaigns-list-page"${id ? ` id="${escapeHtml(id)}"` : ""}>
    <header class="desk-page-head desk-page-head-row">
      <div class="desk-page-head-copy">
        <h2 class="desk-page-title">${escapeHtml(title)}</h2>
        ${lead ? `<p class="hint desk-page-lead">${escapeHtml(lead)}</p>` : ""}
      </div>
      <div class="desk-page-actions">${actionsHtml}</div>
    </header>`;
}

function deskSurface(bodyHtml, { className = "" } = {}) {
  return `<div class="desk-surface${className ? ` ${escapeHtml(className)}` : ""}">${bodyHtml}</div>`;
}

function deskStatCard(label, valueHtml, hint = "", { tone = "" } = {}) {
  return `<div class="desk-stat-card${tone ? ` desk-stat-card--${tone}` : ""}">
    <span class="desk-stat-label">${escapeHtml(label)}</span>
    <strong class="desk-stat-value">${valueHtml}</strong>
    ${hint ? `<span class="hint desk-stat-hint">${escapeHtml(hint)}</span>` : ""}
  </div>`;
}

function campaignWorkspace(camp) {
  const started = isStarted(camp);
  const weak = isWeakScenario(camp);
  return `<div class="workspace workspace-desk" data-camp="${escapeHtml(camp.id)}">
    <div class="workspace-chrome">
    <header class="workspace-bar workspace-bar-desk">
      <a class="back-link quiet" href="#/cabinet/campaigns">← К кампаниям</a>
      <div class="workspace-title-row">
        <div class="workspace-heading">
          <h1 class="workspace-title">${escapeHtml(camp.name || "Без названия")}</h1>
          <span class="badge badge-quiet">${escapeHtml(dialLabel(camp.dial_state))}</span>
        </div>
        <div class="workspace-toolbar">
          <a class="workspace-balance-text hint" href="#/cabinet/tariffs">Баланс ${escapeHtml(String(state.companyBalance))} ₽ · ${escapeHtml(String(state.companyTariff))} ₽/мин</a>
          <div class="workspace-actions">${dialActionsHtml(camp)}</div>
        </div>
      </div>
    </header>
    ${readinessStripHtml(camp)}
    </div>
    <div id="stop-confirm" class="panel nested" hidden>
      <p>Остановить обзвон? Текущий разговор договорим</p>
      <div class="row-actions">
        <button class="btn" type="button" id="stop-yes">Стоп</button>
        <button class="btn secondary" type="button" id="stop-no">Отмена</button>
      </div>
    </div>
    ${
      state.ui.saveRebuildOpen
        ? `<div class="modal-backdrop" id="save-rebuild-backdrop" role="presentation">
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="save-rebuild-title">
        <h3 id="save-rebuild-title">Пересобрать сценарий?</h3>
        <p>Сохранение заново соберёт превью и этапы. Ручные правки в них пропадут.</p>
        <div class="row-actions">
          <button class="btn secondary" type="button" id="save-rebuild-cancel" autofocus>Отмена</button>
          <button class="btn" type="button" id="save-rebuild-yes">Пересобрать и сохранить</button>
        </div>
      </div>
    </div>`
        : ""
    }
    ${
      state.ui.contactsBulkConfirm
        ? `<div class="modal-backdrop" id="contacts-bulk-backdrop" role="presentation">
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="contacts-bulk-title">
        <h3 id="contacts-bulk-title">${escapeHtml(state.ui.contactsBulkConfirm.title)}</h3>
        <p>${escapeHtml(state.ui.contactsBulkConfirm.body)}</p>
        <div class="row-actions">
          <button class="btn secondary" type="button" id="contacts-bulk-cancel" autofocus>Отмена</button>
          <button class="btn" type="button" id="contacts-bulk-yes">${escapeHtml(state.ui.contactsBulkConfirm.ok)}</button>
        </div>
      </div>
    </div>`
        : ""
    }
    ${locked() ? `<p class="hint workspace-locked-note">Аккаунт заблокирован</p>` : ""}

    ${scheduleDrawerHtml(camp)}
    ${launchReasonsDrawerHtml(camp)}

    <div class="workspace-desk-body">
      <div class="workspace-col workspace-col--main">
        ${blockScenarioFlow(camp, weak, started)}
      </div>
      <div class="workspace-col workspace-col--side">
        ${blockNumbers(camp)}
      </div>
    </div>

    <section class="flow-section outcomes-section desk-section-compact" id="sec-analytics">
      <h2 class="section-title-bar">Итоги кампании</h2>
      <div class="metrics-band">${blockCampaignAnalytics(camp)}</div>
    </section>
  </div>`;
}

function blockScenarioFlow(camp, weak, started) {
  const preview = previewForDisplay(camp);
  const dis = started || locked() || state.ui.generatePending ? "disabled" : "";
  const goalVal = camp.goal || preview.goal || "";
  const detailsVal = camp.details || preview.details || "";
  const verdicts = verdictsForDisplay(camp);
  const hasServerPreview = Boolean(preview.greeting || preview.says || preview.replies || preview.tone);
  const pending = state.ui.generatePending;
  const genErr = state.ui.generateError;
  const stages =
    camp.stages && camp.stages.length
      ? camp.stages
      : camp.goal
        ? [{ goal: camp.goal, input: "Приветствие", output: "Переход к сути" }]
        : [];
  const attrs = camp.columns || [];

  const contextBlock = `<div class="flow-fields">
            <div class="preview-field preview-field-full">
              <label for="preview-name">Название</label>
              <input id="preview-name" value="${escapeHtml(camp.name || "")}" ${dis} />
              <p class="hint">Пустое имя — не мешает запуску</p>
            </div>
            <div class="preview-field preview-field-full">
              <label for="preview-goal">Цель звонка</label>
              <textarea id="preview-goal" rows="2" ${dis} placeholder="Например: напомнить о записи">${escapeHtml(goalVal)}</textarea>
              <p class="hint">К чему должен привести разговор</p>
            </div>
            <div class="preview-field preview-field-full">
              <label for="preview-details">Сведения</label>
              <textarea id="preview-details" rows="5" ${dis} placeholder="Что важно сказать абоненту">${escapeHtml(detailsVal)}</textarea>
              <p class="hint">Чем подробнее опишете продукт, условия и частые вопросы — тем точнее будет разговор. Можно своими словами.</p>
            </div>
          </div>`;

  const verdictsBlock = `${
    verdicts.length
      ? `<ul class="verdict-chips">${verdicts
          .map(
            (v) =>
              `<li class="verdict-chip">${escapeHtml(typeof v === "string" ? v : v.label || v.id || JSON.stringify(v))}</li>`
          )
          .join("")}</ul>`
      : `<p class="hint verdicts-empty">Пока нет итогов — сохраните цель и сведения</p>`
  }`;

  const voiceBlock = `<div class="preview-edit-grid preview-voice-grid">
            <div class="preview-field">
              <label for="preview-greeting">Приветствие</label>
              <textarea id="preview-greeting" rows="3" ${dis} placeholder="Здравствуйте!">${escapeHtml(preview.greeting)}</textarea>
            </div>
            <div class="preview-field">
              <label for="preview-says">Что говорит</label>
              <textarea id="preview-says" rows="3" ${dis} placeholder="Суть сообщения">${escapeHtml(preview.says)}</textarea>
            </div>
            <div class="preview-field">
              <label for="preview-replies">Как отвечает</label>
              <textarea id="preview-replies" rows="3" ${dis} placeholder="Как реагирует на ответы">${escapeHtml(preview.replies)}</textarea>
            </div>
            <div class="preview-field">
              <label for="preview-tone">Тон</label>
              <textarea id="preview-tone" rows="3" ${dis} placeholder="Спокойно и по делу">${escapeHtml(preview.tone)}</textarea>
              <p class="hint">Без давления оформить любой ценой</p>
            </div>
          </div>`;

  const stagesBlock = `${
    stages.length
      ? `<div class="stages-compact">${stages
          .map(
            (s, i) => `<form class="stage-form-compact" data-idx="${i}">
            <div class="stage-field">
              <label>Цель этапа</label>
              <input name="goal" value="${escapeHtml(s.goal || "")}" ${dis} />
            </div>
            <div class="stage-field">
              <label>Что на входе</label>
              <input name="input" value="${escapeHtml(s.input || "")}" ${dis} />
            </div>
            <div class="stage-field">
              <label>Что на выходе</label>
              <input name="output" value="${escapeHtml(s.output || "")}" ${dis} />
            </div>
            <div class="stage-field stage-field-action">
              <button class="btn secondary" type="submit" ${dis}>Сохранить этап</button>
            </div>
          </form>`
          )
          .join("")}</div>`
      : `<p class="hint">Этапы появятся после сборки сценария</p>`
  }
      <div class="scenario-compose">
        <label for="scenario-text">Текст сценария</label>
        <textarea id="scenario-text" rows="6" ${dis}>${escapeHtml(camp.scenarioText || camp.details || "")}</textarea>
        <div class="scenario-compose-actions">
          <button class="btn secondary" type="button" id="insert-attr" ${dis}>Вставить поле</button>
          <button class="btn secondary" type="button" id="save-scenario" ${dis}>Сохранить черновик</button>
          <p class="hint ok-line" id="scenario-ok" hidden>Черновик сохранён</p>
        </div>
      </div>
      <div id="attr-picker" class="panel nested attr-picker-flow" hidden>
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
      </div>`;

  return `<section class="flow-section workspace-panel scenario-flow-panel" id="sec-preview">
    <header class="scenario-flow-head">
      <h2 class="section-title-bar scenario-flow-title">Робот так понял сценарий</h2>
      <p class="hint scenario-flow-lead">Можно править текст и этапы — ветки рисовать не нужно</p>
    </header>
    <form class="preview-panel scenario-flow" id="preview-form">
      ${started ? `<div class="banner banner-warn">После старта сценарий и расписание только смотрим. Чтобы изменить — создайте новую кампанию</div>` : ""}
      ${
        weak && !started
          ? `<div class="banner banner-warn">
          <strong>Сценарий пока слишком слабый для обзвона</strong>
          <p class="hint">Допишите цель и сведения или поправьте текст ниже</p>
        </div>`
          : ""
      }
      ${pending ? `<div class="banner" id="generate-pending"><strong>Собираем сценарий…</strong></div>` : ""}
      ${
        genErr && !pending
          ? `<div class="banner banner-danger" id="generate-error"><strong>${escapeHtml(genErr)}</strong></div>`
          : ""
      }
      ${
        !hasServerPreview && !pending && !started
          ? `<p class="hint scenario-empty-note" id="preview-empty">Сначала сохраните цель и сведения — тогда появится, как робот понял сценарий.</p>`
          : ""
      }

      <div class="flow-steps">
        ${flowStep(1, "Цель и сведения", "Название, цель, контекст разговора", contextBlock, { id: "sec-context" })}
        ${flowStep(2, "Возможные итоги разговора", "Система собрала список по цели. Менять его нельзя", verdictsBlock, { id: "sec-verdicts" })}
        ${hasServerPreview || pending ? flowStep(3, "Как звучит робот", "Приветствие, реплики, тон", voiceBlock, { id: "sec-voice" }) : ""}
        ${flowStep(hasServerPreview || pending ? 4 : 3, "Сценарий и этапы", "Название столбца в файле должно совпадать с полем в сценарии", stagesBlock, { id: "sec-scenario" })}
      </div>

      ${
        started || locked()
          ? `<p class="hint">${started ? "После старта превью только смотрим" : "Аккаунт заблокирован — правки недоступны"}</p>
            ${
              started
                ? `<a class="btn" href="#/cabinet/campaigns/new" style="display:inline-block;margin-top:var(--space-3)">Создать кампанию</a>`
                : ""
            }`
          : `<div class="flow-save-bar">
              <button class="btn" type="submit" id="preview-save-btn" ${pending ? "disabled" : ""}>Сохранить</button>
              <p class="hint">Сохранение цели и сведений заново соберёт, как звучит робот, и этапы.</p>
              <p class="hint ok-line" id="preview-ok" hidden>Сценарий собран</p>
            </div>`
      }
    </form>
  </section>`;
}

function blockBotPreview(camp, weak, started) {
  return blockScenarioFlow(camp, weak, started);
}

function blockNumbers(camp) {
  return sectionContacts(camp);
}

function newCampaignFormInline() {
  const pending = state.ui.generatePending;
  const draft = state.ui.newCampaignDraft || { name: "", goal: "", details: "" };
  const formErr = state.ui.newCampaignError;
  return `<form class="desk-form flow-fields create-campaign-form" id="new-campaign-form">
    <div class="preview-field preview-field-full">
      <label for="camp-name">Название</label>
      <input id="camp-name" value="${escapeHtml(draft.name || "")}" ${roAttr()} ${pending ? "disabled" : ""} />
      <p class="hint">Пустое имя — не мешает запуску</p>
    </div>
    <div class="preview-field preview-field-full">
      <label for="camp-goal">Цель звонка</label>
      <input id="camp-goal" placeholder="Например: напомнить о записи" value="${escapeHtml(draft.goal || "")}" ${roAttr()} ${pending ? "disabled" : ""} />
      <p class="hint">К чему должен привести разговор</p>
    </div>
    <div class="preview-field preview-field-full">
      <label for="camp-details">Сведения</label>
      <textarea id="camp-details" rows="5" placeholder="Что важно сказать абоненту" ${roAttr()} ${pending ? "disabled" : ""}>${escapeHtml(draft.details || "")}</textarea>
      <p class="hint">Чем подробнее опишете продукт, условия и частые вопросы — тем точнее будет разговор. Можно своими словами.</p>
    </div>
    <div class="error" id="camp-error" ${formErr ? "" : "hidden"}>${formErr ? escapeHtml(formErr) : ""}</div>
    ${pending ? `<p class="hint" id="camp-generate-pending"><strong>Собираем сценарий…</strong></p>` : ""}
    <div class="flow-save-bar">
      <button class="btn" type="submit" ${roAttr()} ${pending ? "disabled" : ""}>Сохранить</button>
      <a class="btn secondary" href="#/cabinet/campaigns" id="cancel-new-campaign">Отмена</a>
    </div>
  </form>`;
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
  const host = escapeHtml(state.telephony.sip_host || "");
  const login = escapeHtml(state.telephony.sip_login || "");
  const pwdHint = state.telephony.has_sip_password
    ? `<p class="hint">Пароль уже сохранён. Введите новый, только если меняете</p>`
    : `<p class="hint">Пароль сохраним, но снова не покажем</p>`;
  return `<form class="panel nested" id="sip-form">
    <h3>SIP</h3>
    <label>Адрес</label><input id="sip-host" placeholder="sip.example.com" value="${host}" ${roAttr()} />
    <label>Логин</label><input id="sip-login" placeholder="Ваш логин" value="${login}" ${roAttr()} />
    <label>Пароль</label><input id="sip-password" type="password" placeholder="Пароль" ${roAttr()} />
    ${pwdHint}
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
  const telOk = t.status === "ok" && !t.checking;
  const telWarn = t.status === "error";
  const statusTitle = t.checking
    ? "Проверяем подключение…"
    : telOk
      ? "Телефония подключена"
      : telWarn
        ? "Не удалось подключить"
        : "Телефония не подключена";
  const statusHint = t.checking
    ? "Это не обзвон — только проверка связи"
    : telOk
      ? t.lines != null
        ? `Линий для обзвона: ${t.lines}`
        : "Можно создавать кампанию и запускать обзвон"
      : telWarn
        ? errorMessage(t.lastError) || ERROR_BY_CODE.sip_unknown
        : "Подключите SIP или Манго Телеком";

  let statusActions = "";
  if (telOk) {
    statusActions = `<div class="row-actions tel-status-actions">
        <button class="btn secondary" type="button" data-open-tel="sip" ${roAttr()}>Изменить данные</button>
      </div>`;
  } else if (telWarn) {
    statusActions = `<div class="row-actions tel-status-actions">
        <button class="btn" type="button" id="sip-recheck" ${roAttr()}>Проверить снова</button>
        <button class="btn secondary" type="button" data-open-tel="sip" ${roAttr()}>Изменить данные</button>
      </div>`;
  } else if (!t.checking) {
    statusActions = `<div class="tel-connect-grid">
        <button class="tel-connect-card" type="button" data-open-tel="sip" ${roAttr()}>
          <span class="tel-connect-kicker">SIP</span>
          <strong class="tel-connect-title">Подключить SIP</strong>
          <span class="hint">Хост, логин и пароль вашей АТС</span>
        </button>
        <button class="tel-connect-card" type="button" data-open-tel="mango" ${roAttr()}>
          <span class="tel-connect-kicker">Манго</span>
          <strong class="tel-connect-title">Подключить через Манго Телеком</strong>
          <span class="hint">Логин и пароль от личного кабинета</span>
        </button>
      </div>`;
  }

  const expand =
    panel === "sip" ? sipFormInline() : panel === "mango" ? mangoFormInline() : "";

  const body = `<div class="desk-stat-row desk-stat-row-1">
      ${deskStatCard(
        "Статус",
        escapeHtml(statusTitle),
        telWarn && !t.checking ? "Проверьте хост, логин и пароль" : escapeHtml(statusHint),
        { tone: telOk ? "ok" : telWarn ? "warn" : t.checking ? "" : "warn" }
      )}
    </div>
    ${telWarn && !t.checking ? `<div class="banner banner-danger desk-banner"><strong>Не удалось подключить телефонию</strong><p class="hint">${escapeHtml(statusHint)}</p></div>` : ""}
    ${statusActions}
    ${t.checking ? "" : linesField(linesVal)}
    ${expand ? `<div class="tel-form-expand">${expand}</div>` : ""}`;

  return deskPage("Интеграции", "Телефония и число линий для обзвона", body, { id: "sec-telephony" });
}

function blockScenario(camp) {
  return "";
}

/** Исходы попытки v1 (DESIGN-138 / FE-155) — не статусы канона. */
const OUTCOME_FILTERS = [
  { id: "all", label: "Все", codes: null },
  { id: "busy", label: "Занято", codes: ["busy"] },
  { id: "no_pickup", label: "Не берёт", codes: ["no_pickup", "no_answer"] },
  { id: "voicemail", label: "Автоответчик", codes: ["voicemail"] },
  { id: "early", label: "Ранний сброс", codes: ["early", "early_hangup"] },
];

function contactCauseCode(contact) {
  const attempts = contact.attempts || [];
  if (attempts.length) {
    const last = attempts[attempts.length - 1];
    return last.cause_code || last.outcome || last.result || "";
  }
  const last = contact.last_attempt;
  if (last) return last.cause_code || last.outcome || last.result || "";
  return contact.cause_code || "";
}

function matchesOutcomeFilter(contact, outcomeFilterId) {
  if (!outcomeFilterId || outcomeFilterId === "all") return true;
  const spec = OUTCOME_FILTERS.find((f) => f.id === outcomeFilterId);
  if (!spec?.codes) return true;
  const code = contactCauseCode(contact);
  return spec.codes.includes(code);
}

function sectionContacts(camp) {
  if (!camp) return "";
  const started = isStarted(camp);
  const contacts = camp.contacts || [];
  const warnings = camp.uploadWarnings || [];
  const filter = state.ui.contactStatusFilter || "all";
  const outcomeFilter = state.ui.contactOutcomeFilter || "all";
  const byStatus =
    filter === "all"
      ? contacts
      : contacts.filter((r) => r.status === STATUS[filter]);
  const filtered = byStatus.filter((r) => matchesOutcomeFilter(r, outcomeFilter));
  const reloadHint = started
    ? `<p class="hint">Номера догрузить можно. Новое поле в сценарий — уже нет</p>`
    : "";
  const filterKeys = [
    { id: "all", label: "Все" },
    { id: "in_progress", label: STATUS_LABEL[STATUS.in_progress] },
    { id: "done", label: STATUS_LABEL[STATUS.done] },
    { id: "no_answer", label: STATUS_LABEL[STATUS.no_answer] },
    { id: "cancel", label: STATUS_LABEL[STATUS.cancel] },
  ];
  const filters = `<div class="status-filters" role="tablist" aria-label="Статус">
      ${filterKeys
        .map(
          (f) =>
            `<button type="button" class="status-filter${filter === f.id ? " active" : ""}" data-contact-filter="${f.id}">${escapeHtml(f.label)}</button>`
        )
        .join("")}
    </div>`;
  const outcomeFilters = `<div class="status-filters outcome-filters" role="tablist" aria-label="Исход попытки">
      <span class="filter-label">Исход попытки</span>
      ${OUTCOME_FILTERS.map(
        (f) =>
          `<button type="button" class="status-filter${outcomeFilter === f.id ? " active" : ""}" data-outcome-filter="${f.id}">${escapeHtml(f.label)}</button>`
      ).join("")}
    </div>`;
  const emptyOutcome =
    outcomeFilter !== "all" && !filtered.length && contacts.length
      ? `<p class="hint" id="outcome-filter-empty">Нет номеров с таким исходом</p>`
      : "";
  const rows = filtered.length
    ? filtered
        .map((r) => {
          const key = `${camp.id}|${r.phone}`;
          const open = state.ui.statusExpandKey === key;
          return `<tr>
              <td><input type="checkbox" class="contact-check" data-phone="${escapeHtml(r.phone)}" data-id="${escapeHtml(r.id || "")}" ${roAttr()} /></td>
              <td><button type="button" class="linkish" data-expand-status="${escapeHtml(key)}">${escapeHtml(maskPhone(r.phone))}</button></td>
              <td>${escapeHtml(statusLabel(r.status))}</td>
              <td>${escapeHtml(r.name || "")}</td>
            </tr>
            ${open ? `<tr class="expand-row"><td colspan="4">${contactDrawerHtml(camp, r)}</td></tr>` : ""}`;
        })
        .join("")
    : `<tr class="contacts-empty-row"><td colspan="4"><p class="hint contacts-empty">Загрузите контакты из Excel или CSV. Нужен столбец с телефоном</p></td></tr>`;

  const uploadZone = `<div class="upload-zone${contacts.length ? " upload-zone-quiet" : " upload-zone-empty"}${state.ui.contactsUploading ? " is-uploading" : ""}" id="upload-zone">
        <div class="upload-zone-main">
          <p class="upload-zone-title">${contacts.length ? "Догрузить файл" : "Загрузите контакты"}</p>
          <p class="hint">Excel или CSV</p>
          <button class="btn${contacts.length ? " secondary" : ""}" type="button" id="pick-file" ${roAttr()}${state.ui.contactsUploading ? " disabled" : ""}>Выбрать файл</button>
          <input class="sr-file" type="file" id="contact-file" accept=".csv,.xlsx,.xls" tabindex="-1" aria-hidden="true" ${roAttr()} ${state.ui.contactsUploading ? "disabled" : ""} />
        </div>
        <p class="hint consent">Загружая номера, вы подтверждаете, что у вас есть законные основания звонить этим людям. CallMate согласия за вас не собирает. Храните согласия и документы у себя</p>
      </div>
      <p id="upload-progress" class="hint" ${state.ui.contactsUploading ? "" : "hidden"}>Загружаем контакты…</p>
      <p class="hint" id="upload-progress-hint" ${state.ui.contactsUploading ? "" : "hidden"}>Большой файл может занять несколько минут</p>
      <p class="hint" id="upload-batch-hint" ${state.ui.contactsUploading ? "" : "hidden"}>Файл обрабатывается на сервере пачками</p>
      <p class="hint ok-line" id="upload-ok" hidden>Контакты загружены</p>
      <div id="upload-errors"></div>
      ${warnings.map((w) => `<p class="error">${escapeHtml(w)}</p>`).join("")}
      <p class="hint">Название столбца в файле должно совпадать с полем в сценарии</p>
      <div id="reload-precheck" class="panel nested" hidden></div>
      <div id="new-col-alert" class="panel nested" hidden></div>`;

  const listBlock = contacts.length
    ? `<div class="contacts-list-block contacts-list-first">
        <h3 class="contacts-list-title">Список</h3>
        ${filters}
        ${outcomeFilters}
        ${emptyOutcome}
        <div class="contacts-bulk-bar">
          <p class="hint" id="contacts-selected-count">Выбрано: 0</p>
          <button class="btn secondary" type="button" id="contacts-clear-selection" hidden>Снять выделение</button>
        </div>
        <div class="row-actions">
          <button class="btn secondary" type="button" id="cancel-contacts" ${roAttr()} disabled>Снять с обзвона</button>
          <button class="btn secondary" type="button" id="restore-contacts" ${roAttr()} disabled>Вернуть в обзвон</button>
        </div>
        <p class="hint" id="contacts-action-msg"></p>
        <table class="data data-contacts" id="contacts-table">
          <thead><tr>
            <th class="col-check"><input type="checkbox" id="contacts-select-all" title="Выбрать все" aria-label="Выбрать все" ${roAttr()} /></th>
            <th>Телефон</th><th>Статус</th><th>Имя</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
    : "";

  return `<section class="flow-section workspace-panel contacts-flow-panel" id="sec-contacts">
    <h2 class="section-title-bar contacts-flow-title">Номера</h2>
    <div class="contacts-panel contacts-flow">
      ${reloadHint}
      ${uploadZone}
      ${listBlock}
      ${
        started && contacts.length
          ? `<p class="hint">Серого статуса нет: пока вы не подтвердите догрузку, новые номера в обзвон не попадут</p>`
          : ""
      }
    </div>
  </section>`;
}

function formatDaysSummary(dayIds) {
  const order = DAYS.map((d) => d.id);
  const sorted = order.filter((id) => (dayIds || []).includes(id));
  if (!sorted.length) return "Дни не заданы";
  const indices = sorted.map((id) => order.indexOf(id));
  const ranges = [];
  let start = indices[0];
  let prev = indices[0];
  for (let i = 1; i <= indices.length; i++) {
    if (i < indices.length && indices[i] === prev + 1) {
      prev = indices[i];
      continue;
    }
    const a = DAYS[start].label;
    const b = DAYS[prev].label;
    ranges.push(start === prev ? a : `${a}–${b}`);
    if (i < indices.length) {
      start = indices[i];
      prev = indices[i];
    }
  }
  return ranges.join(", ");
}

function retriesLabel(n) {
  const abs = Math.abs(Number(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "перезвонов";
  if (last === 1) return "перезвон";
  if (last >= 2 && last <= 4) return "перезвона";
  return "перезвонов";
}

function scheduleSummaryLine(camp) {
  const sch = camp.schedule || { days: [], from: "10:00", to: "18:00", tz: "Europe/Moscow" };
  const days = formatDaysSummary(sch.days);
  const from = sch.from || "10:00";
  const to = sch.to || "18:00";
  const tz = sch.tz || "Europe/Moscow";
  const retries = camp.retries ?? 2;
  return `${days} · ${from}–${to} · ${tz} · ${retries} ${retriesLabel(retries)}`;
}

function scheduleFormFields(camp) {
  const started = isStarted(camp);
  const dis = started || locked() ? "disabled" : "";
  const sch = camp.schedule || { days: [], from: "10:00", to: "18:00", tz: "Europe/Moscow" };
  const dayChecks = DAYS.map(
    (d) =>
      `<label class="inline"><input type="checkbox" name="day" value="${d.id}" ${sch.days?.includes(d.id) ? "checked" : ""} ${dis} /> ${d.label}</label>`
  ).join(" ");
  return `${started ? `<div class="banner banner-warn">После старта менять нельзя</div>` : ""}
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
    <div class="row-actions">
      <button class="btn" type="submit" ${dis}>Сохранить</button>
      <button class="btn secondary" type="button" id="schedule-done">Готово</button>
    </div>`;
}

function scheduleDrawerHtml(camp) {
  if (!camp || !state.ui.scheduleDrawerOpen) return "";
  return `<div class="drawer-backdrop" id="schedule-drawer-backdrop"></div>
    <aside class="drawer" id="schedule-drawer" role="dialog" aria-labelledby="schedule-drawer-title">
      <header class="drawer-head">
        <h2 id="schedule-drawer-title">Когда звоним</h2>
        <button class="btn ghost" type="button" id="schedule-close" aria-label="Закрыть">×</button>
      </header>
      <form class="drawer-body" id="schedule-form">
        ${scheduleFormFields(camp)}
      </form>
    </aside>`;
}

function launchBlockReasons(camp) {
  const reasons = [];
  if (hasApi() && Array.isArray(state.ui.gateErrors) && state.ui.gateErrors.length) {
    for (const err of state.ui.gateErrors) {
      const code = typeof err === "string" ? err : err?.code;
      reasons.push({
        text: errorMessage(code) || String(code || "Пока нельзя начать"),
        code,
      });
    }
    return reasons;
  }
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
  if (!hasApi()) reasons.push({ text: errorMessage("api_not_configured") });
  return reasons;
}

async function refreshGates(camp) {
  if (!hasApi() || !camp?.id) {
    state.ui.gateErrors = [];
    return;
  }
  const data = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/gates`, {
    session: state.session,
  });
  state.ui.gateErrors = data?.ok ? [] : data?.errors || [{ code: "gate_failed" }];
}

function contactDrawerHtml(camp, contact) {
  const attempts = contact.attempts || [];
  const attemptRows = attempts.length
    ? attempts
        .map((a) => {
          const n = a.attempt_no != null ? a.attempt_no : "";
          const when = a.when || (a.duration_sec != null ? `${a.duration_sec} с` : "");
          const outcome = a.cause_code || a.outcome || a.result || "";
          return `<tr>
          <td>${escapeHtml(String(n))}</td>
          <td>${escapeHtml(String(when))}</td>
          <td>${escapeHtml(outcomeLabel(outcome))}</td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="3">Попыток ещё не было</td></tr>`;
  const transcript = contact.last_transcript || contact.transcript || "";
  return `<div class="panel nested contact-drawer">
    <h3>Номер</h3>
    <p>${escapeHtml(maskPhone(contact.phone))}</p>
    <p><strong>Статус</strong>: ${escapeHtml(statusLabel(contact.status))}
      ${contact.status === STATUS.done ? `<span class="hint">Поговорили с человеком</span>` : ""}</p>
    <p><strong>Вердикт</strong>: ${
      contact.verdict ? escapeHtml(contact.verdict) : "Вердикта нет — разговора не было"
    }</p>
    <p class="hint">Вердикт — про цель кампании, не про статус</p>
    <h4>Попытки</h4>
    <table class="data">
      <thead><tr><th>№</th><th></th><th>Исход</th></tr></thead>
      <tbody>${attemptRows}</tbody>
    </table>
    <h4>Разговор</h4>
    <p class="hint">${transcript ? escapeHtml(transcript) : "Записи разговора пока нет"}</p>
    <button class="btn secondary" type="button" data-collapse-status>Свернуть</button>
  </div>`;
}

function outcomeLabel(code) {
  const map = {
    busy: "Занято",
    no_pickup: "Не берёт",
    no_answer: "Не берёт",
    voicemail: "Автоответчик",
    early: "Ранний сброс",
    early_hangup: "Ранний сброс",
    connected: "Дозвонились",
    answered_stub: "Дозвонились",
    answered_human: "Дозвонились",
    provider_down: "Сбой связи",
    tech_fail: "Сбой связи",
  };
  return map[code] || code || "—";
}

function maskPhone(phone) {
  const s = String(phone || "");
  if (s.length < 5) return s;
  return s.slice(0, 2) + "•••" + s.slice(-4);
}

function normalizeRuPhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) {
    digits = "7" + digits.slice(1);
  } else if (digits.length === 10) {
    digits = "7" + digits;
  } else {
    return null;
  }
  if (digits.length !== 11 || digits[0] !== "7") return null;
  return `+${digits}`;
}

function isPhoneHeader(h) {
  return /^(number|phone|tel|телефон|номер|мобильный|mobile|phonenumber)$/i.test(String(h || "").trim());
}

function isNameHeader(h) {
  return /^(name|имя|fio|фио|client|клиент)$/i.test(String(h || "").trim());
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const src = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else if (ch === "\r") {
      /* skip */
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

async function loadXlsxLib() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("xlsx_lib"));
    document.head.appendChild(s);
  });
  if (!window.XLSX) throw new Error("xlsx_lib");
  return window.XLSX;
}

async function rowsFromFile(file) {
  const lower = String(file.name || "").toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return parseCsvText(await file.text());
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await loadXlsxLib();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    return matrix.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []));
  }
  throw new Error("format");
}

function contactsFromRows(matrix) {
  if (!matrix?.length) {
    return { good: [], bad: 0, columns: [], error: "empty" };
  }
  const header = matrix[0].map((h) => String(h || "").trim());
  if (!header.some(Boolean)) {
    return { good: [], bad: 0, columns: [], error: "empty" };
  }
  let phoneIdx = header.findIndex(isPhoneHeader);
  let nameIdx = header.findIndex(isNameHeader);
  if (phoneIdx < 0) {
    // первая колонка с похожими на телефон значениями
    for (let c = 0; c < header.length; c++) {
      const sample = matrix.slice(1, 6).map((r) => r[c]).filter(Boolean);
      if (sample.length && sample.every((v) => normalizeRuPhone(v))) {
        phoneIdx = c;
        break;
      }
    }
  }
  if (phoneIdx < 0) {
    return { good: [], bad: 0, columns: [], error: "no_phone_col" };
  }
  const columns = header
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => h && i !== phoneIdx && i !== nameIdx)
    .map(({ h }) => h);

  const good = [];
  let bad = 0;
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    if (!row.some((x) => String(x || "").trim())) continue;
    const phone = normalizeRuPhone(row[phoneIdx]);
    if (!phone) {
      bad++;
      continue;
    }
    const name = nameIdx >= 0 ? String(row[nameIdx] || "").trim() : "";
    const attrs = {};
    header.forEach((h, i) => {
      if (!h || i === phoneIdx || i === nameIdx) return;
      const val = String(row[i] || "").trim();
      if (val) attrs[h] = val;
    });
    good.push({
      phone,
      name,
      status: STATUS.in_progress,
      attempts: [],
      verdict: null,
      attrs,
    });
  }
  return { good, bad, columns, error: null };
}

async function parseContactsFile(file) {
  const matrix = await rowsFromFile(file);
  return contactsFromRows(matrix);
}

/* ---------- auth views ---------- */

function loginView() {
  const apiHint = hasApi()
    ? `<p class="hint">В кабинет компании или в админку</p>`
    : `<p class="hint">Сначала укажите адрес API — сейчас только проверка вёрстки</p>`;
  return `<div class="login-wrap login-wrap-desk">
    <section class="login-hero" aria-label="CallMate">
      <p class="login-brand"><span class="brand-mark" aria-hidden="true"></span>CallMate</p>
      <p class="login-lead">Кабинет голосовых кампаний</p>
    </section>
    <aside class="login-aside">
      <form class="login-panel" id="login-form">
        <h1 class="login-panel-title">Вход</h1>
        ${apiHint}
        <div class="flow-fields login-fields">
          <div class="preview-field preview-field-full">
            <label for="login">Логин</label>
            <input id="login" name="login" autocomplete="username" placeholder="Ваш логин" />
          </div>
          <div class="preview-field preview-field-full">
            <label for="password">Пароль</label>
            <input id="password" name="password" type="password" autocomplete="current-password" placeholder="Пароль" />
          </div>
        </div>
        <button class="btn login-submit" id="submit" type="submit">Войти</button>
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
  const canCabinet =
    state.session && (state.role === "company" || (state.role === "superadmin" && state.impersonate));

  const cabinet = parseCabinet(path);
  if (cabinet) {
    if (!canCabinet) {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = cabinetShell(cabinet.tab, cabinetBody(cabinet));
    bindShell();
    clearFlashSoon();
    if (hasApi() && cabinet.page === "integrations" && !state.ui.telephonyLoaded) {
      state.ui.telephonyLoaded = true;
      void refreshTelephony()
        .then(() => render())
        .catch((e) => flash(errorMessage(e?.code), "error"));
    }
    if (
      hasApi() &&
      !state.ui.campaignsLoaded &&
      (cabinet.tab === "campaigns" || cabinet.page === "workspace")
    ) {
      state.ui.campaignsLoaded = true;
      void refreshCampaigns()
        .then(async () => {
          const camp = workspaceCampaign() || activeCampaign();
          if (camp) {
            await refreshCampaignContacts(camp).catch(() => {});
            await refreshGates(camp).catch(() => {});
          }
          render();
        })
        .catch((e) => {
          state.ui.campaignsLoaded = false;
          flash(errorMessage(e?.code), "error");
        });
    }
    if (hasApi() && cabinet.page === "analytics") {
      const camp = activeCampaign();
      if (camp) {
        void apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/analytics/summary`, {
          session: state.session,
        })
          .then((summary) => {
            camp.analytics = {
              calls: summary.calls ?? summary.calls_total ?? 0,
              avgDuration: summary.avg_duration || summary.avgDuration || "—",
              // BE-199: «до цели» из вердиктов/marks_goal_reached — не completed_topics
              goalReached: summary.goal_reached ?? summary.goalReached ?? 0,
              completedTopics: summary.completed_topics ?? summary.completedTopics ?? 0,
              minutes: summary.minutes ?? summary.minutes_total ?? 0,
              cost: summary.cost_rub ?? summary.cost ?? 0,
            };
            persistCampaigns();
            render();
          })
          .catch((e) => flash(errorMessage(e?.code), "error"));
      }
    }
    if (hasApi() && (cabinet.page === "tariffs" || cabinet.page === "account" || cabinet.page === "workspace")) {
      void refreshCabinetMe()
        .then(() => {
          if (cabinet.page === "tariffs" || cabinet.page === "account") render();
        })
        .catch((e) => {
          if (cabinet.page === "tariffs") flash(errorMessage(e?.code) || "Не удалось загрузить тарифы", "error");
        });
    }
    return;
  }
  if (path === "/admin" || path === "/admin/settings") {
    if (!state.session || state.role !== "superadmin") {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = adminShell(path === "/admin/settings" ? "settings" : "companies");
    bindShell();
    clearFlashSoon();
    if (hasApi() && !state.ui.adminLoaded) {
      void ensureAdminData();
    }
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
    else if (state.role === "superadmin") navigate("/admin");
    else navigate("/login");
  };
  document.getElementById("forbidden-logout").onclick = () => {
    void doLogout();
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
      if (id === "integrations") {
        navigate("/cabinet/integrations");
        return;
      }
      if (id === "account") {
        navigate("/cabinet/account");
        return;
      }
      if (id === "sec-schedule") {
        state.ui.scheduleDrawerOpen = true;
        render();
        requestAnimationFrame(() => {
          document.getElementById("sec-schedule")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    logoutBtn.onclick = () => {
      void doLogout();
    };
  }
  const exitImp = document.getElementById("exit-impersonate");
  if (exitImp) {
    exitImp.onclick = async () => {
      try {
        if (hasApi()) {
          const restored = await apiFetch("/api/admin/exit-cabinet", {
            method: "POST",
            session: state.session,
          });
          applySessionPayload(restored);
        }
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
      state.impersonate = null;
      localStorage.removeItem("cm_impersonate");
      state.ui.adminLoaded = false;
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
    intervalForm.onsubmit = async (e) => {
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
      try {
        if (hasApi()) {
          const data = await apiFetch("/api/admin/settings", {
            method: "PUT",
            session: state.session,
            body: { batch_interval_sec: v },
          });
          state.adminSettings.batch_interval_sec = data.batch_interval_sec;
        } else {
          localStorage.setItem("cm_interval", String(v));
          state.adminSettings.batch_interval_sec = v;
        }
        err.hidden = true;
        ok.hidden = false;
      } catch (ex) {
        err.hidden = false;
        ok.hidden = true;
        err.textContent = errorMessage(ex?.code);
      }
    };
  }

  const newCompanyForm = document.getElementById("new-company-form");
  if (newCompanyForm) {
    newCompanyForm.onsubmit = async (e) => {
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
      try {
        if (hasApi()) {
          const result = await apiFetch("/api/admin/companies", {
            method: "POST",
            session: state.session,
            body: { name, login, password },
          });
          const mapped = mapAdminCompany({ ...result.company, login: result.login });
          state.companies = [mapped, ...state.companies.filter((c) => c.id !== mapped.id)];
          state.ui.adminExpandedId = mapped.id;
        } else {
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
            price_per_minute: state.adminSettings.default_price_per_minute || 0,
            balance: 0,
            history: [],
          });
          persistCompanies();
          state.ui.adminExpandedId = id;
        }
        document.getElementById("co-ok").hidden = false;
        err.hidden = true;
        render();
      } catch (ex) {
        err.hidden = false;
        err.textContent = errorMessage(ex?.code === "validation_error" ? "validation" : ex?.code);
      }
    };
  }

  const tariffForm = document.getElementById("default-tariff-form");
  if (tariffForm) {
    tariffForm.onsubmit = async (e) => {
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
      try {
        if (hasApi()) {
          const data = await apiFetch("/api/admin/settings", {
            method: "PUT",
            session: state.session,
            body: { default_price_per_minute: v },
          });
          state.adminSettings.default_price_per_minute = data.default_price_per_minute;
        } else {
          localStorage.setItem("cm_default_tariff", String(v));
          state.adminSettings.default_price_per_minute = v;
        }
        err.hidden = true;
        ok.hidden = false;
      } catch (ex) {
        err.hidden = false;
        ok.hidden = true;
        err.textContent = errorMessage(ex?.code);
      }
    };
  }

  document.querySelectorAll("[data-expand-company]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-expand-company");
      const next = String(state.ui.adminExpandedId) === String(id) ? null : id;
      state.ui.adminExpandedId = next;
      state.ui.adminEditId = null;
      state.ui.adminDeleteId = null;
      if (next && hasApi()) {
        try {
          const card = await apiFetch(`/api/admin/companies/${encodeURIComponent(next)}`, {
            session: state.session,
          });
          const mapped = mapAdminCompany(card);
          state.companies = state.companies.map((c) =>
            String(c.id) === String(next) ? { ...c, ...mapped } : c
          );
        } catch (ex) {
          flash(errorMessage(ex?.code), "error");
        }
      }
      render();
    };
  });
  const collapse = document.querySelector("[data-collapse-company]");
  if (collapse) {
    collapse.onclick = () => {
      state.ui.adminExpandedId = null;
      state.ui.adminEditId = null;
      state.ui.adminDeleteId = null;
      render();
    };
  }

  const editCompanyBtn = document.getElementById("edit-company");
  if (editCompanyBtn) {
    editCompanyBtn.onclick = () => {
      state.ui.adminEditId = editCompanyBtn.getAttribute("data-id");
      state.ui.adminDeleteId = null;
      render();
    };
  }
  const editCancel = document.getElementById("edit-company-cancel");
  if (editCancel) {
    editCancel.onclick = () => {
      state.ui.adminEditId = null;
      render();
    };
  }
  const editForm = document.getElementById("edit-company-form");
  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const id = editForm.getAttribute("data-id");
      const c = companyById(id);
      if (!c) return;
      const name = document.getElementById("edit-company-name")?.value?.trim() || "";
      const login = document.getElementById("edit-company-login")?.value?.trim() || "";
      const password = document.getElementById("edit-company-password")?.value || "";
      const errEl = document.getElementById("edit-company-error");
      const okEl = document.getElementById("edit-company-ok");
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (okEl) okEl.hidden = true;
      if (!name || !login) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = errorMessage("validation_error");
        }
        return;
      }
      const body = { name, login };
      if (password) body.password = password;
      try {
        if (hasApi()) {
          const res = await apiFetch(`/api/admin/companies/${encodeURIComponent(id)}`, {
            method: "PATCH",
            session: state.session,
            body,
          });
          const mapped = mapAdminCompany(res);
          state.companies = state.companies.map((row) =>
            String(row.id) === String(id) ? { ...row, ...mapped } : row
          );
        } else {
          if (state.companies.some((row) => row.login === login && String(row.id) !== String(id))) {
            throw Object.assign(new Error("login_taken"), { code: "login_taken" });
          }
          c.name = name;
          c.login = login;
          persistCompanies();
        }
        state.ui.adminEditId = null;
        flash("Сохранено");
        render();
      } catch (ex) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = errorMessage(ex?.code);
        } else {
          flash(errorMessage(ex?.code), "error");
        }
      }
    };
  }

  const deleteCompanyBtn = document.getElementById("delete-company");
  if (deleteCompanyBtn) {
    deleteCompanyBtn.onclick = () => {
      state.ui.adminDeleteId = deleteCompanyBtn.getAttribute("data-id");
      state.ui.adminEditId = null;
      render();
    };
  }
  const deleteCancel = document.getElementById("delete-company-cancel");
  if (deleteCancel) {
    deleteCancel.onclick = () => {
      state.ui.adminDeleteId = null;
      render();
    };
  }
  const deleteBackdrop = document.getElementById("delete-company-backdrop");
  if (deleteBackdrop) {
    deleteBackdrop.onclick = (e) => {
      if (e.target === deleteBackdrop) {
        state.ui.adminDeleteId = null;
        render();
      }
    };
  }
  const deleteConfirm = document.getElementById("delete-company-confirm");
  if (deleteConfirm) {
    deleteConfirm.onclick = async () => {
      const id = deleteConfirm.getAttribute("data-id");
      const c = companyById(id);
      if (!c) return;
      const bal = Number(c.balance || 0);
      const forfeitEl = document.getElementById("delete-forfeit-balance");
      const errEl = document.getElementById("delete-company-error");
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (bal > 0 && !(forfeitEl && forfeitEl.checked)) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = errorMessage("balance_not_zero");
        }
        return;
      }
      const body = { confirm: true };
      if (bal > 0) body.confirm_forfeit_balance = true;
      try {
        if (hasApi()) {
          await apiFetch(`/api/admin/companies/${encodeURIComponent(id)}`, {
            method: "DELETE",
            session: state.session,
            body,
          });
        }
        state.companies = state.companies.filter((row) => String(row.id) !== String(id));
        persistCompanies();
        state.ui.adminExpandedId = null;
        state.ui.adminDeleteId = null;
        state.ui.adminEditId = null;
        flash("Компания удалена");
        render();
      } catch (ex) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = errorMessage(ex?.code);
        } else {
          flash(errorMessage(ex?.code), "error");
        }
      }
    };
  }

  const topup = document.getElementById("topup-form");
  if (topup) {
    topup.onsubmit = async (e) => {
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
      try {
        if (hasApi()) {
          const res = await apiFetch(`/api/admin/companies/${encodeURIComponent(id)}/top-up`, {
            method: "POST",
            session: state.session,
            body: { amount_rub: amount },
          });
          c.balance = res.balance_rub;
          await refreshAdminCompanies();
        } else {
          c.balance = (c.balance || 0) + amount;
          c.history = c.history || [];
          c.history.push(`Пополнение +${amount} ₽`);
          persistCompanies();
        }
        err.hidden = true;
        ok.hidden = false;
        render();
      } catch (ex) {
        err.hidden = false;
        ok.hidden = true;
        err.textContent = errorMessage(ex?.code === "invalid_amount" ? "validation" : ex?.code);
      }
    };
  }

  document.querySelectorAll("[data-apply-package]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      const packageId = btn.getAttribute("data-apply-package");
      const label = btn.getAttribute("data-label") || packageId;
      const c = companyById(id);
      const err = document.getElementById("package-error");
      const ok = document.getElementById("package-ok");
      if (!confirm(`Пополнить по пакету «${label}» и поставить тариф ступени?`)) return;
      try {
        if (!hasApi()) {
          flash("Укажите адрес API");
          return;
        }
        const res = await apiFetch(`/api/admin/companies/${encodeURIComponent(id)}/apply-package`, {
          method: "POST",
          session: state.session,
          body: { package_id: packageId },
        });
        if (c) {
          c.balance = res.balance_rub ?? c.balance;
          c.price_per_minute = res.price_per_minute ?? c.price_per_minute;
        }
        await refreshAdminCompanies();
        if (err) err.hidden = true;
        if (ok) ok.hidden = false;
        flash("Баланс и тариф обновлены");
        render();
      } catch (ex) {
        if (ok) ok.hidden = true;
        if (err) {
          err.hidden = false;
          err.textContent = errorMessage(ex?.code) || "Не удалось применить пакет";
        } else {
          flash(errorMessage(ex?.code) || "Не удалось применить пакет", "error");
        }
      }
    };
  });

  const openCab = document.getElementById("open-cabinet");
  if (openCab) {
    openCab.onclick = async () => {
      const c = companyById(openCab.getAttribute("data-id"));
      try {
        if (hasApi()) {
          const res = await apiFetch(`/api/admin/companies/${encodeURIComponent(c.id)}/open-cabinet`, {
            method: "POST",
            session: state.session,
          });
          applySessionPayload({
            session: res.session,
            role: res.role,
            company_locked: res.company_locked,
            impersonated_company_id: res.company_id,
          });
          state.impersonate = { id: c.id, name: c.name, companyId: c.id };
          saveJson("cm_impersonate", state.impersonate);
        } else {
          state.impersonate = { id: c.id, name: c.name };
          saveJson("cm_impersonate", state.impersonate);
          state.companyLocked = c.access_status === "locked";
        }
        navigate("/cabinet/campaigns");
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    };
  }

  const toggleLock = document.getElementById("toggle-lock");
  if (toggleLock) {
    toggleLock.onclick = async () => {
      const c = companyById(toggleLock.getAttribute("data-id"));
      if (c.access_status === "locked") {
        try {
          if (hasApi()) {
            const res = await apiFetch(`/api/admin/companies/${encodeURIComponent(c.id)}/lock`, {
              method: "POST",
              session: state.session,
              body: { locked: false },
            });
            c.access_status = res.access_status || "active";
          } else {
            c.access_status = "active";
            c.history = c.history || [];
            c.history.push("Компания разблокирована");
            persistCompanies();
          }
          flash("Компания разблокирована");
          render();
        } catch (ex) {
          flash(errorMessage(ex?.code), "error");
        }
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
    lockConfirm.onclick = async () => {
      const c = companyById(lockConfirm.getAttribute("data-id"));
      try {
        if (hasApi()) {
          const res = await apiFetch(`/api/admin/companies/${encodeURIComponent(c.id)}/lock`, {
            method: "POST",
            session: state.session,
            body: { locked: true },
          });
          c.access_status = res.access_status || "locked";
        } else {
          c.access_status = "locked";
          c.history = c.history || [];
          c.history.push("Компания заблокирована");
          persistCompanies();
        }
        flash("Компания заблокирована");
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    };
  }

  const changeTariff = document.getElementById("change-tariff");
  if (changeTariff) {
    changeTariff.onclick = async () => {
      const c = companyById(changeTariff.getAttribute("data-id"));
      const v = prompt("Тариф за минуту", String(c.price_per_minute || 0));
      if (v == null) return;
      const n = Number(v);
      if (!(n > 0)) {
        flash(ERROR_BY_CODE.validation, "error");
        return;
      }
      try {
        if (hasApi()) {
          const res = await apiFetch(`/api/admin/companies/${encodeURIComponent(c.id)}/tariff`, {
            method: "POST",
            session: state.session,
            body: { price_per_minute: n },
          });
          c.price_per_minute = res.price_per_minute ?? n;
        } else {
          c.price_per_minute = n;
          c.history = c.history || [];
          c.history.push("Тариф изменён");
          persistCompanies();
        }
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    };
  }
}

function hasAssembledScenario(camp) {
  if (!camp) return false;
  const p = camp.preview || {};
  const hasPreview = Boolean(
    (p.greeting || "").trim() ||
      (p.says || "").trim() ||
      (p.replies || "").trim() ||
      (p.tone || "").trim()
  );
  const hasStages = Array.isArray(camp.stages) && camp.stages.length > 0;
  const hasScenario = Boolean((camp.scenarioText || camp.scenario_text || "").trim());
  return hasPreview || hasStages || hasScenario;
}

async function performPreviewSave(camp, { name, goal, details }) {
  camp.name = name;
  camp.goal = goal;
  camp.details = details;
  state.ui.generateError = null;
  try {
    if (hasApi()) {
      state.ui.generatePending = true;
      render();
      const updated = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}`, {
        method: "PATCH",
        session: state.session,
        body: { goal, details },
      });
      Object.assign(camp, mapCampaignFromApi(updated, camp));
      state.ui.generatePending = false;
    } else {
      camp.verdicts = ensureVerdicts(camp);
      camp.preview = mergePreviewDefaults(camp);
      if (!camp.scenarioText) camp.scenarioText = camp.preview.says;
    }
    persistCampaigns();
    flash(hasApi() ? "Сценарий собран" : "Превью сохранено");
    render();
  } catch (ex) {
    state.ui.generatePending = false;
    const code = ex?.code;
    if (isGenerateErrorCode(code)) {
      state.ui.generateError = errorMessage(code);
    }
    flash(errorMessage(code), "error");
    render();
  }
}

function bindCampaignForms() {
  const previewForm = document.getElementById("preview-form");
  if (previewForm) {
    previewForm.onsubmit = async (e) => {
      e.preventDefault();
      const camp = workspaceCampaign();
      if (!camp || isStarted(camp) || locked() || state.ui.generatePending) return;
      const name = document.getElementById("preview-name")?.value.trim() ?? camp.name ?? "";
      const goal = document.getElementById("preview-goal").value.trim();
      const details = document.getElementById("preview-details").value.trim();
      if (!goal) {
        flash("Опишите цель звонка", "error");
        return;
      }
      if (!details || details.length < 8) {
        flash("Допишите сведения", "error");
        return;
      }
      if (hasAssembledScenario(camp)) {
        state.ui.pendingPreviewSave = { name, goal, details };
        state.ui.saveRebuildOpen = true;
        render();
        return;
      }
      await performPreviewSave(camp, { name, goal, details });
    };
  }

  const rebuildCancel = document.getElementById("save-rebuild-cancel");
  const rebuildBackdrop = document.getElementById("save-rebuild-backdrop");
  const closeRebuild = () => {
    state.ui.saveRebuildOpen = false;
    state.ui.pendingPreviewSave = null;
    render();
  };
  if (rebuildCancel) rebuildCancel.onclick = closeRebuild;
  if (rebuildBackdrop) {
    rebuildBackdrop.onclick = (ev) => {
      if (ev.target === rebuildBackdrop) closeRebuild();
    };
  }
  const rebuildYes = document.getElementById("save-rebuild-yes");
  if (rebuildYes) {
    rebuildYes.onclick = async () => {
      const camp = workspaceCampaign();
      const payload = state.ui.pendingPreviewSave;
      state.ui.saveRebuildOpen = false;
      state.ui.pendingPreviewSave = null;
      if (!camp || !payload) {
        render();
        return;
      }
      await performPreviewSave(camp, payload);
    };
  }
  if (state.ui.saveRebuildOpen) {
    const onKey = (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      document.removeEventListener("keydown", onKey);
      closeRebuild();
    };
    document.addEventListener("keydown", onKey);
  }

  const newCampaignForm = document.getElementById("new-campaign-form");
  if (newCampaignForm) {
    newCampaignForm.onsubmit = async (e) => {
      e.preventDefault();
      if (locked() || state.ui.generatePending) return;
      const goal = document.getElementById("camp-goal").value.trim();
      const details = document.getElementById("camp-details").value;
      const name = document.getElementById("camp-name").value.trim();
      state.ui.newCampaignDraft = { name, goal, details };
      state.ui.newCampaignError = null;
      if (!goal) {
        state.ui.newCampaignError = "Опишите цель звонка";
        flash("Опишите цель звонка", "error");
        render();
        return;
      }
      try {
        let camp;
        let scenarioAssembled = !hasApi();
        if (hasApi()) {
          state.ui.generatePending = true;
          state.ui.generateError = null;
          render();
          const created = await apiFetch("/api/cabinet/campaigns", {
            method: "POST",
            session: state.session,
            body: { goal, details },
          });
          camp = mapCampaignFromApi(created, { name, goal, details });
          try {
            const generated = await apiFetch(
              `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/scenario/generate`,
              {
                method: "POST",
                session: state.session,
              }
            );
            Object.assign(camp, mapCampaignFromApi(generated, camp));
            scenarioAssembled = true;
          } catch (genEx) {
            const code = genEx?.code;
            if (isGenerateErrorCode(code)) {
              state.ui.generateError = errorMessage(code);
            }
            flash(errorMessage(code), "error");
          }
          state.ui.generatePending = false;
        } else {
          camp = emptyCampaign({
            name,
            goal,
            details,
            preview: buildPreview({ goal, details, preview: {} }),
            scenarioText: details,
            stages: [{ goal, input: "Приветствие", output: "Суть" }],
            verdicts: ensureVerdicts({ goal }),
          });
        }
        state.campaigns.push(camp);
        persistCampaigns();
        setActiveCampaignId(camp.id);
        state.ui.showNewCampaign = false;
        state.ui.newCampaignDraft = { name: "", goal: "", details: "" };
        state.ui.newCampaignError = null;
        if (scenarioAssembled) {
          flash(hasApi() ? "Кампания создана, сценарий собран" : "Кампания создана");
        } else if (!state.uiFlash || state.uiFlash.kind !== "error") {
          flash("Кампания создана");
        }
        navigate(`/cabinet/campaigns/${camp.id}`);
      } catch (ex) {
        state.ui.generatePending = false;
        const msg = errorMessage(ex?.code);
        state.ui.newCampaignError = msg;
        flash(msg, "error");
        render();
      }
    };
  }

  const saveScenario = document.getElementById("save-scenario");
  if (saveScenario) {
    const camp = workspaceCampaign() || activeCampaign();
    saveScenario.onclick = async () => {
      if (!camp || isStarted(camp) || locked()) return;
      camp.scenarioText = document.getElementById("scenario-text").value;
      const prev = camp.preview || {};
      camp.preview = {
        greeting: prev.greeting || "Здравствуйте!",
        says: prev.says?.trim() ? prev.says : camp.scenarioText,
        replies: prev.replies || "Отвечает коротко по сути вопроса",
        tone: prev.tone || "Спокойно и по делу, без давления оформить любой ценой",
      };
      try {
        if (hasApi()) {
          await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/scenario`, {
            method: "PUT",
            session: state.session,
            body: {
              scenario_text: camp.scenarioText,
              stages: camp.stages || [],
              verdicts: camp.verdicts || [],
            },
          });
        }
        persistCampaigns();
        document.getElementById("scenario-ok").hidden = false;
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
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
    document.querySelectorAll(".stage-form, .stage-form-compact").forEach((form) => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!camp || isStarted(camp) || locked()) return;
        const idx = Number(form.getAttribute("data-idx"));
        camp.stages = camp.stages || [];
        camp.stages[idx] = {
          goal: form.goal.value,
          input: form.input.value,
          output: form.output.value,
        };
        try {
          if (hasApi()) {
            await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/scenario`, {
              method: "PUT",
              session: state.session,
              body: {
                scenario_text: camp.scenarioText || "",
                stages: camp.stages,
                verdicts: camp.verdicts || [],
              },
            });
          }
          persistCampaigns();
          flash("Черновик сохранён");
        } catch (ex) {
          flash(errorMessage(ex?.code), "error");
        }
      };
    });
  }

  const scheduleForm = document.getElementById("schedule-form");
  if (scheduleForm) {
    scheduleForm.onsubmit = async (e) => {
      e.preventDefault();
      const camp = workspaceCampaign() || activeCampaign();
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
      try {
        if (hasApi()) {
          await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/schedule`, {
            method: "PUT",
            session: state.session,
            body: { schedule: camp.schedule, retries_max: retries },
          });
        }
        persistCampaigns();
        state.ui.scheduleDrawerOpen = false;
        flash("Сохранено");
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    };
  }

  const openSchedule = document.getElementById("schedule-open");
  if (openSchedule) {
    openSchedule.onclick = () => {
      state.ui.scheduleDrawerOpen = true;
      render();
    };
  }
  const closeSchedule = () => {
    state.ui.scheduleDrawerOpen = false;
    render();
  };
  const scheduleClose = document.getElementById("schedule-close");
  if (scheduleClose) scheduleClose.onclick = closeSchedule;
  const scheduleDone = document.getElementById("schedule-done");
  if (scheduleDone) scheduleDone.onclick = closeSchedule;
  const scheduleBackdrop = document.getElementById("schedule-drawer-backdrop");
  if (scheduleBackdrop) scheduleBackdrop.onclick = closeSchedule;

  const openLaunchReasons = document.getElementById("launch-reasons-open");
  if (openLaunchReasons) {
    openLaunchReasons.onclick = () => {
      state.ui.launchReasonsDrawerOpen = true;
      render();
    };
  }
  const closeLaunchReasons = () => {
    state.ui.launchReasonsDrawerOpen = false;
    render();
  };
  const launchReasonsClose = document.getElementById("launch-reasons-close");
  if (launchReasonsClose) launchReasonsClose.onclick = closeLaunchReasons;
  const launchReasonsBackdrop = document.getElementById("launch-reasons-backdrop");
  if (launchReasonsBackdrop) launchReasonsBackdrop.onclick = closeLaunchReasons;
}

function workspaceCampaign() {
  const parsed = parseCabinet(route());
  if (parsed?.page === "workspace" && parsed.id) return campaignById(parsed.id);
  return null;
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

function applyTelephonyPayload(p) {
  if (!p) return;
  const status =
    p.connection_status === "ok" ? "ok" : p.connection_status === "error" ? "error" : "unknown";
  state.telephony = {
    ...state.telephony,
    status,
    provider: p.mode || state.telephony.provider,
    lines: p.lines_limit != null ? p.lines_limit : state.telephony.lines,
    sipSaved: Boolean(p.has_sip_password || p.sip_host),
    has_sip_password: Boolean(p.has_sip_password),
    sip_host: p.sip_host || "",
    sip_login: p.sip_login || "",
    lastError: p.error_code || null,
    checking: p.connection_status === "checking",
  };
  persistTelephony();
}

async function refreshTelephony() {
  if (!hasApi()) return;
  const data = await apiFetch("/api/cabinet/telephony", { session: state.session });
  applyTelephonyPayload(data);
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
    linesForm.onsubmit = async (e) => {
      e.preventDefault();
      if (locked()) return;
      if (!saveLinesFromForm()) return;
      if (!hasApi()) {
        flash("Сохранено");
        return;
      }
      try {
        const body = {
          mode: state.telephony.provider === "mango" ? "mango" : "sip",
          lines_limit: state.telephony.lines,
          sip_host: state.telephony.sip_host || "",
          sip_login: state.telephony.sip_login || "",
        };
        const data = await apiFetch("/api/cabinet/telephony", {
          method: "PUT",
          session: state.session,
          body,
        });
        applyTelephonyPayload(data);
        flash("Сохранено");
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    };
  }

  const sipFormEl = document.getElementById("sip-form");
  if (sipFormEl) {
    sipFormEl.onsubmit = async (e) => {
      e.preventDefault();
      if (locked()) return;
      if (!saveLinesFromForm()) return;
      const sip_host = document.getElementById("sip-host").value.trim();
      const sip_login = document.getElementById("sip-login").value.trim();
      const sip_password = document.getElementById("sip-password").value;
      const err = document.getElementById("sip-error");
      if (!hasApi()) {
        state.telephony.sipSaved = true;
        state.telephony.provider = "sip";
        state.telephony.sip_host = sip_host;
        state.telephony.sip_login = sip_login;
        document.getElementById("sip-password").value = "";
        persistTelephony();
        flash("Сохранено");
        return;
      }
      try {
        const body = {
          mode: "sip",
          sip_host,
          sip_login,
          lines_limit: state.telephony.lines || 1,
        };
        if (sip_password) body.sip_password = sip_password;
        const data = await apiFetch("/api/cabinet/telephony", {
          method: "PUT",
          session: state.session,
          body,
        });
        applyTelephonyPayload(data);
        document.getElementById("sip-password").value = "";
        if (err) err.hidden = true;
        flash("Сохранено");
        render();
      } catch (ex) {
        if (err) {
          err.hidden = false;
          err.textContent = errorMessage(ex?.code);
        } else {
          flash(errorMessage(ex?.code), "error");
        }
      }
    };
    const check = document.getElementById("sip-check");
    if (check) check.onclick = () => runSipCheck();
  }

  const recheck = document.getElementById("sip-recheck");
  if (recheck) recheck.onclick = () => runSipCheck();

  const mango = document.getElementById("mango-form");
  if (mango) {
    mango.onsubmit = async (e) => {
      e.preventDefault();
      if (locked()) return;
      if (!saveLinesFromForm()) return;
      const pwd = document.getElementById("mango-password");
      if (pwd) pwd.value = "";
      if (!hasApi()) {
        flash(errorMessage("api_not_configured"), "error");
        return;
      }
      state.telephony.checking = true;
      persistTelephony();
      render();
      try {
        const data = await apiFetch("/api/cabinet/telephony", {
          method: "PUT",
          session: state.session,
          body: { mode: "mango", lines_limit: state.telephony.lines || 1 },
        });
        applyTelephonyPayload(data);
        state.ui.telephonyPanel = null;
        flash("Телефония подключена");
        render();
      } catch (ex) {
        state.telephony.checking = false;
        state.telephony.status = "error";
        state.telephony.lastError = ex?.code || "sip_unknown";
        persistTelephony();
        flash(errorMessage(ex?.code), "error");
        render();
      }
    };
  }
}

async function runSipCheck() {
  if (locked()) return;
  if (!hasApi()) {
    flash(errorMessage("api_not_configured"), "error");
    return;
  }
  state.telephony.checking = true;
  persistTelephony();
  render();
  try {
    const result = await apiFetch("/api/cabinet/telephony/verify", {
      method: "POST",
      session: state.session,
    });
    applyTelephonyPayload({
      ...state.telephony,
      connection_status: result.connection_status,
      error_code: result.error_code,
      mode: state.telephony.provider || "sip",
      lines_limit: state.telephony.lines,
      sip_host: state.telephony.sip_host,
      sip_login: state.telephony.sip_login,
      has_sip_password: state.telephony.has_sip_password,
    });
    if (result.connection_status === "ok") {
      state.ui.telephonyPanel = null;
      flash("Телефония подключена");
    } else {
      state.telephony.status = "error";
      state.telephony.lastError = result.error_code || "sip_unknown";
    }
    persistTelephony();
    render();
  } catch (ex) {
    state.telephony.checking = false;
    state.telephony.status = "error";
    state.telephony.lastError = ex?.code || "sip_unknown";
    persistTelephony();
    flash(errorMessage(ex?.code), "error");
    render();
  }
}

function bindContacts() {
  const pick = document.getElementById("pick-file");
  const file = document.getElementById("contact-file");
  if (pick && file) {
    pick.onclick = () => file.click();
    file.onchange = () => uploadContactsFile(file.files?.[0]);
  }
  const zone = document.getElementById("upload-zone");
  if (zone) {
    zone.ondragover = (e) => {
      e.preventDefault();
    };
    zone.ondrop = (e) => {
      e.preventDefault();
      if (locked()) return;
      uploadContactsFile(e.dataTransfer.files?.[0]);
    };
  }

  const camp = workspaceCampaign() || activeCampaign();

  function selectedContactRows() {
    return [...document.querySelectorAll(".contact-check:checked")].map((el) => ({
      phone: el.getAttribute("data-phone"),
      id: el.getAttribute("data-id"),
    }));
  }

  function syncContactsSelectionUi() {
    const checks = [...document.querySelectorAll(".contact-check")];
    const selected = checks.filter((c) => c.checked);
    const countEl = document.getElementById("contacts-selected-count");
    const clearBtn = document.getElementById("contacts-clear-selection");
    const cancelBtn = document.getElementById("cancel-contacts");
    const restoreBtn = document.getElementById("restore-contacts");
    const selectAll = document.getElementById("contacts-select-all");
    const n = selected.length;
    if (countEl) countEl.textContent = `Выбрано: ${n}`;
    if (clearBtn) clearBtn.hidden = n === 0;
    if (cancelBtn) cancelBtn.disabled = n === 0 || locked();
    if (restoreBtn) restoreBtn.disabled = n === 0 || locked();
    if (selectAll && checks.length) {
      selectAll.checked = n === checks.length;
      selectAll.indeterminate = n > 0 && n < checks.length;
    }
  }

  const selectAll = document.getElementById("contacts-select-all");
  if (selectAll) {
    selectAll.onchange = () => {
      document.querySelectorAll(".contact-check").forEach((c) => {
        c.checked = selectAll.checked;
      });
      syncContactsSelectionUi();
    };
  }
  document.querySelectorAll(".contact-check").forEach((c) => {
    c.onchange = () => syncContactsSelectionUi();
  });
  const clearSel = document.getElementById("contacts-clear-selection");
  if (clearSel) {
    clearSel.onclick = () => {
      document.querySelectorAll(".contact-check").forEach((c) => {
        c.checked = false;
      });
      const all = document.getElementById("contacts-select-all");
      if (all) {
        all.checked = false;
        all.indeterminate = false;
      }
      syncContactsSelectionUi();
    };
  }
  syncContactsSelectionUi();

  async function runCancelSelected(selected) {
    const msg = document.getElementById("contacts-action-msg");
    let done = 0;
    let skipped = 0;
    try {
      for (const row of selected) {
        const ct = camp.contacts.find((c) => c.phone === row.phone || (row.id && c.id === row.id));
        if (!ct || ct.status === STATUS.cancel) {
          skipped += 1;
          continue;
        }
        if (hasApi()) {
          if (!ct.id) {
            skipped += 1;
            continue;
          }
          await apiFetch(
            `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/${encodeURIComponent(ct.id)}/cancel`,
            { method: "POST", session: state.session }
          );
        }
        ct.status = STATUS.cancel;
        done += 1;
      }
      persistCampaigns();
      if (msg) {
        msg.textContent =
          skipped && done ? `Сняли: ${done}. Пропустили: ${skipped}` : done ? "Сняли с обзвона" : "Выберите номера";
      }
      state.ui.contactsBulkConfirm = null;
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
  }

  async function runRestoreSelected(selected) {
    const msg = document.getElementById("contacts-action-msg");
    let done = 0;
    let skipped = 0;
    try {
      for (const row of selected) {
        const ct = camp.contacts.find((c) => c.phone === row.phone || (row.id && c.id === row.id));
        if (!ct || ct.status !== STATUS.cancel) {
          skipped += 1;
          continue;
        }
        if (hasApi()) {
          if (!ct.id) {
            skipped += 1;
            continue;
          }
          await apiFetch(
            `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/${encodeURIComponent(ct.id)}/restore`,
            { method: "POST", session: state.session }
          );
        }
        ct.status = STATUS.in_progress;
        done += 1;
      }
      persistCampaigns();
      if (msg) {
        msg.textContent =
          skipped && done ? `Вернули: ${done}. Пропустили: ${skipped}` : done ? "Вернули в обзвон" : "Выберите номера";
      }
      state.ui.contactsBulkConfirm = null;
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
  }

  const cancelBtn = document.getElementById("cancel-contacts");
  if (cancelBtn && camp) {
    cancelBtn.onclick = () => {
      const selected = selectedContactRows();
      const msg = document.getElementById("contacts-action-msg");
      if (!selected.length) {
        if (msg) msg.textContent = "Выберите номера";
        return;
      }
      const applicable = selected.filter((row) => {
        const ct = camp.contacts.find((c) => c.phone === row.phone || (row.id && c.id === row.id));
        return ct && ct.status !== STATUS.cancel;
      });
      const n = applicable.length || selected.length;
      state.ui.contactsBulkConfirm = {
        kind: "cancel",
        title: "Снять с обзвона?",
        body: `Снять выбранные номера с обзвона? По ним не будем звонить, пока не вернёте.`,
        ok: "Снять",
        selected,
        count: n,
      };
      render();
    };
  }
  const restoreBtn = document.getElementById("restore-contacts");
  if (restoreBtn && camp) {
    restoreBtn.onclick = () => {
      const selected = selectedContactRows();
      const msg = document.getElementById("contacts-action-msg");
      if (!selected.length) {
        if (msg) msg.textContent = "Выберите номера";
        return;
      }
      state.ui.contactsBulkConfirm = {
        kind: "restore",
        title: "Вернуть в обзвон?",
        body: "Вернуть выбранные номера в обзвон?",
        ok: "Вернуть",
        selected,
      };
      render();
    };
  }

  const bulkCancel = document.getElementById("contacts-bulk-cancel");
  const bulkBackdrop = document.getElementById("contacts-bulk-backdrop");
  const closeBulk = () => {
    state.ui.contactsBulkConfirm = null;
    render();
  };
  if (bulkCancel) bulkCancel.onclick = closeBulk;
  if (bulkBackdrop) {
    bulkBackdrop.onclick = (ev) => {
      if (ev.target === bulkBackdrop) closeBulk();
    };
  }
  const bulkYes = document.getElementById("contacts-bulk-yes");
  if (bulkYes && state.ui.contactsBulkConfirm) {
    bulkYes.onclick = async () => {
      const conf = state.ui.contactsBulkConfirm;
      if (!conf || !camp) return;
      if (conf.kind === "cancel") await runCancelSelected(conf.selected);
      else if (conf.kind === "restore") await runRestoreSelected(conf.selected);
    };
  }
  if (state.ui.contactsBulkConfirm) {
    const onKey = (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      document.removeEventListener("keydown", onKey);
      closeBulk();
    };
    document.addEventListener("keydown", onKey);
  }

  const reloadEntry = document.getElementById("reload-entry");
  if (reloadEntry && camp) {
    reloadEntry.onclick = () => showReloadPrecheck(camp);
  }
}

async function refreshCampaignContacts(camp) {
  if (!hasApi() || !camp?.id) return;
  const data = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts`, {
    session: state.session,
  });
  camp.contacts = (data?.items || []).map((item) => ({
    id: item.id,
    phone: item.phone,
    status: item.status || STATUS.in_progress,
    attrs: item.attrs || {},
    verdict: item.verdict ?? null,
    attempt_count: item.attempt_count ?? 0,
    last_transcript: item.last_transcript ?? null,
    attempts: item.attempts || (item.last_attempt ? [item.last_attempt] : []),
    last_attempt: item.last_attempt || null,
    cause_code: item.cause_code || null,
  }));
  persistCampaigns();
}

async function uploadContactsFile(file) {
  if (!file || locked() || state.ui.contactsUploading) return;
  const camp = workspaceCampaign() || activeCampaign();
  if (!camp) return;

  state.ui.contactsUploading = true;
  // Paint progress before long fetch so UI does not look frozen (FE-161).
  render();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const progress = document.getElementById("upload-progress");
  const hint = document.getElementById("upload-progress-hint");
  const batchHint = document.getElementById("upload-batch-hint");
  const ok = document.getElementById("upload-ok");
  const errors = document.getElementById("upload-errors");
  if (progress) {
    progress.hidden = false;
    progress.textContent = "Загружаем контакты…";
  }
  if (hint) hint.hidden = false;
  if (batchHint) batchHint.hidden = false;
  if (ok) ok.hidden = true;
  if (errors) errors.innerHTML = "";

  if (!hasApi()) {
    state.ui.contactsUploading = false;
    if (progress) progress.hidden = true;
    if (hint) hint.hidden = true;
    if (batchHint) batchHint.hidden = true;
    if (errors) errors.innerHTML = `<p class="error">${escapeHtml(errorMessage("api_not_configured"))}</p>`;
    render();
    return;
  }

  try {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const result = await apiFetch(
      `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/upload`,
      { method: "POST", session: state.session, body: fd }
    );
    state.ui.contactsUploading = false;
    if (progress) progress.hidden = true;
    if (hint) hint.hidden = true;
    if (batchHint) batchHint.hidden = true;
    if (result?.mode === "draft") {
      render();
      showServerReloadDraft(camp, result);
      return;
    }
    const rejected = result?.rejected || [];
    const warnings = result?.warnings || [];
    if (rejected.length && errors) {
      errors.innerHTML = rejected
        .slice(0, 8)
        .map(
          (r) =>
            `<p class="error">${escapeHtml(typeof r === "string" ? r : r.reason || r.code || "Строка отклонена")}</p>`
        )
        .join("");
    }
    if (warnings.length) {
      camp.uploadWarnings = warnings.map((w) => (typeof w === "string" ? w : w.message || String(w)));
    }
    await refreshCampaignContacts(camp);
    render();
    const okEl = document.getElementById("upload-ok");
    if (okEl) {
      okEl.hidden = false;
      okEl.textContent =
        result?.accepted != null ? `Контакты загружены: ${result.accepted}` : "Контакты загружены";
    }
  } catch (ex) {
    state.ui.contactsUploading = false;
    render();
    const errBox = document.getElementById("upload-errors");
    const code = ex?.code;
    if (!errBox) return;
    if (code === "unsupported_format") {
      errBox.innerHTML = `<p class="error">${escapeHtml(errorMessage("unsupported_format"))}</p>`;
    } else if (code === "file_too_large") {
      errBox.innerHTML = `<p class="error">${escapeHtml(errorMessage("file_too_large"))}</p>`;
    } else if (code === "missing_columns") {
      errBox.innerHTML = `<p class="error">Не нашли нужные колонки</p>
        <p class="hint">Нужен столбец с телефоном</p>`;
    } else {
      errBox.innerHTML = `<p class="error">${escapeHtml(errorMessage(code))}</p>`;
    }
  }
}

function showServerReloadDraft(camp, draft) {
  const box = document.getElementById("reload-precheck");
  const newColBox = document.getElementById("new-col-alert");
  if (!box) return;
  const draftId = draft.draft_id;
  const action = draft.action || "confirm";
  const newColumns = draft.new_columns || [];
  const dupCount = draft.duplicates ?? 0;
  const accepted = draft.accepted ?? 0;

  async function cancelDraft() {
    try {
      if (draftId) {
        await apiFetch(
          `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/drafts/${encodeURIComponent(draftId)}/cancel`,
          { method: "POST", session: state.session }
        );
      }
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
    box.hidden = true;
    if (newColBox) newColBox.hidden = true;
    flash("Догрузка отменена — в кампанию ничего не добавили");
  }

  async function confirmDraft({ addFields = false } = {}) {
    try {
      const res = await apiFetch(
        `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/drafts/${encodeURIComponent(draftId)}/confirm`,
        {
          method: "POST",
          session: state.session,
          body: addFields ? { add_fields: true } : {},
        }
      );
      await refreshCampaignContacts(camp);
      box.hidden = true;
      if (newColBox) newColBox.hidden = true;
      flash(
        res?.accepted != null ? `Догрузка принята: ${res.accepted}` : "Догрузка принята"
      );
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
  }

  if (action === "cancel_only") {
    if (newColBox) {
      newColBox.hidden = false;
      newColBox.innerHTML = `<p><strong>В новой порции есть поле, которого не было у старых номеров</strong></p>
       <p class="hint">${escapeHtml(newColumns.join(", "))}</p>
       <p class="hint">После старта новое поле в сценарий не добавить — отмените догрузку или подготовьте файл без новых полей</p>
       <button class="btn secondary" type="button" id="newcol-cancel">Отменить</button>`;
      document.getElementById("newcol-cancel").onclick = cancelDraft;
    }
    box.hidden = true;
    return;
  }

  if (action === "add_field_or_cancel" && newColumns.length) {
    if (newColBox) {
      newColBox.hidden = false;
      newColBox.innerHTML = `<p><strong>В файле новое поле</strong></p>
       <p class="hint">${escapeHtml(newColumns.join(", "))}</p>
       <button class="btn secondary" type="button" id="newcol-cancel">Отменить</button>
       <button class="btn" type="button" id="newcol-add">Добавить поле в сценарий и подтвердить</button>`;
      document.getElementById("newcol-cancel").onclick = cancelDraft;
      document.getElementById("newcol-add").onclick = () => confirmDraft({ addFields: true });
    }
    box.hidden = true;
    return;
  }

  box.hidden = false;
  box.innerHTML = `<h4>Предпроверка</h4>
    <p class="hint">Покажите расхождения до подтверждения</p>
    <p>К догрузке: ${escapeHtml(String(accepted))} · обновление у уже загруженных: ${escapeHtml(String(dupCount))}</p>
    <p class="hint">Тот же телефон — не второй контакт, а обновление полей. Пока не подтвердите — в обзвон не попадёт</p>
    <button class="btn" type="button" id="reload-confirm">Подтвердить догрузку</button>
    <button class="btn secondary" type="button" id="reload-cancel">Отменить</button>`;
  document.getElementById("reload-cancel").onclick = cancelDraft;
  document.getElementById("reload-confirm").onclick = () => confirmDraft();
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
  const neu = incoming || [];
  if (!neu.length) {
    box.hidden = false;
    box.innerHTML = `<h4>Предпроверка</h4><p class="hint">В файле нет номеров для догрузки</p>
      <button class="btn secondary" type="button" id="reload-cancel">Отменить</button>`;
    document.getElementById("reload-cancel").onclick = () => {
      box.hidden = true;
    };
    return;
  }
  const dupCount = (camp.contacts || []).filter((c) => neu.some((n) => n.phone === c.phone)).length;
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
        existing.attrs = { ...(existing.attrs || {}), ...(n.attrs || {}) };
        updated++;
      } else {
        camp.contacts.push(n);
        added++;
      }
    }
    if (brandNew?.length) {
      camp.columns = [...new Set([...(camp.columns || []), ...brandNew])];
    }
    persistCampaigns();
    box.hidden = true;
    flash(`Догрузка принята: +${added} новых, обновлено ${updated}`);
    render();
  };
}

function bindLaunch() {
  const camp = workspaceCampaign() || activeCampaign();
  if (!camp) return;

  const start = document.getElementById("dial-start");
  if (start) {
    start.onclick = async () => {
      if (locked() || launchBlockReasons(camp).length) return;
      const prog = document.getElementById("dial-progress");
      if (prog) {
        prog.hidden = false;
        prog.textContent = hasApi() ? "Запускаем…" : "Нужен адрес API";
      }
      if (!hasApi()) {
        flash("Укажите адрес API (CALLMATE_API_BASE), чтобы начать обзвон");
        if (prog) prog.hidden = true;
        return;
      }
      try {
        await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/start`, {
          method: "POST",
          session: state.session,
        });
        camp.dial_state = "running";
        // Do not invent contact outcomes locally — server/worker owns dial.
        persistCampaigns();
        flash("Обзвон поставлен в работу. Набор по очереди — следующий этап");
        ensureDialStatePoll();
        render();
      } catch (err) {
        flash(errorMessage(err?.code), "error");
        if (prog) prog.hidden = true;
      }
    };
  }
  const pause = document.getElementById("dial-pause");
  if (pause) {
    pause.onclick = async () => {
      if (!hasApi()) {
        flash("Укажите адрес API");
        return;
      }
      const prog = document.getElementById("dial-progress");
      if (prog) {
        prog.hidden = false;
        prog.textContent = "Ставим на паузу…";
      }
      try {
        const res = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/pause`, {
          method: "POST",
          session: state.session,
        });
        camp.dial_state = res.dial_state || "paused";
        persistCampaigns();
        flash("На паузе. Текущий разговор закончим. Новые звонки не начнём");
        ensureDialStatePoll();
        render();
      } catch (err) {
        flash(errorMessage(err?.code) || "Не удалось поставить на паузу", "error");
        if (prog) prog.hidden = true;
      }
    };
  }
  const resume = document.getElementById("dial-resume");
  if (resume) {
    resume.onclick = async () => {
      if (!hasApi()) {
        flash("Укажите адрес API");
        return;
      }
      try {
        const res = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/resume`, {
          method: "POST",
          session: state.session,
        });
        camp.dial_state = res.dial_state || "running";
        persistCampaigns();
        ensureDialStatePoll();
        render();
      } catch (err) {
        flash(errorMessage(err?.code) || "Не удалось продолжить", "error");
      }
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
    stopYes.onclick = async () => {
      if (!hasApi()) {
        flash("Укажите адрес API");
        return;
      }
      const prog = document.getElementById("dial-progress");
      if (prog) {
        prog.hidden = false;
        prog.textContent = "Останавливаем…";
      }
      try {
        const res = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/stop`, {
          method: "POST",
          session: state.session,
        });
        camp.dial_state = res.dial_state || "stopped";
        persistCampaigns();
        flash("Остановлен. Текущий разговор договорим");
        render();
      } catch (err) {
        flash(errorMessage(err?.code) || "Не удалось остановить", "error");
        if (prog) prog.hidden = true;
      }
    };
  }
  const stopNo = document.getElementById("stop-no");
  if (stopNo)
    stopNo.onclick = () => {
      document.getElementById("stop-confirm").hidden = true;
    };
  if (camp.dial_state === "running" || camp.dial_state === "paused") {
    ensureDialStatePoll();
  }
}

function bindStatuses() {
  document.querySelectorAll("[data-expand-status]").forEach((btn) => {
    btn.onclick = async () => {
      const key = btn.getAttribute("data-expand-status");
      state.ui.statusExpandKey = state.ui.statusExpandKey === key ? null : key;
      const camp = workspaceCampaign() || activeCampaign();
      if (hasApi() && camp && state.ui.statusExpandKey) {
        const phone = String(key || "").split("|").slice(1).join("|");
        const ct = (camp.contacts || []).find((c) => c.phone === phone || `${camp.id}|${c.phone}` === key);
        if (ct?.id) {
          try {
            const card = await apiFetch(
              `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/${encodeURIComponent(ct.id)}`,
              { session: state.session }
            );
            Object.assign(ct, {
              status: card.status || ct.status,
              verdict: card.verdict ?? null,
              attrs: card.attrs || ct.attrs,
              attempt_count: card.attempt_count ?? ct.attempt_count,
              attempts: card.attempts || ct.attempts || [],
              last_transcript: card.last_transcript ?? ct.last_transcript,
              transcript: card.last_transcript || card.transcript || ct.transcript,
            });
            persistCampaigns();
          } catch (ex) {
            flash(errorMessage(ex?.code), "error");
          }
        }
      }
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
  document.querySelectorAll("[data-contact-filter]").forEach((btn) => {
    btn.onclick = async () => {
      const next = btn.getAttribute("data-contact-filter") || "all";
      state.ui.contactStatusFilter = next;
      const camp = workspaceCampaign() || activeCampaign();
      if (hasApi() && camp) {
        try {
          const q =
            next && next !== "all"
              ? `?status=${encodeURIComponent(STATUS[next] || next)}`
              : "";
          const data = await apiFetch(
            `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts${q}`,
            { session: state.session }
          );
          camp.contacts = (data?.items || []).map((item) => ({
            id: item.id,
            phone: item.phone,
            status: item.status || STATUS.in_progress,
            attrs: item.attrs || {},
            verdict: item.verdict ?? null,
            attempts:
              item.attempts ||
              (item.last_attempt ? [item.last_attempt] : []),
            last_attempt: item.last_attempt || null,
            cause_code: item.cause_code || null,
          }));
          persistCampaigns();
        } catch (ex) {
          flash(errorMessage(ex?.code), "error");
        }
      }
      render();
    };
  });
  document.querySelectorAll("[data-outcome-filter]").forEach((btn) => {
    btn.onclick = () => {
      state.ui.contactOutcomeFilter = btn.getAttribute("data-outcome-filter") || "all";
      render();
    };
  });
}

function bindAnalytics() {
  const btn = document.getElementById("export-excel");
  if (!btn) return;
  btn.onclick = async () => {
    const camp = activeCampaign();
    const st = document.getElementById("export-status");
    const err = document.getElementById("export-error");
    if (err) err.hidden = true;
    if (st) {
      st.hidden = false;
      st.textContent = "Готовим файл…";
    }
    btn.disabled = true;
    try {
      if (!hasApi() || !camp) {
        throw Object.assign(new Error("api_not_configured"), { code: "api_not_configured" });
      }
      const res = await apiFetch(
        `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/analytics/export.xlsx`,
        { session: state.session }
      );
      const blob = res instanceof Response ? await res.blob() : res;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "analytics.csv";
      a.click();
      if (st) {
        st.textContent = "";
        st.hidden = true;
      }
    } catch (ex) {
      if (err) {
        err.hidden = false;
        err.textContent = errorMessage(ex?.code);
      } else {
        flash(errorMessage(ex?.code), "error");
      }
      if (st) st.hidden = true;
    } finally {
      btn.disabled = false;
    }
  };
}

function applySessionPayload(data) {
  state.session = data.session || state.session;
  state.role = data.role || "";
  state.companyLocked = Boolean(data.company_locked);
  if (data.impersonated_company_id) {
    state.impersonate = { companyId: data.impersonated_company_id };
    localStorage.setItem("cm_impersonate", JSON.stringify(state.impersonate));
  }
  localStorage.setItem("cm_session", state.session);
  localStorage.setItem("cm_role", state.role);
  localStorage.setItem("cm_locked", state.companyLocked ? "1" : "0");
}

async function restoreSession() {
  if (!hasApi() || !state.session) return;
  try {
    const data = await fetchSession(state.session);
    applySessionPayload({ ...data, session: state.session });
  } catch (e) {
    if (e?.code === "invalid_session" || e?.status === 401) {
      clearSession();
    }
  }
}

function clearSession() {
  state.session = "";
  state.role = "";
  state.companyLocked = false;
  state.impersonate = null;
  state.ui.adminLoaded = false;
  state.ui.telephonyLoaded = false;
  state.ui.campaignsLoaded = false;
  localStorage.removeItem("cm_session");
  localStorage.removeItem("cm_role");
  localStorage.removeItem("cm_locked");
  localStorage.removeItem("cm_impersonate");
}

/** Clear local session first so UI always leaves; server logout is best-effort. */
async function doLogout() {
  const token = state.session;
  clearSession();
  navigate("/login");
  if (token) await apiLogout(token);
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
      applySessionPayload(data);
      navigate(data.role === "superadmin" ? "/admin" : "/cabinet/campaigns");
    } catch (e) {
      document.getElementById("password").value = "";
      err.hidden = false;
      err.textContent = errorMessage(e?.code || "invalid_credentials");
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
restoreSession().finally(() => render());
