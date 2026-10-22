# Architecture · v3

## Modules

- `web/app.js`: UI, draft migration from workspace v1, forms, accessible controls, review hotkeys, HTTP client. API keys are never persisted client-side.
- `web/core.js`: case/result validation, stats, release gate, CSV. Backward compatible with v1/v2 saved runs.
- `web/graders.js`: pure shared rule validation, interpreted JSON Schema, RE2 regex, composite rule+judge grading.
- `web/lab.js`: canonical structured prompts, rendered messages, CSV/JSONL import, rubric validation, judge parsing, paired comparison/bootstrap, calibration, word diff, experiment bundle.
- `server/provider.mjs`: AES-GCM vault, validated provider settings, preflight and conservative reservations, server-only Chat Completions adapter, generation and judge execution.
- `server/api.mjs`: owner-private API, immutable assets, D1 run/task persistence, atomic queue claims, limits, retries, reviews, exports/imports.
- `worker/index.ts`: `/api/` interception, preserved Vinext and Sites integrations. `app/page.tsx` opens `/app/index.html`.
- `cli/evalbench.mjs`: Node HTTP client for the same production API, export artifacts and CI exit codes.
- `scripts/sync-web.mjs`: copies static assets and bundles the browser entry point with declared esbuild dependency. Source stays readable; generated files stay ignored.

## Storage

`eval_runs`: immutable JSON experiment snapshot, mutable reviews, archive flag, control state, concurrency, request/budget limits.

`eval_tasks`: one generation or judge job per (case, side, repeat). State pending/running/done/cancelled, lease, attempts, reservation, known cost, prior retry reservations, full result. The first repeat is also exposed as legacy `results`; all are in `repetitions` / `judgments`.

`eval_assets`: append-only dataset / prompt / rubric / suite versions. Stable family ID, unique (family, version), fresh immutable content and version UUID. Runs retain exact snapshots and optional checked asset references.

`eval_settings`: public provider configuration plus encrypted key. Master key is a Sites runtime secret, absent from D1 / source / exports. Environment API key fallback remains supported. Endpoint is frozen in runs and must match current provider before any paid task can be claimed.

Migration `0001_complex_microbe.sql` is generated from the Drizzle schema and adds v3 tables/columns without deleting v2 records. Keep applied migrations and metadata immutable.

## Queue guarantees

Run creation uses one D1 batch transaction. Claim is one conditional `UPDATE … RETURNING`, checking active control, concurrency, attempt cap, aggregate costs/reservations and judge dependency. Provider call happens after the claim; its result and run timestamp are persisted transactionally. Pause prevents new claims. Successful tasks are never retried. `retry-errors` only resets errored completed jobs, with a maximum of 10 attempts per job. Old charges/reserves survive retries.

Judge tasks wait for their matching generation. A generation error produces a skipped judge error, without a provider request. The cap conservatively counts task attempts (including skipped judge jobs), not only billable provider requests. An expired call becomes an explicit ambiguous-result error; no automatic replay. Stale task completions cannot overwrite a newer claim because lease/state are checked.

Browser or CLI drives the queue; no unattended scheduler is implied. A second client can resume or advance the same run safely under server concurrency and budget checks. The owner-private boundary is essential; this is not a multi-tenant public API.

## Grading and comparison

Rule-free answers remain ungraded unless judge is enabled. If both are configured, all rules and the weighted judge threshold must pass. Prompt output schema is an additional grader even when a case has its own JSON Schema. Missing/error/truncated responses and missing/invalid judge JSON block the gate. The gate evaluates every repeat and blocks any paired A-pass/B-fail regression.

Judge sees a trusted evaluator system message and a separate JSON data message with the input, rendered generation messages, reference and answer. Rubric IDs, finite score bounds, cardinality and non-empty evidence are validated. This reduces accidental instruction following but does not guarantee immunity to prompt injection or judge bias; human calibration is provided.

Comparison pairs by case ID plus canonical inputs/reference/rules, requires matching rubric/judge/output schema, reports omitted/changed/ungraded cases, aggregates repetitions inside each case and bootstraps case-level paired differences (2000 deterministic resamples, 95% percentile interval). It reports uncertainty without asserting a win when the interval crosses zero. Generation latency/cost and SD across repeat pass rates are available; total execution billing includes judge jobs separately in the run.

## API

| Route | Function |
| --- | --- |
| `GET /api/health` | version, storage, provider availability, vault readiness |
| `GET/POST /api/provider` | public configuration / encrypted key replacement |
| `POST /api/provider/test` | one tiny real connection check using the server key |
| `GET/POST /api/assets` | immutable versions |
| `POST /api/estimate` | canonical experiment preflight, no model calls |
| `GET/POST /api/runs` | list summaries / idempotent creation by UUID / bundle import |
| `GET/PATCH /api/runs/:id` | full persisted run / review patch / recoverable archive |
| `POST /api/runs/:id/advance` | atomically claim and execute at most one job |
| `POST /api/runs/:id/control` | pause, resume, cancel, retry-errors, limits |
| `POST /api/runs/:id/regressions` | append case to immutable suite version |
| `GET /api/runs/:id/export?format=` | json / csv / jsonl / bundle |
| `POST /api/compare` | persisted baseline/candidate comparison |

JSON body limit 4 MB, dataset 1–500 cases, live model run up to 100 cases, 1–5 repeats, total at most 2000 jobs, concurrency 1–8, at most 100 active runs. Archive old runs before creating more. Asset listing returns latest 1000 versions. No secrets in responses, diagnostics, exports or Git.
