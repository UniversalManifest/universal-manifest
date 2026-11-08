import fs from 'node:fs/promises'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { buildAdapterContext, getCommandInvocation } from './adapter-clients.mjs'
// The private capability contract is optional: a copy without it still runs every ordinary suite,
// and only the private opt-in refuses. Any failure other than its absence still stops the runner.
let structuralPostchecks
try {
  ({ structuralPostchecks } = await import('../private-capability-contract/structural-postchecks.mjs'))
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
}

// Private opt-in only. The accepted schema and consistency checker stay unchanged.
let capabilityValidators
function selectedCapability(options) {
  if (!structuralPostchecks) throw new Error('The private capability contract is not present in this copy of the runner')
  if (!capabilityValidators) {
    const require = createRequire(new URL('../../../packages/universal-manifest/package.json', import.meta.url))
    const Ajv = require('ajv/dist/2020.js'), addFormats = require('ajv-formats')
    // Accepted conditional subschemas inherit their array types from parents.
    // Disable that AJV lint only; every JSON Schema constraint still executes.
    const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, strictTypes: false })
    addFormats(ajv)
    const schema = JSON.parse(readFileSync(new URL('../private-capability-contract/schema.json', import.meta.url)))
    const identity = JSON.parse(readFileSync(new URL('../private-capability-contract/contract-identity.json', import.meta.url)))
    ajv.addSchema(schema, 'private-capability')
    const compile = (name) => ajv.compile({ $ref: 'private-capability#/$defs/' + name })
    capabilityValidators = { version: identity.claimVersion, input: compile('privateCapabilityInput'),
      fixture: compile('privateCapabilityFixture') }
  }
  if (options?.claimVersion !== capabilityValidators.version || options?.callerVersion !== capabilityValidators.version)
    throw new Error('Private capability selector requires the exact accepted version and matching caller agreement')
  return capabilityValidators
}
const obligationKey = (id) => JSON.stringify([id.document, id.section, id.requirement])
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function prepareCapability(options, implementation, versions) {
  const validators = selectedCapability(options)
  if (Object.keys(options).some((k) => !['claimVersion', 'callerVersion', 'input', 'checkSources'].includes(k)))
    throw new Error('Unknown capability option')
  const input = structuredClone(options.input)
  if (!validators.input(input)) throw new Error('Invalid initial capability input: ' + JSON.stringify(validators.input.errors))
  if (input.callerVersion !== options.callerVersion || input.claim.claimVersion !== options.claimVersion ||
      versions.length !== 1 || versions[0] !== input.claim.specVersion ||
      input.claim.implementation.name !== implementation.name || input.claim.implementation.version !== implementation.version ||
      input.claim.implementation.language !== implementation.language)
    throw new Error('Capability caller/spec/implementation identity conflict')
  if (input.fixtures.length || input.evidenceRecords.some((r) => r.kind !== 'source') ||
      input.claim.obligations.some((o) => o.implementedChecks.length || o.state !== 'not-implemented'))
    throw new Error('Initial capability plan cannot supply execution or implementation credit')
  const errors = structuralPostchecks(input)
  if (errors.length) throw new Error('Invalid initial capability associations: ' + errors.join(', '))
  for (const record of input.evidenceRecords)
    if (hashBytes(await fs.readFile(record.reference.path)) !== record.reference.sha256)
      throw new Error('Source evidence pin mismatch')
  const catalog = new Map(input.claim.obligations.flatMap((o) => o.requiredChecks.map((c) => [c.id, c])))
  const sources = new Map()
  if (!Array.isArray(options.checkSources)) throw new Error('checkSources must be an explicit runner-owned list')
  for (const source of options.checkSources) {
    const check = catalog.get(source.checkId)
    if (!check || source.executionKind !== check.kind || sources.has(source.checkId) ||
        Object.keys(source).some((k) => !['checkId', 'executionKind', 'reference'].includes(k)) ||
        !source.reference || Object.keys(source.reference).some((k) => !['path', 'sha256', 'pointer'].includes(k)) ||
        !path.isAbsolute(source.reference.path) || !/^[a-f0-9]{64}$/u.test(source.reference.sha256) ||
        typeof source.reference.pointer !== 'string' ||
        hashBytes(await fs.readFile(source.reference.path)) !== source.reference.sha256)
      throw new Error('Malformed, duplicate, conflicting or unpinned check producer')
    sources.set(source.checkId, source)
  }
  return { input, validators, catalog, sources, errors: [], invocations: [] }
}

