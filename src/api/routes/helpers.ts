/**
 * 路由层共享工具：请求围栏（本机回环 / 多租户 token 委托验证）、响应、路径、时间区间、任务序列化。
 *
 * 从 routes.ts 原样抽出（不改行为），供按域拆分的路由模块共用。
 * 所有函数显式接收 db / req / res，便于单测与复用。
 */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { enterWorkbenchUserDb, isSafeUserSlug } from '../../db/pool.js'
import { isInside } from '../../tenant/workspace-map.js'
import {
  ensureRecurringInstances, getDailyPlan, getDictionary, getTask, listTasks, localDateString,
  type ReportPeriodCode, type TaskInput,
} from '../../db/repo.js'

export const TASKS_PREFIX = '/api/workbench/tasks'
export const DRAFTS_PREFIX = '/api/workbench/drafts'
export const REMINDERS_PREFIX = '/api/workbench/reminders'
export const PLANS_PREFIX = '/api/workbench/plans'
export const REPORTS_PREFIX = '/api/workbench/reports'
export const AI_SESSIONS_PREFIX = '/api/workbench/ai-sessions'
export const KNOWLEDGE_PREFIX = '/api/workbench/knowledge'
export const IDEAS_PREFIX = '/api/workbench/ideas'
export const IDEA_CLUSTERS_PREFIX = '/api/workbench/idea-clusters'

/** 只接受回环请求（同 dsh-ssh 的信任围栏）。 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let url: URL
  try { url = new URL(`http://${host}`) } catch { return false }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost' && url.hostname !== '[::1]') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === url.host } catch { return false }
}

/** 宿主多租户插件 /projects/api/whoami 返回的用户形状（workbench 用到的子集）。 */
export interface WorkbenchUser {
  slug: string
  name: string
  role: string
  /** 用户工作区绝对路径；管理员为 null。 */
  workspacePath: string | null
  projectSlug: string | null
  projectName: string | null
}

/** 工作台请求的鉴权结果：本机回环（走默认单用户库）或已认证的多租户用户。 */
export type WorkbenchAuth = { kind: 'loopback' } | { kind: 'user'; user: WorkbenchUser }

/** token 验证结果缓存：TTL 内同一 token 只回源一次 whoami（含失败负缓存）。 */
const AUTH_CACHE_TTL_MS = 30_000
const AUTH_CACHE_MAX_ENTRIES = 512
const authCache = new Map<string, { expiresAt: number; user: WorkbenchUser | null }>()

/** 从 Authorization 头解析 Bearer token。 */
function bearerTokenOf(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (typeof header !== 'string') return undefined
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1]
}

/**
 * 委托宿主多租户插件验证 token：自调用 127.0.0.1 当前端口上的
 * /projects/api/whoami（本地令牌与 Keycloak 令牌都由该端点识别，
 * 不复制其验证逻辑）。任何失败（网络/超时/401/形状不符）返回 undefined。
 */
