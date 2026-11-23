/*
 * Painel "Gastos Calculados" e 4 Gráficos SVG Acessíveis do Dashboard.
 *
 * Responsabilidades:
 * - Hidratar #dash-calculated-root sempre que o Dashboard montar/re-renderizar.
 * - Consumir GET /api/dashboard/calculated?period=month|week&month=YYYY-MM.
 * - Sincronizar com eventos organiza:auth-ready, organiza:data-changed e abas KOF (#tab-week / #tab-month).
 * - Renderizar os 5 estados oficiais e 4 gráficos SVG customizados (sem libs externas):
 *   1. Gastos por categoria (Donut SVG interativo + filtros com checkboxes)
 *   2. Evolução dos gastos (Barras SVG apenas com pontos reais, zero dados fictícios)
 *   3. Caixinhas (Barras de progresso respeitando hasLimit e status calmo acima do planejado)
 *   4. Comparação mensal (2 barras SVG quando há dados suficientes, ou mensagem informativa)
 */
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const CHART_PALETTE = [
  "#00D4FF",
  "#0066FF",
  "#00E5A0",
  "#FFB800",
  "#7C3AED",
  "#2563EB",
  "#10B981",
  "#F59E0B",
  "#7B8EAD",
  "#4A5578",
  "#F0F0F0",
  "#1A1D2E"
];
  const MONTH_NAMES_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  let gradCounter = 0;
  let syncingKofTab = false;
  let hydrateQueued = false;

  const state = {
    selectedPeriod: "month",
    selectedMonth: "",
    selectedYear: "",
    loading: false,
    error: "",
    data: null,
    dirty: true,
    lastAuthHeader: "",
    requestSeq: 0,
    abortController: null,
    selectedCategories: new Set(),
    savedCategories: null,
    categoriesFilterKey: "",
    chartVisibility: new Set(["categories", "evolution", "envelopes", "comparison"]),
    preferencesUserKey: "",
    focusedCategoryCode: null,
    focusedEvolutionKey: null
  };

  function getAuthHeader() {
    if (typeof window.__organizaGetAuthHeader === "function") {
      const h = String(window.__organizaGetAuthHeader() || "").trim();
      if (h) return h;
    }
    if (window.__kofAuthToken) {
      return "Bearer " + String(window.__kofAuthToken).trim();
    }
    return "";
  }

  function isValidYearMonth(val) {
    return typeof val === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(val.trim());
  }

  function formatPeriodPt(ym) {
    if (!isValidYearMonth(ym)) return "";
    const parts = ym.trim().split("-");
    const year = parts[0];
    const idx = Number(parts[1]) - 1;
    const name = MONTH_NAMES_PT[idx] || parts[1];
    return `${name} de ${year}`;
  }

  function formatBrlMinor(minor) {
    const num = Math.round(Number(minor || 0));
    const neg = num < 0;
    const abs = Math.abs(num);
    const reais = Math.floor(abs / 100);
    const cents = String(abs % 100).padStart(2, "0");
    const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (neg ? "-R$ " : "R$ ") + grouped + "," + cents;
  }

  function reaisToMinor(reais) {
    return Math.round(Number(reais || 0) * 100);
  }

  function formatBrlFromReais(reais) {
    return formatBrlMinor(reaisToMinor(reais));
  }

  function formatBrlAxis(minor) {
    const num = Math.round(Number(minor || 0));
    const abs = Math.abs(num);
    if (abs % 100 === 0) {
      const reais = Math.floor(abs / 100);
      const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      return (num < 0 ? "-R$ " : "R$ ") + grouped;
    }
    return formatBrlMinor(num);
  }

  function formatPct(value) {
    const n = Math.round(Number(value || 0) * 100) / 100;
    return String(n).replace(".", ",") + "%";
  }

  function formatDateShortBr(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return String(ymd || "");
    return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
  }

  function formatDateFullBr(ymd) {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return String(ymd || "");
    return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
  }

  function txCountLabel(count) {
    const n = Number(count || 0);
    return n === 1 ? "1 transação" : `${n} transações`;
  }

  function confirmedTxCountLabel(count) {
    const n = Number(count || 0);
    return n === 1 ? "1 transação confirmada" : `${n} transações confirmadas`;
  }

  function pendingItemCountLabel(count) {
    const n = Number(count || 0);
    return n === 1 ? "1 item aguardando revisão" : `${n} itens aguardando revisão`;
  }

  function isLightTheme() {
    if (document.documentElement && document.documentElement.dataset) {
      if (document.documentElement.dataset.theme === "light") return true;
      if (document.documentElement.dataset.theme === "dark") return false;
    }
    const candidates = [
      document.getElementById("shell"),
      document.getElementById("screen-dashboard"),
      document.body
    ];
    for (const el of candidates) {
      if (!el) continue;
      const inlineBg = ((el.style && el.style.backgroundColor) || "").toLowerCase();
      if (
        inlineBg === "#f8f9fc" ||
        inlineBg === "#ffffff" ||
        inlineBg === "rgb(248, 249, 252)" ||
        inlineBg === "rgb(255, 255, 255)"
      ) {
        return true;
      }
      if (
        inlineBg === "#0a0d18" ||
        inlineBg === "#12162a" ||
        inlineBg === "rgb(10, 13, 24)" ||
        inlineBg === "rgb(18, 22, 42)"
      ) {
        return false;
      }
      if (typeof window.getComputedStyle !== "function") continue;
      const bg = window.getComputedStyle(el).backgroundColor || "";
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i);
      if (!m) continue;
      if (m[4] !== undefined && Number(m[4]) === 0) continue;
      const avg = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
      return avg > 128;
    }
    return false;
  }

  function isMobileLayout() {
    if (document.getElementById("bottom-tab")) return true;
    if (typeof window.innerWidth === "number" && window.innerWidth > 0 && window.innerWidth <= 820) {
      return true;
    }
    return false;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
          el.setAttribute(k, String(v));
        }
      }
    }
    return el;
  }

  function htmlEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function ensureStyles() {
    if (document.getElementById("organiza-calc-styles")) return;
    const stylesheet = document.createElement("link");
    stylesheet.id = "organiza-calc-styles";
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/assets/dashboard_charts.css?v=1";
    (document.head || document.documentElement).appendChild(stylesheet);
  }
  function createFallbackWaveSvg(isLight) {
    gradCounter += 1;
    const gradId = `calc-wave-grad-${gradCounter}`;
    const svg = svgEl("svg", {
      viewBox: "4.25 9.25 231.5 97.5",
      width: "46",
      height: "20",
      "aria-hidden": "true"
    });
    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "1", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": isLight ? "#2563EB" : "#00D4FF" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": isLight ? "#1D4ED8" : "#0066FF" }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    const lines = [
      { d: "M8 24 Q60 2 120 24 T232 24", op: "1.0" },
      { d: "M8 58 Q60 36 120 58 T232 58", op: "0.85" },
      { d: "M8 92 Q60 70 120 92 T232 92", op: "0.7" }
    ];
    for (const l of lines) {
      svg.appendChild(svgEl("path", {
        d: l.d,
        fill: "none",
        stroke: `url(#${gradId})`,
        "stroke-width": "11",
        "stroke-linecap": "round",
        opacity: l.op
      }));
    }
    return svg;
  }

  function buildWaveSvg(isLight) {
    if (
      window.OrganizaProcessingIndicator &&
      typeof window.OrganizaProcessingIndicator.createWaveSvg === "function"
    ) {
      return window.OrganizaProcessingIndicator.createWaveSvg(isLight, "dash-calc");
    }
    return createFallbackWaveSvg(isLight);
  }

  function clickNavRoute(id) {
    const el = document.getElementById(id);
    if (el && typeof el.click === "function") {
      el.click();
    }
  }

  function syncKofTabIfNeeded(targetPeriod) {
    const tab = document.getElementById("tab-" + targetPeriod);
    if (tab && typeof tab.click === "function") {
      syncingKofTab = true;
      try {
        tab.click();
      } finally {
        syncingKofTab = false;
      }
    }
  }

  function resolveMonthOptions(data) {
    const rawList = data && Array.isArray(data.availableMonths) ? data.availableMonths : [];
    const items = [];
    const seen = new Set();
    for (const m of rawList) {
      if (!m || !isValidYearMonth(m.key) || seen.has(m.key)) continue;
      seen.add(m.key);
      items.push({
        key: m.key,
        label: m.label || formatPeriodPt(m.key) || m.key,
        confirmedCount: Number(m.confirmedCount || 0),
        pendingCount: Number(m.pendingCount || 0)
      });
    }
    const activeKey = (data && isValidYearMonth(data.selectedMonth) ? data.selectedMonth : "") ||
      (isValidYearMonth(state.selectedMonth) ? state.selectedMonth : "");
    if (activeKey && !seen.has(activeKey)) {
      seen.add(activeKey);
      items.unshift({
        key: activeKey,
        label: (data && data.selectedMonthLabel) || formatPeriodPt(activeKey) || activeKey,
        confirmedCount: 0,
        pendingCount: 0
      });
    }
    return items;
  }

  function resolveYearOptions(data) {
    const years = new Set();
    const months = data && Array.isArray(data.availableMonths) ? data.availableMonths : [];
    for (const item of months) {
      if (item && isValidYearMonth(item.key)) years.add(item.key.slice(0, 4));
    }
    if (data && isValidYearMonth(data.selectedMonth)) years.add(data.selectedMonth.slice(0, 4));
    if (isValidYearMonth(state.selectedMonth)) years.add(state.selectedMonth.slice(0, 4));
    if (state.selectedYear && /^\d{4}$/.test(state.selectedYear)) years.add(state.selectedYear);
    if (!years.size) years.add(String(new Date().getFullYear()));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }

  function formatPeriodPill(data) {
    if (!data || (state.loading && data.period && data.period !== state.selectedPeriod)) {
      if (state.selectedPeriod === "week") return "Semana atual";
      if (state.selectedPeriod === "year") return state.selectedYear || "Ano atual";
      return isValidYearMonth(state.selectedMonth) ? formatPeriodPt(state.selectedMonth) : "Mês atual";
    }
    if (state.selectedPeriod === "year") {
      return state.selectedYear || String(data.selectedMonth || "").slice(0, 4) || "Ano atual";
    }
    if (state.loading && isValidYearMonth(state.selectedMonth) && state.selectedMonth !== data.selectedMonth) {
      return formatPeriodPt(state.selectedMonth);
    }
    if (state.selectedPeriod === "week" && data.rangeStart && data.rangeEnd) {
      const s = formatDateShortBr(data.rangeStart);
      const e = formatDateShortBr(data.rangeEnd);
      const yr = String(data.rangeEnd).slice(0, 4);
      if (s && e) return `Semana ${s} – ${e}/${yr}`;
    }
    return data.selectedMonthLabel || formatPeriodPt(data.selectedMonth) || "Período atual";
  }

  function applyPreferredCategories(data) {
    const preferred = window.__organizaPreferredCategories;
    if (!(preferred instanceof Set) || preferred.size === 0) return false;
    if (!data || !Array.isArray(data.categories)) return false;
    const available = new Set(data.categories.map((c) => String(c.code)));
    const matched = new Set(
      Array.from(preferred)
        .map((c) => String(c))
        .filter((code) => available.has(code))
    );
    state.selectedCategories = matched;
    state.savedCategories = Array.from(matched);
    state.categoriesFilterKey = `${data.selectedMonth || ""}:${data.period || ""}:${data.categories.map((c) => c.code).join(",")}`;
    window.__organizaPreferredCategories = null;
    return true;
  }

  function initCategoryFilter(data) {
    if (!data || !Array.isArray(data.categories)) return;
    if (applyPreferredCategories(data)) return;
    const key = `${data.selectedMonth || ""}:${data.period || ""}:${data.categories.map((c) => c.code).join(",")}`;
    if (state.categoriesFilterKey === key) return;
    state.categoriesFilterKey = key;
    const available = new Set(data.categories.map((c) => String(c.code)));
    state.selectedCategories = state.savedCategories === null
      ? available
      : new Set(state.savedCategories.filter((code) => available.has(code)));
  }

  function preferenceStorageKey() {
    const emailNode = document.getElementById("user-email");
    const identity = emailNode && emailNode.textContent.trim()
      ? emailNode.textContent.trim().toLowerCase()
      : getAuthHeader();
    if (!identity) return "";
    let hash = 2166136261;
    for (let i = 0; i < identity.length; i++) {
      hash ^= identity.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `organiza:dashboard-charts:v1:${(hash >>> 0).toString(16)}`;
  }

  function loadChartPreferences() {
    const key = preferenceStorageKey();
    if (!key || key === state.preferencesUserKey) return;
    state.preferencesUserKey = key;
    state.savedCategories = null;
    state.selectedCategories.clear();
    state.categoriesFilterKey = "";
    state.chartVisibility = new Set(["categories", "evolution", "envelopes", "comparison"]);
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved && Array.isArray(saved.categories)) {
        state.savedCategories = saved.categories.map(String);
      }
      if (saved && Array.isArray(saved.visibleCharts)) {
        const allowed = new Set(["categories", "evolution", "envelopes", "comparison"]);
        state.chartVisibility = new Set(saved.visibleCharts.filter((name) => allowed.has(name)));
      }
    } catch (_) {
      // Preferencias indisponÃ­veis: manter os valores padrÃ£o em memÃ³ria.
    }
  }

  function saveChartPreferences() {
    if (!state.preferencesUserKey) return;
    state.savedCategories = Array.from(state.selectedCategories);
    try {
      localStorage.setItem(state.preferencesUserKey, JSON.stringify({
        categories: state.savedCategories,
        visibleCharts: Array.from(state.chartVisibility)
      }));
    } catch (_) {
      // A personalizaÃ§Ã£o segue ativa nesta sessÃ£o mesmo sem armazenamento local.
    }
  }

  function renderChartCustomization() {
    const box = htmlEl("section", "calc-customize-box");
    box.setAttribute("aria-label", "PersonalizaÃ§Ã£o dos grÃ¡ficos");
    const copy = htmlEl("div", "calc-customize-copy");
    copy.appendChild(htmlEl("h3", "calc-customize-title", "Personalize seus grÃ¡ficos"));
    copy.appendChild(htmlEl("p", "calc-customize-sub", "Escolha quais grÃ¡ficos aparecem e os filtros ficam salvos para sua conta neste navegador."));
    box.appendChild(copy);

    const options = htmlEl("div", "calc-customize-options");
    const choices = [
      ["categories", "Categorias"],
      ["evolution", "EvoluÃ§Ã£o"],
      ["envelopes", "Caixinhas"],
      ["comparison", "ComparaÃ§Ã£o"]
    ];
    choices.forEach(([key, label]) => {
      const option = htmlEl("label", "calc-customize-option");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.chartVisibility.has(key);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.chartVisibility.add(key);
        else state.chartVisibility.delete(key);
        saveChartPreferences();
        render();
      });
      option.appendChild(checkbox);
      option.appendChild(document.createTextNode(label));
      options.appendChild(option);
    });
    box.appendChild(options);

    const reset = htmlEl("button", "calc-customize-reset", "Mostrar todos");
    reset.type = "button";
    reset.addEventListener("click", () => {
      state.chartVisibility = new Set(choices.map(([key]) => key));
      saveChartPreferences();
      render();
    });
    box.appendChild(reset);
    return box;
  }

  function renderHeader(data) {
    const header = htmlEl("div", "calc-header");

    const left = htmlEl("div", "calc-header-left");
    const titleRow = htmlEl("div", "calc-title-row");
    const title = htmlEl("h2", "calc-section-title", "Gastos Calculados");
    title.id = "calc-section-title";
    titleRow.appendChild(title);

    const sub = htmlEl(
      "p",
      "calc-section-sub",
      "Totais reais de despesas confirmadas, separados de crédito, pagamento de fatura e transferências."
    );
    left.appendChild(titleRow);
    left.appendChild(sub);
    header.appendChild(left);

    const right = htmlEl("div", "calc-header-right");

    const pill = htmlEl("span", "calc-period-pill", formatPeriodPill(data));
    pill.id = "calc-period-pill";
    right.appendChild(pill);

    const controls = htmlEl("div", "calc-controls-bar");

    const toggleGroup = htmlEl("div", "calc-period-toggle");
    toggleGroup.setAttribute("role", "group");
    toggleGroup.setAttribute("aria-label", "Granularidade do período");

    const btnWeek = htmlEl("button", "calc-toggle-btn", "Semana");
    btnWeek.type = "button";
    btnWeek.id = "calc-period-week";
    btnWeek.setAttribute("aria-pressed", state.selectedPeriod === "week" ? "true" : "false");
    btnWeek.addEventListener("click", () => {
      if (state.selectedPeriod !== "week") {
        state.selectedPeriod = "week";
        state.focusedCategoryCode = null;
        state.focusedEvolutionKey = null;
        fetchCalculatedData({ force: true });
      }
      syncKofTabIfNeeded("week");
    });

    const btnMonth = htmlEl("button", "calc-toggle-btn", "Mês");
    btnMonth.type = "button";
    btnMonth.id = "calc-period-month";
    btnMonth.setAttribute("aria-pressed", state.selectedPeriod === "month" ? "true" : "false");
    btnMonth.addEventListener("click", () => {
      if (state.selectedPeriod !== "month") {
        state.selectedPeriod = "month";
        state.focusedCategoryCode = null;
        state.focusedEvolutionKey = null;
        fetchCalculatedData({ force: true });
      }
      syncKofTabIfNeeded("month");
    });

    const btnYear = htmlEl("button", "calc-toggle-btn", "Ano");
    btnYear.type = "button";
    btnYear.id = "calc-period-year";
    btnYear.setAttribute("aria-pressed", state.selectedPeriod === "year" ? "true" : "false");
    btnYear.addEventListener("click", () => {
      if (state.selectedPeriod !== "year") {
        state.selectedPeriod = "year";
        state.selectedYear = state.selectedYear ||
          (isValidYearMonth(state.selectedMonth) ? state.selectedMonth.slice(0, 4) : "") ||
          (data && isValidYearMonth(data.selectedMonth) ? data.selectedMonth.slice(0, 4) : "") ||
          String(new Date().getFullYear());
        state.focusedCategoryCode = null;
        state.focusedEvolutionKey = null;
        fetchCalculatedData({ force: true });
      }
      syncKofTabIfNeeded("year");
    });

    toggleGroup.appendChild(btnWeek);
    toggleGroup.appendChild(btnMonth);
    toggleGroup.appendChild(btnYear);
    controls.appendChild(toggleGroup);

    const monthOptions = resolveMonthOptions(data);
    if (state.selectedPeriod === "month" && monthOptions.length > 0) {
      const activeMonth = (isValidYearMonth(state.selectedMonth) ? state.selectedMonth : "") ||
        (data && isValidYearMonth(data.selectedMonth) ? data.selectedMonth : "") ||
        monthOptions[0].key;
      const asc = monthOptions.slice().sort((a, b) => a.key.localeCompare(b.key));
      const ascIdx = asc.findIndex((m) => m.key === activeMonth);

      const picker = htmlEl("div", "calc-month-picker");
      picker.id = "calc-month-picker";

      const prevBtn = htmlEl("button", "calc-nav-arrow", "◄");
      prevBtn.type = "button";
      prevBtn.id = "calc-month-prev";
      prevBtn.setAttribute("aria-label", "Mês anterior");
      prevBtn.disabled = ascIdx <= 0;
      prevBtn.addEventListener("click", () => {
        if (ascIdx > 0) {
          state.selectedMonth = asc[ascIdx - 1].key;
          state.focusedCategoryCode = null;
          state.focusedEvolutionKey = null;
          fetchCalculatedData({ force: true });
        }
      });

      const select = htmlEl("select", "calc-month-select");
      select.id = "calc-month-select";
      select.setAttribute("aria-label", "Selecionar mês e ano");
      for (const m of monthOptions) {
        const opt = document.createElement("option");
        opt.value = m.key;
        opt.textContent = m.label;
        if (m.key === activeMonth) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        if (isValidYearMonth(select.value) && select.value !== activeMonth) {
          state.selectedMonth = select.value;
          state.focusedCategoryCode = null;
          state.focusedEvolutionKey = null;
          fetchCalculatedData({ force: true });
        }
      });

      const nextBtn = htmlEl("button", "calc-nav-arrow", "►");
      nextBtn.type = "button";
      nextBtn.id = "calc-month-next";
      nextBtn.setAttribute("aria-label", "Próximo mês");
      nextBtn.disabled = ascIdx < 0 || ascIdx >= asc.length - 1;
      nextBtn.addEventListener("click", () => {
        if (ascIdx >= 0 && ascIdx < asc.length - 1) {
          state.selectedMonth = asc[ascIdx + 1].key;
          state.focusedCategoryCode = null;
          state.focusedEvolutionKey = null;
          fetchCalculatedData({ force: true });
        }
      });

      picker.appendChild(prevBtn);
      picker.appendChild(select);
      picker.appendChild(nextBtn);
      controls.appendChild(picker);
    }

    if (state.selectedPeriod === "year") {
      const years = resolveYearOptions(data);
      const activeYear = (state.selectedYear && years.includes(state.selectedYear))
        ? state.selectedYear
        : years[0];
      state.selectedYear = activeYear;
      const picker = htmlEl("div", "calc-month-picker");
      picker.id = "calc-year-picker";
      const select = htmlEl("select", "calc-month-select");
      select.id = "calc-year-select";
      select.setAttribute("aria-label", "Selecionar ano");
      for (const year of years) {
        const opt = document.createElement("option");
        opt.value = year;
        opt.textContent = year;
        if (year === activeYear) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener("change", () => {
        if (/^\d{4}$/.test(select.value) && select.value !== state.selectedYear) {
          state.selectedYear = select.value;
          state.focusedCategoryCode = null;
          state.focusedEvolutionKey = null;
          fetchCalculatedData({ force: true });
        }
      });
      picker.appendChild(select);
      controls.appendChild(picker);
    }

    right.appendChild(controls);
    header.appendChild(right);
    return header;
  }

  function renderLoadingBody(isLight) {
    const box = htmlEl("div", "calc-loading-row");
    box.id = "calc-state-loading";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    box.setAttribute("aria-atomic", "true");
    box.appendChild(buildWaveSvg(isLight));
    box.appendChild(htmlEl("span", "calc-loading-text", "Organizando seus gastos..."));
    return box;
  }

  function renderErrorBody() {
    const box = htmlEl("div", "calc-state-box");
    box.id = "calc-state-error";
    box.setAttribute("role", "alert");
    box.appendChild(htmlEl("p", "calc-state-title", "Não foi possível carregar os Gastos Calculados."));
    box.appendChild(htmlEl("p", "calc-state-desc", state.error || "Confira sua conexão e tente novamente."));
    const retryBtn = htmlEl("button", "calc-primary-btn", "Tentar novamente");
    retryBtn.type = "button";
    retryBtn.id = "calc-retry-btn";
    retryBtn.addEventListener("click", () => fetchCalculatedData({ force: true }));
    box.appendChild(retryBtn);
    return box;
  }

  function renderEmptyBody() {
    const box = htmlEl("div", "calc-state-box");
    box.id = "calc-state-empty";
    box.appendChild(htmlEl("p", "calc-state-title", "Você ainda não tem gastos registrados neste período."));
    box.appendChild(
      htmlEl(
        "p",
        "calc-state-desc",
        "Envie uma fatura ou extrato pelo Organiza AI, ou conte um gasto por texto ou voz para ver seus gráficos reais."
      )
    );
    const cta = htmlEl("button", "calc-primary-btn", "Ir para o Organiza AI");
    cta.type = "button";
    cta.id = "calc-empty-cta";
    cta.addEventListener("click", () => clickNavRoute("nav-chat"));
    box.appendChild(cta);
    return box;
  }

  function renderPendingBody(data) {
    const flows = (data && data.flows) || {};
    const pendingMinor = reaisToMinor(flows.pendingReviewTotal || 0);
    const pendingCount = Number(flows.pendingReviewCount || 0);

    const box = htmlEl("div", "calc-state-box");
    box.id = "calc-state-pending";
    box.appendChild(htmlEl("p", "calc-state-title", "Encontramos movimentações que precisam da sua revisão."));
    box.appendChild(
      htmlEl(
        "p",
        "calc-state-desc",
        "Esses itens ainda não entraram nas despesas confirmadas para evitar valores errados ou duplicados."
      )
    );

    const stats = htmlEl("div", "calc-pending-summary-row");
    stats.appendChild(htmlEl("span", "calc-pending-stat", `Confirmadas: ${formatBrlMinor(data.confirmedTotalMinor || 0)}`));
    stats.appendChild(
      htmlEl(
        "span",
        "calc-pending-stat",
        `Em revisão: ${formatBrlMinor(pendingMinor)} (${pendingItemCountLabel(pendingCount)})`
      )
    );
    box.appendChild(stats);

    const cta = htmlEl("button", "calc-primary-btn", "Revisar no Organiza AI");
    cta.type = "button";
    cta.id = "calc-pending-cta";
    cta.addEventListener("click", () => clickNavRoute("nav-chat"));
    box.appendChild(cta);
    return box;
  }

  function renderPendingBanner() {
    const banner = htmlEl("div", "calc-pending-banner");
    banner.id = "calc-pending-banner";
    banner.setAttribute("role", "status");
    banner.appendChild(htmlEl("span", "", "Encontramos movimentações que precisam da sua revisão."));
    const btn = htmlEl("button", "calc-secondary-btn", "Revisar no Organiza AI");
    btn.type = "button";
    btn.id = "calc-banner-review-cta";
    btn.addEventListener("click", () => clickNavRoute("nav-chat"));
    banner.appendChild(btn);
    return banner;
  }

  function renderKpisAndFlows(data) {
    const wrap = document.createDocumentFragment();
    const flows = data.flows || {};

    const grid = htmlEl("div", "calc-kpi-grid");
    grid.id = "calc-kpi-grid";

    // KPI 1: Despesas confirmadas
    const kpi1 = htmlEl("div", "calc-kpi-card is-primary");
    kpi1.id = "calc-kpi-confirmed";
    kpi1.appendChild(htmlEl("span", "calc-kpi-label", "Despesas confirmadas"));
    kpi1.appendChild(htmlEl("span", "calc-kpi-value", formatBrlMinor(data.confirmedTotalMinor || 0)));
    kpi1.appendChild(htmlEl("span", "calc-kpi-sub", confirmedTxCountLabel(data.confirmedCount || 0)));
    grid.appendChild(kpi1);

    // KPI 2: Categoria com maior gasto
    const top = data.topCategory;
    const topText = top
      ? `${top.label} · ${formatBrlMinor(top.totalMinor)} (${formatPct(top.percentage)})`
      : "—";
    const kpi2 = htmlEl("div", "calc-kpi-card");
    kpi2.id = "calc-kpi-top-category";
    kpi2.appendChild(htmlEl("span", "calc-kpi-label", "Categoria com maior gasto"));
    kpi2.appendChild(htmlEl("span", "calc-kpi-value", topText));
    kpi2.appendChild(
      htmlEl("span", "calc-kpi-sub", top ? txCountLabel(top.count) : "Sem categoria predominante")
    );
    grid.appendChild(kpi2);

    // KPI 3: Em revisão
    const pendingMinor = reaisToMinor(flows.pendingReviewTotal || 0);
    const pendingCount = Number(flows.pendingReviewCount || 0);
    const kpi3 = htmlEl("div", "calc-kpi-card");
    kpi3.id = "calc-kpi-pending";
    kpi3.appendChild(htmlEl("span", "calc-kpi-label", "Em revisão"));
    kpi3.appendChild(htmlEl("span", "calc-kpi-value", formatBrlMinor(pendingMinor)));
    kpi3.appendChild(htmlEl("span", "calc-kpi-sub", pendingItemCountLabel(pendingCount)));
    grid.appendChild(kpi3);

    wrap.appendChild(grid);

    // Visual Flow Separation Strip
    const strip = htmlEl("div", "calc-flow-strip");
    strip.id = "calc-flow-strip";
    strip.appendChild(htmlEl("span", "calc-flow-title", "Fluxos separados (não somados às despesas confirmadas)"));

    const row = htmlEl("div", "calc-flow-items");

    const flowDefs = [
      {
        id: "calc-flow-credit",
        label: "Operações de crédito",
        value: `${formatBrlFromReais(flows.creditOperationsTotal || 0)} (${Number(flows.creditOperationsCount || 0)}) · compras no crédito (não somadas 2x)`
      },
      {
        id: "calc-flow-payments",
        label: "Pagamentos de fatura",
        value: `${formatBrlFromReais(flows.billPaymentsTotal || 0)} (${Number(flows.billPaymentsCount || 0)}) · não somados às despesas`
      },
      {
        id: "calc-flow-transfers",
        label: "Transferências internas",
        value: `${formatBrlFromReais(flows.internalTransfersTotal || 0)} (${Number(flows.internalTransfersCount || 0)}) · não somadas às despesas`
      }
    ];

    for (const def of flowDefs) {
      const pill = htmlEl("div", "calc-flow-pill");
      pill.id = def.id;
      pill.appendChild(htmlEl("span", "calc-flow-pill-label", def.label));
      pill.appendChild(htmlEl("span", "calc-flow-pill-val", def.value));
      row.appendChild(pill);
    }

    strip.appendChild(row);
    wrap.appendChild(strip);
    return wrap;
  }

  function buildAnnulusFullPath(cx, cy, ro, ri) {
    return [
      `M ${cx} ${cy - ro}`,
      `A ${ro} ${ro} 0 1 1 ${cx} ${cy + ro}`,
      `A ${ro} ${ro} 0 1 1 ${cx} ${cy - ro}`,
      `M ${cx} ${cy - ri}`,
      `A ${ri} ${ri} 0 1 0 ${cx} ${cy + ri}`,
      `A ${ri} ${ri} 0 1 0 ${cx} ${cy - ri}`,
      "Z"
    ].join(" ");
  }

  function buildDonutSlicePath(cx, cy, ro, ri, a0, a1) {
    const x0o = cx + ro * Math.cos(a0);
    const y0o = cy + ro * Math.sin(a0);
    const x1o = cx + ro * Math.cos(a1);
    const y1o = cy + ro * Math.sin(a1);
    const x1i = cx + ri * Math.cos(a1);
    const y1i = cy + ri * Math.sin(a1);
    const x0i = cx + ri * Math.cos(a0);
    const y0i = cy + ri * Math.sin(a0);
    const largeArc = (a1 - a0) > Math.PI ? 1 : 0;
    return [
      `M ${x0o.toFixed(3)} ${y0o.toFixed(3)}`,
      `A ${ro} ${ro} 0 ${largeArc} 1 ${x1o.toFixed(3)} ${y1o.toFixed(3)}`,
      `L ${x1i.toFixed(3)} ${y1i.toFixed(3)}`,
      `A ${ri} ${ri} 0 ${largeArc} 0 ${x0i.toFixed(3)} ${y0i.toFixed(3)}`,
      "Z"
    ].join(" ");
  }

  function renderCategoryDonutChart(data, isLight) {
    const card = htmlEl("section", "calc-chart-card");
    card.id = "calc-chart-categories";
    card.setAttribute("aria-labelledby", "calc-chart-categories-title");

    const head = htmlEl("div", "calc-chart-head");
    const headLeft = htmlEl("div");
    const title = htmlEl("h3", "calc-chart-title", "Gastos por categoria");
    title.id = "calc-chart-categories-title";
    headLeft.appendChild(title);
    headLeft.appendChild(htmlEl("p", "calc-chart-sub", "Distribuição real das despesas confirmadas"));
    head.appendChild(headLeft);
    card.appendChild(head);

    const categories = Array.isArray(data.categories) ? data.categories : [];
    const positiveSlices = categories.filter((c) => Number(c.totalMinor || 0) > 0);
    const totalPositiveMinor = positiveSlices.reduce((acc, c) => acc + Number(c.totalMinor || 0), 0);

    if (categories.length === 0 || totalPositiveMinor <= 0) {
      card.appendChild(htmlEl("p", "calc-chart-sub", "Sem despesas por categoria neste período."));
      return card;
    }

    const colorByCode = new Map();
    categories.forEach((cat, idx) => {
      colorByCode.set(String(cat.code), CHART_PALETTE[idx % CHART_PALETTE.length]);
    });

    const layout = htmlEl("div", "calc-donut-layout");

    // Donut Stage
    const stage = htmlEl("div", "calc-donut-stage");
    const svg = svgEl("svg", {
      viewBox: "0 0 220 220",
      class: "calc-donut-svg",
      role: "img",
      "aria-labelledby": "calc-chart-categories-title"
    });
    const cx = 110;
    const cy = 110;
    const ro = 88;
    const ri = 56;

    svg.appendChild(svgEl("circle", {
      cx,
      cy,
      r: (ro + ri) / 2,
      fill: "none",
      stroke: isLight ? "#E5E7EB" : "rgba(255,255,255,0.06)",
      "stroke-width": ro - ri
    }));

    const sliceNodes = new Map();
    const sliceMeta = new Map();
    let angleCursor = -Math.PI / 2;

    positiveSlices.forEach((cat) => {
      const code = String(cat.code);
      const frac = Number(cat.totalMinor) / totalPositiveMinor;
      const span = frac * Math.PI * 2;
      const start = angleCursor;
      const end = start + span;
      angleCursor = end;

      const isSingleFull = positiveSlices.length === 1 || span >= Math.PI * 2 - 0.001;
      const halfGap = positiveSlices.length > 1 ? Math.min(0.018, span * 0.22) : 0;
      const a0 = start + halfGap;
      const a1 = end - halfGap;
      const mid = (a0 + a1) / 2;
      const d = isSingleFull
        ? buildAnnulusFullPath(cx, cy, ro, ri)
        : buildDonutSlicePath(cx, cy, ro, ri, a0, a1);

      const path = svgEl("path", {
        d,
        fill: colorByCode.get(code),
        "fill-rule": isSingleFull ? "evenodd" : "nonzero",
        class: "calc-donut-slice",
        tabindex: "0",
        role: "button",
        "data-cat-code": code,
        "aria-label": `${cat.label}: ${formatBrlMinor(cat.totalMinor)}, ${formatPct(cat.percentage)} do total, ${txCountLabel(cat.count)}`,
        "aria-pressed": state.focusedCategoryCode === code ? "true" : "false"
      });

      sliceMeta.set(code, { cat, mid, isSingleFull });
      sliceNodes.set(code, path);
      svg.appendChild(path);
    });

    stage.appendChild(svg);

    // Donut Center Overlay
    const center = htmlEl("div", "calc-donut-center");
    center.id = "calc-donut-center";
    const cName = htmlEl("span", "calc-donut-center-name");
    const cVal = htmlEl("span", "calc-donut-center-val");
    const cPct = htmlEl("span", "calc-donut-center-pct");
    const cCount = htmlEl("span", "calc-donut-center-count");
    center.appendChild(cName);
    center.appendChild(cVal);
    center.appendChild(cPct);
    center.appendChild(cCount);
    stage.appendChild(center);
    layout.appendChild(stage);

    // Legend + Checkboxes
    const legendCol = htmlEl("div", "calc-legend-col");
    const filterBar = htmlEl("div", "calc-filter-bar");
    const filterInfo = htmlEl("span");
    filterInfo.id = "calc-cat-filter-info";
    const resetFilterBtn = htmlEl("button", "calc-filter-reset", "Selecionar todas");
    resetFilterBtn.type = "button";
    resetFilterBtn.id = "calc-cat-filter-reset";
    filterBar.appendChild(filterInfo);
    filterBar.appendChild(resetFilterBtn);
    legendCol.appendChild(filterBar);

    const legendList = htmlEl("div", "calc-legend-list");
    legendList.id = "calc-cat-legend";
    const legendRows = new Map();
    const checkboxNodes = new Map();

    categories.forEach((cat) => {
      const code = String(cat.code);
      const row = htmlEl("div", "calc-legend-row");
      row.setAttribute("data-cat-code", code);

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "calc-cat-checkbox";
      cb.setAttribute("data-cat-code", code);
      cb.setAttribute("aria-label", `Filtrar categoria ${cat.label}`);
      cb.checked = state.selectedCategories.has(code);

      const btn = htmlEl("button", "calc-legend-btn");
      btn.type = "button";
      btn.setAttribute("data-cat-code", code);

      const left = htmlEl("span", "calc-legend-left");
      const dot = htmlEl("span", "calc-swatch");
      dot.style.backgroundColor = colorByCode.get(code);
      left.appendChild(dot);
      left.appendChild(htmlEl("span", "calc-legend-name", cat.label));

      const meta = htmlEl(
        "span",
        "calc-legend-meta",
        `${formatBrlMinor(cat.totalMinor)} · ${formatPct(cat.percentage)} (${cat.count})`
      );

      btn.appendChild(left);
      btn.appendChild(meta);
      row.appendChild(cb);
      row.appendChild(btn);
      legendList.appendChild(row);

      legendRows.set(code, row);
      checkboxNodes.set(code, cb);
    });

    legendCol.appendChild(legendList);
    layout.appendChild(legendCol);
    card.appendChild(layout);

    // Accessible Tooltip Card
    const tooltip = htmlEl("div", "calc-tooltip-box");
    tooltip.id = "calc-donut-tooltip";
    tooltip.setAttribute("role", "region");
    tooltip.setAttribute("aria-live", "polite");
    tooltip.setAttribute("aria-label", "Detalhes da categoria selecionada");
    const tipPrimary = htmlEl("div", "calc-tooltip-primary");
    const tipDot = htmlEl("span", "calc-swatch");
    const tipTitle = htmlEl("span");
    tipPrimary.appendChild(tipDot);
    tipPrimary.appendChild(tipTitle);
    const tipMetrics = htmlEl("div", "calc-tooltip-metrics");
    tooltip.appendChild(tipPrimary);
    tooltip.appendChild(tipMetrics);
    card.appendChild(tooltip);

    function syncDonutVisuals() {
      const checkedCats = categories.filter((c) => state.selectedCategories.has(String(c.code)));
      const hasSubsetFilter = checkedCats.length > 0 && checkedCats.length < categories.length;
      const noneChecked = checkedCats.length === 0;
      const focused = state.focusedCategoryCode
        ? categories.find((c) => String(c.code) === state.focusedCategoryCode) || null
        : null;

      filterInfo.textContent = noneChecked
        ? "Nenhuma categoria marcada no destaque"
        : hasSubsetFilter
          ? `${checkedCats.length} de ${categories.length} em destaque (${formatBrlMinor(checkedCats.reduce((s, c) => s + Number(c.totalMinor || 0), 0))})`
          : `Todas as ${categories.length} categorias`;
      resetFilterBtn.hidden = checkedCats.length === categories.length;

      for (const [code, path] of sliceNodes.entries()) {
        const isChecked = state.selectedCategories.has(code);
        const isFocused = focused && String(focused.code) === code;
        const meta = sliceMeta.get(code);
        let opacity = 1;
        if (!isChecked) {
          opacity = 0.18;
        } else if (focused && !isFocused) {
          opacity = 0.52;
        }
        path.setAttribute("opacity", String(opacity));
        path.setAttribute("aria-pressed", isFocused ? "true" : "false");
        if (isFocused && meta && !meta.isSingleFull) {
          const dx = (5 * Math.cos(meta.mid)).toFixed(2);
          const dy = (5 * Math.sin(meta.mid)).toFixed(2);
          path.setAttribute("transform", `translate(${dx}, ${dy})`);
        } else {
          path.removeAttribute("transform");
        }
        if (isFocused) {
          path.setAttribute("stroke", isLight ? "#1A1D2E" : "#FFFFFF");
          path.setAttribute("stroke-width", "1.5");
        } else {
          path.removeAttribute("stroke");
          path.removeAttribute("stroke-width");
        }
      }

      for (const [code, row] of legendRows.entries()) {
        const isChecked = state.selectedCategories.has(code);
        const isFocused = focused && String(focused.code) === code;
        row.classList.toggle("is-active", Boolean(isFocused));
        row.classList.toggle("is-dimmed", !isChecked && !isFocused);
        const cb = checkboxNodes.get(code);
        if (cb) cb.checked = isChecked;
      }

      // Center & Tooltip
      let displayTarget = focused;
      if (!displayTarget && checkedCats.length === 1) {
        displayTarget = checkedCats[0];
      }

      if (displayTarget) {
        const code = String(displayTarget.code);
        cName.textContent = displayTarget.label;
        cVal.textContent = formatBrlMinor(displayTarget.totalMinor);
        cPct.textContent = formatPct(displayTarget.percentage);
        cCount.textContent = txCountLabel(displayTarget.count);

        tipDot.style.backgroundColor = colorByCode.get(code) || CHART_PALETTE[0];
        tipDot.style.display = "inline-block";
        tipTitle.textContent = displayTarget.label;
        tipMetrics.textContent = `${formatBrlMinor(displayTarget.totalMinor)} · ${formatPct(displayTarget.percentage)} do total · ${txCountLabel(displayTarget.count)}`;
      } else if (hasSubsetFilter) {
        const sumMinor = checkedCats.reduce((s, c) => s + Number(c.totalMinor || 0), 0);
        const sumPct = checkedCats.reduce((s, c) => s + Number(c.percentage || 0), 0);
        const sumCount = checkedCats.reduce((s, c) => s + Number(c.count || 0), 0);
        cName.textContent = "Filtradas";
        cVal.textContent = formatBrlMinor(sumMinor);
        cPct.textContent = formatPct(sumPct);
        cCount.textContent = txCountLabel(sumCount);

        tipDot.style.display = "none";
        tipTitle.textContent = `Seleção (${checkedCats.length} categorias)`;
        tipMetrics.textContent = `${formatBrlMinor(sumMinor)} · ${formatPct(sumPct)} do total · ${txCountLabel(sumCount)}`;
      } else {
        cName.textContent = "Confirmadas";
        cVal.textContent = formatBrlMinor(data.confirmedTotalMinor || 0);
        cPct.textContent = "100%";
        cCount.textContent = txCountLabel(data.confirmedCount || 0);

        tipDot.style.display = "none";
        tipTitle.textContent = "Visão geral das categorias";
        tipMetrics.textContent = `${formatBrlMinor(data.confirmedTotalMinor || 0)} · ${txCountLabel(data.confirmedCount || 0)} · Passe o mouse ou use Tab/Enter em uma fatia.`;
      }
    }

    function setFocusedCategory(code, toggleOnClick) {
      if (toggleOnClick && state.focusedCategoryCode === code) {
        state.focusedCategoryCode = null;
      } else {
        state.focusedCategoryCode = code;
      }
      syncDonutVisuals();
    }

    for (const [code, path] of sliceNodes.entries()) {
      path.addEventListener("mouseenter", () => setFocusedCategory(code, false));
      path.addEventListener("focus", () => setFocusedCategory(code, false));
      path.addEventListener("click", () => setFocusedCategory(code, true));
      path.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          setFocusedCategory(code, true);
        }
      });
    }

    for (const [code, row] of legendRows.entries()) {
      const cb = checkboxNodes.get(code);
      const btn = row.querySelector(".calc-legend-btn");
      if (cb) {
        cb.addEventListener("change", () => {
          if (cb.checked) state.selectedCategories.add(code);
          else state.selectedCategories.delete(code);
          saveChartPreferences();
          syncDonutVisuals();
        });
      }
      if (btn) {
        btn.addEventListener("mouseenter", () => setFocusedCategory(code, false));
        btn.addEventListener("focus", () => setFocusedCategory(code, false));
        btn.addEventListener("click", () => setFocusedCategory(code, true));
      }
    }

    resetFilterBtn.addEventListener("click", () => {
      state.selectedCategories = new Set(categories.map((c) => String(c.code)));
      saveChartPreferences();
      syncDonutVisuals();
    });

    svg.addEventListener("mouseleave", () => {
      if (document.activeElement && svg.contains(document.activeElement)) return;
      if (state.focusedCategoryCode !== null) {
        state.focusedCategoryCode = null;
        syncDonutVisuals();
      }
    });

    syncDonutVisuals();
    return card;
  }

  function renderEvolutionChart(data, isLight) {
    const card = htmlEl("section", "calc-chart-card");
    card.id = "calc-chart-evolution";
    card.setAttribute("aria-labelledby", "calc-chart-evolution-title");

    const head = htmlEl("div", "calc-chart-head");
    const headLeft = htmlEl("div");
    const title = htmlEl("h3", "calc-chart-title", "Evolução dos gastos");
    title.id = "calc-chart-evolution-title";
    headLeft.appendChild(title);
    headLeft.appendChild(
      htmlEl(
        "p",
        "calc-chart-sub",
        state.selectedPeriod === "week"
          ? "Apenas dias reais da semana com despesas confirmadas"
          : "Apenas dias reais do mês com despesas confirmadas"
      )
    );
    head.appendChild(headLeft);
    card.appendChild(head);

    const points = Array.isArray(data.evolution) ? data.evolution : [];
    if (points.length === 0) {
      card.appendChild(htmlEl("p", "calc-chart-sub", "Nenhum lançamento com data registrada neste período."));
      return card;
    }

    gradCounter += 1;
    const gradId = `calc-evo-grad-${gradCounter}`;
    const clipId = `calc-evo-clip-${gradCounter}`;

    const padLeft = 74;
    const padRight = 18;
    const padTop = 18;
    const padBottom = 42;
    const plotHeight = 166;
    const yBase = padTop + plotHeight;
    const minSlot = state.selectedPeriod === "week" ? 64 : 46;
    const svgWidth = Math.max(540, padLeft + padRight + points.length * minSlot);
    const svgHeight = padTop + plotHeight + padBottom;
    const plotWidth = svgWidth - padLeft - padRight;

    const maxPointMinor = Math.max(...points.map((p) => Number(p.totalMinor || 0)), 100);
    // Nice upper bound rounded up cleanly in reais
    const maxReais = Math.ceil(maxPointMinor / 100);
    const stepReais = Math.max(1, Math.ceil(maxReais / 4 / 10) * 10 || Math.ceil(maxReais / 4));
    const niceMaxMinor = Math.max(maxPointMinor, stepReais * 4 * 100);

    const svgWrap = htmlEl("div", "calc-svg-scroll");
    const svg = svgEl("svg", {
      viewBox: `0 0 ${svgWidth} ${svgHeight}`,
      class: "calc-evo-svg",
      role: "img",
      "aria-labelledby": "calc-chart-evolution-title"
    });
    if (svgWidth > 540) {
      svg.style.minWidth = `${svgWidth}px`;
    }

    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#00D4FF" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#0066FF" }));
    defs.appendChild(grad);

    const clip = svgEl("clipPath", { id: clipId });
    clip.appendChild(svgEl("rect", { x: padLeft, y: padTop, width: plotWidth, height: plotHeight }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    const gridColor = isLight ? "#E5E7EB" : "rgba(255,255,255,0.12)";
    const axisTextColor = isLight ? "#6B7280" : "#7B8EAD";
    const ticks = [0, 0.25, 0.5, 0.75, 1];
    for (const frac of ticks) {
      const y = yBase - frac * plotHeight;
      const tickMinor = Math.round(niceMaxMinor * frac);
      svg.appendChild(svgEl("line", {
        x1: padLeft,
        y1: y.toFixed(2),
        x2: svgWidth - padRight,
        y2: y.toFixed(2),
        stroke: gridColor,
        "stroke-width": frac === 0 ? "1.2" : "1",
        "stroke-dasharray": frac === 0 ? "none" : "4 4"
      }));
      const lbl = svgEl("text", {
        x: padLeft - 8,
        y: (y + 4).toFixed(2),
        "text-anchor": "end",
        fill: axisTextColor,
        "font-size": "11",
        "font-weight": "600",
        "font-family": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
      });
      lbl.textContent = formatBrlAxis(tickMinor);
      svg.appendChild(lbl);
    }

    const slotWidth = plotWidth / points.length;
    const barWidth = Math.min(44, Math.max(16, slotWidth * 0.58));
    const barsGroup = svgEl("g", { "clip-path": `url(#${clipId})` });
    const barNodes = new Map();

    points.forEach((pt, idx) => {
      const key = String(pt.key || pt.dateIso || idx);
      const valMinor = Math.max(0, Number(pt.totalMinor || 0));
      const rawH = valMinor > 0 ? Math.max(8, (valMinor / niceMaxMinor) * plotHeight) : 2;
      const cxSlot = padLeft + slotWidth * idx + slotWidth / 2;
      const x = cxSlot - barWidth / 2;
      const y = yBase - rawH;
      const labelText = pt.label || formatDateShortBr(pt.dateIso || key);

      // Add +8 height below yBase (clipped cleanly by clipPath) so top keeps rx="8" and bottom is flat on axis
      const rect = svgEl("rect", {
        x: x.toFixed(2),
        y: y.toFixed(2),
        width: barWidth.toFixed(2),
        height: (rawH + 8).toFixed(2),
        rx: "8",
        ry: "8",
        fill: `url(#${gradId})`,
        class: "calc-evo-bar",
        tabindex: "0",
        role: "button",
        "data-evo-key": key,
        "aria-label": `${labelText} (${formatDateFullBr(pt.dateIso || key)}): ${formatBrlMinor(valMinor)}, ${txCountLabel(pt.count)}`
      });
      barsGroup.appendChild(rect);
      barNodes.set(key, { rect, pt, labelText });

      const xLbl = svgEl("text", {
        x: cxSlot.toFixed(2),
        y: yBase + 18,
        "text-anchor": "middle",
        fill: axisTextColor,
        "font-size": "11",
        "font-weight": "600",
        "font-family": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
      });
      xLbl.textContent = labelText;
      svg.appendChild(xLbl);
    });

    svg.appendChild(barsGroup);
    svgWrap.appendChild(svg);
    card.appendChild(svgWrap);

    // Accessible Tooltip Region
    const tooltip = htmlEl("div", "calc-tooltip-box");
    tooltip.id = "calc-evo-tooltip";
    tooltip.setAttribute("role", "region");
    tooltip.setAttribute("aria-live", "polite");
    tooltip.setAttribute("aria-label", "Detalhes do dia na evolução dos gastos");
    const tipPrimary = htmlEl("div", "calc-tooltip-primary");
    const tipMetrics = htmlEl("div", "calc-tooltip-metrics");
    tooltip.appendChild(tipPrimary);
    tooltip.appendChild(tipMetrics);
    card.appendChild(tooltip);

    function syncEvoVisuals() {
      const focusedKey = state.focusedEvolutionKey;
      const activeEntry = focusedKey && barNodes.has(focusedKey) ? barNodes.get(focusedKey) : null;

      for (const [key, entry] of barNodes.entries()) {
        const isActive = Boolean(activeEntry && key === focusedKey);
        entry.rect.setAttribute("opacity", activeEntry && !isActive ? "0.45" : "1");
        if (isActive) {
          entry.rect.setAttribute("stroke", isLight ? "#1A1D2E" : "#FFFFFF");
          entry.rect.setAttribute("stroke-width", "1.5");
        } else {
          entry.rect.removeAttribute("stroke");
          entry.rect.removeAttribute("stroke-width");
        }
      }

      if (activeEntry) {
        const { pt, labelText } = activeEntry;
        const detailDate = state.selectedPeriod === "year" && pt.dateIso
          ? formatPeriodPt(String(pt.dateIso).slice(0, 7))
          : formatDateFullBr(pt.dateIso || pt.key);
        tipPrimary.textContent = `${labelText} (${detailDate})`;
        tipMetrics.textContent = `${formatBrlMinor(pt.totalMinor)} · ${txCountLabel(pt.count)}`;
      } else {
        const latest = points[points.length - 1];
        const unit = state.selectedPeriod === "year" ? "mês" : "dia";
        tipPrimary.textContent = `${points.length} ${unit}${points.length === 1 ? " registrado" : "s registrados"}`;
        tipMetrics.textContent = `Último dia (${latest.label || formatDateShortBr(latest.dateIso)}): ${formatBrlMinor(latest.totalMinor)} · Passe o mouse ou use Tab em uma barra.`;
      }
    }

    function setFocusedEvo(key, toggle) {
      if (toggle && state.focusedEvolutionKey === key) {
        state.focusedEvolutionKey = null;
      } else {
        state.focusedEvolutionKey = key;
      }
      syncEvoVisuals();
    }

    for (const [key, entry] of barNodes.entries()) {
      entry.rect.addEventListener("mouseenter", () => setFocusedEvo(key, false));
      entry.rect.addEventListener("focus", () => setFocusedEvo(key, false));
      entry.rect.addEventListener("click", () => setFocusedEvo(key, true));
      entry.rect.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          setFocusedEvo(key, true);
        }
      });
    }

    svg.addEventListener("mouseleave", () => {
      if (document.activeElement && svg.contains(document.activeElement)) return;
      if (state.focusedEvolutionKey !== null) {
        state.focusedEvolutionKey = null;
        syncEvoVisuals();
      }
    });

    syncEvoVisuals();
    return card;
  }

  function renderEnvelopesChart(data, isLight) {
    const card = htmlEl("section", "calc-chart-card");
    card.id = "calc-chart-envelopes";
    card.setAttribute("aria-labelledby", "calc-chart-envelopes-title");

    const head = htmlEl("div", "calc-chart-head");
    const headLeft = htmlEl("div");
    const title = htmlEl("h3", "calc-chart-title", "Caixinhas");
    title.id = "calc-chart-envelopes-title";
    headLeft.appendChild(title);
    headLeft.appendChild(htmlEl(
      "p",
      "calc-chart-sub",
      data.period === "year"
        ? "Gastos do ano por caixinha. Os limites mensais não são comparados ao total anual."
        : "Consumo mensal em relação ao limite de cada caixinha"
    ));
    head.appendChild(headLeft);
    card.appendChild(head);

    const envelopes = Array.isArray(data.envelopes) ? data.envelopes : [];
    if (envelopes.length === 0) {
      const emptyWrap = htmlEl("div", "calc-comp-empty");
      emptyWrap.appendChild(
        htmlEl(
          "p",
          "calc-chart-sub",
          "Você ainda não criou caixinhas. Crie na aba Caixinhas para acompanhar cada limite."
        )
      );
      const goBtn = htmlEl("button", "calc-secondary-btn", "Ir para Caixinhas");
      goBtn.type = "button";
      goBtn.style.marginTop = "10px";
      goBtn.addEventListener("click", () => clickNavRoute("nav-envelopes"));
      emptyWrap.appendChild(goBtn);
      card.appendChild(emptyWrap);
      return card;
    }

    const list = htmlEl("div", "calc-env-list");
    for (const env of envelopes) {
      const row = htmlEl("div", "calc-env-row");
      row.setAttribute("data-env-id", String(env.id || ""));

      const top = htmlEl("div", "calc-env-top");
      const nameWrap = htmlEl("div", "calc-env-name-wrap");
      nameWrap.appendChild(htmlEl("span", "calc-env-name", env.name || "Caixinha"));
      if (env.bucket) {
        nameWrap.appendChild(htmlEl("span", "calc-env-bucket", env.bucket));
      }
      top.appendChild(nameWrap);

      const hasLimit = Boolean(env.hasLimit);
      const exceeded = hasLimit && Boolean(env.exceeded);

      if (!hasLimit) {
        top.appendChild(htmlEl("span", "calc-env-badge-nolimit", "Sem limite definido"));
      } else if (exceeded) {
        top.appendChild(htmlEl("span", "calc-env-badge-warn", "Acima do planejado"));
      }
      row.appendChild(top);

      const spentMinor = Number(env.spentMinor || 0);
      const metrics = htmlEl("div", "calc-env-metrics");
      if (hasLimit) {
        const limitMinor = Number(env.limitMinor || 0);
        const remMinor = Number(env.remainingMinor || 0);
        const pct = Math.max(0, Math.round(Number(env.percent || 0)));
        const remText = exceeded || remMinor < 0
          ? `Passou ${formatBrlMinor(Math.abs(remMinor))}`
          : `Restam ${formatBrlMinor(remMinor)}`;

        metrics.appendChild(
          htmlEl("span", "", `Utilizado: ${formatBrlMinor(spentMinor)} de ${formatBrlMinor(limitMinor)} · ${remText}`)
        );
        const pctEl = htmlEl("span", exceeded ? "calc-env-pct is-exceeded" : "calc-env-pct", `${pct}%`);
        metrics.appendChild(pctEl);
        row.appendChild(metrics);

        // SVG progress bar
        const clampedPct = Math.max(0, Math.min(100, pct));
        const barHost = htmlEl("div");
        barHost.setAttribute("role", "progressbar");
        barHost.setAttribute("aria-valuemin", "0");
        barHost.setAttribute("aria-valuemax", "100");
        barHost.setAttribute("aria-valuenow", String(pct));
        barHost.setAttribute("aria-label", `${env.name}: ${pct}% consumido`);

        gradCounter += 1;
        const barGradId = `calc-env-grad-${gradCounter}`;
        const svg = svgEl("svg", {
          viewBox: "0 0 240 10",
          width: "100%",
          height: "10",
          preserveAspectRatio: "none",
          "aria-hidden": "true"
        });
        svg.style.display = "block";
        const defs = svgEl("defs");
        const grad = svgEl("linearGradient", { id: barGradId, x1: "0", y1: "0", x2: "1", y2: "0" });
        if (exceeded) {
          grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#FFB800" }));
          grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#F59E0B" }));
        } else if (env.status === "ALERTA" || pct >= 80) {
          grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#00D4FF" }));
          grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#FFB800" }));
        } else {
          grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": isLight ? "#2563EB" : "#00D4FF" }));
          grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": isLight ? "#1D4ED8" : "#0066FF" }));
        }
        defs.appendChild(grad);
        svg.appendChild(defs);
        svg.appendChild(svgEl("rect", {
          x: "0",
          y: "0",
          width: "240",
          height: "10",
          rx: "5",
          ry: "5",
          fill: isLight ? "#E5E7EB" : "rgba(255,255,255,0.08)"
        }));
        if (clampedPct > 0) {
          const fillW = Math.max(8, (clampedPct / 100) * 240);
          svg.appendChild(svgEl("rect", {
            x: "0",
            y: "0",
            width: fillW.toFixed(2),
            height: "10",
            rx: "5",
            ry: "5",
            fill: `url(#${barGradId})`
          }));
        }
        barHost.appendChild(svg);
        row.appendChild(barHost);

        if (exceeded) {
          row.appendChild(
            htmlEl(
              "span",
              "calc-env-note",
              "Você ultrapassou o planejado nesta caixinha — vale ajustar o ritmo ou revisar o limite."
            )
          );
        }
      } else {
        metrics.appendChild(htmlEl("span", "", `Utilizado: ${formatBrlMinor(spentMinor)}`));
        metrics.appendChild(htmlEl("span", "", "Sem cálculo de percentual"));
        row.appendChild(metrics);
      }

      list.appendChild(row);
    }

    card.appendChild(list);
    return card;
  }

  function renderComparisonChart(data, isLight) {
    const card = htmlEl("section", "calc-chart-card");
    card.id = "calc-chart-comparison";
    card.setAttribute("aria-labelledby", "calc-chart-comparison-title");

    const comp = data.comparison || {};
    const head = htmlEl("div", "calc-chart-head");
    const headLeft = htmlEl("div");
    const title = htmlEl("h3", "calc-chart-title", data.period === "year" ? "Comparação anual" : "Comparação mensal");
    title.id = "calc-chart-comparison-title";
    headLeft.appendChild(title);
    headLeft.appendChild(htmlEl("p", "calc-chart-sub", "Evolução do total confirmado em relação ao mês anterior"));
    head.appendChild(headLeft);

    if (comp.hasEnoughData) {
      const deltaMinor = Number(comp.deltaMinor || 0);
      const pctNum = Number(comp.deltaPercent || 0);
      const sign = deltaMinor > 0 && pctNum > 0 ? "+" : "";
      const pillClass = deltaMinor < 0
        ? "calc-delta-pill is-down"
        : deltaMinor > 0
          ? "calc-delta-pill is-up"
          : "calc-delta-pill is-flat";
      const deltaPill = htmlEl("span", pillClass, `${sign}${formatPct(pctNum)}`);
      deltaPill.id = "calc-comparison-delta";
      head.appendChild(deltaPill);
    }
    card.appendChild(head);

    if (!comp.hasEnoughData) {
      const emptyBox = htmlEl("div", "calc-comp-empty");
      emptyBox.appendChild(
        htmlEl(
          "p",
          "calc-comp-msg",
          comp.message || "Ainda não há dados suficientes do mês anterior para comparar."
        )
      );
      card.appendChild(emptyBox);
      return card;
    }

    const prevMinor = Math.max(0, Number(comp.previousMinor || 0));
    const currMinor = Math.max(0, Number(comp.currentMinor || 0));
    const maxMinor = Math.max(prevMinor, currMinor, 1);

    gradCounter += 1;
    const curGradId = `calc-comp-cur-${gradCounter}`;
    const clipId = `calc-comp-clip-${gradCounter}`;

    const svgW = 360;
    const svgH = 196;
    const padTop = 32;
    const yBase = 152;
    const plotH = yBase - padTop;

    const svg = svgEl("svg", {
      viewBox: `0 0 ${svgW} ${svgH}`,
      class: "calc-comp-svg",
      role: "img",
      "aria-labelledby": "calc-chart-comparison-title"
    });
    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", { id: curGradId, x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#00D4FF" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#0066FF" }));
    defs.appendChild(grad);
    const clip = svgEl("clipPath", { id: clipId });
    clip.appendChild(svgEl("rect", { x: "20", y: padTop, width: svgW - 40, height: plotH }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    const gridColor = isLight ? "#E5E7EB" : "rgba(255,255,255,0.14)";
    const textMain = isLight ? "#1A1D2E" : "#F0F0F0";
    const textMuted = isLight ? "#6B7280" : "#7B8EAD";

    svg.appendChild(svgEl("line", {
      x1: "32",
      y1: yBase,
      x2: svgW - 32,
      y2: yBase,
      stroke: gridColor,
      "stroke-width": "1.2"
    }));

    const bars = [
      {
        label: comp.previousLabel || comp.previousMonth || "Mês anterior",
        minor: prevMinor,
        x: 78,
        fill: isLight ? "#7B8EAD" : "#4A5578"
      },
      {
        label: comp.currentLabel || comp.currentMonth || "Mês atual",
        minor: currMinor,
        x: 218,
        fill: `url(#${curGradId})`
      }
    ];
    const barW = 64;
    const clippedGroup = svgEl("g", { "clip-path": `url(#${clipId})` });

    for (const b of bars) {
      const h = b.minor > 0 ? Math.max(10, (b.minor / maxMinor) * plotH) : 4;
      const y = yBase - h;
      const cx = b.x + barW / 2;

      const rect = svgEl("rect", {
        x: b.x,
        y: y.toFixed(2),
        width: barW,
        height: (h + 8).toFixed(2),
        rx: "8",
        ry: "8",
        fill: b.fill,
        tabindex: "0",
        role: "img",
        "aria-label": `${b.label}: ${formatBrlMinor(b.minor)}`
      });
      clippedGroup.appendChild(rect);

      const valLbl = svgEl("text", {
        x: cx,
        y: Math.max(16, y - 8).toFixed(2),
        "text-anchor": "middle",
        fill: textMain,
        "font-size": "12",
        "font-weight": "700",
        "font-family": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
      });
      valLbl.textContent = formatBrlMinor(b.minor);
      svg.appendChild(valLbl);

      const xLbl = svgEl("text", {
        x: cx,
        y: yBase + 22,
        "text-anchor": "middle",
        fill: textMuted,
        "font-size": "11.5",
        "font-weight": "600",
        "font-family": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
      });
      xLbl.textContent = b.label;
      svg.appendChild(xLbl);
    }

    svg.appendChild(clippedGroup);
    card.appendChild(svg);

    if (comp.message) {
      card.appendChild(htmlEl("p", "calc-comp-msg", comp.message));
    }

    return card;
  }

  function renderReadyBody(data, isLight) {
    const frag = document.createDocumentFragment();
    if (data.hasPendingConfirmation) {
      frag.appendChild(renderPendingBanner());
    }
    frag.appendChild(renderKpisAndFlows(data));
    frag.appendChild(renderChartCustomization());

    const chartsGrid = htmlEl("div", "calc-charts-grid");
    chartsGrid.id = "calc-charts-grid";
    if (state.chartVisibility.has("categories")) chartsGrid.appendChild(renderCategoryDonutChart(data, isLight));
    if (state.chartVisibility.has("evolution")) chartsGrid.appendChild(renderEvolutionChart(data, isLight));
    if (state.chartVisibility.has("envelopes")) chartsGrid.appendChild(renderEnvelopesChart(data, isLight));
    if (state.chartVisibility.has("comparison")) chartsGrid.appendChild(renderComparisonChart(data, isLight));
    if (!chartsGrid.children.length) {
      chartsGrid.appendChild(htmlEl("p", "calc-chart-sub", "Ative pelo menos um grÃ¡fico para visualizar seus dados."));
    }
    frag.appendChild(chartsGrid);

    const tip = htmlEl(
      "div",
      "calc-tip-box",
      "As caixinhas ajudam a visualizar quanto do seu orçamento já foi utilizado."
    );
    tip.id = "calc-bottom-tip";
    frag.appendChild(tip);

    return frag;
  }

  function render() {
    const root = document.getElementById("dash-calculated-root");
    if (!root) return;

    ensureStyles();
    const isLight = isLightTheme();
    root.setAttribute("data-theme", isLight ? "light" : "dark");
    root.setAttribute("data-layout", isMobileLayout() ? "mobile" : "desktop");
    root.dataset.calcRendered = "1";
    root.textContent = "";

    const card = htmlEl("section", "calc-section-card");
    card.id = "calc-dashboard-section";
    card.setAttribute("aria-label", "Gastos Calculados");

    card.appendChild(renderHeader(state.data));

    if (state.loading) {
      card.appendChild(renderLoadingBody(isLight));
    } else if (state.error) {
      card.appendChild(renderErrorBody());
    } else if (!state.data) {
      card.appendChild(renderLoadingBody(isLight));
    } else if (state.data.state === "EMPTY") {
      card.appendChild(renderEmptyBody());
    } else if (state.data.state === "PENDING_CONFIRMATION") {
      card.appendChild(renderPendingBody(state.data));
    } else {
      card.appendChild(renderReadyBody(state.data, isLight));
    }

    root.appendChild(card);
  }

  async function fetchCalculatedData(options) {
    const opts = options || {};
    const authHeader = getAuthHeader();
    if (!authHeader) {
      if (document.getElementById("dash-calculated-root")) {
        render();
      }
      return null;
    }

    if (state.loading && !opts.force) {
      return null;
    }

    if (state.abortController && typeof state.abortController.abort === "function") {
      try {
        state.abortController.abort();
      } catch (_) {}
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    state.abortController = controller;
    state.requestSeq += 1;
    const seq = state.requestSeq;
    state.loading = true;
    state.error = "";
    state.dirty = false;
    state.lastAuthHeader = authHeader;

    if (document.getElementById("dash-calculated-root")) {
      render();
    }

    const params = new URLSearchParams();
    params.set("period", state.selectedPeriod);
    const requestMonth = state.selectedPeriod === "year"
      ? (state.selectedYear ? state.selectedYear + "-01" : "")
      : state.selectedMonth;
    if (isValidYearMonth(requestMonth)) {
      params.set("month", requestMonth);
    }

    try {
      const fetchFn = window.fetch.bind(window);
      const resp = await fetchFn(`/api/dashboard/calculated?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json"
        },
        signal: controller ? controller.signal : undefined
      });
      if (seq !== state.requestSeq) return null;

      const payload = await resp.json().catch(() => null);
      if (seq !== state.requestSeq) return null;

      if (!resp.ok || !payload || typeof payload !== "object") {
        state.error = resp.status === 401
          ? "Sua sessão expirou. Entre novamente para visualizar seus gastos calculados."
          : (payload && (payload.error || payload.message)) ||
            "Não foi possível carregar os dados calculados agora.";
        state.loading = false;
        render();
        return null;
      }

      state.data = payload;
      if (isValidYearMonth(payload.selectedMonth)) {
        if (payload.period === "year") {
          state.selectedYear = payload.selectedMonth.slice(0, 4);
        } else {
          state.selectedMonth = payload.selectedMonth;
          state.selectedYear = payload.selectedMonth.slice(0, 4);
        }
      }
      initCategoryFilter(payload);
      state.loading = false;
      state.error = "";
      render();
      return payload;
    } catch (err) {
      if (err && err.name === "AbortError") return null;
      if (seq !== state.requestSeq) return null;
      state.loading = false;
      state.error = "Falha de conexão ao buscar seus gastos calculados.";
      render();
      return null;
    }
  }

  function hydrate() {
    const root = document.getElementById("dash-calculated-root");
    if (!root) return;
    loadChartPreferences();

    const authHeader = getAuthHeader();
    if (authHeader && state.lastAuthHeader && authHeader !== state.lastAuthHeader) {
      state.data = null;
      state.error = "";
      state.selectedMonth = "";
      state.selectedCategories.clear();
      state.categoriesFilterKey = "";
      state.focusedCategoryCode = null;
      state.focusedEvolutionKey = null;
      state.dirty = true;
    } else if (!authHeader && state.lastAuthHeader) {
      state.data = null;
      state.error = "";
      state.lastAuthHeader = "";
      state.dirty = true;
    }

    if (authHeader && (state.dirty || (!state.data && !state.loading && !state.error))) {
      fetchCalculatedData({ force: true });
      return;
    }

    const preferredApplied = applyPreferredCategories(state.data);
    const expectedTheme = isLightTheme() ? "light" : "dark";
    const expectedLayout = isMobileLayout() ? "mobile" : "desktop";
    if (
      preferredApplied ||
      root.dataset.calcRendered !== "1" ||
      root.getAttribute("data-theme") !== expectedTheme ||
      root.getAttribute("data-layout") !== expectedLayout
    ) {
      render();
    }
  }

  function queueHydrate() {
    if (hydrateQueued) return;
    hydrateQueued = true;
    const run = () => {
      hydrateQueued = false;
      hydrate();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  window.addEventListener("organiza:auth-ready", () => {
    state.dirty = true;
    if (document.getElementById("dash-calculated-root")) {
      fetchCalculatedData({ force: true });
    }
  });

  window.addEventListener("organiza:data-changed", (event) => {
    state.dirty = true;
    state.focusedCategoryCode = null;
    state.focusedEvolutionKey = null;

    const detailPeriod = event && event.detail && event.detail.period;
    const fallbackPeriod = window.__organizaLastConfirmedPeriod;
    const nextPeriod = isValidYearMonth(detailPeriod)
      ? detailPeriod.trim()
      : (isValidYearMonth(fallbackPeriod) ? fallbackPeriod.trim() : "");

    if (nextPeriod) {
      if (state.selectedPeriod === "year") {
        state.selectedYear = nextPeriod.slice(0, 4);
      } else {
        state.selectedPeriod = "month";
        state.selectedMonth = nextPeriod;
      }
    }

    if (document.getElementById("dash-calculated-root")) {
      fetchCalculatedData({ force: true });
    }
  });

  document.addEventListener("click", (event) => {
    if (syncingKofTab) return;
    const target = event && event.target;
    if (!target || typeof target.closest !== "function") return;
    if (target.closest("#tab-week")) {
      if (state.selectedPeriod !== "week") {
        state.selectedPeriod = "week";
        state.focusedCategoryCode = null;
        state.focusedEvolutionKey = null;
        state.dirty = true;
        fetchCalculatedData({ force: true });
      }
    } else if (target.closest("#tab-month")) {
      if (state.selectedPeriod !== "month") {
        state.selectedPeriod = "month";
        state.focusedCategoryCode = null;
        state.focusedEvolutionKey = null;
        state.dirty = true;
        fetchCalculatedData({ force: true });
      }
    }
  }, true);

  if (typeof MutationObserver === "function" && document.documentElement) {
    new MutationObserver(queueHydrate).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  window.OrganizaDashboardCharts = {
    hydrate,
    refresh: () => fetchCalculatedData({ force: true }),
    setDataForTest: (payload, opts) => {
      state.loading = false;
      state.error = (opts && opts.error) || "";
      state.dirty = false;
      state.data = payload || null;
      if (opts && opts.period) state.selectedPeriod = opts.period;
      if (opts && opts.month !== undefined) state.selectedMonth = opts.month;
      else if (payload && isValidYearMonth(payload.selectedMonth)) state.selectedMonth = payload.selectedMonth;
      state.focusedCategoryCode = null;
      state.focusedEvolutionKey = null;
      if (payload) initCategoryFilter(payload);
      render();
    },
    getState: () => ({
      selectedPeriod: state.selectedPeriod,
      selectedMonth: state.selectedMonth,
      loading: state.loading,
      error: state.error,
      dirty: state.dirty,
      selectedCategories: Array.from(state.selectedCategories),
      focusedCategoryCode: state.focusedCategoryCode,
      focusedEvolutionKey: state.focusedEvolutionKey
    })
  };

  hydrate();
})();
