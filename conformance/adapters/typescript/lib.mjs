import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import {
  assertUniversalManifestV01,
  assertUniversalManifestV01Fresh,
  assertUniversalManifestV02,
  assertUniversalManifestV02Fresh,
  assertUniversalManifestV04,
  assertUniversalManifestV04Fresh,
  evaluateUniversalManifestV04,
  assertUniversalManifestV05,
  assertUniversalManifestV05Fresh,
  evaluateUniversalManifestV05,
  evaluateUniversalManifestV04WithLivenessV1,
  createWebAuthnLivenessValidatorV1,
  getManifestId,
  parseIJsonDocument,
} from '../../../packages/universal-manifest/dist/index.js'

// Accepted private contract identity; this is not a normative registration.
const observationVersion = 'PROPOSED_UNREGISTERED:8e3b8f39300a9c1a3f6fc6f1fc396ca377a4d62beea8644847f7454beac0ee54'
const observationLaunch = process.env.UM_CONFORMANCE_CAPABILITY_OBSERVATIONS
const rawContexts = new WeakMap()

// Ordered stage entry and failure sites in src/liveness.ts:166-239 and the
// unchanged loaded dist/liveness.js:234-337. Only assertion-signature calls
// the real signature primitive. Counter means read/comparison, not replay safety.
const jsonFailures = ['json-utf8', 'json-invalid', 'json-object', 'json-limit', 'json-number']
const byteFailures = ['malformed-field', 'byte-limit', 'base64url-invalid']
const livenessStagesV1 = [
  ['carrier', 'structural', [...byteFailures, ...jsonFailures, 'method-unsupported', 'carrier-not-jcs', 'carrier-extension', 'carrier-type', 'credential-id-mismatch', 'extensions-unsupported', 'carrier-attachment']],
  ['authority-time', 'behavioral', [...byteFailures, 'subject-context-mismatch', 'credential-authority-unavailable', 'attester-mismatch', 'user-handle-mismatch', 'timestamp-format', 'time-overflow', 'configuration-invalid', 'attestation-lifetime', 'time-bound-unavailable', 'future-attestation']],
  ['client-data', 'structural', [...byteFailures, ...jsonFailures, 'client-type', 'challenge-mismatch', 'origin-mismatch']],
  ['same-origin', 'structural', ['cross-origin', 'client-token-binding']],
  ['authenticator-data', 'structural', ['rp-hash-mismatch', 'authenticator-extension']],
  ['authorized-key', 'structural', [...byteFailures, 'configuration-key']],
  ['signature-encoding', 'structural', ['signature-encoding', 'signature-scalar']],
  ['assertion-signature', 'cryptographic', ['signature-invalid']],
  ['authenticated-flags', 'behavioral', ['user-presence-required', 'user-verification-required', 'flags-invalid', 'backup-eligibility-mismatch']],
  ['counter', 'behavioral', []],
]

