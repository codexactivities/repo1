# EvalBench contributor instructions

- App root in GitHub is `evalbench/`. Read README.md, ARCHITECTURE.md and VERIFICATION.md.
- Node >=22.13, ESM. Frontend source is `web/`; `dist/` is generated. `public/app/` is a generated copy.
- `server/api.mjs` is shared production logic. Keep it importable for Node tests without requiring cloud bindings at import time.
- Keep grading in `web/core.js` pure and tested. Missing, errored or rule-free answers must not pass the release gate.
- Historical datasets/prompts are immutable run snapshots. Do not silently upload local-only runs.
- Preserve Sites/Vinext worker and build integrations, project ID, and private audience. Do not deploy the server publicly without new authorization/tenancy design.
- D1 migrations are generated from `db/schema.ts`; applied SQL and Drizzle metadata are immutable.
- Save each completed task transactionally. Completed tasks are not retried. Lease reclaim is for interrupted requests; do not promise exactly-once provider billing.
- Never put API keys in client code, browser storage, fixtures, Git, logs or exports. Runtime secrets come from Sites.
- Escape all model/user text before inserting HTML. No model-produced HTML execution.
- Browser workspace format is still version 1; preserve compatibility or write an explicit migration.
- Use `npm test`, `npm run check`, `node node_modules/typescript/bin/tsc --noEmit`, then the documented Sites build.
- Report synthetic vs real-provider verification separately. Do not claim actual LLM calls without evidence.
- GitHub Pages is a launcher; it cannot host `/api/` or D1. Complete source remains in GitHub for coding agents.
