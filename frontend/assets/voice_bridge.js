/*
 * Ponte Web Speech para a interface KOF.
 *
 * Fluxo: SpeechRecognition (pt-BR) -> evento input do KOF ->
 * ChatMessageRequest -> ChatReplyResponse -> SpeechSynthesis.
 * O token e a chamada HTTP continuam exclusivamente no cliente KOF; este
 * arquivo não lê nem armazena credenciais nem faz upload de áudio; o
 * reconhecimento segue a política e o mecanismo de fala do navegador.
 */
(() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const spokenReplies = new Set();
  let recognition = null;
  let listening = false;
  let speakNextReply = false;
  let authorization = "";
  let uploadingInvoice = false;
  let lastUploadKey = "";
  let lastUploadTime = 0;
  let pendingInvoiceItems = [];
  let pendingDocumentId = "";

  // A ponte carrega antes do modulo KOF e observa somente o cabecalho usado
  // nas chamadas same-origin. O token fica em memoria e nunca e persistido.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const options = init || {};
    const source = options.headers || (input instanceof Request ? input.headers : undefined);
    if (source) {
      const header = new Headers(source).get("Authorization");
      if (header) authorization = header;
    }
    return nativeFetch(input, init);
  };

  function mic() {
    return document.getElementById("chat-mic");
  }

  function setMicState(state) {
    const control = mic();
    if (!control) return;
    control.dataset.voiceState = state;
    control.setAttribute("aria-label", state === "listening" ? "Parar gravação de voz" : "Falar com Organiza AI");
    control.style.boxShadow = state === "listening" ? "0 0 0 4px rgba(0, 212, 255, .18)" : "none";
  }

  function unavailable(message) {
    const input = document.getElementById("chat-input");
    if (input) input.placeholder = message;
    setMicState("idle");
  }

  function sendTranscript(text) {
    const input = document.getElementById("chat-input");
    const form = document.getElementById("chat-form");
    if (!input || !form || !text) return;
    speakNextReply = true;
    input.value = text.trim();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }

  function handleVoiceTranscript(text) {
    if (!text) return;
    const parts = text.split(/\s+(?:e\s+também|e\s+mais|e\s+|também\s+|além\s+disso\s+|\n|;)\s*/i).filter(p => p.trim().length > 0);
    if (parts.length <= 1) {
      sendTranscript(text);
      return;
    }
    let i = 0;
    function dispatchNext() {
      if (i >= parts.length) return;
      let part = parts[i].trim();
      const firstLower = text.toLowerCase();
      if (!part.toLowerCase().startsWith("gastei") && !part.toLowerCase().startsWith("paguei") && !part.toLowerCase().startsWith("comprei")) {
        if (firstLower.startsWith("gastei")) part = "gastei " + part;
        else if (firstLower.startsWith("paguei")) part = "paguei " + part;
        else if (firstLower.startsWith("comprei")) part = "comprei " + part;
      }
      sendTranscript(part);
      i++;
      if (i < parts.length) {
        setTimeout(dispatchNext, 1200);
      }
    }
    dispatchNext();
  }

  function startRecognition() {
    const control = mic();
    if (!control || control.disabled || control.getAttribute("disabled") !== null) return;
    if (!Recognition) {
      unavailable("Seu navegador não oferece reconhecimento de voz.");
      return;
    }
    if (listening) {
      stopRecognition();
      return;
    }
    recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => {
      listening = true;
      setMicState("listening");
    };
    recognition.onresult = (event) => {
      const transcript = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
      handleVoiceTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        unavailable("Permita o microfone para falar com o Organiza AI.");
      } else if (event.error !== "aborted") {
        unavailable("Não consegui entender. Tente falar novamente.");
      }
    };
    recognition.onend = () => {
      listening = false;
      setMicState("idle");
    };
    recognition.start();
  }

  function speak(text) {
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function readNewAssistantReplies() {
    const replies = document.querySelectorAll('[id^="chat-assistant-msg-"]');
    replies.forEach((reply) => {
      const text = reply.textContent.trim();
      if (text && !spokenReplies.has(text)) {
        spokenReplies.add(text);
        if (speakNextReply) {
          speakNextReply = false;
          speak(text);
        }
      }
    });
  }

  function setAttachmentStatus(message, kind) {
    const form = document.getElementById("chat-form");
    if (!form || !form.parentElement) return;
    let status = document.getElementById("chat-attachment-status");
    if (!status) {
      status = document.createElement("div");
      status.id = "chat-attachment-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      status.style.fontSize = ".8125rem";
      status.style.padding = "0 8px";
      status.style.alignSelf = "flex-start";
      form.parentElement.appendChild(status);
    }
    status.style.color = kind === "error" ? "#FF4A6E" : kind === "success" ? "#00E5A0" : "#7B8EAD";
    status.textContent = message;
  }

  function fileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read"));
      reader.onload = () => {
        const encoded = String(reader.result || "");
        const comma = encoded.indexOf(",");
        resolve(comma >= 0 ? encoded.substring(comma + 1) : encoded);
      };
      reader.readAsDataURL(file);
    });
  }

  function showOcrThinking(show) {
    const existing = document.getElementById("chat-ocr-thinking");
    if (!show) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const list = document.getElementById("chat-messages");
    if (!list) return;
    const isLight = document.documentElement.dataset.theme === "light" || document.body.style.backgroundColor === "rgb(245, 247, 251)";
    const bubble = document.createElement("div");
    bubble.id = "chat-ocr-thinking";
    bubble.textContent = "... pensando";
    bubble.style.alignSelf = "flex-start";
    bubble.style.maxWidth = "74%";
    bubble.style.background = isLight ? "#E5E7EB" : "#1A1F3A";
    bubble.style.color = isLight ? "#6B7280" : "#7B8EAD";
    bubble.style.borderRadius = "20px 20px 20px 4px";
    bubble.style.padding = "18px 22px";
    bubble.style.fontSize = "1rem";
    bubble.style.lineHeight = "1.4em";
    bubble.style.fontStyle = "italic";
    bubble.style.margin = "0";
    bubble.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    list.insertBefore(bubble, list.firstChild);
  }

  function lastAssistantReplyText() {
    const replies = document.querySelectorAll('[id^="chat-assistant-msg-"]');
    if (!replies || replies.length === 0) return "";
    let latest = "";
    replies.forEach((el) => {
      const txt = (el.textContent || "").trim();
      if (txt) latest = txt;
    });
    return latest;
  }

  async function confirmPendingInvoiceIfNeeded(userText) {
    if (!pendingInvoiceItems || pendingInvoiceItems.length === 0) return;
    const msg = (userText || "").trim().toLowerCase();
    if (!msg) return;
    const isAffirmation = msg === "sim" || msg === "sim!" || msg.startsWith("sim ") || msg.startsWith("sim,") ||
      msg.includes("confirmo") || msg.includes("confirm") || msg.includes("pode salvar") ||
      msg.includes("organizar") || msg.includes("distribua") || msg.includes("despesas") ||
      msg.includes("70/20/10") || msg.includes("50/30/20") || msg === "ok";
    if (!isAffirmation) return;
    const lastReply = lastAssistantReplyText();
    const awaitingFinalSave = lastReply.includes("Antes de eu salvar nas suas caixinhas") ||
      lastReply.includes("distribua esses gastos na regra") ||
      lastReply.includes("Quer que eu distribua");
    if (!awaitingFinalSave) return;
    const items = pendingInvoiceItems;
    const docId = pendingDocumentId;
    pendingInvoiceItems = [];
    pendingDocumentId = "";
    if (!authorization && window.__kofAuthToken) {
      authorization = "Bearer " + window.__kofAuthToken;
    }
    const payload = docId ? { items, documentId: docId } : { items };
    await nativeFetch("/api/invoices/confirm", {
      method: "POST",
      headers: { "Authorization": authorization, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }

  async function uploadInvoice(file) {
    if (!file || uploadingInvoice) return;
    const uploadKey = `${file.name}:${file.size}`;
    const now = Date.now();
    if (uploadKey === lastUploadKey && (now - lastUploadTime) < 3000) return;

    const nameLower = file.name.toLowerCase();
    const isPdf = nameLower.endsWith(".pdf") || file.type === "application/pdf";
    const isImg = nameLower.endsWith(".jpeg") || nameLower.endsWith(".jpg") || nameLower.endsWith(".png") || file.type.startsWith("image/");
    const isDocx = nameLower.endsWith(".docx") || file.type.includes("wordprocessingml");
    if (!isPdf && !isImg && !isDocx) {
      setAttachmentStatus("Envie uma fatura ou extrato em PDF, PNG, JPEG ou DOCX.", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentStatus("O arquivo deve ter no máximo 10 MB.", "error");
      return;
    }
    if (!authorization) {
      authorization = window.__kofAuthToken ? ("Bearer " + window.__kofAuthToken) : authorization;
    }
    uploadingInvoice = true;
    lastUploadKey = uploadKey;
    lastUploadTime = now;
    const draftInput = document.getElementById("chat-input");
    const savedDraft = draftInput ? draftInput.value : "";
    const restoreDraft = () => {
      const field = document.getElementById("chat-input");
      if (!field) return;
      field.value = savedDraft;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setAttachmentStatus("... pensando", "loading");
    showOcrThinking(true);
    try {
      const fileBase64 = await fileAsBase64(file);
      const response = await nativeFetch("/api/invoices/parse", {
        method: "POST",
        headers: { "Authorization": authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, filename: file.name })
      });
      const payload = await response.json().catch(() => ({}));
      const status = String(payload.status || "");
      const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
      const extractionFailed = !response.ok || status === "EXTRACAO_FALHOU" || transactions.length === 0;

      if (response.status === 402 || response.status === 503) {
        pendingDocumentId = "";
        pendingInvoiceItems = [];
        showOcrThinking(false);
        restoreDraft();
        setAttachmentStatus(response.status === 402
          ? "Você atingiu o limite de mensagens deste mês."
          : "O serviço está indisponível no momento. Tente novamente em instantes.", "error");
        return;
      }

      if (extractionFailed) {
        pendingDocumentId = "";
        pendingInvoiceItems = [];
        showOcrThinking(false);
        setAttachmentStatus("", "idle");
        const input = document.getElementById("chat-input");
        const form = document.getElementById("chat-form");
        if (input && form) {
          input.value = `Arquivo ${file.name} enviado: falha na extração (0 lançamentos identificados).`;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          if (typeof form.requestSubmit === "function") form.requestSubmit();
          else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }

      pendingDocumentId = payload.documentId ? String(payload.documentId) : "";
      let totalAmount = 0;
      for (const t of transactions) {
        if (typeof t.amount === "number") totalAmount += t.amount;
      }
      pendingInvoiceItems = transactions.map(t => ({
        description: String(t.description || "Gasto").trim(),
        amount: Number(t.amount) || 0.01,
        category: String(t.category || "OTHER")
      }));

      const count = transactions.length;
      const countText = count === 1 ? "1 lançamento identificado" : `${count} lançamentos identificados`;
      const formattedTotal = totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      showOcrThinking(false);
      setAttachmentStatus("", "idle");

      const input = document.getElementById("chat-input");
      const form = document.getElementById("chat-form");
      if (input && form) {
        const msgText = `Fatura ${file.name} processada: ${countText} totalizando R$ ${formattedTotal}!`;
        input.value = msgText;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch (error) {
      showOcrThinking(false);
      restoreDraft();
      setAttachmentStatus(error.message || "Não foi possível analisar a fatura.", "error");
    } finally {
      uploadingInvoice = false;
    }
  }

  function chooseInvoice() {
    if (uploadingInvoice) return;
    const control = document.getElementById("chat-attach");
    if (!control || control.disabled || control.getAttribute("disabled") !== null) return;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = ".pdf,.jpeg,.jpg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    picker.hidden = true;
    picker.addEventListener("change", async () => {
      const selected = picker.files && picker.files[0];
      picker.remove();
      await uploadInvoice(selected);
    }, { once: true });
    document.body.appendChild(picker);
    picker.click();
  }

  document.addEventListener("submit", (event) => {
    const form = event.target && event.target.id === "chat-form" ? event.target : null;
    if (!form) return;
    const input = document.getElementById("chat-input");
    confirmPendingInvoiceIfNeeded(input ? input.value : "");
  }, true);

  document.addEventListener("click", (event) => {
    const voiceTarget = event.target.closest ? event.target.closest("#chat-mic") : null;
    if (voiceTarget) {
      event.preventDefault();
      event.stopPropagation();
      startRecognition();
      return;
    }
    const attachTarget = event.target.closest ? event.target.closest("#chat-attach") : null;
    if (attachTarget) {
      event.preventDefault();
      event.stopPropagation();
      chooseInvoice();
      return;
    }
    const sendTarget = event.target.closest ? event.target.closest("#chat-send") : null;
    if (sendTarget) {
      const input = document.getElementById("chat-input");
      confirmPendingInvoiceIfNeeded(input ? input.value : "");
    }
  }, true);

  new MutationObserver(readNewAssistantReplies).observe(document.documentElement, { childList: true, subtree: true });
})();
