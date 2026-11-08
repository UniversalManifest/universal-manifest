import { createHash } from 'node:crypto'
import { SDJwtInstance } from '@sd-jwt/core'
import { verifyEd25519V05 } from './ed25519-v05.js'
import { checkIssuerKeyAuthorizationV05, type UmSubjectKeyAuthorizationV05 } from './subject-key-authorization.js'
import type {
  UmEvaluationContextWithSdJwtV05, UmEvaluationResultV05, UmHolderBindingStatus,
} from './index.js'

/** Caller-authenticated keys. This bounded profile supports Ed25519 SPKI only. */
export interface UmSdJwtHolderBindingKeysV05 {
  /** Exact issuer identifier to authenticated key; no network or embedded-key trust. */
  issuerPublicKeysSpkiB64: Readonly<Record<string, string>>
  holderPublicKeySpkiB64: string
  /** Required finite positive KB age, in seconds; zero clock skew is used. */
  keyBindingMaxAgeSeconds: number
}

/** Local evidence only. No document authentication, identity or trust-tier award. */
export interface UmIssuerProofAuthorizationV05 extends UmSubjectKeyAuthorizationV05 {
  proofIndex: number
  proofStatus: UmHolderBindingStatus | 'not-evaluated'
}
export interface UmIssuerClaimAuthorizationV05 extends UmSubjectKeyAuthorizationV05 {
  claimIndex: number
  issuer: string
  proofs: UmIssuerProofAuthorizationV05[]
}
export interface UmIssuerKeyAuthorizationV05 extends UmSubjectKeyAuthorizationV05 {
  claims: UmIssuerClaimAuthorizationV05[]
}

/** Preserve each actual member even when outer verification stops evaluation. */
export function unexecutedIssuerAuthorizationV05(value: unknown): UmIssuerKeyAuthorizationV05 {
  const claims = value && typeof value === 'object' && 'claims' in value && Array.isArray(value.claims) ? value.claims : []
  return { status: 'not-evaluated', reason: 'proof-verification-not-complete', claims: claims.map((claim: unknown, claimIndex: number) => {
    const object = claim && typeof claim === 'object' && !Array.isArray(claim) ? claim as Record<string, unknown> : {}
    const proofs = object.claimProof === undefined ? [] : Array.isArray(object.claimProof) ? object.claimProof : [object.claimProof]
    return { claimIndex, issuer: typeof object.issuer === 'string' ? object.issuer : '', status: 'not-evaluated',
      reason: 'proof-verification-not-complete', proofs: proofs.map((_proof: unknown, proofIndex: number) => ({
        proofIndex, proofStatus: 'not-evaluated', status: 'not-evaluated', reason: 'proof-verification-not-complete',
      })) }
  }) }
}

function aggregateIssuerAuthorization(results: UmSubjectKeyAuthorizationV05[]): UmSubjectKeyAuthorizationV05 {
  if (results.some(result => result.status === 'failed')) return { status: 'failed', reason: 'issuer-relationship-failed' }
  if (results.length && results.every(result => result.status === 'verified')) return { status: 'verified', reason: 'issuer-relationships-authorized' }
  return { status: 'not-evaluated', reason: 'issuer-proof-not-verified' }
}

function sdJwtObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SD-JWT requires a JSON object')
  return value as Record<string, unknown>
}

function decodeSdJwtSegment(value: string): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('SD-JWT requires unpadded base64url')
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.toString('base64url') !== value) throw new Error('SD-JWT noncanonical base64url')
  return bytes
}

function sdJwtJson(segment: string, parse: (text: string) => unknown): unknown {
  const bytes = decodeSdJwtSegment(segment)
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('SD-JWT invalid UTF-8')
  return parse(text)
}

function sdJwtPublicKey(value: unknown): Buffer {
  if (typeof value !== 'string' || !value) throw new Error('SD-JWT requires an explicit authenticated public key')
  const bytes = Buffer.from(value, 'base64')
  const prefix = Buffer.from('302a300506032b6570032100', 'hex')
  if (bytes.toString('base64') !== value || bytes.length !== 44 || !bytes.subarray(0, 12).equals(prefix)) {
    throw new Error('SD-JWT requires canonical Ed25519 SPKI')
  }
  return bytes
}

