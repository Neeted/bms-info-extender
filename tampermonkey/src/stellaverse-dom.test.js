import assert from "node:assert/strict";
import test from "node:test";
import {
  getStellaverseRowPairs,
  getStellaverseChartStatsCells,
  getStellaverseRowsToHideAfterSuccess,
  parseStellaverseCellNumber,
  extractStellaversePostedDatetime,
  parseStellaversePostedDate,
} from "./stellaverse-dom.js";

// data-slotのない標準HTMLセルを表す。DOMの書き換えはこのモジュールでは行わない。
function cell(tagName, textContent) {
  return { tagName, textContent, childNodes: [{ textContent }] };
}

function row(...values) {
  return { children: values.map((value, index) => cell(index % 2 === 0 ? "TH" : "TD", value)) };
}

const languages = [
  ["レベル", "キー", "BPM", "ノーツ数", "判定", "トータル", "IRページへのショットカット", "Viewer"],
  ["레벨", "키", "BPM", "노트 수", "판정", "토탈", "IR 바로가기", "Viewer"],
  ["Level", "Key", "BPM", "Notes", "Judge", "Total", "Go to IR", "Viewer"],
];

for (const labels of languages) {
  test(`通常のtr/th/tdから統計と重複行を識別する: ${labels[0]}`, () => {
    const rows = [
      row(labels[0], "12", labels[1], "7key"),
      row(labels[2], "160", labels[3], "1,910"),
      row(labels[4], "EASY", labels[5], "500 (0.262%/note)"),
      row("曲URL", "https://example.test/song"),
      row("差分URL", "https://example.test/chart"),
      row("コメント", "Notes 1910"),
      row(labels[6], "IR links", labels[7], "Viewer link"),
    ];
    const stats = getStellaverseChartStatsCells(rows);
    assert.equal(stats.notesCell, rows[1].children[3]);
    assert.equal(stats.totalCell, rows[2].children[3]);
    assert.equal(parseStellaverseCellNumber(stats.notesCell), 1910);
    assert.equal(parseStellaverseCellNumber(stats.totalCell), 500);
    assert.deepEqual(getStellaverseRowsToHideAfterSuccess(rows, { row: rows[6] }), [rows[0], rows[1], rows[6]]);

    // 先頭の統計3行がないページでも、曲URLやコメントを隠さない。
    assert.equal(getStellaverseChartStatsCells(rows.slice(3)), null);
    assert.deepEqual(getStellaverseRowsToHideAfterSuccess(rows.slice(3), { row: rows[6] }), [rows[6]]);
  });
}

test("行の追加・順序変更でも項目名で値を読む", () => {
  const total = row("Total", "0", "Judge", "EASY");
  const notes = row("Notes", "1910", "BPM", "160");
  const stats = getStellaverseChartStatsCells([row("未知", "999"), total, notes]);
  assert.equal(stats.notesCell, notes.children[1]);
  assert.equal(stats.totalCell, total.children[1]);
});

test("未知の項目や重複したラベルから統計を推測しない", () => {
  assert.equal(getStellaverseChartStatsCells([
    row("Level", "12", "Key", "7key"),
    row("BPM", "160", "未知", "1910"),
    row("Judge", "EASY", "Total", "500"),
  ]), null);
  assert.equal(getStellaverseChartStatsCells([
    row("Notes", "1910"), row("Notes", "2000"), row("Total", "500"),
  ]), null);
  assert.equal(getStellaverseRowPairs({ children: [cell("TD", "Notes"), cell("TD", "1910")] }), null);
  const mixed = row("Go to IR", "IR", "Comment", "keep me");
  assert.deepEqual(getStellaverseRowsToHideAfterSuccess([mixed], { row: mixed }), []);
});

test("数値は末尾のごみや不正な桁区切りを受け付けない", () => {
  for (const value of ["", "1910abc", "19,10", "1234,567", "Infinity", "-1", "500 (unknown)"]) {
    assert.ok(Number.isNaN(parseStellaverseCellNumber(cell("TD", value))), value);
  }
  assert.equal(getStellaverseChartStatsCells([row("Notes", "0"), row("Total", "500")]), null);
  assert.equal(getStellaverseChartStatsCells([row("Notes", "1.5"), row("Total", "500")]), null);
  const total = cell("TD", "0");
  total.childNodes.push({ textContent: ", so #TOTAL is undefined", matches: () => true });
  assert.equal(parseStellaverseCellNumber(total), 0);
  const svelteTotal = { childNodes: [
    { nodeType: 3, textContent: "500 " },
    { nodeType: 8, textContent: "[0" },
    { nodeType: 3, textContent: "(0.262%/note)" },
    { nodeType: 8, textContent: "]" },
  ] };
  assert.equal(parseStellaverseCellNumber(svelteTotal), 500);
});

test("投稿ヘッダーの日時だけを読み、分精度・秒精度に対応する", () => {
  for (const date of ["2026/09/20 01:38", "2026/09/20 01:38:42"]) {
    const thread = { querySelector: (selector) => selector === '[data-slot="card-header"]'
      ? { textContent: `1. user @ ${date} HARD, 3118 (81.62)` } : null };
    assert.equal(extractStellaversePostedDatetime(thread), date);
    const parsed = parseStellaversePostedDate(date);
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 8);
    assert.equal(parsed.getDate(), 20);
    assert.equal(parsed.getHours(), 1);
    assert.equal(parsed.getMinutes(), 38);
    assert.equal(parsed.getSeconds(), date.endsWith(":42") ? 42 : 0);
  }
  assert.equal(extractStellaversePostedDatetime({ textContent: "本文 @ 2026/09/20 01:38", querySelector: () => null }), null);
  assert.equal(extractStellaversePostedDatetime({ querySelector: () => ({ textContent: "@ 2026/09/20 01:38 @ 2026/09/21 01:38" }) }), null);
});

test("日時の繰り上がりを許さず、不正値として扱う", () => {
  for (const value of ["2026/02/29 01:38", "2026/09/31 01:38", "2026/13/20 01:38", "2026/09/20 24:00", "2026/09/20 01:60", "2026/09/20 01:38:60"]) {
    assert.equal(parseStellaversePostedDate(value), null, value);
  }
  assert.ok(parseStellaversePostedDate("2024/02/29 00:00"));
});
