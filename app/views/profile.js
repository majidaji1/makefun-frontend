// A public profile: who the handle is, their record, every entry they have in
// the open, and the prizes that actually landed on chain.

import { apiURL, assetURL, getJSON, peek } from "../lib/net.js";
import {
  el, fill, clear, avatar, pill, statTerm, section, errorPanel, externalLink, setText,
} from "../lib/dom.js";
import { money, num, dateShort, ago, initials } from "../lib/format.js";

const SHOWN_FIRST = 12;

export default async function profile(root, ctx) {
  const handle = ctx.params[0];
  const KEY = "profile:" + handle;

  const head = el("div", { class: "p-head" });
  const body = el("div");
  const note = el("p", { class: "note" });

  fill(root, head, body, note);
  ctx.crumbs([{ label: "Board", href: "#/" }, { label: "@" + handle }]);
  ctx.title("@" + handle);
  ctx.live("reading the profile of @" + handle);

  let shown = SHOWN_FIRST;
  let person = null;

  function draw() {
    const data = person;
    if (!data) return;
    const record = data.record || {};
    const picture = assetURL((data.avatar && (data.avatar.url_small || data.avatar.url)) || data.image);
    const handleText = data.handle || handle;
    const joined = data.joined_at ? dateShort(data.joined_at) : "unknown";
    const entered = Number(record.competitions_entered) || 0;
    const placed = Number(record.competitions_placed) || 0;
    const won = Number(record.competitions_won) || 0;

    ctx.title("@" + handleText + (data.display_name ? " · " + data.display_name : ""));
    ctx.live(
      `@${handleText} · ${num(entered)} ${entered === 1 ? "bounty" : "bounties"} entered · $${record.prize_usd || "0"} won`
    );

    const name = el(
      "div",
      { class: "id" },
      el("h1", { text: data.display_name || "@" + handleText }),
      el(
        "p",
        { class: "handle" },
        "@" + handleText,
        " · joined " + joined,
        " · ",
        externalLink("https://make.fun/u/" + encodeURIComponent(handleText), "on make.fun")
      ),
      el(
        "div",
        { class: "stats" },
        data.house ? pill("house", "cool") : null,
        data.demo ? pill("demo", "quiet") : null,
        data.github_login ? pill("github: " + data.github_login, "quiet") : null,
        data.x ? pill("x: @" + data.x, "quiet") : null,
        won ? pill(num(won) + " " + (won === 1 ? "win" : "wins"), "ok") : pill("no wins yet", "quiet"),
        placed ? pill(num(placed) + " placed", "warm") : null
      )
    );

    fill(head, picture ? avatar(picture, 72, "avatar of @" + handleText) : el("span", { class: "av", text: initials(handleText) }), name);

    const stats = el(
      "div",
      { class: "stats" },
      statTerm("Bounties entered", num(entered)),
      statTerm("Placed", num(record.competitions_placed || 0)),
      statTerm("Won", num(won)),
      statTerm("Podiums", num(record.podium_finishes || 0)),
      statTerm("Best placement", record.best_placement ? "#" + record.best_placement : "—"),
      statTerm("Prizes won", money(record.prize_usd || 0)),
      statTerm("Visible entries", num((data.solutions || []).length))
    );

    const blocks = [];
    if (data.bio) {
      blocks.push(section("About", el("p", { class: "bio", text: data.bio })));
    }

    if (data.wallet && data.wallet.address) {
      blocks.push(
        section(
          "Wallet",
          el(
            "p",
            { class: "mono-note" },
            data.wallet.address,
            " ",
            externalLink(data.wallet.explorer_url, "explorer ↗")
          ),
          el("p", { class: "note", text: "The wallet that signs this account's entries and receives its prizes." })
        )
      );
    }

    const payouts = Array.isArray(data.payouts) ? data.payouts : [];
    if (payouts.length) {
      const list = el("ul", { class: "list" });
      for (const payout of payouts.slice(0, 8)) {
        const competition = payout.competition || {};
        list.appendChild(
          el(
            "li",
            {},
            el("strong", { text: money(payout.amount_usd) }),
            " for ",
            competition.slug
              ? el("a", { href: "#/bounty/" + competition.slug, text: competition.title || competition.slug })
              : (competition.title || "a bounty"),
            payout.place ? " at place #" + payout.place : "",
            " · paid " + (payout.paid_at ? dateShort(payout.paid_at) : "at an unknown date"),
            " · ",
            externalLink(payout.explorer_url, "tx ↗")
          )
        );
      }
      blocks.push(section("Prizes paid", list));
    }

    const solutions = data.solutions || [];
    if (solutions.length) {
      const holder = el("div");
      const drawSolutions = () => {
        const slice = solutions.slice(0, shown);
        fill(holder, slice.map(solutionRow));
        if (more) {
          more.textContent = solutions.length > shown
            ? `Show ${Math.min(SHOWN_FIRST, solutions.length - shown)} more of ${solutions.length}`
            : "Show fewer";
        }
      };
      const more = el("button", {
        class: "btn",
        type: "button",
        text: "Show more",
        on: {
          click() {
            shown = shown >= solutions.length ? SHOWN_FIRST : Math.min(solutions.length, shown + SHOWN_FIRST);
            drawSolutions();
          },
        },
      });
      drawSolutions();
      blocks.push(section("Entries", holder, solutions.length > SHOWN_FIRST ? more : null));
    } else {
      blocks.push(section("Entries", el("p", { class: "note", text: "No public entries for this handle yet." })));
    }

    fill(body, blocks);
  }

  function solutionRow(solution) {
    const competition = solution.competition || {};
    const score = solution.score || {};
    const side = el(
      "div",
      { class: "sol-side" },
      solution.placement ? el("div", { class: "pill ok", text: "#" + solution.placement }) : el("div", { class: "pill quiet", text: "unplaced" }),
      solution.prize_usd ? el("div", { class: "note", text: money(solution.prize_usd) + " won" }) : null
    );
    return el(
      "div",
      { class: "sol" },
      el(
        "div",
        { class: "sol-main" },
        el("div", { class: "sol-title", text: solution.title || "untitled entry" }),
        el(
          "div",
          { class: "sol-sub" },
          competition.slug
            ? el("a", { href: "#/bounty/" + competition.slug, text: competition.title || competition.slug })
            : "a bounty that is not public",
          competition.slug ? " · " : "",
          competition.slug
            ? el("a", { href: "#/bounty/" + competition.slug + "/leaderboard", text: "leaderboard" })
            : "",
          competition.deadline
            ? " · " + (Date.parse(competition.deadline) < Date.now() ? "closed " : "closes ") + dateShort(competition.deadline)
            : "",
          solution.entered_at ? " · entered " + ago(solution.entered_at, Date.now()) : ""
        ),
        score.display !== undefined
          ? el("div", { class: "note", text: (score.column ? score.column.title + ": " : "") + score.display })
          : null
      ),
      side
    );
  }

  async function read(force) {
    const answer = await getJSON(apiURL("/profiles/" + encodeURIComponent(handle)), { key: KEY, persist: true, force });
    person = answer.data;
    draw();
    ctx.ready();
  }

  const cached = peek(KEY);
  if (cached && cached.data && cached.data.handle) {
    person = cached.data;
    draw();
    ctx.ready();
  }

  try {
    await read(ctx.force);
  } catch (error) {
    if (!person) {
      fill(head, errorPanel(error, () => ctx.reload()));
      setText(note, "");
      ctx.title("@" + handle + " · not found");
      ctx.live("no profile named @" + handle);
    } else {
      setText(note, "kept the last answer: " + (error.message || "request failed"));
    }
    ctx.ready();
  }

  return {
    destroy() {
      clear(body);
      clear(head);
    },
  };
}
