import { uid, validateCases, stats, gate, transition, normalizeResults, runCsv } from './core.js';
import { grade, ruleTypes } from './graders.js';
import { normalizePrompt, messages, normalizeJudge, defaultJudge, importDataset, datasetCsv, compareRuns, calibration, textDiff, experimentBundle } from './lab.js';
import { cases as demoCases, prompts as demoPrompts, demoResults } from './demo.js';
const $ = s => document.querySelector(s), esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = v => JSON.stringify(v, null, 2), pct = v => v == null ? '—' : (v * 100).toFixed(1) + '%', usd = v => v == null ? 'неизвестна' : '$' + Number(v).toFixed(5), num = v => v == null ? '—' : Math.round(v).toLocaleString('ru-RU');
const KEY = 'evalbench.workspace.v1';
let state;
try {
    state = JSON.parse(localStorage.getItem(KEY));
    if (!state?.cases)
        throw Error();
    state.cases = validateCases(state.cases);
    for (const s of ['a', 'b'])
        state.prompts[s] = normalizePrompt(state.prompts[s]);
}
catch {
    state = { version: 1, cases: validateCases(demoCases), prompts: { a: normalizePrompt(demoPrompts.a), b: normalizePrompt(demoPrompts.b) }, runs: [], threshold: 90 };
}
state.judge = normalizeJudge(state.judge || defaultJudge);
state.refs ||= {};
state.assetNames ||= { dataset: 'Основной датасет', a: 'Baseline', b: 'Candidate', rubric: 'Основная рубрика' };
state.families ||= {};
state.assetKinds ||= {};
const legacyDemo = () => ({ id: uid(), name: 'Учебный пример · 12 кейсов', createdAt: new Date().toISOString(), cases: validateCases(demoCases), prompts: demoPrompts, results: demoResults(), reviews: {}, demo: true });
if (!state.runs.length)
    state.runs = [legacyDemo()];
let active = state.runs[0].id, view = 'overview', server = { storage: false }, provider = {}, assets = [], busy = false, driveId = null, filter = 'all', query = '', tag = 'all', repeat = 0, selected = new Set(), reviewIndex = 0, unreviewed = true, blind = true, compare = { baseline: active, candidate: active, baselineSide: 'a', candidateSide: 'b', tag: 'all' }, compareResult = null;
const current = () => state.runs.find(r => r.id === active);
const persist = () => { try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, runs: state.runs.filter(r => !r.cloud).slice(0, 30) }));
}
catch {
    toast('Память браузера заполнена; серверные данные сохранены.');
} };
function toast(msg) { $('#toast').textContent = msg; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 5000); }
async function api(path, method = 'GET', data) { const res = await fetch('/api' + path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined }); let value; try {
    value = await res.json();
}
catch {
    throw Error('Сервер недоступен.');
} if (!res.ok)
    throw Error(value.error || 'Ошибка запроса'); return value; }
function putRun(run) { const i = state.runs.findIndex(r => r.id === run.id); if (i < 0)
    state.runs.unshift(run);
else
    state.runs[i] = run; return run; }
async function full(id) { let r = state.runs.find(r => r.id === id); if (!r || r.stub) {
    r = (await api('/runs/' + id)).run;
    putRun(r);
} return r; }
async function refresh() { const data = await api('/runs'); state.runs = [...data.runs.map(r => { const cached = state.runs.find(x => x.id === r.id); return cached && !cached.stub && cached.updatedAt === r.updatedAt ? cached : r; }), ...state.runs.filter(r => !r.cloud)]; assets = (await api('/assets')).assets; }
const btn = (label, action, cls = 'ghost', attrs = '') => `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const opts = (items, value) => items.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('');
const input = (label, id, value = '', type = 'text', attrs = '') => `<label>${label}<input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area = (label, id, value, rows = 4) => `<label>${label}<textarea id="${id}" rows="${rows}" spellcheck="false">${esc(value)}</textarea></label>`;
function modal(title, html, setup) { const d = $('#modal'); d.innerHTML = `<div class="modal-heading"><h2>${esc(title)}</h2><button class="close" aria-label="Закрыть">×</button></div><div class="modal-body">${html}<p class="form-error" role="alert"></p></div>`; d.querySelector('.close').onclick = () => d.close(); if (!d.open)
    d.showModal(); setup?.(d); }
const safe = fn => async (...args) => { try {
    await fn(...args);
}
catch (e) {
    const err = $('#modal[open] .form-error');
    if (err)
        err.textContent = e.message;
    else
        toast(e.message);
} };
function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function status(r) { return r?.demo ? 'Синтетика' : r?.provider === 'import' ? 'Импорт' : 'Модель'; }
const gradeBadge = g => `<span class="badge ${g.pass === true ? 'pass' : g.pass === false ? 'fail' : 'pending'}">${g.pass === true ? 'PASS' : g.pass === false ? 'FAIL' : g.error ? 'ERROR' : 'Ожидается'}</span>`;
const panel = (title, body, actions = '') => `<section class="panel"><div class="panel-heading"><h2>${title}</h2><div class="button-group">${actions}</div></div><div class="panel-body">${body}</div></section>`;
const nav = [['overview', '◫', 'Обзор'], ['dataset', '▦', 'Датасет'], ['prompts', '⌘', 'Промпты'], ['judge', '◇', 'Оценщики / Judge'], ['compare', '⇄', 'Сравнение'], ['errors', '⚑', 'Разбор ошибок'], ['review', '◎', 'Ручная оценка'], ['history', '◷', 'Прогоны'], ['settings', '⚙', 'Провайдер']];
function render() {
    const r = current();
    $('#app').innerHTML = `<aside><a class="brand" href="#"><b>E<span>✦</span></b><div>EvalBench<small>PROMPT EVALUATION LAB</small></div></a><div class="workspace"><span class="workspace-icon">◈</span><div>Prompt Engineering<small>${server.storage ? 'Приватное серверное пространство' : 'Локальный черновик'}</small></div><i class="local-dot"></i></div><p class="nav-label">ЛАБОРАТОРИЯ</p><nav>${nav.map(([id, icon, label]) => `<button data-view="${id}" class="${view === id ? 'active' : ''}"><i>${icon}</i>${label}</button>`).join('')}</nav><div class="aside-bottom"><div class="privacy"><span>♧</span><div>Данные сохраняются<small>Версии, ответы, оценки и бюджет — в одном эксперименте.</small></div></div><a class="source-link" href="https://github.com/codexactivities/repo1/tree/main/evalbench" target="_blank" rel="noreferrer">Исходный код · GitHub ↗</a></div></aside><main><header><div class="breadcrumb">Workspace <span>/</span> ${nav.find(n => n[0] === view)?.[2]}</div><div class="version">v3.0 <span>EVAL WORKBENCH</span></div></header><div class="content"><div class="page-title"><div><p class="eyebrow">EVALBENCH / PROMPT LAB</p><h1>${nav.find(n => n[0] === view)?.[2]}</h1><p class="subtitle">${({ overview: 'От тестового набора до решения о выпуске.', dataset: 'Редактируйте входы, эталоны, теги и критерии.', prompts: 'Версии инструкций, параметры и предпросмотр сообщений.', judge: 'Программные проверки и модель как оценщик.', compare: 'Парное сравнение на одинаковых кейсах.', errors: 'Найдите причину ошибки и сохраните её в regression suite.', review: 'Слепая разметка и калибровка judge по человеку.', history: 'Снимки экспериментов и возобновляемая очередь.', settings: 'Подключение модели и прозрачный расчёт стоимости.' })[view]}</p></div>${btn('+ Новый прогон', 'new-run', 'primary')}</div>${['overview', 'errors', 'review'].includes(view) ? runBar(r) : ''}<div id="view-body">${r?.stub && ['overview', 'errors', 'review'].includes(view) ? '<p>Загружаю прогон…</p>' : ({ overview: overview, dataset: dataset, prompts: promptsView, judge: judgeView, compare: compareView, errors: errorsView, review: reviewView, history: historyView, settings: settingsView })[view]()}</div><footer><span>EvalBench · версии и результаты сохраняются независимо</span><span>${server.storage ? 'Сервер подключён' : 'Сервер не подключён'}</span></footer></div></main>`;
    bind();
    if (r?.stub && ['overview', 'errors', 'review'].includes(view))
        safe(async () => { await full(r.id); render(); })();
}
function runBar(r) { return `<div class="run-bar"><div class="run-label"><select id="active-run" aria-label="Текущий прогон">${opts(state.runs.map(x => [x.id, x.name]), active)}</select><span class="tag">${status(r)}</span></div><div class="button-group">${r?.cloud ? ['json', 'csv', 'jsonl', 'bundle'].map(f => `<a class="ghost small" href="/api/runs/${r.id}/export?format=${f}" download>${f.toUpperCase()}</a>`).join('') : btn('Экспорт JSON', 'local-export')}</div></div>${r?.demo ? '<div class="demo-note">Синтетические ответы и синтетический judge предназначены для проверки работы инструмента. Это не замер качества живой LLM.</div>' : ''}${r?.cloud && r.progress ? `<div class="queue"><div class="queue-title"><b>${r.progress.done} / ${r.progress.total} задач · ${r.status}</b><span>${r.progress.errors} ошибок · выполняется ${r.progress.running || 0}</span></div><progress value="${r.progress.done}" max="${r.progress.total}"></progress><div class="button-group">${btn('Продолжить', 'resume', 'ghost small')}${btn('Пауза', 'pause', 'ghost small')}${btn('Повторить ошибки', 'retry-errors', 'ghost small', r.progress.errors ? '' : 'disabled')}${btn('Лимиты', 'limits', 'ghost small')}${btn('Остановить', 'cancel', 'text-button danger')}</div>${r.stopReason ? `<p class="red">${esc(r.stopReason)}</p>` : ''}<small>Сохранён каждый ответ. Для дальнейшей обработки держите вкладку открытой или запустите CLI. Пауза не отменяет уже отправленный запрос.</small></div>` : ''}`; }
function overview() { const r = current(); if (!r)
    return '<p>Создайте прогон.</p>'; const a = stats(r, 'a'), b = stats(r, 'b'), g = gate(r, state.threshold); return `<div class="stats">${[['Качество A', pct(a.rate), `${a.passed} из ${a.graded} прошли`], ['Качество B', pct(b.rate), `${b.passed} из ${b.graded} прошли`], ['Регрессии', g.regressions, 'A проходит → B не проходит'], ['Стоимость', r.billing ? usd(r.billing.unknown ? null : r.billing.knownUsd) : usd(b.cost), r.billing ? `Учтено ${usd(r.billing.knownUsd)} · резерв ${usd(r.billing.heldUsd + r.billing.priorReservedUsd)}` : 'По данным импорта']].map(([l, v, n]) => `<div class="stat"><span>${l}</span><strong>${v}</strong><small>${n}</small></div>`).join('')}</div><div class="summary-grid">${panel('Срезы качества', `<div class="slice-chart">${[...new Set(r.cases.map(c => c.slice))].map(s => { const x = stats(r, 'a', s), y = stats(r, 'b', s); return `<div class="chart-row"><span>${esc(s)}</span><div><div class="bar-track"><div class="bar a" style="width:${(x.rate || 0) * 100}%"></div></div><div class="bar-track"><div class="bar b" style="width:${(y.rate || 0) * 100}%"></div></div></div><b>${pct(y.rate)}</b></div>`; }).join('')}</div><p class="help">Серый — A, зелёный — B. Повторы учитываются как отдельные ответы.</p>`)}${panel('Release gate', `<div class="gate-panel"><div class="gate-icon ${g.state}">${g.state === 'pass' ? '✓' : '!'}</div><h3>${g.label}</h3><p>Все ответы и оценки A/B должны быть готовы.<br>Ошибки и пропуски блокируют выпуск.</p><label>Порог B (%)<input id="threshold" type="number" min="0" max="100" value="${state.threshold}"></label></div>`)}</div>${panel('Ответы и проверки', resultTable(r), btn('Разобрать ошибки', 'to-errors'))}<p class="metrics-note">${r.cases.length} кейсов · ${r.repeats || 1} повторов · judge ${r.judge?.enabled ? 'включён' : 'выключен'} · задержка B ${num(b.latency)} мс. Стоимость неизвестна, пока нет usage и заданного тарифа.</p>`; }
