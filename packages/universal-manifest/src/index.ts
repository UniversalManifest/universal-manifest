import { createHash, createPublicKey, verify } from 'node:crypto'
import { verifyEd25519V05 } from './ed25519-v05.js'
import { resolveOfflineDidKey } from './offline-key-resolution.js'
import { checkSubjectKeyAuthorizationV05, type UmSubjectKeyAuthorizationV05 } from './subject-key-authorization.js'
export type { UmSubjectKeyAuthorizationV05 } from './subject-key-authorization.js'
import { assertTrustedContextsV05 } from './context-v05.js'
import { evaluateSdJwtHolderBindingsV05, unexecutedIssuerAuthorizationV05, type UmSdJwtHolderBindingKeysV05, type UmIssuerKeyAuthorizationV05 } from './sd-jwt-holder-binding.js'
export type { UmSdJwtHolderBindingKeysV05, UmIssuerKeyAuthorizationV05, UmIssuerClaimAuthorizationV05, UmIssuerProofAuthorizationV05 } from './sd-jwt-holder-binding.js'
/** Exact v0.5 Profile A primitive predicate; does not establish identity or manifest conformance. */
export { verifyEd25519V05 as verifyEd25519SignatureV05 } from './ed25519-v05.js'
import { UmContextualLivenessValidatorV1, unexecutedLivenessV1, freezeLivenessV1, type UmLivenessProofResultV1 } from './liveness.js'
export type { UmContextualLivenessValidatorV1, UmLivenessProofResultV1 } from './liveness.js'

/** Install independently authenticated binding evidence, never candidate data. */
export function createWebAuthnLivenessValidatorV1(configuration: unknown): UmContextualLivenessValidatorV1 {
  return new UmContextualLivenessValidatorV1(configuration, { parse: parseIJsonDocument, canonicalize: canonicalizeJson })
}

/**
 * JSON-LD `@context` value. Can be a single URI string, a map of term definitions,
 * or an array mixing both forms.
 */
export type JsonLdContext =
  | string
  | Record<string, unknown>
  | Array<string | Record<string, unknown>>

/** JSON-LD `@type` value -- a single type string or an array of type strings. */
export type JsonLdType = string | string[]

/**
 * A typed entity embedded inside a facet.
 *
 * Every entity carries a JSON-LD `@id` and `@type`; additional properties are
 * domain-specific and passed through as `unknown`.
 */
export interface UmEntityV01 {
  '@id': string
  '@type': JsonLdType
  [key: string]: unknown
}

/**
 * A named data section within a manifest (v0.1+).
 *
 * Facets carry domain-specific payloads (via `entity`) or external references
 * (via `ref`). Each facet must include `@type: "um:Facet"`.
 */
export interface UmFacetV01 {
  '@id'?: string
  '@type': JsonLdType
  name?: string
  description?: string
  ref?: string
  entity?: UmEntityV01 | Record<string, unknown> | string | null
  [key: string]: unknown
}

/**
 * Signature for v0.1 manifests.
 *
 * In v0.1 the signature is optional and loosely typed -- algorithm and key
 * reference are informational only.
 */
export interface UmSignatureV01 {
  algorithm?: string
  keyRef?: string
  value?: string
  [key: string]: unknown
}

/**
 * Signature for v0.2 manifests.
 *
 * v0.2 mandates Ed25519 signatures with JCS (RFC 8785) canonicalization.
 * The public key is provided inline as base-64-encoded SPKI DER
 * (`publicKeySpkiB64`) or via an external reference (`keyRef`).
 */
export interface UmSignatureV02 {
  algorithm: 'Ed25519'
  canonicalization: 'JCS-RFC8785'
  keyRef?: string
  publicKeySpkiB64?: string
  created?: string
  value: string
  [key: string]: unknown
}

/**
 * A Universal Manifest document (v0.1).
 *
 * The manifest is the top-level document that binds a subject identity to a set
 * of facets, claims, consents, devices, and pointers within a validity window
 * defined by `issuedAt` / `expiresAt`.
 */
export interface UniversalManifestV01 {
  '@context': JsonLdContext
  '@id': string
  '@type': JsonLdType

  manifestVersion: string
  subject: string
  issuedAt: string
  expiresAt: string

  facets?: UmFacetV01[]
  claims?: Array<Record<string, unknown>>
  consents?: Array<Record<string, unknown>>
  devices?: Array<Record<string, unknown>>
  pointers?: Array<Record<string, unknown>>
  signature?: UmSignatureV01

  [key: string]: unknown
}

/**
 * A Universal Manifest document (v0.2 -- draft).
 *
 * Extends the v0.1 shape with a mandatory Ed25519 signature. The
 * `manifestVersion` is fixed to `"0.2"`.
 */
export interface UniversalManifestV02 {
  '@context': JsonLdContext
  '@id': string
  '@type': JsonLdType

  manifestVersion: '0.2'
  subject: string
  issuedAt: string
  expiresAt: string

  facets?: UmFacetV01[]
  claims?: Array<Record<string, unknown>>
  consents?: Array<Record<string, unknown>>
  devices?: Array<Record<string, unknown>>
  pointers?: Array<Record<string, unknown>>
  signature: UmSignatureV02

  [key: string]: unknown
}

export type GpcEffectiveState = 'active' | 'inactive_or_not_sent' | 'unknown'

export type GpcSignalSource = 'ua-header' | 'ua-js' | 'intermediary' | 'unknown'

export type GpcScope = 'sale' | 'share' | 'cross-context-targeted-advertising'

export interface GpcRuntimeSignalInput {
  secGpc?: string | string[] | null
  navigatorGlobalPrivacyControl?: boolean | null
  signalSource?: GpcSignalSource | null
  observedAt?: string | Date | null
}

export interface GpcRuntimeSignal {
  effectiveState: GpcEffectiveState
  rawHeaderValues: string[]
  jsSignalObserved: boolean | null
  source: GpcSignalSource
  observedAt: string
  scope: GpcScope[]
}

export interface ParsedGpcSupportResource {
  gpc: boolean
  lastUpdate?: string
  raw: Record<string, unknown>
}

export interface GpcConsentProjection {
  '@type': 'um:Consent'
  name: 'privacy.globalOptOut.gpc'
  value: GpcEffectiveState
  scope: GpcScope[]
  source: GpcSignalSource
  observedAt: string
}

const GPC_SCOPE: GpcScope[] = ['sale', 'share', 'cross-context-targeted-advertising']
const RFC3339_FULL_DATE = /^\d{4}-\d{2}-\d{2}$/

const RFC3339_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * The RFC 3339 date-time production, as the v0.5 schema's `format: date-time` requires: a real calendar
 * date, lower-case t and z allowed, and second 60 only at 23:59 UTC. The same rule as Rust's `time.rs`.
 */
function isRfc3339DateTimeV05(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(text)
  if (!m) return false
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 60) return false
  const sign = m[7] === '-' ? -1 : 1
  const offsetHour = m[8] === undefined ? 0 : Number(m[8])
  const offsetMinute = m[9] === undefined ? 0 : Number(m[9])
  if (offsetHour > 23 || offsetMinute > 59) return false
  if (second < 60) return true
  const utcMinutes = (hour * 60 + minute - sign * (offsetHour * 60 + offsetMinute) + 1440) % 1440
  return utcMinutes === 1439
}

function assertIsoDateTime(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing ${fieldName}`)
  if (!RFC3339_DATE_TIME.test(value)) throw new Error(`${fieldName} must be an ISO date-time`)
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) throw new Error(`${fieldName} must be an ISO date-time`)
}

function jsonLdTypeIncludes(value: unknown, required: string): boolean {
  if (typeof value === 'string') return value === required
  if (Array.isArray(value)) return value.some((v) => v === required)
  return false
}

function assertGpcSignalSource(value: unknown, fieldName: string): asserts value is GpcSignalSource {
  if (
    value !== 'ua-header'
    && value !== 'ua-js'
    && value !== 'intermediary'
    && value !== 'unknown'
  ) {
    throw new Error(
      `${fieldName} must be one of: ua-header, ua-js, intermediary, unknown`
    )
  }
}

function normalizeObservedAt(value: string | Date | null | undefined): string {
  if (value === undefined || value === null) return new Date().toISOString()

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('observedAt must be a valid Date')
    return value.toISOString()
  }

  assertIsoDateTime(value, 'observedAt')
  return value
}

function normalizeSecGpcHeader(value: string | string[] | null | undefined): string[] {
  if (value === undefined || value === null) return []
  if (typeof value === 'string') return [value.trim()].filter((item) => item.length > 0)
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function inferGpcSource(
  explicitSource: GpcSignalSource | null | undefined,
  hasHeaderValues: boolean,
  jsSignalObserved: boolean | null
): GpcSignalSource {
  if (explicitSource !== undefined && explicitSource !== null) {
    assertGpcSignalSource(explicitSource, 'signalSource')
    return explicitSource
  }
  if (hasHeaderValues) return 'ua-header'
  if (jsSignalObserved !== null) return 'ua-js'
  return 'unknown'
}

function isRfc3339FullDateOrDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  if (RFC3339_FULL_DATE.test(value)) {
    return Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  }
  if (!RFC3339_DATE_TIME.test(value)) return false
  return Number.isFinite(Date.parse(value))
}

function assertJsonMediaType(value: string | null | undefined): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('gpc support resource must use application/json media type')
  }

  const normalized = value.split(';', 1)[0]?.trim().toLowerCase()
  if (normalized !== 'application/json') {
    throw new Error('gpc support resource must use application/json media type')
  }
}

/**
 * Normalize GPC runtime inputs into a deterministic decision object.
 *
 * Runtime observation is authoritative for request-time behavior. The helper
 * treats any exact `Sec-GPC: 1` value as active, falls back to
 * `navigator.globalPrivacyControl` when present, and preserves provenance via
 * `source` plus `observedAt`.
 */
export function normalizeGpcRuntimeSignal(input: GpcRuntimeSignalInput = {}): GpcRuntimeSignal {
  const rawHeaderValues = normalizeSecGpcHeader(input.secGpc)
  const jsSignalObserved =
    typeof input.navigatorGlobalPrivacyControl === 'boolean'
      ? input.navigatorGlobalPrivacyControl
      : null
  const headerActive = rawHeaderValues.some((value) => value === '1')

  let effectiveState: GpcEffectiveState = 'unknown'
  if (headerActive || jsSignalObserved === true) {
    effectiveState = 'active'
  } else if (rawHeaderValues.length > 0 || jsSignalObserved === false) {
    effectiveState = 'inactive_or_not_sent'
  }

  return {
    effectiveState,
    rawHeaderValues,
    jsSignalObserved,
    source: inferGpcSource(input.signalSource, rawHeaderValues.length > 0, jsSignalObserved),
    observedAt: normalizeObservedAt(input.observedAt),
    scope: [...GPC_SCOPE],
  }
}

/**
 * Parse a `/.well-known/gpc.json` support resource body.
 *
 * Unknown members are preserved under `raw`. Invalid or absent `lastUpdate`
 * values are tolerated and omitted from the normalized result.
 */
export function parseGpcSupportResource(value: unknown): ParsedGpcSupportResource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('gpc support resource must be a JSON object')
  }

  const raw = value as Record<string, unknown>
  if (typeof raw.gpc !== 'boolean') {
    throw new Error('gpc support resource must include boolean gpc')
  }

  const parsed: ParsedGpcSupportResource = {
    gpc: raw.gpc,
    raw,
  }

  if (isRfc3339FullDateOrDateTime(raw.lastUpdate)) {
    parsed.lastUpdate = raw.lastUpdate
  }

  return parsed
}

/**
 * Parse a `/.well-known/gpc.json` response with media-type checking.
 */
export function parseGpcSupportResourceResponse(
  mediaType: string | null | undefined,
  body: unknown
): ParsedGpcSupportResource {
  assertJsonMediaType(mediaType)
  return parseGpcSupportResource(body)
}

/**
 * Create a consent-style evidence projection for an observed GPC runtime state.
 *
 * The resulting object is suitable for `consents[]` as descriptive evidence and
 * does not replace runtime-authoritative decisioning.
 */
export function createGpcConsentProjection(signal: GpcRuntimeSignal): GpcConsentProjection {
  return {
    '@type': 'um:Consent',
    name: 'privacy.globalOptOut.gpc',
    value: signal.effectiveState,
    scope: [...signal.scope],
    source: signal.source,
    observedAt: signal.observedAt,
  }
}

/**
 * Create the non-normative support-resource pointer object for GPC.
 */
export function createGpcSupportResourcePointer(url: string): Record<string, string> {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('gpc support resource pointer url must be a non-empty string')
  }

  try {
    // Enforce absolute URLs so pointer objects are transportable across surfaces.
    new URL(url)
  } catch {
    throw new Error('gpc support resource pointer url must be an absolute URL')
  }

  return {
    name: 'privacy.gpcSupportResource',
    url,
  }
}

/**
 * Extract the `@id` (UMID) from a manifest or any object carrying `@id`.
 *
 * @param manifest - An object with an `@id` property.
 * @returns The manifest's `@id` string.
 */
export function getManifestId(manifest: { '@id': string }): string {
  return manifest['@id']
}

function canonicalizeJson(value: unknown): string {
  if (value === null) return 'null'

  // RFC 8259 Section 7 and Section 8.1: JSON exchanged between systems is
  // encoded as UTF-8, and a string containing an unpaired UTF-16 surrogate has
  // no UTF-8 encoding at all. A JCS canonicalizer must not manufacture
  // canonical text for a value that cannot be transmitted intact, so reject a
  // lone surrogate in a key or a string value here rather than emit a \udXXX
  // escape (which JSON.stringify would otherwise do). A well-formed surrogate
  // pair is accepted and canonicalizes to the literal astral character.
  const requireWellFormedString = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      const unit = text.charCodeAt(i)
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const next = text.charCodeAt(i + 1)
        if (!(next >= 0xdc00 && next <= 0xdfff)) {
          throw new Error(
            'cannot canonicalize a string containing an unpaired high surrogate: it has no UTF-8 encoding (RFC 8259 Section 7)'
          )
        }
        i += 1
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        throw new Error(
          'cannot canonicalize a string containing an unpaired low surrogate: it has no UTF-8 encoding (RFC 8259 Section 7)'
        )
      }
    }
  }

  if (typeof value === 'number') {
    // RFC 8785 Section 3.2.2.3: occurrences of NaN or Infinity MUST cause a
    // compliant JCS implementation to terminate with an error. JSON.stringify
    // would silently rewrite them to `null`, so the document that gets signed
    // would differ from the one on the wire; refuse instead.
    if (!Number.isFinite(value)) {
      throw new Error(
        'cannot canonicalize a non-finite number (NaN or Infinity): it has no JSON representation (RFC 8785 Section 3.2.2.3)'
      )
    }
    return JSON.stringify(value)
  }

  if (typeof value === 'string') {
    requireWellFormedString(value)
    return JSON.stringify(value)
  }

  if (typeof value === 'boolean') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`
  }

  if (typeof value !== 'object') {
    return JSON.stringify(value)
  }

  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

  return `{${keys
    .map((key) => {
      requireWellFormedString(key)
      return `${JSON.stringify(key)}:${canonicalizeJson(obj[key])}`
    })
    .join(',')}}`
}

/**
 * Reject a JSON document that carries a duplicate object member name.
 *
 * Base Section 1.6.3, verbatim:
 *
 * > *"JCS presumes I-JSON-compatible input: the JSON-LD production consumed for
 * > signing MUST be an I-JSON document [RFC 7493], and a document with
 * > duplicate member names MUST be rejected at the Arrive stage (Section 3.1.1)
 * > — parser behavior on duplicates is otherwise implementation-defined, which
 * > would make the signing input ambiguous between two conformant verifiers."*
 *
 * `JSON.parse` cannot express this rule: it collapses duplicates last-wins and
 * hands back an object whose keys are already unique, so by the time a value
 * exists the evidence is gone. The check therefore has to run over the document
 * **text**, which is why it is a separate function from every other validator
 * here and why {@link parseIJsonDocument} exists at all.
 *
 * **Why this is a rejection and not a collapse.** The rule sits underneath every
 * signature verification. Two implementations that collapse duplicates
 * differently derive different canonical bytes from the same bytes on the wire,
 * so an attacker who can get one verifier to read
 * `{"subject":"alice","subject":"mallory"}` as `alice` and another to read it as
 * `mallory` holds one signature that validates over two different meanings.
 * Rejecting is the only outcome that cannot be exploited.
 *
 * Member names are compared **after** escape decoding, so `{"	":1,"\t":2}`
 * is a duplicate — the two literals name the same member. Repeating a key across
 * sibling objects, or between nesting levels, is legitimate and accepted.
 *
 * Grammar errors are not this function's job: it scans a document that
 * `JSON.parse` has already accepted (see {@link parseIJsonDocument}). Called
 * directly on malformed text it simply declines to judge the member names it
 * cannot decode, and the caller's `JSON.parse` is what reports the syntax error.
 *
 * Added 2026-07-26 to close the third instance of a pattern already
 * closed twice: the Rust SDK core failed closed while this reference — the
 * oracle the conformance corpus scores every implementation against — was the
 * permissive side, which is the wrong way round for an oracle.
 *
 * @param text - The raw JSON document text.
 * @throws {Error} If any object in the document repeats a member name.
 */
export function assertNoDuplicateMemberNames(text: string) {
  // One frame per open container. `awaitingKey` is true only where the next
  // string literal in an object is a member name rather than a value, which is
  // what lets a value that happens to be a string be told apart from a key.
  const frames: { isObject: boolean; keys: Set<string>; awaitingKey: boolean }[] = []
  const byteOffset = (at: number) => new TextEncoder().encode(text.slice(0, at)).length

  let index = 0
  while (index < text.length) {
    const ch = text[index]

    if (ch === '"') {
      const start = index
      index += 1
      while (index < text.length) {
        if (text[index] === '\\') {
          index += 2
          continue
        }
        if (text[index] === '"') {
          index += 1
          break
        }
        index += 1
      }
      const frame = frames[frames.length - 1]
      if (frame !== undefined && frame.isObject && frame.awaitingKey) {
        let name
        try {
          name = JSON.parse(text.slice(start, index))
        } catch {
          // Undecodable literal: malformed text, which JSON.parse reports.
          frame.awaitingKey = false
          continue
        }
        if (typeof name === 'string') {
          if (frame.keys.has(name)) {
            throw new Error(
              `duplicate object member name ${JSON.stringify(name)}: a document with duplicate `
                + 'member names MUST be rejected at the Arrive stage (Base Section 1.6.3, '
                + 'RFC 7493 I-JSON) — collapsing it would make the signing input ambiguous '
                + `between two conformant verifiers (at byte ${byteOffset(start)})`
            )
          }
          frame.keys.add(name)
        }
        frame.awaitingKey = false
      }
      continue
    }

    if (ch === '{' || ch === '[') {
      frames.push({ isObject: ch === '{', keys: new Set(), awaitingKey: ch === '{' })
      index += 1
      continue
    }

    if (ch === '}' || ch === ']') {
      frames.pop()
      index += 1
      continue
    }

    if (ch === ',') {
      const frame = frames[frames.length - 1]
      if (frame !== undefined && frame.isObject) frame.awaitingKey = true
      index += 1
      continue
    }

    index += 1
  }
}

/**
 * The Arrive-stage ingestion of a JSON document (Base Section 3.1.1): parse the
 * text, and reject it if it is not I-JSON because it repeats a member name.
 *
 * This is the reference implementation's peer of the Rust core's `parse`, and
 * the entry point every caller that starts from **text** rather than from an
 * already-parsed value should use. The evaluation and validation entry points
 * here (`assertUniversalManifestV04`, `evaluateUniversalManifestV04`, …) take a
 * value, so they are structurally incapable of applying the duplicate rule; a
 * caller that reaches them via a bare `JSON.parse` has silently skipped Arrive.
 *
 * @param text - The raw JSON document text.
 * @returns The parsed value.
 * @throws {Error} On a JSON syntax error, a duplicate member name, a lone surrogate, or a number outside the double range.
 */
export function parseIJsonDocument(text: string): unknown {
  const value = JSON.parse(text)
  assertNoDuplicateMemberNames(text)
  assertIJsonValues(value)
  return value
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/**
 * RFC 7493 I-JSON: no string or member name may hold a lone surrogate, escaped or raw, and no number may
 * fall outside the IEEE 754 double range. `JSON.parse` keeps the first and turns the second into Infinity.
 * The walk is iterative, so a deep document cannot exhaust the stack.
 */
function assertIJsonValues(root: unknown): void {
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const item = stack.pop()
    if (typeof item === 'string') {
      if (LONE_SURROGATE.test(item)) throw new Error('I-JSON: a string holds a lone surrogate')
    } else if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new Error('I-JSON: a number is outside the IEEE 754 double range')
    } else if (Array.isArray(item)) {
      for (const child of item) stack.push(child)
    } else if (item && typeof item === 'object') {
      for (const [name, child] of Object.entries(item)) {
        if (LONE_SURROGATE.test(name)) throw new Error('I-JSON: a member name holds a lone surrogate')
        stack.push(child)
      }
    }
  }
}

/**
 * Assert that `value` is a structurally valid v0.1 Universal Manifest.
 *
 * Checks required fields (`@context`, `@id`, `@type`, `manifestVersion`,
 * `subject`, `issuedAt`, `expiresAt`), validates date ordering, and ensures
 * every facet carries `@type: "um:Facet"`.
 *
 * @param value - The parsed JSON value to validate.
 * @throws {Error} If validation fails.
 */
export function assertUniversalManifestV01(value: unknown): asserts value is UniversalManifestV01 {
  if (!value || typeof value !== 'object') throw new Error('Manifest must be an object')

  const obj = value as Record<string, unknown>

  if (!('@context' in obj)) throw new Error('Missing @context')
  if (typeof obj['@id'] !== 'string' || obj['@id'].length === 0) throw new Error('Missing @id')
  if (!jsonLdTypeIncludes(obj['@type'], 'um:Manifest')) {
    throw new Error('Missing um:Manifest in @type')
  }

  if (typeof obj.manifestVersion !== 'string' || obj.manifestVersion.length === 0) {
    throw new Error('Missing manifestVersion')
  }
  if (typeof obj.subject !== 'string' || obj.subject.length === 0) throw new Error('Missing subject')
  assertIsoDateTime(obj.issuedAt, 'issuedAt')
  assertIsoDateTime(obj.expiresAt, 'expiresAt')

  if (Date.parse(obj.issuedAt) > Date.parse(obj.expiresAt)) {
    throw new Error('issuedAt must be <= expiresAt')
  }

  if (obj.facets !== undefined) {
    if (!Array.isArray(obj.facets)) throw new Error('facets must be an array')
    for (const facet of obj.facets) {
      if (!facet || typeof facet !== 'object') throw new Error('facet must be an object')
      const FacetObj = facet as Record<string, unknown>
      if (!jsonLdTypeIncludes(FacetObj['@type'], 'um:Facet')) {
        throw new Error('Missing um:Facet in facet @type')
      }
    }
  }
}

