/**
 * 个人 MCP 服务域路由：配置 CRUD + 连通性探测（tools/list）。
 *
 * 每个请求经工作台鉴权后进入用户库上下文（配置只读写本人；多租户隔离见 db/pool.ts）。
 * 修改即时落库 → 对话工具下一次调用即按新配置连接（对话中切换服务无需新会话）。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DatabaseSync } from 'node:sqlite';
export declare const MCP_PREFIX = "/api/workbench/mcp";
export declare function makeMcpRoutes(db: DatabaseSync): WebRoute[];
