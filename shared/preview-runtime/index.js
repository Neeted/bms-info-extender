import {
  createScoreViewerModel,
  createDefaultGameTimingConfig,
  DEFAULT_GAME_DURATION_MS,
  DEFAULT_GAME_LANE_COVER_PERMILLE,
  DEFAULT_GAME_LANE_COVER_VISIBLE,
  DEFAULT_GAME_LANE_HEIGHT_PERCENT,
  DEFAULT_GAME_HS_FIX_MODE,
  DEFAULT_INVISIBLE_NOTE_VISIBILITY,
  DEFAULT_JUDGE_LINE_POSITION_RATIO,
  DEFAULT_VIEWER_MODE,
  getBeatAtTimeSec,
  getClampedSelectedBeat,
  getClampedSelectedTimeSec,
  getScoreTotalDurationSec,
  hasViewerSelectionChanged,
  normalizeGameDurationMs,
  normalizeGameHsFixMode,
  normalizeGameLaneCoverPermille,
  normalizeGameLaneCoverVisible,
  normalizeGameLaneHeightPercent,
  normalizeGameTimingConfig,
  normalizeViewerMode,
  normalizeInvisibleNoteVisibility,
  normalizeJudgeLinePositionRatio,
  resolveViewerModeForModel,
} from "./score-viewer-model.js";
import { createScoreViewerController } from "./score-viewer-controller.js";
import { estimateViewerWidth } from "./score-viewer-renderer.js";
import {
  fetchBmsInfoRecordByLookupKey,
  getLaneChipKey,
} from "./bms-info-data.js";
import {
  createBmsInfoGraph,
  DEFAULT_GRAPH_INTERACTION_MODE,
  normalizeGraphInteractionMode,
} from "./bms-info-graph.js";

export const BMSDATA_STYLE_ID = "bms-info-extender-style";
const BMSSEARCH_PATTERN_API_BASE_URL = "https://api.bmssearch.net/v1/patterns/sha256";
const BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
const SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS = 250;
export const VIEWER_MODE_STORAGE_KEY = "bms-info-extender.viewerMode";
export const INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY = "bms-info-extender.invisibleNoteVisibility";
export const JUDGE_LINE_POSITION_RATIO_STORAGE_KEY = "bms-info-extender.judgeLinePositionRatio";
export const SPACING_SCALE_STORAGE_KEYS = Object.freeze({
  time: "bms-info-extender.spacingScale.time",
  editor: "bms-info-extender.spacingScale.editor",
  game: "bms-info-extender.spacingScale.game",
});
export const GAME_DURATION_MS_STORAGE_KEY = "bms-info-extender.game.durationMs";
export const GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY = "bms-info-extender.game.laneHeightPercent";
export const GAME_LANE_COVER_PERMILLE_STORAGE_KEY = "bms-info-extender.game.laneCoverPermille";
export const GAME_LANE_COVER_VISIBLE_STORAGE_KEY = "bms-info-extender.game.laneCoverVisible";
export const GAME_HS_FIX_MODE_STORAGE_KEY = "bms-info-extender.game.hsFixMode";
export const GRAPH_INTERACTION_MODE_STORAGE_KEY = "bms-info-extender.graphInteractionMode";
export const DEFAULT_SPACING_SCALE = 1.0;
export { DEFAULT_VIEWER_MODE };
export { DEFAULT_INVISIBLE_NOTE_VISIBILITY };
export { DEFAULT_JUDGE_LINE_POSITION_RATIO };
export { DEFAULT_GRAPH_INTERACTION_MODE };
export {
  DEFAULT_GAME_DURATION_MS,
  DEFAULT_GAME_LANE_HEIGHT_PERCENT,
  DEFAULT_GAME_LANE_COVER_PERMILLE,
  DEFAULT_GAME_LANE_COVER_VISIBLE,
  DEFAULT_GAME_HS_FIX_MODE,
};

export const PREVIEW_RENDER_DIRTY = {
  record: 1 << 0,
  selection: 1 << 1,
  viewerModel: 1 << 2,
  playback: 1 << 3,
  pin: 1 << 4,
  viewerMode: 1 << 5,
  invisible: 1 << 6,
  judgeLinePosition: 1 << 7,
  spacing: 1 << 8,
  gameTimingConfig: 1 << 9,
  viewerOpen: 1 << 10,
  graphInteractionMode: 1 << 11,
  graphSettings: 1 << 12,
};
const PREVIEW_RENDER_ALL = Object.values(PREVIEW_RENDER_DIRTY).reduce((mask, flag) => mask | flag, 0);

const bmsSearchPatternAvailabilityCache = new Map();