/**
 * Assert that `value` is a valid **and unexpired** v0.1 Universal Manifest.
 *
 * Runs full structural validation via {@link assertUniversalManifestV01} then
 * checks that the manifest has not expired relative to `now`.
 *
 * @param value - The parsed JSON value to validate.
 * @param now   - Reference time for the freshness check (defaults to `new Date()`).
 * @throws {Error} If validation fails or the manifest has expired.
 */
export function assertUniversalManifestV01Fresh(
  value: unknown,
  now: Date = new Date()
): asserts value is UniversalManifestV01 {
  assertUniversalManifestV01(value)

  const manifest = value as UniversalManifestV01
  const expiresMs = Date.parse(manifest.expiresAt)
  if (now.getTime() > expiresMs) throw new Error('Manifest expired')
}

function assertSignatureV02(sigValue: unknown): asserts sigValue is UmSignatureV02 {
  if (!sigValue || typeof sigValue !== 'object') throw new Error('Missing signature')
  const sig = sigValue as Record<string, unknown>

  if (sig.algorithm !== 'Ed25519') throw new Error('signature.algorithm must be Ed25519')
  if (sig.canonicalization !== 'JCS-RFC8785') {
    throw new Error('signature.canonicalization must be JCS-RFC8785')
  }

  if (typeof sig.value !== 'string' || sig.value.length === 0) throw new Error('Missing signature.value')

  if (sig.publicKeySpkiB64 !== undefined) {
    if (typeof sig.publicKeySpkiB64 !== 'string' || sig.publicKeySpkiB64.length === 0) {
      throw new Error('signature.publicKeySpkiB64 must be a non-empty string')
    }
  }
  if (sig.keyRef !== undefined) {
    if (typeof sig.keyRef !== 'string' || sig.keyRef.length === 0) {
      throw new Error('signature.keyRef must be a non-empty string')
    }
  }

  if (typeof sig.created === 'string' && sig.created.length > 0) {
    assertIsoDateTime(sig.created, 'signature.created')
  }

  if (sig.publicKeySpkiB64 === undefined && sig.keyRef === undefined) {
    throw new Error('signature must include keyRef or publicKeySpkiB64')
  }
}

function verifySignatureV02(manifest: UniversalManifestV02): void {
  const sig = manifest.signature

  if (!sig.publicKeySpkiB64) {
    throw new Error('Missing signature.publicKeySpkiB64 (key resolution is out of scope for this helper)')
  }

  const unsigned: Record<string, unknown> = { ...manifest }
  delete (unsigned as { signature?: unknown }).signature
  const payload = canonicalizeJson(unsigned)

  let publicKey
  try {
    publicKey = createPublicKey({
      key: Buffer.from(sig.publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki',
    })
  } catch {
    throw new Error('Invalid signature.publicKeySpkiB64 (expected base64 SPKI DER)')
  }

  const ok = verify(
    null,
    Buffer.from(payload, 'utf8'),
    publicKey,
    Buffer.from(sig.value, 'base64url')
  )

  if (!ok) throw new Error('Signature verification failed')
}

/**
 * Assert that `value` is a structurally valid v0.2 Universal Manifest.
 *
 * In addition to all v0.1 structural checks, v0.2 validation requires
 * `manifestVersion === "0.2"` and a valid Ed25519 signature. The signature is
 * verified using JCS (RFC 8785) canonicalization against the embedded
 * `publicKeySpkiB64`.
 *
 * @param value - The parsed JSON value to validate.
 * @throws {Error} If validation or signature verification fails.
 */
export function assertUniversalManifestV02(value: unknown): asserts value is UniversalManifestV02 {
  if (!value || typeof value !== 'object') throw new Error('Manifest must be an object')

  const obj = value as Record<string, unknown>

  if (!('@context' in obj)) throw new Error('Missing @context')
  if (typeof obj['@id'] !== 'string' || obj['@id'].length === 0) throw new Error('Missing @id')
  if (!jsonLdTypeIncludes(obj['@type'], 'um:Manifest')) {
    throw new Error('Missing um:Manifest in @type')
  }

  if (obj.manifestVersion !== '0.2') {
    throw new Error('manifestVersion must be 0.2')
  }
  if (typeof obj.subject !== 'string' || obj.subject.length === 0) throw new Error('Missing subject')
  assertIsoDateTime(obj.issuedAt, 'issuedAt')
  assertIsoDateTime(obj.expiresAt, 'expiresAt')

  if (Date.parse(obj.issuedAt) > Date.parse(obj.expiresAt)) {
    throw new Error('issuedAt must be <= expiresAt')
  }

  if (obj.facets !== undefined) {
    if (!Array.isArray(obj.facets)) throw new Error('facets must be an array')
    for (const facet of obj.facets) {
      if (!facet || typeof facet !== 'object') throw new Error('facet must be an object')
      const FacetObj = facet as Record<string, unknown>
      if (!jsonLdTypeIncludes(FacetObj['@type'], 'um:Facet')) {
        throw new Error('Missing um:Facet in facet @type')
      }
    }
  }

  assertSignatureV02(obj.signature)
  verifySignatureV02(obj as UniversalManifestV02)
}

/**
 * Assert that `value` is a valid **and unexpired** v0.2 Universal Manifest.
 *
 * Runs full structural + signature validation via
 * {@link assertUniversalManifestV02} then checks that the manifest has not
 * expired relative to `now`.
 *
 * @param value - The parsed JSON value to validate.
 * @param now   - Reference time for the freshness check (defaults to `new Date()`).
 * @throws {Error} If validation fails or the manifest has expired.
 */
export function assertUniversalManifestV02Fresh(
  value: unknown,
  now: Date = new Date()
): asserts value is UniversalManifestV02 {
  assertUniversalManifestV02(value)

  const manifest = value as UniversalManifestV02
  const expiresMs = Date.parse(manifest.expiresAt)
  if (now.getTime() > expiresMs) throw new Error('Manifest expired')
}

// =====================================================================
// v0.3 — Universal Manifest
//
// v0.3 carries forward v0.2 Signature Profile A (JCS-RFC8785 + Ed25519)
// unchanged and adds normative schemas for the structural arrays
// (claims, consents, pointers), encrypted facets via JWE inline profile,
// structured receipts, requiredTrustTier enforcement, identity.crossDidBinding
// claims, and um:agentDelegation pointers.
//
// Source of truth: /docs/W3C-STYLE-SPEC-v03.html
// Companion artifacts: /spec/v0.3/{schema.json,schema.jsonld,CONFORMANCE.md}
// =====================================================================

/**
 * Integer 0..3. Trust tier per v0.3 Section 6.4.2.
 *
 * - 0 — Signature-only (self-asserted).
 * - 1 — Attested / claimProof-backed.
 * - 2 — Cryptographic binding (ZKP). Marked "at risk" in v0.3.
 * - 3 — Multi-party ceremony. (Future: v0.4+.)
 */
export type UmTrustTier = 0 | 1 | 2 | 3

/**
 * Signature profile A for v0.3 manifests.
 *
 * Identical wire shape to v0.2: JCS-RFC8785 + Ed25519 with optional
 * `publicKeySpkiB64`, `created`, `statusRef`, and `revocationCursor` fields.
 * v0.3 normatively requires `keyRef` and (when both are present) byte-identical
 * consistency between `keyRef`-resolved key material and inline
 * `publicKeySpkiB64` to mitigate key-substitution attacks (Section 1.6.4).
 */
export interface UmSignatureV03 {
  algorithm: 'Ed25519'
  canonicalization: 'JCS-RFC8785'
  keyRef: string
  value: string
  publicKeySpkiB64?: string
  created?: string
  statusRef?: string
  revocationCursor?: string
  [key: string]: unknown
}

/**
 * Base claim shape for v0.3 manifests.
 *
 * `@type` and `issuer` are required per Section 1.4.3. Specialised claim types
 * (e.g., `identity.crossDidBinding`) extend this base.
 */
export interface UmClaimV03 {
  '@type': string
  issuer: string
  subject?: string
  issuedAt?: string
  expiresAt?: string
  claimProof?: Record<string, unknown> | string
  requiredTrustTier?: UmTrustTier
  [key: string]: unknown
}

/**
 * `identity.crossDidBinding` claim per v0.3 Section 6.4.4.
 *
 * Required fields: `@type`, `issuer`, `boundDids` (at least 2 entries),
 * `attester`, `attestationMethod`, `attestedAt`.
 */
export interface UmCrossDidBindingClaimV03 extends UmClaimV03 {
  '@type': 'identity.crossDidBinding'
  boundDids: string[]
  attester: string
  attestationMethod: string
  attestedAt: string
}

/**
 * Consent entry shape per v0.3 Section 1.4.4.
 *
 * Each consent entry MUST include `@id`, `@type: "um:Consent"`, `facetRef`
 * matching the governed facet's `@id`, `scope`, `purpose`, `grantedAt`, and
 * `expiresAt`. Optional fields: `grantor`, `withdrawnAt`, `conditions`.
 */
export interface UmConsentV03 {
  '@id': string
  '@type': 'um:Consent'
  facetRef: string
  scope: string[]
  purpose: string
  grantedAt: string
  expiresAt: string
  grantor?: string
  withdrawnAt?: string
  conditions?: string[]
  [key: string]: unknown
}

/**
 * Base pointer shape per v0.3 Section 1.4.5.
 *
 * Base pointers MUST contain `@type` and `target`. Type-specific pointers
 * (e.g., `um:agentDelegation`) MAY replace `target` with their own required
 * fields.
 */
export interface UmPointerV03 {
  '@type': string
  target?: string
  '@id'?: string
  label?: string
  createdAt?: string
  expiresAt?: string
  [key: string]: unknown
}

/**
 * `um:agentDelegation` pointer per v0.3 Section 6.5.1.
 */
export interface UmAgentDelegationPointerV03 extends UmPointerV03 {
  '@type': 'um:agentDelegation'
  delegateType: 'ai-agent' | 'bot' | 'proxy' | 'human-delegate'
  delegatedBy: string
  delegatedAt: string
  expiresAt: string
  delegateId?: string
  scope?: string[]
  livenessEndpoint?: string
}

/**
 * JWE JSON Serialization object used as a facet `entity` value when
 * `encryptionProfile: "jwe-inline-v1"` is declared per v0.3 Section 2.3.2.
 */
export interface UmJweEntityV03 {
  protected: string
  recipients: Array<{
    header: { kid: string; [key: string]: unknown }
    encrypted_key?: string
    [key: string]: unknown
  }>
  iv: string
  ciphertext: string
  tag: string
  previousKid?: string
  rotationReason?: string
  revokedRecipientKid?: string
  revocationAction?: string
  [key: string]: unknown
}

/**
 * Facet shape per v0.3 Section 2.1 (plaintext) and Section 2.3 (encrypted).
 *
 * v0.3 requires `@id` to be present on every facet (Section 2.1) — consent
 * matching and receipt facet-status recording both key off `facets[].@id`.
 */
export interface UmFacetV03 {
  '@id': string
  '@type': JsonLdType
  name?: string
  description?: string
  ref?: string
  requiredTrustTier?: UmTrustTier
  encryptionProfile?: 'jwe-inline-v1'
  entity?: UmEntityV01 | UmJweEntityV03 | Record<string, unknown> | string | null
  [key: string]: unknown
}

/**
 * A Universal Manifest document (v0.3).
 *
 * v0.3 conformant manifests:
 * - declare `manifestVersion: "0.3"`,
 * - include `https://universalmanifest.net/ns/v0.3` in `@context`,
 * - carry a Signature Profile A signature (JCS-RFC8785 + Ed25519),
 * - MAY include the structural arrays `facets`, `claims`, `consents`,
 *   `devices`, and `pointers`, with v0.3-normative schemas applied,
 * - MAY declare a manifest-level `requiredTrustTier` in 0..3.
 */
export interface UniversalManifestV03 {
  '@context': JsonLdContext
  '@id': string
  '@type': JsonLdType

  manifestVersion: '0.3'
  subject: string
  issuedAt: string
  expiresAt: string

  requiredTrustTier?: UmTrustTier
  facets?: UmFacetV03[]
  claims?: UmClaimV03[]
  consents?: UmConsentV03[]
  devices?: Array<Record<string, unknown>>
  pointers?: UmPointerV03[]
  signature: UmSignatureV03

  [key: string]: unknown
}

function isTrustTier(value: unknown): value is UmTrustTier {
  return value === 0 || value === 1 || value === 2 || value === 3
}

function assertOptionalTrustTier(value: unknown, fieldName: string): void {
  if (value === undefined) return
  if (!isTrustTier(value)) {
    throw new Error(`${fieldName} must be an integer in 0..3`)
  }
}

function assertJweEntity(entity: unknown, facetId: string): asserts entity is UmJweEntityV03 {
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
    throw new Error(`Encrypted facet ${facetId}: entity must be a JWE JSON Serialization object`)
  }
  const jwe = entity as Record<string, unknown>
  for (const required of ['protected', 'iv', 'ciphertext', 'tag'] as const) {
    if (typeof jwe[required] !== 'string' || (jwe[required] as string).length === 0) {
      throw new Error(`Encrypted facet ${facetId}: missing JWE field ${required}`)
    }
  }
  if (!Array.isArray(jwe.recipients)) {
    throw new Error(`Encrypted facet ${facetId}: recipients must be an array`)
  }
  for (const recipient of jwe.recipients) {
    if (!recipient || typeof recipient !== 'object') {
      throw new Error(`Encrypted facet ${facetId}: recipient must be an object`)
    }
    const header = (recipient as Record<string, unknown>).header as Record<string, unknown> | undefined
    if (!header || typeof header !== 'object') {
      throw new Error(`Encrypted facet ${facetId}: recipient missing header`)
    }
    if (typeof header.kid !== 'string' || header.kid.length === 0) {
      throw new Error(`Encrypted facet ${facetId}: recipient.header.kid must be a non-empty string`)
    }
  }
}

function assertFacetV03(facet: unknown): asserts facet is UmFacetV03 {
  if (!facet || typeof facet !== 'object') throw new Error('facet must be an object')
  const obj = facet as Record<string, unknown>
  if (typeof obj['@id'] !== 'string' || obj['@id'].length === 0) {
    throw new Error('v0.3 facet must include @id')
  }
  if (!jsonLdTypeIncludes(obj['@type'], 'um:Facet')) {
    throw new Error('Missing um:Facet in facet @type')
  }
  assertOptionalTrustTier(obj.requiredTrustTier, 'facet.requiredTrustTier')

  const encryptionProfile = obj.encryptionProfile
  if (encryptionProfile !== undefined) {
    if (encryptionProfile !== 'jwe-inline-v1') {
      throw new Error('facet.encryptionProfile must be "jwe-inline-v1" when present')
    }
    assertJweEntity(obj.entity, obj['@id'])
  }
}

function assertClaimV03(claim: unknown): asserts claim is UmClaimV03 {
  if (!claim || typeof claim !== 'object') throw new Error('claim must be an object')
  const obj = claim as Record<string, unknown>
  if (typeof obj['@type'] !== 'string' || obj['@type'].length === 0) {
    throw new Error('claim missing @type')
  }
  if (typeof obj.issuer !== 'string' || obj.issuer.length === 0) {
    throw new Error('claim missing issuer')
  }
  assertOptionalTrustTier(obj.requiredTrustTier, 'claim.requiredTrustTier')

  if (typeof obj.issuedAt === 'string') assertIsoDateTime(obj.issuedAt, 'claim.issuedAt')
  if (typeof obj.expiresAt === 'string') assertIsoDateTime(obj.expiresAt, 'claim.expiresAt')

  if (obj['@type'] === 'identity.crossDidBinding') {
    if (!Array.isArray(obj.boundDids) || obj.boundDids.length < 2) {
      throw new Error('identity.crossDidBinding claim must contain at least 2 boundDids')
    }
    for (const did of obj.boundDids) {
      if (typeof did !== 'string' || did.length === 0) {
        throw new Error('identity.crossDidBinding boundDids entries must be non-empty strings')
      }
    }
    if (typeof obj.attester !== 'string' || obj.attester.length === 0) {
      throw new Error('identity.crossDidBinding claim missing attester')
    }
    if (typeof obj.attestationMethod !== 'string' || obj.attestationMethod.length === 0) {
      throw new Error('identity.crossDidBinding claim missing attestationMethod')
    }
    if (typeof obj.attestedAt !== 'string' || obj.attestedAt.length === 0) {
      throw new Error('identity.crossDidBinding claim missing attestedAt')
    }
    assertIsoDateTime(obj.attestedAt, 'claim.attestedAt')
  }
}

function assertConsentV03(consent: unknown): asserts consent is UmConsentV03 {
  if (!consent || typeof consent !== 'object') throw new Error('consent must be an object')
  const obj = consent as Record<string, unknown>
  if (typeof obj['@id'] !== 'string' || obj['@id'].length === 0) {
    throw new Error('consent missing @id')
  }
  if (obj['@type'] !== 'um:Consent') {
    throw new Error('consent @type must be "um:Consent"')
  }
  if (typeof obj.facetRef !== 'string' || obj.facetRef.length === 0) {
    throw new Error('consent missing facetRef')
  }
  if (!Array.isArray(obj.scope) || obj.scope.length === 0) {
    throw new Error('consent.scope must be a non-empty array of strings')
  }
  for (const scope of obj.scope) {
    if (typeof scope !== 'string' || scope.length === 0) {
      throw new Error('consent.scope entries must be non-empty strings')
    }
  }
  if (typeof obj.purpose !== 'string' || obj.purpose.length === 0) {
    throw new Error('consent missing purpose')
  }
  assertIsoDateTime(obj.grantedAt, 'consent.grantedAt')
  assertIsoDateTime(obj.expiresAt, 'consent.expiresAt')
  if (obj.withdrawnAt !== undefined) {
    assertIsoDateTime(obj.withdrawnAt, 'consent.withdrawnAt')
  }
}

function assertPointerV03(pointer: unknown): asserts pointer is UmPointerV03 {
  if (!pointer || typeof pointer !== 'object') throw new Error('pointer must be an object')
  const obj = pointer as Record<string, unknown>
  if (typeof obj['@type'] !== 'string' || obj['@type'].length === 0) {
    throw new Error('pointer missing @type')
  }

  if (obj['@type'] === 'um:agentDelegation') {
    const validDelegateTypes = ['ai-agent', 'bot', 'proxy', 'human-delegate']
    if (!validDelegateTypes.includes(obj.delegateType as string)) {
      throw new Error(
        'um:agentDelegation pointer must have delegateType in ai-agent|bot|proxy|human-delegate'
      )
    }
    if (typeof obj.delegatedBy !== 'string' || obj.delegatedBy.length === 0) {
      throw new Error('um:agentDelegation pointer missing delegatedBy')
    }
    assertIsoDateTime(obj.delegatedAt, 'pointer.delegatedAt')
    assertIsoDateTime(obj.expiresAt, 'pointer.expiresAt')
  } else {
    // Base pointer types require target.
    if (typeof obj.target !== 'string' || obj.target.length === 0) {
      throw new Error(`pointer of type ${obj['@type']} missing required target`)
    }
  }
  if (obj.createdAt !== undefined) {
    assertIsoDateTime(obj.createdAt, 'pointer.createdAt')
  }
  if (obj['@type'] !== 'um:agentDelegation' && obj.expiresAt !== undefined) {
    assertIsoDateTime(obj.expiresAt, 'pointer.expiresAt')
  }
}

function assertSignatureV03(sigValue: unknown): asserts sigValue is UmSignatureV03 {
  if (!sigValue || typeof sigValue !== 'object') throw new Error('Missing signature')
  const sig = sigValue as Record<string, unknown>

  if (sig.algorithm !== 'Ed25519') throw new Error('signature.algorithm must be Ed25519')
  if (sig.canonicalization !== 'JCS-RFC8785') {
    throw new Error('signature.canonicalization must be JCS-RFC8785')
  }
  if (typeof sig.keyRef !== 'string' || sig.keyRef.length === 0) {
    throw new Error('signature.keyRef must be a non-empty string (v0.3 Section 1.6.2)')
  }
  if (typeof sig.value !== 'string' || sig.value.length === 0) {
    throw new Error('Missing signature.value')
  }

  if (sig.publicKeySpkiB64 !== undefined) {
    if (typeof sig.publicKeySpkiB64 !== 'string' || sig.publicKeySpkiB64.length === 0) {
      throw new Error('signature.publicKeySpkiB64 must be a non-empty string')
    }
  }
  if (typeof sig.created === 'string' && sig.created.length > 0) {
    assertIsoDateTime(sig.created, 'signature.created')
  }
}

function verifySignatureV03(manifest: UniversalManifestV03): void {
  const sig = manifest.signature

  if (!sig.publicKeySpkiB64) {
    throw new Error('Missing signature.publicKeySpkiB64 (key resolution is out of scope for this helper)')
  }

  const unsigned: Record<string, unknown> = { ...manifest }
  delete (unsigned as { signature?: unknown }).signature
  const payload = canonicalizeJson(unsigned)

  let publicKey
  try {
    publicKey = createPublicKey({
      key: Buffer.from(sig.publicKeySpkiB64, 'base64'),
      format: 'der',
      type: 'spki',
    })
  } catch {
    throw new Error('Invalid signature.publicKeySpkiB64 (expected base64 SPKI DER)')
  }

  const ok = verify(
    null,
    Buffer.from(payload, 'utf8'),
    publicKey,
    Buffer.from(sig.value, 'base64url')
  )

  if (!ok) throw new Error('Signature verification failed')
}

/**
 * Assert that `value` is a structurally valid v0.3 Universal Manifest.
 *
 * Validation covers the v0.2 baseline (envelope, signature profile A,
 * Ed25519 verification over JCS-canonical bytes) plus the v0.3 normative
 * additions: claim/consent/pointer/facet schemas, `requiredTrustTier` ranges,
 * JWE inline encrypted facet structural shape, `identity.crossDidBinding`
 * claim requirements, and `um:agentDelegation` pointer requirements.
 *
 * Per v0.3 Section 1.4.4, when the `consents` array is empty or absent the
 * evaluator MUST treat all facets as lacking consent unless an external
 * consent model applies. This structural validator does NOT enforce that
 * runtime semantic — see {@link evaluateUniversalManifestV03} for the full
 * six-stage evaluation including Consent stage behaviour.
 *
 * @param value - The parsed JSON value to validate.
 * @throws {Error} If structural validation or signature verification fails.
 */
