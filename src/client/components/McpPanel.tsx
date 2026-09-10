/**
 * 个人 MCP 服务管理面板（设置弹窗「MCP 服务」分区）。
 *
 * 自管理数据（直接走 /api/workbench/mcp/*），不走设置弹窗的“保存设置”流程：
 * 新增/编辑/启停/删除即时落库 → 对话工具（workbench_mcp_list / workbench_mcp_call）
 * 下一次调用立刻按新配置连接（同一对话中可随时切换服务，这是本方案不用 preset 的原因）。
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { McpServerResponse, McpServersResponse, McpServerView } from '../../shared/contracts.js'
import { api } from '../api.js'

interface FormState {
  id: string | null
  name: string
  url: string
  headers: string
  timeoutSeconds: string
  enabled: boolean
}

const EMPTY_FORM: FormState = { id: null, name: '', url: '', headers: '', timeoutSeconds: '30', enabled: true }

function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n')
}

/** 「Name: value」逐行解析（按首个冒号分隔；忽略空行与无效行）。 */
function textToHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const sep = trimmed.indexOf(':')
    if (sep <= 0) continue
    const key = trimmed.slice(0, sep).trim()
    const value = trimmed.slice(sep + 1).trim()
    if (key !== '') out[key] = value
  }
  return out
}

function statusOf(server: McpServerView): { text: string; color: string } {
  if (server.enabled === 0) return { text: '已停用', color: 'var(--dsw-alias-label-secondary)' }
  if (server.lastStatus === 'ok') return { text: '正常', color: '#2E9B7B' }
  if (server.lastStatus === 'error') return { text: '连接失败', color: '#E74C3C' }
  return { text: '未探测', color: 'var(--dsw-alias-label-secondary)' }
}

