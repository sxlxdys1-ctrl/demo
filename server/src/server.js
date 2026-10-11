import express from 'express'
import pg from 'pg'
import { WebSocket, WebSocketServer } from 'ws'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { createSession, getSession, hashPassword, newId, usernamePattern, verifyPassword } from './auth.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')
const db = new pg.Pool({ connectionString: databaseUrl, max: 10 })
await db.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(express.json({ limit: '512kb' }))
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean))
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && !allowedOrigins.has(origin) ? 403 : 204)
  next()
})

const fail = (res, status, error) => res.status(status).json({ error })
const text = (value, max = 60) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const validDimension = (value) => ['overworld', 'nether', 'end', 'end_city'].includes(value)
const validUUID = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const validPosition = (x, y, z) => [x, y, z].every(Number.isInteger) && x >= -20 && x < 20 && z >= -20 && z < 20 && y >= 0 && y <= 25
const mobKinds = new Set(['chicken', 'sheep', 'cow', 'pig', 'zombie', 'skeleton', 'hammer_brute', 'blaze', 'piglin', 'enderman', 'ender_dragon'])
const authAttempts = new Map()
function limitAuth(req, res, next) {
  const now = Date.now()
  const key = `${req.ip}:${req.path}`
  const entry = authAttempts.get(key)
  if (!entry || now - entry.start > 60_000) authAttempts.set(key, { start: now, count: 1 })
  else if (++entry.count > 20) return fail(res, 429, '尝试太频繁，请稍后再试')
  if (authAttempts.size > 1000) {
    for (const [address, attempt] of authAttempts) if (now - attempt.start > 60_000) authAttempts.delete(address)
  }
  next()
}

async function requireUser(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /i, '')
    const user = await getSession(db, token)
    if (!user) return fail(res, 401, '请先登录')
    req.user = user
    next()
  } catch (error) { next(error) }
}

app.get('/api/health', async (_req, res) => {
  await db.query('SELECT 1')
  res.json({ ok: true })
})

app.post('/api/register', limitAuth, async (req, res) => {
  const username = text(req.body?.username, 20)
  const password = req.body?.password
  if (!usernamePattern.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return fail(res, 400, '用户名需为 3～20 个字，密码至少 8 位')
  }
  const userId = newId()
  const { salt, hash } = await hashPassword(password)
  try {
    await db.query('INSERT INTO users(id, username, password_salt, password_hash) VALUES($1,$2,$3,$4)', [userId, username, salt, hash])
  } catch (error) {
    if (error.code === '23505') return fail(res, 409, '用户名已被使用')
    throw error
  }
  const token = await createSession(db, userId)
  res.status(201).json({ token, user: { id: userId, username, coins: 0 } })
})

app.post('/api/login', limitAuth, async (req, res) => {
  const username = text(req.body?.username, 20)
  const password = req.body?.password
  if (!username || typeof password !== 'string') return fail(res, 400, '请输入用户名和密码')
  const result = await db.query('SELECT id, username, coins, password_salt, password_hash FROM users WHERE username = $1', [username])
  const user = result.rows[0]
  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) return fail(res, 401, '用户名或密码错误')
  const token = await createSession(db, user.id)
  res.json({ token, user: { id: user.id, username: user.username, coins: user.coins } })
})

app.get('/api/me', requireUser, (req, res) => res.json({ user: req.user }))

app.get('/api/users', requireUser, async (req, res) => {
  const query = text(req.query.q, 20)
  if (!query) return res.json({ users: [] })
  const result = await db.query('SELECT id, username FROM users WHERE username ILIKE $1 AND id <> $2 ORDER BY username LIMIT 20', [`%${query}%`, req.user.id])
  res.json({ users: result.rows })
})

