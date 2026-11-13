import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { isMochaSongPath, getMochaIdentifiers } from "./mocha-dom.js";

const md5 = "f8dcdfe070630bbb365323c662561a1a";
const sha256 = "a6ed343ac9db07af0dd6eb8af3c80d79032aa777fd7ff2c28feb885717f47b89";

test("曲ページのみを対象にする", () => {
  for (const path of ["/songs/28", `/songs/${sha256}`, "/songs/28/"]) assert.ok(isMochaSongPath(path));
  for (const path of ["/songs", "/songs/level-reviews", "/songs/28/edit", "/songs/abc", `/songs/${md5}`]) {
    assert.equal(isMochaSongPath(path), false);
  }
});

// ラベルと入力欄の対応を表す。番号はハッシュ種別の判定に使わない。
function hashSection(fields) {
  return {
    querySelectorAll() {
      return fields.map(([label, id, value, htmlFor = id]) => ({
        textContent: label,
        querySelector: () => ({ htmlFor }),
        nextElementSibling: { tagName: "DD", querySelector: () => ({ id, value }) },
      }));
    },
  };
}

test("両ハッシュ・片方欠落・番号変更と大文字に対応する", () => {
  assert.deepEqual(getMochaIdentifiers(hashSection([
    ["MD5", "song-hash-0", md5], ["SHA-256", "song-hash-1", sha256],
  ])), { md5, sha256, bmsid: null });
  assert.deepEqual(getMochaIdentifiers(hashSection([
    ["SHA-256", "song-hash-0", ` ${sha256.toUpperCase()} `],
  ])), { md5: null, sha256, bmsid: null });
  assert.deepEqual(getMochaIdentifiers(hashSection([
    ["MD5", "song-hash-1", md5],
  ])), { md5, sha256: null, bmsid: null });
});

test("不正値・ラベルとの不一致・重複した欄を採用しない", () => {
  for (const fields of [
    [], [["MD5", "song-hash-0", sha256]], [["SHA-256", "song-hash-1", "g".repeat(64)]],
    [["MD5", "song-hash-0", md5, "song-hash-1"]],
    [["MD5", "song-hash-0", md5], ["MD5", "song-hash-1", md5]],
  ]) assert.deepEqual(getMochaIdentifiers(hashSection(fields)), { md5: null, sha256: null, bmsid: null });
});

const source = fs.readFileSync(new URL("./main.js", import.meta.url), "utf8");
function environment({ ok = true, throws = false, existing = false, hashes = { md5, sha256 }, path = "/songs/28" } = {}) {
  const events = [];
  const section = { isConnected: true, remove() { events.push("remove-source"); } };
  const container = { isConnected: true };
  const start = source.indexOf("  async function updateMochaPage()");
  const end = source.indexOf("\n  }\n", start) + 5;
  const update = vm.runInNewContext(`(${source.slice(start, end)})`, {
    document: { getElementById: () => existing }, location: { pathname: path },
    isMochaSongPath, findMochaSection: () => section, getMochaIdentifiers: () => hashes,
    MOCHA_THEME: {}, PreviewRuntime: { PREVIEW_LINK_SITE: { mocha: "mocha" }, checkBmsSearchPatternExists() {} },
    console: { warn() {}, error() {} },
    insertBmsDataTemplate() { events.push("insert"); return container; },
    async insertBmsData() { events.push("render"); if (throws) throw Error("描画失敗"); return { ok }; },
    preserveMochaLevel() { events.push("level"); },
    destroyBmsDataContainer() { events.push("cleanup"); },
    async appendMochaFallbackLinks() { events.push("links"); },
  });
  return { update, events };
}

test("描画成功後だけ LEVEL を引き継いで元 section を削除する", async () => {
  const env = environment();
  await env.update();
  assert.deepEqual(env.events, ["insert", "render", "level", "remove-source"]);
});

test("未収録・描画例外では元 section を残し、cleanup 後にリンクを補う", async () => {
  for (const options of [{ ok: false }, { throws: true }]) {
    const env = environment(options);
    await env.update();
    assert.deepEqual(env.events, ["insert", "render", "cleanup", "links"]);
  }
});

test("既存パネル・対象外 URL・ハッシュなしの場合は挿入しない", async () => {
  for (const options of [{ existing: true }, { path: "/songs/28/edit" }, { hashes: {} }]) {
    const env = environment(options);
    await env.update();
    assert.deepEqual(env.events, []);
  }
});
