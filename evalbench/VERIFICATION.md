# Functional verification — 2026-10-16

## What existed before this verification

The initial 14 tests covered automatic rules, dataset/response validation, missing answers, regressions, CSV escaping and a local HTTP runner using a mocked provider. Browser checks on GitHub Pages covered the demo overview, regression filter, answer/rule detail, blind voting, vote persistence after reload, and saving prompt/test edits.

This did not establish full end-to-end functionality with a real model provider. The hosted static app does not call a model API.

## Independent synthetic pipeline

Three integration tests were added in `tests/pipeline.test.mjs`. They use a new eight-case fixture in `examples/verification.json`, independent of the built-in twelve-case demo.

The first test sends a real HTTP request to the local app server. The server renders A/B prompts and invokes its provider adapter 16 times. Only the provider's response is mocked. Returned data goes through the application's actual `normalizeResults`, evaluation/statistics, release gate, JSON serialization/restoration, and CSV export functions.

| Check | Expected | Observed |
| --- | --- | --- |
| Provider-adapter calls | 16 unique A/B calls | 16 |
| Baseline pass count | 4/8 (50%) | 4/8 (50%) |
| Candidate pass count | 5/8 (62.5%) | 5/8 (62.5%) |
| Regressions | 2 | 2 |
| Gate with a 60% threshold | Blocked because of regressions | Blocked |
| JSON round-trip | Same scores and saved human vote | Preserved |
| CSV export | Header + eight result records | Nine records |
| Simulated provider HTTP 429 | Error, seven completed B answers, gate pending | Matched |
| Corrected candidate | 8/8, zero regressions, gate passes at 100% | Matched |
| Missing baseline answer | Gate pending | Matched |

Case-by-case outcomes:

| Case | A | B | Change |
| --- | --- | --- | --- |
| improve_contains | Fail | Pass | Improvement |
| regress_exact | Pass | Fail | Regression |
| stable_json | Pass | Pass | Pass |
| stable_fail | Fail | Fail | Failure |
| improve_length | Fail | Pass | Improvement |
| stable_contains | Pass | Pass | Pass |
| improve_json | Fail | Pass | Improvement |
| regress_contains | Pass | Fail | Regression |

Run from the `evalbench/` directory:

```sh
npm test
npm run check
```

Result: **17 tests passed**, syntax checks passed. No application behavior change was needed for these cases. An incorrect value in the newly prepared corrected-answer fixture was caught by the test and corrected; it was not an application bug.

## Reproduce in the UI

1. Import `examples/verification-dataset.json` on the dataset page.
2. Create a run and import `examples/verification-responses.json`.
3. Expect candidate success displayed as 63% (62.5% rounded), baseline 50%, delta +13 percentage points (12.5 rounded), two regressions, eight completed answers, blocked release.

## Explicit limits

- These pipeline tests are not browser automation of the file chooser. Full browser file-upload → export-download → file-reimport was not verified.
- No paid request to a real model/provider was made. HTTP 429 and response payloads were simulated at the provider adapter.
- The online version on GitHub Pages works with imported responses and manual judgments. Automatic generation requires the included local server plus a user-supplied provider API key.
- No LLM-as-judge, cloud database, team synchronization, or background model runs are implemented.

## Hosted runner update — 2026-10-20

EvalBench 2 adds an actual Worker API and D1 task persistence. `tests/hosted.test.mjs` applies the generated migration to an independent SQLite database and exercises the production handler.

- 21 tests pass, including the hosted queue, idempotent creation, parallel task claim, reopening from persisted state, summary grading, saved reviews, server JSON/CSV export, archive/restore, missing-key errors, cross-origin rejection and the model adapter.
- In the real browser against the supervised Worker/D1 preview, **Новый прогон → Проверить сервер на синтетике** created and executed 16 server tasks. The UI showed A 50%, B 63% (62.5% rounded), two regressions and 8/8 completed B answers.
- Both CSV and JSON were downloaded through their server endpoints in the browser. Reload restored the run.
- A separate one-case dataset was entered in the JSON editor. Pasted replies A=`NO`, B=`YES` were imported, saved in D1 and graded as A 0%, B 100%, zero regressions; the release gate passed.
- The browser exposed a preview compatibility bug (`crypto.randomUUID` unavailable on an HTTP origin). It was fixed using `crypto.getRandomValues`, with a regression test.

A real paid provider call still requires a server API key. None was available in this environment or the Site runtime at the start of this update. The synthetic server execution and mocked model adapter must not be described as a real LLM call.

### Production acceptance

The deployed private Worker and its real hosted D1 database were checked through authorized service access from a fresh HTTP client (not browser localStorage).

- URL: `https://evalbench-prompt-lab.dot-punks-gp-9267.chatgpt.site`
- Run: `889ea6e5-85ca-4aa2-9db5-79f86a4ea90a` (`Server acceptance · 2026-10-20`, explicitly synthetic).
- 16/16 tasks completed; A=50%, B=62.5%; two regressions.
- After the first task, a separate read recovered the saved partial run.
- Reviews persisted. JSON and CSV exports returned successfully; CSV contained one header and eight cases.
- Archive → archive list → restore retained all 16 saved responses.
- Export JSON SHA-256: `150325412f0c6f3bd3bf94b0c36ac9a992614273bddc5395559aeef6bbe009fe`.
- Provider configuration was explicitly checked: no real API key was configured, so no real model call is claimed.

Application deployment succeeded as Site version `appgver_2f8041d1a5ac8191971a6716dc1813c3` from source commit `f74a4e7840aa31f92f219154edf36231f1213beb`. The final GitHub commit additionally records this acceptance evidence.
