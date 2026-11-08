// =====================================================================
// v0.4 Behavioral / receipt-state conformance harness extension
// =====================================================================
//
// The structural conformance suite (`assertUniversalManifestV04` +
// `validate-examples.mjs` + the v0.4 `expected.json`) verifies the *shape*
// of a manifest: flat accept/reject against a JSON-Schema / cross-field
// validator. A formal review recorded several v0.4
// private-data guarantees as "normative, conformance-deferred (behavioral
// track)" because they cannot be decided from manifest bytes
// alone: they need evaluator runtime output, a bespoke cross-field
// function, or embedded-event/receipt validation that the structural path
// deliberately omits.
//
// This module is that behavioral track. It is ADDITIVE: it imports the
// already-validated v0.4 types and the structural validator from `index.ts`
// and adds pure, deterministic check functions that decide the *behavioral*
// property. Each check returns a `BehavioralCheckResult` (accept | reject +
// a stable reason string), so a fixture runner can assert both the decision
// and the rejection reason (giving the checks teeth: a deliberately-bad
// fixture must reject with the expected reason; a good one must accept).
//
// Guarantee → ledger mapping (round-01.1 §13 consolidated ledger):
//   Q1 isolation invariant ......... L-1, L-14  (checkFacetIsolation)
//   Q3/Q4 derived-write monotonicity  L-6, L-9   (checkDerivedWriteMonotonicity)
//   Q5 write-consent ............... L-10       (checkWriteAuthorization)
//   Q6 audit events ................ L-13       (checkKeyLifecycleAudit)
//   Q7 session-unlock .............. L-11       (checkUnlockWindow)
//
// None of these mutate or replace the structural suite. They are wired to
// run ALONGSIDE it (see `scripts/test-v04-behavioral.mjs`).

import {
  assertUniversalManifestV04,
  type UmConsentV04,
  type UmFacetV04,
  type UmReceiptV03,
  type UniversalManifestV04,
} from './index.js'

// ---------------------------------------------------------------------
// Shared result shape
// ---------------------------------------------------------------------

/** Decision returned by every behavioral check. */
export type BehavioralDecision = 'accept' | 'reject'

/**
 * Result of a behavioral conformance check.
 *
 * `decision` is the accept/reject verdict; `reason` is a stable,
 * substring-matchable explanation (always present on `reject`, present as a
 * short summary on `accept`). `code` is a machine-stable identifier so a
 * fixture's `expectedCode` can be asserted independent of prose wording.
 */
export interface BehavioralCheckResult {
  decision: BehavioralDecision
  code: string
  reason: string
  /** Optional structured detail (e.g. the offending facet ids). */
  detail?: Record<string, unknown>
}

function accept(code: string, reason: string, detail?: Record<string, unknown>): BehavioralCheckResult {
  return { decision: 'accept', code, reason, ...(detail ? { detail } : {}) }
}

function reject(code: string, reason: string, detail?: Record<string, unknown>): BehavioralCheckResult {
  return { decision: 'reject', code, reason, ...(detail ? { detail } : {}) }
}

// ---------------------------------------------------------------------
// Small typed accessors over the open v0.4 wire shapes
// ---------------------------------------------------------------------

interface JweRecipientLike {
  header?: { kid?: unknown }
}
interface JweEntityLike {
  iv?: unknown
  recipients?: JweRecipientLike[]
}

function getJweEntity(facet: UmFacetV04): JweEntityLike | undefined {
  if (facet.encryptionProfile !== 'jwe-inline-v1') return undefined
  const entity = facet.entity
  if (!entity || typeof entity !== 'object') return undefined
  return entity as JweEntityLike
}

function facetKids(entity: JweEntityLike): string[] {
  if (!Array.isArray(entity.recipients)) return []
  const kids: string[] = []
  for (const r of entity.recipients) {
    const kid = r?.header?.kid
    if (typeof kid === 'string' && kid.length > 0) kids.push(kid)
  }
  return kids
}

