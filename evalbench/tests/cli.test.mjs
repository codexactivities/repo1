import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { database } from './db-helper.mjs';
import { handleApi } from '../server/api.mjs';
async function cli(args, url) { return new Promise((resolve, reject) => { const p = spawn(process.execPath, ['cli/evalbench.mjs', ...args], { cwd: new URL('../', import.meta.url), env: { ...process.env, EVALBENCH_URL: url }, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = ''; p.stdout.on('data', b => out += b); p.stderr.on('data', b => err += b); p.on('error', reject); p.on('close', code => resolve({ code, out, err })); }); }
test('CLI drives the production API through HTTP, exports reproducible artifacts and returns CI failure for regressions', async () => {
    const DB = database(), env = { DB }, dir = await mkdtemp(join(tmpdir(), 'evalbench-cli-'));
    const server = http.createServer(async (req, res) => { try {
        const chunks = [];
        for await (const c of req)
            chunks.push(c);
        const data = Buffer.concat(chunks);
        const r = await handleApi(new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers, body: data.length ? data : undefined }), env);
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
    }
    catch (e) {
        res.writeHead(500);
        res.end(e.message);
    } });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port;
    try {
        const dry = await cli(['run', '--config', 'examples/experiment.json', '--synthetic', '--dry-run'], url);
        assert.equal(dry.code, 0, dry.err);
        assert.equal(JSON.parse(dry.out).preflight.requests, 64);
        const run = await cli(['run', '--config', 'examples/experiment.json', '--synthetic', '--out', dir], url);
        assert.equal(run.code, 0, run.err);
        const files = await readdir(dir);
        assert.equal(files.length, 3);
        const bundle = JSON.parse(await readFile(join(dir, files.find(f => f.endsWith('.bundle.json'))), 'utf8'));
        assert.equal(bundle.run.progress.done, 64);
        assert.equal(bundle.run.judge.enabled, true);
        const id = bundle.run.id;
        const comparison = await cli(['compare', '--baseline', id, '--candidate', id, '--baseline-side', 'a', '--candidate-side', 'b', '--fail-on-regression'], url);
        assert.equal(comparison.code, 1, comparison.err);
        assert.equal(JSON.parse(comparison.out).regressions.length, 2);
        const same = await cli(['compare', '--baseline', id, '--candidate', id, '--fail-on-regression'], url);
        assert.equal(same.code, 0, same.err);
        const exported = await cli(['export', '--run', id, '--format', 'jsonl'], url);
        assert.equal(exported.code, 0);
        assert.equal(exported.out.trim().split('\n').length, 32);
    }
    finally {
        await new Promise(r => server.close(r));
        DB.close();
        await rm(dir, { recursive: true });
    }
});