function sdJwtConfirmation(payload: Record<string, unknown>, holderKey: Buffer, thumbprint: unknown): void {
  // Require issuer-signed, undisclosed cnf.jwk. A disclosed claim may never
  // select or override a verification key. Thumbprints cover RFC7638 members.
  const confirmation = sdJwtObject(payload.cnf)
  const jwk = sdJwtObject(confirmation.jwk)
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string'
    || jwk.d !== undefined || (jwk.alg !== undefined && jwk.alg !== 'EdDSA')
    || (jwk.use !== undefined && jwk.use !== 'sig')
    || (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== 'verify'))) {
    throw new Error('SD-JWT confirmation requires a public Ed25519 verification JWK')
  }
  const x = decodeSdJwtSegment(jwk.x)
  if (x.length !== 32 || !x.equals(holderKey.subarray(12))) throw new Error('SD-JWT confirmation does not match authenticated holder key')
  const actual = createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })).digest('base64url')
  if (actual !== thumbprint) throw new Error('SD-JWT cnfThumbprint mismatch')
}

async function verifySdJwtHolderBinding(
  compact: string, issuer: string, thumbprint: unknown,
  context: UmEvaluationContextWithSdJwtV05, parse: (text: string) => unknown
): Promise<Buffer> {
  const keys = context.sdJwtHolderBinding
  if (!keys || !(context.now instanceof Date) || !Number.isFinite(context.now.getTime())
    || typeof context.verifierAudience !== 'string' || !context.verifierAudience.trim()
    || typeof context.verifierChallenge !== 'string' || !context.verifierChallenge.trim()
    || !Number.isFinite(keys.keyBindingMaxAgeSeconds) || keys.keyBindingMaxAgeSeconds <= 0) {
    throw new Error('SD-JWT requires explicit keys, pinned now, nonempty verifier audience/challenge and finite positive KB max age')
  }
  const issuerKeys = sdJwtObject(keys.issuerPublicKeysSpkiB64)
  const issuerKey = sdJwtPublicKey(Object.hasOwn(issuerKeys, issuer) ? issuerKeys[issuer] : undefined)
  const holderKey = sdJwtPublicKey(keys.holderPublicKeySpkiB64)
  const parts = compact.split('~')
  if (parts.length < 2 || !parts.at(-1)) throw new Error('SD-JWT requires an appended KB-JWT')
  const payloads: Record<string, unknown>[] = []
  for (const jwt of [parts[0], parts.at(-1)!]) {
    const segments = jwt.split('.')
    if (segments.length !== 3) throw new Error('SD-JWT malformed compact JWT')
    const header = sdJwtObject(sdJwtJson(segments[0], parse))
    if (header.alg !== 'EdDSA' || Object.hasOwn(header, 'crit') || Object.hasOwn(header, 'b64')) {
      throw new Error('SD-JWT supports EdDSA without crit/b64 header extensions only')
    }
    const signature = decodeSdJwtSegment(segments[2])
    if (signature.length !== 64) throw new Error('SD-JWT requires a 64-byte Ed25519 signature')
    payloads.push(sdJwtObject(sdJwtJson(segments[1], parse)))
  }
  // Preflight every disclosure with the shared duplicate-member parser before
  // the library unpacks it. Digest structure, collisions and coverage belong
  // to the RFC9901 processor, not a second hand-written token implementation.
  for (const disclosure of parts.slice(1, -1)) sdJwtJson(disclosure, parse)
  const issuerPayload = payloads[0]
  if (issuerPayload._sd_alg !== undefined && issuerPayload._sd_alg !== 'sha-256') throw new Error('SD-JWT supports sha-256 only')
  if (issuerPayload.iss !== issuer) throw new Error('SD-JWT issuer identifier mismatch')
  sdJwtConfirmation(issuerPayload, holderKey, thumbprint)
  const processor = new SDJwtInstance({
    hashAlg: 'sha-256', allowedDisclosureHashAlgorithms: ['sha-256'],
    hasher: (data, alg) => {
      if (alg !== 'sha-256') throw new Error('SD-JWT supports sha-256 only')
      return createHash('sha256').update(typeof data === 'string' ? data : Buffer.from(data)).digest()
    },
    verifier: (data, signature) => verifyEd25519V05(issuerKey, Buffer.from(data, 'utf8'), decodeSdJwtSegment(signature)),
    kbVerifier: (data, signature, payload) => {
      sdJwtConfirmation(payload, holderKey, thumbprint)
      return verifyEd25519V05(holderKey, Buffer.from(data, 'utf8'), decodeSdJwtSegment(signature))
    },
  })
  const verified = await processor.verify(compact, {
    currentDate: context.now.getTime() / 1000, skewSeconds: 0,
    allowedIssuerAlgorithms: ['EdDSA'], allowedKeyBindingAlgorithms: ['EdDSA'],
    keyBindingNonce: context.verifierChallenge, expectedKeyBindingAudience: context.verifierAudience,
    keyBindingMaxAgeSeconds: keys.keyBindingMaxAgeSeconds, expectedIssuer: issuer,
  })
  if (!verified.kb) throw new Error('SD-JWT processor did not verify key binding')
  return issuerKey
}

