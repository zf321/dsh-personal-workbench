/**
 * 多租户工作台数据库池：按用户隔离 SQLite 库。
 *
 * - 默认库（~/.dsh/workbench/workbench.db）服务本机回环请求，行为与单用户时代一致。
 * - 多租户用户各自持有 <dataDir>/users/<slug 转义目录>/workbench.db（见 userSlugDirName），首次访问时懒打开
 *   （建目录 + PRAGMA + 迁移 + 字典种子）。
 * - 通过 AsyncLocalStorage 暴露“当前请求的库”：鉴权解析出用户后 enterForUser(slug)，
 *   同一请求链路里后续的 repo 调用自动落到该用户库；repo 层与百余处调用点零改动。
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { dirname, join } from 'node:path';
import { defaultDbPath, openWorkbenchDb } from './database.js';
import { seedDictionaries } from './seed.js';
const USER_SLUG_SEGMENT = '[a-z0-9][a-z0-9-]{0,63}';
/**
 * 用户 slug 形状：宿主多租户插件的用户主键是 `project/user` 两段格式
 * （userKey, 如 `erpm/testu`）; 兼容单段（admin 与历史注入数据）。
 */
const USER_SLUG_RE = new RegExp(`^${USER_SLUG_SEGMENT}(/${USER_SLUG_SEGMENT})?$`);
/** slug 是否可安全用作目录名（每段形状安全; `/` 经 userSlugDirName 转义）。 */
export function isSafeUserSlug(slug) {
    return USER_SLUG_RE.test(slug);
}
/** 用户库目录名：`/` 以 `__` 转义（段内不允许下划线, 映射无歧义）。 */
export function userSlugDirName(slug) {
    return slug.replace('/', '__');
}
export class WorkbenchDbPool {
    store = new AsyncLocalStorage();
    userDbs = new Map();
    dataDir;
    defaultDb;
    constructor(config = {}) {
        const defaultPath = config.dbPath ?? join(config.dataDir ?? dirname(defaultDbPath()), 'workbench.db');
        this.dataDir = dirname(defaultPath);
        this.defaultDb = this.openAt(defaultPath);
    }
    /** 当前异步上下文使用的库；无上下文（回环 / 提醒调度 / 工具）时回退默认库。 */
    current() {
        return this.store.getStore() ?? this.defaultDb;
    }
    /**
     * 进入指定用户的库上下文（async_hooks enterWith）。
     * 时序要求：必须在“将要使用该上下文的续体”中同步调用——例如路由 handler
     * 在 await 鉴权之后的下一行；在被 await 的辅助函数内部、其自身 await 之后
     * 调用不会传播到调用方（pool.test.mjs 有该语义的回归测试）。
     */
    enterForUser(slug) {
        this.store.enterWith(this.forUser(slug));
    }
    /** 在指定用户的库上下文中同步执行（测试与批处理用）。 */
    runForUser(slug, fn) {
        return this.store.run(this.forUser(slug), fn);
    }
    /** 用户库文件路径（诊断 / 测试可见; 目录名经 userSlugDirName 转义）。 */
    userDbPath(slug) {
        return join(this.dataDir, 'users', userSlugDirName(slug), 'workbench.db');
    }
    /** 已打开的用户库快照（提醒调度等按用户轮询的场景使用）。 */
    openedUserDbs() {
        return this.userDbs;
    }
    /**
     * DatabaseSync 形状的运行期句柄：每次调用解析到“当前上下文库”。
     * 传给路由 / 调度器 / 工具的共享入口，repo 层保持零改动。
     * （运行期替身只暴露 repo 层实际使用的 prepare / exec；生命周期走 pool.close()。）
     */
    handle() {
        const pool = this;
        return {
            prepare: (sql) => pool.current().prepare(sql),
            exec: (sql) => pool.current().exec(sql),
        };
    }
    /** 关闭默认库与全部用户库。 */
    close() {
        this.defaultDb.close();
        for (const db of this.userDbs.values())
            db.close();
        this.userDbs.clear();
    }
    /** 打开（或复用）用户库；首次打开时建目录、迁移并写字典种子。 */
    forUser(slug) {
        if (!isSafeUserSlug(slug))
            throw new Error(`unsafe user slug: ${slug}`);
        let db = this.userDbs.get(slug);
        if (db === undefined) {
            db = this.openAt(this.userDbPath(slug));
            this.userDbs.set(slug, db);
        }
        return db;
    }
    openAt(dbPath) {
        const db = openWorkbenchDb({ dbPath });
        seedDictionaries(db);
        return db;
    }
}
// ---------------------------------------------------------------------------
// 进程内活动池：helpers 的鉴权函数经此进入用户库上下文。
// ---------------------------------------------------------------------------
let activePool;
/** 插件 apply 时绑定进程内活动池（单实例；新池覆盖旧池）。 */
export function bindWorkbenchDbPool(pool) {
    activePool = pool;
}
/** 鉴权解析出用户后进入其库上下文；未绑定池（如单测）时空操作。 */
export function enterWorkbenchUserDb(slug) {
    activePool?.enterForUser(slug);
}
/**
 * 在用户库上下文中执行 fn（run 语义：新建上下文，fn 及其 async 续体可见；
 * 不触碰调用方的执行帧）。工具层多租户路由（withTenantRouting）用此——
 * 工具在同步段调 enterWith 会改写「调用方（agent 框架）的当前帧」并泄漏
 * 上下文进框架续体，run 则把作用域限定在工具执行自身。
 * 未绑定池（如单测）时直接执行 fn。
 */
export function runWithWorkbenchUserDb(slug, fn) {
    return activePool === undefined ? fn() : activePool.runForUser(slug, fn);
}