function resultTable(r, errorsOnly = false) { const cs = r.cases.filter(c => (!query || JSON.stringify(c).toLowerCase().includes(query.toLowerCase())) && (tag === 'all' || c.tags?.includes(tag) || c.slice === tag) && (!errorsOnly || ['regression', 'failure', 'error'].includes(transition(r, c))) && (filter === 'all' || transition(r, c) === filter)); return `<div class="table-tools"><div class="search-group"><input id="result-search" value="${esc(query)}" placeholder="Поиск · Enter" aria-label="Поиск ответов"><select id="result-filter" aria-label="Результат">${opts([['all', 'Все результаты'], ['regression', 'Регрессии'], ['improvement', 'Улучшения'], ['failure', 'Ошибки правил'], ['error', 'Ошибки API'], ['ungraded', 'Без оценки']], filter)}</select><select id="result-tag" aria-label="Тег или срез">${opts([['all', 'Все теги'], ...[...new Set(r.cases.flatMap(c => [c.slice, ...(c.tags || [])]))].map(x => [x, x])], tag)}</select></div><label class="toggle">Повтор<select id="repeat" aria-label="Повтор">${opts(Array.from({ length: r.repeats || 1 }, (_, i) => [String(i), String(i + 1)]), String(repeat))}</select></label></div><div class="table-scroll"><table><thead><tr><th>КЕЙС</th><th>ТЕГИ</th><th>A</th><th>B</th><th>ИЗМЕНЕНИЕ</th><th></th></tr></thead><tbody>${cs.map(c => `<tr><td><strong>${esc(c.title)}</strong><small>${esc(c.id)}</small></td><td>${esc([c.slice, ...(c.tags || [])].join(' · '))}</td><td>${gradeBadge(grade(r, c, 'a', repeat))}</td><td>${gradeBadge(grade(r, c, 'b', repeat))}</td><td><span class="change ${transition(r, c)}">${transition(r, c)}</span></td><td><button class="text-button" data-detail="${esc(c.id)}">Разобрать →</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">По этим фильтрам кейсов нет.</td></tr>'}</tbody></table></div>`; }
function versionControl(key, kind) { return `<div class="version-controls">${input('Название версии', 'asset-name-' + key, state.assetNames[key])}<label>Сохранённая версия<select data-load-asset="${key}">${opts([['', 'Черновик'], ...assets.filter(a => kind === 'dataset' ? ['dataset', 'suite'].includes(a.kind) : a.kind === kind).map(a => [a.id, `${a.name} · v${a.version}`])], state.refs[key] || '')}</select></label><button class="ghost" data-save-asset="${key}">Сохранить новую версию</button><button class="text-button" data-diff-asset="${key}">Сравнить версии</button></div>`; }
function dataset() { const cs = state.cases.filter(c => !query || JSON.stringify(c).toLowerCase().includes(query.toLowerCase())); return `${versionControl('dataset', 'dataset')}<div class="toolbar">${btn('Сохранить таблицу', 'save-grid', 'primary')}${btn('+ Кейс', 'add-case')}${btn('Импорт CSV / JSONL', 'import-dataset')}${btn('Экспорт CSV', 'dataset-csv')}${btn('JSON-редактор', 'dataset-json')}<input id="dataset-search" placeholder="Поиск · Enter" aria-label="Поиск кейсов" value="${esc(query)}"></div><div class="bulk-bar"><span>Выбрано: ${selected.size}</span>${btn('Добавить теги', 'bulk-tags', 'text-button')}${btn('Добавить правило', 'bulk-rule', 'text-button')}${btn('Удалить выбранные', 'bulk-delete', 'text-button danger')}</div><section class="panel"><div class="table-scroll dataset-grid"><table><thead><tr><th><input type="checkbox" id="select-all" aria-label="Выбрать все"></th><th>ID / НАЗВАНИЕ</th><th>ПЕРЕМЕННЫЕ (JSON)</th><th>ЭТАЛОН</th><th>СРЕЗ / ТЕГИ</th><th>ПРАВИЛА</th></tr></thead><tbody>${cs.map(c => `<tr data-row="${esc(c.id)}"><td><input type="checkbox" data-select="${esc(c.id)}" ${selected.has(c.id) ? 'checked' : ''} aria-label="Выбрать ${esc(c.id)}"></td><td><input data-field="id" value="${esc(c.id)}" aria-label="ID ${esc(c.id)}"><input data-field="title" value="${esc(c.title)}" aria-label="Название ${esc(c.id)}"></td><td><textarea data-field="vars" rows="4" aria-label="Переменные ${esc(c.id)}">${esc(pretty(c.vars))}</textarea></td><td><textarea data-field="reference" rows="4" aria-label="Эталон ${esc(c.id)}">${esc(c.reference)}</textarea></td><td><input data-field="slice" value="${esc(c.slice)}" aria-label="Срез ${esc(c.id)}"><input data-field="tags" value="${esc(c.tags.join(', '))}" placeholder="Теги через запятую" aria-label="Теги ${esc(c.id)}"></td><td><button class="ghost small" data-rules="${esc(c.id)}">${c.rules.length} правил · изменить</button><small>${c.rules.map(r => esc(r.type)).join(', ')}</small><button class="text-button" data-clone="${esc(c.id)}">Дублировать</button></td></tr>`).join('')}</tbody></table></div></section><p class="help">Изменения ячеек проверяются и сохраняются при выходе из поля. CSV: id,title,slice,tags,vars,reference,rules или колонки var.question, var.context. Теги CSV разделяются символом |.</p>`; }
function promptsView() { return `<div class="prompt-grid">${['a', 'b'].map(s => { const p = state.prompts[s]; return `<section class="panel prompt-editor"><div class="panel-heading"><h2>Версия ${s.toUpperCase()}</h2></div><div class="panel-body">${versionControl(s, 'prompt')}${input('Имя промпта', 'prompt-' + s + '-name', p.name)}${input('Модель', 'prompt-' + s + '-model', p.model || provider.defaultModel || '')}${area('System', 'prompt-' + s + '-system', p.system, 4)}${area('User · {{переменная}}', 'prompt-' + s + '-user', p.user, 6)}${area('Few-shot · массив {user, assistant}', 'prompt-' + s + '-examples', pretty(p.examples), 4)}${area('JSON Schema ответа · null отключает', 'prompt-' + s + '-schema', pretty(p.schema), 4)}<div class="fields-row">${input('Макс. токенов', 'prompt-' + s + '-tokens', p.maxTokens, 'number', 'min="16" max="8192"')}${input('Temperature (пусто = default)', 'prompt-' + s + '-temperature', p.params.temperature ?? '', 'number', 'min="0" max="2" step="0.1"')}${input('Top p', 'prompt-' + s + '-top', p.params.top_p ?? '', 'number', 'min="0.01" max="1" step="0.01"')}</div>${input('Seed (пусто = default)', 'prompt-' + s + '-seed', p.params.seed ?? '', 'number')}</div></section>`; }).join('')}</div><div class="toolbar">${btn('Сохранить черновики', 'save-prompts', 'primary')}${btn('Показать отправляемые сообщения', 'preview-prompts')}${btn('Diff A ↔ B', 'prompt-diff')}</div><p class="help">JSON Schema всегда проверяет ответ как grader. Отправка schema в API включается отдельно в настройках совместимости провайдера. Оставьте неподдерживаемые temperature/top_p пустыми.</p>`; }
function judgeView() { const j = state.judge; return `<div class="summary-grid">${panel('LLM-as-a-judge', `<label class="toggle"><input id="judge-enabled" type="checkbox" ${j.enabled ? 'checked' : ''}> Оценивать каждый ответ моделью</label><p class="help">Judge получает вход, инструкцию, ответ и эталон. Каждый критерий оценивается 0–4 с объяснением. Итог — средневзвешенная доля; проходят и правила, и judge. Оценку judge проверяйте на человеческой разметке.</p>${versionControl('rubric', 'rubric')}${input('Модель judge', 'judge-model', j.model || provider.defaultModel || '')}<div class="fields-row">${input('Порог (0–1)', 'judge-threshold', j.threshold, 'number', 'min="0" max="1" step="0.05"')}${input('Макс. токенов judge', 'judge-tokens', j.maxTokens, 'number', 'min="128" max="4096"')}</div><div id="criteria-list">${j.criteria.map((c, i) => criterionRow(c, i)).join('')}</div><div class="toolbar">${btn('+ Критерий', 'add-criterion')}${btn('Сохранить оценщик', 'save-judge', 'primary')}</div>`)}${panel('Программные проверки', `<p>Правила задаются для каждого кейса в датасете.</p><dl class="rule-help"><dt>contains / notContains / exact</dt><dd>Наличие, отсутствие и точное совпадение.</dd><dt>JSON Schema / field</dt><dd>Типы, обязательные поля и содержимое JSON.</dd><dt>number</dt><dd>Ожидаемое число ± допуск; JSON path по желанию.</dd><dt>regex</dt><dd>RE2, флаги i/m/s; без backtracking.</dd><dt>reference</dt><dd>Сравнение с эталоном: exact, contains, json.</dd><dt>maxWords / json</dt><dd>Количество слов и строгий JSON.</dd></dl><p class="help">Неполный / невалидный ответ judge остаётся ошибкой. Он не превращается в PASS. Regex в Schema pattern не поддержан — добавьте отдельный regex grader.</p>`)}</div>`; }
function criterionRow(c, i) { return `<fieldset data-criterion="${i}"><legend>Критерий ${i + 1}</legend><div class="fields-row">${input('ID', 'criterion-id-' + i, c.id)}${input('Название', 'criterion-name-' + i, c.name)}${input('Вес', 'criterion-weight-' + i, c.weight, 'number', 'min="0.1" max="100" step="0.1"')}</div>${area('Описание: что считать хорошим ответом', 'criterion-desc-' + i, c.description, 3)}<button class="text-button danger" data-remove-criterion="${i}">Убрать критерий</button></fieldset>`; }
function errorsView() { if (!current()?.cases)
    return panel('Нет прогона', '<p>Создайте или откройте эксперимент.</p>'); return panel('Ошибки и регрессии', resultTable(current(), true), btn('Regression suites', 'suites')); }
function reviewCases() { const r = current(); if (!r?.cases)
    return []; return r.cases.filter(c => !unreviewed || !r.reviews?.[c.id]?.winner || r.reviews[c.id].winner === 'skip'); }
function reviewView() { if (!current()?.cases)
    return panel('Нет прогона', '<p>Создайте или откройте эксперимент.</p>'); const r = current(), cs = reviewCases(), c = cs[Math.min(reviewIndex, cs.length - 1)], cal = calibration(r); return `<div class="toolbar"><label class="toggle"><input id="blind" type="checkbox" ${blind ? 'checked' : ''}> Слепое сравнение</label><label class="toggle"><input id="unreviewed" type="checkbox" ${unreviewed ? 'checked' : ''}> Только неоценённые</label>${btn('Настроить шкалу следующего прогона', 'review-scale', 'text-button')}</div>${c ? reviewCard(r, c, cs) : panel('Очередь размечена', '<p>Новых кейсов нет. Снимите фильтр, чтобы пересмотреть оценки.</p>')}<div class="spacer"></div>${panel('Калибровка judge ↔ человек', `<p>Совпадение предпочтений: <b>${pct(cal.agreement)}</b> · ${cal.n} размеченных пар.</p><p class="help">Для пары сравнивается взвешенный score judge в первом повторе и выбор человека A/B/ничья. Это диагностика согласованности, а не гарантия корректности judge.</p>${cal.items.filter(x => !x.agree).map(x => `<p><button class="text-button" data-detail="${esc(x.id)}">${esc(x.id)}</button> · человек ${x.human}, judge ${x.judge}</p>`).join('') || '<p class="help">Расхождений на размеченных парах пока нет.</p>'}`)}`; }
function reviewCard(r, c, cs) { const sides = blind && hash(r.id + c.id) % 2 ? ['b', 'a'] : ['a', 'b'], rev = r.reviews?.[c.id] || {}; return `<div class="review-context"><p class="eyebrow">${reviewIndex + 1} / ${cs.length} · ${esc(c.id)}</p><h2>${esc(c.title)}</h2><pre>${esc(pretty(c.vars))}</pre></div><div class="prompt-grid">${sides.map((s, i) => `<section class="panel answer-card"><div class="panel-heading"><h2>${blind ? 'Ответ ' + (i + 1) : esc(r.prompts[s].name)}</h2></div><pre>${esc(r.results[c.id]?.[s]?.error || r.results[c.id]?.[s]?.text || 'Ответ не готов')}</pre></section>`).join('')}</div><section class="panel review-controls"><h2>Какой ответ лучше?</h2><div class="vote-options">${[[sides[0], '1 · Ответ 1'], ['tie', '2 · Ничья'], [sides[1], '3 · Ответ 2'], ['skip', 'S · Позже']].map(([s, l]) => `<button class="${rev.winner === s ? 'primary' : 'ghost'}" data-vote="${s}" data-case="${esc(c.id)}">${l}</button>`).join('')}</div><label>Общая оценка пары<select id="review-rating" data-case="${esc(c.id)}">${opts([['', 'Не оценено'], ...(r.reviewScale || ['Плохо', 'Частично', 'Хорошо', 'Отлично']).map((x, i) => [String(i), x])], rev.rating === undefined ? '' : String(rev.rating))}</select></label>${area('Комментарий', 'review-note', rev.note || '', 2)}<div class="review-nav">${btn('← Назад', 'prev-review')}<span>Горячие клавиши: 1 / 2 / 3 / S · J следующий · K предыдущий</span>${btn('Следующий →', 'next-review')}</div></section>`; }
function hash(s) { let h = 0; for (const c of s)
    h = (h * 31 + c.charCodeAt(0)) | 0; return h >>> 0; }
function historyView() { return panel('Сохранённые эксперименты', state.runs.map(r => { const b = r.stub ? r.summary.b : stats(r, 'b'); return `<div class="history-row"><div class="history-icon">◷</div><div><b>${esc(r.name)}</b><small>${new Date(r.createdAt).toLocaleString('ru-RU')} · ${status(r)} · ${r.cloud ? r.status : 'локальный'} · ${r.repeats || 1} повторов</small></div><strong>${pct(b.rate)}</strong><button class="ghost" data-open="${r.id}">Открыть</button><button class="text-button" data-baseline="${r.id}">Baseline</button><button class="text-button danger" data-archive="${r.id}">${r.cloud ? 'В архив' : 'Убрать'}</button></div>`; }).join(''), btn('Архив', 'archive') + btn('Импорт эксперимента', 'import-bundle')); }
function compareView() { return `${panel('Baseline и candidate', `<div class="compare-selectors"><label>Baseline<select id="compare-baseline">${opts(state.runs.map(r => [r.id, r.name]), compare.baseline)}</select></label><label>Сторона baseline<select id="compare-baseline-side">${opts([['a', 'A'], ['b', 'B']], compare.baselineSide)}</select></label><label>Candidate<select id="compare-candidate">${opts(state.runs.map(r => [r.id, r.name]), compare.candidate)}</select></label><label>Сторона candidate<select id="compare-candidate-side">${opts([['a', 'A'], ['b', 'B']], compare.candidateSide)}</select></label></div>${input('Тег / срез (пусто = все)', 'compare-tag', compare.tag === 'all' ? '' : compare.tag)}<div class="toolbar">${btn('Сравнить прогоны', 'compare-runs', 'primary')}${btn('Экспорт сравнения', 'compare-export', 'ghost', compareResult ? '' : 'disabled')}</div>`)}${compareResult ? comparisonHtml(compareResult) : '<p class="help">Сопоставляются одинаковые id, переменные, эталоны и правила. Пропуски и изменённые кейсы показываются отдельно. Доверительный интервал строится по кейсам, а не по зависимым повторам.</p>'}`; }
function comparisonHtml(x) { return `<div class="spacer"></div><div class="stats">${[['Baseline', pct(x.baseline)], ['Candidate', pct(x.candidate)], ['Δ качества', x.delta === null ? '—' : (x.delta * 100).toFixed(1) + ' п.п.'], ['Парные кейсы', x.paired]].map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>${panel(esc(x.verdict), `<p>95% CI Δ: <b>${x.ci ? x.ci.map(v => (v * 100).toFixed(1)).join(' … ') + ' п.п.' : 'недостаточно кейсов'}</b></p><p class="help">${esc(x.method)}</p><table><tr><th>МЕТРИКА</th><th>BASELINE</th><th>CANDIDATE</th></tr><tr><td>Средняя задержка (мс)</td><td>${num(x.baselineMetrics.latency)}</td><td>${num(x.candidateMetrics.latency)}</td></tr><tr><td>Стоимость ответов (USD)</td><td>${usd(x.baselineMetrics.cost)}</td><td>${usd(x.candidateMetrics.cost)}</td></tr><tr><td>SD качества по повторам</td><td>${pct(x.baselineMetrics.sd)}</td><td>${pct(x.candidateMetrics.sd)}</td></tr></table><p>Регрессии: ${esc(x.regressions.join(', ') || 'нет')} · Улучшения: ${esc(x.improvements.join(', ') || 'нет')}</p><details ${x.excluded.length ? 'open' : ''}><summary>Исключено: ${x.excluded.length}</summary>${x.excluded.map(c => `<p>${esc(c.id)} — ${esc(c.reason)}</p>`).join('')}</details>`)} `; }
function settingsView() { return `${panel('OpenAI-compatible Chat Completions API', `<p class="help">Ключ вводится здесь и передаётся на сервер по HTTPS. На сервере он шифруется AES-GCM; браузер и экспорт его не сохраняют. Доступ к приложению остаётся приватным.</p><p>Состояние: <b>${provider.configured ? 'ключ подключён (' + esc(provider.keySource) + ')' : 'ключ не задан'}</b> · хранилище ${provider.vaultReady ? 'готово' : 'не настроено'}</p>${input('Endpoint (полный HTTPS URL)', 'provider-endpoint', provider.endpoint || 'https://api.openai.com/v1/chat/completions')}${input('Модель по умолчанию', 'provider-model', provider.defaultModel || '')}${input('API key · пусто сохраняет текущий', 'provider-key', '', 'password', 'autocomplete="new-password"')}${area('Тарифы: USD за 1M токенов · {"model": {"input": 0, "output": 0}}', 'provider-pricing', pretty(provider.pricing || {}), 6)}<label class="toggle"><input id="provider-schema" type="checkbox" ${provider.structuredOutput ? 'checked' : ''}> API поддерживает response_format json_schema</label><div class="toolbar">${btn('Сохранить подключение', 'save-provider', 'primary')}${btn('Проверить · 1 короткий запрос', 'test-provider', 'ghost', provider.configured ? '' : 'disabled')}${btn('Удалить сохранённый ключ', 'clear-provider', 'text-button danger')}</div><p class="help">После проверки запустите пилот на 2–3 кейсах. Доступность конкретной модели, её параметры и тарифы определяет ваш провайдер. Без тарифов показываются токены, но не выдуманная цена.</p>`)}<div class="spacer"></div>${panel('Воспроизводимость и CLI', `<p>Скачайте BUNDLE из прогона: датасет, сообщения, параметры, rubric, ответы, usage, оценки и человеческая разметка сохраняются вместе.</p><pre>node cli/evalbench.mjs run --config examples/experiment.json --synthetic --out artifacts\nnode cli/evalbench.mjs compare --baseline RUN_ID --candidate RUN_ID --fail-on-regression</pre><p class="help">EVALBENCH_URL задаёт адрес этого приложения. Для приватного служебного доступа используйте EVALBENCH_TOKEN_FILE с токеном Sites. Ключ модели в CLI не нужен.</p>`)}`; }
function collectPrompts() { for (const s of ['a', 'b']) {
    const get = k => $('#prompt-' + s + '-' + k).value;
    const params = {};
    for (const [field, key] of [['temperature', 'temperature'], ['top', 'top_p'], ['seed', 'seed']])
        if (get(field) !== '')
            params[key] = Number(get(field));
    state.prompts[s] = normalizePrompt({ name: get('name'), model: get('model'), system: get('system'), user: get('user'), examples: JSON.parse(get('examples')), schema: JSON.parse(get('schema')), maxTokens: Number(get('tokens')), params });
    delete state.refs[s];
} persist(); }
function collectJudge() { const criteria = [...document.querySelectorAll('[data-criterion]')].map(el => { const i = el.dataset.criterion; return { id: $('#criterion-id-' + i).value, name: $('#criterion-name-' + i).value, description: $('#criterion-desc-' + i).value, weight: Number($('#criterion-weight-' + i).value) }; }); state.judge = normalizeJudge({ enabled: $('#judge-enabled').checked, model: $('#judge-model').value, threshold: Number($('#judge-threshold').value), maxTokens: Number($('#judge-tokens').value), criteria }); delete state.refs.rubric; persist(); }
function collectDataset() {
    const next = structuredClone(state.cases);
    for (const row of document.querySelectorAll('[data-row]')) {
        const i = state.cases.findIndex(c => c.id === row.dataset.row);
        if (i < 0)
            continue;
        for (const el of row.querySelectorAll('[data-field]')) {
            const f = el.dataset.field;
            next[i][f] = f === 'vars' ? JSON.parse(el.value) : f === 'tags' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : el.value;
        }
    }
    state.cases = validateCases(next);
    delete state.refs.dataset;
    persist();
}
async function saveAsset(key) { if (key === 'dataset')
    collectDataset(); if (view === 'prompts')
    collectPrompts(); if (key === 'rubric')
    collectJudge(); state.assetNames[key] = $('#asset-name-' + key).value; const kind = key === 'dataset' ? (state.assetKinds.dataset||'dataset') : key === 'rubric' ? 'rubric' : 'prompt', content = key === 'dataset' ? state.cases : key === 'rubric' ? state.judge : state.prompts[key]; const { asset } = await api('/assets', 'POST', { kind, name: state.assetNames[key], familyId: state.families[key], content }); state.refs[key] = asset.id; state.families[key] = asset.familyId; assets.unshift(asset); persist(); render(); toast('Сохранена неизменяемая версия v' + asset.version); }
function loadAsset(key, id) { const a = assets.find(x => x.id === id); if (!a) {
    delete state.refs[key];
    persist();
    return;
} if (key === 'dataset')
    state.cases = validateCases(a.content);
else if (key === 'rubric')
    state.judge = normalizeJudge(a.content);
else
    state.prompts[key] = normalizePrompt(a.content); state.refs[key] = a.id; state.families[key] = a.familyId;
    state.assetKinds[key] = a.kind; state.assetNames[key] = a.name; persist(); render(); }
function diffHtml(a, b) { const d = textDiff(a, b); return `<div class="diff">${d.parts.map(p => `<${p.type === 'del' ? 'del' : p.type === 'ins' ? 'ins' : 'span'}>${esc(p.text)}</${p.type === 'del' ? 'del' : p.type === 'ins' ? 'ins' : 'span'}>`).join('')}</div>${d.truncated ? '<p class="help">Diff ограничен первыми 400 токенами текста. Полные ответы доступны выше и в экспорте.</p>' : ''}`; }
function assetDiff(key) { const list = assets.filter(a => key === 'dataset' ? ['dataset', 'suite'].includes(a.kind) : a.kind === (key === 'rubric' ? 'rubric' : 'prompt')); modal('Сравнение сохранённых версий', `<div class="fields-row"><label>Ранняя версия<select id="diff-old">${opts(list.map(a => [a.id, `${a.name} v${a.version}`]), list[1]?.id)}</select></label><label>Новая версия<select id="diff-new">${opts(list.map(a => [a.id, `${a.name} v${a.version}`]), list[0]?.id)}</select></label></div><div id="asset-diff"></div>`, d => { const show = () => { const a = list.find(a => a.id === d.querySelector('#diff-old').value), b = list.find(a => a.id === d.querySelector('#diff-new').value); d.querySelector('#asset-diff').innerHTML = a && b ? diffHtml(pretty(a.content), pretty(b.content)) : 'Сохраните две версии.'; }; d.querySelectorAll('select').forEach(x => x.onchange = show); show(); }); }
function ruleEditor(id, bulk = false) {
    const c = state.cases.find(c => c.id === id);
    const rules = bulk ? [] : structuredClone(c.rules);
    modal(bulk ? 'Добавить правило выбранным кейсам' : 'Правила · ' + c.id, `<div id="rules-list"></div><fieldset><legend>Новое правило</legend><label>Тип<select id="rule-type">${opts(ruleTypes.map(t => [t, t]), 'contains')}</select></label><div id="rule-fields"></div><div class="toolbar">${btn('Добавить правило', 'add-rule', 'ghost')}</div></fieldset><div class="toolbar">${btn('Сохранить правила', 'commit-rules', 'primary')}</div>`, d => {
        const fields = () => { const t = d.querySelector('#rule-type').value; d.querySelector('#rule-fields').innerHTML = (['contains', 'notContains', 'exact'].includes(t) ? input('Ожидаемый текст', 'rule-value', '') : t === 'maxWords' ? input('Максимум слов', 'rule-value', 30, 'number') : t === 'jsonSchema' ? area('JSON Schema', 'rule-schema', pretty({ type: 'object', required: ['answer'], properties: { answer: { type: 'string' } }, additionalProperties: false }), 8) : t === 'regex' ? input('RE2 pattern', 'rule-pattern', '^OK$') + input('Флаги (i/m/s)', 'rule-flags', '') : t === 'number' ? input('Ожидаемое число', 'rule-value', 42, 'number', 'step="any"') + input('Допуск', 'rule-tolerance', .1, 'number', 'step="any" min="0"') + input('JSON path (пусто = весь ответ)', 'rule-path', '') : t === 'field' ? input('JSON path', 'rule-path', 'answer') + `<label>Оператор<select id="rule-op">${opts([['eq', 'Равно'], ['contains', 'Содержит'], ['exists', 'Существует']], 'eq')}</select></label>` + area('Ожидаемое значение (JSON)', 'rule-value', '"OK"', 2) : t === 'reference' ? `<label>Сравнение<select id="rule-mode">${opts([['exact', 'Точно'], ['contains', 'Содержит эталон'], ['json', 'JSON без учёта порядка ключей']], 'exact')}</select></label>` : '<p>Проверяет строгий JSON.</p>'); };
        const show = () => { d.querySelector('#rules-list').innerHTML = rules.map((r, i) => `<div class="rule-row"><code>${esc(JSON.stringify(r))}</code><button class="text-button danger" data-remove-rule="${i}">Удалить</button></div>`).join('') || '<p class="help">Без правил и judge ответ не имеет оценки.</p>'; d.querySelectorAll('[data-remove-rule]').forEach(b => b.onclick = () => { rules.splice(+b.dataset.removeRule, 1); show(); }); };
        d.querySelector('#rule-type').onchange = fields;
        fields();
        show();
        d.querySelector('[data-action="add-rule"]').onclick = safe(() => { const type = d.querySelector('#rule-type').value, get = id => d.querySelector('#rule-' + id)?.value; let r = { type }; if (['contains', 'notContains', 'exact'].includes(type))
            r.value = get('value'); if (type === 'maxWords')
            r.value = Number(get('value')); if (type === 'jsonSchema')
            r.schema = JSON.parse(get('schema')); if (type === 'regex') {
            r.pattern = get('pattern');
            r.flags = get('flags');
        } if (type === 'number') {
            r.value = Number(get('value'));
            r.tolerance = Number(get('tolerance'));
            if (get('path'))
                r.path = get('path');
        } if (type === 'field') {
            r.path = get('path');
            r.op = get('op');
            if (r.op !== 'exists')
                r.value = JSON.parse(get('value'));
        } if (type === 'reference')
            r.mode = get('mode'); validateCases([{ ...(c || state.cases[0]), reference: (c || state.cases[0]).reference || 'preview', rules: [r] }]); rules.push(r); show(); });
        d.querySelector('[data-action="commit-rules"]').onclick = safe(() => { state.cases = validateCases(state.cases.map(x => bulk && selected.has(x.id) ? { ...x, rules: [...x.rules, ...rules] } : x.id === id ? { ...x, rules } : x)); delete state.refs.dataset; persist(); d.close(); render(); toast('Правила сохранены'); });
    });
}
function datasetImport() { modal('Импорт набора тестов', `<p>CSV, JSONL или JSON. Весь набор проверяется до замены черновика.</p><label>Формат<select id="import-format">${opts([['csv', 'CSV'], ['jsonl', 'JSONL'], ['json', 'JSON']], 'csv')}</select></label><label>Файл<input type="file" id="dataset-file" accept=".csv,.jsonl,.json"></label>${area('Или вставьте данные', 'import-text', '', 12)}<div class="toolbar">${btn('Проверить и импортировать', 'commit-import', 'primary')}</div>`, d => { d.querySelector('#dataset-file').onchange = safe(async (e) => { const f = e.target.files[0]; if (f.size > 4000000)
    throw Error('Максимум 4 МБ.'); d.querySelector('#import-text').value = await f.text(); d.querySelector('#import-format').value = f.name.endsWith('.csv') ? 'csv' : f.name.endsWith('.jsonl') ? 'jsonl' : 'json'; }); d.querySelector('[data-action="commit-import"]').onclick = safe(() => { const cs = importDataset(d.querySelector('#import-text').value, d.querySelector('#import-format').value); state.cases = cs; state.refs.dataset = null; selected.clear(); persist(); d.close(); render(); toast(`Импортировано ${cs.length} кейсов`); }); }); }
function jsonDataset() { modal('JSON-редактор датасета', area('Массив кейсов', 'dataset-json', pretty(state.cases), 18) + btn('Проверить и сохранить', 'save-json', 'primary'), d => { d.querySelector('[data-action="save-json"]').onclick = safe(() => { state.cases = validateCases(JSON.parse(d.querySelector('#dataset-json').value)); delete state.refs.dataset; persist(); d.close(); render(); }); }); }
function detail(id) { const r = current(), c = r.cases.find(c => c.id === id); modal('Разбор · ' + c.title, `<p class="eyebrow">${esc(c.id)} · повтор ${repeat + 1}</p><details><summary>Вход, эталон и теги</summary><pre>${esc(pretty(c))}</pre></details><div class="prompt-grid">${['a', 'b'].map(s => { const result = (r.repetitions?.[repeat] || r.results)[c.id]?.[s], g = grade(r, c, s, repeat); return `<section class="answer-detail"><h3>${s.toUpperCase()} · ${esc(r.prompts[s].name)} ${gradeBadge(g)}</h3><pre>${esc(result?.error || result?.text || 'Ответ не готов')}</pre><div class="checks">${g.checks.map(k => `<p class="${k.pass ? 'green' : 'red'}">${k.pass ? '✓' : '×'} ${esc(k.type)}: ${esc(k.reason)}</p>`).join('')}</div>${g.judge ? `<h4>Judge · ${pct(g.judge.score)}</h4>${g.judge.criteria?.map(k => `<p><b>${esc(k.id)}: ${k.score}/4</b><br>${esc(k.reason)}</p>`).join('') || `<p class="red">${esc(g.judge.error)}</p>`}` : g.error ? `<p class="red">${esc(g.error)}</p>` : ''}<details><summary>Сообщения и метаданные</summary><pre>${esc(pretty({ messages: messages(r.prompts[s], c), result }))}</pre></details></section>`; }).join('')}</div><h3>Diff ответов</h3>${diffHtml((r.repetitions?.[repeat] || r.results)[c.id]?.a?.text || '', (r.repetitions?.[repeat] || r.results)[c.id]?.b?.text || '')}<fieldset><legend>Добавить в regression suite</legend><label>Набор<select id="suite-family">${opts([['', 'Новый набор'], ...latestAssets('suite').map(a => [a.familyId, a.name])], '')}</select></label>${input('Название нового набора', 'suite-name', 'Regression suite')}${btn('Сохранить кейс в suite', 'add-suite', 'primary', r.cloud ? '' : 'disabled')}</fieldset>`, d => { d.querySelector('[data-action="add-suite"]').onclick = safe(async () => { const { asset } = await api('/runs/' + r.id + '/regressions', 'POST', { caseId: c.id, familyId: d.querySelector('#suite-family').value || undefined, name: d.querySelector('#suite-name').value }); assets.unshift(asset); toast('Кейс сохранён в ' + asset.name + ' v' + asset.version); }); }); }
function latestAssets(kind) { const seen = new Set(); return assets.filter(a => { if (a.kind !== kind || seen.has(a.familyId))
    return false; seen.add(a.familyId); return true; }); }
function runConfig(d, pilot = false) { const type = d.querySelector('#run-provider').value; return { id: uid(), name: d.querySelector('#run-name').value + (pilot ? ' · pilot' : ''), provider: type, cases: pilot ? state.cases.slice(0, 3) : state.cases, prompts: state.prompts, judge: state.judge, repeats: Number(d.querySelector('#run-repeats').value), concurrency: Number(d.querySelector('#run-concurrency').value), maxRequests: Number(d.querySelector('#run-requests').value), budgetUsd: d.querySelector('#run-budget').value === '' ? null : Number(d.querySelector('#run-budget').value), assetRefs: type === 'synthetic' ? {} : { ...state.refs, ...(pilot ? { dataset: null } : {}) }, reviewScale: state.reviewScale, pilot }; }
function newRun() {
    if (view === 'prompts')
        collectPrompts();
    if (view === 'judge')
        collectJudge();
    let estimated = '';
    modal('Новый эксперимент', `${input('Название', 'run-name', 'Experiment · ' + new Date().toLocaleDateString('ru-RU'))}<label>Источник ответов<select id="run-provider">${opts([['model', 'Модель через серверный API'], ['synthetic', 'Синтетический приёмочный тест · 8 кейсов'], ['import', 'Импорт готовых ответов']], provider.configured ? 'model' : 'synthetic')}</select></label><div class="fields-row">${input('Повторов на кейс', 'run-repeats', 1, 'number', 'min="1" max="5"')}${input('Параллельность', 'run-concurrency', 2, 'number', 'min="1" max="8"')}${input('Лимит запросов', 'run-requests', 2000, 'number', 'min="1" max="10000"')}${input('Бюджет USD (пусто = без лимита)', 'run-budget', '', 'number', 'min="0.000001" step="0.01"')}</div><p class="help">Текущий датасет: ${state.cases.length} кейсов, judge ${state.judge.enabled ? 'включён' : 'выключен'}. Синтетический режим использует независимые 8 кейсов и фиксированные ответы. Все выбранные параметры сохраняются в снимке.</p><div id="run-estimate" class="info-box">Перед платным запуском рассчитайте объём. Пилот берёт первые 3 кейса.</div>${area('Импорт ответов: [{id,a:{text},b:{text}}]', 'run-import', '', 5)}<div class="toolbar">${btn('Рассчитать объём', 'estimate-run')}${btn('Пилот · 3 кейса', 'pilot-run')}${btn('Запустить', 'start-run', 'primary')}</div>`, d => {
        const signature = c => JSON.stringify({ ...c, id: null, name: null });
        d.querySelector('[data-action="estimate-run"]').onclick = safe(async () => { const config = runConfig(d); if (config.provider === 'import') {
            d.querySelector('#run-estimate').textContent = 'Импорт не отправляет запросов модели.';
            return;
        } const { estimate: e } = await api('/estimate', 'POST', config); estimated = signature(config); d.querySelector('#run-estimate').innerHTML = `<b>${e.requests} запросов</b> · вход ~${num(e.inputTokensEstimate)} токенов · максимум выхода ${num(e.outputTokensLimit)}<br>Оценка: ${usd(e.estimatedUsd)} · резерв: ${usd(e.reservedUsd)}<p class="help">${esc(e.note)}</p>`; });
        const start = pilot => safe(async () => {
            const config = runConfig(d, pilot);
            if (config.provider === 'model' && !provider.configured)
                throw Error('Сначала подключите ключ в разделе «Провайдер».');
            if (config.provider === 'model' && !pilot && estimated !== signature(config))
                throw Error('Рассчитайте объём для выбранных параметров перед запуском.');
            if (pilot && config.provider === 'model') {
                const { estimate: e } = await api('/estimate', 'POST', config);
                if (!d.dataset.pilotReady) {
                    d.dataset.pilotReady = signature(config);
                    d.querySelector('#run-estimate').textContent = `Пилот: ${config.cases.length} кейсов, ${e.requests} запросов. Оценка ${usd(e.estimatedUsd)}, резерв ${usd(e.reservedUsd)}. Нажмите «Пилот» ещё раз для запуска.`;
                    return;
                }
                if (d.dataset.pilotReady !== signature(config)) {
                    delete d.dataset.pilotReady;
                    throw Error('Параметры изменились. Рассчитайте пилот ещё раз.');
                }
            }
            if (config.provider === 'import')
                config.results = JSON.parse(d.querySelector('#run-import').value);
            const { run } = await api('/runs', 'POST', config);
            putRun(run);
            active = run.id;
            compare = { baseline: run.id, candidate: run.id, baselineSide: 'a', candidateSide: 'b', tag: 'all' };
            compareResult = null;
            view = 'overview';
            d.close();
            render();
            if (run.status === 'running')
                drive(run.id);
        });
        d.querySelector('[data-action="start-run"]').onclick = start(false);
        d.querySelector('[data-action="pilot-run"]').onclick = start(true);
    });
}
async function drive(id) { if (driveId)
    return; const driver = { id }; driveId = driver; busy = true; let stop = false; try {
    const r = await full(id);
    await Promise.all(Array.from({ length: r.concurrency || 2 }, async () => { while (!stop && driveId === driver) {
        const { run } = await api('/runs/' + id + '/advance', 'POST', {});
        if ((state.runs.find(r => r.id === id)?.progress?.done || 0) <= run.progress.done)
            putRun(run);
        if (active === id && ['overview', 'errors'].includes(view) && !$('#modal').open)
            render();
        if (run.status !== 'running')
            stop = true;
        else if (run.progress.running && run.progress.pending === 0)
            await new Promise(resolve => setTimeout(resolve, 350));
    } }));
    toast('Очередь: ' + current()?.status);
}
catch (e) {
    toast(e.message);
}
finally {
    if (driveId === driver) {
        driveId = null;
        busy = false;
    }
    render();
} }
async function control(action, data = {}) { const r = current(); if (!r?.cloud)
    throw Error('У этого прогона нет серверной очереди.'); const { run } = await api('/runs/' + r.id + '/control', 'POST', { action, ...data }); putRun(run); if (action === 'pause' || action === 'cancel')
    driveId = null; render(); if (['resume', 'retry-errors'].includes(action) && !driveId)
    drive(r.id); }
function limits() { const r = current(); modal('Лимиты очереди', input('Параллельность', 'limit-concurrency', r.concurrency, 'number', 'min="1" max="8"') + input('Лимит запросов (включая повторные попытки)', 'limit-requests', r.maxRequests, 'number', 'min="1" max="10000"') + input('Бюджет USD (пусто = без лимита)', 'limit-budget', r.budgetUsd ?? '', 'number', 'min="0.000001" step="0.01"') + '<p class="help">Сумма фактической стоимости и резервов проверяется перед каждым запросом. Если usage неизвестен, резерв сохраняется. Перезапуск ошибки может оплачиваться повторно.</p>' + btn('Сохранить лимиты', 'save-limits', 'primary'), d => { d.querySelector('[data-action="save-limits"]').onclick = safe(async () => { await control('limits', { concurrency: Number(d.querySelector('#limit-concurrency').value), maxRequests: Number(d.querySelector('#limit-requests').value), budgetUsd: d.querySelector('#limit-budget').value === '' ? null : Number(d.querySelector('#limit-budget').value) }); d.close(); }); }); }
async function reviewPatch(patch, cid) { const r = current(), c = cid || reviewCases()[Math.min(reviewIndex, reviewCases().length - 1)]?.id; if (!c)
    return; if (r.cloud) {
    putRun((await api('/runs/' + r.id, 'PATCH', { caseId: c, review: patch })).run);
}
else {
    r.reviews ||= {};
    r.reviews[c] = { ...r.reviews[c], ...patch };
    persist();
} }
async function vote(side, cid) { await saveReviewNote(); await reviewPatch({ winner: side }, cid); if (!unreviewed)
    reviewIndex = Math.min(reviewIndex + 1, reviewCases().length - 1); render(); }
async function saveReviewNote() { const el = $('#review-note'); if (el) {
    const c = reviewCases()[Math.min(reviewIndex, reviewCases().length - 1)];
    if (c && el.value !== (current().reviews?.[c.id]?.note || ''))
        await reviewPatch({ note: el.value }, c.id);
} }
function importBundle() { modal('Восстановить эксперимент', `<label>Bundle JSON<input type="file" id="bundle-file" accept=".json"></label>${area('Или вставьте содержимое bundle', 'bundle-text', '', 10)}${btn('Импортировать как новый прогон', 'commit-bundle', 'primary')}`, d => { d.querySelector('#bundle-file').onchange = safe(async (e) => { const f = e.target.files[0]; if (f.size > 4000000)
    throw Error('Максимум 4 МБ.'); d.querySelector('#bundle-text').value = await f.text(); }); d.querySelector('[data-action="commit-bundle"]').onclick = safe(async () => { const { run } = await api('/runs', 'POST', { id: uid(), bundle: JSON.parse(d.querySelector('#bundle-text').value) }); putRun(run); active = run.id; view = 'overview'; d.close(); render(); toast('Эксперимент восстановлен без вызовов моделей'); }); }); }
async function providerSave(clearKey = false) { const data = { endpoint: $('#provider-endpoint').value, defaultModel: $('#provider-model').value, pricing: JSON.parse($('#provider-pricing').value), structuredOutput: $('#provider-schema').checked, clearKey }; const key = $('#provider-key'); if (key.value && !clearKey)
    data.key = key.value; provider = (await api('/provider', 'POST', data)).provider; key.value = ''; render(); toast(clearKey ? 'Сохранённый ключ удалён' : 'Подключение сохранено'); }
const actions = {
    'new-run': newRun, 'to-errors': () => { view = 'errors'; render(); }, 'local-export': () => download('evalbench-experiment.json', pretty(current())),
    'add-case': () => { state.cases.push({ id: 'case-' + uid().slice(0, 8), title: 'Новый кейс', slice: 'Общее', tags: [], vars: { question: '' }, reference: '', rules: [] }); delete state.refs.dataset; persist(); render(); },
    'save-grid': () => { collectDataset(); render(); toast('Таблица сохранена'); }, 'import-dataset': datasetImport, 'dataset-json': jsonDataset, 'dataset-csv': () => download('dataset.csv', datasetCsv(state.cases), 'text/csv'),
    'bulk-delete': () => { if (!selected.size)
        throw Error('Выберите кейсы.'); const next = state.cases.filter(c => !selected.has(c.id)); state.cases = validateCases(next); selected.clear(); delete state.refs.dataset; persist(); render(); },
    'bulk-tags': () => { if (!selected.size)
        throw Error('Выберите кейсы.'); modal('Добавить теги выбранным кейсам', input('Теги через запятую', 'bulk-tag-input', '') + btn('Добавить', 'commit-tags', 'primary'), d => { d.querySelector('[data-action="commit-tags"]').onclick = safe(() => { const tags = d.querySelector('#bulk-tag-input').value.split(',').map(s => s.trim()).filter(Boolean); state.cases = validateCases(state.cases.map(c => selected.has(c.id) ? { ...c, tags: [...new Set([...c.tags, ...tags])] } : c)); delete state.refs.dataset; persist(); d.close(); render(); }); }); },
    'bulk-rule': () => { if (!selected.size)
        throw Error('Выберите кейсы.'); ruleEditor(null, true); },
    'save-prompts': () => { collectPrompts(); toast('Черновики сохранены'); }, 'preview-prompts': () => { collectPrompts(); modal('Сообщения перед отправкой', `<label>Кейс<select id="preview-case">${opts(state.cases.map(c => [c.id, c.title]), state.cases[0].id)}</select></label><div id="prompt-preview"></div>`, d => { const show = () => { const c = state.cases.find(c => c.id === d.querySelector('#preview-case').value); d.querySelector('#prompt-preview').innerHTML = `<div class="prompt-grid">${['a', 'b'].map(s => `<div><h3>${s.toUpperCase()}</h3><pre>${esc(pretty(messages(state.prompts[s], c)))}</pre></div>`).join('')}</div>`; }; d.querySelector('#preview-case').onchange = show; show(); }); },
    'prompt-diff': () => { collectPrompts(); modal('Diff A ↔ B', diffHtml(pretty(state.prompts.a), pretty(state.prompts.b))); },
    'save-judge': () => { collectJudge(); toast('Оценщик сохранён'); }, 'add-criterion': () => { collectJudge(); state.judge.criteria.push({ id: 'criterion' + (state.judge.criteria.length + 1), name: 'Критерий', description: 'Опишите проверяемое качество.', weight: 1 }); persist(); render(); },
    'compare-runs': async () => { compare = { baseline: $('#compare-baseline').value, candidate: $('#compare-candidate').value, baselineSide: $('#compare-baseline-side').value, candidateSide: $('#compare-candidate-side').value, tag: $('#compare-tag').value || 'all' }; const [a, b] = await Promise.all([full(compare.baseline), full(compare.candidate)]); compareResult = compareRuns(a, b, compare); render(); }, 'compare-export': () => download('comparison.json', pretty({ config: compare, comparison: compareResult })),
    'resume': () => control('resume'), 'pause': () => control('pause'), 'cancel': () => control('cancel'), 'retry-errors': () => control('retry-errors'), 'limits': limits,
    'prev-review': async () => { await saveReviewNote(); reviewIndex = Math.max(0, reviewIndex - 1); render(); }, 'next-review': async () => { await saveReviewNote(); reviewIndex = Math.min(reviewCases().length - 1, reviewIndex + 1); render(); },
    'review-scale': () => modal('Шкала для следующего прогона', area('Названия уровней, JSON-массив', 'scale-json', pretty(state.reviewScale || ['Плохо', 'Частично', 'Хорошо', 'Отлично']), 5) + btn('Сохранить шкалу', 'save-scale', 'primary'), d => { d.querySelector('[data-action="save-scale"]').onclick = safe(() => { const scale = JSON.parse(d.querySelector('#scale-json').value); if (!Array.isArray(scale) || scale.length < 2 || scale.length > 7 || scale.some(x => typeof x !== 'string' || !x.trim() || x.length > 50))
        throw Error('От 2 до 7 названий, до 50 символов.'); state.reviewScale = scale; persist(); d.close(); }); }),
    'save-provider': () => providerSave(), 'clear-provider': () => providerSave(true), 'test-provider': async () => { const data = await api('/provider/test', 'POST', {}); modal(data.ok ? 'Провайдер ответил' : 'Проверка не прошла', `<pre>${esc(pretty(data.result))}</pre><p class="help">Это один реальный запрос к сохранённому endpoint. Пилот поможет проверить ваши промпты и оценщики.</p>`); },
    'import-bundle': importBundle, 'suites': () => modal('Regression suites', latestAssets('suite').map(a => `<div class="history-row"><div><b>${esc(a.name)} · v${a.version}</b><small>${a.content.length} кейсов</small></div><button class="ghost" data-use-suite="${a.id}">Открыть в датасете</button></div>`).join('') || '<p>Откройте ошибочный кейс и сохраните его в suite.</p>', d => { d.querySelectorAll('[data-use-suite]').forEach(b => b.onclick = () => { loadAsset('dataset', b.dataset.useSuite); view = 'dataset'; d.close(); render(); }); }),
    'archive': async () => { const { runs } = await api('/runs?archived=1'); modal('Архив', runs.map(r => `<div class="history-row"><div>${esc(r.name)}</div><button class="ghost" data-restore="${r.id}">Восстановить</button></div>`).join('') || '<p>Архив пуст.</p>', d => { d.querySelectorAll('[data-restore]').forEach(b => b.onclick = safe(async () => { await api('/runs/' + b.dataset.restore, 'PATCH', { archived: false }); await refresh(); d.close(); render(); })); }); },
};
function bind() {
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = safe(async () => { await saveReviewNote(); view = b.dataset.view; query = ''; tag = 'all'; filter = 'all'; reviewIndex = 0; render(); }));
    document.querySelectorAll('#app [data-action]').forEach(b => b.onclick = safe(() => actions[b.dataset.action]?.()));
    document.querySelectorAll('[data-save-asset]').forEach(b => b.onclick = safe(() => saveAsset(b.dataset.saveAsset)));
    document.querySelectorAll('[data-load-asset]').forEach(b => b.onchange = safe(() => loadAsset(b.dataset.loadAsset, b.value)));
    document.querySelectorAll('[data-diff-asset]').forEach(b => b.onclick = () => assetDiff(b.dataset.diffAsset));
    document.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => detail(b.dataset.detail));
    document.querySelectorAll('[data-rules]').forEach(b => b.onclick = () => ruleEditor(b.dataset.rules));
    document.querySelectorAll('[data-clone]').forEach(b => b.onclick = () => { const c = state.cases.find(c => c.id === b.dataset.clone); state.cases.push({ ...structuredClone(c), id: c.id + '-' + uid().slice(0, 5) }); delete state.refs.dataset; persist(); render(); });
    document.querySelectorAll('[data-select]').forEach(b => b.onchange = () => { if (b.checked)
        selected.add(b.dataset.select);
    else
        selected.delete(b.dataset.select); const label = $('.bulk-bar span'); if (label)
        label.textContent = 'Выбрано: ' + selected.size; });
    if ($('#select-all'))
        $('#select-all').onchange = e => { document.querySelectorAll('[data-select]').forEach(b => { b.checked = e.target.checked; if (b.checked)
            selected.add(b.dataset.select);
        else
            selected.delete(b.dataset.select); }); $('.bulk-bar span').textContent = 'Выбрано: ' + selected.size; };
    document.querySelectorAll('[data-field]').forEach(el => el.onchange = safe(() => { const row = el.closest('[data-row]'), id = row.dataset.row, index = state.cases.findIndex(c => c.id === id), c = structuredClone(state.cases[index]), field = el.dataset.field; c[field] = field === 'vars' ? JSON.parse(el.value) : field === 'tags' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : el.value; const next = [...state.cases]; next[index] = c; state.cases = validateCases(next); if (field === 'id') {
        row.dataset.row = c.id;
        row.querySelectorAll('[data-rules],[data-clone],[data-select]').forEach(b => { for (const attr of ['rules', 'clone', 'select'])
            if (b.dataset[attr])
                b.dataset[attr] = c.id; });
    } delete state.refs.dataset; persist(); el.classList.remove('invalid'); toast('Кейс сохранён'); }));
    document.querySelectorAll('[data-remove-criterion]').forEach(b => b.onclick = safe(() => { collectJudge(); if (state.judge.criteria.length === 1)
        throw Error('Нужен хотя бы один критерий.'); state.judge.criteria.splice(+b.dataset.removeCriterion, 1); persist(); render(); }));
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = safe(async () => { active = b.dataset.open; await full(active); view = 'overview'; render(); }));
    document.querySelectorAll('[data-baseline]').forEach(b => b.onclick = () => { compare.baseline = b.dataset.baseline; compare.candidate = active; compare.baselineSide = 'b'; compare.candidateSide = 'b'; view = 'compare'; compareResult = null; render(); });
    document.querySelectorAll('[data-archive]').forEach(b => b.onclick = safe(async () => { const r = state.runs.find(r => r.id === b.dataset.archive); if (r.cloud)
        await api('/runs/' + r.id, 'PATCH', { archived: true }); state.runs = state.runs.filter(x => x.id !== r.id); if (active === r.id)
        active = state.runs[0]?.id; persist(); render(); }));
    document.querySelectorAll('[data-vote]').forEach(b => b.onclick = safe(() => vote(b.dataset.vote, b.dataset.case)));
    if ($('#active-run'))
        $('#active-run').onchange = safe(async (e) => { active = e.target.value; repeat = 0; reviewIndex = 0; await full(active); render(); });
    for (const id of ['result-search', 'dataset-search'])
        if ($('#' + id))
            $('#' + id).onchange = e => { query = e.target.value; render(); };
    if ($('#result-filter'))
        $('#result-filter').onchange = e => { filter = e.target.value; render(); };
    if ($('#result-tag'))
        $('#result-tag').onchange = e => { tag = e.target.value; render(); };
    if ($('#repeat'))
        $('#repeat').onchange = e => { repeat = +e.target.value; render(); };
    if ($('#threshold'))
        $('#threshold').onchange = e => { const v = +e.target.value; if (v < 0 || v > 100)
            return; state.threshold = v; persist(); render(); };
    if ($('#blind'))
        $('#blind').onchange = safe(async (e) => { await saveReviewNote(); blind = e.target.checked; render(); });
    if ($('#unreviewed'))
        $('#unreviewed').onchange = safe(async (e) => { await saveReviewNote(); unreviewed = e.target.checked; reviewIndex = 0; render(); });
    if ($('#review-note'))
        $('#review-note').onchange = safe(saveReviewNote);
    if ($('#review-rating'))
        $('#review-rating').onchange = safe(async (e) => { if (e.target.value !== '')
            await reviewPatch({ rating: +e.target.value }, e.target.dataset.case); toast('Оценка сохранена'); });
}
document.addEventListener('keydown', safe(async (e) => { if (view !== 'review' || $('#modal').open || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))
    return; const key = e.key.toLowerCase(); if (['1', '2', '3', 's'].includes(key)) {
    e.preventDefault();
    const index = key === 's' ? 3 : +key - 1;
    document.querySelectorAll('[data-vote]')[index]?.click();
}
else if (key === 'j' || key === 'k') {
    e.preventDefault();
    await actions[key === 'j' ? 'next-review' : 'prev-review']();
} }));
render();
safe(async () => { server = await api('/health'); if (server.storage) {
    provider = (await api('/provider')).provider;
    await refresh();
    if (!state.runs.some(r => r.id === active) || state.runs.find(r => r.cloud)) {
        active = state.runs.find(r => r.cloud)?.id || state.runs[0]?.id;
        await full(active);
    }
    compare.baseline = active;
    compare.candidate = active;
    render();
} })();
