/**
 * 提醒待发队列（微信提醒把"暂时发不出去"的提醒落库，重启不丢）。
 *
 * 从 repo.ts 原样抽出（行为不变）。对外符号由 repo.ts 再导出。
 * 设计见 docs/design/2026-09-09-reminder-channel-adapter.md §6。
 */
import { randomUUID } from 'node:crypto';
import { nowIso, listDueReminders } from '../repo.js';
/** 队列硬上限：防止极端情况下无限增长（超出丢弃最旧的）。 */
export const REMINDER_QUEUE_LIMIT = 200;
export function enqueueReminder(db, input, at = nowIso()) {
    const id = randomUUID();
    db.exec('BEGIN');
    try {
        db.prepare(`
      INSERT INTO reminder_queue
        (id, reminder_id, root_task_id, task_id, title, body, priority_code, due_at, attempts, next_attempt_at, last_error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)
    `).run(id, input.reminderId, input.rootTaskId, input.taskId, input.title, input.body, input.priorityCode, input.dueAt, input.nextAttemptAt, at);
        const excess = db.prepare('SELECT COUNT(*) AS c FROM reminder_queue').get();
        if (excess.c > REMINDER_QUEUE_LIMIT) {
            const drop = excess.c - REMINDER_QUEUE_LIMIT;
            db.prepare(`
        DELETE FROM reminder_queue WHERE id IN (
          SELECT id FROM reminder_queue ORDER BY created_at ASC LIMIT ?
        )
      `).run(drop);
        }
        db.exec('COMMIT');
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return id;
}
/** 取到期的队列条目（按优先级与创建时间）。 */
export function listDueQueue(db, nowIso, limit = 50) {
    const rows = db.prepare(`
    SELECT * FROM reminder_queue
    WHERE next_attempt_at <= ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(nowIso, limit);
    return rows.map(parseQueueRow);
}
export function listQueue(db, limit = 100) {
    const rows = db.prepare('SELECT * FROM reminder_queue ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map(parseQueueRow);
}
export function countQueue(db) {
    return db.prepare('SELECT COUNT(*) AS c FROM reminder_queue').get().c;
}
export function removeQueueEntry(db, id) {
    db.prepare('DELETE FROM reminder_queue WHERE id = ?').run(id);
}
export function markQueueAttempt(db, id, error, nextAttemptAt) {
    db.prepare('UPDATE reminder_queue SET attempts = attempts + 1, last_error = ?, next_attempt_at = ? WHERE id = ?').run(error, nextAttemptAt, id);
}
function parseQueueRow(row) {
    return {
        id: String(row.id),
        reminderId: row.reminder_id === null || row.reminder_id === undefined ? null : String(row.reminder_id),
        rootTaskId: String(row.root_task_id),
        taskId: String(row.task_id),
        title: String(row.title),
        body: String(row.body),
        priorityCode: String(row.priority_code),
        dueAt: row.due_at === null || row.due_at === undefined ? null : String(row.due_at),
        attempts: Number(row.attempts ?? 0),
        nextAttemptAt: String(row.next_attempt_at),
        lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
        createdAt: String(row.created_at),
    };
}
/** 统计窗口内"已发送/已尝试"的条数（用于节流预算）。 */
export function countFiredRemindersSince(db, sinceIso) {
    return db.prepare('SELECT COUNT(*) AS c FROM task_reminders WHERE fired_at IS NOT NULL AND fired_at >= ?').get(sinceIso).c;
}
/**
 * 到期提醒（带补发回溯窗口）。
 * 与 listDueReminders 的区别：只返回窗口内到期的，避免逾期很久的提醒被反复取到。
 */
export function listDueRemindersInWindow(db, windowHours, now = new Date()) {
    const windowMs = windowHours * 60 * 60_000;
    return listDueReminders(db, now).filter((reminder) => {
        const fireMs = Date.parse(reminder.dueAt) - reminder.offsetMinutes * 60_000;
        return Number.isFinite(fireMs) && now.getTime() - fireMs <= windowMs;
    });
}
/** 取任务树的根 id（用于任务共享记忆与队列归属）。 */
export function getTaskRootIdOrSelf(db, taskId) {
    let cursor = taskId;
    const seen = new Set();
    let guard = 0;
    while (cursor !== null && guard < 64) {
        if (seen.has(cursor))
            break;
        seen.add(cursor);
        const row = db.prepare('SELECT id, parent_id FROM tasks WHERE id = ?').get(cursor);
        if (row === undefined)
            return taskId;
        if (row.parent_id === null)
            return row.id;
        cursor = row.parent_id;
        guard += 1;
    }
    return taskId;
}
