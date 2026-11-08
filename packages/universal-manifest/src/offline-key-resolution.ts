import { createPublicKey } from 'node:crypto'
import { p256 } from '@noble/curves/nist.js'
import { canonicalEd25519Point } from './ed25519-v05.js'

const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** Bounded base58btc decoding; leading zero octets retain their leading ones. */
function decodeMultibase(value: string): Buffer | undefined {
  if (value.startsWith('u')) {
    const body = value.slice(1)
    if (!/^[A-Za-z0-9_-]+$/.test(body)) return undefined
    const bytes = Buffer.from(body, 'base64url')
    return bytes.toString('base64url') === body ? bytes : undefined
  }
  if (!value.startsWith('z') || value.length === 1) return undefined
  let n = 0n
  for (const c of value.slice(1)) {
    const digit = base58.indexOf(c)
    if (digit < 0) return undefined
    n = n * 58n + BigInt(digit)
  }
  let hex = n.toString(16)
  if (hex.length % 2) hex = '0' + hex
  const zeros = value.slice(1).match(/^1*/)?.[0].length ?? 0
  return Buffer.concat([Buffer.alloc(zeros), n ? Buffer.from(hex, 'hex') : Buffer.alloc(0)])
}

/** Offline signing-method selection only; no subject/issuer authorization. */
export function resolveOfflineDidKey(keyRef: string): string | undefined {
  if (typeof keyRef !== 'string' || keyRef.length > 256 || !keyRef.startsWith('did:key:')) return undefined
  const [multibase, fragment, extra] = keyRef.slice(8).split('#')
  if (extra !== undefined || (fragment !== undefined && fragment !== multibase)) return undefined
  const bytes = decodeMultibase(multibase)
  if (!bytes) return undefined
  // Exact two-octet prefixes enforce canonical varints for the admitted codecs.
  try {
    if (bytes.length === 34 && bytes[0] === 0xed && bytes[1] === 0x01) {
      const key = bytes.subarray(2)
      if (!canonicalEd25519Point(key)) return undefined
      return Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]).toString('base64')
    }
    if (bytes.length === 35 && bytes[0] === 0x80 && bytes[1] === 0x24 && (bytes[2] === 2 || bytes[2] === 3)) {
      const point = p256.Point.fromBytes(bytes.subarray(2))
      point.assertValidity()
      if (!Buffer.from(point.toBytes(true)).equals(bytes.subarray(2))) return undefined
      const key = point.toBytes(false)
      return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256',
        x: Buffer.from(key.subarray(1, 33)).toString('base64url'), y: Buffer.from(key.subarray(33)).toString('base64url'),
      } }).export({ format: 'der', type: 'spki' }).toString('base64')
    }
  } catch { /* Unsupported or malformed method material remains unresolved. */ }
  return undefined
}
