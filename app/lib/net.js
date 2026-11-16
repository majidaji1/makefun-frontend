// Every read this app makes: GET https://make.fun/api/..., kept in memory and revalidated with the API's ETag.
//
// The API's tags are bound to the minute: `If-None-Match` inside the same minute answers 304, and after the
// minute turns it answers 200 with a new tag even when nothing changed. So a second look at a route costs one
// conditional request and no body, and a view left and re-entered inside the TTL costs no request at all.

const BASE = 'https://make.fun/api';

/** url -> { etag, data, at }: the last answer for a URL, and when it arrived. */
const cache = new Map();

/** url -> Promise: one request per URL, however many views ask for it at once. */
const inflight = new Map();

const listeners = new Set();
const stats = { requests: 0, revalidated: 0, hits: 0, lastAt: 0 };

export class ApiError extends Error {
  constructor(status, url, body) {
    super(`GET ${url} answered ${status}${body ? `: ${body}` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

/** The absolute URL of an API path, or the path itself when it is already one. */
export function apiUrl(path) {
  return path.startsWith('http') ? path : BASE + path;
}

/** What this session has asked the API for: shown in the header so the revalidation is visible. */
export function netStats() {
  return { ...stats };
}

/** Called after every answer with the event and the running totals. */
export function onNet(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce(kind) {
  const snapshot = { kind, ...stats };
  for (const fn of listeners) fn(snapshot);
}

async function bodyOf(response) {
  try {
    const text = await response.text();
    return text.slice(0, 240);
  } catch {
    return '';
  }
}

/**
 * A GET of one API path. Serves the memory copy while it is younger than `ttl`, revalidates with `If-None-Match`
 * after that, and dedupes concurrent callers into one request. `fresh: true` skips both and asks again.
 */
export async function api(path, options = {}) {
  const url = apiUrl(path);
  const ttl = options.ttl ?? 20000;
  const fresh = options.fresh === true;
  const known = cache.get(url);

  if (!fresh && known !== undefined && Date.now() - known.at < ttl) {
    stats.hits += 1;
    announce('memory');
    return known.data;
  }

  const running = inflight.get(url);
  if (running !== undefined) return running;

  const request = (async () => {
    const headers = {};
    if (known !== undefined && !fresh) headers['If-None-Match'] = known.etag;

    stats.requests += 1;
    stats.lastAt = Date.now();
    const response = await fetch(url, { headers, signal: options.signal });

    if (response.status === 304 && known !== undefined) {
      stats.revalidated += 1;
      cache.set(url, { etag: known.etag, data: known.data, at: Date.now() });
      announce('revalidated');
      return known.data;
    }

    if (!response.ok) throw new ApiError(response.status, url, await bodyOf(response));

    const data = await response.json();
    cache.set(url, { etag: response.headers.get('etag') ?? '', data, at: Date.now() });
    announce(known === undefined ? 'fetch' : 'refetch');
    return data;
  })();

  inflight.set(url, request);
  try {
    return await request;
  } finally {
    if (inflight.get(url) === request) inflight.delete(url);
  }
}

/** Loads a module once per session and hands back its default export, so a route never re-downloads its code. */
const modules = new Map();

export function module_(loader) {
  const key = loader;
  let loaded = modules.get(key);
  if (loaded === undefined) {
    loaded = loader().then((mod) => mod.default);
    modules.set(key, loaded);
  }
  return loaded;
}