// ---------------------------------------------------------------------
// Q1 — Per-facet cryptographic isolation (L-1, L-14)
// ---------------------------------------------------------------------
//
// round-01.1 §3, §13 (L-14): under an isolation claim over a declared set of
// encrypted facets, the structurally-checkable invariant is:
//   - No shared decryption-authorizing `kid`: the same
//     `facets[].entity.recipients[].header.kid` MUST NOT authorize more than
//     one facet in the isolated set.
//   - No shared `iv`: two isolated facets MUST NOT reuse an
//     `facets[].entity.iv` (IV reuse under a shared CEK is catastrophic for
//     A256GCM).
// The behavioral conditionality (L-2) is honoured: the rule BITES ONLY when
// the harness is told the deployment claims isolation over a named set
// (`isolationClaim.isolatedFacetIds`). For a non-claiming harness the same
// bytes accept. This is exactly the cross-field rule the round-01.1 fixtures
// `isolated-facets-shared-key` / `isolated-facets-shared-iv` were LEDGERED to.

/** Isolation-claim qualifier (the conformance-claim flag — NOT a wire member). */
export interface UmIsolationClaim {
  /** The `@id`s of the facets the deployment claims are cryptographically isolated. */
  isolatedFacetIds: string[]
}

export interface FacetIsolationContext {
  /**
   * When present, the deployment CLAIMS per-facet isolation for this set; the
   * no-shared-kid / no-shared-iv invariant is enforced. When absent, the
   * invariant does not bite (same bytes accept — L-2 conditionality).
   */
  isolationClaim?: UmIsolationClaim
}

/**
 * Decide Q1 per-facet cryptographic isolation for a v0.4 manifest under an
 * (optional) isolation claim. Structurally validates first, then enforces the
 * cross-field no-shared-kid / no-shared-iv invariant over the declared set.
 */
export function checkFacetIsolation(
  value: unknown,
  context: FacetIsolationContext = {}
): BehavioralCheckResult {
  try {
    assertUniversalManifestV04(value)
  } catch (err) {
    return reject('Q1_STRUCTURAL', `structural validation failed: ${errMessage(err)}`)
  }
  const manifest = value as UniversalManifestV04

  // No claim ⇒ the isolation invariant does not bite (L-2 conditionality).
  if (!context.isolationClaim || context.isolationClaim.isolatedFacetIds.length === 0) {
    return accept('Q1_NO_CLAIM', 'no isolation claim present; isolation invariant does not apply')
  }

  const claimedIds = new Set(context.isolationClaim.isolatedFacetIds)
  const facets = (Array.isArray(manifest.facets) ? manifest.facets : []).filter((f) =>
    claimedIds.has(f['@id'])
  )

  // Every claimed facet must actually be an encrypted JWE facet (else the
  // isolation claim is unsatisfiable / meaningless).
  for (const facet of facets) {
    if (getJweEntity(facet) === undefined) {
      return reject(
        'Q1_CLAIMED_FACET_NOT_ENCRYPTED',
        `facet ${facet['@id']} is in the isolated set but is not a jwe-inline-v1 encrypted facet`,
        { facetId: facet['@id'] }
      )
    }
  }

  // No shared decryption-authorizing kid across the isolated set.
  const kidOwner = new Map<string, string>()
  for (const facet of facets) {
    const entity = getJweEntity(facet)!
    for (const kid of facetKids(entity)) {
      const prior = kidOwner.get(kid)
      if (prior !== undefined && prior !== facet['@id']) {
        return reject(
          'Q1_SHARED_KID',
          'facets in an isolated set MUST NOT share a decryption-authorizing kid',
          { kid, facets: [prior, facet['@id']] }
        )
      }
      kidOwner.set(kid, facet['@id'])
    }
  }

  // No shared iv across the isolated set.
  const ivOwner = new Map<string, string>()
  for (const facet of facets) {
    const entity = getJweEntity(facet)!
    const iv = entity.iv
    if (typeof iv !== 'string' || iv.length === 0) continue
    const prior = ivOwner.get(iv)
    if (prior !== undefined && prior !== facet['@id']) {
      return reject(
        'Q1_SHARED_IV',
        'facets in an isolated set MUST NOT reuse an iv',
        { iv, facets: [prior, facet['@id']] }
      )
    }
    ivOwner.set(iv, facet['@id'])
  }

  return accept('Q1_ISOLATED', 'isolated set has distinct kid and iv per facet', {
    facetCount: facets.length,
  })
}

