import * as PreviewRuntime from "../../shared/preview-runtime/index.js";
import {
  isMochaSongPath, findMochaSection, getMochaIdentifiers,
  preserveMochaLevel, appendMochaFallbackLinks,
} from "./mocha-dom.js";
import {
  STELLAVERSE_TOTAL_NOTE_SELECTOR,
  getStellaverseChartStatsCells,
  getStellaverseRowsToHideAfterSuccess,
  parseStellaverseCellNumber,
  extractStellaversePostedDatetime,
  parseStellaversePostedDate,
} from "./stellaverse-dom.js";
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
  const SCRIPT_VERSION_FALLBACK = "2.3.22";
  const userscriptFetch = createUserscriptFetch();
  PreviewRuntime.setPreviewRuntimeFetch(userscriptFetch);
  const SKIP_VERSION_NOTIFICATION_FROM = "2.3.18";
  const VERSION_NOTIFICATION_STORAGE_KEYS = {
    lastNotifiedVersion: "bms-info-extender.versionNotification.lastNotifiedVersion",
    notificationLanguage: "bms-info-extender.versionNotification.language"
  };
  const VERSION_NOTIFICATION_DEFAULT_LANGUAGE = "ja";
  const VERSION_NOTIFICATION_MODAL_ID = "bms-info-extender-version-notification";
  const VERSION_NOTIFICATION_STYLE = `
    :host {
      all: initial;
      font-size: 16px;
      line-height: 1.5;
      text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
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
      width: 680px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 32px);
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
      font-size: 15.2px;
    }
    .bmsie-version-notice-title {
      margin: 0 0 14px;
      font-size: 20px;
      line-height: 1.35;
    }
    .bmsie-version-notice-content {
      margin: 0;
      padding: 14px 16px;
      height: 280px;
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
      font-size: 15.2px;
    }
    .bmsie-version-notice-select {
      min-width: 140px;
      padding: 4px 8px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 6px;
      background: #11131d;
      color: #f4f6ff;
      font-size: 15.2px;
    }
    .bmsie-version-notice-ad {
      display: block;
      aspect-ratio: 636 / 334;
      margin-top: 16px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      background: rgba(10, 12, 18, 0.72);
      line-height: 0;
      text-decoration: none;
    }
    .bmsie-version-notice-ad:focus-visible {
      outline: 2px solid #84a4ff;
      outline-offset: 2px;
    }
    .bmsie-version-notice-ad img {
      display: block;
      width: 100%;
      height: auto;
      border: 0;
    }
    .bmsie-version-notice-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 16px;
    }
    .bmsie-version-notice-ok {
      min-width: 92px;
      padding: 7px 14px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: linear-gradient(180deg, #7ea1ff 0%, #4f73d6 100%);
      color: #ffffff;
      font-size: 15.2px;
      cursor: pointer;
    }
  `;
    const RELEASE_NOTES_JA =
`# v2.3.20 (通知スキップ)

## BMS-IR曲ページの解析を修正
- 譜面のMD5をURLの songmd5 パラメータから取得する処理を明確化しました
- 拡張パネルをジャンル行の直後へ挿入し、ジャンル行が見つからない場合は曲名の手前へ挿入するようにしました
- BMS-IR側の外枠DOM構造が変わっても挿入先を特定できるようにしました

---

# v2.3.18

## STELLAVERSE IR曲ページへの対応
- STELLAVERSE IRの曲ページにメタデータ、ノーツ分布/BPM推移グラフ、譜面ビューアを表示するようにしました
- STELLAVERSE IRはSPAのため、URL変更時に拡張パネルを明示的にクリーンアップし、現在のURLとページ内MD5が一致する場合だけ挿入するようにしました
- 初回表示時のhydrationで拡張パネルが消される場合に、同一ページ内で限定的に再試行するようにしました
- グラフ下に余分な空白が出にくいよう、グラフ領域のサイズ処理を調整しました

## LINKの整理
- LINKにSTELLAVERSE IRを追加しました
- LINKの並び順を BMS-IR, STELLAVERSE IR, MinIR, Mocha, Bokutachi, Viewer, EZ2PT, BMS SEARCH, STELLAVERSE に整理しました
- 表示中のサイト自身へのLINKは非表示にするようにしました

---

# v2.3.17 (通知スキップ)

## BMS-IR曲ページでの拡張パネル挿入位置を調整
- タグパネルの手前へ拡張パネルを挿入するようにしました
- タグパネルが見つからない場合は、曲名の手前へ挿入するフォールバックを追加しました

---

# v2.3.16 (通知スキップ)

## Bokutachi譜面ページへの対応
- Bokutachi譜面ページにメタデータ、グラフ、譜面ビューアを表示するようにしました
- Bokutachiページの対象URLを調整しました
- Shadow DOM内UIの基準フォントサイズを明示しました

---

# v2.3.15 (通知スキップ)

## Bokutachi LINKの解決方法を変更
- Bokutachi LINKをTachi hash resolve APIで解決するようにしました
- STELLAVERSEの既存リンクを流用する処理を廃止しました

---

# v2.3.14 (通知スキップ)

## メタデータパネルをShadow DOMへ分離
- 元サイトのCSS影響を受けにくくするため、メタデータテーブルをShadow DOM内へ分離しました

---

# v2.3.13 (通知スキップ)

## BMS-IR名称とキャッシュ処理を調整
- 表示文言をBMS-IRへ修正しました
- メタデータ取得時の暫定キャッシュバスターを廃止しました

---

# v2.3.12 (通知スキップ)

## LR2ALT公式ドメインのwww有無に両対応
- LR2ALT公式ドメインのwwwあり/なしの両方に対応しました

---

# v2.3.11 (通知スキップ)

## LR2ALT公式ドメインを調整
- LR2ALT公式ドメインのURLをwwwなしへ変更しました

---

# v2.3.10 (通知スキップ)

## LR2ALT公式ドメインと外部取得に対応
- LR2ALT公式ドメインに対応しました
- IP直指定対応を廃止しました
- 外部取得のCSP対応を調整しました

---

# v2.3.9 (通知スキップ)

## LR2IR Alternativeに対応
- LR2IR Alternativeに対応しました
- hosts編集とIP直指定の双方に対応しました

---

# v2.3.8 (通知スキップ)

## STELLAVERSEでのMD5抽出を調整
- STELLAVERSEではLR2IRリンクではなく、譜面ビューアリンクからMD5を抽出するようにしました

---

# v2.3.7 (通知スキップ)

## BPM/TOTAL表示を改善
- BPMのMIN/MAXで小数に対応しました
- TOTALとBPMは小数点以下3桁以降を省略し、ツールチップに全量を表示するようにしました
- TOTAL未定義時はundefined表示とし、ツールチップにLR2/beatoraja相当の計算値を表示するようにしました

---

# v2.3.6 (通知スキップ)

## STELLAVERSEのセレクターを修正
- STELLAVERSE側のページ構造に合わせてセレクターを修正しました

---

# v2.3.5 (通知スキップ)

## EZ2PATTERNリンクを追加
- LINKにEZ2PATTERNへのリンクを追加しました

---

# v2.3.4 (通知スキップ)

## STELLAVERSEのDOM操作を調整
- STELLAVERSEでのDOM操作を微調整しました
- 投票ページでIRリンク行ではなく曲コメント行が削除される問題を修正しました

---

# v2.3.3 (通知スキップ)

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
`# v2.3.20 (notification skipped)

## Fixed BMS-IR song-page parsing
- Clarified that the chart MD5 is read from the songmd5 URL parameter
- The extension panel is now inserted after the genre line, with a fallback before the song title when that line is unavailable
- Removed the dependency on BMS-IR's outer DOM wrapper structure when locating the insertion point

---

# v2.3.18

