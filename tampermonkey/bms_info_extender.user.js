// ==UserScript==
// @name         BMS Info Extender
// @namespace    https://github.com/Neeted
// @version      1.0.3
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

// @run-at document-startでとにかく最速でスクリプトを起動して、ページが書き換え処理可能な状態かどうかはサイトごとに固有の判定を行う

(function () {
  'use strict';
  console.info("BMS Info Extenderが起動しました");
  // 外部問い合わせとページ書き換えに必須のデータ、これが未定義のままなら書き換え処理には進まない
  let html_target_element;
  let html_target_dest;
  let targetmd5;
  let targetsha256;
  let targetbmsid;

  // 使用するフォントを準備
  const fontCSS = GM_getResourceText("googlefont");
  GM_addStyle(fontCSS);

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

      // 曲ページ「更新履歴」リンクのGETパラメータからbmsidを取得
      const a = document.getElementsByTagName("a"); // HTMLCollection
      for (let i = 0; i < a.length; i++) {
        if (a[i].innerText == "更新履歴") {
          targetbmsid = new URL(a[i].href).searchParams.get('bmsid');
        }
      }
      // 現在のウィンドウのGETパラメータを取得
      targetmd5 = new URL(window.location.href).searchParams.get('bmsmd5');

      // ターゲット要素特定
      // アーティスト名用<h2>がある場合は登録曲なので曲名の下を挿入先にする
      html_target_element = document.querySelector("#box > h2")
      html_target_dest = "afterend";
      // <h2>がない場合は検索窓の下を挿入先にする
      if (!html_target_element) {
        html_target_element = document.getElementById("search");
      }
      // MD5かBMSIDが取得済み、かつ、ターゲット要素が特定済み、の場合にはbmsdataの挿入に進む
      if ((targetmd5 || targetbmsid) && html_target_element && html_target_dest) {
        // テンプレートを挿入
        insertBmsDataTemplate(html_target_element, html_target_dest);
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData()) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
        } else {
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
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
    let alreadyUpdatedUrl;

    // 初回ページ読み込み完了時に試行
    // バックグラウンドでタブを開きつつそのタブをアクティブにしたタイミングによってはMutationObserverが反応せず、Visibilitychangeイベントも発火しない場合があったので必須
    if (document.readyState === "complete") {
      console.info("🔥 loadイベントは発火済でした");
      await updatePage();
    } else {
      window.addEventListener('load', async () => {
        console.info("🔥 loadイベントが発火しました");
        await updatePage();
      });
    }

    // タブがアクティブになったときに試行
    document.addEventListener("visibilitychange", async () => {
      console.info("🔥 Visibilitychangeイベントが発火しました");
      await updatePage();
    });

    // DOM変化時に試行、処理が終わったらURLが変化するまで監視を止める
    let lastUrl = location.href;
    let observer = null;

    function startObserving() {
      if (observer) return;

      console.log("👁️ MutationObserverによる監視を開始します");

      observer = new MutationObserver(async () => {
        console.info("MutationObserverがDOMの変化を検知しました");
        // ページ変化時に、変更済みのURLではない場合は、変更済みURLを消す
        if (location.href != alreadyUpdatedUrl) {
          alreadyUpdatedUrl = null;
        }
        // バックグラウンドタブなど非表示の場合は、最速での書き換えにこだわらず、load発火時(読み込み完了)やvisibilitychange発火時(アクティブ化)に任せる
        if (!document.hidden) {
          await updatePage();
        }
        // すでに書き換え済みかスレッドページではない場合監視を止める
        if (alreadyUpdatedUrl || !location.href.startsWith("https://stellabms.xyz/thread/")) {
          stopObserving();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserving() {
      if (observer) {
        observer.disconnect();
        observer = null;
        console.log("🛑 MutationObserverによる監視を停止します");
      }
    }

    function observeUrlChanges() {
      const pushState = history.pushState;
      history.pushState = function (...args) {
        pushState.apply(this, args);
        window.dispatchEvent(new Event("locationchange"));
      };

      const replaceState = history.replaceState;
      history.replaceState = function (...args) {
        replaceState.apply(this, args);
        window.dispatchEvent(new Event("locationchange"));
      };

      window.addEventListener("popstate", () => {
        window.dispatchEvent(new Event("locationchange"));
      });

      window.addEventListener("locationchange", () => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          alreadyUpdatedUrl = null; // URLが変化しているのでページの書き換えフラグも削除
          console.log("🔄 URLが変化しました:", lastUrl);
          if(location.href.startsWith("https://stellabms.xyz/thread/")) {
            startObserving();
          }
        }
      });
    }
    observeUrlChanges(); // 初期起動
    startObserving();

    // ==================================================================================================
    // スレッドページの書き換え処理
    async function updatePage() {
      // 現在URLが処理済みURL or スレッドページではない、場合return
      if (location.href == alreadyUpdatedUrl || !location.href.startsWith("https://stellabms.xyz/thread/")) {
        return;
      }
      console.info("スレッドページの書き換え処理に入りました");
      // 経過時間の表示処理用エレメント取得
      const datetimeElem = document.querySelector("#thread-1 > div:nth-child(1) > div > div:nth-child(1) > div:nth-child(1) > p:last-of-type");
      const targetElem = document.querySelector("#scroll-area > section > main > h2");
      // 譜面情報テーブル表示用コンテナエレメント取得
      const tableContainer = document.querySelector('[data-slot="table-container"]');

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
      alreadyUpdatedUrl = location.href; // 経過時間表示処理完了時点でフラグを立てる

      // テーブルの1行目(レベル、key)を削除(多分なくても良い情報？)
      tableContainer.querySelector('[data-slot="table-row"]').remove();
      // テーブルをツメツメにして高さを削減
      tableContainer.querySelectorAll('[data-slot="table-row"]').forEach(el => {
        el.style.borderBottomWidth = '0';
      });
      tableContainer.querySelectorAll('[data-slot="table-head"]').forEach(el => {
        el.style.height = '1.2rem';
        el.style.lineHeight = '100%';
        el.style.padding = '0.1rem 0.2rem';
        el.style.fontFamily = '"Inconsolata"';
      });
      tableContainer.querySelectorAll('[data-slot="table-cell"]').forEach(el => {
        el.style.lineHeight = '100%';
        el.style.padding = '0.1rem 0.2rem';
        el.style.fontFamily = '"Inconsolata"';
      });
      // トータルを抽出(判定も抽出し、拡張した表に統合することで行数削減を考えたが、#TOTAL未定義の場合の長い表示の置き場所がなくなるのでやめた)
      const totalCellElement = tableContainer.querySelectorAll('[data-slot="table-cell"]')[3];
      const total = Number(totalCellElement.textContent.trim());
      const notes = Number(tableContainer.querySelectorAll('[data-slot="table-cell"]')[1].textContent.trim());
      // const judge = tableContainer.querySelectorAll('[data-slot="table-cell"]')[2].textContent.trim();

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
      const anchors = tableContainer.querySelectorAll('a');
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
        html_target_element = tableContainer;
        html_target_dest = "beforeend";
        // テンプレートを挿入
        insertBmsDataTemplate(html_target_element, html_target_dest, "#fafafa", "#09090b", "#fafafa", "#18191d");
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData()) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
          // 最後まで置換がうまく行った場合、更にBPM・ノーツ数の行と、IRリンク・譜面ビューアーの行を削除する。他はTOTAL値未定義が分かる場合があるなど必ずしも重複していない情報なので残す。
          document.getElementById("bd-bokutachi").setAttribute("href", `${bokutachi}`);
          document.getElementById("bd-bokutachi").setAttribute("style", "display: inline;");
          const tableRows = tableContainer.querySelectorAll('[data-slot="table-row"]');
          tableRows[4].remove();
          tableRows[0].remove();
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
    let alreadyUpdatedUrl;

    // 初回ページ読み込み完了時に試行
    // バックグラウンドでタブを開きつつそのタブをアクティブにしたタイミングによってはMutationObserverが反応せず、Visibilitychangeイベントも発火しない場合があったので必須
    if (document.readyState === "complete") {
      console.info("loadイベントは発火済でした");
      await updatePage();
    } else {
      window.addEventListener('load', async () => {
        console.info("🔥 loadイベントが発火しました");
        await updatePage();
      });
    }

    // タブがアクティブになったときに試行
    document.addEventListener("visibilitychange", async () => {
      console.info("🔥 Visibilitychangeイベントが発火しました");
      await updatePage();
    });

    // DOM変化時に試行、処理が終わったらURLが変化するまで監視を止める
    let lastUrl = location.href;
    let observer = null;

    function startObserving() {
      if (observer) return;

      console.log("👁️ MutationObserverによる監視を開始します");

      observer = new MutationObserver(async () => {
        console.info("MutationObserverがDOMの変化を検知しました");
        // ページ変化時に、変更済みのURLではない場合は、変更済みURLを消す
        if (location.href != alreadyUpdatedUrl) {
          alreadyUpdatedUrl = null;
        }
        // バックグラウンドタブなど非表示の場合は、最速での書き換えにこだわらず、load発火時(読み込み完了)やvisibilitychange発火時(アクティブ化)に任せる
        if (!document.hidden) {
          await updatePage();
        }
        // すでに書き換え済みか、曲ページではないか、bmsdataが挿入済みの場合監視を止める
        if (alreadyUpdatedUrl || !location.href.startsWith("https://www.gaftalk.com/minir/#/viewer/song/") || document.getElementById("bmsdata-container")) {
          stopObserving();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function stopObserving() {
      if (observer) {
        observer.disconnect();
        observer = null;
        console.log("🛑 MutationObserverによる監視を停止します");
      }
    }

    function observeUrlChanges() {
      const pushState = history.pushState;
      history.pushState = function (...args) {
        pushState.apply(this, args);
        window.dispatchEvent(new Event("locationchange"));
      };

      const replaceState = history.replaceState;
      history.replaceState = function (...args) {
        replaceState.apply(this, args);
        window.dispatchEvent(new Event("locationchange"));
      };

      window.addEventListener("popstate", () => {
        window.dispatchEvent(new Event("locationchange"));
      });

      window.addEventListener("locationchange", () => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          alreadyUpdatedUrl = null; // URLが変化しているのでページの書き換えフラグも削除
          console.log("🔄 URLが変化しました:", lastUrl);
          if(location.href.startsWith("https://www.gaftalk.com/minir/#/viewer/song/")) {
            startObserving();
          }
        }
      });
    }
    observeUrlChanges(); // 初期起動
    startObserving();

    // ==================================================================================================
    // 曲ページの書き換え処理
    async function updatePage() {
      // 現在URLが処理済みURL or 曲ページではない、場合return
      if (location.href == alreadyUpdatedUrl || !location.href.startsWith("https://www.gaftalk.com/minir/#/viewer/song/")) {
        return;
      }
      console.info("MinIRの曲ページ書き換え処理に入りました");
      // sha256抽出
      const url = window.location.href;
      const match = url.match(/\/song\/([a-f0-9]{64})\/\d/);
      if (match) {
        targetsha256 = match[1];
      }
      // ターゲット要素特定
      html_target_element = document.querySelector("#root > div > div > div > div.compact.tabulator");
      html_target_dest = "beforebegin";
      // sha256が取得できている、かつ、ターゲット要素が取得済み、かつ、bmsdataが挿入済みではない、場合にはbmsdataの挿入に進む
      // (LN/CN/HCNの切り替え時に挿入済みになりうる)
      if (targetsha256 && html_target_element && html_target_dest && !document.getElementById("bmsdata-container")) {
        // テンプレートを挿入
        insertBmsDataTemplate(html_target_element, html_target_dest, "#1A202C", "#ffffff", "#000000DE", "#f1f1f1");
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData()) {
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
          alreadyUpdatedUrl = location.href;
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
      const match = url.match(/sha256=([a-f0-9]{64})/);
      if (match) {
        targetsha256 = match[1];
      }

      // ターゲット要素特定
      // 曲情報テーブルの下に挿入する
      html_target_element = document.querySelector("#main > table.songinfo")
      html_target_dest = "afterend";
      // 曲情報テーブルがない場合はフォーム(Score [Update]のところ)の上に挿入する
      if (!html_target_element) {
        html_target_element = document.querySelector("#main > form");
        html_target_dest = "beforebegin";
      }

      // sha256が取得済み、かつ、ターゲット要素が特定済み、の場合にはbmsdataの挿入に進む
      if (targetsha256 && html_target_element && html_target_dest) {
        // テンプレートを挿入
        insertBmsDataTemplate(html_target_element, html_target_dest, "#ffffff", "#333333", "#ffffff", "#666666");
        // 外部から取得したデータでテンプレートを置換
        if (await insertBmsData()) {
          // 最後まで置換がうまく行った場合
          if (document.querySelector("#main > table.songinfo")) {
            // 曲情報テーブルがある場合は重複する情報を削除する
            document.querySelector("#main > table.songinfo > tbody > tr:nth-child(11)").remove(); // Other IR
            document.querySelector("#main > table.songinfo > tbody > tr:nth-child(7)").remove(); // BPM
            document.querySelector("#main > table.songinfo > tbody > tr:nth-child(6)").remove(); // JUDGERANK
            document.querySelector("#main > table.songinfo > tbody > tr:nth-child(5)").remove(); // TOTAL
            document.querySelector("#main > table.songinfo > tbody > tr:nth-child(4)").remove(); // Total Notes
            document.querySelector("#main > table.songinfo > tbody > tr:nth-child(2)").remove(); // Mode
          }
          console.info("✅ 外部データの取得とページの書き換えが成功しました");
        } else {
          console.error("❌ 外部データの取得とページの書き換えが失敗しました");
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
  function insertBmsDataTemplate(htmlTargetElement, htmlTargetDest, dctx = "#333", dcbk = "#fff", hdtx = "#eef", hdbk = "#669") {
    // CSSテンプレート
    const fs1 = "0.875rem";
    const fs2 = "0.750rem";
    const bd_css = `
      .bmsdata * { line-height: 100%; color: ${dctx}; background-color: ${dcbk}; font-family: "Inconsolata", "Noto Sans JP"; vertical-align: middle; box-sizing: content-box;}
      .bd-info { display: flex; border: 0px; height: 9.6rem; }
      .bd-info a { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border:1px solid; border-radius: 2px; font-size: ${fs2}; color: #155dfc; text-decoration: none; }
      .bd-info a:hover { color: red; }
      .bd-icon { margin-right: 0.4rem; padding: 0.1rem 0.2rem; border-radius: 2px; background: ${dctx}; color: ${dcbk}; font-size: ${fs2}; }
      .bd-icon:nth-child(n+2) { margin-left: 0.4rem; }
      .bd-info .bd-info-table { flex: 1; border-collapse: collapse; height: 100%; }
      .bd-info td { border: unset; padding: 0.1rem 0.2rem; height: 1rem; white-space: nowrap; font-size: ${fs1}; }
      .bd-info .bd-header-cell { background-color: ${hdbk}; color: ${hdtx}; }
      .bd-info .bd-lanenote { margin-right: 0.2rem; padding: 0.1rem 0.2rem; border-radius: 2px; font-size: ${fs2}; }
      .bd-table-list { flex: 1; display: flex; min-width: 100px; flex-direction: column; box-sizing: border-box; }
      .bd-table-list .bd-header-cell { padding: 0.1rem 0.2rem; min-height: 1rem; white-space: nowrap; font-size: ${fs1}; color: ${hdtx}; display: flex; align-items: center; }
      .bd-table-scroll { overflow: auto; flex: 1 1 auto; scrollbar-color: ${hdbk} white; scrollbar-width: thin; }
      .bd-table-list ul { padding: 0.1rem 0.2rem; margin: 0; }
      .bd-table-list li { margin-bottom: 0.2rem; line-height: 1rem; font-size: ${fs1}; white-space: nowrap; list-style-type: none; }
      #bd-graph { padding: 0px; border-width: 0px; background-color: #000; overflow-x: auto; line-height: 0; scrollbar-color: ${hdbk} black; scrollbar-width: thin; }
      #bd-graph-canvas { background-color: #000; }
      #bd-graph-tooltip { line-height: 1rem; position: fixed; background: rgba(32, 32, 64, 0.8); color: #fff; padding: 4px 8px; font-size: ${fs1}; pointer-events: none; border-radius: 4px; display: none; z-index: 10; white-space: nowrap; }
      /* 7key, 14key */
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
      /* 5key, 10key */
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
      /* 9key */
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
    // HTMLテンプレート
    const bd_html = `
      <div id="bmsdata-container" class="bmsdata" style="display: none;">
        <div class="bd-info">
          <table class="bd-info-table">
            <tr>
              <td class="bd-header-cell">LINK</td>
              <td colspan="3">
                <a href="" id="bd-lr2ir" style="display: none;">LR2IR</a><a href="" id="bd-minir" style="display: none;">MinIR</a><a href="" id="bd-mocha" style="display: none;">Mocha</a><a href="" id="bd-viewer" style="display: none;">Viewer</a><a href="" id="bd-bokutachi" style="display: none;">Bokutachi</a><a href="" id="bd-stellaverse" style="display: none;">STTELLAVERSE</a>
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
    // CSS挿入
    const bd_style = document.createElement('style');
    bd_style.textContent = bd_css;
    document.head.appendChild(bd_style);
    // HTML挿入
    htmlTargetElement.insertAdjacentHTML(htmlTargetDest, bd_html);
  }

  // ====================================================================================================
  // BMSデータテンプレートを外部から情報を取得して書き換える関数
  //   挿入済みのテンプレートHTMLを問い合わせた情報で書き換える関数
  //   テンプレート挿入後に実行するので書き換え先が存在することは保証されているものとして扱う
  // ====================================================================================================
  async function insertBmsData() {

    // 取得できているハッシュによって問い合わせ先を変える
    let url = "";
    if (targetmd5) {
      url = `https://bms.howan.jp/${targetmd5}`;
    } else if (targetsha256) {
      url = `https://bms.howan.jp/${targetsha256}`;
    } else {
      url = `https://bms.howan.jp/${targetbmsid}`;
    }

    // 取得データのスキーマは以下となっている
    const columns = ["md5", "sha256", "maxbpm", "minbpm", "length", "mode", "judge", "feature", "notes", "n", "ln", "s", "ls", "total", "density", "peakdensity", "enddensity", "mainbpm", "distribution", "speedchange", "lanenotes", "tables", "stella", "bmsid"];
    // 外部データの取得
    const data = await (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }
        const text = await response.text();
        const values = text.split('\x1f'); // 区切り文字（Unit Separator）で分割、「,」を使わないことでパースコストを削減

        if (values.length !== columns.length) {
          throw new Error(`列数が一致しません（columns=${columns.length}, values=${values.length}）`);
        }

        // columnsに対応する連想配列（オブジェクト）を作成
        const record = {};
        for (let i = 0; i < columns.length; i++) {
          record[columns[i]] = values[i];
        }

        return record;

      } catch (error) {
        console.error("Fetch or parse error:", error);
        return false;
      }
    })();

    if (!data) {
      // データが取得できなかった場合は、TEMPLATEを削除してfalseを返す
      document.getElementById("bmsdata-container").remove();
      return false;
    }

    // 外部から取得したデータを変換していく
    const md5 = data.md5;
    const sha256 = data.sha256;
    const maxbpm = Number(data.maxbpm);
    const minbpm = Number(data.minbpm);
    const length = Number(data.length); // ミリ秒
    const durationStr = (length / 1000).toFixed(2) + " s";
    const mode = Number(data.mode);
    const judge = Number(data.judge);
    const feature = Number(data.feature);
    const featureNames = [
      "LN(#LNMODE undef)", // bit 0
      "MINE",         // bit 1
      "RANDOM",       // bit 2
      "LN",           // bit 3
      "CN",           // bit 4
      "HCN",          // bit 5
      "STOP",         // bit 6
      "SCROLL"        // bit 7
    ];
    const featuresStr = featureNames
    .filter((name, index) => (feature & (1 << index)) !== 0)
    .join(", ");
    const notes = Number(data.notes);
    const n = Number(data.n);
    const ln = Number(data.ln);
    const s = Number(data.s);
    const ls = Number(data.ls);
    const notesStr = `${notes} (N:${n}, LN:${ln}, SCR:${s}, LNSCR:${ls})`;
    const total = Number(data.total);
    const totalStr = `${total % 1 == 0 ? Math.round(total) : total} (${(total / notes).toFixed(3)} T/N)`;
    const density = Number(data.density);
    const peakdensity = Number(data.peakdensity);
    const enddensity = Number(data.enddensity);
    const mainbpm = Number(data.mainbpm);
    const distribution = data.distribution;
    const speedchange = data.speedchange;
    const lanenotes = data.lanenotes;
    const lanenotesArr = (() => {
      // modeによって皿の位置を整えつつレーンごとのノーツ数データを整形(5鍵や10鍵も1Pは左皿扱い)
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
          tokens[baseIndex] ?? 0, // 通常ノーツ
          tokens[baseIndex + 1] ?? 0, // LN
          tokens[baseIndex + 2] ?? 0, // 地雷
          tokens[baseIndex] + tokens[baseIndex + 1] ?? 0 // 通常ノーツ+LN
        ]);
      }
      if (mode === 7 || mode === 14) {
        const move = lanenotesArr.splice(7, 1)[0]; // 8番目（インデックス7）を削除
        lanenotesArr.unshift(move);                // 先頭に挿入
      } else if (mode === 5 || mode === 10) {
        const move = lanenotesArr.splice(5, 1)[0]; // 6番目（インデックス5）を削除
        lanenotesArr.unshift(move);                // 先頭に挿入
      }
      return lanenotesArr;
    })();
    const tables = (() => {
      try {
        return JSON.parse(data.tables); // JSONを文字列の配列にする
      } catch {
        return []; // 表外譜面など空文字でJSON.parseできない場合には空配列を返してforeachをスキップさせる
      }
    })();
    const stella = Number(data.stella);
    const bmsid = Number(data.bmsid);

    // 取得したデータでHTML書き換え
    if (md5) {
      document.getElementById("bd-lr2ir").setAttribute("href", `http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?mode=ranking&bmsmd5=${md5}`);
      document.getElementById("bd-lr2ir").setAttribute("style", "display: inline;");
      document.getElementById("bd-viewer").setAttribute("href", `https://bms-score-viewer.pages.dev/view?md5=${md5}`);
      document.getElementById("bd-viewer").setAttribute("style", "display: inline;");
    }
    if (sha256) {
      document.getElementById("bd-minir").setAttribute("href", `https://www.gaftalk.com/minir/#/viewer/song/${sha256}/0`);
      document.getElementById("bd-minir").setAttribute("style", "display: inline;");
      document.getElementById("bd-mocha").setAttribute("href", `https://mocha-repository.info/song.php?sha256=${sha256}`);
      document.getElementById("bd-mocha").setAttribute("style", "display: inline;");
    }
    if (stella) {
      document.getElementById("bd-stellaverse").setAttribute("href", `https://stellabms.xyz/song/${stella}`);
      document.getElementById("bd-stellaverse").setAttribute("style", "display: inline;");
    }
    document.getElementById("bd-sha256").textContent = sha256;
    document.getElementById("bd-md5").textContent = md5;
    document.getElementById("bd-bmsid").textContent = bmsid ? bmsid : "Undefined";
    document.getElementById("bd-mainbpm").textContent = mainbpm % 1 == 0 ? Math.round(mainbpm) : mainbpm;
    document.getElementById("bd-maxbpm").textContent = maxbpm % 1 == 0 ? Math.round(maxbpm) : maxbpm;
    document.getElementById("bd-minbpm").textContent = minbpm % 1 == 0 ? Math.round(minbpm) : minbpm;
    document.getElementById("bd-mode").textContent = mode;
    document.getElementById("bd-feature").textContent = featuresStr;
    document.getElementById("bd-judgerank").textContent = judge;
    document.getElementById("bd-notes").textContent = notesStr;
    document.getElementById("bd-total").textContent = totalStr;
    document.getElementById("bd-avgdensity").textContent = density.toFixed(3);
    document.getElementById("bd-peakdensity").textContent = peakdensity.toFixed(0);
    document.getElementById("bd-enddensity").textContent = enddensity;
    document.getElementById("bd-duration").textContent = durationStr;
    // LANENOTESの値を生成し挿入
    {
      let modeprefix = ""; // mode に応じた prefix の決定
      if (mode === 5 || mode === 10) {
        modeprefix = "g";
      } else if (mode === 9) {
        modeprefix = "p";
      }
      // 親要素の取得
      const container = document.getElementById("bd-lanenotes-div");
      if (!container) {
        console.warn("bd-lanenotes-divが見つかりませんでした");
      } else {
        if (mode === 7 || mode === 14 || mode === 9 || mode === 5 || mode === 10) {
          // 各レーンに対して span 要素を生成・追加
          for (let i = 0; i < lanenotesArr.length; i++) {
            const span = document.createElement("span");
            span.className = "bd-lanenote";
            span.setAttribute("lane", `${modeprefix}${i}`);
            span.textContent = lanenotesArr[i][3]; // 通常+LNノーツ数
            container.appendChild(span);
          }
        } else {
          //その他のモード時は全て白鍵盤扱い
          for (let i = 0; i < lanenotesArr.length; i++) {
            const span = document.createElement("span");
            span.className = "bd-lanenote";
            span.setAttribute("lane", "1");
            span.setAttribute("style", "margin-right: 0.1rem; padding: 0.1rem 0.1rem;");
            span.textContent = lanenotesArr[i][3]; // 通常+LNノーツ数
            container.appendChild(span);
          }
        }
      }
    }
    // tables配列の値をli要素にして追加
    const ul = document.getElementById("bd-tables-ul");
    tables.forEach(text => {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });

    // 拡張情報全体を表示状態にする
    document.getElementById("bmsdata-container").style.display = "block";

    // グラフ描写処理実行
    const canvas = document.getElementById("bd-graph-canvas");
    drawDistribution(canvas, distribution, peakdensity, speedchange, mainbpm, maxbpm, minbpm);

    // 最後まで完了
    return true;

    // ====================================================================================================
    // 以下グラフ描写用関数

    // グラフ描写用ユーティリティ
    function logScaleY(bpm, minValue, maxValue, minLog, maxLog, canvasHeight) {
      // Clamp ratio and get log scale
      const ratio = Math.min(Math.max(bpm / mainbpm, minValue), maxValue);
      const logVal = Math.log10(ratio);
      const t = (logVal - minLog) / (maxLog - minLog);
      return canvasHeight - Math.round(t * (canvasHeight - 2)); // 反転
    }

    function timeToX(t, timeLength, canvasWidth) {
      return Math.round((t / timeLength * 0.001) * canvasWidth) + 1;
    }

    // speedshangeRawデータパース関数
    function parseSpeedChange(raw) {
      const arr = raw.split(',').map(Number);
      const result = [];
      for (let i = 0; i < arr.length; i += 2) {
        result.push([arr[i], arr[i + 1]]);
      }
      return result;
    }

    // グラフ描写関数
    function drawDistribution(canvas, distribution, peakDensity, speedchangeRaw, mainBPM, maxBPM, minBPM) {
      // ノーツカラー設定
      const noteColors = [
        "#44FF44", // LN皿
        "#228822", // LN皿2
        "#FF4444", // 皿
        "#4444FF", // LN
        "#222288", // LN2
        "#CCCCCC", // 通常
        "#880000" // 地雷
      ];

      const noteNames = [
        "LNSCR",
        "LNSCR HOLD",
        "SCR",
        "LN",
        "LN HOLD",
        "NORMAL",
        "MINE"
      ]

      // ノーツサイズ設定
      const rectWidth = 4;
      const rectHeight = 2;
      const spacing = 1;
      const noteTypes = 7;

      // distributionデータパース、曲長さ算出、canvasサイズ設定
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

      const timeLength = segments.length;
      const maxNotesPerSecond = Math.max(40, Math.min(peakDensity, 100)); // 最低でも40ノーツ分の高さを確保する、それ以上は譜面のピークに合わせて高さを増やす。Satellite/Stellaの密度を参考に設定した。
      const canvasWidth = timeLength * (rectWidth + spacing);
      const canvasHeight = maxNotesPerSecond * (rectHeight + spacing) - spacing; // 最下段に隙間なし
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      // グラフ描写開始
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // === 背景描画 ===
      // Y軸（5ノーツごと）
      ctx.strokeStyle = "#202080";
      ctx.lineWidth = 1;
      for (let i = 5; i < maxNotesPerSecond; i += 5) {
        const y = canvasHeight - (i * (rectHeight + spacing) - 0.5);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }

      // X軸（10秒ごと）
      ctx.strokeStyle = "#777";
      for (let t = 10; t < timeLength; t += 10) {
        const x = t * (rectWidth + spacing) - 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }

      // === ノーツ描画 ===
      segments.forEach((counts, timeIndex) => {
        let yOffset = 0;
        for (let typeIndex = 0; typeIndex < noteTypes; typeIndex++) {
          const color = noteColors[typeIndex];
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

      // === BPM推移描写 ===
      // Y軸スケール設定
      const minValue = 1 / 8;
      const maxValue = 8;
      const minLog = Math.log10(minValue);
      const maxLog = Math.log10(maxValue);

      const speedchange = parseSpeedChange(speedchangeRaw);
      const bpmLineWidth = 2; // ラインの微調整は偶数を想定した処理だし、そもそも2px想定でベタ書きしているかも

      for (let i = 0; i < speedchange.length; i++) {
        const [bpm, time] = speedchange[i];
        const x1 = timeToX(time, timeLength, canvasWidth);
        const y1 = logScaleY(bpm, minValue, maxValue, minLog, maxLog, canvasHeight) - 1;

        // 横線（次の時間まで）
        const next = speedchange[i + 1];
        const x2 = next ? timeToX(next[1], timeLength, canvasWidth) : canvasWidth;

        let color = "#ffff00"; // other 黄
        if (bpm <= 0) color = "#ff00ff"; // stop 紫
        else if (bpm === mainBPM) color = "#00ff00"; // main 緑
        else if (bpm === minBPM) color = "#0000ff"; // min 青
        else if (bpm === maxBPM) color = "#ff0000"; // max 赤

        ctx.strokeStyle = color;
        ctx.lineWidth = bpmLineWidth;
        ctx.beginPath();
        ctx.moveTo(x1 - 1, y1);
        ctx.lineTo(x2 + 1, y1);
        ctx.stroke();

        // 縦線（遷移部分）
        if (next) {
          const y2 = logScaleY(next[0], minValue, maxValue, minLog, maxLog, canvasHeight) - 1;
          if (Math.abs(y2 - y1) >= 1) {
            ctx.strokeStyle = "rgba(127,127,127,0.5)"; // 灰(半透明)
            ctx.lineWidth = bpmLineWidth;
            ctx.beginPath();
            ctx.moveTo(x2, y2 < y1 ? y1 - 1 : y1 + 1); // Y軸の向きで混乱
            ctx.lineTo(x2, y2 < y1 ? y2 + 1 : y2 - 1);
            ctx.stroke();
          }
        }
      }

      // === インタラクティブ処理(グラフにマウスオーバー時ツールチップでその時間の情報表示) ===
      const tooltip = document.getElementById("bd-graph-tooltip");
      canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const timeIndex = Math.floor(mouseX / (rectWidth + spacing));
        if (timeIndex < 0 || timeIndex >= segments.length) {
          tooltip.style.display = "none";
          return;
        }
        // BPMデータ準備
        let bpmDisplay = 0;
        for (let i = speedchange.length - 1; i >= 0; i--) {
          if ((mouseX / (rectWidth + spacing)) * 1000 >= speedchange[i][1]) {
            bpmDisplay = speedchange[i][0];
            break;
          }
        }
        // グラフ上にマウスがあるときに表示する
        const counts = segments[timeIndex];
        let total = counts.reduce((a, b) => a + b, 0);
        let html = `${(mouseX / (rectWidth + spacing)).toFixed(1)} sec<br>`;
        html += `BPM: ${bpmDisplay}<br>`;
        html += `Notes: ${total}<br>`;
        counts.forEach((c, i) => {
          if (c > 0) {
            html += `<span style="color: ${noteColors[i]}; background-color: transparent;">■</span> ${c} - ${noteNames[i]}<br>`;
          }
        });
        tooltip.innerHTML = html;
        tooltip.style.left = `${e.clientX + 10}px`;
        tooltip.style.top = `${e.clientY + 10}px`;
        tooltip.style.display = "block";
      };
      // グラフからマウスが離れたら消す
      canvas.onmouseleave = () => {
        tooltip.style.display = "none";
      };
    }
  }
})();