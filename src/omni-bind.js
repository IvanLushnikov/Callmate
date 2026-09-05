/** Bind omnichannel forms. Thin client — no HQ contracts. */

import {
  saveOmniChannels,
  saveOmniWebhook,
  fetchOmniWebhookJournal,
  saveOmniKnowledgeText,
  publishOmniKnowledge,
  uploadOmniKnowledgeFile,
  unpublishOmniKnowledgeDoc,
  deleteOmniKnowledgeDoc,
  saveOmniInbound,
  connectOmniMessenger,
  verifyOmniMessenger,
  saveOmniCrm,
  acceptOmniDialog,
  closeOmniDialog,
  replyOmniDialog,
} from "./api.js";

export function bindOmniPages({ state, flash, errorMessage, render, hasApi }) {
  const session = state.session;
  bindChannels({ state, flash, errorMessage, render, session, hasApi });
  bindWebhook({ state, flash, errorMessage, render, session, hasApi });
  bindKnowledge({ state, flash, errorMessage, render, session, hasApi });
  bindInbound({ state, flash, errorMessage, render, session, hasApi });
  bindConnect({ state, flash, errorMessage, render, session, hasApi });
  bindCrm({ state, flash, errorMessage, render, session, hasApi });
  bindDialogs({ state, flash, errorMessage, render, session, hasApi });
}

function bindChannels({ state, flash, errorMessage, render, session, hasApi }) {
  const form = document.querySelector("[data-omni-channels]");
  if (!form) return;
  const dialog = document.querySelector("[data-omni-combine]");
  const messenger = form.elements.messenger;
  const voice = form.elements.voice_outbound;
  const policyBox = form.querySelector("[data-omni-policy]");
  const syncPolicy = () => {
    if (policyBox) policyBox.hidden = !(messenger?.checked && voice?.checked);
  };
  messenger?.addEventListener("change", syncPolicy);
  voice?.addEventListener("change", syncPolicy);
  syncPolicy();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (form.getAttribute("data-locked") === "1") return;
    const camp = state.activeCampaignId;
    if (!camp) return;
    const voiceOn = Boolean(voice?.checked);
    const chatOn = Boolean(messenger?.checked);
    const ack = form.elements.merge_accepted?.value === "1";
    if (voiceOn && chatOn && !ack) {
      dialog?.showModal?.();
      return;
    }
    if (!hasApi()) {
      flash("Каналы сохранены", "ok");
      return;
    }
    try {
      const body = {
        voice_outbound: voiceOn,
        voice_inbound: Boolean(form.elements.voice_inbound?.checked),
        messenger: chatOn,
        merge_accepted: ack,
        omnichannel_policy: form.elements.policy?.value || "off",
      };
      const saved = await saveOmniChannels(camp, body, session);
      state.omni.channelsByCampaign[camp] = saved;
      flash("Каналы сохранены", "ok");
      render();
    } catch (ex) {
      if (ex?.code === "combine_ack_required") {
        dialog?.showModal?.();
        return;
      }
      flash(errorMessage(ex?.code) || "Не удалось сохранить каналы. Попробуйте ещё раз.", "error");
    }
  });

  dialog?.querySelector("[data-combine-yes]")?.addEventListener("click", () => {
    if (form.elements.merge_accepted) form.elements.merge_accepted.value = "1";
    dialog.close();
    form.requestSubmit();
  });
  dialog?.querySelector("[data-combine-no]")?.addEventListener("click", () => {
    if (form.elements.merge_accepted) form.elements.merge_accepted.value = "";
    if (messenger) messenger.checked = false;
    dialog.close();
  });
  dialog?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    dialog.close();
  });
}

function bindWebhook({ flash, errorMessage, render, session, hasApi, state }) {
  const form = document.querySelector("[data-omni-webhook]");
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!hasApi()) {
      flash("Webhook сохранён", "ok");
      return;
    }
    try {
      const filter = [...form.querySelectorAll("input[name=filter]:checked")].map((el) => el.value);
      const payload = await saveOmniWebhook(
        {
          url: form.elements.url.value,
          secret: form.elements.secret.value,
          event_filter: filter,
          active: form.elements.active.checked,
        },
        session
      );
      form.elements.secret.value = "";
      const once = document.querySelector("[data-omni-secret-once]");
      if (once && payload.secret_once) {
        once.hidden = false;
        once.textContent = `Секрет (один раз): ${payload.secret_once}`;
      }
      state.omni.webhook = payload;
      state.omni.journal = (await fetchOmniWebhookJournal(session).catch(() => ({ items: [] }))).items || [];
      flash("Webhook сохранён", "ok");
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
  });
}

