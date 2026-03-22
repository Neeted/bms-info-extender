const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK = (1n << 48n) - 1n;

export class JavaRandom {
  constructor(seed) {
    this.seed = (BigInt(seed) ^ MULTIPLIER) & MASK;
  }

  next(bits) {
    this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK;
    return Number(this.seed >> (48n - BigInt(bits)));
  }

  nextInt(bound) {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new RangeError("bound must be a positive integer.");
    }
    if ((bound & -bound) === bound) {
      return (bound * this.next(31)) >> 31;
    }
    while (true) {
      const bits = this.next(31);
      const value = bits % bound;
      if (bits - value + (bound - 1) >= 0) {
        return value;
      }
    }
  }
}

export function createDeterministicRandomSelector(sha256) {
  const seed = parseSeed(sha256);
  const random = new JavaRandom(seed);
  return (max) => random.nextInt(max) + 1;
}

function parseSeed(sha256) {
  if (typeof sha256 !== "string" || sha256.length < 16) {
    return 1n;
  }
  try {
    return BigInt(`0x${sha256.slice(0, 16)}`);
  } catch (_error) {
    return 1n;
  }
}