/** Internal integration: only called with snapshotted, outer-validated input. */
export async function evaluateSdJwtHolderBindingsV05(
  result: UmEvaluationResultV05, context: UmEvaluationContextWithSdJwtV05,
  parse: (text: string) => unknown,
  authorization?: { documents: unknown; diagnostic: UmIssuerKeyAuthorizationV05; canonicalize: (value: unknown) => string },
): Promise<void> {
  const statuses: UmHolderBindingStatus[] = []
  for (const [index, claim] of (result.manifest?.claims ?? []).entries()) {
    const issuerResult = authorization?.diagnostic.claims[index]
    if (issuerResult) for (const proof of issuerResult.proofs) {
      proof.proofStatus = claim.holderBinding ? 'unsupported-mode' : 'absent'
    }
    let status: UmHolderBindingStatus = 'absent'
    let reason = 'holder binding absent'
    if (claim.holderBinding) {
      status = 'unsupported-mode'
      reason = 'holder-binding mode or claimProof carrier is unsupported'
      if (claim.holderBinding.mode === 'sd-jwt-kb') {
        const proofs = Array.isArray(claim.claimProof) ? claim.claimProof : [claim.claimProof]
        const members: UmHolderBindingStatus[] = []
        const reasons: string[] = []
        for (const [proofIndex, proof] of proofs.entries()) {
          const issuerProof = issuerResult?.proofs[proofIndex]
          if (!proof || typeof proof !== 'object' || Array.isArray(proof) || proof.proofType !== 'sd-jwt-kb') {
            members.push(proof === undefined ? 'absent' : 'unsupported-mode')
            if (issuerProof) issuerProof.proofStatus = proof === undefined ? 'absent' : 'unsupported-mode'
            reasons.push('claimProof member is absent or unsupported; URI proofs are not fetched')
            continue
          }
          try {
            if (typeof proof.proofValue !== 'string' || !proof.proofValue) throw new Error('SD-JWT proofValue must be a nonempty compact presentation')
            if (result.receipt.presentationProofStatus !== 'verified') throw new Error('SD-JWT requires a verified interactive root did-auth presentation')
            const issuerKey = await verifySdJwtHolderBinding(proof.proofValue, claim.issuer, claim.holderBinding.cnfThumbprint, context, parse)
            members.push('verified')
            if (issuerProof && authorization) {
              issuerProof.proofStatus = 'verified'
              const documents = authorization.documents
              const document = documents && typeof documents === 'object' && !Array.isArray(documents)
                && Object.hasOwn(documents, claim.issuer) ? (documents as Record<string, unknown>)[claim.issuer] : undefined
              Object.assign(issuerProof, checkIssuerKeyAuthorizationV05(document, claim.issuer, proof.verificationMethod,
                proof.proofPurpose, issuerKey.toString('base64'), parse, authorization.canonicalize))
            }
          } catch (error) {
            members.push('failed')
            if (issuerProof) issuerProof.proofStatus = 'failed'
            reasons.push(error instanceof Error ? error.message : 'SD-JWT verification failed')
          }
        }
        status = aggregateSdJwtBindings(members)
        reason = reasons.join('; ') || (status === 'verified' ? 'SD-JWT issuer/holder signatures, confirmation and KB context verified' : 'claimProof array is empty')
      }
    }
    if (issuerResult) Object.assign(issuerResult, aggregateIssuerAuthorization(issuerResult.proofs))
    statuses.push(status)
    const claimStatus = result.receipt.claimStatuses?.[index]
    if (claimStatus) {
      if (status === 'failed') claimStatus.status = 'failed'
      claimStatus.tier = 0
      claimStatus.reason = `${reason}; DID authority, key purposes, revocation and subject binding remain unverified (achieved Tier0)`
    }
  }
  result.receipt.holderBindingStatus = aggregateSdJwtBindings(statuses)
  result.receipt.effectiveTrustTier = 0
  if (result.receipt.holderBindingStatus === 'failed') result.receipt.outcome = 'accepted-partial'
  if (authorization) {
    Object.assign(authorization.diagnostic, aggregateIssuerAuthorization(authorization.diagnostic.claims))
    if (authorization.diagnostic.status === 'failed') {
      result.receipt.outcome = 'rejected'
      result.receipt.warnings ??= []
      result.receipt.warnings.push({ code: 'um:reason:trust:unbound-claims', message: 'Issuer key is not authorized by the supplied issuer document assertionMethod relationship' })
    }
  }
}

function aggregateSdJwtBindings(statuses: UmHolderBindingStatus[]): UmHolderBindingStatus {
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('unsupported-mode')) return 'unsupported-mode'
  if (statuses.length === 0 || statuses.includes('absent')) return 'absent'
  return 'verified'
}
