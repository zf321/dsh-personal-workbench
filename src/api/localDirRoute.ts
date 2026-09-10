/**
 * 知识库“选择本地文档”弹窗使用的目录/文件浏览路由。
 * 独立成文件是为了在热重载时能作为新模块被重新加载（routes.ts 会被 ESM 缓存，
 * 新增路由无法通过 dev_reload_package 立即生效）。
 */
import { readdir, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join as pathJoin } from 'node:path'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { assertValidFileLink } from '../db/repo.js'
import { isInside } from '../tenant/workspace-map.js'
import { authenticateWorkbenchRequest, enterWorkbenchAuthContext, fileBoundaryOf } from './routes/helpers.js'

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage, maxBytes = 256 * 1024): Promise<Record<string, unknown> | undefined> {
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

function fileLinkToPath(link: string): string {
  const trimmed = link.trim()
  if (/^file:/i.test(trimmed)) {
    const url = new URL(trimmed)
    if (url.protocol !== 'file:') throw new Error('not a file URL')
    let pathname = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:[\\/]/.test(pathname)) pathname = pathname.slice(1)
    return pathname
  }
  return trimmed
}

function toNativePath(link: string): string {
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

/**
 * 浏览目录。boundaryRoot —— 多租户普通用户的工作区边界：起始目录、父级上限、
 * 越界拒绝都在边界内；未传（回环/管理员）保持原有「任意位置 + homedir 起始」行为。
 */
async function listLocalDirectory(rawPath: string | undefined, boundaryRoot: string | undefined): Promise<{
  path: string
  parent: string | null
  home: string
  entries: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean; hidden: boolean }>
}> {
  const home = boundaryRoot ?? homedir()
  const dir = rawPath === undefined || rawPath.trim() === '' ? home : toNativePath(assertValidFileLink(rawPath)!)
  if (boundaryRoot !== undefined && !isInside(boundaryRoot, dir)) throw new Error('path is outside your workspace')
  const info = await stat(dir)
  if (!info.isDirectory()) throw new Error('path is not a directory')
  const dirents = await readdir(dir, { withFileTypes: true })
  const entries = dirents
    .filter((d) => d.isDirectory() || d.isFile())
    .map((d) => ({
      name: d.name,
      path: pathJoin(dir, d.name),
      isDirectory: d.isDirectory(),
      isFile: d.isFile(),
      hidden: d.name.startsWith('.'),
    }))
    .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
    .slice(0, 500)
  const parentRaw = dirname(dir) === dir ? null : dirname(dir)
  const parent = parentRaw !== null && boundaryRoot !== undefined && !isInside(boundaryRoot, parentRaw) ? null : parentRaw
  return { path: dir, parent, home, entries }
}

export function makeLocalDirRoute(): WebRoute {
  return {
    kind: 'exact',
    path: '/api/workbench/knowledge/list-local-dir',
    handler: async (req, res) => {
      const auth = await authenticateWorkbenchRequest(req)
      if (auth === undefined) return writeJson(res, 401, { error: 'unauthorized: login required' })
      enterWorkbenchAuthContext(auth)
      const boundary = fileBoundaryOf(auth)
      if (boundary.mode === 'denied') return writeJson(res, 403, { error: 'no workspace for this account' })
      const url = new URL(req.url ?? '/', 'http://localhost')
      const method = req.method ?? 'GET'
      const body = method === 'POST' ? await readJsonBody(req) : undefined
      const rawPath = method === 'GET'
        ? url.searchParams.get('path') ?? undefined
        : method === 'POST' && body !== undefined && typeof body.path === 'string' ? body.path : undefined
      try {
        const listing = await listLocalDirectory(rawPath, boundary.mode === 'workspace' ? boundary.root : undefined)
        return writeJson(res, 200, { ok: true, ...listing })
      } catch (error) {
        return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }
}
