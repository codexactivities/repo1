# EvalBench

A local-first prompt evaluation workspace. Compare two prompt/model versions on the same dataset, inspect automatic checks, find regressions, and review answers blind. Russian UI; no frontend dependencies or build step.

**Live app on GitHub Pages:** https://codexactivities.github.io/repo1/

**Additional owner-private deployment:** https://evalbench-prompt-lab.dot-punks-gp-9267.chatgpt.site

**Source:** https://github.com/codexactivities/repo1/tree/main/evalbench

## Quick start

Requires Node.js 22 or newer. From the repository root:

```sh
cd evalbench
npm start
```

Open http://127.0.0.1:3000. No installation is required. For the static-only app, serve `dist/` with any HTTP server (ES modules require HTTP, not `file://`).

## Workflow

1. Explore the clearly labelled demo (12 cases, prepared answers, two deliberate regressions).
2. Open **Набор тестов** and edit/import your own JSON dataset.
3. Edit baseline A and candidate B in **Промпты**, then save both versions.
4. Start a new run: import model responses, or execute using the optional local runner.
5. Inspect pass rates, coverage, per-slice quality and regressions. Click a row to see answers, rendered prompts and each check.
6. Review answers without version labels in **Слепое сравнение**. Choose a winner/tie/skip and add a note.
7. Export results as CSV or a complete run JSON. Use **Экспорт workspace** to back up or transfer everything.

An individual run export is an archival snapshot, not the response-import format. To re-import the full state, use a workspace export. For answer import, follow `examples/responses.json`.

## What is measured

- A test passes only when every automatic rule passes.
- `contains` and `notContains`: case-insensitive substring checks.
- `exact`: case-sensitive string comparison after trimming surrounding whitespace.
- `json`: strict `JSON.parse`; Markdown fences are not stripped. This checks valid JSON syntax, not a JSON Schema.
- `maxWords`: whitespace-separated words. This is not a tokenizer or a token limit.
- No rules, missing answers or request errors are ungraded. They do not become passes.
- A regression is an A pass followed by a B fail on the same case.
- Release gate requires complete, rule-graded A and B, B pass rate at or above the selected threshold, and zero regressions.
- The percentage-point delta appears only for complete, equally graded A/B sets.
- Human judgments are independent of automatic scores and exported with results. They do not override the gate. Blind review reduces version-label bias; distinctive content may still reveal a version.
- Delay is measured by the runner or imported. Cost is optional imported USD; no model pricing is invented.

Checks are heuristics. They do not establish factual correctness, safety or statistical significance. Judge-model grading and confidence intervals are not implemented.

## Dataset format

```json
[
  {
    "id": "refund",
    "title": "Возврат покупки",
    "slice": "Политики",
    "vars": {
      "question": "Когда вернут деньги?",
      "context": "В течение 10 рабочих дней."
    },
    "reference": "10 рабочих дней",
    "rules": [{"type": "contains", "value": "10 рабочих дней"}]
  }
]
```

IDs must be unique nonempty strings (reserved object-property names are rejected). Variables are strings, numbers or booleans. The dataset accepts 1–500 tests. Templates use `{{variable}}`; live execution rejects missing variables. Historical runs retain their own dataset and prompt snapshots.

## Response import

```json
[
  {
    "id": "refund",
    "a": {"text": "Через три дня", "latencyMs": 620},
    "b": {"text": "В течение 10 рабочих дней", "latencyMs": 810, "cost": 0.001}
  }
]
```

Partial runs are allowed; missing sides remain ungraded. An empty text is an actual empty response. For a failed request use `{"error":"Provider HTTP 429"}` instead of text. Unknown and duplicate IDs are rejected. Import is limited to 10 MB and 200,000 characters per answer. Up to 100 runs are retained.

## Optional live model runner

The public/static version does not hold API keys or call models. To execute prompts, run the included Node server locally with an OpenAI-compatible Chat Completions endpoint. Keys remain in the server environment and are not stored in browser localStorage, Git, exports or responses.

Create an ignored `evalbench/.env.local` file on your machine:

```dotenv
EVAL_API_KEY=your-provider-key
EVAL_API_URL=https://api.openai.com/v1/chat/completions
```

Start with Node's built-in environment loader:

```sh
node --env-file=.env.local scripts/serve.mjs
```

Set a valid model ID for each prompt in the app, save, then choose **Выполнить на моделях**. Requests incur your provider's charges. Both versions use the same provider/key. The runner sends each rendered template as a single user message, with provider defaults for sampling and output length. It does not use the Responses API, tools, multimodal input, or automatic LLM judging.

For PowerShell you can alternatively set `$env:EVAL_API_KEY` and `$env:EVAL_API_URL` before `npm start`. For a local compatible server, set `EVAL_ALLOW_HTTP=1` and an HTTP endpoint on `localhost` or `127.0.0.1`; otherwise HTTPS is required.

The runner binds only to loopback, validates Host/Origin, uses two concurrent requests, a 45-second per-request timeout and a 10-minute run budget. Maximum 50 tests per live run. Failed requests are retained explicitly. There are no automatic retries or cancellation UI; keep the tab open. Provider behavior is tested with a mock; no paid external calls were made during development.

## Persistence and privacy

Workspace data stays in this browser and origin under `evalbench.workspace.v1`. There is no cloud database or team sync. Different domains, browsers, incognito sessions and devices have separate workspaces. Clearing browser storage removes data; export backups regularly. Storage errors produce a visible warning. Workspace import explicitly confirms replacement and offers an export first. Avoid confidential material on shared devices. Treat imported responses as text; they are escaped before rendering. CSV export guards against leading spreadsheet formula characters.

## Deploy to GitHub Pages

`dist/` is a self-contained static site using relative asset paths. The repository includes `.github/workflows/evalbench-pages.yml`, which checks tests and publishes this directory after pushes to `main`.

GitHub Pages is already enabled in this repository. Both the validation and deployment jobs succeeded. The root URL works for the existing branch-based Pages build (redirect to the subproject) and for the included static deployment workflow (app at root). If moving to a new repository, an administrator must enable Pages first; the default `GITHUB_TOKEN` cannot enable it. The local runner cannot execute on GitHub Pages.

The root `index.html` links/redirects to `evalbench/dist/` for branch-based Pages hosting as well. Do not assume Pages is live until a deployment succeeds.

## For coding agents

Read `AGENTS.md` and `ARCHITECTURE.md`. Run `npm test` and `npm run check` from `evalbench/`. All application code, examples and tests are plain-text files committed to GitHub. No generated bundle hides source code. Preserve workspace format version 1 or add an explicit migration when changing persisted data.

### Validation

17 Node tests cover grading, regressions, incomplete coverage, data import, CSV export, local server origin checks and mocked A/B execution. Syntax checks pass. The managed local preview failed to mount `/proc`. After GitHub Pages deployed successfully, browser QA verified the actual deployed UI: overview, two-regression filter, per-case rule/answer dialog, blind review, persistence of a vote after reload, and prompt saving. Paid provider execution was not tested; the runner uses mocked provider tests.


See [VERIFICATION.md](VERIFICATION.md) for the independent eight-case pipeline, expected/observed results and explicit unverified areas. Reproducible input files are in `examples/verification-*.json`.