export function assertUniversalManifestV03(value: unknown): asserts value is UniversalManifestV03 {
  if (!value || typeof value !== 'object') throw new Error('Manifest must be an object')

  const obj = value as Record<string, unknown>

  if (!('@context' in obj)) throw new Error('Missing @context')
  if (typeof obj['@id'] !== 'string' || obj['@id'].length === 0) throw new Error('Missing @id')
  if (!jsonLdTypeIncludes(obj['@type'], 'um:Manifest')) {
    throw new Error('Missing um:Manifest in @type')
  }

  if (obj.manifestVersion !== '0.3') {
    throw new Error('manifestVersion must be 0.3')
  }
  if (typeof obj.subject !== 'string' || obj.subject.length === 0) throw new Error('Missing subject')
  assertIsoDateTime(obj.issuedAt, 'issuedAt')
  assertIsoDateTime(obj.expiresAt, 'expiresAt')

  if (Date.parse(obj.issuedAt) > Date.parse(obj.expiresAt)) {
    throw new Error('issuedAt must be <= expiresAt')
  }

  assertOptionalTrustTier(obj.requiredTrustTier, 'requiredTrustTier')

  if (obj.facets !== undefined) {
    if (!Array.isArray(obj.facets)) throw new Error('facets must be an array')
    for (const facet of obj.facets) assertFacetV03(facet)
  }

  if (obj.claims !== undefined) {
    if (!Array.isArray(obj.claims)) throw new Error('claims must be an array')
    for (const claim of obj.claims) assertClaimV03(claim)
  }

  if (obj.consents !== undefined) {
    if (!Array.isArray(obj.consents)) throw new Error('consents must be an array')
    for (const consent of obj.consents) assertConsentV03(consent)
  }

  if (obj.pointers !== undefined) {
    if (!Array.isArray(obj.pointers)) throw new Error('pointers must be an array')
    for (const pointer of obj.pointers) assertPointerV03(pointer)
  }

  if (obj.devices !== undefined && !Array.isArray(obj.devices)) {
    // v0.3 Section 1.4.6: evaluators MUST accept and preserve a devices array
    // but MUST NOT assign semantic meaning to its contents. The structural
    // expectation is that it is an array; entry shape is reserved.
    throw new Error('devices must be an array (reserved per v0.3 Section 1.4.6)')
  }

  // Cross-claim invariants: claim/facet requiredTrustTier MUST NOT lower the
  // manifest-level floor (Section 6.4.5: floors raise only).
  const manifestTier = (obj.requiredTrustTier as UmTrustTier | undefined) ?? 0
  if (Array.isArray(obj.claims)) {
    for (const claim of obj.claims) {
      const claimTier = (claim as { requiredTrustTier?: UmTrustTier }).requiredTrustTier
      if (claimTier !== undefined && claimTier < manifestTier) {
        throw new Error(
          'claim.requiredTrustTier cannot be lower than manifest.requiredTrustTier (Section 6.4.5)'
        )
      }
    }
  }
  if (Array.isArray(obj.facets)) {
    for (const facet of obj.facets) {
      const facetTier = (facet as { requiredTrustTier?: UmTrustTier }).requiredTrustTier
      if (facetTier !== undefined && facetTier < manifestTier) {
        throw new Error(
          'facet.requiredTrustTier cannot be lower than manifest.requiredTrustTier (Section 6.4.5)'
        )
      }
    }
  }

  // agentDelegation: delegatedBy MUST match the manifest subject (Section 6.5.1).
  if (Array.isArray(obj.pointers)) {
    const subject = obj.subject as string
    for (const pointer of obj.pointers) {
      const p = pointer as Record<string, unknown>
      if (p['@type'] === 'um:agentDelegation' && p.delegatedBy !== subject) {
        throw new Error(
          'um:agentDelegation.delegatedBy must match the manifest subject (Section 6.5.1)'
        )
      }
    }
  }

  assertSignatureV03(obj.signature)
  verifySignatureV03(obj as UniversalManifestV03)
}

/**
 * Assert that `value` is a valid **and unexpired** v0.3 Universal Manifest.
 *
 * Runs full structural + signature validation via
 * {@link assertUniversalManifestV03}, then checks that the manifest has not
 * expired relative to `now`, applying the v0.3 60-second clock-skew tolerance
 * for `issuedAt` (Section 3.1.2).
 *
 * @param value - The parsed JSON value to validate.
 * @param now   - Reference time for freshness checks (defaults to `new Date()`).
 * @throws {Error} If validation fails or freshness checks reject the manifest.
 */
export function assertUniversalManifestV03Fresh(
  value: unknown,
  now: Date = new Date()
): asserts value is UniversalManifestV03 {
  assertUniversalManifestV03(value)

  const manifest = value as UniversalManifestV03
  const expiresMs = Date.parse(manifest.expiresAt)
  const issuedMs = Date.parse(manifest.issuedAt)
  const nowMs = now.getTime()
  const SKEW_MS = 60_000

  if (nowMs > expiresMs) throw new Error('Manifest expired')
  if (issuedMs - nowMs > SKEW_MS) {
    throw new Error('Manifest issuedAt is more than 60s in the future (stale)')
  }
}

// =====================================================================
// v0.3 — Structured receipts (Section 3.3)
// =====================================================================

/** Receipt outcome categories per v0.3 Section 3.1.5. */
export type UmReceiptOutcome =
  | 'accepted'
  | 'accepted-with-warnings'
  | 'accepted-partial'
  | 'rejected'

/**
 * Signature verification result per v0.3 Section 3.3.1 / v0.4 Base Section 3.3.1.
 * `'not-evaluated'` records a stage not reached (v0.4: a manifest rejected during
 * Arrive terminates before the signature check).
 */
export type UmSignatureCheck = 'valid' | 'invalid' | 'unsupported-profile' | 'not-evaluated'

/**
 * Freshness check result per v0.3 Section 3.3.1 / v0.4 Base Section 3.3.1.
 * `'stale'` records `issuedAt` in the future beyond clock-skew tolerance;
 * `'not-evaluated'` records a stage not reached.
 */
export type UmFreshnessCheck = 'fresh' | 'expired' | 'stale' | 'not-evaluated'

/** Per-facet status taxonomy per v0.3 Section 3.3.1. */
export type UmFacetStatusValue =
  | 'processed'
  | 'opaque'
  | 'consent-denied'
  | 'consent-missing'
  | 'not-projected'
  | 'trustTierUnsupported'
  | 'assuranceInsufficient'
  | 'written'

/**
 * Per-consent status taxonomy per v0.4 Base Section 3.1.4 / Section 3.3.1.
 * Denial statuses map consent-evaluation outcomes onto the receipt:
 * `scope-mismatch` / `purpose-mismatch` / `condition-violated` accompany the
 * facet status `consent-denied`, as do `expired` / `withdrawn`.
 */
export type UmConsentStatusValue =
  | 'valid'
  | 'scope-mismatch'
  | 'purpose-mismatch'
  | 'condition-violated'
  | 'expired'
  | 'withdrawn'

/** Revocation status reporting per v0.4 Base Section 3.3.1 / EXT-OPT Section O2.3 (v0.3 Section 1.6.6). */
export type UmRevocationStatus = 'active' | 'revoked' | 'suspended' | 'unchecked'

/** Holder-binding receipt status per EXT-T1 Section T1.1. */
export type UmHolderBindingStatus = 'verified' | 'failed' | 'unsupported-mode' | 'absent'

/** Presentation-proof receipt status per EXT-T1 Section T1.2. */
export type UmPresentationProofStatus = 'verified' | 'failed' | 'missing-required' | 'absent'

/** Per-claim receipt status per v0.4 Base Section 3.3.1. */
export type UmClaimStatusValue =
  | 'verified'
  | 'unverified'
  | 'failed'
  | 'unprocessable'
  | 'trustTierUnsupported'

/** Per-claim receipt status entry per v0.4 Base Section 3.3.1. */
export interface UmReceiptClaimStatus {
  claimRef: string
  status: UmClaimStatusValue
  tier?: UmTrustTier
  reason?: string
}

/** Liveness receipt echo per EXT-T1 Section T1.3: freshness class plus the attestation's method/userVerified copies. */
export interface UmReceiptLivenessStatus {
  freshnessClass: UmLivenessFreshnessClass
  method?: string
  userVerified?: boolean
}

/** A structural entry preserved but not acted on (v0.4 Base Section 3.3.1, Section 1.4.5). */
export interface UmReceiptUnprocessedEntry {
  kind: string
  type: string
  ref?: string
}

/** Per-facet receipt status entry. */
export interface UmReceiptFacetStatus {
  facetId: string
  status: UmFacetStatusValue
  name?: string
  reason?: string
  assuranceStatus?: {
    assertedClass: UmAssuranceClass
    met: boolean
  }
}

/** Per-consent receipt status entry. */
export interface UmReceiptConsentStatus {
  facetId: string
  consentRef: string
  status: UmConsentStatusValue
  checkedAt: string
}

/**
 * A receipt warning entry per v0.4 Base Section 3.3.1: each warning carries a
 * registry `code` and a human-readable `message`. Codes follow the structured
 * reason registry's `um:reason:<category>:<code>` naming (EXT-OPT Section
 * O3.3); codes not yet in the registry are registration candidates carried as
 * shipped wire precedent. Normative citations belong in `message`, never as
 * RFC 2119 keyword text asserted by the runtime string itself.
 */
export interface UmReceiptWarning {
  code: string
  message: string
}

/** Structured receipt object per v0.3 Section 3.3 / v0.4 Base Section 3.3. */
interface UmReceiptFields<Resolution extends string, ProofStatus extends string> {
  '@type': string | string[]
  manifestId: string
  outcome: UmReceiptOutcome
  signatureCheck: UmSignatureCheck
  freshnessCheck: UmFreshnessCheck
  facetStatuses: UmReceiptFacetStatus[]
  revocationStatus?: UmRevocationStatus
  consentStatuses?: UmReceiptConsentStatus[]
  /** Per-claim status entries (v0.4 Base Section 3.3.1). */
  claimStatuses?: UmReceiptClaimStatus[]
  /** Structural entries preserved but not acted on (v0.4 Base Section 3.3.1). */
  unprocessedEntries?: UmReceiptUnprocessedEntry[]
  processedAt?: string
  warnings?: UmReceiptWarning[]
  receiptId?: string
  evaluatorId?: string
  receiptSignature?: UmSignatureV03
  /**
   * Whether `signature.keyRef` was resolved to key material, per v0.4 Base
   * Section 1.6.4 / Section 3.3.1. `'unresolved'` caps `keyRef`-derived
   * identity assurance at Tier 0 (verification used the embedded
   * `publicKeySpkiB64` without confirming the `keyRef` binding).
   */
  keyRefResolution?: Resolution
  /** Credential-binding status fields (v0.4 Base Section 3.3.1.1; EXT-T1). */
  holderBindingStatus?: UmHolderBindingStatus
  presentationProofStatus?: ProofStatus
  livenessStatus?: UmReceiptLivenessStatus
  /** Highest trust tier actually verified for relied-upon claims (v0.4 Base Section 3.3.1.1). */
  effectiveTrustTier?: UmTrustTier
  events?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface UmReceiptV03 extends UmReceiptFields<'resolved' | 'unresolved', UmPresentationProofStatus> {}
export type UmKeyRefResolutionV05 = 'resolved' | 'unresolved' | 'not-attempted'
export type UmPresentationProofStatusV05 = 'verified' | 'failed' | 'absent' | 'not-evaluated'
export interface UmReceiptV05 extends UmReceiptFields<UmKeyRefResolutionV05, UmPresentationProofStatusV05> {}
type CurrentReceipt = UmReceiptFields<UmKeyRefResolutionV05, UmPresentationProofStatus | 'not-evaluated'>

/**
 * Assert that `value` is a structurally valid v0.3 receipt per Section 3.3.
 *
 * Required: `@type` includes `um:Receipt`, `manifestId`, `outcome`,
 * `signatureCheck`, `freshnessCheck`, and `facetStatuses` (which MUST be
 * an array; empty array allowed when the manifest contains zero facets).
 *
 * @throws {Error} If the receipt fails structural validation.
 */
export function assertReceiptV03(value: unknown): asserts value is UmReceiptV03 {
  if (!value || typeof value !== 'object') throw new Error('Receipt must be an object')
  const obj = value as Record<string, unknown>

  if (!jsonLdTypeIncludes(obj['@type'], 'um:Receipt')) {
    throw new Error('Receipt @type must include um:Receipt')
  }
  if (typeof obj.manifestId !== 'string' || obj.manifestId.length === 0) {
    throw new Error('Receipt missing manifestId')
  }

  const validOutcomes: UmReceiptOutcome[] = [
    'accepted',
    'accepted-with-warnings',
    'accepted-partial',
    'rejected',
  ]
  if (!validOutcomes.includes(obj.outcome as UmReceiptOutcome)) {
    throw new Error(
      'Receipt outcome must be one of accepted|accepted-with-warnings|accepted-partial|rejected'
    )
  }

  const validSignatureChecks: UmSignatureCheck[] = [
    'valid',
    'invalid',
    'unsupported-profile',
    'not-evaluated',
  ]
  if (!validSignatureChecks.includes(obj.signatureCheck as UmSignatureCheck)) {
    throw new Error('Receipt signatureCheck must be one of valid|invalid|unsupported-profile|not-evaluated')
  }

  const validFreshnessChecks: UmFreshnessCheck[] = ['fresh', 'expired', 'stale', 'not-evaluated']
  if (!validFreshnessChecks.includes(obj.freshnessCheck as UmFreshnessCheck)) {
    throw new Error('Receipt freshnessCheck must be one of fresh|expired|stale|not-evaluated')
  }

  if (!Array.isArray(obj.facetStatuses)) {
    throw new Error('Receipt facetStatuses must be an array')
  }
  const validFacetStatuses: UmFacetStatusValue[] = [
    'processed',
    'opaque',
    'consent-denied',
    'consent-missing',
    'not-projected',
    'trustTierUnsupported',
    'assuranceInsufficient',
    'written',
  ]
  for (const entry of obj.facetStatuses) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Receipt facetStatuses entries must be objects')
    }
    const e = entry as Record<string, unknown>
    if (typeof e.facetId !== 'string' || e.facetId.length === 0) {
      throw new Error('Receipt facetStatuses entry missing facetId')
    }
    if (!validFacetStatuses.includes(e.status as UmFacetStatusValue)) {
      throw new Error(`Receipt facetStatuses entry has invalid status: ${String(e.status)}`)
    }
  }

  if (obj.events !== undefined) {
    assertPrivateDataEventsV04(obj.events, 'Receipt events')
  }
}

// =====================================================================
// v0.3 — Six-stage evaluation sequence (Section 3.1)
// =====================================================================

/**
 * Operation an evaluator intends to perform against a facet. Used by the
 * Consent stage to validate against `consents[].scope`.
 */
export interface UmEvaluationContext {
  /** ISO 8601 date-time the evaluator considers "now" — defaults to `new Date()`. */
  now?: Date
  /** Intended operations to check against each facet's consent scope. */
  intendedScope?: string[]
  /** Intended purpose to check against each facet's consent purpose. */
  intendedPurpose?: string
  /** Optional list of facet IDs/types the evaluator can decrypt. Used to keep encrypted facets that lack a decryption key as sealed entries. */
  decryptableFacetIds?: string[]
  /** Highest trust tier the evaluator can verify. Lower-tier evaluators record `trustTierUnsupported` for higher floors. */
  maxSupportedTrustTier?: UmTrustTier
  /** Optional identifier recorded in the receipt's `evaluatorId`. */
  evaluatorId?: string
  /** When true, omit `processedAt` from the produced receipt (useful for fixture-based diffing). */
  omitProcessedAt?: boolean
  /** When `signature.statusRef` is present, the resolver function MAY return a non-`unchecked` status. Defaults to `unchecked`. */
  resolveRevocation?: (statusRef: string, cursor?: string) => UmRevocationStatus
}

/** Result of {@link evaluateUniversalManifestV03}. */
export interface UmEvaluationResult {
  receipt: UmReceiptV03
  manifest?: UniversalManifestV03
}

function nowIso(now: Date | undefined): string {
  return (now ?? new Date()).toISOString()
}

/**
 * Evaluate a Universal Manifest through the v0.3 six-stage sequence:
 * Arrive → Verify → Project → Consent → Compose → Receipt.
 *
 * This is the reference implementation of the v0.3 evaluation contract per
 * Section 3.1. It always returns a structured receipt, regardless of whether
 * the manifest was accepted, partially accepted, or rejected. The receipt is
 * the canonical evidence that the evaluator did what v0.3 obliges it to do.
 *
 * Notes on consent semantics:
 * - Facets with a matching consent entry whose scope/purpose/expiry pass
 *   become `processed`.
 * - Facets with a matching consent entry that is expired or `withdrawnAt` is
 *   set become `consent-denied`.
 * - Facets without any matching consent entry become `consent-missing`
 *   (Section 1.4.4).
 * - When the manifest's `consents` array is empty or absent, all facets are
 *   recorded as `consent-missing` unless the evaluator opts to treat them
 *   under an external consent model — that decision is out of scope for the
 *   reference implementation.
 *
 * Notes on trust-tier handling:
 * - When `requiredTrustTier` exceeds `context.maxSupportedTrustTier`, the
 *   facet (or manifest) is recorded as `trustTierUnsupported` and outcome is
 *   degraded to `accepted-partial` or `rejected` per Section 6.4.5.
 */
export function evaluateUniversalManifestV03(
  value: unknown,
  context: UmEvaluationContext = {}
): UmEvaluationResult {
  const now = context.now ?? new Date()
  const warnings: UmReceiptWarning[] = []

  // Stage 1: Arrive — minimal structural parse so we can produce a receipt
  // even for malformed payloads.
  if (!value || typeof value !== 'object') {
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId: '',
        outcome: 'rejected',
        signatureCheck: 'invalid',
        freshnessCheck: 'expired',
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          { code: 'um:reason:structure:malformed', message: 'Arrive stage: value is not an object' },
        ],
      },
    }
  }

  const obj = value as Record<string, unknown>
  const manifestId = typeof obj['@id'] === 'string' ? obj['@id'] : ''

  // Stage 2: Verify — full structural + signature + freshness checks.
  let signatureCheck: UmSignatureCheck = 'invalid'
  let freshnessCheck: UmFreshnessCheck = 'expired'
  try {
    assertUniversalManifestV03(value)
    signatureCheck = 'valid'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('signature.algorithm') ||
      message.includes('signature.canonicalization')
    ) {
      signatureCheck = 'unsupported-profile'
    }
    const verifyFailureCode =
      signatureCheck === 'unsupported-profile'
        ? 'um:reason:crypto:unsupported-profile'
        : message.includes('Signature verification failed')
          ? 'um:reason:crypto:signature-invalid'
          : 'um:reason:structure:malformed'
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck,
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [{ code: verifyFailureCode, message: `Verify stage: ${message}` }],
      },
    }
  }

  const manifest = value as UniversalManifestV03

  const issuedMs = Date.parse(manifest.issuedAt)
  const expiresMs = Date.parse(manifest.expiresAt)
  const nowMs = now.getTime()
  const SKEW_MS = 60_000
  if (issuedMs - nowMs > SKEW_MS) {
    freshnessCheck = 'stale'
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck,
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          { code: 'um:reason:freshness:stale', message: 'Verify stage: issuedAt more than 60s in the future' },
        ],
      },
      manifest,
    }
  }
  if (nowMs > expiresMs) {
    freshnessCheck = 'expired'
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck,
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          { code: 'um:reason:freshness:expired', message: 'Verify stage: manifest expired' },
        ],
      },
      manifest,
    }
  }
  freshnessCheck = 'fresh'

  // Revocation status (informational; outcome impact depends on policy).
  let revocationStatus: UmRevocationStatus = 'unchecked'
  if (manifest.signature.statusRef) {
    if (context.resolveRevocation) {
      revocationStatus = context.resolveRevocation(
        manifest.signature.statusRef,
        manifest.signature.revocationCursor
      )
      if (revocationStatus === 'revoked') {
        return {
          receipt: {
            '@type': 'um:Receipt',
            manifestId,
            outcome: 'rejected',
            signatureCheck,
            freshnessCheck,
            facetStatuses: [],
            revocationStatus,
            ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
            warnings: [
              { code: 'um:reason:status:revoked', message: 'Verify stage: signature is revoked' },
            ],
          },
          manifest,
        }
      }
    } else {
      revocationStatus = 'unchecked'
      warnings.push({
        code: 'um:reason:status:unchecked',
        message:
          'Verify stage: signature.statusRef present but evaluator does not implement revocation resolution',
      })
    }
  }

  // Stage 3: Project — for the reference evaluator, the projected set is the
  // facets present in the manifest. Real evaluators may filter by deployment
  // context; that is out of scope here.
  const projectedFacets = Array.isArray(manifest.facets) ? manifest.facets : []

  // Trust-tier floors.
  const manifestTier = manifest.requiredTrustTier ?? 0
  const maxSupportedTier = context.maxSupportedTrustTier ?? 0

  // If the manifest-level requiredTrustTier exceeds what the evaluator can
  // verify, the entire manifest is unsupported. The compose outcome MUST be
  // 'rejected' if the unsupported tier applies at the manifest level.
  // (Section 6.4.5.)
  if (manifestTier > maxSupportedTier) {
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck,
        revocationStatus,
        facetStatuses: projectedFacets.map((facet) => ({
          facetId: facet['@id'],
          name: facet.name,
          status: 'trustTierUnsupported' as UmFacetStatusValue,
          reason: `manifest requiredTrustTier ${manifestTier} exceeds evaluator capability ${maxSupportedTier}`,
        })),
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          {
            code: 'um:reason:trust:tier-unsupported',
            message: `Compose stage: manifest-level requiredTrustTier ${manifestTier} exceeds evaluator capability ${maxSupportedTier}`,
          },
          ...warnings,
        ],
      },
      manifest,
    }
  }

  // Stage 4: Consent
  const consents = Array.isArray(manifest.consents) ? manifest.consents : []
  const facetStatuses: UmReceiptFacetStatus[] = []
  const consentStatuses: UmReceiptConsentStatus[] = []
  const decryptableSet = new Set(context.decryptableFacetIds ?? [])

  for (const facet of projectedFacets) {
    const facetId = facet['@id']
    const facetTier = Math.max(manifestTier, facet.requiredTrustTier ?? 0)

    if (facetTier > maxSupportedTier) {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'trustTierUnsupported',
        reason: `facet requiredTrustTier ${facetTier} exceeds evaluator capability ${maxSupportedTier}`,
      })
      continue
    }

    // Encrypted facet without decryption key → sealed entry → opaque.
    if (facet.encryptionProfile === 'jwe-inline-v1' && !decryptableSet.has(facetId)) {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'opaque',
        reason: 'no decryption key',
      })
      continue
    }

    const matchingConsents = consents.filter((c) => c.facetRef === facetId)
    if (matchingConsents.length === 0) {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'consent-missing',
        reason: 'no matching consent entry',
      })
      continue
    }

    let allValid = true
    let denialReason: string | undefined
    for (const consent of matchingConsents) {
      let status: UmConsentStatusValue = 'valid'
      if (consent.withdrawnAt) {
        status = 'withdrawn'
        allValid = false
        denialReason = 'consent withdrawn'
      } else if (Date.parse(consent.expiresAt) < nowMs) {
        status = 'expired'
        allValid = false
        denialReason = 'consent expired'
      } else if (
        context.intendedScope &&
        context.intendedScope.length > 0 &&
        !context.intendedScope.every((op) => consent.scope.includes(op))
      ) {
        status = 'valid'
        // Scope mismatch is a denial reason but we still record consent as
        // valid for record-keeping (it just doesn't authorize the requested
        // operation).
        allValid = false
        denialReason = 'consent scope does not cover intended operation'
      } else if (context.intendedPurpose && consent.purpose !== context.intendedPurpose) {
        allValid = false
        denialReason = 'consent purpose does not match intended purpose'
      }
      consentStatuses.push({
        facetId,
        consentRef: consent['@id'],
        status,
        checkedAt: nowIso(now),
      })
    }

    if (allValid) {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'processed',
      })
    } else {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'consent-denied',
        reason: denialReason ?? 'consent check failed',
      })
    }
  }

  // Stage 5: Compose
  let outcome: UmReceiptOutcome = 'accepted'
  const hasFailed = facetStatuses.some((f) =>
    f.status === 'consent-denied' || f.status === 'trustTierUnsupported'
  )
  const hasSealed = facetStatuses.some((f) =>
    f.status === 'opaque' || f.status === 'consent-missing'
  )
  if (hasFailed) outcome = 'accepted-partial'
  else if (hasSealed) outcome = 'accepted-partial'
  if (revocationStatus === 'unchecked' && manifest.signature.statusRef) {
    if (outcome === 'accepted') outcome = 'accepted-with-warnings'
  }

  // Stage 6: Receipt
  const receipt: UmReceiptV03 = {
    '@type': 'um:Receipt',
    manifestId,
    outcome,
    signatureCheck,
    freshnessCheck,
    revocationStatus,
    facetStatuses,
    ...(consentStatuses.length > 0 ? { consentStatuses } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(context.evaluatorId ? { evaluatorId: context.evaluatorId } : {}),
    ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
  }

  return { receipt, manifest }
}

