/**
 * 草稿域路由（查询 / 确认 / 放弃 / 复盘 / 完成申请）
 * 从 routes.ts 原样抽出（行为不变），由 makeRoutes 组合。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DatabaseSync } from 'node:sqlite';
export declare function makeDraftRoutes(db: DatabaseSync): WebRoute[];
