import type { DatabaseSync } from 'node:sqlite';
import { type DraftRow } from '../repo.js';
export interface DailyPlanItem {
    taskId: string;
    order: number;
    title: string;
    note?: string;
}
export interface DailyPlanInput {
    planDate: string;
    summary?: string;
    items: DailyPlanItem[];
    sourceCode?: string;
    sessionId?: string | null;
}
export interface DailyPlanRow {
    id: string;
    planDate: string;
    summary: string;
    items: DailyPlanItem[];
    sourceCode: string;
    sessionId: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare function getDailyPlan(db: DatabaseSync, planDate: string): DailyPlanRow | undefined;
/** 同一日期只保留一份计划；再次确认即覆盖旧计划。 */
export declare function saveDailyPlan(db: DatabaseSync, input: DailyPlanInput, at?: string): DailyPlanRow;
/** 手动编辑计划：更新顺序/备注/成员，并标记来源为 manual；不存在时按 manual 新建。 */
export declare function updateDailyPlan(db: DatabaseSync, planDate: string, input: {
    summary?: string;
    items: Array<{
        taskId: string;
        order?: number;
        note?: string;
    }>;
    sourceCode?: string;
    sessionId?: string | null;
}, at?: string): DailyPlanRow;
export declare function deleteDailyPlan(db: DatabaseSync, planDate: string): boolean;
export declare function confirmDailyPlanDraft(db: DatabaseSync, draftId: string, at?: string): DailyPlanRow | undefined;
export declare function getPendingDailyPlanDraft(db: DatabaseSync, sessionId: string | null, planDate?: string): DraftRow | undefined;
