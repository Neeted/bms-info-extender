import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("./main.js", import.meta.url), "utf8");

// userscriptのbootstrapや外部通信を起動せず、実際の関数をイベント環境に載せる。
function loadFunction(name, globals) {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n  }\n", start) + 5;
  return vm.runInNewContext(`(${source.slice(start, end)})`, globals);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function watcherEnvironment(updatePage, cleanupPage = () => {}) {
  const frames = [];
  const observers = [];
  const window = new EventTarget();
  const document = new EventTarget();
  Object.assign(document, { readyState: "complete", hidden: false, body: {} });
  window.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  class Element {
    constructor(id = "", ownedParent = null) { this.id = id; this.nodeType = 1; this.ownedParent = ownedParent; }
    matches() { return false; }
    closest() { return this.ownedParent; }
  }
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  const location = { href: "https://stellabms.xyz/thread/1" };
  let destroyed = 0;
  loadFunction("watchSpaPage", {
    window, document, location, Element, Node: { ELEMENT_NODE: 1 }, MutationObserver,
    console: { info() {}, log() {}, warn() {}, error(error) { throw error; } },
    installLocationChangeHookOnce() {},
    resetActiveBmsPreviewRuntime() { destroyed++; },
    PreviewRuntime: { PREVIEW_OVERLAY_HOST_ID: "overlay" },
    STELLAVERSE_ELAPSED_TIME_SELECTOR: "[elapsed]",
    STELLAVERSE_TOTAL_NOTE_SELECTOR: "[total]",
  })({ siteName: "test", matchUrl: () => true, updatePage, cleanupPage });

  return {
    location, window, Element,
    get destroyed() { return destroyed; },
    mutate({ target = new Element(), addedNodes = [], removedNodes = [] } = {}) {
      for (const observer of observers.filter((entry) => entry.active)) {
        observer.callback([{ target, addedNodes, removedNodes }]);
      }
    },
    async flush() {
      for (let turn = 0; turn < 20; turn++) {
        const callbacks = frames.splice(0);
        callbacks.forEach((callback) => callback());
        for (let tick = 0; tick < 8; tick++) await Promise.resolve();
        if (!frames.length) return;
      }
      throw new Error("ページ更新が収束しませんでした");
    },
  };
}

test("成功後も監視し、拡張ルートの追加は無視、削除は再実行する", async () => {
  let updates = 0;
  const env = watcherEnvironment(async () => { updates++; });
  await env.flush();
  assert.equal(updates, 1);
  const panel = new env.Element("bmsdata-container");
  env.mutate({ addedNodes: [panel] });
  await env.flush();
  assert.equal(updates, 1);
  env.mutate({ removedNodes: [panel] });
  await env.flush();
  assert.equal(updates, 2);
  env.mutate({ target: new env.Element("child", panel), removedNodes: [new env.Element()] });
  await env.flush();
  assert.equal(updates, 2);
});

test("取得中のDOM変更を取りこぼさず、変更通知をまとめて再評価する", async () => {
  let updates = 0;
  const fetch = deferred();
  const env = watcherEnvironment(async () => { if (++updates === 1) await fetch.promise; });
  await env.flush();
  for (let index = 0; index < 10; index++) env.mutate({ addedNodes: [new env.Element()] });
  await env.flush();
  assert.equal(updates, 1);
  fetch.resolve();
  await env.flush();
  assert.equal(updates, 2);
});

test("SPA遷移後に届いた古い完了通知で、新ページの処理を止めない", async () => {
  const fetch = deferred();
  const pages = [];
  let cleanups = 0;
  const env = watcherEnvironment(async ({ markUpdated }) => {
    pages.push(env.location.href);
    if (pages.length === 1) await fetch.promise;
    markUpdated();
  }, () => { cleanups++; });
  await env.flush();
  env.location.href = "https://stellabms.xyz/thread/2";
  env.window.dispatchEvent(new Event("locationchange"));
  await env.flush();
  fetch.resolve();
  await env.flush();
  assert.deepEqual(pages, ["https://stellabms.xyz/thread/1", "https://stellabms.xyz/thread/2"]);
  assert.equal(cleanups, 1);
  assert.equal(env.destroyed, 1);
});