function observeCapability(adapter, fixture, invocation, prepared, adapterRaw) {
  const failures = [], executions = []
  const bound = invocation && invocation.exitCode === 0 && !invocation.error &&
      invocation.payloadSha256 === hashBytes(fixture.fixtureBytes) &&
      invocation.contextJson === JSON.stringify(buildAdapterContext(fixture)) &&
      isDeepStrictEqual(invocation.adapterResult, adapterRaw)
  if (!bound)
    failures.push('No successful captured command bound to exact fixture bytes/context')
  const required = new Map(fixture.requiredChecks.map((c) => [c.id, c]))
  for (const observed of adapter.executedChecks) {
    const check = required.get(observed.checkId), source = prepared.sources.get(observed.checkId)
    if (!check) failures.push('Extra observed execution: ' + observed.checkId)
    if (!check || observed.executionKind !== check.kind) failures.push('Wrong observed execution kind: ' + observed.checkId)
    if (fixture.grade === 'structural-preview' && observed.executionKind !== 'structural')
      failures.push('Structural preview cannot prove cryptographic or behavioral execution')
    if (observed.outcome !== 'passed') failures.push('Observed check failed: ' + observed.checkId)
    if (!invocation || observed.payloadSha256 !== invocation.payloadSha256 ||
        observed.contextSha256 !== invocation.contextSha256)
      failures.push('Observed check is not bound to this invocation input/context')
    const pinnedProducer = invocation?.identityFiles.some((p) => source && p.path === source.reference.path &&
      p.sha256 === source.reference.sha256 && p.afterSha256 === source.reference.sha256)
    if (!source || source.executionKind !== observed.executionKind || !pinnedProducer)
      failures.push('No source-supported pinned producer for check: ' + observed.checkId)
    if (bound && check && source && pinnedProducer && source.executionKind === observed.executionKind &&
        observed.payloadSha256 === invocation.payloadSha256 && observed.contextSha256 === invocation.contextSha256) {
      const id = invocation.id + '/' + observed.checkId
      const index = adapter.executedChecks.indexOf(observed)
      prepared.input.evidenceRecords.push({ id, specVersion: fixture.specVersion,
        implementation: prepared.input.claim.implementation, kind: 'execution',
        checkId: observed.checkId, executionKind: observed.executionKind, outcome: observed.outcome,
        fixtureId: fixture.filename, reference: { ...invocation.reference, pointer: '/adapterResult/executedChecks/' + index } })
      executions.push({ checkId: observed.checkId, evidenceRef: id })
    }
  }
  for (const id of required.keys())
    if (!adapter.executedChecks.some((c) => c.checkId === id)) failures.push('Missing explicit observed execution: ' + id)
  if (executions.length !== adapter.executedChecks.length) failures.push('Unbound observation cannot earn execution credit')
  return { failures, executions }
}

function finishCapability(prepared) {
  const { input, validators } = prepared
  const passed = new Set(input.fixtures.filter((f) => f.result.pass).flatMap((f) => f.executedChecks.map((c) => c.checkId)))
  for (const o of input.claim.obligations) {
    o.implementedChecks = o.requiredChecks.filter((c) => passed.has(c.id)).map((c) => c.id)
    o.unmetChecks = o.requiredChecks.filter((c) => !passed.has(c.id)).map((c) => c.id)
    o.baselineBehavior = o.baselineBehavior.filter((b) => o.unmetChecks.includes(b.checkId))
    o.state = o.unmetChecks.length === 0 ? 'implemented' : o.implementedChecks.length ? 'partial' : 'not-implemented'
    o.evidence.push(...input.evidenceRecords.filter((r) => r.kind === 'execution' &&
      o.requiredChecks.some((c) => c.id === r.checkId)).map((r) => r.id))
  }
  const shape = validators.input(input)
  const errors = [...prepared.errors, ...(shape ? structuralPostchecks(input) :
    ['Capability schema: ' + JSON.stringify(validators.input.errors)])]
  return { capabilityInput: input, capabilityValid: errors.length === 0,
    capabilityErrors: [...new Set(errors)], invocations: prepared.invocations }
}

// Single source of truth for which spec versions this runner can execute.
// `normalizeSpecVersion` validates against these keys, so supporting another
// version is a one-line addition here plus the corresponding expected.json.
const EXPECTED_FILE_BY_VERSION = {
  '0.1': ['v0.1', 'expected.json'],
  '0.2': ['v0.2', 'expected.json'],
  '0.4': ['v0.4', 'expected.json'],
  '0.5': ['v0.5', 'expected.json'],
}

export const SUPPORTED_SPEC_VERSIONS = Object.freeze(Object.keys(EXPECTED_FILE_BY_VERSION).sort())

const ACCEPT = 'accept'
const REJECT = 'reject'
const REPORT_NONE = 'none'