// ---------------------------------------------------------------------
// Q3 / Q4 — Derived-write monotonicity (L-6, L-9)
// ---------------------------------------------------------------------
//
// round-01.1 §6/§7, §13 (L-6, L-9): where a profile supplies a facet
// sensitivity ordering, an evaluator producing a derived output from one or
// more source facets MUST assign the output AT LEAST the join (least upper
// bound) of the source labels, MUST NOT write the output into a
// lower-sensitivity target facet, and MUST NOT silently down-label; on an
// UNDEFINED join (incomparable labels) it MUST fail closed (assign the
// maximal element / discard the write). Q4 (agent memory) is a derived write
// governed by the same rule.
//
// The ordering is PROFILE-SUPPLIED (UM-v04-DEC-03): it comes from the
// registered profile the deployment pins at configuration time (Base §7.2),
// never from the manifest under evaluation — an artifact MUST NOT supply the
// lattice that polices it. The harness therefore takes the ordering as
// harness-level profile configuration on the check context, standing in for a
// deployment's pinned profile registry entry. The manifest-carried
// `facetSensitivityOrdering` member that earlier drafts read was removed from
// the v0.4 wire at the 2026-07-15 schema lock; this check MUST NOT read it.

export interface SensitivityOrdering {
  /** Identifier of the registered profile this ordering was pinned from. */
  profile?: string
  labels: string[]
  /** Pairwise covering relations [lower, higher] forming a partial order. */
  order: Array<[string, string]>
}

export interface DerivedWriteDescriptor {
  /** Sensitivity labels of the source facets feeding the derivation. */
  sourceLabels: string[]
  /** Label the producer assigns to the written (target) facet. */
  targetLabel: string
}

export interface DerivedWriteContext {
  derivedWrite: DerivedWriteDescriptor
  /**
   * The sensitivity ordering supplied by the registered profile the deployment
   * pins (Base §7.2, UM-v04-DEC-03). Absent when the deployment pins no
   * ordering profile, in which case derived-write monotonicity is off by
   * default. This is deployment configuration, never manifest content.
   */
  profileOrdering?: unknown
}

/** Build the reflexive-transitive closure of `<=` from the covering pairs. */
function buildLeq(ordering: SensitivityOrdering): (a: string, b: string) => boolean {
  const labels = ordering.labels
  const idx = new Map(labels.map((l, i) => [l, i]))
  const n = labels.length
  // reachable[i][j] === true  ⟺  labels[i] <= labels[j]
  const reachable: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  for (let i = 0; i < n; i += 1) reachable[i][i] = true
  for (const [lo, hi] of ordering.order) {
    const i = idx.get(lo)
    const j = idx.get(hi)
    if (i === undefined || j === undefined) continue
    reachable[i][j] = true
  }
  // Floyd–Warshall transitive closure.
  for (let k = 0; k < n; k += 1) {
    for (let i = 0; i < n; i += 1) {
      if (!reachable[i][k]) continue
      for (let j = 0; j < n; j += 1) {
        if (reachable[k][j]) reachable[i][j] = true
      }
    }
  }
  return (a: string, b: string) => {
    const i = idx.get(a)
    const j = idx.get(b)
    if (i === undefined || j === undefined) return false
    return reachable[i][j]
  }
}

/**
 * Least upper bound (join) of `labels` under the ordering, or `undefined` if
 * no unique least upper bound exists (incomparable / no join-semilattice).
 */
function joinOf(labels: string[], ordering: SensitivityOrdering, leq: (a: string, b: string) => boolean): string | undefined {
  if (labels.length === 0) return undefined
  // Candidate upper bounds: every label >= all source labels.
  const upperBounds = ordering.labels.filter((cand) => labels.every((s) => leq(s, cand)))
  if (upperBounds.length === 0) return undefined
  // The join is the unique least upper bound: an upper bound <= every other
  // upper bound.
  const least = upperBounds.filter((u) => upperBounds.every((v) => leq(u, v)))
  if (least.length !== 1) return undefined
  return least[0]
}