export function createPreviewPreferenceStorage({ read = () => null, write = () => {} } = {}) {
  return {
    getPersistedViewerMode() {
      try {
        return read(VIEWER_MODE_STORAGE_KEY, DEFAULT_VIEWER_MODE);
      } catch (_error) {
        return DEFAULT_VIEWER_MODE;
      }
    },
    setPersistedViewerMode(nextViewerMode) {
      try {
        write(VIEWER_MODE_STORAGE_KEY, nextViewerMode);
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedInvisibleNoteVisibility() {
      try {
        return read(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, DEFAULT_INVISIBLE_NOTE_VISIBILITY);
      } catch (_error) {
        return DEFAULT_INVISIBLE_NOTE_VISIBILITY;
      }
    },
    setPersistedInvisibleNoteVisibility(nextVisibility) {
      try {
        write(INVISIBLE_NOTE_VISIBILITY_STORAGE_KEY, nextVisibility);
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedJudgeLinePositionRatio() {
      try {
        const persistedValue = read(
          JUDGE_LINE_POSITION_RATIO_STORAGE_KEY,
          DEFAULT_JUDGE_LINE_POSITION_RATIO,
        );
        if (persistedValue === null || persistedValue === undefined || persistedValue === "") {
          return DEFAULT_JUDGE_LINE_POSITION_RATIO;
        }
        return normalizeJudgeLinePositionRatio(Number(persistedValue));
      } catch (_error) {
        return DEFAULT_JUDGE_LINE_POSITION_RATIO;
      }
    },
    setPersistedJudgeLinePositionRatio(nextRatio) {
      try {
        write(JUDGE_LINE_POSITION_RATIO_STORAGE_KEY, normalizeJudgeLinePositionRatio(nextRatio));
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedSpacingScale(mode) {
      try {
        return normalizeSpacingScale(
          Number(read(getSpacingScaleStorageKey(mode), DEFAULT_SPACING_SCALE)),
        );
      } catch (_error) {
        return DEFAULT_SPACING_SCALE;
      }
    },
    setPersistedSpacingScale(mode, value) {
      try {
        write(getSpacingScaleStorageKey(mode), normalizeSpacingScale(value));
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedGameDurationMs() {
      try {
        return normalizeGameDurationMs(Number(read(GAME_DURATION_MS_STORAGE_KEY, DEFAULT_GAME_DURATION_MS)));
      } catch (_error) {
        return DEFAULT_GAME_DURATION_MS;
      }
    },
    setPersistedGameDurationMs(value) {
      try {
        write(GAME_DURATION_MS_STORAGE_KEY, normalizeGameDurationMs(value));
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedGameLaneHeightPercent() {
      try {
        return normalizeGameLaneHeightPercent(
          Number(read(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY, DEFAULT_GAME_LANE_HEIGHT_PERCENT)),
        );
      } catch (_error) {
        return DEFAULT_GAME_LANE_HEIGHT_PERCENT;
      }
    },
    setPersistedGameLaneHeightPercent(value) {
      try {
        write(GAME_LANE_HEIGHT_PERCENT_STORAGE_KEY, normalizeGameLaneHeightPercent(value));
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedGameLaneCoverPermille() {
      try {
        return normalizeGameLaneCoverPermille(
          Number(read(GAME_LANE_COVER_PERMILLE_STORAGE_KEY, DEFAULT_GAME_LANE_COVER_PERMILLE)),
        );
      } catch (_error) {
        return DEFAULT_GAME_LANE_COVER_PERMILLE;
      }
    },
    setPersistedGameLaneCoverPermille(value) {
      try {
        write(GAME_LANE_COVER_PERMILLE_STORAGE_KEY, normalizeGameLaneCoverPermille(value));
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedGameLaneCoverVisible() {
      try {
        return normalizeGameLaneCoverVisible(
          read(GAME_LANE_COVER_VISIBLE_STORAGE_KEY, DEFAULT_GAME_LANE_COVER_VISIBLE),
        );
      } catch (_error) {
        return DEFAULT_GAME_LANE_COVER_VISIBLE;
      }
    },
    setPersistedGameLaneCoverVisible(value) {
      try {
        write(GAME_LANE_COVER_VISIBLE_STORAGE_KEY, normalizeGameLaneCoverVisible(value));
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedGameHsFixMode() {
      try {
        return normalizeGameHsFixMode(read(GAME_HS_FIX_MODE_STORAGE_KEY, DEFAULT_GAME_HS_FIX_MODE));
      } catch (_error) {
        return DEFAULT_GAME_HS_FIX_MODE;
      }
    },
    setPersistedGameHsFixMode(value) {
      try {
        write(GAME_HS_FIX_MODE_STORAGE_KEY, normalizeGameHsFixMode(value));
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
    getPersistedGraphInteractionMode() {
      try {
        return normalizeGraphInteractionMode(
          read(GRAPH_INTERACTION_MODE_STORAGE_KEY, DEFAULT_GRAPH_INTERACTION_MODE),
        );
      } catch (_error) {
        return DEFAULT_GRAPH_INTERACTION_MODE;
      }
    },
    setPersistedGraphInteractionMode(value) {
      try {
        write(
          GRAPH_INTERACTION_MODE_STORAGE_KEY,
          normalizeGraphInteractionMode(value),
        );
      } catch (_error) {
        // Ignore storage failures and keep runtime state only.
      }
    },
  };
}

export function expandPreviewRenderMask(renderMask = 0) {
  let expandedMask = renderMask;
  if (expandedMask & PREVIEW_RENDER_DIRTY.viewerModel) {
    expandedMask |= PREVIEW_RENDER_DIRTY.viewerMode
      | PREVIEW_RENDER_DIRTY.invisible
      | PREVIEW_RENDER_DIRTY.judgeLinePosition
      | PREVIEW_RENDER_DIRTY.spacing
      | PREVIEW_RENDER_DIRTY.gameTimingConfig;
  }
  return expandedMask;
}

export const BMSDATA_CSS = `
  .bmsdata {
    --bd-dctx: #333;
    --bd-dcbk: #fff;
    --bd-hdtx: #eef;
    --bd-hdbk: #669;
  }
  .bmsdata * { line-height: 100%; color: var(--bd-dctx); background-color: var(--bd-dcbk); font-family: "Inconsolata", "Noto Sans JP"; vertical-align: middle; box-sizing: content-box; }
  .bd-info { display: flex; border: 0px; height: 9.6rem; }
  .bd-info a { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border: 1px solid; border-radius: 2px; font-size: 0.750rem; color: #155dfc; text-decoration: none; }
  .bd-info a:hover { color: red; }
  .bd-icon { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border-radius: 2px; background: var(--bd-dctx); color: var(--bd-dcbk); font-size: 0.750rem; }
  .bd-icon:nth-child(n+2) { margin-left: 0.4rem; }
  .bd-info .bd-info-table { flex: 1; border-collapse: collapse; height: 100%; }
  .bd-info td { border: unset; padding: 0.1rem 0.2rem; height: 1rem; white-space: nowrap; font-size: 0.875rem; }
  .bd-info .bd-header-cell { background-color: var(--bd-hdbk); color: var(--bd-hdtx); }
  .bd-info .bd-lanenote { margin-right: 0.2rem; padding: 0.1rem 0.2rem; border-radius: 2px; font-size: 0.750rem; }
  .bd-table-list { flex: 1; display: flex; min-width: 100px; flex-direction: column; box-sizing: border-box; }
  .bd-table-list .bd-header-cell { padding: 0.1rem 0.2rem; min-height: 1rem; white-space: nowrap; font-size: 0.875rem; color: var(--bd-hdtx); display: flex; align-items: center; }
  .bd-table-scroll { overflow: auto; flex: 1 1 auto; scrollbar-color: var(--bd-hdbk) white; scrollbar-width: thin; }
  .bd-table-list ul { padding: 0.1rem 0.2rem; margin: 0; }
  .bd-table-list li { margin-bottom: 0.2rem; line-height: 1rem; font-size: 0.875rem; white-space: nowrap; list-style-type: none; }
  #bd-graph { position: relative; padding: 0px; border-width: 0px; background-color: #000; overflow-x: auto; line-height: 0; scrollbar-color: var(--bd-hdbk) black; scrollbar-width: thin; }
  #bd-graph-canvas { background-color: #000; }
  #bd-graph-tooltip { line-height: 1.25; position: fixed; background: rgba(32, 32, 64, 0.88); color: #fff; padding: 4px 8px; font-size: 0.8125rem; pointer-events: none; border-radius: 6px; display: none; z-index: 10; white-space: nowrap; box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22); }
  .bd-graph-toolbar { position: absolute; top: 4px; left: 4px; display: inline-flex; align-items: center; gap: 2px; z-index: 3; background-color: unset;}
  .bd-scoreviewer-pin { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: rgba(32, 32, 64, 0.5); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-sizing: border-box; width: auto; }
  .bd-scoreviewer-pin * { background: transparent; color: #fff; font-family: "Inconsolata", "Noto Sans JP"; }
  .bd-scoreviewer-pin input { width: auto; flex: 0 0 auto; min-height: auto; margin: 0; padding: 0; border: none; background: transparent; accent-color: #ffffff; }
  .bd-scoreviewer-pin span { display: inline-block; line-height: 1.25; white-space: nowrap; }
  .bd-graph-toolbar-button { display: inline-flex; align-items: center; justify-content: center; width: 18px; min-width: 18px; height: 18px; min-height: 18px; padding: 0; border: unset; border-radius: 999px; background: rgba(255, 255, 255, 0.16); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.7rem; line-height: 1; cursor: pointer; box-shadow: none; }
  .bd-graph-toolbar-button:hover { background: rgba(255, 255, 255, 0.24); }
  .bd-graph-toolbar-button:focus-visible { outline: 1px solid rgba(145, 210, 255, 0.95); outline-offset: 1px; }
  .bd-graph-settings-popup { position: fixed; left: 12px; bottom: 12px; z-index: 2147482999; display: grid; gap: 6px; min-width: 220px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(160, 160, 196, 0.22); background: rgba(32, 32, 64, 0.88); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24); box-sizing: border-box; }
  .bd-graph-settings-popup[hidden] { display: none; }
  .bd-graph-settings-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .bd-graph-settings-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .bd-graph-settings-close { display: inline-flex; align-items: center; justify-content: center; width: 18px; min-width: 18px; height: 18px; min-height: 18px; padding: 0; border: 1px solid rgba(255, 255, 255, 0.24); border-radius: 999px; background: rgba(255, 255, 255, 0.16); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.7rem; line-height: 1; cursor: pointer; }
  .bd-graph-settings-group { display: grid; gap: 4px; }
  .bd-graph-settings-label { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .bd-graph-settings-select { width: 100%; min-width: 0; min-height: auto; padding: 1px 6px; border: 1px solid rgba(255, 255, 255, 0.24); border-radius: 4px; background: rgba(16, 16, 28, 0.95); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1.25; box-sizing: border-box; }
  .score-viewer-shell * { box-sizing: content-box; }
  .score-viewer-shell { --score-viewer-width: 520px; position: fixed; top: 0; right: 0; width: var(--score-viewer-width); height: 100dvh; background: #000; border-left: 1px solid rgba(112, 112, 132, 0.4); box-shadow: -12px 0 32px rgba(0, 0, 0, 0.38); overflow: hidden; z-index: 2147483000; opacity: 0; pointer-events: none; transform: translateX(100%); transition: transform 120ms ease, opacity 120ms ease; isolation: isolate; contain: layout paint style; }
  .score-viewer-shell.is-visible { opacity: 1; pointer-events: auto; transform: translateX(0); }
  .score-viewer-shell.is-drag-handle-hovered, .score-viewer-shell.is-drag-handle-dragging { cursor: ns-resize; }
  .score-viewer-scroll-host { position: absolute; inset: 0; overflow-x: hidden; overflow-y: hidden; scrollbar-gutter: stable; contain: layout paint; }
  .score-viewer-scroll-host.is-scrollable { overflow-y: auto; cursor: grab; touch-action: none; }
  .score-viewer-scroll-host.is-scrollable.is-dragging { cursor: grabbing; }
  .score-viewer-scroll-host.is-drag-handle-hovered, .score-viewer-scroll-host.is-drag-handle-dragging { cursor: ns-resize; }
  .score-viewer-spacer { width: 1px; opacity: 0; }
  .score-viewer-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .score-viewer-marker-overlay, .score-viewer-marker-labels { position: absolute; inset: 0; pointer-events: none; contain: layout paint; }
  .score-viewer-marker-label { position: absolute; top: 0; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1; white-space: nowrap; text-shadow: 0 0 4px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.72); }
  .score-viewer-marker-label.is-left { transform: translate(-100%, -50%); text-align: right; }
  .score-viewer-marker-label.is-right { transform: translate(0, -50%); text-align: left; }
  .score-viewer-bottom-bar { position: absolute; left: 12px; bottom: 12px; z-index: 3; pointer-events: none; contain: layout paint; }
  .score-viewer-status-panel { display: grid; gap: 4px; min-width: 180px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(160, 160, 196, 0.22); background: rgba(32, 32, 64, 0.8); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.8125rem; line-height: 1.25; white-space: nowrap; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24); pointer-events: auto; contain: layout paint style; }
  .score-viewer-metrics-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
  .score-viewer-status-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .score-viewer-status-row.is-time { justify-content: flex-start; gap: 8px; }
  .score-viewer-status-metric { min-width: 0; font-variant-numeric: tabular-nums; }
  .score-viewer-settings-panel { display: grid; gap: 4px; max-height: 0; overflow: hidden; opacity: 0; pointer-events: none; transition: opacity 120ms ease, max-height 120ms ease; }
  .score-viewer-settings-group { display: grid; gap: 4px; }
  .score-viewer-status-panel:hover .score-viewer-settings-panel, .score-viewer-status-panel:focus-within .score-viewer-settings-panel { max-height: 320px; opacity: 1; pointer-events: auto; }
  .score-viewer-spacing-row { padding-top: 2px; }
  .score-viewer-spacing-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .score-viewer-spacing-value { margin-left: auto; display: inline-flex; align-items: baseline; gap: 0; color: #fff; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
  .score-viewer-spacing-value-secondary { color: #00FF00; }
  .score-viewer-mode-row { display: grid; gap: 4px; align-items: stretch; }
  .score-viewer-mode-title { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
  .score-viewer-mode-controls { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 6px; width: 100%; min-width: 0; box-sizing: border-box; }
  .score-viewer-mode-select { width: 100%; min-width: 0; min-height: auto; padding: 1px 6px; border: 1px solid rgba(255, 255, 255, 0.24); border-radius: 4px; background: rgba(16, 16, 28, 0.95); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1.25; box-sizing: border-box; }
  .score-viewer-mode-select:disabled { opacity: 0.55; cursor: not-allowed; }
  .score-viewer-checkbox-row { justify-content: space-between; gap: 10px; }
  .score-viewer-checkbox-input { width: auto; min-height: auto; margin: 0; padding: 0; accent-color: #ffffff; }
  .score-viewer-playback-button { display: inline-flex; align-items: center; justify-content: center; width: 16px; min-width: 16px; height: 16px; min-height: 16px; padding: 0; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.24); background: rgba(255, 255, 255, 0.16); color: #fff; box-shadow: none; font-size: 0.464rem; line-height: 1; pointer-events: auto; cursor: pointer; }
  .score-viewer-playback-button:disabled { opacity: 0.5; cursor: not-allowed; }
  .score-viewer-playback-time { font-variant-numeric: tabular-nums; }
  .score-viewer-spacing-input { width: 100%; min-height: auto; margin: 0; padding: 0; background: transparent; border: none; accent-color: #ffffff; pointer-events: auto; }
  .score-viewer-drag-line { position: absolute; left: 0; right: 0; display: flex; align-items: center; transform: translateY(-50%); pointer-events: none; z-index: 2; }
  .score-viewer-drag-line::after { content: ""; width: 100%; height: 1px; background: linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.48) 48%, rgba(255, 255, 255, 0.06) 100%); box-shadow: 0 0 16px rgba(255, 255, 255, 0.08); }
  .score-viewer-drag-line.is-draggable::after, .score-viewer-drag-line.is-dragging::after { height: 2px; background: linear-gradient(90deg, rgba(145, 210, 255, 0.18) 0%, rgba(145, 210, 255, 0.95) 48%, rgba(145, 210, 255, 0.18) 100%); box-shadow: 0 0 22px rgba(145, 210, 255, 0.2); }
  .score-viewer-lane-height-handle::after { background: linear-gradient(90deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.3) 48%, rgba(255, 255, 255, 0.04) 100%); }
  .score-viewer-lane-cover-handle::after { background: linear-gradient(90deg, rgba(137, 255, 178, 0.06) 0%, rgba(137, 255, 178, 0.42) 48%, rgba(137, 255, 178, 0.06) 100%); }
  .score-viewer-judge-line { position: absolute; left: 0; right: 0; top: var(--score-viewer-judge-line-top, calc(var(--score-viewer-judge-line-ratio, 0.5) * 100%)); display: flex; align-items: center; transform: translateY(-50%); pointer-events: none; }
  .score-viewer-judge-line::after { content: ""; width: 100%; height: 2px; background: linear-gradient(90deg, rgba(187, 71, 49, 0.18) 0%, rgba(187, 71, 49, 0.94) 48%, rgba(187, 71, 49, 0.18) 100%); box-shadow: 0 0 20px rgba(187, 71, 49, 0.2); }
  .score-viewer-judge-line.is-draggable::after, .score-viewer-judge-line.is-dragging::after { background: linear-gradient(90deg, rgba(255, 132, 94, 0.28) 0%, rgba(255, 120, 88, 1) 48%, rgba(255, 132, 94, 0.28) 100%); box-shadow: 0 0 28px rgba(255, 120, 88, 0.34); }
  .bd-lanenote[lane="0"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="1"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="2"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="3"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="4"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="5"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="6"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="7"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="8"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="9"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="10"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="11"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="12"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="13"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="14"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="15"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="g0"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="g1"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g2"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g3"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g4"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g5"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g6"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g7"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g8"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g9"] { background: #5074fe; color: #fff; }
  .bd-lanenote[lane="g10"] { background: #bebebe; color: #000; }
  .bd-lanenote[lane="g11"] { background: #e04a4a; color: #fff; }
  .bd-lanenote[lane="p0"] { background: #c4c4c4; color: #000; }
  .bd-lanenote[lane="p1"] { background: #fff500; color: #000; }
  .bd-lanenote[lane="p2"] { background: #99ff67; color: #000; }
  .bd-lanenote[lane="p3"] { background: #30b9f9; color: #000; }
  .bd-lanenote[lane="p4"] { background: #ff6c6c; color: #000; }
  .bd-lanenote[lane="p5"] { background: #30b9f9; color: #000; }
  .bd-lanenote[lane="p6"] { background: #99ff67; color: #000; }
  .bd-lanenote[lane="p7"] { background: #fff500; color: #000; }
  .bd-lanenote[lane="p8"] { background: #c4c4c4; color: #000; }
`;

export const BMSDATA_TEMPLATE_HTML = `
  <div id="bmsdata-container" class="bmsdata" style="display: none;">
    <div class="bd-info">
      <table class="bd-info-table">
        <tr>
          <td class="bd-header-cell">LINK</td>
          <td colspan="3">
            <a href="" id="bd-lr2ir" style="display: none;">LR2IR</a><a href="" id="bd-minir" style="display: none;">MinIR</a><a href="" id="bd-mocha" style="display: none;">Mocha</a><a href="" id="bd-viewer" style="display: none;">Viewer</a><a href="" id="bd-bmssearch" style="display: none;">BMS<span style="display:inline-block; width:2px;"></span>SEARCH</a><a href="" id="bd-bokutachi" style="display: none;">Bokutachi</a><a href="" id="bd-stellaverse" style="display: none;">STELLAVERSE</a>
          </td>
        </tr>
        <tr>
          <td class="bd-header-cell">SHA256</td>
          <td colspan="3" id="bd-sha256">Loading...</td>
        </tr>
        <tr>
          <td class="bd-header-cell">MD5</td>
          <td id="bd-md5">Loading...</td>
          <td class="bd-header-cell">BMSID</td>
          <td id="bd-bmsid">Loading...</td>
        </tr>
        <tr>
          <td class="bd-header-cell">BPM</td>
          <td>
            <span class="bd-icon">MAIN</span><span id="bd-mainbpm">0</span><span class="bd-icon">MIN</span><span
              id="bd-minbpm">0</span><span class="bd-icon">MAX</span><span id="bd-maxbpm">0</span>
          </td>
          <td class="bd-header-cell">MODE</td>
          <td id="bd-mode">0</td>
        </tr>
        <tr>
          <td class="bd-header-cell">FEATURE</td>
          <td id="bd-feature">Loading...</td>
          <td class="bd-header-cell">JUDGERANK</td>
          <td id="bd-judgerank">0</td>
        </tr>
        <tr>
          <td class="bd-header-cell">NOTES</td>
          <td id="bd-notes">0 (N: 0, LN: 0, SC: 0, LNSC: 0)</td>
          <td class="bd-header-cell">TOTAL</td>
          <td id="bd-total">0 (0.000 T/N)</td>
        </tr>
        <tr>
          <td class="bd-header-cell">DENSITY</td>
          <td><span class="bd-icon">AVG</span><span id="bd-avgdensity">0.0</span><span class="bd-icon">PEAK</span><span
              id="bd-peakdensity">0</span><span class="bd-icon">END</span><span id="bd-enddensity">0.0</span></td>
          <td class="bd-header-cell">DURATION</td>
          <td id="bd-duration">000.000 s</td>
        </tr>
        <tr>
          <td class="bd-header-cell">LANENOTES</td>
          <td colspan="3">
            <div class="bd-lanenotes" id="bd-lanenotes-div"></div>
          </td>
        </tr>
      </table>
      <div class="bd-table-list">
        <div class="bd-header-cell">TABLES</div>
        <div class="bd-table-scroll">
          <ul id="bd-tables-ul">
          </ul>
        </div>
      </div>
    </div>
    <div id="bd-graph">
      <div class="bd-graph-toolbar">
        <button id="bd-graph-settings-toggle" class="bd-graph-toolbar-button" type="button" aria-label="Open graph settings">⚙</button>
        <label class="bd-scoreviewer-pin">
          <input id="bd-scoreviewer-pin-input" type="checkbox">
          <span>PIN THE VIEWER</span>
        </label>
      </div>
      <div id="bd-graph-tooltip"></div>
      <canvas id="bd-graph-canvas"></canvas>
    </div>
  </div>
`;

export function ensureBmsDataStyleOnce(documentRef = document) {
  if (documentRef.getElementById(BMSDATA_STYLE_ID)) {
    return;
  }
  const styleElement = documentRef.createElement("style");
  styleElement.id = BMSDATA_STYLE_ID;
  styleElement.textContent = BMSDATA_CSS;
  documentRef.head.appendChild(styleElement);
}

export function createBmsDataContainer({ documentRef = document, theme }) {
  ensureBmsDataStyleOnce(documentRef);
  const template = documentRef.createElement("template");
  template.innerHTML = BMSDATA_TEMPLATE_HTML.trim();
  const container = template.content.firstElementChild;
  if (!container) {
    throw new Error("BMS preview template did not create a container.");
  }
  if (theme) {
    container.style.setProperty("--bd-dctx", theme.dctx);
    container.style.setProperty("--bd-dcbk", theme.dcbk);
    container.style.setProperty("--bd-hdtx", theme.hdtx);
    container.style.setProperty("--bd-hdbk", theme.hdbk);
  }
  return container;
}

export function insertBmsDataContainer({ documentRef = document, insertion, theme }) {
  const container = createBmsDataContainer({ documentRef, theme });
  insertion.element.insertAdjacentElement(insertion.position, container);
  return container;
}

export async function fetchBmsInfoRecordByIdentifiers({ md5 = null, sha256 = null, bmsid = null }) {
  const lookupKey = md5 ?? sha256 ?? bmsid;
  if (!lookupKey) {
    return false;
  }

  try {
    return await fetchBmsInfoRecordByLookupKey(lookupKey);
  } catch (error) {
    console.error("Fetch or parse error:", error);
    return false;
  }
}

export async function checkBmsSearchPatternExists(sha256) {
  if (!sha256) {
    return false;
  }

  let cachedPromise = bmsSearchPatternAvailabilityCache.get(sha256);
  if (!cachedPromise) {
    cachedPromise = (async () => {
      try {
        const response = await fetch(`${BMSSEARCH_PATTERN_API_BASE_URL}/${sha256}`);
        return response.ok;
      } catch (error) {
        bmsSearchPatternAvailabilityCache.delete(sha256);
        console.warn("BMS SEARCH APIで譜面の存在確認に失敗しました:", error);
        return false;
      }
    })();
    bmsSearchPatternAvailabilityCache.set(sha256, cachedPromise);
  }

  return cachedPromise;
}

export async function renderBmsSearchLinkIfAvailable(container, sha256) {
  try {
    if (!sha256 || !await checkBmsSearchPatternExists(sha256) || !container.isConnected) {
      return;
    }
    const bmsSearchLink = container.querySelector("#bd-bmssearch");
    if (!bmsSearchLink) {
      return;
    }
    showLink(bmsSearchLink, `${BMSSEARCH_PATTERN_PAGE_BASE_URL}/${sha256}`);
  } catch (error) {
    console.warn("BMS SEARCHリンクの表示に失敗しました:", error);
  }
}

export function renderBmsData(container, normalizedRecord) {
  const getById = (id) => container.querySelector(`#${id}`);

  renderLinks(container, normalizedRecord);
  getById("bd-sha256").textContent = normalizedRecord.sha256;
  getById("bd-md5").textContent = normalizedRecord.md5;
  getById("bd-bmsid").textContent = normalizedRecord.bmsid ? normalizedRecord.bmsid : "Undefined";
  getById("bd-mainbpm").textContent = formatCompactNumber(normalizedRecord.mainbpm);
  getById("bd-maxbpm").textContent = formatCompactNumber(normalizedRecord.maxbpm);
  getById("bd-minbpm").textContent = formatCompactNumber(normalizedRecord.minbpm);
  getById("bd-mode").textContent = normalizedRecord.mode;
  getById("bd-feature").textContent = normalizedRecord.featureNames.join(", ");
  getById("bd-judgerank").textContent = normalizedRecord.judge;
  getById("bd-notes").textContent = normalizedRecord.notesStr;
  getById("bd-total").textContent = normalizedRecord.totalStr;
  getById("bd-avgdensity").textContent = normalizedRecord.density.toFixed(3);
  getById("bd-peakdensity").textContent = formatCompactNumber(normalizedRecord.peakdensity);
  getById("bd-enddensity").textContent = formatCompactNumber(normalizedRecord.enddensity);
  getById("bd-duration").textContent = normalizedRecord.durationStr;
  renderLaneNotes(container, normalizedRecord);
  renderTables(container, normalizedRecord);
  container.style.display = "block";
  void renderBmsSearchLinkIfAvailable(container, normalizedRecord.sha256);
}

export function createBmsInfoPreview({
  container,
  documentRef = document,
  loadParsedScore = async () => null,
  prefetchParsedScore = async () => {},
  getPersistedViewerMode = () => DEFAULT_VIEWER_MODE,
  setPersistedViewerMode = () => {},
  getPersistedInvisibleNoteVisibility = () => DEFAULT_INVISIBLE_NOTE_VISIBILITY,
  setPersistedInvisibleNoteVisibility = () => {},
  getPersistedJudgeLinePositionRatio = () => DEFAULT_JUDGE_LINE_POSITION_RATIO,
  setPersistedJudgeLinePositionRatio = () => {},
  getPersistedSpacingScale = () => DEFAULT_SPACING_SCALE,
  setPersistedSpacingScale = () => {},
  getPersistedGameDurationMs = () => DEFAULT_GAME_DURATION_MS,
  setPersistedGameDurationMs = () => {},
  getPersistedGameLaneHeightPercent = () => DEFAULT_GAME_LANE_HEIGHT_PERCENT,
  setPersistedGameLaneHeightPercent = () => {},
  getPersistedGameLaneCoverPermille = () => DEFAULT_GAME_LANE_COVER_PERMILLE,
  setPersistedGameLaneCoverPermille = () => {},
  getPersistedGameLaneCoverVisible = () => DEFAULT_GAME_LANE_COVER_VISIBLE,
  setPersistedGameLaneCoverVisible = () => {},
  getPersistedGameHsFixMode = () => DEFAULT_GAME_HS_FIX_MODE,
  setPersistedGameHsFixMode = () => {},
  getPersistedGraphInteractionMode = () => DEFAULT_GRAPH_INTERACTION_MODE,
  setPersistedGraphInteractionMode = () => {},
  onSelectedTimeChange = () => {},
  onPinChange = () => {},
  onPlaybackChange = () => {},
  onViewerOpenChange = () => {},
  onRuntimeError = () => {},
}) {
  const graphHost = container.querySelector("#bd-graph");
  const graphCanvas = container.querySelector("#bd-graph-canvas");
  const graphTooltip = container.querySelector("#bd-graph-tooltip");
  const pinInput = container.querySelector("#bd-scoreviewer-pin-input");
  const graphSettingsToggle = container.querySelector("#bd-graph-settings-toggle");

  if (!graphHost || !graphCanvas || !graphTooltip || !pinInput || !graphSettingsToggle) {
    throw new Error("BMS preview graph elements are missing.");
  }

  const graphSettingsPopup = documentRef.createElement("div");
  graphSettingsPopup.id = "bd-graph-settings-popup";
  graphSettingsPopup.className = "bd-graph-settings-popup";
  graphSettingsPopup.hidden = true;
  const graphSettingsHeader = documentRef.createElement("div");
  graphSettingsHeader.className = "bd-graph-settings-header";
  const graphSettingsTitle = documentRef.createElement("span");
  graphSettingsTitle.className = "bd-graph-settings-title";
  graphSettingsTitle.textContent = "Settings";
  const graphSettingsClose = documentRef.createElement("button");
  graphSettingsClose.id = "bd-graph-settings-close";
  graphSettingsClose.className = "bd-graph-settings-close";
  graphSettingsClose.type = "button";
  graphSettingsClose.setAttribute("aria-label", "Close graph settings");
  graphSettingsClose.textContent = "x";
  graphSettingsHeader.append(graphSettingsTitle, graphSettingsClose);
  const graphSettingsGroup = documentRef.createElement("div");
  graphSettingsGroup.className = "bd-graph-settings-group";
  const initialGraphInteractionMode = getInitialGraphInteractionMode(getPersistedGraphInteractionMode);
  const graphInteractionLabel = documentRef.createElement("label");
  graphInteractionLabel.className = "bd-graph-settings-label";
  graphInteractionLabel.setAttribute("for", "bd-graph-interaction-select");
  graphInteractionLabel.textContent = "Line Control";
  const graphInteractionSelect = documentRef.createElement("select");
  graphInteractionSelect.id = "bd-graph-interaction-select";
  graphInteractionSelect.className = "bd-graph-settings-select";
  graphInteractionSelect.append(
    createPopupOption(documentRef, "hover", "Hover Follow"),
    createPopupOption(documentRef, "drag", "Click & Drag"),
  );
  graphInteractionSelect.value = initialGraphInteractionMode;
  graphSettingsGroup.append(graphInteractionLabel, graphInteractionSelect);
  graphSettingsPopup.append(graphSettingsHeader, graphSettingsGroup);
  documentRef.body.appendChild(graphSettingsPopup);

  const shell = documentRef.createElement("div");
  shell.className = "score-viewer-shell";
  documentRef.body.appendChild(shell);

  const parsedScoreCache = new Map();
  const loadPromiseCache = new Map();
  const compressedAvailabilityBySha256 = new Map();
  const state = {
    record: null,
    selectedSha256: null,
    selectedTimeSec: 0,
    selectedBeat: 0,
    viewerMode: getInitialViewerMode(getPersistedViewerMode),
    invisibleNoteVisibility: getInitialInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility),
    judgeLinePositionRatio: getInitialJudgeLinePositionRatio(getPersistedJudgeLinePositionRatio),
    spacingScaleByMode: getInitialSpacingScaleByMode(getPersistedSpacingScale),
    gameTimingConfig: getInitialGameTimingConfig({
      getPersistedGameDurationMs,
      getPersistedGameLaneHeightPercent,
      getPersistedGameLaneCoverPermille,
      getPersistedGameLaneCoverVisible,
      getPersistedGameHsFixMode,
    }),
    graphInteractionMode: initialGraphInteractionMode,
    isPinned: false,
    isViewerOpen: false,
    isPlaying: false,
    isGraphHovered: false,
    isGraphSettingsOpen: false,
    parsedScore: null,
    viewerModel: null,
    loadToken: 0,
    renderFrameId: null,
    pendingRenderMask: 0,
    playbackFrameId: null,
    lastPlaybackTimestamp: null,
    lastViewerOpenState: false,
    isDestroyed: false,
  };

  const viewerController = createScoreViewerController({
    root: shell,
    onTimeChange: (selection) => {
      const nextTimeSec = typeof selection === "object" ? selection.timeSec : selection;
      setSelectedTimeSec(nextTimeSec, {
        openViewer: true,
        notify: true,
        beatHint: selection?.beat,
        source: selection?.source ?? "viewer",
      });
    },
    onPlaybackToggle: (nextPlaying) => {
      setPlaybackState(nextPlaying);
    },
    onViewerModeChange: (nextViewerMode) => {
      setViewerMode(nextViewerMode);
    },
    onInvisibleNoteVisibilityChange: (nextVisibility) => {
      setInvisibleNoteVisibility(nextVisibility);
    },
    onJudgeLinePositionChange: (nextRatio) => {
      setJudgeLinePositionRatio(nextRatio);
    },
    onSpacingScaleChange: (mode, nextScale) => {
      setSpacingScale(mode, nextScale);
    },
    onGameTimingConfigChange: (nextGameTimingConfig) => {
      setGameTimingConfig(nextGameTimingConfig);
    },
  });

  const graphController = createBmsInfoGraph({
    scrollHost: graphHost,
    canvas: graphCanvas,
    tooltip: graphTooltip,
    pinInput,
    interactionMode: state.graphInteractionMode,
    onHoverTime: () => {
      handleGraphHover();
    },
    onHoverLeave: () => {
      state.isGraphHovered = false;
      if (!state.isPinned && !state.isPlaying) {
        state.isViewerOpen = false;
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
    },
    onSelectTime: (timeSec) => {
      void activateRecord({ openViewer: true });
      setSelectedTimeSec(timeSec, { openViewer: true, notify: true });
    },
    onPinChange: (nextPinned) => {
      state.isPinned = Boolean(nextPinned);
      onPinChange(state.isPinned);
      if (state.isPinned) {
        state.isViewerOpen = true;
        void activateRecord({ openViewer: true });
      } else if (!state.isGraphHovered && !state.isPlaying) {
        state.isViewerOpen = false;
      }
      scheduleRender(PREVIEW_RENDER_DIRTY.pin | PREVIEW_RENDER_DIRTY.viewerOpen);
    },
  });

  graphSettingsToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setGraphSettingsOpen(!state.isGraphSettingsOpen);
  });
  graphSettingsClose.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setGraphSettingsOpen(false);
  });
  graphInteractionSelect.addEventListener("change", () => {
    setGraphInteractionMode(graphInteractionSelect.value);
  });

  return {
    setRecord,
    setSelectedTimeSec,
    setViewerMode,
    setInvisibleNoteVisibility,
    setJudgeLinePositionRatio,
    setSpacingScale,
    setGameTimingConfig,
    setPinned,
    setPlaybackState,
    prefetch,
    destroy,
    getState: () => ({
      ...state,
      resolvedViewerMode: getResolvedViewerMode(state),
    }),
  };

  function setRecord(normalizedRecord, { parsedScore = null } = {}) {
    const previousSha256 = state.record?.sha256 ?? null;
    const nextSha256Value = normalizedRecord?.sha256 ?? null;
    const recordChanged = previousSha256 !== nextSha256Value || state.record !== normalizedRecord;
    let renderMask = 0;
    state.record = normalizedRecord;
    if (!normalizedRecord) {
      state.selectedSha256 = null;
      state.parsedScore = null;
      state.viewerModel = null;
      state.selectedTimeSec = 0;
      state.selectedBeat = 0;
      state.isViewerOpen = false;
      renderMask |= PREVIEW_RENDER_ALL;
      scheduleRender(renderMask);
      return;
    }

    if (recordChanged) {
      renderBmsData(container, normalizedRecord);
      shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(normalizedRecord.mode)}px`);
      renderMask |= PREVIEW_RENDER_DIRTY.record;
    }

    const nextSha256 = normalizedRecord.sha256 ? normalizedRecord.sha256.toLowerCase() : null;
    if (parsedScore && nextSha256) {
      const viewerModel = buildViewerModel(parsedScore, normalizedRecord, state.viewerMode);
      parsedScoreCache.set(nextSha256, { score: parsedScore, viewerModel });
      compressedAvailabilityBySha256.set(nextSha256, { status: "ready" });
      state.parsedScore = parsedScore;
      state.viewerModel = viewerModel;
      state.selectedSha256 = nextSha256;
      state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
      state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
      renderMask |= PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection;
    } else if (state.selectedSha256 !== nextSha256) {
      state.parsedScore = null;
      state.viewerModel = null;
      state.selectedSha256 = nextSha256;
      state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
      state.selectedBeat = 0;
      renderMask |= PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection;
    }

    scheduleRender(renderMask || PREVIEW_RENDER_DIRTY.selection);
  }

  async function prefetch() {
    if (!state.record?.sha256) {
      return;
    }
    await ensureCompressedScoreAvailability(state.record);
  }

  function handleGraphHover() {
    state.isGraphHovered = true;
    void activateRecord({ openViewer: true });
  }

  async function activateRecord({ openViewer = false } = {}) {
    if (!state.record) {
      return;
    }
    if (openViewer) {
      state.isViewerOpen = true;
    }

    const sha256 = state.record.sha256 ? state.record.sha256.toLowerCase() : null;
    if (!sha256) {
      state.parsedScore = null;
      state.viewerModel = null;
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.viewerOpen);
      return;
    }

    if (state.selectedSha256 === sha256 && state.viewerModel) {
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);
      return;
    }

    state.selectedSha256 = sha256;
    scheduleRender(PREVIEW_RENDER_DIRTY.viewerOpen);

    const isCompressedScoreAvailable = await ensureCompressedScoreAvailability(state.record);
    if (state.isDestroyed || getNormalizedRecordSha256(state.record) !== sha256) {
      return;
    }
    if (!isCompressedScoreAvailable) {
      state.parsedScore = null;
      state.viewerModel = null;
      state.selectedBeat = 0;
      state.isViewerOpen = false;
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.viewerOpen);
      return;
    }

    await loadSelectedRecord(state.record);
  }

  async function loadSelectedRecord(normalizedRecord) {
    if (!normalizedRecord?.sha256) {
      state.parsedScore = null;
      state.viewerModel = null;
      state.selectedBeat = 0;
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
      return;
    }

    const sha256 = normalizedRecord.sha256.toLowerCase();
    const loadToken = ++state.loadToken;

    if (parsedScoreCache.has(sha256)) {
      const cached = parsedScoreCache.get(sha256);
      if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
        return;
      }
      applyLoadedScore(cached.score, cached.viewerModel);
      return;
    }

    try {
      let loadPromise = loadPromiseCache.get(sha256);
      if (!loadPromise) {
        loadPromise = Promise.resolve(loadParsedScore(normalizedRecord))
          .then((parsedScore) => {
            if (!parsedScore) {
              throw new Error("Parsed score was not returned.");
            }
            const viewerModel = buildViewerModel(parsedScore, normalizedRecord, state.viewerMode);
            const cached = { score: parsedScore, viewerModel };
            parsedScoreCache.set(sha256, cached);
            loadPromiseCache.delete(sha256);
            return cached;
          })
          .catch((error) => {
            loadPromiseCache.delete(sha256);
            throw error;
          });
        loadPromiseCache.set(sha256, loadPromise);
      }

      const cached = await loadPromise;
      if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
        return;
      }
      applyLoadedScore(cached.score, cached.viewerModel);
    } catch (error) {
      if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
        return;
      }
      console.warn("Score viewer parse/load failed:", error);
      onRuntimeError(error);
      state.parsedScore = null;
      state.viewerModel = null;
      state.selectedBeat = 0;
      state.isViewerOpen = false;
      scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.viewerOpen);
    }
  }

  function applyLoadedScore(parsedScore, viewerModel) {
    state.parsedScore = parsedScore;
    state.viewerModel = viewerModel;
    if (state.selectedSha256) {
      compressedAvailabilityBySha256.set(state.selectedSha256, { status: "ready" });
    }
    state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
    state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
    scheduleRender(PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
  }

  function getNormalizedRecordSha256(record) {
    return record?.sha256 ? record.sha256.toLowerCase() : null;
  }

  async function ensureCompressedScoreAvailability(record) {
    const sha256 = getNormalizedRecordSha256(record);
    if (!sha256) {
      return false;
    }

    if (parsedScoreCache.has(sha256)) {
      compressedAvailabilityBySha256.set(sha256, { status: "ready" });
      return true;
    }

    const existingAvailability = compressedAvailabilityBySha256.get(sha256);
    if (existingAvailability?.status === "ready") {
      return true;
    }
    if (existingAvailability?.status === "unavailable") {
      return false;
    }
    if (existingAvailability?.status === "pending" && existingAvailability.promise) {
      return existingAvailability.promise;
    }

    const availabilityPromise = Promise.resolve(prefetchParsedScore(record))
      .then(() => {
        compressedAvailabilityBySha256.set(sha256, { status: "ready" });
        return true;
      })
      .catch((error) => {
        compressedAvailabilityBySha256.set(sha256, { status: "unavailable" });
        console.warn("Score prefetch failed:", error);
        return false;
      });

    compressedAvailabilityBySha256.set(sha256, {
      status: "pending",
      promise: availabilityPromise,
    });
    return availabilityPromise;
  }

  function setSelectedTimeSec(nextTimeSec, { openViewer = false, notify = false, beatHint = undefined, source = "external" } = {}) {
    const clampedTimeSec = clampSelectedTimeSec(state, nextTimeSec);
    const resolvedViewerMode = getResolvedViewerMode(state);
    const nextBeat = resolveSelectedBeat(state, clampedTimeSec, beatHint, resolvedViewerMode);
    const changed = hasViewerSelectionChanged(
      state.viewerModel,
      resolvedViewerMode,
      state.selectedTimeSec,
      clampedTimeSec,
      state.selectedBeat,
      nextBeat,
    );
    if (openViewer) {
      state.isViewerOpen = true;
    }
    state.selectedTimeSec = clampedTimeSec;
    state.selectedBeat = nextBeat;
    if (notify && changed) {
      onSelectedTimeChange({
        timeSec: clampedTimeSec,
        beat: nextBeat,
        viewerMode: resolvedViewerMode,
        source,
      });
    }
    if (!changed && !openViewer) {
      return;
    }
    scheduleRender(
      PREVIEW_RENDER_DIRTY.selection
      | (openViewer ? PREVIEW_RENDER_DIRTY.viewerOpen : 0),
    );
  }

  function setViewerMode(nextViewerMode) {
    const normalizedMode = normalizeViewerMode(nextViewerMode);
    if (state.viewerMode === normalizedMode) {
      return;
    }
    state.viewerMode = normalizedMode;
    if (state.parsedScore) {
      state.viewerModel = buildViewerModel(state.parsedScore, state.record, state.viewerMode);
      state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
    }
    state.selectedBeat = getBeatAtTimeSec(state.viewerModel, state.selectedTimeSec);
    try {
      setPersistedViewerMode(normalizedMode);
    } catch (error) {
      console.warn("Failed to persist viewer mode:", error);
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.viewerMode | PREVIEW_RENDER_DIRTY.viewerModel | PREVIEW_RENDER_DIRTY.selection);
  }

  function setInvisibleNoteVisibility(nextVisibility) {
    const normalizedVisibility = normalizeInvisibleNoteVisibility(nextVisibility);
    if (state.invisibleNoteVisibility === normalizedVisibility) {
      return;
    }
    state.invisibleNoteVisibility = normalizedVisibility;
    try {
      setPersistedInvisibleNoteVisibility(normalizedVisibility);
    } catch (error) {
      console.warn("Failed to persist invisible note visibility:", error);
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.invisible);
  }

  function setJudgeLinePositionRatio(nextRatio) {
    const normalizedRatio = normalizeJudgeLinePositionRatio(nextRatio);
    if (Math.abs(state.judgeLinePositionRatio - normalizedRatio) < 0.000001) {
      return;
    }
    state.judgeLinePositionRatio = normalizedRatio;
    try {
      setPersistedJudgeLinePositionRatio(normalizedRatio);
    } catch (error) {
      console.warn("Failed to persist judge line position ratio:", error);
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.judgeLinePosition);
  }

  function setSpacingScale(mode, nextScale) {
    const normalizedMode = normalizeSpacingMode(mode);
    const normalizedScale = normalizeSpacingScale(nextScale);
    if (Math.abs((state.spacingScaleByMode[normalizedMode] ?? DEFAULT_SPACING_SCALE) - normalizedScale) < 0.000001) {
      return;
    }
    state.spacingScaleByMode = {
      ...state.spacingScaleByMode,
      [normalizedMode]: normalizedScale,
    };
    try {
      setPersistedSpacingScale(normalizedMode, normalizedScale);
    } catch (error) {
      console.warn("Failed to persist spacing scale:", error);
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.spacing);
  }

  function setGameTimingConfig(nextGameTimingConfig = {}) {
    const normalizedGameTimingConfig = normalizeGameTimingConfig({
      ...state.gameTimingConfig,
      ...nextGameTimingConfig,
    });
    if (areGameTimingConfigsEqual(state.gameTimingConfig, normalizedGameTimingConfig)) {
      return;
    }
    state.gameTimingConfig = normalizedGameTimingConfig;
    try {
      setPersistedGameDurationMs(normalizedGameTimingConfig.durationMs);
      setPersistedGameLaneHeightPercent(normalizedGameTimingConfig.laneHeightPercent);
      setPersistedGameLaneCoverPermille(normalizedGameTimingConfig.laneCoverPermille);
      setPersistedGameLaneCoverVisible(normalizedGameTimingConfig.laneCoverVisible);
      setPersistedGameHsFixMode(normalizedGameTimingConfig.hsFixMode);
    } catch (error) {
      console.warn("Failed to persist game timing config:", error);
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.gameTimingConfig);
  }

  function setGraphInteractionMode(nextMode) {
    const normalizedMode = normalizeGraphInteractionMode(nextMode);
    if (state.graphInteractionMode === normalizedMode) {
      return;
    }
    state.graphInteractionMode = normalizedMode;
    try {
      setPersistedGraphInteractionMode(normalizedMode);
    } catch (error) {
      console.warn("Failed to persist graph interaction mode:", error);
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.graphInteractionMode);
  }

  function setGraphSettingsOpen(nextOpen) {
    const normalizedOpen = Boolean(nextOpen);
    if (state.isGraphSettingsOpen === normalizedOpen) {
      return;
    }
    state.isGraphSettingsOpen = normalizedOpen;
    scheduleRender(PREVIEW_RENDER_DIRTY.graphSettings);
  }

  function setPinned(nextPinned) {
    const normalized = Boolean(nextPinned);
    if (state.isPinned === normalized) {
      return;
    }
    state.isPinned = normalized;
    onPinChange(state.isPinned);
    if (state.isPinned) {
      state.isViewerOpen = true;
      void activateRecord({ openViewer: true });
    } else if (!state.isGraphHovered && !state.isPlaying) {
      state.isViewerOpen = false;
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.pin | PREVIEW_RENDER_DIRTY.viewerOpen);
  }

  function setPlaybackState(nextPlaying) {
    if (state.isPlaying === Boolean(nextPlaying) && state.viewerModel && state.parsedScore) {
      return;
    }
    if (!state.viewerModel || !state.parsedScore) {
      stopPlayback(false);
      scheduleRender(PREVIEW_RENDER_DIRTY.playback);
      return;
    }
    if (nextPlaying) {
      startPlayback();
    } else {
      stopPlayback(true);
    }
  }

  function startPlayback() {
    if (!state.viewerModel || !state.parsedScore) {
      return;
    }
    const maxTimeSec = getScoreTotalDurationSec(state.viewerModel.score);
    if (maxTimeSec <= 0) {
      return;
    }
    if (state.selectedTimeSec >= maxTimeSec - 0.0005) {
      setSelectedTimeSec(0, { notify: true, source: "playback" });
    }
    state.isPlaying = true;
    state.isViewerOpen = true;
    state.lastPlaybackTimestamp = null;
    onPlaybackChange(true);
    if (state.playbackFrameId !== null) {
      cancelAnimationFrame(state.playbackFrameId);
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.playback | PREVIEW_RENDER_DIRTY.viewerOpen);
    state.playbackFrameId = requestAnimationFrame(stepPlayback);
  }

  function stopPlayback(renderAfter = true) {
    if (state.playbackFrameId !== null) {
      cancelAnimationFrame(state.playbackFrameId);
      state.playbackFrameId = null;
    }
    state.lastPlaybackTimestamp = null;
    if (state.isPlaying) {
      state.isPlaying = false;
      onPlaybackChange(false);
    }
    if (renderAfter) {
      scheduleRender(PREVIEW_RENDER_DIRTY.playback);
    }
  }

  function stepPlayback(timestamp) {
    if (!state.isPlaying || !state.viewerModel || !state.parsedScore) {
      state.playbackFrameId = null;
      state.lastPlaybackTimestamp = null;
      return;
    }
    if (state.lastPlaybackTimestamp === null || timestamp - state.lastPlaybackTimestamp > SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS) {
      state.lastPlaybackTimestamp = timestamp;
      state.playbackFrameId = requestAnimationFrame(stepPlayback);
      return;
    }
    const deltaSec = (timestamp - state.lastPlaybackTimestamp) / 1000;
    state.lastPlaybackTimestamp = timestamp;
    const maxTimeSec = getScoreTotalDurationSec(state.viewerModel.score);
    const nextTimeSec = Math.min(state.selectedTimeSec + deltaSec, maxTimeSec);
    const resolvedViewerMode = getResolvedViewerMode(state);
    const nextBeat = resolveSelectedBeat(state, nextTimeSec, undefined, resolvedViewerMode);
    const changed = hasViewerSelectionChanged(
      state.viewerModel,
      resolvedViewerMode,
      state.selectedTimeSec,
      nextTimeSec,
      state.selectedBeat,
      nextBeat,
    );
    state.selectedTimeSec = nextTimeSec;
    state.selectedBeat = nextBeat;
    if (changed) {
      onSelectedTimeChange({
        timeSec: state.selectedTimeSec,
        beat: nextBeat,
        viewerMode: resolvedViewerMode,
        source: "playback",
      });
    }
    scheduleRender(PREVIEW_RENDER_DIRTY.selection);
    if (nextTimeSec >= maxTimeSec - 0.0005) {
      stopPlayback(false);
      scheduleRender(PREVIEW_RENDER_DIRTY.selection | PREVIEW_RENDER_DIRTY.playback);
      return;
    }
    state.playbackFrameId = requestAnimationFrame(stepPlayback);
  }

  function scheduleRender(renderMask = PREVIEW_RENDER_ALL) {
    if (state.isDestroyed) {
      return;
    }
    state.pendingRenderMask |= renderMask;
    if (state.renderFrameId !== null) {
      return;
    }
    state.renderFrameId = requestAnimationFrame(() => {
      state.renderFrameId = null;
      flushRender(state.pendingRenderMask);
      state.pendingRenderMask = 0;
    });
  }

  function flushRender(renderMask = PREVIEW_RENDER_ALL) {
    const expandedRenderMask = expandPreviewRenderMask(renderMask);
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.record) {
      graphController.setRecord(state.record);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.pin) {
      graphController.setPinned(state.isPinned);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.selection) {
      graphController.setSelectedTimeSec(state.selectedTimeSec);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.graphInteractionMode) {
      graphController.setInteractionMode(state.graphInteractionMode);
      graphInteractionSelect.value = state.graphInteractionMode;
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.graphSettings) {
      graphSettingsPopup.hidden = !state.isGraphSettingsOpen;
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel) {
      viewerController.setModel(state.viewerModel);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerMode) {
      viewerController.setViewerMode(state.viewerMode);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.invisible) {
      viewerController.setInvisibleNoteVisibility(state.invisibleNoteVisibility);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.judgeLinePosition) {
      viewerController.setJudgeLinePositionRatio(state.judgeLinePositionRatio);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.spacing) {
      viewerController.setSpacingScaleByMode(state.spacingScaleByMode);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.gameTimingConfig) {
      viewerController.setGameTimingConfig(state.gameTimingConfig);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.playback) {
      viewerController.setPlaybackState(state.isPlaying);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.pin) {
      viewerController.setPinned(state.isPinned);
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.selection || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerMode) {
      viewerController.setSelectedTimeSec(state.selectedTimeSec, { beatHint: state.selectedBeat });
    }
    if (expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerOpen || expandedRenderMask & PREVIEW_RENDER_DIRTY.viewerModel) {
      viewerController.setOpen(Boolean(state.isViewerOpen && state.viewerModel));
    }

    const isActuallyOpen = Boolean(state.isViewerOpen && state.viewerModel);
    if (state.lastViewerOpenState !== isActuallyOpen) {
      state.lastViewerOpenState = isActuallyOpen;
      onViewerOpenChange(isActuallyOpen);
    }
  }

  function destroy() {
    state.isDestroyed = true;
    if (state.renderFrameId !== null) {
      cancelAnimationFrame(state.renderFrameId);
      state.renderFrameId = null;
    }
    stopPlayback(false);
    graphController.destroy();
    viewerController.destroy();
    graphSettingsPopup.remove();
    shell.remove();
  }
}

function renderLinks(container, normalizedRecord) {
  const getById = (id) => container.querySelector(`#${id}`);

  if (normalizedRecord.md5) {
    showLink(getById("bd-lr2ir"), `http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=${normalizedRecord.md5}`);
    showLink(getById("bd-viewer"), `https://bms-score-viewer.pages.dev/view?md5=${normalizedRecord.md5}`);
  }
  if (normalizedRecord.sha256) {
    showLink(getById("bd-minir"), `https://www.gaftalk.com/minir/#/viewer/song/${normalizedRecord.sha256}/0`);
    showLink(getById("bd-mocha"), `https://mocha-repository.info/song.php?sha256=${normalizedRecord.sha256}`);
  }
  if (normalizedRecord.stella) {
    showLink(getById("bd-stellaverse"), `https://stellabms.xyz/song/${normalizedRecord.stella}`);
  }
}

function renderLaneNotes(container, normalizedRecord) {
  const laneNotesContainer = container.querySelector("#bd-lanenotes-div");
  if (!laneNotesContainer) {
    return;
  }
  laneNotesContainer.replaceChildren();
  normalizedRecord.lanenotesArr.forEach((laneNotes, index) => {
    const span = container.ownerDocument.createElement("span");
    span.className = "bd-lanenote";
    span.setAttribute("lane", getLaneChipKey(normalizedRecord.mode, index));
    span.textContent = String(laneNotes[3]);
    laneNotesContainer.appendChild(span);
  });
}

function renderTables(container, normalizedRecord) {
  const tableList = container.querySelector("#bd-tables-ul");
  if (!tableList) {
    return;
  }
  tableList.replaceChildren();
  normalizedRecord.tables.forEach((text) => {
    const item = container.ownerDocument.createElement("li");
    item.textContent = text;
    tableList.appendChild(item);
  });
}

function showLink(linkElement, href) {
  if (!linkElement) {
    return;
  }
  linkElement.href = href;
  linkElement.style.display = "inline";
}

function clampSelectedTimeSec(state, timeSec) {
  if (state.viewerModel) {
    return getClampedSelectedTimeSec(state.viewerModel, timeSec);
  }
  const maxTimeSec = state.record?.durationSec ?? 0;
  return clampValue(Number.isFinite(timeSec) ? timeSec : 0, 0, Math.max(maxTimeSec, 0));
}

function getResolvedViewerMode(state) {
  return resolveViewerModeForModel(state.viewerModel, state.viewerMode);
}

function resolveSelectedBeat(state, timeSec, beatHint = undefined, resolvedViewerMode = getResolvedViewerMode(state)) {
  if (resolvedViewerMode === "time") {
    return 0;
  }
  if (Number.isFinite(beatHint)) {
    return getClampedSelectedBeat(state.viewerModel, beatHint);
  }
  return getBeatAtTimeSec(state.viewerModel, timeSec);
}

export function getInitialViewerMode(getPersistedViewerMode) {
  try {
    return normalizeViewerMode(getPersistedViewerMode?.());
  } catch (error) {
    console.warn("Failed to read persisted viewer mode:", error);
    return DEFAULT_VIEWER_MODE;
  }
}

export function getInitialInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility) {
  try {
    return normalizeInvisibleNoteVisibility(getPersistedInvisibleNoteVisibility?.());
  } catch (error) {
    console.warn("Failed to read persisted invisible note visibility:", error);
    return DEFAULT_INVISIBLE_NOTE_VISIBILITY;
  }
}

export function getInitialJudgeLinePositionRatio(getPersistedJudgeLinePositionRatio) {
  try {
    const persistedValue = getPersistedJudgeLinePositionRatio?.();
    if (persistedValue === null || persistedValue === undefined || persistedValue === "") {
      return DEFAULT_JUDGE_LINE_POSITION_RATIO;
    }
    return normalizeJudgeLinePositionRatio(Number(persistedValue));
  } catch (error) {
    console.warn("Failed to read persisted judge line position ratio:", error);
    return DEFAULT_JUDGE_LINE_POSITION_RATIO;
  }
}

export function getInitialSpacingScaleByMode(getPersistedSpacingScale) {
  return {
    time: getInitialSpacingScale("time", getPersistedSpacingScale),
    editor: getInitialSpacingScale("editor", getPersistedSpacingScale),
    game: getInitialSpacingScale("game", getPersistedSpacingScale),
  };
}

export function getInitialGameTimingConfig({
  getPersistedGameDurationMs,
  getPersistedGameLaneHeightPercent,
  getPersistedGameLaneCoverPermille,
  getPersistedGameLaneCoverVisible,
  getPersistedGameHsFixMode,
} = {}) {
  return normalizeGameTimingConfig({
    durationMs: getPersistedGameDurationMs?.(),
    laneHeightPercent: getPersistedGameLaneHeightPercent?.(),
    laneCoverPermille: getPersistedGameLaneCoverPermille?.(),
    laneCoverVisible: getPersistedGameLaneCoverVisible?.(),
    hsFixMode: getPersistedGameHsFixMode?.(),
  });
}

export function getInitialGraphInteractionMode(getPersistedGraphInteractionMode) {
  try {
    return normalizeGraphInteractionMode(getPersistedGraphInteractionMode?.());
  } catch (error) {
    console.warn("Failed to read persisted graph interaction mode:", error);
    return DEFAULT_GRAPH_INTERACTION_MODE;
  }
}

export function getInitialSpacingScale(mode, getPersistedSpacingScale) {
  try {
    return normalizeSpacingScale(Number(getPersistedSpacingScale?.(normalizeSpacingMode(mode))));
  } catch (error) {
    console.warn("Failed to read persisted spacing scale:", error);
    return DEFAULT_SPACING_SCALE;
  }
}

function estimateViewerWidthFromNumericMode(mode) {
  switch (Number(mode)) {
    case 5:
      return estimateViewerWidth("5k", 6);
    case 7:
      return estimateViewerWidth("7k", 8);
    case 9:
      return estimateViewerWidth("popn-9k", 9);
    case 10:
      return estimateViewerWidth("10k", 12);
    case 14:
      return estimateViewerWidth("14k", 16);
    default:
      return estimateViewerWidth(String(mode ?? ""), getDisplayLaneCount(mode));
  }
}

function createPopupOption(documentRef, value, label) {
  const option = documentRef.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function getDisplayLaneCount(mode) {
  switch (mode) {
    case 5:
    case "5k":
      return 6;
    case 7:
    case "7k":
      return 8;
    case 10:
    case "10k":
      return 12;
    case 14:
    case "14k":
      return 16;
    case 9:
    case "9k":
    case "popn-9k":
      return 9;
    case "popn-5k":
      return 5;
    default:
      return Number.isFinite(Number(mode)) && Number(mode) > 0 ? Number(mode) : 8;
  }
}

function formatCompactNumber(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return Number.isInteger(value) ? String(Math.trunc(value)) : String(value);
}

function clampValue(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue);
}

function createViewerModelBpmSummary(normalizedRecord) {
  if (!normalizedRecord) {
    return undefined;
  }
  return {
    minBpm: normalizedRecord.minbpm,
    maxBpm: normalizedRecord.maxbpm,
    mainBpm: normalizedRecord.mainbpm,
  };
}

function getViewerModelGameProfile(viewerMode) {
  return normalizeViewerMode(viewerMode) === "lunatic" ? "lunatic" : "game";
}

function buildViewerModel(parsedScore, normalizedRecord, viewerMode) {
  return createScoreViewerModel(parsedScore, {
    bpmSummary: createViewerModelBpmSummary(normalizedRecord),
    gameProfile: getViewerModelGameProfile(viewerMode),
  });
}

function areGameTimingConfigsEqual(left, right) {
  return Math.abs((left?.durationMs ?? DEFAULT_GAME_DURATION_MS) - (right?.durationMs ?? DEFAULT_GAME_DURATION_MS)) < 0.000001
    && Math.abs((left?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT) - (right?.laneHeightPercent ?? DEFAULT_GAME_LANE_HEIGHT_PERCENT)) < 0.000001
    && Math.abs((left?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE) - (right?.laneCoverPermille ?? DEFAULT_GAME_LANE_COVER_PERMILLE)) < 0.000001
    && (left?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE) === (right?.laneCoverVisible ?? DEFAULT_GAME_LANE_COVER_VISIBLE)
    && (left?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE) === (right?.hsFixMode ?? DEFAULT_GAME_HS_FIX_MODE);
}

export function getSpacingScaleStorageKey(mode) {
  return SPACING_SCALE_STORAGE_KEYS[normalizeSpacingMode(mode)];
}

function normalizeSpacingMode(mode) {
  return mode === "editor" ? "editor" : mode === "game" || mode === "lunatic" ? "game" : "time";
}

function normalizeSpacingScale(value) {
  if (!Number.isFinite(value) || value < 0.5 || value > 8.0) {
    return DEFAULT_SPACING_SCALE;
  }
  return value;
}
