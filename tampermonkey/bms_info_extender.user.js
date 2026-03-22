// ==UserScript==
// @name         BMS Info Extender
// @namespace    https://github.com/Neeted
// @version      1.2.0
// @description  LR2IR、MinIR、Mocha、STELLAVERSEで詳細メタデータ、ノーツ分布/BPM推移グラフなどを表示する
// @author       ﾏﾝﾊｯﾀﾝｶﾞｯﾌｪ
// @match        http://www.dream-pro.info/~lavalse/LR2IR/search.cgi*
// @match        https://stellabms.xyz/*
// @match        https://www.gaftalk.com/minir/*
// @match        https://mocha-repository.info/song.php*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      bms.howan.jp
// @connect      bms-info-extender.netlify.app
// @resource     googlefont https://fonts.googleapis.com/css2?family=Inconsolata&family=Noto+Sans+JP&display=swap
// @updateURL    https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @downloadURL  https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @run-at document-start
// ==/UserScript==

// 1.2.0 譜面ビューワを userscript 本体へ統合し、グラフ hover/click 連携を追加
// 1.1.0 外部データ取得失敗時のフォールバック処理を追加(LR2IR、MochaでMD5や譜面ビューアへのリンクを表示)
// 1.0.5 誤字修正

// @run-at document-startでとにかく最速でスクリプトを起動して、ページが書き換え処理可能な状態かどうかはサイトごとに固有の判定を行う