/**
 * Decide Q3/Q4 derived-write monotonicity. Takes the sensitivity ordering from
 * the deployment's pinned profile configuration (`context.profileOrdering`),
 * validates it is well-formed, computes the join of the source labels, and
 * enforces that the target label is at least the join (fail closed on an
 * undefined join).
 *
 * The ordering is deliberately NOT read from the manifest: under UM-v04-DEC-03
 * the operative ordering is profile-supplied, and a manifest under evaluation
 * MUST NOT be able to supply the lattice that polices its own derived writes.
 */
export function checkDerivedWriteMonotonicity(
  value: unknown,
  context: DerivedWriteContext
): BehavioralCheckResult {
  try {
    assertUniversalManifestV04(value)
  } catch (err) {
    return reject('Q3_STRUCTURAL', `structural validation failed: ${errMessage(err)}`)
  }
  const orderingRaw = context.profileOrdering
  if (!orderingRaw || typeof orderingRaw !== 'object') {
    // Off-by-default disclosure (round-01.1 §11): absent a profile-supplied
    // ordering there is NO protection — the write is not refused, but no
    // monotonicity is claimed.
    return accept('Q3_NO_ORDERING', 'no profile-supplied sensitivity ordering pinned; derived-write monotonicity is off by default')
  }
  const ordering = orderingRaw as SensitivityOrdering
  if (!Array.isArray(ordering.labels) || !Array.isArray(ordering.order)) {
    return reject('Q3_ORDERING_MALFORMED', 'the profile-supplied sensitivity ordering must carry labels[] and order[]')
  }

  const { sourceLabels, targetLabel } = context.derivedWrite
  const known = new Set(ordering.labels)
  for (const l of [...sourceLabels, targetLabel]) {
    if (!known.has(l)) {
      return reject('Q3_UNKNOWN_LABEL', `label ${l} is not declared in the profile-supplied ordering's labels`, { label: l })
    }
  }

  const leq = buildLeq(ordering)
  const join = joinOf(sourceLabels, ordering, leq)
  if (join === undefined) {
    // Fail closed on undefined join (incomparable labels / no semilattice).
    return reject(
      'Q3_UNDEFINED_JOIN',
      'no join (least upper bound) defined for the source labels; derived write MUST fail closed',
      { sourceLabels }
    )
  }

  // Target must be at least the join: join <= targetLabel.
  if (!leq(join, targetLabel)) {
    return reject(
      'Q3_DOWN_LABEL',
      `derived write down-labels: target ${targetLabel} is below the join ${join} of the source labels`,
      { join, targetLabel, sourceLabels }
    )
  }

  return accept('Q3_MONOTONIC', `derived write carries at least the join (${join})`, { join, targetLabel })
}

// ---------------------------------------------------------------------
// Q5 — Write authorization as a first-class operation (L-10)
// ---------------------------------------------------------------------
//
// round-01.1 §8, §13 (L-10): a write/update/append to a facet is authorized
// only by a consent whose `facetRef` matches the TARGET facet's `@id`, whose
// `scope` LITERALLY contains the write verb, whose `purpose` matches, and
// which is active. Writes to a not-yet-existing facet (the Q4 agent-memory
// case) require a PRE-DECLARED consent naming the intended target `@id`;
// absent it the write is `consent-missing` and MUST be refused (fail closed).
// This reuses Stage-4 consent matching applied at write time.

export interface WriteRequest {
  /** `@id` of the facet being written (may not yet exist as a facet). */
  targetFacetId: string
  /** The write verb being performed, e.g. `write.update`. */
  writeScope: string
  /** Purpose the writer asserts; must match the governing consent. */
  purpose?: string
}

export interface WriteAuthorizationContext {
  write: WriteRequest
  /** Evaluation instant (ISO 8601); defaults to now. */
  now?: string
}

