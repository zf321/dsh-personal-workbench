import type { DatabaseSync } from 'node:sqlite';
import type { ReminderPolicy } from './config.js';
import { type ThrottleState } from './policy.js';
import type { WechatChannelAdapter } from './adapter.js';
export interface DraftNotifyEntry {
    id: string;
    draftId: string;
    kindCode: string;
    title: string;
    body: string;
    priorityCode: string;
    attempts: number;
    nextAttemptAt: string;
    lastError: string | null;
    createdAt: string;
}
/** 草稿类型 → 通知优先级。验收/复盘需要用户立刻动手 → p1（即时）；其余 → p2（进汇总）。 */
export declare function draftNotifyPriority(kindCode: string): string;
export declare function draftNotifyTitle(kindCode: string): string;
/** 通知正文里的摘要截断长度（微信上太长反而看不清）。 */
export declare const DRAFT_NOTIFY_SUMMARY_LIMIT = 60;
/**
 * 通知正文：任务标题 + 极短摘要 + 一句操作提示。
 *
 * 刻意保持精简：微信里一眼能看完、一眼知道该干什么。任务标题优先用调用方查到的
 * 真实任务标题（验收申请草稿只存 taskId），查不到才退回草稿自带的 title 字段。
 */
export declare function draftNotifyBody(draft: {
    kindCode: string;
    payload: Record<string, unknown>;
}, taskTitle?: string | null): string;
/** 找出「待确认、未暂存、未通知过、类型已开启」的草稿。 */
export declare function listNotifiableDrafts(db: DatabaseSync, kinds: readonly string[]): Array<{
    id: string;
    kindCode: string;
    payload: Record<string, unknown>;
    sessionId: string | null;
}>;
export declare function markDraftNotified(db: DatabaseSync, draftId: string, at?: string): void;
export declare function enqueueDraftNotify(db: DatabaseSync, input: {
    draftId: string;
    kindCode: string;
    title: string;
    body: string;
    priorityCode: string;
    nextAttemptAt: string;
    at?: string;
}): DraftNotifyEntry;
export declare function listDraftNotifyQueue(db: DatabaseSync): DraftNotifyEntry[];
export declare function listDueDraftNotifies(db: DatabaseSync, nowIso_: string): DraftNotifyEntry[];
export declare function removeDraftNotify(db: DatabaseSync, id: string): void;
export declare function markDraftNotifyAttempt(db: DatabaseSync, id: string, error: string | null, nextAttemptAt: string): void;
export declare function countDraftNotifiesSince(db: DatabaseSync, sinceIso: string): number;
export interface DraftNotifyDeps {
    db: DatabaseSync;
    adapter: WechatChannelAdapter;
    isTargetConfigured: () => boolean;
    throttleState: (policy: ReminderPolicy, now: Date) => ThrottleState;
    now?: () => Date;
}
export interface DraftNotifyResult {
    scanned: number;
    sent: number;
    queued: number;
    skipped: number;
    unavailable: number;
}
/** 扫描一次：把新草稿按策略即时推送或入队。 */
export declare function scanDraftNotifications(deps: DraftNotifyDeps, policy: ReminderPolicy): Promise<DraftNotifyResult>;
/** 释放草稿通知队列：到期条目逐条发送，同批同优先级合并成一条摘要。 */
export declare function flushDraftNotifications(deps: DraftNotifyDeps, policy: ReminderPolicy): Promise<{
    sent: number;
    merged: number;
    failed: number;
}>;
/** 静默时段结束时刻（跨午夜时若当前在静默内，结束时刻在次日）。 */
export declare function nextQuietEnd(policy: ReminderPolicy, now: Date): Date;
/** 当天/次日汇总时刻。 */
export declare function nextDigestAt(policy: ReminderPolicy, now: Date): Date;
