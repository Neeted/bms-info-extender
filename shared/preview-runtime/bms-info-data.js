export const BMSDATA_COLUMNS = [
  "md5",
  "sha256",
  "maxbpm",
  "minbpm",
  "length",
  "mode",
  "judge",
  "feature",
  "notes",
  "n",
  "ln",
  "s",
  "ls",
  "total",
  "density",
  "peakdensity",
  "enddensity",
  "mainbpm",
  "distribution",
  "speedchange",
  "lanenotes",
  "tables",
  "stella",
  "bmsid",
];

export const BMS_FEATURE_NAMES = [
  "LN(#LNMODE undef)",
  "MINE",
  "RANDOM",
  "LN",
  "CN",
  "HCN",
  "STOP",
  "SCROLL",
];

export const DISTRIBUTION_NOTE_COLORS = [
  "#44FF44",
  "#228822",
  "#FF4444",
  "#4444FF",
  "#222288",
  "#CCCCCC",
  "#880000",
];

export const DISTRIBUTION_NOTE_NAMES = [
  "LNSCR",
  "LNSCR HOLD",
  "SCR",
  "LN",
  "LN HOLD",
  "NORMAL",
  "MINE",
];

const BEAT_LANE_COLORS = new Map([
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

const POPN_LANE_COLORS = new Map([
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

export async function fetchBmsInfoRecord(sha256) {
  return fetchBmsInfoRecordByLookupKey(sha256);
}

export async function fetchBmsInfoRecordByLookupKey(lookupKey) {
  const response = await fetch(`https://bms.howan.jp/${lookupKey}?v=2.3.1`);
  if (!response.ok) {
    throw new Error(`Failed to fetch BMS data: HTTP ${response.status}`);
  }

  const text = await response.text();
  const values = text.split("\x1f");
  if (values.length !== BMSDATA_COLUMNS.length) {
    throw new Error(`BMS data column count mismatch: expected ${BMSDATA_COLUMNS.length}, got ${values.length}`);
  }

  const rawRecord = {};
  for (let index = 0; index < BMSDATA_COLUMNS.length; index += 1) {
    rawRecord[BMSDATA_COLUMNS[index]] = values[index];
  }
  return normalizeBmsInfoRecord(rawRecord);
}

export function normalizeBmsInfoRecord(rawRecord) {
  const mode = Number(rawRecord.mode);
  const notes = Number(rawRecord.notes);
  const n = Number(rawRecord.n);
  const ln = Number(rawRecord.ln);
  const s = Number(rawRecord.s);
  const ls = Number(rawRecord.ls);
  const total = Number(rawRecord.total);
  const feature = Number(rawRecord.feature);
  const lengthMs = Number(rawRecord.length);

  return {
    md5: rawRecord.md5,
    sha256: rawRecord.sha256,
    maxbpm: Number(rawRecord.maxbpm),
    minbpm: Number(rawRecord.minbpm),
    mainbpm: Number(rawRecord.mainbpm),
    lengthMs,
    durationSec: lengthMs / 1000,
    mode,
    judge: Number(rawRecord.judge),
    feature,
    featureNames: BMS_FEATURE_NAMES.filter((name, index) => (feature & (1 << index)) !== 0),
    notes,
    n,
    ln,
    s,
    ls,
    total,
    density: Number(rawRecord.density),
    peakdensity: Number(rawRecord.peakdensity),
    enddensity: Number(rawRecord.enddensity),
    distribution: rawRecord.distribution,
    distributionSegments: parseDistributionSegments(rawRecord.distribution),
    speedchange: rawRecord.speedchange,
    speedChangePoints: parseSpeedChange(rawRecord.speedchange),
    lanenotesArr: parseLaneNotes(mode, rawRecord.lanenotes),
    tables: parseTables(rawRecord.tables),
    bmsid: Number(rawRecord.bmsid),
    stella: Number(rawRecord.stella),
    notesStr: `${notes} (N:${n}, LN:${ln}, SCR:${s}, LNSCR:${ls})`,
    totalStr: `${total % 1 === 0 ? Math.round(total) : total} (${notes > 0 ? (total / notes).toFixed(3) : "0.000"} T/N)`,
    durationStr: `${(lengthMs / 1000).toFixed(2)} s`,
  };
}

export function parseTables(tablesRaw) {
  try {
    return JSON.parse(tablesRaw);
  } catch {
    return [];
  }
}

export function parseLaneNotes(mode, lanenotes) {
  const tokens = String(lanenotes ?? "")
    .split(",")
    .map((token) => Number(token));

  let laneCount = mode;
  if (mode === 7) {
    laneCount = 8;
  } else if (mode === 14) {
    laneCount = 16;
  } else if (mode === 5) {
    laneCount = 6;
  } else if (mode === 10) {
    laneCount = 12;
  }

  const lanenotesArr = [];
  for (let index = 0; index < laneCount; index += 1) {
    const baseIndex = index * 3;
    const normal = tokens[baseIndex] ?? 0;
    const long = tokens[baseIndex + 1] ?? 0;
    const mine = tokens[baseIndex + 2] ?? 0;
    lanenotesArr.push([normal, long, mine, normal + long]);
  }

  if (mode === 7 || mode === 14) {
    const move = lanenotesArr.splice(7, 1)[0];
    if (move) {
      lanenotesArr.unshift(move);
    }
  } else if (mode === 5 || mode === 10) {
    const move = lanenotesArr.splice(5, 1)[0];
    if (move) {
      lanenotesArr.unshift(move);
    }
  }

  return lanenotesArr;
}

export function parseDistributionSegments(distribution) {
  const noteTypes = 7;
  const data = String(distribution ?? "").startsWith("#") ? String(distribution).slice(1) : String(distribution ?? "");
  const segments = [];

  for (let index = 0; index < data.length; index += 14) {
    const chunk = data.slice(index, index + 14);
    if (chunk.length !== 14) {
      continue;
    }

    const noteCounts = [];
    for (let typeIndex = 0; typeIndex < noteTypes; typeIndex += 1) {
      const base36 = chunk.slice(typeIndex * 2, typeIndex * 2 + 2);
      noteCounts.push(Number.parseInt(base36, 36) || 0);
    }
    segments.push(noteCounts);
  }

  return segments;
}

export function parseSpeedChange(raw) {
  const numbers = String(raw ?? "")
    .split(",")
    .map((token) => Number(token))
    .filter((value) => Number.isFinite(value));

  const result = [];
  for (let index = 0; index < numbers.length; index += 2) {
    result.push([numbers[index], numbers[index + 1]]);
  }
  return result;
}

export function getLaneChipKey(mode, laneIndex) {
  if (mode === 5 || mode === 10) {
    return `g${laneIndex}`;
  }
  if (mode === 9) {
    return `p${laneIndex}`;
  }
  return String(laneIndex);
}

export function getLaneChipColor(mode, laneIndex) {
  const key = getLaneChipKey(mode, laneIndex);
  if (key.startsWith("p")) {
    return POPN_LANE_COLORS.get(key) ?? "#c4c4c4";
  }
  return BEAT_LANE_COLORS.get(key) ?? "#bebebe";
}

export function getLaneChipTextColor(mode, laneIndex) {
  const color = getLaneChipColor(mode, laneIndex).toLowerCase();
  return color === "#e04a4a" || color === "#5074fe" ? "#ffffff" : "#000000";
}
