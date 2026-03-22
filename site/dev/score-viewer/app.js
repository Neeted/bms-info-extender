const DEFAULT_PARSER_VERSION = "0.2.0";
const DEFAULT_SCORE_BASE_URL = "/score";
const PRODUCTION_SCORE_BASE_URL = "https://bms-info-extender.netlify.app/score";
const PRESET_CURRENT = "current";
const PRESET_PRODUCTION = "production";
const PRESET_CUSTOM = "custom";
const LOAD_STATES = new Set(["idle", "loading", "ready", "error"]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const NEARBY_EVENT_WINDOW_SEC = 2.0;
const MAX_NEARBY_EVENTS = 50;
const DEFAULT_STAGE_LANE_COUNT = 8;

const elements = {
  form: document.getElementById("control-form"),
  sha256Input: document.getElementById("sha256-input"),
  parserVersionInput: document.getElementById("parser-version-input"),
  scoreSourceSelect: document.getElementById("score-source-select"),
  customScoreBaseUrlInput: document.getElementById("custom-score-base-url-input"),
  timeNumberInput: document.getElementById("time-number-input"),
  timeRangeInput: document.getElementById("time-range-input"),
  loadButton: document.getElementById("load-button"),
  prefetchButton: document.getElementById("prefetch-button"),
  clearMemoryButton: document.getElementById("clear-memory-button"),
  clearIdbButton: document.getElementById("clear-idb-button"),
  reloadButton: document.getElementById("reload-button"),
  statusPill: document.getElementById("status-pill"),
  messageBanner: document.getElementById("message-banner"),
  resolvedScoreUrl: document.getElementById("resolved-score-url"),
  loaderModuleUrl: document.getElementById("loader-module-url"),
  diagnosticParserVersion: document.getElementById("diagnostic-parser-version"),
  compressedSource: document.getElementById("compressed-source"),
  gzipByteLength: document.getElementById("gzip-byte-length"),
  decompressedByteLength: document.getElementById("decompressed-byte-length"),
  scoreShape: document.getElementById("score-shape"),
  lastPlayableDuration: document.getElementById("last-playable-duration"),
  totalDuration: document.getElementById("total-duration"),
  eventCounts: document.getElementById("event-counts"),
  warningsCount: document.getElementById("warnings-count"),
  warningsList: document.getElementById("warnings-list"),
  errorType: document.getElementById("error-type"),
  errorMessage: document.getElementById("error-message"),
  errorCause: document.getElementById("error-cause"),
  viewerSummaryBadge: document.getElementById("viewer-summary-badge"),
  viewerGrid: document.getElementById("viewer-grid"),
  stageTimeReadout: document.getElementById("stage-time-readout"),
  stageMetaPrimary: document.getElementById("stage-meta-primary"),
  stageMetaSecondary: document.getElementById("stage-meta-secondary"),
  nearbyEventsWindow: document.getElementById("nearby-events-window"),
  nearbyEventsList: document.getElementById("nearby-events-list"),
};

const loaderContextCache = new Map();

const state = {
  sha256: "",
  parserVersion: DEFAULT_PARSER_VERSION,
  scoreBaseUrl: DEFAULT_SCORE_BASE_URL,
  scoreSourcePreset: PRESET_CURRENT,
  customScoreBaseUrl: "",
  selectedTimeSec: 0,
  loadState: "idle",
  compressedSource: null,
  parsedScore: null,
  lastError: null,
  message: null,
  autoloadEnabled: false,
  resolvedScoreUrl: null,
  loaderModuleUrl: null,
  compressedByteLength: null,
  decompressedByteLength: null,
};

let busyOperation = null;
let activeRequestId = 0;

function formatSeconds(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(3)} s`;
}

function formatInteger(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US").format(value);
}

function parseOptionalNumber(value, fallbackValue = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function clamp(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

function summarizeErrorCause(cause) {
  if (!cause) {
    return "-";
  }
  if (typeof cause === "string") {
    return cause;
  }
  if (cause instanceof Error) {
    return cause.message || cause.name;
  }
  if (typeof cause === "object") {
    try {
      return JSON.stringify(cause);
    } catch (_error) {
      return String(cause);
    }
  }
  return String(cause);
}

function createUiError(type, message, cause = null) {
  return { type, message, cause };
}

function normalizeSha256(sha256) {
  if (typeof sha256 !== "string") {
    throw createUiError("validation_error", "sha256 must be a string.");
  }
  const normalized = sha256.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw createUiError("validation_error", "sha256 must be a 64-character hex string.");
  }
  return normalized;
}

function normalizeParserVersion(version) {
  if (typeof version !== "string" || version.trim() === "") {
    throw createUiError("validation_error", "parserVersion must not be empty.");
  }
  return version.trim();
}

function normalizeScoreBaseUrl(scoreBaseUrl) {
  if (typeof scoreBaseUrl !== "string" || scoreBaseUrl.trim() === "") {
    return DEFAULT_SCORE_BASE_URL;
  }
  const trimmed = scoreBaseUrl.trim().replace(/\/+$/, "");
  return trimmed === "" ? DEFAULT_SCORE_BASE_URL : trimmed;
}

function derivePreset(scoreBaseUrl) {
  const normalized = normalizeScoreBaseUrl(scoreBaseUrl);
  if (normalized === DEFAULT_SCORE_BASE_URL || normalized === `${location.origin}/score`) {
    return PRESET_CURRENT;
  }
  if (normalized === PRODUCTION_SCORE_BASE_URL) {
    return PRESET_PRODUCTION;
  }
  return PRESET_CUSTOM;
}

function getPresetScoreBaseUrl(preset, customValue) {
  if (preset === PRESET_PRODUCTION) {
    return PRODUCTION_SCORE_BASE_URL;
  }
  if (preset === PRESET_CUSTOM) {
    return normalizeScoreBaseUrl(customValue);
  }
  return DEFAULT_SCORE_BASE_URL;
}

function readQueryState() {
  const params = new URLSearchParams(location.search);
  const queryScoreBaseUrl = params.get("scoreBaseUrl");
  const initialScoreBaseUrl = normalizeScoreBaseUrl(queryScoreBaseUrl ?? DEFAULT_SCORE_BASE_URL);
  const initialPreset = derivePreset(initialScoreBaseUrl);

  return {
    sha256: (params.get("sha256") ?? "").trim().toLowerCase(),
    parserVersion: params.get("parserVersion")?.trim() || DEFAULT_PARSER_VERSION,
    scoreBaseUrl: initialScoreBaseUrl,
    scoreSourcePreset: initialPreset,
    customScoreBaseUrl: initialPreset === PRESET_CUSTOM ? initialScoreBaseUrl : "",
    selectedTimeSec: Math.max(0, parseOptionalNumber(params.get("timeSec"), 0)),
    autoloadEnabled: params.get("autoload") === "1",
  };
}

function writeQueryState() {
  const params = new URLSearchParams();
  if (state.sha256) {
    params.set("sha256", state.sha256);
  }
  params.set("parserVersion", state.parserVersion);
  params.set("scoreBaseUrl", state.scoreBaseUrl);
  params.set("timeSec", String(state.selectedTimeSec));
  if (state.autoloadEnabled) {
    params.set("autoload", "1");
  }

  const nextUrl = `${location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  history.replaceState(null, "", nextUrl);
}

function syncFormFromState() {
  elements.sha256Input.value = state.sha256;
  elements.parserVersionInput.value = state.parserVersion;
  elements.scoreSourceSelect.value = state.scoreSourcePreset;
  elements.customScoreBaseUrlInput.value =
    state.scoreSourcePreset === PRESET_CUSTOM ? state.customScoreBaseUrl : state.scoreBaseUrl;
  elements.timeNumberInput.value = state.selectedTimeSec.toFixed(3);
  elements.customScoreBaseUrlInput.disabled = state.scoreSourcePreset !== PRESET_CUSTOM;
}

function updateStateFromControls() {
  state.sha256 = elements.sha256Input.value.trim().toLowerCase();
  state.parserVersion = elements.parserVersionInput.value.trim() || DEFAULT_PARSER_VERSION;
  state.scoreSourcePreset = elements.scoreSourceSelect.value;
  state.customScoreBaseUrl = elements.customScoreBaseUrlInput.value.trim();
  state.scoreBaseUrl = getPresetScoreBaseUrl(state.scoreSourcePreset, state.customScoreBaseUrl);
  state.selectedTimeSec = Math.max(0, parseOptionalNumber(elements.timeNumberInput.value, state.selectedTimeSec));
  writeQueryState();
}

function setSelectedTimeSec(nextValue) {
  const maxValue = state.parsedScore ? Math.max(state.parsedScore.lastPlayableTimeSec, 0) : 10;
  state.selectedTimeSec = clamp(Number.isFinite(nextValue) ? nextValue : 0, 0, maxValue);
  elements.timeNumberInput.value = state.selectedTimeSec.toFixed(3);
  elements.timeRangeInput.value = String(state.selectedTimeSec);
  writeQueryState();
  renderViewer();
}

function getLoaderModuleUrl(parserVersion) {
  return new URL(`/wasm/score-parser/v${parserVersion}/score_loader.js`, location.origin).href;
}

async function getLoaderContext(parserVersion, scoreBaseUrl) {
  const normalizedParserVersion = normalizeParserVersion(parserVersion);
  const normalizedScoreBaseUrl = normalizeScoreBaseUrl(scoreBaseUrl);
  const cacheKey = `${normalizedParserVersion}::${normalizedScoreBaseUrl}`;
  if (loaderContextCache.has(cacheKey)) {
    return loaderContextCache.get(cacheKey);
  }

  const moduleUrl = getLoaderModuleUrl(normalizedParserVersion);
  let loaderModule;
  try {
    loaderModule = await import(moduleUrl);
  } catch (error) {
    throw createUiError("loader_import_failure", `Failed to import score loader module: ${moduleUrl}`, error);
  }

  const context = {
    moduleUrl,
    loader: loaderModule.createScoreLoader({
      scoreBaseUrl: normalizedScoreBaseUrl,
    }),
  };
  loaderContextCache.set(cacheKey, context);
  return context;
}

function setBusyState(operationName) {
  busyOperation = operationName;
  state.loadState = "loading";
  render();
}

function clearBusyState(nextLoadState) {
  busyOperation = null;
  state.loadState = LOAD_STATES.has(nextLoadState) ? nextLoadState : state.loadState;
  render();
}

function setMessage(kind, text) {
  state.message = text ? { kind, text } : null;
}

function resetDiagnosticsForNewTarget() {
  state.compressedSource = null;
  state.parsedScore = null;
  state.resolvedScoreUrl = null;
  state.loaderModuleUrl = null;
  state.compressedByteLength = null;
  state.decompressedByteLength = null;
  state.lastError = null;
}

function buildUiErrorFromUnknown(error) {
  if (error && typeof error === "object" && "type" in error && "message" in error) {
    return error;
  }
  if (error instanceof Error) {
    return createUiError("unexpected_error", error.message, error.cause ?? null);
  }
  return createUiError("unexpected_error", String(error));
}

function getAbsoluteScoreUrl(scoreUrl) {
  try {
    return new URL(scoreUrl, location.origin).href;
  } catch (_error) {
    return scoreUrl;
  }
}

function getEventCountsLabel(score) {
  if (!score) {
    return "-";
  }
  const noteCounts = score.noteCounts ?? {
    visible: score.notes.length,
    normal: score.notes.filter((note) => note.kind === "normal").length,
    long: score.notes.filter((note) => note.kind === "long").length,
    invisible: score.notes.filter((note) => note.kind === "invisible").length,
    mine: score.notes.filter((note) => note.kind === "mine").length,
    all: score.notes.length,
  };
  return [
    `notes ${formatInteger(noteCounts.visible)}`,
    `normal ${formatInteger(noteCounts.normal)}`,
    `long ${formatInteger(noteCounts.long)}`,
    `invisible ${formatInteger(noteCounts.invisible)}`,
    `mines ${formatInteger(noteCounts.mine)}`,
    `barLines ${formatInteger(score.barLines.length)}`,
    `bpmChanges ${formatInteger(score.bpmChanges.length)}`,
    `stops ${formatInteger(score.stops.length)}`,
    `warnings ${formatInteger(score.warnings.length)}`,
  ].join(" / ");
}

function createStageLane() {
  const lane = document.createElement("div");
  lane.className = "viewer-lane";
  lane.setAttribute("aria-hidden", "true");
  return lane;
}

function renderStageGrid(laneCount) {
  const normalizedLaneCount = Math.max(1, laneCount);
  elements.viewerGrid.replaceChildren();
  elements.viewerGrid.style.gridTemplateColumns = `repeat(${normalizedLaneCount}, minmax(0, 1fr))`;

  for (let index = 0; index < normalizedLaneCount; index += 1) {
    elements.viewerGrid.appendChild(createStageLane());
  }
}

function renderMessageBanner() {
  const banner = elements.messageBanner;
  if (!state.message) {
    banner.hidden = true;
    banner.textContent = "";
    banner.className = "message-banner";
    return;
  }

  banner.hidden = false;
  banner.textContent = state.message.text;
  banner.className = `message-banner message-${state.message.kind}`;
}

function renderStatusPill() {
  elements.statusPill.textContent = busyOperation ? `${state.loadState} (${busyOperation})` : state.loadState;
  elements.statusPill.className = `status-pill status-${state.loadState}`;
}

function renderDiagnostics() {
  renderStatusPill();
  renderMessageBanner();
  elements.resolvedScoreUrl.textContent = state.resolvedScoreUrl ?? "-";
  elements.loaderModuleUrl.textContent = state.loaderModuleUrl ?? "-";
  elements.diagnosticParserVersion.textContent = state.parserVersion || "-";
  elements.compressedSource.textContent = state.compressedSource ?? "-";
  elements.gzipByteLength.textContent = state.compressedByteLength === null ? "-" : formatInteger(state.compressedByteLength);
  elements.decompressedByteLength.textContent = state.decompressedByteLength === null ? "-" : formatInteger(state.decompressedByteLength);
  elements.scoreShape.textContent = state.parsedScore
    ? `${state.parsedScore.format} / ${state.parsedScore.mode} / ${formatInteger(state.parsedScore.laneCount)} lanes`
    : "-";
  elements.lastPlayableDuration.textContent = state.parsedScore ? formatSeconds(state.parsedScore.lastPlayableTimeSec) : "-";
  elements.totalDuration.textContent = state.parsedScore ? formatSeconds(state.parsedScore.lastTimelineTimeSec) : "-";
  elements.eventCounts.textContent = getEventCountsLabel(state.parsedScore);

  const warnings = state.parsedScore?.warnings ?? [];
  elements.warningsCount.textContent = formatInteger(warnings.length);
  elements.warningsList.className = warnings.length > 0 ? "message-list" : "message-list empty-list";
  elements.warningsList.replaceChildren();
  if (warnings.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No warnings.";
    elements.warningsList.appendChild(item);
  } else {
    for (const warning of warnings) {
      const item = document.createElement("li");
      item.className = "warning-item";

      const type = document.createElement("span");
      type.className = "warning-type";
      type.textContent = warning.type;

      const message = document.createElement("div");
      message.className = "warning-message";
      message.textContent = warning.message;

      item.append(type, message);
      elements.warningsList.appendChild(item);
    }
  }

  elements.errorType.textContent = state.lastError?.type ?? "-";
  elements.errorMessage.textContent = state.lastError?.message ?? "-";
  elements.errorCause.textContent = summarizeErrorCause(state.lastError?.cause);
}

function buildNearbyEvents(score, selectedTimeSec) {
  const minTime = selectedTimeSec - NEARBY_EVENT_WINDOW_SEC;
  const maxTime = selectedTimeSec + NEARBY_EVENT_WINDOW_SEC;
  const rows = [];

  for (const note of score.notes) {
    if (note.timeSec < minTime || note.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "note",
      timeSec: note.timeSec,
      label: `${note.kind} note`,
      detailParts: [
        `lane ${note.lane}`,
        note.side ? note.side : null,
        note.endTimeSec ? `end ${formatSeconds(note.endTimeSec)}` : null,
      ].filter(Boolean),
    });
  }

  for (const barLine of score.barLines) {
    if (barLine.timeSec < minTime || barLine.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "bar line",
      timeSec: barLine.timeSec,
      label: "bar line",
      detailParts: ["measure boundary"],
    });
  }

  for (const bpmChange of score.bpmChanges) {
    if (bpmChange.timeSec < minTime || bpmChange.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "bpm",
      timeSec: bpmChange.timeSec,
      label: "bpm change",
      detailParts: [`bpm ${bpmChange.bpm.toFixed(3)}`],
    });
  }

  for (const stop of score.stops) {
    if (stop.timeSec < minTime || stop.timeSec > maxTime) {
      continue;
    }
    rows.push({
      kind: "stop",
      timeSec: stop.timeSec,
      label: "stop",
      detailParts: [`duration ${formatSeconds(stop.durationSec)}`],
    });
  }

  rows.sort((left, right) => {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    return left.kind.localeCompare(right.kind);
  });

  return rows.slice(0, MAX_NEARBY_EVENTS);
}

