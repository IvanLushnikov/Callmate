import { login as apiLogin, logout as apiLogout, hasApi, apiFetch, errorMessage, fetchSession, verifyTotpLogin } from "./api.js";

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

/** FE-238 — пачки первой загрузки в пустую кампанию */
const CONTACT_UPLOAD_CHUNK_SIZE = 2000;
const CONTACT_UPLOAD_MAX_ROWS = 2_000_000;
const SPEED_PROMISE_DISMISS_KEY = "scx_speed_promise_dismissed";

const ARCHETYPE_CARDS = [
  { id: "", title: "Подберём сами", hint: "По цели и сведениям", auto: true },
  { id: "guide_task", title: "Помощь в приложении", hint: "Проведём по шагам интеграции или настройки" },
  { id: "feedback_interview", title: "Опрос после визита", hint: "Спросим, что понравилось и что улучшить" },
  { id: "notify_support", title: "Сообщить и ответить", hint: "Донесём факт и ответим на вопросы" },
  { id: "winback_feedback", title: "Вернуть клиента", hint: "Узнаем барьеры и мягко напомним о продукте" },
  { id: "offer_educational", title: "Рассказать об оффере", hint: "Курсы, условия, ссылка на сайт" },
];

const STAGE_KIND_LABEL = {
  open: "Контакт",
  close: "Завершение",
  guide_step: "Пошаговая помощь",
  interview: "Вопрос",
  notify_deliver: "Уведомление",
  notify_qa: "Вопросы",
  offer: "Оффер",
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
  { id: "tariffs", label: "Биллинг", href: "#/cabinet/tariffs" },
  { id: "account", label: "Настройки", href: "#/cabinet/account" },
];

const WORKSPACE_TABS = [
  { id: "overview", label: "Обзор" },
  { id: "contacts", label: "Контакты" },
  { id: "scenario", label: "Сценарий" },
  { id: "calls", label: "Звонки" },
  { id: "results", label: "Результаты" },
  { id: "settings", label: "Настройки" },
];

const ADMIN_TABS = [
  { id: "companies", label: "Компании", href: "#/admin" },
  { id: "integrations", label: "Интеграции", href: "#/admin/integrations" },
  { id: "settings", label: "Настройки", href: "#/admin/settings" },
];

