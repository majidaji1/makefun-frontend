// One bounty in full: the numbers that decide whether it is worth entering,
// the reward split, the phases, the judge's criteria and the long prose.

import { apiURL, getJSON, peek } from "../lib/net.js";
import {
  el, frag, fill, clear, everySecond, pill, section, errorPanel,
  externalLink, setText,
} from "../lib/dom.js";
import { money, num, compact, remaining, stamp, dateShort, plural } from "../lib/format.js";

// The status field can say "open" after the deadline has gone by, so the badge
// is decided by the clock and the status only explains itself.
function openLabel(sheet, left) {
  if (left.open) return "open";
  if (!sheet.status || sheet.status === "open") return "closed · deadline passed";
  return sheet.status + " · closed";
}

export default async function bounty(root, ctx) {
  const slug = ctx.params[0];
  const now = () => Date.now();

  const countdown = el("span", { class: "pill ok", text: "…" });
  const deadlineLine = el("span", { class: "note", text: "" });
  const hero = el("div", { class: "bounty-hero" });
  const body = el("div");
  const status = el("p", { class: "note" });

  fill(root, el("div", { class: "head" }, hero), body, status);

  ctx.crumbs([{ label: "Board", href: "#/" }, { label: slug, href: "#/bounty/" + slug }, { label: "Bounty" }]);
  ctx.title(slug);
  ctx.live("reading bounty " + slug);

  const KEY = "bounty:" + slug;
  const REQ = "bounty:" + slug + ":req";

  let prose = null;
  async function proseModule() {
    if (!prose) prose = (await import("../lib/markdown.js")).markdown;
    return prose;
  }

  let data = null;
  let requirementSheet = null;

  const unsub = everySecond(() => {
    if (!data) return;
    const left = remaining(data.deadline, now());
    setText(countdown, left.text);
    countdown.className = "pill " + left.tone;
  });

  function apply(sheet, requirements, fromCache) {
    const markdown = prose;
    const left = remaining(sheet.deadline, now());
    const pot = Number(sheet.potUsd) || 0;
    const reward = Number(sheet.rewardAmount) || 0;
    const fee = Number(sheet.entryFeeUsd) || 0;
    const entries = Number(sheet.submissionCount) || 0;
    const resolution = sheet.resolution || {};
    const rewards = sheet.rewards || {};

    ctx.title(sheet.title);
    ctx.live(
      `${money(pot)} pot · ${compact(entries)} ${plural(entries, "entry", "entries")} · ${left.text}`
    );

    setText(countdown, left.text);
    setText(deadlineLine, "closes " + stamp(sheet.deadline));
    setText(
      status,
      fromCache
        ? "showing the last answer while make.fun is revalidated"
        : "read live from make.fun at " + new Date().toISOString().slice(11, 19) + " UTC"
    );

    fill(
      hero,
      el(
        "div",
        {},
        el(
          "div",
          { class: "top-row" },
          pill(openLabel(sheet, left), left.open ? "ok" : "quiet"),
          sheet.category ? pill(sheet.category, "cool") : null,
          sheet.harnessKind ? pill(sheet.harnessKind, "quiet") : null,
          sheet.houseOnly ? pill("house only", "warm") : null,
          el("span", { class: "spacer" }),
          countdown,
          deadlineLine
        ),
        el("h1", { text: sheet.title }),
        sheet.summary ? el("p", { class: "lede", text: sheet.summary }) : null,
        el(
          "p",
          { class: "note" },
          "Sponsor: ",
          sheet.sponsor ? sheet.sponsor.name : "unknown",
          sheet.sponsor && sheet.sponsor.isVerified ? " (verified)" : "",
          " · opened " + dateShort(sheet.publishedAt || sheet.opensAt),
          " · deadline " + stamp(sheet.deadline)
        ),
        (sheet.skills || []).length
          ? el("div", { class: "stats" }, (sheet.skills || []).map((skill) => pill(skill, "quiet")))
          : null
      ),
      el("div", { class: "card side" }, keyNumbers(sheet, left, pot, reward, fee, entries))
    );

    const blocks = [];

    if (Object.keys(rewards).length) blocks.push(rewardSplit(rewards, pot));

    if (Array.isArray(sheet.phases) && sheet.phases.length) blocks.push(phaseTimeline(sheet.phases));

    if (resolution && (resolution.criteria || resolution.summary)) blocks.push(criteriaBlock(resolution));

    if (requirementSheet) {
      blocks.push(requirementsBlock(requirementSheet));
    }

    if (sheet.rules) {
      blocks.push(
        collapsible("Rules as written", sheet.rules, markdown, sheet.bundleSha256 ? "Bundle sha256 " + sheet.bundleSha256 : null)
      );
    }

    if (sheet.description) blocks.push(collapsible("The task in full", sheet.description, markdown, null));

    blocks.push(
      section(
        "Elsewhere",
        el(
          "ul",
          { class: "list" },
          el("li", {}, el("a", { href: "#/bounty/" + slug + "/leaderboard", text: "Live leaderboard for this bounty" })),
          el("li", {}, externalLink("https://make.fun/bounty/" + slug, "This bounty on make.fun")),
          sheet.sponsor && sheet.sponsor.slug
            ? el("li", {}, externalLink("https://make.fun/s/" + sheet.sponsor.slug, "Everything by " + sheet.sponsor.name))
            : null,
          sheet.kit && sheet.kit.json ? el("li", {}, externalLink("https://make.fun" + sheet.kit.json, "Entry kit (JSON)")) : null
        )
      )
    );

    fill(body, blocks);
  }

  function keyNumbers(sheet, left, pot, reward, fee, entries) {
    const rows = [
      ["Listed prize", money(reward)],
      ["Pot now", pot ? money(pot) : "—"],
      ["Entry fee", fee ? money(fee) : "free"],
      ["Entries", num(entries)],
      ["Time left", left.text],
      ["Deadline", stamp(sheet.deadline)],
      ["Prizes paid", Object.keys(sheet.rewards || {}).length + " places"],
      ["Judge", sheet.resolution ? sheet.resolution.method || "—" : "—"],
      ["Escrow", sheet.escrowLifecycle ? sheet.escrowLifecycle.state : "—"],
    ];
    const box = el("dl", { class: "side" });
    for (const [label, value] of rows) {
      box.appendChild(
        el("div", { class: "row" }, el("dt", { text: label }), el("dd", { text: value }))
      );
    }
    return frag(
      el("h3", { text: "At a glance" }),
      box,
      el(
        "p",
        { class: "note" },
        "Entering is done on make.fun itself; this page only reads the public API."
      ),
      el("a", { class: "btn primary", href: "https://make.fun/bounty/" + sheet.slug, rel: "noopener noreferrer", target: "_blank", text: "Open on make.fun ↗" })
    );
  }

  function rewardSplit(rewards, pot) {
    const places = Object.keys(rewards)
      .map((key) => [Number(key), Number(rewards[key])])
      .filter((pair) => Number.isFinite(pair[0]))
      .sort((a, b) => a[0] - b[0]);
    const table = el("table", { class: "table" });
    table.appendChild(
      el("thead", {}, el("tr", {}, el("th", { text: "Place" }), el("th", { class: "n", text: "Prize" }), el("th", { class: "n", text: "Share" })))
    );
    const tbody = el("tbody");
    const total = places.reduce((sum, pair) => sum + pair[1], 0);
    for (const [place, prize] of places) {
      tbody.appendChild(
        el(
          "tr",
          {},
          el("td", { text: "#" + place }),
          el("td", { class: "n", text: money(prize) }),
          el("td", { class: "n", text: total ? Math.round((prize / total) * 100) + "%" : "—" })
        )
      );
    }
    table.appendChild(tbody);
    return section(
      "Reward split",
      table,
      el(
        "p",
        { class: "note" },
        places.length + " " + plural(places.length, "place is", "places are") + " paid out of the pot; " +
          (pot ? "the pot stands at " + money(pot) + " and entry fees add to it." : "the pot is the listed prize.")
      )
    );
  }

  function phaseTimeline(phases) {
    const list = el("ul", { class: "timeline" });
    const at = now();
    for (const phase of phases) {
      const starts = Date.parse(phase.startsAt);
      const ends = Date.parse(phase.endsAt);
      const live = at >= starts && at < ends;
      list.appendChild(
        el(
          "li",
          { class: live ? "running" : "" },
          el("div", { class: "what" }, phase.title || phase.key, live ? " · running now" : ""),
          el("div", { class: "when", text: stamp(phase.startsAt) + " → " + stamp(phase.endsAt) }),
          phase.description ? el("p", { class: "note", text: phase.description }) : null,
          el(
            "div",
            {},
            pill("scores " + (phase.scores || "hidden"), phase.scoresVisible ? "ok" : "quiet"),
            phase.finalizedAt ? pill("finalised " + dateShort(phase.finalizedAt), "cool") : pill("not finalised", "quiet")
          )
        )
      );
    }
    return section("Phases", list);
  }

  function criteriaBlock(resolution) {
    const list = el("ul", { class: "list" });
    for (const item of resolution.criteria || []) list.appendChild(el("li", { text: item }));
    return section(
      "How it is judged",
      resolution.summary ? el("p", { text: resolution.summary }) : null,
      resolution.method ? el("p", { class: "note", text: "Method: " + resolution.method }) : null,
      list
    );
  }

  function requirementsBlock(sheet) {
    const blocks = [];
    const deliverables = sheet.deliverables || [];
    if (deliverables.length) {
      const list = el("ul", { class: "list" });
      for (const item of deliverables) {
        list.appendChild(
          el(
            "li",
            {},
            el("strong", { text: item.name }),
            item.required ? " (required)" : " (optional)",
            item.description ? " — " + item.description : ""
          )
        );
      }
      blocks.push(section("What to hand in", list));
    }

    const checks = (sheet.checks || []).filter((check) => check.applies !== false);
    if (checks.length) {
      const rows = el("table", { class: "table" });
      rows.appendChild(
        el("thead", {}, el("tr", {}, el("th", { text: "Check" }), el("th", { text: "Phase" }), el("th", { text: "What it wants" })))
      );
      const tbody = el("tbody");
      for (const check of checks.slice(0, 25)) {
        tbody.appendChild(
          el(
            "tr",
            {},
            el("td", { text: check.title || check.check }),
            el("td", { text: check.phase || "—" }),
            el("td", { text: check.description || "—" })
          )
        );
      }
      rows.appendChild(tbody);
      blocks.push(section("Gates on the way in", el("div", { class: "table-wrap" }, rows)));
    }

    if (sheet.deadlines && typeof sheet.deadlines === "object") {
      const box = el("dl", { class: "side" });
      for (const [label, value] of Object.entries(sheet.deadlines)) {
        box.appendChild(el("div", { class: "row" }, el("dt", { text: label }), el("dd", { text: stamp(value) })));
      }
      blocks.push(section("Deadlines", box));
    }

    if (sheet.prerequisites && sheet.prerequisites.summary) {
      blocks.push(
        section(
          "Prerequisites",
          el("p", { text: sheet.prerequisites.summary }),
          sheet.prerequisites.label ? el("p", { class: "note", text: sheet.prerequisites.label }) : null
        )
      );
    }

    return blocks.length ? section("Entry requirements", frag(...blocks)) : null;
  }

  function collapsible(title, text, markdown, footnote) {
    const holder = el("div", { class: "prose clamp" });
    const toggle = el("button", { class: "btn", type: "button", text: "Show all" });
    toggle.addEventListener("click", () => {
      const clamped = holder.classList.toggle("clamp");
      toggle.textContent = clamped ? "Show all" : "Show less";
    });
    const long = String(text).length > 1400;
    const box = section(title, holder);
    if (long) box.appendChild(toggle);
    if (footnote) box.appendChild(el("p", { class: "mono-note", text: footnote }));
    if (markdown) holder.appendChild(markdown(text));
    else holder.appendChild(el("p", { text: text }));
    if (!long) holder.classList.remove("clamp");
    return box;
  }

  async function read(slugNow, force) {
    const cached = peek("bounty:" + slugNow);
    if (cached && cached.data) {
      data = cached.data;
      prose = (await import("../lib/markdown.js")).markdown;
      const cachedReq = peek("bounty:" + slugNow + ":req");
      requirementSheet = cachedReq && cachedReq.data ? cachedReq.data : null;
      apply(data, requirementSheet, true);
      ctx.ready();
    }
  }

  try {
    await read(slug, ctx.force);
    const markdown = await proseModule();
    const [detail, requirements] = await Promise.all([
      getJSON(apiURL("/competitions/" + encodeURIComponent(slug)), { key: KEY, persist: true, force: ctx.force }),
      getJSON(apiURL("/competitions/" + encodeURIComponent(slug) + "/requirements"), {
        key: REQ,
        persist: true,
        force: ctx.force,
      }).catch(() => ({ data: null })),
    ]);
    data = detail.data;
    requirementSheet = requirements.data;
    apply(data, requirementSheet, false);
    ctx.ready();
  } catch (error) {
    fill(body, errorPanel(error, () => ctx.reload()));
    setText(status, "make.fun could not be read for this bounty");
    ctx.ready();
  }

  return {
    destroy() {
      unsub();
      clear(body);
      clear(hero);
    },
  };
}