/**
 * Decide Q5 write authorization for a proposed write against a v0.4 manifest's
 * consents (Stage-4 matching applied at write time). Returns `accept`
 * (modelling a `written` receipt status) when a governing target-facet
 * write-consent is present, in-scope, purpose-matched, and active; otherwise
 * `reject` with the fail-closed reason (`consent-missing` / `consent-denied`).
 */
export function checkWriteAuthorization(
  value: unknown,
  context: WriteAuthorizationContext
): BehavioralCheckResult {
  try {
    assertUniversalManifestV04(value)
  } catch (err) {
    return reject('Q5_STRUCTURAL', `structural validation failed: ${errMessage(err)}`)
  }
  const manifest = value as UniversalManifestV04
  const consents: UmConsentV04[] = Array.isArray(manifest.consents) ? manifest.consents : []
  const nowMs = Date.parse(context.now ?? new Date().toISOString())
  const { targetFacetId, writeScope, purpose } = context.write

  // Stage-4 matching: the governing consent is the one whose facetRef matches
  // the TARGET facet @id. (Holds for the create-not-yet-existing-facet case:
  // the pre-declared consent names the intended target @id.)
  const governing = consents.filter((c) => c.facetRef === targetFacetId)
  if (governing.length === 0) {
    return reject(
      'Q5_CONSENT_MISSING',
      `no governing write-consent for target facet ${targetFacetId}; write MUST fail closed (consent-missing)`,
      { targetFacetId }
    )
  }

  // At least one governing consent must authorize the write.
  let lastDenial = 'consent-denied'
  for (const c of governing) {
    const scope = Array.isArray(c.scope) ? c.scope : []
    if (!scope.includes(writeScope)) {
      lastDenial = `consent-denied: scope-mismatch (write verb ${writeScope} not in consent scope)`
      continue
    }
    if (c.withdrawnAt) {
      lastDenial = 'consent-denied: consent withdrawn'
      continue
    }
    if (typeof c.expiresAt === 'string' && Number.isFinite(Date.parse(c.expiresAt)) && Date.parse(c.expiresAt) < nowMs) {
      lastDenial = 'consent-denied: consent expired'
      continue
    }
    if (purpose !== undefined && c.purpose !== purpose) {
      lastDenial = 'consent-denied: purpose mismatch'
      continue
    }
    return accept('Q5_WRITTEN', `write authorized by consent ${c['@id']}`, {
      targetFacetId,
      consentRef: c['@id'],
      receiptStatus: 'written',
    })
  }

  return reject('Q5_CONSENT_DENIED', lastDenial, { targetFacetId, writeScope })
}

// ---------------------------------------------------------------------
// Q6 — Facet key rotation / shred audit events (L-13)
// ---------------------------------------------------------------------
//
// round-01.1 §9, §13 (L-13): wire embedded `events[]` / receipt validation so
// the key-lifecycle audit fixtures test something. A receipt's
// `facet-key-rotated` / `facet-key-shredded` events MUST carry a non-empty
// `facetKeyRef` (an identifier, never key material) and a recognized
// `um:reason:crypto:*` reason; the receipt is otherwise structurally valid.
// `events` are bounded by §6.3 resource limits (max 1000 entries).

const RECOGNIZED_KEY_LIFECYCLE_EVENTS = new Set(['facet-key-rotated', 'facet-key-shredded'])
const RECOGNIZED_KEY_LIFECYCLE_REASONS = new Set([
  'um:reason:crypto:key-rotated',
  'um:reason:crypto:key-shredded',
])
const MAX_EVENTS = 1000 // §6.3 Resource Limits

export interface KeyLifecycleAuditContext {
  /**
   * When true (default), every key-lifecycle event MUST carry a recognized
   * `um:reason:crypto:*` reason. The structural validator only checks
   * `facetKeyRef`; this is the additional behavioral/audit requirement.
   */
  requireReasonCode?: boolean
}

/**
 * Decide Q6 key-lifecycle audit-event soundness for a v0.4 receipt manifest.
 * Validates the receipt structurally, then enforces the embedded-event audit
 * requirements the structural path leaves to the behavioral track.
 */
