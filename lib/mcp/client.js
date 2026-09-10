/**
 * 个人 MCP 客户端：按用户配置即时连接目标 MCP 服务（StreamableHTTP）。
 *
 * 设计要点：不缓存长连接——每次探测/调用现连现断。配置（URL / 请求头 / 超时）
 * 是唯一事实来源：用户在界面改动后，下一次调用即刻按新配置连接
 * （同一对话中随时切换 / 增删服务，这正是本方案不用 preset 的原因）。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const MAX_TEXT_CHARS = 48 * 1024;
const MAX_TOOLS = 200;
const MAX_ERROR_CHARS = 500;
function errorText(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return raw.length > MAX_ERROR_CHARS ? `${raw.slice(0, MAX_ERROR_CHARS)}…` : raw;
}
function withClient(target, fn) {
    const transport = new StreamableHTTPClientTransport(new URL(target.url), {
        requestInit: { headers: target.headers },
    });
    const client = new Client({ name: 'dsh-personal-workbench', version: '1.0.0' });
    return (async () => {
        await client.connect(transport, { timeout: target.timeoutMs });
        try {
            return await fn(client);
        }
        finally {
            await client.close().catch(() => { });
        }
    })();
}
/** 探测服务：连接 → tools/list（返回工具清单与握手信息）。 */
export async function probeMcpServer(target) {
    try {
        return await withClient(target, async (client) => {
            const listed = await client.listTools(undefined, { timeout: target.timeoutMs });
            const tools = [];
            for (const tool of listed.tools ?? []) {
                if (typeof tool.name !== 'string' || tool.name === '')
                    continue;
                tools.push({ name: tool.name, description: typeof tool.description === 'string' ? tool.description : '' });
                if (tools.length >= MAX_TOOLS)
                    break;
            }
            const version = client.getServerVersion();
            return {
                ok: true,
                tools,
                ...(typeof version?.name === 'string' ? { serverName: version.name } : {}),
                ...(typeof version?.version === 'string' ? { serverVersion: version.version } : {}),
            };
        });
    }
    catch (error) {
        return { ok: false, tools: [], error: errorText(error) };
    }
}
/** 调用服务上的工具：连接 → tools/call（结果内容展平为文本）。 */
export async function callMcpServerTool(target, tool, args) {
    try {
        return await withClient(target, async (client) => {
            const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: target.timeoutMs });
            return { ok: true, isError: result.isError === true, text: summarizeCallToolResult(result) };
        });
    }
    catch (error) {
        return { ok: false, error: errorText(error) };
    }
}
/** 把 tools/call 的 content 数组展平为文本（text 原样、非文本类型给占位、structuredContent 附 JSON）。 */
function summarizeCallToolResult(result) {
    const parts = [];
    const content = result.content;
    if (Array.isArray(content)) {
        for (const block of content) {
            if (typeof block !== 'object' || block === null)
                continue;
            const item = block;
            if (item.type === 'text' && typeof item.text === 'string')
                parts.push(item.text);
            else if (typeof item.type === 'string')
                parts.push(`[${item.type} 内容]`);
        }
    }
    const structured = result.structuredContent;
    if (structured !== undefined) {
        try {
            parts.push('```json\n' + JSON.stringify(structured, null, 2) + '\n```');
        }
        catch { /* 非 JSON 可序列化则忽略 */ }
    }
    const text = parts.join('\n').trim();
    if (text === '')
        return '(工具无文本输出)';
    return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…（输出过长已截断）` : text;
}
