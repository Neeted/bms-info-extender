/* @ts-self-types="./score_loader.d.ts" */

import { parseScoreBytes } from "./score_parser_runtime.js";

export const SCORE_PARSER_VERSION = "__PARSER_VERSION__";
// Persistent cache stores fetched gzip score bytes, not parsed score objects.
// Parser-version changes only affect the in-memory parsed cache key, so this binary cache stays reusable.
// In the userscript deployment the IndexedDB store remains origin-local by design; cross-origin binary sharing
// is intentionally out of scope unless the project later moves to browser-extension storage.
export const SCORE_LOADER_DB_NAME = "bms-info-extender-score-cache-v1";
export const SCORE_LOADER_STORE_NAME = "compressed_scores";

const DEFAULT_SCORE_BASE_URL = "/score";
const DEFAULT_FORMAT_HINT = "auto";
const DEFAULT_TEXT_ENCODING = "auto";
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export class ScoreLoaderError extends Error {
  constructor(type, message, options = {}) {
    super(message);
    this.name = "ScoreLoaderError";
    this.type = type;
    if (Object.prototype.hasOwnProperty.call(options, "cause")) {
      this.cause = options.cause;
    }
  }
}

function normalizeSha256(sha256) {
  if (typeof sha256 !== "string") {
    throw new ScoreLoaderError("invalid_sha256", "sha256 must be a string.");
  }
  const normalized = sha256.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw new ScoreLoaderError("invalid_sha256", `Invalid sha256: ${sha256}`);
  }
  return normalized;
}

function normalizeScoreBaseUrl(scoreBaseUrl) {
  if (typeof scoreBaseUrl !== "string" || scoreBaseUrl.length === 0) {
    return DEFAULT_SCORE_BASE_URL;
  }
  const trimmed = scoreBaseUrl.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function normalizeEnumValue(value, allowedValues, fallbackValue) {
  if (typeof value !== "string") {
    return fallbackValue;
  }
  return allowedValues.includes(value) ? value : fallbackValue;
}

function normalizeParseOptions(options = {}) {
  const formatHint = normalizeEnumValue(options.formatHint, ["bms", "bmson", "auto"], DEFAULT_FORMAT_HINT);
  const textEncoding = normalizeEnumValue(options.textEncoding, ["shift_jis", "utf-8", "auto"], DEFAULT_TEXT_ENCODING);
  return { formatHint, textEncoding };
}

function cloneArrayBuffer(buffer) {
  return buffer.slice(0);
}

function toOwnedArrayBuffer(value) {
  if (value instanceof ArrayBuffer) {
    return cloneArrayBuffer(value);
  }
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  throw new TypeError("Expected ArrayBuffer or ArrayBuffer view.");
}

function cloneBytes(buffer) {
  return new Uint8Array(cloneArrayBuffer(buffer));
}

function cloneStructuredValue(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function warnIdbFailure(message, error) {
  console.warn(`[score_loader] ${message}`, error);
}

function createTransactionPromise(requestFactory) {
  return new Promise((resolve, reject) => {
    requestFactory(resolve, reject);
  });
}

function createIndexedDbStore(dbName) {
  let openPromise = null;
  let disabled = false;

  async function openDatabase() {
    if (disabled || typeof indexedDB === "undefined") {
      return null;
    }
    if (openPromise !== null) {
      return openPromise;
    }

    openPromise = createTransactionPromise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(dbName, 1);
      } catch (error) {
        disabled = true;
        reject(new ScoreLoaderError("idb_failure", "Failed to open IndexedDB.", { cause: error }));
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SCORE_LOADER_STORE_NAME)) {
          db.createObjectStore(SCORE_LOADER_STORE_NAME, { keyPath: "sha256" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        disabled = true;
        reject(new ScoreLoaderError("idb_failure", "IndexedDB open request failed.", { cause: request.error }));
      };
      request.onblocked = () => reject(new ScoreLoaderError("idb_failure", "IndexedDB open request was blocked."));
    }).catch((error) => {
      openPromise = null;
      throw error;
    });

    return openPromise;
  }

  async function get(sha256) {
    const db = await openDatabase();
    if (db === null) {
      return null;
    }
    return createTransactionPromise((resolve, reject) => {
      const transaction = db.transaction(SCORE_LOADER_STORE_NAME, "readonly");
      const store = transaction.objectStore(SCORE_LOADER_STORE_NAME);
      const request = store.get(sha256);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(new ScoreLoaderError("idb_failure", "Failed to read compressed score from IndexedDB.", { cause: request.error }));
    });
  }

  async function put(record) {
    const db = await openDatabase();
    if (db === null) {
      return false;
    }
    await createTransactionPromise((resolve, reject) => {
      const transaction = db.transaction(SCORE_LOADER_STORE_NAME, "readwrite");
      const store = transaction.objectStore(SCORE_LOADER_STORE_NAME);
      const request = store.put(record);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(new ScoreLoaderError("idb_failure", "Failed to write compressed score to IndexedDB.", { cause: request.error }));
    });
    return true;
  }

  async function clear() {
    const db = await openDatabase();
    if (db === null) {
      return;
    }
    await createTransactionPromise((resolve, reject) => {
      const transaction = db.transaction(SCORE_LOADER_STORE_NAME, "readwrite");
      const store = transaction.objectStore(SCORE_LOADER_STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(new ScoreLoaderError("idb_failure", "Failed to clear compressed score cache.", { cause: request.error }));
    });
  }

  return { get, put, clear };
}

async function decompressGzipBytes(compressedBytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new ScoreLoaderError("decompression_unsupported", "DecompressionStream('gzip') is not available in this environment.");
  }

  try {
    const sourceStream = new Blob([compressedBytes]).stream();
    const decompressedStream = sourceStream.pipeThrough(new DecompressionStream("gzip"));
    const decompressedBuffer = await new Response(decompressedStream).arrayBuffer();
    return new Uint8Array(decompressedBuffer);
  } catch (error) {
    throw new ScoreLoaderError("decompression_failure", "Failed to decompress gzip score data.", { cause: error });
  }
}