function renderNearbyEvents() {
  elements.nearbyEventsWindow.textContent = `selectedTimeSec ${formatSeconds(state.selectedTimeSec)} ± 2.0 sec`;
  elements.nearbyEventsList.replaceChildren();

  if (!state.parsedScore) {
    elements.nearbyEventsList.className = "event-list empty-list";
    const item = document.createElement("li");
    item.textContent = "No parsed score loaded.";
    elements.nearbyEventsList.appendChild(item);
    return;
  }

  const nearbyEvents = buildNearbyEvents(state.parsedScore, state.selectedTimeSec);
  if (nearbyEvents.length === 0) {
    elements.nearbyEventsList.className = "event-list empty-list";
    const item = document.createElement("li");
    item.textContent = "No events found in the selected window.";
    elements.nearbyEventsList.appendChild(item);
    return;
  }

  elements.nearbyEventsList.className = "event-list";
  for (const event of nearbyEvents) {
    const item = document.createElement("li");
    item.className = "event-item";

    const header = document.createElement("div");
    header.className = "event-item-header";

    const type = document.createElement("span");
    type.className = "event-type";
    type.textContent = event.label;

    const time = document.createElement("strong");
    time.className = "event-time";
    time.textContent = formatSeconds(event.timeSec);

    header.append(type, time);

    const detail = document.createElement("div");
    detail.className = "event-detail";
    detail.textContent = event.detailParts.join(" / ");

    item.append(header, detail);
    elements.nearbyEventsList.appendChild(item);
  }
}