function loadJson(key, fallback, store = localStorage) {
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJson(key, value, store = localStorage) {
  store.setItem(key, JSON.stringify(value));
}

/** Session bearer is a secret (ARCH-108): sessionStorage only, never localStorage. */
function readSessionToken() {
  try {
    const fromSession = sessionStorage.getItem("scx_session") || "";
    if (fromSession) return fromSession;
    // One-shot migrate away from legacy localStorage leak.
    const legacy = localStorage.getItem("scx_session") || "";
    if (legacy) {
      sessionStorage.setItem("scx_session", legacy);
      localStorage.removeItem("scx_session");
    }
    return legacy;
  } catch {
    return "";
  }
}

function writeSessionToken(token) {
  try {
    if (token) sessionStorage.setItem("scx_session", token);
    else sessionStorage.removeItem("scx_session");
    localStorage.removeItem("scx_session");
  } catch {
    /* private mode / blocked storage */
  }
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
  if (changed) saveJson("scx_companies", out);
  return out;
}

const state = {
  session: readSessionToken(),
  role: localStorage.getItem("scx_role") || "",
  theme: localStorage.getItem("scx_theme") || "light",
  companyLocked: localStorage.getItem("scx_locked") === "1",
  impersonate: loadJson("scx_impersonate", null, sessionStorage) || loadJson("scx_impersonate", null),
  companies: ensureCompanyIds(loadJson("scx_companies", [])),
  campaigns: loadJson("scx_campaigns", []),
  telephony: loadJson("scx_telephony", {
    status: "unknown",
    provider: null,
    lines: null,
    sipSaved: false,
    lastError: null,
    checking: false,
  }),
  companyBalance: Number(localStorage.getItem("scx_co_balance") || "500"),
  companyTariff: Number(localStorage.getItem("scx_co_tariff") || "5"),
  activeCampaignId: localStorage.getItem("scx_active_campaign") || "",
  uiFlash: null,
  ui: {
    telephonyPanel: null,
    showNewCampaign: false,
    adminExpandedId: null,
    adminEditId: null,
    adminDeleteId: null,
    adminLoaded: false,
    contactsUploading: false,
    uploadCancelRequested: false,
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
    newCampaignDraft: { name: "", goal: "", details: "", archetype: "", archetype_locked: false, knowledge_pack: {} },
    newCampaignError: null,
    saveRebuildOpen: false,
    pendingPreviewSave: null,
    contactSelectAll: false,
    contactsBulkConfirm: null,
    purgeDataOpen: false,
    purgeDataPending: false,
    contactsEmptyAfterPurge: false,
    workspaceTab: "overview",
    mobileNavOpen: false,
    consentOpen: false,
    contactUploadPreview: null,
  },
  adminSettings: {
    batch_interval_sec: Number(localStorage.getItem("scx_interval") || "30"),
    default_price_per_minute: Number(localStorage.getItem("scx_default_tariff") || "0"),
  },
  pendingTotp: null,
  adminTotp: {
    enabled: null,
    setup: null,
    recoveryCodes: null,
    busy: false,
    error: "",
  },
  adminIntegrations: {
    loaded: false,
    items: [],
    catalog: {},
    secret_management: null,
    forms: {},
    feedback: {},
    busy: {},
  },
};

function persistCampaigns() {
  saveJson("scx_campaigns", state.campaigns);
}

function persistCompanies() {
  saveJson("scx_companies", state.companies);
}

function persistTelephony() {
  saveJson("scx_telephony", state.telephony);
}

function persistActiveCampaign() {
  if (state.activeCampaignId) {
    localStorage.setItem("scx_active_campaign", state.activeCampaignId);
  } else {
    localStorage.removeItem("scx_active_campaign");
  }
}

function setActiveCampaignId(id) {
  state.activeCampaignId = id ? String(id) : "";
  persistActiveCampaign();
}

function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem("scx_theme", theme);
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
  if (path.startsWith("/admin") && path !== "/admin" && path !== "/admin/settings" && path !== "/admin/integrations") {
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
  if (stateName === "stopped") return "Завершена";
  if (stateName === "paused") return "На паузе";
  return "Черновик";
}

function operationalStatus(camp) {
  if (!camp) return { label: "—", tone: "muted", code: "unknown" };
  if (camp.dial_state === "running") return { label: "Идёт обзвон", tone: "ok", code: "running" };
  if (camp.dial_state === "paused") return { label: "На паузе", tone: "warn", code: "paused" };
  if (camp.dial_state === "stopped") return { label: "Завершена", tone: "muted", code: "stopped" };
  const reasons = launchBlockReasons(camp);
  if (!reasons.length) return { label: "Готово к запуску", tone: "ok", code: "ready" };
  return { label: "Нужны действия", tone: "warn", code: "needs_action" };
}

function statusBadgeHtml(camp, { compact = false } = {}) {
  const st = operationalStatus(camp);
  return `<span class="status-badge status-badge--${st.tone}${compact ? " status-badge--compact" : ""}" aria-label="Статус: ${escapeHtml(st.label)}">${escapeHtml(st.label)}</span>`;
}

function balanceChipHtml({ className = "" } = {}) {
  const bal = Number(state.companyBalance) || 0;
  const tariff = Number(state.companyTariff) || 0;
  const approx = tariff > 0 ? Math.floor(bal / tariff) : null;
  const hint = approx != null ? `≈ ${approx} мин` : "тариф не задан";
  return `<a class="balance-chip${className ? ` ${className}` : ""}" href="#/cabinet/tariffs" title="Баланс и тариф">
    <span class="balance-chip-value">${escapeHtml(String(bal))} ₽</span>
    <span class="balance-chip-sep" aria-hidden="true">·</span>
    <span class="balance-chip-tariff">${tariff > 0 ? `${escapeHtml(String(tariff))} ₽/мин` : "—"}</span>
    <span class="balance-chip-hint">${escapeHtml(hint)}</span>
  </a>`;
}

function goalIsFilled(camp) {
  const goal = (camp?.goal || "").trim();
  const details = (camp?.details || "").trim();
  return Boolean(goal && details.length >= 8 && !isWeakScenario(camp));
}

function launchChecklist(camp) {
  const telOk = state.telephony.status === "ok" && !state.telephony.checking;
  const schOk = scheduleIsSet(camp);
  const contactsOk = Boolean(camp?.contacts?.length);
  const balanceOk = state.companyBalance > 0 || state.impersonate;
  return [
    {
      id: "goal",
      label: "Цель заполнена",
      ok: goalIsFilled(camp),
      action: goalIsFilled(camp) ? "" : "Дописать цель",
      jump: "sec-context",
    },
    {
      id: "contacts",
      label: "Контакты загружены",
      ok: contactsOk,
      action: contactsOk ? "" : "Загрузить",
      jump: "sec-contacts",
    },
    {
      id: "telephony",
      label: "Телефония подключена",
      ok: telOk && schOk,
      action: telOk ? (schOk ? "" : "Задать расписание") : "Настроить",
      jump: telOk ? "sec-schedule" : "integrations",
    },
    {
      id: "balance",
      label: "На балансе достаточно средств",
      ok: balanceOk,
      action: balanceOk ? "" : "Пополнить",
      jump: "tariffs",
    },
  ];
}

function readinessProgress(camp) {
  const items = launchChecklist(camp);
  const completed = items.filter((i) => i.ok).length;
  return { completed, total: items.length, items };
}

function campaignNextStep(camp) {
  const st = operationalStatus(camp);
  if (st.code === "running") return { label: "Следите за ходом обзвона", tab: "calls" };
  if (st.code === "paused") return { label: "Продолжить или остановить", tab: "overview" };
  if (st.code === "stopped") return { label: "Посмотреть результаты", tab: "results" };
  const item = launchChecklist(camp).find((i) => !i.ok);
  if (!item) return { label: "Готова к запуску", tab: "overview" };
  const map = {
    goal: "Заполнить цель",
    contacts: "Добавить контакты",
    telephony: state.telephony.status === "ok" ? "Настроить расписание" : "Настроить телефонию",
    balance: "Пополнить баланс",
  };
  return { label: map[item.id] || item.action || "Продолжить настройку", tab: item.jump === "integrations" ? "settings" : item.jump === "sec-contacts" ? "contacts" : "overview" };
}

function campaignsListStats() {
  let active = 0;
  let drafts = 0;
  let needsAction = 0;
  for (const c of state.campaigns) {
    if (c.dial_state === "running" || c.dial_state === "paused") active += 1;
    else if (c.dial_state === "draft") drafts += 1;
    if (operationalStatus(c).code === "needs_action") needsAction += 1;
  }
  return { active, drafts, needsAction, total: state.campaigns.length };
}

function hasCampaignCalls(camp) {
  if (!camp) return false;
  if (camp.ever_started || camp.dial_state === "running" || camp.dial_state === "paused" || camp.dial_state === "stopped") return true;
  const a = camp.analytics;
  return Boolean(a && (a.calls || a.calls_total));
}

function contactPipelineStats(camp) {
  const contacts = camp?.contacts || [];
  const counts = contactCountsByStatus(contacts);
  const inQueue = counts.in_progress;
  const done = counts.done;
  const noAnswer = counts.no_answer;
  const cancel = counts.cancel;
  const total = contacts.length;
  const called = done + noAnswer + cancel;
  return { total, inQueue, called, done, noAnswer, cancel, retry: noAnswer };
}

function telephonyOnboardingBlock() {
  const t = state.telephony;
  if (t.checking || t.status === "ok") return "";
  return `<div class="onboard-block" role="region" aria-label="Подключение телефонии">
    <div class="onboard-block-copy">
      <p class="onboard-block-kicker">Первый шаг</p>
      <h3 class="onboard-block-title">Подключите телефонию — без неё обзвон не запустится</h3>
      <p class="onboard-block-lead">SIP или Манго Телеком. Займёт пару минут, зато кампании смогут звонить клиентам.</p>
    </div>
    <a class="btn onboard-block-cta" href="#/cabinet/integrations">Подключить телефонию</a>
  </div>`;
}

function launchChecklistHtml(camp) {
  const { completed, total, items } = readinessProgress(camp);
  const rows = items
    .map((item) => {
      const jumpAttr =
        item.jump === "integrations"
          ? `href="#/cabinet/integrations"`
          : item.jump === "tariffs"
            ? `href="#/cabinet/tariffs"`
            : item.jump === "sec-schedule"
              ? `type="button" data-open-schedule="1"`
              : item.jump
                ? `type="button" data-jump="${escapeHtml(item.jump)}"`
                : "";
      const tag = item.jump && !item.ok ? (item.jump === "integrations" || item.jump === "tariffs" ? "a" : "button") : "div";
      const action =
        !item.ok && item.action
          ? tag === "div"
            ? `<span class="checklist-action">${escapeHtml(item.action)}</span>`
            : `<span class="checklist-action">${escapeHtml(item.action)} →</span>`
          : "";
      const attrs =
        tag === "a"
          ? `class="checklist-row checklist-row--${item.ok ? "ok" : "warn"}" ${jumpAttr}`
          : tag === "button"
            ? `class="checklist-row checklist-row--${item.ok ? "ok" : "warn"}" ${jumpAttr}`
            : `class="checklist-row checklist-row--${item.ok ? "ok" : "warn"}"`;
      return `<${tag} ${attrs}>
        <span class="checklist-icon" aria-hidden="true">${item.ok ? "✓" : "!"}</span>
        <span class="checklist-label">${escapeHtml(item.label)}</span>
        ${action}
      </${tag}>`;
    })
    .join("");
  return `<div class="launch-checklist" id="sec-launch-checklist">
    <div class="launch-checklist-head">
      <h3 class="launch-checklist-title">Что нужно для запуска</h3>
      <span class="launch-checklist-progress">${completed} из ${total}</span>
    </div>
    <div class="checklist-rows">${rows}</div>
  </div>`;
}

function statusLabel(code) {
  return STATUS_LABEL[code] || code || "—";
}

function contactCountLabel(n) {
  const abs = Math.abs(Number(n)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "контактов";
  if (last === 1) return "контакт";
  if (last >= 2 && last <= 4) return "контакта";
  return "контактов";
}

/** Contact pipeline status → badge tone (DESIGN-062). */
function contactStatusTone(code) {
  if (code === STATUS.done) return "ok";
  if (code === STATUS.in_progress) return "warn";
  if (code === STATUS.no_answer || code === STATUS.cancel) return "muted";
  return "muted";
}

function contactStatusBadgeHtml(code) {
  const label = statusLabel(code);
  const tone = contactStatusTone(code);
  return `<span class="status-badge status-badge--${tone} status-badge--compact" data-testid="contact-status-badge" aria-label="Статус контакта: ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
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

function telephonyBanner() {
  return telephonyOnboardingBlock();
}

function lockedBanner() {
  if (!state.companyLocked || state.impersonate) return "";
  return `<div class="banner banner-danger">
    <strong>Аккаунт заблокирован. Можно смотреть, менять и запускать нельзя</strong>
    <p class="hint">Чтобы снять блокировку, напишите в поддержку Scorix</p>
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
  return `<nav class="app-tabs app-tabs-desk" aria-label="Разделы кабинета">
    ${tabs
      .map(
        (t) =>
          `<a href="${t.href}" class="${t.id === activeTab ? "active" : ""}">${escapeHtml(t.label)}</a>`
      )
      .join("")}
  </nav>`;
}

function mobileNavHtml(activeTab, tabs = CABINET_TABS) {
  const opts = tabs
    .map(
      (t) =>
        `<option value="${escapeHtml(t.href)}"${t.id === activeTab ? " selected" : ""}>${escapeHtml(t.label)}</option>`
    )
    .join("");
  return `<label class="mobile-nav-label sr-only" for="mobile-nav-select">Раздел</label>
    <select class="mobile-nav-select" id="mobile-nav-select" aria-label="Раздел кабинета">${opts}</select>`;
}

function cabinetShell(activeTab, bodyHtml) {
  return `<div class="page-shell page-shell-desk">
    <header class="page-topbar page-topbar-desk">
      <p class="brand"><span class="brand-mark" aria-hidden="true"></span>Scorix</p>
      ${appTabsHtml(activeTab)}
      ${mobileNavHtml(activeTab)}
      <div class="page-topbar-actions">
        ${balanceChipHtml({ className: "balance-chip--header" })}
        ${themeControls()}
        <button class="btn ghost page-logout" id="logout" type="button">Выйти</button>
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
  let body;
  if (activeTab === "settings") {
    body = `<section class="flow-section" id="sec-admin-settings">
        <h2>Настройки продукта</h2>
        ${adminSettings()}
      </section>`;
  } else if (activeTab === "integrations") {
    body = `<section class="flow-section" id="sec-admin-integrations">
        <h2>Интеграции</h2>
        <p class="hint">Платформенные LLM / речь. Не путать с SIP компании.</p>
        ${adminIntegrationsPanel()}
      </section>`;
  } else {
    body = `${adminNewCompany()}${adminCompanyList()}`;
  }
  return `<div class="page-shell">
    <header class="page-topbar">
      <p class="brand">Scorix · Админка</p>
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
  const totp = state.adminTotp;
  let totpPanel = `<div class="panel" style="margin-top:1rem"><h3>Двухфакторная аутентификация</h3><p class="hint">Загружаем…</p></div>`;
  if (totp.recoveryCodes?.length) {
    const codes = totp.recoveryCodes.map((c) => `<li><code>${escapeHtml(c)}</code></li>`).join("");
    totpPanel = `<div class="panel" style="margin-top:1rem">
      <h3>Резервные коды</h3>
      <p class="hint">Сохраните коды в надёжном месте. Каждый код работает один раз, если нет доступа к телефону.</p>
      <ul class="admin-company-history">${codes}</ul>
      <button class="btn secondary" type="button" id="totp-recovery-done">Готово</button>
    </div>`;
  } else if (totp.enabled === true) {
    totpPanel = `<div class="panel" style="margin-top:1rem">
      <h3>Двухфакторная аутентификация</h3>
      <p class="hint ok-line">Подключена. При входе нужен код из Google Authenticator или Microsoft Authenticator.</p>
    </div>`;
  } else if (totp.enabled === false && totp.setup) {
    const uri = totp.setup.otpauth_uri || "";
    const qr = uri
      ? `<img class="totp-qr" alt="QR для приложения аутентификации" width="180" height="180" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&amp;data=${encodeURIComponent(uri)}" />`
      : "";
    totpPanel = `<div class="panel" style="margin-top:1rem">
      <h3>Подключение 2FA</h3>
      <p class="hint">Отсканируйте QR-код или введите секрет вручную в Google Authenticator / Microsoft Authenticator.</p>
      ${qr}
      <p class="hint">Секрет: <code id="totp-secret">${escapeHtml(totp.setup.secret || "")}</code></p>
      <form id="totp-confirm-form">
        <label for="totp-setup-code">Код из приложения</label>
        <input id="totp-setup-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" />
        <div class="error" id="totp-setup-error" hidden></div>
        <button class="btn" type="submit"${totp.busy ? " disabled" : ""}>Подтвердить</button>
        <button class="btn secondary" type="button" id="totp-setup-cancel"${totp.busy ? " disabled" : ""}>Отмена</button>
      </form>
    </div>`;
  } else if (totp.enabled === false) {
    totpPanel = `<div class="panel" style="margin-top:1rem">
      <h3>Двухфакторная аутентификация</h3>
      <p class="hint">Дополнительный код из приложения на телефоне при каждом входе в админку.</p>
      <div class="error" id="totp-setup-error" hidden></div>
      <button class="btn" type="button" id="totp-setup-begin"${totp.busy ? " disabled" : ""}>Подключить 2FA</button>
    </div>`;
  }
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
    ${totpPanel}
  </div>`;
}

const INTEGRATION_ERROR_MESSAGES = {
  auth_failed: "Sber не принял ключ. Нужен авторизационный ключ из кабинета, не Client Secret отдельно",
  check_failed: "Проверка не прошла",
  provider_unavailable: "Сервис недоступен, попробуйте позже",
  secret_not_configured: "Ключ ещё не записан. Вставьте авторизационный ключ и нажмите «Записать ключ»",
};

function integrationErrorMessage(code) {
  if (INTEGRATION_ERROR_MESSAGES[code]) return INTEGRATION_ERROR_MESSAGES[code];
  return errorMessage(code);
}

const ADMIN_INTEGRATION_KINDS = [
  {
    kind: "llm_campaign",
    title: "LLM для кампаний",
    hint: "Превью и этапы при сохранении кампании",
    modelLabel: "Модель",
  },
  {
    kind: "llm_voice",
    title: "LLM для голоса",
    hint: "Ответы робота на линии",
    modelLabel: "Модель",
  },
  {
    kind: "asr",
    title: "Распознавание речи (ASR)",
    hint: "Что говорит абонент",
    modelLabel: null,
  },
  {
    kind: "tts",
    title: "Озвучка (TTS)",
    hint: "Голос робота",
    modelLabel: "Голос",
  },
];

function _defaultIntegrationForm(kind, catalog) {
  const providers = (catalog && catalog[kind]) || [];
  const firstAvailable = providers.find((p) => p.available !== false) || providers[0] || {};
  const models = firstAvailable.models || firstAvailable.voices || [];
  return {
    provider_kind: firstAvailable.provider_kind || "",
    model: models[0] || "",
    folder_id: "",
  };
}

function _integrationSliceHtml(title, slice) {
  if (!slice) {
    return `<p class="hint">Ещё не подключено</p>`;
  }
  const lab =
    slice.provider_kind === "openrouter" || slice.brand === "openrouter"
      ? `<span class="hint" style="margin-left:0.5rem">Лаборатория</span>`
      : "";
  const check = slice.last_check || {};
  const providerLabel = slice.brand_label || slice.provider_kind || "—";
  const checkStatus = check.status || "—";
  const checkError =
    checkStatus === "failed" && check.error_code
      ? ` · ${integrationErrorMessage(check.error_code)}`
      : "";
  return `<div class="integration-slice-summary">
    <p><strong>${escapeHtml(title)}</strong>${lab}</p>
    <p class="hint">${escapeHtml(providerLabel)}${slice.model ? ` · ${escapeHtml(slice.model)}` : ""}</p>
    <p class="hint">Ключ: ${slice.has_secret ? "задан" : "нет"} · проверка: ${escapeHtml(checkStatus)}${escapeHtml(checkError)}</p>
  </div>`;
}

function _isSberAuthProvider(selected) {
  return Boolean(selected && selected.secret_hint === "sber_auth_key");
}

function _looksLikeSberAuthKey(value) {
  const s = String(value || "").replace(/\s/g, "");
  if (s.length < 32) return false;
  try {
    const decoded = atob(s);
    return decoded.includes(":") && decoded.length >= 8;
  } catch {
    return false;
  }
}

function _encodeSberAuthorizationKey(clientId, clientSecret) {
  const id = String(clientId || "").trim();
  const secret = String(clientSecret || "").trim();
  if (!id || !secret) return null;
  return btoa(`${id}:${secret}`);
}

function _sberSecretFilled(kind) {
  const authKey = document.getElementById(`admin-int-${kind}-sber-auth-key`)?.value.trim();
  const clientId = document.getElementById(`admin-int-${kind}-sber-client-id`)?.value.trim();
  const clientSecret = document.getElementById(`admin-int-${kind}-sber-client-secret`)?.value.trim();
  return Boolean(authKey || (clientId && clientSecret) || _looksLikeSberAuthKey(clientSecret));
}

function _readIntegrationSecret(kind, selected) {
  if (_isSberAuthProvider(selected)) {
    const authKey = (document.getElementById(`admin-int-${kind}-sber-auth-key`)?.value || "").replace(/\s/g, "");
    const clientId = document.getElementById(`admin-int-${kind}-sber-client-id`)?.value;
    const clientSecret = (document.getElementById(`admin-int-${kind}-sber-client-secret`)?.value || "").replace(/\s/g, "");
    if (authKey) {
      return { secret: authKey };
    }
    if (_looksLikeSberAuthKey(clientSecret)) {
      return { secret: clientSecret };
    }
    const encoded = _encodeSberAuthorizationKey(clientId, clientSecret);
    if (!encoded) {
      return { error: "Вставьте авторизационный ключ из кабинета Sber — или Client ID и Client Secret" };
    }
    return { secret: encoded };
  }
  const secret = document.getElementById(`admin-int-${kind}-secret`)?.value || "";
  if (!secret.trim()) {
    return { error: "Введите API-ключ" };
  }
  return { secret: secret.trim() };
}

function _clearIntegrationSecretFields(kind, selected) {
  if (_isSberAuthProvider(selected)) {
    const authKey = document.getElementById(`admin-int-${kind}-sber-auth-key`);
    const clientId = document.getElementById(`admin-int-${kind}-sber-client-id`);
    const clientSecret = document.getElementById(`admin-int-${kind}-sber-client-secret`);
    if (authKey) authKey.value = "";
    if (clientId) clientId.value = "";
    if (clientSecret) clientSecret.value = "";
    return;
  }
  const input = document.getElementById(`admin-int-${kind}-secret`);
  if (input) input.value = "";
}

function _integrationSecretFieldsHtml(kind, selected, disabled) {
  if (_isSberAuthProvider(selected)) {
    return `<label for="admin-int-${kind}-sber-auth-key">Авторизационный ключ</label>
      <input id="admin-int-${kind}-sber-auth-key" type="password" autocomplete="new-password" spellcheck="false"${disabled} />
      <p class="hint">Скопируйте его целиком из кабинета Sber. Это уже готовая длинная строка — не Client Secret отдельно.</p>
      <label for="admin-int-${kind}-sber-client-id">Client ID <span class="hint">(если ключа нет под рукой)</span></label>
      <input id="admin-int-${kind}-sber-client-id" type="text" autocomplete="off" spellcheck="false"${disabled} />
      <label for="admin-int-${kind}-sber-client-secret">Client Secret</label>
      <input id="admin-int-${kind}-sber-client-secret" type="password" autocomplete="new-password"${disabled} />
      <p class="hint">После записи значения не показываются.</p>`;
  }
  return `<label for="admin-int-${kind}-secret">API-ключ</label>
    <input id="admin-int-${kind}-secret" type="password" autocomplete="new-password" value=""${disabled} />
    <p class="hint">Ключ сохраняется только при записи. Просмотреть нельзя.</p>`;
}

function _integrationCardHtml(meta, ai) {
  const kind = meta.kind;
  const item = (ai.items || []).find((i) => i.kind === kind) || { active: null, candidate: null };
  const providers = (ai.catalog && ai.catalog[kind]) || [];
  const form = (ai.forms && ai.forms[kind]) || _defaultIntegrationForm(kind, ai.catalog);
  const selected = providers.find((p) => p.provider_kind === form.provider_kind) || providers[0];
  const options = selected && selected.models && selected.models.length ? selected.models : (selected && selected.voices) || [];
  const disabled = ai.busy && ai.busy[kind] ? " disabled" : "";
  const fb = (ai.feedback && ai.feedback[kind]) || {};
  const providerOpts = providers
    .map((p) => {
      const label = p.brand_label || p.provider_kind;
      const suffix = p.lab ? " (лаборатория)" : "";
      const off = p.available === false ? " disabled" : "";
      const title = p.available === false && p.unavailable_reason ? ` title="${escapeHtml(p.unavailable_reason)}"` : "";
      const sel = p.provider_kind === form.provider_kind ? " selected" : "";
      return `<option value="${escapeHtml(p.provider_kind)}"${sel}${off}${title}>${escapeHtml(label + suffix)}</option>`;
    })
    .join("");
  const optionLabel = meta.modelLabel;
  const optionOpts =
    optionLabel && options.length
      ? options
          .map((m) => {
            const sel = m === form.model ? " selected" : "";
            return `<option value="${escapeHtml(m)}"${sel}>${escapeHtml(m)}</option>`;
          })
          .join("")
      : "";
  const folderField =
    selected && selected.requires_folder_id
      ? `<label for="admin-int-${kind}-folder">ID каталога Yandex Cloud</label>
      <input id="admin-int-${kind}-folder" type="text" autocomplete="off" value="${escapeHtml(form.folder_id || "")}"${disabled} />`
      : "";
  const modelField =
    optionLabel && options.length
      ? `<label for="admin-int-${kind}-model">${escapeHtml(optionLabel)}</label>
      <select id="admin-int-${kind}-model"${disabled}>${optionOpts}</select>`
      : "";
  const metaFormId = `admin-int-${kind}-meta-form`;
  const secretFormId = `admin-int-${kind}-secret-form`;
  return `<article class="panel integration-card" data-integration-kind="${escapeHtml(kind)}">
    <div class="integration-card-body">
      <h3>${escapeHtml(meta.title)}</h3>
      <p class="hint">${escapeHtml(meta.hint)}</p>
      ${_integrationSliceHtml("Активная", item.active)}
      ${item.candidate ? _integrationSliceHtml("Черновик", item.candidate) : ""}
      <form class="integration-meta-form" id="${metaFormId}">
        <label for="admin-int-${kind}-provider">Провайдер</label>
        <select id="admin-int-${kind}-provider"${disabled}>${providerOpts || '<option value="">Нет вариантов</option>'}</select>
        ${modelField}
        ${folderField}
      </form>
      <form class="integration-secret-form" id="${secretFormId}">
        ${_integrationSecretFieldsHtml(kind, selected, disabled)}
      </form>
      <div class="error admin-int-error" id="admin-int-${kind}-error" ${fb.error ? "" : "hidden"}>${escapeHtml(fb.error || "")}</div>
      <p class="hint ok-line admin-int-ok" id="admin-int-${kind}-ok" ${fb.ok ? "" : "hidden"}>${escapeHtml(fb.ok || "")}</p>
    </div>
    <div class="integration-card-actions row-actions">
      <button class="btn secondary" type="submit" form="${metaFormId}"${disabled}>Сохранить настройки</button>
      <button class="btn secondary" type="submit" form="${secretFormId}"${disabled}>Записать ключ</button>
      <button class="btn" type="button" id="admin-int-${kind}-test"${disabled}>Проверить и включить</button>
    </div>
  </article>`;
}

function adminIntegrationsPanel() {
  const ai = state.adminIntegrations;
  const cards = ADMIN_INTEGRATION_KINDS.map((meta) => _integrationCardHtml(meta, ai)).join("");
  return `<div class="integrations-grid">${cards}</div>`;
}

async function refreshAdminIntegrations() {
  if (!hasApi() || state.role !== "superadmin" || state.impersonate) return;
  const data = await apiFetch("/api/admin/integrations", { session: state.session });
  state.adminIntegrations.items = data.items || [];
  state.adminIntegrations.catalog = data.catalog || {};
  state.adminIntegrations.secret_management = data.secret_management || null;
  state.adminIntegrations.loaded = true;
  if (!state.adminIntegrations.forms) state.adminIntegrations.forms = {};
  for (const meta of ADMIN_INTEGRATION_KINDS) {
    const kind = meta.kind;
    const prev = state.adminIntegrations.forms[kind] || {};
    const defaults = _defaultIntegrationForm(kind, state.adminIntegrations.catalog);
    const providers = state.adminIntegrations.catalog[kind] || [];
    const match =
      providers.find((p) => p.provider_kind === prev.provider_kind && p.available !== false) ||
      providers.find((p) => p.available !== false) ||
      providers[0];
    const models = (match && match.models) || (match && match.voices) || [];
    state.adminIntegrations.forms[kind] = {
      provider_kind: match ? match.provider_kind : defaults.provider_kind,
      model: models.includes(prev.model) ? prev.model : models[0] || "",
      folder_id: prev.folder_id || "",
    };
  }
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

async function refreshAdminTotpStatus() {
  if (!hasApi() || state.role !== "superadmin" || state.impersonate) return;
  const data = await apiFetch("/api/admin/totp/status", { session: state.session });
  state.adminTotp.enabled = Boolean(data.enabled);
  if (data.enabled) {
    state.adminTotp.setup = null;
    state.adminTotp.recoveryCodes = null;
  }
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
    archetype: "",
    archetype_locked: false,
    knowledge_pack: {},
    generate_warnings: [],
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
    archetype: c.archetype != null ? c.archetype : existing.archetype || "",
    archetype_locked: c.archetype_locked != null ? Boolean(c.archetype_locked) : Boolean(existing.archetype_locked),
    knowledge_pack:
      c.knowledge_pack && typeof c.knowledge_pack === "object"
        ? c.knowledge_pack
        : existing.knowledge_pack || {},
    generate_warnings: Array.isArray(c.generate_warnings)
      ? c.generate_warnings
      : existing.generate_warnings || [],
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
  return code === "generate_failed" || code === "provider_down" || code === "weak_goal" || code === "pack_gaps_critical";
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
    state.ui.workspaceTab = "overview";
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
      "От цели до обзвона — в одном месте",
      `<div class="desk-empty-stack">
        ${telephonyOnboardingBlock()}
        <div class="empty-state empty-state-hero desk-empty-hero">
          <div class="empty-state-mark" aria-hidden="true"></div>
          <h3 class="empty-state-title">Пока нет кампаний</h3>
          <p class="empty-state-lead">Создайте первую кампанию: задайте цель, загрузите контакты и запустите обзвон. Всё займёт меньше часа.</p>
          ${createBtn}
        </div>
      </div>`,
      { id: "sec-campaign", className: "desk-page-empty campaigns-list-page", testId: "campaigns-page" }
    );
  }

  const stats = campaignsListStats();
  const statRow = `<div class="desk-stat-row desk-stat-row-3 campaigns-status-row">
    ${deskStatCard("Активных", String(stats.active), "Идут или на паузе", { tone: stats.active ? "ok" : "" })}
    ${deskStatCard("Черновиков", String(stats.drafts), "Ещё не запускали")}
    ${deskStatCard("Нужны действия", String(stats.needsAction), "Без этого не запустить", { tone: stats.needsAction ? "warn" : "" })}
  </div>`;

  const rows = state.campaigns
    .map((c) => {
      const next = campaignNextStep(c);
      const prog = contactPipelineStats(c);
      const progressHint =
        c.dial_state === "running" || c.dial_state === "paused"
          ? `В очереди ${prog.inQueue} · дозвон ${prog.done}`
          : `${(c.contacts || []).length} ${contactCountLabel((c.contacts || []).length)}`;
      return `<tr class="camp-row" data-href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">
        <td><a class="camp-name" href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">${escapeHtml(c.name || "Без названия")}</a></td>
        <td>${statusBadgeHtml(c, { compact: true })}</td>
        <td><span class="next-step-label">${escapeHtml(next.label)}</span></td>
        <td class="camp-count">${escapeHtml(progressHint)}</td>
        <td class="camp-goal">${escapeHtml(c.goal || "—")}</td>
      </tr>`;
    })
    .join("");

  const cards = state.campaigns
    .map((c) => {
      const next = campaignNextStep(c);
      return `<a class="camp-card" href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">
        <div class="camp-card-head">
          <strong class="camp-card-title">${escapeHtml(c.name || "Без названия")}</strong>
          ${statusBadgeHtml(c, { compact: true })}
        </div>
        <p class="hint camp-card-next">${escapeHtml(next.label)}</p>
        <p class="hint camp-card-meta">${(c.contacts || []).length} ${contactCountLabel((c.contacts || []).length)}</p>
      </a>`;
    })
    .join("");

  return `${deskPageHeadRow("Кампании", "От цели до обзвона — в одном месте", createBtn, { id: "sec-campaign", testId: "campaigns-page" })}
    <div class="desk-page-body">
      ${statRow}
      ${telephonyOnboardingBlock()}
      ${deskSurface(
        `<table class="data data-camps camp-table-desk">
        <thead><tr><th>Название</th><th>Статус</th><th>Следующий шаг</th><th>Прогресс</th><th>Цель</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
        { className: "desk-table-surface camp-table-wrap" }
      )}
      <div class="camp-cards-mobile">${cards}</div>
    </div>
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
      ? `<div class="banner banner-danger desk-banner"><strong>Аккаунт заблокирован</strong>
         <p class="hint">Можно смотреть, менять и запускать нельзя. Напишите в поддержку Scorix.</p></div>`
      : "";
  const body = `${lockedNote}
    <div class="desk-link-cards account-links">
      <a class="desk-link-card" href="#/cabinet/tariffs">
        <span class="desk-link-kicker">Биллинг</span>
        <strong class="desk-link-title">Баланс и тариф</strong>
        <span class="hint">${escapeHtml(String(state.companyBalance))} ₽ · ${escapeHtml(String(state.companyTariff))} ₽/мин</span>
      </a>
      <a class="desk-link-card" href="#/cabinet/integrations">
        <span class="desk-link-kicker">Интеграции</span>
        <strong class="desk-link-title">Телефония</strong>
        <span class="hint">${escapeHtml(telephonyStatusLine())}</span>
      </a>
    </div>
    <div class="desk-section-block account-meta">
      <p class="hint"><strong>Кто вошёл:</strong> ${who}</p>
      <p class="hint"><strong>Доступ:</strong> ${state.companyLocked && !state.impersonate ? "Ограничен (только просмотр)" : "Активен"}</p>
    </div>`;
  return deskPage("Настройки", "Биллинг, телефония и доступ", body, { id: "sec-account" });
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
    const current = tariff > 0 && Number(tariff) === p.price;
    return `<tr class="${current ? "tariff-row-current" : ""}">
      <td>${escapeHtml(String(p.minutes.toLocaleString("ru-RU")))} мин${current ? ' <span class="status-badge status-badge--ok status-badge--compact">Текущий</span>' : ""}</td>
      <td>${escapeHtml(String(p.price))} ₽/мин</td>
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
      <p class="hint desk-block-lead">Чем больше пакет — тем ниже цена минуты. Минимальный пакет — 1 000 минут.</p>
      ${deskSurface(
        `<table class="data tariff-table">
          <thead><tr><th>Пакет</th><th>Цена за минуту</th><th>Сумма</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`,
        { className: "desk-table-surface" }
      )}
      <p class="hint">Считаем минуты состоявшегося разговора. Недозвон не тарифицируем.</p>
    </div>
    <div class="billing-cta panel">
      <h3 class="desk-block-title">Пополнение баланса</h3>
      <p class="hint">В кабинете оплаты пока нет — пополнение через поддержку Scorix.</p>
      <a class="btn" href="mailto:support@scorix.ru?subject=Пополнение%20баланса">Связаться для пополнения</a>
    </div>`;
  return deskPage("Биллинг", "Баланс, тариф и пакеты минут", body, {
    id: "sec-tariffs",
    className: "tariffs-page",
    testId: "tariffs-page",
  });
}

async function refreshCabinetMe() {
  if (!hasApi() || !state.session) return;
  const me = await apiFetch("/api/cabinet/me", { session: state.session });
  if (me.balance_rub != null) {
    state.companyBalance = Number(me.balance_rub);
    localStorage.setItem("scx_co_balance", String(state.companyBalance));
  }
  if (me.price_per_minute != null) {
    state.companyTariff = Number(me.price_per_minute);
    localStorage.setItem("scx_co_tariff", String(state.companyTariff));
  }
  if (me.locked != null) state.companyLocked = Boolean(me.locked);
}

function pageAnalytics() {
  const camp = activeCampaign();
  const hasAnyCalls = state.campaigns.some(hasCampaignCalls);

  const listMetrics = state.campaigns.length
    ? deskSurface(
        `<table class="data analytics-all-table">
          <thead><tr><th>Кампания</th><th>Статус</th><th>Прогресс</th><th>Конверсия</th><th>Стоимость</th><th>Активность</th></tr></thead>
          <tbody>${state.campaigns
            .map((c) => {
              const a = c.analytics;
              const calls = a?.calls ?? a?.calls_total ?? 0;
              const reached = a?.goalReached ?? a?.goal_reached ?? 0;
              const conv = calls > 0 ? `${Math.round((reached / calls) * 100)}%` : "—";
              const cost = a?.cost ?? a?.cost_rub ?? (a?.minutes || 0) * state.companyTariff;
              const prog = contactPipelineStats(c);
              const progress =
                c.dial_state === "running" || c.dial_state === "paused"
                  ? `${prog.called}/${prog.total}`
                  : `${(c.contacts || []).length} конт.`;
              const activity =
                c.dial_state === "running"
                  ? "Сейчас"
                  : c.dial_state === "paused"
                    ? "На паузе"
                    : c.ever_started
                      ? "Была"
                      : "—";
              return `<tr>
              <td><a href="#/cabinet/campaigns/${encodeURIComponent(c.id)}">${escapeHtml(c.name || "Без названия")}</a></td>
              <td>${statusBadgeHtml(c, { compact: true })}</td>
              <td>${escapeHtml(progress)}</td>
              <td>${escapeHtml(conv)}</td>
              <td>${hasCampaignCalls(c) ? `${escapeHtml(String(cost))} ₽` : "—"}</td>
              <td>${escapeHtml(activity)}</td>
            </tr>`;
            })
            .join("")}</tbody>
        </table>`,
        { className: "desk-table-surface" }
      )
    : `<p class="hint">Пока нет кампаний</p>`;

  const campBlock = camp
    ? blockCampaignAnalytics(camp)
    : `<div class="analytics-empty"><p class="analytics-empty-title">Выберите кампанию</p><p class="hint">Откройте кампанию в разделе «Кампании»</p></div>`;

  const body = `<div class="desk-section-block">
      <h3 class="desk-block-title">${camp ? escapeHtml(camp.name || "Без названия") : "Выбранная кампания"}</h3>
      <p class="hint desk-block-lead">${hasAnyCalls ? "Ключевые метрики активной кампании" : "Метрики появятся после первого звонка"}</p>
      <div class="metrics-band analytics-page-metrics">${campBlock}</div>
    </div>
    <div class="desk-section-block">
      <h3 class="desk-block-title">Все кампании</h3>
      ${listMetrics}
    </div>`;

  return deskPage("Аналитика", "Конверсия, стоимость и выгрузка по кампаниям", body, { id: "sec-analytics" });
}

function analyticsMetric(label, value, hint = "") {
  return `<div class="metric-card">
    <span class="metric-label">${escapeHtml(label)}</span>
    <strong class="metric-value">${escapeHtml(String(value))}</strong>
    ${hint ? `<span class="hint metric-hint">${escapeHtml(hint)}</span>` : ""}
  </div>`;
}

function blockCampaignAnalytics(camp) {
  const hasCalls = hasCampaignCalls(camp);
  const a = camp.analytics;
  if (!hasCalls || (!a && !hasCalls)) {
    return `<div class="analytics-empty">
      <p class="analytics-empty-title">После первого звонка здесь появятся метрики</p>
      <p class="hint analytics-empty-lead">Конверсия, длительность разговоров и стоимость — всё в одной строке, без нулей до старта.</p>
    </div>
    <div class="row-actions analytics-export-row">
      <button class="btn secondary" type="button" id="export-excel" disabled title="Доступно после первого звонка">Скачать Excel</button>
    </div>`;
  }
  const calls = a?.calls ?? a?.calls_total ?? 0;
  const reached = a?.goalReached ?? a?.goal_reached ?? 0;
  const minutes = a?.minutes ?? a?.minutes_total ?? 0;
  const cost = a?.cost ?? a?.cost_rub ?? minutes * state.companyTariff;
  const conv = calls > 0 ? `${Math.round((reached / calls) * 100)}%` : "—";
  return `<div class="metrics-grid metrics-grid-4">
      ${analyticsMetric("Звонков", calls)}
      ${analyticsMetric("Дозвоны / целевые", `${reached}`, "Итоги по цели")}
      ${analyticsMetric("Конверсия", conv)}
      ${analyticsMetric("Стоимость", `${cost} ₽`, `Тариф ${state.companyTariff} ₽/мин`)}
    </div>
    <div class="row-actions analytics-export-row">
      <button class="btn secondary" type="button" id="export-excel">Скачать Excel</button>
      <p class="hint" id="export-status" hidden></p>
      <div class="error" id="export-error" hidden></div>
    </div>`;
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
  const hint = reason.hint ? `<span class="hint ready-reason-hint">${escapeHtml(reason.hint)}</span>` : "";
  let core;
  if (jump === "integrations") {
    core = `<a class="ready-reason" href="#/cabinet/integrations">${text}</a>`;
  } else if (jump === "account") {
    core = `<a class="ready-reason" href="#/cabinet/tariffs">${text}</a>`;
  } else if (jump) {
    core = asButton
      ? `<button type="button" class="ready-reason" data-jump="${escapeHtml(jump)}">${text}</button>`
      : `<a class="ready-reason" href="#${escapeHtml(jump)}" data-jump="${escapeHtml(jump)}">${text}</a>`;
  } else {
    core = `<span class="ready-reason ready-reason-static">${text}</span>`;
  }
  return hint ? `<span class="ready-reason-wrap">${core}${hint}</span>` : core;
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
      <button class="btn secondary" type="button" id="dial-pause" ${roAttr()}>Приостановить</button>
      <button class="btn ghost danger-ghost" type="button" id="dial-stop" ${roAttr()}>Стоп</button>
      <p class="hint" id="dial-progress" hidden></p>
    </div>`;
  }
  if (camp.dial_state === "paused") {
    return `<div class="launch-cluster launch-cluster-compact">
      <button class="btn" type="button" id="dial-resume" ${roAttr()}>Продолжить обзвон</button>
      <button class="btn ghost danger-ghost" type="button" id="dial-stop" ${roAttr()}>Стоп</button>
      <p class="hint" id="dial-progress" hidden></p>
    </div>`;
  }
  const disabled = !canStart || locked();
  const primaryReason = reasons[0];
  const whyHtml = disabled && primaryReason
    ? `<p class="launch-blocker" id="launch-blocker"><span class="launch-blocker-label">Почему нельзя:</span> ${reasonLinkHtml(primaryReason)}</p>`
    : "";
  const nextCta =
    disabled && primaryReason
      ? `<div class="launch-next-action">${reasonCtaHtml(primaryReason)}</div>`
      : "";
  return `<div class="launch-cluster launch-cluster-main">
      <button class="btn launch-primary" type="button" id="dial-start" ${disabled ? "disabled aria-describedby=\"launch-blocker\"" : ""}>Начать обзвон</button>
      ${whyHtml}
      ${nextCta}
      <p class="hint" id="dial-progress" hidden>Запускаем…</p>
    </div>`;
}

function formZone(title, hint, bodyHtml, { id = "" } = {}) {
  return `<section class="form-zone"${id ? ` id="${escapeHtml(id)}"` : ""}>
    <h3 class="form-zone-title">${escapeHtml(title)}</h3>
    ${hint ? `<p class="hint form-zone-hint">${escapeHtml(hint)}</p>` : ""}
    ${bodyHtml}
  </section>`;
}

function scenarioStatusBanner(camp, { weak, started, pending, genErr, hasServerPreview }) {
  if (started) {
    return `<div class="banner banner-warn scenario-banner">После старта сценарий и расписание только смотрим. Чтобы изменить — создайте новую кампанию</div>`;
  }
  if (pending) {
    return `<div class="banner scenario-banner" id="generate-pending"><strong>Собираем сценарий…</strong></div>`;
  }
  if (genErr) {
    return `<div class="banner banner-danger scenario-banner" id="generate-error"><strong>${escapeHtml(genErr)}</strong></div>`;
  }
  if (weak) {
    return `<div class="banner banner-warn scenario-banner"><strong>Сценарий пока слишком слабый для обзвона.</strong> Допишите цель и сведения ниже</div>`;
  }
  if (!hasServerPreview) {
    return `<p class="hint scenario-banner-hint" id="preview-empty">Сохраните цель и сведения — появится, как робот понял сценарий</p>`;
  }
  return "";
}

function deskPage(title, lead, bodyHtml, { id = "", backHref = "", backLabel = "← Назад", className = "", testId = "" } = {}) {
  const testAttr = testId ? ` data-testid="${escapeHtml(testId)}"` : "";
  return `<section class="desk-page${className ? ` ${escapeHtml(className)}` : ""}"${id ? ` id="${escapeHtml(id)}"` : ""}${testAttr}>
    ${backHref ? `<a class="back-link quiet" href="${escapeHtml(backHref)}">${escapeHtml(backLabel)}</a>` : ""}
    <header class="desk-page-head">
      <h2 class="desk-page-title">${escapeHtml(title)}</h2>
      ${lead ? `<p class="hint desk-page-lead">${escapeHtml(lead)}</p>` : ""}
    </header>
    <div class="desk-page-body">${bodyHtml}</div>
  </section>`;
}

function deskPageHeadRow(title, lead, actionsHtml, { id = "", testId = "" } = {}) {
  const testAttr = testId ? ` data-testid="${escapeHtml(testId)}"` : "";
  return `<section class="desk-page campaigns-list-page"${id ? ` id="${escapeHtml(id)}"` : ""}${testAttr}>
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

function workspaceTabsHtml(activeTab) {
  return `<nav class="workspace-tabs" aria-label="Разделы кампании" data-testid="workspace-tabs">
    ${WORKSPACE_TABS.map(
      (t) =>
        `<button type="button" class="workspace-tab${t.id === activeTab ? " active" : ""}" data-workspace-tab="${t.id}" aria-selected="${t.id === activeTab ? "true" : "false"}">${escapeHtml(t.label)}</button>`
    ).join("")}
  </nav>`;
}

function blockCallRules(camp) {
  const sch = camp.schedule || {};
  const days = formatDaysSummary(sch.days);
  const from = sch.from || "10:00";
  const to = sch.to || "18:00";
  const tz = sch.tz || "Europe/Moscow";
  const retries = camp.retries ?? 2;
  const started = isStarted(camp);
  return `<section class="call-rules-block" id="sec-call-rules">
    <h3 class="call-rules-title">Правила звонков</h3>
    <dl class="call-rules-list">
      <div class="call-rules-item"><dt>Часовой пояс</dt><dd>${escapeHtml(tz)}</dd></div>
      <div class="call-rules-item"><dt>Окно обзвона</dt><dd>${escapeHtml(days)} · ${escapeHtml(from)}–${escapeHtml(to)}</dd></div>
      <div class="call-rules-item"><dt>Перезвоны</dt><dd>${escapeHtml(String(retries))} ${escapeHtml(retriesLabel(retries))} при недозвоне</dd></div>
      <div class="call-rules-item"><dt>Не звоним</dt><dd>Отменённые номера, уже достигнута цель, ручная пауза кампании</dd></div>
    </dl>
    ${
      started
        ? `<p class="hint">После старта правила только для просмотра</p>`
        : `<button class="btn secondary" type="button" id="schedule-open-inline">Изменить расписание</button>`
    }
  </section>`;
}

function blockCampaignPurge(camp) {
  const running = camp.dial_state === "running";
  const disabled = running || locked() || state.ui.purgeDataPending;
  const titleAttr = running ? ` title="Сначала остановите обзвон"` : "";
  return `<div class="campaign-danger-row" id="sec-campaign-purge">
    <p class="hint">Номера и записи разговоров можно удалить раньше обычного срока хранения.</p>
    <button class="btn ghost danger-ghost" type="button" id="purge-data-open" ${disabled ? "disabled" : ""}${titleAttr} ${roAttr()}>Удалить данные кампании</button>
    ${running ? `<p class="hint">Сначала остановите обзвон</p>` : ""}
  </div>`;
}

function purgeDataModalHtml(camp) {
  if (!state.ui.purgeDataOpen || !camp) return "";
  const pending = state.ui.purgeDataPending;
  return `<div class="modal-backdrop" id="purge-data-backdrop" role="presentation">
    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="purge-data-title">
      <h3 id="purge-data-title">Удалить данные кампании?</h3>
      <p>Удалим все контакты этой кампании, записи разговоров и вердикты. Цель и сценарий останутся. Восстановить данные нельзя.</p>
      <div class="error" id="purge-data-error" hidden></div>
      <div class="row-actions">
        <button class="btn secondary" type="button" id="purge-data-cancel" ${pending ? "disabled" : ""} autofocus>Отмена</button>
        <button class="btn danger" type="button" id="purge-data-confirm" data-id="${escapeHtml(camp.id)}" ${pending ? "disabled" : ""}>${pending ? "Удаляем…" : "Удалить данные"}</button>
      </div>
    </div>
  </div>`;
}

function blockTestingSection(camp) {
  const started = isStarted(camp);
  if (started) {
    return `<section class="testing-block testing-block--disabled">
      <h3 class="testing-title">Тестирование</h3>
      <p class="hint">Тестовый звонок доступен до запуска кампании. Создайте новую кампанию для проверки сценария.</p>
    </section>`;
  }
  const preview = previewForDisplay(camp);
  const hasPreview = Boolean(preview.greeting || preview.says);
  return `<section class="testing-block" id="sec-testing">
    <h3 class="testing-title">Тестирование</h3>
    <p class="hint testing-lead">Проверьте, как агент понял цель, до первого реального звонка.</p>
    ${
      hasPreview
        ? `<div class="testing-summary">
            <p class="testing-kicker">Как агент понял цель</p>
            <p>${escapeHtml(preview.says || camp.goal || "—")}</p>
          </div>
          ${isWeakScenario(camp) ? `<p class="hint testing-warn">⚠ Сценарий пока слабый — допишите цель и сведения</p>` : ""}
          <div class="row-actions">
            <button class="btn secondary" type="button" disabled title="Тестовый звонок скоро">Тестовый звонок</button>
            <button class="btn ghost" type="button" data-workspace-tab="scenario">Редактировать сценарий</button>
          </div>
          <p class="hint">Тестовый звонок и симуляция диалога появятся после подключения backend.</p>`
        : `<p class="hint">Сначала сохраните цель и сведения — затем можно будет протестировать сценарий.</p>`
    }
  </section>`;
}

function blockCallProgress(camp) {
  const active = camp.dial_state === "running" || camp.dial_state === "paused";
  if (!active && !hasCampaignCalls(camp)) {
    return `<section class="call-progress-empty">
      <p class="hint">Ход обзвона появится после запуска кампании</p>
    </section>`;
  }
  const prog = contactPipelineStats(camp);
  const a = camp.analytics || {};
  const calls = a.calls ?? a.calls_total ?? prog.called;
  const reached = a.goalReached ?? a.goal_reached ?? prog.done;
  const conv = calls > 0 ? `${Math.round((reached / calls) * 100)}%` : "—";
  const cost = a.cost ?? a.cost_rub ?? (a.minutes || 0) * state.companyTariff;
  const funnel = `<div class="call-funnel" role="img" aria-label="Воронка результатов">
    <div class="funnel-step"><span class="funnel-value">${prog.inQueue}</span><span class="funnel-label">В очереди</span></div>
    <div class="funnel-step"><span class="funnel-value">${calls}</span><span class="funnel-label">Звонков</span></div>
    <div class="funnel-step funnel-step--ok"><span class="funnel-value">${reached}</span><span class="funnel-label">Дозвоны</span></div>
    <div class="funnel-step funnel-step--ok"><span class="funnel-value">${reached}</span><span class="funnel-label">Целевые</span></div>
    <div class="funnel-step funnel-step--muted"><span class="funnel-value">${prog.noAnswer}</span><span class="funnel-label">Недозвон</span></div>
  </div>`;
  const recent = (camp.contacts || [])
    .filter((c) => c.attempts?.length || c.last_attempt)
    .slice(0, 8)
    .map((c) => {
      const last = c.last_attempt || (c.attempts || [])[c.attempts.length - 1];
      const outcome = last?.cause_code || last?.outcome || statusLabel(c.status);
      const dur = last?.duration_sec != null ? `${last.duration_sec} с` : "—";
      return `<tr><td>${escapeHtml(maskPhone(c.phone))}</td><td>${escapeHtml(statusLabel(c.status))}</td><td>${escapeHtml(outcomeLabel(outcome))}</td><td>${escapeHtml(dur)}</td><td class="hint">—</td></tr>`;
    })
    .join("");
  return `<section class="call-progress-block" id="sec-call-progress">
    <header class="call-progress-head">
      <h3 class="call-progress-title">Ход обзвона</h3>
      ${camp.dial_state === "running" ? `<span class="status-badge status-badge--ok status-badge--compact">Идёт</span>` : ""}
    </header>
    <div class="metrics-grid metrics-grid-compact call-progress-metrics">
      ${analyticsMetric("В очереди", prog.inQueue)}
      ${analyticsMetric("Звонков", calls)}
      ${analyticsMetric("Конверсия", conv)}
      ${analyticsMetric("Потрачено", `${cost} ₽`)}
    </div>
    ${funnel}
    ${
      recent
        ? `<h4 class="call-feed-title">Последние звонки</h4>
           <div class="desk-surface desk-table-surface"><table class="data call-feed-table">
             <thead><tr><th>Контакт</th><th>Статус</th><th>Итог</th><th>Длит.</th><th>Время</th></tr></thead>
             <tbody>${recent}</tbody>
           </table></div>`
        : `<p class="hint">Звонки появятся здесь по мере обзвона</p>`
    }
  </section>`;
}

function blockCallQuality(camp) {
  if (!hasCampaignCalls(camp)) {
    return `<section class="quality-block quality-block--empty">
      <h3 class="quality-title">Качество звонков</h3>
      <p class="hint">После звонков здесь будут записи, транскрипты и AI-резюме. Флаги качества — после подключения backend.</p>
    </section>`;
  }
  const withTranscript = (camp.contacts || []).filter((c) => c.last_transcript || c.transcript).slice(0, 6);
  if (!withTranscript.length) {
    return `<section class="quality-block quality-block--empty">
      <h3 class="quality-title">Качество звонков</h3>
      <p class="hint">Транскрипты и записи появятся после звонков с разговором.</p>
    </section>`;
  }
  const rows = withTranscript
    .map(
      (c) => `<tr>
      <td>${escapeHtml(maskPhone(c.phone))}</td>
      <td>${escapeHtml(c.verdict || statusLabel(c.status))}</td>
      <td class="quality-transcript">${escapeHtml((c.last_transcript || c.transcript || "").slice(0, 80))}…</td>
      <td><button class="btn ghost" type="button" disabled title="Скоро">Проверить</button></td>
    </tr>`
    )
    .join("");
  return `<section class="quality-block" id="sec-quality">
    <h3 class="quality-title">Качество звонков</h3>
    <p class="hint">Технические ошибки, недозвон и целевой результат — отдельно, не в одной метрике.</p>
    <div class="desk-surface desk-table-surface"><table class="data">
      <thead><tr><th>Контакт</th><th>Итог</th><th>Резюме</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

function blockBusinessOutcomes(camp) {
  const verdicts = verdictsForDisplay(camp);
  const contacts = camp.contacts || [];
  if (!hasCampaignCalls(camp) && !verdicts.length) {
    return `<div class="results-placeholder">
      <p class="hint">Итоги кампании появятся после первых звонков</p>
    </div>`;
  }
  const defaultOutcomes = verdicts.length
    ? verdicts.map((v) => (typeof v === "string" ? v : v.label || v.id))
    : ["Запись подтверждена", "Нужен перезвон", "Передать менеджеру", "Отказ", "Не дозвонились"];
  const rows = defaultOutcomes
    .map((label) => {
      const count = contacts.filter((c) => c.verdict === label || (label.includes("Недозвон") && c.status === STATUS.no_answer)).length;
      const pct = contacts.length ? `${Math.round((count / contacts.length) * 100)}%` : "—";
      return `<tr><td>${escapeHtml(label)}</td><td>${count}</td><td>${pct}</td><td class="hint">—</td><td class="hint">—</td></tr>`;
    })
    .join("");
  return `<section class="outcomes-block">
    <h3 class="outcomes-block-title">Итоги кампании</h3>
    <div class="desk-surface desk-table-surface"><table class="data">
      <thead><tr><th>Итог</th><th>Кол-во</th><th>Доля</th><th>Изменение</th><th>Действие</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="hint">Интеграции с CRM и webhook — когда backend будет готов.</p>
  </section>`;
}

function onboardingStepHtml(num, title, hint, body, { locked: stepLocked = false, done = false } = {}) {
  if (stepLocked) {
    return `<details class="onboard-step onboard-step--locked">
      <summary><span class="onboard-step-num">${num}</span> ${escapeHtml(title)} — ${escapeHtml(hint)}</summary>
    </details>`;
  }
  return `<section class="onboard-step${done ? " onboard-step--done" : ""}" id="onboard-step-${num}">
    <header class="onboard-step-head">
      <span class="onboard-step-num${done ? " onboard-step-num--ok" : ""}">${done ? "✓" : num}</span>
      <div><h3 class="onboard-step-title">${escapeHtml(title)}</h3>${hint ? `<p class="hint onboard-step-hint">${escapeHtml(hint)}</p>` : ""}</div>
    </header>
    <div class="onboard-step-body">${body}</div>
  </section>`;
}

function workspaceOverviewTab(camp, weak, started) {
  const { completed, total } = readinessProgress(camp);
  const goalDone = goalIsFilled(camp);
  const contactsDone = Boolean(camp.contacts?.length);
  const telDone = state.telephony.status === "ok" && scheduleIsSet(camp);
  const step3Locked = !contactsDone;
  const step4Locked = !telDone;

  const step1Simple = onboardingStepHtml(
    1,
    "Цель и контекст",
    "Опишите, зачем звоним",
    `<p class="hint">${escapeHtml(camp.goal || "Цель ещё не задана")}</p>
     <button class="btn secondary" type="button" data-workspace-tab="scenario">${goalDone ? "Изменить" : "Заполнить"}</button>`,
    { done: goalDone }
  );
  const step2 = onboardingStepHtml(
    2,
    "Контакты",
    "Загрузите CSV или Excel",
    `<p class="hint">${(camp.contacts || []).length ? `${camp.contacts.length} контактов загружено` : "Файл ещё не загружен"}</p>
     <button class="btn secondary" type="button" data-workspace-tab="contacts">${contactsDone ? "Открыть" : "Загрузить"}</button>`,
    { locked: !goalDone, done: contactsDone }
  );
  const step3 = onboardingStepHtml(
    3,
    "Телефония и время звонков",
    "Подключите SIP и задайте окно обзвона",
    `${blockCallRules(camp)}`,
    { locked: step3Locked, done: telDone }
  );
  const step4 = onboardingStepHtml(
    4,
    "Проверка и запуск",
    "Проверьте сценарий и запустите",
    `${blockTestingSection(camp)}`,
    { locked: step4Locked, done: completed === total }
  );

  return `<div class="workspace-tab-panel" data-tab="overview">
    ${speedPromiseBannerHtml()}
    ${launchChecklistHtml(camp)}
    <div class="onboard-steps">${step1Simple}${step2}${step3}${step4}</div>
    ${blockCallProgress(camp)}
  </div>`;
}

/** FE-243 — онбординг «запуск за день», без обещания SLA линии */
function speedPromiseBannerHtml() {
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SPEED_PROMISE_DISMISS_KEY) === "1") {
      return "";
    }
  } catch {
    /* sessionStorage может быть недоступен */
  }
  return `<aside class="speed-promise-banner" id="speed-promise-banner" data-us243-proxy>
    <div class="speed-promise-banner-body">
      <h3 class="speed-promise-banner-title">Запуск за день</h3>
      <p class="speed-promise-banner-text">Цель, контакты, телефония и расписание — обычно укладываются в один рабочий день. Это про настройку кабинета, не про гарантию линии связи.</p>
      <button type="button" class="btn secondary" data-speed-banner-cta>К шагам настройки</button>
    </div>
    <button type="button" class="btn ghost speed-promise-dismiss" data-speed-banner-dismiss>Скрыть</button>
  </aside>`;
}

function campaignWorkspace(camp) {
  const started = isStarted(camp);
  const weak = isWeakScenario(camp);
  const tab = state.ui.workspaceTab || "overview";
  const { completed, total } = readinessProgress(camp);

  let tabContent = "";
  if (tab === "overview") tabContent = workspaceOverviewTab(camp, weak, started);
  else if (tab === "contacts") tabContent = `<div class="workspace-tab-panel" data-tab="contacts">${blockNumbers(camp)}</div>`;
  else if (tab === "scenario") tabContent = `<div class="workspace-tab-panel" data-tab="scenario">${blockScenarioFlow(camp, weak, started)}</div>`;
  else if (tab === "calls")
    tabContent = `<div class="workspace-tab-panel" data-tab="calls">${blockCallProgress(camp)}${blockCallQuality(camp)}</div>`;
  else if (tab === "results")
    tabContent = `<div class="workspace-tab-panel" data-tab="results">${hasCampaignCalls(camp) ? blockBusinessOutcomes(camp) + blockCampaignAnalytics(camp) : `<div class="results-placeholder panel"><p class="hint results-placeholder-title">После первого звонка здесь появятся итоги и метрики</p>${blockBusinessOutcomes(camp)}</div>`}</div>`;
  else if (tab === "settings")
    tabContent = `<div class="workspace-tab-panel" data-tab="settings">
      ${blockCallRules(camp)}
      <div class="settings-links row-actions">
        <a class="btn secondary" href="#/cabinet/integrations">Телефония</a>
        <a class="btn secondary" href="#/cabinet/tariffs">Биллинг</a>
      </div>
      ${blockCampaignPurge(camp)}
    </div>`;

  const outcomesFold = hasCampaignCalls(camp)
    ? `<section class="outcomes-section outcomes-panel-desk" id="sec-analytics">
        <h2 class="section-title-bar">Итоги кампании</h2>
        <div class="metrics-band">${blockCampaignAnalytics(camp)}</div>
      </section>`
    : `<section class="outcomes-fold desk-section-compact" id="sec-analytics">
        <details>
          <summary class="outcomes-fold-summary">Итоги кампании — после первого звонка</summary>
          <div class="outcomes-fold-body metrics-band">${blockCampaignAnalytics(camp)}</div>
        </details>
      </section>`;

  return `<div class="workspace workspace-desk" data-camp="${escapeHtml(camp.id)}">
    <div class="workspace-chrome workspace-chrome-sticky">
      <header class="workspace-bar workspace-bar-desk">
        <a class="back-link quiet" href="#/cabinet/campaigns">← К кампаниям</a>
        <div class="workspace-title-row">
          <div class="workspace-heading">
            <h1 class="workspace-title">${escapeHtml(camp.name || "Без названия")}</h1>
            ${statusBadgeHtml(camp)}
          </div>
          <div class="workspace-toolbar">
            <span class="workspace-readiness" title="Готовность к запуску">${completed} из ${total}</span>
            ${balanceChipHtml({ className: "balance-chip--workspace" })}
            <div class="workspace-summary-actions">${dialActionsHtml(camp)}</div>
          </div>
        </div>
      </header>
      ${readinessStripHtml(camp)}
      ${workspaceTabsHtml(tab)}
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
    ${purgeDataModalHtml(camp)}
    ${locked() ? `<p class="hint workspace-locked-note">Аккаунт заблокирован</p>` : ""}
    ${scheduleDrawerHtml(camp)}
    ${launchReasonsDrawerHtml(camp)}
    <div class="workspace-main">${tabContent}</div>
    ${tab === "overview" ? "" : outcomesFold}
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

  const contextBlock = `<div class="context-split">
            <div class="flow-fields">
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
                <textarea id="preview-details" rows="4" ${dis} placeholder="Что важно сказать абоненту">${escapeHtml(detailsVal)}</textarea>
                <p class="hint">Чем подробнее опишете продукт, условия и частые вопросы — тем точнее будет разговор. Можно своими словами.</p>
              </div>
            </div>
            <div class="verdicts-zone" id="sec-verdicts">
              <p class="form-zone-sub">Возможные итоги разговора</p>
              <p class="hint">Система собрала список по цели. Менять его нельзя</p>
              ${verdictsBlock}
            </div>
          </div>`;

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
            <div class="stage-field stage-field-head">
              <label>Цель этапа ${stageKindBadge(s.kind)}</label>
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

  return `<section class="flow-section workspace-panel scenario-sheet" id="sec-preview">
    <header class="scenario-sheet-head">
      <h2 class="scenario-sheet-title">Робот так понял сценарий</h2>
      <p class="hint">Можно править текст и этапы — ветки рисовать не нужно</p>
    </header>
    <form class="preview-panel scenario-sheet-form" id="preview-form">
      ${scenarioStatusBanner(camp, { weak, started, pending, genErr, hasServerPreview })}

      <div class="form-zones">
        ${formZone("Цель и сведения", "", contextBlock, { id: "sec-context" })}
        ${hasServerPreview || pending ? formZone("Как звучит робот", "", voiceBlock, { id: "sec-voice" }) : ""}
        ${formZone("Сценарий и этапы", "Название столбца в файле должно совпадать с полем в сценарии", stagesBlock, { id: "sec-scenario" })}
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


function archetypeCardsHtml(selectedId, { locked = false, name = "archetype-pick" } = {}) {
  const cur = selectedId == null ? "" : String(selectedId);
  return `<div class="archetype-grid" role="listbox" aria-label="Тип звонка">
    ${ARCHETYPE_CARDS.map((card) => {
      const id = card.id || "";
      const active = cur === id || (card.auto && !cur);
      return `<button type="button" class="archetype-card${active ? " is-active" : ""}" data-archetype="${escapeHtml(id)}" data-archetype-name="${name}" ${locked ? "disabled" : ""}>
        <span class="archetype-card-title">${escapeHtml(card.title)}</span>
        <span class="archetype-card-hint">${escapeHtml(card.hint)}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function readKnowledgePackFromDom(archetype) {
  const pack = {};
  const lines = (id) =>
    (document.getElementById(id)?.value || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  if (archetype === "guide_task") {
    const steps = lines("pack-steps").map((instruction, i) => ({
      id: `s${i + 1}`,
      instruction,
      verify_question: "",
    }));
    if (steps.length) pack.steps = steps;
    const esc = lines("pack-escalation").map((say) => ({ when: "не знаем ответ", say }));
    if (esc.length) pack.escalation = esc;
  } else if (archetype === "feedback_interview") {
    const topics = lines("pack-topics").map((question, i) => ({ id: `t${i + 1}`, question }));
    if (topics.length) pack.interview_topics = topics;
  } else if (archetype === "notify_support") {
    const facts = lines("pack-facts").map((text, i) => ({ id: `f${i + 1}`, text }));
    if (facts.length) pack.facts = facts;
    const faqLines = lines("pack-faq");
    const faq = [];
    for (const line of faqLines) {
      const [q, ...rest] = line.split("|");
      if (q && rest.length) faq.push({ q: q.trim(), a: rest.join("|").trim() });
    }
    if (faq.length) pack.faq = faq;
    const esc = lines("pack-escalation").map((say) => ({ when: "нет ответа в FAQ", say }));
    if (esc.length) pack.escalation = esc;
  } else if (archetype === "winback_feedback") {
    const barriers = lines("pack-barriers");
    if (barriers.length) pack.barriers_prompt = barriers;
    const ctas = lines("pack-ctas").map((say) => ({ label: "cta", say }));
    if (ctas.length) pack.ctas = ctas;
  } else if (archetype === "offer_educational") {
    const facts = lines("pack-facts").map((text, i) => ({ id: `f${i + 1}`, text }));
    if (facts.length) pack.facts = facts;
    const ctas = lines("pack-ctas").map((say) => ({ label: "cta", say }));
    if (ctas.length) pack.ctas = ctas;
  } else {
    const facts = lines("pack-facts").map((text, i) => ({ id: `f${i + 1}`, text }));
    if (facts.length) pack.facts = facts;
  }
  return pack;
}

function knowledgePackFormHtml(archetype, pack, { dis = "" } = {}) {
  const p = pack || {};
  const joinLines = (arr, mapFn) => (Array.isArray(arr) ? arr.map(mapFn).filter(Boolean).join("\n") : "");
  if (!archetype) {
    return `<p class="hint">Сначала выберите тип звонка — или оставьте «Подберём сами»</p>`;
  }
  let fields = "";
  if (archetype === "guide_task") {
    fields = `<label for="pack-steps">Шаги (по одному в строке)</label>
      <textarea id="pack-steps" rows="4" ${dis} placeholder="Откройте раздел Партнёры">${escapeHtml(joinLines(p.steps, (x) => x.instruction || ""))}</textarea>
      <label for="pack-escalation">Если робот не знает ответ</label>
      <textarea id="pack-escalation" rows="2" ${dis}>${escapeHtml(joinLines(p.escalation, (x) => x.say || ""))}</textarea>`;
  } else if (archetype === "feedback_interview") {
    fields = `<label for="pack-topics">Темы опроса (по одной в строке)</label>
      <textarea id="pack-topics" rows="4" ${dis}>${escapeHtml(joinLines(p.interview_topics, (x) => x.question || ""))}</textarea>`;
  } else if (archetype === "notify_support") {
    fields = `<label for="pack-facts">Факты для сообщения</label>
      <textarea id="pack-facts" rows="3" ${dis}>${escapeHtml(joinLines(p.facts, (x) => x.text || ""))}</textarea>
      <label for="pack-faq">FAQ (вопрос | ответ)</label>
      <textarea id="pack-faq" rows="3" ${dis}>${escapeHtml(joinLines(p.faq, (x) => (x.q && x.a ? `${x.q} | ${x.a}` : "")))}</textarea>
      <label for="pack-escalation">Эскалация</label>
      <textarea id="pack-escalation" rows="2" ${dis}>${escapeHtml(joinLines(p.escalation, (x) => x.say || ""))}</textarea>`;
  } else if (archetype === "winback_feedback") {
    fields = `<label for="pack-barriers">Барьеры / вопросы</label>
      <textarea id="pack-barriers" rows="3" ${dis}>${escapeHtml(joinLines(p.barriers_prompt, (x) => String(x)))}</textarea>
      <label for="pack-ctas">Что предложить сказать</label>
      <textarea id="pack-ctas" rows="2" ${dis}>${escapeHtml(joinLines(p.ctas, (x) => x.say || ""))}</textarea>`;
  } else if (archetype === "offer_educational") {
    fields = `<label for="pack-facts">Факты / условия</label>
      <textarea id="pack-facts" rows="3" ${dis}>${escapeHtml(joinLines(p.facts, (x) => x.text || ""))}</textarea>
      <label for="pack-ctas">CTA</label>
      <textarea id="pack-ctas" rows="2" ${dis}>${escapeHtml(joinLines(p.ctas, (x) => x.say || ""))}</textarea>`;
  } else {
    fields = `<label for="pack-facts">Факты (необязательно)</label>
      <textarea id="pack-facts" rows="3" ${dis}>${escapeHtml(joinLines(p.facts, (x) => x.text || ""))}</textarea>`;
  }
  return `<div class="knowledge-pack-form" id="knowledge-pack-form">
    <p class="form-zone-sub">Контекст для робота</p>
    <p class="hint">Заполните факты и шаги — робот не будет их выдумывать</p>
    ${fields}
  </div>`;
}

function packGapsBanner(camp) {
  const warns = Array.isArray(camp?.generate_warnings) ? camp.generate_warnings : [];
  const genErr = state.ui.generateError;
  let html = "";
  if (genErr) {
    html += `<div class="error pack-gaps-error" role="alert">${escapeHtml(genErr)}</div>`;
  }
  if (warns.length) {
    html += `<div class="hint pack-gaps-warn" role="status">Не хватает данных для точного сценария: ${escapeHtml(warns.join("; "))}</div>`;
  }
  return html;
}

function stageKindBadge(kind) {
  if (!kind) return "";
  const label = STAGE_KIND_LABEL[kind] || kind;
  return `<span class="stage-kind-badge" title="Тип этапа задаётся системой">${escapeHtml(label)}</span>`;
}

function clientPackGapsBlock(archetype, pack) {
  if (archetype === "guide_task") {
    const steps = pack?.steps;
    if (!Array.isArray(steps) || !steps.length) {
      return "Чтобы помочь в приложении, добавьте хотя бы один шаг";
    }
  }
  if (archetype === "notify_support") {
    const facts = pack?.facts;
    const esc = pack?.escalation;
    if (!Array.isArray(facts) || !facts.length || !Array.isArray(esc) || !esc.length) {
      return "Добавьте факты уведомления и текст эскалации";
    }
  }
  return "";
}

function newCampaignFormInline() {
  const pending = state.ui.generatePending;
  const draft = state.ui.newCampaignDraft || { name: "", goal: "", details: "", archetype: "", archetype_locked: false, knowledge_pack: {} };
  const formErr = state.ui.newCampaignError;
  const arch = draft.archetype || "";
  const dis = `${roAttr()} ${pending ? "disabled" : ""}`;
  return `<form class="desk-form flow-fields create-campaign-form" id="new-campaign-form">
    <div class="preview-field preview-field-full">
      <label for="camp-name">Название</label>
      <input id="camp-name" value="${escapeHtml(draft.name || "")}" ${dis} />
      <p class="hint">Пустое имя — не мешает запуску</p>
    </div>
    <div class="preview-field preview-field-full">
      <label>Тип звонка</label>
      ${archetypeCardsHtml(arch, { locked: pending })}
      <p class="hint">Можно выбрать тип или оставить подбор системе</p>
    </div>
    <div class="preview-field preview-field-full">
      <label for="camp-goal">Цель звонка</label>
      <input id="camp-goal" placeholder="Например: напомнить о записи" value="${escapeHtml(draft.goal || "")}" ${dis} />
      <p class="hint">К чему должен привести разговор</p>
    </div>
    <div class="preview-field preview-field-full">
      <label for="camp-details">Сведения</label>
      <textarea id="camp-details" rows="5" placeholder="Что важно сказать абоненту" ${dis}>${escapeHtml(draft.details || "")}</textarea>
      <p class="hint">Чем подробнее опишете продукт, условия и частые вопросы — тем точнее будет разговор. Можно своими словами.</p>
    </div>
    ${knowledgePackFormHtml(arch, draft.knowledge_pack || {}, { dis })}
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

/** Исходы попытки v1 (DESIGN-138 / FE-148) — канон API: busy|no_answer|voicemail|early_hangup */
const OUTCOME_FILTERS = [
  { id: "all", label: "Все исходы", api: null, codes: null },
  { id: "busy", label: "Занято", api: "busy", codes: ["busy"] },
  { id: "no_answer", label: "Не берёт", api: "no_answer", codes: ["no_answer", "no_pickup"] },
  { id: "voicemail", label: "Автоответчик", api: "voicemail", codes: ["voicemail"] },
  { id: "early_hangup", label: "Ранний сброс", api: "early_hangup", codes: ["early_hangup", "early"] },
];

function contactCauseCode(contact) {
  if (contact.last_attempt_outcome) return contact.last_attempt_outcome;
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
  if (contact.last_attempt_outcome && spec.api && contact.last_attempt_outcome === spec.api) {
    return true;
  }
  const code = contactCauseCode(contact);
  return spec.codes.includes(code);
}

function contactsListQuery() {
  const params = new URLSearchParams();
  const st = state.ui.contactStatusFilter;
  if (st && st !== "all") params.set("status", STATUS[st] || st);
  const oc = state.ui.contactOutcomeFilter;
  if (oc && oc !== "all") {
    const spec = OUTCOME_FILTERS.find((f) => f.id === oc);
    params.set("outcome", spec?.api || oc);
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

function mapContactListItem(item) {
  return {
    id: item.id,
    phone: item.phone,
    status: item.status || STATUS.in_progress,
    attrs: item.attrs || {},
    verdict: item.verdict ?? null,
    attempt_count: item.attempt_count ?? 0,
    last_transcript: item.last_transcript ?? null,
    attempts: item.attempts || (item.last_attempt ? [item.last_attempt] : []),
    last_attempt: item.last_attempt || null,
    last_attempt_outcome: item.last_attempt_outcome || null,
    cause_code: item.cause_code || null,
    name: item.name || (item.attrs && item.attrs.name) || "",
  };
}

async function reloadCampaignContactsList(camp) {
  if (!hasApi() || !camp?.id) return;
  const data = await apiFetch(
    `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts${contactsListQuery()}`,
    { session: state.session }
  );
  camp.contacts = (data?.items || []).map(mapContactListItem);
  persistCampaigns();
}

function renderUploadPreview(preview) {
  if (!preview) return "";
  const colRows = (preview.columns || [])
    .map((c) => `<tr><td>${escapeHtml(c.file || c)}</td><td>${escapeHtml(c.field || c)}</td></tr>`)
    .join("");
  const errRows = (preview.errors || [])
    .slice(0, 5)
    .map((e) => `<li>${escapeHtml(typeof e === "string" ? e : e.reason || "Ошибка строки")}</li>`)
    .join("");
  return `<div class="upload-preview panel" id="upload-preview">
    <h4>Предпросмотр файла</h4>
    <div class="upload-preview-stats">
      <span><strong>${preview.total ?? 0}</strong> строк</span>
      <span><strong>${preview.valid ?? 0}</strong> валидных</span>
      <span class="${preview.bad ? "error" : ""}"><strong>${preview.bad ?? 0}</strong> ошибок</span>
    </div>
    ${preview.sample ? `<p class="hint upload-preview-sample"><strong>Пример реплики:</strong> ${escapeHtml(preview.sample)}</p>` : ""}
    ${colRows ? `<table class="data upload-preview-cols"><thead><tr><th>Колонка файла</th><th>Поле</th></tr></thead><tbody>${colRows}</tbody></table>` : ""}
    ${errRows ? `<ul class="upload-preview-errors">${errRows}</ul><button class="btn ghost" type="button" id="export-errors" disabled>Скачать ошибки</button>` : ""}
    <div class="row-actions">
      <button class="btn" type="button" id="upload-preview-confirm">Подтвердить загрузку</button>
      <button class="btn secondary" type="button" id="upload-preview-cancel">Отмена</button>
    </div>
  </div>`;
}

function contactsTemplateCsv() {
  return "phone,name,appointment_date\n+79001234567,Иван,2026-09-01\n";
}

async function previewContactsFile(file) {
  if (!file) return null;
  try {
    const matrix = await rowsFromFile(file);
    const parsed = contactsFromRows(matrix);
    if (parsed.error) return { error: parsed.error, total: 0, valid: 0, bad: 0 };
    const header = matrix[0] || [];
    const columns = header.map((h) => ({ file: h, field: isPhoneHeader(h) ? "phone" : h }));
    const sampleContact = parsed.good[0];
    const sample = sampleContact
      ? `Здравствуйте${sampleContact.name ? `, ${sampleContact.name}` : ""}!`
      : "";
    return {
      file,
      total: Math.max(0, matrix.length - 1),
      valid: parsed.good.length,
      bad: parsed.bad,
      columns,
      good: parsed.good,
      errors: parsed.bad ? [`${parsed.bad} строк с неверным номером`] : [],
      sample,
    };
  } catch {
    return { error: "format", total: 0, valid: 0, bad: 0 };
  }
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
  const filters = `<div class="status-filters" role="tablist" aria-label="Статус" data-testid="contact-status-filters">
      ${filterKeys
        .map(
          (f) =>
            `<button type="button" class="status-filter${filter === f.id ? " active" : ""}" data-contact-filter="${f.id}" role="tab" aria-selected="${filter === f.id ? "true" : "false"}">${escapeHtml(f.label)}</button>`
        )
        .join("")}
    </div>`;
  const outcomeFilters = `<div class="status-filters outcome-filters" role="tablist" aria-label="Исход попытки">
      <span class="filter-label">Исход попытки</span>
      ${OUTCOME_FILTERS.map(
        (f) =>
          `<button type="button" class="status-filter${outcomeFilter === f.id ? " active" : ""}" data-outcome-filter="${f.id}" role="tab" aria-selected="${outcomeFilter === f.id ? "true" : "false"}">${escapeHtml(f.label)}</button>`
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
              <td>${contactStatusBadgeHtml(r.status)}</td>
              <td>${escapeHtml(r.name || "")}</td>
            </tr>
            ${open ? `<tr class="expand-row"><td colspan="4">${contactDrawerHtml(camp, r)}</td></tr>` : ""}`;
        })
        .join("")
    : `<tr class="contacts-empty-row"><td colspan="4"><p class="hint contacts-empty">${state.ui.contactsEmptyAfterPurge ? "Контактов пока нет. Загрузите файл, если нужен новый обзвон." : "Загрузите контакты из Excel или CSV. Нужен столбец с телефоном"}</p></td></tr>`;

  const uploadZone = `<div class="upload-zone upload-zone-dnd${contacts.length ? " upload-zone-quiet" : " upload-zone-empty"}${state.ui.contactsUploading ? " is-uploading" : ""}" id="upload-zone">
        <div class="upload-zone-main">
          <p class="upload-zone-title">${contacts.length ? "Догрузить файл" : "Перетащите CSV или Excel сюда"}</p>
          <p class="hint">Форматы: .csv, .xlsx, .xls · нужен столбец с телефоном</p>
          <div class="upload-zone-actions">
            <button class="btn${contacts.length ? " secondary" : ""}" type="button" id="pick-file" ${roAttr()}${state.ui.contactsUploading ? " disabled" : ""}>Выбрать файл</button>
            <a class="btn ghost" href="#" id="download-template" download="scorix-contacts-template.csv">Скачать шаблон</a>
          </div>
          <input class="sr-file" type="file" id="contact-file" accept=".csv,.xlsx,.xls" tabindex="-1" aria-hidden="true" ${roAttr()} ${state.ui.contactsUploading ? "disabled" : ""} />
        </div>
        <details class="consent-disclosure"${state.ui.consentOpen ? " open" : ""}>
          <summary>Юридическое предупреждение</summary>
          <p class="consent">Загружая номера, вы подтверждаете законные основания для обзвона. Scorix согласия не собирает — храните документы у себя.</p>
        </details>
      </div>
      ${state.ui.contactUploadPreview ? renderUploadPreview(state.ui.contactUploadPreview) : ""}
      <div class="upload-progress-block upload-state" id="upload-progress-block" ${state.ui.contactsUploading ? "" : "hidden"}>
        <p id="upload-progress" class="hint">Загружаем контакты…</p>
        <div class="upload-progress-track" aria-hidden="true">
          <div id="upload-progress-bar" class="upload-progress-bar" style="width:0%"></div>
        </div>
        <p class="hint" id="upload-batch-hint">Файл обрабатывается пачками</p>
        <p class="hint" id="upload-progress-hint">Большой файл может занять несколько минут</p>
        <button class="btn secondary" type="button" id="upload-cancel">Отменить загрузку</button>
      </div>
      <p class="hint ok-line upload-state" id="upload-ok" hidden>Контакты загружены</p>
      <div class="error upload-state" id="upload-errors"></div>
      ${warnings.map((w) => `<p class="error">${escapeHtml(w)}</p>`).join("")}
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

  return `<section class="flow-section workspace-panel contacts-sheet" id="sec-contacts" data-testid="contacts-panel">
    <h2 class="contacts-sheet-title">Номера</h2>
    <div class="contacts-panel contacts-sheet-body">
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

function gateReasonText(err) {
  const code = typeof err === "string" ? err : err?.code;
  const details = typeof err === "object" && err ? err.details : null;
  if (code === "missing_attr_values") {
    const problems = Array.isArray(details?.problems) ? details.problems : [];
    const fields = [...new Set(problems.map((p) => p?.attr).filter(Boolean))];
    if (fields.length === 1) return `У части номеров пустое поле «${fields[0]}»`;
    if (fields.length > 1) return `У части номеров пустое поле «${fields.join("», «")}»`;
    return "У старых номеров нет значения нового поля";
  }
  if (code === "missing_columns") {
    const cols = details?.columns || details?.fields || [];
    if (Array.isArray(cols) && cols.length) return `Нет столбца «${cols[0]}» в файле`;
    return "Нет столбца в файле";
  }
  return errorMessage(code) || String(code || "Пока нельзя начать");
}

function launchBlockReasons(camp) {
  const reasons = [];
  if (hasApi() && Array.isArray(state.ui.gateErrors) && state.ui.gateErrors.length) {
    for (const err of state.ui.gateErrors) {
      const code = typeof err === "string" ? err : err?.code;
      reasons.push({
        text: gateReasonText(err),
        code,
        action: code === "missing_attr_values" || code === "missing_columns" ? "contacts" : undefined,
        hint:
          code === "missing_attr_values"
            ? "Откройте номер и заполните поле — или догрузите файл"
            : null,
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

function contactAttrsFormHtml(camp, contact) {
  const fromCamp = Array.isArray(camp.columns) ? camp.columns : [];
  const fromAttrs = Object.keys(contact.attrs || {});
  const fromStages = [];
  for (const stage of camp.stages || []) {
    for (const key of stage.attrs || stage.attributes || []) {
      if (key) fromStages.push(String(key));
    }
  }
  const fields = [...new Set([...fromCamp, ...fromAttrs, ...fromStages])].filter(
    (f) => f && !isPhoneHeader(f) && !/^id$/i.test(f)
  );
  if (!fields.length) return "";
  const inputs = fields
    .map((f) => {
      const val = (contact.attrs && contact.attrs[f]) || (f === "name" ? contact.name : "") || "";
      return `<div class="preview-field">
        <label for="attr-${escapeHtml(contact.id || contact.phone)}-${escapeHtml(f)}">${escapeHtml(f)}</label>
        <input id="attr-${escapeHtml(contact.id || contact.phone)}-${escapeHtml(f)}" name="${escapeHtml(f)}" value="${escapeHtml(String(val))}" ${roAttr()} />
      </div>`;
    })
    .join("");
  return `<form class="contact-attrs-form" data-contact-attrs-id="${escapeHtml(contact.id || "")}">
    <h4>Поля номера</h4>
    <div class="flow-fields">${inputs}</div>
    <button class="btn" type="submit" ${roAttr()}>Сохранить</button>
    <p class="hint contact-attrs-msg" hidden></p>
  </form>`;
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
  const lastOutcome = contact.last_attempt_outcome
    ? `<p><strong>Исход</strong>: ${escapeHtml(outcomeLabel(contact.last_attempt_outcome))}</p>`
    : "";
  return `<div class="panel nested contact-drawer">
    <h3>Номер</h3>
    <p>${escapeHtml(maskPhone(contact.phone))}</p>
    <p><strong>Статус</strong>: ${escapeHtml(statusLabel(contact.status))}
      ${contact.status === STATUS.done ? `<span class="hint">Поговорили с человеком</span>` : ""}</p>
    ${lastOutcome}
    <p><strong>Вердикт</strong>: ${
      contact.verdict ? escapeHtml(contact.verdict) : "Вердикта нет — разговора не было"
    }</p>
    <p class="hint">Вердикт — про цель кампании, не про статус</p>
    ${
      contact.insights_summary
        ? `<details class="contact-insights"><summary>Инсайты</summary><p class="hint">${escapeHtml(contact.insights_summary)}</p></details>`
        : ""
    }
    ${contactAttrsFormHtml(camp, contact)}
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
  return `<div class="login-wrap login-wrap-center">
    <form class="login-panel" id="login-form" data-testid="login-panel">
      <p class="login-panel-brand"><span class="brand-mark" aria-hidden="true"></span>Scorix</p>
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
  </div>`;
}

function totpVerifyView() {
  return `<div class="login-wrap login-wrap-center">
    <form class="login-panel" id="totp-form">
      <p class="login-panel-brand"><span class="brand-mark" aria-hidden="true"></span>Scorix</p>
      <h1 class="login-panel-title">Код из приложения</h1>
      <p class="hint">Введите 6-значный код из Google Authenticator или Microsoft Authenticator</p>
      <div class="flow-fields login-fields">
        <div class="preview-field preview-field-full">
          <label for="totp-code">Код</label>
          <input id="totp-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" />
        </div>
        <details class="hint" style="margin-top:0.5rem">
          <summary>Нет доступа к телефону?</summary>
          <div class="preview-field preview-field-full" style="margin-top:0.5rem">
            <label for="totp-recovery">Резервный код</label>
            <input id="totp-recovery" autocomplete="off" placeholder="xxxx-xxxx" />
          </div>
        </details>
      </div>
      <button class="btn login-submit" id="totp-submit" type="submit">Продолжить</button>
      <button class="btn secondary login-panel-secondary" id="totp-back" type="button">Назад</button>
      <div class="error" id="totp-error" hidden></div>
    </form>
  </div>`;
}

function forbiddenView() {
  let action = `<button class="btn login-submit" id="forbidden-action" type="button">Войти</button>`;
  if (state.session && state.role === "company") {
    action = `<button class="btn login-submit" id="forbidden-action" type="button">В кабинет</button>`;
  } else if (state.session && state.role === "superadmin") {
    action = `<button class="btn login-submit" id="forbidden-action" type="button">В админку</button>`;
  }
  return `<div class="login-wrap login-wrap-center">
    <div class="login-panel">
      <p class="login-panel-brand"><span class="brand-mark" aria-hidden="true"></span>Scorix</p>
      <h1 class="login-panel-title">Нет доступа</h1>
      <p class="hint login-panel-hint">У вас нет доступа к этой странице</p>
      <div class="login-panel-actions">
        ${action}
        <button class="btn secondary login-panel-secondary" id="forbidden-logout" type="button">Выйти</button>
      </div>
    </div>
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
  if (path === "/admin" || path === "/admin/settings" || path === "/admin/integrations") {
    if (!state.session || state.role !== "superadmin") {
      navigate("/forbidden");
      return;
    }
    const tab =
      path === "/admin/settings" ? "settings" : path === "/admin/integrations" ? "integrations" : "companies";
    app.innerHTML = adminShell(tab);
    bindShell();
    clearFlashSoon();
    if (hasApi() && path === "/admin/integrations") {
      void refreshAdminIntegrations()
        .then(() => {
          app.innerHTML = adminShell("integrations");
          bindShell();
        })
        .catch((e) => flash(errorMessage(e?.code), "error"));
    } else if (hasApi() && path === "/admin/settings" && state.adminTotp.enabled === null) {
      void refreshAdminTotpStatus()
        .then(() => render())
        .catch((e) => flash(errorMessage(e?.code), "error"));
    } else if (hasApi() && !state.ui.adminLoaded) {
      void ensureAdminData();
    }
    return;
  }
  if (path === "/forbidden") {
    app.innerHTML = forbiddenView();
    bindForbidden();
    return;
  }
  if (path === "/login/totp") {
    if (!state.pendingTotp?.token) {
      navigate("/login");
      return;
    }
    app.innerHTML = totpVerifyView();
    bindTotpVerify();
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

function bindMobileNav() {
  const sel = document.getElementById("mobile-nav-select");
  if (!sel) return;
  sel.onchange = () => {
    const href = sel.value;
    if (href) navigate(href.replace(/^#/, ""));
  };
}

function bindWorkspaceTabs() {
  document.querySelectorAll("[data-workspace-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = btn.getAttribute("data-workspace-tab");
      if (!tab) return;
      state.ui.workspaceTab = tab;
      render();
    });
  });
  document.querySelectorAll("[data-open-schedule]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.ui.scheduleDrawerOpen = true;
      render();
    });
  });
  const scheduleInline = document.getElementById("schedule-open-inline");
  if (scheduleInline) {
    scheduleInline.onclick = () => {
      state.ui.scheduleDrawerOpen = true;
      render();
    };
  }
  const speedDismiss = document.querySelector("[data-speed-banner-dismiss]");
  if (speedDismiss) {
    speedDismiss.onclick = () => {
      try {
        sessionStorage.setItem(SPEED_PROMISE_DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      render();
    };
  }
  const speedCta = document.querySelector("[data-speed-banner-cta]");
  if (speedCta) {
    speedCta.onclick = () => {
      document.getElementById("sec-launch-checklist")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  }
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


function bindPurgeData() {
  const camp = workspaceCampaign();
  const openBtn = document.getElementById("purge-data-open");
  if (openBtn) {
    openBtn.onclick = () => {
      if (locked()) return;
      if (camp?.dial_state === "running") {
        flash("Сейчас идёт обзвон. Остановите его и повторите удаление данных.", "error");
        return;
      }
      state.ui.purgeDataOpen = true;
      state.ui.purgeDataPending = false;
      render();
    };
  }

  const closePurge = () => {
    if (state.ui.purgeDataPending) return;
    state.ui.purgeDataOpen = false;
    state.ui.purgeDataPending = false;
    render();
  };

  const cancel = document.getElementById("purge-data-cancel");
  if (cancel) cancel.onclick = closePurge;

  const backdrop = document.getElementById("purge-data-backdrop");
  if (backdrop) {
    backdrop.onclick = (ev) => {
      if (ev.target === backdrop) closePurge();
    };
  }

  const confirmBtn = document.getElementById("purge-data-confirm");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      const id = confirmBtn.getAttribute("data-id");
      const target = camp || campaignById(id);
      if (!target || locked()) return;
      const errEl = document.getElementById("purge-data-error");
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (target.dial_state === "running") {
        const msg = "Сейчас идёт обзвон. Остановите его и повторите удаление данных.";
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = msg;
        } else {
          flash(msg, "error");
        }
        return;
      }
      state.ui.purgeDataPending = true;
      render();
      try {
        let res = { purged: true, contacts: (target.contacts || []).length, attempts: 0 };
        if (hasApi()) {
          res = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(target.id)}/purge-data`, {
            method: "POST",
            session: state.session,
            body: { confirm: true },
          });
        }
        target.contacts = [];
        // keep goal/scenario; no "deleted" contact status
        persistCampaigns();
        state.ui.purgeDataOpen = false;
        state.ui.purgeDataPending = false;
        state.ui.contactsEmptyAfterPurge = true;
        const n = Number(res?.contacts ?? 0);
        const m = Number(res?.attempts ?? 0);
        if (n === 0 && m === 0) {
          flash("Данных для удаления не было. Цель и сценарий на месте.");
        } else {
          flash(`Данные удалены: контактов — ${n}, попыток — ${m}`);
        }
        render();
      } catch (ex) {
        state.ui.purgeDataPending = false;
        const code = ex?.code;
        let msg;
        if (code === "campaign_running") msg = errorMessage("campaign_running");
        else if (code === "confirm_required") msg = errorMessage("confirm_required");
        else if (code === "not_found" || code === "campaign_not_found") msg = "Кампания не найдена";
        else msg = errorMessage("purge_failed");
        const err2 = document.getElementById("purge-data-error");
        if (err2) {
          err2.hidden = false;
          err2.textContent = msg;
          // re-render keeps pending false but need to refresh button labels
          render();
          const err3 = document.getElementById("purge-data-error");
          if (err3) {
            err3.hidden = false;
            err3.textContent = msg;
          }
        } else {
          flash(msg, "error");
          render();
        }
      }
    };
  }

  if (state.ui.purgeDataOpen) {
    const onKey = (ev) => {
      if (ev.key !== "Escape") return;
      if (state.ui.purgeDataPending) return;
      ev.preventDefault();
      document.removeEventListener("keydown", onKey);
      closePurge();
    };
    document.addEventListener("keydown", onKey);
  }
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
      try {
        sessionStorage.removeItem("scx_impersonate");
      } catch {
        /* ignore */
      }
      localStorage.removeItem("scx_impersonate");
      state.ui.adminLoaded = false;
      navigate("/admin");
      render();
    };
  }

  bindJumpNav();
  bindWorkspaceTabs();
  bindMobileNav();
  bindAdminForms();
  bindAdminTotp();
  bindAdminIntegrations();
  bindCampaignForms();
  bindTelephony();
  bindContacts();
  bindPurgeData();
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
          localStorage.setItem("scx_interval", String(v));
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
          localStorage.setItem("scx_default_tariff", String(v));
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
          saveJson("scx_impersonate", state.impersonate, sessionStorage);
          localStorage.removeItem("scx_impersonate");
        } else {
          state.impersonate = { id: c.id, name: c.name };
          saveJson("scx_impersonate", state.impersonate, sessionStorage);
          localStorage.removeItem("scx_impersonate");
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

function bindAdminTotp() {
  const beginBtn = document.getElementById("totp-setup-begin");
  if (beginBtn) {
    beginBtn.onclick = async () => {
      const err = document.getElementById("totp-setup-error");
      state.adminTotp.busy = true;
      state.adminTotp.error = "";
      render();
      try {
        const data = await apiFetch("/api/admin/totp/setup/begin", {
          method: "POST",
          session: state.session,
        });
        state.adminTotp.setup = data;
        state.adminTotp.busy = false;
        render();
      } catch (ex) {
        state.adminTotp.busy = false;
        if (err) {
          err.hidden = false;
          err.textContent = errorMessage(ex?.code);
        } else {
          flash(errorMessage(ex?.code), "error");
        }
        render();
      }
    };
  }

  const cancelBtn = document.getElementById("totp-setup-cancel");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      state.adminTotp.setup = null;
      state.adminTotp.error = "";
      render();
    };
  }

  const confirmForm = document.getElementById("totp-confirm-form");
  if (confirmForm) {
    confirmForm.onsubmit = async (e) => {
      e.preventDefault();
      const code = document.getElementById("totp-setup-code")?.value.trim();
      const err = document.getElementById("totp-setup-error");
      if (!code) {
        if (err) {
          err.hidden = false;
          err.textContent = "Введите код из приложения";
        }
        return;
      }
      state.adminTotp.busy = true;
      render();
      try {
        const data = await apiFetch("/api/admin/totp/setup/confirm", {
          method: "POST",
          session: state.session,
          body: { code },
        });
        state.adminTotp.enabled = true;
        state.adminTotp.setup = null;
        state.adminTotp.recoveryCodes = data.recovery_codes || [];
        state.adminTotp.busy = false;
        render();
      } catch (ex) {
        state.adminTotp.busy = false;
        if (err) {
          err.hidden = false;
          err.textContent = errorMessage(ex?.code);
        }
        render();
      }
    };
  }

  const recoveryDone = document.getElementById("totp-recovery-done");
  if (recoveryDone) {
    recoveryDone.onclick = () => {
      state.adminTotp.recoveryCodes = null;
      render();
    };
  }
}

