/**
 * host 侧常驻提醒调度器：扫描到期提醒 → 策略判定 → 微信通道 / 前端降级。
 * 设计见 docs/design/2026-09-09-reminder-*.md
 *
 * 关键语义：
 * - 幂等：`fired_at` 在"已交付或已入队"后写；入队即视为已处理，投递责任转移给队列。
 * - 补发：进程启动后立即跑一次，只回溯 catchupWindowHours 内到期的提醒，合并成一条。
 * - 与前端互斥：host 写过 fired_at 的提醒，前端 `/reminders/due` 自然不再返回。
 * - 未安装/未配置通道：**不写 fired_at**，前端继续负责（静默降级）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { DatabaseSync } from 'node:sqlite';
import { type DraftNotifyResult } from './draft-notify.js';
import type { WechatChannelAdapter } from './adapter.js';
/**
 * 多租户扫描作用域：每轮对每个作用域各跑一遍单库逻辑。
 * run 负责在该库的上下文中执行 fn（index.ts 用 pool.runForUser 构造用户库作用域，
 * db 句柄在其中自动路由到用户库）；缺省（不传 scopes）为单库=默认库。
 */
export interface SchedulerScope {
    label: string;
    run: <T>(fn: () => Promise<T>) => Promise<T>;
}
export interface SchedulerDeps {
    db: DatabaseSync;
    adapter: WechatChannelAdapter;
    /** 读取用户在设置里选的投递目标是否已配置（用于"已装未配"降级口径） */
    isTargetConfigured: () => boolean;
    /** 观察 dsh-im 入站消息计数（恢复信号）；不可用则返回 null */
    readInboundCount?: () => Promise<number | null>;
    /** 多租户：每轮扫描的库作用域（默认库 + 各用户库）；缺省单库。 */
    scopes?: () => readonly SchedulerScope[];
    now?: () => Date;
    log?: (message: string) => void;
}
export interface ScanResult {
    scanned: number;
    sent: number;
    queued: number;
    skipped: number;
    skippedTooOld: number;
    unavailable: number;
}
export declare class ReminderScheduler {
    private readonly deps;
    private scanning;
    private scanningDrafts;
    private catchupDone;
    private disposed;
    constructor(deps: SchedulerDeps);
    private now;
    private policy;
    private throttleState;
    /** 草稿通知的依赖视图（与到期提醒共用适配层与节流口径）。 */
    private draftDeps;
    /** 扫描一次草稿通知（验收申请等）。与到期提醒同轮次执行，独立节流预算；多库逐作用域汇总。 */
    scanDrafts(): Promise<DraftNotifyResult>;
    /** 单库草稿通知扫描（在「当前库上下文」下执行）。 */
    private scanDraftsScoped;
    /** 扫描一次。可重入保护：上一次未结束时直接跳过。多租户下逐作用域扫描并汇总。 */
    scan(options?: {
        catchup?: boolean;
    }): Promise<ScanResult>;
    /** 单库扫描（在「当前库上下文」下执行；多租户由 scan 逐作用域调用）。 */
    private scanScoped;
    /** 释放队列（合并成一条）。多租户下逐作用域释放并汇总。 */
    flushQueue(): Promise<{
        sent: number;
        merged: number;
        failed: number;
        reason?: string;
    }>;
    /** 单库队列释放（在「当前库上下文」下执行）。 */
    private flushQueueScoped;
    /** 启动补发：进程启动后立即跑一次，只跑一次。 */
    catchup(): Promise<ScanResult | null>;
    /**
     * 注册定时任务。用 ctx.interval（随 fiber 自动销毁），不用裸 setInterval。
     * 调用方必须已经声明 timer 依赖（见 index.ts 的 ctx.inject(['timer'], ...)）。
     * 返回 dispose 函数，供测试与手动关闭使用。
     */
    start(ctx: Context): () => void;
    private toCandidate;
    private enqueue;
    /** 同一任务同一事件类型只记一次，避免 30 秒一轮刷屏。 */
    private appendEventOnce;
    private log;
    /** 队列长度（供状态接口）。 */
    queued(): number;
}
