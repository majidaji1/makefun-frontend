// Formatting. Dates are rendered in UTC on purpose: the make.fun clock is UTC
// and a deadline should read the same for every reader.

const NUM = new Intl.NumberFormat("en-US");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function num(value) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return NUM.format(parsed);
}

export function compact(value) {
  if (value === null || value === undefined) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  if (Math.abs(parsed) < 1000) return String(parsed);
  if (Math.abs(parsed) < 1e6) return trimZero(parsed / 1000) + "k";
  return trimZero(parsed / 1e6) + "M";
}

function trimZero(value) {
  const rounded = value < 10 ? value.toFixed(1) : value.toFixed(0);
  return rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
}

export function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  const whole = Math.abs(parsed % 1) < 0.005;
  return "$" + (whole ? NUM.format(parsed) : parsed.toFixed(2));
}

export function parts(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date,
    year: date.getUTCFullYear(),
    month: MONTHS[date.getUTCMonth()],
    day: date.getUTCDate(),
    weekday: DAYS[date.getUTCDay()],
    hour: String(date.getUTCHours()).padStart(2, "0"),
    minute: String(date.getUTCMinutes()).padStart(2, "0"),
    second: String(date.getUTCSeconds()).padStart(2, "0"),
  };
}

export function dateShort(iso) {
  const p = parts(iso);
  if (!p) return "—";
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`;
}

export function stamp(iso) {
  const p = parts(iso);
  if (!p) return "—";
  return `${p.weekday} ${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute} UTC`;
}

export function clockUTC(ms) {
  const p = parts(new Date(ms).toISOString());
  return p ? `${p.hour}:${p.minute}:${p.second}` : "--:--:--";
}

export function ago(iso, now) {
  const p = parts(iso);
  if (!p) return "—";
  const diff = (now ?? Date.now()) - p.date.getTime();
  if (diff < 0) return "in " + span(-diff);
  if (diff < 60000) return "just now";
  return span(diff) + " ago";
}

function span(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  if (minutes >= 1) return `${minutes}m`;
  return `${seconds}s`;
}

// What the board sorts and filters on: the deadline, never the status string.
export function remaining(iso, now) {
  const p = parts(iso);
  if (!p) return { text: "no deadline", tone: "quiet", ms: null, open: false };
  const diff = p.date.getTime() - (now ?? Date.now());
  if (diff <= 0) {
    return { text: "closed " + span(-diff) + " ago", tone: "quiet", ms: diff, open: false };
  }
  const tone = diff < 3600000 ? "hot" : diff < 86400000 ? "warm" : "ok";
  return { text: span(diff) + " left", tone, ms: diff, open: true };
}

export function plural(count, one, many) {
  return count === 1 ? one : many;
}

export function clip(text, limit) {
  if (!text) return "";
  const flat = String(text).replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
}

export function initials(handle) {
  if (!handle) return "?";
  return String(handle).replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
}

export function handleOf(value) {
  return String(value || "").replace(/^@/, "").trim();
}
