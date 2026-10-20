import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeServer } from '../scripts/serve.mjs';
import { validateCases, normalizeResults, evaluate, stats, transition, gate, csv } from '../web/core.js';

const fixture = JSON.parse(await readFile(new URL('../examples/verification.json', import.meta.url)));
const cases = validateCases(fixture.cases);

async function execute({ failId } = {}) {
  const calls = [];
  const server = makeServer({
    key: 'synthetic-key-not-a-real-secret',
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      const [side, id, question] = request.messages[0].content.split('\n');
      assert.equal(question, `Question ${id}`);
      assert.equal(request.model, `synthetic-${side}`);
      calls.push({ side, id });
      if (side === 'b' && id === failId) return new Response('provider-private-details', { status: 429 });
      const answer = fixture.responses.find(row => row.id === id)[side].text;
      return new Response(JSON.stringify({ choices: [{ message: { content: answer } }] }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cases, prompts: fixture.prompts })
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(calls.length, 16, '8 cases must each produce A and B requests');
    assert.equal(new Set(calls.map(x => `${x.id}:${x.side}`)).size, 16);
    return { cases: structuredClone(cases), prompts: structuredClone(fixture.prompts), results: normalizeResults(payload, cases), reviews: {} };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('independent 8-case pipeline: HTTP runner → response import → grading → JSON round-trip → CSV', async () => {
  const run = await execute();
  assert.equal(stats(run, 'a').passed, 4);
  assert.equal(stats(run, 'a').rate, 0.5);
  assert.equal(stats(run, 'b').passed, 5);
  assert.equal(stats(run, 'b').rate, 0.625);
  assert.equal(stats(run, 'b').done, 8);
  assert.deepEqual(run.cases.map(c => transition(run, c)), fixture.expectedTransitions);
  assert.deepEqual(gate(run, 60), { state: 'fail', label: 'Нужна доработка', regressions: 2 });
  run.reviews.regress_exact = { winner: 'a', note: 'Точное совпадение нарушено' };
  const archived = JSON.stringify(run);
  assert.doesNotMatch(archived, /synthetic-key-not-a-real-secret/);
  const restored = JSON.parse(archived);
  restored.results = normalizeResults(Object.entries(restored.results).map(([id, result]) => ({ id, ...result })), restored.cases);
  assert.equal(stats(restored, 'b').rate, 0.625);
  assert.deepEqual(restored.reviews.regress_exact, run.reviews.regress_exact);
  const exported = csv([
    ['id', 'a_pass', 'b_pass', 'transition'],
    ...restored.cases.map(c => [c.id,
      evaluate(restored.results[c.id]?.a?.text,c.rules).pass, evaluate(restored.results[c.id]?.b?.text,c.rules).pass, transition(restored, c)])
  ]);
  assert.equal(exported.split('\r\n').length, 9);
  assert.ok(exported.includes('"regress_exact","true","false","regression"'));
  assert.ok(exported.includes('"improve_json","false","true","improvement"'));
});

test('a provider error remains an error through import and blocks release; no response is fabricated', async () => {
  const run = await execute({ failId: 'regress_contains' });
  assert.equal(run.results.regress_contains.b.error, 'Provider HTTP 429');
  assert.equal(run.results.regress_contains.b.text, undefined);
  assert.equal(stats(run, 'b').done, 7);
  assert.equal(stats(run, 'b').graded, 7);
  assert.equal(gate(run, 0).state, 'pending');
});

test('release gate passes a complete corrected candidate and rejects a missing baseline', () => {
  const run = { cases, prompts: fixture.prompts, results: normalizeResults(fixture.correctedResponses, cases) };
  assert.equal(stats(run, 'b').rate, 1);
  assert.deepEqual(gate(run, 100), { state: 'pass', label: 'Можно выпускать', regressions: 0 });
  delete run.results.improve_contains.a;
  assert.equal(gate(run, 100).state, 'pending');
});
