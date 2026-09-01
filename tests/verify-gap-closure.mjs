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
];

let failed = 0;
for (const [needle, tag] of checks) {
  if (!appJs.includes(needle)) {
    console.error(`FAIL ${tag}: missing ${needle}`);
    failed += 1;
  }
}

if (failed) {
  process.exit(1);
}

console.log(`verify-gap-closure: ${checks.length} checks OK`);