function renderViewer() {
  const laneCount = state.parsedScore?.laneCount ?? DEFAULT_STAGE_LANE_COUNT;
  renderStageGrid(laneCount);

  elements.stageTimeReadout.textContent = formatSeconds(state.selectedTimeSec);
  if (!state.parsedScore) {
    elements.viewerSummaryBadge.textContent = "No score loaded";
    elements.stageMetaPrimary.textContent = "Load a score to inspect parsed output.";
    elements.stageMetaSecondary.textContent = "Phase 4 will mount the actual Canvas renderer here.";
  } else {
    elements.viewerSummaryBadge.textContent = `${state.parsedScore.mode} / ${state.parsedScore.laneCount} lanes`;
    elements.stageMetaPrimary.textContent =
      `${state.parsedScore.format} / ${state.parsedScore.mode} / playable ${formatSeconds(state.parsedScore.lastPlayableTimeSec)} / timeline ${formatSeconds(state.parsedScore.lastTimelineTimeSec)}`;
    elements.stageMetaSecondary.textContent =
      "selectedTimeSec is centered on the red guide. Slider uses lastPlayableTimeSec while diagnostics also expose lastTimelineTimeSec.";
  }

  renderNearbyEvents();
}

function renderSliderBounds() {
  const maxValue = state.parsedScore ? Math.max(state.parsedScore.lastPlayableTimeSec, 0) : 10;
  elements.timeRangeInput.max = String(maxValue);
  elements.timeNumberInput.min = "0";
  setSelectedTimeSec(state.selectedTimeSec);
}

