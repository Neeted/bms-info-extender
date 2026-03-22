import { failure, normalizeParseOptions } from "./dto.js";
import { parseBmsText } from "./bms/parser.js";
import { parseBmsonText } from "./bmson/parser.js";
import { decodeText, looksLikeBmsonText } from "./shared/encoding.js";
import { createDeterministicRandomSelector } from "./shared/random.js";

export function parseScoreBytes(bytes, options = {}) {
  const normalizedOptions = normalizeParseOptions(options);
  const randomSelector = createDeterministicRandomSelector(normalizedOptions.sha256);

  if (normalizedOptions.formatHint === "bmson") {
    const decoded = decodeBmson(bytes);
    if (!decoded.ok) {
      return { ok: false, error: decoded.error };
    }
    return parseBmsonText(decoded.text, normalizedOptions);
  }

  if (normalizedOptions.formatHint === "bms") {
    const decoded = decodeBms(bytes, normalizedOptions.textEncoding);
    if (!decoded.ok) {
      return { ok: false, error: decoded.error };
    }
    return parseBmsText(decoded.text, {
      ...normalizedOptions,
      rng: randomSelector,
    });
  }

  const decodedUtf8 = decodeBmson(bytes);
  if (decodedUtf8.ok && looksLikeBmsonText(decodedUtf8.text)) {
    const bmsonResult = parseBmsonText(decodedUtf8.text, normalizedOptions);
    if (bmsonResult.ok) {
      return bmsonResult;
    }
  }

  const decodedBms = decodeBms(bytes, normalizedOptions.textEncoding);
  if (!decodedBms.ok) {
    return { ok: false, error: decodedBms.error };
  }
  return parseBmsText(decodedBms.text, {
    ...normalizedOptions,
    rng: randomSelector,
  });
}

function decodeBmson(bytes) {
  return decodeText(bytes, "utf-8");
}

function decodeBms(bytes, textEncoding) {
  if (textEncoding === "utf-8") {
    return decodeText(bytes, "utf-8");
  }
  if (textEncoding !== "auto" && textEncoding !== "shift_jis") {
    return {
      ok: false,
      error: failure("invalid_options", `Unsupported BMS textEncoding: ${textEncoding}`).error,
    };
  }
  return decodeText(bytes, "shift_jis");
}
