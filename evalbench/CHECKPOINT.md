# Resume checkpoint · 2026-10-22

Work was paused at the user's request so they could switch off their computer. Do not continue until asked.

## Saved work

- All 10 roadmap areas implemented, including LLM-as-a-judge. See README.md and ARCHITECTURE.md.
- 36/36 automated tests, syntax checks, TypeScript and maintained production build passed.
- Browser QA: actual 64-task synthetic run completed (8 cases × A/B × 2 repeats × generation/judge), A 50%, B 62.5%, two regressions. Dataset CSV import/edit/versioning, prompt preview, judge rubric, review, comparison and regression-suite creation checked.
- Source is already durably saved in Sites commit 9cb1cd50963636e5a92d0dbacb1e9d744351033a.
- Private deployment succeeded: appgdep_6ad96e3a5dc4819193d6472b8723cfe4.
- Site project: appgprj_6ad1f3c3cdec8191b0dea91018a0e481.
- Site URL: https://evalbench-prompt-lab.dot-punks-gp-9267.chatgpt.site
- Version: appgprj_6ad1f3c3cdec8191b0dea91018a0e481~appgver_a60550dbc0108191b153ba409733617b.
- D1 migration 0001_complex_microbe.sql deployed; existing v2 data preserved.
- Runtime vault master key is configured as a Sites secret. Never rotate it casually or print it. No actual provider API key is connected.

## Where work stopped

Production acceptance was in progress on synthetic run 211b4754-f37c-4184-ae51-0dde1e06a144 (64 tasks). Client was stopped and a server pause requested. Inspect this run before resuming; completed answers are persisted. Production acceptance has NOT yet been declared successful. No real external LLM call was made.

## Remaining when user resumes

1. Open the existing Site using its source helper and fresh write credential; preserve private audience and runtime vault secret.
2. Inspect/resume the above production synthetic run. Verify 64/64 tasks, A .5 / B .625, two regressions, saved judge results in both repeats, review/calibration, suite versioning, bundle import round-trip, paired comparison, JSONL/CSV, archive/restore. Do not duplicate successful tasks.
3. Update VERIFICATION.md with production evidence. The test helper from the paused session, if scratch survives, is /workspace/scratch/99c50cf2f2f3/verify-hosted-v3.mjs; it reads private Sites access only from hidden stdin. Do not store a token in Git or files.
4. Check GitHub Actions for this checkpoint commit and resolve any actual CI issue. GitHub repo is codexactivities/repo1, app directory evalbench/.
5. Final user handoff with app/source links and honest synthetic-vs-real verification. A real provider pilot requires the user to connect their API key in the Provider screen.

Local checkout, if retained: /workspace/sites/evalbench. Code and documentation in GitHub are authoritative if local scratch is gone.

## Result received while stopping

The production acceptance process had already exited with a failed assertion: `7 !== 0` (expected zero task errors). Do not mark production acceptance passed. Inspect the persisted task errors in run 211b4754-f37c-4184-ae51-0dde1e06a144 before retrying. A possible concurrency issue to investigate: advance loads the run before atomically claiming a judge task; a generation completed by another client between these steps may be absent from that in-memory snapshot. This is a hypothesis, not yet verified. Fix and add a meaningful concurrent integration test when work resumes, then repeat acceptance. No further implementation was performed after the user requested the pause.
