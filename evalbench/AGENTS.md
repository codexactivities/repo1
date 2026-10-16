# EvalBench contributor instructions

- App root is `evalbench/` in GitHub. Read README.md and ARCHITECTURE.md.
- Node 22+, ESM, no external runtime dependencies. `npm start`, `npm test`, `npm run check`.
- Static source and deployment output live in `dist/`. There is no generated build step.
- Keep core grading in `dist/core.js` pure and independently testable. UI in `dist/app.js`, styling in `dist/style.css`.
- Keep API keys on the local server only. Never put keys into frontend code, localStorage, fixtures, reports, or Git.
- Escape user content with `esc()` before inserting HTML. Don't add HTML rendering for model responses.
- Missing, errored or ungraded answers must not pass the release gate. Rates must not conceal coverage.
- Keep historical cases/prompts as immutable snapshots; current editors must not mutate them.
- Persisted workspace format is version 1. Provide migration if schema changes.
- GitHub Pages uses relative static asset paths. Only the local Node server supports `/api/run`.
- Add meaningful tests for evaluation, import or server behavior changes. Do not add dependencies merely for presentation changes.
- Run tests and syntax checks before committing. Do not claim browser QA without an actual successful browser run.
