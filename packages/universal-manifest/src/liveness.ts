import { createHash, createPublicKey, ECDH, verify } from 'node:crypto'

// Proposed local V1 contract. Configuration is installed by the trusted caller;
// none of the candidate's keys or asserted verdicts become authority.
type Obj = Record<string, unknown>
type Helpers = { parse(text: string): unknown; canonicalize(value: unknown): string }
export type UmLivenessFreshnessV1 = 'unknown' | 'live' | 'recent' | 'stale'
export interface UmLivenessProofResultV1 {
  status: 'absent' | 'not-evaluated' | 'unsupported' | 'failed' | 'validated'
  binding: Obj
  signatureVerified: boolean
  contextBound: boolean
  authenticatedFlags?: { userPresent: boolean; userVerified: boolean; backupEligible: boolean; backupState: boolean }
  counterStatus: 'not-evaluated' | 'not-supported' | 'advanced' | 'non-increasing' | 'baseline-unknown'
  failureCode?: string
  checksExecuted: string[]
  timeBoundStatus: 'not-evaluated' | 'unavailable' | 'trusted'
  temporalClass: UmLivenessFreshnessV1
  usableFreshness: UmLivenessFreshnessV1
  effectiveExpiryMs?: number
  facetDecisions?: { facetId: string; status: string; reason?: string; livenessFailureCode?: string }[]
}
export function unexecutedLivenessV1(): UmLivenessProofResultV1 {
  return { status: 'not-evaluated', binding: {}, signatureVerified: false, contextBound: false,
    counterStatus: 'not-evaluated', failureCode: 'evaluation-not-reached', checksExecuted: [],
    timeBoundStatus: 'not-evaluated', temporalClass: 'unknown', usableFreshness: 'unknown' }
}
function refuse(code: string): never { throw new Error(code) }
function object(v: unknown): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) refuse('malformed-field')
  return v as Obj
}
function string(v: Obj, k: string): string { if (typeof v[k] !== 'string') refuse('malformed-field'); return v[k] as string }
function integer(v: Obj, k: string): number { if (!Number.isSafeInteger(v[k])) refuse('configuration-invalid'); return v[k] as number }
function boolean(v: Obj, k: string): boolean { if (typeof v[k] !== 'boolean') refuse('configuration-invalid'); return v[k] as boolean }
function bytes(s: string, min: number, max: number): Buffer {
  if (s.length > Math.ceil(max * 4 / 3)) refuse('byte-limit')
  if (!/^[A-Za-z0-9_-]*$/.test(s)) refuse('base64url-invalid')
  const raw = Buffer.from(s, 'base64url')
  if (raw.toString('base64url') !== s) refuse('base64url-invalid')
  if (raw.length < min || raw.length > max) refuse('byte-limit')
  return raw
}
function bounded(v: unknown, max: number): void {
  let members = 0
  function walk(x: unknown, depth: number): void {
    if (depth > 8) refuse('json-limit')
    if (typeof x === 'number' && (!Number.isFinite(x) || (Number.isInteger(x) && !Number.isSafeInteger(x)))) refuse('json-number')
    if (Array.isArray(x)) { for (const item of x) walk(item, depth + 1) }
    else if (x && typeof x === 'object') {
      members += Object.keys(x).length
      if (members > max) refuse('json-limit')
      for (const value of Object.values(x)) walk(value, depth + 1)
    }
  }
  walk(v, 0)
}
function parseObject(raw: Buffer, bom: boolean, max: number, h: Helpers): Obj {
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw) } catch { refuse('json-utf8') }
  if (bom && text.startsWith('\ufeff')) text = text.slice(1)
  let v: unknown
  try { v = h.parse(text); h.canonicalize(v) } catch { refuse('json-invalid') }
  if (!v || typeof v !== 'object' || Array.isArray(v)) refuse('json-object')
  bounded(v, max)
  return v as Obj
}
function fields(v: Obj, allowed: string[]): void { if (Object.keys(v).some(k => !allowed.includes(k))) refuse('carrier-extension') }
function fixedTime(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s) || s.startsWith('0000')) refuse('timestamp-format')
  const n = Date.parse(s)
  if (!Number.isFinite(n) || new Date(n).toISOString() !== s) refuse('timestamp-format')
  return n
}
function safeAdd(a: number, b: number): number {
  const n = a + b
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(n)) refuse('time-overflow')
  return n
}
function digest(raw: Uint8Array | string): Buffer { return createHash('sha256').update(raw).digest() }
function publicKey(r: Obj) {
  const point = bytes(string(r, 'publicKeySec1'), 65, 65)
  if (point[0] !== 4) refuse('configuration-key')
  try {
    // OpenSSL validates the finite, on-curve point; no custom curve arithmetic.
    ECDH.convertKey(point, 'prime256v1', undefined, undefined, 'uncompressed')
    return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' })
  } catch { refuse('configuration-key') }
}
function strictDer(der: Buffer): void {
  if (der[0] !== 0x30 || der[1] !== der.length - 2) refuse('signature-encoding')
  let pos = 2
  const order = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551')
  for (let i = 0; i < 2; i++) {
    if (der[pos++] !== 2) refuse('signature-encoding')
    const len = der[pos++]
    if (!len || len > 33 || pos + len > der.length) refuse('signature-encoding')
    const scalar = der.subarray(pos, pos + len); pos += len
    if (scalar[0] & 0x80 || (len > 1 && scalar[0] === 0 && !(scalar[1] & 0x80))) refuse('signature-encoding')
    const n = BigInt(`0x${scalar.toString('hex')}`)
    if (n < 1n || n >= order) refuse('signature-scalar')
  }
  if (pos !== der.length) refuse('signature-encoding')
}
export function freezeLivenessV1<T>(v: T): T {
  if (v && typeof v === 'object') { for (const x of Object.values(v)) freezeLivenessV1(x); Object.freeze(v) }
  return v
}

