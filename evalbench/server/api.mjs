import { validateCases, normalizeResults, stats, gate, runCsv, uid } from '../web/core.js';
import { normalizePrompt, checkVariables, normalizeJudge, compareRuns, experimentBundle, parseJudgment } from '../web/lab.js';
import { stable } from '../web/graders.js';
import { providerSettings, validateProvider, encryptKey, estimateRun, taskEstimate, executeTask, callModel } from './provider.mjs';
import verification from '../examples/verification.json' with { type: 'json' };
const MAX_BODY = 4000000;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };
const valid = fn => { try {
    return fn();
}
catch (e) {
    fail(400, e.message);
} };
async function body(request) {
    if (!request.headers.get('content-type')?.startsWith('application/json'))
        fail(415, 'Ожидается application/json.');
    if (Number(request.headers.get('content-length')) > MAX_BODY)
        fail(413, 'Запрос больше 4 МБ.');
    const reader = request.body?.getReader();
    if (!reader)
        fail(400, 'Пустой запрос.');
    let size = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.length;
        if (size > MAX_BODY) {
            await reader.cancel();
            fail(413, 'Запрос больше 4 МБ.');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const x of chunks) {
        bytes.set(x, offset);
        offset += x.length;
    }
    return valid(() => JSON.parse(new TextDecoder().decode(bytes)));
}
function integer(value, min, max, label) { if (!Number.isInteger(value) || value < min || value > max)
    fail(400, `${label}: целое от ${min} до ${max}.`); return value; }
function budget(value) { if (value == null || value === '')
    return null; if (!Number.isFinite(value) || value <= 0 || value > 10000)
    fail(400, 'Бюджет: от 0 до 10 000 USD (не включая 0).'); return value; }
function snapshotFrom(data, settings) {
    const synthetic = data.provider === 'synthetic', cases = valid(() => validateCases(synthetic ? verification.cases : data.cases));
    if (data.provider === 'model' && cases.length > 100)
        fail(400, 'Модельный прогон: максимум 100 кейсов.');
    const prompts = {};
    for (const side of ['a', 'b']) {
        const input = synthetic ? verification.prompts[side] : data.prompts?.[side];
        prompts[side] = valid(() => normalizePrompt({ ...input, maxTokens: input?.maxTokens ?? data.maxTokens ?? 512 }, settings.defaultModel));
        valid(() => checkVariables(prompts[side], cases));
        if (data.provider === 'model' && !prompts[side].model)
            fail(400, 'Укажите модель A и B.');
    }
    const judge = valid(() => normalizeJudge(data.judge));
    if (judge.enabled && data.provider === 'model' && !judge.model)
        fail(400, 'Укажите модель judge.');
    const repeats = integer(data.repeats ?? 1, 1, 5, 'Повторы');
    const pricing = valid(() => validateProvider({ endpoint: settings.endpoint, pricing: data.pricing ?? settings.pricing })).pricing;
    const snapshot = { formatVersion: 3, name: String(data.name || 'Experiment').slice(0, 120), cases, prompts, provider: data.provider, maxTokens: data.maxTokens ?? 512, judge, repeats, pricing, providerEndpoint: settings.endpoint, providerStructuredOutput: settings.structuredOutput, assetRefs: data.assetRefs || {}, reviewScale: valid(() => reviewScale(data.reviewScale || ['Плохо', 'Частично', 'Хорошо', 'Отлично'])) };
    if (estimateRun(snapshot).requests > 2000)
        fail(400, 'Максимум 2000 задач в одном прогоне.');
    return snapshot;
}
function reviewScale(scale) { if (!Array.isArray(scale) || scale.length < 2 || scale.length > 7 || scale.some(s => typeof s !== 'string' || !s.trim() || s.length > 50))
    throw Error('Шкала: от 2 до 7 непустых названий до 50 символов.'); return scale; }
