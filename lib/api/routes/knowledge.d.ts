/**
 * 知识库域路由（含 read-local-file）
 * 从 routes.ts 原样抽出（行为不变），由 makeRoutes 组合。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DatabaseSync } from 'node:sqlite';
export declare function makeKnowledgeRoutes(db: DatabaseSync): WebRoute[];