async function verifyTokenWithHost(req: IncomingMessage, token: string): Promise<WorkbenchUser | undefined> {
  const port = req.socket.localPort
  if (typeof port !== 'number' || port <= 0) return undefined
  try {
    const response = await fetch(`http://127.0.0.1:${port}/projects/api/whoami`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return undefined
    const body = (await response.json()) as {
      user?: { slug?: unknown; name?: unknown; role?: unknown; cwd?: unknown; projectSlug?: unknown; projectName?: unknown }
    }
    const user = body.user
    if (user === undefined) return undefined
    if (typeof user.slug !== 'string' || typeof user.name !== 'string') return undefined
    if (user.role !== 'user' && user.role !== 'admin') return undefined
    return {
      slug: user.slug,
      name: user.name,
      role: user.role,
      workspacePath: typeof user.cwd === 'string' ? user.cwd : null,
      projectSlug: typeof user.projectSlug === 'string' ? user.projectSlug : null,
      projectName: typeof user.projectName === 'string' ? user.projectName : null,
    }
  } catch { return undefined }
}

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
export async function authenticateWorkbenchRequest(req: IncomingMessage): Promise<WorkbenchAuth | undefined> {
  if (process.env.WORKBENCH_REQUIRE_AUTH_TOKEN !== '1' && isLoopbackRequest(req)) return { kind: 'loopback' }
  if (req.headers['sec-fetch-site'] === 'cross-site') return undefined
  const token = bearerTokenOf(req)
  if (token === undefined) return undefined
  const key = createHash('sha256').update(token).digest('hex')
  const cached = authCache.get(key)
  if (cached !== undefined && cached.expiresAt > Date.now()) {
    return cached.user === null ? undefined : { kind: 'user', user: cached.user }
  }
  if (authCache.size >= AUTH_CACHE_MAX_ENTRIES) authCache.clear()
  const verified = await verifyTokenWithHost(req, token)
  // slug 会作为用户库目录名，形状不符者按未授权处理（fail closed）。
  const user = verified !== undefined && isSafeUserSlug(verified.slug) ? verified : null
  authCache.set(key, { expiresAt: Date.now() + AUTH_CACHE_TTL_MS, user })
  return user === null ? undefined : { kind: 'user', user }
}

/**
 * 在路由 handler 的续体里同步进入该请求的库上下文（per-user 隔离）。
 * AsyncLocalStorage.enterWith 的语义：在被 await 的辅助函数内部（其自身 await
 * 之后）调用不会传播到调用方——必须由 handler 在 await 鉴权之后的下一行同步调用
 * （见 pool.test.mjs 的时序回归测试）。回环与未授权（undefined）均无操作。
 */
export function enterWorkbenchAuthContext(auth: WorkbenchAuth | undefined): void {
  if (auth !== undefined && auth.kind === 'user') enterWorkbenchUserDb(auth.user.slug)
}

/** 请求者的文件访问边界：open=不限制（回环/管理员）；workspace=限定根；denied=无工作区且拒绝。 */
export type FileBoundary = { mode: 'open' } | { mode: 'denied' } | { mode: 'workspace'; root: string }

/**
 * 计算请求者的文件访问边界（多租户工作区约束的统一口径）：
 * - 本机回环与管理员的既有行为不变（open）；
 * - 项目用户（role=user）限定在其工作区内；工作区缺失时拒绝（fail closed）。
 */
export function fileBoundaryOf(auth: WorkbenchAuth | undefined): FileBoundary {
  if (auth === undefined) return { mode: 'denied' }
  if (auth.kind === 'loopback') return { mode: 'open' }
  if (auth.user.role === 'admin') return { mode: 'open' }
  const workspacePath = auth.user.workspacePath
  return workspacePath === null || workspacePath === ''
    ? { mode: 'denied' }
    : { mode: 'workspace', root: workspacePath }
}

/** 校验任务/设置里的工作区路径在请求者边界内；越界抛错（消息面向用户/agent）。 */
export function assertPathWithinBoundary(boundary: FileBoundary, value: string | null | undefined, field: string): void {
  if (value === null || value === undefined || value.trim() === '') return
  if (boundary.mode === 'open') return
  if (boundary.mode === 'denied') throw new Error(`no workspace for this account, cannot set ${field}`)
  if (!isInside(boundary.root, value)) throw new Error(`${field} is outside your workspace`)
}

export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

export async function readJsonBody(req: IncomingMessage, maxBytes = 256 * 1024): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > maxBytes) return undefined
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch { return undefined }
}

export const MAX_LOCAL_DOC_BYTES = 1024 * 1024

/** 把 file:// URL 或绝对路径转成服务器本地文件路径。 */
export function fileLinkToPath(link: string): string {
  const trimmed = link.trim()
  if (/^file:/i.test(trimmed)) {
    const url = new URL(trimmed)
    if (url.protocol !== 'file:') throw new Error('not a file URL')
    let pathname = decodeURIComponent(url.pathname)
    // file:///D:/... 在 URL.pathname 中会是 /D:/...，去掉盘符前多余的斜杠。
    if (/^\/[A-Za-z]:[\\/]/.test(pathname)) pathname = pathname.slice(1)
    return pathname
  }
  return trimmed
}

/** 根据宿主平台把用户输入的绝对路径归一化为服务器可读路径（WSL 下 D:\Code -> /mnt/d/Code）。 */
export function toNativePath(link: string): string {
  let path = fileLinkToPath(link)
  if (process.platform !== 'win32' && /^[A-Za-z]:[\\/]/.test(path)) {
    const match = /^([A-Za-z]):[\\/]?(.*)$/.exec(path)
    if (match !== null) {
      const drive = match[1].toLowerCase()
      const rest = (match[2] ?? '').replace(/\\/g, '/').replace(/^\/+/, '')
      path = rest === '' ? `/mnt/${drive}` : `/mnt/${drive}/${rest}`
    }
  }
  return path
}

export function pathSegments(url: URL, prefix: string): string[] {
  const rest = url.pathname.slice(prefix.length)
  return rest.split('/').filter((part) => part !== '')
}

