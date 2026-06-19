import { scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)
const keyLength = 64

export async function verifyPassword({
  password,
  salt,
  hash,
}: {
  password: string
  salt: string
  hash: string
}) {
  const derivedKey = (await scryptAsync(password, salt, keyLength)) as Buffer
  const expectedKey = Buffer.from(hash, 'hex')

  if (derivedKey.length !== expectedKey.length) {
    return false
  }

  return timingSafeEqual(derivedKey, expectedKey)
}
