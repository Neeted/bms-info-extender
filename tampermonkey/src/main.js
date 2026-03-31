import * as PreviewRuntime from "../../shared/preview-runtime/index.js";

// 2.1.0 譜面 gzip の取得元を Netlify 優先 + R2 フォールバックへ変更
// 2.0.1 STELLAVERSE SPA遷移時、前回URLの拡張情報DOMが残っている場合にスキップするガードを追加
// 2.0.0 Gameモードを beatoraja 寄りの前方スイープ描画へ切り替え
// 1.7.1 Game モード再生の hot path を軽量化し、graph の static/dynamic 分離と shared persistence helper を追加
// 1.7.0 Game モードへ SCROLL 対応を追加し、beatoraja 寄りの signed displacement 描画を実装
// 1.6.7 Editor メニュー行の select を border-box 化し、重なりとはみ出しを修正
// 1.6.6 Editor メニュー行のドロップダウンを 2:3 配分で横並び表示に調整
// 1.6.5 不可視ノーツ可視化の枠線座標を調整し、セパレーターへのはみ出しを修正
// 1.6.4 不可視ノーツ可視化の左枠がセパレーターで欠ける不具合を修正
// 1.6.3 譜面ビューアへ不可視ノーツ表示トグルを追加
// 1.6.2 LNOBJ 譜面で Editor モードにだけ出る誤ノーツや欠落ノーツを修正
// 1.6.1 Editor モードの timing を parser 由来の正規 action に切り替え、ギミック譜面で停止する不具合を修正
// 1.6.0 譜面ビューアへ Time / Editor / Game モード切替を追加
// 1.5.0 preview/runtime の source を shared/dev/userscript へ分離し、build 生成へ移行
// 1.4.0 preview runtime を dev page と共通化し、graph hover 時の無駄な再描画を削減
// 1.3.0 譜面ビューアへ SCROLL マーカー表示を追加
// 1.2.0 譜面ビューアを userscript 本体へ統合し、グラフ hover/click 連携を追加
// 1.1.0 外部データ取得失敗時のフォールバック処理を追加(LR2IR、MochaでMD5や譜面ビューアへのリンクを表示)
// 1.0.5 誤字修正

// @run-at document-startでとにかく最速でスクリプトを起動して、ページが書き換え処理可能な状態かどうかはサイトごとに固有の判定を行う

