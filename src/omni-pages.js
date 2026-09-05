/** Omnichannel cabinet pages. Copy from New handoff OC-E0…E4. No secrets. */

export const COMBINE_WARNING =
  "Общий сценарий на звонок и чат. Роботу нужно больше контекста: что говорить в трубке и что писать в мессенджере. Допишите оба канала, иначе в одном из них он потеряется.";

export function pageConnections({ sipDead = false, messengers = null } = {}) {
  const providers = messengers?.providers || [];
  const tg = providers.find((p) => p.kind === "telegram");
  const vk = providers.find((p) => p.kind === "vk");
  return `
    <section class="desk-page" data-omni-page="connections">
      <h1>Подключения</h1>
      <p class="hint">Телефония компании, мессенджеры и входящая линия. Это не рассылка — только проверка связи.</p>
      ${sipDead ? `<p class="banner error" data-inbound-sip-banner>Входящая линия SIP не поднялась. Исходящий обзвон на том же транке своими правилами.</p>` : ""}
      <h2>Телефония</h2>
      <p class="hint">Исходящий SIP — ниже. Входящая линия настраивается в кампании.</p>
      <h2>Мессенджеры</h2>
      <p class="hint">Вставьте токен из кабинета мессенджера. Токен сохраним, но снова не покажем.</p>
      <form data-omni-connect>
        <label>Telegram-бот, токен<input name="telegram_token" type="password" autocomplete="off" placeholder="${tg?.connected ? "подключён" : ""}"></label>
        <label>VK, ключ сообщества<input name="vk_token" type="password" autocomplete="off" placeholder="${vk?.connected ? "подключён" : ""}"></label>
        <button type="submit" class="btn">Проверить и подключить</button>
      </form>
      <p class="hint">WhatsApp — заготовка, включить как рабочий нельзя.</p>
      <button type="button" class="btn ghost" disabled data-wa-stub>WhatsApp (скоро)</button>
    </section>`;
}

