import { login as apiLogin, logout as apiLogout } from "./api.js";

const state = {
  session: localStorage.getItem("cm_session") || "",
  role: localStorage.getItem("cm_role") || "",
  theme: localStorage.getItem("cm_theme") || "light",
  companyLocked: localStorage.getItem("cm_locked") === "1",
  // demo data for screens until live API lists are wired
  companies: JSON.parse(localStorage.getItem("cm_companies") || "null") || [],
  campaigns: JSON.parse(localStorage.getItem("cm_campaigns") || "null") || [],
};

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

function render() {
  setTheme(state.theme);
  const app = document.getElementById("app");
  const path = route();

  if (path.startsWith("/cabinet")) {
    if (!state.session || state.role !== "company") {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = cabinetShell(path);
    bindShell();
    return;
  }
  if (path.startsWith("/admin")) {
    if (!state.session || state.role !== "superadmin") {
      navigate("/forbidden");
      return;
    }
    app.innerHTML = adminShell(path);
    bindShell();
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

function themeControls() {
  return `<div class="theme-switch">
    <button class="btn secondary" data-theme-set="light" type="button">Светлая</button>
    <button class="btn secondary" data-theme-set="dark" type="button">Тёмная</button>
  </div>`;
}

function lockedBanner() {
  if (!state.companyLocked) return "";
  return `<div class="panel" style="margin-bottom:1rem;border-color:var(--danger)">
    <strong>Доступ ограничен</strong>
    <p class="hint">Можно смотреть. Создавать и менять кампании и запускать обзвон нельзя.</p>
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
      ${lockedBanner()}
      ${cabinetContent(path)}
    </main>
  </div>`;
}

function cabinetContent(path) {
  if (path.startsWith("/cabinet/telephony/sip")) {
    return `<div class="panel">
      <h2>SIP</h2>
      <label>Адрес</label><input id="sip-host" ${state.companyLocked ? "disabled" : ""} />
      <label>Логин</label><input id="sip-login" ${state.companyLocked ? "disabled" : ""} />
      <label>Пароль</label><input id="sip-password" type="password" ${state.companyLocked ? "disabled" : ""} />
      <p class="hint">Пароль сохраним, но снова не покажем</p>
      <button class="btn" type="button" ${state.companyLocked ? "disabled" : ""}>Сохранить</button>
      <button class="btn secondary" type="button" ${state.companyLocked ? "disabled" : ""}>Проверить подключение</button>
    </div>`;
  }
  if (path.startsWith("/cabinet/telephony")) {
    return `<div class="panel">
      <p>Подключите телефонию, чтобы звонить</p>
      <a class="btn" href="#/cabinet/telephony/sip" style="display:inline-block">Подключить SIP</a>
      <button class="btn secondary" type="button" ${state.companyLocked ? "disabled" : ""}>Подключить через Манго</button>
      <p class="hint" style="margin-top:1rem">Число линий</p>
    </div>`;
  }
  if (path.startsWith("/cabinet/statuses")) {
    return `<div class="panel" style="max-width:720px">
      <p>Пока нет звонков</p>
      <table style="width:100%;margin-top:1rem;border-collapse:collapse">
        <thead><tr><th align="left">Телефон</th><th align="left">Статус</th><th align="left">Имя</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>`;
  }
  if (path.startsWith("/cabinet/analytics")) {
    return `<div class="panel" style="max-width:720px">
      <div>Звонков: 0</div>
      <div>Средняя длительность: —</div>
      <div>Дошли до цели: 0</div>
      <div>Минуты: 0</div>
      <div>Стоимость: 0</div>
    </div>`;
  }
  if (path === "/cabinet/campaigns/new") {
    return `<form class="panel" id="new-campaign-form">
      <h2>Новая кампания</h2>
      <label>Название</label><input id="camp-name" ${state.companyLocked ? "disabled" : ""} />
      <label>Цель звонка</label><input id="camp-goal" ${state.companyLocked ? "disabled" : ""} />
      <p class="hint">К чему должен привести разговор</p>
      <label>Сведения</label><textarea id="camp-details" rows="4" style="width:100%" ${state.companyLocked ? "disabled" : ""}></textarea>
      <p class="hint">Что роботу знать о продукте и ситуации</p>
      <div class="error" id="camp-error" hidden></div>
      <button class="btn" type="submit" ${state.companyLocked ? "disabled" : ""}>Сохранить</button>
    </form>`;
  }
  // campaigns list
  if (!state.campaigns.length) {
    return `<div class="panel">
      <p>Создайте первую кампанию</p>
      <a class="btn" href="#/cabinet/campaigns/new" style="display:inline-block ${state.companyLocked ? ";pointer-events:none;opacity:.5" : ""}">Создать кампанию</a>
    </div>`;
  }
  const rows = state.campaigns
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name)}</td><td>${dialLabel(c.dial_state)}</td><td><a href="#/cabinet/campaigns/${c.id}">Открыть</a></td></tr>`
    )
    .join("");
  return `<div class="panel" style="max-width:720px">
    <a class="btn" href="#/cabinet/campaigns/new" style="display:inline-block ${state.companyLocked ? ";pointer-events:none;opacity:.5" : ""}">Создать кампанию</a>
    <table style="width:100%;margin-top:1rem;border-collapse:collapse">
      <thead><tr><th align="left">Кампании</th><th align="left">Состояние</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function dialLabel(stateName) {
  if (stateName === "running") return "Идёт обзвон";
  if (stateName === "stopped") return "Остановлен";
  if (stateName === "paused") return "На паузе";
  return "Черновик";
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
        <h1>${path.startsWith("/admin/settings") ? "Настройки продукта" : "Компании"}</h1>
        <button class="btn secondary" id="logout" type="button">Выйти</button>
      </div>
      ${adminContent(path)}
    </main>
  </div>`;
}

function adminContent(path) {
  if (path === "/admin/companies/new") {
    return `<form class="panel" id="new-company-form">
      <h2>Создать компанию</h2>
      <label>Название компании</label><input id="co-name" />
      <label>Логин</label><input id="co-login" />
      <label>Пароль</label><input id="co-password" type="password" />
      <div class="error" id="co-error" hidden></div>
      <p class="hint" id="co-ok" hidden>Компания создана</p>
      <button class="btn" type="submit">Создать</button>
    </form>`;
  }
  if (path.startsWith("/admin/settings")) {
    return `<div>
    <form class="panel" id="interval-form">
      <h2>Интервал подачи пачек</h2>
      <label>Интервал подачи пачек (секунды)</label>
      <input id="interval-sec" type="number" min="1" value="30" />
      <p class="hint">Клиенты компаний это значение не видят и не меняют</p>
      <p class="hint">Обычно 30 секунд</p>
      <div class="error" id="interval-error" hidden></div>
      <button class="btn" type="submit">Сохранить</button>
    </form>
    <form class="panel" id="default-tariff-form" style="margin-top:1rem">
      <h2>Тариф по умолчанию</h2>
      <label>Цена минуты для новых компаний</label>
      <input id="default-tariff" type="number" min="0" step="0.01" value="0" />
      <p class="hint">Подставится при создании компании. Потом можно сменить в карточке</p>
      <div class="error" id="tariff-error" hidden></div>
      <p class="hint" id="tariff-ok" hidden>Сохранено</p>
      <button class="btn" type="submit">Сохранить</button>
    </form>
    </div>`;
  }
  if (!state.companies.length) {
    return `<div class="panel">
      <p>Пока нет компаний</p>
      <a class="btn" href="#/admin/companies/new" style="display:inline-block">Создать компанию</a>
    </div>`;
  }
  const rows = state.companies
    .map((c) => {
      const access = c.access_status === "locked" ? "Выключена" : "Работает";
      const tariff = c.price_per_minute != null ? c.price_per_minute : "—";
      return `<tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${access}</td>
        <td>${escapeHtml(c.created_at || "")}</td>
        <td>Тариф за минуту: ${escapeHtml(String(tariff))}</td>
      </tr>`;
    })
    .join("");
  return `<div class="panel" style="max-width:800px">
    <a class="btn" href="#/admin/companies/new" style="display:inline-block">Создать компанию</a>
    <table style="width:100%;margin-top:1rem;border-collapse:collapse">
      <thead><tr><th align="left">Компания</th><th align="left">Доступ</th><th align="left">Создана</th><th align="left">Тариф</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function titleFor(path) {
  if (path.includes("telephony")) return "Телефония";
  if (path.includes("statuses")) return "Статусы";
  if (path.includes("analytics")) return "Аналитика";
  return "Кампании";
}

function loginView() {
  return `<div class="login-wrap">
    <form class="panel" id="login-form">
      <p class="brand">CallMate</p>
      <h1>Вход</h1>
      <label for="login">Логин</label>
      <input id="login" name="login" autocomplete="username" />
      <label for="password">Пароль</label>
      <input id="password" name="password" type="password" autocomplete="current-password" />
      <button class="btn" id="submit" type="submit">Войти</button>
      <div class="error" id="form-error" hidden></div>
      <p class="hint desktop-note">Удобнее на компьютере. Телефонную вёрстку сделаем позже</p>
    </form>
  </div>`;
}

function forbiddenView() {
  let action = `<button class="btn" id="forbidden-action" type="button">Войти</button>`;
  let target = "/login";
  if (state.session && state.role === "company") {
    action = `<button class="btn" id="forbidden-action" type="button">К кампаниям</button>`;
    target = "/cabinet/campaigns";
  } else if (state.session && state.role === "superadmin") {
    action = `<button class="btn" id="forbidden-action" type="button">К компаниям</button>`;
    target = "/admin/companies";
  }
  return `<div class="login-wrap"><div class="panel">
    <h1>Нет доступа</h1>
    <p>У вас нет доступа к этой странице</p>
    ${action}
    <button class="btn secondary" id="forbidden-logout" type="button">Выйти</button>
  </div></div>`;
}

function bindForbidden() {
  const btn = document.getElementById("forbidden-action");
  btn.onclick = () => {
    if (!state.session) navigate("/login");
    else if (state.role === "company") navigate("/cabinet/campaigns");
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
  const newCampaignForm = document.getElementById("new-campaign-form");
  if (newCampaignForm) {
    newCampaignForm.onsubmit = (e) => {
      e.preventDefault();
      if (state.companyLocked) return;
      const goal = document.getElementById("camp-goal").value.trim();
      const err = document.getElementById("camp-error");
      if (!goal) {
        err.hidden = false;
        err.textContent = "Опишите цель звонка";
        return;
      }
      state.campaigns.push({
        id: String(Date.now()),
        name: document.getElementById("camp-name").value.trim() || "Новая кампания",
        dial_state: "draft",
        goal,
        details: document.getElementById("camp-details").value,
      });
      localStorage.setItem("cm_campaigns", JSON.stringify(state.campaigns));
      navigate("/cabinet/campaigns");
    };
  }
  const intervalForm = document.getElementById("interval-form");
  if (intervalForm) {
    intervalForm.onsubmit = (e) => {
      e.preventDefault();
      const v = Number(document.getElementById("interval-sec").value);
      const err = document.getElementById("interval-error");
      if (!Number.isFinite(v) || v < 1) {
        err.hidden = false;
        err.textContent = "Укажите число не меньше 1";
        return;
      }
      err.hidden = true;
      localStorage.setItem("cm_interval", String(v));
    };
  }
  const createCompany = document.getElementById("create-company");
  if (createCompany) {
    createCompany.onclick = () => navigate("/admin/companies/new");
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
        name,
        login,
        access_status: "active",
        created_at: new Date().toISOString().slice(0, 10),
        price_per_minute: Number(localStorage.getItem("cm_default_tariff") || 0),
      });
      localStorage.setItem("cm_companies", JSON.stringify(state.companies));
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
}

function clearSession() {
  state.session = "";
  state.role = "";
  state.companyLocked = false;
  localStorage.removeItem("cm_session");
  localStorage.removeItem("cm_role");
  localStorage.removeItem("cm_locked");
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
    } catch (ex) {
      document.getElementById("password").value = "";
      err.hidden = false;
      err.textContent = "Неверный логин или пароль";
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