// The fourteen receipt assertions defined in conformance/README.md. These stay
// runner-owned and are never added to the adapter's evaluation context.
const RECEIPT_SCALARS = {
  expectedReceiptOutcome: ['outcome'],
  expectedSignatureCheck: ['signatureCheck'],
  expectedFreshnessCheck: ['freshnessCheck'],
  expectedKeyRefResolution: ['keyRefResolution'],
  expectedRevocationStatus: ['revocationStatus'],
  expectedHolderBindingStatus: ['holderBindingStatus'],
  expectedPresentationProofStatus: ['presentationProofStatus'],
  expectedEffectiveTrustTier: ['effectiveTrustTier'],
  expectedLivenessFreshnessClass: ['livenessStatus', 'freshnessClass'],
}
const RECEIPT_ENTRIES = {
  expectedFacetStatus: 'facetStatuses',
  expectedClaimStatus: 'claimStatuses',
  expectedConsentStatus: 'consentStatuses',
  expectedUnprocessedEntry: 'unprocessedEntries',
}
const RECEIPT_ASSERTIONS = [...Object.keys(RECEIPT_SCALARS), ...Object.keys(RECEIPT_ENTRIES), 'expectedWarningsContain']

export function normalizeSpecVersion(input) {
  const value = String(input ?? '').trim().replace(/^v/i, '')
  if (Object.hasOwn(EXPECTED_FILE_BY_VERSION, value)) return value
  throw new Error(
    `Unsupported spec version: ${String(input)} (supported: ${SUPPORTED_SPEC_VERSIONS.join(', ')})`
  )
}

export function toReportVersionKey(specVersion) {
  return `v${normalizeSpecVersion(specVersion)}`
}

function asFixtureEntries(expectedDocument) {
  if (Array.isArray(expectedDocument)) return expectedDocument
  if (expectedDocument && typeof expectedDocument === 'object') {
    if (Array.isArray(expectedDocument.fixtures)) return expectedDocument.fixtures
    if (Array.isArray(expectedDocument.tests)) return expectedDocument.tests
    if (Array.isArray(expectedDocument.cases)) return expectedDocument.cases
  }
  throw new Error('Expected manifest must be an array or contain fixtures/tests/cases array')
}

function normalizeExpectedResult(input) {
  const result = String(input ?? '').trim().toLowerCase()
  if (result === ACCEPT || result === REJECT) return result
  throw new Error(`Invalid expected result: ${String(input)}`)
}

function normalizeExpectedEntry(rawEntry, fallbackSpecVersion, index, capability) {
  if (!rawEntry || typeof rawEntry !== 'object') {
    throw new Error(`Expected entry at index ${index} is not an object`)
  }

  const filename = rawEntry.filename ?? rawEntry.fixture ?? rawEntry.path ?? rawEntry.file
  if (typeof filename !== 'string' || filename.trim().length === 0) {
    throw new Error(`Expected entry at index ${index} is missing filename`) 
  }

  const specVersion = normalizeSpecVersion(rawEntry.specVersion ?? fallbackSpecVersion)

  const entry = {
    filename: filename.trim(),
    expectedResult: normalizeExpectedResult(rawEntry.expectedResult ?? rawEntry.expected ?? rawEntry.result),
    reason: typeof rawEntry.reason === 'string' ? rawEntry.reason : '',
    category: typeof rawEntry.category === 'string' && rawEntry.category.length > 0 ? rawEntry.category : 'unspecified',
    specVersion,
    conformanceLevel:
      typeof rawEntry.conformanceLevel === 'string' && rawEntry.conformanceLevel.length > 0
        ? rawEntry.conformanceLevel
        : 'baseline',
    // v0.4 expectation entries select a verification surface and pin the
    // evaluation environment (conformance/README.md, "v0.4 Expectation
    // Entries"). Both are carried verbatim to the adapter; the runner never
    // interprets them. `null` means the entry did not specify one.
    validationMode:
      typeof rawEntry.validationMode === 'string' && rawEntry.validationMode.length > 0
        ? rawEntry.validationMode
        : null,
    evaluationContext: normalizeEvaluationContext(rawEntry.evaluationContext),
    // Assertions belong to the runner, never to the implementation under test.
    expectedChecks: normalizeExpectedChecks(rawEntry.expectedChecks),
    expectedBehavior: normalizeEvaluationContext(rawEntry.expectedBehavior),
    ...normalizeReceiptExpectations(rawEntry, filename.trim()),
  }
  if (capability) {
    const fields = ['obligation', 'grade', 'operativeContract', 'requiredChecks']
    if (Object.keys(rawEntry).some((key) => ![...Object.keys(entry), ...fields, 'schemaValidation'].includes(key)) ||
        filename !== filename.trim() || rawEntry.specVersion !== specVersion)
      throw new Error('Unknown or conflicting private fixture metadata')
    const metadata = Object.fromEntries(fields.map((key) => [key, rawEntry[key]]))
    const candidate = { ...metadata, id: entry.filename, specVersion,
      implementation: { name: 'normalization-only', version: 'private' }, executedChecks: [],
      result: { fixture: entry.filename, expectedResult: entry.expectedResult, actualResult: 'skipped',
        pass: false, reason: entry.reason, category: entry.category, specVersion,
        conformanceLevel: entry.conformanceLevel, actualChecks: [] } }
    const validator = selectedCapability(capability).fixture
    if (!validator(candidate)) throw new Error('Invalid private fixture metadata: ' + JSON.stringify(validator.errors))
    if (new Set(metadata.requiredChecks.map((c) => c.id)).size !== metadata.requiredChecks.length ||
        metadata.requiredChecks.some((c) => obligationKey(c.obligation) !== obligationKey(metadata.obligation)))
      throw new Error('Duplicate or conflicting fixture check identities')
    Object.assign(entry, structuredClone(metadata))
  }
  return entry
}

