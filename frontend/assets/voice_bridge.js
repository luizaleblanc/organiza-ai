/*
 * Ponte Web Speech, Indicador Contextual (3 Ondas) e Componentes Interativos do Chat.
 *
 * Fluxo:
 * - SpeechRecognition (pt-BR) -> input KOF -> ChatMessageRequest -> SpeechSynthesis.
 * - window.OrganizaProcessingIndicator: indicador animado com as 3 ondas oficiais,
 *   8 mensagens contextuais, debounce visual anti-flash (não bloqueante) e ARIA polite.
 * - Painel interativo do chat (#chat-interactive-panel): ações rápidas, prévia de
 *   caixinhas com checkboxes (soma exata em centavos) e revisão/reclassificação de pendentes.
 * - O token fica apenas em memória e nunca é persistido em storage.
 */
(() => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const spokenReplies = new Set();
  const indicatorRegistry = new WeakMap();
  const indicatorById = new Map();

  let svgGradSeq = 0;
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
  let pendingDocumentPeriod = "";
  let lastUploadedPeriod = "";

  // documentId e source anexados (uma vez) na próxima mensagem do chat.
  let chatDocumentIdOnce = "";
  let chatSourceOnce = null;

  // Rastreamento da última submissão do chat para contexto das 3 ondas e anti-flash.
  let lastChatRequestText = "";
  let lastChatRequestSource = "MANUAL";
  let lastChatRequestOpType = "";
  let lastChatRequestImmediate = false;
  let lastChatRequestStartedAt = 0;
  let lastChatSubmitStamp = 0;
  let chatTypingRevealTimer = null;

  // Estado sincronizado do documento em revisão, interação estruturada e painel interativo.
  let activeInteraction = null;
  let latestDocReview = null;
  let latestDocFetchedForAuth = "";

  const panelState = {
    activeCard: "", // "", "view", "organize", "review", "confirmed"
    loading: false,
    busyText: "",
    error: "",
    info: "",
    detailsOpen: false,
    viewSummary: null,
    viewResult: null,
    viewPeriod: "",
    availableViewCategories: [],
    selectedViewCategories: new Set(),
    viewFilterInitializedForKey: "",
    confirmedSummary: null,
    needsPeriod: false,
    manualPeriod: "",
    selectedOrganizeIds: new Set(),
    organizeInitializedForKey: "",
    selectedReviewIds: new Set(),
    selectedReviewCategory: "FOOD",
    confirmedDocId: ""
  };

  const CATEGORY_OPTIONS = [
    { code: "FOOD", label: "Alimentação" },
    { code: "GROCERIES", label: "Mercado" },
    { code: "TRANSPORT", label: "Transporte" },
    { code: "HOUSING", label: "Moradia" },
    { code: "LEISURE", label: "Lazer" },
    { code: "PHARMA", label: "Farmácia" },
    { code: "HEALTH", label: "Saúde" },
    { code: "SHOPPING", label: "Compras" },
    { code: "SUBSCRIPTIONS", label: "Assinaturas" },
    { code: "EDUCATION", label: "Educação" },
    { code: "AUTO", label: "Carro" },
    { code: "OTHER", label: "Outros" }
  ];

  const CATEGORY_LABELS = CATEGORY_OPTIONS.reduce((acc, item) => {
    acc[item.code] = item.label;
    return acc;
  }, {});

  const MONTH_NAMES_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  // Compartilhamento do header de autenticação em memória com outros scripts same-origin.
  window.__organizaGetAuthHeader = () =>
    authorization || (window.__kofAuthToken ? ("Bearer " + window.__kofAuthToken) : "");

  function getAuthHeader() {
    return window.__organizaGetAuthHeader();
  }

  function emitDataChanged(reason, extra) {
    const detail = Object.assign(
      { reason: reason || "update" },
      extra && typeof extra === "object" ? extra : {}
    );
    try {
      window.dispatchEvent(new CustomEvent("organiza:data-changed", { detail }));
    } catch (_) {
      window.dispatchEvent(new Event("organiza:data-changed"));
    }
  }

  function currentYearMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function isValidYearMonth(val) {
    return typeof val === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(val.trim());
  }

  function extractPeriodFromObject(obj) {
    if (!obj || typeof obj !== "object") return "";
    const direct = [obj.period, obj.statementPeriod, obj.confirmedPeriod];
    for (const val of direct) {
      if (isValidYearMonth(val)) return val.trim();
    }
    if (obj.review && typeof obj.review === "object") {
      const nested = extractPeriodFromObject(obj.review);
      if (nested) return nested;
    }
    if (typeof obj.dataJson === "string" && obj.dataJson.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(obj.dataJson);
        const fromJson = extractPeriodFromObject(parsed);
        if (fromJson) return fromJson;
      } catch (_) {}
    }
    return "";
  }

  function clearPendingInvoice() {
    pendingInvoiceItems = [];
    pendingCreditItems = [];
    pendingDocumentId = "";
    pendingDocumentPeriod = "";
  }

  function resetPanelState(keepConfirmed) {
    if (!keepConfirmed) {
      panelState.activeCard = "";
      panelState.confirmedSummary = null;
      panelState.confirmedDocId = "";
    }
    panelState.loading = false;
    panelState.busyText = "";
    panelState.error = "";
    panelState.info = "";
    panelState.detailsOpen = false;
    panelState.viewSummary = null;
    panelState.viewResult = null;
    panelState.viewPeriod = "";
    panelState.availableViewCategories = [];
    panelState.selectedViewCategories.clear();
    panelState.viewFilterInitializedForKey = "";
    panelState.needsPeriod = false;
    panelState.manualPeriod = "";
    panelState.selectedOrganizeIds.clear();
    panelState.organizeInitializedForKey = "";
    panelState.selectedReviewIds.clear();
  }

  function flowClassOf(tx) {
    if (!tx || tx.amountMinor == null) return "PENDENTE_REVISAO";
    if (tx.flowClass) return String(tx.flowClass);
    const kind = String(tx.kind || "");
    if (kind === "PAYMENT") return "PAGAMENTO_FATURA";
    if (kind === "INCOME") return "RECEITA";
    if (kind === "CARD_EXIT") return "OPERACAO_CREDITO";
    if (kind === "REFUND") return "ESTORNO";
    if (kind === "FEE" || kind === "INTEREST") return "DESPESA";
    if (tx.reviewStatus === "CONFIRMED") return "DESPESA";
    return "PENDENTE_REVISAO";
  }

  function normalizeReviewPayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    const base = raw.review && typeof raw.review === "object" ? raw.review : raw;
    const docId = String(base.documentId || raw.documentId || "").trim();
    if (!docId) return null;
    const txs = Array.isArray(base.transactions)
      ? base.transactions
      : (Array.isArray(raw.canonicalTransactions) ? raw.canonicalTransactions : []);
    const period = extractPeriodFromObject(raw) || extractPeriodFromObject(base);
    return {
      documentId: docId,
      filename: String(base.filename || raw.filename || "").trim(),
      status: String(base.status || raw.status || "").trim(),
      statementPeriod: period,
      reconciled: Boolean(base.reconciled !== undefined ? base.reconciled : raw.reconciled),
      confirmedByUser: Boolean(base.confirmedByUser),
      warnings: Array.isArray(base.warnings) ? base.warnings : (Array.isArray(raw.warnings) ? raw.warnings : []),
      transactions: txs
    };
  }

  function syncPendingFromReview(rev) {
    if (!rev) return;
    pendingDocumentId = rev.documentId || pendingDocumentId;
    if (rev.statementPeriod) {
      pendingDocumentPeriod = rev.statementPeriod;
      lastUploadedPeriod = rev.statementPeriod;
    }
    const toConfirmItem = (t) => ({
      description: String(t.descriptionNormalized || t.descriptionRaw || "").trim() || "Despesa da fatura",
      amount: Number(t.amountMinor) / 100,
      category: String(t.category || "OTHER")
    });
    pendingInvoiceItems = rev.transactions
      .filter((t) => flowClassOf(t) === "DESPESA" && Number(t.amountMinor) > 0 && t.direction !== "CREDIT")
      .map(toConfirmItem);
    pendingCreditItems = rev.transactions
      .filter((t) => flowClassOf(t) === "OPERACAO_CREDITO" && Number(t.amountMinor) > 0 && t.direction !== "CREDIT")
      .map(toConfirmItem);
  }

  function isLightTheme() {
    if (document.documentElement.dataset.theme === "light") return true;
    const candidates = [document.getElementById("shell"), document.body];
    for (const el of candidates) {
      if (!el) continue;
      const inlineBg = ((el.style && el.style.backgroundColor) || "").toLowerCase();
      if (inlineBg === "#f8f9fc" || inlineBg === "#ffffff" ||
          inlineBg === "rgb(248, 249, 252)" || inlineBg === "rgb(255, 255, 255)") {
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

  function ensureWaveAnimStyle() {
    if (document.getElementById("organiza-chat-interactions-css")) return;
    const stylesheet = document.createElement("link");
    stylesheet.id = "organiza-chat-interactions-css";
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/assets/chat_interactions.css?v=2";
    (document.head || document.documentElement).appendChild(stylesheet);
  }
  function createOrganizaWaveSvg(isLightOrOpts, prefixArg) {
    let isLight = typeof isLightOrOpts === "boolean" ? isLightOrOpts : isLightTheme();
    let prefix = prefixArg || "wave";
    let width = "46";
    let height = "20";
    let staticMark = false;
    if (isLightOrOpts && typeof isLightOrOpts === "object") {
      if (typeof isLightOrOpts.isLight === "boolean") isLight = isLightOrOpts.isLight;
      if (isLightOrOpts.prefix) prefix = String(isLightOrOpts.prefix);
      if (isLightOrOpts.width != null) width = String(isLightOrOpts.width);
      if (isLightOrOpts.height != null) height = String(isLightOrOpts.height);
      if (isLightOrOpts.staticMark) staticMark = true;
    }

    const ns = "http://www.w3.org/2000/svg";
    svgGradSeq += 1;
    const gradId = `organiza-wave-grad-${prefix}-${isLight ? "light" : "dark"}-${svgGradSeq}`;
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "4.25 9.25 231.5 97.5");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", staticMark ? "organiza-wave-mark" : "organiza-wave-icon");

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
      { d: "M8 24 Q60 2 120 24 T232 24", cls: staticMark ? "organiza-wave-static-1" : "organiza-wave-line organiza-wave-line-1", op: "1.0" },
      { d: "M8 58 Q60 36 120 58 T232 58", cls: staticMark ? "organiza-wave-static-2" : "organiza-wave-line organiza-wave-line-2", op: "0.85" },
      { d: "M8 92 Q60 70 120 92 T232 92", cls: staticMark ? "organiza-wave-static-3" : "organiza-wave-line organiza-wave-line-3", op: "0.7" }
    ];
    for (const p of paths) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", p.d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", `url(#${gradId})`);
      path.setAttribute("stroke-width", "11");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("opacity", p.op);
      path.setAttribute("class", p.cls);
      svg.appendChild(path);
    }
    return svg;
  }

  function resolveChatContext(text, source, operationType) {
    const op = String(operationType || "").trim().toLowerCase();
    if (op === "upload") return "Lendo sua fatura...";
    if (op === "extract" || op === "analisar_fatura") return "Identificando suas movimentações...";
    if (op === "reclassify" || op === "classificacao") return "Organizando seus gastos...";
    if (op === "validate" || op === "review" || op === "consultar_gastos") return "Conferindo os valores...";
    if (op === "caixinhas") return "Preparando suas caixinhas...";
    if (op === "education" || op === "edu") return "Preparando uma explicação...";
    if (op === "voice") return "Entendendo o que você disse...";
    if (op === "confirm" || op === "persist" || op === "confirmar_importacao") return "Salvando suas informações...";

    if (String(source || "").toUpperCase() === "VOICE" || listening) {
      return "Entendendo o que você disse...";
    }

    const lower = String(text || "").trim().toLowerCase();
    if (!lower) return "Organizando seus gastos...";

    // 1. Extração financeira (pós-upload / análise do documento)
    if (
      lower.includes("analise o documento") ||
      lower.includes("analise a fatura") ||
      lower.includes("resumo da fatura") ||
      lower.includes("o que tem na fatura") ||
      (lower.includes("fatura ") && lower.includes("enviada:"))
    ) {
      return "Identificando suas movimentações...";
    }

    // 2. Persistência / confirmação
    if (
      lower.includes("sim, pode distribuir") ||
      lower.includes("pode distribuir") ||
      lower.includes("pode salvar") ||
      lower.includes("confirmar importação") ||
      lower.includes("confirmar importacao") ||
      lower.includes("salvar nas caixinhas") ||
      lower.includes("salva nas caixinhas") ||
      lower === "confirmo"
    ) {
      return "Salvando suas informações...";
    }

    // 3. Perguntas educativas
    if (
      lower.includes("entender meus gastos") ||
      lower.includes("entender melhor meus gastos") ||
      lower.includes("?") ||
      lower.includes("o que é") ||
      lower.includes("o que e") ||
      lower.includes("o que são") ||
      lower.includes("como funciona") ||
      lower.includes("por que") ||
      lower.includes("porque") ||
      lower.includes("explica")
    ) {
      return "Preparando uma explicação...";
    }

    // 4. Validação / revisão / consulta
    if (
      lower.includes("revisar movimentações") ||
      lower.includes("revisar movimentacoes") ||
      lower.includes("ver meus gastos") ||
      lower.includes("conferir") ||
      lower.includes("validar") ||
      lower.includes("corrigir uma informação") ||
      lower.includes("corrigir uma informacao")
    ) {
      return "Conferindo os valores...";
    }

    // 5. Caixinhas
    if (
      lower.includes("organizar caixinhas") ||
      lower.includes("organizar meus gastos nas caixinhas") ||
      lower.includes("caixinha")
    ) {
      return "Preparando suas caixinhas...";
    }

    // 6. Classificação / registro de gasto
    if (
      lower.includes("esse pix foi") ||
      lower.includes("o pix foi") ||
      lower.includes("pix foi") ||
      lower.includes("classifica") ||
      lower.includes("gastei") ||
      lower.includes("paguei") ||
      lower.includes("comprei")
    ) {
      return "Organizando seus gastos...";
    }

    return "Organizando seus gastos...";
  }

  function applyBubbleThemeStyles(bubble, isLight, isError) {
    if (isError) {
      bubble.style.background = isLight ? "#FEF2F2" : "rgba(255, 74, 110, 0.14)";
      bubble.style.color = isLight ? "#B91C1C" : "#FF8AA0";
      bubble.style.border = isLight ? "1px solid #FCA5A5" : "1px solid rgba(255, 74, 110, 0.4)";
      bubble.style.fontStyle = "normal";
    } else {
      bubble.style.background = isLight ? "#E5E7EB" : "#1A1F3A";
      bubble.style.color = isLight ? "#4B5563" : "#7B8EAD";
      bubble.style.border = "none";
      bubble.style.fontStyle = "italic";
    }
  }

  function createIndicatorBubble(id, isLight, text, isError) {
    ensureWaveAnimStyle();
    const bubble = document.createElement("div");
    if (id) bubble.id = id;
    bubble.className = "organiza-thinking-bubble";
    bubble.setAttribute("role", isError ? "alert" : "status");
    bubble.setAttribute("aria-live", isError ? "assertive" : "polite");
    bubble.setAttribute("aria-atomic", "true");
    bubble.style.alignSelf = "flex-start";
    bubble.style.maxWidth = "86%";
    bubble.style.display = "inline-flex";
    bubble.style.alignItems = "center";
    bubble.style.gap = "12px";
    bubble.style.borderRadius = "20px 20px 20px 4px";
    bubble.style.padding = "16px 20px";
    bubble.style.fontSize = "1rem";
    bubble.style.lineHeight = "1.4em";
    bubble.style.margin = "0";
    applyBubbleThemeStyles(bubble, isLight, isError);

    if (!isError) {
      bubble.appendChild(createOrganizaWaveSvg(isLight, id || "ind"));
    }
    const textSpan = document.createElement("span");
    textSpan.className = "organiza-thinking-text";
    textSpan.textContent = text;
    bubble.appendChild(textSpan);
    return { bubble, textSpan };
  }

  function placeIndicatorInContainer(container, bubble, isDefaultChat) {
    if (!container) return;
    if (isDefaultChat) {
      container.insertBefore(bubble, container.firstChild);
    } else {
      container.appendChild(bubble);
    }
  }

  function resolveIndicatorEntry(targetOrId) {
    if (typeof targetOrId === "string" && indicatorById.has(targetOrId)) {
      return indicatorById.get(targetOrId);
    }
    if (targetOrId && typeof targetOrId === "object" && indicatorRegistry.has(targetOrId)) {
      return indicatorRegistry.get(targetOrId);
    }
    if (!targetOrId && indicatorById.has("chat-ocr-thinking")) {
      return indicatorById.get("chat-ocr-thinking");
    }
    return null;
  }

  function clearEntryTimer(entry) {
    if (entry && entry.pendingTimer) {
      clearTimeout(entry.pendingTimer);
      entry.pendingTimer = null;
    }
  }

  const OrganizaProcessingIndicator = {
    createWaveSvg: createOrganizaWaveSvg,
    resolveChatContext,

    mount(targetArg, textArg, optionsArg) {
      let target = targetArg;
      let text = textArg;
      let opts = optionsArg || {};
      if (targetArg && typeof targetArg === "object" && !(targetArg instanceof Element)) {
        opts = targetArg;
        target = opts.target || opts.container || null;
        text = opts.text || textArg;
      } else if (typeof targetArg === "string") {
        opts = typeof textArg === "object" ? textArg : (optionsArg || {});
        text = targetArg;
        target = opts.target || opts.container || null;
      }

      const isDefaultChat = !target;
      const container = target || document.getElementById("chat-messages");
      const id = opts.id || (isDefaultChat ? "chat-ocr-thinking" : "");
      const statusText = String(text || resolveChatContext("", "", opts.context || "")).trim() || "Organizando seus gastos...";
      const isError = Boolean(opts.isError);
      const delayMs = (opts.immediate || isError) ? 0 : (typeof opts.delayMs === "number" ? opts.delayMs : 120);

      let entry = (id && indicatorById.get(id)) || (container && indicatorRegistry.get(container)) || null;
      if (entry) {
        clearEntryTimer(entry);
        entry.hidden = false;
        entry.container = container;
        entry.pendingText = statusText;
        entry.isError = isError;
        if (!entry.bubble.isConnected) {
          entry.lastAnnouncedStatus = "";
          const revealExisting = () => {
            entry.pendingTimer = null;
            if (entry.hidden) return;
            const host = entry.container && entry.container.isConnected
              ? entry.container
              : (entry.isDefaultChat ? document.getElementById("chat-messages") : entry.container);
            if (!host) return;
            entry.container = host;
            applyBubbleThemeStyles(entry.bubble, isLightTheme(), entry.isError);
            if (entry.lastAnnouncedStatus !== entry.pendingText) {
              entry.textSpan.textContent = entry.pendingText;
              entry.lastAnnouncedStatus = entry.pendingText;
            }
            placeIndicatorInContainer(host, entry.bubble, entry.isDefaultChat);
          };
          if (delayMs <= 0) {
            revealExisting();
          } else {
            entry.pendingTimer = setTimeout(revealExisting, delayMs);
          }
        } else {
          if (entry.bubble.parentElement !== container && container) {
            placeIndicatorInContainer(container, entry.bubble, isDefaultChat);
          }
          OrganizaProcessingIndicator.update(entry.bubble, statusText, opts);
        }
        return entry.bubble;
      }

      const isLight = typeof opts.isLight === "boolean" ? opts.isLight : isLightTheme();
      const { bubble, textSpan } = createIndicatorBubble(id, isLight, "", isError);
      entry = {
        id,
        container,
        isDefaultChat,
        bubble,
        textSpan,
        pendingText: statusText,
        lastAnnouncedStatus: "",
        isError,
        hidden: false,
        pendingTimer: null
      };

      indicatorRegistry.set(bubble, entry);
      if (container) indicatorRegistry.set(container, entry);
      if (id) indicatorById.set(id, entry);

      const reveal = () => {
        entry.pendingTimer = null;
        if (entry.hidden) return;
        const host = entry.container && entry.container.isConnected
          ? entry.container
          : (entry.isDefaultChat ? document.getElementById("chat-messages") : entry.container);
        if (!host) return;
        entry.container = host;
        if (entry.lastAnnouncedStatus !== entry.pendingText) {
          entry.textSpan.textContent = entry.pendingText;
          entry.lastAnnouncedStatus = entry.pendingText;
        }
        if (!entry.bubble.isConnected || entry.bubble.parentElement !== host) {
          placeIndicatorInContainer(host, entry.bubble, entry.isDefaultChat);
        }
      };

      if (delayMs <= 0) {
        reveal();
      } else {
        entry.pendingTimer = setTimeout(reveal, delayMs);
      }
      return bubble;
    },

    update(targetOrId, nextText, optionsArg) {
      const entry = resolveIndicatorEntry(targetOrId);
      if (!entry) {
        return OrganizaProcessingIndicator.mount(
          typeof targetOrId === "string" ? null : targetOrId,
          nextText,
          optionsArg
        );
      }
      const opts = optionsArg || {};
      const clean = String(nextText || "").trim();
      const isError = Boolean(opts.isError);
      entry.pendingText = clean || entry.pendingText;
      entry.isError = isError;
      entry.bubble.setAttribute("role", isError ? "alert" : "status");
      entry.bubble.setAttribute("aria-live", isError ? "assertive" : "polite");
      applyBubbleThemeStyles(entry.bubble, isLightTheme(), isError);

      if (isError) {
        const icon = entry.bubble.querySelector(".organiza-wave-icon");
        if (icon) icon.remove();
        clearEntryTimer(entry);
        const host = entry.container && entry.container.isConnected
          ? entry.container
          : (entry.isDefaultChat ? document.getElementById("chat-messages") : entry.container);
        if (host && !entry.bubble.isConnected) {
          placeIndicatorInContainer(host, entry.bubble, entry.isDefaultChat);
        }
      }

      // Deduplicação de anúncio para leitores de tela: só escreve quando o texto realmente muda.
      if (!entry.pendingTimer && clean && entry.lastAnnouncedStatus !== clean) {
        entry.textSpan.textContent = clean;
        entry.lastAnnouncedStatus = clean;
      }
      return entry.bubble;
    },

    hide(targetOrId) {
      const entry = resolveIndicatorEntry(targetOrId);
      if (!entry) {
        if (typeof targetOrId === "string") {
          const el = document.getElementById(targetOrId);
          if (el) el.remove();
        } else if (!targetOrId) {
          const el = document.getElementById("chat-ocr-thinking");
          if (el) el.remove();
        }
        return;
      }
      entry.hidden = true;
      clearEntryTimer(entry);
      if (entry.bubble && entry.bubble.parentElement) {
        entry.bubble.remove();
      }
      entry.lastAnnouncedStatus = "";
      if (entry.id) indicatorById.delete(entry.id);
      if (entry.container) indicatorRegistry.delete(entry.container);
      indicatorRegistry.delete(entry.bubble);
    }
  };

  window.OrganizaProcessingIndicator = OrganizaProcessingIndicator;

  function showOcrThinking(show, text, options) {
    if (!show) {
      OrganizaProcessingIndicator.hide("chat-ocr-thinking");
      return;
    }
    OrganizaProcessingIndicator.mount(null, text || "Lendo sua fatura...", Object.assign({
      id: "chat-ocr-thinking",
      immediate: true
    }, options || {}));
  }

  function enhanceChatTyping() {
    const typingEl = document.getElementById("chat-typing");
    if (!typingEl) {
      if (chatTypingRevealTimer) {
        clearTimeout(chatTypingRevealTimer);
        chatTypingRevealTimer = null;
      }
      return;
    }

    ensureWaveAnimStyle();
    const isLight = isLightTheme();
    const contextualText = resolveChatContext(
      lastChatRequestText,
      lastChatRequestSource,
      lastChatRequestOpType || (lastChatRequestSource === "VOICE" ? "voice" : "")
    );

    if (typingEl.dataset.organizaWaveEnhanced !== "1") {
      typingEl.dataset.organizaWaveEnhanced = "1";
      typingEl.classList.add("organiza-thinking-bubble");
      typingEl.setAttribute("role", "status");
      typingEl.setAttribute("aria-live", "polite");
      typingEl.setAttribute("aria-atomic", "true");
      typingEl.style.alignItems = "center";
      typingEl.style.gap = "12px";
      typingEl.style.maxWidth = "86%";
      typingEl.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      typingEl.textContent = "";
      typingEl.appendChild(createOrganizaWaveSvg(isLight, "typing"));
      const span = document.createElement("span");
      span.className = "organiza-thinking-text";
      span.textContent = contextualText;
      typingEl.dataset.lastAnnouncedStatus = contextualText;
      typingEl.appendChild(span);

      const immediate = lastChatRequestImmediate || lastChatRequestSource === "VOICE" ||
        lastChatRequestOpType === "extract" || lastChatRequestOpType === "upload";
      const elapsed = lastChatRequestStartedAt > 0 ? (Date.now() - lastChatRequestStartedAt) : 0;
      if (!immediate && elapsed < 120) {
        typingEl.style.display = "none";
        typingEl.style.opacity = "0";
        if (chatTypingRevealTimer) clearTimeout(chatTypingRevealTimer);
        chatTypingRevealTimer = setTimeout(() => {
          chatTypingRevealTimer = null;
          const active = document.getElementById("chat-typing");
          if (active && active.isConnected) {
            active.style.display = "inline-flex";
            active.style.opacity = "1";
          }
        }, Math.max(10, 120 - elapsed));
      } else {
        typingEl.style.display = "inline-flex";
        typingEl.style.opacity = "1";
      }
      return;
    }

    const span = typingEl.querySelector(".organiza-thinking-text");
    if (span && typingEl.dataset.lastAnnouncedStatus !== contextualText) {
      span.textContent = contextualText;
      typingEl.dataset.lastAnnouncedStatus = contextualText;
    }
  }

  function recordChatSubmissionMeta(rawText, opType, immediate) {
    const now = Date.now();
    if (now - lastChatSubmitStamp < 40 && rawText === lastChatRequestText) return;
    lastChatSubmitStamp = now;
    lastChatRequestText = String(rawText || "").trim();
    lastChatRequestSource = chatSourceOnce || "MANUAL";
    lastChatRequestOpType = opType || (chatDocumentIdOnce ? "extract" : "");
    lastChatRequestImmediate = Boolean(immediate || chatDocumentIdOnce || chatSourceOnce === "VOICE");
    lastChatRequestStartedAt = now;
    if (panelState.activeCard === "confirmed") {
      panelState.activeCard = "";
      panelState.confirmedSummary = null;
      panelState.confirmedDocId = "";
    }
  }

  // Intercepta fetch same-origin para compartilhar token em memória e sincronizar estado sem bloquear respostas.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const options = init || {};
    const headerSource = options.headers || (input instanceof Request ? input.headers : undefined);
    if (headerSource) {
      try {
        const header = new Headers(headerSource).get("Authorization");
        if (header) {
          const prevAuth = authorization;
          authorization = header;
          if (!prevAuth) {
            window.dispatchEvent(new CustomEvent("organiza:auth-ready"));
          } else if (prevAuth !== header) {
            activeInteraction = null;
            latestDocReview = null;
            latestDocFetchedForAuth = "";
            clearPendingInvoice();
            resetPanelState(false);
          }
        }
      } catch (_) {}
    }

    const url = typeof input === "string" ? input : (input instanceof Request ? input.url : String(input));
    const method = String(options.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

    if (method === "POST" && (url.endsWith("/api/auth/login") || url.endsWith("/api/auth/register"))) {
      authorization = "";
      activeInteraction = null;
      latestDocReview = null;
      latestDocFetchedForAuth = "";
      clearPendingInvoice();
      resetPanelState(false);
    }

    const isClearChat = method === "DELETE" && (url.endsWith("/api/chat/messages") || url.includes("/api/chat/messages?"));
    if (isClearChat) {
      activeInteraction = null;
      clearPendingInvoice();
      chatDocumentIdOnce = "";
      chatSourceOnce = null;
      latestDocReview = null;
      latestDocFetchedForAuth = getAuthHeader();
      resetPanelState(false);
      showOcrThinking(false);
      setAttachmentStatus("", "idle");
      return nativeFetch(input, init).then((response) => {
        if (response && response.ok) {
          emitDataChanged("chat-cleared");
        }
        return response;
      });
    }

    const isChatMessage = method === "POST" &&
      (url.endsWith("/api/chat/message") || url.includes("/api/chat/message?")) &&
      typeof options.body === "string";
    if (isChatMessage) {
      activeInteraction = null;
      panelState.activeCard = "";
      panelState.detailsOpen = false;
      let nextInit = init;
      let usedVoice = false;
      let sentMsg = "";
      let usedDocId = "";
      try {
        const parsed = JSON.parse(options.body);
        if (parsed && typeof parsed.message === "string") {
          sentMsg = parsed.message;
          if (chatDocumentIdOnce) {
            parsed.documentId = chatDocumentIdOnce;
            usedDocId = chatDocumentIdOnce;
            chatDocumentIdOnce = "";
          }
          if (chatSourceOnce) {
            parsed.source = chatSourceOnce;
            usedVoice = chatSourceOnce === "VOICE";
            chatSourceOnce = null;
          }
          nextInit = Object.assign({}, options, { body: JSON.stringify(parsed) });
        }
      } catch (_) {}

      recordChatSubmissionMeta(sentMsg, usedDocId ? "extract" : (usedVoice ? "voice" : ""), Boolean(usedDocId || usedVoice));

      return nativeFetch(input, nextInit).then((response) => {
        lastChatRequestOpType = "";
        lastChatRequestImmediate = false;
        if (response && response.ok) {
          if (usedVoice) {
            emitDataChanged("voice-chat");
          }
          response.clone().json().then((data) => {
            if (data && data.interaction && typeof data.interaction === "object") {
              activeInteraction = Object.assign({}, data.interaction, {
                responseText: typeof data.reply === "string" ? data.reply : ""
              });
              if (data.interaction.documentId) {
                pendingDocumentId = String(data.interaction.documentId).trim() || pendingDocumentId;
              }
              if (isValidYearMonth(data.interaction.period)) {
                pendingDocumentPeriod = data.interaction.period.trim();
                lastUploadedPeriod = data.interaction.period.trim();
              }
              const docToSync = String(data.interaction.documentId || usedDocId || pendingDocumentId || "").trim();
              if (docToSync && (!latestDocReview || latestDocReview.documentId !== docToSync || (sentMsg && sentMsg.toLowerCase().includes("pix")))) {
              }
              return;
            }

            const replyText = data && typeof data.reply === "string" ? data.reply : "";
            const replyLower = replyText.toLowerCase();
            if (replyLower && (
              replyLower.startsWith("confirmado!") ||
              replyLower.includes("já estava confirmado:") ||
              replyLower.includes("ja estava confirmado:") ||
              replyLower.includes("salvei seus lançamentos") ||
              replyLower.includes("salvei nas suas caixinhas") ||
              replyLower.includes("estao salvos nas suas caixinhas") ||
              replyLower.includes("estão salvos nas suas caixinhas")
            )) {
              const confirmedPeriod = extractPeriodFromObject(data) || pendingDocumentPeriod || lastUploadedPeriod || currentYearMonth();
              if (confirmedPeriod) window.__organizaLastConfirmedPeriod = confirmedPeriod;
              const docIdJustConfirmed = pendingDocumentId || (latestDocReview && latestDocReview.documentId) || "";
              activeInteraction = null;
              clearPendingInvoice();
              chatDocumentIdOnce = "";
              latestDocReview = null;
              panelState.confirmedDocId = docIdJustConfirmed;
              panelState.activeCard = "confirmed";
              panelState.confirmedSummary = {
                message: replyText,
                period: confirmedPeriod
              };
              emitDataChanged("chat-invoice-confirm", confirmedPeriod ? { period: confirmedPeriod } : undefined);
            }
          }).catch(() => {});
        }
        return response;
      });
    }

    if (method === "POST" && (url.endsWith("/api/invoices/confirm") || url.includes("/api/invoices/confirm?"))) {
      return nativeFetch(input, init).then((response) => {
        if (response && response.ok) {
          response.clone().json().then((data) => {
            const confirmedPeriod = extractPeriodFromObject(data) || pendingDocumentPeriod || lastUploadedPeriod || currentYearMonth();
            if (confirmedPeriod) window.__organizaLastConfirmedPeriod = confirmedPeriod;
            activeInteraction = null;
            clearPendingInvoice();
            latestDocReview = null;
            resetPanelState(false);
            emitDataChanged("invoice-confirm", confirmedPeriod ? { period: confirmedPeriod } : undefined);
          }).catch(() => {
            const confirmedPeriod = pendingDocumentPeriod || lastUploadedPeriod || "";
            if (confirmedPeriod) window.__organizaLastConfirmedPeriod = confirmedPeriod;
            activeInteraction = null;
            clearPendingInvoice();
            latestDocReview = null;
            emitDataChanged("invoice-confirm", confirmedPeriod ? { period: confirmedPeriod } : undefined);
          });
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
    recordChatSubmissionMeta(clean, "voice", true);
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
    const parts = text
      .split(/\s+(?:e\s+também|e\s+mais|e\s+|também\s+|além\s+disso\s+|\n|;)\s*/i)
      .filter((p) => p.trim().length > 0);
    if (parts.length <= 1) {
      sendTranscript(text);
      return;
    }
    let i = 0;
    function dispatchNext() {
      if (i >= parts.length) return;
      let part = parts[i].trim();
      const firstLower = text.toLowerCase();
      const lowerPart = part.toLowerCase();
      if (!lowerPart.startsWith("gastei") && !lowerPart.startsWith("paguei") && !lowerPart.startsWith("comprei")) {
        if (firstLower.startsWith("gastei")) part = "gastei " + part;
        else if (firstLower.startsWith("paguei")) part = "paguei " + part;
        else if (firstLower.startsWith("comprei")) part = "comprei " + part;
      }
      sendTranscript(part);
      i += 1;
      if (i < parts.length) {
        setTimeout(dispatchNext, 1200);
      }
    }
    dispatchNext();
  }

  function stopRecognition() {
    if (recognition && listening) {
      try {
        recognition.stop();
      } catch (_) {}
    }
    listening = false;
    setMicState("idle");
    showOcrThinking(false);
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
      showOcrThinking(true, "Entendendo o que você disse...", { immediate: true });
    };
    recognition.onresult = (event) => {
      const transcript = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
      showOcrThinking(false);
      handleVoiceTranscript(transcript);
    };
    recognition.onerror = (event) => {
      showOcrThinking(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        unavailable("Permita o microfone para falar com o Organiza AI.");
      } else if (event.error !== "aborted") {
        unavailable("Não consegui entender. Tente falar novamente.");
      }
    };
    recognition.onend = () => {
      listening = false;
      setMicState("idle");
      showOcrThinking(false);
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
      status.setAttribute("role", kind === "error" ? "alert" : "status");
      status.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
      status.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      status.style.fontSize = ".8125rem";
      status.style.padding = "0 8px";
      status.style.alignSelf = "flex-start";
      form.parentElement.appendChild(status);
    } else {
      status.setAttribute("role", kind === "error" ? "alert" : "status");
      status.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");
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

  function hasNonGreetingChatMessages() {
    return document.querySelectorAll('[id^="chat-assistant-msg-"], [id^="chat-user-msg-"]').length > 0;
  }

  async function confirmPendingInvoiceIfNeeded(userText) {
    const hasPending = (pendingInvoiceItems && pendingInvoiceItems.length > 0) ||
      (pendingCreditItems && pendingCreditItems.length > 0);
    if (!hasPending) return;
    const msg = (userText || "").trim().toLowerCase();
    if (!msg) return;
    if (msg.includes("esse pix foi") || msg.includes("o pix foi") || msg.startsWith("foi ") ||
        msg === "organizar meus gastos nas caixinhas" || msg === "organizar caixinhas" ||
        msg === "revisar movimentações" || msg === "revisar movimentacoes" ||
        msg === "ver meus gastos" || msg === "entender meus gastos" ||
        msg === "entender melhor meus gastos" ||
        msg === "registrar fatura" || msg === "registrar minha fatura" ||
        msg === "quero registrar" || msg === "quero registrar a fatura" ||
        msg === "corrigir uma informação" || msg === "corrigir uma informacao") {
      return;
    }
    const lastReply = lastAssistantReplyText();
    const awaitingFinalSave = lastReply.includes("Antes de eu salvar nas suas caixinhas") ||
      lastReply.includes("distribua esses gastos na regra") ||
      lastReply.includes("Quer que eu distribua") ||
      lastReply.includes("Posso guardar esses valores nas suas caixinhas") ||
      lastReply.includes("O que você gostaria de fazer agora?");
    if (!awaitingFinalSave) return;

    const isCancel = msg === "não" || msg === "nao" || msg.startsWith("não ") || msg.startsWith("nao ") ||
      msg.includes("cancela") || msg.includes("não salva") || msg.includes("nao salva") ||
      msg.includes("não salvar") || msg.includes("nao salvar");
    if (isCancel) {
      clearPendingInvoice();
      return;
    }

    const isAffirmation = msg === "sim" || msg === "sim!" || msg.startsWith("sim ") || msg.startsWith("sim,") ||
      msg.includes("confirmo") || msg.includes("confirma") || msg.includes("pode salvar") ||
      msg.includes("pode distribuir") || msg.includes("distribua") || msg === "ok";
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
    const savedPeriod = pendingDocumentPeriod;
    clearPendingInvoice();
    const authHeader = getAuthHeader();
    const payload = docId ? { items: itemsToConfirm, documentId: docId } : { items: itemsToConfirm };
    try {
      const resp = await nativeFetch("/api/invoices/confirm", {
        method: "POST",
        headers: { "Authorization": authHeader, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp && resp.ok) {
        const resBody = await resp.clone().json().catch(() => ({}));
        const confirmedPeriod = extractPeriodFromObject(resBody) || savedPeriod || lastUploadedPeriod || "";
        if (confirmedPeriod) window.__organizaLastConfirmedPeriod = confirmedPeriod;
        emitDataChanged("invoice-confirm", confirmedPeriod ? { period: confirmedPeriod } : undefined);
      } else {
        pendingInvoiceItems = savedExpenses;
        pendingCreditItems = savedCredit;
        pendingDocumentId = docId;
        pendingDocumentPeriod = savedPeriod;
      }
    } catch (_) {
      pendingInvoiceItems = savedExpenses;
      pendingCreditItems = savedCredit;
      pendingDocumentId = docId;
      pendingDocumentPeriod = savedPeriod;
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
      setAttachmentStatus("Esse formato de arquivo ainda não é aceito por aqui. Envie sua fatura ou extrato em PDF, PNG, JPEG ou DOCX, ou me conte seus gastos por texto ou por voz.", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAttachmentStatus("O arquivo deve ter no máximo 10 MB.", "error");
      return;
    }

    const authHeader = getAuthHeader();
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

    setAttachmentStatus("Lendo sua fatura...", "loading");
    showOcrThinking(true, "Lendo sua fatura...", { immediate: true });

    try {
      const fileBase64 = await fileAsBase64(file);
      const response = await nativeFetch("/api/invoices/parse", {
        method: "POST",
        headers: { "Authorization": authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64, filename: file.name })
      });
      const payload = await response.json().catch(() => ({}));
      const status = String(payload.status || "");

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
      const extractionFailed = !response.ok || status === "FALHA_EXTRACAO" || status === "EXTRACAO_FALHOU" || transactionsCount === 0;

      if (response.status === 413) {
        clearPendingInvoice();
        chatDocumentIdOnce = "";
        showOcrThinking(false);
        restoreDraft();
        setAttachmentStatus("O arquivo deve ter no máximo 10 MB.", "error");
        return;
      }

      if (response.status === 422 || response.status === 408) {
        clearPendingInvoice();
        chatDocumentIdOnce = "";
        showOcrThinking(false);
        restoreDraft();
        setAttachmentStatus(
          response.status === 422
            ? "Esse arquivo não consta como uma fatura. Faça o upload de uma fatura para que eu organize a sua grana sem estresse."
            : "A leitura do arquivo demorou demais. Tente uma imagem menor ou mais nítida.",
          "error"
        );
        return;
      }

      if (response.status === 402 || response.status === 503) {
        clearPendingInvoice();
        chatDocumentIdOnce = "";
        showOcrThinking(false);
        restoreDraft();
        setAttachmentStatus(
          response.status === 402
            ? "Você atingiu o limite de mensagens deste mês."
            : "O serviço está indisponível no momento. Tente novamente em instantes.",
          "error"
        );
        return;
      }

      if (extractionFailed) {
        clearPendingInvoice();
        chatDocumentIdOnce = "";
        showOcrThinking(false);
        setAttachmentStatus("Esse arquivo não consta como uma fatura. Faça o upload de uma fatura para que eu organize a sua grana sem estresse.", "error");
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
      pendingDocumentPeriod = extractPeriodFromObject(payload);
      if (pendingDocumentPeriod) lastUploadedPeriod = pendingDocumentPeriod;
      chatDocumentIdOnce = pendingDocumentId;

      resetPanelState(false);
      activeInteraction = null;
      const normalized = normalizeReviewPayload({
        documentId: pendingDocumentId,
        filename: file.name,
        status: status || "EM_REVISAO",
        statementPeriod: pendingDocumentPeriod,
        reconciled: payload.reconciled,
        warnings: payload.warnings,
        transactions: canonical
      });
      if (normalized) {
        latestDocReview = normalized;
        latestDocFetchedForAuth = authHeader;
        syncPendingFromReview(normalized);
      } else {
        const expenseIds = new Set(summaryLines
          .filter((l) => l.flowClass === "DESPESA" && Number.isInteger(l.amountMinor) && l.amountMinor > 0)
          .map((l) => l.txId));
        const creditOpIds = new Set(summaryLines
          .filter((l) => l.flowClass === "OPERACAO_CREDITO" && Number.isInteger(l.amountMinor) && l.amountMinor > 0)
          .map((l) => l.txId));
        const toConfirmItem = (t) => ({
          description: String(t.descriptionNormalized || t.descriptionRaw || "").trim() || "Despesa da fatura",
          amount: t.amountMinor / 100,
          category: String(t.category || "OTHER")
        });
        const isExcludedFlow = (t) => t.flowClass === "PAGAMENTO_FATURA" || t.flowClass === "PENDENTE_REVISAO";
        if (summaryLines.length > 0) {
          pendingInvoiceItems = canonical
            .filter((t) => !isExcludedFlow(t) && expenseIds.has(t.id) && Number.isInteger(t.amountMinor) && t.amountMinor > 0)
            .map(toConfirmItem);
          pendingCreditItems = canonical
            .filter((t) => !isExcludedFlow(t) && creditOpIds.has(t.id) && Number.isInteger(t.amountMinor) && t.amountMinor > 0)
            .map(toConfirmItem);
        } else {
          pendingInvoiceItems = canonical
            .filter((t) => !isExcludedFlow(t) && Number.isInteger(t.amountMinor) && t.amountMinor > 0 && t.direction !== "CREDIT" &&
              t.kind !== "PAYMENT" && t.kind !== "INCOME" && t.kind !== "REFUND" &&
              t.reviewStatus !== "NEEDS_REVIEW" && t.reviewStatus !== "PENDENTE_REVISAO" &&
              (t.reviewStatus === "CONFIRMED" || t.kind === "FEE" || t.kind === "INTEREST"))
            .map(toConfirmItem);
          pendingCreditItems = canonical
            .filter((t) => !isExcludedFlow(t) && Number.isInteger(t.amountMinor) && t.amountMinor > 0 && t.direction !== "CREDIT" && t.kind === "CARD_EXIT")
            .map(toConfirmItem);
        }
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
        recordChatSubmissionMeta(msgText, "extract", true);
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
      setAttachmentStatus((error && error.message) || "Não foi possível analisar a fatura.", "error");
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

  // =========================================================================
  // Painel Interativo do Chat (ETAPA 2 / ETAPA 3 / Multi-Select Reutilizável)
  // =========================================================================

  // O painel interativo em JS (#chat-interactive-panel) foi removido: os cards
  // do chat são só os componentes Kof de frontend/screens/chat_screen.kf.
  // Esta ponte mantém apenas o que o Kof ainda não oferece no navegador:
  // voz (Web Speech), upload de arquivo (UIW006) e as ondas animadas.

  document.addEventListener("submit", (event) => {
    const form = event.target && event.target.id === "chat-form" ? event.target : null;
    if (!form) return;
    const input = document.getElementById("chat-input");
    const val = input ? input.value : "";
    recordChatSubmissionMeta(val, "", false);
    confirmPendingInvoiceIfNeeded(val);
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
      const val = input ? input.value : "";
      recordChatSubmissionMeta(val, "", false);
      confirmPendingInvoiceIfNeeded(val);
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

  // Chat interativo: respostas com card (checklist, revisão, caixinhas) chegam em
  // poucos ms porque são determinísticas; o anti-flicker de 120 ms escondia as
  // ondas. Para o QA ver o trabalho, o card só aparece após no mínimo 700 ms do
  // envio, com as ondas + texto contextual no lugar. Respostas só de texto não
  // esperam. Exceção registrada à regra "não atrasar artificialmente" (spec §3).
  const INTERACTIVE_MIN_WAVES_MS = 700;
  let interactiveHoldForRequest = 0;
  let interactiveHoldUntil = 0;
  let interactiveHoldTimer = null;
  function holdInteractiveCard() {
    const card = document.getElementById("chat-interaction-card");
    if (!card) return;
    const now = Date.now();
    const started = lastChatRequestStartedAt;
    if (started > 0 && interactiveHoldForRequest !== started && now - started < INTERACTIVE_MIN_WAVES_MS) {
      interactiveHoldForRequest = started;
      interactiveHoldUntil = started + INTERACTIVE_MIN_WAVES_MS;
    }
    const placeholderId = "chat-interaction-waves";
    let placeholder = document.getElementById(placeholderId);
    if (now < interactiveHoldUntil) {
      card.style.display = "none";
      if (!placeholder) {
        ensureWaveAnimStyle();
        placeholder = document.createElement("div");
        placeholder.id = placeholderId;
        placeholder.className = "organiza-thinking-bubble";
        placeholder.setAttribute("role", "status");
        placeholder.setAttribute("aria-live", "polite");
        placeholder.style.display = "inline-flex";
        placeholder.style.alignItems = "center";
        placeholder.style.gap = "12px";
        placeholder.style.alignSelf = "flex-start";
        placeholder.appendChild(createOrganizaWaveSvg(isLightTheme(), "hold"));
        const span = document.createElement("span");
        span.className = "organiza-thinking-text";
        span.textContent = resolveChatContext(lastChatRequestText, lastChatRequestSource, lastChatRequestOpType || "");
        placeholder.appendChild(span);
        card.parentNode.insertBefore(placeholder, card);
      }
      if (!interactiveHoldTimer) {
        interactiveHoldTimer = setTimeout(() => {
          interactiveHoldTimer = null;
          holdInteractiveCard();
        }, Math.max(10, interactiveHoldUntil - now));
      }
      return;
    }
    card.style.display = "";
    if (placeholder) placeholder.remove();
  }

  function onDomMutated() {
    holdInteractiveCard();
    readNewAssistantReplies();
    enhanceChatTyping();
  }

  new MutationObserver(onDomMutated).observe(document.documentElement, { childList: true, subtree: true });
  ensureWaveAnimStyle();
  onDomMutated();
})();
