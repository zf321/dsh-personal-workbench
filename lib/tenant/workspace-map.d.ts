/** 一个多租户用户的工作区行（state.json users 的投影，只保留活跃用户）。 */
export interface TenantUser {
    slug: string;
    role: string;
    workspacePath: string;
}
/** 宿主多租户插件的状态文件路径（env 可覆盖，便于测试与定制部署）。 */
export declare function tenantStateFilePath(): string;
/** p 是否在 base 内（含 base 自身；与宿主插件 paths.ts 的 isInside 同语义）。 */
export declare function isInside(base: string, p: string): boolean;
/** 活跃租户用户（有工作区、status=active、slug 形状安全）；文件缺失时为空。 */
export declare function listTenantUsers(): readonly TenantUser[];
/** 用会话 cwd 反查所属用户（cwd 落在其工作区内，含子目录）；无匹配返回 undefined。 */
export declare function resolveTenantUserByCwd(cwd: string | undefined): TenantUser | undefined;
