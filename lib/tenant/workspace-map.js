/**
 * 多租户工作区映射：解析宿主 dsh-multi-tenant-projects 的 state.json，
 * 得到「工作区路径 → 用户」映射。供两处使用：
 * - 工具层 cwd 路由（agent 会话没有 HTTP token，用会话 cwd 识别用户）；
 * - 提醒调度器枚举用户库（无请求上下文的后台任务）。
 *
 * 数据源与 harness-mcp-server 的 tokenFile 是同一份 JSON 存储：
 * users[slug] 含 slug / role / status / workspacePath / projectSlug。
 * 读取按「路径+mtime+size」缓存；文件缺失/损坏（单租户部署）视为空列表，
 * 各功能自然退化为单用户行为。
 */
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isSafeUserSlug } from '../db/pool.js';
const EMPTY = [];
let cache;
/** 宿主多租户插件的状态文件路径（env 可覆盖，便于测试与定制部署）。 */
export function tenantStateFilePath() {
    const fromEnv = process.env.WORKBENCH_TENANT_STATE_FILE;
    if (fromEnv !== undefined && fromEnv.trim() !== '')
        return fromEnv;
    return join(homedir(), '.dsh', 'dsh-multi-tenant-projects', 'state.json');
}
/** p 是否在 base 内（含 base 自身；与宿主插件 paths.ts 的 isInside 同语义）。 */
export function isInside(base, p) {
    const rp = resolve(p);
    const rb = resolve(base);
    const rel = relative(rb, rp);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
/** 活跃租户用户（有工作区、status=active、slug 形状安全）；文件缺失时为空。 */
export function listTenantUsers() {
    const file = tenantStateFilePath();
    let key;
    try {
        const info = statSync(file);
        key = `${file}\u0000${info.mtimeMs}:${info.size}`;
    }
    catch {
        cache = { key: '', users: EMPTY };
        return EMPTY;
    }
    if (cache !== undefined && cache.key === key)
        return cache.users;
    try {
        const raw = JSON.parse(readFileSync(file, 'utf8'));
        const users = [];
        for (const value of Object.values(raw.users ?? {})) {
            if (typeof value !== 'object' || value === null)
                continue;
            const row = value;
            if (typeof row.slug !== 'string' || !isSafeUserSlug(row.slug))
                continue;
            if (typeof row.workspacePath !== 'string' || row.workspacePath === '')
                continue;
            if (row.status !== undefined && row.status !== 'active')
                continue;
            users.push({
                slug: row.slug,
                role: typeof row.role === 'string' ? row.role : 'user',
                workspacePath: row.workspacePath,
            });
        }
        cache = { key, users };
        return cache.users;
    }
    catch {
        cache = { key, users: EMPTY };
        return EMPTY;
    }
}
/** 用会话 cwd 反查所属用户（cwd 落在其工作区内，含子目录）；无匹配返回 undefined。 */
export function resolveTenantUserByCwd(cwd) {
    if (cwd === undefined || cwd.trim() === '')
        return undefined;
    for (const user of listTenantUsers()) {
        if (isInside(user.workspacePath, cwd))
            return user;
    }
    return undefined;
}