export function checkKeyLifecycleAudit(
  value: unknown,
  context: KeyLifecycleAuditContext = {}
): BehavioralCheckResult {
  const requireReason = context.requireReasonCode ?? true
  // The fixtures are receipt manifests (um:Manifest + um:Receipt). Structural
  // validation of the manifest envelope runs first.
  try {
    assertUniversalManifestV04(value)
  } catch (err) {
    return reject('Q6_STRUCTURAL', `structural validation failed: ${errMessage(err)}`)
  }
  const obj = value as Record<string, unknown>
  const events = obj.events
  if (events === undefined) {
    return accept('Q6_NO_EVENTS', 'no embedded events; nothing to audit')
  }
  if (!Array.isArray(events)) {
    return reject('Q6_EVENTS_NOT_ARRAY', 'receipt events must be an array')
  }
  if (events.length > MAX_EVENTS) {
    return reject('Q6_EVENTS_OVERFLOW', `receipt events exceed §6.3 resource limit of ${MAX_EVENTS} entries`, {
      count: events.length,
    })
  }

  let keyLifecycleCount = 0
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') {
      return reject('Q6_EVENT_NOT_OBJECT', 'event entries must be objects')
    }
    const e = ev as Record<string, unknown>
    const type = e.eventType
    if (typeof type !== 'string' || !RECOGNIZED_KEY_LIFECYCLE_EVENTS.has(type)) {
      // Unknown / non-key-lifecycle events are preserved-but-not-acted-on.
      continue
    }
    keyLifecycleCount += 1
    if (typeof e.facetKeyRef !== 'string' || e.facetKeyRef.length === 0) {
      return reject('Q6_MISSING_FACETKEYREF', `${type} event requires a non-empty facetKeyRef`, { eventType: type })
    }
    // facetKeyRef is an identifier, never key material: a JWK/PEM-looking blob
    // is a leak. Reject obvious key-material shapes.
    if (looksLikeKeyMaterial(e.facetKeyRef)) {
      return reject('Q6_FACETKEYREF_IS_KEY_MATERIAL', `${type} event facetKeyRef must be an identifier, not key material`, {
        eventType: type,
      })
    }
    if (requireReason) {
      const reasonCode = e.reason
      if (typeof reasonCode !== 'string' || !RECOGNIZED_KEY_LIFECYCLE_REASONS.has(reasonCode)) {
        return reject(
          'Q6_BAD_REASON',
          `${type} event requires a recognized um:reason:crypto:* reason code`,
          { eventType: type, reason: reasonCode }
        )
      }
    }
  }

  return accept('Q6_AUDIT_OK', `key-lifecycle audit events well-formed (${keyLifecycleCount} key-lifecycle events)`, {
    keyLifecycleCount,
  })
}

function looksLikeKeyMaterial(s: string): boolean {
  // PEM block or a JSON object that looks like a JWK.
  if (s.includes('-----BEGIN')) return true
  const trimmed = s.trim()
  if (trimmed.startsWith('{') && /"(kty|crv|[dxy]|k)"\s*:/.test(trimmed)) return true
  return false
}

// ---------------------------------------------------------------------
// Q7 — Unlock window (L-11)
// ---------------------------------------------------------------------
//
// round-01.1 §10, §13 (L-11): an unlock window MUST explicitly enumerate the
// facet set it opens (by @id) and MUST NOT open an unbounded/implicit set; it
// MUST NOT lower a per-facet `requiredLiveness` floor; it MUST bind to a fresh
// presentationProof / nonce (anti-replay); and the opening ceremony is
// recorded as a `session-unlocked` receipt event (not a new consent member).
// An unlock window is NOT a `um:BilateralSession` (no participants /
// exchangeId).

export interface UnlockWindowContext {
  /** `@id` of the `unlock.window` consent under evaluation. */
  consentId: string
  /**
   * Facets the holder/evaluator actually attempts to open within the window.
   * Each MUST be in the consent's enumerated set; an attempt outside the set
   * is refused.
   */
  requestedFacetIds?: string[]
  /** Evaluation instant; defaults to now. */
  now?: string
  /**
   * The fresh anti-replay binding the opening ceremony presents (a
   * presentationProof id / nonce). REQUIRED: a window with no fresh binding is
   * refused (static bytes cannot re-open a window).
   */
  presentationNonce?: string
}

