/**
 * 每日计划域路由（读取 / 保存 / 删除）
 * 从 routes.ts 原样抽出（行为不变），由 makeRoutes 组合。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DatabaseSync } from 'node:sqlite';
export declare function makePlanRoutes(db: DatabaseSync): WebRoute[];