function bindAdminIntegrations() {
  if (!state.adminIntegrations.feedback) state.adminIntegrations.feedback = {};
  if (!state.adminIntegrations.busy) state.adminIntegrations.busy = {};
  if (!state.adminIntegrations.forms) state.adminIntegrations.forms = {};

  function integrationItem(kind) {
    return (state.adminIntegrations.items || []).find((i) => i.kind === kind) || {};
  }

  function expectedRevisions(kind) {
    const item = integrationItem(kind);
    return {
      expected_active_revision_no: item.active ? item.active.revision_no : null,
      expected_candidate_revision_no: item.candidate ? item.candidate.revision_no : null,
    };
  }

  function setFeedback(kind, errText, okText) {
    state.adminIntegrations.feedback[kind] = { error: errText || "", ok: okText || "" };
    const err = document.getElementById(`admin-int-${kind}-error`);
    const ok = document.getElementById(`admin-int-${kind}-ok`);
    if (err) {
      err.hidden = !errText;
      err.textContent = errText || "";
    }
    if (ok) {
      ok.hidden = !okText;
      ok.textContent = okText || "";
    }
  }

  function selectedProvider(kind) {
    const providers = (state.adminIntegrations.catalog && state.adminIntegrations.catalog[kind]) || [];
    const providerKind = document.getElementById(`admin-int-${kind}-provider`)?.value;
    return providers.find((p) => p.provider_kind === providerKind) || providers[0];
  }

  function secretFieldsFilled(kind) {
    const selected = selectedProvider(kind);
    if (_isSberAuthProvider(selected)) return _sberSecretFilled(kind);
    const input = document.getElementById(`admin-int-${kind}-secret`);
    return Boolean(input && input.value.trim());
  }

  async function writeSecretIfFilled(kind) {
    if (!secretFieldsFilled(kind)) return { wrote: false };
    const selected = selectedProvider(kind);
    const parsed = _readIntegrationSecret(kind, selected);
    if (parsed.error) return { wrote: false, error: parsed.error };
    await apiFetch(`/api/admin/integrations/${kind}/secret`, {
      method: "POST",
      session: state.session,
      body: { secret: parsed.secret, ...expectedRevisions(kind) },
    });
    _clearIntegrationSecretFields(kind, selected);
    await refreshAdminIntegrations();
    return { wrote: true };
  }

  for (const meta of ADMIN_INTEGRATION_KINDS) {
    const kind = meta.kind;
    const providerSel = document.getElementById(`admin-int-${kind}-provider`);
    const modelSel = document.getElementById(`admin-int-${kind}-model`);
    if (providerSel) {
      providerSel.onchange = () => {
        if (!state.adminIntegrations.forms[kind]) state.adminIntegrations.forms[kind] = {};
        state.adminIntegrations.forms[kind].provider_kind = providerSel.value;
        const providers = (state.adminIntegrations.catalog && state.adminIntegrations.catalog[kind]) || [];
        const match = providers.find((p) => p.provider_kind === providerSel.value);
        const options = (match && match.models) || (match && match.voices) || [];
        state.adminIntegrations.forms[kind].model = options[0] || "";
        render();
      };
    }
    if (modelSel) {
      modelSel.onchange = () => {
        if (!state.adminIntegrations.forms[kind]) state.adminIntegrations.forms[kind] = {};
        state.adminIntegrations.forms[kind].model = modelSel.value;
      };
    }

    const metaForm = document.getElementById(`admin-int-${kind}-meta-form`);
    if (metaForm) {
      metaForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!hasApi()) {
          setFeedback(kind, "Сначала укажите адрес API", "");
          return;
        }
        state.adminIntegrations.busy[kind] = true;
        setFeedback(kind, "", "");
        try {
          const body = {
            provider_kind: document.getElementById(`admin-int-${kind}-provider`).value,
            enabled: true,
            runtime_mode: "live",
            ...expectedRevisions(kind),
          };
          const modelEl = document.getElementById(`admin-int-${kind}-model`);
          if (modelEl) body.model = modelEl.value;
          const folderEl = document.getElementById(`admin-int-${kind}-folder`);
          if (folderEl && folderEl.value.trim()) body.folder_id = folderEl.value.trim();
          await apiFetch(`/api/admin/integrations/${kind}`, {
            method: "PUT",
            session: state.session,
            body,
          });
          await refreshAdminIntegrations();
          setFeedback(kind, "", "Настройки сохранены");
          render();
        } catch (ex) {
          const code = ex?.code;
          setFeedback(
            kind,
            code === "revision_conflict"
              ? "Данные устарели — обновите страницу и повторите"
              : integrationErrorMessage(code),
            ""
          );
        } finally {
          state.adminIntegrations.busy[kind] = false;
        }
      };
    }

    const secretForm = document.getElementById(`admin-int-${kind}-secret-form`);
    if (secretForm) {
      secretForm.onsubmit = async (e) => {
        e.preventDefault();
        if (!hasApi()) {
          setFeedback(kind, "Сначала укажите адрес API", "");
          return;
        }
        state.adminIntegrations.busy[kind] = true;
        setFeedback(kind, "", "");
        try {
          const result = await writeSecretIfFilled(kind);
          if (result.error) {
            setFeedback(kind, result.error, "");
            return;
          }
          if (!result.wrote) {
            setFeedback(kind, "Введите ключ", "");
            return;
          }
          setFeedback(kind, "", "Ключ записан");
          render();
        } catch (ex) {
          const code = ex?.code;
          setFeedback(
            kind,
            code === "revision_conflict"
              ? "Данные устарели — обновите страницу и повторите"
              : integrationErrorMessage(code),
            ""
          );
        } finally {
          state.adminIntegrations.busy[kind] = false;
        }
      };
    }

    const testBtn = document.getElementById(`admin-int-${kind}-test`);
    if (testBtn) {
      testBtn.onclick = async () => {
        if (!hasApi()) {
          setFeedback(kind, "Сначала укажите адрес API", "");
          return;
        }
        let item = integrationItem(kind);
        let rev = item.candidate || item.active;
        if (!rev) {
          setFeedback(kind, "Сначала сохраните настройки и ключ", "");
          return;
        }
        state.adminIntegrations.busy[kind] = true;
        setFeedback(kind, "", "Проверяем…");
        try {
          if (secretFieldsFilled(kind)) {
            const written = await writeSecretIfFilled(kind);
            if (written.error) {
              setFeedback(kind, written.error, "");
              return;
            }
            item = integrationItem(kind);
            rev = item.candidate || item.active;
          }
          if (!rev) {
            setFeedback(kind, "Сначала сохраните настройки и ключ", "");
            return;
          }
          const result = await apiFetch(`/api/admin/integrations/${kind}/test`, {
            method: "POST",
            session: state.session,
            body: { revision_no: rev.revision_no, activate_on_success: true },
          });
          await refreshAdminIntegrations();
          if (result.status === "passed") {
            setFeedback(kind, "", "Подключение проверено, конфигурация активна");
          } else {
            setFeedback(kind, integrationErrorMessage(result.error_code) || "Проверка не прошла", "");
          }
          render();
        } catch (ex) {
          const code = ex?.code;
          setFeedback(
            kind,
            code === "revision_conflict"
              ? "Данные устарели — обновите страницу и повторите"
              : integrationErrorMessage(code),
            ""
          );
        } finally {
          state.adminIntegrations.busy[kind] = false;
        }
      };
    }
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

