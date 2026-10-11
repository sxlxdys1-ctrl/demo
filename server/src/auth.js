import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
export const usernamePattern = /^[\p{L}\p{N}_]{3,20}$/u
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex')

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: (await scrypt(password, salt, 64)).toString('hex') }
}

export async function verifyPassword(password, salt, expected) {
  const actual = Buffer.from((await scrypt(password, salt, 64)).toString('hex'), 'hex')
  const wanted = Buffer.from(expected, 'hex')
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

export async function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url')
  await db.query('INSERT INTO sessions(token_hash, user_id) VALUES($1, $2)', [tokenHash(token), userId])
  return token
}

export async function getSession(db, token) {
  if (typeof token !== 'string' || token.length < 30 || token.length > 100) return null
  const result = await db.query('SELECT users.id, users.username, users.coins FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = $1', [tokenHash(token)])
  return result.rows[0] ?? null
}

export const newId = () => randomUUID()
