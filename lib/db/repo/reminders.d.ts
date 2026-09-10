import type { DatabaseSync } from 'node:sqlite';
export interface DueReminder {
    reminderId: string;
    taskId: string;
    title: string;
    dueAt: string;
    offsetMinutes: number;
    methodCode: string;
}
export declare function listDueReminders(db: DatabaseSync, now?: Date): DueReminder[];
export interface TaskReminderRow {
    id: string;
    taskId: string;
    offsetMinutes: number;
    methodCode: string;
    enabled: number;
    firedAt: string | null;
    createdAt: string;
}
export declare function listReminders(db: DatabaseSync, taskId: string): TaskReminderRow[];
export declare function fireReminder(db: DatabaseSync, reminderId: string, at?: string): void;
export declare function addReminder(db: DatabaseSync, taskId: string, offsetMinutes: number, methodCode?: string, at?: string): string;
