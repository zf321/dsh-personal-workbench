import type { DatabaseSync } from 'node:sqlite';
import { type TaskPatch, type TaskRow } from '../repo.js';
/**
 * 完成任务并处理级联/聚合：
 * - 把 taskId 标记为 done；
 * - 若 taskId 是父任务（直接完成），级联把所有未完成后代标记为 done；
 * - 完成后向上递归检查：某个父节点的直接子节点全部 closed 时，自动把该父节点标记为 done。
 * 使用事务保证幂等与并发安全；重复调用不会重复写已完成任务。
 */
export declare function completeTaskCascade(db: DatabaseSync, taskId: string, actor?: string, at?: string): TaskRow | undefined;
/**
 * 原子地应用任务更新；若 patch 把任务标记为 done，则在同一事务内级联/聚合。
 * 避免“任务已 done 但后代未级联”的中间状态。
 */
export declare function updateTaskWithCompletion(db: DatabaseSync, id: string, patch: TaskPatch, actor?: string, at?: string): TaskRow | undefined;
/**
 * 存量数据修复：扫描所有“有子任务但未完成”的父节点，若其直接子节点已全部 closed，
 * 则递归补完成。幂等：第二次执行返回 0。
 */
export declare function repairParentCompletion(db: DatabaseSync, at?: string): number;
/**
 * 归档一个任务。
 * 默认只归档该节点本身（保持既有语义）；`cascade: true` 时在同一事务内连整棵子树一起归档，
 * 每个被归档的节点各写一条 updated 事件，便于审计与按事件回放恢复。
 */
export declare function archiveTask(db: DatabaseSync, id: string, actor?: string, opts?: {
    cascade?: boolean;
}): TaskRow | undefined;
export declare function restoreTask(db: DatabaseSync, id: string, actor?: string): TaskRow | undefined;
export declare function listArchivedTasks(db: DatabaseSync): TaskRow[];
export declare function listTaskEvents(db: DatabaseSync, taskId: string): Array<Record<string, unknown>>;
export interface TaskReviewInput {
    taskId: string;
    sessionId?: string | null;
    summaryMd: string;
    lessonsJson?: unknown;
}
export declare function createTaskReview(db: DatabaseSync, input: TaskReviewInput, at?: string): string;
export declare function listTaskReviews(db: DatabaseSync, taskId: string): Array<Record<string, unknown>>;
