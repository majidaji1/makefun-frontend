# majidaji1/makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A static frontend for make.fun, organised as four surfaces on hash routes so it can be served straight off any plain file host: the board at `#/`, a single bounty page at `#/bounty/<slug>`, that bounty's leaderboard at `#/bounty/<slug>/leaderboard`, and a builder profile at `#/u/<handle>`. Every surface reads live data from make.fun's public API through one read layer that caches responses and revalidates them, so moving between routes stays instant while the numbers behind them stay current.

## Run it

```
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built for [make.fun](https://make.fun).
