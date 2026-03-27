import assert from "node:assert/strict";
import test from "node:test";

import { createScoreLoader, ScoreLoaderError } from "../src/score_loader.js";

const SHA256 = "ab".repeat(32);
const NETLIFY_BASE_URL = "https://bms-info-extender.netlify.app/score";
const R2_BASE_URL = "https://bms.howan.jp/score";
const NETLIFY_URL = `${NETLIFY_BASE_URL}/${SHA256.slice(0, 2)}/${SHA256}.gz`;
const R2_URL = `${R2_BASE_URL}/${SHA256}.gz`;

function createMockResponse({ status = 200, statusText = "OK", body = [] } = {}) {
  const uint8 = body instanceof Uint8Array ? body : Uint8Array.from(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async arrayBuffer() {
      return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);
    },
  };
}

function cloneCacheRecord(record) {
  return {
    ...record,
    gzipBytes: record.gzipBytes.slice(0),
  };
}

function createRequest(run) {
  const request = {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    onblocked: null,
  };
  queueMicrotask(() => {
    try {
      run(request);
    } catch (error) {
      request.error = error;
      request.onerror?.();
    }
  });
  return request;
}

function createFakeIndexedDb() {
  const databases = new Map();

  function createDatabase() {
    const stores = new Map();
    return {
      objectStoreNames: {
        contains(name) {
          return stores.has(name);
        },
      },
      createObjectStore(name) {
        if (!stores.has(name)) {
          stores.set(name, new Map());
        }
        return {};
      },
      transaction() {
        return {
          objectStore(name) {
            const store = stores.get(name);
            if (!store) {
              throw new Error(`Object store not found: ${name}`);
            }
            return {
              get(key) {
                return createRequest((request) => {
                  request.result = store.has(key) ? cloneCacheRecord(store.get(key)) : undefined;
                  request.onsuccess?.();
                });
              },
              put(record) {
                return createRequest((request) => {
                  store.set(record.sha256, cloneCacheRecord(record));
                  request.result = record.sha256;
                  request.onsuccess?.();
                });
              },
              clear() {
                return createRequest((request) => {
                  store.clear();
                  request.result = undefined;
                  request.onsuccess?.();
                });
              },
            };
          },
        };
      },
    };
  }

  return {
    open(name) {
      return createRequest((request) => {
        let db = databases.get(name);
        const isNew = !db;
        if (!db) {
          db = createDatabase();
          databases.set(name, db);
        }
        request.result = db;
        if (isNew) {
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
    },
  };
}

function withMockedGlobals(t, { fetchMock, indexedDbMock }) {
  const originalFetch = globalThis.fetch;
  const originalIndexedDb = globalThis.indexedDB;
  globalThis.fetch = fetchMock;
  if (indexedDbMock === undefined) {
    delete globalThis.indexedDB;
  } else {
    globalThis.indexedDB = indexedDbMock;
  }
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalIndexedDb === undefined) {
      delete globalThis.indexedDB;
    } else {
      globalThis.indexedDB = originalIndexedDb;
    }
  });
}

function createFallbackSources() {
  return [
    { baseUrl: NETLIFY_BASE_URL, pathStyle: "sharded" },
    { baseUrl: R2_BASE_URL, pathStyle: "flat" },
  ];
}

test("legacy scoreBaseUrl keeps sharded URL resolution", () => {
  const loader = createScoreLoader({ scoreBaseUrl: NETLIFY_BASE_URL });
  assert.equal(loader.resolveScoreUrl(SHA256), NETLIFY_URL);
});

test("loadCompressedScore falls back from Netlify to R2 flat path", async (t) => {
  const fetchCalls = [];
  withMockedGlobals(t, {
    indexedDbMock: undefined,
    fetchMock: async (url) => {
      fetchCalls.push(url);
      if (url === NETLIFY_URL) {
        return createMockResponse({ status: 404, statusText: "Not Found" });
      }
      if (url === R2_URL) {
        return createMockResponse({ body: [1, 2, 3] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const loader = createScoreLoader({ scoreSources: createFallbackSources() });
  const result = await loader.loadCompressedScore(SHA256);

  assert.deepEqual(fetchCalls, [NETLIFY_URL, R2_URL]);
  assert.equal(result.source, "network");
  assert.equal(result.url, R2_URL);
  assert.deepEqual([...result.bytes], [1, 2, 3]);
});

test("successful fallback result is reused from IndexedDB on a new loader instance", async (t) => {
  const indexedDbMock = createFakeIndexedDb();
  const fetchCalls = [];
  withMockedGlobals(t, {
    indexedDbMock,
    fetchMock: async (url) => {
      fetchCalls.push(url);
      if (url === NETLIFY_URL) {
        return createMockResponse({ status: 404, statusText: "Not Found" });
      }
      if (url === R2_URL) {
        return createMockResponse({ body: [9, 8, 7] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const dbName = "score-loader-idb-test";
  const firstLoader = createScoreLoader({ dbName, scoreSources: createFallbackSources() });
  const firstResult = await firstLoader.loadCompressedScore(SHA256);
  assert.equal(firstResult.url, R2_URL);
  assert.deepEqual(fetchCalls, [NETLIFY_URL, R2_URL]);

  globalThis.fetch = async () => {
    throw new Error("Network should not be used after IndexedDB cache is primed.");
  };

  const secondLoader = createScoreLoader({ dbName, scoreSources: createFallbackSources() });
  const secondResult = await secondLoader.loadCompressedScore(SHA256);
  assert.equal(secondResult.source, "idb");
  assert.equal(secondResult.url, R2_URL);
  assert.deepEqual([...secondResult.bytes], [9, 8, 7]);
});

test("loadCompressedScore does not negative-cache failures", async (t) => {
  const retryFetchCalls = [];
  withMockedGlobals(t, {
    indexedDbMock: undefined,
    fetchMock: async (url) => {
      if (url === NETLIFY_URL) {
        return createMockResponse({ status: 404, statusText: "Not Found" });
      }
      if (url === R2_URL) {
        return createMockResponse({ status: 503, statusText: "Unavailable" });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const loader = createScoreLoader({ scoreSources: createFallbackSources() });
  await assert.rejects(
    loader.loadCompressedScore(SHA256),
    (error) => error instanceof ScoreLoaderError && error.type === "network_failure",
  );

  globalThis.fetch = async (url) => {
    retryFetchCalls.push(url);
    if (url === NETLIFY_URL) {
      return createMockResponse({ status: 404, statusText: "Not Found" });
    }
    if (url === R2_URL) {
      return createMockResponse({ body: [4, 5, 6] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const retryResult = await loader.loadCompressedScore(SHA256);
  assert.deepEqual(retryFetchCalls, [NETLIFY_URL, R2_URL]);
  assert.equal(retryResult.url, R2_URL);
});

test("prefetchScore follows the same fallback order and warms memory cache", async (t) => {
  const fetchCalls = [];
  withMockedGlobals(t, {
    indexedDbMock: undefined,
    fetchMock: async (url) => {
      fetchCalls.push(url);
      if (url === NETLIFY_URL) {
        return createMockResponse({ status: 404, statusText: "Not Found" });
      }
      if (url === R2_URL) {
        return createMockResponse({ body: [7, 7, 7] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
  });

  const loader = createScoreLoader({ scoreSources: createFallbackSources() });
  await loader.prefetchScore(SHA256);
  const result = await loader.loadCompressedScore(SHA256);

  assert.deepEqual(fetchCalls, [NETLIFY_URL, R2_URL]);
  assert.equal(result.source, "memory");
  assert.equal(result.url, R2_URL);
});
