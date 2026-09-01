#!/usr/bin/env node
/**
 * Static gap-closure checks for Scorix cabinet (US-078, US-238, US-243).
 * Run: node tests/verify-gap-closure.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appJs = readFileSync(join(root, "src", "app.js"), "utf8");

const checks = [
  ["save-rebuild-backdrop", "US-078"],
  ["save-rebuild-cancel", "US-078"],
  ["save-rebuild-yes", "US-078"],
  ["Пересобрать сценарий?", "US-078"],
  ["saveRebuildOpen", "US-078"],
  ["CONTACT_UPLOAD_CHUNK_SIZE", "US-238"],
  ["uploadContactsInChunks", "US-238"],
  ["upload-progress-bar", "US-238"],
  ["upload-batch-hint", "US-238"],
  ["upload-cancel", "US-238"],
  ["speed-promise-banner", "US-243"],
  ["data-us243-proxy", "US-243"],
  ["Запуск за день", "US-243"],
  ["speedPromiseBannerHtml", "US-243"],
  ["refreshCampaignAnalytics", "W2-dial"],
  ["mapAnalyticsSummary", "W2-dial"],
  ["await refreshCampaignDialState(camp)", "W2-dial"],
  ["res.dial_state ||", "W2-dial-absent"],
  ["dialModeBannerHtml", "W3-stub-live"],
  ["runtimeModeBadgeHtml", "W3-stub-live"],
  ["refreshRuntime", "W3-stub-live"],
  ["/api/cabinet/runtime", "W3-stub-live"],
  ["data-testid=\"dial-mode-banner\"", "W3-stub-live"],
  ["Лабораторный режим", "W3-stub-live"],
  ["analyticsCostFromSummary", "W4-analytics"],
  ["refreshAllCampaignAnalytics", "W4-analytics"],
  ["minutes * state.companyTariff", "W4-analytics-absent"],
];

let failed = 0;
for (const [needle, tag] of checks) {
  if (tag === "W2-dial-absent" || tag === "W4-analytics-absent") {
    if (appJs.includes(needle)) {
      console.error(`FAIL ${tag}: stale local fallback still present (${needle})`);
      failed += 1;
    }
    continue;
  }
  if (!appJs.includes(needle)) {
    console.error(`FAIL ${tag}: missing ${needle}`);
    failed += 1;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`verify-gap-closure: ${checks.length} checks OK`);