// =====================================================================
// v0.3 — JWE inline encrypted facet helpers (Section 2.3)
//
// The cryptographic JWE encrypt/decrypt path is out of scope for this
// helper. v0.3 evaluators MUST treat encrypted facets they cannot
// decrypt as sealed entries; the structural shape check below is the
// gate. Implementations adopting a JWE library (e.g., jose) wire it in
// at the call sites.
// =====================================================================

/**
 * Type guard for {@link UmJweEntityV03}. Returns true when the value has the
 * five required JWE JSON Serialization members (`protected`, `recipients`,
 * `iv`, `ciphertext`, `tag`) per v0.3 Section 2.3.2.
 */
export function isJweEntityV03(value: unknown): value is UmJweEntityV03 {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  if (typeof obj.protected !== 'string' || obj.protected.length === 0) return false
  if (!Array.isArray(obj.recipients)) return false
  if (typeof obj.iv !== 'string' || obj.iv.length === 0) return false
  if (typeof obj.ciphertext !== 'string' || obj.ciphertext.length === 0) return false
  if (typeof obj.tag !== 'string' || obj.tag.length === 0) return false
  return true
}

/**
 * Determine the kid identifiers a JWE encrypted entity can be decrypted by,
 * per v0.3 Section 2.3.2. Useful for evaluators selecting which encrypted
 * facets they can read based on the keys they hold.
 */
export function getJweRecipientKids(entity: UmJweEntityV03): string[] {
  return entity.recipients
    .map((r) => r?.header?.kid)
    .filter((kid): kid is string => typeof kid === 'string' && kid.length > 0)
}

/**
 * Test whether a facet should be treated as a sealed entry given the keys an
 * evaluator holds. A facet is sealed when it declares
 * `encryptionProfile: "jwe-inline-v1"` and none of its recipient `kid`
 * values appear in the evaluator's `availableKids`.
 */
export function isFacetSealedV03(
  facet: UmFacetV03,
  availableKids: string[]
): boolean {
  if (facet.encryptionProfile !== 'jwe-inline-v1') return false
  if (!isJweEntityV03(facet.entity)) return true
  const kids = getJweRecipientKids(facet.entity)
  if (kids.length === 0) return true
  for (const kid of kids) if (availableKids.includes(kid)) return false
  return true
}

// =====================================================================
// v0.4 — Universal Manifest
//
// v0.4 carries forward the full v0.3 surface (signature profile A,
// six-stage evaluation, structured receipts, encrypted facets, trust
// tiers, agent delegation, cross-DID binding) and adds:
//
// - holderBinding on claims (sd-jwt-kb, bbs-holder-commitment,
//   reciprocal-control) — REQUIRED for Tier 1+
// - presentationProof at manifest root (replay prevention)
// - livenessAttestation (freshness classes)
// - claimProof as array of proof entries
// - statusRef resolution schema (response shape)
// - Bilateral session model (um:BilateralSession)
// - Agent delegation scope registry (core scopes)
// - Tier 2 ZKP proof profiles (bindingProof)
// - Tier 3 multi-party ceremony (ceremonyProof)
// - JWE algorithm constraints (ECDH-ES+A256KW / A256GCM baseline)
// - Profile registration mechanism
//
// Source of truth: the markdown-canonical v0.4 document set at
// the editable specification source, rendered to
// /spec/v0.4/ (Base + EXT-T1/EXT-T2/EXT-T3/EXT-OPT).
// =====================================================================

// --- v0.4 holder-binding modes ---

/** Holder binding mode: SD-JWT Key Binding */
export type UmHolderBindingModeSdJwtKb = 'sd-jwt-kb'
/** Holder binding mode: BBS+ holder commitment */
export type UmHolderBindingModeBbsCommitment = 'bbs-holder-commitment'
/** Holder binding mode: reciprocal DID control */
export type UmHolderBindingModeReciprocalControl = 'reciprocal-control'
/** Union of v0.4 holder binding modes */
export type UmHolderBindingMode =
  | UmHolderBindingModeSdJwtKb
  | UmHolderBindingModeBbsCommitment
  | UmHolderBindingModeReciprocalControl

const HOLDER_BINDING_MODES: UmHolderBindingMode[] = [
  'sd-jwt-kb',
  'bbs-holder-commitment',
  'reciprocal-control',
]

/**
 * Holder binding object on claims per EXT-T1 Section T1.1.
 * Cryptographic binding of a claim to the manifest subject.
 */
export interface UmHolderBindingV04 {
  mode: UmHolderBindingMode
  /** Required for sd-jwt-kb mode: JWK Thumbprint per RFC 7638 */
  cnfThumbprint?: string
  /** Required for bbs-holder-commitment: the issuer's commitment to the holder secret (EXT-T1 Section T1.1.1) */
  commitment?: string
  /** Required for bbs-holder-commitment: the holder's zero-knowledge proof of possession (EXT-T1 Section T1.1.1) */
  proofValue?: string
  /** Optional for bbs-holder-commitment: scope-exclusive pseudonym */
  pseudonymScope?: string
  /** Required for reciprocal-control: the bound DID */
  boundDid?: string
  /** Required for reciprocal-control: proof from subject */
  subjectProof?: string
  /** Required for reciprocal-control: proof from bound DID */
  boundDidProof?: string
  [key: string]: unknown
}

// --- v0.4 proof entry (claimProof as array) ---

/**
 * Individual proof entry when claimProof is an array per v0.4 Section 6.4.3.
 */
export interface UmProofEntryV04 {
  proofType?: string
  proofPurpose?: string
  verificationMethod?: string
  statusRef?: string
  proofValue?: string
  [key: string]: unknown
}

// --- v0.4 ZKP binding proof (Tier 2) ---

/**
 * Profile 2A: BBS+ linked-secret proof per EXT-T2 Section T2.1.1.
 */
