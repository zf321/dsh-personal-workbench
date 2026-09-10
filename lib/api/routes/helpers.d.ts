import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { getTask, type ReportPeriodCode, type TaskInput } from '../../db/repo.js';
export declare const TASKS_PREFIX = "/api/workbench/tasks";
export declare const DRAFTS_PREFIX = "/api/workbench/drafts";
export declare const REMINDERS_PREFIX = "/api/workbench/reminders";
export declare const PLANS_PREFIX = "/api/workbench/plans";
export declare const REPORTS_PREFIX = "/api/workbench/reports";
export declare const AI_SESSIONS_PREFIX = "/api/workbench/ai-sessions";
export declare const KNOWLEDGE_PREFIX = "/api/workbench/knowledge";
export declare const IDEAS_PREFIX = "/api/workbench/ideas";
export declare const IDEA_CLUSTERS_PREFIX = "/api/workbench/idea-clusters";
/** 只接受回环请求（同 dsh-ssh 的信任围栏）。 */
export declare function isLoopbackRequest(req: IncomingMessage): boolean;
/** 宿主多租户插件 /projects/api/whoami 返回的用户形状（workbench 用到的子集）。 */
export interface WorkbenchUser {
    slug: string;
    name: string;
    role: string;
    /** 用户工作区绝对路径；管理员为 null。 */
    workspacePath: string | null;
    projectSlug: string | null;
    projectName: string | null;
}
/** 工作台请求的鉴权结果：本机回环（走默认单用户库）或已认证的多租户用户。 */
export type WorkbenchAuth = {
    kind: 'loopback';
} | {
    kind: 'user';
    user: WorkbenchUser;
};
/**
 * 工作台请求入口围栏。
 * - 本机回环请求直通（CLI / 本机工具的既有行为不变）。
 * - 其余请求必须携带 Bearer token，经宿主多租户插件验证后放行。
 *   调用方应在 await 本函数后、于同一续体同步调用 enterWorkbenchAuthContext(auth)
 *   进入该用户库上下文（per-user 隔离，见 db/pool.ts）；回环请求用默认库。
 * - WORKBENCH_REQUIRE_AUTH_TOKEN=1 时禁用回环直通：用于端口映射/代理部署
 *   （外部流量在容器内也呈现为回环），所有请求都必须携带有效 token。
 * 返回 undefined 表示未授权，调用方应返回 401。
 */
export declare function authenticateWorkbenchRequest(req: IncomingMessage): Promise<WorkbenchAuth | undefined>;
/**
 * 在路由 handler 的续体里同步进入该请求的库上下文（per-user 隔离）。
 * AsyncLocalStorage.enterWith 的语义：在被 await 的辅助函数内部（其自身 await
 * 之后）调用不会传播到调用方——必须由 handler 在 await 鉴权之后的下一行同步调用
 * （见 pool.test.mjs 的时序回归测试）。回环与未授权（undefined）均无操作。
 */
export declare function enterWorkbenchAuthContext(auth: WorkbenchAuth | undefined): void;
/** 请求者的文件访问边界：open=不限制（回环/管理员）；workspace=限定根；denied=无工作区且拒绝。 */
export type FileBoundary = {
    mode: 'open';
} | {
    mode: 'denied';
} | {
    mode: 'workspace';
    root: string;
};
/**
 * 计算请求者的文件访问边界（多租户工作区约束的统一口径）：
 * - 本机回环与管理员的既有行为不变（open）；
 * - 项目用户（role=user）限定在其工作区内；工作区缺失时拒绝（fail closed）。
 */
export declare function fileBoundaryOf(auth: WorkbenchAuth | undefined): FileBoundary;
/** 校验任务/设置里的工作区路径在请求者边界内；越界抛错（消息面向用户/agent）。 */
export declare function assertPathWithinBoundary(boundary: FileBoundary, value: string | null | undefined, field: string): void;
export declare function writeJson(res: ServerResponse, status: number, body: unknown): void;
export declare function readJsonBody(req: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown> | undefined>;
export declare const MAX_LOCAL_DOC_BYTES: number;
/** 把 file:// URL 或绝对路径转成服务器本地文件路径。 */
export declare function fileLinkToPath(link: string): string;
/** 根据宿主平台把用户输入的绝对路径归一化为服务器可读路径（WSL 下 D:\Code -> /mnt/d/Code）。 */
export declare function toNativePath(link: string): string;
export declare function pathSegments(url: URL, prefix: string): string[];
export declare function requireCode(db: DatabaseSync, kind: string, code: string, field: string): void;
export declare function todayRange(now: Date): {
    start: string;
    end: string;
};
export declare const PERIOD_DATE_RE: RegExp;
export declare function periodRange(periodCode: ReportPeriodCode, periodStart: string): {
    start: string;
    end: string;
} | undefined;
export declare function reportContext(db: DatabaseSync, periodCode: ReportPeriodCode, periodStart: string): Record<string, unknown> | undefined;
/** 任务在 HTTP 层的形状：allDay 由 0/1 转布尔。 */
export declare function publicTask(task: NonNullable<ReturnType<typeof getTask>>): Record<string, unknown>;
export declare function defaultRecurrenceRule(code: string, anchor?: string | null): Record<string, unknown>;
export declare function taskInputFromBody(body: Record<string, unknown>): TaskInput;
