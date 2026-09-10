import type { DatabaseSync } from 'node:sqlite';
import { type WorkbenchDbConfig } from './database.js';
/** slug 是否可安全用作目录名（每段形状安全; `/` 经 userSlugDirName 转义）。 */
export declare function isSafeUserSlug(slug: string): boolean;
/** 用户库目录名：`/` 以 `__` 转义（段内不允许下划线, 映射无歧义）。 */
export declare function userSlugDirName(slug: string): string;
export declare class WorkbenchDbPool {
    private readonly store;
    private readonly userDbs;
    private readonly dataDir;
    private readonly defaultDb;
    constructor(config?: WorkbenchDbConfig);
    /** 当前异步上下文使用的库；无上下文（回环 / 提醒调度 / 工具）时回退默认库。 */
    current(): DatabaseSync;
    /**
     * 进入指定用户的库上下文（async_hooks enterWith）。
     * 时序要求：必须在“将要使用该上下文的续体”中同步调用——例如路由 handler
     * 在 await 鉴权之后的下一行；在被 await 的辅助函数内部、其自身 await 之后
     * 调用不会传播到调用方（pool.test.mjs 有该语义的回归测试）。
     */
    enterForUser(slug: string): void;
    /** 在指定用户的库上下文中同步执行（测试与批处理用）。 */
    runForUser<T>(slug: string, fn: () => T): T;
    /** 用户库文件路径（诊断 / 测试可见; 目录名经 userSlugDirName 转义）。 */
    userDbPath(slug: string): string;
    /** 已打开的用户库快照（提醒调度等按用户轮询的场景使用）。 */
    openedUserDbs(): ReadonlyMap<string, DatabaseSync>;
    /**
     * DatabaseSync 形状的运行期句柄：每次调用解析到“当前上下文库”。
     * 传给路由 / 调度器 / 工具的共享入口，repo 层保持零改动。
     * （运行期替身只暴露 repo 层实际使用的 prepare / exec；生命周期走 pool.close()。）
     */
    handle(): DatabaseSync;
    /** 关闭默认库与全部用户库。 */
    close(): void;
    /** 打开（或复用）用户库；首次打开时建目录、迁移并写字典种子。 */
    private forUser;
    private openAt;
}
/** 插件 apply 时绑定进程内活动池（单实例；新池覆盖旧池）。 */
export declare function bindWorkbenchDbPool(pool: WorkbenchDbPool): void;
/** 鉴权解析出用户后进入其库上下文；未绑定池（如单测）时空操作。 */
export declare function enterWorkbenchUserDb(slug: string): void;
/**
 * 在用户库上下文中执行 fn（run 语义：新建上下文，fn 及其 async 续体可见；
 * 不触碰调用方的执行帧）。工具层多租户路由（withTenantRouting）用此——
 * 工具在同步段调 enterWith 会改写「调用方（agent 框架）的当前帧」并泄漏
 * 上下文进框架续体，run 则把作用域限定在工具执行自身。
 * 未绑定池（如单测）时直接执行 fn。
 */
export declare function runWithWorkbenchUserDb<T>(slug: string, fn: () => T): T;