(function () {
  'use strict';
  console.info("BMS Info Extenderが起動しました");

  // 使用するフォントを準備
  const fontCSS = GM_getResourceText("googlefont");
  GM_addStyle(fontCSS);

  const BMSDATA_STYLE_ID = "bms-info-extender-style";
  const BMSDATA_COLUMNS = ["md5", "sha256", "maxbpm", "minbpm", "length", "mode", "judge", "feature", "notes", "n", "ln", "s", "ls", "total", "density", "peakdensity", "enddensity", "mainbpm", "distribution", "speedchange", "lanenotes", "tables", "stella", "bmsid"];
  const SCORE_BASE_URL = "https://bms-info-extender.netlify.app/score";
  const SCORE_PARSER_BASE_URL = "https://bms-info-extender.netlify.app/score-parser";
  const SCORE_PARSER_VERSION = "0.4.0";
  const BMS_FEATURE_NAMES = [
    "LN(#LNMODE undef)",
    "MINE",
    "RANDOM",
    "LN",
    "CN",
    "HCN",
    "STOP",
    "SCROLL"
  ];
  const DISTRIBUTION_NOTE_COLORS = [
    "#44FF44",
    "#228822",
    "#FF4444",
    "#4444FF",
    "#222288",
    "#CCCCCC",
    "#880000"
  ];
  const DISTRIBUTION_NOTE_NAMES = [
    "LNSCR",
    "LNSCR HOLD",
    "SCR",
    "LN",
    "LN HOLD",
    "NORMAL",
    "MINE"
  ];
  const BMSSEARCH_PATTERN_API_BASE_URL = "https://api.bmssearch.net/v1/patterns/sha256";
  const BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
  const bmsSearchPatternAvailabilityCache = new Map();
  let scoreLoaderContextPromise = null;
  let scoreViewerManager = null;
  const GRAPH_RECT_WIDTH = 4;
  const GRAPH_RECT_HEIGHT = 2;
  const GRAPH_SPACING = 1;
  const GRAPH_MIN_VALUE = 1 / 8;
  const GRAPH_MAX_VALUE = 8;
  const GRAPH_MIN_LOG = Math.log10(GRAPH_MIN_VALUE);
  const GRAPH_MAX_LOG = Math.log10(GRAPH_MAX_VALUE);
  const SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS = 250;
  const STANDALONE_DEFAULT_VIEWER_PIXELS_PER_SECOND = 160;
  const STANDALONE_VIEWER_HORIZONTAL_PADDING = 16;
  const STANDALONE_DP_GUTTER_UNITS = 1.2;
  const STANDALONE_FIXED_LANE_WIDTH = 44;
  const STANDALONE_VIEWER_MARKER_LABEL_WIDTH = 84;
  const STANDALONE_BACKGROUND_FILL = "#000000";
  const STANDALONE_SEPARATOR_COLOR = "rgba(72, 72, 72, 0.95)";
  const STANDALONE_BAR_LINE = "rgba(255, 255, 255, 0.92)";
  const STANDALONE_BPM_MARKER = "#00ff00";
  const STANDALONE_STOP_MARKER = "#ff00ff";
  const STANDALONE_MINE_COLOR = "#880000";
  const STANDALONE_NOTE_HEAD_HEIGHT = 8;
  const STANDALONE_TEMPO_MARKER_HEIGHT = 3;
  const STANDALONE_TEMPO_LABEL_GAP = 8;
  const STANDALONE_SCROLL_MULTIPLIER = 2;
  const STANDALONE_MIN_SPACING_SCALE = 0.5;
  const STANDALONE_MAX_SPACING_SCALE = 8.0;
  const STANDALONE_SPACING_STEP = 0.01;
  const STANDALONE_DEFAULT_SPACING_SCALE = 1.0;
  const STANDALONE_BEAT_LANE_COLORS = new Map([
    ["0", "#e04a4a"],
    ["1", "#bebebe"],
    ["2", "#5074fe"],
    ["3", "#bebebe"],
    ["4", "#5074fe"],
    ["5", "#bebebe"],
    ["6", "#5074fe"],
    ["7", "#bebebe"],
    ["8", "#bebebe"],
    ["9", "#5074fe"],
    ["10", "#bebebe"],
    ["11", "#5074fe"],
    ["12", "#bebebe"],
    ["13", "#5074fe"],
    ["14", "#bebebe"],
    ["15", "#e04a4a"],
    ["g0", "#e04a4a"],
    ["g1", "#bebebe"],
    ["g2", "#5074fe"],
    ["g3", "#bebebe"],
    ["g4", "#5074fe"],
    ["g5", "#bebebe"],
    ["g6", "#bebebe"],
    ["g7", "#5074fe"],
    ["g8", "#bebebe"],
    ["g9", "#5074fe"],
    ["g10", "#bebebe"],
    ["g11", "#e04a4a"],
  ]);
  const STANDALONE_POPN_LANE_COLORS = new Map([
    ["p0", "#c4c4c4"],
    ["p1", "#fff500"],
    ["p2", "#99ff67"],
    ["p3", "#30b9f9"],
    ["p4", "#ff6c6c"],
    ["p5", "#30b9f9"],
    ["p6", "#99ff67"],
    ["p7", "#fff500"],
    ["p8", "#c4c4c4"],
  ]);
  const BMSDATA_CSS = `
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
    #bd-graph-tooltip { line-height: 1rem; position: fixed; background: rgba(32, 32, 64, 0.8); color: #fff; padding: 4px 8px; font-size: 0.875rem; pointer-events: none; border-radius: 4px; display: none; z-index: 10; white-space: nowrap; }
    .bd-scoreviewer-pin { position: absolute; top: 4px; left: 4px; display: inline-flex; align-items: center; gap: 0.35rem; padding: 4px 8px; border-radius: 4px; background: rgba(32, 32, 64, 0.8); color: #fff; font-size: 0.875rem; z-index: 2; }
    .bd-scoreviewer-pin * { background: transparent; color: #fff; font-family: "Inconsolata", "Noto Sans JP"; }
    .bd-scoreviewer-pin input { margin: 0; }
    .score-viewer-shell { --score-viewer-width: 520px; position: fixed; top: 0; right: 0; width: var(--score-viewer-width); height: 100dvh; background: #000; border-left: 1px solid rgba(112, 112, 132, 0.4); box-shadow: -12px 0 32px rgba(0, 0, 0, 0.38); overflow: hidden; z-index: 2147483000; opacity: 0; pointer-events: none; transform: translateX(100%); transition: transform 120ms ease, opacity 120ms ease; }
    .score-viewer-shell.is-visible { opacity: 1; pointer-events: auto; transform: translateX(0); }
    .score-viewer-scroll-host { position: absolute; inset: 0; overflow-x: hidden; overflow-y: hidden; scrollbar-gutter: stable; }
    .score-viewer-scroll-host.is-scrollable { overflow-y: auto; cursor: grab; touch-action: none; }
    .score-viewer-scroll-host.is-scrollable.is-dragging { cursor: grabbing; }
    .score-viewer-spacer { width: 1px; opacity: 0; }
    .score-viewer-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .score-viewer-marker-overlay, .score-viewer-marker-labels { position: absolute; inset: 0; pointer-events: none; }
    .score-viewer-marker-label { position: absolute; top: 0; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.75rem; line-height: 1; white-space: nowrap; text-shadow: 0 0 4px rgba(0, 0, 0, 0.95), 0 0 10px rgba(0, 0, 0, 0.72); }
    .score-viewer-marker-label.is-left { transform: translate(-100%, -50%); text-align: right; }
    .score-viewer-marker-label.is-right { transform: translate(0, -50%); text-align: left; }
    .score-viewer-bottom-bar { position: absolute; left: 12px; right: 12px; bottom: 12px; z-index: 3; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; pointer-events: none; }
    .score-viewer-chip { display: inline-flex; align-items: center; min-height: 34px; padding: 6px 10px; border-radius: 10px; border: 1px solid rgba(160, 160, 196, 0.22); background: rgba(32, 32, 64, 0.8); color: #fff; font-family: "Inconsolata", "Noto Sans JP"; font-size: 0.875rem; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24); pointer-events: auto; }
    .score-viewer-chip.is-primary { gap: 10px; }
    .score-viewer-chip.is-compact { min-width: 70px; justify-content: center; }
    .score-viewer-playback-button { display: inline-flex; align-items: center; justify-content: center; width: 28px; min-width: 28px; height: 28px; min-height: 28px; padding: 0; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.24); background: rgba(255, 255, 255, 0.16); color: #fff; box-shadow: none; font-size: 0.76rem; line-height: 1; pointer-events: auto; cursor: pointer; }
    .score-viewer-playback-button:disabled { opacity: 0.5; cursor: not-allowed; }
    .score-viewer-playback-time { font-variant-numeric: tabular-nums; }
    .score-viewer-spacing-panel { display: grid; gap: 6px; min-width: 160px; flex: 1 1 180px; }
    .score-viewer-spacing-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.82); }
    .score-viewer-spacing-value { color: #fff; letter-spacing: 0.02em; }
    .score-viewer-spacing-input { width: 100%; min-height: auto; margin: 0; padding: 0; background: transparent; border: none; accent-color: #ffffff; }
    .score-viewer-judge-line { position: absolute; left: 16px; right: 16px; top: 50%; display: flex; align-items: center; transform: translateY(-50%); pointer-events: none; }
    .score-viewer-judge-line::after { content: ""; width: 100%; height: 2px; background: linear-gradient(90deg, rgba(187, 71, 49, 0.18) 0%, rgba(187, 71, 49, 0.94) 48%, rgba(187, 71, 49, 0.18) 100%); box-shadow: 0 0 20px rgba(187, 71, 49, 0.2); }
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
  const BMSDATA_TEMPLATE_HTML = `
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
        <label class="bd-scoreviewer-pin">
          <input id="bd-scoreviewer-pin-input" type="checkbox">
          <span>Pin the score viewer</span>
        </label>
        <div id="bd-graph-tooltip"></div>
        <canvas id="bd-graph-canvas"></canvas>
      </div>
    </div>
  `;
  const LR2IR_SELECTORS = {
    allAnchors: "a",
    registeredSongHeading: "#box > h2",
    search: "#search",
    registeredSongFallbackBody: "#box > table:nth-child(10) > tbody"
  };
  const STELLAVERSE_SELECTORS = {
    datetimeElem: "#thread-1 > div:nth-child(1) > div > div:nth-child(1) > div:nth-child(1) > p:last-of-type",
    targetElem: "#scroll-area > section > main > h2",
    tableContainer: '[data-slot="table-container"]',
    tableRow: '[data-slot="table-row"]',
    tableHead: '[data-slot="table-head"]',
    tableCell: '[data-slot="table-cell"]',
    anchor: "a"
  };
  const STELLAVERSE_INDEXES = {
    notesCell: 1,
    totalCell: 3,
    removeRowsAfterSuccess: [4, 0]
  };
  const MINIR_SELECTORS = {
    targetElement: "#root > div > div > div > div.compact.tabulator"
  };
  const MOCHA_SELECTORS = {
    songInfoTable: "#main > table.songinfo",
    songInfoBody: "#main > table.songinfo > tbody",
    form: "#main > form",
    songInfoContentCell: "td.songinfo_content",
    anchor: "a"
  };
  const MOCHA_ROW_INDEXES = {
    mode: 1,
    totalNotes: 3,
    total: 4,
    judgerank: 5,
    bpm: 6,
    otherIr: 10
  };
  const MOCHA_LINK_INDEXES = {
    lr2irInOtherIrRow: 2
  };

  /**
   * 外部サイト側で取得できた識別子群。
   * @typedef {Object} PageIdentifiers
   * @property {string|null} md5
   * @property {string|null} sha256
   * @property {string|null} bmsid
   */

  /**
   * 拡張パネルをどこへ挿入するかを表す情報。
   * @typedef {Object} PageInsertion
   * @property {Element} element
   * @property {InsertPosition} position
   */

  /**
   * 拡張パネルの配色設定。
   * @typedef {Object} PageTheme
   * @property {string} dctx
   * @property {string} dcbk
   * @property {string} hdtx
   * @property {string} hdbk
   */

  /**
   * サイト別処理から共通描画へ渡すページコンテキスト。
   * @typedef {Object} PageContext
   * @property {PageIdentifiers} identifiers
   * @property {PageInsertion} insertion
   * @property {PageTheme} theme
   */

  /**
   * SPA監視側から updatePage に渡す helper 群。
   * @typedef {Object} UpdatePageHelpers
   * @property {() => void} markUpdated
   */

  /**
   * SPA 監視の設定。
   * @typedef {Object} WatchSpaPageConfig
   * @property {string} siteName
   * @property {(url: string) => boolean} matchUrl
   * @property {(helpers: UpdatePageHelpers) => Promise<void>} updatePage
   * @property {(() => boolean)=} isSettled
   */

  /**
   * STELLAVERSE 側でまとめて取得する DOM 参照群。
   * @typedef {Object} StellaverseDomRefs
   * @property {Element|null} datetimeElem
   * @property {Element|null} targetElem
   * @property {Element|null} tableContainer
   * @property {Element[]} tableRows
   * @property {Element[]} tableHeads
   * @property {Element[]} tableCells
   * @property {HTMLAnchorElement[]} anchors
   */

  /**
   * Mocha の曲情報テーブル周りで使う DOM 参照群。
   * @typedef {Object} MochaSongInfoRefs
   * @property {Element|null} songInfoTable
   * @property {Element|null} songInfoBody
   * @property {Element[]} songInfoRows
   */

  /**
   * 外部データを描画しやすい形へ正規化した結果。
   * @typedef {Object} NormalizedBmsRecord
   * @property {string} md5
   * @property {string} sha256
   * @property {number} maxbpm
   * @property {number} minbpm
   * @property {number} mode
   * @property {number} judge
   * @property {number} density
   * @property {number} peakdensity
   * @property {number} enddensity
   * @property {number} mainbpm
   * @property {number} stella
   * @property {number} bmsid
   * @property {string} durationStr
   * @property {string} notesStr
   * @property {string} totalStr
   * @property {string} featuresStr
   * @property {string} distribution
   * @property {string} speedchange
   * @property {Array<[number, number, number, number]>} lanenotesArr
   * @property {string[]} tables
   */

  // サイトを特定
  const hostname = location.hostname;

  // サイトごとに処理を分岐
  if (hostname === 'www.dream-pro.info') {
    lr2ir();
  } else if (hostname === 'stellabms.xyz') {
    stellaverse();
  } else if (hostname === 'www.gaftalk.com') {
    minir();
  } else if (hostname === 'mocha-repository.info') {
    mocha();
  }

  return;

  /**
   * history API を一度だけパッチし、SPA 遷移時に locationchange を発火させる。
   * @returns {void}
   */
  function installLocationChangeHookOnce() {
    const hookFlag = "__bmsInfoExtenderLocationHookInstalled";
    if (window[hookFlag]) {
      return;
    }
    window[hookFlag] = true;

    const dispatchLocationChange = () => {
      window.dispatchEvent(new Event("locationchange"));
    };

    const pushState = history.pushState;
    history.pushState = function (...args) {
      const result = pushState.apply(this, args);
      dispatchLocationChange();
      return result;
    };

    const replaceState = history.replaceState;
    history.replaceState = function (...args) {
      const result = replaceState.apply(this, args);
      dispatchLocationChange();
      return result;
    };

    window.addEventListener("popstate", dispatchLocationChange);
  }

  /**
   * SPA ページの URL 変化と DOM 変化を監視し、条件が整ったときだけ updatePage を呼び出す。
   * @param {WatchSpaPageConfig} config
   * @returns {void}
   */
  function watchSpaPage({ siteName, matchUrl, updatePage, isSettled }) {
    let lastUrl = location.href;
    let completedUrl = null;
    let observer = null;
    let isUpdating = false;

    // 同じ URL での再実行を止めるため、サイト側処理が完了した時点を記録する。
    function markUpdated() {
      completedUrl = location.href;
    }

    function shouldStopObserving() {
      return completedUrl === location.href || !matchUrl(location.href) || Boolean(isSettled?.());
    }

    async function runUpdate() {
      if (isUpdating || completedUrl === location.href || !matchUrl(location.href) || isSettled?.()) {
        if (shouldStopObserving()) {
          stopObserving();
        }
        return;
      }

      isUpdating = true;
      try {
        await updatePage({ markUpdated });
      } finally {
        isUpdating = false;
        if (shouldStopObserving()) {
          stopObserving();
        }
      }
    }

    function startObserving() {
      if (observer || !matchUrl(location.href) || !document.body) {
        return;
      }

      console.log(`👁️ ${siteName}: MutationObserverによる監視を開始します`);

      observer = new MutationObserver(async () => {
        console.info("MutationObserverがDOMの変化を検知しました");
        if (!document.hidden) {
          await runUpdate();
        }
        if (shouldStopObserving()) {
          stopObserving();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserving() {
      if (observer) {
        observer.disconnect();
        observer = null;
        console.log(`🛑 ${siteName}: MutationObserverによる監視を停止します`);
      }
    }

    installLocationChangeHookOnce();

    if (document.readyState === "complete") {
      console.info("🔥 loadイベントは発火済でした");
      startObserving();
      void runUpdate();
    } else {
      window.addEventListener('load', () => {
        console.info("🔥 loadイベントが発火しました");
        startObserving();
        void runUpdate();
      });
    }

    document.addEventListener("visibilitychange", () => {
      console.info("🔥 Visibilitychangeイベントが発火しました");
      if (document.hidden) {
        return;
      }
      startObserving();
      void runUpdate();
    });

    window.addEventListener("locationchange", () => {
      if (location.href === lastUrl) {
        return;
      }

      lastUrl = location.href;
      completedUrl = null;
      console.log("🔄 URLが変化しました:", lastUrl);

      if (matchUrl(location.href)) {
        startObserving();
        if (!document.hidden) {
          void runUpdate();
        }
      } else {
        stopObserving();
      }
    });

    startObserving();
  }

  /**
   * テキスト一致するアンカーを検索し、最後に見つかった要素を返す。
   * @param {HTMLAnchorElement[]} anchors
   * @param {string} text
   * @returns {HTMLAnchorElement|null}
   */
  function findAnchorByText(anchors, text) {
    let matchedAnchor = null;
    for (const anchor of anchors) {
      if (anchor.innerText == text) {
        matchedAnchor = anchor;
      }
    }
    return matchedAnchor;
  }

  /**
   * STELLAVERSE で繰り返し使う DOM 参照をまとめて取得する。
   * @returns {StellaverseDomRefs}
   */
  function getStellaverseDomRefs() {
    const datetimeElem = document.querySelector(STELLAVERSE_SELECTORS.datetimeElem);
    const targetElem = document.querySelector(STELLAVERSE_SELECTORS.targetElem);
    const tableContainer = document.querySelector(STELLAVERSE_SELECTORS.tableContainer);
    const tableRows = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableRow)) : [];
    const tableHeads = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableHead)) : [];
    const tableCells = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableCell)) : [];
    const anchors = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.anchor)) : [];

    return { datetimeElem, targetElem, tableContainer, tableRows, tableHeads, tableCells, anchors };
  }

  /**
   * Mocha の曲情報テーブル周辺で使う DOM 参照をまとめて取得する。
   * @returns {MochaSongInfoRefs}
   */
  function getMochaSongInfoRefs() {
    const songInfoTable = document.querySelector(MOCHA_SELECTORS.songInfoTable);
    const songInfoBody = document.querySelector(MOCHA_SELECTORS.songInfoBody);
    const songInfoRows = songInfoBody ? Array.from(songInfoBody.children) : [];

    return { songInfoTable, songInfoBody, songInfoRows };
  }

  // ====================================================================================================
  // LR2IR
  //   近年のSPAサイトみたいにページが書き変わらないので処理が単純で良い
  // ====================================================================================================
  /**
   * LR2IR 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function lr2ir() {
    console.info("LR2IRの処理に入りました");

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", async (event) => {
        console.info("🔥 DOMContentLoadedイベントが発火しました");
        await updatePage();
      });
    } else {
      console.info("🔥 DOMContentLoadedイベントは発火済です");
      await updatePage();
    }

    // 曲ページの書き換え処理
    async function updatePage() {
      // 曲ページ以外では何もせず終える。
      if (!location.href.startsWith("http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking")) {
        return;
      }
      console.info("LR2IR曲ページの書き換え処理に入りました");

      let targetbmsid = null;

      // 曲ページ「更新履歴」リンクのGETパラメータからbmsidを取得
      const anchors = Array.from(document.querySelectorAll(LR2IR_SELECTORS.allAnchors));
      const historyAnchor = findAnchorByText(anchors, "更新履歴");
      if (historyAnchor) {
        targetbmsid = new URL(historyAnchor.href).searchParams.get('bmsid');
      }
      // 現在のウィンドウのGETパラメータを取得
      const targetmd5 = new URL(window.location.href).searchParams.get('bmsmd5');

      // ターゲット要素特定
      // アーティスト名用<h2>がある場合は登録曲なので曲名の下を挿入先にする
      let htmlTargetElement = document.querySelector(LR2IR_SELECTORS.registeredSongHeading);
      let htmlTargetDest = "afterend";
      // <h2>がない場合は検索窓の下を挿入先にする
      if (!htmlTargetElement) {
        htmlTargetElement = document.querySelector(LR2IR_SELECTORS.search);
      }
      // MD5 か BMSID が取れていて、差し込み先も決まっている場合だけ拡張パネルを描画する。
      if ((targetmd5 || targetbmsid) && htmlTargetElement && htmlTargetDest) {
        const pageContext = {
          identifiers: { md5: targetmd5, sha256: null, bmsid: targetbmsid },
          insertion: { element: htmlTargetElement, position: htmlTargetDest },
          theme: { dctx: "#333", dcbk: "#fff", hdtx: "#eef", hdbk: "#669" }
        };
        // テンプレートを挿入
        const container = insertBmsDataTemplate(pageContext);
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData(pageContext, container)) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
        } else {
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
          // 外部 API が落ちていても、最低限 MD5 と譜面ビューアーへの導線は残す。
          const tbody = document.querySelector(LR2IR_SELECTORS.registeredSongFallbackBody)
          if (tbody) {
            // IR登録済み曲の場合
            const md5Row = document.createElement("tr");
            md5Row.innerHTML = `<th>MD5</th><td colspan="7">${targetmd5}</td>`;
            const viewerRow = document.createElement("tr");
            viewerRow.innerHTML = `<th>VIEWER</th><td colspan="7"><a href="https://bms-score-viewer.pages.dev/view?md5=${targetmd5}">https://bms-score-viewer.pages.dev/view?md5=${targetmd5}</a></td>`;
            tbody.appendChild(md5Row);
            tbody.appendChild(viewerRow);
          } else {
            // IR未登録の場合
            const table_element = document.createElement("table");
            table_element.innerHTML = `<tr><th>MD5</th><td>${targetmd5}</td></tr><tr><th>VIEWER</th><td><a href="https://bms-score-viewer.pages.dev/view?md5=${targetmd5}">https://bms-score-viewer.pages.dev/view?md5=${targetmd5}</a></td></tr>`;
            const searchElement = document.querySelector(LR2IR_SELECTORS.search);
            if (searchElement) {
              searchElement.after(table_element);
            } else {
              console.error("❌ LR2IRの検索フォームが見つかりませんでした");
            }
          }
        }
      } else {
        console.info("❌ LR2IRのページ書き換えはスキップされました。MD5/BMSIDかターゲット要素が取得できませんでした");
      }
    }
  }

  // ====================================================================================================
  // STELLAVERSE
  //   ReactのSPAみたいな感じなのでDOMの監視に対策が必要
  // ====================================================================================================
  /**
   * STELLAVERSE 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function stellaverse() {
    console.info("STELLAVERSEの処理に入りました");
    watchSpaPage({
      siteName: "STELLAVERSE",
      matchUrl: (url) => url.startsWith("https://stellabms.xyz/thread/"),
      updatePage
    });

    // ==================================================================================================
    // スレッドページの書き換え処理
    async function updatePage({ markUpdated }) {
      // スレッドページ以外では何もせず終える。
      if (!location.href.startsWith("https://stellabms.xyz/thread/")) {
        return;
      }
      console.info("スレッドページの書き換え処理に入りました");
      // 投稿日時、経過時間の差し込み先、譜面情報テーブルをまとめて取得する。
      const stellaverseRefs = getStellaverseDomRefs();
      const { datetimeElem, targetElem, tableContainer, anchors } = stellaverseRefs;

      if (!datetimeElem || !targetElem || !tableContainer) { console.info("処理対象エレメントのいずれかが見つかりません"); return; }

      const match = datetimeElem.textContent.trim().match(/@ (\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
      if (!match) { console.info("❌ 投稿日時がパースできませんでした"); return; }

      const postedDate = new Date(match[1].replace(/\//g, '-'));
      const now = new Date();
      const diffMs = now - postedDate;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      const elapsedText = `Elapsed time: ${diffDays} days ${String(diffHours).padStart(2, '0')} hours ${String(diffMinutes).padStart(2, '0')} minutes`;
      const elapsedTimeElement = document.createElement('p');
      elapsedTimeElement.textContent = elapsedText;

      targetElem.insertAdjacentElement('afterend', elapsedTimeElement);
      markUpdated(); // 経過時間表示が済めば、その URL での再実行は不要になる。

      // 先頭行を消した後も従来どおりの index を保つため、削除前配列を「削除後相当」に切り直して使う。
      const firstTableRow = stellaverseRefs.tableRows[0];
      if (!firstTableRow) { console.info("処理対象のテーブル行が見つかりません"); return; }
      const removedHeadCount = firstTableRow.querySelectorAll(STELLAVERSE_SELECTORS.tableHead).length;
      const removedCellCount = firstTableRow.querySelectorAll(STELLAVERSE_SELECTORS.tableCell).length;
      const tableRows = stellaverseRefs.tableRows.slice(1);
      const tableHeads = stellaverseRefs.tableHeads.slice(removedHeadCount);
      const tableCells = stellaverseRefs.tableCells.slice(removedCellCount);
      firstTableRow.remove();
      // テーブルをツメツメにして高さを削減
      tableRows.forEach(el => {
        el.style.borderBottomWidth = '0';
      });
      tableHeads.forEach(el => {
        el.style.height = '1.2rem';
        el.style.lineHeight = '100%';
        el.style.padding = '0.1rem 0.2rem';
        el.style.fontFamily = '"Inconsolata"';
      });
      tableCells.forEach(el => {
        el.style.lineHeight = '100%';
        el.style.padding = '0.1rem 0.2rem';
        el.style.fontFamily = '"Inconsolata"';
      });
      // TOTAL と NOTES は後段の補正計算でも使うため、削除後相当の配列から拾う。
      const totalCellElement = tableCells[STELLAVERSE_INDEXES.totalCell];
      const notesCellElement = tableCells[STELLAVERSE_INDEXES.notesCell];
      if (!totalCellElement || !notesCellElement) { console.info("TOTALかNOTESのセルが見つかりません"); return; }
      const total = Number(totalCellElement.textContent.trim());
      const notes = Number(notesCellElement.textContent.trim());

      // #TOTAL 未定義時だけ、比較用として beatoraja/LR2 相当値をセルへ併記する。
      let beatorajaTotal;
      let lr2Total;
      if (total === 0) {
        beatorajaTotal = (Math.max(260.0, 7.605 * notes / (0.01 * notes + 6.5)));
        lr2Total = 160.0 + (notes + Math.min(Math.max(notes - 400, 0), 200)) * 0.16;
        totalCellElement.textContent = `0, so #TOTAL is undefined. beatoraja is ${beatorajaTotal.toFixed(2)}(${(beatorajaTotal / notes).toFixed(3)}T/N), LR2 is ${lr2Total.toFixed(2)}(${(lr2Total / notes).toFixed(3)}T/N).`;
      }

      // テーブル内リンクから MD5 と Bokutachi への導線を拾う。
      let bokutachi;
      let targetmd5 = null;
      for (const a of anchors) {
        if (a.textContent.trim() === 'LR2IR') {
          const href = a.href;
          const match = href.match(/[a-f0-9]{32}$/i); // 末尾の32桁16進数
          if (match) {
            targetmd5 = match[0];
          }
        } else if (a.textContent.trim() === 'Bokutachi') {
          bokutachi = a.href;
        }
        // 必要な 2 本が揃ったら探索を打ち切る。
        if (targetmd5 && bokutachi) break;
      }
      // MD5 が分かった場合だけ外部 API を引いて拡張情報を挿入する。
      if (targetmd5) {
        // ダークモード判定
        const isDarkMode = document.documentElement.style.getPropertyValue("color-scheme").includes("dark");
        const pageContext = {
          identifiers: { md5: targetmd5, sha256: null, bmsid: null },
          insertion: { element: tableContainer, position: "beforeend" },
          theme: isDarkMode
            ? { dctx: "#fafafa", dcbk: "#09090b", hdtx: "#fafafa", hdbk: "#18191d" }
            : { dctx: "#09090b", dcbk: "#ffffff", hdtx: "#09090b", hdbk: "#e9eaed" }
        };
        // テンプレートを挿入
        const container = insertBmsDataTemplate(pageContext);
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData(pageContext, container)) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
          // STELLAVERSE 側と完全に重複する行だけを消し、補助情報のある行は残す。
          const bokutachiLink = container.querySelector("#bd-bokutachi");
          if (bokutachi && bokutachiLink) {
            bokutachiLink.setAttribute("href", `${bokutachi}`);
            bokutachiLink.setAttribute("style", "display: inline;");
          }
          const rowsToRemoveAfterSuccess = STELLAVERSE_INDEXES.removeRowsAfterSuccess
            .map(index => tableRows[index])
            .filter(Boolean);
          rowsToRemoveAfterSuccess.forEach(row => {
            row.remove();
          });
        } else {
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
        }
      } else {
        console.info("❌ STELLAVERSEのページ書き換えはスキップされました。MD5が取得できませんでした");
      }
    }
  }

  // ====================================================================================================
  // MinIR
  //   STELLAVERSEと同様のアプローチで問題なし
  // ====================================================================================================
  /**
   * MinIR 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function minir() {
    console.info("MinIRの処理に入りました");
    watchSpaPage({
      siteName: "MinIR",
      matchUrl: (url) => url.startsWith("https://www.gaftalk.com/minir/#/viewer/song/"),
      updatePage,
      isSettled: () => Boolean(document.getElementById("bmsdata-container"))
    });

    // ==================================================================================================
    // 曲ページの書き換え処理
    async function updatePage({ markUpdated }) {
      // 曲ページ以外では何もせず終える。
      if (!location.href.startsWith("https://www.gaftalk.com/minir/#/viewer/song/")) {
        return;
      }
      console.info("MinIRの曲ページ書き換え処理に入りました");
      // sha256抽出
      const url = window.location.href;
      let targetsha256 = null;
      const match = url.match(/\/song\/([a-f0-9]{64})\/\d/);
      if (match) {
        targetsha256 = match[1];
      }
      // ターゲット要素特定
      const htmlTargetElement = document.querySelector(MINIR_SELECTORS.targetElement);
      const htmlTargetDest = "beforebegin";
      // LN/CN/HCN 切り替え時の二重挿入を避けるため、未挿入時だけ描画する。
      if (targetsha256 && htmlTargetElement && htmlTargetDest && !document.getElementById("bmsdata-container")) {
        const pageContext = {
          identifiers: { md5: null, sha256: targetsha256, bmsid: null },
          insertion: { element: htmlTargetElement, position: htmlTargetDest },
          theme: { dctx: "#1A202C", dcbk: "#ffffff", hdtx: "#000000DE", hdbk: "#f1f1f1" }
        };
        // テンプレートを挿入
        const container = insertBmsDataTemplate(pageContext);
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData(pageContext, container)) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
          markUpdated();
        } else {
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
        }
      } else {
        console.info("❌ MinIRのページ書き換えはスキップされました。既にbmsdataが挿入済みか、ターゲット要素が見つかりませんでした");
      }
    }
  }

  // ====================================================================================================
  // Mocha-Repository
  //   LR2IRと同様のアプローチで問題なし
  // ====================================================================================================
  /**
   * Mocha 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function mocha() {
    console.info("Mochaの処理に入りました");

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", async (event) => {
        console.info("🔥 DOMContentLoadedイベントが発火しました");
        await updatePage();
      });
    } else {
      console.info("🔥 DOMContentLoadedイベントは発火済です");
      await updatePage();
    }

    // ==================================================================================================
    // 曲ページの書き換え処理
    async function updatePage() {
      console.info("Mochaの曲ページ書き換え処理に入りました");

      // sha256抽出
      const url = window.location.href;
      let targetsha256 = null;
      const match = url.match(/sha256=([a-f0-9]{64})/);
      if (match) {
        targetsha256 = match[1];
      }

      // ターゲット要素特定
      // 曲情報テーブルの下に挿入する
      const { songInfoTable, songInfoBody, songInfoRows } = getMochaSongInfoRefs();
      let htmlTargetElement = songInfoTable;
      let htmlTargetDest = "afterend";
      // 曲情報テーブルがない場合はフォーム(Score [Update]のところ)の上に挿入する
      if (!htmlTargetElement) {
        htmlTargetElement = document.querySelector(MOCHA_SELECTORS.form);
        htmlTargetDest = "beforebegin";
      }

      // sha256 と差し込み先が取れた場合だけ拡張パネルを描画する。
      if (targetsha256 && htmlTargetElement && htmlTargetDest) {
        const pageContext = {
          identifiers: { md5: null, sha256: targetsha256, bmsid: null },
          insertion: { element: htmlTargetElement, position: htmlTargetDest },
          theme: { dctx: "#ffffff", dcbk: "#333333", hdtx: "#ffffff", hdbk: "#666666" }
        };
        // テンプレートを挿入
        const container = insertBmsDataTemplate(pageContext);
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData(pageContext, container)) {
          // 最後まで置換がうまく行った場合
          if (songInfoTable) {
            // Mocha 側と完全に重複する行だけを落とし、残す行の並びは変えない。
            const rowsToRemove = [
              songInfoRows[MOCHA_ROW_INDEXES.otherIr],
              songInfoRows[MOCHA_ROW_INDEXES.bpm],
              songInfoRows[MOCHA_ROW_INDEXES.judgerank],
              songInfoRows[MOCHA_ROW_INDEXES.total],
              songInfoRows[MOCHA_ROW_INDEXES.totalNotes],
              songInfoRows[MOCHA_ROW_INDEXES.mode]
            ].filter(Boolean);
            rowsToRemove.forEach(row => {
              row.remove();
            });
          }
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
        } else {
          // 外部 API が落ちていても、Mocha 内の LR2IR リンクから拾える情報だけは補う。
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
          // LR2IRリンク要素取得
          const otherIrRow = songInfoRows[MOCHA_ROW_INDEXES.otherIr];
          const otherIrLinks = otherIrRow ? Array.from(otherIrRow.querySelectorAll(MOCHA_SELECTORS.anchor)) : [];
          const lr2irLink = otherIrLinks[MOCHA_LINK_INDEXES.lr2irInOtherIrRow];
          if (lr2irLink) {
            // hrefからmd5抽出
            const href = lr2irLink.getAttribute("href");
            const md5Match = href ? href.match(/bmsmd5=([0-9a-fA-F]{32})/) : null;
            if (!md5Match) {
              console.error("❌ LR2IRリンクからMD5が取得できませんでした");
              return;
            }
            const md5 = md5Match[1];

            // フォールバック表示は既存テーブルの末尾へ追加する。
            const sha256Row = document.createElement("tr");
            sha256Row.setAttribute("height", "20");
            sha256Row.className = "ranking_header";
            sha256Row.innerHTML = `<td class="songinfo_header">Sha256</td><td class="songinfo_content">${targetsha256}</td>`;

            const md5Row = document.createElement("tr");
            md5Row.setAttribute("height", "20");
            md5Row.className = "ranking_header";
            md5Row.innerHTML = `<td class="songinfo_header">Md5</td><td class="songinfo_content">${md5}</td>`;

            if (songInfoBody) {
              songInfoBody.appendChild(sha256Row);
              songInfoBody.appendChild(md5Row);
            } else {
              console.error("❌ Mochaの曲情報テーブル本文が見つかりませんでした");
              return;
            }

            // Viewer は即時、BMS SEARCH は存在確認後に既存の Other IR 行へ後追いで追記する。
            const targetTd = otherIrRow.querySelector(MOCHA_SELECTORS.songInfoContentCell);
            if (targetTd) {
              const viewerLink = document.createElement("a");
              viewerLink.href = `https://bms-score-viewer.pages.dev/view?md5=${md5}`;
              viewerLink.target = "_blank";
              viewerLink.textContent = "Viewer";
              targetTd.appendChild(document.createTextNode("　"));
              targetTd.appendChild(viewerLink);
              void appendBmsSearchLinkIfAvailable(targetTd, targetsha256);
            } else {
              console.error("❌ Mochaのリンク追加先セルが見つかりませんでした");
            }
          } else {
            console.error("❌ LR2IRリンクが見つかりませんでした");
          }
        }
      } else {
        console.info("❌ Mochaのページ書き換えはスキップされました。sha256かターゲット要素が取得できませんでした");
      }
    }
  }

  // ====================================================================================================
  // BMSデータテンプレート HTML + CSS
  //   template 要素からパネルを生成し、サイトごとの差し込み先へ挿入する
  // ====================================================================================================
  /**
   * 拡張パネル用 CSS を一度だけ注入する。
   * @returns {void}
   */
  function ensureBmsDataStyleOnce() {
    if (document.getElementById(BMSDATA_STYLE_ID)) {
      return;
    }

    const styleElement = document.createElement("style");
    styleElement.id = BMSDATA_STYLE_ID;
    styleElement.textContent = BMSDATA_CSS;
    document.head.appendChild(styleElement);
  }

  /**
   * ページコンテキストに応じたテーマを適用した空パネルを挿入する。
   * @param {PageContext} pageContext
   * @returns {HTMLElement}
   */
  function insertBmsDataTemplate(pageContext) {
    const { element, position } = pageContext.insertion;
    const { dctx, dcbk, hdtx, hdbk } = pageContext.theme;
    ensureBmsDataStyleOnce();
    const template = document.createElement("template");
    template.innerHTML = BMSDATA_TEMPLATE_HTML.trim();
    const container = template.content.firstElementChild;
    container.style.setProperty("--bd-dctx", dctx);
    container.style.setProperty("--bd-dcbk", dcbk);
    container.style.setProperty("--bd-hdtx", hdtx);
    container.style.setProperty("--bd-hdbk", hdbk);
    element.insertAdjacentElement(position, container);
    return container;
  }

  /**
   * 外部データ取得から描画、グラフ描画までのパイプラインを実行する。
   * @param {PageContext} pageContext
   * @param {HTMLElement} container
   * @returns {Promise<boolean>}
   */
  async function insertBmsData(pageContext, container) {
    // 取得失敗時は差し込んだ空パネルを片付けて終了する。
    const rawRecord = await fetchBmsRecord(pageContext);
    if (!rawRecord) {
      container.remove();
      return false;
    }

    const normalizedRecord = normalizeBmsRecord(rawRecord);
    renderBmsData(container, normalizedRecord);

    const graphHost = container.querySelector("#bd-graph");
    const canvas = container.querySelector("#bd-graph-canvas");
    const tooltip = container.querySelector("#bd-graph-tooltip");
    const pinInput = container.querySelector("#bd-scoreviewer-pin-input");
    if (graphHost && canvas && tooltip && pinInput) {
      let viewerManager = null;
      try {
        viewerManager = getScoreViewerManager();
      } catch (error) {
        console.error("Score viewer manager initialization failed:", error);
      }

      const graphController = drawDistributionGraph(
        graphHost,
        canvas,
        tooltip,
        pinInput,
        normalizedRecord,
        viewerManager
          ? {
            onHoverTime: (timeSec) => viewerManager.handleGraphHover(normalizedRecord, timeSec),
            onHoverLeave: () => viewerManager.handleGraphHoverLeave(normalizedRecord),
            onSelectTime: (timeSec) => viewerManager.handleGraphClick(normalizedRecord, timeSec),
            onPinChange: (nextPinned) => viewerManager.handlePinChange(normalizedRecord, nextPinned),
          }
          : {},
      );
      if (viewerManager) {
        viewerManager.attachGraphController(graphController, normalizedRecord);
        if (normalizedRecord.sha256) {
          void viewerManager.prefetch(normalizedRecord);
        }
      }
    } else {
      console.warn("グラフ描画用エレメントが見つかりませんでした");
    }
    if (normalizedRecord.sha256) {
      // BMS SEARCH は補助リンクなので、グラフ描画後に非同期で後追い表示する。
      void renderBmsSearchLinkIfAvailable(container, normalizedRecord.sha256);
    }

    return true;
  }

  /**
   * 優先順位付きの識別子を使って外部 API から生データを取得する。
   * @param {PageContext} pageContext
   * @returns {Promise<Object.<string, string>|false>}
   */
  async function fetchBmsRecord(pageContext) {
    const { md5, sha256, bmsid } = pageContext.identifiers;
    const lookupKey = md5 ?? sha256 ?? bmsid;
    if (!lookupKey) {
      return false;
    }

    const url = `https://bms.howan.jp/${lookupKey}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const text = await response.text();
      const values = text.split('\x1f');
      if (values.length !== BMSDATA_COLUMNS.length) {
        throw new Error(`列数が一致しません（columns=${BMSDATA_COLUMNS.length}, values=${values.length}）`);
      }

      const record = {};
      for (let i = 0; i < BMSDATA_COLUMNS.length; i++) {
        record[BMSDATA_COLUMNS[i]] = values[i];
      }
      return record;
    } catch (error) {
      console.error("Fetch or parse error:", error);
      return false;
    }
  }

  /**
   * BMS SEARCH API で SHA256 に対応する譜面が存在するか確認する。
   * @param {string} sha256
   * @returns {Promise<boolean>}
   */
  async function checkBmsSearchPatternExists(sha256) {
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

  /**
   * BMS SEARCH に譜面が存在する場合だけリンクを表示する。
   * @param {HTMLElement} container
   * @param {string} sha256
   * @returns {Promise<void>}
   */
  async function renderBmsSearchLinkIfAvailable(container, sha256) {
    try {
      if (!sha256) {
        return;
      }
      if (!await checkBmsSearchPatternExists(sha256)) {
        return;
      }
      if (!container.isConnected) {
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

  /**
   * Mocha フォールバックの既存セルへ BMS SEARCH リンクを後追いで追加する。
   * @param {HTMLElement} targetTd
   * @param {string|null} sha256
   * @returns {Promise<void>}
   */
  async function appendBmsSearchLinkIfAvailable(targetTd, sha256) {
    try {
      if (!sha256) {
        return;
      }
      if (!await checkBmsSearchPatternExists(sha256)) {
        return;
      }
      if (!targetTd.isConnected) {
        return;
      }

      const href = `${BMSSEARCH_PATTERN_PAGE_BASE_URL}/${sha256}`;
      const existingLink = Array.from(targetTd.querySelectorAll("a")).find(anchor => anchor.href === href);
      if (existingLink) {
        return;
      }

      const bmsSearchLink = document.createElement("a");
      bmsSearchLink.href = href;
      bmsSearchLink.target = "_blank";
      bmsSearchLink.textContent = "BMS SEARCH";
      targetTd.appendChild(document.createTextNode("　"));
      targetTd.appendChild(bmsSearchLink);
    } catch (error) {
      console.warn("MochaフォールバックへのBMS SEARCHリンク追加に失敗しました:", error);
    }
  }

  /**
   * 外部 API の生データを描画しやすい形へ正規化する。
   * @param {Object.<string, string>} rawRecord
   * @returns {NormalizedBmsRecord}
   */
  function normalizeBmsRecord(rawRecord) {
    const md5 = rawRecord.md5;
    const sha256 = rawRecord.sha256;
    const maxbpm = Number(rawRecord.maxbpm);
    const minbpm = Number(rawRecord.minbpm);
    const length = Number(rawRecord.length);
    const mode = Number(rawRecord.mode);
    const judge = Number(rawRecord.judge);
    const feature = Number(rawRecord.feature);
    const notes = Number(rawRecord.notes);
    const n = Number(rawRecord.n);
    const ln = Number(rawRecord.ln);
    const s = Number(rawRecord.s);
    const ls = Number(rawRecord.ls);
    const total = Number(rawRecord.total);
    const density = Number(rawRecord.density);
    const peakdensity = Number(rawRecord.peakdensity);
    const enddensity = Number(rawRecord.enddensity);
    const mainbpm = Number(rawRecord.mainbpm);
    const stella = Number(rawRecord.stella);
    const bmsid = Number(rawRecord.bmsid);
    const distribution = rawRecord.distribution;
    const speedchange = rawRecord.speedchange;
    const featuresStr = BMS_FEATURE_NAMES
      .filter((name, index) => (feature & (1 << index)) !== 0)
      .join(", ");

    return {
      md5,
      sha256,
      maxbpm,
      minbpm,
      mode,
      judge,
      density,
      peakdensity,
      enddensity,
      mainbpm,
      stella,
      bmsid,
      lengthMs: length,
      durationSec: length / 1000,
      durationStr: `${(length / 1000).toFixed(2)} s`,
      notesStr: `${notes} (N:${n}, LN:${ln}, SCR:${s}, LNSCR:${ls})`,
      totalStr: `${total % 1 == 0 ? Math.round(total) : total} (${(total / notes).toFixed(3)} T/N)`,
      featuresStr,
      distribution,
      distributionSegments: parseDistributionSegments(distribution),
      speedchange,
      speedChangePoints: parseSpeedChange(speedchange),
      lanenotesArr: parseLaneNotes(mode, rawRecord.lanenotes),
      tables: parseTables(rawRecord.tables)
    };
  }

  /**
   * レーン別ノーツ数を mode ごとの scratch 位置に合わせて並べ替える。
   * @param {number} mode
   * @param {string} lanenotes
   * @returns {Array<[number, number, number, number]>}
   */
  function parseLaneNotes(mode, lanenotes) {
    const tokens = lanenotes.split(',').map(Number);
    let laneCount = mode;
    if (mode === 7) laneCount = 8;
    else if (mode === 14) laneCount = 16;
    else if (mode === 5) laneCount = 6;
    else if (mode === 10) laneCount = 12;

    const lanenotesArr = [];
    for (let i = 0; i < laneCount; i++) {
      const baseIndex = i * 3;
      lanenotesArr.push([
        tokens[baseIndex] ?? 0,
        tokens[baseIndex + 1] ?? 0,
        tokens[baseIndex + 2] ?? 0,
        (tokens[baseIndex] ?? 0) + (tokens[baseIndex + 1] ?? 0)
      ]);
    }

    // 7/14 鍵と 5/10 鍵は scratch を先頭へ寄せ、描画用のレーン並びへ合わせる。
    if (mode === 7 || mode === 14) {
      const move = lanenotesArr.splice(7, 1)[0];
      lanenotesArr.unshift(move);
    } else if (mode === 5 || mode === 10) {
      const move = lanenotesArr.splice(5, 1)[0];
      lanenotesArr.unshift(move);
    }

    return lanenotesArr;
  }

  /**
   * 表データ文字列を配列へ変換し、空や不正値は空配列へ丸める。
   * @param {string} tablesRaw
   * @returns {string[]}
   */
  function parseTables(tablesRaw) {
    try {
      return JSON.parse(tablesRaw);
    } catch {
      return [];
    }
  }

  /**
   * 正規化済みデータをパネル本体へ反映する。
   * @param {HTMLElement} container
   * @param {NormalizedBmsRecord} normalizedRecord
   * @returns {void}
   */
  function renderBmsData(container, normalizedRecord) {
    const getById = (id) => container.querySelector(`#${id}`);

    // リンク、基本情報、追加リストの順で埋め、最後にパネル全体を表示する。
    renderLinks(container, normalizedRecord);
    getById("bd-sha256").textContent = normalizedRecord.sha256;
    getById("bd-md5").textContent = normalizedRecord.md5;
    getById("bd-bmsid").textContent = normalizedRecord.bmsid ? normalizedRecord.bmsid : "Undefined";
    getById("bd-mainbpm").textContent = normalizedRecord.mainbpm % 1 == 0 ? Math.round(normalizedRecord.mainbpm) : normalizedRecord.mainbpm;
    getById("bd-maxbpm").textContent = normalizedRecord.maxbpm % 1 == 0 ? Math.round(normalizedRecord.maxbpm) : normalizedRecord.maxbpm;
    getById("bd-minbpm").textContent = normalizedRecord.minbpm % 1 == 0 ? Math.round(normalizedRecord.minbpm) : normalizedRecord.minbpm;
    getById("bd-mode").textContent = normalizedRecord.mode;
    getById("bd-feature").textContent = normalizedRecord.featuresStr;
    getById("bd-judgerank").textContent = normalizedRecord.judge;
    getById("bd-notes").textContent = normalizedRecord.notesStr;
    getById("bd-total").textContent = normalizedRecord.totalStr;
    getById("bd-avgdensity").textContent = normalizedRecord.density.toFixed(3);
    getById("bd-peakdensity").textContent = normalizedRecord.peakdensity.toFixed(0);
    getById("bd-enddensity").textContent = normalizedRecord.enddensity;
    getById("bd-duration").textContent = normalizedRecord.durationStr;
    renderLaneNotes(container, normalizedRecord);
    renderTables(container, normalizedRecord);
    container.style.display = "block";
  }

  /**
   * 利用可能な外部リンクだけを表示状態にする。
   * @param {HTMLElement} container
   * @param {NormalizedBmsRecord} normalizedRecord
   * @returns {void}
   */
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

  function showLink(linkElement, href) {
    if (!linkElement) {
      return;
    }
    linkElement.setAttribute("href", href);
    linkElement.setAttribute("style", "display: inline;");
  }

  /**
   * mode に応じた色分けルールでレーン別ノーツ数を描画する。
   * @param {HTMLElement} container
   * @param {NormalizedBmsRecord} normalizedRecord
   * @returns {void}
   */
  function renderLaneNotes(container, normalizedRecord) {
    let modeprefix = "";
    if (normalizedRecord.mode === 5 || normalizedRecord.mode === 10) {
      modeprefix = "g";
    } else if (normalizedRecord.mode === 9) {
      modeprefix = "p";
    }

    const lanenotesContainer = container.querySelector("#bd-lanenotes-div");
    if (!lanenotesContainer) {
      console.warn("bd-lanenotes-divが見つかりませんでした");
      return;
    }

    // 7/14/9/5/10 鍵は専用配色、それ以外は白鍵盤扱いで表示する。
    if (normalizedRecord.mode === 7 || normalizedRecord.mode === 14 || normalizedRecord.mode === 9 || normalizedRecord.mode === 5 || normalizedRecord.mode === 10) {
      for (let i = 0; i < normalizedRecord.lanenotesArr.length; i++) {
        const span = document.createElement("span");
        span.className = "bd-lanenote";
        span.setAttribute("lane", `${modeprefix}${i}`);
        span.textContent = normalizedRecord.lanenotesArr[i][3];
        lanenotesContainer.appendChild(span);
      }
    } else {
      for (let i = 0; i < normalizedRecord.lanenotesArr.length; i++) {
        const span = document.createElement("span");
        span.className = "bd-lanenote";
        span.setAttribute("lane", "1");
        span.setAttribute("style", "margin-right: 0.1rem; padding: 0.1rem 0.1rem;");
        span.textContent = normalizedRecord.lanenotesArr[i][3];
        lanenotesContainer.appendChild(span);
      }
    }
  }

  /**
   * 収録表一覧をリストへ追加する。
   * @param {HTMLElement} container
   * @param {NormalizedBmsRecord} normalizedRecord
   * @returns {void}
   */
  function renderTables(container, normalizedRecord) {
    const ul = container.querySelector("#bd-tables-ul");
    if (!ul) {
      console.warn("bd-tables-ulが見つかりませんでした");
      return;
    }
    normalizedRecord.tables.forEach(text => {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
  }

  // グラフ utility: distribution を 1 秒ごとの配列へ展開し、BPM 推移と tooltip 表示に再利用する。
  function parseDistributionSegments(distribution) {
    const noteTypes = 7;
    const data = distribution.startsWith("#") ? distribution.slice(1) : distribution;
    const segments = [];

    for (let i = 0; i < data.length; i += 14) {
      const chunk = data.slice(i, i + 14);
      if (chunk.length === 14) {
        const noteCounts = [];
        for (let j = 0; j < noteTypes; j++) {
          const hex36 = chunk.slice(j * 2, j * 2 + 2);
          const count = parseInt(hex36, 36) || 0;
          noteCounts.push(count);
        }
        segments.push(noteCounts);
      }
    }

    return segments;
  }

  function parseSpeedChange(raw) {
    const arr = raw.split(',').map(Number);
    const result = [];
    for (let i = 0; i < arr.length; i += 2) {
      result.push([arr[i], arr[i + 1]]);
    }
    return result;
  }

  function logScaleY(bpm, mainBPM, minValue, maxValue, minLog, maxLog, canvasHeight) {
    const ratio = Math.min(Math.max(bpm / mainBPM, minValue), maxValue);
    const logVal = Math.log10(ratio);
    const t = (logVal - minLog) / (maxLog - minLog);
    return canvasHeight - Math.round(t * (canvasHeight - 2));
  }

  function timeToX(t, timeLength, canvasWidth) {
    return Math.round((t / timeLength * 0.001) * canvasWidth) + 1;
  }

  /**
   * ノーツ分布と BPM 推移を同じ canvas 上へ描画する。
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} tooltip
   * @param {NormalizedBmsRecord} normalizedRecord
   * @returns {void}
   */
  function drawDistributionGraphLegacy(canvas, tooltip, normalizedRecord) {
    const rectWidth = 4;
    const rectHeight = 2;
    const spacing = 1;
    const minValue = 1 / 8;
    const maxValue = 8;
    const minLog = Math.log10(minValue);
    const maxLog = Math.log10(maxValue);
    // distribution は 14 文字で 1 秒分、7 種類のノーツ数を base36 で持つ。
    const segments = parseDistributionSegments(normalizedRecord.distribution);
    const parsedSpeedchange = parseSpeedChange(normalizedRecord.speedchange);
    const timeLength = segments.length;
    const maxNotesPerSecond = Math.max(40, Math.min(normalizedRecord.peakdensity, 100));
    const canvasWidth = timeLength * (rectWidth + spacing);
    const canvasHeight = maxNotesPerSecond * (rectHeight + spacing) - spacing;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#202080";
    ctx.lineWidth = 1;
    for (let i = 5; i < maxNotesPerSecond; i += 5) {
      const y = canvasHeight - (i * (rectHeight + spacing) - 0.5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#777";
    for (let t = 10; t < timeLength; t += 10) {
      const x = t * (rectWidth + spacing) - 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }

    segments.forEach((counts, timeIndex) => {
      let yOffset = 0;
      for (let typeIndex = 0; typeIndex < DISTRIBUTION_NOTE_COLORS.length; typeIndex++) {
        const color = DISTRIBUTION_NOTE_COLORS[typeIndex];
        const count = counts[typeIndex];
        for (let i = 0; i < count; i++) {
          const x = timeIndex * (rectWidth + spacing);
          const y = canvasHeight - ((yOffset + 1) * rectHeight + yOffset * spacing);
          if (y < 0) break;
          ctx.fillStyle = color;
          ctx.fillRect(x, y, rectWidth, rectHeight);
          yOffset++;
          if (yOffset >= maxNotesPerSecond) break;
        }
      }
    });

    // BPM 線は main/min/max/stop を色で見分けられるようにしている。
    const bpmLineWidth = 2;
    for (let i = 0; i < parsedSpeedchange.length; i++) {
      const [bpm, time] = parsedSpeedchange[i];
      const x1 = timeToX(time, timeLength, canvasWidth);
      const y1 = logScaleY(bpm, normalizedRecord.mainbpm, minValue, maxValue, minLog, maxLog, canvasHeight) - 1;
      const next = parsedSpeedchange[i + 1];
      const x2 = next ? timeToX(next[1], timeLength, canvasWidth) : canvasWidth;

      let color = "#ffff00";
      if (bpm <= 0) color = "#ff00ff";
      else if (bpm === normalizedRecord.mainbpm) color = "#00ff00";
      else if (bpm === normalizedRecord.minbpm) color = "#0000ff";
      else if (bpm === normalizedRecord.maxbpm) color = "#ff0000";

      ctx.strokeStyle = color;
      ctx.lineWidth = bpmLineWidth;
      ctx.beginPath();
      ctx.moveTo(x1 - 1, y1);
      ctx.lineTo(x2 + 1, y1);
      ctx.stroke();

      if (next) {
        const y2 = logScaleY(next[0], normalizedRecord.mainbpm, minValue, maxValue, minLog, maxLog, canvasHeight) - 1;
        if (Math.abs(y2 - y1) >= 1) {
          ctx.strokeStyle = "rgba(127,127,127,0.5)";
          ctx.lineWidth = bpmLineWidth;
          ctx.beginPath();
          ctx.moveTo(x2, y2 < y1 ? y1 - 1 : y1 + 1);
          ctx.lineTo(x2, y2 < y1 ? y2 + 1 : y2 - 1);
          ctx.stroke();
        }
      }
    }

    // tooltip には時刻、現在 BPM、その 1 秒のノーツ内訳を表示する。
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const timeIndex = Math.floor(mouseX / (rectWidth + spacing));
      if (timeIndex < 0 || timeIndex >= segments.length) {
        tooltip.style.display = "none";
        return;
      }

      let bpmDisplay = 0;
      for (let i = parsedSpeedchange.length - 1; i >= 0; i--) {
        if ((mouseX / (rectWidth + spacing)) * 1000 >= parsedSpeedchange[i][1]) {
          bpmDisplay = parsedSpeedchange[i][0];
          break;
        }
      }

      const counts = segments[timeIndex];
      let total = counts.reduce((a, b) => a + b, 0);
      let html = `${(mouseX / (rectWidth + spacing)).toFixed(1)} sec<br>`;
      html += `BPM: ${bpmDisplay}<br>`;
      html += `Notes: ${total}<br>`;
      counts.forEach((c, i) => {
        if (c > 0) {
          html += `<span style="color: ${DISTRIBUTION_NOTE_COLORS[i]}; background-color: transparent;">■</span> ${c} - ${DISTRIBUTION_NOTE_NAMES[i]}<br>`;
        }
      });
      tooltip.innerHTML = html;
      tooltip.style.left = `${e.clientX + 10}px`;
      tooltip.style.top = `${e.clientY + 10}px`;
      tooltip.style.display = "block";
    };

    canvas.onmouseleave = () => {
      tooltip.style.display = "none";
    };
  }

  function drawDistributionGraph(scrollHost, canvas, tooltip, pinInput, normalizedRecord, handlers = {}) {
    const {
      onHoverTime = () => {},
      onHoverLeave = () => {},
      onSelectTime = () => {},
      onPinChange = () => {},
    } = handlers;

    const state = {
      selectedTimeSec: 0,
      isPinned: false,
    };

    const handleMouseMove = (event) => {
      const timeSec = getGraphHoverTimeSec(event, canvas);
      if (!Number.isFinite(timeSec) || timeSec < 0 || timeSec > normalizedRecord.distributionSegments.length) {
        hideGraphTooltip(tooltip);
        return;
      }
      renderGraphTooltip(tooltip, event, normalizedRecord, timeSec);
      onHoverTime(timeSec);
    };

    const handleMouseLeave = () => {
      hideGraphTooltip(tooltip);
      onHoverLeave();
    };

    const handleClick = (event) => {
      const timeSec = getGraphHoverTimeSec(event, canvas);
      if (!Number.isFinite(timeSec) || timeSec < 0) {
        return;
      }
      onSelectTime(timeSec);
    };

    const handlePinChange = () => {
      onPinChange(Boolean(pinInput.checked));
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);
    pinInput.addEventListener("change", handlePinChange);

    function setSelectedTimeSec(timeSec) {
      state.selectedTimeSec = Number.isFinite(timeSec) ? Math.max(0, timeSec) : 0;
      render();
      syncScrollToSelected();
    }

    function setPinned(nextPinned) {
      state.isPinned = Boolean(nextPinned);
      pinInput.checked = state.isPinned;
    }

    function render() {
      const segments = normalizedRecord.distributionSegments;
      const timeLength = Math.max(segments.length, 1);
      const maxNotesPerSecond = Math.max(40, Math.min(normalizedRecord.peakdensity || 0, 100));
      const canvasWidth = timeLength * (GRAPH_RECT_WIDTH + GRAPH_SPACING);
      const canvasHeight = maxNotesPerSecond * (GRAPH_RECT_HEIGHT + GRAPH_SPACING) - GRAPH_SPACING;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);

      drawGraphHorizontalGrid(context, canvasWidth, canvasHeight, maxNotesPerSecond);
      drawGraphVerticalGrid(context, canvasWidth, canvasHeight, timeLength);
      drawGraphDistributionBars(context, segments, canvasHeight, maxNotesPerSecond);
      drawGraphSpeedChangeLines(context, normalizedRecord, canvasWidth, canvasHeight);
      drawGraphSelectedTimeLine(context, graphTimeToX(state.selectedTimeSec), canvasHeight);
    }

    function syncScrollToSelected() {
      if (!scrollHost) {
        return;
      }
      const x = graphTimeToX(state.selectedTimeSec);
      const maxScrollLeft = Math.max(0, scrollHost.scrollWidth - scrollHost.clientWidth);
      const desiredScrollLeft = clampValue(x - scrollHost.clientWidth / 2, 0, maxScrollLeft);
      if (Math.abs(scrollHost.scrollLeft - desiredScrollLeft) > 8) {
        scrollHost.scrollLeft = desiredScrollLeft;
      }
    }

    function destroy() {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
      pinInput.removeEventListener("change", handlePinChange);
    }

    render();

    return {
      setSelectedTimeSec,
      setPinned,
      destroy,
    };
  }

  function drawGraphHorizontalGrid(context, canvasWidth, canvasHeight, maxNotesPerSecond) {
    context.strokeStyle = "#202080";
    context.lineWidth = 1;
    for (let count = 5; count < maxNotesPerSecond; count += 5) {
      const y = canvasHeight - (count * (GRAPH_RECT_HEIGHT + GRAPH_SPACING) - 0.5);
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvasWidth, y);
      context.stroke();
    }
  }

  function drawGraphVerticalGrid(context, canvasWidth, canvasHeight, timeLength) {
    context.strokeStyle = "#777777";
    context.lineWidth = 1;
    for (let second = 10; second < timeLength; second += 10) {
      const x = second * (GRAPH_RECT_WIDTH + GRAPH_SPACING) - 0.5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvasHeight);
      context.stroke();
    }
  }

  function drawGraphDistributionBars(context, segments, canvasHeight, maxNotesPerSecond) {
    segments.forEach((counts, timeIndex) => {
      let yOffset = 0;
      for (let typeIndex = 0; typeIndex < DISTRIBUTION_NOTE_COLORS.length; typeIndex += 1) {
        const count = counts[typeIndex];
        const color = DISTRIBUTION_NOTE_COLORS[typeIndex];
        for (let index = 0; index < count; index += 1) {
          const x = timeIndex * (GRAPH_RECT_WIDTH + GRAPH_SPACING);
          const y = canvasHeight - ((yOffset + 1) * GRAPH_RECT_HEIGHT + yOffset * GRAPH_SPACING);
          if (y < 0 || yOffset >= maxNotesPerSecond) {
            break;
          }
          context.fillStyle = color;
          context.fillRect(x, y, GRAPH_RECT_WIDTH, GRAPH_RECT_HEIGHT);
          yOffset += 1;
        }
      }
    });
  }

  function drawGraphSpeedChangeLines(context, normalizedRecord, canvasWidth, canvasHeight) {
    const points = normalizedRecord.speedChangePoints;
    for (let index = 0; index < points.length; index += 1) {
      const [bpm, timeMs] = points[index];
      const x1 = graphTimeToX(timeMs / 1000);
      const y1 = graphLogScaleY(bpm, normalizedRecord.mainbpm, canvasHeight) - 1;
      const next = points[index + 1];
      const x2 = next ? graphTimeToX(next[1] / 1000) : canvasWidth;

      let color = "#ffff00";
      if (bpm <= 0) {
        color = "#ff00ff";
      } else if (bpm === normalizedRecord.mainbpm) {
        color = "#00ff00";
      } else if (bpm === normalizedRecord.minbpm) {
        color = "#0000ff";
      } else if (bpm === normalizedRecord.maxbpm) {
        color = "#ff0000";
      }

      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x1 - 1, y1);
      context.lineTo(x2 + 1, y1);
      context.stroke();

      if (next) {
        const y2 = graphLogScaleY(next[0], normalizedRecord.mainbpm, canvasHeight) - 1;
        if (Math.abs(y2 - y1) >= 1) {
          context.strokeStyle = "rgba(127, 127, 127, 0.5)";
          context.beginPath();
          context.moveTo(x2, y2 < y1 ? y1 - 1 : y1 + 1);
          context.lineTo(x2, y2 < y1 ? y2 + 1 : y2 - 1);
          context.stroke();
        }
      }
    }
  }

  function drawGraphSelectedTimeLine(context, x, canvasHeight) {
    context.save();
    context.strokeStyle = "#ff2c2c";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, canvasHeight);
    context.stroke();
    context.restore();
  }

  function renderGraphTooltip(tooltip, event, normalizedRecord, timeSec) {
    const timeIndex = Math.floor(timeSec);
    const counts = normalizedRecord.distributionSegments[timeIndex] ?? Array.from({ length: 7 }, () => 0);
    let bpmDisplay = 0;
    for (let index = normalizedRecord.speedChangePoints.length - 1; index >= 0; index -= 1) {
      if (timeSec * 1000 >= normalizedRecord.speedChangePoints[index][1]) {
        bpmDisplay = normalizedRecord.speedChangePoints[index][0];
        break;
      }
    }

    let html = `${timeSec.toFixed(1)} sec<br>`;
    html += `BPM: ${bpmDisplay}<br>`;
    html += `Notes: ${counts.reduce((sum, count) => sum + count, 0)}<br>`;
    counts.forEach((count, index) => {
      if (count > 0) {
        html += `<span style="color: ${DISTRIBUTION_NOTE_COLORS[index]}; background-color: transparent;">■</span> ${count} - ${DISTRIBUTION_NOTE_NAMES[index]}<br>`;
      }
    });

    tooltip.innerHTML = html;
    tooltip.style.left = `${event.clientX + 10}px`;
    tooltip.style.top = `${event.clientY + 10}px`;
    tooltip.style.display = "block";
  }

  function hideGraphTooltip(tooltip) {
    tooltip.style.display = "none";
  }

  function getGraphHoverTimeSec(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    return mouseX / (GRAPH_RECT_WIDTH + GRAPH_SPACING);
  }

  function graphLogScaleY(bpm, mainBpm, canvasHeight) {
    const ratio = Math.min(Math.max(bpm / mainBpm, GRAPH_MIN_VALUE), GRAPH_MAX_VALUE);
    const logValue = Math.log10(ratio);
    const t = (logValue - GRAPH_MIN_LOG) / (GRAPH_MAX_LOG - GRAPH_MIN_LOG);
    return canvasHeight - Math.round(t * (canvasHeight - 2));
  }

  function graphTimeToX(timeSec) {
    return Math.round(timeSec * (GRAPH_RECT_WIDTH + GRAPH_SPACING)) + 1;
  }

  async function ensureScoreLoaderContext() {
    if (scoreLoaderContextPromise) {
      return scoreLoaderContextPromise;
    }

    const moduleUrl = `${SCORE_PARSER_BASE_URL}/v${SCORE_PARSER_VERSION}/score_loader.js`;
    scoreLoaderContextPromise = import(moduleUrl)
      .then((module) => ({
        moduleUrl,
        loader: module.createScoreLoader({
          scoreBaseUrl: SCORE_BASE_URL,
        }),
      }))
      .catch((error) => {
        scoreLoaderContextPromise = null;
        throw error;
      });

    return scoreLoaderContextPromise;
  }

  function getScoreViewerManager() {
    if (!scoreViewerManager) {
      scoreViewerManager = createScoreViewerManager();
    }
    return scoreViewerManager;
  }

  function createScoreViewerManager() {
    const shell = document.createElement("div");
    shell.className = "score-viewer-shell";
    document.body.appendChild(shell);

    const parsedScoreCache = new Map();
    const loadPromiseCache = new Map();
    const state = {
      normalizedRecord: null,
      graphController: null,
      selectedSha256: null,
      selectedTimeSec: 0,
      isPinned: false,
      isViewerOpen: false,
      isPlaying: false,
      isGraphHovered: false,
      parsedScore: null,
      viewerModel: null,
      loadToken: 0,
    };

    let playbackFrameId = null;
    let lastPlaybackTimestamp = null;

    const viewerController = createStandaloneScoreViewerController({
      root: shell,
      onTimeChange: (timeSec) => {
        setSelectedTimeSec(timeSec, { openViewer: true });
      },
      onPlaybackToggle: (nextPlaying) => {
        setPlaybackState(nextPlaying);
      },
    });

    window.addEventListener("locationchange", resetForPageChange);

    function attachGraphController(graphController, normalizedRecord) {
      if (state.graphController && state.graphController !== graphController) {
        state.graphController.destroy?.();
      }
      state.graphController = graphController;
      if (normalizedRecord) {
        shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(normalizedRecord.mode)}px`);
      }

      if (state.normalizedRecord?.sha256 && normalizedRecord?.sha256 && state.normalizedRecord.sha256 === normalizedRecord.sha256) {
        state.normalizedRecord = normalizedRecord;
        state.graphController.setPinned(state.isPinned);
        state.graphController.setSelectedTimeSec(state.selectedTimeSec);
      } else {
        state.graphController.setPinned(false);
        state.graphController.setSelectedTimeSec(0);
      }
    }

    async function prefetch(normalizedRecord) {
      if (!normalizedRecord?.sha256) {
        return;
      }
      try {
        const loaderContext = await ensureScoreLoaderContext();
        await loaderContext.loader.prefetchScore(normalizedRecord.sha256.toLowerCase());
      } catch (error) {
        console.warn("Score prefetch failed:", error);
      }
    }

    function handleGraphHover(normalizedRecord, timeSec) {
      state.isGraphHovered = true;
      if (normalizedRecord) {
        void activateRecord(normalizedRecord, { openViewer: true });
      }
      if (state.isPlaying) {
        return;
      }
      setSelectedTimeSec(timeSec, { openViewer: true });
    }

    function handleGraphHoverLeave(normalizedRecord) {
      if (!state.normalizedRecord || !normalizedRecord || state.normalizedRecord.sha256 === normalizedRecord.sha256) {
        state.isGraphHovered = false;
      }
      if (!state.isPinned && !state.isPlaying) {
        state.isViewerOpen = false;
        render();
      }
    }

    function handleGraphClick(normalizedRecord, timeSec) {
      state.isPinned = true;
      if (normalizedRecord) {
        void activateRecord(normalizedRecord, { openViewer: true });
      }
      setSelectedTimeSec(timeSec, { openViewer: true });
    }

    function handlePinChange(normalizedRecord, nextPinned) {
      state.isPinned = Boolean(nextPinned);
      if (normalizedRecord) {
        void activateRecord(normalizedRecord, { openViewer: state.isPinned });
      }
      if (state.isPinned) {
        state.isViewerOpen = true;
      } else if (!state.isGraphHovered && !state.isPlaying) {
        state.isViewerOpen = false;
      }
      render();
    }

    async function activateRecord(normalizedRecord, { openViewer = false } = {}) {
      if (!normalizedRecord) {
        return;
      }
      state.normalizedRecord = normalizedRecord;
      state.selectedSha256 = normalizedRecord.sha256 || null;
      shell.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromNumericMode(normalizedRecord.mode)}px`);
      if (openViewer) {
        state.isViewerOpen = true;
      }
      render();
      await loadSelectedRecord(normalizedRecord);
    }

    async function loadSelectedRecord(normalizedRecord) {
      if (!normalizedRecord?.sha256) {
        state.parsedScore = null;
        state.viewerModel = null;
        render();
        return;
      }
      const sha256 = normalizedRecord.sha256.toLowerCase();
      const loadToken = ++state.loadToken;

      if (parsedScoreCache.has(sha256)) {
        const cached = parsedScoreCache.get(sha256);
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        state.parsedScore = cached.score;
        state.viewerModel = cached.viewerModel;
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        render();
        return;
      }

      try {
        let loadPromise = loadPromiseCache.get(sha256);
        if (!loadPromise) {
          loadPromise = ensureScoreLoaderContext()
            .then((loaderContext) => loaderContext.loader.loadParsedScore(sha256))
            .then((parsedResult) => {
              const viewerModel = createStandaloneScoreViewerModel(parsedResult.score);
              const cached = { score: parsedResult.score, viewerModel };
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
        state.parsedScore = cached.score;
        state.viewerModel = cached.viewerModel;
        state.selectedTimeSec = clampSelectedTimeSec(state, state.selectedTimeSec);
        render();
      } catch (error) {
        if (loadToken !== state.loadToken || state.selectedSha256 !== sha256) {
          return;
        }
        console.warn("Score viewer parse/load failed:", error);
        state.parsedScore = null;
        state.viewerModel = null;
        state.isViewerOpen = false;
        render();
      }
    }

    function setSelectedTimeSec(nextTimeSec, { openViewer = false } = {}) {
      const clampedTimeSec = clampSelectedTimeSec(state, nextTimeSec);
      const changed = Math.abs(clampedTimeSec - state.selectedTimeSec) >= 0.0005;
      if (openViewer) {
        state.isViewerOpen = true;
      }
      state.selectedTimeSec = clampedTimeSec;
      if (!changed && !openViewer) {
        return;
      }
      render();
    }

    function setPlaybackState(nextPlaying) {
      if (!state.viewerModel || !state.parsedScore) {
        stopPlayback(false);
        render();
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
      const maxTimeSec = Math.max(state.parsedScore.lastPlayableTimeSec, 0);
      if (maxTimeSec <= 0) {
        return;
      }
      if (state.selectedTimeSec >= maxTimeSec - 0.0005) {
        state.selectedTimeSec = 0;
      }
      state.isPlaying = true;
      state.isViewerOpen = true;
      lastPlaybackTimestamp = null;
      if (playbackFrameId !== null) {
        cancelAnimationFrame(playbackFrameId);
      }
      render();
      playbackFrameId = requestAnimationFrame(stepPlayback);
    }

    function stopPlayback(renderAfter = true) {
      if (playbackFrameId !== null) {
        cancelAnimationFrame(playbackFrameId);
        playbackFrameId = null;
      }
      lastPlaybackTimestamp = null;
      const wasPlaying = state.isPlaying;
      state.isPlaying = false;
      if (renderAfter && wasPlaying) {
        render();
      }
    }

    function stepPlayback(timestamp) {
      if (!state.isPlaying || !state.viewerModel || !state.parsedScore) {
        playbackFrameId = null;
        lastPlaybackTimestamp = null;
        return;
      }
      if (lastPlaybackTimestamp === null || timestamp - lastPlaybackTimestamp > SCORE_VIEWER_MAX_PLAYBACK_DELTA_MS) {
        lastPlaybackTimestamp = timestamp;
        playbackFrameId = requestAnimationFrame(stepPlayback);
        return;
      }
      const deltaSec = (timestamp - lastPlaybackTimestamp) / 1000;
      lastPlaybackTimestamp = timestamp;
      const maxTimeSec = Math.max(state.parsedScore.lastPlayableTimeSec, 0);
      const nextTimeSec = Math.min(state.selectedTimeSec + deltaSec, maxTimeSec);
      state.selectedTimeSec = nextTimeSec;
      render();
      if (nextTimeSec >= maxTimeSec - 0.0005) {
        stopPlayback(false);
        render();
        return;
      }
      playbackFrameId = requestAnimationFrame(stepPlayback);
    }

    function resetForPageChange() {
      stopPlayback(false);
      state.graphController?.destroy?.();
      state.normalizedRecord = null;
      state.graphController = null;
      state.selectedSha256 = null;
      state.selectedTimeSec = 0;
      state.isPinned = false;
      state.isViewerOpen = false;
      state.isPlaying = false;
      state.isGraphHovered = false;
      state.parsedScore = null;
      state.viewerModel = null;
      state.loadToken += 1;
      shell.style.removeProperty("--score-viewer-width");
      render();
    }

    function render() {
      state.graphController?.setPinned(state.isPinned);
      state.graphController?.setSelectedTimeSec(state.selectedTimeSec);
      viewerController.setPlaybackState(state.isPlaying);
      viewerController.setPinned(state.isPinned);
      viewerController.setModel(state.viewerModel);
      viewerController.setSelectedTimeSec(state.selectedTimeSec);
      viewerController.setOpen(Boolean(state.isViewerOpen && state.viewerModel));
    }

    render();

    return {
      attachGraphController,
      prefetch,
      handleGraphHover,
      handleGraphHoverLeave,
      handleGraphClick,
      handlePinChange,
    };
  }

  function createStandaloneScoreViewerModel(score) {
    if (!score) {
      return null;
    }

    const notes = score.notes
      .filter((note) => note.kind !== "invisible")
      .map((note) => ({ ...note }))
      .sort(compareNoteLike);

    const comboEvents = (score.comboEvents?.length > 0 ? score.comboEvents : createFallbackComboEvents(score.notes))
      .map((event) => ({ ...event }))
      .sort(compareComboEvent)
      .map((event, index) => ({
        ...event,
        combo: index + 1,
      }));

    const longEndEventKeys = new Set(
      comboEvents
        .filter((event) => event.kind === "long-end")
        .map(createTimedLaneKey),
    );

    return {
      score,
      notes,
      comboEvents,
      longEndEventKeys,
      barLines: [...score.barLines].sort(compareNoteLike),
      bpmChanges: [...score.bpmChanges].sort(compareNoteLike),
      stops: [...score.stops].sort(compareNoteLike),
      totalCombo: comboEvents.length,
    };
  }

  function getStandaloneClampedSelectedTimeSec(model, timeSec) {
    if (!model) {
      return 0;
    }
    const numericValue = Number.isFinite(timeSec) ? timeSec : 0;
    return clampValue(numericValue, 0, model.score.lastPlayableTimeSec);
  }

  function getStandaloneContentHeightPx(model, viewportHeight, pixelsPerSecond = STANDALONE_DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return Math.max(1, viewportHeight);
    }
    return Math.max(
      Math.max(1, viewportHeight),
      Math.ceil(model.score.lastPlayableTimeSec * pixelsPerSecond + viewportHeight),
    );
  }

  function getStandaloneTimeSecForScrollTop(model, scrollTop, pixelsPerSecond = STANDALONE_DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return 0;
    }
    return getStandaloneClampedSelectedTimeSec(model, scrollTop / pixelsPerSecond);
  }

  function getStandaloneScrollTopForTimeSec(model, timeSec, viewportHeight, pixelsPerSecond = STANDALONE_DEFAULT_VIEWER_PIXELS_PER_SECOND) {
    if (!model) {
      return 0;
    }
    const clampedTimeSec = getStandaloneClampedSelectedTimeSec(model, timeSec);
    const maxScrollTop = Math.max(0, getStandaloneContentHeightPx(model, viewportHeight, pixelsPerSecond) - viewportHeight);
    return clampValue(clampedTimeSec * pixelsPerSecond, 0, maxScrollTop);
  }

  function getStandaloneVisibleTimeRange(
    model,
    selectedTimeSec,
    viewportHeight,
    pixelsPerSecond = STANDALONE_DEFAULT_VIEWER_PIXELS_PER_SECOND,
  ) {
    if (!model) {
      return { startTimeSec: 0, endTimeSec: 0 };
    }
    const clampedTimeSec = getStandaloneClampedSelectedTimeSec(model, selectedTimeSec);
    const halfViewportSec = viewportHeight / pixelsPerSecond / 2;
    const overscanSec = Math.max(halfViewportSec * 0.35, 0.75);
    return {
      startTimeSec: Math.max(0, clampedTimeSec - halfViewportSec - overscanSec),
      endTimeSec: Math.min(model.score.lastPlayableTimeSec, clampedTimeSec + halfViewportSec + overscanSec),
    };
  }

  function getStandaloneViewerCursor(model, selectedTimeSec) {
    if (!model) {
      return {
        timeSec: 0,
        measureIndex: 0,
        comboCount: 0,
        totalCombo: 0,
      };
    }
    const clampedTimeSec = getStandaloneClampedSelectedTimeSec(model, selectedTimeSec);
    return {
      timeSec: clampedTimeSec,
      measureIndex: getMeasureIndexAtTime(model, clampedTimeSec),
      comboCount: getComboCountAtTime(model, clampedTimeSec),
      totalCombo: model.totalCombo,
    };
  }

  function getMeasureIndexAtTime(model, timeSec) {
    if (!model || model.barLines.length === 0) {
      return 0;
    }
    const index = upperBoundByTime(model.barLines, timeSec) - 1;
    return Math.max(0, index);
  }

  function getComboCountAtTime(model, timeSec) {
    if (!model || model.comboEvents.length === 0) {
      return 0;
    }
    return upperBoundByTime(model.comboEvents, timeSec);
  }

  function shouldDrawLongEndCap(model, note) {
    if (!model || note?.kind !== "long" || !Number.isFinite(note?.endTimeSec)) {
      return false;
    }
    return model.longEndEventKeys.has(createTimedLaneKey(note.lane, note.endTimeSec, note.side));
  }

  function createFallbackComboEvents(notes) {
    return notes
      .filter((note) => note.kind === "normal" || note.kind === "long")
      .map((note) => ({
        lane: note.lane,
        timeSec: note.timeSec,
        kind: note.kind === "long" ? "long-start" : "normal",
        ...(note.side ? { side: note.side } : {}),
      }));
  }

  function upperBoundByTime(items, timeSec) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (items[mid].timeSec <= timeSec) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  function compareNoteLike(left, right) {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    return (left.lane ?? 0) - (right.lane ?? 0);
  }

  function compareComboEvent(left, right) {
    if (left.timeSec !== right.timeSec) {
      return left.timeSec - right.timeSec;
    }
    const order = comboEventOrder(left.kind) - comboEventOrder(right.kind);
    if (order !== 0) {
      return order;
    }
    return left.lane - right.lane;
  }

  function comboEventOrder(kind) {
    switch (kind) {
      case "normal":
        return 0;
      case "long-start":
        return 1;
      case "long-end":
        return 2;
      default:
        return 99;
    }
  }

  function createTimedLaneKey(input, timeSec, side = undefined) {
    if (typeof input === "object" && input !== null) {
      return createTimedLaneKey(input.lane, input.timeSec ?? input.endTimeSec, input.side);
    }
    return `${side ?? "-"}:${input}:${Math.round((timeSec ?? 0) * 1000000)}`;
  }

  function createStandaloneScoreViewerRenderer(canvas) {
    const context = canvas.getContext("2d");
    let width = 0;
    let height = 0;
    let dpr = 1;

    function resize(nextWidth, nextHeight) {
      width = Math.max(1, Math.floor(nextWidth));
      height = Math.max(1, Math.floor(nextHeight));
      dpr = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function render(model, selectedTimeSec, pixelsPerSecond = STANDALONE_DEFAULT_VIEWER_PIXELS_PER_SECOND) {
      context.clearRect(0, 0, width, height);
      context.fillStyle = STANDALONE_BACKGROUND_FILL;
      context.fillRect(0, 0, width, height);

      if (!model) {
        return createEmptyRenderResult();
      }

      const lanes = createStandaloneLaneLayout(model.score.mode, model.score.laneCount, width);
      const { startTimeSec, endTimeSec } = getStandaloneVisibleTimeRange(model, selectedTimeSec, height, pixelsPerSecond);

      drawStandaloneBarLines(context, model.barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
      drawStandaloneLongBodies(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
      drawStandaloneNoteHeads(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, height, pixelsPerSecond);
      drawStandaloneLaneSeparators(context, lanes, height);
      const markers = drawStandaloneTempoMarkers(
        context,
        model.bpmChanges,
        model.stops,
        lanes,
        selectedTimeSec,
        startTimeSec,
        endTimeSec,
        height,
        pixelsPerSecond,
      );

      return {
        markers,
        laneBounds: getStandaloneLaneBounds(lanes),
      };
    }

    return { resize, render };
  }

  function estimateViewerWidthFromParsedScore(score) {
    return estimateViewerWidthFromMode(score?.mode, score?.laneCount);
  }

  function estimateViewerWidthFromNumericMode(mode) {
    switch (Number(mode)) {
      case 5:
        return estimateViewerWidthFromMode("5k", 6);
      case 7:
        return estimateViewerWidthFromMode("7k", 8);
      case 9:
        return estimateViewerWidthFromMode("popn-9k", 9);
      case 10:
        return estimateViewerWidthFromMode("10k", 12);
      case 14:
        return estimateViewerWidthFromMode("14k", 16);
      default:
        return estimateViewerWidthFromMode(String(mode ?? ""), getDisplayLaneCount(mode));
    }
  }

  function estimateViewerWidthFromMode(mode, laneCount) {
    const layout = getStandaloneModeLayout(mode, laneCount);
    const gutterWidth = layout.splitAfter === null ? 0 : STANDALONE_FIXED_LANE_WIDTH * STANDALONE_DP_GUTTER_UNITS;
    const contentWidth = layout.display.length * STANDALONE_FIXED_LANE_WIDTH + gutterWidth;
    return Math.ceil(
      STANDALONE_VIEWER_HORIZONTAL_PADDING * 2
      + contentWidth
      + STANDALONE_VIEWER_MARKER_LABEL_WIDTH * 2
      + STANDALONE_TEMPO_LABEL_GAP * 2,
    );
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

  function createStandaloneLaneLayout(mode, laneCount, viewportWidth) {
    const layout = getStandaloneModeLayout(mode, laneCount);
    const gutterWidth = layout.splitAfter === null ? 0 : STANDALONE_FIXED_LANE_WIDTH * STANDALONE_DP_GUTTER_UNITS;
    const contentWidth = layout.display.length * STANDALONE_FIXED_LANE_WIDTH + gutterWidth;
    const startX = Math.max(STANDALONE_VIEWER_HORIZONTAL_PADDING, Math.floor((viewportWidth - contentWidth) / 2));
    const lanes = new Array(Math.max(1, laneCount));

    let cursorX = startX;
    for (let slotIndex = 0; slotIndex < layout.display.length; slotIndex += 1) {
      if (layout.splitAfter !== null && slotIndex === layout.splitAfter) {
        cursorX += gutterWidth;
      }
      const slot = layout.display[slotIndex];
      lanes[slot.actualLane] = {
        lane: slot.actualLane,
        x: cursorX,
        width: STANDALONE_FIXED_LANE_WIDTH,
        note: slot.note,
      };
      cursorX += STANDALONE_FIXED_LANE_WIDTH;
    }

    return lanes;
  }

  function getStandaloneModeLayout(mode, laneCount) {
    switch (mode) {
      case "5k":
        return createStandaloneDisplayLayout([0, 1, 2, 3, 4, 5], null, (slotIndex) => getStandaloneBeatNoteColor(`g${slotIndex}`));
      case "7k":
        return createStandaloneDisplayLayout([0, 1, 2, 3, 4, 5, 6, 7], null, (slotIndex) => getStandaloneBeatNoteColor(String(slotIndex)));
      case "10k":
        return createStandaloneDisplayLayout([0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 6], 6, (slotIndex) => getStandaloneBeatNoteColor(`g${slotIndex}`));
      case "14k":
        return createStandaloneDisplayLayout([0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 8], 8, (slotIndex) => getStandaloneBeatNoteColor(String(slotIndex)));
      case "popn-5k":
        return createStandaloneDisplayLayout([0, 1, 2, 3, 4], null, (slotIndex) => getStandalonePopnNoteColor(slotIndex));
      case "popn-9k":
      case "9k":
        return createStandaloneDisplayLayout(Array.from({ length: Math.max(1, laneCount) }, (_, index) => index), null, (slotIndex) => getStandalonePopnNoteColor(slotIndex));
      default:
        return createStandaloneDisplayLayout(Array.from({ length: Math.max(1, laneCount) }, (_, index) => index), null, () => "#bebebe");
    }
  }

  function createStandaloneDisplayLayout(displayOrder, splitAfter, getColor) {
    return {
      splitAfter,
      display: displayOrder.map((actualLane, slotIndex) => ({
        actualLane,
        note: getColor(slotIndex),
      })),
    };
  }

  function getStandaloneBeatNoteColor(key) {
    return STANDALONE_BEAT_LANE_COLORS.get(key) ?? "#bebebe";
  }

  function getStandalonePopnNoteColor(slotIndex) {
    return STANDALONE_POPN_LANE_COLORS.get(`p${slotIndex}`) ?? "#c4c4c4";
  }

  function drawStandaloneBarLines(context, barLines, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    if (lanes.length === 0) {
      return;
    }
    const leftX = lanes[0].x;
    const rightX = lanes[lanes.length - 1].x + lanes[lanes.length - 1].width;
    context.save();
    context.strokeStyle = STANDALONE_BAR_LINE;
    context.lineWidth = 1;
    for (const barLine of barLines) {
      if (barLine.timeSec < startTimeSec || barLine.timeSec > endTimeSec) {
        continue;
      }
      const y = standaloneTimeToViewportY(barLine.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      context.beginPath();
      context.moveTo(leftX, y + 0.5);
      context.lineTo(rightX, y + 0.5);
      context.stroke();
    }
    context.restore();
  }

  function drawStandaloneTempoMarkers(context, bpmChanges, stops, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    if (lanes.length === 0) {
      return [];
    }
    const leftLane = lanes[0];
    const rightLane = lanes[lanes.length - 1];
    const markers = [];

    context.save();
    context.fillStyle = STANDALONE_BPM_MARKER;
    for (const bpmChange of bpmChanges) {
      if (bpmChange.timeSec < startTimeSec || bpmChange.timeSec > endTimeSec) {
        continue;
      }
      const y = standaloneTimeToViewportY(bpmChange.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      context.fillRect(rightLane.x, Math.round(y - STANDALONE_TEMPO_MARKER_HEIGHT / 2), rightLane.width, STANDALONE_TEMPO_MARKER_HEIGHT);
      markers.push({
        type: "bpm",
        timeSec: bpmChange.timeSec,
        y,
        label: trimDecimal(Number(bpmChange.bpm).toFixed(2)),
        side: "right",
        color: STANDALONE_BPM_MARKER,
        x: rightLane.x + rightLane.width + STANDALONE_TEMPO_LABEL_GAP,
      });
    }

    context.fillStyle = STANDALONE_STOP_MARKER;
    for (const stop of stops) {
      if (stop.timeSec < startTimeSec || stop.timeSec > endTimeSec) {
        continue;
      }
      const y = standaloneTimeToViewportY(stop.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      context.fillRect(leftLane.x, Math.round(y - STANDALONE_TEMPO_MARKER_HEIGHT / 2), leftLane.width, STANDALONE_TEMPO_MARKER_HEIGHT);
      markers.push({
        type: "stop",
        timeSec: stop.timeSec,
        y,
        label: `${trimDecimal(Number(stop.durationSec).toFixed(3))}s`,
        side: "left",
        color: STANDALONE_STOP_MARKER,
        x: leftLane.x - STANDALONE_TEMPO_LABEL_GAP,
      });
    }

    context.restore();
    return markers;
  }

  function drawStandaloneLongBodies(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    context.save();
    for (const note of model.notes) {
      if (note.kind !== "long" || !Number.isFinite(note.endTimeSec)) {
        continue;
      }
      if (note.endTimeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane) {
        continue;
      }
      const startY = standaloneTimeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      const endY = standaloneTimeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      const topY = Math.max(Math.min(startY, endY), -STANDALONE_NOTE_HEAD_HEIGHT - 24);
      const bottomY = Math.min(Math.max(startY, endY), viewportHeight + STANDALONE_NOTE_HEAD_HEIGHT + 24);
      const bodyHeight = Math.max(bottomY - topY, 2);
      context.fillStyle = dimColor(lane.note, 0.42);
      context.fillRect(lane.x, topY, lane.width, bodyHeight);
    }
    context.restore();
  }

  function drawStandaloneNoteHeads(context, model, lanes, selectedTimeSec, startTimeSec, endTimeSec, viewportHeight, pixelsPerSecond) {
    context.save();
    for (const note of model.notes) {
      const noteEndTimeSec = note.endTimeSec ?? note.timeSec;
      if (noteEndTimeSec < startTimeSec || note.timeSec > endTimeSec) {
        continue;
      }
      const lane = lanes[note.lane];
      if (!lane || note.kind === "invisible") {
        continue;
      }
      const headY = standaloneTimeToViewportY(note.timeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
      drawStandaloneRectNote(context, lane, headY, note.kind === "mine" ? STANDALONE_MINE_COLOR : lane.note);
      if (note.kind === "long" && Number.isFinite(note.endTimeSec) && shouldDrawLongEndCap(model, note)) {
        const endHeadY = standaloneTimeToViewportY(note.endTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond);
        drawStandaloneRectNote(context, lane, endHeadY, lane.note);
      }
    }
    context.restore();
  }

  function drawStandaloneRectNote(context, lane, y, color) {
    context.fillStyle = color;
    context.fillRect(lane.x, Math.round(y - STANDALONE_NOTE_HEAD_HEIGHT), lane.width, STANDALONE_NOTE_HEAD_HEIGHT);
  }

  function drawStandaloneLaneSeparators(context, lanes, viewportHeight) {
    if (lanes.length === 0) {
      return;
    }
    context.save();
    context.strokeStyle = STANDALONE_SEPARATOR_COLOR;
    context.lineWidth = 1;
    const uniqueBoundaries = new Set();
    uniqueBoundaries.add(Math.round(lanes[0].x));
    for (const lane of lanes) {
      uniqueBoundaries.add(Math.round(lane.x));
      uniqueBoundaries.add(Math.round(lane.x + lane.width));
    }
    for (const x of [...uniqueBoundaries].sort((left, right) => left - right)) {
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, viewportHeight);
      context.stroke();
    }
    context.restore();
  }

  function getStandaloneLaneBounds(lanes) {
    if (lanes.length === 0) {
      return { leftX: 0, rightX: 0 };
    }
    return {
      leftX: lanes[0].x,
      rightX: lanes[lanes.length - 1].x + lanes[lanes.length - 1].width,
    };
  }

  function createEmptyRenderResult() {
    return {
      markers: [],
      laneBounds: {
        leftX: 0,
        rightX: 0,
      },
    };
  }

  function standaloneTimeToViewportY(eventTimeSec, selectedTimeSec, viewportHeight, pixelsPerSecond) {
    return viewportHeight / 2 - (eventTimeSec - selectedTimeSec) * pixelsPerSecond;
  }

  function dimColor(color, factor) {
    if (!String(color).startsWith("#")) {
      return color;
    }
    const normalized = color.replace("#", "");
    const red = Number.parseInt(normalized.slice(0, 2), 16);
    const green = Number.parseInt(normalized.slice(2, 4), 16);
    const blue = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgb(${Math.round(red * factor)}, ${Math.round(green * factor)}, ${Math.round(blue * factor)})`;
  }

  function createStandaloneScoreViewerController({ root, onTimeChange = () => {}, onPlaybackToggle = () => {} }) {
    const scrollHost = document.createElement("div");
    scrollHost.className = "score-viewer-scroll-host";

    const spacer = document.createElement("div");
    spacer.className = "score-viewer-spacer";
    scrollHost.appendChild(spacer);

    const canvas = document.createElement("canvas");
    canvas.className = "score-viewer-canvas";

    const markerOverlay = document.createElement("div");
    markerOverlay.className = "score-viewer-marker-overlay";

    const markerLabelsLeft = document.createElement("div");
    markerLabelsLeft.className = "score-viewer-marker-labels is-left";

    const markerLabelsRight = document.createElement("div");
    markerLabelsRight.className = "score-viewer-marker-labels is-right";

    markerOverlay.append(markerLabelsLeft, markerLabelsRight);

    const bottomBar = document.createElement("div");
    bottomBar.className = "score-viewer-bottom-bar";

    const primaryChip = document.createElement("div");
    primaryChip.className = "score-viewer-chip is-primary";

    const playbackButton = document.createElement("button");
    playbackButton.className = "score-viewer-playback-button";
    playbackButton.type = "button";
    playbackButton.setAttribute("aria-label", "Play score viewer");
    playbackButton.textContent = "▶";

    const playbackTime = document.createElement("span");
    playbackTime.className = "score-viewer-playback-time";
    primaryChip.append(playbackButton, playbackTime);

    const measureChip = document.createElement("div");
    measureChip.className = "score-viewer-chip is-compact";

    const comboChip = document.createElement("div");
    comboChip.className = "score-viewer-chip is-compact";

    const spacingPanel = document.createElement("div");
    spacingPanel.className = "score-viewer-chip score-viewer-spacing-panel";

    const spacingLabel = document.createElement("label");
    spacingLabel.className = "score-viewer-spacing-label";
    spacingLabel.textContent = "SPACING";

    const spacingValue = document.createElement("span");
    spacingValue.className = "score-viewer-spacing-value";
    spacingLabel.appendChild(spacingValue);

    const spacingInput = document.createElement("input");
    spacingInput.className = "score-viewer-spacing-input";
    spacingInput.type = "range";
    spacingInput.min = String(STANDALONE_MIN_SPACING_SCALE);
    spacingInput.max = String(STANDALONE_MAX_SPACING_SCALE);
    spacingInput.step = String(STANDALONE_SPACING_STEP);
    spacingInput.value = String(STANDALONE_DEFAULT_SPACING_SCALE);

    spacingPanel.append(spacingLabel, spacingInput);
    bottomBar.append(primaryChip, measureChip, comboChip, spacingPanel);

    const judgeLine = document.createElement("div");
    judgeLine.className = "score-viewer-judge-line";

    root.replaceChildren(scrollHost, canvas, markerOverlay, bottomBar, judgeLine);

    const renderer = createStandaloneScoreViewerRenderer(canvas);
    const state = {
      model: null,
      selectedTimeSec: 0,
      isPinned: false,
      isOpen: false,
      isPlaying: false,
      spacingScale: STANDALONE_DEFAULT_SPACING_SCALE,
    };

    let ignoreScrollUntilNextFrame = false;
    let resizeObserver = null;
    let dragState = null;

    scrollHost.addEventListener("scroll", () => {
      syncTimeFromScrollPosition();
    });

    scrollHost.addEventListener("wheel", (event) => {
      if (!state.model || !state.isOpen || !isScrollInteractive()) {
        return;
      }
      scrollHost.scrollTop += event.deltaY * STANDALONE_SCROLL_MULTIPLIER;
      syncTimeFromScrollPosition({ force: true });
      event.preventDefault();
    }, { passive: false });

    scrollHost.addEventListener("pointerdown", (event) => {
      if (!canDragScroll(event)) {
        return;
      }
      dragState = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: scrollHost.scrollTop,
      };
      scrollHost.classList.add("is-dragging");
      if (typeof scrollHost.setPointerCapture === "function") {
        scrollHost.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    });

    scrollHost.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      const deltaY = event.clientY - dragState.startY;
      scrollHost.scrollTop = dragState.startScrollTop + deltaY * STANDALONE_SCROLL_MULTIPLIER;
      syncTimeFromScrollPosition({ force: true });
      event.preventDefault();
    });

    scrollHost.addEventListener("pointerup", handlePointerRelease);
    scrollHost.addEventListener("pointercancel", handlePointerRelease);
    scrollHost.addEventListener("lostpointercapture", handlePointerRelease);

    spacingInput.addEventListener("input", () => {
      const nextScale = clampScale(Number.parseFloat(spacingInput.value));
      if (Math.abs(nextScale - state.spacingScale) < 0.0005) {
        spacingValue.textContent = formatSpacingScale(state.spacingScale);
        return;
      }
      state.spacingScale = nextScale;
      spacingValue.textContent = formatSpacingScale(state.spacingScale);
      refreshLayout();
    });

    playbackButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state.model) {
        return;
      }
      onPlaybackToggle(!state.isPlaying);
    });

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        refreshLayout();
      });
      resizeObserver.observe(root);
    } else {
      window.addEventListener("resize", refreshLayout);
    }

    function setModel(model) {
      if (state.model === model) {
        return;
      }
      state.model = model;
      state.selectedTimeSec = getStandaloneClampedSelectedTimeSec(state.model, state.selectedTimeSec);
      updateRootWidth();
      refreshLayout();
    }

    function setSelectedTimeSec(timeSec) {
      const clampedTimeSec = getStandaloneClampedSelectedTimeSec(state.model, timeSec);
      if (Math.abs(clampedTimeSec - state.selectedTimeSec) < 0.0005 && state.model) {
        syncScrollPosition();
        renderScene();
        return;
      }
      state.selectedTimeSec = clampedTimeSec;
      syncScrollPosition();
      renderScene();
    }

    function setPinned(nextPinned) {
      state.isPinned = Boolean(nextPinned);
      updateScrollInteractivity();
      renderScene();
    }

    function setOpen(nextOpen) {
      state.isOpen = Boolean(nextOpen);
      root.classList.toggle("is-visible", state.isOpen && Boolean(state.model));
      syncScrollPosition();
      renderScene();
    }

    function setPlaybackState(nextPlaying) {
      state.isPlaying = Boolean(nextPlaying);
      updateScrollInteractivity();
      renderScene();
    }

    function syncScrollPosition() {
      if (!state.model) {
        scrollHost.scrollTop = 0;
        return;
      }
      ignoreScrollUntilNextFrame = true;
      scrollHost.scrollTop = getStandaloneScrollTopForTimeSec(
        state.model,
        state.selectedTimeSec,
        root.clientHeight || 0,
        getPixelsPerSecond(),
      );
      requestAnimationFrame(() => {
        ignoreScrollUntilNextFrame = false;
      });
    }

    function syncTimeFromScrollPosition({ force = false } = {}) {
      if (!state.model || !state.isOpen || !isScrollInteractive()) {
        return;
      }
      if (!force && ignoreScrollUntilNextFrame) {
        return;
      }
      const nextTimeSec = getStandaloneTimeSecForScrollTop(state.model, scrollHost.scrollTop, getPixelsPerSecond());
      if (Math.abs(nextTimeSec - state.selectedTimeSec) < 0.0005) {
        return;
      }
      state.selectedTimeSec = nextTimeSec;
      renderScene();
      onTimeChange(nextTimeSec);
    }

    function refreshLayout() {
      updateRootWidth();
      const width = Math.max(1, root.clientWidth);
      const height = Math.max(260, root.clientHeight);
      renderer.resize(width, height);
      spacer.style.height = `${getStandaloneContentHeightPx(state.model, height, getPixelsPerSecond())}px`;
      syncScrollPosition();
      renderScene();
    }

    function renderScene() {
      const cursor = getStandaloneViewerCursor(state.model, state.selectedTimeSec);
      const showScene = Boolean(state.model && state.isOpen);
      canvas.hidden = !showScene;
      markerOverlay.hidden = !showScene;
      bottomBar.hidden = !showScene;
      judgeLine.hidden = !showScene;

      playbackButton.disabled = !state.model;
      playbackButton.textContent = state.isPlaying ? "❚❚" : "▶";
      playbackButton.setAttribute("aria-label", state.isPlaying ? "Pause score viewer" : "Play score viewer");
      playbackTime.textContent = `${cursor.timeSec.toFixed(3)} s`;
      measureChip.textContent = `M ${cursor.measureIndex}`;
      comboChip.textContent = `C ${cursor.comboCount}/${cursor.totalCombo}`;
      spacingValue.textContent = formatSpacingScale(state.spacingScale);
      spacingInput.value = String(state.spacingScale);

      const renderResult = renderer.render(showScene ? state.model : null, cursor.timeSec, getPixelsPerSecond());
      renderMarkerLabels(showScene ? renderResult.markers : []);
    }

    function renderMarkerLabels(markers) {
      markerLabelsLeft.replaceChildren();
      markerLabelsRight.replaceChildren();
      if (!Array.isArray(markers) || markers.length === 0) {
        return;
      }
      const leftMarkers = filterMarkerLabels(markers.filter((marker) => marker.side === "left"));
      const rightMarkers = filterMarkerLabels(markers.filter((marker) => marker.side === "right"));
      for (const marker of leftMarkers) {
        markerLabelsLeft.appendChild(createMarkerLabel(marker, "left"));
      }
      for (const marker of rightMarkers) {
        markerLabelsRight.appendChild(createMarkerLabel(marker, "right"));
      }
    }

    function handlePointerRelease(event) {
      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }
      clearDragState();
    }

    function clearDragState() {
      if (dragState && typeof scrollHost.releasePointerCapture === "function") {
        try {
          if (scrollHost.hasPointerCapture?.(dragState.pointerId)) {
            scrollHost.releasePointerCapture(dragState.pointerId);
          }
        } catch {
          // Ignore already released pointers.
        }
      }
      dragState = null;
      scrollHost.classList.remove("is-dragging");
    }

    function canDragScroll(event) {
      return Boolean(
        state.model
          && state.isOpen
          && isScrollInteractive()
          && (event.button === 0 || event.pointerType === "touch" || event.pointerType === "pen"),
      );
    }

    function isScrollInteractive() {
      return state.isPinned || state.isPlaying;
    }

    function updateRootWidth() {
      if (!state.model) {
        return;
      }
      root.style.setProperty("--score-viewer-width", `${estimateViewerWidthFromParsedScore(state.model.score)}px`);
    }

    function updateScrollInteractivity() {
      const interactive = isScrollInteractive();
      scrollHost.classList.toggle("is-scrollable", interactive);
      scrollHost.style.overflowY = interactive ? "auto" : "hidden";
      if (!interactive) {
        clearDragState();
      }
    }

    function getPixelsPerSecond() {
      return STANDALONE_DEFAULT_VIEWER_PIXELS_PER_SECOND * state.spacingScale;
    }

    spacingValue.textContent = formatSpacingScale(state.spacingScale);
    refreshLayout();

    return {
      setModel,
      setSelectedTimeSec,
      setPinned,
      setOpen,
      setPlaybackState,
    };
  }

  function createMarkerLabel(marker, side) {
    const label = document.createElement("div");
    label.className = `score-viewer-marker-label is-${marker.type} is-${side}`;
    label.textContent = marker.label;
    label.style.top = `${marker.y}px`;
    label.style.color = marker.color;
    label.style.left = `${marker.x}px`;
    return label;
  }

  function filterMarkerLabels(markers) {
    const filtered = [];
    let lastY = Number.NEGATIVE_INFINITY;
    for (const marker of [...markers].sort((left, right) => left.y - right.y)) {
      if (Math.abs(marker.y - lastY) < 12) {
        continue;
      }
      filtered.push(marker);
      lastY = marker.y;
    }
    return filtered;
  }

  function clampSelectedTimeSec(state, timeSec) {
    if (state.viewerModel) {
      return getStandaloneClampedSelectedTimeSec(state.viewerModel, timeSec);
    }
    const maxTimeSec = state.normalizedRecord?.durationSec ?? 0;
    return clampValue(Number.isFinite(timeSec) ? timeSec : 0, 0, Math.max(maxTimeSec, 0));
  }

  function clampScale(value) {
    if (!Number.isFinite(value)) {
      return STANDALONE_DEFAULT_SPACING_SCALE;
    }
    return clampValue(value, STANDALONE_MIN_SPACING_SCALE, STANDALONE_MAX_SPACING_SCALE);
  }

  function formatSpacingScale(value) {
    return `${clampScale(value).toFixed(2)}x`;
  }

  function clampValue(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
  }

  function trimDecimal(value) {
    return String(value).replace(/\.?0+$/, "");
  }
})();
