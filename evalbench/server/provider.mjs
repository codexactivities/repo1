import { messages, judgeMessages, parseJudgment } from '../web/lab.js';
const encoder = new TextEncoder();
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => Uint8Array.from(s.match(/../g) || [], x => parseInt(x, 16));
async function vaultKey(env) { if (!/^[a-f0-9]{64}$/i.test(env.EVAL_VAULT_KEY || ''))
    throw Error('Хранилище ключей не настроено на сервере.'); return crypto.subtle.importKey('raw', unhex(env.EVAL_VAULT_KEY), 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function encryptKey(value, env) { const iv = crypto.getRandomValues(new Uint8Array(12)); const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('evalbench.provider.v1') }, await vaultKey(env), encoder.encode(value)); return hex(iv) + '.' + hex(new Uint8Array(data)); }
async function decryptKey(value, env) { const [iv, data] = value.split('.'); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(iv), additionalData: encoder.encode('evalbench.provider.v1') }, await vaultKey(env), unhex(data))); }
export function validateProvider(data) {
    const endpoint = String(data.endpoint || 'https://api.openai.com/v1/chat/completions');
    let u;
    try {
        u = new URL(endpoint);
    }
    catch {
        throw Error('Неверный URL провайдера.');
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || /^(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(u.hostname))
        throw Error('Нужен внешний HTTPS URL без логина, query и фрагмента.');
    const defaultModel = String(data.defaultModel || '').trim();
    if (defaultModel.length > 256)
        throw Error('Слишком длинное имя модели.');
    const pricing = Object.create(null);
    for (const [model, p] of Object.entries(data.pricing || {})) {
        if (model.length > 256 || !p || !Number.isFinite(p.input) || p.input < 0 || !Number.isFinite(p.output) || p.output < 0 || p.input > 100000 || p.output > 100000)
            throw Error('Тарифы: input/output в USD за 1M токенов, неотрицательные числа.');
        pricing[model] = { input: p.input, output: p.output };
    }
    return { endpoint: u.href, defaultModel, pricing, structuredOutput: !!data.structuredOutput };
}
export async function providerSettings(env, { secret = false } = {}) {
    const row = env.DB ? await env.DB.prepare("SELECT * FROM eval_settings WHERE id = 'provider'").first() : null;
    const config = row ? JSON.parse(row.value) : { endpoint: env.EVAL_API_URL || 'https://api.openai.com/v1/chat/completions', defaultModel: env.EVAL_MODEL || '', pricing: {}, structuredOutput: false };
    const configured = !!(row?.secret || env.EVAL_API_KEY);
    const result = { ...config, configured, vaultReady: !!env.EVAL_VAULT_KEY, keySource: row?.secret ? 'encrypted' : env.EVAL_API_KEY ? 'environment' : 'none' };
    if (secret)
        result.key = row?.secret ? await decryptKey(row.secret, env) : env.EVAL_API_KEY;
    return result;
}
export function priceUsage(usage, model, pricing) { const rate = pricing && Object.hasOwn(pricing,model) ? pricing[model] : null; if (!rate || !Number.isFinite(usage?.prompt_tokens) || !Number.isFinite(usage?.completion_tokens))
    return null; return (usage.prompt_tokens * rate.input + usage.completion_tokens * rate.output) / 1e6; }
export function estimateRequest(msg, maxTokens, model, pricing) {
    const chars = msg.reduce((s, m) => s + m.content.length, 0), bytes = msg.reduce((s, m) => s + encoder.encode(m.content).length, 0), rate = pricing && Object.hasOwn(pricing,model) ? pricing[model] : null;
    return { inputEstimate: Math.ceil(chars / 4) + msg.length * 8, outputLimit: maxTokens, reservedInput: bytes + msg.length * 1024 + 4096, cost: rate ? (Math.ceil(chars / 4) * rate.input + maxTokens * rate.output) / 1e6 : null, reserve: rate ? ((bytes + msg.length * 1024 + 4096) * rate.input + maxTokens * rate.output) / 1e6 : null };
}
export function taskEstimate(snapshot, c, side, kind) { const p = snapshot.prompts[side]; const msg = kind === 'judge' ? judgeMessages(snapshot.judge, c, p, { text: 'x'.repeat(p.maxTokens * 8) }) : messages(p, c); return estimateRequest(msg, kind === 'judge' ? snapshot.judge.maxTokens : p.maxTokens, kind === 'judge' ? snapshot.judge.model : p.model, snapshot.pricing); }
export function estimateRun(snapshot) { const items = []; for (const c of snapshot.cases)
    for (const side of ['a', 'b'])
        for (let i = 0; i < (snapshot.repeats || 1); i++)
            for (const kind of snapshot.judge?.enabled ? ['generation', 'judge'] : ['generation'])
                items.push(taskEstimate(snapshot, c, side, kind)); return { requests: items.length, inputTokensEstimate: items.reduce((s, x) => s + x.inputEstimate, 0), outputTokensLimit: items.reduce((s, x) => s + x.outputLimit, 0), estimatedUsd: items.every(x => x.cost !== null) ? items.reduce((s, x) => s + x.cost, 0) : null, reservedUsd: items.every(x => x.reserve !== null) ? items.reduce((s, x) => s + x.reserve, 0) : null, note: 'Токены входа — оценка по длине текста, выход — заданный максимум. Тарифы задаёт пользователь; резерв включает запас. Фактическая цена считается по usage, это не счёт провайдера.' }; }
export async function callModel({ model, messages: msg, maxTokens, params = {}, schema }, settings, fetchImpl) {
    const start = performance.now();
    try {
        const url = new URL(settings.endpoint);
        if (url.protocol !== 'https:' || url.username || url.password)
            return { error: 'Provider URL must use HTTPS without embedded credentials' };
        const response = await fetchImpl(url, { method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${settings.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: msg, max_completion_tokens: maxTokens, ...params, stream: false, ...(schema && settings.structuredOutput ? { response_format: { type: 'json_schema', json_schema: { name: 'eval_output', strict: true, schema } } } : {}) }), signal: AbortSignal.timeout(35000) });
        if (!response.ok)
            return { error: `Provider HTTP ${response.status}`, latencyMs: Math.round(performance.now() - start) };
        const raw = await response.text();
        if (raw.length > 1500000)
            return { error: 'Provider response too large' };
        const data = JSON.parse(raw), text = data.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || text.length > 200000)
            return { error: 'Provider returned no text content or response too large' };
        const result = { text, latencyMs: Math.round(performance.now() - start), model };
        if (typeof data.id === 'string')
            result.responseId = data.id.slice(0, 256);
        const finish = data.choices?.[0]?.finish_reason;
        if (typeof finish === 'string')
            result.finishReason = finish;
        if (data.usage && typeof data.usage === 'object')
            result.usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].filter(k => Number.isFinite(data.usage[k]) && data.usage[k] >= 0).map(k => [k, data.usage[k]]));
        const cost = priceUsage(result.usage, model, settings.pricing);
        if (cost !== null) {
            result.cost = cost;
            result.costSource = 'usage × configured rates';
        }
        if (finish === 'length')
            result.error = 'Ответ обрезан лимитом токенов.';
        return result;
    }
    catch (e) {
        return { error: e.name === 'TimeoutError' ? 'Provider request timed out' : 'Provider request failed', latencyMs: Math.round(performance.now() - start) };
    }
}
export async function executeTask(run, task, settings, fetchImpl, verification) {
    const c = run.cases.find(c => c.id === task.case_id), p = run.prompts[task.side];
    if (task.kind === 'judge') {
        const source = run.repetitions[task.repeat_no]?.[c.id]?.[task.side];
        if (!source || source.error)
            return { error: 'Judge пропущен: нет полного ответа модели.', skipped: true, cost: 0 };
        if (run.provider === 'synthetic') {
            const rulePass = (await import('../web/graders.js')).evaluateRules(source.text, c.rules, c).pass;
            return { ...parseJudgment(JSON.stringify({ criteria: run.judge.criteria.map(c => ({ id: c.id, score: rulePass ? 4 : 0, reason: 'Синтетический judge: оценка по независимому fixture; это не вызов LLM.' })) }), run.judge), synthetic: true, model: 'synthetic-judge', cost: 0, latencyMs: 0 };
        }
        const raw = await callModel({ model: run.judge.model, messages: judgeMessages(run.judge, c, p, source), maxTokens: run.judge.maxTokens, params: {} }, settings, fetchImpl);
        if (raw.error)
            return raw;
        try {
            return { ...raw, ...parseJudgment(raw.text, run.judge) };
        }
        catch (e) {
            return { ...raw, error: e.message };
        }
    }
    if (run.provider === 'synthetic') {
        const row = verification.responses.find(r => r.id === c.id);
        return row ? { text: row[task.side].text, latencyMs: 0, cost: 0, synthetic: true } : { error: 'Synthetic fixture mismatch' };
    }
    return callModel({ model: p.model, messages: messages(p, c), maxTokens: p.maxTokens, params: p.params, schema: p.schema }, settings, fetchImpl);
}