app.post('/api/friends/:id', requireUser, async (req, res) => {
  if (!validUUID(req.params.id) || req.params.id === req.user.id) return fail(res, 400, '无效好友')
  const result = await db.query('SELECT id FROM users WHERE id = $1', [req.params.id])
  if (!result.rowCount) return fail(res, 404, '找不到好友')
  const accepted = await db.query("UPDATE friendships SET status = 'accepted' WHERE requester_id = $1 AND receiver_id = $2 AND status = 'pending' RETURNING requester_id", [req.params.id, req.user.id])
  if (accepted.rowCount) return res.json({ ok: true, accepted: true })
  const existing = await db.query('SELECT 1 FROM friendships WHERE requester_id = $1 AND receiver_id = $2', [req.params.id, req.user.id])
  if (existing.rowCount) return res.json({ ok: true, accepted: true })
  await db.query('INSERT INTO friendships(requester_id,receiver_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id])
  res.json({ ok: true })
})

app.get('/api/friends', requireUser, async (req, res) => {
  const result = await db.query(`
    SELECT f.requester_id, f.receiver_id, f.status,
      CASE WHEN f.requester_id = $1 THEN receiver.username ELSE requester.username END AS username,
      CASE WHEN f.requester_id = $1 THEN receiver.id ELSE requester.id END AS user_id
    FROM friendships f
    JOIN users requester ON requester.id = f.requester_id
    JOIN users receiver ON receiver.id = f.receiver_id
    WHERE f.requester_id = $1 OR f.receiver_id = $1 ORDER BY f.created_at DESC`, [req.user.id])
  res.json({ friends: result.rows.map((row) => ({
    id: row.user_id, username: row.username, status: row.status,
    incoming: row.receiver_id === req.user.id,
  })) })
})

app.post('/api/friends/:id/accept', requireUser, async (req, res) => {
  if (!validUUID(req.params.id)) return fail(res, 400, '无效好友')
  const result = await db.query("UPDATE friendships SET status = 'accepted' WHERE requester_id = $1 AND receiver_id = $2 AND status = 'pending' RETURNING requester_id", [req.params.id, req.user.id])
  if (!result.rowCount) return fail(res, 404, '没有待处理的好友请求')
  res.json({ ok: true })
})

app.post('/api/coins/claim', requireUser, async (req, res) => {
  const amount = req.body?.amount === 30 ? 30 : 10
  const result = await db.query('UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING coins', [amount, req.user.id])
  res.json({ coins: result.rows[0].coins })
})

const shopPrices = Object.freeze({
  skin_forest: 20, skin_starlight: 30, skin_sunrise: 40,
  mod_shader: 15, mod_realistic: 20, mod_double_loot: 25, mod_excavator: 30,
  item_diamond: 20, item_iron_ingot: 12, item_bread: 8,
  item_ender_eye: 30, item_oak_planks: 5,
})
app.post('/api/coins/spend', requireUser, async (req, res) => {
  const sku = req.body?.sku
  if (typeof sku !== 'string' || !Object.hasOwn(shopPrices, sku)) return fail(res, 400, '商品不存在')
  const price = shopPrices[sku]
  const result = await db.query('UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1 RETURNING coins', [price, req.user.id])
  if (!result.rowCount) return fail(res, 402, '金币不足')
  res.json({ coins: result.rows[0].coins })
})

app.post('/api/worlds', requireUser, async (req, res) => {
  const name = text(req.body?.name, 40) || `${req.user.username}的小世界`
  const worldId = newId()
  await db.query('INSERT INTO worlds(id,owner_id,name) VALUES($1,$2,$3)', [worldId, req.user.id, name])
  res.status(201).json({ world: { id: worldId, name, is_open: false, owner_id: req.user.id } })
})

app.get('/api/worlds', requireUser, async (req, res) => {
  const result = await db.query(`SELECT DISTINCT w.id, w.name, w.owner_id, w.is_open, u.username AS owner_name
    FROM worlds w JOIN users u ON u.id = w.owner_id
    LEFT JOIN world_members m ON m.world_id = w.id
    WHERE w.owner_id = $1 OR m.user_id = $1 ORDER BY w.name`, [req.user.id])
  res.json({ worlds: result.rows })
})

app.patch('/api/worlds/:id', requireUser, async (req, res) => {
  if (!validUUID(req.params.id) || typeof req.body?.isOpen !== 'boolean') return fail(res, 400, '无效世界设置')
  const result = await db.query('UPDATE worlds SET is_open = $1 WHERE id = $2 AND owner_id = $3 RETURNING id,name,is_open', [req.body.isOpen, req.params.id, req.user.id])
  if (!result.rowCount) return fail(res, 404, '找不到自己的世界')
  res.json({ world: result.rows[0] })
})

app.post('/api/worlds/:id/snapshot', requireUser, async (req, res) => {
  const dimension = req.body?.dimension
  const edits = req.body?.edits
  if (!validUUID(req.params.id) || !validDimension(dimension) || !Array.isArray(edits) || edits.length > 5000 ||
    !edits.every((entry) => Array.isArray(entry) && entry.length === 4 && validPosition(entry[0], entry[1], entry[2]) &&
      (entry[3] === null || typeof entry[3] === 'string' && /^[a-z0-9_]{1,64}$/.test(entry[3])))) {
    return fail(res, 400, '世界数据无效或过大')
  }
  const owned = await db.query('SELECT id FROM worlds WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id])
  if (!owned.rowCount) return fail(res, 404, '找不到自己的世界')
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM world_edits WHERE world_id = $1 AND dimension = $2', [req.params.id, dimension])
    for (let index = 0; index < edits.length; index += 200) {
      const batch = edits.slice(index, index + 200)
      const values = batch.flatMap(([x, y, z, blockId]) => [req.params.id, dimension, x, y, z, blockId])
      const slots = batch.map((_, row) => `(${Array.from({ length: 6 }, (_, column) => `$${row * 6 + column + 1}`).join(',')})`).join(',')
      await client.query(`INSERT INTO world_edits(world_id,dimension,x,y,z,block_id) VALUES ${slots}
        ON CONFLICT(world_id,dimension,x,y,z) DO UPDATE SET block_id = EXCLUDED.block_id`, values)
    }
    await client.query('COMMIT')
    res.json({ ok: true, count: edits.length })
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
})

app.post('/api/worlds/:id/invite', requireUser, async (req, res) => {
  const username = text(req.body?.username, 20)
  if (!validUUID(req.params.id) || !username) return fail(res, 400, '无效邀请')
  const result = await db.query(`SELECT friend.id FROM users friend JOIN friendships f
    ON ((f.requester_id = $1 AND f.receiver_id = friend.id) OR (f.receiver_id = $1 AND f.requester_id = friend.id))
    WHERE friend.username = $2 AND f.status = 'accepted'`, [req.user.id, username])
  if (!result.rowCount) return fail(res, 404, '请先互加好友')
  const owned = await db.query('SELECT id FROM worlds WHERE id = $1 AND owner_id = $2 AND is_open = true', [req.params.id, req.user.id])
  if (!owned.rowCount) return fail(res, 404, '请先开放自己的世界')
  await db.query('INSERT INTO world_members(world_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, result.rows[0].id])
  res.json({ ok: true })
})

const validPayload = (kind, payload) => kind === 'skin'
  ? payload && Array.isArray(payload.pixels) && payload.pixels.length === 64 && payload.pixels.every((color) => /^#[0-9a-fA-F]{6}$/.test(color))
  : kind === 'block_mod' && payload && /^#[0-9a-fA-F]{6}$/.test(payload.color)

app.get('/api/workshop', async (req, res) => {
  const query = text(req.query.q, 40)
  const result = await db.query(`SELECT w.id,w.kind,w.name,w.payload,w.price,w.created_at,u.username AS author
    FROM workshop w JOIN users u ON u.id = w.author_id
    WHERE w.name ILIKE $1 ORDER BY w.created_at DESC LIMIT 50`, [`%${query}%`])
  res.json({ products: result.rows })
})

app.post('/api/workshop', requireUser, async (req, res) => {
  const name = text(req.body?.name, 40)
  const kind = req.body?.kind
  const payload = req.body?.payload
  const price = req.body?.price
  if (!name || !validPayload(kind, payload) || !Number.isInteger(price) || price < 0 || price > 1000) return fail(res, 400, '模组或皮肤数据无效')
  const id = newId()
  await db.query('INSERT INTO workshop(id,author_id,kind,name,payload,price) VALUES($1,$2,$3,$4,$5,$6)', [id, req.user.id, kind, name, JSON.stringify(payload), price])
  res.status(201).json({ product: { id, name, kind, payload, price } })
})

app.post('/api/workshop/:id/buy', requireUser, async (req, res) => {
  if (!validUUID(req.params.id)) return fail(res, 400, '无效商品')
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const item = (await client.query('SELECT id,author_id,price FROM workshop WHERE id = $1', [req.params.id])).rows[0]
    if (!item) { await client.query('ROLLBACK'); return fail(res, 404, '商品不存在') }
    const owned = await client.query('SELECT 1 FROM purchases WHERE user_id = $1 AND product_id = $2', [req.user.id, item.id])
    if (owned.rowCount) { await client.query('ROLLBACK'); return res.json({ ok: true, alreadyOwned: true }) }
    if (item.author_id !== req.user.id) {
      const balance = await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1 RETURNING coins', [item.price, req.user.id])
      if (!balance.rowCount) { await client.query('ROLLBACK'); return fail(res, 402, '金币不足') }
    }
    await client.query('INSERT INTO purchases(user_id,product_id) VALUES($1,$2)', [req.user.id, item.id])
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
})

app.get('/api/purchases', requireUser, async (req, res) => {
  const result = await db.query('SELECT product_id FROM purchases WHERE user_id = $1', [req.user.id])
  res.json({ productIds: result.rows.map((row) => row.product_id) })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (!res.headersSent) fail(res, 500, '服务器暂时不可用')
})

const server = createServer(app)
const sockets = new WebSocketServer({ noServer: true, maxPayload: 16384 })
const roomSockets = new Map()
const send = (socket, data) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)) }
const broadcast = (worldId, data, except) => {
  for (const socket of roomSockets.get(worldId) ?? []) if (socket !== except) send(socket, data)
}
const leave = (socket) => {
  if (!socket.worldId) return
  roomSockets.get(socket.worldId)?.delete(socket)
  broadcast(socket.worldId, { type: 'left', userId: socket.user?.id }, socket)
  socket.worldId = null
}

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin
  if (req.url !== '/socket' || origin && !allowedOrigins.has(origin)) return socket.destroy()
  sockets.handleUpgrade(req, socket, head, (websocket) => sockets.emit('connection', websocket))
})