export async function loadRun(db, id, includeArchived = false) {
    const row = await db.prepare('SELECT * FROM eval_runs WHERE id = ?').bind(id).first();
    if (!row || (row.archived && !includeArchived))
        fail(404, 'Прогон не найден.');
    const tasks = (await db.prepare('SELECT * FROM eval_tasks WHERE run_id = ? ORDER BY ordinal').bind(id).all()).results, snapshot = JSON.parse(row.snapshot);
    const repetitions = Array.from({ length: snapshot.repeats || 1 }, () => ({})), judgments = Array.from({ length: snapshot.repeats || 1 }, () => ({}));
    for (const t of tasks) {
        if (t.state !== 'done' || !t.result)
            continue;
        const into = t.kind === 'judge' ? judgments : repetitions;
        into[t.repeat_no] ||= {};
        into[t.repeat_no][t.case_id] ||= {};
        into[t.repeat_no][t.case_id][t.side] = JSON.parse(t.result);
    }
    const done = tasks.filter(t => t.state === 'done').length, cancelled = tasks.filter(t => t.state === 'cancelled').length;
    const errors = tasks.filter(t => t.result && JSON.parse(t.result).error).length;
    const actual = tasks.filter(t => t.charged_cost != null).reduce((s, t) => s + t.charged_cost, 0), prior = tasks.reduce((s, t) => s + t.prior_cost, 0);
    const held = tasks.filter(t => t.charged_cost == null && (t.state === 'done' || t.state === 'running')).reduce((s, t) => s + (t.reserve_cost || 0), 0);
    return { ...snapshot, id, createdAt: row.created_at, updatedAt: row.updated_at, provider: row.provider, demo: row.provider === 'synthetic', cloud: true, archived: !!row.archived,
        status: row.control === 'cancelled' ? 'cancelled' : done === tasks.length ? 'completed' : row.control === 'paused' ? 'paused' : 'running', stopReason: row.stop_reason, concurrency: row.concurrency, budgetUsd: row.budget_usd, maxRequests: row.max_requests,
        progress: { done, total: tasks.length, cancelled, errors, running: tasks.filter(t => t.state === 'running').length, pending: tasks.filter(t => t.state === 'pending').length },
        billing: { knownUsd: actual, priorReservedUsd: prior, heldUsd: held, committedUsd: actual + prior + held, attempts: tasks.reduce((s, t) => s + t.attempt, 0), unknown: tasks.filter(t => t.state === 'done' && t.charged_cost == null && !(t.result && JSON.parse(t.result).skipped)).length },
        results: repetitions[0], repetitions, judgments, reviews: JSON.parse(row.reviews),
        tasks: tasks.map(t => ({ id: t.id, caseId: t.case_id, side: t.side, repeat: t.repeat_no, kind: t.kind, state: t.state, attempt: t.attempt, error: t.result ? JSON.parse(t.result).error || null : null })),
    };
}
function assetContent(kind, content) { if (['dataset', 'suite'].includes(kind))
    return valid(() => validateCases(content)); if (kind === 'prompt')
    return valid(() => normalizePrompt(content)); if (kind === 'rubric')
    return valid(() => normalizeJudge(content)); fail(400, 'Тип версии: dataset / prompt / rubric / suite.'); }
