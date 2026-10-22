import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database } from './db-helper.mjs';
import { handleApi } from '../server/api.mjs';
import { stats, gate } from '../web/core.js';
const req = (path, method = 'GET', data) => new Request('https://eval.test/api' + path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
async function call(env, path, method, data, fetchImpl) { const r = await handleApi(req(path, method, data), env, { fetchImpl }); return { status: r.status, ...await r.json() }; }
const cases = [{ id: 'one', vars: { q: 'Reply yes' }, reference: 'yes', rules: [{ type: 'exact', value: 'yes' }], tags: ['smoke'] }], prompts = { a: { name: 'A', model: 'model-a', system: 'System', user: '{{q}}', examples: [{ user: 'Hi', assistant: 'Hello' }], params: { temperature: 0 }, maxTokens: 64 }, b: { name: 'B', model: 'model-b', user: '{{q}}', maxTokens: 64 } };
const judge = { enabled: true, model: 'judge', maxTokens: 512, criteria: [{ id: 'correct', name: 'Correct', description: 'Must be correct', weight: 1 }] };
const response = text => Response.json({ id: 'response-1', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
async function finish(env, id, fetchImpl) { for (let i = 0; i < 300; i++) {
    const r = await call(env, '/runs/' + id + '/advance', 'POST', {}, fetchImpl);
    assert.equal(r.status, 200, JSON.stringify(r));
    if (r.run.status !== 'running')
        return r.run;
} throw Error('Queue did not finish'); }
test('encrypted provider key, no key disclosure, real adapter connection test, immutable versions and prompt snapshots', async () => {
    const DB = database(), env = { DB, EVAL_VAULT_KEY: 'a'.repeat(64) };
    try {
        let r = await call(env, '/provider', 'POST', { endpoint: 'https://provider.example/chat', defaultModel: 'model-a', key: 'private-test-secret', pricing: { 'model-a': { input: 1, output: 2 } } });
        assert.equal(r.status, 200);
        assert.equal(r.provider.configured, true);
        assert.doesNotMatch(JSON.stringify(r), /private-test-secret/);
        const row = DB.sql.prepare("SELECT * FROM eval_settings WHERE id='provider'").get();
        assert.doesNotMatch(row.secret, /private-test-secret/);
        assert.equal(row.secret.split('.').length, 2);
        r = await call(env, '/provider/test', 'POST', {}, async (url, init) => { assert.equal(init.headers.Authorization, 'Bearer private-test-secret'); return response('OK'); });
        assert.equal(r.ok, true);
        assert.equal(r.result.usage.total_tokens, 15);
        const a = (await call(env, '/assets', 'POST', { kind: 'dataset', name: 'Dataset', content: cases })).asset;
        const b = (await call(env, '/assets', 'POST', { kind: 'dataset', familyId: a.familyId, name: 'Dataset', content: [{ ...cases[0], title: 'Changed' }] })).asset;
        assert.equal(a.version, 1);
        assert.equal(b.version, 2);
        assert.equal((await call(env, '/assets')).assets.find(x => x.id === a.id).content[0].title, 'one');
        const bad = await call(env, '/runs', 'POST', { id: crypto.randomUUID(), provider: 'model', cases, prompts, assetRefs: { dataset: b.id } });
        assert.equal(bad.status, 400);
        const id = crypto.randomUUID();
        r = await call(env, '/runs', 'POST', { id, provider: 'model', cases, prompts, assetRefs: { dataset: a.id } });
        assert.equal(r.status, 201);
        assert.equal(r.run.prompts.a.examples[0].assistant, 'Hello');
        assert.equal(r.run.pricing['model-a'].output, 2);
        await call(env, '/provider', 'POST', { endpoint: 'https://other.example/chat', defaultModel: 'different', pricing: {} });
        r = await call(env, '/runs/' + id + '/advance', 'POST', {}, async () => { throw Error('Do not forward a key to a previous provider endpoint'); });
        assert.equal(r.status, 409);
        await call(env, '/provider', 'POST', { endpoint: 'https://provider.example/chat', pricing: {} });
        r = await call(env, '/runs/' + id + '/advance', 'POST', {}, async (url, init) => { assert.equal(String(url), 'https://provider.example/chat'); assert.equal(init.headers.Authorization, 'Bearer private-test-secret'); assert.equal(JSON.parse(init.body).messages.length, 4); return response('yes'); });
        assert.equal(r.status, 200);
        const exported = await (await handleApi(req('/runs/' + id + '/export?format=bundle'), env)).text();
        assert.doesNotMatch(exported, /private-test-secret|EVAL_VAULT_KEY/);
        assert.equal((await call(env, '/provider', 'POST', { endpoint: 'http://localhost/chat', pricing: {} })).status, 400);
    }
    finally {
        DB.close();
    }
});
test('synthetic 2-repeat generation + judge pipeline persists every task, pause/resume, review calibration, suites and bundle round trip', async () => {
    const DB = database(), env = { DB };
    try {
        const id = crypto.randomUUID();
        let r = await call(env, '/runs', 'POST', { id, provider: 'synthetic', judge, repeats: 2, concurrency: 3 });
        assert.equal(r.status, 201);
        assert.equal(r.run.progress.total, 64);
        await call(env, '/runs/' + id + '/advance', 'POST', {});
        r = await call(env, '/runs/' + id);
        assert.equal(r.run.progress.done, 1);
        assert.equal(gate(r.run).state, 'pending');
        await call(env, '/runs/' + id + '/control', 'POST', { action: 'pause' });
        r = await call(env, '/runs/' + id + '/advance', 'POST', {});
        assert.equal(r.run.progress.done, 1);
        assert.equal(r.run.status, 'paused');
        await call(env, '/runs/' + id + '/control', 'POST', { action: 'resume' });
        const completed = await finish(env, id);
        assert.equal(completed.progress.done, 64);
        assert.equal(stats(completed, 'a').passed, 8);
        assert.equal(stats(completed, 'b').passed, 10);
        assert.equal(gate(completed, 60).regressions, 2);
        assert.equal(completed.judgments[1].regress_exact.a.synthetic, true);
        await call(env, '/runs/' + id, 'PATCH', { caseId: 'regress_exact', review: { winner: 'a', rating: 3, note: 'Exact casing' } });
        const suite = (await call(env, '/runs/' + id + '/regressions', 'POST', { caseId: 'regress_exact', name: 'Critical regressions' })).asset;
        assert.equal(suite.content.length, 1);
        const v2 = (await call(env, '/runs/' + id + '/regressions', 'POST', { caseId: 'regress_contains', familyId: suite.familyId })).asset;
        assert.equal(v2.version, 2);
        assert.equal(v2.content.length, 2);
        const bundle = await (await handleApi(req('/runs/' + id + '/export?format=bundle'), env)).json();
        const imported = await call(env, '/runs', 'POST', { id: crypto.randomUUID(), bundle });
        assert.equal(imported.status, 201, JSON.stringify(imported));
        assert.equal(imported.run.progress.done, 64);
        assert.equal(stats(imported.run, 'b').rate, .625);
        assert.equal(imported.run.reviews.regress_exact.rating, 3);
        assert.deepEqual(imported.run.judgments, bundle.run.judgments);
        const jsonl = await (await handleApi(req('/runs/' + id + '/export?format=jsonl'), env)).text();
        assert.equal(jsonl.trim().split('\n').length, 32);
        assert.equal(JSON.parse(jsonl.split('\n')[0]).judgment.criteria.length, 1);
        const cmp = await call(env, '/compare', 'POST', { baseline: id, candidate: imported.run.id });
        assert.equal(cmp.comparison.paired, 8);
        assert.equal(cmp.comparison.delta, 0);
    }
    finally {
        DB.close();
    }
});
test('provider errors and invalid judge output retry only failed tasks; successful generations are never sent again', async () => {
    const DB = database(), env = { DB, EVAL_API_KEY: 'secret', EVAL_API_URL: 'https://provider.example/chat' };
    let bFail = true, judgeBad = true;
    const sent = [];
    const fetchImpl = async (url, init) => { const body = JSON.parse(init.body); sent.push(body.model); if (body.model === 'model-b' && bFail)
        return new Response('sensitive', { status: 429 }); if (body.model === 'judge') {
        assert.match(body.messages[0].content, /untrusted/);
        return response(judgeBad ? 'not JSON' : '{"criteria":[{"id":"correct","score":4,"reason":"Answer equals reference"}]}');
    } return response('yes'); };
    try {
        const id = crypto.randomUUID();
        assert.equal((await call(env, '/runs', 'POST', { id, provider: 'model', cases, prompts, judge })).status, 201);
        let r = await finish(env, id, fetchImpl);
        assert.equal(r.progress.errors, 3);
        assert.equal(gate(r, 0).state, 'pending');
        assert.equal(sent.filter(x => x === 'model-a').length, 1);
        assert.equal(sent.filter(x => x === 'judge').length, 1);
        bFail = false;
        judgeBad = false;
        await call(env, '/runs/' + id + '/control', 'POST', { action: 'retry-errors' });
        r = await finish(env, id, fetchImpl);
        assert.equal(r.progress.errors, 0);
        assert.equal(gate(r, 0).state, 'pass');
        assert.equal(sent.filter(x => x === 'model-a').length, 1);
        assert.equal(sent.filter(x => x === 'model-b').length, 2);
        assert.equal(sent.filter(x => x === 'judge').length, 3);
    }
    finally {
        DB.close();
    }
});
test('concurrent advances enforce server concurrency, strict request cap and monetary reservations without overspend', async () => {
    const DB = database(), env = { DB, EVAL_API_KEY: 'secret' };
    try {
        const id = crypto.randomUUID();
        await call(env, '/runs', 'POST', { id, provider: 'model', cases, prompts, concurrency: 1, maxRequests: 1 });
        let release, entered;
        const ready = new Promise(r => entered = r);
        const first = call(env, '/runs/' + id + '/advance', 'POST', {}, async () => { entered(); await new Promise(r => release = r); return response('yes'); });
        await ready;
        const second = await call(env, '/runs/' + id + '/advance', 'POST', {}, async () => { throw Error('Must not be called'); });
        assert.equal(second.run.progress.running, 1);
        assert.equal(second.run.billing.attempts, 1);
        release();
        await first;
        let r = await call(env, '/runs/' + id + '/advance', 'POST', {}, async () => { throw Error('Cap'); });
        assert.equal(r.run.status, 'paused');
        assert.equal(r.run.billing.attempts, 1);
        assert.match(r.run.stopReason, /лимит запросов/);
        const pricing = { 'model-a': { input: 1, output: 1 }, 'model-b': { input: 1, output: 1 } };
        const config = { provider: 'model', cases, prompts, pricing, concurrency: 2 };
        const estimate = (await call(env, '/estimate', 'POST', config)).estimate;
        const next = crypto.randomUUID();
        await call(env, '/runs', 'POST', { ...config, id: next, budgetUsd: estimate.reservedUsd * .6 });
        let calls = 0;
        r = await finish(env, next, async () => { calls++; return Response.json({ choices: [{ message: { content: 'yes' } }] }); });
        assert.equal(calls, 1);
        assert.equal(r.status, 'paused');
        assert.ok(r.billing.committedUsd <= r.budgetUsd);
        assert.ok(r.billing.heldUsd > 0);
    }
    finally {
        DB.close();
    }
});
test('cancel/resume keeps successful answers; expired calls become explicit errors and retain budget reservations', async () => {
    const DB = database(), env = { DB, EVAL_API_KEY: 'secret' };
    try {
        const id = crypto.randomUUID();
        await call(env, '/runs', 'POST', { id, provider: 'synthetic' });
        await call(env, '/runs/' + id + '/advance', 'POST', {});
        let r = await call(env, '/runs/' + id + '/control', 'POST', { action: 'cancel' });
        assert.equal(r.run.progress.done, 1);
        assert.equal(r.run.progress.cancelled, 15);
        await call(env, '/runs/' + id + '/control', 'POST', { action: 'resume' });
        r = await call(env, '/runs/' + id + '/advance', 'POST', {});
        assert.equal(r.run.progress.done, 2);
        DB.sql.prepare("UPDATE eval_tasks SET state='running',lease_until=1,attempt=1 WHERE run_id=? AND ordinal=2").run(id);
        r = await call(env, '/runs/' + id + '/advance', 'POST', {});
        assert.equal(r.run.progress.errors, 1);
        assert.match(r.run.tasks.find(t => t.error).error, /результат неизвестен/);
    }
    finally {
        DB.close();
    }
});