interface UnlockConsentLike extends UmConsentV04 {
  unlockWindowFacets?: unknown
  participants?: unknown
  exchangeId?: unknown
}

/**
 * Decide Q7 unlock-window soundness for a v0.4 manifest's `unlock.window`
 * consent. Enforces the enumerated-set, anti-replay, and not-a-bilateral-
 * session invariants and confines requested facets to the enumerated set.
 */
export function checkUnlockWindow(value: unknown, context: UnlockWindowContext): BehavioralCheckResult {
  try {
    assertUniversalManifestV04(value)
  } catch (err) {
    return reject('Q7_STRUCTURAL', `structural validation failed: ${errMessage(err)}`)
  }
  const manifest = value as UniversalManifestV04
  const consents: UnlockConsentLike[] = (Array.isArray(manifest.consents) ? manifest.consents : []) as UnlockConsentLike[]
  const consent = consents.find((c) => c['@id'] === context.consentId)
  if (!consent) {
    return reject('Q7_CONSENT_NOT_FOUND', `unlock-window consent ${context.consentId} not found`, {
      consentId: context.consentId,
    })
  }

  const scope = Array.isArray(consent.scope) ? consent.scope : []
  if (!scope.includes('unlock.window')) {
    return reject('Q7_NOT_UNLOCK_WINDOW', `consent ${context.consentId} does not carry the unlock.window scope`)
  }

  // Must NOT be a bilateral session (no participants, no exchangeId).
  if (consent.participants !== undefined || consent.exchangeId !== undefined) {
    return reject(
      'Q7_IS_BILATERAL_SESSION',
      'an unlock window MUST NOT be a um:BilateralSession (no participants, no exchangeId)'
    )
  }

  // MUST explicitly enumerate a bounded, non-empty facet set by @id.
  const enumerated = consent.unlockWindowFacets
  if (!Array.isArray(enumerated) || enumerated.length === 0) {
    return reject(
      'Q7_UNBOUNDED_SET',
      'an unlock window MUST explicitly enumerate a bounded, non-empty facet set (unlockWindowFacets)'
    )
  }
  if (!enumerated.every((f) => typeof f === 'string' && f.length > 0)) {
    return reject('Q7_BAD_FACET_REF', 'unlockWindowFacets entries must be non-empty facet @id strings')
  }
  const enumeratedSet = new Set(enumerated as string[])

  // Anti-replay: the opening ceremony MUST present a fresh binding.
  if (typeof context.presentationNonce !== 'string' || context.presentationNonce.length === 0) {
    return reject(
      'Q7_NO_ANTIREPLAY_BINDING',
      'an unlock window MUST bind to a fresh presentationProof / nonce; static bytes cannot re-open a window'
    )
  }

  // Window must be currently open (grantedAt <= now <= expiresAt, not withdrawn).
  const nowMs = Date.parse(context.now ?? new Date().toISOString())
  if (consent.withdrawnAt) {
    return reject('Q7_WINDOW_WITHDRAWN', 'unlock-window consent has been withdrawn')
  }
  if (typeof consent.expiresAt === 'string' && Number.isFinite(Date.parse(consent.expiresAt)) && Date.parse(consent.expiresAt) < nowMs) {
    return reject('Q7_WINDOW_EXPIRED', 'unlock window has expired; re-attestation required')
  }

  // Requested facets must be confined to the enumerated set.
  for (const reqId of context.requestedFacetIds ?? []) {
    if (!enumeratedSet.has(reqId)) {
      return reject(
        'Q7_FACET_OUTSIDE_SET',
        `requested facet ${reqId} is outside the unlock window's enumerated set`,
        { facetId: reqId, enumerated: [...enumeratedSet] }
      )
    }
  }

  return accept('Q7_WINDOW_OK', `unlock window opens a bounded enumerated set of ${enumeratedSet.size} facets`, {
    enumeratedCount: enumeratedSet.size,
  })
}

// ---------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Re-export the receipt type for runner convenience.
export type { UmReceiptV03 }
