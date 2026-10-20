# EvalBench 2 architecture

## Request flow

The owner opens the private Site. Sites dispatch authenticates access. The frontend is served from `public/app/`, copied from `web/`. Requests to `/api/*` are routed by `worker/index.ts` into `server/api.mjs`; other requests retain Vinext/Sites routing.

Server state lives in D1. `eval_runs` holds immutable snapshots, reviews, provider mode and archive state. `eval_tasks` holds one row for each case/side, a state, lease timestamp and durable result. Reads reconstruct a run from its tasks; concurrent writers never replace a whole results JSON blob.

## API

| Method/path | Behavior |
| --- | --- |
| `GET /api/health` | Capability/configuration flags only, no secrets |
| `GET /api/runs` | Metadata/summary list; avoids downloading all answer bodies |
| `POST /api/runs` | Creates synthetic, model or imported run; client UUID is idempotency key |
| `GET /api/runs/:id` | Reconstructs full saved snapshot and progress |
| `POST /api/runs/:id/advance` | Atomically claims one pending/expired task, executes it and persists its result |
| `PATCH /api/runs/:id` | Updates a single case review, or recoverable archive flag |
| `GET /api/runs/:id/export?format=json\|csv` | Server-side downloadable export |
| `GET /api/runs?archived=1` | Archive metadata for restore UI |

Creation is a transaction, so no partial task queue is visible. Task claim is a single conditional UPDATE with RETURNING. A 90-second lease exceeds the 35-second provider timeout. Two browser workers request tasks; tabs can close and resume later. No scheduled queue worker runs without an active browser. A provider may finish a request whose result was lost during infrastructure failure; billing is therefore not exactly-once.

The single-owner workspace relies on the confirmed owner-private Sites access boundary. This is intentional shared state for the owner and authorized service checks, not a public multi-tenant API. Cross-origin writes are rejected in addition to platform access controls.

## Provider modes

- `synthetic`: built-in independent eight-case fixture, known outputs generated per claimed server task; no LLM API.
- `model`: key/URL from runtime environment, one Chat Completions request per rendered prompt. Secret never enters run JSON.
- `import`: user-supplied results validated and persisted as completed tasks; absent replies remain ungraded.

## Browser data

The version-1 workspace caches records and retains local dataset/prompt drafts. Hosted run metadata is refreshed from the API; full answer bodies are loaded on demand. Local-only records stay local unless explicitly imported/saved. Core exports and pure grading are shared between Node tests, server and frontend.

## Build and storage

`web/` is authored source. `scripts/sync-web.mjs` copies it to ignored `public/app/`. Vinext builds the Worker and static assets into ignored `dist/`. The hosting manifest declares D1 `DB`. Drizzle-generated SQL is applied to production by Sites during publication. GitHub Pages publishes a launcher to the private Site; all source, SQL, tests and build tooling live in the GitHub repository.
