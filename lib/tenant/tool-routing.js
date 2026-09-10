import { runWithWorkbenchUserDb } from '../db/pool.js';
import { resolveTenantUserByCwd } from './workspace-map.js';
/**
 * 包装工具：执行前按会话 cwd 路由到用户库上下文。
 * 会话 cwd 匹配不到用户（单机/回环/管理员会话）时保持原行为（默认库）。
 */
export function withTenantRouting(tool) {
    return {
        ...tool,
        execute: async (args, exec) => {
            const cwd = exec.agent?.session?.header?.cwd;
            const user = resolveTenantUserByCwd(cwd);
            if (user === undefined)
                return tool.execute(args, exec);
            return runWithWorkbenchUserDb(user.slug, () => tool.execute(args, exec));
        },
    };
}
