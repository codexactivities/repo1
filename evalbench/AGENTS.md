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

## v3 invariants

- Read `web/graders.js` and `web/lab.js` before changing grading/comparison. Browser and server must use the same pure logic.
- Secrets: BYOK is AES-GCM ciphertext in D1 using runtime `EVAL_VAULT_KEY`; never persist plaintext locally. New provider endpoints must not receive a prior endpoint's key accidentally.
- A provider endpoint change blocks old model runs until restored. Pricing/rubrics/messages are frozen in the run.
- Paired comparisons must expose removed/changed/ungraded cases and evaluator mismatch. Repetitions are clustered per case for uncertainty; do not treat dependent repeats as independent cases.
- A run output schema and a per-case schema are both enforced. Schema `false` is a valid reject-all schema.
- Generation and judge jobs are distinct. A missing/failed/invalid judge is never PASS. Judge outputs require every rubric criterion exactly once, score 0–4 and evidence.
- Queue control and caps are server-side. Expired requests become ambiguous-result errors; do not automatically repeat paid calls. Retrying an error retains its prior reservation/charge.
- `public/app/app.js` is bundled by `scripts/sync-web.mjs`; edit readable `web/` only. Tests now require installed declared dependencies.
- CLI operates the same production HTTP API. Preserve exit codes and bundle round-trips, including response IDs/usage and human review.
