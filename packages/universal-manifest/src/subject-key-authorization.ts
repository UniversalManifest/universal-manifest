import { createPublicKey } from 'node:crypto'

/** Local relationship evidence only; never a serialized receipt or identity tier. */
export interface UmSubjectKeyAuthorizationV05 {
  status: 'verified' | 'failed' | 'not-evaluated'
  reason: string
}

function refuse(reason: string): never { throw new Error(reason) }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('document-invalid')
  return value as Record<string, unknown>
}

// DID Core identifier syntax, with bounded ASCII DID URLs. No normalization,
// aliases or dereferencing: only a local #fragment gains the document prefix.
function validDid(value: string): boolean {
  const [scheme, method, ...rest] = value.split(':')
  const id = rest.join(':')
  return value.length <= 2048 && scheme === 'did' && /^[a-z0-9]+$/.test(method ?? '')
    && /^(?:[A-Za-z0-9._:-]|%[0-9A-Fa-f]{2})+$/.test(id) && !id.endsWith(':')
}
function methodId(value: unknown, subject: string): string {
  if (typeof value !== 'string' || !value || value.length > 2048) refuse('method-id-invalid')
  const id = value.startsWith('#') ? subject + value : value
  const start = id.search(/[/?#]/)
  if (!validDid(start < 0 ? id : id.slice(0, start))) refuse('method-id-invalid')
  if (start >= 0) {
    const tail = id.slice(start)
    if (!/^[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]+$/.test(tail)
      || /%(?![0-9A-Fa-f]{2})/.test(tail) || tail.split('#').length > 2 || tail.endsWith('#')) refuse('method-id-invalid')
  }
  return id
}

function coordinate(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) refuse('jwk-invalid')
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) refuse('jwk-invalid')
  return value
}

/** Internal predicate over the exact outer-signature key, never a key lookup. */
export function checkSubjectKeyAuthorizationV05(
  raw: unknown, subject: string, keyRef: string, selectedSpki: string | undefined,
  parse: (text: string) => unknown, canonicalize: (value: unknown) => string,
): UmSubjectKeyAuthorizationV05 {
  return checkRelationship(raw, subject, keyRef, selectedSpki, parse, canonicalize, 'subject')
}

/**
 * Internal Ed25519 issuer predicate over the exact already-verified proof key.
 * The caller authenticates the document and establishes its currency. This
 * checks assertionMethod membership only; it never selects a verification key.
 */
export function checkIssuerKeyAuthorizationV05(
  raw: unknown, issuer: string, keyRef: unknown, proofPurpose: unknown, selectedSpki: string | undefined,
  parse: (text: string) => unknown, canonicalize: (value: unknown) => string,
): UmSubjectKeyAuthorizationV05 {
  if (proofPurpose !== undefined && proofPurpose !== 'assertionMethod') {
    return { status: 'failed', reason: 'issuer-purpose-incompatible' }
  }
  return checkRelationship(raw, issuer, keyRef, selectedSpki, parse, canonicalize, 'issuer')
}

