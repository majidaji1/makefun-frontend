# make.fun board

A single-file client for the make.fun bounty board: one `app/index.html` holding every style and every script inline, no build step, no dependency, no separate asset. It reads the public API at `https://make.fun/api` and renders a split-pane board, bounty pages, a virtualised leaderboard and public profiles, revalidating each request with the ETag the API hands back.

[![makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![tiny-chess-01](https://make.fun/badge/tiny-chess-01.svg)](https://make.fun/bounty/tiny-chess-01)
[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)

## What it does

- **Split pane / master-detail.** The bounty list is a panel that never leaves the screen; the detail pane swaps between board, bounty, leaderboard and profile. Under 700px the list becomes the page and the detail replaces it.
- **One file, first load.** All CSS and JS are inline in `app/index.html`; the first load is a single document.
- **ETag revalidation.** Every response keeps `etag`, `last-modified` and body in a `Map`; the next request sends `If-None-Match`, a `304` reuses the stored body and touches no DOM.
- **Virtualised leaderboard.** 20 recycled rows plus computed top/bottom spacers, so a 260-entry table costs the same DOM as a 20-entry one.
- **Rows patched in place.** Each bounty row is created once, kept in a `Map` by slug, and later updates go through `textContent` on the nodes that already exist.
- **Type-to-filter.** The input filters title and slug locally; no request leaves the page.
- **Live request meter.** The header counts requests actually sent, `304`s received and cache hits served.
- **Ticking countdowns.** Times are computed from the `deadline` already in hand, refreshed every second without calling the API.
- **Routes.** `#/`, `#/bounty/<slug>`, `#/bounty/<slug>/leaderboard`, `#/u/<handle>`, and a named not-found pane for anything else.

## Run it

Open `app/index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8080 --directory app
```

Build the submission (copies `app/` and `screenshots/`, then writes `dossier.json`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

```
app/index.html   the whole frontend: markup, styles and script in one file
screenshots/     three captures of the running app
main.ts          stages app/ and screenshots/, writes dossier.json
vendor/          make.fun's dossier library, unchanged
```
