import type { DatabaseSync } from 'node:sqlite';
export interface McpToolInfo {
    name: string;
    description: string;
}
export interface McpServerInput {
    name: string;
    url: string;
    transport?: string;
    headers?: unknown;
    enabled?: boolean;
    sortOrder?: number;
    timeoutMs?: number;
}
export interface McpServerPatch {
    name?: string;
    url?: string;
    headers?: unknown;
    enabled?: boolean;
    sortOrder?: number;
    timeoutMs?: number;
}
export interface McpServerRow {
    id: string;
    name: string;
    url: string;
    transport: string;
    headers: Record<string, string>;
    enabled: number;
    sortOrder: number;
    timeoutMs: number;
    tools: McpToolInfo[];
    toolsAt: string | null;
    lastStatus: string;
    lastError: string | null;
    lastCheckedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare const MCP_TIMEOUT_DEFAULT_MS = 30000;
export declare const MCP_TIMEOUT_MIN_MS = 3000;
export declare const MCP_TIMEOUT_MAX_MS = 120000;
/** 服务名：1-64 字符，同一用户下唯一（对话工具按名调用）。 */
export declare function normalizeMcpServerName(raw: string): string;
/** 服务地址：仅允许 http/https（StreamableHTTP 传输）。归一化后存储。 */
export declare function normalizeMcpServerUrl(raw: string): string;
/** 请求头：{name: value} 字符串对；名称/值长度设上限防滥用（如 Authorization）。 */
export declare function normalizeMcpHeaders(raw: unknown): Record<string, string>;
export declare function clampMcpTimeoutMs(raw: unknown): number;
export declare function createMcpServer(db: DatabaseSync, input: McpServerInput, at?: string): McpServerRow;
export declare function getMcpServer(db: DatabaseSync, id: string): McpServerRow | undefined;
export declare function getMcpServerByName(db: DatabaseSync, name: string): McpServerRow | undefined;
export declare function listMcpServers(db: DatabaseSync): McpServerRow[];
export declare function updateMcpServer(db: DatabaseSync, id: string, patch: McpServerPatch, at?: string): McpServerRow | undefined;
export declare function deleteMcpServer(db: DatabaseSync, id: string): boolean;
/** 记录一次成功的 tools/list：刷新工具缓存与探测状态（不改 updated_at，探测≠配置变更）。 */
export declare function recordMcpTools(db: DatabaseSync, id: string, tools: McpToolInfo[], at?: string): void;
/** 记录一次连接/调用结果（ok=最近成功；error 带错误文案）。 */
export declare function recordMcpStatus(db: DatabaseSync, id: string, status: 'ok' | 'error', error: string | null, at?: string): void;
