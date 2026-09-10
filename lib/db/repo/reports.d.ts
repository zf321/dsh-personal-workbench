import type { DatabaseSync } from 'node:sqlite';
import { type DraftRow } from '../repo.js';
export type ReportPeriodCode = 'day' | 'week';
export interface TaskReportInput {
    periodCode: ReportPeriodCode;
    periodStart: string;
    title: string;
    summaryMd: string;
    stats?: Record<string, unknown>;
    sessionId?: string | null;
}
export interface TaskReportRow {
    id: string;
    periodCode: ReportPeriodCode;
    periodStart: string;
    title: string;
    summaryMd: string;
    stats: Record<string, unknown>;
    sessionId: string | null;
    createdAt: string;
    updatedAt: string;
}
/** 同一周期（日报按天 / 周报按周）只保留一份，重复保存即覆盖。 */
export declare function saveTaskReport(db: DatabaseSync, input: TaskReportInput, at?: string): TaskReportRow;
export declare function getTaskReport(db: DatabaseSync, periodCode: ReportPeriodCode, periodStart: string): TaskReportRow | undefined;
export declare function listTaskReports(db: DatabaseSync, opts?: {
    periodCode?: ReportPeriodCode;
    limit?: number;
}): TaskReportRow[];
export declare function deleteTaskReport(db: DatabaseSync, periodCode: ReportPeriodCode, periodStart: string): boolean;
export declare function confirmReportDraft(db: DatabaseSync, draftId: string, at?: string): TaskReportRow | undefined;
export declare function getPendingReportDraft(db: DatabaseSync, sessionId: string | null, periodCode?: string, periodStart?: string): DraftRow | undefined;
