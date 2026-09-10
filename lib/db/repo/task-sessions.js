import { nowIso, appendEvent } from '../repo.js';
export function linkTaskSession(db, input, at = nowIso()) {
    db.prepare(`
    INSERT INTO task_sessions (task_id, session_id, role_code, workspace, note, created_at, last_activity_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(task_id, session_id, role_code) DO UPDATE SET last_activity_at = excluded.last_activity_at
  `).run(input.taskId, input.sessionId, input.roleCode, input.workspace ?? null, input.note ?? null, at, at);
    appendEvent(db, input.taskId, 'session_linked', { actor: 'system', note: `${input.roleCode}:${input.sessionId}`, at });
}
export function listTaskSessions(db, taskId) {
    return db.prepare('SELECT * FROM task_sessions WHERE task_id = ? ORDER BY created_at').all(taskId);
}
