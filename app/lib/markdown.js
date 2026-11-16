// A very small markdown reader for the long prose the API hands back
// (descriptions, rules, criteria). It builds nodes; it never parses markup.

import { el, frag } from "./dom.js";

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]*\))/g;

function pushText(target, text) {
  if (text) target.push(document.createTextNode(text.replace(/[ \t]+/g, " ")));
}

function inline(text) {
  const nodes = [];
  let last = 0;
  INLINE.lastIndex = 0;
  let match;
  while ((match = INLINE.exec(text)) !== null) {
    pushText(nodes, text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(el("code", { text: token.slice(1, -1) }));
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(el("strong", { text: token.slice(2, -2) }));
    } else if (token.startsWith("[")) {
      const split = /^\[([^\]]+)\]\(([^)\s]*)\)$/.exec(token);
      nodes.push(split ? link(split[1], split[2]) : document.createTextNode(token));
    } else {
      nodes.push(el("em", { text: token.slice(1, -1) }));
    }
    last = match.index + token.length;
  }
  pushText(nodes, text.slice(last));
  return nodes;
}

function link(label, href) {
  const safe = /^https?:\/\/[^\s]+$/i.test(href) ? href : null;
  if (!safe) return document.createTextNode(label);
  return el("a", { href: safe, rel: "noopener noreferrer", target: "_blank" }, ...inline(label));
}

function isBlockStart(line) {
  return (
    /^\s*```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^\s*([-*_])\1{2,}\s*$/.test(line) ||
    /^\s*\|.*\|\s*$/.test(line)
  );
}

export function markdown(source) {
  const lines = String(source ?? "").replace(/\r/g, "").split("\n");
  const out = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) { index++; continue; }

    if (/^\s*```/.test(line)) {
      const body = [];
      index++;
      while (index < lines.length && !/^\s*```/.test(lines[index])) body.push(lines[index++]);
      index++;
      out.push(el("pre", {}, el("code", { text: body.join("\n") })));
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(4, heading[1].length + 1);
      out.push(el("h" + level, {}, ...inline(heading[2].trim())));
      index++;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      out.push(el("hr"));
      index++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index++;
      }
      out.push(el("blockquote", {}, el("p", {}, ...inline(quote.join(" ").trim()))));
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const list = el("ul", { class: "list" });
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        list.appendChild(el("li", {}, ...inline(lines[index].replace(/^\s*[-*+]\s+/, "").trim())));
        index++;
      }
      out.push(list);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const list = el("ol", { class: "list" });
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        list.appendChild(el("li", {}, ...inline(lines[index].replace(/^\s*\d+[.)]\s+/, "").trim())));
        index++;
      }
      out.push(list);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && index + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1])) {
      out.push(readTable(lines, () => index, (next) => { index = next; }));
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index++;
    }
    if (paragraph.length) out.push(el("p", {}, ...inline(paragraph.join(" "))));
  }

  return frag(...out);
}

function readTable(lines, readIndex, writeIndex) {
  const cells = (line) =>
    line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());

  const head = cells(lines[readIndex()]);
  let index = readIndex() + 2;
  const body = [];
  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    body.push(cells(lines[index]));
    index++;
  }
  writeIndex(index);

  const table = el("table", { class: "table" });
  const headRow = el("tr");
  for (const cell of head) headRow.appendChild(el("th", {}, ...inline(cell)));
  table.appendChild(el("thead", {}, headRow));
  const tbody = el("tbody");
  for (const row of body) {
    const tr = el("tr");
    for (const cell of row) tr.appendChild(el("td", {}, ...inline(cell)));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return el("div", { class: "table-wrap" }, table);
}