// Private consistency guard. Its only production caller receives diagnostics
// directly from the maintained V1 evaluation; request fields never reach it.
function livenessStageOutcomesV1(proof) {
  const entered = proof?.checksExecuted
  if (!Array.isArray(entered) || entered.length === 0 || entered.length > livenessStagesV1.length ||
      entered.some((name, i) => name !== livenessStagesV1[i][0])) return []
  const complete = proof.status === 'validated'
  if (complete) {
    if (entered.length !== 10 || Object.hasOwn(proof, 'failureCode') ||
        !['not-supported', 'advanced', 'non-increasing', 'baseline-unknown'].includes(proof.counterStatus) ||
        proof.usableFreshness !== proof.temporalClass) return []
  } else {
    const code = proof.failureCode
    if (!livenessStagesV1[entered.length - 1][2].includes(code)) return []
    const status = ['method-unsupported', 'carrier-extension', 'client-token-binding', 'extensions-unsupported'].includes(code)
      ? 'unsupported' : code === 'time-bound-unavailable' ? 'not-evaluated' : 'failed'
    if (proof.status !== status || proof.counterStatus !== 'not-evaluated' || proof.usableFreshness !== 'unknown') return []
  }
  const signaturePassed = entered.length >= 9
  if (proof.signatureVerified !== signaturePassed || proof.contextBound !== signaturePassed) return []
  if (signaturePassed) {
    const flags = proof.authenticatedFlags
    if (!flags || ['userPresent', 'userVerified', 'backupEligible', 'backupState'].some(k => typeof flags[k] !== 'boolean')) return []
    if (complete && (!flags.userPresent || !flags.userVerified || (flags.backupState && !flags.backupEligible))) return []
    if (proof.failureCode === 'user-presence-required' && flags.userPresent) return []
    if (proof.failureCode === 'user-verification-required' && (!flags.userPresent || flags.userVerified)) return []
  } else if (Object.hasOwn(proof, 'authenticatedFlags')) return []
  if (entered.length >= 3) {
    if (proof.timeBoundStatus !== 'trusted' || !Number.isSafeInteger(proof.effectiveExpiryMs) ||
        !['unknown', 'live', 'recent', 'stale'].includes(proof.temporalClass)) return []
  } else {
    if (proof.temporalClass !== 'unknown' || Object.hasOwn(proof, 'effectiveExpiryMs')) return []
    if (entered.length === 1 && proof.timeBoundStatus !== 'not-evaluated') return []
    if (entered.length === 2 && !['not-evaluated', 'unavailable', 'trusted'].includes(proof.timeBoundStatus)) return []
    if (proof.failureCode === 'time-bound-unavailable' && proof.timeBoundStatus !== 'unavailable') return []
    if (proof.failureCode !== 'time-bound-unavailable' && proof.timeBoundStatus === 'unavailable') return []
    if (proof.failureCode === 'future-attestation' && proof.timeBoundStatus !== 'trusted') return []
  }
  return entered.map((_, i) => ({
    checkId: 'um.typescript.liveness.v1/' + livenessStagesV1[i][0],
    executionKind: livenessStagesV1[i][1],
    outcome: !complete && i === entered.length - 1 ? 'failed' : 'passed',
  }))
}

function observedLivenessV1(proof, payload, context) {
  const binding = context && rawContexts.get(context)
  if ((!Buffer.isBuffer(payload) && typeof payload !== 'string') || !binding ||
      !isDeepStrictEqual(context, binding.parsed)) return []
  const payloadSha256 = createHash('sha256').update(payload).digest('hex')
  const contextSha256 = createHash('sha256').update(binding.raw).digest('hex')
  return livenessStageOutcomesV1(proof).map(check => ({ ...check, payloadSha256, contextSha256 }))
}

// Read once at process/module launch. Request context and holder fields cannot
// install authority or replace the pinned V1 evaluator environment.
const livenessLaunch = (() => {
  const raw = process.env.UM_CONFORMANCE_LIVENESS_V1
  if (raw === undefined) return null
  try {
    if (Buffer.byteLength(raw, 'utf8') > 65536) throw new Error('configuration-limit')
    const config = parseIJsonDocument(raw)
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        Object.keys(config).some(key => !['evaluationContext', 'livenessValidation'].includes(key))) {
      throw new Error('configuration-invalid')
    }
    if (!config.evaluationContext || typeof config.evaluationContext !== 'object' ||
        Array.isArray(config.evaluationContext) || typeof config.evaluationContext.now !== 'string') {
      throw new Error('evaluationContext.now is required')
    }
    const evaluationContext = buildEvaluatorContext(config)
    const validation = config.livenessValidation == null
      ? undefined : createWebAuthnLivenessValidatorV1(config.livenessValidation)
    return { evaluationContext, validation }
  } catch (error) {
    return { error: `invalid UM_CONFORMANCE_LIVENESS_V1: ${error instanceof Error ? error.message : String(error)}` }
  }
})()

/**
 * Resolve the validation surface for this fixture.
 *
 * Precedence follows `conformance/README.md` ("Reserved fixture-embedded
 * members"): the runner-supplied `validationMode` wins, and the fixture-embedded
 * `__validate` sentinel is only a fallback for when the expectation entry does
 * not set one.
 */
function resolveValidationMode(manifest, context) {
  const fromContext = context?.validationMode
  if (typeof fromContext === 'string' && fromContext.length > 0) {
    return assertKnownMode(fromContext)
  }

  const sentinel = manifest?.__validate
  if (sentinel === undefined) return 'structural'
  return assertKnownMode(sentinel)
}

function assertKnownMode(mode) {
  if (mode === 'structural' || mode === 'fresh' || mode === 'evaluation') return mode
  throw new Error(`Unsupported validation mode: ${String(mode)}`)
}

/**
 * Which fixture package is being executed. The runner always states this on the
 * conformance context; the manifest's own `manifestVersion` is the fallback for
 * running this adapter by hand, outside the runner.
 */
