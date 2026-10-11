export type OnlineUser = { id: string; username: string; coins: number }
export type OnlineFriend = { id: string; username: string; status: 'pending' | 'accepted'; incoming: boolean }
export type OnlineWorld = { id: string; name: string; owner_id: string; owner_name?: string; is_open: boolean }
export type WorkshopProduct = { id: string; kind: 'skin' | 'block_mod'; name: string; payload: unknown; price: number; author: string }

const apiRoot = (import.meta.env.VITE_API_BASE || window.location.origin).replace(/\/$/, '')
const tokenKey = 'tiny-wonder-world-online-token'

export class OnlineClient {
  token = localStorage.getItem(tokenKey) ?? ''
  user: OnlineUser | null = null
  socket: WebSocket | null = null

  async available(): Promise<boolean> {
    try {
      const response = await fetch(`${apiRoot}/api/health`, { signal: AbortSignal.timeout(4000) })
      return response.ok && (await response.json()).ok === true
    } catch { return false }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${apiRoot}${path}`, {
      method,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let result: Record<string, unknown>
    try { result = await response.json() } catch { throw new Error(`服务器返回了 ${response.status}`) }
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `请求失败 ${response.status}`)
    return result as T
  }

  async authenticate(action: 'register' | 'login', username: string, password: string): Promise<OnlineUser> {
    const result = await this.request<{ token: string; user: OnlineUser }>('POST', `/api/${action}`, { username, password })
    this.token = result.token
    this.user = result.user
    localStorage.setItem(tokenKey, result.token)
    return result.user
  }

  async restore(): Promise<OnlineUser | null> {
    if (!this.token) return null
    try {
      const result = await this.request<{ user: OnlineUser }>('GET', '/api/me')
      this.user = result.user
      return result.user
    } catch { this.logout(); return null }
  }

  logout(): void {
    this.socket?.close()
    this.socket = null
    this.token = ''
    this.user = null
    localStorage.removeItem(tokenKey)
  }

  connect(worldId: string, onMessage: (message: Record<string, unknown>) => void): void {
    this.socket?.close()
    const address = new URL(apiRoot)
    address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:'
    address.pathname = '/socket'
    address.search = ''
    const socket = new WebSocket(address)
    this.socket = socket
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'auth', token: this.token })))
    socket.addEventListener('message', (event) => {
      let message: Record<string, unknown>
      try { message = JSON.parse(event.data) } catch { return }
      if (message.type === 'auth') socket.send(JSON.stringify({ type: 'join', worldId }))
      onMessage(message)
    })
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null
        onMessage({ type: 'disconnected' })
      }
    })
  }

  send(message: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message))
  }
}
