// Figures as a person reads them: money, counts, deadlines, UTC stamps. The server's clock is UTC, so times are
// printed as UTC with the zone spelled out and never in the reader's own zone by accident.

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const stamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** When an ISO stamp is, in ms, or null when it is not one. */
export function when(iso) {
  if (iso === null || iso === undefined || iso === '') return null;
  const at = Date.parse(iso);
  return Number.isNaN(at) ? null : at;
}

/** A date and time of day in UTC, like `17 Nov 2026, 12:30 UTC`. */
export function stampUtc(iso) {
  const at = when(iso);
  return at === null ? 'unknown' : `${stamp.format(at).replace(',', ',')} UTC`;
}

/** A day in UTC, like `17 Nov 2026`. */
export function dayUtc(iso) {
  const at = when(iso);
  return at === null ? 'unknown' : dayOnly.format(at);
}

/** `$1,325`, `$667.50`, `free` for nothing and `unknown` for a figure the API does not give. */
export function usd(value, options = {}) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return options.free ?? 'unknown';
  if (n === 0 && options.free) return options.free;
  const cents = options.cents === true || Math.abs(n % 1) > 0.004;
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })}`;
}

/** `12,345`, or a compact `12.3k` when the number is long and space is short. */
export function count(value, compact = true) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(n)) return '0';
  if (compact && n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return n.toLocaleString('en-US');
}

/** A figure as a reader groups it: `950587` reads better as `950,587`, and decimals keep their places. */
export function grouped(value) {
  const s = String(value ?? '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [whole, frac] = s.split('.');
  if (Math.abs(Number(whole)) < 1000) return s;
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign === '' ? whole : whole.slice(1);
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac === undefined ? '' : `.${frac}`}`;
}

/** A span of ms as the longest two units that matter: `3d 4h`, `5h 12m`, `42m`, `18s`. */
export function span(ms) {
  const t = Math.max(0, Math.abs(ms));
  if (t >= DAY) return `${Math.floor(t / DAY)}d ${Math.floor((t % DAY) / HOUR)}h`;
  if (t >= HOUR) return `${Math.floor(t / HOUR)}h ${Math.floor((t % HOUR) / MINUTE)}m`;
  if (t >= MINUTE) return `${Math.floor(t / MINUTE)}m ${Math.floor((t % MINUTE) / 1000)}s`;
  return `${Math.floor(t / 1000)}s`;
}

/** How long until a stamp, and whether that leaves the thing open: the board tells bounties apart by this. */
export function deadline(iso, now = Date.now()) {
  const at = when(iso);
  if (at === null) return { known: false, open: false, ms: 0, left: 'no deadline', tone: 'plain', at: null };
  const ms = at - now;
  if (ms <= 0) return { known: true, open: false, ms, left: `closed ${span(ms)} ago`, tone: 'shut', at };
  const tone = ms <= 6 * HOUR ? 'soon' : ms <= 2 * DAY ? 'open' : 'plain';
  return { known: true, open: true, ms, left: `${span(ms)} left`, tone, at };
}

/** `12m ago`, `3d ago` — for answers and entries that already happened. */
export function ago(iso, now = Date.now()) {
  const at = when(iso);
  if (at === null) return 'unknown';
  const ms = now - at;
  return ms < 45000 ? 'just now' : `${span(ms)} ago`;
}

/** Markdown dressed as plain words, for a two-line card note. */
export function plain(text, limit = 190) {
  const words = String(text ?? '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return words.length <= limit ? words : `${words.slice(0, limit - 1).trimEnd()}…`;
}

/** The first sentence-ish line of a description, for a lede. */
export function lede(text, limit = 240) {
  const flat = plain(text, 10000);
  const stop = flat.search(/\.\s|\.$/);
  const cut = stop > 40 ? flat.slice(0, stop + 1) : flat;
  return cut.length <= limit ? cut : `${cut.slice(0, limit - 1).trimEnd()}…`;
}

/** A wallet address, shortened for a line of text. */
export function short(address, keep = 6) {
  const s = String(address ?? '');
  return s.length <= keep * 2 + 3 ? s : `${s.slice(0, keep)}…${s.slice(-keep)}`;
}
