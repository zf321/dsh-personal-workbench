import type { McpToolInfo } from '../db/repo/mcp.js';
export interface McpServerTarget {
    url: string;
    headers: Record<string, string>;
    timeoutMs: number;
}
export interface McpProbeResult {
    ok: boolean;
    tools: McpToolInfo[];
    serverName?: string;
    serverVersion?: string;
    error?: string;
}
export interface McpCallResult {
    ok: boolean;
    /** 服务端显式返回 isError=true（工具执行逻辑失败，连接本身成功）。 */
    isError?: boolean;
    text?: string;
    error?: string;
}
/** 探测服务：连接 → tools/list（返回工具清单与握手信息）。 */
export declare function probeMcpServer(target: McpServerTarget): Promise<McpProbeResult>;
/** 调用服务上的工具：连接 → tools/call（结果内容展平为文本）。 */
export declare function callMcpServerTool(target: McpServerTarget, tool: string, args: Record<string, unknown>): Promise<McpCallResult>;
