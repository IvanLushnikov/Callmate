/**
 * Guard omnichannel cabinet copy and public-safety (no HQ secrets).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pages = readFileSync(join(root, "src/omni-pages.js"), "utf8");
const app = readFileSync(join(root, "src/app.js"), "utf8");
const bind = readFileSync(join(root, "src/omni-bind.js"), "utf8");
const api = readFileSync(join(root, "src/api.js"), "utf8");

const COMBINE =
  "Общий сценарий на звонок и чат. Роботу нужно больше контекста: что говорить в трубке и что писать в мессенджере. Допишите оба канала, иначе в одном из них он потеряется.";

assert.ok(pages.includes(COMBINE), "combine warning verbatim");
assert.match(pages, /Объединить/);
assert.match(pages, /Оставить раздельно/);
assert.match(pages, /WhatsApp \(скоро\)/);
assert.match(pages, /Пока нет диалогов/);
assert.match(pages, /Занято/);
assert.match(pages, /Робот это ещё не читает/);
assert.doesNotMatch(pages, /HarpGit|sip_password|goal_verdicts/);
assert.match(app, /Подключения/);
assert.match(app, /База знаний/);
assert.match(app, /#\/cabinet\/connections/);
assert.match(app, /bindOmniPages/);
assert.match(bind, /data-combine-yes/);
assert.match(bind, /combine_ack_required/);
assert.match(api, /\/api\/cabinet\/webhook/);
assert.match(api, /\/api\/cabinet\/knowledge/);
assert.match(api, /\/api\/cabinet\/messengers/);
assert.match(api, /\/api\/cabinet\/crm/);
assert.doesNotMatch(app, /пункт кампании.*Телефония/);

console.log("omni-pages-contract ok");
