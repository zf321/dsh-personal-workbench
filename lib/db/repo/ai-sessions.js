import { nowIso } from '../repo.js';
function parseAiSession(row) {
    if (row === undefined)
        return undefined;
    return {
        scopeCode: row.scope_code,
        anchor: row.anchor,
        sessionId: row.session_id,
        workspace: row.workspace,
        note: row.note,
        createdAt: row.created_at,
        lastActivityAt: row.last_activity_at,
    };
}
export function getAiSession(db, scopeCode, anchor) {
    return parseAiSession(db.prepare('SELECT * FROM ai_session_registry WHERE scope_code = ? AND anchor = ?').get(scopeCode, anchor));
}
/** 登记或刷新复用型 AI 会话；同 scope+anchor 只保留一条。 */
export function registerAiSession(db, input, at = nowIso()) {
    const existing = getAiSession(db, input.scopeCode, input.anchor);
    const createdAt = existing?.createdAt ?? at;
    db.prepare(`
    INSERT INTO ai_session_registry (scope_code, anchor, session_id, workspace, note, created_at, last_activity_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope_code, anchor) DO UPDATE SET
      session_id = excluded.session_id,
      workspace = excluded.workspace,
      note = excluded.note,
      last_activity_at = excluded.last_activity_at
  `).run(input.scopeCode, input.anchor, input.sessionId, input.workspace ?? null, input.note ?? null, createdAt, at);
    return getAiSession(db, input.scopeCode, input.anchor);
}
