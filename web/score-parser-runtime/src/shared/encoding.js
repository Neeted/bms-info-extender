import { createWarning, failure } from "../dto.js";

const UTF8_BOM = "\uFEFF";

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return null;
}

export function decodeText(bytes, encoding) {
  const buffer = toUint8Array(bytes);
  if (buffer === null) {
    return failure("invalid_options", "parseScoreBytes expects a Uint8Array or ArrayBuffer-compatible input.");
  }

  try {
    const decoder = new TextDecoder(encoding, { fatal: true });
    return { ok: true, text: decoder.decode(buffer) };
  } catch (error) {
    return {
      ok: false,
      error: failure(
        "decode_failure",
        `Failed to decode score bytes as ${encoding}.`,
      ).error,
      warnings: [
        createWarning("decode_warning", `Failed to decode score bytes as ${encoding}: ${error instanceof Error ? error.message : String(error)}`),
      ],
    };
  }
}

export function stripUtf8Bom(text) {
  return text.startsWith(UTF8_BOM) ? text.slice(1) : text;
}

export function looksLikeBmsonText(text) {
  const stripped = stripUtf8Bom(text).trimStart();
  return stripped.startsWith("{");
}
