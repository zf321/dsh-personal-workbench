import type { DatabaseSync } from 'node:sqlite';
import { type TaskRow } from '../repo.js';
export interface RawTaskRow {
    id: string;
    parent_id: string | null;
    title: string;
    description: string;
    type_code: string;
    status_code: string;
    priority_code: string;
    ai_policy_code: string;
    due_at: string | null;
    all_day: number;
    estimated_minutes: number | null;
    source: string;
    workspace_path: string | null;
    archived: number;
    extra: string;
    recurrence_code: string | null;
    recurrence_rule: string;
    recurrence_master_id: string | null;
    recurrence_last_generated: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    cancelled_at: string | null;
}
/** 递归向上查找最近一个有截止时间的祖先（含自身）。带深度/防环保护。 */
export declare function effectiveDueAtForTask(db: DatabaseSync, task: Pick<TaskRow, 'id' | 'parentId' | 'dueAt'>): string | null;
/**
 * 递归向上查找最近一个已设置工作区的祖先（含自身）。带深度/防环保护。
 * 语义与 effectiveDueAtForTask 完全同构：子任务未显式设工作区时，跟随最近的祖先；
 * 一旦子任务自己设了工作区，父任务再改动也不会影响它。
 */
export declare function effectiveWorkspacePathForTask(db: DatabaseSync, task: Pick<TaskRow, 'id' | 'parentId' | 'workspacePath'>): string | null;
export declare function parseTask(row: RawTaskRow | undefined, db?: DatabaseSync): TaskRow | undefined;
export declare function appendEvent(db: DatabaseSync, taskId: string, eventCode: string, opts?: {
    before?: unknown;
    after?: unknown;
    actor?: string;
    note?: string;
    at?: string;
}): void;
/**
 * 找出所有「祖先已归档」的任务 id（不含自身已归档的节点，那些由 archived 过滤处理）。
 * 用于让正常列表不返回无法建树的孤儿节点；带防环保护。
 */
export declare function collectArchivedDescendants(db: DatabaseSync, rows: RawTaskRow[]): Set<string>;
