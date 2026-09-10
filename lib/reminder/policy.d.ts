/**
 * 提醒策略判定：分级 / 静默 / 节流 / 熔断。
 * 纯函数优先，便于单测；时间相关一律显式传入 now，不读全局时钟。
 * 设计见 docs/design/2026-09-09-reminder-policy-model.md
 */
import type { ReminderPolicy } from './config.js';
export interface ReminderCandidate {
    reminderId: string;
    taskId: string;
    rootTaskId: string;
    title: string;
    priorityCode: string;
    dueAt: string;
    /** 该提醒的触发时刻 = dueAt - offsetMinutes */
    fireAt: string;
}
export type PolicyDecision = {
    action: 'send';
    reason: 'immediate' | 'quiet-bypass';
} | {
    action: 'queue';
    reason: 'quiet-hours' | 'digest' | 'throttled' | 'breaker';
} | {
    action: 'skip';
    reason: 'disabled' | 'too-old' | 'not-due';
};
/**
 * 是否处于静默时段。start > end 视为跨午夜；start === end 已在配置层归一为 null。
 */
export declare function isQuietTime(policy: ReminderPolicy, now: Date): boolean;
/** 是否已到每日汇总时刻（当天）。 */
export declare function isPastDigestTime(policy: ReminderPolicy, now: Date): boolean;
export interface ThrottleState {
    /** 最近一小时已发送/已尝试的条数 */
    sentLastHour: number;
    /** 当日已发送/已尝试的条数 */
    sentToday: number;
    /** 熔断开启中则 > now */
    circuitOpenUntil: number | null;
}
export type ThrottleVerdict = {
    allowed: true;
} | {
    allowed: false;
    reason: 'hourly' | 'daily' | 'breaker';
    retryAfterMs: number;
};
/**
 * 节流判定。熔断优先于预算——熔断期间连预算都不消耗。
 * `nowMs` 为毫秒时间戳。
 */
export declare function checkThrottle(policy: ReminderPolicy, state: ThrottleState, nowMs: number): ThrottleVerdict;
/**
 * 对一条到期提醒做完整判定。
 * 判定顺序见设计 §2：enabled → 静默（含 P0 穿透）→ 分级 → 节流。
 */
export declare function decideReminder(policy: ReminderPolicy, candidate: ReminderCandidate, state: ThrottleState, nowMs: number): PolicyDecision;
/** 合并摘要正文（补发/队列释放共用）。 */
export declare function formatDigest(entries: Array<{
    title: string;
    dueAt: string | null;
}>, maxItems: number): string;
