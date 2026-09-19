// 表の装飾と、意味を確認してから行う情報取得を分離する。
const FIELD_LABELS = {
  level: ["レベル", "레벨", "Level"],
  key: ["キー", "키", "Key"],
  bpm: ["BPM"],
  notes: ["ノーツ数", "노트 수", "Notes"],
  judge: ["判定", "판정", "Judge"],
  total: ["トータル", "토탈", "Total"],
  ir: ["IRページへのショットカット", "IR 바로가기", "Go to IR"],
  viewer: ["Viewer"],
};

function normalizeLabel(text) {
  return text.replace(/\s+/gu, "").toLowerCase();
}

const FIELD_BY_LABEL = new Map(Object.entries(FIELD_LABELS)
  .flatMap(([field, labels]) => labels.map((label) => [normalizeLabel(label), field])));

export const STELLAVERSE_TOTAL_NOTE_SELECTOR = '[data-bmsie-stellaverse-total-note="true"]';

export function getStellaverseRowPairs(row) {
  const children = Array.from(row.children);
  if (!children.length || children.length % 2 !== 0) return null;
  const pairs = [];
  for (let index = 0; index < children.length; index += 2) {
    const head = children[index];
    const cell = children[index + 1];
    if (head.tagName !== "TH" || cell.tagName !== "TD") return null;
    pairs.push({ head, cell, field: FIELD_BY_LABEL.get(normalizeLabel(head.textContent)) ?? null });
  }
  return pairs;
}

export function parseStellaverseCellNumber(cell) {
  // Svelteのコメントノードと、拡張が加えた補足は数値の取得元に含めない。
  const text = Array.from(cell.childNodes)
    .filter((node) => node.nodeType !== 8 && !node.matches?.(STELLAVERSE_TOTAL_NOTE_SELECTOR))
    .map((node) => node.textContent).join("").trim();
  const match = text.match(/^((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?)(?:\s*\(\d+(?:\.\d+)?%\/note\))?$/);
  return match ? Number(match[1].replaceAll(",", "")) : NaN;
}

export function getStellaverseChartStatsCells(tableRows) {
  const fields = tableRows.flatMap((row) => getStellaverseRowPairs(row) ?? []);
  const notesFields = fields.filter(({ field }) => field === "notes");
  const totalFields = fields.filter(({ field }) => field === "total");
  if (notesFields.length !== 1 || totalFields.length !== 1) return null;
  const notesCell = notesFields[0].cell;
  const totalCell = totalFields[0].cell;
  const notes = parseStellaverseCellNumber(notesCell);
  const total = parseStellaverseCellNumber(totalCell);
  if (!Number.isInteger(notes) || notes <= 0 || !Number.isFinite(total) || total < 0) return null;
  return { notesCell, totalCell };
}

export function getStellaverseRowsToHideAfterSuccess(tableRows, md5Match) {
  return tableRows.filter((row) => {
    const pairs = getStellaverseRowPairs(row);
    if (pairs?.length !== 2) return false;
    const fields = new Set(pairs.map(({ field }) => field));
    return (fields.has("level") && fields.has("key"))
      || (fields.has("bpm") && fields.has("notes"))
      || (row === md5Match.row && fields.has("ir") && fields.has("viewer"));
  });
}

export function extractStellaversePostedDatetime(threadRoot) {
  const header = threadRoot.querySelector('[data-slot="card-header"]');
  if (!header) return null;
  // 本文や他の投稿へ探索を広げない。日時が複数あって曖昧な場合も採用しない。
  const matches = Array.from(header.textContent.matchAll(/(?:^|\s)@\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}(?::\d{2})?)(?![\d:])/g));
  return matches.length === 1 ? matches[0][1] : null;
}

export function parseStellaversePostedDate(postedDatetime) {
  const match = postedDatetime.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  const actual = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  return parts.every((part, index) => part === actual[index]) ? date : null;
}
