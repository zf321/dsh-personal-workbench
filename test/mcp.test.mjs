/**
 * 个人 MCP 服务：数据层 CRUD / MCP 客户端 / 域路由 / agent 工具。
 *
 * 假服务器实现 StreamableHTTP 最小协议子集（JSON 响应模式）：
 * initialize（回显协议版本）→ notifications/initialized（202 无 body）→ tools/list / tools/call。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { openWorkbenchDb } from '../lib/db/database.js'
import { seedDictionaries } from '../lib/db/seed.js'
import { makeRoutes } from '../lib/api/routes.js'
import {
  clampMcpTimeoutMs, createMcpServer, deleteMcpServer, getMcpServer, getMcpServerByName, listMcpServers,
  normalizeMcpHeaders, normalizeMcpServerName, normalizeMcpServerUrl, recordMcpStatus, recordMcpTools, updateMcpServer,
} from '../lib/db/repo.js'
import { callMcpServerTool, probeMcpServer } from '../lib/mcp/client.js'
import { mcpCallTool, mcpListTool } from '../lib/tools.js'

// ---------------------------------------------------------------------------
// 假 MCP 服务（StreamableHTTP：POST + application/json 单响应）
// ---------------------------------------------------------------------------

function startFakeMcpServer({ broken = false } = {}) {
  const state = { calls: [], authHeaders: [] }
  const server = http.createServer((req, res) => {
    const respond = (status, payload) => {
      if (payload === undefined) { res.writeHead(status); return res.end() }
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    if (req.method !== 'POST') return respond(405, { error: 'method not allowed' })
    state.authHeaders.push(req.headers.authorization ?? null)
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      let message
      try { message = JSON.parse(raw) } catch { return respond(400, { error: 'bad json' }) }
      if (broken) return respond(500, { error: 'boom' })
      const id = message.id
      const reply = (result) => respond(200, { jsonrpc: '2.0', id, result })
      const fail = (code, text) => respond(200, { jsonrpc: '2.0', id, error: { code, message: text } })
      switch (message.method) {
        case 'initialize':
          return reply({
            protocolVersion: message.params?.protocolVersion ?? '2025-03-26',
            capabilities: { tools: {} },
            serverInfo: { name: 'fake-mcp', version: '9.9.9' },
          })
        case 'notifications/initialized':
          return respond(202, undefined)
        case 'tools/list':
          return reply({
            tools: [
              { name: 'echo', description: '回显参数', inputSchema: { type: 'object', properties: {} } },
              { name: 'structured', description: '带结构化输出', inputSchema: { type: 'object' } },
              { name: 'boom', description: '执行失败', inputSchema: { type: 'object' } },
            ],
          })
        case 'tools/call': {
          const tool = message.params?.name
          state.calls.push({ tool, args: message.params?.arguments ?? {} })
          if (tool === 'echo') return reply({ content: [{ type: 'text', text: `echo:${JSON.stringify(message.params?.arguments ?? {})}` }] })
          if (tool === 'structured') return reply({ content: [{ type: 'text', text: 'ok' }], structuredContent: { value: 42 } })
          if (tool === 'boom') return reply({ isError: true, content: [{ type: 'text', text: '工具执行失败' }] })
          return fail(-32602, `unknown tool: ${tool}`)
        }
        default:
          return fail(-32601, `method not found: ${message.method}`)
      }
    })
  })
  return { server, state }
}

async function withFakeMcpServer(fn, options) {
  const { server, state } = startFakeMcpServer(options)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}/mcp`
  try {
    await fn({ baseUrl, state })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
}

// ---------------------------------------------------------------------------
// 测试 HTTP 服务（同 routes.test.mjs 的循环匹配模式）
// ---------------------------------------------------------------------------

function startTestServer() {
  const db = openWorkbenchDb({ dbPath: ':memory:' })
  seedDictionaries(db)
  const routes = makeRoutes(db)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    for (const route of routes) {
      if (route.kind === 'prefix' && url.pathname.startsWith(route.path)) return route.handler(req, res)
      if (route.kind === 'exact' && url.pathname === route.path) return route.handler(req, res)
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
  return { db, server }
}

async function withServer(fn) {
  const { db, server } = startTestServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const request = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text === '' ? null : JSON.parse(text) }
  }
  try {
    await fn({ db, request })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    db.close()
  }
}

// ---------------------------------------------------------------------------
// 数据层
// ---------------------------------------------------------------------------

test('mcp repo: 校验规则与边界', () => {
  assert.equal(normalizeMcpServerName('  地图服务  '), '地图服务')
  assert.throws(() => normalizeMcpServerName('   '), /required/)
  assert.throws(() => normalizeMcpServerName('a'.repeat(65)), /too long/)
  assert.equal(normalizeMcpServerUrl('https://example.com/mcp'), 'https://example.com/mcp')
  assert.throws(() => normalizeMcpServerUrl(''), /required/)
  assert.throws(() => normalizeMcpServerUrl('not-a-url'), /not a valid URL/)
  assert.throws(() => normalizeMcpServerUrl('ftp://example.com/mcp'), /http\(s\)/)
  assert.deepEqual(normalizeMcpHeaders(undefined), {})
  assert.deepEqual(normalizeMcpHeaders({ Authorization: 'Bearer x' }), { Authorization: 'Bearer x' })
  assert.throws(() => normalizeMcpHeaders('nope'), /must be an object/)
  assert.throws(() => normalizeMcpHeaders({ 'bad name': 'x' }), /invalid header name/)
  assert.throws(() => normalizeMcpHeaders({ A: 1 }), /must be a string/)
  assert.equal(clampMcpTimeoutMs(undefined), 30000)
  assert.equal(clampMcpTimeoutMs(5000), 5000)
  assert.equal(clampMcpTimeoutMs(100), 3000)
  assert.equal(clampMcpTimeoutMs(9e9), 120000)
})

test('mcp repo: CRUD 全流程', () => {
  const db = openWorkbenchDb({ dbPath: ':memory:' })
  try {
    const created = createMcpServer(db, { name: ' 地图服务 ', url: 'http://10.0.0.1:8100/mcp', headers: { Authorization: 'Bearer x' }, timeoutMs: 5000 })
    assert.equal(created.name, '地图服务')
    assert.equal(created.url, 'http://10.0.0.1:8100/mcp')
    assert.equal(created.enabled, 1)
    assert.equal(created.timeoutMs, 5000)
    assert.deepEqual(created.headers, { Authorization: 'Bearer x' })
    assert.deepEqual(created.tools, [])

    assert.equal(getMcpServer(db, created.id).name, '地图服务')
    assert.equal(getMcpServerByName(db, '地图服务').id, created.id)
    assert.equal(getMcpServerByName(db, '不存在'), undefined)
    assert.equal(listMcpServers(db).length, 1)

    // 名称唯一（对话工具按名调用，同库内不可重名）
    assert.throws(() => createMcpServer(db, { name: '地图服务', url: 'http://x/mcp' }), /already exists/)

    const updated = updateMcpServer(db, created.id, { name: '地图服务2', enabled: false, timeoutMs: 999999 })
    assert.equal(updated.name, '地图服务2')
    assert.equal(updated.enabled, 0)
    assert.equal(updated.timeoutMs, 120000)
    assert.equal(updateMcpServer(db, 'no-such-id', { name: 'x' }), undefined)

    assert.equal(deleteMcpServer(db, created.id), true)
    assert.equal(deleteMcpServer(db, created.id), false)
    assert.equal(getMcpServer(db, created.id), undefined)
    assert.equal(listMcpServers(db).length, 0)
  } finally { db.close() }
})

test('mcp repo: 地址/请求头变化时工具缓存失效', () => {
  const db = openWorkbenchDb({ dbPath: ':memory:' })
  try {
    const row = createMcpServer(db, { name: 'svc', url: 'http://h1/mcp' })
    recordMcpTools(db, row.id, [{ name: 'echo', description: 'e' }])
    let now = getMcpServer(db, row.id)
    assert.equal(now.tools.length, 1)
    assert.equal(now.lastStatus, 'ok')
    assert.ok(now.toolsAt !== null)

    // 仅改名不清缓存
    updateMcpServer(db, row.id, { name: 'svc2' })
    now = getMcpServer(db, row.id)
    assert.equal(now.tools.length, 1)
    assert.equal(now.lastStatus, 'ok')

    // 改地址 → 工具清单与探测状态失效
    updateMcpServer(db, row.id, { url: 'http://h2/mcp' })
    now = getMcpServer(db, row.id)
    assert.equal(now.tools.length, 0)
    assert.equal(now.toolsAt, null)
    assert.equal(now.lastStatus, '')

    // 重新探测后改请求头 → 再次失效
    recordMcpTools(db, row.id, [{ name: 'echo', description: 'e' }])
    updateMcpServer(db, row.id, { headers: { Authorization: 'Bearer y' } })
    now = getMcpServer(db, row.id)
    assert.equal(now.tools.length, 0)

    // 错误状态记录（超长错误截断 500）
    recordMcpStatus(db, row.id, 'error', 'e'.repeat(600))
    now = getMcpServer(db, row.id)
    assert.equal(now.lastStatus, 'error')
    assert.equal(now.lastError.length, 500)
  } finally { db.close() }
})

// ---------------------------------------------------------------------------
// MCP 客户端
// ---------------------------------------------------------------------------

test('mcp client: 探测与调用假服务', async () => {
  await withFakeMcpServer(async ({ baseUrl, state }) => {
    const target = { url: baseUrl, headers: { Authorization: 'Bearer t1' }, timeoutMs: 5000 }
    const probe = await probeMcpServer(target)
    assert.equal(probe.ok, true)
    assert.equal(probe.serverName, 'fake-mcp')
    assert.equal(probe.serverVersion, '9.9.9')
    assert.equal(probe.tools.length, 3)
    assert.ok(probe.tools.some((tool) => tool.name === 'echo' && tool.description === '回显参数'))
    // 请求头透传到每个 HTTP 请求
    assert.ok(state.authHeaders.includes('Bearer t1'))

    const ok = await callMcpServerTool(target, 'echo', { city: '北京' })
    assert.equal(ok.ok, true)
    assert.equal(ok.isError, false)
    assert.match(ok.text, /echo:\{"city":"北京"\}/)

    const structured = await callMcpServerTool(target, 'structured', {})
    assert.match(structured.text, /```json/)
    assert.match(structured.text, /"value": 42/)

    // 服务端 isError：连接成功、工具逻辑失败
    const boom = await callMcpServerTool(target, 'boom', {})
    assert.equal(boom.ok, true)
    assert.equal(boom.isError, true)
    assert.match(boom.text, /工具执行失败/)

    // JSON-RPC 错误：调用未知工具
    const unknown = await callMcpServerTool(target, 'nope', {})
    assert.equal(unknown.ok, false)
    assert.match(unknown.error, /unknown tool/)
  })
})

test('mcp client: 服务不可达/异常时返回 ok:false', async () => {
  const refused = await probeMcpServer({ url: 'http://127.0.0.1:1/mcp', headers: {}, timeoutMs: 2000 })
  assert.equal(refused.ok, false)
  assert.ok(refused.error.length > 0)

  await withFakeMcpServer(async ({ baseUrl }) => {
    const probe = await probeMcpServer({ url: baseUrl, headers: {}, timeoutMs: 2000 })
    assert.equal(probe.ok, false)
    assert.ok(probe.error.length > 0)
  }, { broken: true })
})

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------

test('mcp routes: CRUD + probe 全链路', async () => {
  await withFakeMcpServer(async ({ baseUrl }) => {
    await withServer(async ({ request }) => {
      // 创建（保存即探测）
      const created = await request('POST', '/api/workbench/mcp/servers', {
        name: '地图服务', url: baseUrl, headers: { Authorization: 'Bearer r1' }, probe: true,
      })
      assert.equal(created.status, 201)
      assert.equal(created.body.ok, true)
      assert.equal(created.body.server.name, '地图服务')
      assert.equal(created.body.probe.ok, true)
      assert.equal(created.body.server.lastStatus, 'ok')
      assert.equal(created.body.server.tools.length, 3)
      const id = created.body.server.id

      // 列表
      const listed = await request('GET', '/api/workbench/mcp/servers')
      assert.equal(listed.status, 200)
      assert.equal(listed.body.servers.length, 1)

      // 改名 + 停用（改配置不清探测缓存）
      const patched = await request('PATCH', `/api/workbench/mcp/servers/${id}`, { name: '地图2', enabled: false })
      assert.equal(patched.status, 200)
      assert.equal(patched.body.server.name, '地图2')
      assert.equal(patched.body.server.enabled, 0)
      assert.equal(patched.body.server.tools.length, 3)

      // 手动探测
      const probed = await request('POST', `/api/workbench/mcp/servers/${id}/probe`)
      assert.equal(probed.status, 200)
      assert.equal(probed.body.probe.ok, true)

      // 校验失败 400
      const bad = await request('POST', '/api/workbench/mcp/servers', { name: '', url: 'http://x/mcp' })
      assert.equal(bad.status, 400)
      assert.match(bad.body.error, /name is required/)

      // 不存在的服务 404
      const missingPatch = await request('PATCH', '/api/workbench/mcp/servers/no-such-id', { name: 'x' })
      assert.equal(missingPatch.status, 404)

      // 删除
      const deleted = await request('DELETE', `/api/workbench/mcp/servers/${id}`)
      assert.equal(deleted.status, 200)
      assert.equal(deleted.body.deleted, true)
      const again = await request('DELETE', `/api/workbench/mcp/servers/${id}`)
      assert.equal(again.status, 404)
    })
  })
})

test('mcp routes: 不可达服务的探测失败会记录错误', async () => {
  await withServer(async ({ request }) => {
    const created = await request('POST', '/api/workbench/mcp/servers', { name: '坏服务', url: 'http://127.0.0.1:1/mcp' })
    assert.equal(created.status, 201)
    assert.equal(created.body.probe, undefined)
    assert.equal(created.body.server.lastStatus, '')

    const probed = await request('POST', `/api/workbench/mcp/servers/${created.body.server.id}/probe`)
    assert.equal(probed.status, 200)
    assert.equal(probed.body.probe.ok, false)
    assert.equal(probed.body.server.lastStatus, 'error')
    assert.ok(probed.body.server.lastError.length > 0)
  })
})

// ---------------------------------------------------------------------------
// agent 工具
// ---------------------------------------------------------------------------

test('mcp tools: list/call 实时读取用户配置', async () => {
  await withFakeMcpServer(async ({ baseUrl, state }) => {
    const db = openWorkbenchDb({ dbPath: ':memory:' })
    try {
      const list = mcpListTool(db)
      const call = mcpCallTool(db)

      // 未配置时的引导文案
      const empty = await list.execute({})
      assert.match(empty, /未配置/)

      createMcpServer(db, { name: '地图服务', url: baseUrl })
      createMcpServer(db, { name: '停用服务', url: baseUrl, enabled: false })

      // refresh=true 现场探测启用中的服务
      const listed = await list.execute({ refresh: true })
      assert.match(listed, /个人 MCP 服务 2 个/)
      assert.match(listed, /地图服务/)
      assert.match(listed, /echo/)
      assert.match(listed, /已停用/)

      // 按名过滤
      const one = await list.execute({ server: '地图服务' })
      assert.match(one, /地图服务/)
      assert.doesNotMatch(one, /停用服务/)

      // 调用成功
      const ok = await call.execute({ server: '地图服务', tool: 'echo', arguments: { city: '北京' } })
      assert.match(ok, /结果/)
      assert.match(ok, /北京/)
      assert.ok(state.calls.some((entry) => entry.tool === 'echo'))

      // 模型把 arguments 序列化成 JSON 字符串时仍能正确解析（回归：参数不得被丢弃）
      const stringArgs = await call.execute({ server: '地图服务', tool: 'echo', arguments: '{"city":"上海","limit":2}' })
      assert.match(stringArgs, /结果/)
      assert.match(stringArgs, /上海/)
      assert.deepEqual(state.calls.at(-1).args, { city: '上海', limit: 2 })

      // 非法 JSON 字符串给出明确错误，不静默丢参
      const badString = await call.execute({ server: '地图服务', tool: 'echo', arguments: 'not-json' })
      assert.match(badString, /不是合法的 JSON/)

      // 服务端 isError
      const boom = await call.execute({ server: '地图服务', tool: 'boom' })
      assert.match(boom, /返回错误/)
      assert.match(boom, /工具执行失败/)

      // 停用服务拒绝
      const disabled = await call.execute({ server: '停用服务', tool: 'echo' })
      assert.match(disabled, /已停用/)

      // 未知服务
      const unknown = await call.execute({ server: '不存在', tool: 'echo' })
      assert.match(unknown, /没有名为/)

      // 调用成功后最近状态为 ok（对话中改配置 → 下一次调用即时生效）
      assert.equal(getMcpServerByName(db, '地图服务').lastStatus, 'ok')
    } finally { db.close() }
  })
})