function normalizeReceiptExpectations(entry, filename) {
  const expected = {}
  const text = (value) => typeof value === 'string' && value.length > 0
  const tier = (value) => Number.isInteger(value) && value >= 0 && value <= 3
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  for (const key of RECEIPT_ASSERTIONS) {
    if (!Object.hasOwn(entry, key)) continue
    const value = entry[key]
    let valid
    if (Object.hasOwn(RECEIPT_SCALARS, key)) {
      valid = key === 'expectedEffectiveTrustTier' ? tier(value) : text(value)
      if (key === 'expectedReceiptOutcome')
        valid = ['accepted', 'accepted-with-warnings', 'accepted-partial', 'rejected'].includes(value)
      if (key === 'expectedLivenessFreshnessClass')
        valid = ['live', 'recent', 'stale', 'unknown'].includes(value)
    } else if (key === 'expectedWarningsContain') {
      valid = Array.isArray(value) && value.every((marker) => typeof marker === 'string')
    } else if (key === 'expectedUnprocessedEntry') {
      valid = object(value) && text(value.kind) && text(value.type) &&
        Object.keys(value).every((name) => ['kind', 'type'].includes(name))
    } else if (key === 'expectedFacetStatus') {
      valid = object(value) && text(value.facetId) && text(value.status) &&
        Object.keys(value).every((name) => ['facetId', 'status', 'assuranceStatus'].includes(name))
      if (valid && Object.hasOwn(value, 'assuranceStatus')) {
        const assurance = value.assuranceStatus
        valid = object(assurance) && text(assurance.assertedClass) && typeof assurance.met === 'boolean' &&
          Object.keys(assurance).every((name) => ['assertedClass', 'met'].includes(name))
      }
    } else {
      const reference = key === 'expectedClaimStatus' ? 'claimRef' : 'consentRef'
      const allowed = key === 'expectedClaimStatus' ? [reference, 'status', 'tier'] : [reference, 'status']
      valid = object(value) && text(value.status) && Object.keys(value).every((name) => allowed.includes(name)) &&
        (!Object.hasOwn(value, reference) || text(value[reference])) &&
        (!Object.hasOwn(value, 'tier') || tier(value.tier))
    }
    if (!valid) throw new Error(`Expected entry ${filename}: invalid ${key} shape/value: ${JSON.stringify(value)}`)
    expected[key] = value
  }
  return expected
}

function normalizeEvaluationContext(rawContext) {
  if (rawContext === undefined || rawContext === null) return null
  if (typeof rawContext !== 'object' || Array.isArray(rawContext)) {
    throw new Error('Expected entry evaluationContext must be an object when present')
  }
  return rawContext
}

function normalizeExpectedChecks(checks) {
  if (checks === undefined || checks === null) return []
  if (!Array.isArray(checks) || checks.some((check) => typeof check !== 'string')) {
    throw new Error('Expected entry expectedChecks must be an array of strings')
  }
  return checks
}

// Objects select fields; arrays require the exact number and order of steps.
// Missing fields must not compare equal to an explicit null or false.
function matchesBehavior(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected
  if (actual === null || typeof actual !== 'object') return false
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length &&
      expected.every((value, index) => matchesBehavior(actual[index], value))
  }
  return !Array.isArray(actual) && Object.entries(expected).every(([key, value]) =>
    Object.hasOwn(actual, key) && matchesBehavior(actual[key], value))
}

