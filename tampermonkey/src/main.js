import * as PreviewRuntime from "../../shared/preview-runtime/index.js";
import { createScoreLoader } from "../../web/score-parser-runtime/src/score_loader.js";

// @run-at document-startでとにかく最速でスクリプトを起動して、ページが書き換え処理可能な状態かどうかはサイトごとに固有の判定を行う

(function () {
  'use strict';
  console.info("BMS Info Extenderが起動しました");

  // 使用するフォントを準備
  const fontCSS = GM_getResourceText("googlefont");
  GM_addStyle(fontCSS);

  const SCORE_BASE_URL = "https://bms-info-extender.netlify.app/score";
  const SCORE_R2_BASE_URL = "https://bms.howan.jp/score";
  const BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
  const SCRIPT_VERSION_FALLBACK = "2.3.14";
  const userscriptFetch = createUserscriptFetch();
  PreviewRuntime.setPreviewRuntimeFetch(userscriptFetch);
  const SKIP_VERSION_NOTIFICATION_FROM = "2.3.0";
  const VERSION_NOTIFICATION_STORAGE_KEYS = {
    lastNotifiedVersion: "bms-info-extender.versionNotification.lastNotifiedVersion",
    notificationLanguage: "bms-info-extender.versionNotification.language"
  };
  const VERSION_NOTIFICATION_DEFAULT_LANGUAGE = "ja";
  const VERSION_NOTIFICATION_MODAL_ID = "bms-info-extender-version-notification";
  const VERSION_NOTIFICATION_STYLE = `
    :host {
      all: initial;
    }
    :host, :host * {
      box-sizing: border-box;
      font-family: "Inconsolata", "Noto Sans JP", sans-serif;
    }
    .bmsie-version-notice-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(0, 0, 0, 0.56);
      z-index: 2147483647;
      color: #f4f6ff;
      line-height: 1.5;
      text-align: left;
    }
    .bmsie-version-notice-window {
      width: min(680px, calc(100vw - 32px));
      max-height: min(760px, calc(100vh - 32px));
      overflow: auto;
      padding: 20px 20px 16px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      background: #1d2030;
      color: #f4f6ff;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.4);
    }
    .bmsie-version-notice-version {
      margin: 0 0 10px;
      color: #b7c2ff;
      font-size: 0.95rem;
    }
    .bmsie-version-notice-title {
      margin: 0 0 14px;
      font-size: 1.25rem;
      line-height: 1.35;
    }
    .bmsie-version-notice-content {
      margin: 0;
      padding: 14px 16px;
      min-height: 280px;
      max-height: 280px;
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      background: rgba(10, 12, 18, 0.72);
      color: #f4f6ff;
      font-size: 14px;
      line-height: normal;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      box-sizing: border-box;
    }
    .bmsie-version-notice-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 18px;
    }
    .bmsie-version-notice-language {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #d9def8;
      font-size: 0.95rem;
    }
    .bmsie-version-notice-select {
      min-width: 140px;
      padding: 4px 8px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
      background: #11131d;
      color: #f4f6ff;
      font-size: 0.95rem;
    }
    .bmsie-version-notice-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
    }
    .bmsie-version-notice-checkbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      line-height: 1.45;
      color: #f4f6ff;
      cursor: pointer;
    }
    .bmsie-version-notice-checkbox input {
      margin: 0;
      accent-color: #84a4ff;
    }
    .bmsie-version-notice-ok {
      min-width: 92px;
      padding: 7px 14px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: linear-gradient(180deg, #7ea1ff 0%, #4f73d6 100%);
      color: #ffffff;
      font-size: 0.95rem;
      cursor: pointer;
    }
  `;
    const RELEASE_NOTES_JA =
`# v2.3.3 (通知スキップ)

## 24keys/48keys対応とそれに伴うパーサーの更新
- パーサーを更新しました(v0.6.5→v0.6.6)
- LANENOTESの色分けを24keys/48keysに対応させました
- 譜面ビューアを24keys/48keysに対応させました

## Lunaticモードに負数BPMの解釈を追加
- 負数BPMが登場した時点でスクロール方向を反転させるようにしました
- 以降は、最後に定義された小節までBPMの絶対値でスクロールした場合を仮定し、それが残り再生時間となります
- 負数BPM以降に定義されたBPM変更といったイベントは判定ラインに到達することがないという解釈を採用しているので、通常BPMに復帰することはありません

## LN/CN/HCNのコンボ加算タイミングを調整
- 今までは、LNは始点で1コンボ加算、CN/HCNは始点で2コンボ加算という状態でした
- LNでは、LNの終端でコンボが加算されるようにしました
- CN/HCNでは、始点と終端でそれぞれコンボを加算するようにしました
- この変更の目的は、オートプレイ動画とコンボ加算のタイミングを合わせて、譜面の位置を把握しやすくすることにあります

## Game/Lunaticモードで、LN中の始点ノーツが判定ラインに滞留する描画に調整
- 少なくともLR2やbeatorajaではこのような描画になっているのでそれに合わせた形です
- 似たような音ゲーでも始点が普通に通り過ぎる描画のものもあると思いますが、今回はこのようにしました

---

# v2.3.2 (通知スキップ)

## LANENOTESにおいて、24keys/48keysの時に14keys配色になってしまう色分け回帰を修正
- 手作りの温かみのあるv1.1.0では正常だったが、Codexを過信した2.0.0で埋め込んでいたバグ

---

# v2.3.1 (通知スキップ)

## TABLESのデータが更新されにくい場合があるので修正
- メタデータの配信にCache-Controlを付与していなかったため、ヒューリスティックキャッシュが長期間効いてしまう問題があった
- 配信にCache-Controlを付与するとともに、ユーザースクリプト側では暫定的にキャッシュバスターを付与ししばらく様子見

---

# v2.3.0

## 譜面ビューアの描画を調整しました
- 横線系のオブジェクトは下端がタイミングとして正しくなるように整理しました
- つまり、ノーツの下端が判定ラインの下端に重なった時がジャストです

## 譜面ビューアの設定値を見直しました
- SPACINGは基準からの倍率ではなくピクセル数で指定するようにしました
- Game, Lunaticモードでのレーン高さはウィンドウサイズからの相対値ではなく、判定ラインからのピクセル数としました

## 譜面ビューアの詳細設定ウィンドウを追加しました
- ビューア下部情報ウィンドウ右上の⚙アイコンから開けます
- ノーツ幅、スクラッチ幅、ノーツ高さ、小節線幅、マーカー幅、判定ライン幅、レーンセパレーター幅が設定可能です

## Lunaticモードで負数STOPにより圧縮された再生時間と、その他のモードの再生時間をマッピングできるようにしました
- ノーツグラフ上の再生ライン位置やその他のモードに切り替えたときの表示位置にズレが生じなくなりました

## Time, Editorモードで複数列表示に対応しました
- 譜面ビューア左辺をドラッグして列を引き出せます
- NOTE: 一般的なビューアと異なり各列で小節を積み上げる方式ではないので小節線の位置が揃いません

## TODO
- プレイサイド選択、ランダム系オプションの実装
- 負数BPMの解釈

---

# v2.2.0

## 譜面ビューアに変更を加えました
- 判定ラインをドラッグ可能にしました
- 譜面ビューアをダブルクリックで再生・停止できるようにしました
- グラフ左上に設定を追加し、再生ラインを Hover Follow またはクリック・再生ラインのドラッグ・右クリッの掴みっぱなしで動かす設定を選べるようにしました
- 下部情報ウィンドウの設定情報は自動的に隠すようにしました
- Game モードの挙動を beatoraja に近づけました
- LR2風の Lunatic モードを追加しました(負数STOPワープ、SCROLL無視)
- 緑数字、レーン高さ、レーンカバー、HS-FIX が設定可能です
- レーン高さ、レーンカバーはドラッグ可能です
- スライダーの設定値を保存するようにしました
- スライダーはホイールで微調整可能です

## 従来からの挙動について補足
- 譜面ビューアはドラッグやホイールでも動かすことができます`;
    const RELEASE_NOTES_EN =
`# v2.3.3 (notification skipped)

## Added 24keys/48keys support and updated the parser accordingly
- Updated the parser from v0.6.5 to v0.6.6
- Updated LANENOTES color assignment to support 24keys/48keys
- Added 24keys/48keys support to the score viewer

## Added negative BPM interpretation to Lunatic mode
- Scrolling now reverses direction when a negative BPM appears
- After that point, the remaining playback time is interpreted as if the chart continues scrolling at the absolute BPM value until the last defined measure
- Events defined after a negative BPM, such as later BPM changes, are interpreted as never reaching the judge line, so playback does not return to normal BPM flow

## Adjusted combo timing for LN/CN/HCN
- Previously, LN added 1 combo at the start, while CN/HCN added 2 combos at the start
- LN now adds combo at the end of the long note
- CN/HCN now add combo separately at the start and at the end
- The goal of this change is to match combo timing with autoplay videos so chart positions are easier to follow

## Adjusted Game/Lunatic rendering so LN start notes stay on the judge line while held
- This matches how at least LR2 and beatoraja render them
- Some similar rhythm games let the start note pass through normally, but this project now follows the retained-head style

---

# v2.3.2 (notification skipped)

## Fixed a regression where LANENOTES used 14keys colors in 24keys/48keys mode
- This worked correctly in the lovingly hand-crafted v1.1.0, but the bug was introduced in v2.0.0 when I trusted Codex too much

---

# v2.3.1 (notification skipped)

## Fixed an issue where TABLES data could be slow to update
- Metadata responses were missing Cache-Control, so heuristic caching could persist for a long time
- Cache-Control is now added on the delivery side, and the userscript also temporarily adds a cache buster while monitoring the situation

---

# v2.3.0

## Adjusted the score viewer rendering
- Horizontal-line style objects are now arranged so their bottom edge is the correct timing reference
- In other words, a note is judged just when its bottom edge overlaps the bottom edge of the judge line

## Reviewed the score viewer setting values
- SPACING is now specified directly in pixels instead of as a multiplier from the baseline
- In Game and Lunatic mode, lane height is now specified as a pixel distance from the judge line instead of a value relative to the window size

## Added a detailed settings window for the score viewer
- You can open it from the gear icon at the top right of the viewer's bottom info panel
- You can configure note width, scratch width, note height, bar line width, marker width, judge line width, and lane separator width

## Lunatic mode can now map playback time compressed by negative STOPs to playback time in the other modes
- This removes mismatches in the playback line position on the notes graph and in the displayed position when switching to another mode

## Added multi-column display support in Time and Editor mode
- You can drag the left edge of the score viewer to pull out additional columns
- NOTE: Unlike general-purpose viewers, each column does not stack measures independently, so bar line positions will not align across columns

## TODO
- Implement play-side selection and random-related options
- Interpret negative BPM values

---

# v2.2.0

## Updated the score viewer
- The judge line is now draggable
- You can now play or stop the score viewer by double-clicking it
- Added settings at the top left of the graph so you can choose whether the playback line uses Hover Follow or moves by click, playback-line dragging, and right-click sticky dragging
- Settings in the bottom info panel are now hidden automatically
- Game mode now behaves more like beatoraja
- Added an LR2-style Lunatic mode (negative STOP warp, SCROLL ignored)
- Green number, lane height, lane cover, and HS-FIX are now configurable
- Lane height and lane cover can also be adjusted by dragging
- Slider values are now saved
- Sliders can now be fine-tuned with the mouse wheel

## Notes about existing behavior
- The score viewer can also be moved by dragging or using the mouse wheel`;
  const VERSION_NOTIFICATION_CONTENT = {
    ja: {
      title: "BMS Info Extender リリースノート",
      body: RELEASE_NOTES_JA,
      languageLabel: "言語",
      dontShowAgainLabel: "このバージョンの通知を再度表示しない",
      okLabel: "OK",
      languageOptions: {
        ja: "日本語",
        en: "English"
      }
    },
    en: {
      title: "BMS Info Extender Release Notes",
      body: RELEASE_NOTES_EN,
      languageLabel: "Language",
      dontShowAgainLabel: "Do not show this version notice again",
      okLabel: "OK",
      languageOptions: {
        ja: "日本語",
        en: "English"
      }
    }
  };
  let scoreLoaderContextPromise = null;
  let activeBmsPreviewRuntime = null;

  const BMS_IR_HOSTS = new Set(["www.dream-pro.info", "bms-ir.org", "www.bms-ir.org"]);
  const BMS_IR_SONG_PATH = "/new/song";
  const BMS_IR_MD5_PATTERN = /^[0-9a-fA-F]{32}$/;
  const BMS_IR_SELECTORS = {
    displaySwitcherCandidates: "#box > p",
    displaySwitcherButton: "a.button"
  };
  const BMS_IR_THEME = {
    dctx: "#cfcfcf",
    dcbk: "#090909",
    hdtx: "#ddd",
    hdbk: "#252525",
    linkColor: "#9fc7ff",
    linkHoverColor: "#fff"
  };
  const STELLAVERSE_THEMES = {
    dark: {
      dctx: "#fafafa",
      dcbk: "#09090b",
      hdtx: "#fafafa",
      hdbk: "#18191d",
      linkColor: "#93c5fd",
      linkHoverColor: "#bfdbfe"
    },
    light: {
      dctx: "#09090b",
      dcbk: "#ffffff",
      hdtx: "#09090b",
      hdbk: "#e9eaed",
      linkColor: "#2563eb",
      linkHoverColor: "#1d4ed8"
    }
  };
  const MOCHA_THEME = {
    dctx: "#ffffff",
    dcbk: "#333333",
    hdtx: "#ffffff",
    hdbk: "#666666",
    linkColor: "#8888ff",
    linkHoverColor: "#ff88ff"
  };
  const STELLAVERSE_SELECTORS = {
    threadRoot: "#thread-1",
    targetElem: "#scroll-area > section > main > h2",
    tableContainer: '[data-slot="table-container"]',
    tableRow: '[data-slot="table-row"]',
    tableHead: '[data-slot="table-head"]',
    tableCell: '[data-slot="table-cell"]',
    anchor: "a"
  };
  const STELLAVERSE_INDEXES = {
    levelCell: 0,
    keyCell: 1,
    bpmCell: 2,
    notesCell: 3,
    judgeCell: 4,
    totalCell: 5,
    songUrlCell: 6,
    chartUrlCell: 7,
    commentCell: 8,
    irLinksCell: 9,
    viewerLinkCell: 10,
    // 0:レベル行、1:BPM行、2:判定行、3:曲URL行、4:差分URL行、5:コメント行、6:IRリンク行
    removeRowsAfterSuccess: [0, 1, 6]
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
   * @property {string=} linkColor
   * @property {string=} linkHoverColor
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
   * @property {Element|null} threadRoot
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

  void initializeVersionNotification();
  bootstrap();

  async function initializeVersionNotification() {
    const currentVersion = getCurrentScriptVersion();
    if (!shouldShowVersionNotification(currentVersion)) {
      persistNotifiedVersion(currentVersion);
      return;
    }
    await ensureDocumentBodyReady();
    if (!document.body || document.getElementById(VERSION_NOTIFICATION_MODAL_ID)) {
      return;
    }
    showVersionNotificationModal({
      version: currentVersion,
      notificationContent: getVersionNotificationContent(),
      initialLanguage: getPersistedNotificationLanguage()
    });
  }

  function getCurrentScriptVersion() {
    return typeof GM_info === "object" && GM_info?.script?.version
      ? String(GM_info.script.version)
      : SCRIPT_VERSION_FALLBACK;
  }

  function getVersionNotificationContent() {
    return VERSION_NOTIFICATION_CONTENT;
  }

  function shouldShowVersionNotification(currentVersion) {
    const lastNotifiedVersion = getLastNotifiedVersion();
    if (lastNotifiedVersion === currentVersion) {
      return false;
    }
    if (!lastNotifiedVersion) {
      return true;
    }
    if (!SKIP_VERSION_NOTIFICATION_FROM) {
      return true;
    }
    const thresholdComparison = compareVersionStrings(
      lastNotifiedVersion,
      SKIP_VERSION_NOTIFICATION_FROM,
    );
    if (thresholdComparison === null) {
      return true;
    }
    return thresholdComparison < 0;
  }

  function compareVersionStrings(leftVersion, rightVersion) {
    const leftParts = parseVersionString(leftVersion);
    const rightParts = parseVersionString(rightVersion);
    if (!leftParts || !rightParts) {
      return null;
    }
    const maxLength = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < maxLength; index += 1) {
      const leftPart = leftParts[index] ?? 0;
      const rightPart = rightParts[index] ?? 0;
      if (leftPart < rightPart) {
        return -1;
      }
      if (leftPart > rightPart) {
        return 1;
      }
    }
    return 0;
  }

  function parseVersionString(version) {
    const normalizedVersion = String(version ?? "").trim();
    if (!normalizedVersion) {
      return null;
    }
    const parts = normalizedVersion.split(".");
    if (parts.length === 0) {
      return null;
    }
    const parsedParts = [];
    for (const part of parts) {
      if (!/^\d+$/.test(part)) {
        return null;
      }
      parsedParts.push(Number(part));
    }
    return parsedParts;
  }

  function getLastNotifiedVersion() {
    return typeof GM_getValue === "function"
      ? String(GM_getValue(VERSION_NOTIFICATION_STORAGE_KEYS.lastNotifiedVersion, ""))
      : "";
  }

  function persistNotifiedVersion(version) {
    if (typeof GM_setValue === "function") {
      GM_setValue(VERSION_NOTIFICATION_STORAGE_KEYS.lastNotifiedVersion, version);
    }
  }

  function getPersistedNotificationLanguage() {
    const persistedLanguage = typeof GM_getValue === "function"
      ? String(GM_getValue(VERSION_NOTIFICATION_STORAGE_KEYS.notificationLanguage, VERSION_NOTIFICATION_DEFAULT_LANGUAGE))
      : VERSION_NOTIFICATION_DEFAULT_LANGUAGE;
    return persistedLanguage === "en" ? "en" : "ja";
  }

  function persistNotificationLanguage(language) {
    if (typeof GM_setValue === "function") {
      GM_setValue(VERSION_NOTIFICATION_STORAGE_KEYS.notificationLanguage, language === "en" ? "en" : "ja");
    }
  }

  function ensureDocumentBodyReady() {
    if (document.body) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const onReady = () => {
        if (!document.body) {
          return;
        }
        document.removeEventListener("DOMContentLoaded", onReady);
        resolve();
      };
      document.addEventListener("DOMContentLoaded", onReady);
    });
  }

  function showVersionNotificationModal({ version, notificationContent, initialLanguage }) {
    const host = document.createElement("div");
    host.id = VERSION_NOTIFICATION_MODAL_ID;
    const shadowRoot = host.attachShadow({ mode: "open" });
    const styleElement = document.createElement("style");
    styleElement.textContent = VERSION_NOTIFICATION_STYLE;

    const overlay = document.createElement("div");
    overlay.className = "bmsie-version-notice-overlay";

    const windowElement = document.createElement("div");
    windowElement.className = "bmsie-version-notice-window";

    const versionElement = document.createElement("p");
    versionElement.className = "bmsie-version-notice-version";

    const titleElement = document.createElement("h2");
    titleElement.className = "bmsie-version-notice-title";

    const contentElement = document.createElement("div");
    contentElement.className = "bmsie-version-notice-content";

    const controlsElement = document.createElement("div");
    controlsElement.className = "bmsie-version-notice-controls";

    const languageLabel = document.createElement("label");
    languageLabel.className = "bmsie-version-notice-language";

    const languageLabelText = document.createElement("span");
    const languageSelect = document.createElement("select");
    languageSelect.className = "bmsie-version-notice-select";
    languageSelect.append(
      createNotificationLanguageOption("ja", "日本語"),
      createNotificationLanguageOption("en", "English")
    );

    languageLabel.append(languageLabelText, languageSelect);
    controlsElement.append(languageLabel);

    const footerElement = document.createElement("div");
    footerElement.className = "bmsie-version-notice-footer";

    const checkboxLabel = document.createElement("label");
    checkboxLabel.className = "bmsie-version-notice-checkbox";
    const suppressCheckbox = document.createElement("input");
    suppressCheckbox.type = "checkbox";
    suppressCheckbox.checked = false;
    const checkboxText = document.createElement("span");
    checkboxLabel.append(suppressCheckbox, checkboxText);

    const okButton = document.createElement("button");
    okButton.type = "button";
    okButton.className = "bmsie-version-notice-ok";

    footerElement.append(checkboxLabel, okButton);
    windowElement.append(versionElement, titleElement, contentElement, controlsElement, footerElement);
    overlay.append(windowElement);

    let currentLanguage = initialLanguage === "en" ? "en" : "ja";
    languageSelect.value = currentLanguage;
    renderNotificationLanguage(currentLanguage);

    languageSelect.addEventListener("change", () => {
      currentLanguage = languageSelect.value === "en" ? "en" : "ja";
      persistNotificationLanguage(currentLanguage);
      renderNotificationLanguage(currentLanguage);
    });

    okButton.addEventListener("click", () => {
      if (suppressCheckbox.checked) {
        persistNotifiedVersion(version);
      }
      host.remove();
    });

    shadowRoot.append(styleElement, overlay);
    document.body.appendChild(host);

    function renderNotificationLanguage(language) {
      const localizedContent = notificationContent[language] ?? notificationContent.ja;
      versionElement.textContent = `version: ${version}`;
      titleElement.textContent = localizedContent.title;
      languageLabelText.textContent = localizedContent.languageLabel;
      checkboxText.textContent = localizedContent.dontShowAgainLabel;
      okButton.textContent = localizedContent.okLabel;
      updateNotificationLanguageOptions(languageSelect, localizedContent.languageOptions);
      renderNotificationBody(contentElement, localizedContent.body);
    }
  }

  function createNotificationLanguageOption(value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function updateNotificationLanguageOptions(languageSelect, languageOptions = {}) {
    if (!languageSelect) {
      return;
    }
    for (const option of languageSelect.options) {
      option.textContent = languageOptions[option.value] ?? option.textContent;
    }
  }

  function renderNotificationBody(contentElement, bodyText = "") {
    contentElement.textContent = bodyText;
  }

  /**
   * 対応サイトごとの初期化だけをトップレベルから起動する。
   * @returns {void}
   */
  function bootstrap() {
    if (isBmsIrSongUrl(location.href)) {
      bmsIr();
      return;
    }

    switch (location.hostname) {
      case 'stellabms.xyz':
        stellaverse();
        break;
      case 'www.gaftalk.com':
        minir();
        break;
      case 'mocha-repository.info':
        mocha();
        break;
      default:
        break;
    }
  }

  function isBmsIrSongUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return BMS_IR_HOSTS.has(parsedUrl.hostname) && parsedUrl.pathname === BMS_IR_SONG_PATH;
    } catch {
      return false;
    }
  }

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
      // SPA 遷移で DOM が差し替わる前に、前ページの preview runtime を破棄する。
      resetActiveBmsPreviewRuntime();

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

  function resetActiveBmsPreviewRuntime() {
    if (!activeBmsPreviewRuntime) {
      return;
    }
    activeBmsPreviewRuntime.destroy();
    activeBmsPreviewRuntime = null;
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
    const threadRoot = document.querySelector(STELLAVERSE_SELECTORS.threadRoot);
    const targetElem = document.querySelector(STELLAVERSE_SELECTORS.targetElem);
    const tableContainer = document.querySelector(STELLAVERSE_SELECTORS.tableContainer);
    const tableRows = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableRow)) : [];
    const tableHeads = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableHead)) : [];
    const tableCells = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.tableCell)) : [];
    const anchors = tableContainer ? Array.from(tableContainer.querySelectorAll(STELLAVERSE_SELECTORS.anchor)) : [];

    return { threadRoot, targetElem, tableContainer, tableRows, tableHeads, tableCells, anchors };
  }

  /**
   * STELLAVERSE の thread 内から投稿日時文字列を抽出する。
   * @param {Element} threadRoot
   * @returns {string|null}
   */
  function extractStellaversePostedDatetime(threadRoot) {
    const datePattern = /@\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/;
    for (const paragraph of threadRoot.querySelectorAll("p")) {
      const match = paragraph.textContent.match(datePattern);
      if (match) {
        return match[1];
      }
    }
    return null;
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
  // BMS-IR
  //   近年のSPAサイトみたいにページが書き変わらないので処理が単純で良い
  // ====================================================================================================
  /**
   * BMS-IR 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function bmsIr() {
    console.info("BMS-IRの処理に入りました");

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
      if (!isBmsIrSongUrl(location.href)) {
        return;
      }
      console.info("BMS-IR曲ページの書き換え処理に入りました");

      // 現在のウィンドウのGETパラメータを取得
      const targetmd5 = new URL(window.location.href).searchParams.get("songmd5");
      const displaySwitcherElement = findBmsIrDisplaySwitcherElement();

      if (BMS_IR_MD5_PATTERN.test(targetmd5 ?? "") && displaySwitcherElement) {
        const pageContext = {
          identifiers: { md5: targetmd5, sha256: null, bmsid: null },
          insertion: { element: displaySwitcherElement, position: "beforebegin" },
          theme: BMS_IR_THEME
        };
        // テンプレートを挿入
        const container = insertBmsDataTemplate(pageContext);
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData(pageContext, container)) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
        } else {
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
        }
      } else {
        console.info("❌ BMS-IRのページ書き換えはスキップされました。MD5か表示切替要素が取得できませんでした");
      }
    }
  }

  function findBmsIrDisplaySwitcherElement() {
    const candidates = Array.from(document.querySelectorAll(BMS_IR_SELECTORS.displaySwitcherCandidates));
    return candidates.find((element) => {
      if (!element.textContent.trim().startsWith("表示:")) {
        return false;
      }

      const buttons = Array.from(element.querySelectorAll(BMS_IR_SELECTORS.displaySwitcherButton));
      return ["new", "old", "both"].every((view) => buttons.some((button) => isBmsIrViewButton(button, view)));
    }) ?? null;
  }

  function isBmsIrViewButton(button, view) {
    try {
      const url = new URL(button.getAttribute("href") ?? button.href, location.href);
      return url.pathname === BMS_IR_SONG_PATH && url.searchParams.get("view") === view;
    } catch {
      return false;
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
      // SPA遷移直後、前回URLで挿入した拡張情報DOMがまだ残っている場合は、
      // ReactのDOM差し替え完了を待つため処理をスキップする。
      if (document.getElementById('bmsdata-container')) {
        console.info('前回の拡張情報がまだ残っているためスキップします');
        return;
      }
      // 投稿日時、経過時間の差し込み先、譜面情報テーブルをまとめて取得する。
      const { threadRoot, targetElem, tableContainer, tableRows, tableHeads, tableCells, anchors } = getStellaverseDomRefs();

      if (!threadRoot || !targetElem || !tableContainer) { console.info("処理対象エレメントのいずれかが見つかりません"); return; }

      const postedDatetime = extractStellaversePostedDatetime(threadRoot);
      if (!postedDatetime) { console.info("❌ 投稿日時がパースできませんでした"); return; }

      const postedDate = new Date(postedDatetime.replace(/\//g, '-'));
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

      // TOTAL と NOTES は後段の計算で使うので変数に取っておく。
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
        if (a.textContent.trim() === "Bokutachi") {
          bokutachi = a.href;
        } else {
          const href = a.href;
          const match = href.match(/[a-f0-9]{32}$/i); // 末尾の32桁16進数、譜面ビューアリンクから抽出
          if (match) {
            targetmd5 = match[0];
          }
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
          theme: isDarkMode ? STELLAVERSE_THEMES.dark : STELLAVERSE_THEMES.light
        };
        // テンプレートを挿入
        const container = insertBmsDataTemplate(pageContext);
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData(pageContext, container)) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
          // STELLAVERSE 側と完全に重複する行だけを消し、補助情報のある行は残す。
          const bokutachiLink = queryBmsDataElement(container, "bd-bokutachi");
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
          theme: MOCHA_THEME
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
              const EZ2PATTERNLink = document.createElement("a");
              EZ2PATTERNLink.href = `https://ez2pattern.kr/bms/chart?md5=${md5}`;
              EZ2PATTERNLink.target = "_blank";
              EZ2PATTERNLink.textContent = "EZ2PATTERN";
              targetTd.appendChild(document.createTextNode("　"));
              targetTd.appendChild(viewerLink);
              targetTd.appendChild(document.createTextNode("　"));
              targetTd.appendChild(EZ2PATTERNLink);
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
   * ページコンテキストに応じたテーマを適用した空パネルを挿入する。
   * @param {PageContext} pageContext
   * @returns {HTMLElement}
   */
  function insertBmsDataTemplate(pageContext) {
    return PreviewRuntime.insertBmsDataContainer({
      documentRef: document,
      insertion: pageContext.insertion,
      theme: pageContext.theme,
    });
  }

  function queryBmsDataElement(container, id) {
    return container?.__bmsDataPanel?.querySelector?.(`#${id}`)
      ?? container?.shadowRoot?.querySelector?.(`#${id}`)
      ?? container?.querySelector?.(`#${id}`)
      ?? null;
  }

  /**
   * 外部データ取得から描画、グラフ描画までのパイプラインを実行する。
   * @param {PageContext} pageContext
   * @param {HTMLElement} container
   * @returns {Promise<boolean>}
   */
  async function insertBmsData(pageContext, container) {
    // 取得失敗時は差し込んだ空パネルを片付けて終了する。
    const normalizedRecord = await PreviewRuntime.fetchBmsInfoRecordByIdentifiers(pageContext.identifiers);
    if (!normalizedRecord) {
      container.remove();
      return false;
    }

    PreviewRuntime.renderBmsData(container, normalizedRecord);
    if (container.__bmsPreviewRuntime) {
      container.__bmsPreviewRuntime.destroy();
    }
    // 同一ページ内の再描画では、差し替え前に現在の preview runtime を破棄する。
    resetActiveBmsPreviewRuntime();
    const previewPreferenceStorage = PreviewRuntime.createPreviewPreferenceStorage({
      read: (key, fallbackValue) => {
        return typeof GM_getValue === "function"
          ? GM_getValue(key, fallbackValue)
          : fallbackValue;
      },
      write: (key, value) => {
        if (typeof GM_setValue === "function") {
          GM_setValue(key, value);
        }
      },
    });
    container.__bmsPreviewRuntime = PreviewRuntime.createBmsInfoPreview({
      container,
      documentRef: document,
      loadParsedScore: async (record) => {
        const loaderContext = await ensureScoreLoaderContext();
        const parsedResult = await loaderContext.loader.loadParsedScore(record.sha256.toLowerCase());
        return parsedResult.score;
      },
      prefetchParsedScore: async (record) => {
        if (!record?.sha256) {
          return;
        }
        const loaderContext = await ensureScoreLoaderContext();
        await loaderContext.loader.prefetchScore(record.sha256.toLowerCase());
      },
      ...previewPreferenceStorage,
      onRuntimeError: (error) => {
        console.warn("Score viewer runtime failed:", error);
      },
    });
    activeBmsPreviewRuntime = container.__bmsPreviewRuntime;
    container.__bmsPreviewRuntime.setRecord(normalizedRecord);
    if (normalizedRecord.sha256) {
      void container.__bmsPreviewRuntime.prefetch();
    }

    return true;
  }

  /**
   * BMS SEARCH API で SHA256 に対応する譜面が存在するか確認する。
   * @param {string} sha256
   * @returns {Promise<boolean>}
   */
  async function checkBmsSearchPatternExists(sha256) {
    return PreviewRuntime.checkBmsSearchPatternExists(sha256);
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

  function createUserscriptFetch() {
    if (typeof GM_xmlhttpRequest !== "function") {
      return (...args) => fetch(...args);
    }

    return (resource, options = {}) => new Promise((resolve, reject) => {
      const fetchOptions = options ?? {};
      const url = resolveFetchResourceUrl(resource);
      if (!url) {
        reject(new Error("Unsupported fetch resource."));
        return;
      }

      GM_xmlhttpRequest({
        method: typeof fetchOptions.method === "string" ? fetchOptions.method : "GET",
        url,
        headers: normalizeFetchHeaders(fetchOptions.headers),
        data: fetchOptions.body,
        responseType: "arraybuffer",
        onload: (response) => {
          const body = normalizeResponseArrayBuffer(response.response);
          resolve(createUserscriptFetchResponse({
            body,
            requestedUrl: url,
            response,
          }));
        },
        onerror: (response) => {
          reject(createUserscriptRequestError("GM_xmlhttpRequest failed", url, response));
        },
        ontimeout: (response) => {
          reject(createUserscriptRequestError("GM_xmlhttpRequest timed out", url, response));
        },
        onabort: (response) => {
          reject(createUserscriptRequestError("GM_xmlhttpRequest was aborted", url, response));
        },
      });
    });
  }

  function resolveFetchResourceUrl(resource) {
    if (typeof resource === "string") {
      return resource;
    }
    if (resource instanceof URL) {
      return resource.href;
    }
    if (typeof resource?.url === "string") {
      return resource.url;
    }
    return null;
  }

  function normalizeFetchHeaders(headers) {
    if (!headers) {
      return undefined;
    }
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) {
      return Object.fromEntries(headers);
    }
    return headers;
  }

  function normalizeResponseArrayBuffer(responseBody) {
    if (responseBody instanceof ArrayBuffer) {
      return responseBody.slice(0);
    }
    if (ArrayBuffer.isView(responseBody)) {
      return responseBody.buffer.slice(
        responseBody.byteOffset,
        responseBody.byteOffset + responseBody.byteLength
      );
    }
    if (typeof responseBody === "string") {
      return new TextEncoder().encode(responseBody).buffer;
    }
    return new ArrayBuffer(0);
  }

  function createUserscriptFetchResponse({ body, requestedUrl, response }) {
    const status = Number.isFinite(response.status) ? response.status : 0;
    const statusText = typeof response.statusText === "string" ? response.statusText : "";
    const url = typeof response.finalUrl === "string" && response.finalUrl.length > 0
      ? response.finalUrl
      : requestedUrl;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText,
      url,
      async arrayBuffer() {
        return body.slice(0);
      },
      async text() {
        return new TextDecoder().decode(body);
      },
    };
  }

  function createUserscriptRequestError(message, url, response) {
    const statusText = typeof response?.statusText === "string" && response.statusText.length > 0
      ? `: ${response.statusText}`
      : "";
    return new Error(`${message}: ${url}${statusText}`);
  }

  async function ensureScoreLoaderContext() {
    if (scoreLoaderContextPromise) {
      return scoreLoaderContextPromise;
    }

    scoreLoaderContextPromise = Promise.resolve()
      .then(() => ({
        loader: createScoreLoader({
          scoreSources: [
            { baseUrl: SCORE_BASE_URL, pathStyle: "sharded" },
            { baseUrl: SCORE_R2_BASE_URL, pathStyle: "flat" },
          ],
          fetchImpl: userscriptFetch,
        }),
      }))
      .catch((error) => {
        scoreLoaderContextPromise = null;
        throw error;
      });

    return scoreLoaderContextPromise;
  }

})();
