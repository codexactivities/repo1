#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function main(args = process.argv.slice(2), env = process.env) {
    const [command, ...rest] = args, flags = {};
    for (let i = 0; i < rest.length; i++) {
        if (!rest[i].startsWith('--'))
            throw Error('Неизвестный аргумент ' + rest[i]);
        const k = rest[i].slice(2);
        flags[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    }
    if (!command || command === 'help' || flags.help) {
        console.log('EvalBench CLI\nrun --config FILE [--synthetic] [--dry-run] [--out DIR]\ncompare --baseline ID --candidate ID [--baseline-side a|b] [--candidate-side a|b] [--tag TAG] [--fail-on-regression] [--out FILE]\nexport --run ID [--format bundle|json|jsonl|csv] [--out FILE]\nEnvironment: EVALBENCH_URL, EVALBENCH_TOKEN_FILE (private Sites service access).');
        return 0;
    }
    if (!env.EVALBENCH_URL)
        throw Error('Задайте EVALBENCH_URL.');
    const base = new URL(env.EVALBENCH_URL);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))
        throw Error('Адрес должен использовать HTTPS или loopback HTTP.');
    if (base.username || base.password || base.search || base.hash)
        throw Error('URL не должен содержать учётные данные/query/fragment.');
    const token = env.EVALBENCH_TOKEN_FILE ? (await readFile(env.EVALBENCH_TOKEN_FILE, 'utf8')).trim() : null;
    async function request(path, method = 'GET', data, raw = false) { const response = await fetch(new URL('/api' + path, base), { method, redirect: 'error', headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'OAI-Sites-Authorization': 'Bearer ' + token } : {}) }, body: data ? JSON.stringify(data) : undefined }); if (!response.ok) {
        let error;
        try {
            error = (await response.json()).error;
        }
        catch { }
        throw Error(error || 'HTTP ' + response.status);
    } return raw ? response.text() : response.json(); }
    async function output(path, value) { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'; if (path) {
        await mkdir(resolve(path, '..'), { recursive: true });
        await writeFile(path, text);
    }
    else
        console.log(text); }
    if (command === 'export') {
        if (!flags.run)
            throw Error('Нужен --run ID.');
        const format = flags.format || 'bundle';
        if (!['bundle', 'json', 'jsonl', 'csv'].includes(format))
            throw Error('Неизвестный формат.');
        await output(flags.out, await request('/runs/' + encodeURIComponent(flags.run) + '/export?format=' + format, 'GET', undefined, true));
        return 0;
    }
    if (command === 'compare') {
        if (!flags.baseline || !flags.candidate)
            throw Error('Нужны --baseline и --candidate.');
        const { comparison } = await request('/compare', 'POST', { baseline: flags.baseline, candidate: flags.candidate, baselineSide: flags['baseline-side'] || 'b', candidateSide: flags['candidate-side'] || 'b', tag: flags.tag || 'all' });
        await output(flags.out, comparison);
        return flags['fail-on-regression'] && (comparison.regressions.length || comparison.excluded.length || !comparison.paired) ? 1 : 0;
    }
    if (command === 'run') {
        if (!flags.config)
            throw Error('Нужен --config FILE.');
        const source = JSON.parse(await readFile(flags.config, 'utf8')), config = { ...(source.config || source), id: crypto.randomUUID(), provider: flags.synthetic ? 'synthetic' : 'model' };
        const { estimate } = await request('/estimate', 'POST', config);
        console.log(JSON.stringify({ preflight: estimate }));
        if (flags['dry-run'])
            return 0;
        let { run } = await request('/runs', 'POST', config);
        console.log('Run ' + run.id);
        let iterations = 0;
        while (run.status === 'running') {
            if (++iterations > 12000)
                throw Error('Остановлен клиентский цикл. Прогресс сохранён: ' + run.id);
            const batch = await Promise.all(Array.from({ length: run.concurrency || 1 }, () => request('/runs/' + run.id + '/advance', 'POST', {})));
            run = (await request('/runs/' + run.id)).run;
            console.log(JSON.stringify({ id: run.id, status: run.status, ...run.progress }));
            if (batch.every(x => x.waiting))
                await new Promise(r => setTimeout(r, 300));
        }
        const dir = flags.out || 'artifacts';
        await mkdir(dir, { recursive: true });
        for (const format of ['bundle', 'jsonl', 'csv'])
            await output(resolve(dir, run.id + '.' + (format === 'bundle' ? 'bundle.json' : format)), await request('/runs/' + run.id + '/export?format=' + format, 'GET', undefined, true));
        return run.status !== 'completed' || run.progress.errors ? 1 : 0;
    }
    throw Error('Команда: run, compare или export.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 2; });