function evaluateReceiptAssertions(adapter, fixture) {
  const expected = Object.fromEntries(RECEIPT_ASSERTIONS.filter((key) => Object.hasOwn(fixture, key))
    .map((key) => [key, fixture[key]]))
  const failures = []
  if (Object.keys(expected).length === 0) return { expected, actual: null, failures }
  // The iOS bridge emits receipt and behavior.receipt; the maintained liveness
  // adapter emits behavior.receipt. Present duplicates must agree in full.
  const top = Object.hasOwn(adapter, 'receipt')
  const nested = adapter.behavior !== null && typeof adapter.behavior === 'object' &&
    !Array.isArray(adapter.behavior) && Object.hasOwn(adapter.behavior, 'receipt')
  const receipt = top ? adapter.receipt : nested ? adapter.behavior.receipt : undefined
  if (top && nested && (!matchesBehavior(adapter.receipt, adapter.behavior.receipt) ||
      !matchesBehavior(adapter.behavior.receipt, adapter.receipt))) {
    failures.push('Conflicting receipt and behavior.receipt copies')
  }
  if (receipt === null || typeof receipt !== 'object' || Array.isArray(receipt)) {
    failures.push('Receipt assertions require a receipt object at receipt or behavior.receipt')
    return { expected, actual: receipt ?? null, failures }
  }
  for (const [key, wanted] of Object.entries(expected)) {
    let actual, matches
    if (Object.hasOwn(RECEIPT_SCALARS, key)) {
      actual = RECEIPT_SCALARS[key].reduce((value, field) =>
        value !== null && typeof value === 'object' && !Array.isArray(value) ? value[field] : undefined, receipt)
      matches = actual === wanted
    } else if (key === 'expectedWarningsContain') {
      actual = receipt.warnings
      matches = wanted.length === 0 || (Array.isArray(actual) && wanted.every((marker) =>
        actual.some((warning) => {
          // Current C ABI receipts serialize each warning as {code, message}.
          // Search its text fields, never arbitrary metadata or JSON key names.
          return warning !== null && typeof warning === 'object' && !Array.isArray(warning) &&
            typeof warning.code === 'string' && typeof warning.message === 'string' &&
            (warning.code.includes(marker) || warning.message.includes(marker))
        })))
    } else {
      actual = receipt[RECEIPT_ENTRIES[key]]
      // One entry must match every requested member, including false and zero.
      matches = Array.isArray(actual) && actual.some((entry) => matchesBehavior(entry, wanted))
    }
    if (!matches) failures.push(`${key}: expected ${JSON.stringify(wanted)}; actual ${actual === undefined ? '<absent>' : JSON.stringify(actual)}`)
  }
  return { expected, actual: receipt, failures }
}

export function normalizeExpectedEntries(expectedDocument, specVersion, capability = null) {
  if (capability) selectedCapability(capability)
  const normalizedVersion = normalizeSpecVersion(specVersion)
  const entries = asFixtureEntries(expectedDocument)
    .map((entry, index) => normalizeExpectedEntry(entry, normalizedVersion, index, capability))
    .sort((a, b) => a.filename.localeCompare(b.filename))

  if (capability && new Set(entries.map((e) => e.filename)).size !== entries.length)
    throw new Error('Duplicate private fixture identity')
  return entries
}

