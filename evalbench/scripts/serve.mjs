import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { validateCases, template } from '../web/core.js';
const root = fileURLToPath(new URL('../web/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
export function makeServer({ key = process.env.EVAL_API_KEY, endpoint = process.env.EVAL_API_URL || 'https://api.openai.com/v1/chat/completions', fetchImpl = fetch, allowHttp = process.env.EVAL_ALLOW_HTTP === '1' } = {}) {
    let running = false;
    const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    return http.createServer(async (req, res) => {
        try {
            const host = req.headers.host || '';
            if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host))
                return send(res, 403, { error: 'Local requests only' });
            if (req.headers.origin && ![`http://${host}`].includes(req.headers.origin))
                return send(res, 403, { error: 'Cross-origin requests are not allowed' });
            const path = new URL(req.url, `http://${host}`).pathname;
            if (path === '/api/health' && req.method === 'GET')
                return send(res, 200, { configured: Boolean(key) });
            if (path === '/api/run' && req.method === 'POST') {
                if (!req.headers['content-type']?.startsWith('application/json'))
                    return send(res, 415, { error: 'Use application/json' });
                if (!key)
                    return send(res, 503, { error: 'Set EVAL_API_KEY on the local server.' });
                if (running)
                    return send(res, 409, { error: 'A run is already in progress.' });
                let body = '';
                for await (const chunk of req) {
                    body += chunk.toString();
                    if (Buffer.byteLength(body) > 1000000)
                        return send(res, 413, { error: 'Request too large' });
                }
                let data;
                try {
                    data = JSON.parse(body);
                }
                catch {
                    return send(res, 400, { error: 'Invalid JSON' });
                }
                let cases;
                try {
                    cases = validateCases(data.cases);
                    if (cases.length > 50)
                        throw Error('Maximum 50 cases per run.');
                    for (const s of ['a', 'b']) {
                        const p = data.prompts?.[s];
                        if (typeof p?.text !== 'string' || p.text.length > 50000 || typeof p.model !== 'string' || !p.model.trim())
                            throw Error('Both prompt templates and model IDs are required.');
                        for (const c of cases) {
                            const missing = [...p.text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].filter(m => !Object.hasOwn(c.vars, m[1]));
                            if (missing.length)
                                throw Error(`${c.id}: missing variable ${missing[0][1]}`);
                        }
                    }
                }
                catch (e) {
                    return send(res, 400, { error: e.message });
                }
                let url;
                try {
                    url = new URL(endpoint);
                    if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
                        throw Error();
                }
                catch {
                    return send(res, 500, { error: 'EVAL_API_URL must be HTTPS (or explicitly allowed loopback HTTP).' });
                }
                running = true;
                try {
                    const results = cases.map(c => ({ id: c.id })), tasks = cases.flatMap((c, i) => ['a', 'b'].map(side => ({ c, i, side })));
                    let cursor = 0;
                    const deadline = Date.now() + 600000;
                    const worker = async () => { while (cursor < tasks.length) {
                        const { c, i, side } = tasks[cursor++], p = data.prompts[side];
                        const start = performance.now();
                        try {
                            if (Date.now() > deadline)
                                throw Error('Run time budget exceeded');
                            const response = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: template(p.text, c.vars) }], stream: false }), signal: AbortSignal.timeout(Math.min(45000, Math.max(1, deadline - Date.now()))) });
                            if (!response.ok)
                                throw Error(`Provider HTTP ${response.status}`);
                            const result = await response.json(), text = result.choices?.[0]?.message?.content;
                            if (typeof text !== 'string')
                                throw Error('Provider returned no text content');
                            if (text.length > 200000)
                                throw Error('Response exceeds 200000 characters');
                            results[i][side] = { text, latencyMs: Math.round(performance.now() - start) };
                        }
                        catch (e) {
                            results[i][side] = { error: e.name === 'TimeoutError' ? 'Provider request timed out' : e.message.startsWith('Provider') || e.message === 'Run time budget exceeded' || e.message.startsWith('Response exceeds') ? e.message : 'Provider request failed' };
                        }
                    } };
                    await Promise.all([worker(), worker()]);
                    return send(res, 200, { results });
                }
                finally {
                    running = false;
                }
            }
            if (path.startsWith('/api/'))
                return send(res, 404, { error: 'Unknown endpoint' });
            if (!['GET', 'HEAD'].includes(req.method))
                return send(res, 405, { error: 'Method not allowed' });
            const full = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
            if (!full.startsWith(root.endsWith(sep) ? root : root + sep))
                return send(res, 403, { error: 'Forbidden' });
            let content;
            try {
                content = await readFile(full);
            }
            catch {
                return send(res, 404, { error: 'Not found' });
            }
            res.writeHead(200, { 'Content-Type': mime[extname(full)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'", 'Cache-Control': 'no-store' });
            res.end(req.method === 'HEAD' ? undefined : content);
        }
        catch {
            if (!res.headersSent)
                send(res, 500, { error: 'Request failed' });
            else
                res.end();
        }
    });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const port = Number(process.env.PORT || 3000);
    makeServer().listen(port, '127.0.0.1', () => console.log(`EvalBench: http://127.0.0.1:${port} · API ${process.env.EVAL_API_KEY ? 'configured' : 'not configured'}`));
}