(function () {
  'use strict';
  console.info("BMS Info Extenderが起動しました");

  // 使用するフォントを準備
  const fontCSS = GM_getResourceText("googlefont");
  GM_addStyle(fontCSS);

  const SCORE_BASE_URL = "https://bms-info-extender.netlify.app/score";
  const SCORE_R2_BASE_URL = "https://bms.howan.jp/score";
  const SCORE_PARSER_BASE_URL = "https://bms-info-extender.netlify.app/score-parser";
  const SCORE_PARSER_VERSION = "0.6.3";
  const BMSSEARCH_PATTERN_PAGE_BASE_URL = "https://bmssearch.net/patterns";
  const SCRIPT_VERSION_FALLBACK = "2.1.0";
  const SKIP_VERSION_NOTIFICATION = false;
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
    .bmsie-version-notice-section + .bmsie-version-notice-section {
      margin-top: 14px;
    }
    .bmsie-version-notice-section-title {
      margin: 0 0 8px;
      font-size: 1rem;
      line-height: 1.4;
      color: #ffffff;
    }
    .bmsie-version-notice-list {
      margin: 0;
      padding-left: 1.25rem;
      line-height: 1.6;
    }
    .bmsie-version-notice-sublist {
      margin-top: 6px;
      padding-left: 1.1rem;
      line-height: 1.5;
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
  const VERSION_NOTIFICATION_CONTENT = {
    "2.1.0": {
      ja: {
        title: "譜面ビューアに変更を加えました",
        sections: [
          {
            title: null,
            items: [
              "判定ラインをドラッグ可能にしました",
              "譜面ビューアをダブルクリックで再生・停止できるようにしました",
              "グラフ左上に設定を追加し、再生ラインを Hover Follow または Click・再生ラインのドラッグ・右クリックの掴みっぱなしで動かす設定を選べるようにしました",
              "下部情報ウィンドウの設定情報は自動的に隠すようにしました",
              "Game モードの挙動を beatoraja に近づけました",
              {
                text: "緑数字、レーン高さ、レーンカバー、HS-FIX が設定可能です",
                subitems: [
                  "レーン高さ、レーンカバーはドラッグ可能です"
                ]
              },
              "スライダーの設定値を保存するようにしました",
              "スライダーはホイールで微調整可能です"
            ]
          },
          {
            title: "従来からの挙動について補足",
            items: [
              "譜面ビューアはドラッグやホイールでも動かすことができます"
            ]
          }
        ],
        languageLabel: "言語",
        dontShowAgainLabel: "このバージョンの通知を再度表示しない",
        okLabel: "OK",
        languageOptions: {
          ja: "日本語",
          en: "English"
        }
      },
      en: {
        title: "The score viewer has been updated",
        sections: [
          {
            title: null,
            items: [
              "The judge line is now draggable",
              "You can now play or stop the score viewer by double-clicking it",
              "A new graph setting lets you choose whether the playback line follows hover or uses clicks, playback-line dragging, and right-click sticky dragging",
              "The settings in the bottom info panel are now hidden automatically",
              "Game mode now behaves more like beatoraja",
              {
                text: "Green number, lane height, lane cover, and HS-FIX are now configurable",
                subitems: [
                  "Lane height and lane cover can also be adjusted by dragging"
                ]
              },
              "Slider values are now persisted",
              "Sliders can now be fine-tuned with the mouse wheel"
            ]
          },
          {
            title: "Notes about existing behavior",
            items: [
              "The score viewer can still be moved by dragging or using the mouse wheel"
            ]
          }
        ],
        languageLabel: "Language",
        dontShowAgainLabel: "Do not show this version notice again",
        okLabel: "OK",
        languageOptions: {
          ja: "日本語",
          en: "English"
        }
      }
    }
  };
  let scoreLoaderContextPromise = null;
  let activeBmsPreviewRuntime = null;

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

  void initializeVersionNotification();
  bootstrap();

  async function initializeVersionNotification() {
    const currentVersion = getCurrentScriptVersion();
    if (SKIP_VERSION_NOTIFICATION) {
      persistNotifiedVersion(currentVersion);
      return;
    }
    if (!shouldShowVersionNotification(currentVersion)) {
      return;
    }
    const notificationContent = getVersionNotificationContent(currentVersion);
    if (!notificationContent) {
      persistNotifiedVersion(currentVersion);
      return;
    }
    await ensureDocumentBodyReady();
    if (!document.body || document.getElementById(VERSION_NOTIFICATION_MODAL_ID)) {
      return;
    }
    showVersionNotificationModal({
      version: currentVersion,
      notificationContent,
      initialLanguage: getPersistedNotificationLanguage()
    });
  }

  function getCurrentScriptVersion() {
    return typeof GM_info === "object" && GM_info?.script?.version
      ? String(GM_info.script.version)
      : SCRIPT_VERSION_FALLBACK;
  }

  function getVersionNotificationContent(version) {
    return VERSION_NOTIFICATION_CONTENT[version] ?? null;
  }

  function shouldShowVersionNotification(currentVersion) {
    return getLastNotifiedVersion() !== currentVersion;
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
      renderNotificationSections(contentElement, localizedContent.sections);
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

  function renderNotificationSections(contentElement, sections) {
    contentElement.replaceChildren();
    for (const section of sections) {
      const sectionElement = document.createElement("section");
      sectionElement.className = "bmsie-version-notice-section";
      if (section.title) {
        const sectionTitleElement = document.createElement("h3");
        sectionTitleElement.className = "bmsie-version-notice-section-title";
        sectionTitleElement.textContent = section.title;
        sectionElement.appendChild(sectionTitleElement);
      }
      sectionElement.appendChild(createNotificationList(section.items));
      contentElement.appendChild(sectionElement);
    }
  }

  function createNotificationList(items = []) {
    const listElement = document.createElement("ul");
    listElement.className = "bmsie-version-notice-list";
    for (const item of items) {
      const listItemElement = document.createElement("li");
      if (typeof item === "string") {
        listItemElement.textContent = item;
      } else {
        listItemElement.textContent = item.text;
        if (Array.isArray(item.subitems) && item.subitems.length > 0) {
          const sublistElement = document.createElement("ul");
          sublistElement.className = "bmsie-version-notice-sublist";
          for (const subitem of item.subitems) {
            const subitemElement = document.createElement("li");
            subitemElement.textContent = subitem;
            sublistElement.appendChild(subitemElement);
          }
          listItemElement.appendChild(sublistElement);
        }
      }
      listElement.appendChild(listItemElement);
    }
    return listElement;
  }

  /**
   * 対応サイトごとの初期化だけをトップレベルから起動する。
   * @returns {void}
   */
  function bootstrap() {
    switch (location.hostname) {
      case 'www.dream-pro.info':
        lr2ir();
        break;
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
      // SPA遷移直後、前回URLで挿入した拡張情報DOMがまだ残っている場合は、
      // ReactのDOM差し替え完了を待つため処理をスキップする。
      if (document.getElementById('bmsdata-container')) {
        console.info('前回の拡張情報がまだ残っているためスキップします');
        return;
      }
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

  async function ensureScoreLoaderContext() {
    if (scoreLoaderContextPromise) {
      return scoreLoaderContextPromise;
    }

    const moduleUrl = `${SCORE_PARSER_BASE_URL}/v${SCORE_PARSER_VERSION}/score_loader.js`;
    scoreLoaderContextPromise = import(moduleUrl)
      .then((module) => ({
        moduleUrl,
        loader: module.createScoreLoader({
          scoreSources: [
            { baseUrl: SCORE_BASE_URL, pathStyle: "sharded" },
            { baseUrl: SCORE_R2_BASE_URL, pathStyle: "flat" },
          ],
        }),
      }))
      .catch((error) => {
        scoreLoaderContextPromise = null;
        throw error;
      });

    return scoreLoaderContextPromise;
  }

})();
