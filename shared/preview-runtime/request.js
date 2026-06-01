function defaultPreviewRuntimeFetch(...args) {
  if (typeof globalThis.fetch !== "function") {
    return Promise.reject(new Error("fetch is not available in this environment."));
  }
  return globalThis.fetch(...args);
}

let previewRuntimeFetch = defaultPreviewRuntimeFetch;

export function setPreviewRuntimeFetch(fetchImpl) {
  previewRuntimeFetch = typeof fetchImpl === "function"
    ? fetchImpl
    : defaultPreviewRuntimeFetch;
}

export function resetPreviewRuntimeFetch() {
  previewRuntimeFetch = defaultPreviewRuntimeFetch;
}

export function fetchPreviewRuntimeResource(...args) {
  return previewRuntimeFetch(...args);
}