function stellaEnvironment() {
  let config;
  let hydrated = false;
  let mounted = null;
  let fetchCount = 0;
  let disposed = 0;
  let reads = 0;
  let failure = false;
  const sourceTable = { classList: { add() {} }, querySelectorAll: () => [] };
  const refs = { tableContainer: sourceTable, tableRows: [], anchors: [] };
  const record = { md5: "a".repeat(32), row: {} };
  const run = loadFunction("stellaverse", {
    GM_addStyle() {}, STELLAVERSE_TABLE_CSS: "", STELLAVERSE_SOURCE_CLASS: "source",
    STELLAVERSE_TOTAL_NOTE_SELECTOR: "[total]", STELLAVERSE_SITE_ID: "stella",
    STELLAVERSE_THEMES: { dark: {} },
    console: { info() {}, error() {} },
    document: { getElementById: () => hydrated ? {} : null },
    location: { href: "https://stellabms.xyz/thread/1" },
    watchSpaPage(value) { config = value; },
    isStellaverseThreadUrl: () => true,
    cleanupStellaversePageArtifacts() {},
    getStellaverseThreadPageKey: () => "1",
    isRenderedStellaverseThreadCurrent: () => true,
    getStellaverseDomRefs() { reads++; return refs; },
    insertStellaverseElapsedTime() {},
    getStellaverseChartStatsCells: () => null,
    findStellaverseMd5Match: () => record,
    findStellaverseBmsDataContainer: () => mounted?.isConnected ? mounted : null,
    isCurrentStellaverseBmsDataContainer: (container) => container.isConnected,
    isStellaverseBmsDataContainer: () => true,
    removeBmsDataContainers() { if (mounted) mounted.isConnected = false; },
    resetActiveBmsPreviewRuntime() { if (mounted) disposed++; },
    isStellaverseDarkMode: () => true,
    insertBmsDataTemplate() { mounted = { dataset: {}, isConnected: true }; return mounted; },
    async insertBmsData() { fetchCount++; return { ok: !failure, reason: failure ? "not-found" : "success" }; },
    destroyBmsDataContainer(container) { container.isConnected = false; },
    updateStellaverseDuplicateRows() {},
    collapseStellaversePanelGap() {},
  });
  run();
  let completed = false;
  return {
    update: () => config.updatePage({ markUpdated() { completed = true; } }),
    hydrate() { hydrated = true; },
    fail() { failure = true; },
    get panel() { return mounted; },
    get fetchCount() { return fetchCount; },
    get disposed() { return disposed; },
    get reads() { return reads; },
    get completed() { return completed; },
  };
}

test("SvelteKitマウント前は書き換えず、成功後の再評価では取得し直さない", async () => {
  const env = stellaEnvironment();
  await env.update();
  assert.equal(env.reads, 0);
  assert.equal(env.panel, null);
  env.hydrate();
  await env.update();
  assert.equal(env.panel.dataset.bmsieStellaverseReady, "true");
  await env.update();
  assert.equal(env.fetchCount, 1);
  assert.equal(env.completed, false);
  env.panel.isConnected = false;
  await env.update();
  assert.equal(env.fetchCount, 2);
  assert.equal(env.disposed, 1);
  assert.equal(env.panel.isConnected, true);
});

test("取得失敗では重複行を非表示にせず、再取得の連鎖も止める", async () => {
  const env = stellaEnvironment();
  env.hydrate();
  env.fail();
  await env.update();
  assert.equal(env.panel.isConnected, false);
  assert.equal(env.panel.dataset.bmsieStellaverseReady, undefined);
  assert.equal(env.completed, true);
});