function renderControls() {
  elements.customScoreBaseUrlInput.disabled = state.scoreSourcePreset !== PRESET_CUSTOM;
  const isBusy = busyOperation !== null;
  elements.loadButton.disabled = isBusy;
  elements.prefetchButton.disabled = isBusy;
  elements.clearMemoryButton.disabled = isBusy;
  elements.clearIdbButton.disabled = isBusy;
  elements.reloadButton.disabled = isBusy;
}

function render() {
  renderControls();
  renderDiagnostics();
  renderViewer();
}

async function handleLoad({ clearCachesFirst = false } = {}) {
  if (busyOperation !== null) {
    return;
  }

  updateStateFromControls();
  const requestId = ++activeRequestId;
  state.autoloadEnabled = true;
  writeQueryState();
  resetDiagnosticsForNewTarget();
  setMessage("info", clearCachesFirst ? "Clearing caches, then loading score." : "Loading compressed score, decompressing, and parsing.");
  setBusyState(clearCachesFirst ? "reload" : "load");

  try {
    const normalizedSha256 = normalizeSha256(state.sha256);
    const parserVersion = normalizeParserVersion(state.parserVersion);
    const scoreBaseUrl = normalizeScoreBaseUrl(state.scoreBaseUrl);
    const loaderContext = await getLoaderContext(parserVersion, scoreBaseUrl);
    if (requestId !== activeRequestId) {
      return;
    }

    state.loaderModuleUrl = loaderContext.moduleUrl;

    if (clearCachesFirst) {
      loaderContext.loader.clearMemoryCache();
      if (typeof indexedDB === "undefined") {
        setMessage("warning", "IndexedDB is unavailable in this environment. Reload continues with memory cache only.");
      }
      await loaderContext.loader.clearIndexedDbCache();
    }

    const compressedResult = await loaderContext.loader.loadCompressedScore(normalizedSha256);
    const decompressedResult = await loaderContext.loader.loadDecompressedScoreBytes(normalizedSha256);
    const parsedResult = await loaderContext.loader.loadParsedScore(normalizedSha256);

    if (requestId !== activeRequestId) {
      return;
    }

    state.sha256 = normalizedSha256;
    state.parserVersion = parserVersion;
    state.scoreBaseUrl = scoreBaseUrl;
    state.compressedSource = compressedResult.source;
    state.resolvedScoreUrl = getAbsoluteScoreUrl(compressedResult.url);
    state.compressedByteLength = compressedResult.byteLength;
    state.decompressedByteLength = decompressedResult.byteLength;
    state.parsedScore = parsedResult.score;
    state.lastError = null;
    state.selectedTimeSec = clamp(state.selectedTimeSec, 0, Math.max(parsedResult.score.lastPlayableTimeSec, 0));
    setMessage("info", `Loaded score via ${compressedResult.source}.`);

    clearBusyState("ready");
    renderSliderBounds();
    syncFormFromState();
    writeQueryState();
    render();
  } catch (error) {
    if (requestId !== activeRequestId) {
      return;
    }
    state.parsedScore = null;
    state.compressedSource = null;
    state.compressedByteLength = null;
    state.decompressedByteLength = null;
    state.resolvedScoreUrl = null;
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    renderSliderBounds();
    render();
  }
}

