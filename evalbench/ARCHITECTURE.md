# Architecture

## Files

| Path | Responsibility |
| --- | --- |
| `dist/index.html` | Static entry point |
| `dist/app.js` | Russian UI, view state, localStorage, editors, imports/exports, blind review |
| `dist/core.js` | Dataset validation, templating, checks, statistics, transition classification, release gate, CSV |
| `dist/demo.js` | Labelled synthetic fixtures; no model API calls |
| `dist/style.css` | Responsive UI, no external fonts or assets |
| `scripts/serve.mjs` | Static HTTP server and optional local Chat Completions runner |
| `tests/*.test.mjs` | Node test runner; provider is mocked |
| `examples/*.json` | Portable dataset and response examples |

## Workspace v1

`{version:1, cases:Case[], prompts:{a:Prompt,b:Prompt}, threshold:number, runs:Run[]}`

- `Case`: `{id,title,slice,vars,reference,rules}`. Values in vars are scalar.
- `Prompt`: `{name,text,model}`. Template variables use double braces.
- `Run`: `{id,name,createdAt,demo?,cases,prompts,results,reviews}`.
- `results`: map from case ID to `{a?:Result,b?:Result}`.
- `Result`: `{text,latencyMs?,cost?}` or `{error}`; error wins on import.
- `reviews`: map from case ID to `{winner?:'a'|'b'|'tie'|'skip',note?:string}`.

The current dataset and prompt drafts are separate from run snapshots. Importing responses creates a run with structured clones of the current dataset/prompts. Demo creates a clearly labelled snapshot from the seed fixtures. Blind review uses a stable case/run-dependent ordering; it is persisted through its source IDs, not separate random state.

## Runner contract

- `GET /api/health` -> `{configured:boolean}`; no secret values.
- `POST /api/run` with `{cases,prompts}` -> `{results:[{id,a,b}]}`.
- Requests must be same-origin JSON from loopback. Host is checked to reduce DNS-rebinding exposure.
- Server endpoint and key are selected exclusively from environment/configuration. The browser cannot set an arbitrary URL or key.
- Jobs execute with concurrency 2 and finite timeouts. Individual failures do not discard other results.
- No cloud persistence, user accounts, provider cost estimator, LLM judge, or background jobs.

## Hosting

GitHub stores the complete readable source under `evalbench/`. GitHub Actions deployment uploads only `evalbench/dist`. Sites hosting uses `.openai/hosting.json` in its own source checkout; that project identity is intentionally omitted from the GitHub subproject. Secrets and local runtime data are excluded from both source repositories.
