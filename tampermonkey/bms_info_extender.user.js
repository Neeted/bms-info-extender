// ==UserScript==
// @name         BMS Info Extender
// @namespace    https://github.com/Neeted
// @version      1.1.0
// @description  LR2IR、MinIR、Mocha、STELLAVERSEで詳細メタデータ、ノーツ分布/BPM推移グラフなどを表示する
// @author       ﾏﾝﾊｯﾀﾝｶﾞｯﾌｪ
// @match        http://www.dream-pro.info/~lavalse/LR2IR/search.cgi*
// @match        https://stellabms.xyz/*
// @match        https://www.gaftalk.com/minir/*
// @match        https://mocha-repository.info/song.php*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @connect      bms.howan.jp
// @resource     googlefont https://fonts.googleapis.com/css2?family=Inconsolata&family=Noto+Sans+JP&display=swap
// @updateURL    https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @downloadURL  https://neeted.github.io/bms-info-extender/tampermonkey/bms_info_extender.user.js
// @run-at document-start
// ==/UserScript==

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
    #bd-graph { padding: 0px; border-width: 0px; background-color: #000; overflow-x: auto; line-height: 0; scrollbar-color: var(--bd-hdbk) black; scrollbar-width: thin; }
    #bd-graph-canvas { background-color: #000; }
    #bd-graph-tooltip { line-height: 1rem; position: fixed; background: rgba(32, 32, 64, 0.8); color: #fff; padding: 4px 8px; font-size: 0.875rem; pointer-events: none; border-radius: 4px; display: none; z-index: 10; white-space: nowrap; }
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
              <a href="" id="bd-lr2ir" style="display: none;">LR2IR</a><a href="" id="bd-minir" style="display: none;">MinIR</a><a href="" id="bd-mocha" style="display: none;">Mocha</a><a href="" id="bd-viewer" style="display: none;">Viewer</a><a href="" id="bd-bokutachi" style="display: none;">Bokutachi</a><a href="" id="bd-stellaverse" style="display: none;">STELLAVERSE</a>
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

  function watchSpaPage({ siteName, matchUrl, updatePage, isSettled }) {
    let lastUrl = location.href;
    let completedUrl = null;
    let observer = null;
    let isUpdating = false;

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

  function findAnchorByText(anchors, text) {
    let matchedAnchor = null;
    for (const anchor of anchors) {
      if (anchor.innerText == text) {
        matchedAnchor = anchor;
      }
    }
    return matchedAnchor;
  }

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
      // 曲ページではない場合retun
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
      // MD5かBMSIDが取得済み、かつ、ターゲット要素が特定済み、の場合にはbmsdataの挿入に進む
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
          // 外部データが取得できなかった場合のフォールバック処理
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
            document.querySelector(LR2IR_SELECTORS.search).after(table_element);
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
      // スレッドページではない場合return
      if (!location.href.startsWith("https://stellabms.xyz/thread/")) {
        return;
      }
      console.info("スレッドページの書き換え処理に入りました");
      // 経過時間の表示処理用エレメント取得
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
      markUpdated(); // 経過時間表示処理完了時点でフラグを立てる

      // テーブルの1行目(レベル、key)を削除した後も、以降の index 解釈は従来どおり「削除後の並び」に合わせる
      const firstTableRow = stellaverseRefs.tableRows[0];
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
      // トータルを抽出(判定も抽出し、拡張した表に統合することで行数削減を考えたが、#TOTAL未定義の場合の長い表示の置き場所がなくなるのでやめた)
      const totalCellElement = tableCells[STELLAVERSE_INDEXES.totalCell];
      const notesCellElement = tableCells[STELLAVERSE_INDEXES.notesCell];
      const total = Number(totalCellElement.textContent.trim());
      const notes = Number(notesCellElement.textContent.trim());
      // const judge = tableCells[2].textContent.trim();

      // トータル0の場合は未定義なので、beatorajaとLR2の場合の値を計算し、セルの内容を書き換える
      let beatorajaTotal;
      let lr2Total;
      if (total === 0) {
        beatorajaTotal = (Math.max(260.0, 7.605 * notes / (0.01 * notes + 6.5)));
        lr2Total = 160.0 + (notes + Math.min(Math.max(notes - 400, 0), 200)) * 0.16;
        totalCellElement.textContent = `0, so #TOTAL is undefined. beatoraja is ${beatorajaTotal.toFixed(2)}(${(beatorajaTotal / notes).toFixed(3)}T/N), LR2 is ${lr2Total.toFixed(2)}(${(lr2Total / notes).toFixed(3)}T/N).`;
      }

      // MD5抽出、Bokutachiリンク抽出
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
        // 両方のリンクが見つかったらbreak
        if (targetmd5 && bokutachi) break;
      }
      // MD5が取得できている場合には、bmsdataの挿入に進む
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
          // 最後まで置換がうまく行った場合、更にBPM・ノーツ数の行と、IRリンク・譜面ビューアーの行を削除する。他はTOTAL値未定義が分かる場合があるなど必ずしも重複していない情報なので残す。
          container.querySelector("#bd-bokutachi").setAttribute("href", `${bokutachi}`);
          container.querySelector("#bd-bokutachi").setAttribute("style", "display: inline;");
          const rowsToRemoveAfterSuccess = STELLAVERSE_INDEXES.removeRowsAfterSuccess.map(index => tableRows[index]);
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
      // 曲ページではない、場合return
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
      // sha256が取得できている、かつ、ターゲット要素が取得済み、かつ、bmsdataが挿入済みではない、場合にはbmsdataの挿入に進む
      // (LN/CN/HCNの切り替え時に挿入済みになりうる)
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

      // sha256が取得済み、かつ、ターゲット要素が特定済み、の場合にはbmsdataの挿入に進む
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
            // 曲情報テーブルがある場合は重複する情報を削除する
            const rowsToRemove = [
              songInfoRows[MOCHA_ROW_INDEXES.otherIr],
              songInfoRows[MOCHA_ROW_INDEXES.bpm],
              songInfoRows[MOCHA_ROW_INDEXES.judgerank],
              songInfoRows[MOCHA_ROW_INDEXES.total],
              songInfoRows[MOCHA_ROW_INDEXES.totalNotes],
              songInfoRows[MOCHA_ROW_INDEXES.mode]
            ];
            rowsToRemove.forEach(row => {
              row.remove();
            });
          }
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
        } else {
          // 外部データの取得が出来なかった場合にはMocha内のLR2IRリンクからmd5を取得しハッシュと譜面ビューアへのリンクを表示する
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
          // LR2IRリンク要素取得
          const otherIrRow = songInfoRows[MOCHA_ROW_INDEXES.otherIr];
          const otherIrLinks = Array.from(otherIrRow.querySelectorAll(MOCHA_SELECTORS.anchor));
          const lr2irLink = otherIrLinks[MOCHA_LINK_INDEXES.lr2irInOtherIrRow];
          if (lr2irLink) {
            // hrefからmd5抽出
            const href = lr2irLink.getAttribute("href");
            const md5Match = href.match(/bmsmd5=([0-9a-fA-F]{32})/);
            const md5 = md5Match[1];

            // tbodyを取得し、末尾にsha256とmd5行を挿入
            const sha256Row = document.createElement("tr");
            sha256Row.setAttribute("height", "20");
            sha256Row.className = "ranking_header";
            sha256Row.innerHTML = `<td class="songinfo_header">Sha256</td><td class="songinfo_content">${targetsha256}</td>`;

            const md5Row = document.createElement("tr");
            md5Row.setAttribute("height", "20");
            md5Row.className = "ranking_header";
            md5Row.innerHTML = `<td class="songinfo_header">Md5</td><td class="songinfo_content">${md5}</td>`;

            songInfoBody.appendChild(sha256Row);
            songInfoBody.appendChild(md5Row);

            // 譜面ビューアへのリンクを追加
            const targetTd = otherIrRow.querySelector(MOCHA_SELECTORS.songInfoContentCell);
            const viewerLink = document.createElement("a");
            viewerLink.href = `https://bms-score-viewer.pages.dev/view?md5=${md5}`;
            viewerLink.target = "_blank";
            viewerLink.textContent = "Viewer";
            targetTd.appendChild(document.createTextNode("　"));
            targetTd.appendChild(viewerLink);
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
  //   テンプレートHTMLをinsertAdjacentHTML()で挿入する関数、サイトによって挿入先は異なるので、対象要素と挿入位置を引数で指定する
  //   ターゲット要素、ポジション、データセル文字色、データセル背景色、ヘッダーセル文字色、ヘッダーセル背景色
  // ====================================================================================================
  function ensureBmsDataStyleOnce() {
    if (document.getElementById(BMSDATA_STYLE_ID)) {
      return;
    }

    const styleElement = document.createElement("style");
    styleElement.id = BMSDATA_STYLE_ID;
    styleElement.textContent = BMSDATA_CSS;
    document.head.appendChild(styleElement);
  }

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

  async function insertBmsData(pageContext, container) {
    const rawRecord = await fetchBmsRecord(pageContext);
    if (!rawRecord) {
      container.remove();
      return false;
    }

    const normalizedRecord = normalizeBmsRecord(rawRecord);
    renderBmsData(container, normalizedRecord);

    const canvas = container.querySelector("#bd-graph-canvas");
    const tooltip = container.querySelector("#bd-graph-tooltip");
    drawDistributionGraph(canvas, tooltip, normalizedRecord);

    return true;
  }

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
      durationStr: `${(length / 1000).toFixed(2)} s`,
      notesStr: `${notes} (N:${n}, LN:${ln}, SCR:${s}, LNSCR:${ls})`,
      totalStr: `${total % 1 == 0 ? Math.round(total) : total} (${(total / notes).toFixed(3)} T/N)`,
      featuresStr,
      distribution: rawRecord.distribution,
      speedchange: rawRecord.speedchange,
      lanenotesArr: parseLaneNotes(mode, rawRecord.lanenotes),
      tables: parseTables(rawRecord.tables)
    };
  }

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
        tokens[baseIndex] + tokens[baseIndex + 1] ?? 0
      ]);
    }

    if (mode === 7 || mode === 14) {
      const move = lanenotesArr.splice(7, 1)[0];
      lanenotesArr.unshift(move);
    } else if (mode === 5 || mode === 10) {
      const move = lanenotesArr.splice(5, 1)[0];
      lanenotesArr.unshift(move);
    }

    return lanenotesArr;
  }

  function parseTables(tablesRaw) {
    try {
      return JSON.parse(tablesRaw);
    } catch {
      return [];
    }
  }

  function renderBmsData(container, normalizedRecord) {
    const getById = (id) => container.querySelector(`#${id}`);

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
    linkElement.setAttribute("href", href);
    linkElement.setAttribute("style", "display: inline;");
  }

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

  function renderTables(container, normalizedRecord) {
    const ul = container.querySelector("#bd-tables-ul");
    normalizedRecord.tables.forEach(text => {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
  }

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

  function drawDistributionGraph(canvas, tooltip, normalizedRecord) {
    const rectWidth = 4;
    const rectHeight = 2;
    const spacing = 1;
    const minValue = 1 / 8;
    const maxValue = 8;
    const minLog = Math.log10(minValue);
    const maxLog = Math.log10(maxValue);
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
})();
