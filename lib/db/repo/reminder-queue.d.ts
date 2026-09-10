import type { DatabaseSync } from 'node:sqlite';
import { type DueReminder } from '../repo.js';
export interface ReminderQueueRow {
    id: string;
    reminderId: string | null;
    rootTaskId: string;
    taskId: string;
    title: string;
    body: string;
    priorityCode: string;
    dueAt: string | null;
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
    createdAt: string;
}
/** 队列硬上限：防止极端情况下无限增长（超出丢弃最旧的）。 */
export declare const REMINDER_QUEUE_LIMIT = 200;
export interface ReminderQueueInput {
    reminderId: string | null;
    rootTaskId: string;
    taskId: string;
    title: string;
    body: string;
    priorityCode: string;
    dueAt: string | null;
    nextAttemptAt: string;
}
export declare function enqueueReminder(db: DatabaseSync, input: ReminderQueueInput, at?: string): string;
/** 取到期的队列条目（按优先级与创建时间）。 */
export declare function listDueQueue(db: DatabaseSync, nowIso: string, limit?: number): ReminderQueueRow[];
export declare function listQueue(db: DatabaseSync, limit?: number): ReminderQueueRow[];
export declare function countQueue(db: DatabaseSync): number;
export declare function removeQueueEntry(db: DatabaseSync, id: string): void;
export declare function markQueueAttempt(db: DatabaseSync, id: string, error: string, nextAttemptAt: string): void;
/** 统计窗口内"已发送/已尝试"的条数（用于节流预算）。 */
export declare function countFiredRemindersSince(db: DatabaseSync, sinceIso: string): number;
/**
 * 到期提醒（带补发回溯窗口）。
 * 与 listDueReminders 的区别：只返回窗口内到期的，避免逾期很久的提醒被反复取到。
 */
export declare function listDueRemindersInWindow(db: DatabaseSync, windowHours: number, now?: Date): DueReminder[];
/** 取任务树的根 id（用于任务共享记忆与队列归属）。 */
export declare function getTaskRootIdOrSelf(db: DatabaseSync, taskId: string): string;