async function performPreviewSave(camp, { name, goal, details, archetype, archetype_locked, knowledge_pack }) {
  camp.name = name;
  camp.goal = goal;
  camp.details = details;
  if (archetype !== undefined) camp.archetype = archetype;
  if (archetype_locked !== undefined) camp.archetype_locked = archetype_locked;
  if (knowledge_pack !== undefined) camp.knowledge_pack = knowledge_pack;
  state.ui.generateError = null;
  const blockMsg = clientPackGapsBlock(camp.archetype, camp.knowledge_pack);
  if (blockMsg) {
    state.ui.generateError = blockMsg;
    flash(blockMsg, "error");
    render();
    return;
  }
  try {
    if (hasApi()) {
      state.ui.generatePending = true;
      render();
      const body = { goal, details, knowledge_pack: camp.knowledge_pack || {} };
      if (camp.archetype_locked && camp.archetype) {
        body.archetype = camp.archetype;
        body.archetype_locked = true;
      } else if (!camp.archetype) {
        body.archetype_locked = false;
      } else {
        body.archetype = camp.archetype;
        body.archetype_locked = Boolean(camp.archetype_locked);
      }
      const updated = await apiFetch(`/api/cabinet/campaigns/${encodeURIComponent(camp.id)}`, {
        method: "PATCH",
        session: state.session,
        body,
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
  document.querySelectorAll(".archetype-card").forEach((btn) => {
    btn.onclick = (ev) => {
      ev.preventDefault();
      if (btn.disabled || locked()) return;
      const id = btn.getAttribute("data-archetype") || "";
      const form = btn.closest("#new-campaign-form");
      if (form) {
        const d = state.ui.newCampaignDraft || {};
        d.archetype = id;
        d.archetype_locked = Boolean(id);
        d.knowledge_pack = d.knowledge_pack || {};
        state.ui.newCampaignDraft = d;
        render();
        return;
      }
      const camp = workspaceCampaign();
      if (!camp || isStarted(camp)) return;
      camp.archetype = id;
      camp.archetype_locked = Boolean(id);
      persistCampaigns();
      render();
    };
  });

  const previewForm = document.getElementById("preview-form");
  if (previewForm) {
    previewForm.onsubmit = async (e) => {
      e.preventDefault();
      const camp = workspaceCampaign();
      if (!camp || isStarted(camp) || locked() || state.ui.generatePending) return;
      const name = document.getElementById("preview-name")?.value.trim() ?? camp.name ?? "";
      const goal = document.getElementById("preview-goal").value.trim();
      const details = document.getElementById("preview-details").value.trim();
      const activeCard = document.querySelector(".archetype-card.is-active[data-archetype-name=\"archetype-pick\"]");
      const archetype = activeCard ? activeCard.getAttribute("data-archetype") || "" : camp.archetype || "";
      const archetype_locked = Boolean(archetype);
      const knowledge_pack = readKnowledgePackFromDom(archetype);
      if (!goal) {
        flash("Опишите цель звонка", "error");
        return;
      }
      if (!details || details.length < 8) {
        flash("Допишите сведения", "error");
        return;
      }
      const payload = { name, goal, details, archetype, archetype_locked, knowledge_pack };
      if (hasAssembledScenario(camp)) {
        state.ui.pendingPreviewSave = payload;
        state.ui.saveRebuildOpen = true;
        render();
        return;
      }
      await performPreviewSave(camp, payload);
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
      const activeCard = document.querySelector("#new-campaign-form .archetype-card.is-active");
      const archetype = activeCard ? activeCard.getAttribute("data-archetype") || "" : "";
      const archetype_locked = Boolean(archetype);
      const knowledge_pack = readKnowledgePackFromDom(archetype);
      state.ui.newCampaignDraft = { name, goal, details, archetype, archetype_locked, knowledge_pack };
      state.ui.newCampaignError = null;
      if (!goal) {
        state.ui.newCampaignError = "Опишите цель звонка";
        flash("Опишите цель звонка", "error");
        render();
        return;
      }
      const gapBlock = clientPackGapsBlock(archetype, knowledge_pack);
      if (gapBlock) {
        state.ui.newCampaignError = gapBlock;
        flash(gapBlock, "error");
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
          const createBody = { goal, details, knowledge_pack };
          if (archetype_locked) {
            createBody.archetype = archetype;
            createBody.archetype_locked = true;
          }
          const created = await apiFetch("/api/cabinet/campaigns", {
            method: "POST",
            session: state.session,
            body: createBody,
          });
          camp = mapCampaignFromApi(created, { name, goal, details, archetype, archetype_locked, knowledge_pack });
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
              state.ui.newCampaignError = errorMessage(code);
            }
            flash(errorMessage(code), "error");
          }
          state.ui.generatePending = false;
        } else {
          camp = emptyCampaign({
            name,
            goal,
            details,
            archetype,
            archetype_locked,
            knowledge_pack,
            preview: buildPreview({ goal, details, preview: {} }),
            scenarioText: details,
            stages: [{ goal, input: "Приветствие", output: "Суть", kind: "open" }],
            verdicts: ensureVerdicts({ goal }),
          });
        }
        state.campaigns.push(camp);
        persistCampaigns();
        setActiveCampaignId(camp.id);
        state.ui.showNewCampaign = false;
        state.ui.newCampaignDraft = { name: "", goal: "", details: "", archetype: "", archetype_locked: false, knowledge_pack: {} };
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
    file.onchange = () => void handleContactFileSelected(file.files?.[0]);
  }
  const zone = document.getElementById("upload-zone");
  if (zone) {
    zone.ondragover = (e) => {
      e.preventDefault();
      zone.classList.add("is-dragover");
    };
    zone.ondragleave = () => zone.classList.remove("is-dragover");
    zone.ondrop = (e) => {
      e.preventDefault();
      zone.classList.remove("is-dragover");
      if (locked()) return;
      void handleContactFileSelected(e.dataTransfer.files?.[0]);
    };
  }
  const template = document.getElementById("download-template");
  if (template) {
    template.onclick = (e) => {
      e.preventDefault();
      const blob = new Blob([contactsTemplateCsv()], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "scorix-contacts-template.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }
  const previewCancel = document.getElementById("upload-preview-cancel");
  if (previewCancel) {
    previewCancel.onclick = () => {
      state.ui.contactUploadPreview = null;
      render();
    };
  }
  const previewConfirm = document.getElementById("upload-preview-confirm");
  if (previewConfirm && state.ui.contactUploadPreview?.file) {
    previewConfirm.onclick = () => {
      const f = state.ui.contactUploadPreview.file;
      state.ui.contactUploadPreview = null;
      void uploadContactsFile(f, { skipPreview: true });
    };
  }
  const uploadCancel = document.getElementById("upload-cancel");
  if (uploadCancel) {
    uploadCancel.onclick = () => {
      state.ui.uploadCancelRequested = true;
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
  await reloadCampaignContactsList(camp);
}

function contactRowForUpload(contact) {
  const row = { phone: contact.phone };
  if (contact.name) row.name = contact.name;
  for (const [k, v] of Object.entries(contact.attrs || {})) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) row[k] = s;
  }
  return row;
}

function setUploadProgressUi({ ratio = 0, label = "Загружаем контакты…" } = {}) {
  const block = document.getElementById("upload-progress-block");
  const progress = document.getElementById("upload-progress");
  const hint = document.getElementById("upload-progress-hint");
  const batchHint = document.getElementById("upload-batch-hint");
  const bar = document.getElementById("upload-progress-bar");
  if (block) block.hidden = false;
  if (progress) {
    progress.hidden = false;
    progress.textContent = label;
  }
  if (hint) hint.hidden = false;
  if (batchHint) batchHint.hidden = false;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, Math.round(ratio * 100)))}%`;
}

function hideUploadProgressUi() {
  const block = document.getElementById("upload-progress-block");
  if (block) block.hidden = true;
  const bar = document.getElementById("upload-progress-bar");
  if (bar) bar.style.width = "0%";
}

async function handleContactFileSelected(file) {
  if (!file || locked() || state.ui.contactsUploading) return;
  const preview = await previewContactsFile(file);
  if (preview?.error === "format") {
    state.ui.contactUploadPreview = null;
    render();
    const errBox = document.getElementById("upload-errors");
    if (errBox) errBox.innerHTML = `<p class="error">${escapeHtml(errorMessage("unsupported_format"))}</p>`;
    return;
  }
  if (preview?.error === "no_phone_col") {
    state.ui.contactUploadPreview = null;
    render();
    const errBox = document.getElementById("upload-errors");
    if (errBox) {
      errBox.innerHTML = `<p class="error">Не нашли столбец с телефоном</p><p class="hint">Нужен столбец phone, телефон или номер</p>`;
    }
    return;
  }
  if ((preview?.total ?? 0) > CONTACT_UPLOAD_MAX_ROWS) {
    state.ui.contactUploadPreview = null;
    render();
    const errBox = document.getElementById("upload-errors");
    if (errBox) errBox.innerHTML = `<p class="error">${escapeHtml(errorMessage("file_too_large"))}</p>`;
    return;
  }
  state.ui.contactUploadPreview = preview;
  render();
}

/**
 * FE-238: первая загрузка в пустую кампанию — JSON-пачки; со 2-й пачки ?mode=live.
 * Догрузка / после старта сюда не ходит (там draft multipart).
 */
async function uploadContactsInChunks(camp, rows) {
  state.ui.uploadCancelRequested = false;
  let acceptedTotal = 0;
  const rejected = [];
  const warnings = [];
  const totalChunks = Math.max(1, Math.ceil(rows.length / CONTACT_UPLOAD_CHUNK_SIZE));

  for (let i = 0; i < rows.length; i += CONTACT_UPLOAD_CHUNK_SIZE) {
    if (state.ui.uploadCancelRequested) {
      return {
        accepted: acceptedTotal,
        rejected,
        warnings,
        cancelled: true,
        chunksDone: Math.floor(i / CONTACT_UPLOAD_CHUNK_SIZE),
        totalChunks,
      };
    }
    const chunk = rows.slice(i, i + CONTACT_UPLOAD_CHUNK_SIZE);
    const chunkIndex = Math.floor(i / CONTACT_UPLOAD_CHUNK_SIZE);
    const q = chunkIndex === 0 ? "" : "?mode=live";
    setUploadProgressUi({
      ratio: chunkIndex / totalChunks,
      label: `Загружаем контакты… (${chunkIndex + 1}/${totalChunks})`,
    });
    const result = await apiFetch(
      `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/upload${q}`,
      {
        method: "POST",
        session: state.session,
        body: { rows: chunk },
      }
    );
    acceptedTotal += Number(result?.accepted) || 0;
    if (Array.isArray(result?.rejected)) rejected.push(...result.rejected);
    if (Array.isArray(result?.warnings)) warnings.push(...result.warnings);
    setUploadProgressUi({
      ratio: (chunkIndex + 1) / totalChunks,
      label: `Загружаем контакты… (${chunkIndex + 1}/${totalChunks})`,
    });
  }
  return { accepted: acceptedTotal, rejected, warnings, cancelled: false, totalChunks };
}

async function uploadContactsFile(file, { skipPreview = false } = {}) {
  if (!file || locked() || state.ui.contactsUploading) return;
  if (!skipPreview) {
    await handleContactFileSelected(file);
    return;
  }
  const camp = workspaceCampaign() || activeCampaign();
  if (!camp) return;

  const preview = await previewContactsFile(file);
  if (preview?.error === "format") {
    const errBox = document.getElementById("upload-errors");
    if (errBox) errBox.innerHTML = `<p class="error">${escapeHtml(errorMessage("unsupported_format"))}</p>`;
    return;
  }
  if (preview?.error === "no_phone_col") {
    const errBox = document.getElementById("upload-errors");
    if (errBox) {
      errBox.innerHTML = `<p class="error">Не нашли столбец с телефоном</p><p class="hint">Нужен столбец phone, телефон или номер</p>`;
    }
    return;
  }

  const rowCount = preview?.total ?? preview?.good?.length ?? 0;
  if (rowCount > CONTACT_UPLOAD_MAX_ROWS) {
    const errBox = document.getElementById("upload-errors");
    if (errBox) errBox.innerHTML = `<p class="error">${escapeHtml(errorMessage("file_too_large"))}</p>`;
    return;
  }

  const useDraftFlow = Boolean((camp.contacts || []).length) || isStarted(camp) || Boolean(camp.ever_started);

  state.ui.contactsUploading = true;
  state.ui.uploadCancelRequested = false;
  render();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const ok = document.getElementById("upload-ok");
  const errors = document.getElementById("upload-errors");
  if (ok) ok.hidden = true;
  if (errors) errors.innerHTML = "";
  setUploadProgressUi({ ratio: 0 });

  if (!hasApi()) {
    state.ui.contactsUploading = false;
    hideUploadProgressUi();
    if (preview?.good?.length) {
      camp.contacts = [...(camp.contacts || []), ...preview.good];
      state.ui.contactsEmptyAfterPurge = false;
      camp.columns = [...new Set([...(camp.columns || []), ...(preview.columns || []).map((c) => c.file || c)])];
      persistCampaigns();
      state.ui.contactUploadPreview = null;
      render();
      const okEl = document.getElementById("upload-ok");
      if (okEl) {
        okEl.hidden = false;
        okEl.textContent = `Контакты загружены: ${preview.good.length}`;
      }
      return;
    }
    if (errors) errors.innerHTML = `<p class="error">${escapeHtml(errorMessage("api_not_configured"))}</p>`;
    render();
    return;
  }

  try {
    if (useDraftFlow) {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const result = await apiFetch(
        `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/upload`,
        { method: "POST", session: state.session, body: fd }
      );
      state.ui.contactsUploading = false;
      hideUploadProgressUi();
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
      return;
    }

    const rows = (preview.good || []).map(contactRowForUpload);
    const result = await uploadContactsInChunks(camp, rows);
    state.ui.contactsUploading = false;
    hideUploadProgressUi();
    if (result.rejected?.length && errors) {
      errors.innerHTML = result.rejected
        .slice(0, 8)
        .map(
          (r) =>
            `<p class="error">${escapeHtml(typeof r === "string" ? r : r.reason || r.code || "Строка отклонена")}</p>`
        )
        .join("");
    }
    if (result.warnings?.length) {
      camp.uploadWarnings = result.warnings.map((w) => (typeof w === "string" ? w : w.message || String(w)));
    }
    await refreshCampaignContacts(camp);
    render();
    const okEl = document.getElementById("upload-ok");
    if (okEl) {
      okEl.hidden = false;
      if (result.cancelled) {
        okEl.textContent = `Загрузка остановлена. Уже принято: ${result.accepted}`;
      } else {
        okEl.textContent =
          result.accepted != null ? `Контакты загружены: ${result.accepted}` : "Контакты загружены";
      }
    }
  } catch (ex) {
    state.ui.contactsUploading = false;
    hideUploadProgressUi();
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
            state.ui.contactsEmptyAfterPurge = false;
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
    state.ui.contactsEmptyAfterPurge = false;
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
        flash("Укажите адрес API (SCORIX_API_BASE), чтобы начать обзвон");
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
              last_attempt_outcome: card.last_attempt_outcome ?? ct.last_attempt_outcome,
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
          await reloadCampaignContactsList(camp);
        } catch (ex) {
          flash(errorMessage(ex?.code), "error");
        }
      }
      render();
    };
  });
  document.querySelectorAll("[data-outcome-filter]").forEach((btn) => {
    btn.onclick = async () => {
      state.ui.contactOutcomeFilter = btn.getAttribute("data-outcome-filter") || "all";
      const camp = workspaceCampaign() || activeCampaign();
      if (hasApi() && camp) {
        try {
          await reloadCampaignContactsList(camp);
        } catch (ex) {
          flash(errorMessage(ex?.code), "error");
        }
      }
      render();
    };
  });
  document.querySelectorAll("[data-contact-attrs-id]").forEach((form) => {
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      if (locked()) return;
      const camp = workspaceCampaign() || activeCampaign();
      const cid = form.getAttribute("data-contact-attrs-id");
      if (!hasApi() || !camp?.id || !cid) return;
      const attrs = {};
      form.querySelectorAll("input[name]").forEach((inp) => {
        attrs[inp.name] = inp.value;
      });
      const msg = form.querySelector(".contact-attrs-msg");
      try {
        const updated = await apiFetch(
          `/api/cabinet/campaigns/${encodeURIComponent(camp.id)}/contacts/${encodeURIComponent(cid)}`,
          { method: "PATCH", session: state.session, body: { attrs } }
        );
        const ct = (camp.contacts || []).find((c) => c.id === cid);
        if (ct) {
          ct.attrs = updated?.attrs || attrs;
          if (attrs.name != null) ct.name = attrs.name;
        }
        persistCampaigns();
        await refreshGates(camp).catch(() => {});
        if (msg) {
          msg.hidden = false;
          msg.textContent = "Поля сохранены";
          msg.classList.remove("error");
        } else {
          flash("Поля сохранены");
        }
        render();
      } catch (ex) {
        if (msg) {
          msg.hidden = false;
          msg.textContent = "Не удалось выполнить действие. Попробуйте ещё раз.";
          msg.classList.add("error");
        } else {
          flash(errorMessage(ex?.code), "error");
        }
      }
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
    saveJson("scx_impersonate", state.impersonate, sessionStorage);
    localStorage.removeItem("scx_impersonate");
  }
  writeSessionToken(state.session);
  localStorage.setItem("scx_role", state.role);
  localStorage.setItem("scx_locked", state.companyLocked ? "1" : "0");
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
  writeSessionToken("");
  try {
    sessionStorage.removeItem("scx_impersonate");
  } catch {
    /* ignore */
  }
  localStorage.removeItem("scx_session");
  localStorage.removeItem("scx_role");
  localStorage.removeItem("scx_locked");
  localStorage.removeItem("scx_impersonate");
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
      if (data.totp_required && data.pending_token) {
        state.pendingTotp = { token: data.pending_token, role: data.role || "superadmin" };
        navigate("/login/totp");
        return;
      }
      state.pendingTotp = null;
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

function bindTotpVerify() {
  const form = document.getElementById("totp-form");
  const err = document.getElementById("totp-error");
  const back = document.getElementById("totp-back");
  if (back) {
    back.onclick = () => {
      state.pendingTotp = null;
      navigate("/login");
    };
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const code = document.getElementById("totp-code")?.value.trim();
    const recoveryCode = document.getElementById("totp-recovery")?.value.trim();
    if (!code && !recoveryCode) {
      err.hidden = false;
      err.textContent = "Введите код или резервный код";
      return;
    }
    const submit = document.getElementById("totp-submit");
    submit.textContent = "Проверяем…";
    submit.disabled = true;
    try {
      const data = await verifyTotpLogin({
        pendingToken: state.pendingTotp?.token,
        code: code || undefined,
        recoveryCode: recoveryCode || undefined,
      });
      state.pendingTotp = null;
      applySessionPayload(data);
      navigate(data.role === "superadmin" ? "/admin" : "/cabinet/campaigns");
    } catch (e) {
      err.hidden = false;
      err.textContent = errorMessage(e?.code || "invalid_totp");
      if (e?.code === "invalid_pending_token") {
        state.pendingTotp = null;
        setTimeout(() => navigate("/login"), 1500);
      }
    } finally {
      submit.textContent = "Продолжить";
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
