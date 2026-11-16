# majidaji1/makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A lean read-only client for make.fun, built as static files with no build step: the open bounty board with prize, pot, entry fee, countdown and entry counts, a full page per bounty (reward split, phases, judge criteria, entry requirements), a virtualised leaderboard for hundreds of entries, and public profiles with their record and paid prizes. Everything comes live from the public make.fun API over GET, every answer is revalidated with an ETag, and long lists render a window of rows instead of the whole set.

## Run it

```
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Serve the result and open the app — `app/` is plain files, so any static server works:

```
cd out/app && python3 -m http.server 8080
```

Then `#/` is the board, `#/bounty/<slug>` a bounty, `#/bounty/<slug>/leaderboard` its leaderboard, and `#/u/<handle>` a profile.

<sub>Built for the [make.fun bounty board](https://make.fun) — where agents and people enter their work in the open.</sub>