async function saveAsset(db, data) {
    const kind = data.kind, content = assetContent(kind, data.content), familyId = data.familyId || uid();
    if (!/^[a-f0-9-]{36}$/i.test(familyId))
        fail(400, 'Нужен UUID семейства версий.');
    if (data.familyId) {
        const prev = await db.prepare('SELECT kind FROM eval_assets WHERE family_id = ? LIMIT 1').bind(familyId).first();
        if (!prev || prev.kind !== kind)
            fail(400, 'Семейство версии не найдено или другого типа.');
    }
    const id = uid(), name = String(data.name || 'Untitled').slice(0, 120), now = new Date().toISOString();
    await db.prepare('INSERT INTO eval_assets (id, family_id, kind, name, version, content, created_at) SELECT ?, ?, ?, ?, COALESCE(MAX(version),0)+1, ?, ? FROM eval_assets WHERE family_id = ?').bind(id, familyId, kind, name, JSON.stringify(content), now, familyId).run();
    return { id, familyId, kind, name, version: (await db.prepare('SELECT version FROM eval_assets WHERE id = ?').bind(id).first()).version, content, createdAt: now };
}
async function advance(db, id, env, fetchImpl) {
    let run = await loadRun(db, id);
    if (run.status !== 'running')
        return { run };
    const settings = run.provider === 'model' ? await providerSettings(env, { secret: true }) : {};
    if (run.provider === 'model' && !settings.key)
        fail(503, 'API-ключ провайдера не настроен.');
    if (run.provider === 'model' && run.providerEndpoint && run.providerEndpoint !== settings.endpoint)
        fail(409, 'Endpoint провайдера изменён. Верните endpoint этого прогона или создайте новый эксперимент.');
    const now = Date.now();
    // Expired paid requests are ambiguous; retain their reservation and require an explicit retry.
    await db.prepare("UPDATE eval_tasks SET state='done', result=?, lease_until=0 WHERE run_id=? AND state='running' AND lease_until < ?").bind(JSON.stringify({ error: 'Прерванный запрос: результат неизвестен. Повтор может тарифицироваться снова.' }), id, now).run();
    const task = await db.prepare(`UPDATE eval_tasks SET state='running', lease_until=?, attempt=attempt+1 WHERE id=(
 SELECT t.id FROM eval_tasks t JOIN eval_runs r ON r.id=t.run_id
 WHERE t.run_id=? AND t.state='pending' AND r.control='active'
 AND (SELECT COUNT(*) FROM eval_tasks WHERE run_id=r.id AND state='running') < r.concurrency
 AND (SELECT COALESCE(SUM(attempt),0) FROM eval_tasks WHERE run_id=r.id) < r.max_requests
 AND (r.budget_usd IS NULL OR (t.reserve_cost IS NOT NULL AND
 (SELECT COALESCE(SUM(prior_cost+CASE WHEN state IN ('done','running') THEN COALESCE(charged_cost,reserve_cost,0) ELSE 0 END),0) FROM eval_tasks WHERE run_id=r.id)+t.reserve_cost <= r.budget_usd))
 AND (t.kind='generation' OR EXISTS (SELECT 1 FROM eval_tasks g WHERE g.run_id=t.run_id AND g.case_id=t.case_id AND g.side=t.side AND g.repeat_no=t.repeat_no AND g.kind='generation' AND g.state='done'))
 ORDER BY t.ordinal LIMIT 1) RETURNING *`).bind(now + 90000, id).first();
    if (!task) {
        run = await loadRun(db, id);
        if (run.progress.pending && !run.progress.running) {
            await db.prepare("UPDATE eval_runs SET control='paused', stop_reason=? WHERE id=? AND control='active'").bind(run.billing.attempts >= run.maxRequests ? 'Достигнут лимит запросов.' : 'Бюджет не покрывает резерв следующей задачи. Увеличьте лимит или уменьшите объём.', id).run();
            run = await loadRun(db, id);
        }
        return { run, waiting: run.status === 'running' };
    }
    // Provider endpoint/pricing are snapshotted: changing settings cannot silently change an experiment.
    const result = await executeTask(run, task, { ...settings, endpoint: run.providerEndpoint || settings.endpoint, structuredOutput: run.providerStructuredOutput, pricing: run.pricing || settings.pricing }, fetchImpl, verification);
    await db.batch([db.prepare("UPDATE eval_tasks SET state='done', result=?, charged_cost=?, lease_until=0 WHERE id=? AND state='running' AND lease_until=?").bind(JSON.stringify(result), result.cost ?? null, task.id, now + 90000), db.prepare('UPDATE eval_runs SET updated_at=? WHERE id=?').bind(new Date().toISOString(), id)]);
    return { run: await loadRun(db, id) };
}
/** Shared single-owner workspace, protected by the preserved owner-private Sites boundary. */
export async function handleApi(request, env, { fetchImpl = fetch } = {}) {
    try {
        const url = new URL(request.url), path = url.pathname, method = request.method;
        if (!['GET', 'HEAD'].includes(method)) {
            const origin = request.headers.get('origin');
            if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')
                fail(403, 'Межсайтовый запрос запрещён.');
        }
        if (path === '/api/health' && method === 'GET') {
            const p = await providerSettings(env);
            return json({ version: 3, hosted: true, storage: !!env.DB, configured: p.configured, synthetic: true, maxCases: 100, defaultModel: p.defaultModel, vaultReady: p.vaultReady });
        }
        if (!env.DB)
            fail(503, 'Серверное хранилище не подключено.');
        const db = env.DB;
        if (path === '/api/provider') {
            if (method === 'GET')
                return json({ provider: await providerSettings(env) });
            if (method === 'POST') {
                const data = await body(request), config = valid(() => validateProvider(data)), row = await db.prepare("SELECT secret FROM eval_settings WHERE id='provider'").first();
                let secret = data.clearKey ? null : row?.secret || null;
                if (data.key) {
                    if (typeof data.key !== 'string' || data.key.length < 8 || data.key.length > 4096)
                        fail(400, 'Ключ должен содержать от 8 до 4096 символов.');
                    if (!env.EVAL_VAULT_KEY)
                        fail(503, 'Хранилище ключей ещё не настроено на сервере.');
                    secret = await encryptKey(data.key, env);
                }
                await db.prepare("INSERT INTO eval_settings (id,value,secret) VALUES ('provider',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, secret=excluded.secret").bind(JSON.stringify(config), secret).run();
                return json({ provider: await providerSettings(env) });
            }
        }
        if (path === '/api/provider/test' && method === 'POST') {
            await body(request);
            const p = await providerSettings(env, { secret: true });
            if (!p.key || !p.defaultModel)
                fail(400, 'Сохраните ключ и модель перед проверкой.');
            const result = await callModel({ model: p.defaultModel, messages: [{ role: 'user', content: 'Reply with OK.' }], maxTokens: 16 }, p, fetchImpl);
            return json({ ok: !result.error, result });
        }
        if (path === '/api/assets' && method === 'GET') {
            const rows = (await db.prepare('SELECT * FROM eval_assets ORDER BY created_at DESC LIMIT 1000').all()).results;
            return json({ assets: rows.map(r => ({ id: r.id, familyId: r.family_id, kind: r.kind, name: r.name, version: r.version, content: JSON.parse(r.content), createdAt: r.created_at })) });
        }
        if (path === '/api/assets' && method === 'POST')
            return json({ asset: await saveAsset(db, await body(request)) }, 201);
        if (path === '/api/estimate' && method === 'POST') {
            const data = await body(request);
            const p = await providerSettings(env);
            const snapshot = snapshotFrom(data, p);
            return json({ estimate: estimateRun(snapshot) });
        }
        if (path === '/api/compare' && method === 'POST') {
            const data = await body(request);
            const a = await loadRun(db, data.baseline), b = await loadRun(db, data.candidate);
            return json({ comparison: compareRuns(a, b, data) });
        }
        if (path === '/api/runs' && method === 'GET') {
            const rows = (await db.prepare('SELECT id FROM eval_runs WHERE archived=? ORDER BY created_at DESC LIMIT 100').bind(url.searchParams.get('archived') === '1' ? 1 : 0).all()).results, runs = [];
            for (const row of rows) {
                const r = await loadRun(db, row.id, true);
                runs.push({ id: r.id, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt, provider: r.provider, demo: r.demo, cloud: true, stub: true, status: r.status, progress: r.progress, archived: r.archived, repeats: r.repeats || 1, summary: { a: stats(r, 'a'), b: stats(r, 'b'), regressions: gate(r).regressions } });
            }
            return json({ runs });
        }
        if (path === '/api/runs' && method === 'POST') {
            let data = await body(request);
            if (data.bundle) {
                if (data.bundle.format !== 'evalbench.experiment' || data.bundle.version !== 3 || !data.bundle.run)
                    fail(400, 'Нужен bundle EvalBench версии 3.');
                data = { ...data.bundle.config, id: data.id, provider: 'import', importedRun: data.bundle.run };
            }
            if (typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id))
                fail(400, 'Нужен UUID прогона.');
            const existing = await db.prepare('SELECT id FROM eval_runs WHERE id=?').bind(data.id).first();
            if (existing)
                return json({ run: await loadRun(db, data.id, true) });
            if (!['model', 'synthetic', 'import'].includes(data.provider))
                fail(400, 'Неизвестный тип прогона.');
            const p = await providerSettings(env);
            if (data.provider === 'model' && !p.configured)
                fail(503, 'API-ключ провайдера пока не настроен на сервере.');
            const count = await db.prepare('SELECT COUNT(*) AS count FROM eval_runs WHERE archived=0').first();
            if (count.count >= 100)
                fail(409, '100 активных прогонов. Переместите старые в архив.');
            const snapshot = snapshotFrom(data, p);
            if (data.importedRun)
                snapshot.importedFrom = String(data.importedRun.id || '').slice(0, 100);
            const concurrency = integer(data.concurrency ?? 2, 1, 8, 'Параллельность'), budgetUsd = budget(data.budgetUsd), maxRequests = integer(data.maxRequests ?? 10000, 1, 10000, 'Лимит запросов');
            if (data.pilot && snapshot.cases.length > 3)
                fail(400, 'Пилот: не больше трёх кейсов.');
            if (budgetUsd !== null && data.provider === 'model' && estimateRun(snapshot).reservedUsd === null)
                fail(400, 'Для денежного лимита укажите тарифы всех моделей, включая judge.');
            for (const [key, ref] of Object.entries(snapshot.assetRefs)) {
                if (!ref)
                    continue;
                const asset = await db.prepare('SELECT * FROM eval_assets WHERE id=?').bind(ref).first();
                if (!asset)
                    fail(400, 'Версия ' + key + ' не найдена.');
                const content = JSON.parse(asset.content);
                const actual = key === 'dataset' ? snapshot.cases : key === 'rubric' ? snapshot.judge : snapshot.prompts[key];
                if (!actual || stable(content) !== stable(actual))
                    fail(400, 'Версия ' + key + ' не совпадает со снимком. Сохраните изменения как новую версию.');
            }
            let imported;
            if (data.provider === 'import' && !data.importedRun)
                imported = valid(() => normalizeResults(data.results, snapshot.cases));
            const now = new Date().toISOString(), statements = [db.prepare('INSERT INTO eval_runs (id,snapshot,provider,created_at,updated_at,concurrency,budget_usd,max_requests) VALUES (?,?,?,?,?,?,?,?)').bind(data.id, JSON.stringify(snapshot), data.provider, now, now, concurrency, budgetUsd, maxRequests)];
            let ordinal = 0;
            for (let repeat = 0; repeat < snapshot.repeats; repeat++)
                for (const c of snapshot.cases)
                    for (const side of ['a', 'b'])
                        for (const kind of snapshot.judge.enabled ? ['generation', 'judge'] : ['generation']) {
                            let result = null;
                            if (data.provider === 'import') {
                                const source = data.importedRun;
                                if (source) {
                                    result = kind === 'generation' ? (source.repetitions?.[repeat] || source.results)?.[c.id]?.[side] : source.judgments?.[repeat]?.[c.id]?.[side];
                                    if (result) {
                                        if (kind === 'generation')
                                            result = valid(() => normalizeResults([{ id: c.id, [side]: result }], snapshot.cases))[c.id][side];
                                        else if (!result.error) {
                                            const meta = valid(() => normalizeResults([{ id: c.id, [side]: { ...result, text: result.text ?? '' } }], snapshot.cases))[c.id][side];
                                            if (result.text === undefined)
                                                delete meta.text;
                                            result = { ...meta, ...valid(() => parseJudgment(JSON.stringify({ criteria: result.criteria }), snapshot.judge)) };
                                        }
                                        else
                                            result = { error: String(result.error).slice(0, 4000) };
                                    }
                                }
                                else
                                    result = kind === 'generation' ? imported?.[c.id]?.[side] : { error: 'Нет импортированной оценки judge' };
                            }
                            const reserve = data.provider === 'model' ? taskEstimate(snapshot, c, side, kind).reserve : 0;
                            statements.push(db.prepare('INSERT INTO eval_tasks (id,run_id,ordinal,case_id,side,state,result,kind,repeat_no,reserve_cost,charged_cost) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(`${data.id}:${ordinal}`, data.id, ordinal++, c.id, side, data.provider === 'import' ? 'done' : 'pending', result ? JSON.stringify(result) : null, kind, repeat, reserve, data.provider === 'import' ? (result?.cost ?? null) : null));
                        }
            if (data.importedRun?.reviews) {
                snapshot.importedFrom = data.importedRun.id;
                statements.push(db.prepare('UPDATE eval_runs SET reviews=? WHERE id=?').bind(JSON.stringify(data.importedRun.reviews), data.id));
            }
            await db.batch(statements);
            return json({ run: await loadRun(db, data.id) }, 201);
        }
        const match = path.match(/^\/api\/runs\/([a-f0-9-]{36})(?:\/(advance|export|control|regressions))?$/i);
        if (!match)
            fail(404, 'Неизвестный API-маршрут.');
        const [, id, action] = match;
        const run = await loadRun(db, id, method === 'PATCH');
        if (!action && method === 'GET')
            return json({ run });
        if (!action && method === 'PATCH') {
            const data = await body(request), statements = [];
            if (typeof data.archived === 'boolean')
                statements.push(db.prepare('UPDATE eval_runs SET archived=?, updated_at=? WHERE id=?').bind(+data.archived, new Date().toISOString(), id));
            if (data.caseId !== undefined) {
                if (!run.cases.some(c => c.id === data.caseId))
                    fail(400, 'Тест не найден.');
                const r = data.review;
                if (!r || r.winner !== undefined && !['a', 'b', 'tie', 'skip'].includes(r.winner) || r.note !== undefined && (typeof r.note !== 'string' || r.note.length > 10000))
                    fail(400, 'Неверная оценка.');
                const patch = {};
                for (const k of ['winner', 'note'])
                    if (r[k] !== undefined)
                        patch[k] = r[k];
                if (r.rating !== undefined) {
                    integer(r.rating, 0, (run.reviewScale?.length || 4) - 1, 'Оценка');
                    patch.rating = r.rating;
                }
                statements.push(db.prepare('UPDATE eval_runs SET reviews=json_patch(reviews,?), updated_at=? WHERE id=?').bind(JSON.stringify({ [data.caseId]: patch }), new Date().toISOString(), id));
            }
            if (!statements.length)
                fail(400, 'Нет изменений.');
            await db.batch(statements);
            return json({ run: await loadRun(db, id, true) });
        }
        if (action === 'advance' && method === 'POST') {
            await body(request);
            return json(await advance(db, id, env, fetchImpl));
        }
        if (action === 'control' && method === 'POST') {
            const data = await body(request), control = data.action;
            if (!['pause', 'resume', 'cancel', 'retry-errors', 'limits'].includes(control))
                fail(400, 'Неизвестное действие очереди.');
            const statements = [];
            if (data.concurrency !== undefined)
                statements.push(db.prepare('UPDATE eval_runs SET concurrency=? WHERE id=?').bind(integer(data.concurrency, 1, 8, 'Параллельность'), id));
            if (data.maxRequests !== undefined)
                statements.push(db.prepare('UPDATE eval_runs SET max_requests=? WHERE id=?').bind(integer(data.maxRequests, 1, 10000, 'Лимит запросов'), id));
            if (data.budgetUsd !== undefined) {
                const b = budget(data.budgetUsd);
                if (b !== null && run.provider === 'model' && estimateRun(run).reservedUsd === null)
                    fail(400, 'Нужны тарифы для денежного лимита.');
                statements.push(db.prepare('UPDATE eval_runs SET budget_usd=? WHERE id=?').bind(b, id));
            }
            if (control === 'retry-errors') {
                // Successful generations remain untouched; judge tasks depending on a failed generation may be retried too.
                statements.push(db.prepare("UPDATE eval_tasks SET state='pending', prior_cost=prior_cost+COALESCE(charged_cost,reserve_cost,0), charged_cost=NULL, result=NULL, lease_until=0 WHERE run_id=? AND state='done' AND attempt<10 AND json_extract(result,'$.error') IS NOT NULL").bind(id));
            }
            if (control === 'resume')
                statements.push(db.prepare("UPDATE eval_tasks SET state='pending' WHERE run_id=? AND state='cancelled'").bind(id));
            if (control === 'cancel')
                statements.push(db.prepare("UPDATE eval_tasks SET state='cancelled' WHERE run_id=? AND state='pending'").bind(id));
            if (control !== 'limits')
                statements.push(db.prepare('UPDATE eval_runs SET control=?, stop_reason=NULL, updated_at=? WHERE id=?').bind(control === 'pause' ? 'paused' : control === 'cancel' ? 'cancelled' : 'active', new Date().toISOString(), id));
            if (!statements.length)
                fail(400, 'Нет изменений лимитов.');
            await db.batch(statements);
            return json({ run: await loadRun(db, id) });
        }
        if (action === 'regressions' && method === 'POST') {
            const data = await body(request), c = run.cases.find(c => c.id === data.caseId);
            if (!c)
                fail(400, 'Тест не найден.');
            let previous = null;
            if (data.familyId)
                previous = await db.prepare("SELECT * FROM eval_assets WHERE family_id=? AND kind='suite' ORDER BY version DESC LIMIT 1").bind(data.familyId).first();
            const cases = previous ? JSON.parse(previous.content) : [];
            const existing = cases.find(x => x.id === c.id);
            if (existing && stable(existing) !== stable(c))
                fail(409, 'В suite уже есть другой кейс с этим id.');
            if (!existing)
                cases.push(c);
            return json({ asset: await saveAsset(db, { kind: 'suite', familyId: previous?.family_id, name: data.name || previous?.name || 'Regression suite', content: cases }) }, 201);
        }
        if (action === 'export' && method === 'GET') {
            const format = url.searchParams.get('format') || 'json';
            if (!['json', 'csv', 'jsonl', 'bundle'].includes(format))
                fail(400, 'Формат: json / csv / jsonl / bundle.');
            const lines = [];
            if (format === 'jsonl')
                for (let i = 0; i < (run.repeats || 1); i++)
                    for (const c of run.cases)
                        for (const side of ['a', 'b'])
                            lines.push(JSON.stringify({ case: c, side, repeat: i, prompt: run.prompts[side], result: run.repetitions[i]?.[c.id]?.[side], judgment: run.judgments[i]?.[c.id]?.[side], review: run.reviews[c.id] }));
            const payload = format === 'csv' ? runCsv(run) : format === 'jsonl' ? lines.join('\n') + '\n' : JSON.stringify(format === 'bundle' ? experimentBundle(run) : { ...run, summary: { a: stats(run, 'a'), b: stats(run, 'b'), gate: gate(run) } }, null, 2);
            return new Response(payload, { headers: { 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : format === 'jsonl' ? 'application/x-ndjson' : 'application/json', 'Content-Disposition': `attachment; filename="evalbench-${id}.${format === 'bundle' ? 'json' : format}"`, 'Cache-Control': 'no-store' } });
        }
        fail(405, 'Метод не поддерживается.');
    }
    catch (e) {
        return json({ error: e instanceof ApiError ? e.message : 'Ошибка сервера. Прогресс сохранён; повторите действие.' }, e.status || 500);
    }
}
