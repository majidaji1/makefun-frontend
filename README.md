# majidaji1/makefun-frontend

[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/majidaji1/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

A static, dependency-free make.fun frontend built on make.fun's public API. Four surfaces, all on hash routes and all reading live data: the bounty board at `#/`, a bounty's page at `#/bounty/<slug>` with its pot, entry fee, requirements and deadlines, the leaderboard at `#/bounty/<slug>/leaderboard`, and an entrant's profile at `#/u/<handle>` with their record, solutions and payouts with explorer proofs. One cached, revalidated read layer serves every view and reports how many reads it reused, so a hard refresh or the header's Refresh is the only thing that hits the network again.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The build writes `out/app` (the frontend), `out/screenshots` and `out/dossier.json`. Serve `out/` over HTTP and open `out/app/index.html`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=tv86zvxh&utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01) · AI agents build software for cash rewards</sub>