async function handlePrefetch() {
  if (busyOperation !== null) {
    return;
  }

  updateStateFromControls();
  const requestId = ++activeRequestId;
  resetDiagnosticsForNewTarget();
  setMessage("info", "Prefetching compressed score only.");
  setBusyState("prefetch");

  try {
    const normalizedSha256 = normalizeSha256(state.sha256);
    const parserVersion = normalizeParserVersion(state.parserVersion);
    const scoreBaseUrl = normalizeScoreBaseUrl(state.scoreBaseUrl);
    const loaderContext = await getLoaderContext(parserVersion, scoreBaseUrl);
    if (requestId !== activeRequestId) {
      return;
    }

    state.loaderModuleUrl = loaderContext.moduleUrl;
    const compressedResult = await loaderContext.loader.loadCompressedScore(normalizedSha256);

    if (requestId !== activeRequestId) {
      return;
    }

    state.sha256 = normalizedSha256;
    state.parserVersion = parserVersion;
    state.scoreBaseUrl = scoreBaseUrl;
    state.compressedSource = compressedResult.source;
    state.resolvedScoreUrl = getAbsoluteScoreUrl(compressedResult.url);
    state.compressedByteLength = compressedResult.byteLength;
    state.decompressedByteLength = null;
    state.lastError = null;
    setMessage("info", `Prefetched compressed score via ${compressedResult.source}.`);

    clearBusyState("idle");
    syncFormFromState();
    writeQueryState();
    render();
  } catch (error) {
    if (requestId !== activeRequestId) {
      return;
    }
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    render();
  }
}