export interface UmZkLinkedSecretProof {
  type: 'ZkLinkedSecretProof'
  cryptosuite: string
  proofPurpose: string
  proofValue: string
  publicInputs: {
    commitmentA: string
    commitmentB: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Profile 2B: HD derivation proof per EXT-T2 Section T2.1.2.
 */
export interface UmZkHdDerivationProof {
  type: 'ZkHdDerivationProof'
  proofSystem: string
  circuit: string
  proofValue: string
  publicInputs: {
    publicKeyA: string
    publicKeyB: string
    derivationPathA: string
    derivationPathB: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type UmBindingProofV04 = UmZkLinkedSecretProof | UmZkHdDerivationProof

// --- v0.4 ceremony proof (Tier 3) ---

/**
 * Tier 3 multi-party ceremony proof per EXT-T3 Section T3.1.
 */
export interface UmCeremonyProofV04 {
  type: 'ThresholdAttestationProof'
  threshold: string
  attesters: string[]
  ceremonyId: string
  aggregateProof: string
  [key: string]: unknown
}

// --- v0.4 presentation proof ---

/** Presentation proof type */
export type UmPresentationProofType = 'sd-jwt-kb' | 'bbs-derived' | 'did-auth'

const PRESENTATION_PROOF_TYPES: UmPresentationProofType[] = [
  'sd-jwt-kb', 'bbs-derived', 'did-auth',
]

/**
 * Presentation proof at manifest root per EXT-T1 Section T1.2. Excluded from
 * the manifest signing input alongside `signature` and `postQuantumSignature`
 * (Base Section 1.6.3).
 */
export interface UmPresentationProofV04 {
  proofType: UmPresentationProofType
  challenge: string
  audience: string
  created: string
  proofValue: string
  [key: string]: unknown
}

// --- v0.4 liveness attestation ---

/** Liveness freshness class per EXT-T1 Section T1.3 */
export type UmLivenessFreshnessClass = 'live' | 'recent' | 'stale' | 'unknown'
export type UmAssuranceClass = 'software' | 'hardware-uv' | 'hardware-bound'

/**
 * Liveness attestation per EXT-T1 Section T1.3. When present it MUST contain
 * `proofType`, `attestedAt`, `validUntil`, and `proofValue`; `method`,
 * `userVerified`, and `attester` are OPTIONAL.
 */
export interface UmLivenessAttestationV04 {
  /** RFC 3339 time human presence was attested. REQUIRED. */
  attestedAt: string
  /** RFC 3339 time after which the attestation is `"unknown"` (EXT-T1 Section T1.3). REQUIRED. */
  validUntil: string
  method?: string
  /** Liveness method identifier per EXT-T1 Section T1.3 (e.g. 'webauthn-uv'). REQUIRED. */
  proofType: string
  /** Base64url proof over UTF-8(subject) || UTF-8(attestedAt), per EXT-T1 Section T1.3. REQUIRED. */
  proofValue: string
  /** Whether user verification was performed. Absent is treated as false for floor purposes (EXT-T1 Section T1.3.1). */
  userVerified?: boolean
  /** DID of the attesting authority. */
  attester?: string
  [key: string]: unknown
}

// --- v0.4 statusRef response ---

/** statusRef response status values per EXT-OPT Section O2.2 */
export type UmStatusRefStatus = 'active' | 'revoked' | 'suspended'

/**
 * statusRef resolution response per EXT-OPT Section O2.2 (protocol named in
 * Base Section 3.4).
 */
export interface UmStatusRefResponseV04 {
  manifestId: string
  status: UmStatusRefStatus
  updatedAt: string
  reason?: string
  cursor?: string
  nextCheck?: string
  [key: string]: unknown
}

// --- v0.4 bilateral session ---

/** Session lifecycle states per EXT-OPT Section O4.2. */
export type UmSessionState =
  | 'initiated'
  | 'manifests-exchanged'
  | 'receipts-exchanged'
  | 'completed'
  | 'expired'

const SESSION_STATES: UmSessionState[] = [
  'initiated', 'manifests-exchanged', 'receipts-exchanged', 'completed', 'expired',
]

/**
 * Bilateral session object per EXT-OPT Section O4.1 (Base Section 3.5).
 */
export interface UmBilateralSessionV04 {
  '@type': 'um:BilateralSession'
  sessionId: string
  exchangeId: string
  participants: Array<{ did: string; role: 'initiator' | 'responder'; [key: string]: unknown }>
  initiatedAt: string
  expiresAt: string
  state: UmSessionState
  [key: string]: unknown
}

// --- v0.4 private-data receipt event vocabulary ---

export type UmPrivateDataEventTypeV04 =
  | 'facet-key-rotated'
  | 'facet-key-shredded'
  | 'session-unlocked'

const PRIVATE_DATA_EVENT_TYPES_V04: UmPrivateDataEventTypeV04[] = [
  'facet-key-rotated',
  'facet-key-shredded',
  'session-unlocked',
]

function assertPrivateDataEventsV04(value: unknown, fieldName: string): void {
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array`)

  for (const event of value) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new Error(`${fieldName} entries must be objects`)
    }
    const obj = event as Record<string, unknown>
    if (!PRIVATE_DATA_EVENT_TYPES_V04.includes(obj.eventType as UmPrivateDataEventTypeV04)) {
      continue
    }
    if (obj.at !== undefined) assertIsoDateTime(obj.at, `${fieldName}.at`)

    if (obj.eventType === 'facet-key-rotated' || obj.eventType === 'facet-key-shredded') {
      if (typeof obj.facetKeyRef !== 'string' || obj.facetKeyRef.length === 0) {
        throw new Error(`${String(obj.eventType)} event requires non-empty facetKeyRef`)
      }
    } else if (
      obj.facetKeyRef !== undefined
      && (typeof obj.facetKeyRef !== 'string' || obj.facetKeyRef.length === 0)
    ) {
      throw new Error('session-unlocked event facetKeyRef must be a non-empty string when present')
    }
  }
}

// --- v0.4 agent delegation scope registry ---

/** Core scope values per EXT-OPT Section O7. */
export const AGENT_DELEGATION_CORE_SCOPES = [
  'spatial.session',
  'spatial.navigation',
  'social.messaging',
  'social.presence',
  'commerce.transaction',
  'identity.attestation',
] as const

export type UmAgentDelegationCoreScope = typeof AGENT_DELEGATION_CORE_SCOPES[number]

// --- v0.4 claim (extends v0.3 with holderBinding + bindingProof + ceremonyProof) ---

/**
 * Claim shape for v0.4 manifests.
 * Extends v0.3 base with holderBinding, bindingProof, ceremonyProof fields.
 */
export interface UmClaimV04 {
  '@type': string
  issuer: string
  subject?: string
  issuedAt?: string
  expiresAt?: string
  claimProof?: Record<string, unknown> | string | UmProofEntryV04[]
  requiredTrustTier?: UmTrustTier
  holderBinding?: UmHolderBindingV04
  bindingProof?: UmBindingProofV04
  ceremonyProof?: UmCeremonyProofV04
  [key: string]: unknown
}

// --- v0.4 signature (Profile A carried forward; Profile B added) ---

/**
 * The signature suites recognized by v0.4.
 *
 * - `Ed25519` — Signature Profile A (JCS + Ed25519). Default, mandatory to
 *   support, carried forward byte-identically from v0.2/v0.3.
 * - `ES256` — Signature Profile B (JCS + ECDSA P-256 / SHA-256), OPTIONAL and
 *   purely additive (EXT-OPT Section O15).
 *
 * The recognized set is governed and open (Base Section 1.6): this union is the
 * current materialization of the profile registry (EXT-OPT Section O6,
 * `signature` category), not a closed set.
 */
export type UmSignatureAlgorithmV04 = 'Ed25519' | 'ES256'

/**
 * Signature for v0.4 manifests.
 *
 * Identical wire shape to v0.3 except that `algorithm` admits the recognized
 * suite set rather than Ed25519 alone. Profile identity is the explicit
 * `(algorithm, canonicalization)` pair (Base Section 1.6.5); an unrecognized
 * pair MUST be rejected and MUST NOT be reinterpreted.
 */
export interface UmSignatureV04 {
  algorithm: UmSignatureAlgorithmV04
  canonicalization: 'JCS-RFC8785'
  keyRef: string
  value: string
  publicKeySpkiB64?: string
  created?: string
  statusRef?: string
  revocationCursor?: string
  [key: string]: unknown
}

// --- v0.4 facet (v0.3 facet plus v0.4 per-facet floors) ---
export type UmFacetV04 = UmFacetV03 & {
  requiredAssuranceClass?: UmAssuranceClass
  requiredLiveness?: {
    minFreshness: Exclude<UmLivenessFreshnessClass, 'unknown'>
    userVerified?: boolean
  }
}

// --- v0.4 consent (same as v0.3) ---
export type UmConsentV04 = UmConsentV03

// --- v0.4 pointer (same as v0.3) ---
export type UmPointerV04 = UmPointerV03

/**
 * A Universal Manifest document (v0.4).
 *
 * v0.4 carries forward the entire v0.3 surface and adds:
 * - holderBinding on claims (REQUIRED for Tier 1+)
 * - presentationProof at manifest root
 * - livenessAttestation
 * - statusRef resolution schema
 * - Bilateral session model
 * - Agent delegation scope registry
 * - Tier 2 ZKP proof profiles
 * - Tier 3 multi-party ceremony
 * - JWE algorithm constraints
 */
interface UniversalManifestFields<Version extends '0.4' | '0.5'> {
  '@context': JsonLdContext
  '@id': string
  '@type': JsonLdType

  manifestVersion: Version
  subject: string
  issuedAt: string
  expiresAt: string

  requiredTrustTier?: UmTrustTier
  facets?: UmFacetV04[]
  claims?: UmClaimV04[]
  consents?: UmConsentV04[]
  devices?: Array<Record<string, unknown>>
  pointers?: UmPointerV04[]
  signature: UmSignatureV04

  presentationProof?: UmPresentationProofV04
  livenessAttestation?: UmLivenessAttestationV04
  events?: Array<Record<string, unknown>>

  [key: string]: unknown
}

export interface UniversalManifestV04 extends UniversalManifestFields<'0.4'> {}
export interface UniversalManifestV05 extends UniversalManifestFields<'0.5'> {}
type CurrentManifest = UniversalManifestFields<'0.4' | '0.5'>
type CurrentVersion = '0.4' | '0.5'

// --- v0.4 validation helpers ---

function assertHolderBindingV04(binding: unknown, claimType: string): asserts binding is UmHolderBindingV04 {
  if (!binding || typeof binding !== 'object') {
    throw new Error(`claim ${claimType}: holderBinding must be an object`)
  }
  const obj = binding as Record<string, unknown>
  if (!HOLDER_BINDING_MODES.includes(obj.mode as UmHolderBindingMode)) {
    throw new Error(
      `claim ${claimType}: holderBinding.mode must be one of ${HOLDER_BINDING_MODES.join('|')}`
    )
  }
  const mode = obj.mode as UmHolderBindingMode
  if (mode === 'sd-jwt-kb') {
    if (typeof obj.cnfThumbprint !== 'string' || obj.cnfThumbprint.length === 0) {
      throw new Error(`claim ${claimType}: holderBinding.cnfThumbprint is required for sd-jwt-kb mode`)
    }
  }
  if (mode === 'bbs-holder-commitment') {
    // EXT-T1 Section T1.1.1: the bbs-holder-commitment mode carries the
    // REQUIRED fields `commitment` and `proofValue`.
    if (typeof obj.commitment !== 'string' || obj.commitment.length === 0) {
      throw new Error(
        `claim ${claimType}: holderBinding.commitment is required for bbs-holder-commitment mode (EXT-T1 Section T1.1.1)`
      )
    }
    if (typeof obj.proofValue !== 'string' || obj.proofValue.length === 0) {
      throw new Error(
        `claim ${claimType}: holderBinding.proofValue is required for bbs-holder-commitment mode (EXT-T1 Section T1.1.1)`
      )
    }
  }
  if (mode === 'reciprocal-control') {
    if (typeof obj.boundDid !== 'string' || obj.boundDid.length === 0) {
      throw new Error(`claim ${claimType}: holderBinding.boundDid is required for reciprocal-control mode`)
    }
    if (typeof obj.subjectProof !== 'string' || obj.subjectProof.length === 0) {
      throw new Error(`claim ${claimType}: holderBinding.subjectProof is required for reciprocal-control mode`)
    }
    if (typeof obj.boundDidProof !== 'string' || obj.boundDidProof.length === 0) {
      throw new Error(`claim ${claimType}: holderBinding.boundDidProof is required for reciprocal-control mode`)
    }
  }
}

function assertBindingProofV04(proof: unknown): asserts proof is UmBindingProofV04 {
  if (!proof || typeof proof !== 'object') {
    throw new Error('bindingProof must be an object')
  }
  const obj = proof as Record<string, unknown>
  if (obj.type === 'ZkLinkedSecretProof') {
    if (typeof obj.cryptosuite !== 'string' || obj.cryptosuite.length === 0) {
      throw new Error('ZkLinkedSecretProof: missing cryptosuite')
    }
    if (typeof obj.proofPurpose !== 'string' || obj.proofPurpose.length === 0) {
      throw new Error('ZkLinkedSecretProof: missing proofPurpose')
    }
    if (typeof obj.proofValue !== 'string' || obj.proofValue.length === 0) {
      throw new Error('ZkLinkedSecretProof: missing proofValue')
    }
    if (!obj.publicInputs || typeof obj.publicInputs !== 'object') {
      throw new Error('ZkLinkedSecretProof: missing publicInputs')
    }
    const pi = obj.publicInputs as Record<string, unknown>
    if (typeof pi.commitmentA !== 'string' || typeof pi.commitmentB !== 'string') {
      throw new Error('ZkLinkedSecretProof: publicInputs must contain commitmentA and commitmentB')
    }
  } else if (obj.type === 'ZkHdDerivationProof') {
    if (typeof obj.proofSystem !== 'string' || obj.proofSystem.length === 0) {
      throw new Error('ZkHdDerivationProof: missing proofSystem')
    }
    if (typeof obj.circuit !== 'string' || obj.circuit.length === 0) {
      throw new Error('ZkHdDerivationProof: missing circuit')
    }
    if (typeof obj.proofValue !== 'string' || obj.proofValue.length === 0) {
      throw new Error('ZkHdDerivationProof: missing proofValue')
    }
    if (!obj.publicInputs || typeof obj.publicInputs !== 'object') {
      throw new Error('ZkHdDerivationProof: missing publicInputs')
    }
    const pi = obj.publicInputs as Record<string, unknown>
    if (typeof pi.publicKeyA !== 'string' || typeof pi.publicKeyB !== 'string') {
      throw new Error('ZkHdDerivationProof: publicInputs must contain publicKeyA and publicKeyB')
    }
    if (typeof pi.derivationPathA !== 'string' || typeof pi.derivationPathB !== 'string') {
      throw new Error('ZkHdDerivationProof: publicInputs must contain derivationPathA and derivationPathB')
    }
  } else {
    throw new Error(`bindingProof.type must be ZkLinkedSecretProof or ZkHdDerivationProof, got ${String(obj.type)}`)
  }
}

function assertCeremonyProofV04(proof: unknown, version: CurrentVersion = '0.4'): asserts proof is UmCeremonyProofV04 {
  if (!proof || typeof proof !== 'object') {
    throw new Error('ceremonyProof must be an object')
  }
  const obj = proof as Record<string, unknown>
  if (obj.type !== 'ThresholdAttestationProof') {
    throw new Error('ceremonyProof.type must be ThresholdAttestationProof')
  }
  if (typeof obj.threshold !== 'string' || !/^\d+-of-\d+$/.test(obj.threshold)) {
    throw new Error('ceremonyProof.threshold must be in M-of-N format')
  }
  if (!Array.isArray(obj.attesters) || obj.attesters.length === 0) {
    throw new Error('ceremonyProof.attesters must be a non-empty array')
  }
  // Parse M from threshold and verify attesters count >= M
  const m = parseInt(obj.threshold.split('-')[0], 10)
  if (obj.attesters.length < m) {
    throw new Error(`ceremonyProof.attesters must have at least ${m} entries (threshold: ${obj.threshold})`)
  }
  for (const a of obj.attesters) {
    if (typeof a !== 'string' || a.length === 0) {
      throw new Error('ceremonyProof.attesters entries must be non-empty strings')
    }
  }
  if (version === '0.5') {
    const [minimum, total] = obj.threshold.split('-of-').map(value => BigInt(value))
    const distinct = new Set(obj.attesters).size
    if (minimum < 1n || total < 1n || minimum > total || distinct !== obj.attesters.length ||
        BigInt(distinct) < minimum || BigInt(distinct) > total) {
      throw new Error('ceremonyProof requires positive M <= distinct unique attesters <= N and M <= N')
    }
  }
  if (typeof obj.ceremonyId !== 'string' || obj.ceremonyId.length === 0) {
    throw new Error('ceremonyProof: missing ceremonyId')
  }
  if (typeof obj.aggregateProof !== 'string' || obj.aggregateProof.length === 0) {
    throw new Error('ceremonyProof: missing aggregateProof')
  }
}

function assertPresentationProofV04(proof: unknown): asserts proof is UmPresentationProofV04 {
  if (!proof || typeof proof !== 'object') {
    throw new Error('presentationProof must be an object')
  }
  const obj = proof as Record<string, unknown>
  if (!PRESENTATION_PROOF_TYPES.includes(obj.proofType as UmPresentationProofType)) {
    throw new Error(`presentationProof.proofType must be one of ${PRESENTATION_PROOF_TYPES.join('|')}`)
  }
  if (typeof obj.challenge !== 'string' || obj.challenge.length === 0) {
    throw new Error('presentationProof: missing challenge')
  }
  if (typeof obj.audience !== 'string' || obj.audience.length === 0) {
    throw new Error('presentationProof: missing audience')
  }
  assertIsoDateTime(obj.created, 'presentationProof.created')
  if (typeof obj.proofValue !== 'string' || obj.proofValue.length === 0) {
    throw new Error('presentationProof: missing proofValue')
  }
}

function assertLivenessAttestationV04(att: unknown): asserts att is UmLivenessAttestationV04 {
  if (!att || typeof att !== 'object') {
    throw new Error('livenessAttestation must be an object')
  }
  const obj = att as Record<string, unknown>
  // EXT-T1 Section T1.3: when present, a livenessAttestation MUST contain
  // proofType, attestedAt, validUntil, and proofValue.
  assertIsoDateTime(obj.attestedAt, 'livenessAttestation.attestedAt')
  if (obj.validUntil === undefined) {
    throw new Error('livenessAttestation.validUntil is required (EXT-T1 Section T1.3)')
  }
  assertIsoDateTime(obj.validUntil, 'livenessAttestation.validUntil')
  if (typeof obj.proofType !== 'string' || obj.proofType.length === 0) {
    throw new Error('livenessAttestation.proofType is required and must be a non-empty string (EXT-T1 Section T1.3)')
  }
  if (typeof obj.proofValue !== 'string' || obj.proofValue.length === 0) {
    throw new Error('livenessAttestation.proofValue is required and must be a non-empty string (EXT-T1 Section T1.3)')
  }
  if (obj.userVerified !== undefined && typeof obj.userVerified !== 'boolean') {
    throw new Error('livenessAttestation.userVerified must be a boolean')
  }
  if (obj.attester !== undefined && typeof obj.attester !== 'string') {
    throw new Error('livenessAttestation.attester must be a string')
  }
}

/** Valid per-facet liveness floor classes per EXT-T1 Section T1.3.1 ('unknown' is not a valid floor). */
const REQUIRED_LIVENESS_FRESHNESS = ['live', 'recent', 'stale'] as const
const REQUIRED_ASSURANCE_CLASSES: UmAssuranceClass[] = ['software', 'hardware-uv', 'hardware-bound']
const ASSURANCE_CLASS_RANK: Record<UmAssuranceClass, number> = {
  software: 0,
  'hardware-uv': 1,
  'hardware-bound': 2,
}

function isAssuranceClass(value: unknown): value is UmAssuranceClass {
  return value === 'software' || value === 'hardware-uv' || value === 'hardware-bound'
}

/**
 * The EXT-T1 Section T1.3.1 ordering: *"`live` > `recent` > `stale` >
 * `unknown`"*. Higher rank is fresher. `unknown` ranks lowest, which is what
 * makes "an absent or expired attestation satisfies no floor" fall out of the
 * ordered comparison instead of needing a special case.
 */
const LIVENESS_FRESHNESS_RANK: Record<UmLivenessFreshnessClass, number> = {
  unknown: 0,
  stale: 1,
  recent: 2,
  live: 3,
}

/**
 * Validate a facet's optional `requiredLiveness` floor SHAPE per EXT-T1 Section T1.3.1.
 * This is a structural shape check of the same kind as the trust-tier floor check.
 * The runtime floor ENFORCEMENT — the facet withheld, fail closed, sequenced in the
 * Consent stage — is {@link requiredLivenessFloorRefusal}, applied by
 * {@link evaluateUniversalManifestV04}.
 */
function assertRequiredLivenessShape(value: unknown): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('requiredLiveness must be an object')
  }
  const obj = value as Record<string, unknown>
  if (!REQUIRED_LIVENESS_FRESHNESS.includes(obj.minFreshness as (typeof REQUIRED_LIVENESS_FRESHNESS)[number])) {
    throw new Error('requiredLiveness.minFreshness must be one of live|recent|stale')
  }
  if (obj.userVerified !== undefined && typeof obj.userVerified !== 'boolean') {
    throw new Error('requiredLiveness.userVerified must be a boolean')
  }
}

/**
 * Validates a `livenessAttestation`'s `proofValue` against the mechanics of its
 * declared `proofType` (EXT-T1 Section T1.3, which makes this MUST-do before the
 * attestation counts as evidence of human presence).
 *
 * Legacy callable shape only. Empty success contains no bound context or
 * authenticated UV and remains unvalidated. The V1 factory installs the real
 * contextual method without changing this existing callback's signature.
 */
export type UmLivenessProofValidator = (attestation: Record<string, unknown>) => void

/**
 * Whether the root `livenessAttestation`'s `proofValue` validated under the
 * mechanics of its declared `proofType` — **and nothing else**.
 *
 * Mirrors the Rust core's `LivenessProofValidity`. `kind: 'absent'` means the
 * manifest carries no attestation at all, which EXT-T1 Section T1.3.1 governs
 * with its own rule; the two are kept distinct so a refusal names the rule that
 * actually fired.
 */
export type UmLivenessProofValidity =
  | { kind: 'absent' }
  | { kind: 'incomplete'; missing: string }
  | { kind: 'unvalidated'; proofType: string; reason: string }
  | { kind: 'validated'; proofType: string }

/** EXT-T1 Section T1.3's REQUIRED members of a `livenessAttestation`. */
const LIVENESS_REQUIRED_MEMBERS = ['proofType', 'attestedAt', 'validUntil', 'proofValue'] as const

/**
 * Adapt a legacy callback without claiming contextual validation. Success is
 * unvalidated; a thrown error retains its reason. V1 callers use the versioned
 * evaluator and its immutable, proof-derived result instead.
 */
export function livenessProofValidity(
  manifest: unknown,
  validator?: UmLivenessProofValidator
): UmLivenessProofValidity {
  const root = typeof manifest === 'object' && manifest !== null
    ? (manifest as Record<string, unknown>)
    : undefined
  const attestation = root?.livenessAttestation
  if (typeof attestation !== 'object' || attestation === null || Array.isArray(attestation)) {
    return { kind: 'absent' }
  }
  const members = attestation as Record<string, unknown>
  const missing = LIVENESS_REQUIRED_MEMBERS.filter((member) => members[member] === undefined)
  if (missing.length > 0) return { kind: 'incomplete', missing: missing.join(', ') }

  const proofType = typeof members.proofType === 'string' ? members.proofType : ''
  if (validator === undefined) {
    return {
      kind: 'unvalidated',
      proofType,
      reason: `this evaluator implements no proofValue mechanics for proofType '${proofType}' `
        + '(EXT-T1 Section T1.3 requires proofValue be validated against the named proofType\'s '
        + 'mechanics before the attestation counts as evidence)',
    }
  }
  try {
    validator(members)
    return { kind: 'unvalidated', proofType, reason: 'legacy-context-unbound' }
  } catch (error) {
    return { kind: 'unvalidated', proofType, reason: String(error instanceof Error ? error.message : error) }
  }
}

/**
 * Enforce a facet's `requiredLiveness` floor (EXT-T1 Section T1.3.1).
 *
 * Returns the withhold reason, or `undefined` when the floor is met. A returned
 * string means the facet MUST be withheld — EXT-OPT Section O11 makes the
 * baseline mandatory, and Base Section 4.7 says a facet carrying a floor
 * *"MUST be withheld (recorded `assuranceInsufficient`, or the unmet-liveness
 * status)"*.
 *
 * The four fail-closed rules the section states, each implemented here:
 *
 * - **`userVerified` absent is `false`.** *"For a floor requiring
 *   `userVerified: true`, an attestation lacking `userVerified: true` (including
 *   absent) MUST fail the floor."*
 * - **Absent or expired root attestation satisfies no floor.** *"If the root
 *   `livenessAttestation` is absent, or evaluates to `freshnessClass:
 *   "unknown"` …, then **no** `requiredLiveness` floor is satisfied — including a
 *   `minFreshness: "stale"` floor."* `unknown` ranks lowest in
 *   {@link LIVENESS_FRESHNESS_RANK}, so this falls out of the ordered comparison.
 * - **A malformed floor is not a waiver.** `minFreshness` is REQUIRED and
 *   `"unknown"` is *"not a valid floor value (a floor of `"unknown"` would be
 *   vacuous)"*. A floor this evaluator cannot read is treated as unmet, never as
 *   absent — the opposite would turn a typo in a floor into a bypass of it.
 * - **Proof validation before freshness.** *"An attestation whose `proofValue`
 *   does not validate under its `proofType` MUST be treated as `"unknown"` for
 *   floor purposes regardless of `attestedAt`; the floor check is sequenced
 *   strictly after proof validation, so a forged-but-fresh-looking attestation
 *   cannot bypass the floor."*
 *
 * ## The fourth rule was missing until 2026-07-26 (KNOWN-FINDINGS L1)
 *
 * This function's doc comment used to claim proof validation was *"sequenced
 * before freshness by construction"* because `liveness` comes from
 * {@link classifyLivenessFreshness}. **That was false in both implementations,
 * and it is worth naming why the sentence read as convincing:**
 * `classifyLivenessFreshness` is purely temporal — it reads `attestedAt` and
 * `validUntil` and nothing else. It never touched `proofValue`, so "by
 * construction" guaranteed a sequencing that did not exist, and an attestation
 * naming a `proofType` nothing implements with a nonsense `proofValue` satisfied
 * a `minFreshness: "live"` floor. `proof` is now a **required third argument**:
 * the caller cannot reach a floor verdict without first having asked the proof
 * question, which is the sequencing rule expressed as a signature rather than as
 * a comment.
 *
 * This mirrors the Rust SDK core's `liveness_floor_refusal` rule for rule, so the
 * two implementations withhold the same facets. Added 2026-07-26; the
 * floor had been parsed and shape-validated but never compared. The proof
 * sequencing landed 2026-07-26, in both implementations in the same
 * change — the oracle being the permissive side had already recurred three
 * times and this is not the fourth.
 *
 * @param floor - The facet's `requiredLiveness` member, as read from the document.
 * @param liveness - The receipt's liveness echo, or `undefined` when the manifest
 *   carries no `livenessAttestation`.
 * @param proof - The {@link livenessProofValidity} verdict for the same manifest.
 * @returns The withhold reason, or `undefined` when the floor is met.
 */
export function requiredLivenessFloorRefusal(
  floor: unknown,
  liveness: UmReceiptLivenessStatus | undefined,
  proof: UmLivenessProofValidity
): string | undefined {
  // A floor that is not an object at all, or carries no readable `minFreshness`,
  // is unmet — never waived.
  const raw = typeof floor === 'object' && floor !== null && !Array.isArray(floor)
    ? (floor as Record<string, unknown>)
    : undefined
  const declared = raw?.minFreshness
  const minFreshness = typeof declared === 'string' && declared in LIVENESS_FRESHNESS_RANK
    ? (declared as UmLivenessFreshnessClass)
    : undefined
  if (minFreshness === undefined) {
    return 'requiredLiveness carries no readable minFreshness (REQUIRED, one of "live", '
      + '"recent", "stale"; "unknown" is not a valid floor value) — a floor this evaluator '
      + 'cannot read is treated as UNMET, never as absent (EXT-T1 Section T1.3.1, fail closed)'
  }
  if (minFreshness === 'unknown') {
    return 'requiredLiveness.minFreshness is "unknown", which EXT-T1 Section T1.3.1 states is '
      + 'not a valid floor value (a floor of "unknown" would be vacuous) — the facet is withheld'
  }

  // "If the root livenessAttestation is absent … then no requiredLiveness floor
  // is satisfied."
  if (liveness === undefined) {
    return `facet requires a validated livenessAttestation with freshnessClass at least `
      + `${minFreshness}, and the manifest carries none — absent root attestation means NO `
      + 'floor is satisfied, including a "stale" floor (EXT-T1 Section T1.3.1, fail closed)'
  }

  // "Proof validation before freshness. An attestation whose proofValue does not
  // validate under its proofType MUST be treated as "unknown" for floor purposes
  // regardless of attestedAt." Sequenced strictly BEFORE the freshness comparison
  // below, which is what stops a forged-but-fresh-looking attestation from
  // bypassing the floor. `unknown` fails every valid floor value, so the effect is
  // a refusal in all three cases — reported with the rule that actually fired
  // rather than as a freshness shortfall it is not.
  if (proof.kind === 'unvalidated') {
    return `facet requires a VALIDATED livenessAttestation with freshnessClass at least `
      + `${minFreshness}; the attestation's proofValue did not validate under proofType `
      + `'${proof.proofType}' (${proof.reason}), so EXT-T1 Section T1.3.1 requires it be treated `
      + 'as "unknown" for floor purposes regardless of attestedAt — and EXT-T1 Section T1.4 '
      + 'sub-step 2c states an unvalidated attestation satisfies NO requiredLiveness floor and '
      + 'MUST NOT be treated as evidence of human presence (fail closed)'
  }
  if (proof.kind === 'incomplete') {
    return `facet requires a VALIDATED livenessAttestation with freshnessClass at least `
      + `${minFreshness}; the attestation is missing REQUIRED member(s) ${proof.missing} (EXT-T1 `
      + 'Section T1.3), so there is no well-formed proof to validate and it is treated as '
      + '"unknown" for floor purposes (EXT-T1 Section T1.3.1, fail closed)'
  }

  if (LIVENESS_FRESHNESS_RANK[liveness.freshnessClass] < LIVENESS_FRESHNESS_RANK[minFreshness]) {
    return `livenessAttestation classifies as ${liveness.freshnessClass}, below the facet's `
      + `requiredLiveness floor of ${minFreshness} (ordered live > recent > stale > unknown; `
      + 'EXT-T1 Section T1.3.1)'
  }

  // "when true, the floor additionally requires the attestation's userVerified
  // to be true." Absent is false.
  if (raw?.userVerified === true && liveness.userVerified !== true) {
    return `facet's requiredLiveness demands userVerified true; the attestation reports `
      + `${liveness.userVerified === undefined ? 'no userVerified member' : String(liveness.userVerified)}`
      + ' — absent or false both fail the floor (EXT-T1 Section T1.3.1, fail closed)'
  }

  return undefined
}

function assertRequiredAssuranceClassShape(value: unknown): asserts value is UmAssuranceClass {
  if (!REQUIRED_ASSURANCE_CLASSES.includes(value as UmAssuranceClass)) {
    throw new Error('requiredAssuranceClass must be one of software|hardware-uv|hardware-bound')
  }
}

function assertClaimV04(claim: unknown, version: CurrentVersion = '0.4'): asserts claim is UmClaimV04 {
  if (!claim || typeof claim !== 'object') throw new Error('claim must be an object')
  const obj = claim as Record<string, unknown>
  if (typeof obj['@type'] !== 'string' || obj['@type'].length === 0) {
    throw new Error('claim missing @type')
  }
  if (typeof obj.issuer !== 'string' || obj.issuer.length === 0) {
    throw new Error('claim missing issuer')
  }
  assertOptionalTrustTier(obj.requiredTrustTier, 'claim.requiredTrustTier')

  if (typeof obj.issuedAt === 'string') assertIsoDateTime(obj.issuedAt, 'claim.issuedAt')
  if (typeof obj.expiresAt === 'string') assertIsoDateTime(obj.expiresAt, 'claim.expiresAt')

  // holderBinding validation
  if (obj.holderBinding !== undefined) {
    assertHolderBindingV04(obj.holderBinding, obj['@type'] as string)
  }

  // bindingProof (Tier 2 ZKP)
  if (obj.bindingProof !== undefined) {
    assertBindingProofV04(obj.bindingProof)
  }

  // ceremonyProof (Tier 3)
  if (obj.ceremonyProof !== undefined) {
    assertCeremonyProofV04(obj.ceremonyProof, version)
  }

  // claimProof: can be object, string, or array of proof entries
  if (obj.claimProof !== undefined && Array.isArray(obj.claimProof)) {
    for (const entry of obj.claimProof) {
      if (!entry || typeof entry !== 'object') {
        throw new Error('claimProof array entry must be an object')
      }
    }
  }

  // identity.crossDidBinding checks (Section 6.4.4)
  if (obj['@type'] === 'identity.crossDidBinding') {
    if (!Array.isArray(obj.boundDids) || obj.boundDids.length < 2) {
      throw new Error('identity.crossDidBinding claim must contain at least 2 boundDids')
    }
    if (version === '0.5' && obj.bindingProof !== undefined && obj.boundDids.length !== 2) {
      throw new Error('identity.crossDidBinding with bindingProof requires exactly 2 boundDids')
    }
    for (const did of obj.boundDids) {
      if (typeof did !== 'string' || did.length === 0) {
        throw new Error('identity.crossDidBinding boundDids entries must be non-empty strings')
      }
    }
    // Section 6.4.4: the attester triple (attester/attestationMethod/attestedAt)
    // is REQUIRED only for attester-asserted bindings. When the claim carries a
    // cryptographic bindingProof (EXT-T2) or ceremonyProof (EXT-T3), the proof
    // object carries the binding and the triple is OPTIONAL.
    const carriesCryptographicBinding = obj.bindingProof !== undefined || obj.ceremonyProof !== undefined
    if (!carriesCryptographicBinding) {
      if (typeof obj.attester !== 'string' || obj.attester.length === 0) {
        throw new Error('identity.crossDidBinding claim missing attester (required for attester-asserted bindings, Section 6.4.4)')
      }
      if (typeof obj.attestationMethod !== 'string' || obj.attestationMethod.length === 0) {
        throw new Error('identity.crossDidBinding claim missing attestationMethod (required for attester-asserted bindings, Section 6.4.4)')
      }
      if (typeof obj.attestedAt !== 'string' || obj.attestedAt.length === 0) {
        throw new Error('identity.crossDidBinding claim missing attestedAt (required for attester-asserted bindings, Section 6.4.4)')
      }
    }
    if (obj.attestedAt !== undefined) {
      assertIsoDateTime(obj.attestedAt, 'claim.attestedAt')
    }
  }
}

// --- v0.4 bilateral session validator ---

/**
 * Assert that `value` is a structurally valid bilateral session per EXT-OPT
 * Section O4.1 (Base Section 3.5).
 */
export function assertBilateralSessionV04(value: unknown): asserts value is UmBilateralSessionV04 {
  if (!value || typeof value !== 'object') throw new Error('Session must be an object')
  const obj = value as Record<string, unknown>

  if (obj['@type'] !== 'um:BilateralSession') {
    throw new Error('Session @type must be um:BilateralSession')
  }
  if (typeof obj.sessionId !== 'string' || obj.sessionId.length === 0) {
    throw new Error('Session missing sessionId')
  }
  if (typeof obj.exchangeId !== 'string' || obj.exchangeId.length === 0) {
    throw new Error('Session missing exchangeId')
  }
  if (!Array.isArray(obj.participants) || obj.participants.length !== 2) {
    throw new Error('Session participants must be an array of exactly 2 entries')
  }
  for (const p of obj.participants) {
    if (!p || typeof p !== 'object') throw new Error('Session participant must be an object')
    const part = p as Record<string, unknown>
    if (typeof part.did !== 'string' || part.did.length === 0) {
      throw new Error('Session participant missing did')
    }
    if (part.role !== 'initiator' && part.role !== 'responder') {
      throw new Error('Session participant role must be initiator or responder')
    }
  }
  assertIsoDateTime(obj.initiatedAt, 'session.initiatedAt')
  assertIsoDateTime(obj.expiresAt, 'session.expiresAt')
  if (!SESSION_STATES.includes(obj.state as UmSessionState)) {
    throw new Error(`Session state must be one of ${SESSION_STATES.join('|')}`)
  }
}

// --- v0.4 statusRef response validator ---

/**
 * Assert that `value` is a valid statusRef response per EXT-OPT Section O2.2.
 */
export function assertStatusRefResponseV04(value: unknown): asserts value is UmStatusRefResponseV04 {
  if (!value || typeof value !== 'object') throw new Error('StatusRef response must be an object')
  const obj = value as Record<string, unknown>

  if (typeof obj.manifestId !== 'string' || obj.manifestId.length === 0) {
    throw new Error('StatusRef response missing manifestId')
  }
  const validStatuses: UmStatusRefStatus[] = ['active', 'revoked', 'suspended']
  if (!validStatuses.includes(obj.status as UmStatusRefStatus)) {
    throw new Error('StatusRef response status must be one of active|revoked|suspended')
  }
  assertIsoDateTime(obj.updatedAt, 'statusRef.updatedAt')
}

// --- v0.4 signing input and signature verification (Base Section 1.6.3) ---

/** The v0.4 versioned namespace URI (Base Section 1.2.1, Appendix B). */
export const UM_V04_NAMESPACE = 'https://universalmanifest.net/ns/v0.4'
export const UM_V05_NAMESPACE = 'https://universalmanifest.net/ns/v0.5'

/** VP size limits per Base Section 6.4.3 / EXT-T1 Section T1.5.1. */
const VP_EMBEDDED_LIMIT_BYTES = 50 * 1024
const VP_TOTAL_LIMIT_BYTES = 500 * 1024

/**
 * Measure the embedded-VP payload bytes of a `claimProof` value and enforce
 * the 50 KB per-embedded-VP limit (Base Section 6.4.3, EXT-T1 Section T1.5.1).
 * URI-string proofs carry no embedded payload. Returns the byte count so the
 * caller can enforce the 500 KB per-manifest total.
 */
function measureEmbeddedVpBytes(claimProof: unknown): number {
  if (claimProof === undefined || claimProof === null || typeof claimProof === 'string') return 0
  const entries = Array.isArray(claimProof) ? claimProof : [claimProof]
  let total = 0
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const bytes = Buffer.byteLength(JSON.stringify(entry), 'utf8')
    if (bytes > VP_EMBEDDED_LIMIT_BYTES) {
      throw new Error(
        'claimProof embedded VP exceeds the 50 KB per-VP size limit (Section 6.4.3, EXT-T1 Section T1.5.1)'
      )
    }
    total += bytes
  }
  return total
}

/**
 * Compute the v0.4 signing input per Base Section 1.6.3: the JCS-canonical
 * form of the manifest with `signature` and — when present —
 * `presentationProof` and `postQuantumSignature` removed (EXT-T1 Section T1.2,
 * EXT-OPT Section O1.5).
 */
function computeSigningInputV04(manifest: Record<string, unknown>): string {
  const unsigned: Record<string, unknown> = { ...manifest }
  delete unsigned.signature
  delete unsigned.presentationProof
  delete unsigned.postQuantumSignature
  return canonicalizeJson(unsigned)
}

// --- v0.4 signature suite registry (Base Section 1.6, EXT-OPT Sections O6/O15) ---

/**
 * The recognized v0.4 signature suites, keyed by the `algorithm` token.
 *
 * Profile identity is the explicit `(algorithm, canonicalization)` pair — every
 * recognized suite pins `canonicalization` here rather than assuming it, so a
 * future suite with a different canonicalization is a data change, not a code
 * change. The set is governed and open (Base Section 1.6); adding a suite means
 * adding a row here plus the matching `schema.json` enum value.
 *
 * `spkiKeyType` / `spkiNamedCurve` drive the REQUIRED SPKI-algorithm-vs-
 * `algorithm` consistency check (EXT-OPT Section O15.4): key material that does
 * not match the declared suite MUST fail, in either direction.
 */
const UM_V04_SIGNATURE_SUITES: Record<
  UmSignatureAlgorithmV04,
  {
    canonicalization: 'JCS-RFC8785'
    spkiKeyType: string
    spkiNamedCurve?: string
    /** Node digest name; `null` selects Ed25519's built-in PureEdDSA hashing. */
    digest: string | null
    /** Raw fixed-width signature length in bytes, when the suite pins one. */
    rawSignatureBytes: number
    label: string
  }
> = {
  Ed25519: {
    canonicalization: 'JCS-RFC8785',
    spkiKeyType: 'ed25519',
    digest: null,
    rawSignatureBytes: 64,
    label: 'an Ed25519 key',
  },
  ES256: {
    canonicalization: 'JCS-RFC8785',
    spkiKeyType: 'ec',
    spkiNamedCurve: 'prime256v1',
    digest: 'sha256',
    rawSignatureBytes: 64,
    label: 'a P-256 (prime256v1) EC key',
  },
}

function isRecognizedV04Algorithm(value: unknown): value is UmSignatureAlgorithmV04 {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(UM_V04_SIGNATURE_SUITES, value)
}

/** The recognized `algorithm` tokens, for error messages and introspection. */
const UM_V04_SIGNATURE_ALGORITHMS = Object.keys(UM_V04_SIGNATURE_SUITES) as UmSignatureAlgorithmV04[]

/**
 * Assert the v0.4 signature envelope shape and profile pair.
 *
 * Carries the v0.3 checks forward verbatim (`keyRef` REQUIRED per Section
 * 1.6.2, non-empty `value`, well-formed optional members) and generalizes only
 * the profile check: the `(algorithm, canonicalization)` pair must name a
 * recognized suite. An unrecognized pair is rejected fail-closed and is never
 * reinterpreted as a recognized one (Base Section 1.6.5).
 */
function assertSignatureV04(sigValue: unknown, version: CurrentVersion = '0.4'): asserts sigValue is UmSignatureV04 {
  if (!sigValue || typeof sigValue !== 'object') throw new Error('Missing signature')
  const sig = sigValue as Record<string, unknown>

  if (!isRecognizedV04Algorithm(sig.algorithm)) {
    throw new Error(
      `signature.algorithm must name a recognized suite (${UM_V04_SIGNATURE_ALGORITHMS.join(', ')}); `
      + 'unrecognized profile pairs are rejected and MUST NOT be reinterpreted (Section 1.6.5)'
    )
  }
  const suite = UM_V04_SIGNATURE_SUITES[sig.algorithm]
  if (sig.canonicalization !== suite.canonicalization) {
    throw new Error(`signature.canonicalization must be ${suite.canonicalization}`)
  }

  if (typeof sig.keyRef !== 'string' || sig.keyRef.length === 0) {
    throw new Error('signature.keyRef must be a non-empty string (v0.3 Section 1.6.2)')
  }
  if (typeof sig.value !== 'string' || sig.value.length === 0) {
    throw new Error('Missing signature.value')
  }

  if (sig.publicKeySpkiB64 !== undefined) {
    if (typeof sig.publicKeySpkiB64 !== 'string' || sig.publicKeySpkiB64.length === 0) {
      throw new Error('signature.publicKeySpkiB64 must be a non-empty string')
    }
  }
  // The schema requires a date-time, as Rust Core does. It is still not authenticated (Section 1.6.2).
  if (sig.created !== undefined) {
    if (typeof sig.created !== 'string') throw new Error('signature.created must be an ISO date-time')
    if (version === '0.5') {
      if (!isRfc3339DateTimeV05(sig.created)) throw new Error('signature.created must be an RFC 3339 date-time')
    } else {
      assertIsoDateTime(sig.created, 'signature.created')
    }
  }
}

/**
 * Enforce the REQUIRED SPKI-algorithm-vs-`algorithm` consistency check
 * (EXT-OPT Section O15.4).
 *
 * Key material whose type does not match the declared suite is a signature
 * failure, not an unsupported profile: the profile is recognized, the key is
 * simply not the one the profile names. Both directions fail — an Ed25519 SPKI
 * under `ES256` and a P-256 SPKI under `Ed25519`.
 */
function assertSpkiMatchesSuiteV04(
  publicKey: ReturnType<typeof createPublicKey>,
  algorithm: UmSignatureAlgorithmV04
): void {
  const suite = UM_V04_SIGNATURE_SUITES[algorithm]
  const keyType = publicKey.asymmetricKeyType
  const namedCurve = publicKey.asymmetricKeyDetails?.namedCurve

  const typeMatches = keyType === suite.spkiKeyType
  const curveMatches = suite.spkiNamedCurve === undefined || namedCurve === suite.spkiNamedCurve

  if (!typeMatches || !curveMatches) {
    const got = namedCurve ? `${keyType}/${namedCurve}` : String(keyType)
    throw new Error(
      `signature.publicKeySpkiB64 key material does not match the declared ${algorithm} suite: `
      + `expected ${suite.label}, got ${got} (EXT-OPT Section O15.4)`
    )
  }
}

/**
 * Verify a v0.4 manifest signature over the Base Section 1.6.3 signing input.
 *
 * Unlike the v0.2/v0.3 paths (which exclude only `signature`), the v0.4
 * signing input also excludes `presentationProof` and `postQuantumSignature`
 * when present, so an interactive presentation can attach its proof without
 * invalidating the holder's signature. The signing input is identical across
 * every recognized suite — only the signature primitive differs.
 *
 * Profile B (ES256) encoding discipline (EXT-OPT Section O15.1/O15.2):
 * - `signature.value` is the base64url of the **64-byte raw `R || S`**;
 *   DER/X9.62 is rejected (`dsaEncoding: 'ieee-p1363'` consumes raw `R || S`,
 *   and the explicit length check rejects a DER blob deterministically).
 * - There is deliberately **no low-S rule and no RFC 6979 requirement**. A
 *   high-S signature and a randomized nonce are both conformant. Secure
 *   Enclave / StrongBox / TPM signers expose no nonce control and do not
 *   guarantee low-S, so a rule no secure chip can satisfy would make every
 *   secure chip non-conformant. Do not add a canonical-S check here.
 */
function verifySignatureV04(manifest: CurrentManifest, version: CurrentVersion = '0.4', resolvedSpki?: string): void {
  const sig = manifest.signature
  const spki = resolvedSpki ?? sig.publicKeySpkiB64

  if (!spki) {
    throw new Error('Missing signature.publicKeySpkiB64 (key resolution is out of scope for this helper)')
  }

  const suite = UM_V04_SIGNATURE_SUITES[sig.algorithm]
  const payload = computeSigningInputV04(manifest as unknown as Record<string, unknown>)

  let publicKey
  try {
    publicKey = createPublicKey({
      key: Buffer.from(spki, 'base64'),
      format: 'der',
      type: 'spki',
    })
  } catch {
    throw new Error('Invalid signature.publicKeySpkiB64 (expected base64 SPKI DER)')
  }

  assertSpkiMatchesSuiteV04(publicKey, sig.algorithm)

  const signatureBytes = Buffer.from(sig.value, 'base64url')

  if (sig.algorithm === 'ES256') {
    if (signatureBytes.length !== suite.rawSignatureBytes) {
      throw new Error(
        `signature.value must be the base64url of a ${suite.rawSignatureBytes}-byte raw R || S ECDSA value; `
        + `DER/X9.62 encoding is rejected (EXT-OPT Section O15.1) — got ${signatureBytes.length} bytes`
      )
    }
    const ok = verify(
      suite.digest,
      Buffer.from(payload, 'utf8'),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signatureBytes
    )
    if (!ok) throw new Error('Signature verification failed')
    return
  }

  const ok = version === '0.5'
    ? verifyEd25519V05(Buffer.from(spki, 'base64'), Buffer.from(payload, 'utf8'), signatureBytes)
    : verify(suite.digest, Buffer.from(payload, 'utf8'), publicKey, signatureBytes)

  if (!ok) throw new Error('Signature verification failed')
}

// --- v0.4 manifest assertion ---

/**
 * Assert that `value` is a structurally valid v0.4 Universal Manifest.
 *
 * Carries forward all v0.3 structural checks (envelope, signature profile A,
 * Ed25519 verification, trust tier floors, agentDelegation constraints) and
 * adds v0.4 validation for: holderBinding on claims, presentationProof,
 * livenessAttestation, claimProof arrays, bindingProof (Tier 2 ZKP),
 * ceremonyProof (Tier 3), and cross-claim invariants.
 */
export function assertUniversalManifestV04(value: unknown): asserts value is UniversalManifestV04 {
  assertUniversalManifestCurrent(value, '0.4')
}

/** v0.5 validation includes cryptography; it does not claim holder/issuer identity. */
export function assertUniversalManifestV05(value: unknown): asserts value is UniversalManifestV05 {
  assertUniversalManifestCurrent(value, '0.5')
}

interface KeyResolutionV05 {
  status: UmKeyRefResolutionV05
  resolve?: (keyRef: string) => string | undefined
  spki?: string
}

function assertUniversalManifestCurrent(value: unknown, version: CurrentVersion, resolution?: KeyResolutionV05): asserts value is CurrentManifest {
  if (!value || typeof value !== 'object') throw new Error('Manifest must be an object')

  const obj = value as Record<string, unknown>

  if (!('@context' in obj)) throw new Error('Missing @context')
  // v0.5 binds packaged normative context bytes before interpreting UM fields.
  // Only trusted references may establish/reset an interpreted object's scope.
  if (version === '0.5') assertTrustedContextsV05(obj)
  // Section 1.2.1: v0.4 manifests MUST use the versioned namespace; Section 6.10
  // rejects a manifest whose @context cannot be matched to the pinned context
  // (context substitution, CONFORMANCE Section 6.7).
  const contextValue = obj['@context']
  const namespace = version === '0.5' ? UM_V05_NAMESPACE : UM_V04_NAMESPACE
  const contextIncludesV04Namespace =
    contextValue === namespace ||
    (Array.isArray(contextValue) && contextValue.some((entry) => entry === namespace))
  if (!contextIncludesV04Namespace) {
    throw new Error(
      `@context must include the v${version} namespace ${namespace} (Section 1.2.1; unmatchable contexts are rejected per Section 6.10)`
    )
  }
  if (typeof obj['@id'] !== 'string' || obj['@id'].length === 0) throw new Error('Missing @id')
  if (!jsonLdTypeIncludes(obj['@type'], 'um:Manifest')) {
    throw new Error('Missing um:Manifest in @type')
  }

  if (obj.manifestVersion !== version) {
    throw new Error(`manifestVersion must be ${version}`)
  }
  if (typeof obj.subject !== 'string' || obj.subject.length === 0) throw new Error('Missing subject')
  assertIsoDateTime(obj.issuedAt, 'issuedAt')
  assertIsoDateTime(obj.expiresAt, 'expiresAt')

  if (Date.parse(obj.issuedAt) > Date.parse(obj.expiresAt)) {
    throw new Error('issuedAt must be <= expiresAt')
  }

  assertOptionalTrustTier(obj.requiredTrustTier, 'requiredTrustTier')

  // Facets (reuse v0.3 facet validator) plus v0.4 per-facet floor shapes.
  if (obj.facets !== undefined) {
    if (!Array.isArray(obj.facets)) throw new Error('facets must be an array')
    for (const facet of obj.facets) {
      assertFacetV03(facet)
      const facetObj = facet as Record<string, unknown>
      const rl = facetObj.requiredLiveness
      if (rl !== undefined) assertRequiredLivenessShape(rl)
      if (facetObj.requiredAssuranceClass !== undefined) {
        assertRequiredAssuranceClassShape(facetObj.requiredAssuranceClass)
      }
    }
  }

  // Claims (v0.4 shape with holderBinding) + VP size limits (Section 6.4.3,
  // EXT-T1 Section T1.5.1: at most 50 KB per embedded VP, 500 KB total).
  if (obj.claims !== undefined) {
    if (!Array.isArray(obj.claims)) throw new Error('claims must be an array')
    let totalVpBytes = 0
    for (const claim of obj.claims) {
      assertClaimV04(claim, version)
      totalVpBytes += measureEmbeddedVpBytes((claim as Record<string, unknown>).claimProof)
    }
    if (totalVpBytes > VP_TOTAL_LIMIT_BYTES) {
      throw new Error(
        'total embedded VP payload across claims exceeds the 500 KB limit (Section 6.4.3, EXT-T1 Section T1.5.1)'
      )
    }
  }

  // Consents (same as v0.3)
  if (obj.consents !== undefined) {
    if (!Array.isArray(obj.consents)) throw new Error('consents must be an array')
    for (const consent of obj.consents) assertConsentV03(consent)
  }

  // Pointers (same as v0.3)
  if (obj.pointers !== undefined) {
    if (!Array.isArray(obj.pointers)) throw new Error('pointers must be an array')
    for (const pointer of obj.pointers) assertPointerV03(pointer)
  }

  // Devices (reserved)
  if (obj.devices !== undefined && !Array.isArray(obj.devices)) {
    throw new Error('devices must be an array (reserved per v0.4 Section 1.4.6)')
  }

  // PresentationProof (optional)
  if (obj.presentationProof !== undefined) {
    assertPresentationProofV04(obj.presentationProof)
  }

  // LivenessAttestation (optional)
  if (obj.livenessAttestation !== undefined) {
    assertLivenessAttestationV04(obj.livenessAttestation)
  }

  // Private-data receipt/session events (shape only; behavioral replay/routing is separate work).
  if (obj.events !== undefined) {
    assertPrivateDataEventsV04(obj.events, 'events')
  }

  // Trust-tier floor invariant (carry forward from v0.3)
  const manifestTier = (obj.requiredTrustTier as UmTrustTier | undefined) ?? 0
  if (Array.isArray(obj.claims)) {
    for (const claim of obj.claims) {
      const claimTier = (claim as { requiredTrustTier?: UmTrustTier }).requiredTrustTier
      if (claimTier !== undefined && claimTier < manifestTier) {
        throw new Error(
          'claim.requiredTrustTier cannot be lower than manifest.requiredTrustTier (Section 6.4.5)'
        )
      }
    }
  }
  if (Array.isArray(obj.facets)) {
    for (const facet of obj.facets) {
      const facetTier = (facet as { requiredTrustTier?: UmTrustTier }).requiredTrustTier
      if (facetTier !== undefined && facetTier < manifestTier) {
        throw new Error(
          'facet.requiredTrustTier cannot be lower than manifest.requiredTrustTier (Section 6.4.5)'
        )
      }
    }
  }

  // agentDelegation: delegatedBy MUST match the manifest subject (Section 6.5.1)
  if (Array.isArray(obj.pointers)) {
    const subject = obj.subject as string
    for (const pointer of obj.pointers) {
      const p = pointer as Record<string, unknown>
      if (p['@type'] === 'um:agentDelegation' && p.delegatedBy !== subject) {
        throw new Error(
          'um:agentDelegation.delegatedBy must match the manifest subject (Section 6.5.1)'
        )
      }
    }
  }

  // Signature. v0.4 recognizes Profile A (Ed25519, default) and Profile B
  // (ES256); the v0.4 signing input additionally excludes presentationProof and
  // postQuantumSignature — Base Section 1.6.3.
  assertSignatureV04(obj.signature, version)
  if (version === '0.5' && resolution?.resolve) {
    resolution.status = 'unresolved'
    const sig = obj.signature as UmSignatureV04
    let spki: string | undefined
    try { spki = resolution.resolve(sig.keyRef) } catch { /* Attempt failed; embedded verification may continue. */ }
    if (spki !== undefined) {
      if (typeof spki !== 'string' || !spki.length) throw new Error('signature.keyRef resolver returned invalid SPKI')
      if (sig.publicKeySpkiB64 && !Buffer.from(spki, 'base64').equals(Buffer.from(sig.publicKeySpkiB64, 'base64'))) {
        throw new Error('signature.publicKeySpkiB64 does not match resolved keyRef key material')
      }
      resolution.spki = spki
      resolution.status = 'resolved'
    }
  }
  verifySignatureV04(obj as unknown as CurrentManifest, version, resolution?.spki)
}

/**
 * Assert that `value` is a valid **and unexpired** v0.4 Universal Manifest.
 *
 * Runs full structural + signature validation via
 * {@link assertUniversalManifestV04}, then checks freshness with 60-second
 * clock-skew tolerance (carry forward from v0.3).
 */
export function assertUniversalManifestV04Fresh(
  value: unknown,
  now: Date = new Date()
): asserts value is UniversalManifestV04 {
  assertUniversalManifestCurrentFresh(value, now, '0.4')
}

export function assertUniversalManifestV05Fresh(value: unknown, now: Date = new Date()): asserts value is UniversalManifestV05 {
  assertUniversalManifestCurrentFresh(value, now, '0.5')
}

function assertUniversalManifestCurrentFresh(value: unknown, now: Date, version: CurrentVersion): asserts value is CurrentManifest {
  assertUniversalManifestCurrent(value, version)

  const manifest = value as UniversalManifestV04
  const expiresMs = Date.parse(manifest.expiresAt)
  const issuedMs = Date.parse(manifest.issuedAt)
  const nowMs = now.getTime()
  const SKEW_MS = 60_000

  if (nowMs > expiresMs) throw new Error('Manifest expired')
  if (issuedMs - nowMs > SKEW_MS) {
    throw new Error('Manifest issuedAt is more than 60s in the future (stale)')
  }
}

// =====================================================================
// v0.4 — Six-stage evaluation sequence
//
// Extends the v0.3 evaluator with v0.4 constructs. The six stages remain
// identical: Arrive, Verify, Project, Consent, Compose, Receipt.
// =====================================================================

/** v0.4 evaluation context extends v0.3 */
export interface UmEvaluationContextV04 extends UmEvaluationContext {
  /** When true, require holderBinding on Tier 1+ claims (strict v0.4 mode). */
  requireHolderBinding?: boolean
  /** Authenticator assurance class reached by the presented unlock gesture. Defaults fail-closed to `software`. */
  presentedAssuranceClass?: UmAssuranceClass
  /**
   * The nonce this evaluator issued for an interactive presentation
   * (EXT-T1 Section T1.2). When set, the manifest MUST carry a
   * `presentationProof` whose `challenge` matches; absence or mismatch is
   * replay-suspect and rejects the manifest for interactive verification
   * (EXT-T1 Section T1.4 sub-step 2b).
   */
  verifierChallenge?: string
  /** This verifier's identifier; when set alongside `verifierChallenge`, the proof's `audience` MUST match it (EXT-T1 Section T1.2). */
  verifierAudience?: string
  /**
   * Validator for a `livenessAttestation`'s `proofValue` under the mechanics of
   * its declared `proofType` (EXT-T1 Section T1.3). Absent — the default, and
   * what this reference ships — means no attestation can be *validated*, so
   * EXT-T1 Section T1.4 sub-step 2c makes every present attestation
   * **unvalidated** and it satisfies no `requiredLiveness` floor.
   *
   * Supplying one is a claim that this evaluator can actually perform the
   * validation. It is never a way to declare presence without evidence: a
   * validator that throws refuses the attestation. A legacy empty success is
   * context-unbound and also cannot satisfy a floor; use the V1 factory and
   * wrapper for contextual evidence and proof-derived UV.
   */
  livenessProofValidator?: UmLivenessProofValidator
}

/** Result of {@link evaluateUniversalManifestV04}. */
export interface UmEvaluationResultV04 {
  receipt: UmReceiptV03
  manifest?: UniversalManifestV04
}

export interface UmEvaluationContextV05 extends UmEvaluationContextV04 {
  /** Opt in to bounded offline did:key signing-key resolution; never grants identity trust. */
  offlineKeyResolution?: boolean
  /** Optional application lookup, mutually exclusive with offlineKeyResolution: true. */
  resolveKeyRef?: (keyRef: string) => string | undefined
}
export interface UmEvaluationResultV05 {
  receipt: UmReceiptV05
  manifest?: UniversalManifestV05
}

export function evaluateUniversalManifestV05(value: unknown, context: UmEvaluationContextV05 = {}): UmEvaluationResultV05 {
  return evaluateUniversalManifestV05Internal(value, context)
}

/** Opt-in local evidence; subject authorization never changes the receipt schema or grants a trust tier. */
export interface UmEvaluationResultWithSubjectKeyAuthorizationV05 extends UmEvaluationResultV05 {
  subjectKeyAuthorization: UmSubjectKeyAuthorizationV05
}

/** The caller must authenticate the separate DID document and establish its currency before this call. */
export function evaluateUniversalManifestV05WithSubjectKeyAuthorization(
  value: unknown, context: UmEvaluationContextV05, authenticatedSubjectDidDocument: string,
): UmEvaluationResultWithSubjectKeyAuthorizationV05 {
  const authorization = { document: authenticatedSubjectDidDocument,
    diagnostic: { status: 'not-evaluated', reason: 'outer-verification-not-complete' } as UmSubjectKeyAuthorizationV05 }
  let input: unknown
  let snapshot: UmEvaluationContextV05
  try {
    input = structuredClone(value)
    const { resolveKeyRef, resolveRevocation, livenessProofValidator, ...data } = context ?? {}
    snapshot = { ...structuredClone(data), resolveKeyRef, resolveRevocation, livenessProofValidator }
  } catch {
    const result = evaluateUniversalManifestV05(undefined)
    result.receipt.warnings = [{ code: 'um:reason:structure:malformed', message: 'Subject authorization requires snapshot-safe input and context' }]
    return { ...result, subjectKeyAuthorization: authorization.diagnostic }
  }
  const result = evaluateUniversalManifestV05Internal(input, snapshot, authorization)
  return { ...result, subjectKeyAuthorization: authorization.diagnostic }
}

function evaluateUniversalManifestV05Internal(
  value: unknown, context: UmEvaluationContextV05,
  authorization?: { document: unknown; diagnostic: UmSubjectKeyAuthorizationV05 },
): UmEvaluationResultV05 {
  // Runtime callers may bypass the TypeScript context shape. Missing intent
  // cannot grant consent, and an invalid clock cannot establish a time window.
  if (!context || typeof context !== 'object' || Array.isArray(context)) context = {}
  const contextError = context.now !== undefined && (!(context.now instanceof Date) || !Number.isFinite(context.now.getTime()))
    ? 'Evaluation context requires a valid Date clock'
    : context.maxSupportedTrustTier !== undefined && !isTrustTier(context.maxSupportedTrustTier)
      ? 'Evaluation context maxSupportedTrustTier must be a tier from 0 through 3'
      : context.offlineKeyResolution !== undefined && typeof context.offlineKeyResolution !== 'boolean'
        ? 'Evaluation context offlineKeyResolution must be boolean'
        : context.offlineKeyResolution === true && context.resolveKeyRef !== undefined
          ? 'Evaluation context cannot combine offlineKeyResolution and resolveKeyRef'
          : undefined
  if (contextError) {
    const manifestId = value && typeof value === 'object' && '@id' in value && typeof value['@id'] === 'string' ? value['@id'] : ''
    return { receipt: {
      '@type': 'um:Receipt', manifestId,
      outcome: 'rejected', signatureCheck: 'not-evaluated', freshnessCheck: 'not-evaluated',
      facetStatuses: [], keyRefResolution: 'not-attempted',
      presentationProofStatus: value && typeof value === 'object' && 'presentationProof' in value ? 'not-evaluated' : 'absent',
      warnings: [{ code: 'um:reason:structure:malformed', message: contextError }],
    } }
  }
  const resolution: KeyResolutionV05 = { status: 'not-attempted',
    resolve: context.offlineKeyResolution === true ? resolveOfflineDidKey : context.resolveKeyRef }
  const result = evaluateUniversalManifestV04Internal(value, context, undefined, '0.5', resolution, authorization)
  result.receipt.keyRefResolution ??= resolution.status
  if (result.receipt.signatureCheck === 'valid') result.receipt.effectiveTrustTier ??= 0
  if (value && typeof value === 'object') {
    const proof = (value as Record<string, unknown>).presentationProof
    result.receipt.presentationProofStatus ??= proof === undefined ? 'absent' : 'not-evaluated'
  }
  return result as UmEvaluationResultV05
}

/** Explicit application-trusted keys, not DID resolution or key-purpose evidence. */
export interface UmEvaluationContextWithSdJwtV05 extends UmEvaluationContextV05 {
  sdJwtHolderBinding?: UmSdJwtHolderBindingKeysV05
}

/**
 * Async RFC9901 claim-holder verification after the existing v0.5 evaluator.
 * Requires a pinned clock, verifier challenge/audience and a valid root did-auth
 * presentation. Root sd-jwt-kb remains PREVIEW and fails closed. Successful
 * holder cryptography does not establish DID authority or raise achieved Tier0.
 * The synchronous evaluator remains unchanged for existing callers.
 */
export async function evaluateUniversalManifestV05WithSdJwtHolderBinding(
  value: unknown, context: UmEvaluationContextWithSdJwtV05 = {}
): Promise<UmEvaluationResultV05> {
  return evaluateWithSdJwtV05(value, context)
}

/** Opt-in issuer relationship evidence, kept outside the serialized receipt. */
export interface UmEvaluationResultWithIssuerKeyAuthorizationV05 extends UmEvaluationResultV05 {
  issuerKeyAuthorization: UmIssuerKeyAuthorizationV05
}

/** The caller authenticates each raw issuer document and establishes its currency. */
export async function evaluateUniversalManifestV05WithSdJwtIssuerKeyAuthorization(
  value: unknown, context: UmEvaluationContextWithSdJwtV05, authenticatedIssuerDidDocuments: Readonly<Record<string, string>>,
): Promise<UmEvaluationResultWithIssuerKeyAuthorizationV05> {
  const authorization = { documents: authenticatedIssuerDidDocuments as unknown, diagnostic: unexecutedIssuerAuthorizationV05(undefined), canonicalize: canonicalizeJson }
  const result = await evaluateWithSdJwtV05(value, context, authorization)
  return { ...result, issuerKeyAuthorization: authorization.diagnostic }
}

async function evaluateWithSdJwtV05(
  value: unknown, context: UmEvaluationContextWithSdJwtV05,
  authorization?: { documents: unknown; diagnostic: UmIssuerKeyAuthorizationV05; canonicalize: (value: unknown) => string },
): Promise<UmEvaluationResultV05> {
  let input: unknown
  let snapshot: UmEvaluationContextWithSdJwtV05
  try {
    // No caller-owned object survives into the async processor. Preserve only
    // the existing synchronous callbacks; clone all their data inputs as well.
    input = structuredClone(value)
    const { resolveKeyRef, resolveRevocation, livenessProofValidator, ...data } = context ?? {}
    snapshot = { ...structuredClone(data), resolveKeyRef, resolveRevocation, livenessProofValidator }
    if (authorization) {
      authorization.documents = structuredClone(authorization.documents)
      authorization.diagnostic = unexecutedIssuerAuthorizationV05(input)
    }
  } catch {
    const result = evaluateUniversalManifestV05(undefined)
    result.receipt.warnings = [{ code: 'um:reason:structure:malformed', message: 'SD-JWT evaluation requires snapshot-safe input and context' }]
    return result
  }
  const result = structuredClone(evaluateUniversalManifestV05(input, snapshot))
  if (result.receipt.outcome === 'rejected' || result.receipt.signatureCheck !== 'valid'
    || result.receipt.freshnessCheck !== 'fresh' || !result.manifest) return result
  await evaluateSdJwtHolderBindingsV05(result, snapshot, parseIJsonDocument, authorization)
  return result
}

/**
 * Evaluate a Universal Manifest through the v0.4 six-stage sequence.
 *
 * Extends the v0.3 pipeline with v0.4 structural validation (holderBinding,
 * presentationProof, livenessAttestation, bindingProof, ceremonyProof), the
 * Stage-2 credential-binding sub-steps of EXT-T1 Section T1.4, and the v0.4
 * extended receipt-disposition vocabulary (Base Section 3.3.1 / 3.3.1.1):
 * `not-evaluated` stage recording, `keyRefResolution`, per-claim
 * `claimStatuses`, `unprocessedEntries`, the credential-binding status fields
 * (`holderBindingStatus`, `presentationProofStatus`, `livenessStatus`,
 * `effectiveTrustTier`), and the consent denial statuses of Section 3.1.4.
 * The receipt `@type` remains `um:Receipt`.
 *
 * v0.3 manifests are processed through the EXT-T1 Section T1.6.4 backwards-
 * compatibility path: parsed and evaluated with the effective trust tier
 * capped at Tier 0 and the binding statuses recorded as absent/unknown.
 */
export function evaluateUniversalManifestV04(
  value: unknown,
  context: UmEvaluationContextV04 = {}
): UmEvaluationResultV04 {
  return evaluateUniversalManifestV04Internal(value, context) as UmEvaluationResultV04
}

/** Protected application view: only facets actually processed by this evaluation. */
export interface UmEvaluationWithLivenessV1 {
  receipt: UmReceiptV03
  manifest: { facets: UmFacetV04[] }
  localLivenessDiagnosticsV1: UmLivenessProofResultV1
}

export function evaluateUniversalManifestV04WithLivenessV1(
  value: unknown, context: UmEvaluationContextV04,
  validation?: UmContextualLivenessValidatorV1
): UmEvaluationWithLivenessV1 {
  if (!context.now || !Number.isSafeInteger(context.now.getTime())) throw new Error('V1 requires a pinned evaluation clock')
  if (validation !== undefined && !(validation instanceof UmContextualLivenessValidatorV1)) throw new Error('V1 requires the installed contextual validator')
  const local = { validation, proof: unexecutedLivenessV1() }
  const result = evaluateUniversalManifestV04Internal(value, context, local) as UmEvaluationResultV04
  const facets = result.receipt.signatureCheck === 'valid'
    ? (result.manifest?.facets ?? []).filter((_, i) => ['processed', 'written'].includes(result.receipt.facetStatuses[i]?.status))
    : []
  const diagnostics = { ...local.proof, facetDecisions: result.receipt.facetStatuses.map(f => ({
    facetId: f.facetId, status: f.status, ...(f.reason ? { reason: f.reason } : {}),
    ...(f.status === 'assuranceInsufficient' && !f.assuranceStatus && local.proof.failureCode ? { livenessFailureCode: local.proof.failureCode } : {}),
  })) }
  return { receipt: result.receipt, manifest: { facets: structuredClone(facets) }, localLivenessDiagnosticsV1: freezeLivenessV1(diagnostics) }
}

/** Base Section 6.3 defaults. A megabyte is 1,000,000 octets, measured over the JCS-canonical form. */
const MAX_MANIFEST_BYTES_V05 = 1_000_000
const MAX_NESTING_DEPTH_V05 = 10
const MAX_ARRAY_LENGTH_V05 = 1_000

/**
 * The same checks and reason codes as Rust's `limits.rs`. Depth counts containers, with the manifest
 * object as level 1. The walk is iterative, so a deep payload cannot exhaust the stack before it is refused.
 */
function resourceLimitExceededV05(root: unknown): UmReceiptWarning | undefined {
  const stack: Array<[unknown, number]> = [[root, 1]]
  while (stack.length > 0) {
    const [item, depth] = stack.pop() as [unknown, number]
    if (Array.isArray(item)) {
      if (item.length > MAX_ARRAY_LENGTH_V05) return { code: 'um:reason:structure:array-limit-exceeded', message: `Arrive stage: manifest carries an array of ${item.length} entries, over the Base Section 6.3 ceiling of ${MAX_ARRAY_LENGTH_V05}` }
      if (depth > MAX_NESTING_DEPTH_V05) return { code: 'um:reason:structure:depth-limit-exceeded', message: `Arrive stage: manifest nests ${depth} levels, over the Base Section 6.3 ceiling of ${MAX_NESTING_DEPTH_V05}` }
      for (const child of item) stack.push([child, depth + 1])
    } else if (item && typeof item === 'object') {
      if (depth > MAX_NESTING_DEPTH_V05) return { code: 'um:reason:structure:depth-limit-exceeded', message: `Arrive stage: manifest nests ${depth} levels, over the Base Section 6.3 ceiling of ${MAX_NESTING_DEPTH_V05}` }
      for (const child of Object.values(item)) stack.push([child, depth + 1])
    }
  }
  // The shape is bounded here, so canonicalizing is bounded work. A v0.5 manifest as received must be
  // I-JSON as a whole, including members outside the signing input, so one that cannot canonicalize is refused here.
  let measured: number
  try {
    measured = Buffer.byteLength(canonicalizeJson(root), 'utf8')
  } catch (error) {
    return { code: 'um:reason:structure:malformed', message: `Arrive stage: manifest is not I-JSON and cannot be canonicalized (${error instanceof Error ? error.message : String(error)})` }
  }
  if (measured > MAX_MANIFEST_BYTES_V05) return { code: 'um:reason:structure:size-limit-exceeded', message: `Arrive stage: manifest is ${measured} canonical bytes, over the Base Section 6.3 ceiling of ${MAX_MANIFEST_BYTES_V05} (1 MB)` }
  return undefined
}

function evaluateUniversalManifestV04Internal(
  value: unknown, context: UmEvaluationContextV05,
  local?: { validation?: UmContextualLivenessValidatorV1; proof: UmLivenessProofResultV1 },
  version: CurrentVersion = '0.4', resolution?: KeyResolutionV05,
  authorization?: { document: unknown; diagnostic: UmSubjectKeyAuthorizationV05 },
): { receipt: CurrentReceipt; manifest?: CurrentManifest } {
  const now = context.now ?? new Date()
  const warnings: UmReceiptWarning[] = []

  // Stage 1: Arrive. Stages not reached record "not-evaluated" (Section 3.3.1).
  if (!value || typeof value !== 'object') {
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId: '',
        outcome: 'rejected',
        signatureCheck: 'not-evaluated',
        freshnessCheck: 'not-evaluated',
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          { code: 'um:reason:structure:malformed', message: 'Arrive stage: value is not an object' },
        ],
      },
    }
  }

  const obj = value as Record<string, unknown>
  const manifestId = typeof obj['@id'] === 'string' ? obj['@id'] : ''

  // Base Section 6.3 resource limits, on the v0.5 path only. v0.4 is published and keeps its rules.
  const exceeded = version === '0.5' ? resourceLimitExceededV05(value) : undefined
  if (exceeded) {
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck: 'not-evaluated',
        freshnessCheck: 'not-evaluated',
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        ...(context.evaluatorId ? { evaluatorId: context.evaluatorId } : {}),
        warnings: [exceeded],
      },
    }
  }

  // EXT-T1 Section T1.6.4 backwards compatibility: a v0.3 manifest is parsed
  // and processed through the six-stage sequence with the effective trust tier
  // capped at Tier 0 and the credential-binding statuses recorded as
  // absent/unknown. The declared requiredTrustTier still governs the outcome
  // per Section 6.4.5 (a Tier-1+ manifest floor is unsatisfiable at Tier 0).
  if (obj.manifestVersion === '0.3') {
    const v03Result = evaluateUniversalManifestV03(value, { ...context, maxSupportedTrustTier: 0 })
    const receipt = v03Result.receipt
    receipt.holderBindingStatus = 'absent'
    receipt.presentationProofStatus = 'absent'
    receipt.livenessStatus = { freshnessClass: 'unknown' }
    receipt.effectiveTrustTier = 0
    receipt.warnings = [
      ...(receipt.warnings ?? []),
      {
        code: 'um:reason:trust:unbound-claims',
        message:
          'v0.3 manifest processed without holder binding; effective trust tier capped at Tier 0 (EXT-T1 Section T1.6.4)',
      },
    ]
    if (receipt.outcome === 'accepted') receipt.outcome = 'accepted-with-warnings'
    return { receipt }
  }

  // Stage 2: Verify — structural + signature + freshness
  let signatureCheck: UmSignatureCheck = 'not-evaluated'
  let freshnessCheck: UmFreshnessCheck = 'not-evaluated'
  try {
    assertUniversalManifestCurrent(value, version, resolution)
    signatureCheck = 'valid'
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (
      message.includes('signature.algorithm') ||
      message.includes('signature.canonicalization')
    ) {
      // Section 1.6.5: unknown/unsupported profile pairs are recorded as such.
      signatureCheck = 'unsupported-profile'
    } else if (
      message.includes('Signature verification failed') ||
      message.includes('signature.publicKeySpkiB64') ||
      // Covers "Missing signature.value" and the Profile B raw-R||S encoding
      // rejection (a DER-encoded value is a malformed value under a recognized
      // profile, so it is "invalid", not "unsupported-profile").
      message.includes('signature.value') ||
      message.includes('signature.keyRef')
    ) {
      signatureCheck = 'invalid'
    } else {
      // Structural (Arrive-stage) failure: the signature and freshness checks
      // were never reached, so both record "not-evaluated" (Section 3.3.1).
      signatureCheck = 'not-evaluated'
    }
    const verifyFailureCode =
      signatureCheck === 'unsupported-profile'
        ? 'um:reason:crypto:unsupported-profile'
        : signatureCheck === 'invalid'
          ? 'um:reason:crypto:signature-invalid'
          : 'um:reason:structure:malformed'
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck: 'not-evaluated',
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [{ code: verifyFailureCode, message: `Verify stage: ${message}` }],
      },
    }
  }

  const manifest = value as CurrentManifest

  // Key selection may resolve a signing method in v0.5. Neither resolution nor
  // embedded self-consistency establishes subject/issuer identity authority.
  const keyRefResolution = version === '0.5' ? (resolution?.status ?? 'not-attempted') : 'unresolved'

  const issuedMs = Date.parse(manifest.issuedAt)
  const expiresMs = Date.parse(manifest.expiresAt)
  const nowMs = now.getTime()
  const SKEW_MS = 60_000
  if (issuedMs - nowMs > SKEW_MS) {
    freshnessCheck = 'stale'
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck,
        keyRefResolution,
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          { code: 'um:reason:freshness:stale', message: 'Verify stage: issuedAt more than 60s in the future' },
        ],
      },
      manifest,
    }
  }
  if (nowMs > expiresMs) {
    freshnessCheck = 'expired'
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck,
        keyRefResolution,
        facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          { code: 'um:reason:freshness:expired', message: 'Verify stage: manifest expired' },
        ],
      },
      manifest,
    }
  }
  freshnessCheck = 'fresh'

  if (authorization) {
    authorization.diagnostic = checkSubjectKeyAuthorizationV05(authorization.document, manifest.subject,
      manifest.signature.keyRef, resolution?.spki ?? manifest.signature.publicKeySpkiB64, parseIJsonDocument, canonicalizeJson)
    if (authorization.diagnostic.status === 'failed') {
      return { receipt: {
        '@type': 'um:Receipt', manifestId, outcome: 'rejected', signatureCheck, freshnessCheck,
        keyRefResolution, facetStatuses: [],
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [{ code: 'um:reason:trust:unbound-claims',
          message: `Subject signing-key authorization failed: ${authorization.diagnostic.reason}` }],
      }, manifest }
    }
  }

  // Revocation status (EXT-OPT Section O2.3 semantics)
  let revocationStatus: UmRevocationStatus = 'unchecked'
  if (manifest.signature.statusRef) {
    if (context.resolveRevocation) {
      revocationStatus = context.resolveRevocation(
        manifest.signature.statusRef,
        manifest.signature.revocationCursor
      )
      if (revocationStatus === 'revoked') {
        return {
          receipt: {
            '@type': 'um:Receipt',
            manifestId,
            outcome: 'rejected',
            signatureCheck,
            freshnessCheck,
            keyRefResolution,
            facetStatuses: [],
            revocationStatus,
            ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
            warnings: [
              { code: 'um:reason:status:revoked', message: 'Verify stage: signature is revoked' },
            ],
          },
          manifest,
        }
      }
      if (revocationStatus === 'suspended') {
        // EXT-OPT Section O2.3: suspended is treated as accepted-with-warnings.
        warnings.push({
          code: 'um:reason:status:suspended',
          message: 'Verify stage: manifest status is suspended (EXT-OPT Section O2.3)',
        })
      }
    } else {
      revocationStatus = 'unchecked'
      warnings.push({
        code: 'um:reason:status:unchecked',
        message:
          'Verify stage: signature.statusRef present but evaluator does not implement revocation resolution',
      })
    }
  }

  // Stage-2 sub-step 2b: presentation-proof verification (EXT-T1 Section T1.4).
  let presentationProofStatus: UmPresentationProofStatus | 'not-evaluated' | undefined
  const presentationProof = manifest.presentationProof
  if (typeof context.verifierChallenge === 'string' && context.verifierChallenge.length > 0) {
    let rejectReason: string | undefined
    if (!presentationProof) {
      // The evaluator issued a challenge and no proof is present: replay-suspect;
      // record "missing-required" and reject for interactive verification (EXT-T1 Section T1.2).
      presentationProofStatus = version === '0.5' ? 'absent' : 'missing-required'
      rejectReason =
        'presentationProof absent for a verifier-issued challenge — replay-suspect, rejected for interactive verification (EXT-T1 Section T1.2)'
    } else if (presentationProof.challenge !== context.verifierChallenge) {
      presentationProofStatus = 'failed'
      rejectReason = 'presentationProof.challenge does not match the verifier-issued nonce (EXT-T1 Section T1.4 sub-step 2b)'
    } else if (
      typeof context.verifierAudience === 'string' &&
      context.verifierAudience.length > 0 &&
      presentationProof.audience !== context.verifierAudience
    ) {
      presentationProofStatus = 'failed'
      rejectReason = 'presentationProof.audience does not match this verifier (EXT-T1 Section T1.4 sub-step 2b)'
    } else if (version === '0.5' && !context.verifierAudience) {
      presentationProofStatus = 'not-evaluated'
      rejectReason = 'Interactive verification requires the intended verifier audience'
    } else if (presentationProof.proofType === 'did-auth') {
      // The reference implementation validates the did-auth mechanics: an
      // Ed25519 signature by the manifest signing key over the signing-input
      // hash || challenge || audience || created (EXT-T1 Section T1.2).
      if (verifyDidAuthPresentationProof(manifest, presentationProof, version, resolution?.spki)) {
        presentationProofStatus = 'verified'
      } else {
        presentationProofStatus = 'failed'
        rejectReason =
          'presentationProof.proofValue does not validate over the signing-input hash, challenge, audience, and created (EXT-T1 Section T1.2)'
      }
    } else {
      // sd-jwt-kb / bbs-derived proof mechanics are not implemented by this
      // evaluator; an unvalidatable proof cannot be accepted for interactive
      // verification (fail closed, EXT-T1 Section T1.4 sub-step 2b).
      presentationProofStatus = version === '0.5' ? 'not-evaluated' : 'failed'
      rejectReason = `presentationProof.proofType "${presentationProof.proofType}" cannot be validated by this evaluator — treated as failed for interactive verification (EXT-T1 Section T1.4 sub-step 2b)`
    }
    if (rejectReason) {
      return {
        receipt: {
          '@type': 'um:Receipt',
          manifestId,
          outcome: 'rejected',
          signatureCheck,
          freshnessCheck,
          keyRefResolution,
          revocationStatus,
          presentationProofStatus,
          facetStatuses: [],
          ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
          warnings: [
            {
              code:
                !presentationProof
                  ? 'um:reason:trust:presentation-proof-missing'
                  : 'um:reason:trust:presentation-proof-failed',
              message: `Verify stage (2b): ${rejectReason}`,
            },
            ...warnings,
          ],
        },
        manifest,
      }
    }
  }

  // Stage-2 sub-step 2c (EXT-T1 Section T1.3 / T1.4) is ONE step with TWO
  // outputs, and this is the only place either is produced:
  //
  //   "If a livenessAttestation is present, VERIFY ITS PROOF and compute its
  //    freshnessClass from attestedAt and validUntil … An evaluator that cannot
  //    validate the attestation's proofType records the temporal freshnessClass
  //    with the attestation treated as UNVALIDATED: it MUST NOT satisfy any
  //    requiredLiveness floor (Section T1.3.1) and MUST NOT be treated as
  //    evidence of human presence."
  //
  // Both halves are computed here, together, deliberately (KNOWN-FINDINGS L1).
  // Until 2026-07-26 this reference computed only the temporal half and had no
  // notion of proof validation at all, so an attestation with a proofType
  // nothing implements and a nonsense proofValue cleared a requiredLiveness
  // floor. The Rust core had the verdict available and never asked the floor
  // for it; this implementation did not compute it. Same defect, two shapes.
  //
  // Note what is deliberately NOT changed: livenessStatus.freshnessClass still
  // records the TEMPORAL class, exactly as sub-step 2c instructs, so the
  // receipt's wire shape is untouched.
  let livenessStatus: UmReceiptLivenessStatus | undefined
  if (manifest.livenessAttestation) {
    const attestation = manifest.livenessAttestation
    livenessStatus = {
      freshnessClass: classifyLivenessFreshness(attestation, now),
      ...(attestation.method !== undefined ? { method: attestation.method } : {}),
      ...(attestation.userVerified !== undefined ? { userVerified: attestation.userVerified } : {}),
    }
  }
  // One proof result supplies the floors and local observations. The receipt's
  // historical holder/temporal echo remains a separate serialization concern.
  let contextual = local?.validation?.evaluate(manifest as unknown as Record<string, unknown>, nowMs)
  if (contextual && manifest.livenessAttestation) {
    const att = manifest.livenessAttestation
    const binding = contextual.binding
    const carrierHash = att.proofValue.length <= 21846
      ? createHash('sha256').update(Buffer.from(att.proofValue, 'base64url')).digest('hex') : undefined
    if (binding.expectedSubject !== manifest.subject || binding.attestedAt !== att.attestedAt
      || binding.proofType !== att.proofType || (contextual.status === 'validated' && binding.carrierSha256 !== carrierHash)) {
      contextual = { ...unexecutedLivenessV1(), status: 'failed', failureCode: 'result-binding-mismatch' }
    }
  }
  let livenessProof: UmLivenessProofValidity
  if (contextual) {
    local!.proof = contextual
    livenessProof = contextual.status === 'absent' ? { kind: 'absent' }
      : contextual.status === 'validated' ? { kind: 'validated', proofType: String(contextual.binding.proofType) }
        : { kind: 'unvalidated', proofType: String(contextual.binding.proofType ?? ''), reason: 'contextual liveness proof did not validate' }
  } else {
    livenessProof = livenessProofValidity(manifest, context.livenessProofValidator)
    if (local) {
      const absent = livenessProof.kind === 'absent'
      local.proof = { ...unexecutedLivenessV1(),
        status: absent ? 'absent' : context.livenessProofValidator && livenessProof.kind === 'unvalidated' && livenessProof.reason !== 'legacy-context-unbound' ? 'failed' : 'not-evaluated',
        binding: manifest.livenessAttestation ? { expectedSubject: manifest.subject, attestedAt: manifest.livenessAttestation.attestedAt, proofType: manifest.livenessAttestation.proofType } : {},
        checksExecuted: absent ? [] : ['legacy-adapter'],
        failureCode: absent ? undefined : context.livenessProofValidator ? (livenessProof.kind === 'unvalidated' && livenessProof.reason === 'legacy-context-unbound' ? 'legacy-context-unbound' : 'legacy-validator-failed') : 'validator-unavailable' }
    }
  }
  const usableLiveness: UmReceiptLivenessStatus | undefined = livenessProof.kind === 'absent' ? undefined : {
    freshnessClass: contextual?.usableFreshness ?? 'unknown',
    userVerified: contextual?.authenticatedFlags?.userVerified,
  }

  // Agent-delegation temporal and fail-closed checks (Section 6.5.1;
  // CONFORMANCE Section 6.8: expired delegations MUST be rejected).
  if (Array.isArray(manifest.pointers)) {
    for (const pointer of manifest.pointers) {
      const p = pointer as Record<string, unknown>
      if (p['@type'] !== 'um:agentDelegation') continue
      if (typeof p.expiresAt === 'string' && Date.parse(p.expiresAt) < nowMs) {
        return {
          receipt: {
            '@type': 'um:Receipt',
            manifestId,
            outcome: 'rejected',
            signatureCheck,
            freshnessCheck,
            keyRefResolution,
            revocationStatus,
            ...(presentationProofStatus !== undefined ? { presentationProofStatus } : {}),
            ...(livenessStatus !== undefined ? { livenessStatus } : {}),
            facetStatuses: [],
            ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
            warnings: [
              {
                code: 'um:reason:delegation:expired',
                message:
                  'Verify stage: um:agentDelegation is past its expiresAt — rejected (Section 6.5.1; CONFORMANCE Section 6.8)',
              },
              ...warnings,
            ],
          },
          manifest,
        }
      }
      if (!Array.isArray(p.scope) || p.scope.length === 0) {
        warnings.push({
          code: 'um:reason:delegation:empty-scope',
          message:
            'Consent stage: um:agentDelegation with absent or empty scope grants no capabilities (fail closed, Section 6.5.1)',
        })
      }
      if (typeof p.delegateId !== 'string' || p.delegateId.length === 0) {
        warnings.push({
          code: 'um:reason:delegation:unattributed',
          message:
            'Consent stage: um:agentDelegation without delegateId is not attributed to any agent and grants no delegated authority (fail closed, Section 6.5.1)',
        })
      }
    }
  }

  // Stage 3: Project
  const projectedFacets = Array.isArray(manifest.facets) ? manifest.facets : []
  const manifestTier = manifest.requiredTrustTier ?? 0
  // A configured capability ceiling is not achieved trust. This v0.5 evaluator
  // executes no Tier1+ identity/claim-binding chain, even after a key lookup.
  const maxSupportedTier = context.maxSupportedTrustTier ?? 0
  const implementedTrustTier = version === '0.5' ? 0 : maxSupportedTier
  const presentedAssuranceClass = isAssuranceClass(context.presentedAssuranceClass)
    ? context.presentedAssuranceClass
    : 'software'

  if (manifestTier > implementedTrustTier) {
    return {
      receipt: {
        '@type': 'um:Receipt',
        manifestId,
        outcome: 'rejected',
        signatureCheck,
        freshnessCheck,
        keyRefResolution,
        revocationStatus,
        ...(presentationProofStatus !== undefined ? { presentationProofStatus } : {}),
        ...(livenessStatus !== undefined ? { livenessStatus } : {}),
        facetStatuses: projectedFacets.map((facet) => ({
          facetId: facet['@id'],
          name: facet.name,
          status: 'trustTierUnsupported' as UmFacetStatusValue,
          reason: `manifest requiredTrustTier ${manifestTier} exceeds evaluator capability ${implementedTrustTier}`,
        })),
        ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
        warnings: [
          {
            code: 'um:reason:trust:tier-unsupported',
            message: `Compose stage: manifest-level requiredTrustTier ${manifestTier} exceeds evaluator capability ${implementedTrustTier}`,
          },
          ...warnings,
        ],
      },
      manifest,
    }
  }

  // Stage-2 sub-steps 2a/2d recording, per-claim statuses, and trust-tier
  // capping (Section 6.4.5; EXT-T1 Sections T1.0/T1.1/T1.4). The reference
  // implementation does not execute the cryptographic binding/claim-proof
  // chains, so recognized claims record "unverified" rather than "verified".
  const recognizedClaimTypes = new Set(['identity.crossDidBinding'])
  const claimStatuses: UmReceiptClaimStatus[] = []
  let holderBindingStatus: UmHolderBindingStatus | undefined
  let effectiveTrustTier: UmTrustTier | undefined
  if (Array.isArray(manifest.claims)) {
    for (const claim of manifest.claims) {
      const claimObj = claim as Record<string, unknown>
      const claimRef =
        typeof claimObj['@id'] === 'string' && (claimObj['@id'] as string).length > 0
          ? (claimObj['@id'] as string)
          : (claimObj['@type'] as string)
      const claimTier = Math.max(
        manifestTier,
        (claim.requiredTrustTier as UmTrustTier | undefined) ?? 0
      ) as UmTrustTier
      const carriesBindingMaterial =
        claim.holderBinding !== undefined ||
        claim.bindingProof !== undefined ||
        claim.ceremonyProof !== undefined
      if (claimTier > maxSupportedTier) {
        // Section 6.4.5: no implemented verification profile for the required
        // tier — treat as unverifiable, record trustTierUnsupported, never downgrade.
        claimStatuses.push({
          claimRef,
          status: 'trustTierUnsupported',
          tier: maxSupportedTier as UmTrustTier,
          reason: `claim requiredTrustTier ${claimTier} exceeds evaluator capability ${maxSupportedTier} (Section 6.4.5)`,
        })
        continue
      }
      if (claimTier >= 1 && !carriesBindingMaterial) {
        // EXT-T1 Sections T1.0/T1.1: a claim relied upon at Tier 1+ without any
        // binding material (holderBinding, or a Tier-2/Tier-3 bindingProof /
        // ceremonyProof) is capped at Tier 0; the receipt records
        // holderBindingStatus "absent" and the effective trust tier achieved.
        claimStatuses.push({
          claimRef,
          status: 'trustTierUnsupported',
          tier: 0,
          reason: 'claim relied upon at Tier 1+ carries no holderBinding — capped at Tier 0 (EXT-T1 Section T1.1)',
        })
        holderBindingStatus = 'absent'
        effectiveTrustTier = 0
        continue
      }
      if (version === '0.5' && claimTier > implementedTrustTier) {
        claimStatuses.push({
          claimRef, status: 'trustTierUnsupported', tier: 0,
          reason: `claim requiredTrustTier ${claimTier} has no implemented identity/claim-binding verification chain (achieved Tier0)`,
        })
        continue
      }
      if (!recognizedClaimTypes.has(claimObj['@type'] as string)) {
        // Section 1.4.3: an unrecognized claim @type is unprocessable —
        // present but unverifiable above Tier 0.
        claimStatuses.push({
          claimRef,
          status: 'unprocessable',
          tier: 0,
          reason: 'unrecognized claim @type — present but unverifiable above Tier 0 (Section 1.4.3)',
        })
        continue
      }
      claimStatuses.push({
        claimRef,
        status: 'unverified',
        tier: 0,
        reason: 'claim-proof verification chain not executed by this evaluator (EXT-T1 Section T1.5.1)',
      })
    }
  }

  // Unrecognized pointer types are recorded present but not acted on
  // (Section 1.4.5; receipt field per Section 3.3.1).
  const unprocessedEntries: UmReceiptUnprocessedEntry[] = []
  if (Array.isArray(manifest.pointers)) {
    for (const pointer of manifest.pointers) {
      const p = pointer as Record<string, unknown>
      const pointerType = p['@type'] as string
      if (pointerType === 'um:agentDelegation') continue
      unprocessedEntries.push({
        kind: 'pointer',
        type: pointerType,
        ...(typeof p.target === 'string' && p.target.length > 0 ? { ref: p.target } : {}),
      })
    }
  }

  // Stage 4: Consent
  const consents = Array.isArray(manifest.consents) ? manifest.consents : []
  const facetStatuses: UmReceiptFacetStatus[] = []
  const consentStatuses: UmReceiptConsentStatus[] = []
  const decryptableSet = new Set(context.decryptableFacetIds ?? [])

  for (const facet of projectedFacets) {
    const facetId = facet['@id']
    const facetTier = Math.max(manifestTier, facet.requiredTrustTier ?? 0)
    const requiredAssuranceClass = facet.requiredAssuranceClass ?? 'software'

    // v0.5 reports the first failing gate: sealed entry, consent, then floors.
    // Keep the historical floor-first behavior on the old v0.4 route.
    const withholdForFloors = (): boolean => {
      if (facetTier > implementedTrustTier) {
        facetStatuses.push({
          facetId,
          name: facet.name,
          status: 'trustTierUnsupported',
          reason: `facet requiredTrustTier ${facetTier} exceeds evaluator capability ${implementedTrustTier}`,
        })
        return true
      }

      if (
        ASSURANCE_CLASS_RANK[presentedAssuranceClass]
        < ASSURANCE_CLASS_RANK[requiredAssuranceClass]
      ) {
        facetStatuses.push({
          facetId,
          name: facet.name,
          status: 'assuranceInsufficient',
          reason: `presented assurance ${presentedAssuranceClass} is below requiredAssuranceClass ${requiredAssuranceClass}`,
          assuranceStatus: {
            assertedClass: presentedAssuranceClass,
            met: false,
          },
        })
        return true
      }

      // EXT-T1 Section T1.3.1: the per-facet `requiredLiveness` floor. Parsed and
      // shape-validated since v0.4 landed, and NEVER ENFORCED until 2026-07-26
      // — the reference implementation released a facet the spec says to
      // withhold, while its sibling `requiredAssuranceClass` was enforced in the
      // branch directly above.
      //
      // **Sequenced after the assurance floor deliberately.** Base Section 3.1.4
      // orders the withholding gates sealed-entry then consent then floors, but
      // does not order the two floors against each other, so the choice is free —
      // and putting assurance first is what keeps
      // `valid/manifest-locked-facet-below-floor.jsonld` reporting the
      // `assuranceInsufficient` + `assuranceStatus` pair its conformance
      // expectation names. That fixture carries BOTH floors, which is exactly why
      // the sequencing is not an implementation detail. The Rust SDK core makes
      // the same choice for the same reason.
      //
      // On the recorded status: Base Section 4.7's optional-feature matrix says a
      // facet carrying a floor *"MUST be withheld (recorded
      // `assuranceInsufficient`, or the unmet-liveness status)"*, so
      // `assuranceInsufficient` is an explicitly permitted value for a liveness
      // withhold. The "unmet-liveness status" it also names is a DANGLING
      // REFERENCE — no section defines such a token, and Base Section 3.3.1's
      // closed value set has no liveness member — which is filed as a spec input.
      // The `reason` therefore carries the real cause, so the receipt does not
      // misreport *why* the facet was withheld. No `assuranceStatus` pair is
      // attached: the assurance floor is not what failed.
      if (facet.requiredLiveness !== undefined) {
        const livenessRefusal = requiredLivenessFloorRefusal(
          facet.requiredLiveness,
          usableLiveness,
          livenessProof
        )
        if (livenessRefusal !== undefined) {
          // The over-claim rule: an unexecuted capability surfaces as a receipt
          // value PLUS a warning, never as silence. Scoped to the floor decision,
          // and that scoping is measured rather than stylistic — warning on the
          // mere presence of an unvalidated attestation would flip
          // valid/manifest-with-liveness-attestation.jsonld and
          // valid/liveness-attestation-past-valid-until.jsonld from `accepted` to
          // `accepted-with-warnings`, and both name expectedReceiptOutcome
          // "accepted" exactly, which this runner compares strictly. Sub-step 2c
          // states the duty at the floor, so the narrow placement is also the
          // faithful one.
          if (livenessProof.kind === 'unvalidated' || livenessProof.kind === 'incomplete') {
            warnings.push({
              code: 'um:reason:trust:liveness-floor-unvalidated',
              message: `Consent stage: facet ${facetId} carries a requiredLiveness floor and the root `
                + 'livenessAttestation is UNVALIDATED, so EXT-T1 Section T1.4 sub-step 2c makes it '
                + `satisfy no floor — ${livenessRefusal}`,
            })
          }
          facetStatuses.push({
            facetId,
            name: facet.name,
            status: 'assuranceInsufficient',
            reason: livenessRefusal,
          })
          return true
        }
      }
      return false
    }
    if (version !== '0.5' && withholdForFloors()) continue

    if (facet.encryptionProfile === 'jwe-inline-v1' && !decryptableSet.has(facetId)) {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'opaque',
        reason: 'no decryption key',
      })
      continue
    }

    const matchingConsents = consents.filter((c) => c.facetRef === facetId)
    if (matchingConsents.length === 0) {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'consent-missing',
        reason: 'no matching consent entry',
      })
      continue
    }

    let allValid = true
    let denialReason: string | undefined
    for (const consent of matchingConsents) {
      // Section 3.1.4 outcome→status mapping: expired/withdrawn consent is
      // treated as absent; scope, purpose, and condition failures record the
      // matching denial status alongside the facet status "consent-denied".
      let status: UmConsentStatusValue = 'valid'
      const consentObj = consent as unknown as Record<string, unknown>
      if (consent.withdrawnAt) {
        status = 'withdrawn'
        allValid = false
        denialReason = 'consent withdrawn'
      } else if (version === '0.5' ? Date.parse(consent.expiresAt) <= nowMs : Date.parse(consent.expiresAt) < nowMs) {
        status = 'expired'
        allValid = false
        denialReason = 'consent expired'
      } else if (version === '0.5' && nowMs < Date.parse(consent.grantedAt)) {
        status = 'condition-violated'
        allValid = false
        denialReason = 'consent validity window has not begun (before grantedAt)'
      } else if (Array.isArray(consentObj.conditions) && consentObj.conditions.length > 0) {
        // Section 1.4.4: a facet governed by a condition the evaluator cannot
        // recognize or enforce MUST NOT be processed (fail closed). This
        // reference evaluator implements no condition vocabulary.
        status = 'condition-violated'
        allValid = false
        denialReason = 'consent carries conditions this evaluator cannot enforce (fail closed, Section 1.4.4)'
      } else if (
        version === '0.5'
          ? !Array.isArray(context.intendedScope) || context.intendedScope.length === 0
            || !Array.from(context.intendedScope).every((op) => typeof op === 'string' && op.length > 0 && consent.scope.includes(op))
          : context.intendedScope && context.intendedScope.length > 0
            && !context.intendedScope.every((op) => consent.scope.includes(op))
      ) {
        status = 'scope-mismatch'
        allValid = false
        denialReason = 'consent scope does not cover intended operation'
      } else if (version === '0.5'
        ? typeof context.intendedPurpose !== 'string' || context.intendedPurpose.length === 0 || consent.purpose !== context.intendedPurpose
        : context.intendedPurpose && consent.purpose !== context.intendedPurpose) {
        status = 'purpose-mismatch'
        allValid = false
        denialReason = 'consent purpose does not match intended purpose'
      }
      consentStatuses.push({
        facetId,
        consentRef: consent['@id'],
        status,
        checkedAt: nowIso(now),
      })
    }

    if (allValid) {
      if (version === '0.5' && withholdForFloors()) continue
      facetStatuses.push({ facetId, name: facet.name, status: 'processed' })
    } else {
      facetStatuses.push({
        facetId,
        name: facet.name,
        status: 'consent-denied',
        reason: denialReason ?? 'consent check failed',
      })
    }
  }

  // Stage 5: Compose
  let outcome: UmReceiptOutcome = 'accepted'
  const hasFailed = facetStatuses.some((f) =>
    f.status === 'consent-denied'
    || f.status === 'trustTierUnsupported'
    || f.status === 'assuranceInsufficient'
  )
  const hasAssuranceInsufficient = facetStatuses.some((f) => f.status === 'assuranceInsufficient')
  const hasProcessed = facetStatuses.some((f) => f.status === 'processed' || f.status === 'written')
  const hasSealed = facetStatuses.some((f) =>
    f.status === 'opaque' || f.status === 'consent-missing'
  )
  // Section 6.4.5: an unverifiable claim (trustTierUnsupported) degrades the
  // outcome to accepted-partial when other items can still be processed.
  const hasUnsupportedClaim = claimStatuses.some((c) => c.status === 'trustTierUnsupported')
  if (hasAssuranceInsufficient && !hasProcessed) outcome = 'rejected'
  else if (hasFailed) outcome = 'accepted-partial'
  else if (hasSealed) outcome = 'accepted-partial'
  else if (hasUnsupportedClaim) outcome = 'accepted-partial'
  if (revocationStatus === 'unchecked' && manifest.signature.statusRef) {
    if (outcome === 'accepted') outcome = 'accepted-with-warnings'
  }
  // Section 3.1.5: noted non-critical conditions surface as accepted-with-warnings
  // (delegation fail-closed defaults, suspended status, unenforced statusRef).
  if (outcome === 'accepted' && warnings.length > 0) outcome = 'accepted-with-warnings'

  // Stage 6: Receipt
  const receipt: CurrentReceipt = {
    '@type': 'um:Receipt',
    manifestId,
    outcome,
    signatureCheck,
    freshnessCheck,
    keyRefResolution,
    revocationStatus,
    facetStatuses,
    ...(claimStatuses.length > 0 ? { claimStatuses } : {}),
    ...(consentStatuses.length > 0 ? { consentStatuses } : {}),
    ...(unprocessedEntries.length > 0 ? { unprocessedEntries } : {}),
    ...(holderBindingStatus !== undefined ? { holderBindingStatus } : {}),
    ...(presentationProofStatus !== undefined ? { presentationProofStatus } : {}),
    ...(livenessStatus !== undefined ? { livenessStatus } : {}),
    ...(effectiveTrustTier !== undefined ? { effectiveTrustTier } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(context.evaluatorId ? { evaluatorId: context.evaluatorId } : {}),
    ...(context.omitProcessedAt ? {} : { processedAt: nowIso(now) }),
  }

  return { receipt, manifest }
}

