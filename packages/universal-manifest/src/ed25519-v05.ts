import { createHash } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'

/** Canonical nonidentity prime-order point, shared with offline key decoding. */
export function canonicalEd25519Point(bytes: Uint8Array) {
  try {
    const point = ed25519.Point.fromBytes(bytes, false)
    return Buffer.from(point.toBytes()).equals(bytes) && !point.is0() && point.isTorsionFree() ? point : undefined
  } catch { return undefined }
}

/** v0.5 Base §1.6.1.1. Point arithmetic belongs to Noble, not this parser. */
export function verifyEd25519V05(spki: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  // Read A from the received DER octets, never an OpenSSL-normalized export.
  // RFC 8410 Ed25519 SPKI is this fixed algorithm/bit-string prefix + 32 bytes.
  const prefix = Buffer.from('302a300506032b6570032100', 'hex')
  if (spki.length !== prefix.length + 32 || !Buffer.from(spki.subarray(0, prefix.length)).equals(prefix)) return false
  if (signature.length !== 64) return false
  const aBytes = spki.subarray(prefix.length)
  const rBytes = signature.subarray(0, 32)
  try {
    const Point = ed25519.Point
    const a = canonicalEd25519Point(aBytes)
    const r = canonicalEd25519Point(rBytes)
    if (!a || !r) return false
    const s = BigInt('0x' + Buffer.from(signature.subarray(32)).reverse().toString('hex'))
    const order = Point.Fn.ORDER
    if (s >= order) return false
    const digest = createHash('sha512').update(rBytes).update(aBytes).update(message).digest()
    const challenge = BigInt('0x' + Buffer.from(digest).reverse().toString('hex'))
    // Reduction is equivalent only after A passed the prime-subgroup check.
    return Point.BASE.multiplyUnsafe(s).equals(r.add(a.multiplyUnsafe(challenge % order)))
  } catch {
    return false
  }
}
