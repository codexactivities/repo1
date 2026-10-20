import { validateCases, normalizeResults, template, stats, gate, runCsv } from '../web/core.js';
import verification from '../examples/verification.json' with { type: 'json' };

const MAX_BODY = 1_000_000;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };

async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'Ожидается application/json.');
  if (Number(request.headers.get('content-length')) > MAX_BODY) fail(413, 'Запрос больше 1 МБ.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Пустой запрос.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); fail(413, 'Запрос больше 1 МБ.'); }
    chunks.push(value);
  }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(joined)); } catch { fail(400, 'Неверный JSON.'); }
}

function validatePrompts(prompts, cases, modelRequired) {
  const result = {};
  for (const side of ['a', 'b']) {
    const p = prompts?.[side];
    if (typeof p?.text !== 'string' || !p.text.trim() || p.text.length > 50000) fail(400, 'Нужны шаблоны A и B длиной до 50 000 символов.');
    const model = String(p.model || '').trim();
    if (modelRequired && (!model || model.length > 256)) fail(400, 'Укажите модель для обеих версий.');
    for (const c of cases) {
      const missing = [...p.text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].find(m => !Object.hasOwn(c.vars, m[1]));
      if (missing) fail(400, `${c.id}: отсутствует переменная ${missing[1]}.`);
    }
    result[side] = { name: String(p.name || side.toUpperCase()).slice(0, 120), text: p.text, model };
  }
  return result;
}

async function loadRun(db, id, includeArchived = false) {
  const row = await db.prepare('SELECT * FROM eval_runs WHERE id = ?').bind(id).first();
  if (!row || (row.archived && !includeArchived)) fail(404, 'Прогон не найден.');
  const tasks = (await db.prepare('SELECT * FROM eval_tasks WHERE run_id = ? ORDER BY ordinal').bind(id).all()).results;
  const results = {};
  for (const t of tasks) {
    if (t.state !== 'done' || !t.result) continue;
    results[t.case_id] ||= {};
    results[t.case_id][t.side] = JSON.parse(t.result);
  }
  const snapshot = JSON.parse(row.snapshot);
  const done = tasks.filter(t => t.state === 'done').length;
  return {
    ...snapshot, id, createdAt: row.created_at, updatedAt: row.updated_at,
    provider: row.provider, demo: row.provider === 'synthetic', cloud: true,
    status: done === tasks.length ? 'completed' : 'running', progress: { done, total: tasks.length },
    results, reviews: JSON.parse(row.reviews), archived: !!row.archived,
  };
}

async function generate(snapshot, task, env, fetchImpl) {
  const start = performance.now();
  if (snapshot.provider === 'synthetic') {
    const row = verification.responses.find(r => r.id === task.case_id);
    if (!row) return { error: 'Synthetic fixture mismatch' };
    // Executed server-side for each queued task, never a pre-filled run result.
    return { text: row[task.side].text, latencyMs: Math.round(performance.now() - start) };
  }
  const c = snapshot.cases.find(c => c.id === task.case_id), p = snapshot.prompts[task.side];
  try {
    const url = new URL(env.EVAL_API_URL || 'https://api.openai.com/v1/chat/completions');
    if (url.protocol !== 'https:' || url.username || url.password) return { error: 'Provider URL must use HTTPS without embedded credentials' };
    const response = await fetchImpl(url, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${env.EVAL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: template(p.text, c.vars) }], max_completion_tokens: snapshot.maxTokens, stream: false }),
      signal: AbortSignal.timeout(35000),
    });
    if (!response.ok) return { error: `Provider HTTP ${response.status}` };
    const data = await response.json(), text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string') return { error: 'Provider returned no text content' };
    if (text.length > 200000) return { error: 'Provider response too large' };
    const result = { text, latencyMs: Math.round(performance.now() - start) };
    if (typeof data.id === 'string') result.responseId = data.id.slice(0, 256);
    if (typeof data.choices?.[0]?.finish_reason === 'string') result.finishReason = data.choices[0].finish_reason;
    if (data.usage && typeof data.usage === 'object') result.usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].filter(k => Number.isFinite(data.usage[k])).map(k => [k, data.usage[k]]));
    return result;
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? 'Provider request timed out' : 'Provider request failed' };
  }
}

