[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

[make.fun](https://make.fun/)

# make.fun board

A single page that reads make.fun's public API in the browser and shows it four ways: the bounty board, one
bounty, that bounty's leaderboard and one account's profile. Everything the page needs — CSS, JavaScript, the
markup — is in `app/index.html`; it loads no stylesheet, module, font or framework, and no other file of `app/`
exists to load. The page asks for `https://make.fun/api/...` with `Accept: application/json` and works off the
JSON it gets back.

## What it does

- **Four surfaces on the live feed.** `#/` lists the bounties that still take entries, `#/bounty/<slug>` shows
  one bounty (reward, live pot, entry fee, dates, whether it takes entries, prizes, summary, description, rules),
  `#/bounty/<slug>/leaderboard` ranks its entries, `#/u/<handle>` profiles an account. Each route has its own
  URL and a link that leads to it; anything else gets a "not found" panel without a request being sent.
- **Split pane.** The bounty list sits in a 320px column and stays there while the right pane shows the surface;
  under 700px the surface replaces the list and a back link leads out.
- **A leaderboard that stays small.** Twenty rows live in the DOM at a time, moved with `scrollTop` between two
  spacer elements, and the header says how many entries there are and how many rows are actually in the DOM.
- **A response cache in memory.** One `Map` holds url → `{body, time}`. Inside fifteen seconds a repeat reads the
  stored body; after that the request goes out with `cache: 'no-cache'` and only `Accept: application/json`, so the
  browser revalidates its own HTTP cache on the way and a revalidation still costs no body.
- **Rows patched in place.** The list keeps one node per slug, so a refresh writes `textContent` and one
  attribute instead of rebuilding markup.
- **A meter in the header** counts requests and reads served from the cache, so the caching is visible
  rather than claimed.
- **Type to filter.** The input over the list narrows it locally by matching row text; it never calls the API.
- **Countdowns that tick.** Every deadline is redrawn once a second from the timestamp already in memory, so the
  clock moves and no request is made.
- **Text from the API is escaped** on the way into markup, and prices and dates are formatted in one place.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `app/` and `screenshots/` into `out/` and writes `out/dossier.json` from them. Served from `out/`,
the page opens at `app/index.html` with no build step: `python3 -m http.server -d out 8000` and
`http://localhost:8000/app/`.

`node main.ts` with no `MAKEFUN_OUTPUT_DIR` writes to `/output`, which is where the grader runs it.

## Layout

```
app/index.html   the whole frontend: one file, inline CSS and JS
screenshots/     three captures of the running app
main.ts          copies app/ and screenshots/, writes dossier.json
vendor/          make.fun's dossier library, used by main.ts
```