## Added support for STELLAVERSE IR chart pages
- STELLAVERSE IR chart pages now show metadata, the notes density/BPM graph, and the score viewer
- Because STELLAVERSE IR is an SPA, the userscript now explicitly cleans up the extension panel on route changes and inserts it only when the URL MD5 matches the MD5 shown in the page metadata
- If the initial hydration removes the extension panel, the userscript now performs a limited retry on the same page
- Adjusted graph sizing so extra blank space is less likely to appear below the graph

## Reorganized LINK entries
- Added a STELLAVERSE IR link
- Reordered LINK entries to BMS-IR, STELLAVERSE IR, MinIR, Mocha, Bokutachi, Viewer, EZ2PT, BMS SEARCH, STELLAVERSE
- The link for the current site is now hidden while viewing that site

---

# v2.3.17 (notification skipped)

## Adjusted where the extension panel is inserted on BMS-IR song pages
- The extension panel is now inserted before the tags panel
- Added a fallback that inserts the panel before the song title when the tags panel cannot be found

---

# v2.3.16 (notification skipped)

## Added support for Bokutachi chart pages
- Bokutachi chart pages now show metadata, the graph, and the score viewer
- Adjusted the target URL matching for Bokutachi pages
- Explicitly set the base font size for UI inside Shadow DOM

---

# v2.3.15 (notification skipped)

## Changed how Bokutachi links are resolved
- Bokutachi links are now resolved through the Tachi hash resolve API
- Removed the previous behavior that reused existing STELLAVERSE links

---

# v2.3.14 (notification skipped)

## Isolated the metadata panel in Shadow DOM
- Moved the metadata table into Shadow DOM to reduce the impact of host-site CSS

---

# v2.3.13 (notification skipped)

## Adjusted BMS-IR naming and cache behavior
- Updated wording to use BMS-IR
- Removed the temporary cache buster from metadata fetches

---

# v2.3.12 (notification skipped)

## Supported LR2ALT official domains with and without www
- Added support for both www and non-www LR2ALT official domains

---

# v2.3.11 (notification skipped)

## Adjusted the LR2ALT official domain
- Changed the LR2ALT official URL to the non-www domain

---

# v2.3.10 (notification skipped)

## Added LR2ALT official-domain and external-fetch support
- Added support for the LR2ALT official domain
- Removed direct-IP support
- Adjusted external fetch handling for CSP compatibility

---

# v2.3.9 (notification skipped)

## Added support for LR2IR Alternative
- Added support for LR2IR Alternative
- Supported both hosts-file and direct-IP setups

---

# v2.3.8 (notification skipped)

## Adjusted MD5 extraction on STELLAVERSE
- STELLAVERSE now extracts MD5 values from score viewer links instead of LR2IR links

---

# v2.3.7 (notification skipped)

## Improved BPM and TOTAL display
- BPM MIN/MAX now support decimal values
- TOTAL and BPM now omit digits after the third decimal place and show the full value in a tooltip
- Undefined TOTAL values now display as undefined and show LR2/beatoraja-equivalent calculated values in the tooltip

---

# v2.3.6 (notification skipped)

## Fixed STELLAVERSE selectors
- Updated selectors to match the STELLAVERSE page structure

---

# v2.3.5 (notification skipped)

## Added an EZ2PATTERN link
- Added an EZ2PATTERN entry to LINK

---

# v2.3.4 (notification skipped)

## Adjusted STELLAVERSE DOM handling
- Fine-tuned DOM operations on STELLAVERSE
- Fixed an issue where the song comment row could be removed instead of the IR link row on voting pages

---