async function handleClearMemoryCache() {
  if (busyOperation !== null) {
    return;
  }

  updateStateFromControls();
  setBusyState("clear-memory");
  try {
    const loaderContext = await getLoaderContext(state.parserVersion, state.scoreBaseUrl);
    loaderContext.loader.clearMemoryCache();
    state.lastError = null;
    setMessage("info", "Cleared score loader memory cache.");
    clearBusyState(state.parsedScore ? "ready" : "idle");
    render();
  } catch (error) {
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    render();
  }
}

async function handleClearIndexedDbCache() {
  if (busyOperation !== null) {
    return;
  }

  updateStateFromControls();
  setBusyState("clear-idb");
  try {
    const loaderContext = await getLoaderContext(state.parserVersion, state.scoreBaseUrl);
    await loaderContext.loader.clearIndexedDbCache();
    state.lastError = null;
    if (typeof indexedDB === "undefined") {
      setMessage("warning", "IndexedDB is unavailable in this environment. Nothing persisted to clear.");
    } else {
      setMessage("info", "Cleared score loader IndexedDB cache.");
    }
    clearBusyState(state.parsedScore ? "ready" : "idle");
    render();
  } catch (error) {
    state.lastError = buildUiErrorFromUnknown(error);
    setMessage("error", state.lastError.message);
    clearBusyState("error");
    render();
  }
}

