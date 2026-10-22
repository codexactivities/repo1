import { validateRule, evaluateRules, grade } from './graders.js';
export { grade } from './graders.js';
export function uid(cryptoApi = globalThis.crypto) {
    if (typeof cryptoApi.randomUUID === 'function')
        return cryptoApi.randomUUID();
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function template(prompt, vars) { return prompt.replace(/\{\{\s*([\w]+)\s*\}\}/g, (all, k) => Object.hasOwn(vars, k) ? String(vars[k]) : all); }
export function validateCases(cases) {
    if (!Array.isArray(cases) || !cases.length || cases.length > 500)
        throw new Error('Нужен массив из 1–500 тестов.');
    const ids = new Set();
    return cases.map((c, i) => {
        if (!c || typeof c.id !== 'string' || !c.id.trim() || c.id.length > 200 || (['prototype', ...Object.getOwnPropertyNames(Object.prototype)].includes(c.id)) || ids.has(c.id))
            throw new Error(`Тест ${i + 1}: нужен уникальный строковый id.`);
        ids.add(c.id);
        if (!c.vars || typeof c.vars !== 'object' || Array.isArray(c.vars) || Object.values(c.vars).some(v => !['string', 'number', 'boolean'].includes(typeof v) || typeof v==='number'&&!Number.isFinite(v)))
            throw new Error(`${c.id}: vars должен содержать строки, числа или boolean.`);
        if (!Array.isArray(c.rules))
            throw new Error(`${c.id}: rules должен быть массивом.`);
        const rules = c.rules.map(validateRule);
        const tags = Array.isArray(c.tags) ? c.tags.map(String) : [];
        if (tags.length > 30 || tags.some(t => t.length > 80))
            throw Error('До 30 тегов, каждый до 80 символов.');
        if (rules.some(r => r.type === 'reference') && !String(c.reference ?? '').trim())
            throw Error(`${c.id}: для сравнения с эталоном нужен reference.`);
        return { id: c.id, title: String(c.title || c.id), slice: String(c.slice || 'Общее'), tags: [...new Set(tags)], vars: c.vars, rules, reference: String(c.reference ?? '') };
    });
}
export const evaluate = evaluateRules;
export function stats(run, side, slice = 'all') {
    const cases = run.cases.filter(c => slice === 'all' || c.slice === slice);
    const cells = Array.from({ length: run.repeats || 1 }, (_, repeat) => cases.map(c => ({ c, repeat, result: (run.repetitions?.[repeat] || run.results)[c.id]?.[side] }))).flat();
    const done = cells.filter(x => typeof x.result?.text === 'string' && !x.result.error);
    const graded = done.map(x => grade(run, x.c, side, x.repeat)).filter(e => e.pass !== null);
    const measured = done.filter(x => Number.isFinite(x.result.latencyMs));
    const costs = done.filter(x => Number.isFinite(x.result.cost));
    return { total: cases.length * (run.repeats || 1), done: done.length, graded: graded.length, passed: graded.filter(x => x.pass).length, rate: graded.length ? graded.filter(x => x.pass).length / graded.length : null, latency: measured.length ? measured.reduce((s, x) => s + x.result.latencyMs, 0) / measured.length : null, cost: costs.length === cells.length && costs.length ? costs.reduce((s, x) => s + x.result.cost, 0) : null };
}
export function transition(run, c) {
    const pairs = Array.from({ length: run.repeats || 1 }, (_, i) => ({ a: grade(run, c, 'a', i), b: grade(run, c, 'b', i) }));
    if (pairs.some(p => p.a.error || p.b.error))
        return 'error';
    if (pairs.some(p => p.a.pass === true && p.b.pass === false))
        return 'regression';
    if (pairs.some(p => p.a.pass === false && p.b.pass === true))
        return 'improvement';
    if (pairs.some(p => p.b.pass === false))
        return 'failure';
    if (pairs.every(p => p.b.pass === true))
        return 'pass';
    return 'ungraded';
}
export function gate(run, threshold = 90) {
    const s = stats(run, 'b'), a = stats(run, 'a');
    const regressions = run.cases.filter(c => transition(run, c) === 'regression').length;
    if (s.done !== s.total || s.graded !== s.total || a.done !== a.total || a.graded !== a.total)
        return { state: 'pending', label: 'Недостаточно данных', regressions };
    return { state: s.rate * 100 >= threshold && regressions === 0 ? 'pass' : 'fail', label: s.rate * 100 >= threshold && regressions === 0 ? 'Можно выпускать' : 'Нужна доработка', regressions };
}
export function normalizeResults(data, cases) {
    const items = Array.isArray(data) ? data : data?.results;
    if (!Array.isArray(items) || !items.length)
        throw new Error('Ожидается массив {id, a: {text}, b: {text}}.');
    const known = new Set(cases.map(c => c.id)), seen = new Set(), out = {};
    for (const x of items) {
        if (!known.has(x.id) || seen.has(x.id))
            throw new Error(`Неизвестный или повторный id: ${x.id}`);
        seen.add(x.id);
        out[x.id] = {};
        for (const side of ['a', 'b']) {
            const r = x[side];
            if (r == null)
                continue;
            if (typeof r.text !== 'string' && typeof r.error !== 'string')
                throw new Error(`${x.id}.${side}: нужен text или error.`);
            if (r.text?.length > 200000)
                throw new Error('Ответ превышает 200 000 символов.');
            out[x.id][side] = { ...(typeof r.error === 'string' ? { error: r.error } : { text: r.text }), ...Object.fromEntries(['latencyMs', 'cost'].filter(k => Number.isFinite(r[k]) && r[k] >= 0).map(k => [k, r[k]])) };
            for (const k of ['responseId', 'finishReason', 'model', 'costSource'])
                if (typeof r[k] === 'string')
                    out[x.id][side][k] = r[k].slice(0, 256);
            if (r.synthetic === true)
                out[x.id][side].synthetic = true;
            if (r.usage)
                out[x.id][side].usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].filter(k => Number.isFinite(r.usage[k]) && r.usage[k] >= 0).map(k => [k, r.usage[k]]));
        }
    }
    return out;
}
export function csv(rows) {
    return '\uFEFF' + rows.map(row => row.map(v => {
        let s = String(v ?? '');
        if (/^[=+@\-\t\r]/.test(s))
            s = "'" + s;
        return '"' + s.replaceAll('"', '""') + '"';
    }).join(',')).join('\r\n');
}
export function runCsv(run) {
    const rows = [['id', 'title', 'slice', 'a_text', 'a_pass', 'b_text', 'b_pass', 'transition', 'human_winner', 'note', 'tags', 'reference', 'a_usage', 'b_usage', 'a_judge', 'b_judge', 'repetitions', 'rating']];
    for (const c of run.cases)
        rows.push([
            c.id, c.title, c.slice,
            run.results[c.id]?.a?.text ?? run.results[c.id]?.a?.error,
            grade(run, c, 'a').pass,
            run.results[c.id]?.b?.text ?? run.results[c.id]?.b?.error,
            grade(run, c, 'b').pass,
            transition(run, c), run.reviews[c.id]?.winner, run.reviews[c.id]?.note, (c.tags || []).join('|'), c.reference, JSON.stringify(run.results[c.id]?.a?.usage || null), JSON.stringify(run.results[c.id]?.b?.usage || null), JSON.stringify(run.judgments?.[0]?.[c.id]?.a || null), JSON.stringify(run.judgments?.[0]?.[c.id]?.b || null), JSON.stringify(run.repetitions?.map(r => r[c.id]) || [run.results[c.id]]), run.reviews[c.id]?.rating,
        ]);
    return csv(rows);
}
