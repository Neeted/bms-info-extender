const P1_NOTE_MAP = new Map([
  ["11", { side: "p1", key: 1 }],
  ["12", { side: "p1", key: 2 }],
  ["13", { side: "p1", key: 3 }],
  ["14", { side: "p1", key: 4 }],
  ["15", { side: "p1", key: 5 }],
  ["16", { side: "p1", key: "scratch" }],
  ["18", { side: "p1", key: 6 }],
  ["19", { side: "p1", key: 7 }],
]);

const P2_NOTE_MAP = new Map([
  ["21", { side: "p2", key: 1 }],
  ["22", { side: "p2", key: 2 }],
  ["23", { side: "p2", key: 3 }],
  ["24", { side: "p2", key: 4 }],
  ["25", { side: "p2", key: 5 }],
  ["26", { side: "p2", key: "scratch" }],
  ["28", { side: "p2", key: 6 }],
  ["29", { side: "p2", key: 7 }],
]);

const P1_HIDDEN_MAP = new Map([
  ["31", { side: "p1", key: 1 }],
  ["32", { side: "p1", key: 2 }],
  ["33", { side: "p1", key: 3 }],
  ["34", { side: "p1", key: 4 }],
  ["35", { side: "p1", key: 5 }],
  ["36", { side: "p1", key: "scratch" }],
  ["38", { side: "p1", key: 6 }],
  ["39", { side: "p1", key: 7 }],
]);

const P2_HIDDEN_MAP = new Map([
  ["41", { side: "p2", key: 1 }],
  ["42", { side: "p2", key: 2 }],
  ["43", { side: "p2", key: 3 }],
  ["44", { side: "p2", key: 4 }],
  ["45", { side: "p2", key: 5 }],
  ["46", { side: "p2", key: "scratch" }],
  ["48", { side: "p2", key: 6 }],
  ["49", { side: "p2", key: 7 }],
]);

const P1_LONG_MAP = new Map([
  ["51", { side: "p1", key: 1 }],
  ["52", { side: "p1", key: 2 }],
  ["53", { side: "p1", key: 3 }],
  ["54", { side: "p1", key: 4 }],
  ["55", { side: "p1", key: 5 }],
  ["56", { side: "p1", key: "scratch" }],
  ["58", { side: "p1", key: 6 }],
  ["59", { side: "p1", key: 7 }],
]);

const P2_LONG_MAP = new Map([
  ["61", { side: "p2", key: 1 }],
  ["62", { side: "p2", key: 2 }],
  ["63", { side: "p2", key: 3 }],
  ["64", { side: "p2", key: 4 }],
  ["65", { side: "p2", key: 5 }],
  ["66", { side: "p2", key: "scratch" }],
  ["68", { side: "p2", key: 6 }],
  ["69", { side: "p2", key: 7 }],
]);

const P1_MINE_MAP = new Map([
  ["D1", { side: "p1", key: 1 }],
  ["D2", { side: "p1", key: 2 }],
  ["D3", { side: "p1", key: 3 }],
  ["D4", { side: "p1", key: 4 }],
  ["D5", { side: "p1", key: 5 }],
  ["D6", { side: "p1", key: "scratch" }],
  ["D8", { side: "p1", key: 6 }],
  ["D9", { side: "p1", key: 7 }],
]);

const P2_MINE_MAP = new Map([
  ["E1", { side: "p2", key: 1 }],
  ["E2", { side: "p2", key: 2 }],
  ["E3", { side: "p2", key: 3 }],
  ["E4", { side: "p2", key: 4 }],
  ["E5", { side: "p2", key: 5 }],
  ["E6", { side: "p2", key: "scratch" }],
  ["E8", { side: "p2", key: 6 }],
  ["E9", { side: "p2", key: 7 }],
]);

const BACKGROUND_CHANNELS = new Set(["01"]);
const BGA_CHANNELS = new Set(["04", "06", "07"]);

export function getNoteChannelDescriptor(channel) {
  const normalizedChannel = channel.toUpperCase();
  if (P1_NOTE_MAP.has(normalizedChannel)) {
    return { family: "playable", ...P1_NOTE_MAP.get(normalizedChannel) };
  }
  if (P2_NOTE_MAP.has(normalizedChannel)) {
    return { family: "playable", ...P2_NOTE_MAP.get(normalizedChannel) };
  }
  if (P1_HIDDEN_MAP.has(normalizedChannel)) {
    return { family: "invisible", ...P1_HIDDEN_MAP.get(normalizedChannel) };
  }
  if (P2_HIDDEN_MAP.has(normalizedChannel)) {
    return { family: "invisible", ...P2_HIDDEN_MAP.get(normalizedChannel) };
  }
  if (P1_LONG_MAP.has(normalizedChannel)) {
    return { family: "long", ...P1_LONG_MAP.get(normalizedChannel) };
  }
  if (P2_LONG_MAP.has(normalizedChannel)) {
    return { family: "long", ...P2_LONG_MAP.get(normalizedChannel) };
  }
  if (P1_MINE_MAP.has(normalizedChannel)) {
    return { family: "mine", ...P1_MINE_MAP.get(normalizedChannel) };
  }
  if (P2_MINE_MAP.has(normalizedChannel)) {
    return { family: "mine", ...P2_MINE_MAP.get(normalizedChannel) };
  }
  return null;
}

export function isBackgroundChannel(channel) {
  return BACKGROUND_CHANNELS.has(channel.toUpperCase());
}

export function isBgaChannel(channel) {
  return BGA_CHANNELS.has(channel.toUpperCase());
}

export function laneCountForMode(mode) {
  switch (mode) {
    case "5k":
      return 6;
    case "7k":
      return 8;
    case "10k":
      return 12;
    case "14k":
      return 16;
    default:
      return 0;
  }
}

export function detectBmsMode(noteDescriptors) {
  let hasPlayer2 = false;
  let hasKey6Or7 = false;

  for (const descriptor of noteDescriptors) {
    if (descriptor.side === "p2") {
      hasPlayer2 = true;
    }
    if (descriptor.key === 6 || descriptor.key === 7) {
      hasKey6Or7 = true;
    }
  }

  if (noteDescriptors.length === 0) {
    return "unknown";
  }
  if (hasPlayer2) {
    return hasKey6Or7 ? "14k" : "10k";
  }
  return hasKey6Or7 ? "7k" : "5k";
}

export function mapBmsLane(mode, side, key) {
  switch (mode) {
    case "5k":
      if (side !== "p1") {
        return null;
      }
      if (key === "scratch") {
        return 0;
      }
      return key >= 1 && key <= 5 ? key : null;
    case "7k":
      if (side !== "p1") {
        return null;
      }
      if (key === "scratch") {
        return 0;
      }
      return key >= 1 && key <= 7 ? key : null;
    case "10k":
      if (key === "scratch") {
        return side === "p1" ? 0 : side === "p2" ? 6 : null;
      }
      if (key >= 1 && key <= 5) {
        return side === "p1" ? key : side === "p2" ? key + 6 : null;
      }
      return null;
    case "14k":
      if (key === "scratch") {
        return side === "p1" ? 0 : side === "p2" ? 8 : null;
      }
      if (key >= 1 && key <= 7) {
        return side === "p1" ? key : side === "p2" ? key + 8 : null;
      }
      return null;
    default:
      return null;
  }
}