export function McpPanel(): ReactNode {
  const [servers, setServers] = useState<McpServerView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const res = await api<McpServersResponse>('/api/workbench/mcp/servers')
      setServers(res.servers)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const probe = async (server: McpServerView): Promise<void> => {
    setBusyId(server.id)
    setError(null)
    setNotice(null)
    try {
      const res = await api<McpServerResponse>(`/api/workbench/mcp/servers/${server.id}/probe`, { method: 'POST' })
      setServers((prev) => prev.map((item) => (item.id === server.id ? res.server : item)))
      if (res.probe?.ok === true) setNotice(`「${server.name}」连接正常，发现 ${res.server.tools.length} 个工具`)
      else setError(`「${server.name}」探测失败：${res.probe?.error ?? '未知错误'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const save = async (): Promise<void> => {
    if (form === null) return
    const name = form.name.trim()
    const url = form.url.trim()
    if (name === '' || url === '') { setError('服务名与地址都不能为空'); return }
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const headers = textToHeaders(form.headers)
      const seconds = Number(form.timeoutSeconds)
      const payload = {
        name,
        url,
        headers,
        timeoutMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined,
        enabled: form.enabled,
        probe: true,
      }
      const init = { method: form.id === null ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }
      const path = form.id === null ? '/api/workbench/mcp/servers' : `/api/workbench/mcp/servers/${form.id}`
      const res = await api<McpServerResponse>(path, init)
      setForm(null)
      await load()
      if (res.probe?.ok === true) setNotice(`已保存「${name}」：连接正常，发现 ${res.server.tools.length} 个工具`)
      else if (res.probe !== undefined) setError(`「${name}」已保存，但探测失败：${res.probe.error ?? '未知错误'}`)
      else setNotice(`已保存「${name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (server: McpServerView): Promise<void> => {
    setBusyId(server.id)
    setError(null)
    try {
      const res = await api<McpServerResponse>(`/api/workbench/mcp/servers/${server.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: server.enabled !== 1 }),
      })
      setServers((prev) => prev.map((item) => (item.id === server.id ? res.server : item)))
      setNotice(server.enabled === 1 ? `已停用「${server.name}」` : `已启用「${server.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (server: McpServerView): Promise<void> => {
    if (!window.confirm(`删除 MCP 服务「${server.name}」？对话中的 AI 将不能再调用它。`)) return
    setBusyId(server.id)
    setError(null)
    try {
      await api(`/api/workbench/mcp/servers/${server.id}`, { method: 'DELETE' })
      setServers((prev) => prev.filter((item) => item.id !== server.id))
      setNotice(`已删除「${server.name}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = (server: McpServerView): void => {
    setForm({
      id: server.id,
      name: server.name,
      url: server.url,
      headers: headersToText(server.headers),
      timeoutSeconds: String(Math.max(3, Math.round(server.timeoutMs / 1000))),
      enabled: server.enabled === 1,
    })
    setError(null)
    setNotice(null)
  }

  return (
    <section>
      <h5>个人 MCP 服务</h5>
      <p className="wb-hint" style={{ marginTop: 0 }}>
        添加你自己的 MCP 服务（StreamableHTTP）。对话中 AI 会先列出服务与工具、再按需调用；
        这里的新增/修改即时生效（无需新开会话，也不影响其他用户）。
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="wb-btn primary" onClick={() => { setForm({ ...EMPTY_FORM }); setError(null); setNotice(null) }}>新增服务</button>
        <button className="wb-btn" onClick={() => void load()}>刷新列表</button>
        {loading && <span className="wb-hint" style={{ margin: 0 }}>加载中…</span>}
      </div>
      {error !== null && <div style={{ color: '#E74C3C', fontSize: 12, margin: '6px 0' }}>{error}</div>}
      {notice !== null && <div style={{ color: '#2E9B7B', fontSize: 12, margin: '6px 0' }}>{notice}</div>}

      {form !== null && (
        <form className="wb-form" style={{ marginBottom: 10 }} onSubmit={(event) => { event.preventDefault(); void save() }}>
          <label>服务名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：地图服务（对话中按这个名字调用）" /></label>
          <label>超时（秒）<input type="number" min={3} max={120} value={form.timeoutSeconds} onChange={(e) => setForm({ ...form, timeoutSeconds: e.target.value })} /></label>
          <label className="full">服务地址<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="例如：http://10.6.9.61:8100/mcp（内网 StreamableHTTP 地址）" /></label>
          <label className="full">
            请求头（每行一条，可留空）
            <textarea rows={2} value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder={'Authorization: Bearer xxx'} />
          </label>
          <label className="wb-switch-row" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            <span>启用（停用后对话中不可调用）</span>
          </label>
          <div className="full" style={{ display: 'flex', gap: 8 }}>
            <button className="wb-btn primary" type="submit" disabled={saving}>{saving ? '保存并探测中…' : '保存并探测'}</button>
            <button className="wb-btn" type="button" onClick={() => { setForm(null); setError(null) }}>取消</button>
          </div>
        </form>
      )}

      <div className="wb-list wb-scroll-area">
        {!loading && servers.length === 0 && (
          <div className="wb-empty" style={{ padding: 12 }}>还没有配置 MCP 服务。点「新增服务」填一个 MCP 地址即可。</div>
        )}
        {servers.map((server) => {
          const status = statusOf(server)
          const open = expanded[server.id] === true
          return (
            <div key={server.id} className="wb-row" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 6, opacity: server.enabled === 0 ? 0.62 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13 }}>{server.name}</strong>
                <span className="wb-chip" style={{ color: status.color }}>{status.text}</span>
                <code style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300, whiteSpace: 'nowrap' }}>{server.url}</code>
                <span style={{ flex: 1 }} />
                <button className="wb-btn" onClick={() => setExpanded((prev) => ({ ...prev, [server.id]: !open }))}>工具 {server.tools.length}</button>
                <button className="wb-btn" disabled={busyId === server.id} onClick={() => void probe(server)}>{busyId === server.id ? '探测中…' : '探测'}</button>
                <button className="wb-btn" onClick={() => startEdit(server)}>编辑</button>
                <button className="wb-btn" disabled={busyId === server.id} onClick={() => void toggleEnabled(server)}>{server.enabled === 1 ? '停用' : '启用'}</button>
                <button className="wb-btn" style={{ color: '#E74C3C', borderColor: 'color-mix(in srgb, #E74C3C 45%, transparent)' }} disabled={busyId === server.id} onClick={() => void remove(server)}>删除</button>
              </div>
              {server.lastStatus === 'error' && server.lastError !== null && server.lastError !== '' && (
                <div style={{ fontSize: 12, color: '#E74C3C', wordBreak: 'break-all' }}>最近错误：{server.lastError}</div>
              )}
              {open && (
                <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', padding: '2px 0 2px 4px' }}>
                  {server.tools.length === 0
                    ? '暂无工具清单：点「探测」连接服务后刷新（改过地址或请求头后需重新探测）。'
                    : server.tools.map((tool) => (
                      <div key={tool.name} style={{ marginBottom: 3 }}>
                        <code style={{ fontSize: 11.5 }}>{tool.name}</code>
                        {tool.description !== '' && (
                          <span style={{ marginLeft: 6 }}>{tool.description.length > 140 ? `${tool.description.slice(0, 140)}…` : tool.description}</span>
                        )}
                      </div>
                    ))}
                  {server.toolsAt !== null && (
                    <div style={{ marginTop: 4 }}>最近探测：{new Date(server.toolsAt).toLocaleString('zh-CN', { hour12: false })}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