function checkRelationship(
  raw: unknown, subject: string, keyRef: unknown, selectedSpki: string | undefined,
  parse: (text: string) => unknown, canonicalize: (value: unknown) => string, role: 'subject' | 'issuer',
): UmSubjectKeyAuthorizationV05 {
  try {
    if (typeof raw !== 'string') refuse('document-not-string')
    if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024) refuse('document-limit')
    let parsed: unknown
    try { parsed = parse(raw) } catch { refuse('document-invalid') }
    // Match the existing native ingestion ceilings before canonicalization.
    const stack: [unknown, number][] = [[parsed, 1]]
    while (stack.length) {
      const [value, depth] = stack.pop()!
      if (value && typeof value === 'object') {
        if (depth > 10 || (Array.isArray(value) && value.length > 1000)) refuse('document-limit')
        for (const child of Object.values(value)) stack.push([child, depth + 1])
      }
    }
    try { canonicalize(parsed) } catch { refuse('document-invalid') }
    const doc = object(parsed)
    if (doc.id !== subject) refuse(role === 'subject' ? 'document-subject-mismatch' : 'document-issuer-mismatch')
    if (!validDid(subject)) refuse('document-id-invalid')
    const requested = role === 'issuer' && keyRef === undefined ? undefined : methodId(keyRef, subject)
    const methods = new Map<string, { value: Record<string, unknown>; eligible: boolean }>()
    const authorized = new Set<string>()
    for (const field of ['verificationMethod', 'authentication', 'assertionMethod', 'keyAgreement', 'capabilityInvocation', 'capabilityDelegation']) {
      if (!Object.hasOwn(doc, field)) continue
      const entries = doc[field]
      if (!Array.isArray(entries)) refuse('relationship-invalid')
      const grants = field === 'assertionMethod' || (role === 'subject' && field === 'authentication')
      for (const entry of entries) {
        if (typeof entry === 'string' && field !== 'verificationMethod') {
          const id = methodId(entry, subject)
          if (grants) authorized.add(id)
        } else {
          const method = object(entry), id = methodId(method.id, subject)
          if (methods.has(id)) refuse('method-id-ambiguous')
          methods.set(id, { value: method, eligible: ['verificationMethod', 'authentication', 'assertionMethod'].includes(field) })
          if (grants) authorized.add(id)
        }
      }
    }
    if (requested !== undefined) {
      if (!authorized.has(requested)) refuse('method-not-authorized')
      const entry = methods.get(requested)
      if (!entry?.eligible) refuse('method-unresolved')
      checkMethodKey(entry.value, selectedSpki, role === 'issuer')
    } else {
      // No selector names a method. A supported match suffices; other methods
      // retain the parser's existing unselected-material behavior.
      const matches = [...authorized].some(id => {
        const entry = methods.get(id)
        if (!entry?.eligible) return false
        try { checkMethodKey(entry.value, selectedSpki, true); return true } catch { return false }
      })
      if (!matches) refuse('issuer-key-not-authorized')
    }
    return { status: 'verified', reason: role === 'subject' ? 'subject-relationship-authorized' : 'issuer-relationship-authorized' }
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'document-invalid' }
  }
}

function checkMethodKey(method: Record<string, unknown>, selectedSpki: string | undefined, edOnly: boolean): void {
  if (method.type !== 'JsonWebKey2020') refuse('method-type-unsupported')
  if (typeof method.controller !== 'string' || !validDid(method.controller)) refuse('method-controller-invalid')
  if (Object.keys(method).some(key => !['id', 'type', 'controller', 'publicKeyJwk'].includes(key))) refuse('method-material-unsupported')
  const jwk = object(method.publicKeyJwk)
  const ed = jwk.kty === 'OKP' && jwk.crv === 'Ed25519'
  const ec = !edOnly && jwk.kty === 'EC' && jwk.crv === 'P-256'
  if ((!ed && !ec) || Object.keys(jwk).some(key => !['kty', 'crv', 'x', ...(ec ? ['y'] : []), 'alg', 'use', 'key_ops'].includes(key))
    || (Object.hasOwn(jwk, 'alg') && jwk.alg !== (ed ? 'EdDSA' : 'ES256'))
    || (Object.hasOwn(jwk, 'use') && jwk.use !== 'sig')
    || (Object.hasOwn(jwk, 'key_ops') && (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== 'verify'))) refuse('jwk-invalid')
  const x = coordinate(jwk.x), y = ec ? coordinate(jwk.y) : undefined
  if (!selectedSpki) refuse('selected-key-unavailable')
  const selected = createPublicKey({ key: Buffer.from(selectedSpki, 'base64'), format: 'der', type: 'spki' }).export({ format: 'jwk' })
  if (selected.kty !== jwk.kty || selected.crv !== jwk.crv || selected.x !== x || selected.y !== y) refuse('selected-key-mismatch')
}
