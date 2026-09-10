import type { DatabaseSync } from 'node:sqlite';
import { type DraftRow } from './shared.js';
import type { DraftInput, TaskInput, TaskRow } from '../repo.js';
/** 提案类草稿里的单个任务节点：工具侧写 snake_case，表单/任务草稿侧写 camelCase。 */
export type DraftTaskItem = Partial<TaskInput> & Record<string, unknown>;
/**
 * 把草稿里的一个任务节点归一化成 createTask 入参。
 * 三条确认路径（task / subtask_plan / idea_tasks）共用，避免各自只处理一种写法而静默丢字段
 * （历史事故：estimated_minutes 只读 camelCase，而提案工具写的是 snake_case）。
 */
export declare function toTaskInputFromDraftItem(item: DraftTaskItem, defaults: {
    typeCode: string;
    priorityCode: string;
    statusCode?: string;
    source?: string;
    extra?: Record<string, unknown>;
}): {
    title: string;
    input: TaskInput;
} | undefined;
export declare function createDraft(db: DatabaseSync, input: DraftInput, at?: string): DraftRow;
export declare function updateDraft(db: DatabaseSync, id: string, payload: Record<string, unknown>, at?: string): DraftRow | undefined;
export declare function getDraftBySession(db: DatabaseSync, sessionId: string): DraftRow | undefined;
export declare function confirmTaskDraft(db: DatabaseSync, draftId: string, actor?: string, at?: string): TaskRow | undefined;
export declare function confirmSubtaskPlanDraft(db: DatabaseSync, draftId: string, actor?: string, at?: string): TaskRow[];
export declare function getLatestPendingDraft(db: DatabaseSync): DraftRow | undefined;
/**
 * 自动弹窗的数据源：只取**未暂存**的最新待确认草稿。
 * 暂存过的草稿仍是 pending（可确认/可驳回），只是不再打断用户。
 */
export declare function getLatestActiveDraft(db: DatabaseSync): DraftRow | undefined;
/** 已暂存的待确认草稿（按暂存时间倒序），供「待处理」弹窗的「已暂存」段展示。 */
export declare function listDeferredDrafts(db: DatabaseSync): DraftRow[];
/** 该任务是否已有暂存中的草稿（用于 AI 重提时提示）。 */
export declare function getDeferredDraftForTask(db: DatabaseSync, kindCode: string, taskId: string): DraftRow | undefined;
/**
 * 可「暂存」的草稿类型白名单。
 * 只开放验收类：完成验收申请（completion）与复盘草稿（review）——这两类需要用户先做验证/回看再决定。
 */
export declare const DEFERRABLE_DRAFT_KINDS: readonly ["completion", "review"];
export declare function isDeferrableDraftKind(kindCode: string): boolean;
/** 暂存：仅 pending 且属于可暂存类型的草稿可暂存；返回 undefined 表示不允许。 */
export declare function deferDraft(db: DatabaseSync, draftId: string, at?: string): DraftRow | undefined;
/** 唤回：清掉暂存标记，草稿重新进入自动弹窗队列。 */
export declare function resumeDraft(db: DatabaseSync, draftId: string, at?: string): DraftRow | undefined;
export declare function getPendingDraftForTask(db: DatabaseSync, kindCode: string, taskId: string): DraftRow | undefined;
export declare function abandonDraft(db: DatabaseSync, draftId: string, at?: string): void;