/** An owned immutable snapshot, with real validation rather than a verdict callback. */
export class UmContextualLivenessValidatorV1 {
  readonly #config: Obj
  readonly #helpers: Helpers
  constructor(config: unknown, helpers: Helpers) {
    if (typeof config !== 'string') bounded(config, 1024)
    if (typeof config === 'string' && Buffer.byteLength(config) > 65_536) refuse('configuration-limit')
    const raw = typeof config === 'string' ? Buffer.from(config) : Buffer.from(helpers.canonicalize(config))
    if (raw.length > 65_536) refuse('configuration-limit')
    const c = parseObject(raw, false, 1024, helpers)
    fields(c, ['contractVersion', 'expectedSubject', 'expectedRpId', 'allowedOrigins', 'canInspectProof', 'uncertaintyMs', 'timeBoundTrusted', 'rollbackInvalidated', 'method', 'algorithm', 'extensionPolicy', 'sameOrigin', 'maxAttestationLifetimeMs', 'credentials'])
    if (integer(c, 'contractVersion') !== 1) refuse('configuration-version')
    const subject = string(c, 'expectedSubject'), rp = string(c, 'expectedRpId')
    if (!subject || Buffer.byteLength(subject) > 4096 || !/^[A-Za-z0-9.-]{1,253}$/.test(rp)) refuse('configuration-invalid')
    if (!Array.isArray(c.allowedOrigins)) refuse('configuration-invalid')
    if (!c.allowedOrigins.length || c.allowedOrigins.length > 8) refuse('configuration-limit')
    for (const origin of c.allowedOrigins) {
      if (typeof origin !== 'string' || !/^https:\/\/[a-z0-9.-]+(?::[1-9][0-9]*)?$/.test(origin) || origin.length > 267) refuse('configuration-origin')
      try { const u = new URL(origin); if (u.origin !== origin || u.protocol !== 'https:') refuse('configuration-origin') } catch { refuse('configuration-origin') }
    }
    for (const k of ['canInspectProof', 'timeBoundTrusted', 'rollbackInvalidated']) boolean(c, k)
    if (string(c, 'method') !== 'webauthn-uv' || integer(c, 'algorithm') !== -7 || string(c, 'extensionPolicy') !== 'none' || !boolean(c, 'sameOrigin')) refuse('configuration-method')
    if (integer(c, 'uncertaintyMs') < 0 || integer(c, 'maxAttestationLifetimeMs') <= 0) refuse('configuration-invalid')
    if (!Array.isArray(c.credentials)) refuse('configuration-invalid')
    if (c.credentials.length > 32) refuse('configuration-limit')
    for (const value of c.credentials) {
      const r = object(value)
      fields(r, ['credentialId', 'subject', 'rpId', 'publicKeySec1', 'algorithm', 'keyType', 'curve', 'userHandle', 'authorityNotBeforeMs', 'authorityNotAfterMs', 'active', 'bindingEvidenceType', 'bindingEvidenceRef', 'purpose', 'attester', 'backupEligible', 'storedCounter'])
      bytes(string(r, 'credentialId'), 1, 1023); bytes(string(r, 'userHandle'), 1, 64)
      for (const k of ['subject', 'rpId', 'bindingEvidenceRef', 'purpose']) if (!string(r, k)) refuse('configuration-invalid')
      if (!['test-preconfigured', 'authenticated-enrollment', 'authorized-migration'].includes(string(r, 'bindingEvidenceType'))) refuse('configuration-authority')
      if (integer(r, 'algorithm') !== -7 || string(r, 'keyType') !== 'EC2' || string(r, 'curve') !== 'P-256') refuse('configuration-key')
      publicKey(r)
      if (integer(r, 'authorityNotBeforeMs') > integer(r, 'authorityNotAfterMs')) refuse('configuration-authority')
      boolean(r, 'active')
      if ('backupEligible' in r) boolean(r, 'backupEligible')
      if ('attester' in r) string(r, 'attester')
      if ('storedCounter' in r && (integer(r, 'storedCounter') < 0 || integer(r, 'storedCounter') > 0xffffffff)) refuse('configuration-invalid')
    }
    this.#config = freezeLivenessV1(c)
    this.#helpers = Object.freeze({ ...helpers })
  }
  evaluate(manifest: Obj, nowMs: number): UmLivenessProofResultV1 {
    const out = unexecutedLivenessV1()
    if (manifest.livenessAttestation === undefined) { out.status = 'absent'; delete out.failureCode; return freezeLivenessV1(out) }
    const att = object(manifest.livenessAttestation)
    out.binding = { expectedSubject: manifest.subject, attestedAt: att.attestedAt, proofType: att.proofType }
    out.status = 'failed'; delete out.failureCode
    try { this.validate(manifest, att, nowMs, out) } catch (e) {
      const code = e instanceof Error ? e.message : 'validation-failed'
      out.failureCode = code
      if (['method-unsupported', 'carrier-extension', 'client-token-binding', 'extensions-unsupported'].includes(code)) out.status = 'unsupported'
      if (['time-bound-unavailable', 'proof-inspection-denied'].includes(code)) out.status = 'not-evaluated'
    }
    return freezeLivenessV1(out)
  }
  private validate(manifest: Obj, att: Obj, nowMs: number, out: UmLivenessProofResultV1): void {
    const c = this.#config, h = this.#helpers
    if (!boolean(c, 'canInspectProof')) refuse('proof-inspection-denied')
    out.checksExecuted.push('carrier')
    for (const k of ['attestedAt', 'validUntil', 'proofType', 'proofValue']) string(att, k)
    if (string(att, 'proofType') !== 'webauthn-uv') refuse('method-unsupported')
    const raw = bytes(string(att, 'proofValue'), 1, 16384)
    out.binding.carrierSha256 = digest(raw).toString('hex')
    const carrier = parseObject(raw, false, 128, h)
    if (!Buffer.from(h.canonicalize(carrier)).equals(raw)) refuse('carrier-not-jcs')
    fields(carrier, ['id', 'rawId', 'type', 'response', 'clientExtensionResults', 'authenticatorAttachment'])
    if (string(carrier, 'type') !== 'public-key') refuse('carrier-type')
    const id = string(carrier, 'rawId'); bytes(id, 1, 1023)
    if (string(carrier, 'id') !== id) refuse('credential-id-mismatch')
    if (!carrier.clientExtensionResults || typeof carrier.clientExtensionResults !== 'object' || Array.isArray(carrier.clientExtensionResults) || Object.keys(carrier.clientExtensionResults).length) refuse('extensions-unsupported')
    if ('authenticatorAttachment' in carrier && !['platform', 'cross-platform'].includes(carrier.authenticatorAttachment as string)) refuse('carrier-attachment')
    const response = object(carrier.response)
    fields(response, ['clientDataJSON', 'authenticatorData', 'signature', 'userHandle'])
    const clientBytes = bytes(string(response, 'clientDataJSON'), 1, 4096)
    const auth = bytes(string(response, 'authenticatorData'), 37, 37)
    const der = bytes(string(response, 'signature'), 8, 72)
    const handle = 'userHandle' in response ? bytes(string(response, 'userHandle'), 1, 64) : undefined
    out.checksExecuted.push('authority-time')
    const subject = string(manifest, 'subject')
    if (!subject || Buffer.byteLength(subject) > 4096 || subject !== c.expectedSubject) refuse('subject-context-mismatch')
    const matches = (c.credentials as Obj[]).filter(r => r.credentialId === id && r.subject === subject && r.rpId === c.expectedRpId)
    if (matches.length !== 1) refuse('credential-authority-unavailable')
    const r = matches[0]
    if (!r.active || r.purpose !== 't1-liveness') refuse('credential-authority-unavailable')
    if ('attester' in att && att.attester !== r.attester) refuse('attester-mismatch')
    if (handle && !handle.equals(bytes(string(r, 'userHandle'), 1, 64))) refuse('user-handle-mismatch')
    const a = fixedTime(string(att, 'attestedAt')), v = fixedTime(string(att, 'validUntil'))
    const cap = safeAdd(a, integer(c, 'maxAttestationLifetimeMs'))
    if (a > v || v > cap) refuse('attestation-lifetime')
    const before = integer(r, 'authorityNotBeforeMs'), after = integer(r, 'authorityNotAfterMs')
    if (a < before || v > after) refuse('credential-authority-unavailable')
    if (!c.timeBoundTrusted || c.rollbackInvalidated) { out.timeBoundStatus = 'unavailable'; refuse('time-bound-unavailable') }
    const low = safeAdd(nowMs, -integer(c, 'uncertaintyMs')), high = safeAdd(nowMs, integer(c, 'uncertaintyMs'))
    out.timeBoundStatus = 'trusted'
    if (low < before || high > after) refuse('credential-authority-unavailable')
    if (a > low) refuse('future-attestation')
    const age = safeAdd(high, -a)
    out.effectiveExpiryMs = v
    out.temporalClass = high > v ? 'unknown' : age <= 60000 ? 'live' : age <= 14400000 ? 'recent' : 'stale'
    out.checksExecuted.push('client-data')
    const client = parseObject(clientBytes, true, 128, h)
    if (string(client, 'type') !== 'webauthn.get') refuse('client-type')
    if (!bytes(string(client, 'challenge'), 32, 32).equals(digest(Buffer.concat([Buffer.from(subject), Buffer.from(string(att, 'attestedAt'))])))) refuse('challenge-mismatch')
    if (!(c.allowedOrigins as unknown[]).includes(client.origin)) refuse('origin-mismatch')
    out.checksExecuted.push('same-origin')
    if (('crossOrigin' in client && client.crossOrigin !== false) || 'topOrigin' in client) refuse('cross-origin')
    if ('tokenBinding' in client) refuse('client-token-binding')
    out.checksExecuted.push('authenticator-data')
    if (!auth.subarray(0, 32).equals(digest(string(c, 'expectedRpId')))) refuse('rp-hash-mismatch')
    const flags = auth[32]
    if (flags & 0xc0) refuse('authenticator-extension')
    out.checksExecuted.push('authorized-key')
    const key = publicKey(r)
    out.checksExecuted.push('signature-encoding'); strictDer(der)
    out.checksExecuted.push('assertion-signature')
    if (!verify('sha256', Buffer.concat([auth, digest(clientBytes)]), key, der)) refuse('signature-invalid')
    out.signatureVerified = true; out.contextBound = true
    out.authenticatedFlags = { userPresent: !!(flags & 1), userVerified: !!(flags & 4), backupEligible: !!(flags & 8), backupState: !!(flags & 16) }
    out.checksExecuted.push('authenticated-flags')
    if (!(flags & 1)) refuse('user-presence-required')
    if (!(flags & 4)) refuse('user-verification-required')
    if ((flags & 0x22) || ((flags & 16) && !(flags & 8))) refuse('flags-invalid')
    if ('backupEligible' in r && r.backupEligible !== !!(flags & 8)) refuse('backup-eligibility-mismatch')
    out.checksExecuted.push('counter')
    const counter = auth.readUInt32BE(33)
    out.counterStatus = r.storedCounter === undefined ? 'baseline-unknown' : r.storedCounter === 0 && counter === 0 ? 'not-supported' : counter > (r.storedCounter as number) ? 'advanced' : 'non-increasing'
    out.status = 'validated'; out.usableFreshness = out.temporalClass
  }
}
