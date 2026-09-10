/** 工作台 HTTP 调用封装：自动携带多租户登录态；非 2xx 时抛出后端返回的 error 文案。 */

/** 多租户登录态令牌的 localStorage 键（与 dsh-multi-tenant-projects 前端一致，同 origin 共享）。 */
const TOKEN_KEY = 'dsh-projects-token'

/** 读取当前登录令牌；未登录/不可用（如隐私模式）时返回 null。 */
function storedToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = storedToken()
  if (token !== null && token !== '' && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
  const res = await fetch(path, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  return body as T
}