export function pageWebhook({ hook = null, journal = [] } = {}) {
  const rows = (journal || [])
    .map(
      (j) =>
        `<tr><td>${escape(j.time || j.event_id || "")}</td><td>${escape(j.event || j.event_id || "")}</td><td>${escape(String(j.http_status || ""))}</td><td>${escape(String(j.attempt || j.retried || ""))}</td></tr>`
    )
    .join("");
  const recent = (journal || []).slice(-5);
  const deliveryFailing = recent.length > 0 && recent.every((j) => j.status === "failed" || j.status === "exhausted");
  return `
    <section class="desk-page" data-omni-page="webhook">
      <h1>Webhook</h1>
      ${deliveryFailing ? `<p class="banner error" data-webhook-fail-banner>Последние доставки не проходят. Откройте журнал.</p>` : ""}
      <form data-omni-webhook>
        <label>HTTPS URL<input name="url" type="url" required value="${escape(hook?.url || "")}"></label>
        <label>Секрет HMAC<input name="secret" type="password" autocomplete="new-password" placeholder="${hook?.has_secret ? "сохранён" : ""}"></label>
        <p class="hint">Секрет покажем один раз. После сохранения поле пустое.</p>
        <p class="once-secret" data-omni-secret-once hidden></p>
        <fieldset>
          <legend>Какие события слать</legend>
          <label><input type="checkbox" name="filter" value="outbound.member.completed_topics"> Звонок завершён</label>
          <label><input type="checkbox" name="filter" value="outbound.member.no_answer"> Недозвон</label>
          <label><input type="checkbox" name="filter" value="messenger.bot.replied"> Сообщение в чате</label>
          <label><input type="checkbox" name="filter" value="handoff.opened"> Передали человеку</label>
          <label><input type="checkbox" name="filter" value="messenger.awaiting_handoff"> Оператор не взял</label>
          <label><input type="checkbox" name="filter" value="inbound.missed_offhours"> Входящий вне часов</label>
          <label><input type="checkbox" name="filter" value="inbound.forwarded"> Переадресация</label>
        </fieldset>
        <label><input type="checkbox" name="active" ${hook?.active === false ? "" : "checked"}> Включить доставку</label>
        <button type="submit" class="btn">Сохранить</button>
      </form>
      <h2>Журнал</h2>
      <table data-omni-journal>
        <thead><tr><th>Время</th><th>Событие</th><th>HTTP</th><th>Повтор</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="hint">Пока нет доставок.</td></tr>`}</tbody>
      </table>
    </section>`;
}

export function pageUsage({ usage = null } = {}) {
  const u = usage || {};
  const kb = u.knowledge || {};
  const used = kb.used_mb ?? Math.round((kb.used_bytes || u.knowledge_bytes || 0) / (1024 * 1024));
  const limit = kb.limit_mb ?? 500;
  return `
    <section class="desk-page" data-omni-page="usage">
      <h1>Использование</h1>
      <ul data-omni-usage>
        <li>Исходящие, мин: ${u.outbound_minutes ?? 0}</li>
        <li>Входящие, мин: ${u.inbound_minutes ?? 0}</li>
        <li>Сообщения бота: ${u.bot_dialogs ?? 0}</li>
        <li>База знаний: ${used} из ${limit} МБ</li>
      </ul>
      <p class="hint">Квота знаний — не «Недостаточно средств». Цен здесь нет.</p>
    </section>`;
}

export function pageKnowledge({ layer = "company", knowledge = null } = {}) {
  const title = layer === "company" ? "База знаний" : "База этой кампании";
  const used = knowledge?.used_mb ?? 0;
  const limit = knowledge?.limit_mb ?? 500;
  const items = knowledge?.items || [];
  const full = used >= limit;
  const list = items
    .map((it) => {
      const badge = it.state === "draft" ? `<span class="badge">Черновик · Робот это ещё не читает</span>` : escape(it.published_at || "опубликовано");
      const action =
        it.state === "draft"
          ? `<button type="button" class="btn ghost" data-kb-delete="${escape(it.id)}">Удалить</button>`
          : `<button type="button" class="btn ghost" data-kb-unpublish="${escape(it.id)}">Снять с публикации</button>`;
      return `<li data-doc="${escape(it.id)}">${escape(it.name)} — ${badge} ${action}</li>`;
    })
    .join("");
  return `
    <section class="desk-page" data-omni-page="knowledge" data-kb-layer="${layer}">
      <h1>${title}</h1>
      <p data-kb-quota>Занято ${used} из ${limit} МБ</p>
      <p class="hint">${layer === "company" ? "Общие документы компании. Робот берёт их вместе с базой кампании." : "Документы этой кампании. Если факт спорит с общей базой — берём этот слой."}</p>
      <p class="hint">Черновик робот ещё не читает. Публикуйте вручную.</p>
      ${items.length ? `<ul data-kb-list>${list}</ul>` : `<p class="hint">Пока нет документов. Загрузите файл или напишите текст.</p>`}
      <form data-omni-kb>
        <textarea name="text" placeholder="Напишите текст…"></textarea>
        <label>Файл (.txt, .md, .csv, .json)<input type="file" name="file" accept=".txt,.md,.csv,.json"></label>
        <label><input type="checkbox" name="pii"> В индекс попадёт текст файла, включая личные данные, если они там есть.</label>
        <p class="hint">Робот читает опубликованные файлы. Не кладите сюда то, чего не должно быть в ответах.</p>
        <button type="submit" class="btn" ${full ? "disabled" : ""}>Загрузить</button>
        <button type="button" class="btn secondary" data-kb-publish ${full ? "disabled" : ""}>Опубликовать</button>
      </form>
    </section>`;
}

export function pageDialogs({ items = [], empty = true } = {}) {
  const rows = (items || [])
    .map(
      (it) => `<article class="panel" data-dialog="${escape(it.id)}">
        <p>${escape(it.phone_masked || it.contact_masked || "")} · ${escape(it.channel_kind || it.channel || "")}</p>
        <p class="hint">${escape(it.preview || "")}</p>
        <p class="hint">${it.status === "accepted" ? "Робот в этом чате больше не пишет." : ""}</p>
        <button type="button" class="btn" data-dialog-accept="${escape(it.id)}">Принять</button>
        <button type="button" class="btn secondary" data-dialog-reply="${escape(it.id)}">Ответить</button>
        <button type="button" class="btn ghost" data-dialog-close="${escape(it.id)}">Закрыть</button>
      </article>`
    )
    .join("");
  return `
    <section class="desk-page" data-omni-page="dialogs">
      <h1>Диалоги</h1>
      ${empty && !rows ? `<p class="hint">Пока нет диалогов.</p>` : ""}
      <div data-omni-inbox>${rows}</div>
    </section>`;
}

export function pageCrm({ crm = null } = {}) {
  const preset = crm?.preset_id || "none";
  return `
    <section class="desk-page" data-omni-page="crm">
      <h1>CRM</h1>
      <p class="hint">Каркас: мы пишем к вам, не наоборот. Не витрина «все CRM».</p>
      <p class="hint">${crm?.connected ? "Подключено" : "Не подключено"}</p>
      <form data-omni-crm>
        <label>Заготовка
          <select name="preset">
            <option value="none" ${preset === "none" ? "selected" : ""}>Не подключать</option>
            <option value="bitrix24" ${preset === "bitrix24" ? "selected" : ""}>Битрикс24</option>
            <option value="amocrm" ${preset === "amocrm" ? "selected" : ""}>amoCRM</option>
            <option value="salesforce" ${preset === "salesforce" ? "selected" : ""}>Salesforce</option>
            <option value="hubspot" ${preset === "hubspot" ? "selected" : ""}>HubSpot</option>
            <option value="zoho_crm" ${preset === "zoho_crm" ? "selected" : ""}>Zoho CRM</option>
            <option value="pipedrive" ${preset === "pipedrive" ? "selected" : ""}>Pipedrive</option>
            <option value="megaplan" ${preset === "megaplan" ? "selected" : ""}>Мегаплан</option>
            <option value="retailcrm" ${preset === "retailcrm" ? "selected" : ""}>RetailCRM</option>
            <option value="dynamics365" ${preset === "dynamics365" ? "selected" : ""}>Microsoft Dynamics 365 Sales</option>
            <option value="custom_rest" ${preset === "custom_rest" ? "selected" : ""}>Свой REST / webhook</option>
          </select>
        </label>
        <label>Ключ<input name="secret" type="password" autocomplete="off"></label>
        <button type="submit" class="btn">Подключить</button>
      </form>
    </section>`;
}

export function pageInboundLine({ line = null, report = [], campaignSync = false } = {}) {
  const hours = line?.hours || {};
  const rows = (report || [])
    .map((r) => `<tr><td>${escape(r.phone_masked || "")}</td><td>${escape(r.label || r.inbound_result || "")}</td></tr>`)
    .join("");
  return `
    <section class="desk-page" data-omni-page="inbound">
      <h1>Входящая линия</h1>
      <p class="hint">Очереди нет: занято или перевод, без «вы N-й».</p>
      <p class="hint">Укажите номер, часы и что делать вне часов.</p>
      <form data-omni-inbound>
        <label>Номер, на который звонят<input name="did" required value="${escape(line?.did_number || "")}"></label>
        <label>Часы с<input name="from" type="number" value="${escape(hours.from ?? "")}"> до <input name="to" type="number" value="${escape(hours.to ?? "")}"></label>
        <label>Переадресация вне часов<input name="forward" value="${escape(line?.forward_number || "")}"></label>
        <label><input type="checkbox" name="followup" ${line?.followup_after_inbound ? "checked" : ""}> После входящего написать в мессенджер</label>
        <p class="hint">Не пишем, если уже перевели на человека.</p>
        <button type="submit" class="btn">Сохранить</button>
      </form>
      <p class="omni-inbound-error" data-omni-inbound-error hidden></p>
      ${campaignSync ? `<label><input type="checkbox" data-crm-sync> Писать в CRM по этой кампании</label>` : ""}
      <h2>Входящие</h2>
      ${rows ? `<table><thead><tr><th>Контакт</th><th>Исход</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="hint">Пока нет данных. Запустите кампанию или смените вкладку.</p>`}
    </section>`;
}

export function blockChannels({ connected = {}, locked = false, policy = "off", mergeAccepted = false } = {}) {
  const dis = (kind) => (connected[kind] ? "" : "disabled");
  const checked = (kind) => (connected[kind] && connected[`${kind}_on`] ? "checked" : "");
  const showPolicy = connected.messenger && connected.voice_outbound;
  return `
    <section class="workspace-tab-panel" data-tab="channels" data-omni-page="channels">
      <h2>Каналы</h2>
      <p class="hint">Выберите, чем кампания достаёт человека: звонок, чат или оба.</p>
      <form data-omni-channels ${locked ? "data-locked=1" : ""}>
        <label><input type="checkbox" name="voice_outbound" ${dis("voice_outbound")} ${checked("voice_outbound")}> Телефония — исходящие</label>
        <label><input type="checkbox" name="voice_inbound" ${dis("voice_inbound")} ${checked("voice_inbound")}> Телефония — входящие</label>
        <label><input type="checkbox" name="messenger" ${dis("messenger")} ${checked("messenger")}> Мессенджеры</label>
        ${connected.messenger ? "" : `<p class="hint">Сначала подключите в разделе Подключения</p>`}
        <fieldset data-omni-policy ${showPolicy ? "" : "hidden"}>
          <legend>Когда писать в мессенджер</legend>
          <label><input type="radio" name="policy" value="on_no_answer" ${policy === "on_no_answer" ? "checked" : ""}> Писать, только если не ответили</label>
          <p class="hint">Напишем, только если до человека не дозвонились. Нужен сценарий чата.</p>
          <label><input type="radio" name="policy" value="always" ${policy === "always" ? "checked" : ""}> Всегда писать в мессенджер</label>
          <p class="hint">После звонка напишем в мессенджер — даже если поговорили.</p>
        </fieldset>
        <input type="hidden" name="merge_accepted" value="${mergeAccepted ? "1" : ""}">
        <button type="submit" class="btn" ${locked ? "disabled" : ""}>Сохранить</button>
      </form>
      ${locked ? `<p class="hint">Каналы и сценарий после запуска только смотреть. Новую склейку — новой кампанией.</p>` : ""}
      <dialog data-omni-combine>
        <p>${COMBINE_WARNING}</p>
        <button type="button" data-combine-yes>Объединить</button>
        <button type="button" data-combine-no>Оставить раздельно</button>
      </dialog>
    </section>`;
}

export function pageChatReport({ rows = [] } = {}) {
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escape(r.phone_masked || "")}</td><td>${escape(r.column_label || r.column || "")}</td><td>${escape(r.outbound_status || "")}</td></tr>`
    )
    .join("");
  return `<div class="workspace-tab-panel" data-tab="chat" data-omni-page="chat">
    <h2>Чат</h2>
    <p class="hint">Колонка чата: ответил робот · передали · оператор не взял · нет канала. Не новый статус обзвона.</p>
    ${body ? `<table><thead><tr><th>Контакт</th><th>Чат</th><th>Исходящий</th></tr></thead><tbody>${body}</tbody></table>` : `<p class="hint">Пока нет данных. Запустите кампанию или смените вкладку.</p>`}
  </div>`;
}

export function contactCardBlocks({ outbound = "", inbound = "", chat = "" } = {}) {
  return `
    <section data-contact-card>
      <h3>Исходящий обзвон</h3>
      <p data-outbound-status>${escape(outbound)}</p>
      <h3>Входящие</h3>
      <p data-inbound-status>${escape(inbound)}</p>
      <h3>Чат</h3>
      <p data-messenger-status>${escape(chat)}</p>
    </section>`;
}

export function campaignKnowledgeBlock(knowledge) {
  return pageKnowledge({ layer: "campaign", knowledge });
}

function escape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