# v2.3.3 (notification skipped)

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
  const BOKUTACHI_HOST = "boku.tachi.ac";
  const BOKUTACHI_CHART_PATH_PATTERN = /^\/games\/([^/]+)\/charts\/([^/]+)\/?$/;
  const STELLAVERSE_HOST = "stellabms.xyz";
  const STELLAVERSE_THREAD_PATH_PATTERN = /^\/thread\/(\d+)\/?$/;
  const STELLAVERSE_SITE_ID = PreviewRuntime.PREVIEW_LINK_SITE.stellaverse;
  const STELLAVERSE_ELAPSED_TIME_SELECTOR = '[data-bmsie-stellaverse-elapsed-time="true"]';
  const STELLAVERSE_SOURCE_CLASS = "bmsie-stellaverse-source";
  const STELLAVERSE_VIEWER_HOST = "bms-score-viewer.pages.dev";
  const STELLAVERSE_VIEWER_PATH_PATTERN = /^\/view\/?$/;
  const STELLAVERSE_IR_HOST = "ir.stellabms.xyz";
  const STELLAVERSE_IR_CHART_PATH_PATTERN = /^\/charts\/([0-9a-fA-F]{32})\/?$/;
  const STELLAVERSE_IR_SITE_ID = PreviewRuntime.PREVIEW_LINK_SITE.stellaverseIr;
  const BMS_IR_THEME = {
    dctx: "#cfcfcf",
    dcbk: "#090909",
    hdtx: "#ddd",
    hdbk: "#252525",
    linkColor: "#9fc7ff",
    linkHoverColor: "#fff"
  };
  const BOKUTACHI_THEME = {
    dctx: "#f7f7f7",
    dcbk: "#2b292b",
    hdtx: "#f7f7f7",
    hdbk: "#1f1d20",
    linkColor: "#f7f7f7",
    linkHoverColor: "#6c8ed4"
  };
  const STELLAVERSE_IR_THEME = {
    dctx: "#333333",
    dcbk: "#ffffff",
    hdtx: "#eeeeff",
    hdbk: "#222244",
    linkColor: "#4444ee",
    linkHoverColor: "red"
  };
  const STELLAVERSE_IR_SELECTORS = {
    chartHeader: "#box > div.chart-header",
    metaBox: "#box > div.meta-box"
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
    dctx: "#2e211b",
    dcbk: "#fffdf9",
    hdtx: "#2e211b",
    hdbk: "#f7f1e8",
    linkColor: "#1f766e",
    linkHoverColor: "#553021"
  };
  const STELLAVERSE_SELECTORS = {
    pageMain: "#scroll-area main",
    breadcrumbPage: '[data-slot="breadcrumb-page"]',
    threadRoot: "#thread-1",
    tableContainer: '[data-slot="table-container"]',
  };
  // パネルが消えたら元の行も直ちに再表示される。元表のデータやリンクは残す。
  const STELLAVERSE_TABLE_CSS = `
    .bmsie-stellaverse-source :is(th, td),
    .bmsie-stellaverse-source :is(th, td) * {
      font-family: ${PreviewRuntime.BMS_INFO_FONT_FAMILY} !important;
    }
    .bmsie-stellaverse-source :is(th, td) {
      font-size: 14px !important;
      line-height: 100% !important;
      padding: 1.6px 3.2px !important;
      height: 16px !important;
      vertical-align: middle;
    }
    .bmsie-stellaverse-source tr { border-bottom-width: 0 !important; }
    .bmsie-stellaverse-source:has(+ #bmsdata-container[data-bmsie-stellaverse-ready="true"])
      tr.bmsie-stellaverse-duplicate { display: none !important; }
  `;
  const MINIR_SELECTORS = {
    targetElement: "#root > div > div > div > div.compact.tabulator"
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
   * @property {string=} currentSite
   * @property {string=} siteId
   * @property {string=} pageKey
   */

  /**
   * SPA監視側から updatePage に渡す helper 群。
   * @typedef {Object} UpdatePageHelpers
   * @property {() => void} markUpdated
   */

  /**
   * サイト別 updatePage の実行結果。
   * @typedef {Object} UpdatePageResult
   * @property {boolean=} retry
   */

  /**
   * 拡張パネル描画パイプラインの実行結果。
   * @typedef {Object} InsertBmsDataResult
   * @property {boolean} ok
   * @property {"success"|"not-found"|"detached"} reason
   */

  /**
   * SPA 監視の設定。
   * @typedef {Object} WatchSpaPageConfig
   * @property {string} siteName
   * @property {(url: string) => boolean} matchUrl
   * @property {(helpers: UpdatePageHelpers) => Promise<void|UpdatePageResult>} updatePage
   * @property {(() => boolean)=} isSettled
   * @property {((details: { previousUrl: string, currentUrl: string }) => void)=} cleanupPage
   */

  /**
   * STELLAVERSE 側でまとめて取得する DOM 参照群。
   * @typedef {Object} StellaverseDomRefs
   * @property {Element|null} threadRoot
   * @property {Element|null} targetElem
   * @property {Element|null} tableContainer
   * @property {Element[]} tableRows
   * @property {HTMLAnchorElement[]} anchors
   */

  /**
   * STELLAVERSE 側の項目名と数値を確認できた譜面統計の参照群。
   * @typedef {Object} StellaverseChartStatsCells
   * @property {Element} notesCell
   * @property {Element} totalCell
   */

  /**
   * STELLAVERSE のテーブルリンクから抽出した MD5 と所属行。
   * @typedef {Object} StellaverseMd5Match
   * @property {string} md5
   * @property {HTMLAnchorElement} anchor
   * @property {Element|null} row
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

    const adLink = document.createElement("a");
    adLink.className = "bmsie-version-notice-ad";
    adLink.href = "https://neeted.github.io/bemusicseeker-unofficial-fork/index.ja.html";
    adLink.target = "_blank";
    adLink.rel = "noopener noreferrer";
    const adImage = document.createElement("img");
    adImage.alt = "be music seeker unofficial fork";
    adImage.width = 636;
    adImage.height = 334;
    adLink.append(adImage);
    void loadVersionNotificationImageDataUrl("https://bms.howan.jp/img/ogp-card.ja.jpg")
      .then((dataUrl) => {
        if (adImage.isConnected) {
          adImage.src = dataUrl;
        }
      })
      .catch((error) => {
        console.warn("リリースノート広告画像の取得に失敗しました:", error);
        adLink.hidden = true;
      });

    const okButton = document.createElement("button");
    okButton.type = "button";
    okButton.className = "bmsie-version-notice-ok";

    footerElement.append(okButton);
    windowElement.append(versionElement, titleElement, contentElement, controlsElement, adLink, footerElement);
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
      persistNotifiedVersion(version);
      host.remove();
    });

    shadowRoot.append(styleElement, overlay);
    document.body.appendChild(host);

    function renderNotificationLanguage(language) {
      const localizedContent = notificationContent[language] ?? notificationContent.ja;
      versionElement.textContent = `version: ${version}`;
      titleElement.textContent = localizedContent.title;
      languageLabelText.textContent = localizedContent.languageLabel;
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

  async function loadVersionNotificationImageDataUrl(url) {
    const response = await userscriptFetch(url);
    if (!response.ok) {
      throw new Error(`Image request failed: ${response.status} ${response.statusText}`);
    }
    const imageBuffer = await response.arrayBuffer();
    return `data:image/jpeg;base64,${arrayBufferToBase64(imageBuffer)}`;
  }

  function arrayBufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
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
      case STELLAVERSE_HOST:
        stellaverse();
        break;
      case STELLAVERSE_IR_HOST:
        stellaverseIr();
        break;
      case BOKUTACHI_HOST:
        bokutachi();
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

  function getBmsIrSongMd5(url) {
    try {
      const md5 = new URL(url).searchParams.get("songmd5");
      return BMS_IR_MD5_PATTERN.test(md5 ?? "") ? md5.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function getBokutachiChartRoute(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname !== BOKUTACHI_HOST) {
        return null;
      }
      const match = parsedUrl.pathname.match(BOKUTACHI_CHART_PATH_PATTERN);
      if (!match) {
        return null;
      }
      return {
        game: decodeURIComponent(match[1]),
        chartId: decodeURIComponent(match[2])
      };
    } catch {
      return null;
    }
  }

  function isBokutachiChartUrl(url) {
    return Boolean(getBokutachiChartRoute(url));
  }

  function getStellaverseThreadPageKey(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname !== STELLAVERSE_HOST) {
        return null;
      }
      const match = parsedUrl.pathname.match(STELLAVERSE_THREAD_PATH_PATTERN);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  function isStellaverseThreadUrl(url) {
    return Boolean(getStellaverseThreadPageKey(url));
  }

  /**
   * 描画済みDOMから確認できる STELLAVERSE のスレッド番号を重複なしで取得する。
   * 言語部分には依存せず、breadcrumb とタイトル内の先頭の「#数字」だけを参照する。
   * @returns {string[]}
   */
  function getRenderedStellaverseThreadPageKeys() {
    const breadcrumbText = document.querySelector(STELLAVERSE_SELECTORS.breadcrumbPage)?.textContent ?? "";
    const renderedTexts = [breadcrumbText, document.title];
    return Array.from(new Set(renderedTexts
      .map((text) => text.match(/#(\d+)/)?.[1] ?? null)
      .filter(Boolean)));
  }

  /**
   * SPA遷移後のURLと描画済みDOMが同じスレッドを指しているか判定する。
   * breadcrumb とタイトルが一時的に食い違う hydration 中は処理を保留する。
   * @param {string} pageKey
   * @returns {boolean}
   */
  function isRenderedStellaverseThreadCurrent(pageKey) {
    const renderedPageKeys = getRenderedStellaverseThreadPageKeys();
    return renderedPageKeys.length === 1 && renderedPageKeys[0] === pageKey;
  }

  function getStellaverseIrChartMd5(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname !== STELLAVERSE_IR_HOST) {
        return null;
      }
      const match = parsedUrl.pathname.match(STELLAVERSE_IR_CHART_PATH_PATTERN);
      return match ? match[1].toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function isStellaverseIrChartUrl(url) {
    return Boolean(getStellaverseIrChartMd5(url));
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
  function watchSpaPage({ siteName, matchUrl, updatePage, isSettled, cleanupPage }) {
    let lastUrl = location.href;
    let completedUrl = null;
    let observer = null;
    let isUpdating = false;
    let pendingUpdate = false;
    let scheduledFrame = null;
    let routeGeneration = 0;
    let requestedRetryCount = 0;
    const maxRequestedRetriesPerUrl = 2;

    // 同じ URL での再実行を止めるため、サイト側処理が完了した時点を記録する。
    function createMarkUpdated(updateUrl, updateGeneration) {
      return () => {
        if (location.href !== updateUrl || routeGeneration !== updateGeneration) {
          console.info(`${siteName}: URL変更後に完了通知されたため無視します`, updateUrl);
          return;
        }
        completedUrl = updateUrl;
      };
    }

    function shouldStopObserving() {
      return completedUrl === location.href || !matchUrl(location.href) || Boolean(isSettled?.());
    }

    async function runUpdate({ queueIfUpdating = false } = {}) {
      if (isUpdating) {
        if (queueIfUpdating) {
          pendingUpdate = true;
        }
        return;
      }
      if (completedUrl === location.href || !matchUrl(location.href) || isSettled?.()) {
        if (shouldStopObserving()) {
          stopObserving();
        }
        return;
      }

      isUpdating = true;
      const updateUrl = location.href;
      const updateGeneration = routeGeneration;
      let updateResult;
      try {
        updateResult = await updatePage({ markUpdated: createMarkUpdated(updateUrl, updateGeneration) });
      } finally {
        isUpdating = false;
        const shouldRunPendingUpdate = pendingUpdate;
        pendingUpdate = false;
        const canUseUpdateResult = location.href === updateUrl && routeGeneration === updateGeneration;
        const shouldRunRequestedRetry = canUseUpdateResult
          && updateResult?.retry === true
          && requestedRetryCount < maxRequestedRetriesPerUrl;
        if (shouldRunRequestedRetry) {
          requestedRetryCount += 1;
        }
        if (shouldStopObserving()) {
          stopObserving();
        } else if ((shouldRunPendingUpdate || shouldRunRequestedRetry) && !document.hidden) {
          scheduleRunUpdate();
        }
      }
    }

    function scheduleRunUpdate({ queueIfUpdating = false } = {}) {
      if (queueIfUpdating && isUpdating) pendingUpdate = true;
      if (document.hidden) {
        return;
      }
      if (scheduledFrame !== null) return;
      scheduledFrame = window.requestAnimationFrame(() => {
        scheduledFrame = null;
        void runUpdate({ queueIfUpdating }).catch((error) => console.error(`${siteName}: ページ更新に失敗しました`, error));
      });
    }

    function startObserving() {
      if (observer || !matchUrl(location.href) || !document.body) {
        return;
      }

      console.log(`👁️ ${siteName}: MutationObserverによる監視を開始します`);

      observer = new MutationObserver((mutationRecords) => {
        if (isOnlyBmsInfoOwnedMutation(mutationRecords)) {
          return;
        }
        scheduleRunUpdate({ queueIfUpdating: true });
        if (shouldStopObserving()) {
          stopObserving();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href"] });
    }

    function isOnlyBmsInfoOwnedMutation(mutationRecords) {
      let hasOwnedMutationNode = false;
      for (const mutationRecord of mutationRecords) {
        const target = mutationRecord.target.nodeType === Node.ELEMENT_NODE
          ? mutationRecord.target : mutationRecord.target.parentElement;
        if (target?.closest?.(`#bmsdata-container, #${PreviewRuntime.PREVIEW_OVERLAY_HOST_ID}, ${STELLAVERSE_ELAPSED_TIME_SELECTOR}, ${STELLAVERSE_TOTAL_NOTE_SELECTOR}`)) {
          hasOwnedMutationNode = true;
          continue;
        }
        // 拡張ルートの削除はサイト側による消失でも起こるため、自己変更として除外しない。
        if (mutationRecord.removedNodes.length > 0) return false;
        const changedNodes = [
          ...Array.from(mutationRecord.addedNodes)
        ];
        if (changedNodes.length === 0) {
          return false;
        }
        for (const node of changedNodes) {
          if (!isBmsInfoOwnedMutationNode(node)) {
            return false;
          }
          hasOwnedMutationNode = true;
        }
      }
      return hasOwnedMutationNode;
    }

    function isBmsInfoOwnedMutationNode(node) {
      return node instanceof Element
        && (
          node.id === "bmsdata-container"
          || node.id === PreviewRuntime.PREVIEW_OVERLAY_HOST_ID
          || node.matches?.(STELLAVERSE_ELAPSED_TIME_SELECTOR)
          || node.matches?.(STELLAVERSE_TOTAL_NOTE_SELECTOR)
        );
    }

    function stopObserving() {
      if (observer) {
        observer.disconnect();
        observer = null;
        console.log(`🛑 ${siteName}: MutationObserverによる監視を停止します`);
      }
    }

    installLocationChangeHookOnce();

    function handleReadyEvent(eventName) {
      console.info(`🔥 ${eventName}イベントが発火しました`);
      startObserving();
      scheduleRunUpdate();
    }

    if (document.readyState === "loading") {
      document.addEventListener('DOMContentLoaded', () => {
        handleReadyEvent("DOMContentLoaded");
      }, { once: true });
      window.addEventListener('load', () => {
        handleReadyEvent("load");
      }, { once: true });
    } else {
      console.info("🔥 DOMContentLoadedイベントは発火済でした");
      startObserving();
      scheduleRunUpdate();
      if (document.readyState !== "complete") {
        window.addEventListener('load', () => {
          handleReadyEvent("load");
        }, { once: true });
      }
    }

    document.addEventListener("visibilitychange", () => {
      console.info("🔥 Visibilitychangeイベントが発火しました");
      if (document.hidden) {
        return;
      }
      startObserving();
      scheduleRunUpdate();
    });

    window.addEventListener("locationchange", () => {
      if (location.href === lastUrl) {
        return;
      }

      const previousUrl = lastUrl;
      lastUrl = location.href;
      completedUrl = null;
      pendingUpdate = false;
      routeGeneration += 1;
      requestedRetryCount = 0;
      console.log("🔄 URLが変化しました:", lastUrl);
      try {
        cleanupPage?.({ previousUrl, currentUrl: lastUrl });
      } catch (error) {
        console.warn(`${siteName}: SPA遷移時のcleanupに失敗しました`, error);
      }
      // SPA 遷移で DOM が差し替わる前に、前ページの preview runtime を破棄する。
      resetActiveBmsPreviewRuntime();

      if (matchUrl(location.href)) {
        startObserving();
        scheduleRunUpdate({ queueIfUpdating: true });
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
   * 挿入済みの拡張パネルと、それに紐づく preview runtime を破棄する。
   * @param {Element|null|undefined} container
   * @returns {void}
   */
  function destroyBmsDataContainer(container) {
    if (!container) {
      return;
    }
    const runtime = container.__bmsPreviewRuntime;
    if (runtime) {
      runtime.destroy();
      if (activeBmsPreviewRuntime === runtime) {
        activeBmsPreviewRuntime = null;
      }
      container.__bmsPreviewRuntime = null;
    }
    container.remove();
  }

  /**
   * 条件に合う拡張パネルをすべて削除する。
   * @param {(container: Element) => boolean} predicate
   * @returns {void}
   */
  function removeBmsDataContainers(predicate) {
    for (const container of document.querySelectorAll("#bmsdata-container")) {
      if (predicate(container)) {
        destroyBmsDataContainer(container);
      }
    }
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
   * STELLAVERSE のテーブル直前にある見出しを取得する。
   * @param {Element|null} tableContainer
   * @returns {Element|null}
   */
  function findStellaverseHeadingBeforeTable(tableContainer) {
    for (let sibling = tableContainer?.previousElementSibling ?? null; sibling; sibling = sibling.previousElementSibling) {
      if (sibling.matches("h1, h2, h3, h4, h5, h6")) {
        return sibling;
      }
    }
    return null;
  }

  /**
   * 既知リンクを含む譜面情報テーブルだけを読む。非表示行も識別元として維持する。
   * @returns {StellaverseDomRefs}
   */
  function getStellaverseDomRefs() {
    const threadRoot = document.querySelector(STELLAVERSE_SELECTORS.threadRoot);
    const pageMain = threadRoot?.closest("main") ?? document.querySelector(STELLAVERSE_SELECTORS.pageMain);
    const candidates = Array.from(pageMain?.querySelectorAll("table") ?? []).filter((table) => {
      // 投稿本文に貼られた表やリンクを譜面情報と誤認しない。
      if (table.closest('[id^="thread-"]')) return false;
      return Array.from(table.querySelectorAll("a")).some((anchor) => anchor.closest("table") === table
        && (getStellaverseViewerMd5(anchor.href) || getStellaverseIrChartMd5(anchor.href)));
    });
    const table = candidates.length === 1 ? candidates[0] : null;
    const tableContainer = table?.closest(STELLAVERSE_SELECTORS.tableContainer) ?? table;
    const targetElem = findStellaverseHeadingBeforeTable(tableContainer)
      ?? pageMain?.querySelector("h2") ?? null;
    const tableRows = Array.from(table?.rows ?? []);
    const anchors = table ? Array.from(table.querySelectorAll("a"))
      .filter((anchor) => anchor.closest("table") === table) : [];
    return { threadRoot, targetElem, tableContainer, tableRows, anchors };
  }

  /**
   * STELLAVERSE が表示する譜面ビューアリンクから MD5 を取得する。
   * @param {string} href
   * @returns {string|null}
   */
  function getStellaverseViewerMd5(href) {
    try {
      const parsedUrl = new URL(href, location.href);
      if (parsedUrl.hostname !== STELLAVERSE_VIEWER_HOST
        || !STELLAVERSE_VIEWER_PATH_PATTERN.test(parsedUrl.pathname)) {
        return null;
      }
      const md5 = parsedUrl.searchParams.get("md5");
      return BMS_IR_MD5_PATTERN.test(md5 ?? "") ? md5.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * テーブル内の既知リンクから MD5 と所属行を返す。
   * 譜面ビューアと STELLAVERSE IR の両方がある場合は、MD5が一致した安定DOMだけを採用する。
   * 文言や列番号には依存しない。
   * @param {HTMLAnchorElement[]} anchors
   * @returns {StellaverseMd5Match|null}
   */
  function findStellaverseMd5Match(anchors) {
    const matches = anchors.flatMap((anchor) => {
      const md5 = getStellaverseViewerMd5(anchor.href) ?? getStellaverseIrChartMd5(anchor.href);
      return md5 ? [{ md5, anchor, row: anchor.closest("tr") }] : [];
    });
    return matches.length && new Set(matches.map(({ md5 }) => md5)).size === 1 ? matches[0] : null;
  }

  /**
   * #TOTAL 未定義時だけ、比較用として beatoraja/LR2 相当値をセルへ併記する。
   * @param {StellaverseChartStatsCells} chartStats
   * @returns {void}
   */
  function enhanceStellaverseUndefinedTotal(chartStats) {
    const total = parseStellaverseCellNumber(chartStats.totalCell);
    const notes = parseStellaverseCellNumber(chartStats.notesCell);
    if (total !== 0 || !Number.isFinite(notes) || notes <= 0) {
      return;
    }

    const beatorajaTotal = Math.max(260.0, 7.605 * notes / (0.01 * notes + 6.5));
    const lr2Total = 160.0 + (notes + Math.min(Math.max(notes - 400, 0), 200)) * 0.16;
    let note = chartStats.totalCell.querySelector(STELLAVERSE_TOTAL_NOTE_SELECTOR);
    if (!note) {
      note = document.createElement("span");
      note.dataset.bmsieStellaverseTotalNote = "true";
      chartStats.totalCell.append(note);
    }
    const text = `, so #TOTAL is undefined. beatoraja is ${beatorajaTotal.toFixed(2)}(${(beatorajaTotal / notes).toFixed(3)}T/N), LR2 is ${lr2Total.toFixed(2)}(${(lr2Total / notes).toFixed(3)}T/N).`;
    if (note.textContent !== text) note.textContent = text;
  }

  /**
   * 経過時間表示が現在DOMの想定位置にあるか判定する。
   * @param {Element} element
   * @param {StellaverseDomRefs} domRefs
   * @returns {boolean}
   */
  function isCurrentStellaverseElapsedTimeElement(element, domRefs) {
    if (domRefs.targetElem) {
      return domRefs.targetElem.nextElementSibling === element;
    }
    return domRefs.threadRoot?.previousElementSibling === element;
  }

  /**
   * STELLAVERSE の経過時間表示を現在ページにつき1つだけ差し込む。
   * 見出しが取れない場合も thread の直前へフォールバックし、メタデータ処理は止めない。
   * @param {StellaverseDomRefs} domRefs
   * @param {string} pageKey
   * @returns {void}
   */
  function insertStellaverseElapsedTime(domRefs, pageKey) {
    const existingElements = Array.from(document.querySelectorAll(STELLAVERSE_ELAPSED_TIME_SELECTOR));
    if (!domRefs.threadRoot) {
      existingElements.forEach((element) => element.remove());
      return;
    }

    const postedDatetime = extractStellaversePostedDatetime(domRefs.threadRoot);
    if (!postedDatetime) {
      existingElements.forEach((element) => element.remove());
      console.info("❌ 投稿日時がパースできませんでした。メタデータ処理は継続します");
      return;
    }

    const currentElement = existingElements.find((element) => {
      return element.dataset?.bmsiePageKey === pageKey
        && element.dataset?.bmsiePostedDatetime === postedDatetime
        && isCurrentStellaverseElapsedTimeElement(element, domRefs);
    });
    if (currentElement) {
      existingElements.filter((element) => element !== currentElement).forEach((element) => element.remove());
      return;
    }
    existingElements.forEach((element) => element.remove());

    const postedDate = parseStellaversePostedDate(postedDatetime);
    if (!postedDate) {
      console.info("❌ 投稿日時を日付へ変換できませんでした。メタデータ処理は継続します");
      return;
    }
    const now = new Date();
    const diffMs = now - postedDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const elapsedTimeElement = document.createElement("p");
    elapsedTimeElement.dataset.bmsieStellaverseElapsedTime = "true";
    elapsedTimeElement.dataset.bmsiePageKey = pageKey;
    elapsedTimeElement.dataset.bmsiePostedDatetime = postedDatetime;
    elapsedTimeElement.textContent = `Elapsed time: ${diffDays} days ${String(diffHours).padStart(2, "0")} hours ${String(diffMinutes).padStart(2, "0")} minutes`;

    if (domRefs.targetElem) {
      domRefs.targetElem.insertAdjacentElement("afterend", elapsedTimeElement);
    } else {
      domRefs.threadRoot.insertAdjacentElement("beforebegin", elapsedTimeElement);
    }
  }

  /**
   * STELLAVERSE の配色モードを color-scheme とOS設定から判定する。
   * @returns {boolean}
   */
  function isStellaverseDarkMode() {
    const inlineColorScheme = document.documentElement.style.getPropertyValue("color-scheme").trim().toLowerCase();
    if (inlineColorScheme.includes("dark")) {
      return true;
    }
    if (inlineColorScheme.includes("light")) {
      return false;
    }

    const computedColorScheme = window.getComputedStyle?.(document.documentElement)?.colorScheme?.toLowerCase() ?? "";
    if (computedColorScheme.includes("dark")) {
      return true;
    }
    if (computedColorScheme.includes("light")) {
      return false;
    }
    return Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches);
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

      const targetMd5 = getBmsIrSongMd5(window.location.href);
      if (!targetMd5) {
        console.info("❌ BMS-IRのページ書き換えはスキップされました。URLから有効なsongmd5を取得できませんでした");
        return;
      }

      const insertion = findBmsIrMetadataInsertion();
      if (!insertion) {
        console.info("❌ BMS-IRのページ書き換えはスキップされました。曲名のh1要素を取得できませんでした");
        return;
      }

      const pageContext = {
        identifiers: { md5: targetMd5, sha256: null, bmsid: null },
        insertion,
        theme: BMS_IR_THEME,
        currentSite: PreviewRuntime.PREVIEW_LINK_SITE.bmsIr
      };
      // テンプレートを挿入
      const container = insertBmsDataTemplate(pageContext);
      // 外部から取得したデータでテンプレートを置換
      const insertResult = await insertBmsData(pageContext, container);
      if (insertResult.ok) {
        console.info("✅ 外部データの取得とページの書き換えが成功しました");
      } else {
        console.error("❌ 外部データの取得とページの書き換えが失敗しました");
      }
    }
  }

  function findBmsIrMetadataInsertion() {
    const titleCandidates = Array.from(document.querySelectorAll("h1"));
    for (const titleCandidate of titleCandidates) {
      const songArtist = titleCandidate.nextElementSibling;
      const genre = songArtist?.matches("h2") ? songArtist.nextElementSibling : null;
      if (genre?.matches("p") && /^genre\s*:/i.test(genre.textContent.trim())) {
        return { element: genre, position: "afterend" };
      }
    }

    const songTitle = document.querySelector("#main-content h1")
      ?? document.querySelector("#box h1")
      ?? titleCandidates[0];
    if (!songTitle) {
      return null;
    }

    return { element: songTitle, position: "beforebegin" };
  }

  // ====================================================================================================
  // Bokutachi
  //   ReactのSPAなのでDOMの監視で譜面ページの描画完了を待つ
  // ====================================================================================================
  /**
   * Bokutachi 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function bokutachi() {
    console.info("Bokutachiの処理に入りました");
    window.addEventListener("locationchange", () => {
      document.getElementById("bmsdata-container")?.remove();
    });
    watchSpaPage({
      siteName: "Bokutachi",
      matchUrl: isBokutachiChartUrl,
      updatePage,
      isSettled: () => Boolean(document.getElementById("bmsdata-container"))
    });

    async function updatePage({ markUpdated }) {
      const chartRoute = getBokutachiChartRoute(location.href);
      if (!chartRoute) {
        return;
      }
      console.info("Bokutachi譜面ページの書き換え処理に入りました");
      if (document.getElementById("bmsdata-container")) {
        console.info("前回の拡張情報がまだ残っているためスキップします");
        return;
      }

      const insertionElement = findBokutachiMetadataInsertionElement();
      if (!insertionElement) {
        console.info("❌ Bokutachiのページ書き換えはスキップされました。差し込み先が見つかりませんでした");
        return;
      }

      const identifiers = await resolveBokutachiPageIdentifiers(chartRoute);
      if (!identifiers) {
        console.info("❌ Bokutachiのページ書き換えはスキップされました。譜面のMD5/SHA256が取得できませんでした");
        return;
      }

      const pageContext = {
        identifiers,
        insertion: { element: insertionElement, position: "beforebegin" },
        theme: BOKUTACHI_THEME,
        currentSite: PreviewRuntime.PREVIEW_LINK_SITE.bokutachi
      };
      const container = insertBmsDataTemplate(pageContext);
      const insertResult = await insertBmsData(pageContext, container);
      if (insertResult.ok) {
        insertionElement.remove();
        markUpdated();
        console.info("✅ 外部データの取得とページの書き換えが成功しました");
      } else {
        markUpdated();
        console.error("❌ 外部データの取得とページの書き換えが失敗しました");
      }
    }
  }

  async function resolveBokutachiPageIdentifiers(chartRoute) {
    const apiIdentifiers = await PreviewRuntime.fetchBokutachiChartIdentifiers(chartRoute);
    if (apiIdentifiers?.sha256 || apiIdentifiers?.md5) {
      return {
        md5: apiIdentifiers.md5,
        sha256: apiIdentifiers.sha256,
        bmsid: null
      };
    }

    const md5 = extractBokutachiViewerMd5();
    if (!md5) {
      return null;
    }
    return { md5, sha256: null, bmsid: null };
  }

  function findBokutachiMetadataInsertionElement() {
    const songInfoCard = findBokutachiSongInfoCard();
    return songInfoCard?.querySelector(".card-body hr, hr") ?? null;
  }

  function findBokutachiSongInfoCard() {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    const songInfoHeading = headings.find((heading) => heading.textContent.trim() === "Song Info");
    return songInfoHeading?.closest(".card") ?? null;
  }

  function extractBokutachiViewerMd5() {
    const songInfoCard = findBokutachiSongInfoCard();
    const anchors = Array.from((songInfoCard ?? document).querySelectorAll("a"));
    const viewChartLink = anchors.find((anchor) => anchor.textContent.trim() === "View Chart");
    if (!viewChartLink) {
      return null;
    }
    try {
      const md5 = new URL(viewChartLink.href, location.href).searchParams.get("md5");
      return BMS_IR_MD5_PATTERN.test(md5 ?? "") ? md5.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  /**
   * STELLAVERSE IR の meta-box から MD5 行の値を取り出す。
   * @param {Element} metaBox
   * @returns {string|null}
   */
  function extractStellaverseIrMetaMd5(metaBox) {
    for (const row of metaBox.querySelectorAll("tr")) {
      const cells = Array.from(row.children);
      for (let index = 0; index < cells.length - 1; index += 1) {
        const label = cells[index].textContent.trim().replace(/\s+/g, "").toUpperCase();
        if (label !== "MD5") {
          continue;
        }
        const match = cells[index + 1].textContent.match(/[0-9a-fA-F]{32}/);
        return match ? match[0].toLowerCase() : null;
      }
    }
    return null;
  }

  /**
   * 現在URLと同じ曲を表示している STELLAVERSE IR のDOM参照を取得する。
   * @param {string} targetmd5
   * @returns {{ box: Element, chartHeader: Element, metaBox: Element, md5: string }|null}
   */
  function getStellaverseIrChartDomContext(targetmd5) {
    const box = document.getElementById("box");
    const chartHeader = document.querySelector(STELLAVERSE_IR_SELECTORS.chartHeader);
    const metaBox = document.querySelector(STELLAVERSE_IR_SELECTORS.metaBox);
    if (!box || !chartHeader || !metaBox || chartHeader.parentElement !== box || metaBox.parentElement !== box) {
      return null;
    }

    const md5 = extractStellaverseIrMetaMd5(metaBox);
    if (md5 !== targetmd5) {
      return null;
    }

    return { box, chartHeader, metaBox, md5 };
  }

  /**
   * STELLAVERSE IR で挿入した拡張パネルかどうかを判定する。
   * siteId がないものは、旧版が挿入した同一サイト上のパネルとして扱う。
   * @param {Element} container
   * @returns {boolean}
   */
  function isStellaverseIrBmsDataContainer(container) {
    const siteId = container.dataset?.bmsieSite;
    return siteId === STELLAVERSE_IR_SITE_ID || !siteId;
  }

  /**
   * STELLAVERSE IR の拡張パネルをすべて削除する。
   * @returns {void}
   */
  function cleanupStellaverseIrBmsDataContainers() {
    removeBmsDataContainers(isStellaverseIrBmsDataContainer);
  }

  /**
   * 現在ページ以外の STELLAVERSE IR 拡張パネルを削除する。
   * @param {string} pageKey
   * @returns {void}
   */
  function cleanupStellaverseIrBmsDataContainersExcept(pageKey) {
    removeBmsDataContainers((container) => {
      if (!isStellaverseIrBmsDataContainer(container)) {
        return false;
      }
      return container.dataset?.bmsiePageKey !== pageKey;
    });
  }

  /**
   * STELLAVERSE IR の現在ページ用パネルを取得する。
   * @param {string} pageKey
   * @returns {Element|null}
   */
  function findStellaverseIrBmsDataContainer(pageKey) {
    return Array.from(document.querySelectorAll("#bmsdata-container")).find((container) => {
      return container.dataset?.bmsieSite === STELLAVERSE_IR_SITE_ID
        && container.dataset?.bmsiePageKey === pageKey;
    }) ?? null;
  }

  /**
   * STELLAVERSE IR の拡張パネルが現在の chart-header 直後に残っているか判定する。
   * @param {Element} container
   * @param {string} pageKey
   * @param {{ chartHeader: Element }} domContext
   * @returns {boolean}
   */
  function isCurrentStellaverseIrBmsDataContainer(container, pageKey, domContext) {
    return container.isConnected
      && container.dataset?.bmsieSite === STELLAVERSE_IR_SITE_ID
      && container.dataset?.bmsiePageKey === pageKey
      && Boolean(container.__bmsPreviewRuntime)
      && domContext.chartHeader.nextElementSibling === container;
  }

  // ====================================================================================================
  // STELLAVERSE IR
  //   MD5 を含む曲ページに共通の拡張パネルを追加する
  // ====================================================================================================
  /**
   * STELLAVERSE IR 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function stellaverseIr() {
    console.info("STELLAVERSE IRの処理に入りました");
    watchSpaPage({
      siteName: "STELLAVERSE IR",
      matchUrl: isStellaverseIrChartUrl,
      updatePage,
      cleanupPage: cleanupStellaverseIrBmsDataContainers
    });

    // ==================================================================================================
    // 曲ページの書き換え処理
    async function updatePage({ markUpdated }) {
      // SSRの曲情報だけでは挿入せず、SvelteKitのマウント完了を待つ。
      if (!document.getElementById("svelte-announcer")) return;
      const targetmd5 = getStellaverseIrChartMd5(location.href);
      if (!targetmd5) {
        return;
      }
      console.info("STELLAVERSE IR曲ページの書き換え処理に入りました");

      cleanupStellaverseIrBmsDataContainersExcept(targetmd5);

      const domContext = getStellaverseIrChartDomContext(targetmd5);
      if (!domContext) {
        console.info("❌ STELLAVERSE IRのページ書き換えはスキップされました。現在URLに対応する差し込み先がまだ見つかりませんでした");
        return;
      }

      const existingContainer = findStellaverseIrBmsDataContainer(targetmd5);
      if (existingContainer) {
        if (isCurrentStellaverseIrBmsDataContainer(existingContainer, targetmd5, domContext)) {
          console.info("既に現在ページ用のbmsdataが挿入済みのためスキップします");
          return;
        }
        destroyBmsDataContainer(existingContainer);
      }

      // DOMから外されたパネルのruntimeも、再取得前に破棄する。
      resetActiveBmsPreviewRuntime();
      const pageContext = {
        identifiers: { md5: targetmd5, sha256: null, bmsid: null },
        insertion: { element: domContext.chartHeader, position: "afterend" },
        theme: STELLAVERSE_IR_THEME,
        currentSite: STELLAVERSE_IR_SITE_ID,
        siteId: STELLAVERSE_IR_SITE_ID,
        pageKey: targetmd5
      };
      const container = insertBmsDataTemplate(pageContext);
      let insertResult;
      try {
        insertResult = await insertBmsData(pageContext, container);
      } catch (error) {
        destroyBmsDataContainer(container);
        markUpdated();
        console.error("STELLAVERSE IR: メタデータ表示に失敗しました", error);
        return;
      }
      if (!insertResult.ok) {
        destroyBmsDataContainer(container);
        if (insertResult.reason === "detached") return { retry: true };
        // 取得失敗をDOM更新のたびに再試行せず、元の曲情報を維持する。
        markUpdated();
        console.error("STELLAVERSE IR: 外部メタデータを取得できませんでした");
        return;
      }
      const currentContext = getStellaverseIrChartDomContext(targetmd5);
      if (getStellaverseIrChartMd5(location.href) !== targetmd5
        || !currentContext
        || !isCurrentStellaverseIrBmsDataContainer(container, targetmd5, currentContext)) {
        destroyBmsDataContainer(container);
        return { retry: true };
      }
      // 成功後も監視を維持する。正常なパネルがあれば次回の再取得は省く。
      console.info("✅ STELLAVERSE IRのメタデータ表示が完了しました");
    }
  }

  /**
   * STELLAVERSE で挿入した拡張パネルかどうかを判定する。
   * siteId がないものは、旧版が同一ホストへ挿入したパネルとして扱う。
   * @param {Element} container
   * @returns {boolean}
   */
  function isStellaverseBmsDataContainer(container) {
    const siteId = container.dataset?.bmsieSite;
    return siteId === STELLAVERSE_SITE_ID || !siteId;
  }

  /**
   * STELLAVERSE のSPA遷移時に拡張側のDOMを片付ける。
   * @returns {void}
   */
  function cleanupStellaversePageArtifacts() {
    removeBmsDataContainers(isStellaverseBmsDataContainer);
    document.querySelectorAll(STELLAVERSE_ELAPSED_TIME_SELECTOR).forEach((element) => element.remove());
    document.querySelectorAll(`.${STELLAVERSE_SOURCE_CLASS}`).forEach((element) => element.classList.remove(STELLAVERSE_SOURCE_CLASS));
    document.querySelectorAll(".bmsie-stellaverse-duplicate").forEach((row) => row.classList.remove("bmsie-stellaverse-duplicate"));
    document.querySelectorAll(STELLAVERSE_TOTAL_NOTE_SELECTOR).forEach((element) => element.remove());
  }

  /**
   * STELLAVERSE の現在ページ用パネルを取得する。
   * @param {string} pageKey
   * @returns {Element|null}
   */
  function findStellaverseBmsDataContainer(pageKey) {
    return Array.from(document.querySelectorAll("#bmsdata-container")).find((container) => {
      return container.dataset?.bmsieSite === STELLAVERSE_SITE_ID
        && container.dataset?.bmsiePageKey === pageKey;
    }) ?? null;
  }

  /**
   * STELLAVERSE の拡張パネルが現在テーブルの直後に残っているか判定する。
   * @param {Element} container
   * @param {string} pageKey
   * @param {StellaverseDomRefs} domRefs
   * @returns {boolean}
   */
  function isCurrentStellaverseBmsDataContainer(container, pageKey, domRefs) {
    return container.isConnected
      && container.dataset?.bmsieSite === STELLAVERSE_SITE_ID
      && container.dataset?.bmsiePageKey === pageKey
      && Boolean(container.__bmsPreviewRuntime)
      && domRefs.tableContainer?.nextElementSibling === container;
  }

  /**
   * テーブルとパネルを別コンポーネントのまま維持しつつ、親レイアウト由来の縦方向の隙間だけを相殺する。
   * 実際の描画位置から求めるため、サイト側の gap 値やクラス名には依存しない。
   * @param {Element|null} tableContainer
   * @param {HTMLElement} container
   * @returns {void}
   */
  function collapseStellaversePanelGap(tableContainer, container) {
    container.style.removeProperty("margin-block-start");
    if (!tableContainer
      || tableContainer.nextElementSibling !== container
      || container.parentElement !== tableContainer.parentElement) {
      return;
    }

    const tableRect = tableContainer.getBoundingClientRect();
    const panelRect = container.getBoundingClientRect();
    const renderedGap = panelRect.top - tableRect.bottom;
    if (!Number.isFinite(renderedGap) || renderedGap <= 0) {
      return;
    }
    container.style.marginBlockStart = `-${renderedGap}px`;
  }

  // ====================================================================================================
  // STELLAVERSE
  //   SvelteKitの初期化とSPA遷移に合わせてDOMを更新する
  // ====================================================================================================
  /**
   * STELLAVERSE 向けの拡張処理を初期化する。
   * @returns {Promise<void>}
   */
  async function stellaverse() {
    GM_addStyle(STELLAVERSE_TABLE_CSS);
    watchSpaPage({
      siteName: "STELLAVERSE",
      matchUrl: isStellaverseThreadUrl,
      updatePage,
      cleanupPage: cleanupStellaversePageArtifacts
    });

    async function updatePage({ markUpdated }) {
      // SvelteKitがonMount後に生成する要素。SSRの表や日時が見えるだけでは書き換えない。
      // この実装依存はここに限定し、時間切れを理由に強制的に書き換えない。
      if (!document.getElementById("svelte-announcer")) {
        console.info("STELLAVERSE: SvelteKitの初期化待ちのため、ページの書き換えを保留します");
        return;
      }
      const pageKey = getStellaverseThreadPageKey(location.href);
      if (!pageKey || !isRenderedStellaverseThreadCurrent(pageKey)) return;
      const domRefs = getStellaverseDomRefs();
      if (!domRefs.tableContainer) {
        cleanupStellaversePageArtifacts();
        resetActiveBmsPreviewRuntime();
        return;
      }
      domRefs.tableContainer.classList.add(STELLAVERSE_SOURCE_CLASS);
      insertStellaverseElapsedTime(domRefs, pageKey);
      // 古い補足は元のTOTAL値が変わった場合も残さない。
      const chartStats = getStellaverseChartStatsCells(domRefs.tableRows);
      for (const note of domRefs.tableContainer.querySelectorAll(STELLAVERSE_TOTAL_NOTE_SELECTOR)) {
        if (!chartStats || note.parentElement !== chartStats.totalCell || parseStellaverseCellNumber(chartStats.totalCell) !== 0) note.remove();
      }
      if (chartStats) enhanceStellaverseUndefinedTotal(chartStats);

      const md5Match = findStellaverseMd5Match(domRefs.anchors);
      if (!md5Match) {
        removeBmsDataContainers(isStellaverseBmsDataContainer);
        resetActiveBmsPreviewRuntime();
        console.info("STELLAVERSE: 譜面リンクのMD5が一致しないため、メタデータ表示を保留します");
        return;
      }
      const existingContainer = findStellaverseBmsDataContainer(pageKey);
      if (existingContainer && isCurrentStellaverseBmsDataContainer(existingContainer, pageKey, domRefs)
        && existingContainer.dataset.bmsieStellaverseMd5 === md5Match.md5) {
        updateStellaverseDuplicateRows(domRefs, md5Match);
        collapseStellaversePanelGap(domRefs.tableContainer, existingContainer);
        return;
      }
      // 同じURLでもパネルや表が置き換わったら、切り離されたruntimeを含めて破棄する。
      removeBmsDataContainers(isStellaverseBmsDataContainer);
      resetActiveBmsPreviewRuntime();
      const pageContext = {
        identifiers: { md5: md5Match.md5, sha256: null, bmsid: null },
        insertion: { element: domRefs.tableContainer, position: "afterend" },
        theme: isStellaverseDarkMode() ? STELLAVERSE_THEMES.dark : STELLAVERSE_THEMES.light,
        currentSite: STELLAVERSE_SITE_ID,
        siteId: STELLAVERSE_SITE_ID,
        pageKey
      };
      const container = insertBmsDataTemplate(pageContext);
      container.dataset.bmsieStellaverseMd5 = md5Match.md5;
      let insertResult;
      try {
        insertResult = await insertBmsData(pageContext, container);
      } catch (error) {
        destroyBmsDataContainer(container);
        markUpdated();
        console.error("STELLAVERSE: メタデータ表示に失敗しました", error);
        return;
      }
      if (!insertResult.ok) {
        destroyBmsDataContainer(container);
        if (insertResult.reason === "detached") return { retry: true };
        // データが存在しない場合、DOM更新ごとの再取得を止めて元表を維持する。
        markUpdated();
        console.error("STELLAVERSE: 外部メタデータを取得できなかったため、元のテーブルを表示します");
        return;
      }
      const currentRefs = getStellaverseDomRefs();
      const currentMd5 = findStellaverseMd5Match(currentRefs.anchors);
      if (getStellaverseThreadPageKey(location.href) !== pageKey
        || !isRenderedStellaverseThreadCurrent(pageKey)
        || currentMd5?.md5 !== md5Match.md5
        || !isCurrentStellaverseBmsDataContainer(container, pageKey, currentRefs)) {
        destroyBmsDataContainer(container);
        return { retry: true };
      }
      updateStellaverseDuplicateRows(currentRefs, currentMd5);
      container.dataset.bmsieStellaverseReady = "true";
      collapseStellaversePanelGap(currentRefs.tableContainer, container);
      // 成功後も監視を維持し、次回は実DOMのパネルを確認して再取得を省く。
      console.info("✅ STELLAVERSEのメタデータ表示が完了しました");
    }
  }

  function updateStellaverseDuplicateRows(domRefs, md5Match) {
    const hiddenRows = new Set(getStellaverseRowsToHideAfterSuccess(domRefs.tableRows, md5Match));
    domRefs.tableRows.forEach((row) => row.classList.toggle("bmsie-stellaverse-duplicate", hiddenRows.has(row)));
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
          theme: { dctx: "#1A202C", dcbk: "#ffffff", hdtx: "#000000DE", hdbk: "#f1f1f1" },
          currentSite: PreviewRuntime.PREVIEW_LINK_SITE.minir
        };
        // テンプレートを挿入
        const container = insertBmsDataTemplate(pageContext);
        // 外部から取得したデータでテンプレートを置換
        const insertResult = await insertBmsData(pageContext, container);
        if (insertResult.ok) {
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
  //   初期 HTML の Chart Information を、描画成功後に共通パネルへ差し替える。
  // ====================================================================================================
  async function mocha() {
    if (!isMochaSongPath(location.pathname)) return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { void updateMochaPage(); }, { once: true });
    } else {
      await updateMochaPage();
    }
  }

  async function updateMochaPage() {
    if (!isMochaSongPath(location.pathname) || document.getElementById("bmsdata-container")) return;
    const section = findMochaSection(document, "Chart Information");
    if (!section) {
      console.warn("Mocha: Chart Information section が一意に見つかりませんでした");
      return;
    }
    const identifiers = getMochaIdentifiers(section);
    if (!identifiers.md5 && !identifiers.sha256) {
      console.warn("Mocha: 問い合わせに使用できるハッシュがありませんでした");
      return;
    }
    const pageContext = {
      identifiers,
      insertion: { element: section, position: "beforebegin" },
      theme: MOCHA_THEME,
      currentSite: PreviewRuntime.PREVIEW_LINK_SITE.mocha
    };
    let container;
    try {
      container = insertBmsDataTemplate(pageContext);
      const result = await insertBmsData(pageContext, container);
      if (result.ok && container.isConnected && section.isConnected) {
        preserveMochaLevel(section, container);
        section.remove();
        return;
      }
      console.error("Mocha: メタデータを表示できなかったため、元の曲情報を保持します", result.reason);
    } catch (error) {
      console.error("Mocha: 拡張パネルの描画に失敗しました", error);
    }
    destroyBmsDataContainer(container);
    await appendMochaFallbackLinks(document, identifiers, PreviewRuntime.checkBmsSearchPatternExists);
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
    const container = PreviewRuntime.insertBmsDataContainer({
      documentRef: document,
      insertion: pageContext.insertion,
      theme: pageContext.theme,
    });
    if (pageContext.siteId) {
      container.dataset.bmsieSite = pageContext.siteId;
    }
    if (pageContext.pageKey) {
      container.dataset.bmsiePageKey = pageContext.pageKey;
    }
    return container;
  }

  /**
   * 外部データ取得から描画、グラフ描画までのパイプラインを実行する。
   * @param {PageContext} pageContext
   * @param {HTMLElement} container
   * @returns {Promise<InsertBmsDataResult>}
   */
  async function insertBmsData(pageContext, container) {
    // 取得失敗時は差し込んだ空パネルを片付けて終了する。
    const normalizedRecord = await PreviewRuntime.fetchBmsInfoRecordByIdentifiers(pageContext.identifiers);
    if (!normalizedRecord) {
      destroyBmsDataContainer(container);
      return { ok: false, reason: "not-found" };
    }
    if (container.isConnected === false) {
      return { ok: false, reason: "detached" };
    }

    PreviewRuntime.renderBmsData(container, normalizedRecord, { currentSite: pageContext.currentSite });
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
      currentSite: pageContext.currentSite,
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

    return { ok: true, reason: "success" };
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
