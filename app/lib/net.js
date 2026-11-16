// Read-only access to the public make.fun API.
//
// Every answer is kept twice: in memory for the life of the tab, and (when the
// caller allows it) in localStorage so a reload paints the last data at once.
// Network answers are always revalidated with If-None-Match, because the API
// ties its ETag to the current minute — a repeat view usually costs a 304.

const ORIGIN = "https://make.fun";
const API = ORIGIN + "/api";
const PREFIX = "mfboard:";
const FRESH_MS = 20000;
const TIMEOUT_MS = 12000;

const memory = new Map();
const inflight = new Map();

export function apiURL(path, query) {
  const url = new URL(API + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.href;
}

export function assetURL(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return ORIGIN + path;
  return null;
}

function readDisk(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDisk(key, record) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(record));
  } catch {
    try { localStorage.removeItem(PREFIX + key); } catch { /* storage is unavailable */ }
  }
}

// A view paints whatever this returns straight away, then asks for the network
// answer and only re-renders when the ETag moved.
export function peek(key) {
  const warm = memory.get(key);
  if (warm) return { data: warm.data, etag: warm.etag, at: warm.at, warm: true };
  const disk = readDisk(key);
  if (!disk || disk.data === undefined) return null;
  memory.set(key, { data: disk.data, etag: disk.etag || null, at: disk.at || 0 });
  return { data: disk.data, etag: disk.etag || null, at: disk.at || 0, warm: false };
}

export function drop(key) {
  memory.delete(key);
  try { localStorage.removeItem(PREFIX + key); } catch { /* nothing to drop */ }
}

function remember(key, data, etag, persist) {
  const record = { data, etag: etag || null, at: Date.now() };
  memory.set(key, record);
  if (persist) writeDisk(key, record);
  return record;
}

export async function getJSON(url, options = {}) {
  const key = options.key || url;
  const persist = options.persist === true;
  const warm = memory.get(key);
  const hit = warm || peek(key);

  if (!options.force && hit && Date.now() - (hit.at || 0) < (options.freshMs ?? FRESH_MS)) {
    return { data: hit.data, etag: hit.etag, source: "memory", changed: false };
  }

  const running = inflight.get(url);
  if (running) return running;

  const task = (async () => {
    const headers = { accept: "application/json" };
    if (hit && hit.etag) headers["if-none-match"] = hit.etag;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, {
        headers,
        signal: controller.signal,
        mode: "cors",
        credentials: "omit",
        cache: "no-cache",
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 304 && hit) {
      remember(key, hit.data, hit.etag, persist);
      return { data: hit.data, etag: hit.etag, source: "revalidated", changed: false };
    }

    if (!response.ok) {
      const error = new Error(
        response.status === 404 ? "not found" : "make.fun answered " + response.status
      );
      error.status = response.status;
      throw error;
    }

    const etag = response.headers.get("etag");
    const data = await response.json();
    const changed = !hit || !etag || !hit.etag || etag !== hit.etag;
    remember(key, data, etag, persist);
    return { data, etag: etag || null, source: "network", changed };
  })();

  inflight.set(url, task);
  try {
    return await task;
  } finally {
    inflight.delete(url);
  }
}

export function ageLabel(at) {
  if (!at) return "just now";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return seconds + "s ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  return Math.round(minutes / 60) + "h ago";
}
