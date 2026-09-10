/**
 * 微信提醒通道适配层：软探测 dsh-im、解析投递目标、错误归一化、熔断与队列。
 * 设计见 docs/design/2026-09-09-reminder-channel-adapter.md
 *
 * 硬约束：本层永不抛错，所有失败都变成 SendOutcome。
 * 绝不静态 inject dshIm —— 未安装时必须静默降级（ctx.get 软探测返回 undefined）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { DatabaseSync } from 'node:sqlite';
/** dsh-im 暴露的服务形状（结构化类型，便于测试注入假实现）。 */
export interface DshImService {
    send(botId: string, targetId: string, text: string, opts?: {
        signal?: AbortSignal;
    }): Promise<unknown>;
    listTargets(botId: string): Promise<Array<{
        targetId: string;
        name?: string;
        kind?: string;
        route?: Record<string, unknown>;
    }>>;
    listBots(): Promise<Array<{
        botId: string;
        name?: string;
        channel?: string;
        state?: string;
        connected?: boolean;
    }>> | Array<{
        botId: string;
        name?: string;
        channel?: string;
        state?: string;
        connected?: boolean;
    }>;
}
export type SendOutcome = {
    ok: true;
    delivered: true;
} | {
    ok: false;
    reason: 'not-installed' | 'not-configured' | 'channel-offline' | 'throttled' | 'failed';
    detail?: string;
    retryAfterMs?: number;
};
export interface ChannelStatus {
    installed: boolean;
    configured: boolean;
    botId: string | null;
    targetId: string | null;
    botLabel: string | null;
    circuitOpen: boolean;
    circuitUntil: string | null;
    queued: number;
}
export interface ResolvedTarget {
    botId: string;
    targetId: string;
    botLabel: string | null;
}
export interface AdapterDeps {
    db: DatabaseSync;
    /** 读取 dsh-im 服务；返回 undefined 表示未安装 */
    probe: () => DshImService | undefined;
    /** 读取用户在设置里选的投递目标（botId/targetId） */
    readConfiguredTarget: () => {
        botId: string | null;
        targetId: string | null;
    };
    /** 队列操作 */
    queue: {
        enqueue(entry: {
            reminderId: string | null;
            rootTaskId: string;
            taskId: string;
            title: string;
            body: string;
            priorityCode: string;
            dueAt: string | null;
        }, nextAttemptAt: string): void;
        listDue(nowIso: string): Array<{
            id: string;
            reminderId: string | null;
            rootTaskId: string;
            taskId: string;
            title: string;
            body: string;
            priorityCode: string;
            dueAt: string | null;
            attempts: number;
        }>;
        remove(id: string): void;
        markAttempt(id: string, error: string, nextAttemptAt: string): void;
        count(): number;
        statsSince(iso: string): number;
    };
    now?: () => Date;
}
export declare class WechatChannelAdapter {
    readonly id: "wechat";
    private readonly deps;
    private circuit;
    private cachedTarget;
    private lastSeenInboundCount;
    constructor(deps: AdapterDeps);
    private now;
    private policy;
    available(): boolean;
    /** 解析投递目标：设置里选的 → 自动发现（只取 weixin 渠道）。 */
    resolveTarget(): Promise<ResolvedTarget | null>;
    /** 供设置页：列出可选机器人/目标（不返回任何凭据）。 */
    listOptions(): Promise<{
        installed: boolean;
        bots: Array<{
            botId: string;
            label: string;
            targets: Array<{
                targetId: string;
                label: string;
                kind: string;
            }>;
        }>;
    }>;
    status(): ChannelStatus;
    /** 熔断判定：供策略层在发送前短路（避免无谓网络请求）。 */
    circuitVerdict(): {
        open: boolean;
        retryAfterMs: number;
    };
    private openCircuit;
    private closeCircuit;
    /**
     * 观察 dsh-im 的入站消息计数：增长说明账号恢复了发送能力（实测的官方恢复路径）。
     * 返回 true 表示刚刚探测到恢复，熔断转入 HALF_OPEN 立刻试探。
     */
    noteInboundCount(count: number): boolean;
    /** 发送一条文本。永不 reject。 */
    send(message: {
        title: string;
        body: string;
        priorityCode?: string;
    }): Promise<SendOutcome>;
    /**
     * 释放队列：把待发条目**合并成一条**再发（不逐条放，避免集中撞限流）。
     * 返回本次处理结果，供调度器回写事件。
     */
    flushQueue(): Promise<{
        sent: number;
        merged: number;
        failed: number;
        reason?: string;
    }>;
}
/** dsh-im 错误码 → 归一化原因。见设计 §5 映射表。 */
export declare function normalizeErrorCode(code: string | undefined): Extract<SendOutcome, {
    ok: false;
}>['reason'];
/** 从 DSH 上下文软探测 dsh-im 服务（唯一允许的探测方式）。 */
export declare function probeDshIm(ctx: Context): DshImService | undefined;