/** Single-owner workspace. Hosted dispatch enforces this Site's private access policy. */
export async function handleApi(request, env, { fetchImpl = fetch } = {}) {
  try {
    const url = new URL(request.url), path = url.pathname;
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) fail(403, 'Межсайтовый запрос запрещён.');
      if (request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'Межсайтовый запрос запрещён.');
    }
    if (path === '/api/health' && request.method === 'GET') return json({ hosted: true, configured: !!env.EVAL_API_KEY, synthetic: true, storage: !!env.DB, maxCases: 50, defaultModel: env.EVAL_MODEL || '' });
    if (!env.DB) fail(503, 'Серверное хранилище не подключено.');
    const db = env.DB;
    if (path === '/api/runs' && request.method === 'GET') {
      const archived = url.searchParams.get('archived') === '1' ? 1 : 0;
      const rows = (await db.prepare('SELECT id FROM eval_runs WHERE archived = ? ORDER BY created_at DESC LIMIT 100').bind(archived).all()).results;
      const runs = [];
      for (const row of rows) {
        const r = await loadRun(db, row.id, true);
        runs.push({ id:r.id, name:r.name, createdAt:r.createdAt, updatedAt:r.updatedAt, provider:r.provider, demo:r.demo, cloud:true, stub:true, status:r.status, progress:r.progress, archived:r.archived, summary:{a:stats(r,'a'),b:stats(r,'b'),regressions:gate(r).regressions} });
      }
      return json({ runs });
    }
    if (path === '/api/runs' && request.method === 'POST') {
      const data = await body(request);
      if (typeof data.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.id)) fail(400, 'Нужен UUID прогона.');
      const existing = await db.prepare('SELECT id FROM eval_runs WHERE id = ?').bind(data.id).first();
      if (existing) return json({ run: await loadRun(db, data.id, true) });
      const provider = data.provider;
      if (!['model', 'synthetic', 'import'].includes(provider)) fail(400, 'Неизвестный тип прогона.');
      if (provider === 'model' && !env.EVAL_API_KEY) fail(503, 'API-ключ провайдера пока не настроен на сервере.');
      const count = await db.prepare('SELECT COUNT(*) AS count FROM eval_runs WHERE archived = 0').first();
      if (count.count >= 100) fail(409, 'В архиве 100 активных прогонов. Переместите старые в архив.');
      let cases;
      try { cases = validateCases(provider === 'synthetic' ? verification.cases : data.cases); } catch (e) { fail(400, e.message); }
      if (provider === 'model' && cases.length > 50) fail(400, 'Один модельный прогон: не больше 50 тестов.');
      const prompts = validatePrompts(provider === 'synthetic' ? verification.prompts : data.prompts, cases, provider === 'model');
      const maxTokens = data.maxTokens ?? 512;
      if (!Number.isInteger(maxTokens) || maxTokens < 16 || maxTokens > 2048) fail(400, 'Лимит ответа должен быть от 16 до 2048 токенов.');
      let imported;
      if (provider === 'import') {
        try { imported = normalizeResults(data.results, cases); } catch (e) { fail(400, e.message); }
      }
      const snapshot = { name: String(data.name || 'Server experiment').slice(0, 120), cases, prompts, provider, maxTokens };
      const now = new Date().toISOString();
      const statements = [db.prepare('INSERT INTO eval_runs (id, snapshot, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(data.id, JSON.stringify(snapshot), provider, now, now)];
      cases.forEach((c, i) => ['a', 'b'].forEach((side, j) => statements.push(db.prepare('INSERT INTO eval_tasks (id, run_id, ordinal, case_id, side, state, result) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(`${data.id}:${i}:${side}`, data.id, i * 2 + j, c.id, side, imported ? 'done' : 'pending', imported?.[c.id]?.[side] ? JSON.stringify(imported[c.id][side]) : null))));
      // D1 batch is transactional: never leave a partially created run.
      await db.batch(statements);
      return json({ run: await loadRun(db, data.id) }, 201);
    }
    const match = path.match(/^\/api\/runs\/([a-f0-9-]{36})(?:\/(advance|export))?$/i);
    if (!match) fail(404, 'Неизвестный API-маршрут.');
    const [, id, action] = match;
    const run = await loadRun(db, id, request.method === 'PATCH');
    if (!action && request.method === 'GET') return json({ run });
    if (!action && request.method === 'PATCH') {
      const data = await body(request), statements = [];
      if (typeof data.archived === 'boolean') statements.push(db.prepare('UPDATE eval_runs SET archived = ?, updated_at = ? WHERE id = ?').bind(data.archived ? 1 : 0, new Date().toISOString(), id));
      if (data.caseId !== undefined) {
        if (!run.cases.some(c => c.id === data.caseId)) fail(400, 'Тест не найден.');
        const review = data.review;
        if (!review || (review.winner !== undefined && !['a', 'b', 'tie', 'skip'].includes(review.winner)) || (review.note !== undefined && (typeof review.note !== 'string' || review.note.length > 10000))) fail(400, 'Неверная оценка.');
        const patch = {};
        if (review.winner !== undefined) patch.winner = review.winner;
        if (review.note !== undefined) patch.note = review.note;
        // JSON merge patch updates one case without losing concurrent votes on other cases.
        const merged = { [data.caseId]: patch };
        statements.push(db.prepare('UPDATE eval_runs SET reviews = json_patch(reviews, ?), updated_at = ? WHERE id = ?').bind(JSON.stringify(merged), new Date().toISOString(), id));
      }
      if (!statements.length) fail(400, 'Нет изменений.');
      await db.batch(statements); return json({ run: await loadRun(db, id, true) });
    }
    if (action === 'advance' && request.method === 'POST') {
      await body(request);
      if (run.provider === 'model' && !env.EVAL_API_KEY) fail(503, 'API-ключ провайдера не настроен.');
      const now = Date.now();
      const task = await db.prepare("UPDATE eval_tasks SET state = 'running', lease_until = ? WHERE id = (SELECT id FROM eval_tasks WHERE run_id = ? AND (state = 'pending' OR (state = 'running' AND lease_until < ?)) ORDER BY ordinal LIMIT 1) RETURNING *").bind(now + 90000, id, now).first();
      if (!task) return json({ run: await loadRun(db, id), waiting: run.status !== 'completed' });
      const result = await generate(run, task, env, fetchImpl);
      const completedAt = new Date().toISOString();
      await db.batch([
        db.prepare("UPDATE eval_tasks SET state = 'done', result = ?, lease_until = 0 WHERE id = ? AND state = 'running' AND lease_until = ?").bind(JSON.stringify(result), task.id, now + 90000),
        db.prepare('UPDATE eval_runs SET updated_at = ? WHERE id = ?').bind(completedAt, id),
      ]);
      return json({ run: await loadRun(db, id) });
    }
    if (action === 'export' && request.method === 'GET') {
      const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json';
      const payload = format === 'csv' ? runCsv(run) : JSON.stringify({ ...run, summary: { a: stats(run, 'a'), b: stats(run, 'b'), gate: gate(run) } }, null, 2);
      return new Response(payload, { headers: { 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json', 'Content-Disposition': `attachment; filename="evalbench-${id}.${format}"`, 'Cache-Control': 'no-store' } });
    }
    fail(405, 'Метод не поддерживается.');
  } catch (e) {
    return json({ error: e instanceof ApiError ? e.message : 'Ошибка сервера. Прогресс сохранён; повторите действие.' }, e.status || 500);
  }
}