function resolveSuiteVersion(manifest, context) {
  const fromContext = context?.specVersion
  if (typeof fromContext === 'string' && fromContext.length > 0) return fromContext
  const declared = manifest?.manifestVersion
  return typeof declared === 'string' ? declared : ''
}

/**
 * Build the evaluator context from the runner-supplied `evaluationContext`.
 *
 * `now` is the pinned evaluation clock. It is never defaulted to the wall clock:
 * `conformance/README.md` makes pinning mandatory, and a wall-clock substitution
 * would silently re-date every temporal fixture.
 */
function buildEvaluatorContext(context) {
  const supplied = context?.evaluationContext
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
    throw new Error(
      'evaluation mode was requested but the runner delivered no evaluationContext; ' +
        'the pinned clock is mandatory and must not be defaulted to the wall clock'
    )
  }

  const evaluatorContext = { ...supplied }
  // Inspect the copied own field: an inherited/non-enumerable clock must not
  // authorize an evaluation whose actual context would omit it.
  if (!Object.hasOwn(evaluatorContext, 'now')) {
    throw new Error('evaluationContext.now is required; the pinned clock must not be defaulted to the wall clock')
  }
  const pinned = typeof evaluatorContext.now === 'string' ? new Date(evaluatorContext.now) : evaluatorContext.now
  if (!(pinned instanceof Date) || !Number.isFinite(pinned.getTime())) {
    throw new Error(`evaluationContext.now is not a valid date-time: ${evaluatorContext.now}`)
  }
  evaluatorContext.now = pinned

  return evaluatorContext
}

/**
 * Run the fixture on the selected surface.
 *
 * Returns `{ result, reason, receiptOutcome? }`. A thrown error is a reject; the
 * verdict is never derived from the expectation entry, which is why the entry's
 * `expectedResult` is not part of the conformance context this adapter reads.
 */
function runValidation(manifest, mode, context, payload) {
  const declaredVersion = manifest?.manifestVersion
  const suiteVersion = resolveSuiteVersion(manifest, context)

  if (declaredVersion === '0.5' || suiteVersion === '0.5') {
    if (livenessLaunch !== null) throw new Error('v0.5 contextual V1 route is not qualified; cannot relabel v0.4 evaluation')
    if (mode === 'evaluation') {
      const { receipt } = evaluateUniversalManifestV05(manifest, buildEvaluatorContext(context))
      return { result: receipt.outcome === 'rejected' ? 'reject' : 'accept',
        reason: `0.5 evaluation receipt outcome: ${receipt.outcome}`,
        receiptOutcome: receipt.outcome, behavior: { receipt } }
    }
    if (mode === 'fresh') assertUniversalManifestV05Fresh(manifest, buildEvaluatorContext(context).now)
    else assertUniversalManifestV05(manifest)
    return { result: 'accept', reason: `0.5 manifest validated (${mode})` }
  }

  if (declaredVersion === '0.1') {
    if (mode === 'evaluation') throw new Error('v0.1 has no evaluation surface')
    if (mode === 'fresh') assertUniversalManifestV01Fresh(manifest)
    else assertUniversalManifestV01(manifest)
    return { result: 'accept', reason: `0.1 manifest validated (${mode})` }
  }

  if (declaredVersion === '0.2') {
    if (mode === 'evaluation') throw new Error('v0.2 has no evaluation surface')
    if (mode === 'fresh') assertUniversalManifestV02Fresh(manifest)
    else assertUniversalManifestV02(manifest)
    return { result: 'accept', reason: `0.2 manifest validated (${mode})` }
  }

  // v0.4, plus any envelope handed to us while the v0.4 suite is running: the
  // v0.4 package deliberately contains a v0.3 envelope exercised through the
  // EXT-T1 Section T1.6.4 backwards-compatibility path, so the suite version —
  // not the envelope's own version — selects the v0.4 surface.
  if (declaredVersion === '0.4' || suiteVersion === '0.4') {
    if (mode === 'evaluation') {
      if (livenessLaunch !== null) {
        if (livenessLaunch.error) throw new Error(livenessLaunch.error)
        const evaluated = evaluateUniversalManifestV04WithLivenessV1(
          manifest, livenessLaunch.evaluationContext, livenessLaunch.validation
        )
        const { receipt, localLivenessDiagnosticsV1 } = evaluated
        return {
          result: receipt.outcome === 'rejected' ? 'reject' : 'accept',
          reason: `0.4 evaluation receipt outcome: ${receipt.outcome}`,
          receiptOutcome: receipt.outcome,
          checks: localLivenessDiagnosticsV1.checksExecuted,
          behavior: { receipt, processedFacets: evaluated.manifest.facets, localLivenessDiagnosticsV1 },
          ...(observationLaunch === observationVersion
            ? { executedChecks: observedLivenessV1(localLivenessDiagnosticsV1, payload, context) } : {}),
        }
      }
      const { receipt } = evaluateUniversalManifestV04(manifest, buildEvaluatorContext(context))
      const outcome = receipt?.outcome
      return {
        result: outcome === 'rejected' ? 'reject' : 'accept',
        reason: `0.4 evaluation receipt outcome: ${String(outcome)}`,
        receiptOutcome: outcome,
        behavior: { receipt },
      }
    }

    if (mode === 'fresh') assertUniversalManifestV04Fresh(manifest, buildEvaluatorContext(context).now)
    else assertUniversalManifestV04(manifest)
    return { result: 'accept', reason: `0.4 manifest validated (${mode})` }
  }

  throw new Error(`Unknown manifestVersion: ${String(declaredVersion)}`)
}

