/**
 * 任务提醒域（到期扫描的读取、提醒方式与触发标记）。
 *
 * 从 repo.ts 原样抽出（行为不变）。对外符号由 repo.ts 再导出。
 * 注意：effectiveDueAtForTask 属于任务原语，仍由 repo.ts 提供。
 */
import { randomUUID } from 'node:crypto';
import { nowIso, effectiveDueAtForTask } from '../repo.js';
export function listDueReminders(db, now = new Date()) {
    const rows = db.prepare(`
    SELECT r.id AS reminder_id, r.task_id, r.offset_minutes, r.method_code,
           t.title, t.due_at, t.parent_id
    FROM task_reminders r
    JOIN tasks t ON t.id = r.task_id
    WHERE r.enabled = 1 AND r.fired_at IS NULL
      AND t.archived = 0
      AND t.status_code NOT IN ('done', 'cancelled')
  `).all();
    const nowMs = now.getTime();
    const candidates = rows
        .map((row) => {
        const effectiveDueAt = effectiveDueAtForTask(db, { id: row.task_id, parentId: row.parent_id, dueAt: row.due_at });
        return { ...row, effectiveDueAt };
    })
        .filter((row) => row.effectiveDueAt !== null);
    return candidates
        .filter((row) => {
        const dueMs = Date.parse(row.effectiveDueAt);
        if (!Number.isFinite(dueMs))
            return false;
        return nowMs >= dueMs - row.offset_minutes * 60_000;
    })
        .map((row) => ({
        reminderId: row.reminder_id,
        taskId: row.task_id,
        title: row.title,
        dueAt: row.effectiveDueAt,
        offsetMinutes: row.offset_minutes,
        methodCode: row.method_code,
    }));
}
export function listReminders(db, taskId) {
    const rows = db.prepare('SELECT * FROM task_reminders WHERE task_id = ? ORDER BY created_at').all(taskId);
    return rows.map((row) => ({
        id: row.id,
        taskId: row.task_id,
        offsetMinutes: row.offset_minutes,
        methodCode: row.method_code,
        enabled: row.enabled,
        firedAt: row.fired_at,
        createdAt: row.created_at,
    }));
}
export function fireReminder(db, reminderId, at = nowIso()) {
    db.prepare('UPDATE task_reminders SET fired_at = ? WHERE id = ?').run(at, reminderId);
}
export function addReminder(db, taskId, offsetMinutes, methodCode = 'browser', at = nowIso()) {
    const id = randomUUID();
    db.prepare(`
    INSERT INTO task_reminders (id, task_id, offset_minutes, method_code, enabled, fired_at, created_at)
    VALUES (?, ?, ?, ?, 1, NULL, ?)
  `).run(id, taskId, offsetMinutes, methodCode, at);
    return id;
}
