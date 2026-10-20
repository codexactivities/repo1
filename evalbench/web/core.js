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
        if (!c || typeof c.id !== 'string' || !c.id.trim() || ['__proto__', 'constructor', 'prototype'].includes(c.id) || ids.has(c.id))
            throw new Error(`Тест ${i + 1}: нужен уникальный строковый id.`);
        ids.add(c.id);
        if (!c.vars || typeof c.vars !== 'object' || Array.isArray(c.vars) || Object.values(c.vars).some(v => !['string', 'number', 'boolean'].includes(typeof v)))
            throw new Error(`${c.id}: vars должен содержать строки, числа или boolean.`);
        if (!Array.isArray(c.rules) || c.rules.some(r => !r || !['contains', 'notContains', 'exact', 'json', 'maxWords'].includes(r.type) || (['contains', 'notContains', 'exact'].includes(r.type) && (typeof r.value !== 'string' || !r.value.trim())) || (r.type === 'maxWords' && (!Number.isInteger(r.value) || r.value < 1))))
            throw new Error(`${c.id}: неверные правила.`);
        return { id: c.id, title: String(c.title || c.id), slice: String(c.slice || 'Общее'), vars: c.vars, rules: c.rules, reference: String(c.reference || '') };
    });
}
export function evaluate(text, rules) {
    if (typeof text !== 'string')
        return { pass: null, score: null, checks: [] };
    const checks = rules.map(r => {
        let pass = false;
        const t = text.toLocaleLowerCase();
        const v = String(r.value ?? '').toLocaleLowerCase();
        if (r.type === 'contains')
            pass = t.includes(v);
        if (r.type === 'notContains')
            pass = !t.includes(v);
        if (r.type === 'exact')
            pass = text.trim() === String(r.value).trim();
        if (r.type === 'json') {
            try {
                JSON.parse(text);
                pass = true;
            }
            catch {
                pass = false;
            }
        }
        if (r.type === 'maxWords')
            pass = (text.trim() ? text.trim().split(/\s+/u).length : 0) <= r.value;
        return { ...r, pass };
    });
    return { pass: checks.length ? checks.every(x => x.pass) : null, score: checks.length ? checks.filter(x => x.pass).length / checks.length : null, checks };
}
export function stats(run, side, slice = 'all') {
    const cases = run.cases.filter(c => slice === 'all' || c.slice === slice);
    const cells = cases.map(c => ({ c, result: run.results[c.id]?.[side] }));
    const done = cells.filter(x => typeof x.result?.text === 'string' && !x.result.error);
    const graded = done.map(x => evaluate(x.result.text, x.c.rules)).filter(e => e.pass !== null);
    const measured = done.filter(x => Number.isFinite(x.result.latencyMs));
    const costs = done.filter(x => Number.isFinite(x.result.cost));
    return { total: cases.length, done: done.length, graded: graded.length, passed: graded.filter(x => x.pass).length, rate: graded.length ? graded.filter(x => x.pass).length / graded.length : null, latency: measured.length ? measured.reduce((s, x) => s + x.result.latencyMs, 0) / measured.length : null, cost: costs.length ? costs.reduce((s, x) => s + x.result.cost, 0) : null };
}
export function transition(run, c) {
    const a = run.results[c.id]?.a, b = run.results[c.id]?.b;
    if (a?.error || b?.error)
        return 'error';
    const ea = evaluate(a?.text, c.rules), eb = evaluate(b?.text, c.rules);
    if (ea.pass === true && eb.pass === false)
        return 'regression';
    if (ea.pass === false && eb.pass === true)
        return 'improvement';
    if (eb.pass === false)
        return 'failure';
    if (eb.pass === true)
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
        }
    }
    return out;
}
export function csv(rows) { return '\uFEFF' + rows.map(row => row.map(v => { let s = String(v ?? ''); if (/^[=+@\-\t\r]/.test(s))
    s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; }).join(',')).join('\r\n'); }
export function runCsv(run) {
    const rows = [['id', 'title', 'slice', 'a_text', 'a_pass', 'b_text', 'b_pass', 'transition', 'human_winner', 'note']];
    for (const c of run.cases)
        rows.push([
            c.id, c.title, c.slice,
            run.results[c.id]?.a?.text ?? run.results[c.id]?.a?.error,
            evaluate(run.results[c.id]?.a?.text, c.rules).pass,
            run.results[c.id]?.b?.text ?? run.results[c.id]?.b?.error,
            evaluate(run.results[c.id]?.b?.text, c.rules).pass,
            transition(run, c), run.reviews[c.id]?.winner, run.reviews[c.id]?.note,
        ]);
    return csv(rows);
}
