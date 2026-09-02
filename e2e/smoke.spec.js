import { test, expect } from "@playwright/test";
import { stubCabinet, gotoHash, SMOKE_CAMPAIGN_ID } from "./helpers.js";

test.describe("Scorix cabinet smoke (offline stub)", () => {
  test("login screen renders brand and form", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SCORIX_API_BASE", {
        configurable: true,
        get() {
          return "";
        },
        set() {},
      });
      localStorage.clear();
    });
    await page.goto("/");
    await expect(page.locator("#login-form")).toBeVisible();
    await expect(page.getByTestId("login-panel")).toBeVisible();
    await expect(page.getByText("Scorix").first()).toBeVisible();
    await expect(page.locator("#login")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#submit")).toBeVisible();
    await expect(page.getByTestId("register-link")).toBeVisible();
  });

  test("register screen renders form", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SCORIX_API_BASE", {
        configurable: true,
        get() {
          return "";
        },
        set() {},
      });
      localStorage.clear();
    });
    await gotoHash(page, "/register");
    await expect(page.getByTestId("register-panel")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Создать аккаунт" })).toBeVisible();
    await expect(page.locator("#reg-name")).toBeVisible();
    await expect(page.locator("#reg-email")).toBeVisible();
  });

  test("campaigns list shows seeded campaign and status", async ({ page }) => {
    await stubCabinet(page);
    await gotoHash(page, "/cabinet/campaigns");
    await expect(page.locator("#sec-campaign")).toBeVisible();
    await expect(page.getByTestId("campaigns-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Кампании" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Smoke кампания" })).toBeVisible();
    await expect(page.locator(".status-badge").first()).toBeVisible();
    await expect(page.locator(".camp-count").getByText("3 контакта")).toBeVisible();
  });

  test("campaign workspace contacts + status filters", async ({ page }) => {
    await stubCabinet(page);
    await gotoHash(page, `/cabinet/campaigns/${SMOKE_CAMPAIGN_ID}`);
    await expect(page.getByTestId("workspace-tabs")).toBeVisible();

    await page.locator('[data-workspace-tab="contacts"]').click();
    await expect(page.getByTestId("contacts-panel")).toBeVisible();
    await expect(page.getByTestId("contact-status-filters")).toBeVisible();
    await expect(page.locator("#contacts-table")).toBeVisible();
    await expect(page.locator("[data-testid='contact-status-badge']")).toHaveCount(3);

    await page.locator('[data-contact-filter="done"]').click();
    await expect(page.locator("[data-testid='contact-status-badge']")).toHaveCount(1);
    await expect(page.getByText("Мария")).toBeVisible();
  });

  test("tariffs / billing page shows balance and packages", async ({ page }) => {
    await stubCabinet(page);
    await gotoHash(page, "/cabinet/tariffs");
    await expect(page.locator("#sec-tariffs")).toBeVisible();
    await expect(page.getByTestId("tariffs-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Биллинг" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Пакеты минут" })).toBeVisible();
    await expect(page.locator(".tariff-table")).toBeVisible();
    await expect(page.locator(".tariff-row-current")).toBeVisible();
    await expect(page.locator(".desk-stat-value").filter({ hasText: "500 ₽" }).first()).toBeVisible();
  });

  test("nav reaches campaigns and tariffs without integrations admin", async ({ page }) => {
    await stubCabinet(page);
    await gotoHash(page, "/cabinet/campaigns");
    await page.getByRole("link", { name: "Биллинг" }).click();
    await expect(page).toHaveURL(/#\/cabinet\/tariffs/);
    await expect(page.locator("#sec-tariffs")).toBeVisible();

    await page.getByRole("link", { name: "Кампании" }).click();
    await expect(page).toHaveURL(/#\/cabinet\/campaigns/);
    await expect(page.locator("#sec-campaign")).toBeVisible();

    // Smoke stays on company cabinet — no admin Integrations screen.
    await expect(page.locator("#sec-admin-integrations")).toHaveCount(0);
  });
});
