import type { DatabaseSync } from 'node:sqlite';
import { type TaskInput, type TaskPatch, type TaskRow } from '../repo.js';
export declare function createTask(db: DatabaseSync, input: TaskInput, actor?: string, at?: string): TaskRow;
export declare function getTask(db: DatabaseSync, id: string): TaskRow | undefined;
export declare function listTasks(db: DatabaseSync, opts?: {
    includeArchived?: boolean;
    parentId?: string | null;
}): TaskRow[];
export declare function listChildren(db: DatabaseSync, parentId: string): TaskRow[];
export declare function updateTask(db: DatabaseSync, id: string, patch: TaskPatch, actor?: string, at?: string): TaskRow | undefined;
