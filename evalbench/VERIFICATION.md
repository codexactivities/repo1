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
