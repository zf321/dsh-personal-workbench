import { nowIso } from '../repo.js';
export function listDictionaries(db, kind) {
    const rows = (kind === undefined
        ? db.prepare('SELECT * FROM dictionaries ORDER BY kind, sort_order, code').all()
        : db.prepare('SELECT * FROM dictionaries WHERE kind = ? ORDER BY sort_order, code').all(kind));
    return rows.map((row) => ({
        kind: row.kind,
        code: row.code,
        name: row.name,
        config: JSON.parse(row.config),
        builtin: row.builtin,
        active: row.active,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
}
export function getDictionary(db, kind, code) {
    return listDictionaries(db, kind).find((entry) => entry.code === code);
}
export function createDictionaryEntry(db, input, at = nowIso()) {
    const kind = input.kind.trim();
    const code = input.code.trim();
    const name = input.name.trim();
    if (kind === '')
        throw new Error('kind is required');
    if (code === '')
        throw new Error('code is required');
    if (!/^[a-z][a-z0-9_]*$/.test(code))
        throw new Error('code 必须是小写字母开头，只能包含小写字母/数字/下划线');
    if (name === '')
        throw new Error('name is required');
    if (getDictionary(db, kind, code) !== undefined)
        throw new Error(`code "${code}" 已存在`);
    const config = input.config ?? {};
    const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0;
    const builtin = input.builtin === 1 || input.builtin === true ? 1 : 0;
    const active = input.active === 0 || input.active === false ? 0 : 1;
    db.prepare(`
    INSERT INTO dictionaries (kind, code, name, config, builtin, active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(kind, code, name, JSON.stringify(config), builtin, active, sortOrder, at, at);
    return getDictionary(db, kind, code);
}
export function updateDictionaryEntry(db, kind, code, input, at = nowIso()) {
    const existing = getDictionary(db, kind, code);
    if (existing === undefined)
        throw new Error(`dictionary ${kind}/${code} not found`);
    const name = input.name !== undefined ? input.name.trim() : existing.name;
    if (name === '')
        throw new Error('name is required');
    const config = input.config !== undefined ? input.config : existing.config;
    const sortOrder = input.sortOrder !== undefined ? Number(input.sortOrder) : existing.sortOrder;
    if (!Number.isFinite(sortOrder))
        throw new Error('sortOrder must be a number');
    const active = input.active !== undefined ? (input.active === 0 || input.active === false ? 0 : 1) : existing.active;
    db.prepare('UPDATE dictionaries SET name = ?, config = ?, sort_order = ?, active = ?, updated_at = ? WHERE kind = ? AND code = ?')
        .run(name, JSON.stringify(config), sortOrder, active, at, kind, code);
    return getDictionary(db, kind, code);
}
export function deleteDictionaryEntry(db, kind, code) {
    const existing = getDictionary(db, kind, code);
    if (existing === undefined)
        throw new Error(`dictionary ${kind}/${code} not found`);
    if (existing.builtin === 1)
        throw new Error(`内置字典项 ${code} 受保护，不能删除`);
    const usage = dictionaryUsageCount(db, kind, code);
    if (usage > 0)
        throw new Error(`字典项 ${code} 已被 ${usage} 条数据使用，请先停用或改绑后再删除`);
    db.prepare('DELETE FROM dictionaries WHERE kind = ? AND code = ?').run(kind, code);
}
export function dictionaryUsageCount(db, kind, code) {
    switch (kind) {
        case 'type': return Number(db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE type_code = ?').get(code).c);
        case 'status': return Number(db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE status_code = ?').get(code).c);
        case 'priority': return Number(db.prepare('SELECT COUNT(*) AS c FROM tasks WHERE priority_code = ?').get(code).c);
        case 'idea_kind': return Number(db.prepare('SELECT COUNT(*) AS c FROM ideas WHERE kind_code = ?').get(code).c);
        case 'knowledge_kind': return Number(db.prepare('SELECT COUNT(*) AS c FROM knowledge_entries WHERE kind_code = ?').get(code).c);
        default: return 0;
    }
}