export function requireCode(db: DatabaseSync, kind: string, code: string, field: string): void {
  if (typeof code !== 'string' || code.trim() === '') throw new Error(`${field} is required`)
  const entry = getDictionary(db, kind, code)
  if (entry === undefined || entry.active === 0) throw new Error(`${field}: unknown or inactive ${kind} code "${code}"`)
}

export function todayRange(now: Date): { start: string; end: string } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export const PERIOD_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function periodRange(periodCode: ReportPeriodCode, periodStart: string): { start: string; end: string } | undefined {
  if (!PERIOD_DATE_RE.test(periodStart)) return undefined
  const [y, m, d] = periodStart.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  if (Number.isNaN(start.getTime())) return undefined
  const end = new Date(start)
  end.setDate(end.getDate() + (periodCode === 'day' ? 1 : 7))
  return { start: start.toISOString(), end: end.toISOString() }
}

export function reportContext(db: DatabaseSync, periodCode: ReportPeriodCode, periodStart: string): Record<string, unknown> | undefined {
  const range = periodRange(periodCode, periodStart)
  if (range === undefined) return undefined
  const startMs = Date.parse(range.start)
  const endMs = Date.parse(range.end)
  ensureRecurringInstances(db, periodStart)
  const tasks = listTasks(db, { includeArchived: true })
  const inRange = (iso: string | null): boolean => iso !== null && Date.parse(iso) >= startMs && Date.parse(iso) < endMs
  const completed = tasks.filter((task) => inRange(task.completedAt))
  const created = tasks.filter((task) => inRange(task.createdAt))
  const eventRows = db.prepare('SELECT * FROM task_events WHERE at >= ? AND at < ? ORDER BY at ASC LIMIT 500').all(range.start, range.end) as unknown as Array<{
    id: string
    task_id: string
    event_code: string
    actor: string
    note: string | null
    at: string
  }>
  const events = eventRows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    taskTitle: getTask(db, row.task_id)?.title ?? '(任务已删除)',
    eventCode: row.event_code,
    actor: row.actor,
    note: row.note,
    at: row.at,
  }))
  const plan = periodCode === 'day' ? getDailyPlan(db, periodStart) ?? null : null
  return {
    period: { code: periodCode, start: periodStart, range },
    completedTasks: completed.map((task) => ({ id: task.id, title: task.title, typeCode: task.typeCode, priorityCode: task.priorityCode, completedAt: task.completedAt })),
    createdTasks: created.map((task) => ({ id: task.id, title: task.title, typeCode: task.typeCode, priorityCode: task.priorityCode, statusCode: task.statusCode, createdAt: task.createdAt })),
    events,
    plan,
  }
}

/** 任务在 HTTP 层的形状：allDay 由 0/1 转布尔。 */
export function publicTask(task: NonNullable<ReturnType<typeof getTask>>): Record<string, unknown> {
  return { ...task, allDay: task.allDay === 1 }
}

export function defaultRecurrenceRule(code: string, anchor?: string | null): Record<string, unknown> {
  const base = anchor !== undefined && anchor !== null ? new Date(anchor) : new Date()
  const date = Number.isNaN(base.getTime()) ? new Date() : base
  return {
    interval: 1,
    startDate: localDateString(date),
    weekdays: [date.getDay()],
    monthDay: date.getDate(),
  }
}

export function taskInputFromBody(body: Record<string, unknown>): TaskInput {
  const str = (key: string): string | undefined => typeof body[key] === 'string' ? body[key] as string : undefined
  const recurrenceCode = str('recurrenceCode')
  const recurrenceRule = typeof body.recurrenceRule === 'object' && body.recurrenceRule !== null ? body.recurrenceRule as Record<string, unknown> : undefined
  return {
    title: str('title') ?? '',
    description: str('description'),
    typeCode: str('typeCode') ?? '',
    statusCode: str('statusCode'),
    priorityCode: str('priorityCode') ?? 'p2',
    aiPolicyCode: str('aiPolicyCode'),
    dueAt: body.dueAt === null ? null : str('dueAt'),
    allDay: body.allDay === true,
    estimatedMinutes: typeof body.estimatedMinutes === 'number' ? body.estimatedMinutes : null,
    source: str('source'),
    parentId: body.parentId === null ? null : str('parentId'),
    workspacePath: body.workspacePath === null ? null : str('workspacePath'),
    extra: typeof body.extra === 'object' && body.extra !== null ? body.extra as Record<string, unknown> : undefined,
    recurrenceCode: recurrenceCode ?? null,
    recurrenceRule: recurrenceCode !== undefined && recurrenceCode !== 'none' ? recurrenceRule ?? defaultRecurrenceRule(recurrenceCode, str('dueAt')) : recurrenceRule,
  }
}
