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
  let latestDocFetching = false;
  let panelDom = null;
  let panelSyncQueued = false;
  let panelNeedsRender = false;

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

  function formatPeriodPt(ym) {
    if (!isValidYearMonth(ym)) return "";
    const parts = ym.trim().split("-");
    const year = parts[0];
    const monthIdx = Number(parts[1]) - 1;
    const monthName = MONTH_NAMES_PT[monthIdx] || parts[1];
    return `${monthName} de ${year}`;
  }

  function formatBrlMinor(minor) {
    const reais = Number(minor || 0) / 100;
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(reais);
    } catch (_) {
      return "R$ " + reais.toFixed(2).replace(".", ",");
    }
  }

  function categoryLabelPt(code) {
    const upper = String(code || "OTHER").trim().toUpperCase();
    return CATEGORY_LABELS[upper] || "Outros";
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

  function isConfirmableOutflowTx(tx) {
    if (!tx || !Number.isInteger(Number(tx.amountMinor)) || Number(tx.amountMinor) <= 0) return false;
    if (tx.direction === "CREDIT") return false;
    const fc = flowClassOf(tx);
    return fc === "DESPESA" || fc === "OPERACAO_CREDITO";
  }

  function isPendingReviewTx(tx) {
    if (!tx) return false;
    if (tx.reviewStatus === "NEEDS_REVIEW" || tx.reviewStatus === "PENDENTE_REVISAO") return true;
    return flowClassOf(tx) === "PENDENTE_REVISAO" && tx.direction !== "CREDIT" &&
      tx.kind !== "PAYMENT" && tx.kind !== "INCOME" && tx.kind !== "REFUND";
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
      removeInteractivePanel();
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
      removeInteractivePanel();
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
      queuePanelSync(true);
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
                refreshDocumentReview(docToSync, true);
              }
              queuePanelSync(true);
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
              queuePanelSync(true);
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
            queuePanelSync(true);
          }).catch(() => {
            const confirmedPeriod = pendingDocumentPeriod || lastUploadedPeriod || "";
            if (confirmedPeriod) window.__organizaLastConfirmedPeriod = confirmedPeriod;
            activeInteraction = null;
            clearPendingInvoice();
            latestDocReview = null;
            emitDataChanged("invoice-confirm", confirmedPeriod ? { period: confirmedPeriod } : undefined);
            queuePanelSync(true);
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
        msg === "organizar meus gastos nas caixinhas" || msg === "entender melhor meus gastos" ||
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
      queuePanelSync();
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

  async function fetchJsonAuthed(url, options) {
    const authHeader = getAuthHeader();
    const headers = Object.assign(
      { "Content-Type": "application/json" },
      authHeader ? { "Authorization": authHeader } : {},
      (options && options.headers) || {}
    );
    const resp = await nativeFetch(url, Object.assign({}, options || {}, { headers }));
    const data = await resp.json().catch(() => null);
    return { resp, data };
  }

  function resolveActivePeriod(interaction) {
    const candidates = [
      interaction && interaction.period,
      latestDocReview && latestDocReview.statementPeriod,
      pendingDocumentPeriod,
      lastUploadedPeriod,
      window.__organizaLastConfirmedPeriod
    ];
    for (const c of candidates) {
      if (isValidYearMonth(c)) return c.trim();
    }
    return "";
  }

  async function refreshLatestDocument(force) {
    const authHeader = getAuthHeader();
    if (!authHeader || latestDocFetching) return latestDocReview;
    if (!force && latestDocFetchedForAuth === authHeader) return latestDocReview;

    latestDocFetching = true;
    latestDocFetchedForAuth = authHeader;
    try {
      const { resp, data } = await fetchJsonAuthed("/api/documents/latest", { method: "GET" });
      if (resp.ok && data) {
        if (data.interaction && typeof data.interaction === "object") {
          const docIdFromInt = String(data.interaction.documentId || data.documentId || "").trim();
          const justConfirmedThis = Boolean(
            panelState.confirmedDocId &&
            docIdFromInt === panelState.confirmedDocId &&
            (panelState.activeCard === "confirmed" || data.status === "IMPORTADO")
          );
          if (!justConfirmedThis) {
            activeInteraction = data.interaction;
          }
        }
        const rev = normalizeReviewPayload(data);
        if (rev) {
          latestDocReview = rev;
          activeInteraction = data.interaction && typeof data.interaction === "object"
            ? data.interaction
            : null;
          if (rev.status === "EM_REVISAO") {
            syncPendingFromReview(rev);
          }
          queuePanelSync(true);
          return rev;
        }
        if (activeInteraction) {
          queuePanelSync(true);
        }
      }
      if (pendingDocumentId) {
        return await refreshDocumentReview(pendingDocumentId, false);
      }
    } catch (_) {
      // Falha silenciosa na descoberta automática de documento pendente.
    } finally {
      latestDocFetching = false;
    }
    return latestDocReview;
  }

  async function refreshDocumentReview(docId, silent) {
    const cleanId = String(docId || pendingDocumentId || (latestDocReview && latestDocReview.documentId) || "").trim();
    if (!cleanId) {
      return await refreshLatestDocument(true);
    }
    try {
      const { resp, data } = await fetchJsonAuthed(`/api/documents/${encodeURIComponent(cleanId)}/review`, { method: "GET" });
      if (resp.ok && data) {
        const rev = normalizeReviewPayload(data);
        if (rev) {
          latestDocReview = rev;
          if (rev.status === "EM_REVISAO") {
            syncPendingFromReview(rev);
          }
          queuePanelSync(true);
          return rev;
        }
      }
    } catch (err) {
      if (!silent) {
        panelState.error = (err && err.message) || "Não foi possível carregar os dados do documento.";
      }
    }
    return latestDocReview;
  }

  function shouldShowInteractivePanel() {
    if (!document.getElementById("chat-messages")) return false;
    if (panelState.activeCard === "confirmed" && panelState.confirmedSummary) return true;
    if (activeInteraction && Array.isArray(activeInteraction.options) && activeInteraction.options.length > 0) return true;
    if (latestDocReview && latestDocReview.status === "EM_REVISAO") return true;
    return false;
  }

  function removeInteractivePanel() {
    if (panelDom && panelDom.parentElement) {
      panelDom.remove();
    }
    const existing = document.getElementById("chat-interactive-panel");
    if (existing) existing.remove();
    document.querySelectorAll('[data-organiza-interaction-hidden="true"]').forEach((message) => {
      message.hidden = false;
      message.removeAttribute("aria-hidden");
      delete message.dataset.organizaInteractionHidden;
    });
    panelDom = null;
  }

  function hideReplyRepresentedByInteraction(list) {
    const replies = list.querySelectorAll('[id^="chat-assistant-msg-"]');
    const latestReply = replies.length > 0 ? replies[0] : null;
    if (!latestReply || latestReply.dataset.organizaInteractionHidden === "true") return;
    latestReply.dataset.organizaInteractionHidden = "true";
    latestReply.hidden = true;
    latestReply.setAttribute("aria-hidden", "true");
  }

  function placePanelInChatList(list, panel) {
    if (!list || !panel) return;
    const typingEl = document.getElementById("chat-typing");
    const ocrEl = document.getElementById("chat-ocr-thinking");
    let anchor = list.firstChild;
    while (anchor && (anchor === typingEl || anchor === ocrEl)) {
      anchor = anchor.nextSibling;
    }
    if (anchor === panel) return;
    list.insertBefore(panel, anchor || null);
  }

  function navigateToDashboard() {
    const navDash = document.getElementById("nav-dashboard");
    if (navDash) navDash.click();
  }

  function createStrokeSvg(paths, size, clsName) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size || 18));
    svg.setAttribute("height", String(size || 18));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.9");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    if (clsName) svg.setAttribute("class", clsName);
    for (const d of paths) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    }
    return svg;
  }

  function createActionIconSvg(iconName) {
    const name = String(iconName || "").toLowerCase();
    if (name === "chart") {
      return createStrokeSvg([
        "M21.21 15.89A10 10 0 1 1 8 2.83",
        "M22 12A10 10 0 0 0 12 2v10z"
      ], 18, "organiza-action-icon");
    }
    if (name === "wallet") {
      return createStrokeSvg([
        "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
        "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"
      ], 18, "organiza-action-icon");
    }
    if (name === "checklist") {
      return createStrokeSvg([
        "M9 6h11",
        "M9 12h11",
        "M9 18h11",
        "m3 6 1.5 1.5L7 5",
        "m3 12 1.5 1.5L7 11",
        "m3 18 1.5 1.5L7 17"
      ], 18, "organiza-action-icon");
    }
    return createStrokeSvg([
      "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z",
      "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"
    ], 18, "organiza-action-icon");
  }

  function createLightbulbSvg() {
    return createStrokeSvg([
      "M9 18h6",
      "M10 22h4",
      "M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"
    ], 18, "organiza-edu-icon");
  }

  function createChevronSvg() {
    return createStrokeSvg(["m9 6 6 6-6 6"], 16, "organiza-details-chevron");
  }

  function buildFallbackInteractionFromReview(rev, summaryOverride) {
    if (!rev) return null;
    const txs = Array.isArray(rev.transactions) ? rev.transactions : [];
    let incomeCount = 0;
    let incomeMinor = 0;
    let refundCount = 0;
    let refundMinor = 0;
    let expenseCount = 0;
    let expenseMinor = 0;
    let creditCount = 0;
    let creditMinor = 0;
    let billPayCount = 0;
    let billPayMinor = 0;
    let pendingCount = 0;
    let pendingMinor = 0;

    for (const tx of txs) {
      const fc = flowClassOf(tx);
      const amt = Number(tx.amountMinor || 0);
      if (fc === "RECEITA") {
        incomeCount += 1;
        incomeMinor += amt;
      } else if (fc === "ESTORNO") {
        refundCount += 1;
        refundMinor += amt;
      } else if (fc === "DESPESA") {
        expenseCount += 1;
        expenseMinor += amt;
      } else if (fc === "OPERACAO_CREDITO") {
        creditCount += 1;
        creditMinor += amt;
      } else if (fc === "PAGAMENTO_FATURA") {
        billPayCount += 1;
        billPayMinor += amt;
      } else if (isPendingReviewTx(tx)) {
        pendingCount += 1;
        pendingMinor += amt;
      }
    }

    const s = summaryOverride && typeof summaryOverride === "object" ? summaryOverride : null;
    const totalIncomeMinor = s && s.incomeMinor != null ? Number(s.incomeMinor) : incomeMinor;
    const totalIncomeCount = s && s.incomeCount != null ? Number(s.incomeCount) : incomeCount;
    const totalRefundMinor = s && s.refundMinor != null ? Number(s.refundMinor) : refundMinor;
    const totalRefundCount = s && s.refundCount != null ? Number(s.refundCount) : refundCount;
    const totalExpenseMinor = s && s.expenseMinor != null ? Number(s.expenseMinor) : expenseMinor;
    const totalExpenseCount = s && s.expenseCount != null ? Number(s.expenseCount) : expenseCount;
    const totalCreditMinor = s && s.creditOperationMinor != null ? Number(s.creditOperationMinor) : creditMinor;
    const totalCreditCount = s && s.creditOperationCount != null ? Number(s.creditOperationCount) : creditCount;
    const totalPendingMinor = s && s.pendingMinor != null ? Number(s.pendingMinor) : pendingMinor;
    const totalPendingCount = s && s.pendingCount != null ? Number(s.pendingCount) : pendingCount;
    const totalBillPayMinor = s && s.billPaymentMinor != null ? Number(s.billPaymentMinor) : billPayMinor;
    const totalBillPayCount = s && s.billPaymentCount != null ? Number(s.billPaymentCount) : billPayCount;
    const confirmableMinor = s && s.confirmableExpenseMinor != null ? Number(s.confirmableExpenseMinor) : (totalExpenseMinor + totalCreditMinor);
    const confirmableCount = s && s.confirmableExpenseCount != null ? Number(s.confirmableExpenseCount) : (totalExpenseCount + totalCreditCount);

    const period = isValidYearMonth(rev.statementPeriod) ? rev.statementPeriod.trim() : "";
    const periodLabel = period ? formatPeriodPt(period) : "Período a confirmar";

    const entradas = [];
    if (totalIncomeCount > 0) {
      entradas.push({
        label: "Entradas identificadas",
        formattedAmount: formatBrlMinor(totalIncomeMinor),
        count: totalIncomeCount,
        note: null
      });
    }
    if (totalRefundCount > 0) {
      entradas.push({
        label: "Estornos e créditos",
        formattedAmount: formatBrlMinor(totalRefundMinor),
        count: totalRefundCount,
        note: null
      });
    }

    const saidas = [
      {
        label: "Despesas confirmadas",
        formattedAmount: formatBrlMinor(totalExpenseMinor),
        count: totalExpenseCount,
        note: "Prontas para suas caixinhas"
      }
    ];
    if (totalCreditCount > 0) {
      saidas.push({
        label: "Compras e Pix no cartão de crédito",
        formattedAmount: formatBrlMinor(totalCreditMinor),
        count: totalCreditCount,
        note: "Separado do saldo à vista"
      });
    }
    if (totalPendingCount > 0) {
      saidas.push({
        label: "Aguardando sua revisão",
        formattedAmount: formatBrlMinor(totalPendingMinor),
        count: totalPendingCount,
        note: "Não entra nos gastos sem sua confirmação"
      });
    }

    let educationTip = "Separar seus gastos em caixinhas ajuda a acompanhar seu mês com calma antes de o limite apertar.";
    if (totalBillPayCount > 0) {
      educationTip = "Pagamentos de fatura ficam separados para evitar dupla contagem: cada compra conta uma vez quando acontece, não quando você paga o boleto.";
    } else if (totalCreditCount > 0) {
      educationTip = "Compras e Pix no cartão de crédito consomem seu orçamento futuro e ficam separados do dinheiro disponível hoje na conta.";
    } else if (totalPendingCount > 0) {
      educationTip = "Movimentações sem categoria clara (como Pix para pessoas físicas) ficam fora dos seus gastos até você confirmar o que foram.";
    }

    const warnings = Array.isArray(rev.warnings) ? rev.warnings : [];
    const internalWarnings = warnings.filter((w) => typeof w === "string" && w.startsWith("Movimentacao interna ignorada"));
    const internalCount = s && s.internalTransferCount != null ? Number(s.internalTransferCount) : internalWarnings.length;
    const internalMinor = s && s.internalTransferMinor != null ? Number(s.internalTransferMinor) : 0;
    const totalRows = s && s.totalStatementRows != null ? Number(s.totalStatementRows) : (txs.length + internalCount);

    const detailItems = [
      `Arquivo analisado: ${rev.filename || "sua fatura"}`,
      `Movimentações lidas no documento: ${totalRows} (${txs.length} ${txs.length === 1 ? "registro" : "registros"} identificados)`,
      `Transferências internas deixadas de fora (sem dupla contagem): ${formatBrlMinor(internalMinor)} (${internalCount} ${internalCount === 1 ? "registro" : "registros"})`,
      `Pagamentos de fatura deixados de fora (sem dupla contagem): ${formatBrlMinor(totalBillPayMinor)} (${totalBillPayCount} ${totalBillPayCount === 1 ? "registro" : "registros"})`
    ];
    if (!rev.reconciled) {
      detailItems.push("Conferência de soma: os itens lidos diferem do total impresso no documento; confira antes de salvar.");
    }
    for (const tx of txs) {
      if (isPendingReviewTx(tx)) {
        const ev = tx.evidence || {};
        const desc = String(tx.descriptionRaw || tx.descriptionNormalized || "Item pendente").trim();
        const page = ev.page != null ? ev.page : 1;
        const row = ev.row != null ? ev.row : 0;
        detailItems.push(`Pendente: ${desc} · ${formatBrlMinor(tx.amountMinor)} (página ${page}, linha ${row})`);
      }
    }

    return {
      type: "SINGLE_ACTION",
      prompt: "O que você quer fazer agora?",
      documentId: rev.documentId,
      period: period || null,
      periodLabel,
      headline: period ? `Resumo de ${periodLabel}` : "Resumo da sua fatura",
      educationTip,
      summary: {
        periodLabel,
        totalInflowsText: formatBrlMinor(totalIncomeMinor),
        inflowsCount: totalIncomeCount + totalRefundCount,
        entradas,
        totalOutflowsText: formatBrlMinor(confirmableMinor),
        outflowsCount: confirmableCount,
        saidas,
        pendingText: formatBrlMinor(totalPendingMinor),
        pendingCount: totalPendingCount
      },
      details: {
        title: "Detalhes da análise",
        items: detailItems
      },
      options: [
        { id: "opt_view_expenses", label: "Ver meus gastos", action: "VIEW_EXPENSES", intent: "CONSULTAR_GASTOS", icon: "chart", badgeCount: 0 },
        { id: "opt_organize_caixinhas", label: "Organizar caixinhas", action: "ORGANIZE_CAIXINHAS", intent: "CONFIRMAR_IMPORTACAO", icon: "wallet", badgeCount: 0 },
        { id: "opt_review_movements", label: "Revisar movimentações", action: "REVIEW_MOVEMENTS", intent: "RECLASSIFICAR_MOVIMENTACOES", icon: "checklist", badgeCount: totalPendingCount },
        { id: "opt_understand_expenses", label: "Entender meus gastos", action: "UNDERSTAND_EXPENSES", intent: "EXPLICAR_GASTOS", icon: "book", badgeCount: 0 }
      ]
    };
  }

  function resolveEffectiveInteraction() {
    if (activeInteraction && Array.isArray(activeInteraction.options) && activeInteraction.options.length > 0) {
      return activeInteraction;
    }
    if (latestDocReview && latestDocReview.status === "EM_REVISAO") {
      return buildFallbackInteractionFromReview(latestDocReview, null);
    }
    return null;
  }

  // =========================================================================
  // Componente Reutilizável de Checkboxes Multi-Select (window.OrganizaMultiSelect)
  // =========================================================================

  function createMultiSelectCard(rawConfig) {
    const config = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
    const groups = Array.isArray(config.groups) && config.groups.length > 0 ? config.groups : null;
    const flatItems = !groups && Array.isArray(config.items) ? config.items : [];

    const allItems = [];
    const itemById = new Map();
    const registerItem = (rawItem) => {
      if (!rawItem || rawItem.id == null) return null;
      const id = String(rawItem.id);
      const normalized = Object.assign({}, rawItem, { id });
      allItems.push(normalized);
      itemById.set(id, normalized);
      return normalized;
    };

    const normalizedGroups = groups
      ? groups.map((g, idx) => {
          const items = (Array.isArray(g.items) ? g.items : []).map(registerItem).filter(Boolean);
          return Object.assign({}, g, {
            key: String(g.key || g.label || `group-${idx}`),
            label: String(g.label || g.key || `Grupo ${idx + 1}`),
            items
          });
        })
      : null;
    const normalizedFlatItems = groups ? [] : flatItems.map(registerItem).filter(Boolean);

    const selectedSet = new Set(
      Array.from(config.initialSelectedIds || [])
        .map(String)
        .filter((id) => itemById.has(id))
    );

    const card = document.createElement("div");
    if (config.id) card.id = String(config.id);
    card.className = "organiza-card";

    const head = document.createElement("div");
    head.className = "organiza-card-head";
    const titleWrap = document.createElement("div");
    titleWrap.style.display = "flex";
    titleWrap.style.flexDirection = "column";
    titleWrap.style.gap = "2px";
    const title = document.createElement("h3");
    title.className = "organiza-card-title";
    title.textContent = String(config.title || "Selecionar itens");
    titleWrap.appendChild(title);
    if (config.subtitle) {
      const sub = document.createElement("span");
      sub.className = "organiza-muted";
      sub.textContent = String(config.subtitle);
      titleWrap.appendChild(sub);
    }
    head.appendChild(titleWrap);
    if (config.badgeText) {
      const badge = document.createElement("span");
      badge.className = "organiza-period-badge";
      badge.textContent = String(config.badgeText);
      head.appendChild(badge);
    }
    card.appendChild(head);

    let masterCb = null;
    const groupRefs = [];
    const itemCheckboxMap = new Map();
    const summaryEl = document.createElement("div");
    summaryEl.className = "organiza-selection-summary";
    const localAlertSlot = document.createElement("div");
    let confirmBtn = null;

    const getSelectedItems = () => allItems.filter((it) => selectedSet.has(it.id));

    const clearLocalError = () => {
      localAlertSlot.textContent = "";
    };

    const showLocalError = (msg) => {
      localAlertSlot.textContent = "";
      if (!msg) return;
      const err = document.createElement("div");
      err.id = config.id ? `${config.id}-feedback` : "organiza-multiselect-feedback";
      err.className = "organiza-inline-alert is-error";
      err.setAttribute("role", "alert");
      err.textContent = String(msg);
      localAlertSlot.appendChild(err);
    };

    const syncUi = (notifyCaller) => {
      if (masterCb) {
        const checkedTotal = allItems.filter((it) => selectedSet.has(it.id)).length;
        masterCb.checked = allItems.length > 0 && checkedTotal === allItems.length;
        masterCb.indeterminate = checkedTotal > 0 && checkedTotal < allItems.length;
      }
      for (const gRef of groupRefs) {
        const checkedItems = gRef.group.items.filter((it) => selectedSet.has(it.id));
        const checkedCount = checkedItems.length;
        const totalInGroup = gRef.group.items.length;
        gRef.groupCb.checked = totalInGroup > 0 && checkedCount === totalInGroup;
        gRef.groupCb.indeterminate = checkedCount > 0 && checkedCount < totalInGroup;
        if (gRef.rightEl && typeof gRef.group.computeRightText === "function") {
          gRef.rightEl.textContent = gRef.group.computeRightText(checkedItems, gRef.group.items);
        } else if (gRef.rightEl && gRef.group.rightText != null) {
          gRef.rightEl.textContent = String(gRef.group.rightText);
        }
      }
      for (const [id, cb] of itemCheckboxMap.entries()) {
        cb.checked = selectedSet.has(id);
      }
      const selectedItems = getSelectedItems();
      if (typeof config.summaryFormatter === "function") {
        summaryEl.textContent = config.summaryFormatter(new Set(selectedSet), selectedItems, allItems);
      } else {
        summaryEl.textContent = `${selectedSet.size} de ${allItems.length} ${allItems.length === 1 ? "selecionado" : "selecionados"}`;
      }
      if (confirmBtn) {
        const invalidEmpty = Boolean(config.disableConfirmWhenEmpty && selectedSet.size === 0);
        confirmBtn.disabled = Boolean(config.loading || allItems.length === 0 || invalidEmpty);
      }
      if (notifyCaller && typeof config.onSelectionChange === "function") {
        config.onSelectionChange(new Set(selectedSet), selectedItems, card);
      }
    };

    const createItemRow = (item, inputClass) => {
      const row = document.createElement("div");
      row.className = "organiza-tx-row";

      const label = document.createElement("label");
      label.className = "organiza-check-label";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = `organiza-checkbox ${inputClass || "organiza-item-cb"}`.trim();
      if (item.inputId) cb.id = String(item.inputId);
      cb.value = item.id;
      cb.checked = selectedSet.has(item.id);
      cb.disabled = Boolean(config.loading || item.disabled);
      cb.addEventListener("change", () => {
        if (cb.checked) selectedSet.add(item.id);
        else selectedSet.delete(item.id);
        clearLocalError();
        syncUi(true);
      });
      itemCheckboxMap.set(item.id, cb);

      const textWrap = document.createElement("span");
      textWrap.className = "organiza-check-text-wrap";
      const mainText = document.createElement("span");
      mainText.textContent = String(item.label || item.id);
      textWrap.appendChild(mainText);
      if (item.meta) {
        const metaText = document.createElement("span");
        metaText.className = "organiza-muted";
        metaText.textContent = String(item.meta);
        textWrap.appendChild(metaText);
      }

      label.appendChild(cb);
      label.appendChild(textWrap);
      row.appendChild(label);

      if (item.rightText) {
        const right = document.createElement("span");
        right.className = "organiza-amount";
        right.textContent = String(item.rightText);
        row.appendChild(right);
      }
      return row;
    };

    if (allItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "organiza-muted";
      empty.style.margin = "0";
      empty.textContent = String(config.emptyText || "Nenhum item disponível para seleção.");
      card.appendChild(empty);
      if (config.emptyActionNode instanceof Node) {
        card.appendChild(config.emptyActionNode);
      }
    } else {
      if (config.selectAllLabel) {
        const allRow = document.createElement("div");
        allRow.className = "organiza-select-all-row";
        const allLabel = document.createElement("label");
        allLabel.className = "organiza-check-label";
        allLabel.style.fontWeight = "700";

        masterCb = document.createElement("input");
        masterCb.type = "checkbox";
        masterCb.className = "organiza-checkbox organiza-select-all-cb";
        masterCb.disabled = Boolean(config.loading);
        masterCb.addEventListener("change", () => {
          const checkAll = masterCb.checked;
          for (const it of allItems) {
            if (it.disabled) continue;
            if (checkAll) selectedSet.add(it.id);
            else selectedSet.delete(it.id);
          }
          clearLocalError();
          syncUi(true);
        });

        const allText = document.createElement("span");
        allText.textContent = String(config.selectAllLabel);
        allLabel.appendChild(masterCb);
        allLabel.appendChild(allText);
        allRow.appendChild(allLabel);
        card.appendChild(allRow);
      }

      if (normalizedGroups) {
        for (const group of normalizedGroups) {
          const groupBox = document.createElement("div");
          groupBox.className = "organiza-cat-group";
          groupBox.setAttribute("data-org-cat", group.label);
          groupBox.setAttribute("data-group-key", group.key);

          const catRow = document.createElement("div");
          catRow.className = "organiza-cat-row";

          const catLabel = document.createElement("label");
          catLabel.className = "organiza-check-label";
          catLabel.style.fontWeight = "700";

          const catCb = document.createElement("input");
          catCb.type = "checkbox";
          catCb.className = "organiza-checkbox organiza-cat-cb";
          catCb.disabled = Boolean(config.loading);
          catCb.addEventListener("change", () => {
            const checkAll = catCb.checked;
            for (const it of group.items) {
              if (it.disabled) continue;
              if (checkAll) selectedSet.add(it.id);
              else selectedSet.delete(it.id);
            }
            clearLocalError();
            syncUi(true);
          });

          const catText = document.createElement("span");
          catText.textContent = `${group.label} (${group.items.length} ${group.items.length === 1 ? "item" : "itens"})`;

          catLabel.appendChild(catCb);
          catLabel.appendChild(catText);

          const catAmount = document.createElement("span");
          catAmount.className = "organiza-amount organiza-cat-amount";

          catRow.appendChild(catLabel);
          catRow.appendChild(catAmount);
          groupBox.appendChild(catRow);

          const sublist = document.createElement("div");
          sublist.className = "organiza-tx-sublist";
          for (const item of group.items) {
            sublist.appendChild(createItemRow(item, "organiza-tx-cb"));
          }
          groupBox.appendChild(sublist);
          card.appendChild(groupBox);

          groupRefs.push({ group, groupCb: catCb, rightEl: catAmount });
        }
      } else {
        const listWrap = document.createElement("div");
        listWrap.className = "organiza-cat-group";
        for (const item of normalizedFlatItems) {
          listWrap.appendChild(createItemRow(item, "organiza-review-cb"));
        }
        card.appendChild(listWrap);
      }
    }

    if (typeof config.extraContentNode === "function") {
      const extra = config.extraContentNode(new Set(selectedSet), getSelectedItems());
      if (extra && (typeof Node === "function" ? extra instanceof Node : typeof extra.nodeType === "number")) {
        card.appendChild(extra);
      }
    } else if (config.extraContentNode && (typeof Node === "function" ? config.extraContentNode instanceof Node : typeof config.extraContentNode.nodeType === "number")) {
      card.appendChild(config.extraContentNode);
    }

    if (config.error) {
      showLocalError(config.error);
    } else if (config.info) {
      const info = document.createElement("div");
      info.id = config.id ? `${config.id}-feedback` : "organiza-multiselect-feedback";
      info.className = "organiza-inline-alert is-success";
      info.setAttribute("role", "status");
      info.textContent = String(config.info);
      localAlertSlot.appendChild(info);
    }
    card.appendChild(localAlertSlot);

    const footer = document.createElement("div");
    footer.className = "organiza-card-footer";
    footer.appendChild(summaryEl);

    const footerActions = document.createElement("div");
    footerActions.className = "organiza-footer-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    if (config.cancelId) cancelBtn.id = String(config.cancelId);
    cancelBtn.className = "organiza-secondary-btn";
    cancelBtn.textContent = String(config.cancelLabel || "Cancelar");
    cancelBtn.disabled = Boolean(config.loading);
    cancelBtn.addEventListener("click", () => {
      selectedSet.clear();
      clearLocalError();
      syncUi(false);
      if (typeof config.onCancel === "function") {
        config.onCancel(card);
      }
    });
    footerActions.appendChild(cancelBtn);

    confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    if (config.confirmId) confirmBtn.id = String(config.confirmId);
    confirmBtn.className = "organiza-primary-btn";
    confirmBtn.textContent = String(config.confirmLabel || "Confirmar");
    confirmBtn.addEventListener("click", () => {
      if (config.loading) return;
      if (selectedSet.size === 0) {
        showLocalError(config.emptyErrorText || "Selecione pelo menos um item para continuar.");
        return;
      }
      clearLocalError();
      if (typeof config.onConfirm === "function") {
        config.onConfirm(new Set(selectedSet), getSelectedItems(), card);
      }
    });
    footerActions.appendChild(confirmBtn);
    footer.appendChild(footerActions);
    card.appendChild(footer);

    syncUi(false);
    return card;
  }

  window.OrganizaMultiSelect = {
    createMultiSelectCard
  };

  function initializeOrganizeSelection(rev) {
    if (!rev) return;
    const confirmable = rev.transactions.filter(isConfirmableOutflowTx);
    const key = `${rev.documentId}:${confirmable.map((t) => t.id).join(",")}`;
    if (panelState.organizeInitializedForKey === key) return;
    panelState.organizeInitializedForKey = key;
    panelState.selectedOrganizeIds = new Set(confirmable.map((t) => String(t.id)));
  }

  function buildPeriodPickerNode(initialPeriod) {
    const wrap = document.createElement("div");
    wrap.id = "chat-period-picker-wrap";
    wrap.className = "organiza-period-picker";

    const lbl = document.createElement("label");
    lbl.setAttribute("for", "chat-period-month");
    lbl.style.fontWeight = "700";
    lbl.style.fontSize = "0.85rem";
    lbl.textContent = "Mês e ano da fatura (obrigatório para organizar por período):";
    wrap.appendChild(lbl);

    const row = document.createElement("div");
    row.className = "organiza-picker-controls";

    const fallbackYm = isValidYearMonth(panelState.manualPeriod)
      ? panelState.manualPeriod
      : (isValidYearMonth(initialPeriod) ? initialPeriod : currentYearMonth());
    const [initYear, initMonth] = fallbackYm.split("-");
    panelState.manualPeriod = `${initYear}-${initMonth}`;

    const monthSelect = document.createElement("select");
    monthSelect.id = "chat-period-month";
    monthSelect.className = "organiza-select";
    monthSelect.setAttribute("aria-label", "Mês da fatura");
    MONTH_NAMES_PT.forEach((mName, idx) => {
      const opt = document.createElement("option");
      const val = String(idx + 1).padStart(2, "0");
      opt.value = val;
      opt.textContent = mName;
      if (val === initMonth) opt.selected = true;
      monthSelect.appendChild(opt);
    });

    const yearSelect = document.createElement("select");
    yearSelect.id = "chat-period-year";
    yearSelect.className = "organiza-select";
    yearSelect.setAttribute("aria-label", "Ano da fatura");
    const curYear = new Date().getFullYear();
    for (let y = curYear - 2; y <= curYear + 1; y += 1) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (String(y) === initYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }

    const syncPeriod = () => {
      panelState.manualPeriod = `${yearSelect.value}-${monthSelect.value}`;
    };
    monthSelect.addEventListener("change", syncPeriod);
    yearSelect.addEventListener("change", syncPeriod);

    row.appendChild(monthSelect);
    row.appendChild(yearSelect);
    wrap.appendChild(row);
    return wrap;
  }

  function renderFlowSummaryBox(boxId, titleText, totalText, rows, emptyText, isEntradas) {
    const box = document.createElement("div");
    box.id = boxId;
    box.className = `organiza-flow-card ${isEntradas ? "is-entradas" : "is-saidas"}`;

    const head = document.createElement("div");
    head.className = "organiza-flow-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "organiza-flow-title-wrap";
    const dot = document.createElement("span");
    dot.className = "organiza-flow-dot";
    dot.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "organiza-flow-title";
    title.textContent = titleText;
    titleWrap.appendChild(dot);
    titleWrap.appendChild(title);

    const total = document.createElement("span");
    total.className = "organiza-flow-total";
    total.textContent = String(totalText || "R$ 0,00");

    head.appendChild(titleWrap);
    head.appendChild(total);
    box.appendChild(head);

    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "organiza-flow-empty";
      empty.textContent = emptyText;
      box.appendChild(empty);
      return box;
    }

    const rowsWrap = document.createElement("div");
    rowsWrap.className = "organiza-flow-rows";
    for (const item of list) {
      const row = document.createElement("div");
      row.className = "organiza-flow-row";

      const textCol = document.createElement("div");
      textCol.className = "organiza-flow-row-text";
      const lbl = document.createElement("span");
      lbl.textContent = String(item.label || "");
      textCol.appendChild(lbl);
      if (item.note) {
        const note = document.createElement("span");
        note.className = "organiza-flow-row-note";
        note.textContent = String(item.note);
        textCol.appendChild(note);
      }

      const amt = document.createElement("span");
      amt.className = "organiza-amount";
      amt.textContent = String(item.formattedAmount || "R$ 0,00");

      row.appendChild(textCol);
      row.appendChild(amt);
      rowsWrap.appendChild(row);
    }
    box.appendChild(rowsWrap);
    return box;
  }

  function resolveOptionMeta(opt) {
    const action = String((opt && opt.action) || "").trim().toUpperCase();
    if (action === "VIEW_EXPENSES") {
      return { domId: "chat-act-view", activeKey: "view", icon: (opt && opt.icon) || "chart", handler: handleViewExpenses };
    }
    if (action === "ORGANIZE_CAIXINHAS") {
      return { domId: "chat-act-organize", activeKey: "organize", icon: (opt && opt.icon) || "wallet", handler: handleOpenOrganize };
    }
    if (action === "REVIEW_MOVEMENTS") {
      return { domId: "chat-act-review", activeKey: "review", icon: (opt && opt.icon) || "checklist", handler: handleOpenReview };
    }
    if (action === "UNDERSTAND_EXPENSES") {
      return { domId: "chat-act-edu", activeKey: "edu", icon: (opt && opt.icon) || "book", handler: handleUnderstandExpenses };
    }
    return null;
  }

  function renderStructuredSummaryCard(interaction, isLight) {
    const card = document.createElement("div");
    card.id = "chat-interaction-card";
    card.className = "organiza-card";

    const head = document.createElement("div");
    head.id = "chat-interaction-head";
    head.className = "organiza-card-head";

    const brandRow = document.createElement("div");
    brandRow.className = "organiza-brand-row";
    const brandMark = document.createElement("img");
    brandMark.className = "organiza-brand-mark";
    brandMark.src = isLight ? "assets/brand/organiza-simbolo-light.svg" : "assets/brand/organiza-simbolo.svg";
    brandMark.alt = "";
    brandMark.setAttribute("aria-hidden", "true");
    brandRow.appendChild(brandMark);
    const brandBadge = document.createElement("span");
    brandBadge.className = "organiza-brand-badge";
    brandBadge.textContent = "Organiza AI";
    brandRow.appendChild(brandBadge);
    head.appendChild(brandRow);

    const periodBadge = document.createElement("span");
    periodBadge.id = "chat-interaction-period";
    periodBadge.className = "organiza-period-badge";
    periodBadge.textContent = String(
      interaction.periodLabel ||
      (interaction.summary && interaction.summary.periodLabel) ||
      "Período a confirmar"
    );
    head.appendChild(periodBadge);
    card.appendChild(head);

    const headline = document.createElement("h2");
    headline.id = "chat-interaction-headline";
    headline.className = "organiza-result-title";
    headline.textContent = String(
      interaction.headline ||
      (interaction.periodLabel ? `Resumo de ${interaction.periodLabel}` : "Resumo da sua fatura")
    );
    card.appendChild(headline);

    const summary = interaction.summary || {};
    const responseText = String(interaction.responseText || "").trim() ||
      (summary.totalOutflowsText ? `Encontrei ${summary.totalOutflowsText} em saÃ­das identificadas neste perÃ­odo.` : "");
    if (responseText) {
      const response = document.createElement("p");
      response.id = "chat-interaction-response";
      response.className = "organiza-response-text";
      response.textContent = responseText;
      card.appendChild(response);
    }
    const flowsGrid = document.createElement("div");
    flowsGrid.id = "chat-flows-grid";
    flowsGrid.className = "organiza-flows-grid";
    flowsGrid.appendChild(renderFlowSummaryBox(
      "chat-entradas-card",
      "Entradas",
      summary.totalInflowsText || "R$ 0,00",
      summary.entradas,
      "Nenhuma entrada neste extrato",
      true
    ));
    flowsGrid.appendChild(renderFlowSummaryBox(
      "chat-saidas-card",
      "Saídas",
      summary.totalOutflowsText || "R$ 0,00",
      summary.saidas,
      "Nenhuma saída identificada ainda",
      false
    ));
    card.appendChild(flowsGrid);

    if (interaction.educationTip) {
      const edu = document.createElement("div");
      edu.id = "chat-edu-callout";
      edu.className = "organiza-edu-callout";
      edu.appendChild(createLightbulbSvg());
      const tipText = document.createElement("span");
      tipText.textContent = String(interaction.educationTip);
      edu.appendChild(tipText);
      card.appendChild(edu);
    }

    const detailsData = interaction.details && Array.isArray(interaction.details.items) && interaction.details.items.length > 0
      ? interaction.details
      : null;
    if (detailsData) {
      const detailsEl = document.createElement("details");
      detailsEl.id = "chat-analysis-details";
      detailsEl.className = "organiza-details";
      if (panelState.detailsOpen) detailsEl.open = true;
      detailsEl.addEventListener("toggle", () => {
        panelState.detailsOpen = Boolean(detailsEl.open);
      });

      const summaryEl = document.createElement("summary");
      summaryEl.className = "organiza-details-summary";
      const sumTitle = document.createElement("span");
      sumTitle.textContent = String(detailsData.title || "Detalhes da análise");
      summaryEl.appendChild(sumTitle);
      summaryEl.appendChild(createChevronSvg());
      detailsEl.appendChild(summaryEl);

      const ul = document.createElement("ul");
      ul.className = "organiza-details-list";
      for (const itemText of detailsData.items) {
        const li = document.createElement("li");
        li.textContent = String(itemText);
        ul.appendChild(li);
      }
      detailsEl.appendChild(ul);
      card.appendChild(detailsEl);
    }

    const divider = document.createElement("hr");
    divider.className = "organiza-divider";
    card.appendChild(divider);

    const prompt = document.createElement("p");
    prompt.id = "chat-interaction-prompt";
    prompt.className = "organiza-interaction-prompt";
    prompt.textContent = String(interaction.prompt || "O que você quer fazer agora?");
    card.appendChild(prompt);

    const stack = document.createElement("div");
    stack.id = "chat-actions-stack";
    stack.className = "organiza-actions-stack";
    stack.setAttribute("role", "group");
    stack.setAttribute("aria-label", "Ações rápidas da fatura e dos gastos");

    const options = Array.isArray(interaction.options) ? interaction.options : [];
    const btnList = [];
    for (const opt of options) {
      const meta = resolveOptionMeta(opt);
      if (!meta || !opt || !opt.id) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = meta.domId;
      btn.className = "organiza-action-btn";
      btn.dataset.optionId = String(opt.id);
      btn.setAttribute("aria-pressed", panelState.activeCard === meta.activeKey ? "true" : "false");
      btn.disabled = Boolean(panelState.loading);

      const left = document.createElement("span");
      left.className = "organiza-action-left";
      left.appendChild(createActionIconSvg(meta.icon));
      const lblSpan = document.createElement("span");
      lblSpan.className = "organiza-action-label";
      lblSpan.textContent = String(opt.label || "");
      left.appendChild(lblSpan);
      btn.appendChild(left);

      const badgeCount = Number(opt.badgeCount || 0);
      if (badgeCount > 0) {
        btn.setAttribute("data-count", String(badgeCount));
        const badge = document.createElement("span");
        badge.className = "organiza-action-badge";
        badge.textContent = String(badgeCount);
        btn.appendChild(badge);
      }

      btn.addEventListener("click", meta.handler);
      btnList.push(btn);
      stack.appendChild(btn);
    }

    stack.addEventListener("keydown", (ev) => {
      if (btnList.length === 0) return;
      const activeIdx = btnList.indexOf(document.activeElement);
      const targetBtn = ev.target && ev.target.closest ? ev.target.closest(".organiza-action-btn") : null;
      const currentIdx = activeIdx >= 0 ? activeIdx : btnList.indexOf(targetBtn);
      if (currentIdx < 0) return;

      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        const nextIdx = (currentIdx + 1) % btnList.length;
        btnList[nextIdx].focus();
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        const prevIdx = (currentIdx - 1 + btnList.length) % btnList.length;
        btnList[prevIdx].focus();
      } else if (ev.key === "Home") {
        ev.preventDefault();
        btnList[0].focus();
      } else if (ev.key === "End") {
        ev.preventDefault();
        btnList[btnList.length - 1].focus();
      }
    });

    card.appendChild(stack);
    return card;
  }

  function renderOrganizeCard(rev) {
    if (!rev) {
      return createMultiSelectCard({
        id: "chat-organize-card",
        title: "Prévia antes de salvar — selecione o que deseja guardar nas suas caixinhas",
        emptyText: "Envie uma fatura ou extrato pelo botão + para visualizar e organizar suas caixinhas antes de salvar.",
        items: [],
        confirmId: "chat-confirm-save-btn",
        confirmLabel: "Confirmar e salvar no Dashboard",
        cancelId: "chat-organize-cancel-btn",
        cancelLabel: "Cancelar",
        summaryFormatter: () => "Total selecionado: R$ 0,00 (0 movimentações)",
        onCancel: () => {
          panelState.selectedOrganizeIds.clear();
          panelState.organizeInitializedForKey = "";
          panelState.activeCard = "";
          panelState.error = "";
          panelState.info = "";
          renderInteractivePanel();
        }
      });
    }

    initializeOrganizeSelection(rev);

    const confirmable = rev.transactions.filter(isConfirmableOutflowTx);
    const payments = rev.transactions.filter((t) => flowClassOf(t) === "PAGAMENTO_FATURA");
    const pendingTxs = rev.transactions.filter(isPendingReviewTx);

    const groupMap = new Map();
    for (const tx of confirmable) {
      const code = String(tx.category || "OTHER").trim().toUpperCase() || "OTHER";
      const label = categoryLabelPt(code);
      if (!groupMap.has(label)) {
        groupMap.set(label, {
          key: code,
          label,
          items: [],
          computeRightText: (checkedItems) => {
            const minor = checkedItems.reduce((sum, it) => sum + Number(it.amountMinor || 0), 0);
            return formatBrlMinor(minor);
          }
        });
      }
      const descParts = [String(tx.descriptionNormalized || tx.descriptionRaw || "Despesa").trim()];
      if (tx.date) descParts.push(`(${tx.date})`);
      groupMap.get(label).items.push({
        id: String(tx.id),
        label: descParts.join(" "),
        rightText: formatBrlMinor(tx.amountMinor),
        amountMinor: Number(tx.amountMinor || 0)
      });
    }

    const extraWrap = document.createDocumentFragment();
    if (payments.length > 0 || pendingTxs.length > 0) {
      const noticeRow = document.createElement("div");
      noticeRow.className = "organiza-notice-row";
      if (payments.length > 0) {
        const payMinor = payments.reduce((sum, t) => sum + Number(t.amountMinor || 0), 0);
        const payPill = document.createElement("span");
        payPill.className = "organiza-notice-pill";
        payPill.textContent = `Pagamentos de fatura (${formatBrlMinor(payMinor)} · não somados)`;
        noticeRow.appendChild(payPill);
      }
      if (pendingTxs.length > 0) {
        const pendMinor = pendingTxs.reduce((sum, t) => sum + Number(t.amountMinor || 0), 0);
        const pendPill = document.createElement("span");
        pendPill.className = "organiza-notice-pill";
        pendPill.textContent = `Pendentes de revisão (${formatBrlMinor(pendMinor)} · aguardando classificação)`;
        noticeRow.appendChild(pendPill);

        const reviewShortcut = document.createElement("button");
        reviewShortcut.type = "button";
        reviewShortcut.className = "organiza-secondary-btn";
        reviewShortcut.textContent = "Revisar pendentes";
        reviewShortcut.addEventListener("click", () => {
          panelState.activeCard = "review";
          panelState.error = "";
          renderInteractivePanel();
        });
        noticeRow.appendChild(reviewShortcut);
      }
      extraWrap.appendChild(noticeRow);
    }

    if (!isValidYearMonth(rev.statementPeriod) || panelState.needsPeriod) {
      extraWrap.appendChild(buildPeriodPickerNode(rev.statementPeriod));
    }

    const resolvedPeriod = rev.statementPeriod || panelState.manualPeriod || "";
    return createMultiSelectCard({
      id: "chat-organize-card",
      title: "Prévia antes de salvar — selecione o que deseja guardar nas suas caixinhas",
      badgeText: isValidYearMonth(resolvedPeriod) ? formatPeriodPt(resolvedPeriod) : "Período a confirmar",
      selectAllLabel: confirmable.length > 0 ? "Selecionar todas as caixinhas" : "",
      groups: Array.from(groupMap.values()),
      emptyText: "Ainda não há despesas confirmadas prontas para salvar. Se houver itens pendentes, classifique-os primeiro em \"Revisar movimentações\".",
      initialSelectedIds: panelState.selectedOrganizeIds,
      onSelectionChange: (nextSet) => {
        panelState.selectedOrganizeIds = new Set(nextSet);
        panelState.error = "";
      },
      summaryFormatter: (_selectedSet, selectedItems) => {
        const totalMinor = selectedItems.reduce((sum, it) => sum + Number(it.amountMinor || 0), 0);
        const count = selectedItems.length;
        return `Total selecionado: ${formatBrlMinor(totalMinor)} (${count} ${count === 1 ? "movimentação" : "movimentações"})`;
      },
      extraContentNode: extraWrap.childNodes.length > 0 ? extraWrap : null,
      confirmId: "chat-confirm-save-btn",
      confirmLabel: "Confirmar e salvar no Dashboard",
      cancelId: "chat-organize-cancel-btn",
      cancelLabel: "Cancelar",
      emptyErrorText: "Selecione pelo menos uma movimentação ou categoria para salvar no Dashboard.",
      loading: panelState.loading,
      error: panelState.error,
      info: panelState.info,
      onConfirm: (selectedSet) => {
        panelState.selectedOrganizeIds = new Set(selectedSet);
        handleConfirmSave(rev, selectedSet);
      },
      onCancel: () => {
        panelState.selectedOrganizeIds.clear();
        panelState.organizeInitializedForKey = "";
        panelState.activeCard = "";
        panelState.error = "";
        panelState.info = "";
        renderInteractivePanel();
      }
    });
  }

  function renderReviewCard(rev) {
    if (!rev) {
      return createMultiSelectCard({
        id: "chat-review-card",
        title: "Movimentações pendentes de revisão",
        emptyText: "Nenhum documento em revisão no momento.",
        items: [],
        confirmId: "chat-reclassify-btn",
        confirmLabel: "Confirmar classificação",
        cancelId: "chat-review-cancel-btn",
        cancelLabel: "Cancelar",
        summaryFormatter: () => "0 movimentações pendentes",
        onCancel: () => {
          panelState.selectedReviewIds.clear();
          panelState.activeCard = "";
          panelState.error = "";
          panelState.info = "";
          renderInteractivePanel();
        }
      });
    }

    const pendingTxs = rev.transactions.filter(isPendingReviewTx);
    if (pendingTxs.length === 0) {
      const goOrgBtn = document.createElement("button");
      goOrgBtn.type = "button";
      goOrgBtn.className = "organiza-primary-btn";
      goOrgBtn.style.alignSelf = "flex-start";
      goOrgBtn.textContent = "Ir para Organizar caixinhas";
      goOrgBtn.addEventListener("click", () => {
        panelState.activeCard = "organize";
        panelState.error = "";
        renderInteractivePanel();
      });

      return createMultiSelectCard({
        id: "chat-review-card",
        title: "Movimentações pendentes de revisão",
        badgeText: "Tudo revisado",
        items: [],
        emptyText: "Nenhuma movimentação pendente de revisão neste documento!",
        emptyActionNode: goOrgBtn,
        confirmId: "chat-reclassify-btn",
        confirmLabel: "Confirmar classificação",
        cancelId: "chat-review-cancel-btn",
        cancelLabel: "Cancelar",
        info: panelState.info,
        summaryFormatter: () => "Nenhuma movimentação pendente",
        onCancel: () => {
          panelState.selectedReviewIds.clear();
          panelState.activeCard = "";
          panelState.error = "";
          panelState.info = "";
          renderInteractivePanel();
        }
      });
    }

    const items = pendingTxs.map((tx) => {
      const txId = String(tx.id);
      const ev = tx.evidence || {};
      const meta = [];
      if (tx.date) meta.push(tx.date);
      if (ev.page != null && ev.row != null) meta.push(`pág. ${ev.page}, linha ${ev.row}`);
      const desc = String(tx.descriptionNormalized || tx.descriptionRaw || "Item pendente").trim();
      return {
        id: txId,
        inputId: `rev-cb-${txId}`,
        label: desc,
        meta: meta.join(" · "),
        rightText: tx.amountMinor != null ? formatBrlMinor(tx.amountMinor) : "Valor pendente"
      };
    });

    const catWrap = document.createElement("div");
    catWrap.className = "organiza-picker-controls";
    const catLbl = document.createElement("label");
    catLbl.setAttribute("for", "chat-review-category");
    catLbl.className = "organiza-muted";
    catLbl.style.fontWeight = "600";
    catLbl.textContent = "Categoria:";

    const select = document.createElement("select");
    select.id = "chat-review-category";
    select.className = "organiza-select";
    for (const optDef of CATEGORY_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = optDef.code;
      opt.textContent = optDef.label;
      if (optDef.code === panelState.selectedReviewCategory) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      panelState.selectedReviewCategory = select.value;
    });
    catWrap.appendChild(catLbl);
    catWrap.appendChild(select);

    return createMultiSelectCard({
      id: "chat-review-card",
      title: "Movimentações pendentes de revisão",
      badgeText: `${pendingTxs.length} ${pendingTxs.length === 1 ? "pendente" : "pendentes"}`,
      selectAllLabel: "Selecionar todas as movimentações pendentes",
      items,
      initialSelectedIds: panelState.selectedReviewIds,
      onSelectionChange: (nextSet) => {
        panelState.selectedReviewIds = new Set(nextSet);
        panelState.error = "";
      },
      summaryFormatter: (selectedSet) => {
        const count = selectedSet.size;
        return `${count} ${count === 1 ? "movimentação selecionada" : "movimentações selecionadas"}`;
      },
      extraContentNode: catWrap,
      confirmId: "chat-reclassify-btn",
      confirmLabel: "Confirmar classificação",
      cancelId: "chat-review-cancel-btn",
      cancelLabel: "Cancelar",
      emptyErrorText: "Selecione pelo menos uma movimentação pendente para classificar.",
      loading: panelState.loading,
      error: panelState.error,
      info: panelState.info,
      onConfirm: (selectedSet) => {
        panelState.selectedReviewIds = new Set(selectedSet);
        handleReclassify(rev, selectedSet);
      },
      onCancel: () => {
        panelState.selectedReviewIds.clear();
        panelState.activeCard = "";
        panelState.error = "";
        panelState.info = "";
        renderInteractivePanel();
      }
    });
  }

  function buildAvailableViewCategories(calcData, rev) {
    const map = new Map();
    const ensureEntry = (rawCode, rawLabel) => {
      const code = String(rawCode || "OTHER").trim().toUpperCase() || "OTHER";
      if (!map.has(code)) {
        map.set(code, {
          code,
          label: rawLabel || categoryLabelPt(code),
          confirmedCount: 0,
          confirmedMinor: 0,
          reviewCount: 0,
          reviewMinor: 0
        });
      }
      return map.get(code);
    };

    const calcCats = calcData && Array.isArray(calcData.categories) ? calcData.categories : [];
    for (const c of calcCats) {
      if (!c || !c.code) continue;
      const entry = ensureEntry(c.code, c.label);
      entry.confirmedCount += Number(c.count || 0);
      entry.confirmedMinor += Number(c.totalMinor || 0);
    }

    if (rev && rev.status === "EM_REVISAO" && Array.isArray(rev.transactions)) {
      for (const tx of rev.transactions) {
        if (!isConfirmableOutflowTx(tx)) continue;
        const code = String(tx.category || "OTHER").trim().toUpperCase() || "OTHER";
        const entry = ensureEntry(code, categoryLabelPt(code));
        entry.reviewCount += 1;
        entry.reviewMinor += Number(tx.amountMinor || 0);
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const aTotal = a.confirmedMinor + a.reviewMinor;
      const bTotal = b.confirmedMinor + b.reviewMinor;
      if (bTotal !== aTotal) return bTotal - aTotal;
      return a.label.localeCompare(b.label, "pt-BR");
    });
  }

  function renderViewSummaryCard() {
    const resolvedPeriod = panelState.viewPeriod || resolveActivePeriod(resolveEffectiveInteraction());
    const periodBadgeText = isValidYearMonth(resolvedPeriod) ? formatPeriodPt(resolvedPeriod) : "Mês atual";
    const cats = Array.isArray(panelState.availableViewCategories) ? panelState.availableViewCategories : [];

    if (panelState.loading && cats.length === 0) {
      return createMultiSelectCard({
        id: "chat-view-summary-card",
        title: "Selecionar categorias para visualizar",
        badgeText: periodBadgeText,
        items: [],
        emptyText: "Carregando categorias disponíveis no período...",
        confirmId: "chat-view-apply-btn",
        confirmLabel: "Ver categorias selecionadas",
        cancelId: "chat-view-cancel-btn",
        cancelLabel: "Cancelar",
        loading: true,
        summaryFormatter: () => "Carregando...",
        onCancel: () => {
          panelState.selectedViewCategories.clear();
          panelState.viewFilterInitializedForKey = "";
          panelState.viewResult = null;
          panelState.activeCard = "";
          panelState.error = "";
          renderInteractivePanel();
        }
      });
    }

    const items = cats.map((c) => {
      const metaParts = [];
      if (c.confirmedCount > 0) {
        metaParts.push(`${c.confirmedCount} ${c.confirmedCount === 1 ? "lançamento confirmado" : "lançamentos confirmados"}`);
      }
      if (c.reviewCount > 0) {
        metaParts.push(`${c.reviewCount} ${c.reviewCount === 1 ? "item em revisão" : "itens em revisão"}`);
      }
      const displayMinor = c.confirmedMinor > 0 ? c.confirmedMinor : c.reviewMinor;
      return {
        id: c.code,
        inputId: `view-cat-cb-${c.code}`,
        label: c.label || categoryLabelPt(c.code),
        meta: metaParts.join(" · "),
        rightText: formatBrlMinor(displayMinor)
      };
    });

    let resultNode = null;
    if (panelState.viewResult) {
      const vr = panelState.viewResult;
      const box = document.createElement("div");
      box.id = "chat-view-result-box";
      box.className = "organiza-view-result";

      const resHeadline = document.createElement("div");
      resHeadline.style.fontWeight = "700";
      resHeadline.style.fontSize = "0.92rem";
      const pTxt = isValidYearMonth(vr.period) ? formatPeriodPt(vr.period) : "este período";
      if (vr.count != null && vr.totalMinor != null) {
        resHeadline.textContent = `Em ${pTxt}: ${formatBrlMinor(vr.totalMinor)} (${vr.count} ${vr.count === 1 ? "lançamento confirmado" : "lançamentos confirmados"})`;
      } else {
        resHeadline.textContent = vr.message || "Consulta concluída.";
      }
      box.appendChild(resHeadline);

      const txs = Array.isArray(vr.transactions) ? vr.transactions : [];
      if (txs.length > 0) {
        const txList = document.createElement("div");
        txList.className = "organiza-view-tx-list";
        for (const tx of txs) {
          const row = document.createElement("div");
          row.className = "organiza-tx-row";
          const left = document.createElement("div");
          left.className = "organiza-check-text-wrap";
          const desc = document.createElement("span");
          desc.textContent = String(tx.description || "Lançamento");
          left.appendChild(desc);
          const meta = document.createElement("span");
          meta.className = "organiza-muted";
          const datePart = tx.createdAt ? String(tx.createdAt).slice(0, 10) : "";
          meta.textContent = [categoryLabelPt(tx.category), datePart].filter(Boolean).join(" · ");
          left.appendChild(meta);

          const val = document.createElement("span");
          val.className = "organiza-amount";
          const minor = Math.round(Number(tx.value || 0) * 100);
          val.textContent = formatBrlMinor(minor);

          row.appendChild(left);
          row.appendChild(val);
          txList.appendChild(row);
        }
        box.appendChild(txList);
      } else {
        const emptyTx = document.createElement("p");
        emptyTx.className = "organiza-muted";
        emptyTx.style.margin = "0";
        emptyTx.textContent = "Ainda não há lançamentos confirmados nessas categorias para este período. Se estiverem na fatura em revisão, organize as caixinhas para salvá-las.";
        box.appendChild(emptyTx);
      }

      const dashRow = document.createElement("div");
      dashRow.style.display = "flex";
      dashRow.style.justifyContent = "flex-end";
      const dashBtn = document.createElement("button");
      dashBtn.type = "button";
      dashBtn.id = "chat-view-dashboard-btn";
      dashBtn.className = "organiza-primary-btn";
      dashBtn.textContent = "Ir para o Dashboard";
      dashBtn.addEventListener("click", () => {
        const chosen = panelState.selectedViewCategories.size > 0
          ? Array.from(panelState.selectedViewCategories)
          : (Array.isArray(vr.selectedCodes) ? vr.selectedCodes : []);
        if (chosen.length > 0) {
          window.__organizaPreferredCategories = new Set(chosen.map(String));
        }
        if (isValidYearMonth(resolvedPeriod)) {
          window.__organizaLastConfirmedPeriod = resolvedPeriod;
        }
        navigateToDashboard();
      });
      dashRow.appendChild(dashBtn);
      box.appendChild(dashRow);
      resultNode = box;
    }

    return createMultiSelectCard({
      id: "chat-view-summary-card",
      title: "Selecionar categorias para visualizar",
      badgeText: periodBadgeText,
      selectAllLabel: cats.length > 0 ? "Selecionar todas as categorias" : "",
      items,
      emptyText: "Ainda não há categorias disponíveis neste período.",
      initialSelectedIds: panelState.selectedViewCategories,
      onSelectionChange: (nextSet) => {
        panelState.selectedViewCategories = new Set(nextSet);
        panelState.error = "";
      },
      summaryFormatter: (selectedSet) => {
        const count = selectedSet.size;
        return `${count} de ${cats.length} ${cats.length === 1 ? "categoria selecionada" : "categorias selecionadas"}`;
      },
      extraContentNode: resultNode,
      confirmId: "chat-view-apply-btn",
      confirmLabel: "Ver categorias selecionadas",
      cancelId: "chat-view-cancel-btn",
      cancelLabel: "Cancelar",
      emptyErrorText: "Selecione pelo menos uma categoria para visualizar.",
      loading: panelState.loading,
      error: panelState.error,
      onConfirm: (selectedSet) => {
        panelState.selectedViewCategories = new Set(selectedSet);
        handleApplyViewCategories(resolvedPeriod, selectedSet);
      },
      onCancel: () => {
        panelState.selectedViewCategories.clear();
        panelState.viewFilterInitializedForKey = "";
        panelState.viewResult = null;
        panelState.availableViewCategories = [];
        panelState.activeCard = "";
        panelState.error = "";
        renderInteractivePanel();
      }
    });
  }

  function renderConfirmedCard() {
    const card = document.createElement("div");
    card.id = "chat-confirmed-card";
    card.className = "organiza-card";

    const info = panelState.confirmedSummary || {};
    const okBox = document.createElement("div");
    okBox.className = "organiza-inline-alert is-success";
    okBox.setAttribute("role", "status");
    okBox.textContent = info.message || "Gastos salvos nas suas caixinhas sem duplicidade!";
    card.appendChild(okBox);

    const footer = document.createElement("div");
    footer.className = "organiza-card-footer";
    if (isValidYearMonth(info.period)) {
      const badge = document.createElement("span");
      badge.className = "organiza-period-badge";
      badge.textContent = `Período: ${formatPeriodPt(info.period)}`;
      footer.appendChild(badge);
    }
    const dashBtn = document.createElement("button");
    dashBtn.type = "button";
    dashBtn.id = "chat-goto-dashboard-btn";
    dashBtn.className = "organiza-primary-btn";
    dashBtn.textContent = "Ver no Dashboard (Gastos Calculados)";
    dashBtn.addEventListener("click", navigateToDashboard);
    footer.appendChild(dashBtn);
    card.appendChild(footer);
    return card;
  }

  async function handleViewExpenses() {
    const activePeriod = resolveActivePeriod(resolveEffectiveInteraction()) || currentYearMonth();

    panelState.activeCard = "view";
    panelState.viewPeriod = activePeriod;
    panelState.loading = true;
    panelState.error = "";
    panelState.info = "";
    panelState.viewResult = null;
    renderInteractivePanel();

    const statusHost = document.getElementById("chat-panel-status");
    OrganizaProcessingIndicator.mount(statusHost, "Conferindo os valores...", { delayMs: 120 });
    try {
      const monthParam = isValidYearMonth(activePeriod) ? `&month=${encodeURIComponent(activePeriod)}` : "";
      const { resp, data } = await fetchJsonAuthed(`/api/dashboard/calculated?period=month${monthParam}`, {
        method: "GET"
      });
      OrganizaProcessingIndicator.hide(statusHost);
      const calcData = resp.ok && data && typeof data === "object" ? data : null;
      const effectivePeriod = (calcData && isValidYearMonth(calcData.selectedMonth) ? calcData.selectedMonth : activePeriod) || currentYearMonth();
      panelState.viewPeriod = effectivePeriod;

      const cats = buildAvailableViewCategories(calcData, latestDocReview);
      panelState.availableViewCategories = cats;
      const filterKey = `${effectivePeriod}:${cats.map((c) => c.code).join(",")}`;
      if (panelState.viewFilterInitializedForKey !== filterKey) {
        panelState.viewFilterInitializedForKey = filterKey;
        panelState.selectedViewCategories = new Set(cats.map((c) => c.code));
      }
      if (!resp.ok && cats.length === 0) {
        panelState.error = (data && (data.message || data.error)) || "Não consegui carregar as categorias deste período agora.";
      }
    } catch (_) {
      OrganizaProcessingIndicator.hide(statusHost);
      const cats = buildAvailableViewCategories(null, latestDocReview);
      panelState.availableViewCategories = cats;
      if (cats.length > 0 && panelState.selectedViewCategories.size === 0) {
        panelState.selectedViewCategories = new Set(cats.map((c) => c.code));
      } else {
        panelState.error = "Falha de conexão ao buscar suas categorias.";
      }
    } finally {
      panelState.loading = false;
      renderInteractivePanel();
    }
  }

  async function handleApplyViewCategories(period, selectedSet) {
    const selectedCodes = Array.from(selectedSet || panelState.selectedViewCategories)
      .map((c) => String(c).trim().toUpperCase())
      .filter(Boolean);
    if (selectedCodes.length === 0) {
      panelState.error = "Selecione pelo menos uma categoria para visualizar.";
      renderInteractivePanel();
      return;
    }

    panelState.loading = true;
    panelState.error = "";
    panelState.info = "";
    renderInteractivePanel();

    const statusHost = document.getElementById("chat-panel-status");
    OrganizaProcessingIndicator.mount(statusHost, "Conferindo os valores...", { delayMs: 120 });
    try {
      const { resp, data } = await fetchJsonAuthed("/api/intents/dispatch", {
        method: "POST",
        body: JSON.stringify({
          intent: "CONSULTAR_GASTOS",
          parameters: {
            period: period || "month",
            categories: selectedCodes.join(",")
          }
        })
      });
      OrganizaProcessingIndicator.hide(statusHost);
      if (!resp.ok || !data || data.status === "ERROR" || data.status === "UNAUTHORIZED") {
        panelState.error = (data && (data.message || data.error)) || "Não consegui consultar as categorias selecionadas agora.";
      } else {
        let parsedData = null;
        if (typeof data.dataJson === "string" && data.dataJson.trim().startsWith("{")) {
          try { parsedData = JSON.parse(data.dataJson); } catch (_) {}
        }
        panelState.viewResult = {
          message: data.message || "",
          period: (parsedData && parsedData.period) || period,
          count: parsedData && typeof parsedData.count === "number" ? parsedData.count : null,
          totalMinor: parsedData && typeof parsedData.totalMinor === "number" ? parsedData.totalMinor : null,
          transactions: parsedData && Array.isArray(parsedData.transactions) ? parsedData.transactions : [],
          selectedCodes: selectedCodes.slice()
        };
      }
    } catch (_) {
      OrganizaProcessingIndicator.hide(statusHost);
      panelState.error = "Falha de conexão ao consultar as categorias selecionadas.";
    } finally {
      panelState.loading = false;
      renderInteractivePanel();
    }
  }

  async function handleOpenOrganize() {
    panelState.activeCard = "organize";
    panelState.loading = true;
    panelState.error = "";
    panelState.info = "";
    renderInteractivePanel();

    const statusHost = document.getElementById("chat-panel-status");
    OrganizaProcessingIndicator.mount(statusHost, "Preparando suas caixinhas...", { delayMs: 120 });
    try {
      const docId = (activeInteraction && activeInteraction.documentId) ||
        (latestDocReview && latestDocReview.documentId) ||
        pendingDocumentId;
      await refreshDocumentReview(docId, true);
      if (latestDocReview) initializeOrganizeSelection(latestDocReview);
    } finally {
      OrganizaProcessingIndicator.hide(statusHost);
      panelState.loading = false;
      renderInteractivePanel();
    }
  }

  async function handleOpenReview() {
    panelState.activeCard = "review";
    panelState.loading = true;
    panelState.error = "";
    panelState.info = "";
    renderInteractivePanel();

    const statusHost = document.getElementById("chat-panel-status");
    OrganizaProcessingIndicator.mount(statusHost, "Conferindo os valores...", { delayMs: 120 });
    try {
      const docId = (activeInteraction && activeInteraction.documentId) ||
        (latestDocReview && latestDocReview.documentId) ||
        pendingDocumentId;
      await refreshDocumentReview(docId, true);
    } finally {
      OrganizaProcessingIndicator.hide(statusHost);
      panelState.loading = false;
      renderInteractivePanel();
    }
  }

  function handleUnderstandExpenses() {
    panelState.activeCard = "edu";
    panelState.error = "";
    panelState.info = "";
    renderInteractivePanel();
    const input = document.getElementById("chat-input");
    const form = document.getElementById("chat-form");
    if (!input || !form || input.disabled) return;
    const prompt = "Entender melhor meus gastos";
    recordChatSubmissionMeta(prompt, "education", false);
    input.value = prompt;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }

  async function handleConfirmSave(rev, selectedSet) {
    if (!rev || panelState.loading) return;
    const selectedIds = Array.from(selectedSet || panelState.selectedOrganizeIds).filter(Boolean);
    if (selectedIds.length === 0) {
      panelState.error = "Selecione pelo menos uma movimentação ou categoria para salvar no Dashboard.";
      renderInteractivePanel();
      return;
    }

    const periodRequired = !isValidYearMonth(rev.statementPeriod) || panelState.needsPeriod;
    const confirmedPeriod = isValidYearMonth(rev.statementPeriod)
      ? rev.statementPeriod
      : (isValidYearMonth(panelState.manualPeriod) ? panelState.manualPeriod : "");
    if (periodRequired && !isValidYearMonth(confirmedPeriod)) {
      panelState.needsPeriod = true;
      panelState.error = "Escolha o mês e o ano da fatura antes de salvar.";
      renderInteractivePanel();
      return;
    }

    panelState.loading = true;
    panelState.error = "";
    panelState.info = "";
    renderInteractivePanel();

    const statusHost = document.getElementById("chat-panel-status");
    OrganizaProcessingIndicator.mount(statusHost, "Salvando suas informações...", { delayMs: 120 });
    try {
      const parameters = { selectedIds: selectedIds.join(",") };
      if (confirmedPeriod) parameters.period = confirmedPeriod;

      const { resp, data } = await fetchJsonAuthed("/api/intents/dispatch", {
        method: "POST",
        body: JSON.stringify({
          intent: "CONFIRMAR_IMPORTACAO",
          attachmentIds: [rev.documentId],
          parameters
        })
      });
      OrganizaProcessingIndicator.hide(statusHost);

      if (data && data.status === "NEEDS_PERIOD") {
        panelState.needsPeriod = true;
        panelState.error = data.message || "Informe o mês e ano da fatura para salvar no período correto.";
        panelState.loading = false;
        renderInteractivePanel();
        const mSel = document.getElementById("chat-period-month");
        if (mSel) mSel.focus();
        return;
      }

      if (!resp.ok || !data || data.status === "ERROR" || data.status === "UNAUTHORIZED") {
        panelState.error = (data && (data.message || data.error)) || "Não foi possível salvar os lançamentos agora.";
        panelState.loading = false;
        renderInteractivePanel();
        return;
      }

      const finalPeriod = extractPeriodFromObject(data) || confirmedPeriod || pendingDocumentPeriod || lastUploadedPeriod || currentYearMonth();
      if (finalPeriod) window.__organizaLastConfirmedPeriod = finalPeriod;

      activeInteraction = null;
      clearPendingInvoice();
      latestDocReview = null;
      panelState.loading = false;
      panelState.needsPeriod = false;
      panelState.detailsOpen = false;
      panelState.confirmedDocId = rev.documentId;
      panelState.activeCard = "confirmed";
      panelState.confirmedSummary = {
        message: data.message || "Confirmado! Seus gastos foram salvos nas caixinhas e atualizados no Dashboard.",
        period: finalPeriod
      };
      emitDataChanged("intent-confirm", finalPeriod ? { period: finalPeriod } : undefined);
      renderInteractivePanel();
    } catch (_) {
      OrganizaProcessingIndicator.hide(statusHost);
      panelState.loading = false;
      panelState.error = "Falha de conexão ao salvar suas informações.";
      renderInteractivePanel();
    }
  }

  async function handleReclassify(rev, selectedSet) {
    if (!rev || panelState.loading) return;
    const checkedIds = Array.from(selectedSet || panelState.selectedReviewIds).filter(Boolean);
    if (checkedIds.length === 0) {
      panelState.error = "Selecione pelo menos uma movimentação pendente para classificar.";
      renderInteractivePanel();
      return;
    }

    const catSelect = document.getElementById("chat-review-category");
    const category = (catSelect && catSelect.value) || panelState.selectedReviewCategory || "OTHER";
    panelState.selectedReviewCategory = category;

    panelState.loading = true;
    panelState.error = "";
    panelState.info = "";
    renderInteractivePanel();

    const statusHost = document.getElementById("chat-panel-status");
    OrganizaProcessingIndicator.mount(statusHost, "Organizando seus gastos...", { delayMs: 120 });
    try {
      const { resp, data } = await fetchJsonAuthed(
        `/api/documents/${encodeURIComponent(rev.documentId)}/reclassify`,
        {
          method: "POST",
          body: JSON.stringify({ txIds: checkedIds, category })
        }
      );
      OrganizaProcessingIndicator.hide(statusHost);

      if (!resp.ok) {
        panelState.error = (data && (data.error || data.message)) || "Não foi possível classificar as movimentações selecionadas.";
        panelState.loading = false;
        renderInteractivePanel();
        return;
      }

      const updated = normalizeReviewPayload(data);
      if (updated) {
        latestDocReview = updated;
      } else {
        const idSet = new Set(checkedIds);
        latestDocReview.transactions = latestDocReview.transactions.map((tx) =>
          idSet.has(String(tx.id))
            ? Object.assign({}, tx, { category, reviewStatus: "CONFIRMED", flowClass: tx.kind === "CARD_EXIT" ? "OPERACAO_CREDITO" : "DESPESA" })
            : tx
        );
        await refreshDocumentReview(rev.documentId, true);
      }

      if (latestDocReview) {
        syncPendingFromReview(latestDocReview);
        const docPrefix = `${latestDocReview.documentId}:`;
        if (String(panelState.organizeInitializedForKey || "").startsWith(docPrefix)) {
          checkedIds.forEach((id) => panelState.selectedOrganizeIds.add(String(id)));
          const confirmable = latestDocReview.transactions.filter(isConfirmableOutflowTx);
          panelState.organizeInitializedForKey = `${latestDocReview.documentId}:${confirmable.map((t) => t.id).join(",")}`;
        }
        activeInteraction = buildFallbackInteractionFromReview(latestDocReview, data && data.summary);
      }
      panelState.selectedReviewIds.clear();
      panelState.info = `Classificado como ${categoryLabelPt(category)}! Itens prontos para organizar e salvar nas caixinhas.`;
      panelState.loading = false;
      renderInteractivePanel();
    } catch (_) {
      OrganizaProcessingIndicator.hide(statusHost);
      panelState.loading = false;
      panelState.error = "Falha de conexão ao classificar movimentações.";
      renderInteractivePanel();
    }
  }

  function renderInteractivePanel() {
    panelNeedsRender = false;
    const list = document.getElementById("chat-messages");
    if (!list || !shouldShowInteractivePanel()) {
      removeInteractivePanel();
      return;
    }

    ensureWaveAnimStyle();
    const isLight = isLightTheme();
    const theme = isLight ? "light" : "dark";
    let panel = document.getElementById("chat-interactive-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "chat-interactive-panel";
    }
    panel.setAttribute("data-organiza-theme", theme);
    panel.textContent = "";
    panelDom = panel;

    if (panelState.activeCard === "confirmed" && panelState.confirmedSummary) {
      panel.appendChild(renderConfirmedCard());
      placePanelInChatList(list, panel);
      return;
    }

    const interaction = resolveEffectiveInteraction();
    if (interaction) {
      hideReplyRepresentedByInteraction(list);
      panel.appendChild(renderStructuredSummaryCard(interaction, isLight));
    }

    const statusHost = document.createElement("div");
    statusHost.id = "chat-panel-status";
    panel.appendChild(statusHost);

    const rev = latestDocReview;
    if (panelState.activeCard === "view") {
      panel.appendChild(renderViewSummaryCard());
    } else if (panelState.activeCard === "organize") {
      panel.appendChild(renderOrganizeCard(rev));
    } else if (panelState.activeCard === "review") {
      panel.appendChild(renderReviewCard(rev));
    }

    placePanelInChatList(list, panel);
  }

  function queuePanelSync(needsRender) {
    if (needsRender) panelNeedsRender = true;
    if (panelSyncQueued) return;
    panelSyncQueued = true;
    const run = () => {
      panelSyncQueued = false;
      syncInteractiveChatPanel();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function syncInteractiveChatPanel() {
    const list = document.getElementById("chat-messages");
    if (!list) {
      removeInteractivePanel();
      return;
    }
    const authHeader = getAuthHeader();
    if (authHeader && latestDocFetchedForAuth !== authHeader) {
      refreshLatestDocument(false);
    }
    if (!shouldShowInteractivePanel()) {
      removeInteractivePanel();
      return;
    }
    const existing = document.getElementById("chat-interactive-panel");
    if (!existing || panelNeedsRender) {
      renderInteractivePanel();
    } else {
      existing.setAttribute("data-organiza-theme", isLightTheme() ? "light" : "dark");
      placePanelInChatList(list, existing);
    }
  }

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

  window.addEventListener("organiza:auth-ready", () => {
    if (document.getElementById("chat-messages")) {
      refreshLatestDocument(true);
    }
  });

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
    syncInteractiveChatPanel();
  }

  new MutationObserver(onDomMutated).observe(document.documentElement, { childList: true, subtree: true });
  onDomMutated();
})();