sockets.on('connection', (socket) => {
  socket.user = null
  socket.worldId = null
  socket.messageCredits = 40
  socket.creditUpdatedAt = Date.now()
  socket.lastJoinAt = 0
  const authTimeout = setTimeout(() => { if (!socket.user) socket.close(1008, '请先登录') }, 5000)
  socket.on('message', async (raw) => {
    try {
      const now = Date.now()
      socket.messageCredits = Math.min(40, socket.messageCredits + (now - socket.creditUpdatedAt) * 0.03)
      socket.creditUpdatedAt = now
      if (socket.messageCredits < 1) return
      socket.messageCredits -= 1
      const message = JSON.parse(raw.toString())
      if (!message || typeof message !== 'object' || Array.isArray(message)) return
      if (message.type === 'auth') {
        if (socket.user) return
        socket.user = await getSession(db, message.token)
        if (!socket.user) return socket.close(1008, '登录无效')
        clearTimeout(authTimeout)
        return send(socket, { type: 'auth', user: { id: socket.user.id, username: socket.user.username } })
      }
      if (!socket.user) return socket.close(1008, '请先登录')
      if (message.type === 'join') {
        if (!validUUID(message.worldId)) return
        if (now - socket.lastJoinAt < 2000) return
        socket.lastJoinAt = now
        const access = await db.query(`SELECT w.id FROM worlds w LEFT JOIN world_members m ON m.world_id = w.id AND m.user_id = $2
          WHERE w.id = $1 AND (w.owner_id = $2 OR (w.is_open = true AND m.user_id = $2))`, [message.worldId, socket.user.id])
        if (!access.rowCount) return send(socket, { type: 'error', message: '没有进入这个世界的权限' })
        leave(socket)
        socket.worldId = message.worldId
        if (!roomSockets.has(socket.worldId)) roomSockets.set(socket.worldId, new Set())
        roomSockets.get(socket.worldId).add(socket)
        const edits = await db.query('SELECT dimension,x,y,z,block_id FROM world_edits WHERE world_id = $1 LIMIT 100000', [socket.worldId])
        const entities = await db.query('SELECT id,dimension,kind,x,z FROM world_entities WHERE world_id = $1 LIMIT 1000', [socket.worldId])
        send(socket, { type: 'world', worldId: socket.worldId, edits: edits.rows, entities: entities.rows })
        broadcast(socket.worldId, { type: 'joined', user: { id: socket.user.id, username: socket.user.username } }, socket)
        return
      }
      if (!socket.worldId) return
      if (message.type === 'state') {
        const { x, z, foot, yaw, pitch } = message
        if (![x, z, foot, yaw, pitch].every(Number.isFinite) || Math.abs(x) > 21 || Math.abs(z) > 21 || foot < -8 || foot > 26) return
        return broadcast(socket.worldId, { type: 'state', userId: socket.user.id, x, z, foot, yaw, pitch, dimension: validDimension(message.dimension) ? message.dimension : 'overworld' }, socket)
      }
      if (message.type === 'edit') {
        const { dimension, x, y, z, blockId } = message
        if (!validDimension(dimension) || !validPosition(x, y, z) || blockId !== null && (typeof blockId !== 'string' || !/^[a-z0-9_]{1,64}$/.test(blockId))) return
        await db.query(`INSERT INTO world_edits(world_id,dimension,x,y,z,block_id) VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(world_id,dimension,x,y,z) DO UPDATE SET block_id = EXCLUDED.block_id`, [socket.worldId, dimension, x, y, z, blockId])
        return broadcast(socket.worldId, { type: 'edit', dimension, x, y, z, blockId, userId: socket.user.id }, socket)
      }
      if (message.type === 'spawn') {
        const { dimension, kind, x, z } = message
        if (!validDimension(dimension) || !mobKinds.has(kind) || ![x, z].every(Number.isFinite) || Math.abs(x) > 20 || Math.abs(z) > 20) return
        const id = newId()
        await db.query('INSERT INTO world_entities(id,world_id,dimension,kind,x,z) VALUES($1,$2,$3,$4,$5,$6)', [id, socket.worldId, dimension, kind, x, z])
        return broadcast(socket.worldId, { type: 'spawn', id, dimension, kind, x, z }, socket)
      }
    } catch (error) { console.error(error); send(socket, { type: 'error', message: '消息处理失败' }) }
  })
  socket.on('close', () => { clearTimeout(authTimeout); leave(socket) })
})

const port = Number(process.env.PORT || 3000)
server.listen(port, '0.0.0.0', () => console.log(`Game server listening on ${port}`))
