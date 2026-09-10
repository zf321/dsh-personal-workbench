import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertPathWithinBoundary, fileBoundaryOf } from '../lib/api/routes/helpers.js'
import { bindWorkbenchDbPool, WorkbenchDbPool } from '../lib/db/pool.js'
import { createTask, listTasks } from '../lib/db/repo.js'
import { withTenantRouting } from '../lib/tenant/tool-routing.js'
import { isInside, listTenantUsers, resolveTenantUserByCwd } from '../lib/tenant/workspace-map.js'
import { submitTaskTool } from '../lib/tools.js'

const USER_AUTH = {
  kind: 'user',
  user: {
    slug: 'u1', name: 'U1', role: 'user',
    workspacePath: '/ws/erpm-u1', projectSlug: 'erpm', projectName: 'erpm',
  },
}
const ADMIN_AUTH = {
  kind: 'user',
  user: {
    slug: 'admin', name: 'Admin', role: 'admin',
    workspacePath: null, projectSlug: null, projectName: null,
  },
}

/** 写入 state.json fixture 并临时指向它；fn 结束后恢复环境变量。 */
async function withState(dir, users, fn) {
  const file = join(dir, 'state.json')
  writeFileSync(file, JSON.stringify({ users }))
  const prev = process.env.WORKBENCH_TENANT_STATE_FILE
  process.env.WORKBENCH_TENANT_STATE_FILE = file
  try {
    return await fn()
  } finally {
    if (prev === undefined) delete process.env.WORKBENCH_TENANT_STATE_FILE
    else process.env.WORKBENCH_TENANT_STATE_FILE = prev
  }
}

test('tenant: isInside 语义与宿主 paths.ts 一致', () => {
  assert.equal(isInside('/a/b', '/a/b'), true)
  assert.equal(isInside('/a/b', '/a/b/c'), true)
  assert.equal(isInside('/a/b', '/a/bc'), false)
  assert.equal(isInside('/a/b', '/a'), false)
  assert.equal(isInside('/a/b', '/a/b/../c'), false)
})

test('tenant: listTenantUsers 只保留活跃且有工作区的安全用户', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-tenant-'))
  try {
    await withState(dir, {
      u1: { slug: 'u1', role: 'user', status: 'active', workspacePath: '/ws/erpm-u1' },
      u2: { slug: 'u2', role: 'user', status: 'disabled', workspacePath: '/ws/erpm-u2' },
      admin: { slug: 'admin', role: 'admin', status: 'active', workspacePath: null },
      evil: { slug: '../evil', role: 'user', status: 'active', workspacePath: '/ws/evil' },
      'erpm/t2': { slug: 'erpm/t2', role: 'user', status: 'active', workspacePath: '/ws/erpm-t2' },
    }, () => {
      // 两段 slug（宿主真实用户主键格式）同样被识别
      assert.deepEqual(listTenantUsers().map((u) => u.slug), ['u1', 'erpm/t2'])
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tenant: cwd 反查用户（含子目录与未命中）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-tenant-'))
  try {
    await withState(dir, {
      u1: { slug: 'u1', role: 'user', status: 'active', workspacePath: '/ws/erpm-u1' },
    }, () => {
      assert.equal(resolveTenantUserByCwd('/ws/erpm-u1')?.slug, 'u1')
      assert.equal(resolveTenantUserByCwd('/ws/erpm-u1/sub/dir')?.slug, 'u1')
      assert.equal(resolveTenantUserByCwd('/ws/other'), undefined)
      assert.equal(resolveTenantUserByCwd(undefined), undefined)
      assert.equal(resolveTenantUserByCwd('  '), undefined)
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tenant: fileBoundaryOf 形态与越界校验', () => {
  assert.deepEqual(fileBoundaryOf(undefined), { mode: 'denied' })
  assert.deepEqual(fileBoundaryOf({ kind: 'loopback' }), { mode: 'open' })
  assert.deepEqual(fileBoundaryOf(ADMIN_AUTH), { mode: 'open' })
  assert.deepEqual(fileBoundaryOf(USER_AUTH), { mode: 'workspace', root: '/ws/erpm-u1' })
  const noWs = { kind: 'user', user: { ...USER_AUTH.user, workspacePath: null } }
  assert.deepEqual(fileBoundaryOf(noWs), { mode: 'denied' })

  const b = fileBoundaryOf(USER_AUTH)
  assertPathWithinBoundary(b, '/ws/erpm-u1/proj', 'workspacePath')
  assertPathWithinBoundary(b, null, 'workspacePath')
  assertPathWithinBoundary(fileBoundaryOf({ kind: 'loopback' }), '/etc/x', 'workspacePath')
  assert.throws(() => assertPathWithinBoundary(b, '/etc/passwd', 'workspacePath'), /outside your workspace/)
  assert.throws(() => assertPathWithinBoundary(fileBoundaryOf(undefined), '/ws/x', 'workspacePath'), /no workspace/)
})

test('tenant: withTenantRouting 按会话 cwd 路由（含 await 续体）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-tenant-'))
  try {
    const ws = join(dir, 'ws', 'erpm-u1')
    await withState(dir, {
      u1: { slug: 'u1', role: 'user', status: 'active', workspacePath: ws },
    }, async () => {
      const pool = new WorkbenchDbPool({ dataDir: join(dir, 'data') })
      bindWorkbenchDbPool(pool)
      try {
        const handle = pool.handle()
        const tool = {
          name: 'test_tool', description: '', parameters: {},
          output: { schema: { type: 'string' }, render: () => [] },
          execute: async () => {
            // 关键时序：await 之后的续体必须仍在用户库上下文（enterWith 传播回归）。
            await new Promise((resolve) => setTimeout(resolve, 5))
            createTask(handle, { title: '路由', typeCode: 'client_meeting', priorityCode: 'p2' })
            return String(listTasks(handle).length)
          },
        }
        const wrapped = withTenantRouting(tool)
        // 1) cwd 命中用户工作区（含子目录）→ 写用户库
        const result = await wrapped.execute({}, { agent: { session: { id: 's1', header: { cwd: join(ws, 'sub') } } } })
        assert.equal(result, '1')
        assert.equal(pool.runForUser('u1', () => listTasks(handle).length), 1)
        assert.equal(listTasks(handle).length, 0)
        // 2) 无 cwd → 保持默认库
        await wrapped.execute({}, {})
        assert.equal(listTasks(handle).length, 1)
        assert.equal(pool.runForUser('u1', () => listTasks(handle).length), 1)
      } finally {
        pool.close()
      }
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tenant: submitTaskTool 越界 workspace_path 拒绝、界内通过', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-tenant-'))
  try {
    const ws = join(dir, 'ws', 'erpm-u1')
    await withState(dir, {
      u1: { slug: 'u1', role: 'user', status: 'active', workspacePath: ws },
    }, async () => {
      const pool = new WorkbenchDbPool({ dataDir: join(dir, 'data') })
      bindWorkbenchDbPool(pool)
      try {
        const tool = submitTaskTool(pool.handle())
        const exec = { agent: { session: { id: 's1', header: { cwd: ws } } } }
        const bad = await tool.execute(
          { title: '越界', type_code: 'client_meeting', priority_code: 'p2', workspace_path: '/etc/passwd' },
          exec,
        )
        assert.match(String(bad), /超出你的工作区/)
        const ok = await tool.execute(
          { title: '界内', type_code: 'client_meeting', priority_code: 'p2', workspace_path: join(ws, 'proj') },
          exec,
        )
        assert.match(String(ok), /草稿已保存/)
      } finally {
        pool.close()
      }
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