/**
 * Verify a `did-auth` presentation proof per EXT-T1 Section T1.2: an Ed25519
 * signature by the manifest signing key over the concatenation of the
 * manifest's signing-input hash (SHA-256 of the Base Section 1.6.3 canonical
 * bytes, as its 32 raw bytes) followed by the UTF-8 bytes of `challenge`,
 * `audience`, and `created`, in that order.
 */
function verifyDidAuthPresentationProof(
  manifest: CurrentManifest,
  proof: UmPresentationProofV04,
  version: CurrentVersion = '0.4', resolvedSpki?: string
): boolean {
  const sig = manifest.signature
  const spki = resolvedSpki ?? sig?.publicKeySpkiB64
  if (!spki) return false

  let publicKey
  try {
    publicKey = createPublicKey({
      key: Buffer.from(spki, 'base64'),
      format: 'der',
      type: 'spki',
    })
  } catch {
    return false
  }

  const signingInputHash = createHash('sha256')
    .update(Buffer.from(computeSigningInputV04(manifest as unknown as Record<string, unknown>), 'utf8'))
    .digest()
  const payload = Buffer.concat([
    signingInputHash,
    Buffer.from(proof.challenge, 'utf8'),
    Buffer.from(proof.audience, 'utf8'),
    Buffer.from(proof.created, 'utf8'),
  ])

  try {
    if (version === '0.5') return verifyEd25519V05(Buffer.from(spki, 'base64'), payload, Buffer.from(proof.proofValue, 'base64url'))
    return verify(null, payload, publicKey, Buffer.from(proof.proofValue, 'base64url'))
  } catch {
    return false
  }
}