function deriveFixtureLabel(manifest) {
  try {
    const id = getManifestId(manifest)
    if (typeof id === 'string' && id.length > 0) return id
  } catch {
    // Fall back when fixture is invalid and does not expose an id.
  }

  return 'stdin-fixture'
}

/**
 * @param payload raw fixture bytes/text, or an already-parsed object from a
 *   direct caller (which cannot retain duplicate-member evidence).
 * @param context the runner's conformance context (adapter contract 1.1), or
 *   `null` when running under a 1.0 runner or by hand.
 */
export function evaluateFixture(payload, context = null) {
  let manifest
  try {
    const input = Buffer.isBuffer(payload)
      ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload)
      : payload
    manifest = typeof input === 'string' ? parseIJsonDocument(input) : input
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // A parse failure has no trusted manifest id/version. Use only the
    // runner's diagnostic label, never a partial parse or expected verdict.
    return {
      fixture: typeof context?.fixture === 'string' && context.fixture.length > 0 ? context.fixture : 'stdin-fixture',
      result: 'reject',
      reason: `invalid JSON payload: ${reason}`,
      manifestVersion: 'unknown',
      validationMode: 'structural',
      specVersion: resolveSuiteVersion(null, context),
    }
  }

  const fixture = deriveFixtureLabel(manifest)
  const manifestVersion = typeof manifest?.manifestVersion === 'string' ? manifest.manifestVersion : 'unknown'
  if ((context?.validationMode ?? manifest?.__validate) === 'bilateral') {
    return {
      fixture, result: 'reject', manifestVersion, validationMode: 'bilateral',
      reason: 'Unsupported validation mode: bilateral (TypeScript has no bilateral session API; no checks executed)',
      checks: [],
      specVersion: resolveSuiteVersion(manifest, context),
    }
  }
  let mode = 'structural'
  try {
    if (observationLaunch !== undefined && observationLaunch !== observationVersion) {
      throw new Error('Unsupported UM_CONFORMANCE_CAPABILITY_OBSERVATIONS selector')
    }
    mode = resolveValidationMode(manifest, context)
    const outcome = runValidation(manifest, mode, context, payload)

    return {
      fixture,
      result: outcome.result,
      reason: outcome.reason,
      manifestVersion,
      validationMode: mode,
      specVersion: resolveSuiteVersion(manifest, context),
      ...(outcome.receiptOutcome !== undefined ? { receiptOutcome: outcome.receiptOutcome } : {}),
      ...(outcome.behavior !== undefined ? { behavior: outcome.behavior } : {}),
      ...(outcome.checks !== undefined ? { checks: outcome.checks } : {}),
      ...(outcome.executedChecks !== undefined ? { executedChecks: outcome.executedChecks } : {}),
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    return {
      fixture,
      result: 'reject',
      reason,
      manifestVersion,
      validationMode: mode,
      specVersion: resolveSuiteVersion(manifest, context),
    }
  }
}

/**
 * Parse the runner's conformance context from its JSON transport form.
 *
 * A missing context is not an error: the runner may be a 1.0 runner, or the
 * adapter may be driven by hand. Returns `null` in that case.
 */
export function parseConformanceContext(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    rawContexts.set(parsed, { raw, parsed: structuredClone(parsed) })
    return parsed
  } catch {
    return null
  }
}

export const CONTEXT_ENV_VAR = 'UM_CONFORMANCE_CONTEXT'
export const CONTEXT_HEADER = 'x-um-conformance-context'
