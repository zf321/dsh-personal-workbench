/**
 * dsh-personal-workbench — host half.
 * V1/V1.5 能力已闭环；V2 起提供每日 AI 智能排序（daily_plans）。
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WorkbenchDbConfig } from './db/database.js';
export declare const name = "personal-workbench";
export declare const inject: string[];
export interface Config extends WorkbenchDbConfig {
    announceToAgent?: boolean;
    /** 提醒调度器扫描间隔（毫秒），缺省 30s；测试可调小 */
    reminderScanIntervalMs?: number;
}
export declare function apply(ctx: Context, config?: Config): void;
