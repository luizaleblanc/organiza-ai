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
  let pendingCreditItems = [];
  let pendingDocumentId = "";
  // documentId anexado (uma vez) a proxima mensagem do chat apos um upload: o backend responde
  // pela intencao ANALISAR_FATURA, deterministica, em vez do LLM.
  let chatDocumentIdOnce = "";
  // source anexado (uma vez) a proxima mensagem do chat quando originada por voz ("VOICE").
  let chatSourceOnce = null;

  function emitDataChanged(reason) {
    try {
      window.dispatchEvent(new CustomEvent("organiza:data-changed", { detail: { reason: reason || "update" } }));
    } catch (_) {
      window.dispatchEvent(new Event("organiza:data-changed"));
    }
  }

  function clearPendingInvoice() {
    pendingInvoiceItems = [];
    pendingCreditItems = [];
    pendingDocumentId = "";
  }

  // A ponte carrega antes do modulo KOF e observa somente o cabecalho usado
  // nas chamadas same-origin. O token fica em memoria e nunca e persistido.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const options = init || {};
    const headerSource = options.headers || (input instanceof Request ? input.headers : undefined);
    if (headerSource) {
      const header = new Headers(headerSource).get("Authorization");
      if (header) authorization = header;
    }
    const url = typeof input === "string" ? input : (input instanceof Request ? input.url : String(input));
    const method = String(options.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isChatMessage = method === "POST" && (url.endsWith("/api/chat/message") || url.includes("/api/chat/message?")) && typeof options.body === "string";
    if (isChatMessage) {
      let nextInit = init;
      let usedVoice = false;
      if (chatDocumentIdOnce || chatSourceOnce) {
        try {
          const parsed = JSON.parse(options.body);
          if (parsed && typeof parsed.message === "string") {
            if (chatDocumentIdOnce) {
              parsed.documentId = chatDocumentIdOnce;
              chatDocumentIdOnce = "";
            }
            if (chatSourceOnce) {
              parsed.source = chatSourceOnce;
              usedVoice = chatSourceOnce === "VOICE";
              chatSourceOnce = null;
            }
            nextInit = Object.assign({}, options, { body: JSON.stringify(parsed) });
          }
        } catch (_) { /* corpo nao-JSON segue intacto */ }
      }
      return nativeFetch(input, nextInit).then((response) => {
        if (response && response.ok) {
          if (usedVoice) {
            emitDataChanged("voice-chat");
          }
          response.clone().json().then((data) => {
            const replyText = data && typeof data.reply === "string" ? data.reply.toLowerCase() : "";
            if (replyText && (
              replyText.includes("salvei seus lançamentos") ||
              replyText.includes("salvei nas suas caixinhas") ||
              replyText.includes("confirmado:") ||
              replyText.includes("estao salvos nas suas caixinhas") ||
              replyText.includes("estão salvos nas suas caixinhas")
            )) {
              clearPendingInvoice();
              chatDocumentIdOnce = "";
              emitDataChanged("chat-invoice-confirm");
            }
          }).catch(() => {});
        }
        return response;
      });
    }
    if (method === "POST" && (url.endsWith("/api/invoices/confirm") || url.includes("/api/invoices/confirm?"))) {
      return nativeFetch(input, init).then((response) => {
        if (response && response.ok) {
          clearPendingInvoice();
          emitDataChanged("invoice-confirm");
        }
        return response;
      });
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
    const clean = (text || "").trim();
    if (!input || !form || !clean || input.disabled) return;
    speakNextReply = true;
    chatSourceOnce = "VOICE";
    input.value = clean;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }

  function handleVoiceTranscript(text) {
    if (!text || !text.trim()) return;
    chatSourceOnce = "VOICE";
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

  function ensureWaveAnimStyle() {
    if (document.getElementById("organiza-wave-anim-style")) return;
    const style = document.createElement("style");
    style.id = "organiza-wave-anim-style";
    style.textContent = `
      @keyframes organizaWavePulse {
        0%, 100% {
          transform: translate3d(0, 0, 0);
          opacity: 0.55;
        }
        50% {
          transform: translate3d(2px, -1.5px, 0);
          opacity: 1;
        }
      }
      @keyframes organizaWaveFloat {
        0%, 100% {
          transform: translateY(0px);
        }
        50% {
          transform: translateY(-1.5px);
        }
      }
      .organiza-thinking-bubble {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .organiza-wave-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        animation: organizaWaveFloat 2.2s ease-in-out infinite;
      }
      .organiza-wave-line {
        transform-box: fill-box;
        transform-origin: center;
        animation: organizaWavePulse 1.6s ease-in-out infinite;
      }
      .organiza-wave-line-1 { animation-delay: 0s; }
      .organiza-wave-line-2 { animation-delay: 0.22s; }
      .organiza-wave-line-3 { animation-delay: 0.44s; }
      .organiza-thinking-text {
        font-style: italic;
        font-size: 1rem;
        line-height: 1.4em;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isLightTheme() {
    if (document.documentElement.dataset.theme === "light") return true;
    const candidates = [document.getElementById("shell"), document.body];
    for (const el of candidates) {
      if (!el) continue;
      const inlineBg = (el.style && el.style.backgroundColor || "").toLowerCase();
      if (inlineBg === "#f8f9fc" || inlineBg === "#ffffff" || inlineBg === "rgb(248, 249, 252)" || inlineBg === "rgb(255, 255, 255)") {
        return true;
      }
      if (!window.getComputedStyle) continue;
      const bg = window.getComputedStyle(el).backgroundColor || "";
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i);
      if (!m) continue;
      if (m[4] !== undefined && Number(m[4]) === 0) continue;
      const avg = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
      return avg > 128;
    }
    return false;
  }

  function createOrganizaWaveSvg(isLight, prefix) {
    const ns = "http://www.w3.org/2000/svg";
    const gradId = `organiza-wave-grad-${prefix}-${isLight ? "light" : "dark"}`;
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 120 42");
    svg.setAttribute("width", "38");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "organiza-wave-icon");

    const defs = document.createElementNS(ns, "defs");
    const grad = document.createElementNS(ns, "linearGradient");
    grad.setAttribute("id", gradId);
    grad.setAttribute("x1", "0");
    grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "1");
    grad.setAttribute("y2", "1");

    const stop1 = document.createElementNS(ns, "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", isLight ? "#2563EB" : "#00F0FF");

    const stop2 = document.createElementNS(ns, "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", isLight ? "#1D4ED8" : "#0066FF");

    grad.appendChild(stop1);
    grad.appendChild(stop2);
    defs.appendChild(grad);
    svg.appendChild(defs);

    const paths = [
      { d: "M8 10 Q30 2 60 10 T112 10", cls: "organiza-wave-line organiza-wave-line-1", op: "1" },
      { d: "M8 21 Q30 13 60 21 T112 21", cls: "organiza-wave-line organiza-wave-line-2", op: "0.82" },
      { d: "M8 32 Q30 24 60 32 T112 32", cls: "organiza-wave-line organiza-wave-line-3", op: "0.64" }
    ];
    for (const p of paths) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", p.d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", `url(#${gradId})`);
      path.setAttribute("stroke-width", "3.5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("opacity", p.op);
      path.setAttribute("class", p.cls);
      svg.appendChild(path);
    }
    return svg;
  }

  function enhanceChatTyping() {
    const typingEl = document.getElementById("chat-typing");
    if (!typingEl || typingEl.dataset.organizaWaveEnhanced === "1") return;
    ensureWaveAnimStyle();
    const isLight = isLightTheme();
    const labelText = (typingEl.textContent || "").trim() || "...pensando";
    typingEl.dataset.organizaWaveEnhanced = "1";
    typingEl.classList.add("organiza-thinking-bubble");
    typingEl.style.display = "inline-flex";
    typingEl.style.alignItems = "center";
    typingEl.style.gap = "10px";
    typingEl.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    typingEl.textContent = "";
    typingEl.appendChild(createOrganizaWaveSvg(isLight, "typing"));
    const span = document.createElement("span");
    span.className = "organiza-thinking-text";
    span.textContent = labelText;
    typingEl.appendChild(span);
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
    ensureWaveAnimStyle();
    const isLight = isLightTheme();
    const bubble = document.createElement("div");
    bubble.id = "chat-ocr-thinking";
    bubble.className = "organiza-thinking-bubble";
    bubble.style.alignSelf = "flex-start";
    bubble.style.maxWidth = "74%";
    bubble.style.display = "inline-flex";
    bubble.style.alignItems = "center";
    bubble.style.gap = "10px";
    bubble.style.background = isLight ? "#E5E7EB" : "#1A1F3A";
    bubble.style.color = isLight ? "#6B7280" : "#7B8EAD";
    bubble.style.borderRadius = "20px 20px 20px 4px";
    bubble.style.padding = "18px 22px";
    bubble.style.fontSize = "1rem";
    bubble.style.lineHeight = "1.4em";
    bubble.style.fontStyle = "italic";
    bubble.style.margin = "0";
    bubble.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    bubble.appendChild(createOrganizaWaveSvg(isLight, "ocr"));
    const textSpan = document.createElement("span");
    textSpan.className = "organiza-thinking-text";
    textSpan.textContent = "organizando...";
    bubble.appendChild(textSpan);
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
    const hasPending = (pendingInvoiceItems && pendingInvoiceItems.length > 0) ||
      (pendingCreditItems && pendingCreditItems.length > 0);
    if (!hasPending) return;
    const msg = (userText || "").trim().toLowerCase();
    if (!msg) return;
    const lastReply = lastAssistantReplyText();
    const awaitingFinalSave = lastReply.includes("Antes de eu salvar nas suas caixinhas") ||
      lastReply.includes("distribua esses gastos na regra") ||
      lastReply.includes("Quer que eu distribua");
    if (!awaitingFinalSave) return;

    const isCancel = msg === "não" || msg === "nao" || msg.startsWith("não ") || msg.startsWith("nao ") ||
      msg.includes("cancela") || msg.includes("não salva") || msg.includes("nao salva") ||
      msg.includes("não salvar") || msg.includes("nao salvar");
    if (isCancel) {
      clearPendingInvoice();
      return;
    }

    const isAffirmation = msg === "sim" || msg === "sim!" || msg.startsWith("sim ") || msg.startsWith("sim,") ||
      msg.includes("confirmo") || msg.includes("confirma") || msg.includes("confirm") || msg.includes("pode salvar") ||
      msg.includes("organizar") || msg.includes("distribua") || msg.includes("despesas") ||
      msg.includes("70/20/10") || msg.includes("50/30/20") || msg === "ok" || msg.includes("foram") ||
      msg.includes("quero") || msg.includes("pode");
    if (!isAffirmation) return;

    const excludeCreditOps = msg.includes("só despesa") || msg.includes("so despesa") ||
      msg.includes("apenas despesa") || msg.includes("sem pix") ||
      msg.includes("sem credito") || msg.includes("sem crédito");
    const itemsToConfirm = excludeCreditOps
      ? pendingInvoiceItems.slice()
      : pendingInvoiceItems.concat(pendingCreditItems);
    if (itemsToConfirm.length === 0) {
      clearPendingInvoice();
      return;
    }

    const savedExpenses = pendingInvoiceItems;
    const savedCredit = pendingCreditItems;
    const docId = pendingDocumentId;
    clearPendingInvoice();
    if (!authorization && window.__kofAuthToken) {
      authorization = "Bearer " + window.__kofAuthToken;
    }
    const payload = docId ? { items: itemsToConfirm, documentId: docId } : { items: itemsToConfirm };
    try {
      const resp = await nativeFetch("/api/invoices/confirm", {
        method: "POST",
        headers: { "Authorization": authorization, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp && resp.ok) {
        emitDataChanged("invoice-confirm");
      } else {
        pendingInvoiceItems = savedExpenses;
        pendingCreditItems = savedCredit;
        pendingDocumentId = docId;
      }
    } catch (_) {
      pendingInvoiceItems = savedExpenses;
      pendingCreditItems = savedCredit;
      pendingDocumentId = docId;
    }
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
    setAttachmentStatus("organizando...", "loading");
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
      // Contagem e totais vem do backend (payload.summary, em centavos, separados por natureza).
      // Nenhuma soma em JS e nenhum valor inventado: vao para confirmacao as despesas (DESPESA)
      // e, se aprovadas pelo usuario, as operacoes de credito (OPERACAO_CREDITO); pendentes e
      // pagamentos de fatura ficam de fora para evitar dupla contagem.
      const summary = payload.summary || null;
      const summaryLines = summary && Array.isArray(summary.lines) ? summary.lines : [];
      const canonical = Array.isArray(payload.canonicalTransactions) ? payload.canonicalTransactions : [];
      const legacyTxs = Array.isArray(payload.transactions) ? payload.transactions : [];
      const extractedCount = summary && Number.isInteger(summary.extractedCount)
        ? summary.extractedCount
        : (canonical.length > 0 ? canonical.length : legacyTxs.length);
      const totalStatementRows = summary && Number.isInteger(summary.totalStatementRows)
        ? summary.totalStatementRows
        : extractedCount;
      const transactionsCount = extractedCount > 0 ? extractedCount : totalStatementRows;
      const expenseIds = new Set(summaryLines
        .filter(l => l.flowClass === "DESPESA" && Number.isInteger(l.amountMinor) && l.amountMinor > 0)
        .map(l => l.txId));
      const creditOpIds = new Set(summaryLines
        .filter(l => l.flowClass === "OPERACAO_CREDITO" && Number.isInteger(l.amountMinor) && l.amountMinor > 0)
        .map(l => l.txId));
      const extractionFailed = !response.ok || status === "FALHA_EXTRACAO" || status === "EXTRACAO_FALHOU" || transactionsCount === 0;

      if (response.status === 422 || response.status === 408) {
        clearPendingInvoice();
        chatDocumentIdOnce = "";
        showOcrThinking(false);
        restoreDraft();
        setAttachmentStatus(response.status === 422
          ? "Não há leitor de imagem (OCR) disponível no servidor. Envie um PDF com texto selecionável ou digite os gastos."
          : "A leitura do arquivo demorou demais. Tente uma imagem menor ou mais nítida.", "error");
        return;
      }

      if (response.status === 402 || response.status === 503) {
        clearPendingInvoice();
        chatDocumentIdOnce = "";
        showOcrThinking(false);
        restoreDraft();
        setAttachmentStatus(response.status === 402
          ? "Você atingiu o limite de mensagens deste mês."
          : "O serviço está indisponível no momento. Tente novamente em instantes.", "error");
        return;
      }

      if (extractionFailed) {
        clearPendingInvoice();
        chatDocumentIdOnce = "";
        showOcrThinking(false);
        setAttachmentStatus("Não foi possível extrair lançamentos válidos desse arquivo. Reenvie uma fatura em PDF, PNG, JPEG ou DOCX legível.", "error");
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

      const toConfirmItem = (t) => ({
        description: String(t.descriptionNormalized || t.descriptionRaw || "").trim() || "Despesa da fatura",
        amount: t.amountMinor / 100,
        category: String(t.category || "OTHER")
      });
      pendingDocumentId = payload.documentId ? String(payload.documentId) : "";
      chatDocumentIdOnce = pendingDocumentId;
      const isExcludedFlow = (t) => t.flowClass === "PAGAMENTO_FATURA" || t.flowClass === "PENDENTE_REVISAO";
      if (summaryLines.length > 0) {
        pendingInvoiceItems = canonical
          .filter(t => !isExcludedFlow(t) && expenseIds.has(t.id) && Number.isInteger(t.amountMinor) && t.amountMinor > 0)
          .map(toConfirmItem);
        pendingCreditItems = canonical
          .filter(t => !isExcludedFlow(t) && creditOpIds.has(t.id) && Number.isInteger(t.amountMinor) && t.amountMinor > 0)
          .map(toConfirmItem);
      } else {
        pendingInvoiceItems = canonical
          .filter(t => !isExcludedFlow(t) && Number.isInteger(t.amountMinor) && t.amountMinor > 0 && t.direction !== "CREDIT" &&
            t.kind !== "PAYMENT" && t.kind !== "INCOME" && t.kind !== "REFUND" &&
            t.reviewStatus !== "NEEDS_REVIEW" && t.reviewStatus !== "PENDENTE_REVISAO" &&
            (t.reviewStatus === "CONFIRMED" || t.kind === "FEE" || t.kind === "INTEREST"))
          .map(toConfirmItem);
        pendingCreditItems = canonical
          .filter(t => !isExcludedFlow(t) && Number.isInteger(t.amountMinor) && t.amountMinor > 0 && t.direction !== "CREDIT" && t.kind === "CARD_EXIT")
          .map(toConfirmItem);
      }

      const countText = totalStatementRows > extractedCount && extractedCount > 0
        ? `${extractedCount} de ${totalStatementRows} registros extraídos`
        : (transactionsCount === 1 ? "1 registro extraído" : `${transactionsCount} registros extraídos`);

      showOcrThinking(false);
      setAttachmentStatus("", "idle");

      const input = document.getElementById("chat-input");
      const form = document.getElementById("chat-form");
      if (input && form) {
        const msgText = `Fatura ${file.name} enviada: ${countText}. Analise o documento.`;
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

  window.addEventListener("organiza:data-changed", () => {
    if (document.getElementById("screen-envelopes") &&
        !document.getElementById("env-new-modal") &&
        !document.getElementById("env-edit-modal")) {
      const navEnv = document.getElementById("nav-envelopes");
      if (navEnv) navEnv.click();
    } else if (document.getElementById("screen-dashboard")) {
      const navDash = document.getElementById("nav-dashboard");
      if (navDash) navDash.click();
    }
  });

  function onDomMutated() {
    readNewAssistantReplies();
    enhanceChatTyping();
  }

  new MutationObserver(onDomMutated).observe(document.documentElement, { childList: true, subtree: true });
  onDomMutated();
})();