async function fileExists(absolutePath) {
  try {
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

// `expected.json` filenames are relative to the version package and carry a
// `valid/` or `invalid/` classifier segment. The canonical `examples/` trees
// (the fixture source for v0.1-v0.3, per conformance/README.md) are flat and
// carry no classifier, so the classifier must be stripped for that fallback.
const CLASSIFIER_SEGMENTS = new Set(['valid', 'invalid'])

function stripClassifierSegment(relativePath) {
  const segments = relativePath.split('/')
  if (segments.length > 1 && CLASSIFIER_SEGMENTS.has(segments[0])) return segments.slice(1).join('/')
  return relativePath
}

async function resolveFixturePath(filename, specVersion, conformanceRoot) {
  const cleaned = filename.replace(/^\.\//, '')
  if (path.isAbsolute(cleaned)) {
    if (!(await fileExists(cleaned))) {
      throw new Error(`Fixture file not found: ${cleaned}`)
    }
    return cleaned
  }

  const versionTag = `v${normalizeSpecVersion(specVersion)}`
  const withoutVersionPrefix = cleaned.startsWith(`${versionTag}/`) ? cleaned.slice(versionTag.length + 1) : cleaned
  const repoRoot = path.resolve(conformanceRoot, '..')
  const versionRoot = path.join(conformanceRoot, versionTag)

  // Order is load-bearing: the classifier-stripped `examples/` candidates are
  // appended last, so every filename that resolved before resolves to exactly
  // the same file now. They can only rescue a filename that previously failed.
  const candidates = [
    path.resolve(versionRoot, cleaned),
    path.resolve(versionRoot, withoutVersionPrefix),
    path.resolve(conformanceRoot, cleaned),
    path.resolve(repoRoot, cleaned),
    path.resolve(repoRoot, 'examples', versionTag, cleaned),
    path.resolve(repoRoot, 'examples', versionTag, withoutVersionPrefix),
    path.resolve(repoRoot, 'examples', versionTag, stripClassifierSegment(cleaned)),
    path.resolve(repoRoot, 'examples', versionTag, stripClassifierSegment(withoutVersionPrefix)),
  ]

  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate
  }

  throw new Error(
    `Unable to resolve fixture path for "${filename}" (spec ${specVersion}). Tried:\n${candidates
      .map((candidate) => `- ${candidate}`)
      .join('\n')}`
  )
}

async function loadJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse JSON: ${filePath}: ${reason}`)
  }
}

export async function loadExpectedSuites({ conformanceRoot, versions, baselineOnly = false, capability = null }) {
  const normalizedRoot = path.resolve(conformanceRoot)
  const normalizedVersions = versions.map(normalizeSpecVersion)

  const suites = []

  for (const specVersion of normalizedVersions) {
    const expectedRelPath = EXPECTED_FILE_BY_VERSION[specVersion]
    if (!expectedRelPath) throw new Error(`No expected manifest mapping for version ${specVersion}`)

    const expectedPath = path.join(normalizedRoot, ...expectedRelPath)
    // A copy may hold only some versions, as the public repository holds only v0.5.
    try {
      await fs.access(expectedPath)
    } catch {
      const present = Object.keys(EXPECTED_FILE_BY_VERSION).filter((version) => {
        try { readFileSync(path.join(normalizedRoot, ...EXPECTED_FILE_BY_VERSION[version])); return true } catch { return false }
      })
      throw new Error(`This copy has no conformance index for version ${specVersion} (${expectedPath}). ` +
        `Pass --versions with a version it holds: ${present.join(', ') || 'none found'}.`)
    }
    const expectedDocument = await loadJsonFile(expectedPath)
    const normalizedEntries = normalizeExpectedEntries(expectedDocument, specVersion, capability)
    const selectedEntries = baselineOnly
      ? normalizedEntries.filter((entry) => entry.conformanceLevel === 'baseline')
      : normalizedEntries

    const fixtures = []
    for (const entry of selectedEntries) {
      const fixturePath = await resolveFixturePath(entry.filename, entry.specVersion, normalizedRoot)
      // Only expected.json is runner-owned JSON. Fixtures must reach the
      // implementation unchanged, including duplicate members or bad syntax.
      const fixtureBytes = await fs.readFile(fixturePath)

      fixtures.push({
        ...entry,
        fixturePath,
        fixtureBytes,
      })
    }

    suites.push({
      specVersion,
      reportKey: toReportVersionKey(specVersion),
      expectedPath,
      fixtures,
    })
  }

  return suites
}

export function normalizeAdapterResult(adapterResult, fallbackFixture, capability = null) {
  if (!adapterResult || typeof adapterResult !== 'object') {
    throw new Error('Adapter response must be a JSON object')
  }

  const maybeResult =
    typeof adapterResult.result === 'string'
      ? adapterResult.result.toLowerCase()
      : typeof adapterResult.valid === 'boolean'
      ? adapterResult.valid
        ? ACCEPT
        : REJECT
      : ''

  if (maybeResult !== ACCEPT && maybeResult !== REJECT) {
    throw new Error('Adapter response must include result="accept" or result="reject"')
  }

  const fixture =
    typeof adapterResult.fixture === 'string' && adapterResult.fixture.trim().length > 0
      ? adapterResult.fixture
      : fallbackFixture

  const reason =
    typeof adapterResult.reason === 'string'
      ? adapterResult.reason
      : typeof adapterResult.error === 'string'
      ? adapterResult.error
      : ''

  const normalized = {
    fixture,
    result: maybeResult,
    reason,
  }
  if (capability) {
    selectedCapability(capability)
    const checks = Object.hasOwn(adapterResult, 'executedChecks') ? adapterResult.executedChecks : []
    if (!Array.isArray(checks) || checks.some((c) => !c || typeof c !== 'object' ||
        Object.keys(c).length !== 5 || Object.keys(c).some((k) =>
          !['checkId', 'executionKind', 'outcome', 'payloadSha256', 'contextSha256'].includes(k)) ||
        typeof c.checkId !== 'string' || c.checkId.length === 0 ||
        !['structural', 'cryptographic', 'behavioral'].includes(c.executionKind) ||
        !['passed', 'failed'].includes(c.outcome) ||
        !/^[a-f0-9]{64}$/u.test(c.payloadSha256) || !/^[a-f0-9]{64}$/u.test(c.contextSha256)) ||
        new Set(checks.map((c) => c.checkId)).size !== checks.length)
      throw new Error('Malformed or duplicate adapter execution observations')
    normalized.executedChecks = structuredClone(checks)
  }
  return normalized
}

function summarizeVersion(details, capability = null) {
  const total = details.length
  const passed = details.filter((detail) => detail.pass).length
  const skipped = capability ? details.filter((detail) => detail.actualResult === 'skipped').length : 0
  const failed = details.filter((detail) => !detail.pass).length - skipped

  return {
    total,
    passed,
    failed,
    skipped,
    details,
  }
}

export function determineConformanceLevel(results) {
  // Finite fixture success does not qualify all v0.5 normative/conditional
  // obligations, higher-tier cryptography or protected/privacy mechanisms.
  if (results['v0.5']) return REPORT_NONE
  const v04 = results['v0.4']
  if (v04 && v04.failed === 0 && v04.total > 0) {
    const hasExtendedFixtures =
      Array.isArray(v04.details) && v04.details.some((detail) => detail?.conformanceLevel === 'extended')
    if (hasExtendedFixtures) return 'v0.4-extended'
    return 'v0.4-baseline'
  }

  const v02 = results['v0.2']
  if (v02 && v02.failed === 0 && v02.total > 0) {
    const hasExtendedFixtures =
      Array.isArray(v02.details) && v02.details.some((detail) => detail?.conformanceLevel === 'extended')
    if (hasExtendedFixtures) return 'v0.2-extended'
    return 'v0.2-baseline'
  }

  const v01 = results['v0.1']
  if (v01 && v01.failed === 0 && v01.total > 0) return 'v0.1-baseline'

  return REPORT_NONE
}

export function assertConformanceReportShape(report) {
  const requiredTopLevel = ['implementation', 'specVersionsTested', 'testDate', 'suiteVersion', 'results', 'conformanceLevel', 'pass']
  for (const key of requiredTopLevel) {
    if (!(key in report)) {
      throw new Error(`Conformance report missing required top-level field: ${key}`)
    }
  }

  if (!report.implementation || typeof report.implementation !== 'object') {
    throw new Error('Conformance report implementation must be an object')
  }

  const implementationFields = ['name', 'version', 'language']
  for (const key of implementationFields) {
    if (typeof report.implementation[key] !== 'string') {
      throw new Error(`Conformance report implementation.${key} must be a string`)
    }
  }

  if (
    'organization' in report.implementation &&
    typeof report.implementation.organization !== 'string'
  ) {
    throw new Error('Conformance report implementation.organization must be a string when provided')
  }

  if (
    'repository' in report.implementation &&
    typeof report.implementation.repository !== 'string'
  ) {
    throw new Error('Conformance report implementation.repository must be a string when provided')
  }

  if (!Array.isArray(report.specVersionsTested) || report.specVersionsTested.some((value) => typeof value !== 'string')) {
    throw new Error('Conformance report specVersionsTested must be an array of strings')
  }

  if (typeof report.testDate !== 'string' || Number.isNaN(Date.parse(report.testDate))) {
    throw new Error('Conformance report testDate must be an ISO-8601 string')
  }

  if (typeof report.suiteVersion !== 'string' || report.suiteVersion.length === 0) {
    throw new Error('Conformance report suiteVersion must be a non-empty string')
  }

  if (!report.results || typeof report.results !== 'object') {
    throw new Error('Conformance report results must be an object')
  }

  for (const [versionKey, summary] of Object.entries(report.results)) {
    if (!summary || typeof summary !== 'object') {
      throw new Error(`Conformance report results.${versionKey} must be an object`)
    }

    const summaryFields = ['total', 'passed', 'failed', 'skipped', 'details']
    for (const field of summaryFields) {
      if (!(field in summary)) {
        throw new Error(`Conformance report results.${versionKey} missing ${field}`)
      }
    }

    if (!Array.isArray(summary.details)) {
      throw new Error(`Conformance report results.${versionKey}.details must be an array`)
    }
  }

  if (typeof report.conformanceLevel !== 'string') {
    throw new Error('Conformance report conformanceLevel must be a string')
  }

  if (typeof report.pass !== 'boolean') {
    throw new Error('Conformance report pass must be a boolean')
  }
}

export async function runConformanceSuite({
  conformanceRoot,
  versions,
  implementation,
  suiteVersion,
  baselineOnly = false,
  invokeAdapter,
  now = new Date(),
  capability = null,
}) {
  const prepared = capability ? await prepareCapability(capability, implementation, versions) : null
  const suites = await loadExpectedSuites({ conformanceRoot, versions, baselineOnly, capability })
  if (prepared) for (const suite of suites) for (const fixture of suite.fixtures) {
    const obligation = prepared.input.claim.obligations.find((o) => obligationKey(o.id) === obligationKey(fixture.obligation))
    if (!obligation || fixture.requiredChecks.some((c) => !isDeepStrictEqual(prepared.catalog.get(c.id), c)))
      throw new Error('Fixture source/check descriptor conflicts with runner-owned catalogue')
  }
  const results = {}

  for (const suite of suites) {
    const details = []

    for (const fixture of suite.fixtures) {
      let invocation = null, executions = []
      if (prepared && !fixture.operativeContract) {
        const detail = { fixture: fixture.filename, expectedResult: fixture.expectedResult,
          actualResult: 'skipped', pass: false, reason: fixture.reason,
          adapterReason: 'Design-stage fixture has no operative contract; adapter not invoked',
          category: fixture.category, specVersion: fixture.specVersion, conformanceLevel: fixture.conformanceLevel }
        details.push(detail)
        prepared.input.fixtures.push({ id: fixture.filename, obligation: fixture.obligation,
          specVersion: fixture.specVersion, implementation: prepared.input.claim.implementation,
          grade: fixture.grade, operativeContract: false, requiredChecks: fixture.requiredChecks,
          executedChecks: [], result: { ...detail, actualChecks: [] } })
        continue
      }
      try {
        // In opt-in mode even a custom invoker sees only the existing operational
        // fields. Expected results, grades, source assertions and checks stay here.
        const adapterFixture = prepared ? { filename: fixture.filename, specVersion: fixture.specVersion,
          conformanceLevel: fixture.conformanceLevel, category: fixture.category,
          validationMode: fixture.validationMode, evaluationContext: structuredClone(fixture.evaluationContext) } : fixture
        const adapterRaw = await invokeAdapter(prepared ? Buffer.from(fixture.fixtureBytes) : fixture.fixtureBytes, adapterFixture)
        invocation = prepared ? getCommandInvocation(adapterRaw) : null
        const adapter = normalizeAdapterResult(adapterRaw, fixture.filename, capability)
        const assertionFailures = []
        if (prepared) {
          const observed = observeCapability(adapter, fixture, invocation, prepared, adapterRaw)
          assertionFailures.push(...observed.failures)
          executions = observed.executions
        }
        for (const check of fixture.expectedChecks) {
          if (!Array.isArray(adapterRaw.checks) || !adapterRaw.checks.includes(check)) {
            assertionFailures.push(`Missing executed check: ${check}`)
          }
        }
        if (fixture.expectedBehavior !== null && !matchesBehavior(adapterRaw.behavior, fixture.expectedBehavior)) {
          assertionFailures.push('Returned behavior does not match expectedBehavior')
        }
        const receiptAssertions = evaluateReceiptAssertions(adapterRaw, fixture)
        assertionFailures.push(...receiptAssertions.failures)
        const hasReceiptAssertions = Object.keys(receiptAssertions.expected).length > 0

        details.push({
          fixture: fixture.filename,
          expectedResult: fixture.expectedResult,
          actualResult: adapter.result,
          pass: adapter.result === fixture.expectedResult && assertionFailures.length === 0,
          reason: fixture.reason,
          adapterReason: adapter.reason,
          category: fixture.category,
          specVersion: fixture.specVersion,
          conformanceLevel: fixture.conformanceLevel,
          ...(prepared || fixture.expectedChecks.length > 0 || fixture.expectedBehavior !== null || hasReceiptAssertions ? {
            assertionFailures,
            actualChecks: adapterRaw.checks ?? [],
            actualBehavior: adapterRaw.behavior ?? null,
          } : {}),
          ...(hasReceiptAssertions ? {
            expectedReceiptAssertions: receiptAssertions.expected,
            actualReceipt: receiptAssertions.actual,
          } : {}),
        })
      } catch (error) {
        if (prepared && !invocation) invocation = getCommandInvocation(error)
        const reason = error instanceof Error ? error.message : String(error)
        details.push({
          fixture: fixture.filename,
          expectedResult: fixture.expectedResult,
          actualResult: 'error',
          pass: false,
          reason: fixture.reason,
          adapterReason: reason,
          category: fixture.category,
          specVersion: fixture.specVersion,
          conformanceLevel: fixture.conformanceLevel,
        })
      }
      if (prepared) {
        const detail = details.at(-1)
        if (!detail.pass) prepared.errors.push(...(detail.assertionFailures?.length ?
          detail.assertionFailures : ['Failed operative fixture: ' + fixture.filename + ': ' + detail.adapterReason]))
        prepared.input.fixtures.push({ id: fixture.filename, obligation: fixture.obligation,
          specVersion: fixture.specVersion, implementation: prepared.input.claim.implementation,
          grade: fixture.grade, operativeContract: fixture.operativeContract, requiredChecks: fixture.requiredChecks,
          executedChecks: executions, result: { ...detail, actualChecks: executions.map((e) => e.checkId) } })
        if (invocation) prepared.invocations.push({ fixture: fixture.filename,
          implementation: prepared.input.claim.implementation, ...invocation })
      }
    }

    results[suite.reportKey] = summarizeVersion(details, capability)
  }

  const report = {
    implementation,
    specVersionsTested: versions.map(normalizeSpecVersion),
    testDate: now.toISOString(),
    suiteVersion,
    results,
    // This private selected subset is no new certification of an existing suite.
    conformanceLevel: prepared ? REPORT_NONE : determineConformanceLevel(results),
    pass: Object.values(results).every((summary) => summary.failed === 0 && (!prepared || summary.skipped === 0)),
  }

  assertConformanceReportShape(report)
  if (!prepared) return report
  const accounting = finishCapability(prepared)
  if (!accounting.capabilityValid) report.pass = false
  return { report, ...accounting }
}

export async function writeReport(report, reportPath) {
  const outputPath = path.resolve(reportPath)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return outputPath
}
