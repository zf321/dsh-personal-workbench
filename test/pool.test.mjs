import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { openWorkbenchDb } from '../lib/db/database.js'
import { WorkbenchDbPool, isSafeUserSlug } from '../lib/db/pool.js'
import { createMcpServer, createTask, deleteMcpServer, listMcpServers, listTasks } from '../lib/db/repo.js'

const INPUT = { title: '池隔离测试', typeCode: 'client_meeting', priorityCode: 'p2' }

test('pool: slug 安全校验', () => {
  assert.equal(isSafeUserSlug('testu'), true)
  assert.equal(isSafeUserSlug('a1-b2'), true)
  // 宿主用户主键格式 project/user（两段）
  assert.equal(isSafeUserSlug('erpm/testu'), true)
  assert.equal(isSafeUserSlug('../evil'), false)
  assert.equal(isSafeUserSlug('UPPER'), false)
  assert.equal(isSafeUserSlug('a/b/c'), false)
  assert.equal(isSafeUserSlug('/a'), false)
  assert.equal(isSafeUserSlug('a/'), false)
  assert.equal(isSafeUserSlug('a//b'), false)
  assert.equal(isSafeUserSlug('a/../b'), false)
  assert.equal(isSafeUserSlug('a__b'), false)
  assert.equal(isSafeUserSlug(''), false)
})

test('pool: 默认库与用户库相互隔离', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pool-'))
  try {
    const pool = new WorkbenchDbPool({ dataDir: dir })
    const handle = pool.handle()
    createTask(handle, INPUT)
    assert.equal(listTasks(handle).length, 1)

    // 用户库懒打开：新库无任务，写入后互不影响
    const created = pool.runForUser('testu', () => {
      assert.equal(listTasks(handle).length, 0)
      createTask(handle, INPUT)
      return listTasks(handle).length
    })
    assert.equal(created, 1)
    assert.equal(listTasks(handle).length, 1)
    assert.equal(pool.runForUser('testu', () => listTasks(handle).length), 1)
    assert.ok(existsSync(join(dir, 'users', 'testu', 'workbench.db')))
    pool.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pool: 用户库首次打开即写入字典种子', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pool-'))
  try {
    const pool = new WorkbenchDbPool({ dataDir: dir })
    const handle = pool.handle()
    const count = pool.runForUser('u2', () => {
      const row = handle.prepare('SELECT COUNT(*) AS n FROM dictionaries').get()
      return Number(row.n)
    })
    assert.ok(count > 0, `dictionaries seed expected, got ${count}`)
    pool.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pool: enterForUser 由 await 之后的原续体调用可生效（围栏时序回归）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pool-'))
  try {
    const pool = new WorkbenchDbPool({ dataDir: dir })
    const handle = pool.handle()
    // 模拟路由围栏时序：guard 内部有 await（token 验证），返回后由调用方续体进入上下文
    async function guard() {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { kind: 'user', user: { slug: 'u3' } }
    }
    const auth = await guard()
    pool.enterForUser(auth.user.slug)
    createTask(handle, { ...INPUT, title: '续体路由' })
    assert.equal(pool.runForUser('u3', () => listTasks(handle).length), 1)
    pool.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pool: 两段 slug（project/user）目录名转义与隔离', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pool-'))
  try {
    const pool = new WorkbenchDbPool({ dataDir: dir })
    const handle = pool.handle()
    const created = pool.runForUser('erpm/testu', () => {
      createTask(handle, INPUT)
      return listTasks(handle).length
    })
    assert.equal(created, 1)
    assert.equal(pool.runForUser('erpm/testu', () => listTasks(handle).length), 1)
    // 默认库与其他用户不受影响
    assert.equal(listTasks(handle).length, 0)
    assert.equal(pool.userDbPath('erpm/testu'), join(dir, 'users', 'erpm__testu', 'workbench.db'))
    assert.ok(existsSync(join(dir, 'users', 'erpm__testu', 'workbench.db')))
    pool.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pool: 用户库首次打开即写入默认 MCP 服务种子（db-mcp）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pool-'))
  try {
    const pool = new WorkbenchDbPool({ dataDir: dir })
    const handle = pool.handle()
    const rows = pool.runForUser('u4', () => listMcpServers(handle))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'db-mcp')
    assert.equal(rows[0].url, 'http://db-mcp:5000/mcp')
    assert.equal(rows[0].enabled, 1)
    assert.equal(rows[0].sortOrder, 10)
    // 默认库（回环/管理员）同样播种
    assert.equal(listMcpServers(handle).length, 1)
    pool.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pool: 默认 MCP 种子只播种一次（删除后重开不复原）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pool-'))
  try {
    const pool = new WorkbenchDbPool({ dataDir: dir })
    const seeded = pool.runForUser('u5', () => listMcpServers(pool.handle())[0])
    assert.equal(seeded.name, 'db-mcp')
    pool.runForUser('u5', () => { deleteMcpServer(pool.handle(), seeded.id) })
    assert.equal(pool.runForUser('u5', () => listMcpServers(pool.handle()).length), 0)
    pool.close()

    // 模拟进程重启：重开同一数据目录，已删除的预置服务不被重新播回
    const restarted = new WorkbenchDbPool({ dataDir: dir })
    assert.equal(restarted.runForUser('u5', () => listMcpServers(restarted.handle()).length), 0)
    restarted.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pool: 用户已手工添加同 URL 服务时不重复播种', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pool-'))
  try {
    // 先按用户库路径手工建库并添加同 URL 服务（模拟播种前用户已自行配置）
    const dbPath = join(dir, 'users', 'u6', 'workbench.db')
    mkdirSync(dirname(dbPath), { recursive: true })
    const raw = openWorkbenchDb({ dbPath })
    createMcpServer(raw, { name: '我的数据库', url: 'http://db-mcp:5000/mcp' })
    raw.close()

    const pool = new WorkbenchDbPool({ dataDir: dir })
    const rows = pool.runForUser('u6', () => listMcpServers(pool.handle()))
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, '我的数据库')
    pool.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
