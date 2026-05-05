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

const DECIMAL_DISPLAY_PLACES = 2;

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
  const totalIsUndefined = isBlankValue(rawRecord.total);
  const total = totalIsUndefined ? null : Number(rawRecord.total);
  const feature = Number(rawRecord.feature);
  const lengthMs = Number(rawRecord.length);
  const mainbpm = Number(rawRecord.mainbpm);
  const maxbpm = Number(rawRecord.maxbpm);
  const minbpm = Number(rawRecord.minbpm);
  const mainbpmFormatted = formatMetadataNumber(rawRecord.mainbpm, mainbpm);
  const maxbpmFormatted = formatMetadataNumber(rawRecord.maxbpm, maxbpm);
  const minbpmFormatted = formatMetadataNumber(rawRecord.minbpm, minbpm);
  const totalFormatted = totalIsUndefined
    ? { text: "undefined", title: formatUndefinedTotalTitle(notes) }
    : formatMetadataNumber(rawRecord.total, total);
  const totalRatioStr = !totalIsUndefined && notes > 0 ? (total / notes).toFixed(3) : "0.000";
  const totalStr = totalIsUndefined ? "undefined" : `${totalFormatted.text} (${totalRatioStr} T/N)`;

  return {
    md5: rawRecord.md5,
    sha256: rawRecord.sha256,
    maxbpm,
    minbpm,
    mainbpm,
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
    mainbpmDisplay: mainbpmFormatted.text,
    mainbpmTitle: mainbpmFormatted.title,
    maxbpmDisplay: maxbpmFormatted.text,
    maxbpmTitle: maxbpmFormatted.title,
    minbpmDisplay: minbpmFormatted.text,
    minbpmTitle: minbpmFormatted.title,
    totalDisplay: totalStr,
    totalTitle: totalFormatted.title,
    totalStr,
    durationStr: `${(lengthMs / 1000).toFixed(2)} s`,
  };
}

function isBlankValue(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function formatMetadataNumber(rawValue, numericValue = Number(rawValue)) {
  if (!Number.isFinite(numericValue)) {
    return { text: "-", title: "" };
  }

  const canonicalText = canonicalizeNumericText(rawValue, numericValue);
  const decimalMatch = canonicalText.match(/^([+-]?\d+)\.(\d+)$/);
  if (decimalMatch && decimalMatch[2].length > DECIMAL_DISPLAY_PLACES) {
    return {
      text: `${decimalMatch[1]}.${decimalMatch[2].slice(0, DECIMAL_DISPLAY_PLACES)}...`,
      title: canonicalText,
    };
  }

  return { text: canonicalText, title: "" };
}

function canonicalizeNumericText(rawValue, numericValue) {
  if (Number.isInteger(numericValue)) {
    return String(Math.trunc(numericValue));
  }

  const rawText = String(rawValue ?? "").trim();
  return rawText || String(numericValue);
}

function formatUndefinedTotalTitle(notes) {
  if (!Number.isFinite(notes) || notes <= 0) {
    return "beatoraja: unavailable, LR2: unavailable";
  }

  const beatorajaTotal = Math.max(260.0, 7.605 * notes / (0.01 * notes + 6.5));
  const lr2Total = 160.0 + (notes + Math.min(Math.max(notes - 400, 0), 200)) * 0.16;
  return `beatoraja: ${beatorajaTotal.toFixed(2)} (${(beatorajaTotal / notes).toFixed(3)} T/N), LR2: ${lr2Total.toFixed(2)} (${(lr2Total / notes).toFixed(3)} T/N)`;
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
  } else if (mode === 25) {
    // 24 レーン + 1 ホイールUP + 1 ホイールDown
    laneCount = 26;
  } else if (mode === 50) {
    // 24keys DP
    laneCount = 52;
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
  } else if (mode === 25 || mode === 50) {
    // 1P側のホイールUPとホイールダウンを先頭に移動
    const move = lanenotesArr.splice(24, 2);
    if (move) {
      lanenotesArr.unshift(move[0], move[1]);
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
  if (mode === 7 || mode === 14) {
    return String(laneIndex);
  }
  if (mode === 25 || mode === 50) {
    return `k${laneIndex}`;
  }
  return "1";
}