function bindKnowledge({ flash, errorMessage, render, session, hasApi, state }) {
  const form = document.querySelector("[data-omni-kb]");
  if (!form) return;
  const layer = document.querySelector("[data-kb-layer]")?.getAttribute("data-kb-layer") || "company";
  const campaignId = layer === "campaign" ? state.activeCampaignId : null;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!hasApi()) return;
    try {
      const file = form.elements.file?.files?.[0];
      if (file) {
        await uploadOmniKnowledgeFile({ file, piiAck: form.elements.pii.checked }, session, campaignId);
        form.elements.file.value = "";
      } else {
        await saveOmniKnowledgeText(
          { title: "note.txt", body: form.elements.text.value, pii_ack: form.elements.pii.checked },
          session,
          campaignId
        );
      }
      flash("Черновик сохранён. Робот это ещё не читает.", "ok");
      state.omni.loaded.knowledge = false;
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
  });
  document.querySelector("[data-kb-publish]")?.addEventListener("click", async () => {
    if (!hasApi()) return;
    try {
      await publishOmniKnowledge(session, campaignId);
      flash("Документ опубликован. Робот сможет на него опираться.", "ok");
      state.omni.loaded.knowledge = false;
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
  });
  document.querySelectorAll("[data-kb-unpublish]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!hasApi()) return;
      try {
        await unpublishOmniKnowledgeDoc(btn.getAttribute("data-kb-unpublish"), session, campaignId);
        flash("Документ снят с публикации", "ok");
        state.omni.loaded.knowledge = false;
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    });
  });
  document.querySelectorAll("[data-kb-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!hasApi()) return;
      try {
        await deleteOmniKnowledgeDoc(btn.getAttribute("data-kb-delete"), session, campaignId);
        flash("Документ удалён", "ok");
        state.omni.loaded.knowledge = false;
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    });
  });
}

function bindInbound({ flash, errorMessage, render, session, hasApi, state }) {
  const form = document.querySelector("[data-omni-inbound]");
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const camp = state.activeCampaignId;
    if (!hasApi() || !camp) return;
    try {
      const saved = await saveOmniInbound(
        camp,
        {
          did_number: form.elements.did.value,
          hours: { from: Number(form.elements.from.value), to: Number(form.elements.to.value) },
          forward_number: form.elements.forward.value,
          followup_after_inbound: Boolean(form.elements.followup?.checked),
        },
        session
      );
      state.omni.inboundByCampaign[camp] = saved;
      flash("Входящая линия сохранена", "ok");
      render();
    } catch (ex) {
      const box = document.querySelector("[data-omni-inbound-error]");
      const text =
        ex?.code === "inbound_number_bound"
          ? "Этот номер уже принимает другая кампания. Снимите его там или укажите другой."
          : errorMessage(ex?.code) || "Не удалось сохранить входящую линию.";
      if (box) {
        box.hidden = false;
        box.textContent = text;
      }
      flash(text, "error");
    }
  });
}

const MESSENGER_VERIFY_TEXT = {
  ok: "Мессенджер подключён и проверен",
  error: "Токен сохранён, но проверка связи не прошла. Перепроверьте его в кабинете мессенджера.",
  network_unreachable: "Токен сохранён. Проверить связь сейчас не удалось — сеть недоступна.",
  not_connected: "Мессенджер подключён",
};

function bindConnect({ flash, errorMessage, render, session, hasApi, state }) {
  const form = document.querySelector("[data-omni-connect]");
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!hasApi()) return;
    try {
      const tg = form.elements.telegram_token.value;
      const vk = form.elements.vk_token.value;
      const results = [];
      if (tg) {
        await connectOmniMessenger("telegram", { token: tg }, session);
        results.push(await verifyOmniMessenger("telegram", session).catch(() => ({ connection_status: "error" })));
      }
      if (vk) {
        await connectOmniMessenger("vk", { token: vk }, session);
        results.push(await verifyOmniMessenger("vk", session).catch(() => ({ connection_status: "error" })));
      }
      form.elements.telegram_token.value = "";
      form.elements.vk_token.value = "";
      state.omni.loaded.messengers = false;
      const worstStatus = results.map((r) => r.connection_status).find((s) => s !== "ok") || "ok";
      flash(MESSENGER_VERIFY_TEXT[worstStatus] || MESSENGER_VERIFY_TEXT.ok, worstStatus === "ok" ? "ok" : "error");
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code) || "Не удалось проверить мессенджер.", "error");
    }
  });
}

function bindCrm({ flash, errorMessage, render, session, hasApi, state }) {
  const form = document.querySelector("[data-omni-crm]");
  if (!form) return;
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!hasApi()) return;
    try {
      const saved = await saveOmniCrm({ preset_id: form.elements.preset.value, secret: form.elements.secret.value }, session);
      form.elements.secret.value = "";
      state.omni.crm = saved;
      flash("CRM сохранена", "ok");
      render();
    } catch (ex) {
      flash(errorMessage(ex?.code), "error");
    }
  });
}

function bindDialogs({ flash, errorMessage, render, session, hasApi }) {
  document.querySelectorAll("[data-dialog-accept]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!hasApi()) return;
      try {
        await acceptOmniDialog(btn.getAttribute("data-dialog-accept"), session);
        flash("Робот в этом чате больше не пишет.", "ok");
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    });
  });
  document.querySelectorAll("[data-dialog-close]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!hasApi()) return;
      try {
        await closeOmniDialog(btn.getAttribute("data-dialog-close"), session);
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    });
  });
  document.querySelectorAll("[data-dialog-reply]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!hasApi()) return;
      const text = window.prompt("Ответ");
      if (!text) return;
      try {
        await replyOmniDialog(btn.getAttribute("data-dialog-reply"), text, session);
        render();
      } catch (ex) {
        flash(errorMessage(ex?.code), "error");
      }
    });
  });
}
