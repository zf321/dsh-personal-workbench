/**
 * 提醒策略配置：默认值 + 解析 + 校验。
 * 存放于 meta 表（JSON），与 ai_default_workspace 等设置同机制，不新建表。
 * 设计见 docs/design/2026-09-09-reminder-policy-model.md
 */
import type { DatabaseSync } from 'node:sqlite';
export declare const REMINDER_POLICY_META_KEY = "reminder_policy";
export interface ReminderPolicy {
    /** 总开关：false 时 host 完全不动作，前端行为与改造前一致 */
    enabled: boolean;
    /** 到期立即推送的优先级 */
    immediatePriorities: string[];
    /** 并入每日汇总的优先级 */
    digestPriorities: string[];
    /** 每日汇总时间 HH:mm */
    digestAt: string;
    /** 静默时段，null 表示不启用 */
    quietHours: {
        start: string;
        end: string;
    } | null;
    /** 静默期内仍允许即时推送的优先级（默认 P0 穿透） */
    quietHoursBypassPriorities: string[];
    hourlyLimit: number;
    dailyLimit: number;
    /** 启动补发回溯窗口（小时）；超过窗口的逾期提醒只记事件不补发 */
    catchupWindowHours: number;
    /** 合并摘要最多列出的条目数 */
    catchupMaxItems: number;
    /** 熔断基础冷却（分钟），失败后翻倍，上限 4 小时 */
    breakerCooldownMinutes: number;
    /** 通道选择：auto = 装了 dsh-im 就走微信，否则前端 */
    channel: 'auto' | 'wechat' | 'browser';
    /** 草稿通知：哪些草稿类型要推微信（空数组 = 不推） */
    draftNotifyKinds: string[];
}
/** 可推送的草稿类型（与 task_drafts.kind_code 对齐）。 */
export declare const NOTIFIABLE_DRAFT_KINDS: readonly ["completion", "review", "report", "knowledge", "idea_cluster", "idea_tasks", "subtask_plan", "task"];
export declare const DEFAULT_REMINDER_POLICY: ReminderPolicy;
/** 把任意（含损坏的）输入规整成完整策略；未知字段丢弃，越界值夹紧。 */
export declare function normalizeReminderPolicy(raw: unknown): ReminderPolicy;
export declare function readReminderPolicy(db: DatabaseSync): ReminderPolicy;
export declare function writeReminderPolicy(db: DatabaseSync, raw: unknown): ReminderPolicy;
/** 熔断冷却时长：基础值按失败次数翻倍，上限 4 小时。 */
export declare function breakerCooldownMs(policy: ReminderPolicy, failureCount: number): number;
