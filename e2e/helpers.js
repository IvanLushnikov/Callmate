/** Offline stub: no API, seeded cabinet session + one campaign with contacts. */

export const SMOKE_CAMPAIGN_ID = "camp-smoke-1";

const SMOKE_CAMPAIGN = {
  id: SMOKE_CAMPAIGN_ID,
  name: "Smoke кампания",
  goal: "Проверить статусы и контакты",
  details: "Достаточно длинные сведения для smoke-сценария",
  dial_state: "draft",
  contacts: [
    {
      id: "ct-1",
      phone: "+79001110001",
      name: "Алексей",
      status: "в_процессе",
    },
    {
      id: "ct-2",
      phone: "+79001110002",
      name: "Мария",
      status: "завершённые_темы",
    },
    {
      id: "ct-3",
      phone: "+79001110003",
      name: "Игорь",
      status: "недозвон",
    },
  ],
  schedule: {
    days: ["mon", "tue", "wed", "thu", "fri"],
    from: "10:00",
    to: "18:00",
    tz: "Europe/Moscow",
  },
  retries: 2,
};

/**
 * Disable CALLMATE_API_BASE (index.html would otherwise set it on localhost)
 * and seed localStorage before app.js boots.
 */
export async function stubCabinet(page, { campaign = SMOKE_CAMPAIGN } = {}) {
  await page.addInitScript(
    ({ camp }) => {
      Object.defineProperty(window, "CALLMATE_API_BASE", {
        configurable: true,
        get() {
          return "";
        },
        set() {},
      });
      localStorage.setItem("cm_session", "smoke-session");
      localStorage.setItem("cm_role", "company");
      localStorage.setItem("cm_locked", "0");
      localStorage.setItem("cm_co_balance", "500");
      localStorage.setItem("cm_co_tariff", "5");
      localStorage.setItem("cm_campaigns", JSON.stringify([camp]));
      localStorage.setItem("cm_active_campaign", camp.id);
    },
    { camp: campaign }
  );
}

export async function gotoHash(page, hashPath) {
  const path = hashPath.startsWith("#") ? hashPath : `#${hashPath}`;
  await page.goto(`/${path}`);
  await page.waitForFunction(() => {
    const app = document.getElementById("app");
    return Boolean(app && app.childElementCount > 0);
  });
}
