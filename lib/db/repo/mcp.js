/**
 * 个人 MCP 服务域：用户级 MCP server 配置 CRUD + 探测结果缓存。
 *
 * 每条记录归属「当前库」——多租户下即当前用户的库（见 db/pool.ts），配置只影响本人；
 * 对话工具（workbench_mcp_list / workbench_mcp_call）每次执行时实时读取本表，
 * 因此同一对话中增改/切换 MCP 服务立即生效（不依赖 preset、无需新会话）。
 */
import { randomUUID } from 'node:crypto';
import { nowIso } from './shared.js';
const NAME_MAX = 64;
const HEADERS_MAX = 30;
const HEADER_NAME_RE = /^[A-Za-z0-9_-]+$/;
export const MCP_TIMEOUT_DEFAULT_MS = 30_000;
export const MCP_TIMEOUT_MIN_MS = 3_000;
export const MCP_TIMEOUT_MAX_MS = 120_000;
/** 服务名：1-64 字符，同一用户下唯一（对话工具按名调用）。 */
export function normalizeMcpServerName(raw) {
    const name = raw.trim();
    if (name === '')
        throw new Error('name is required');
    if (name.length > NAME_MAX)
        throw new Error(`name too long (max ${NAME_MAX} chars)`);
    return name;
}
/** 服务地址：仅允许 http/https（StreamableHTTP 传输）。归一化后存储。 */
export function normalizeMcpServerUrl(raw) {
    const trimmed = raw.trim();
    if (trimmed === '')
        throw new Error('url is required');
    let url;
    try {
        url = new URL(trimmed);
    }
    catch {
        throw new Error('url is not a valid URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        throw new Error('url must be http(s)');
    return url.toString();
}
/** 请求头：{name: value} 字符串对；名称/值长度设上限防滥用（如 Authorization）。 */
export function normalizeMcpHeaders(raw) {
    if (raw === undefined || raw === null)
        return {};
    if (typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('headers must be an object');
    const entries = Object.entries(raw);
    if (entries.length > HEADERS_MAX)
        throw new Error(`too many headers (max ${HEADERS_MAX})`);
    const out = {};
    for (const [key, value] of entries) {
        const name = key.trim();
        if (!HEADER_NAME_RE.test(name))
            throw new Error(`invalid header name: ${key}`);
        if (typeof value !== 'string')
            throw new Error(`header ${name} must be a string`);
        if (value.length > 4096)
            throw new Error(`header ${name} is too long`);
        out[name] = value;
    }
    return out;
}
export function clampMcpTimeoutMs(raw) {
    if (typeof raw !== 'number' || !Number.isFinite(raw))
        return MCP_TIMEOUT_DEFAULT_MS;
    return Math.min(MCP_TIMEOUT_MAX_MS, Math.max(MCP_TIMEOUT_MIN_MS, Math.round(raw)));
}
function parseTools(json) {
    try {
        const parsed = JSON.parse(json);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .filter((item) => typeof item === 'object' && item !== null && typeof item.name === 'string')
            .map((item) => ({ name: item.name, description: typeof item.description === 'string' ? item.description : '' }));
    }
    catch {
        return [];
    }
}
function parseHeaders(json) {
    try {
        const parsed = JSON.parse(json);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
            return {};
        const out = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string')
                out[key] = value;
        }
        return out;
    }
    catch {
        return {};
    }
}
function parseMcpServer(row) {
    if (row === undefined)
        return undefined;
    return {
        id: row.id,
        name: row.name,
        url: row.url,
        transport: row.transport,
        headers: parseHeaders(row.headers_json),
        enabled: row.enabled,
        sortOrder: row.sort_order,
        timeoutMs: row.timeout_ms,
        tools: parseTools(row.tools_json),
        toolsAt: row.tools_at,
        lastStatus: row.last_status,
        lastError: row.last_error,
        lastCheckedAt: row.last_checked_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
function assertNameFree(db, name, exceptId) {
    const row = db.prepare('SELECT id FROM mcp_servers WHERE name = ?').get(name);
    if (row !== undefined && row.id !== exceptId)
        throw new Error(`a MCP server named "${name}" already exists`);
}
export function createMcpServer(db, input, at = nowIso()) {
    const name = normalizeMcpServerName(input.name);
    const url = normalizeMcpServerUrl(input.url);
    const headers = normalizeMcpHeaders(input.headers);
    assertNameFree(db, name);
    const id = randomUUID();
    db.prepare(`
    INSERT INTO mcp_servers (id, name, url, transport, headers_json, enabled, sort_order, timeout_ms, tools_json, tools_at, last_status, last_error, last_checked_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', NULL, '', NULL, NULL, ?, ?)
  `).run(id, name, url, input.transport === 'sse' ? 'sse' : 'http', JSON.stringify(headers), input.enabled === false ? 0 : 1, Math.round(input.sortOrder ?? 0), clampMcpTimeoutMs(input.timeoutMs), at, at);
    return getMcpServer(db, id);
}
export function getMcpServer(db, id) {
    return parseMcpServer(db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id));
}
export function getMcpServerByName(db, name) {
    return parseMcpServer(db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(name.trim()));
}
export function listMcpServers(db) {
    const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY sort_order ASC, created_at ASC').all();
    return rows.map((row) => parseMcpServer(row)).filter((row) => row !== undefined);
}
export function updateMcpServer(db, id, patch, at = nowIso()) {
    const before = getMcpServer(db, id);
    if (before === undefined)
        return undefined;
    const name = patch.name === undefined ? before.name : normalizeMcpServerName(patch.name);
    const url = patch.url === undefined ? before.url : normalizeMcpServerUrl(patch.url);
    const headers = patch.headers === undefined ? before.headers : normalizeMcpHeaders(patch.headers);
    if (name !== before.name)
        assertNameFree(db, name, id);
    const enabled = patch.enabled === undefined ? before.enabled : patch.enabled ? 1 : 0;
    const sortOrder = patch.sortOrder === undefined ? before.sortOrder : Math.round(patch.sortOrder);
    const timeoutMs = patch.timeoutMs === undefined ? before.timeoutMs : clampMcpTimeoutMs(patch.timeoutMs);
    // 地址或请求头变化会让缓存的工具清单失效：清空等待重新探测。
    const invalidate = url !== before.url || JSON.stringify(headers) !== JSON.stringify(before.headers);
    if (invalidate) {
        db.prepare(`
      UPDATE mcp_servers SET name = ?, url = ?, headers_json = ?, enabled = ?, sort_order = ?, timeout_ms = ?,
        tools_json = '[]', tools_at = NULL, last_status = '', last_error = NULL, last_checked_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(name, url, JSON.stringify(headers), enabled, sortOrder, timeoutMs, at, id);
    }
    else {
        db.prepare(`
      UPDATE mcp_servers SET name = ?, url = ?, headers_json = ?, enabled = ?, sort_order = ?, timeout_ms = ?, updated_at = ?
      WHERE id = ?
    `).run(name, url, JSON.stringify(headers), enabled, sortOrder, timeoutMs, at, id);
    }
    return getMcpServer(db, id);
}
export function deleteMcpServer(db, id) {
    return db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id).changes > 0;
}
/** 记录一次成功的 tools/list：刷新工具缓存与探测状态（不改 updated_at，探测≠配置变更）。 */
export function recordMcpTools(db, id, tools, at = nowIso()) {
    db.prepare(`
    UPDATE mcp_servers SET tools_json = ?, tools_at = ?, last_status = 'ok', last_error = NULL, last_checked_at = ?
    WHERE id = ?
  `).run(JSON.stringify(tools), at, at, id);
}
/** 记录一次连接/调用结果（ok=最近成功；error 带错误文案）。 */
export function recordMcpStatus(db, id, status, error, at = nowIso()) {
    db.prepare('UPDATE mcp_servers SET last_status = ?, last_error = ?, last_checked_at = ? WHERE id = ?')
        .run(status, status === 'error' ? (error ?? '').slice(0, 500) : null, at, id);
}
