/** Thin public API client — no HQ contracts. */

export const API_BASE =
  (typeof window !== "undefined" && window.CALLMATE_API_BASE) || "";

/** Stable API `code` → UI copy (do not use server message text). */
export const ERROR_MESSAGES = {
  invalid_credentials: "Неверный логин или пароль",
  auth_failed: "Неверный логин или пароль",
  rate_limited: "Слишком много попыток. Подождите немного",
  invalid_session: "Сессия устарела. Войдите снова",
  forbidden: "Нет доступа",
  account_locked: "Аккаунт заблокирован",
  company_locked: "Аккаунт заблокирован",
  insufficient_balance: "Недостаточно средств",
  gate_failed: "Пока нельзя начать: проверьте условия запуска",
  already_running: "Обзвон уже идёт",
  telephony_not_ready: "Сначала подключите телефонию",
  no_contacts: "Нет контактов для обзвона",
  schedule_missing: "Задайте расписание",
  unsupported_format: "Такой формат файла не подходит",
  file_too_large: "Файл слишком большой",
  missing_columns: "В файле не хватает нужных колонок",
  validation: "Проверьте поля",
  sip_auth_failed: "Не приняли логин или пароль. Проверьте данные",
  sip_network: "Нет связи с сервером телефонии. Проверьте адрес и сеть",
  sip_rejected: "Сервер телефонии отклонил подключение",
  sip_unknown: "Не удалось подключить телефонию. Попробуйте ещё раз",
  sip_unreachable: "Нет связи с сервером телефонии. Проверьте адрес и сеть",
  sip_invalid: "Не приняли логин или пароль. Проверьте данные",
  telephony_not_ready: "Сначала подключите телефонию",
  api_not_configured: "Сначала укажите адрес API",
  request_failed: "Что-то пошло не так. Попробуйте ещё раз",
  server: "Что-то пошло не так. Попробуйте ещё раз",
};

export function hasApi() {
  return Boolean(API_BASE);
}

export function errorMessage(code) {
  if (!code) return ERROR_MESSAGES.request_failed;
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (String(code).startsWith("sip_")) return ERROR_MESSAGES.sip_unknown;
  return ERROR_MESSAGES.request_failed;
}

function apiError(code, { details, status } = {}) {
  const err = new Error(code || "request_failed");
  err.code = code || "request_failed";
  err.details = details;
  err.status = status;
  return err;
}

async function readErrorBody(res) {
  let code = "request_failed";
  let details;
  try {
    const body = await res.json();
    if (body?.code) code = body.code;
    details = body?.details;
  } catch {
    /* ignore non-JSON */
  }
  return { code, details };
}

export async function login(loginName, password) {
  if (!API_BASE) {
    throw apiError("api_not_configured");
  }
  let res;
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginName, password }),
    });
  } catch {
    throw apiError("request_failed");
  }
  if (!res.ok) {
    const { code, details } = await readErrorBody(res);
    const mapped =
      res.status === 401 || code === "invalid_credentials" || code === "auth_failed"
        ? "invalid_credentials"
        : code === "request_failed"
          ? "server"
          : code;
    throw apiError(mapped, { details, status: res.status });
  }
  return res.json();
}

export async function logout(session) {
  if (!API_BASE || !session) return;
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
    });
  } catch {
    /* best-effort: local clear must still succeed if API is asleep/unreachable */
  }
}

export async function fetchSession(session) {
  if (!API_BASE) {
    throw apiError("api_not_configured");
  }
  return apiFetch("/api/auth/session", { session });
}

export async function apiFetch(path, { method = "GET", session, body, headers } = {}) {
  if (!API_BASE) {
    throw apiError("api_not_configured");
  }
  const hdrs = { ...(headers || {}) };
  if (session) hdrs.Authorization = `Bearer ${session}`;
  let payload = body;
  if (body && !(body instanceof FormData) && typeof body === "object") {
    hdrs["Content-Type"] = hdrs["Content-Type"] || "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers: hdrs, body: payload });
  } catch {
    throw apiError("request_failed");
  }
  if (!res.ok) {
    const { code, details } = await readErrorBody(res);
    throw apiError(code, { details, status: res.status });
  }
  if (res.status === 204) return null;
  const ctype = res.headers.get("Content-Type") || "";
  if (ctype.includes("application/json")) return res.json();
  return res;
}