/**
 * Classify a liveness attestation's freshness per EXT-T1 Section T1.3.
 *
 * An attestation past its `validUntil` is `"unknown"` regardless of
 * `attestedAt`; otherwise the classes are evaluated in order (`live` within
 * 60 seconds, `recent` within 4 hours, `stale` beyond that but within
 * `validUntil`).
 */
export function classifyLivenessFreshness(
  attestation: Partial<UmLivenessAttestationV04> | undefined,
  now: Date = new Date()
): UmLivenessFreshnessClass {
  if (!attestation) return 'unknown'
  if (typeof attestation.attestedAt !== 'string') return 'unknown'
  const attestedMs = Date.parse(attestation.attestedAt)
  if (!Number.isFinite(attestedMs)) return 'unknown'
  const nowMs = now.getTime()
  // EXT-T1 Section T1.3: past validUntil ⇒ "unknown" regardless of attestedAt.
  // An unparseable validUntil fails closed to "unknown".
  if (attestation.validUntil !== undefined) {
    const validUntilMs = Date.parse(attestation.validUntil as string)
    if (!Number.isFinite(validUntilMs) || nowMs > validUntilMs) return 'unknown'
  }
  const age = nowMs - attestedMs
  if (age <= 60_000) return 'live'
  if (age <= 4 * 3600_000) return 'recent'
  return 'stale'
}
