import { Validator, format as schemaFormats } from '@cfworker/json-schema';
import { RE2JS } from 're2js';
export const ruleTypes = ['contains', 'notContains', 'exact', 'json', 'maxWords', 'jsonSchema', 'field', 'number', 'reference', 'regex'];
export function regex(pattern, flags = '') {
    if (typeof pattern !== 'string' || pattern.length > 1000 || !/^[ims]*$/.test(flags))
        throw Error('Regex: шаблон до 1000 символов, флаги i/m/s.');
    return RE2JS.compile(pattern, (flags.includes('i') ? RE2JS.CASE_INSENSITIVE : 0) | (flags.includes('m') ? RE2JS.MULTILINE : 0) | (flags.includes('s') ? RE2JS.DOTALL : 0));
}
/** Explicitly supported JSON Schema 2020-12 keywords; reject unknown constraints instead of silently passing. */
export function validateSchema(schema) {
    const encoded = JSON.stringify(schema);
    if (encoded === undefined || encoded.length > 30000)
        throw Error('JSON Schema: максимум 30 000 символов.');
    const maps = ['properties', '$defs', 'definitions', 'dependentSchemas'];
    const singles = ['items', 'contains', 'additionalProperties', 'unevaluatedProperties', 'unevaluatedItems', 'propertyNames', 'not', 'if', 'then', 'else'];
    const arrays = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
    const annotations = ['title', 'description', 'default', 'examples', '$comment', '$id', '$anchor', 'readOnly', 'writeOnly', 'deprecated'];
    const numeric = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'];
    const counts = ['minLength', 'maxLength', 'minItems', 'maxItems', 'minContains', 'maxContains', 'minProperties', 'maxProperties'];
    const known = new Set([...maps, ...singles, ...arrays, ...annotations, ...numeric, ...counts, 'type', 'required', 'enum', 'const', 'uniqueItems', 'dependentRequired', 'format', '$schema', '$ref']);
    function walk(x, depth = 0, refs = []) {
        if (depth > 25)
            throw Error('Слишком глубокая или рекурсивная JSON Schema.');
        if (typeof x === 'boolean')
            return;
        if (!x || typeof x !== 'object' || Array.isArray(x))
            throw Error('JSON Schema должна быть объектом или boolean.');
        for (const k of Object.keys(x))
            if (!known.has(k)) {
                if (k === 'pattern' || k === 'patternProperties')
                    throw Error('Schema pattern не поддержан: используйте отдельное правило regex (RE2).');
                throw Error('Неподдерживаемое ключевое слово JSON Schema: ' + k);
            }
        if (x.$schema && x.$schema !== 'https://json-schema.org/draft/2020-12/schema')
            throw Error('Поддерживается JSON Schema draft 2020-12.');
        if (x.type !== undefined && ![x.type].flat().every(t => ['object', 'array', 'number', 'integer', 'string', 'boolean', 'null'].includes(t)))
            throw Error('Неизвестный type в JSON Schema.');
        if (Array.isArray(x.type) && (!x.type.length || new Set(x.type).size !== x.type.length))
            throw Error('type: непустой массив уникальных типов.');
        if (x.required !== undefined && (!Array.isArray(x.required) || x.required.some(s => typeof s !== 'string') || new Set(x.required).size !== x.required.length))
            throw Error('required должен быть массивом уникальных строк.');
        if (x.enum !== undefined && (!Array.isArray(x.enum) || !x.enum.length || new Set(x.enum.map(stable)).size !== x.enum.length))
            throw Error('enum: непустой массив уникальных значений.');
        if (x.uniqueItems !== undefined && typeof x.uniqueItems !== 'boolean')
            throw Error('uniqueItems: boolean.');
        for (const k of numeric)
            if (x[k] !== undefined && (!Number.isFinite(x[k]) || (k === 'multipleOf' && x[k] <= 0)))
                throw Error(k + ': неверное число.');
        for (const k of counts)
            if (x[k] !== undefined && (!Number.isInteger(x[k]) || x[k] < 0))
                throw Error(k + ': неотрицательное целое.');
        if (x.format !== undefined && (!Object.hasOwn(schemaFormats, x.format) || x.format === 'regex'))
            throw Error('Неизвестный или неподдерживаемый format: ' + x.format);
        if (x.dependentRequired !== undefined) {
            if (!x.dependentRequired || typeof x.dependentRequired !== 'object' || Array.isArray(x.dependentRequired) || Object.values(x.dependentRequired).some(a => !Array.isArray(a) || a.some(v => typeof v !== 'string')))
                throw Error('dependentRequired: объект массивов строк.');
        }
        if (x.$ref !== undefined) {
            if (typeof x.$ref !== 'string' || !x.$ref.startsWith('#/') || refs.includes(x.$ref))
                throw Error('Допустимы только локальные нерекурсивные $ref.');
            const target = pointer(schema, x.$ref.slice(1));
            if (target === undefined)
                throw Error('Не найдена ссылка ' + x.$ref);
            walk(target, depth + 1, [...refs, x.$ref]);
        }
        for (const k of maps)
            if (x[k] !== undefined) {
                if (!x[k] || typeof x[k] !== 'object' || Array.isArray(x[k]))
                    throw Error(k + ': нужен объект схем.');
                Object.values(x[k]).forEach(v => walk(v, depth + 1, refs));
            }
        for (const k of singles)
            if (x[k] !== undefined)
                walk(x[k], depth + 1, refs);
        for (const k of arrays)
            if (x[k] !== undefined) {
                if (!Array.isArray(x[k]) || !x[k].length)
                    throw Error(k + ': непустой массив схем.');
                x[k].forEach(v => walk(v, depth + 1, refs));
            }
    }
    walk(schema);
    new Validator(schema, '2020-12', false);
    return schema;
}
export function pointer(value, path = '') {
    if (!path)
        return value;
    const keys = path.startsWith('/') ? path.slice(1).split('/').map(k => k.replaceAll('~1', '/').replaceAll('~0', '~')) : path.split('.');
    for (const k of keys) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, k))
            return undefined;
        value = value[k];
    }
    return value;
}
export function validateRule(r) {
    if (!r || !ruleTypes.includes(r.type))
        throw Error('Неизвестное правило оценки.');
    if (['contains', 'notContains', 'exact'].includes(r.type) && (typeof r.value !== 'string' || !r.value.trim()))
        throw Error('У правила требуется непустой value.');
    if (r.type === 'maxWords' && (!Number.isInteger(r.value) || r.value < 1))
        throw Error('maxWords: положительное целое.');
    if (r.type === 'jsonSchema')
        validateSchema(r.schema);
    if (r.type === 'regex')
        regex(r.pattern, r.flags);
    if (r.type === 'field' && (typeof r.path !== 'string' || !r.path || !['eq', 'contains', 'exists'].includes(r.op || 'eq')))
        throw Error('field: нужны path и op eq/contains/exists.');
    if (r.type === 'number' && (!Number.isFinite(r.value) || !Number.isFinite(r.tolerance ?? 0) || (r.tolerance ?? 0) < 0))
        throw Error('number: нужны числовые value и неотрицательный tolerance.');
    if (r.type === 'reference' && !['exact', 'contains', 'json'].includes(r.mode || 'exact'))
        throw Error('reference: mode exact/contains/json.');
    return structuredClone(r);
}
const equal = (a, b) => stable(a) === stable(b);
export function stable(value) { if (Array.isArray(value))
    return '[' + value.map(stable).join(',') + ']'; if (value && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}'; return JSON.stringify(value); }
export function evaluateRules(text, rules = [], c = {}) {
    if (typeof text !== 'string')
        return { pass: null, score: null, checks: [] };
    const checks = rules.map(r => {
        let pass = false, reason = '';
        try {
            const low = text.toLocaleLowerCase(), v = String(r.value ?? '').toLocaleLowerCase();
            if (r.type === 'contains')
                pass = low.includes(v);
            if (r.type === 'notContains')
                pass = !low.includes(v);
            if (r.type === 'exact')
                pass = text.trim() === String(r.value).trim();
            if (r.type === 'json') {
                JSON.parse(text);
                pass = true;
            }
            if (r.type === 'maxWords')
                pass = (text.trim() ? text.trim().split(/\s+/u).length : 0) <= r.value;
            if (r.type === 'regex')
                pass = regex(r.pattern, r.flags).matcher(text).find();
            if (r.type === 'jsonSchema') {
                const result = new Validator(validateSchema(r.schema), '2020-12', false).validate(JSON.parse(text));
                pass = result.valid;
                reason = result.errors?.slice(0, 3).map(e => e.error).join('; ') || '';
            }
            if (r.type === 'field') {
                const val = pointer(JSON.parse(text), r.path);
                pass = r.op === 'exists' ? val !== undefined : r.op === 'contains' ? typeof val === 'string' && val.includes(String(r.value)) : equal(val, r.value);
                reason = 'Поле ' + r.path;
            }
            if (r.type === 'number') {
                const val = r.path ? pointer(JSON.parse(text), r.path) : Number(text.trim());
                pass = (r.path || text.trim() !== '') && typeof val === 'number' && Number.isFinite(val) && Math.abs(val - r.value) <= (r.tolerance ?? 0);
                reason = `Ожидается ${r.value} ± ${r.tolerance ?? 0}`;
            }
            if (r.type === 'reference') {
                if (!String(c.reference ?? '').trim())
                    throw Error('Нет эталона');
                pass = r.mode === 'json' ? equal(JSON.parse(text), JSON.parse(c.reference)) : r.mode === 'contains' ? text.includes(c.reference) : text.trim() === c.reference.trim();
            }
        }
        catch (e) {
            reason = e.message.slice(0, 250);
        }
        return { ...r, pass, reason: reason || (pass ? 'Соответствует правилу' : 'Не соответствует правилу') };
    });
    return { pass: checks.length ? checks.every(c => c.pass) : null, score: checks.length ? checks.filter(c => c.pass).length / checks.length : null, checks };
}
export function grade(run, c, side, repeat = 0) {
    const result = (run.repetitions?.[repeat] || run.results || {})[c.id]?.[side];
    if (result?.error)
        return { pass: null, score: null, checks: [], error: result.error };
    const rules = [...c.rules];
    const schema = run.prompts?.[side]?.schema;
    if (schema !== undefined && schema !== null && !rules.some(r => r.type === 'jsonSchema' && stable(r.schema) === stable(schema)))
        rules.push({ type: 'jsonSchema', schema });
    const base = evaluateRules(result?.text, rules, c);
    if (!run.judge?.enabled)
        return base;
    const judge = run.judgments?.[repeat]?.[c.id]?.[side];
    if (!judge) return {...base,pass:null,score:null,pending:'Ожидается judge'};
    if (judge.error) return { ...base, pass:null, score:null, judge, error:judge.error };
    return { ...base, pass: base.pass === null ? judge.pass : base.pass && judge.pass, score: judge.score, judge };
}
