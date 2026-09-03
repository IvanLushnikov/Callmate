/**
 * Unit-ish checks for /lk base path helpers (run in node via dynamic import of logic mirror).
 * Kept as plain node script so CI without browser still guards pathname contract.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = readFileSync(join(root, "src/app.js"), "utf8");
const index = readFileSync(join(root, "index.html"), "utf8");

assert.match(app, /function cabinetBasePath\(/);
assert.match(app, /function cabinetAbsoluteUrl\(/);
assert.match(app, /SCORIX_BASE_PATH/);
assert.match(app, /cabinetAbsoluteUrl\(`/);
assert.match(index, /SCORIX_BASE_PATH/);
assert.match(index, /\/lk/);

console.log("base-path-contract ok");