function buildParsedCacheKey(sha256, formatHint, textEncoding) {
  return `${sha256}::${SCORE_PARSER_VERSION}::${formatHint}::${textEncoding}`;
}

export function createScoreLoader(config = {}) {
  const scoreBaseUrl = normalizeScoreBaseUrl(config.scoreBaseUrl);
  const dbName = typeof config.dbName === "string" && config.dbName.length > 0
    ? config.dbName
    : SCORE_LOADER_DB_NAME;

  const idbStore = createIndexedDbStore(dbName);
  const compressedPromiseCache = new Map();
  const decompressedPromiseCache = new Map();
  const parsedPromiseCache = new Map();
  const compressedValueCache = new Map();
  const decompressedValueCache = new Map();
  const parsedValueCache = new Map();

  function resolveScoreUrl(sha256) {
    const normalizedSha256 = normalizeSha256(sha256);
    const prefix = normalizedSha256.slice(0, 2);
    if (scoreBaseUrl === "/") {
      return `/${prefix}/${normalizedSha256}.gz`;
    }
    return `${scoreBaseUrl}/${prefix}/${normalizedSha256}.gz`;
  }

  async function loadCompressedScore(sha256) {
    const normalizedSha256 = normalizeSha256(sha256);
    const cachedValue = compressedValueCache.get(normalizedSha256);
    if (cachedValue !== undefined) {
      return {
        sha256: normalizedSha256,
        source: "memory",
        bytes: cloneBytes(cachedValue.gzipBytes),
        byteLength: cachedValue.gzipByteLength,
        url: cachedValue.url,
      };
    }

    const pendingPromise = compressedPromiseCache.get(normalizedSha256);
    if (pendingPromise !== undefined) {
      return pendingPromise;
    }

    const url = resolveScoreUrl(normalizedSha256);
    const loadPromise = (async () => {
      try {
        try {
          const idbRecord = await idbStore.get(normalizedSha256);
          if (idbRecord !== null) {
            const gzipBytes = toOwnedArrayBuffer(idbRecord.gzipBytes);
            compressedValueCache.set(normalizedSha256, {
              url,
              gzipBytes,
              gzipByteLength: gzipBytes.byteLength,
              fetchedAt: idbRecord.fetchedAt ?? Date.now(),
            });
            return {
              sha256: normalizedSha256,
              source: "idb",
              bytes: cloneBytes(gzipBytes),
              byteLength: gzipBytes.byteLength,
              url,
            };
          }
        } catch (error) {
          warnIdbFailure("IndexedDB read failed, continuing with network fetch.", error);
        }

        let response;
        try {
          response = await fetch(url);
        } catch (error) {
          throw new ScoreLoaderError("network_failure", `Failed to fetch compressed score: ${url}`, { cause: error });
        }

        if (!response.ok) {
          throw new ScoreLoaderError("network_failure", `Failed to fetch compressed score: ${url} (${response.status} ${response.statusText})`);
        }

        const gzipBytes = await response.arrayBuffer();
        const memoryRecord = {
          url,
          gzipBytes: cloneArrayBuffer(gzipBytes),
          gzipByteLength: gzipBytes.byteLength,
          fetchedAt: Date.now(),
        };
        compressedValueCache.set(normalizedSha256, memoryRecord);

        try {
          await idbStore.put({
            sha256: normalizedSha256,
            url,
            gzipBytes: cloneArrayBuffer(gzipBytes),
            gzipByteLength: gzipBytes.byteLength,
            fetchedAt: memoryRecord.fetchedAt,
          });
        } catch (error) {
          warnIdbFailure("IndexedDB write failed, keeping memory cache only.", error);
        }

        return {
          sha256: normalizedSha256,
          source: "network",
          bytes: new Uint8Array(gzipBytes),
          byteLength: gzipBytes.byteLength,
          url,
        };
      } finally {
        compressedPromiseCache.delete(normalizedSha256);
      }
    })();

    compressedPromiseCache.set(normalizedSha256, loadPromise);
    return loadPromise;
  }

  async function loadDecompressedScoreBytes(sha256) {
    const normalizedSha256 = normalizeSha256(sha256);
    const cachedValue = decompressedValueCache.get(normalizedSha256);
    if (cachedValue !== undefined) {
      return {
        sha256: normalizedSha256,
        compressedSource: "memory",
        compressedByteLength: cachedValue.compressedByteLength,
        bytes: cloneBytes(cachedValue.bytes),
        byteLength: cachedValue.byteLength,
        url: cachedValue.url,
      };
    }

    const pendingPromise = decompressedPromiseCache.get(normalizedSha256);
    if (pendingPromise !== undefined) {
      return pendingPromise;
    }

    const loadPromise = (async () => {
      try {
        const compressedResult = await loadCompressedScore(normalizedSha256);
        const decompressedBytes = await decompressGzipBytes(compressedResult.bytes);
        decompressedValueCache.set(normalizedSha256, {
          url: compressedResult.url,
          compressedByteLength: compressedResult.byteLength,
          bytes: decompressedBytes.buffer.slice(
            decompressedBytes.byteOffset,
            decompressedBytes.byteOffset + decompressedBytes.byteLength,
          ),
          byteLength: decompressedBytes.byteLength,
        });
        return {
          sha256: normalizedSha256,
          compressedSource: compressedResult.source,
          compressedByteLength: compressedResult.byteLength,
          bytes: decompressedBytes,
          byteLength: decompressedBytes.byteLength,
          url: compressedResult.url,
        };
      } finally {
        decompressedPromiseCache.delete(normalizedSha256);
      }
    })();

    decompressedPromiseCache.set(normalizedSha256, loadPromise);
    return loadPromise;
  }

  async function loadParsedScore(sha256, options = {}) {
    const normalizedSha256 = normalizeSha256(sha256);
    const normalizedOptions = normalizeParseOptions(options);
    const cacheKey = buildParsedCacheKey(
      normalizedSha256,
      normalizedOptions.formatHint,
      normalizedOptions.textEncoding,
    );

    const cachedValue = parsedValueCache.get(cacheKey);
    if (cachedValue !== undefined) {
      return {
        sha256: normalizedSha256,
        compressedSource: "memory",
        parserVersion: SCORE_PARSER_VERSION,
        score: cloneStructuredValue(cachedValue.score),
      };
    }

    const pendingPromise = parsedPromiseCache.get(cacheKey);
    if (pendingPromise !== undefined) {
      return pendingPromise;
    }

    const loadPromise = (async () => {
      try {
        const decompressedResult = await loadDecompressedScoreBytes(normalizedSha256);
        let parseResult;
        try {
          parseResult = parseScoreBytes(decompressedResult.bytes, {
            formatHint: normalizedOptions.formatHint,
            textEncoding: normalizedOptions.textEncoding,
            sha256: normalizedSha256,
          });
        } catch (error) {
          throw new ScoreLoaderError("parse_failure", "Score parser threw an exception.", { cause: error });
        }

        if (!parseResult || parseResult.ok !== true) {
          throw new ScoreLoaderError("parse_failure", "Score parser returned a parse failure.", {
            cause: parseResult?.error,
          });
        }

        parsedValueCache.set(cacheKey, { score: cloneStructuredValue(parseResult.score) });

        return {
          sha256: normalizedSha256,
          compressedSource: decompressedResult.compressedSource,
          parserVersion: SCORE_PARSER_VERSION,
          score: cloneStructuredValue(parseResult.score),
        };
      } finally {
        parsedPromiseCache.delete(cacheKey);
      }
    })();

    parsedPromiseCache.set(cacheKey, loadPromise);
    return loadPromise;
  }

  async function prefetchScore(sha256) {
    await loadCompressedScore(sha256);
  }

  function clearMemoryCache() {
    compressedPromiseCache.clear();
    decompressedPromiseCache.clear();
    parsedPromiseCache.clear();
    compressedValueCache.clear();
    decompressedValueCache.clear();
    parsedValueCache.clear();
  }

  async function clearIndexedDbCache() {
    await idbStore.clear();
  }

  return {
    resolveScoreUrl,
    loadCompressedScore,
    loadDecompressedScoreBytes,
    loadParsedScore,
    prefetchScore,
    clearMemoryCache,
    clearIndexedDbCache,
  };
}