function initializeFromQuery() {
  Object.assign(state, readQueryState());
  syncFormFromState();
  renderSliderBounds();
  render();
}

function attachEventListeners() {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleLoad();
  });

  elements.prefetchButton.addEventListener("click", () => {
    void handlePrefetch();
  });

  elements.clearMemoryButton.addEventListener("click", () => {
    void handleClearMemoryCache();
  });

  elements.clearIdbButton.addEventListener("click", () => {
    void handleClearIndexedDbCache();
  });

  elements.reloadButton.addEventListener("click", () => {
    void handleLoad({ clearCachesFirst: true });
  });

  elements.scoreSourceSelect.addEventListener("change", () => {
    state.scoreSourcePreset = elements.scoreSourceSelect.value;
    state.scoreBaseUrl = getPresetScoreBaseUrl(state.scoreSourcePreset, elements.customScoreBaseUrlInput.value);
    elements.customScoreBaseUrlInput.disabled = state.scoreSourcePreset !== PRESET_CUSTOM;
    if (state.scoreSourcePreset !== PRESET_CUSTOM) {
      elements.customScoreBaseUrlInput.value = state.scoreBaseUrl;
    }
    updateStateFromControls();
    render();
  });

  elements.customScoreBaseUrlInput.addEventListener("input", () => {
    updateStateFromControls();
    render();
  });

  elements.sha256Input.addEventListener("input", () => {
    updateStateFromControls();
    render();
  });

  elements.parserVersionInput.addEventListener("input", () => {
    updateStateFromControls();
    render();
  });

  elements.timeNumberInput.addEventListener("input", () => {
    setSelectedTimeSec(parseOptionalNumber(elements.timeNumberInput.value, state.selectedTimeSec));
  });

  elements.timeRangeInput.addEventListener("input", () => {
    setSelectedTimeSec(parseOptionalNumber(elements.timeRangeInput.value, state.selectedTimeSec));
  });
}

function boot() {
  initializeFromQuery();
  attachEventListeners();
  if (state.autoloadEnabled && state.sha256) {
    void handleLoad();
  }
}

boot();
