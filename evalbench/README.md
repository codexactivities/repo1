# EvalBench 2

Server-backed workspace for prompt evaluations: A/B prompts, deterministic checks, regression detection, blind review, resumable runs and JSON/CSV exports. Russian interface.

**Online app:** https://evalbench-prompt-lab.dot-punks-gp-9267.chatgpt.site

**Readable source:** https://github.com/codexactivities/repo1/tree/main/evalbench

The online app is owner-private. GitHub stores the source and its Pages URL opens the hosted app. GitHub Pages itself does not execute the backend.

## What now works online

- The server creates a persisted run with immutable dataset/prompt snapshots and a task queue.
- The browser advances up to two tasks concurrently. Each answer is committed to D1 before it is returned to the browser.
- A run can be reopened after reload or from another authenticated device. Pending work resumes using **Продолжить**. Closing a tab stops scheduling new work; this is not an unattended background-job service.
- **Проверить сервер на синтетике** executes 16 tasks on an independent eight-case fixture. Expected A: 50%; B: 62.5%; two regressions. It is explicitly labelled synthetic and never calls a real model.
- **Выполнить на моделях** uses a server-held provider key and an HTTPS OpenAI Chat Completions-compatible endpoint. Without a configured key this action is disabled, rather than pretending to call a model.
- Import replies from a JSON file or paste JSON. In server mode the imported run is saved in D1.
- Reviews/comments, server-side JSON/CSV downloads, and recoverable archive/restore are supported.

Dataset and prompt drafts remain browser-local. Every server run keeps its own durable copy. The old local-only workspace is retained; browser-local runs are not uploaded automatically.

## Quick verification

1. Open the online app and choose **Новый прогон → Проверить сервер на синтетике**.
2. Expect 8 tests, candidate 63% (62.5% rounded), baseline 50%, +13 percentage points (12.5 rounded), and two regressions.
3. Reload: the server run remains available. Open its answer details and download JSON/CSV.
4. Archive the run from History, then use **Архив → Восстановить** to bring it back.

See [VERIFICATION.md](VERIFICATION.md) for precise test coverage and limits.

## Provider setup

Hosted runtime variables are set through Sites, not GitHub, the browser, or `.openai/hosting.json`:

| Variable | Purpose |
| --- | --- |
| `EVAL_API_KEY` | Secret provider API key; required for model execution |
| `EVAL_API_URL` | Optional HTTPS Chat Completions endpoint; defaults to `https://api.openai.com/v1/chat/completions` |
| `EVAL_MODEL` | Optional display/default model identifier |

For OpenAI keys, use the OpenAI Developers integration's secure provisioning flow. Do not paste a key into chat or commit it. A deployment is needed after changing runtime variables.

Then set and save valid model IDs for A/B in **Промпты** and execute a small pilot. A run sends one user message per rendered prompt, uses provider sampling defaults, has a configurable 16–2048 output-token budget (512 default), and a 35-second request timeout. Maximum 50 cases per model run. Both versions use the same server-configured provider/key. There are no automatic retries of persisted success/error results. A crashed/incomplete lease can be reclaimed after 90 seconds; in rare network-failure cases the provider may have processed an unrecorded request, so exactly-once external billing is not guaranteed.

No API key is accepted from the frontend. Response IDs, finish reasons and basic token usage are retained when supplied. Monetary costs are not fabricated. There is no LLM-as-judge, provider catalog, corporate VPN proxy, Responses API, or team collaboration layer.

## Source layout

| Directory | Purpose |
| --- | --- |
| `web/` | Readable HTML/CSS/JS frontend and pure evaluation logic |
| `server/api.mjs` | Hosted API, D1 queue, provider calls, persistence and exports |
| `worker/index.ts` | Worker entrypoint; preserves Sites integration |
| `app/` | Minimal Vinext page routing to the static frontend |
| `db/schema.ts`, `drizzle/` | D1 schema and immutable generated migrations |
| `scripts/sync-web.mjs` | Copies authored frontend to `public/app/` for build/preview |
| `scripts/serve.mjs` | Optional legacy local runner; no cloud D1 behavior |
| `tests/` | Unit/integration tests, including real SQLite and mocked model adapter |
| `examples/` | Portable datasets and independent verification fixtures |
| `launcher/` | GitHub Pages entrypoint opening the private hosted app |

`dist/` is generated build output. Do not edit it. `public/app/` is an ignored generated copy of `web/`.

## Development

Node >=22.13, pnpm 10.32.1. Install using the maintained Sites helper or `corepack pnpm install --frozen-lockfile` in a standalone checkout. Then:

```sh
npm test
npm run check
npm run db:generate    # only after changing db/schema.ts
npm run dev
npm run build
```

The Sites skill owns managed preview and publication. Local and hosted D1 databases are separate. Apply the generated SQL migrations locally before testing the server; Sites applies them to the hosted database during publication.

For the dependency-free local-only frontend/runner:

```sh
npm run start:local
```

This serves `web/` at http://127.0.0.1:3000. Supply local `EVAL_API_KEY`/`EVAL_API_URL` via an ignored environment file if needed. The legacy runner does not claim hosted persistence.

## Data format and grading

Dataset: array of `{id,title,slice,vars,reference,rules}` with unique IDs and scalar variables. Templates use `{{variable}}`; server execution rejects missing variables. Rules: `contains`/`notContains` (case-insensitive), `exact` (case-sensitive after trim), strict `json`, and whitespace-based `maxWords`.

Response import: `[{"id":"case-id","a":{"text":"baseline"},"b":{"text":"candidate"}}]`. Error objects use `{"error":"Provider HTTP 429"}`. Optional nonnegative `latencyMs` and `cost` are supported. Missing responses and rule-free tests are ungraded.

A case passes only if every rule passes. A regression is A pass → B fail. Release requires complete graded A/B coverage, B pass rate above threshold, and no regressions. Human review is independent and never overrides automatic grading. Rules are checks against declared conditions, not proof of overall correctness.

## Access and privacy

This is a **single-owner, private Sites workspace**. Sites dispatch enforces access before the Worker. Authorized service access and the owner use the same workspace. Do not publish this backend publicly or expand its audience without adding appropriate user-level authorization and tenancy. There is no separately scaffolded OAuth stack.

API calls reject cross-origin writes, validate inputs and use prepared SQL. Secrets are server configuration only, omitted from run snapshots, client bundles and exports. Imported text is HTML-escaped. CSV guards against formula injection. Active runs can be archived and restored; there is no permanent-delete endpoint.

Read [AGENTS.md](AGENTS.md) and [ARCHITECTURE.md](ARCHITECTURE.md) before editing.
