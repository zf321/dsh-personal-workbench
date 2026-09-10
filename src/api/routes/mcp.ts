/**
 * 个人 MCP 服务域路由：配置 CRUD + 连通性探测（tools/list）。
 *
 * 每个请求经工作台鉴权后进入用户库上下文（配置只读写本人；多租户隔离见 db/pool.ts）。
 * 修改即时落库 → 对话工具下一次调用即按新配置连接（对话中切换服务无需新会话）。
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { DatabaseSync } from 'node:sqlite'
import {
  createMcpServer, deleteMcpServer, getMcpServer, listMcpServers, recordMcpStatus, recordMcpTools, updateMcpServer,
} from '../../db/repo.js'
import { probeMcpServer } from '../../mcp/client.js'
import { authenticateWorkbenchRequest, enterWorkbenchAuthContext, pathSegments, readJsonBody, writeJson } from './helpers.js'

export const MCP_PREFIX = '/api/workbench/mcp'

/** 探测指定服务并把结果写回缓存/状态；返回探测结论（错误文案面向用户）。 */
async function probeAndRecord(db: DatabaseSync, id: string): Promise<{ ok: boolean; error?: string }> {
  const row = getMcpServer(db, id)
  if (row === undefined) return { ok: false, error: 'mcp server not found' }
  const result = await probeMcpServer(row)
  if (result.ok) {
    recordMcpTools(db, id, result.tools)
    return { ok: true }
  }
  recordMcpStatus(db, id, 'error', result.error ?? 'probe failed')
  return { ok: false, ...(result.error === undefined ? {} : { error: result.error }) }
}

export function makeMcpRoutes(db: DatabaseSync): WebRoute[] {
  return [
    {
      kind: 'prefix',
      path: MCP_PREFIX,
      handler: async (req, res) => {
        const auth = await authenticateWorkbenchRequest(req)
        if (auth === undefined) return writeJson(res, 401, { error: 'unauthorized: login required' })
        enterWorkbenchAuthContext(auth)
        const url = new URL(req.url ?? '/', 'http://localhost')
        const segments = pathSegments(url, MCP_PREFIX)
        const method = req.method ?? 'GET'
        const body = ['POST', 'PATCH'].includes(method) ? await readJsonBody(req) : undefined

        // ---------------------------------------------------------- /servers
        if (segments.length === 1 && segments[0] === 'servers') {
          if (method === 'GET') {
            return writeJson(res, 200, { ok: true, servers: listMcpServers(db) })
          }
          if (method === 'POST') {
            if (body === undefined) return writeJson(res, 400, { error: 'invalid JSON body' })
            try {
              const server = createMcpServer(db, {
                name: typeof body.name === 'string' ? body.name : '',
                url: typeof body.url === 'string' ? body.url : '',
                headers: body.headers,
                enabled: body.enabled !== false,
                sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
                timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
              })
              const probe = body.probe === true ? await probeAndRecord(db, server.id) : undefined
              return writeJson(res, 201, { ok: true, server: getMcpServer(db, server.id), probe })
            } catch (error) {
              return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
            }
          }
          return writeJson(res, 405, { error: 'method not allowed' })
        }

        // ---------------------------------------------------------- /servers/:id[/probe]
        if (segments.length >= 2 && segments[0] === 'servers') {
          const id = segments[1]
          const row = getMcpServer(db, id)
          if (row === undefined) return writeJson(res, 404, { error: 'mcp server not found' })

          if (segments.length === 3 && segments[2] === 'probe' && method === 'POST') {
            const probe = await probeAndRecord(db, id)
            return writeJson(res, 200, { ok: true, server: getMcpServer(db, id), probe })
          }
          if (segments.length === 2 && method === 'PATCH') {
            if (body === undefined) return writeJson(res, 400, { error: 'invalid JSON body' })
            try {
              const patch: Parameters<typeof updateMcpServer>[2] = {}
              if (typeof body.name === 'string') patch.name = body.name
              if (typeof body.url === 'string') patch.url = body.url
              if (body.headers !== undefined) patch.headers = body.headers
              if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
              if (typeof body.sortOrder === 'number') patch.sortOrder = body.sortOrder
              if (typeof body.timeoutMs === 'number') patch.timeoutMs = body.timeoutMs
              const updated = updateMcpServer(db, id, patch)
              if (updated === undefined) return writeJson(res, 404, { error: 'mcp server not found' })
              const probe = body.probe === true ? await probeAndRecord(db, id) : undefined
              return writeJson(res, 200, { ok: true, server: getMcpServer(db, id), probe })
            } catch (error) {
              return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
            }
          }
          if (segments.length === 2 && method === 'DELETE') {
            return writeJson(res, 200, { ok: true, deleted: deleteMcpServer(db, id) })
          }
          return writeJson(res, 405, { error: 'method not allowed' })
        }

        return writeJson(res, 404, { error: 'not found' })
      },
    },
  ]
}
