# Universal Manifest Conformance Suite (Draft)

This directory packages Universal Manifest conformance fixtures and machine-readable expectations for external implementers. It is the implementation-neutral, external conformance execution path named by `spec/v0.4/CONFORMANCE.md` Section 7: everything an implementation in any language needs to run the suite is the fixture files plus the `expected.json` contract documented here. The normative pass criteria live in the per-version conformance documents (for v0.4: `spec/v0.4/CONFORMANCE.md` Sections 5 and 6); this README defines how the machine-readable expectations encode them.

The fixtures a v0.4 implementation runs against live under `conformance/v0.4/` (`valid/`, `invalid/`, and `expected.json`) — this is the authoritative v0.4 suite location and the set the pass criteria in `spec/v0.4/CONFORMANCE.md` are written against. Some of those files are regular files and some are relative symlinks into `examples/` (see Packaging mode below); either way, `conformance/v0.4/` is the complete, self-contained set to execute. The parallel `examples/v0.4/` tree is a **partial mirror** used during authoring, not the full suite — do not treat it as the source of record for v0.4 (it does not carry every fixture, and its layout differs from the conformance layout).

For the earlier versions, the `examples/` trees remain the canonical fixture sources exposed through this stable conformance layout:
- `examples/v0.1/`
- `examples/v0.2/`
- `examples/v0.3/`

## Fixture Packaging

Layout:
- `conformance/v0.1/valid/` -> valid v0.1 fixtures (root fixtures + `stubs/`)
- `conformance/v0.1/invalid/` -> invalid v0.1 fixtures
- `conformance/v0.2/valid/` -> valid v0.2 fixtures
- `conformance/v0.2/invalid/` -> invalid v0.2 fixtures
- `conformance/v0.3/valid/` -> valid v0.3 fixtures
- `conformance/v0.3/invalid/` -> invalid v0.3 fixtures
- `conformance/v0.4/valid/` -> valid v0.4 fixtures
- `conformance/v0.4/invalid/` -> invalid v0.4 fixtures
- `conformance/v0.1/expected.json` -> expected outcomes for all v0.1 fixtures
- `conformance/v0.2/expected.json` -> expected outcomes for all v0.2 fixtures
- `conformance/v0.3/expected.json` -> expected outcomes for all v0.3 fixtures
- `conformance/v0.4/expected.json` -> expected outcomes for all v0.4 fixtures

Packaging mode:
- Fixture content under `valid/` and `invalid/` is a mix of regular files and relative symlinks into `examples/` (the canonical fixture source), so the conformance package stays synchronized with canonical fixtures. Both forms resolve transparently in a full repository checkout; when extracting the suite out of the repository, dereference symlinks (for example `cp -RL`).
- Directory placement does not define the expected outcome. Match each fixture's `expected.json` entry, not the directory name (one v0.4 fixture under `valid/` is an evaluation-mode reject, and one is schema-rejected while evaluator-accepted; see the v0.4 sections below).

## Version Packages And Verification Surfaces

- **v0.1, v0.2, v0.3** - one verification surface per package: structural validation with a binary accept/reject verdict per fixture. The expectation entries use only the common core fields below.
- **v0.4** - three verification surfaces, reflecting `spec/v0.4/CONFORMANCE.md` Section 5:
  1. **Structural** (the default): the full v0.4 structural contract - envelope and shape rules, cross-field constraints, and cryptographic signature verification over the canonical signing bytes. Clock-independent (no wall-clock freshness) and produces no receipt.
  2. **Evaluation**: the six-stage evaluation sequence (Arrive, Verify, Project, Consent, Compose, Receipt) executed under a pinned `evaluationContext`, producing a structured receipt whose fields the entry asserts.
  3. **Schema sweep**: the direct JSON Schema (Draft 2020-12) check against `spec/v0.4/schema.json`, tracked per-entry by `schemaValidation` (see below). This surface is intentionally weaker than the evaluator: crypto verification, temporal math, challenge matching, tier logic, and resource limits are not schema-expressible.

### Scope and status of the v0.4 suite

Two properties of this suite that a reviewer should know up front:

- **DID key resolution is deliberately out of scope.** The suite performs no DID-document dereferencing. Every fixture that verifies a signature embeds its verifying public key directly (`signature.publicKeySpkiB64`, and the analogous embedded keys on binding proofs), so any implementation in any language can verify every signature from the fixture bytes alone, with no network access and no DID resolver. Fixtures still carry `did:example` / `did:web` `keyRef` identifiers to exercise the `keyRef` ↔ embedded-key consistency check (`spec/v0.4/CONFORMANCE.md` Section 5.3), and the reference evaluator records `keyRefResolution: "unresolved"` accordingly — the identifiers are present by design, not resolved. Resolving them against live DID documents is an implementation concern outside this suite.
- **Single reference implementation; independent implementations invited.** The v0.4 fixtures and their `expected.json` entries are currently produced and checked against one reference implementation (the TypeScript package in this repository). The normative pass criteria are language-neutral (below), and **independent implementations are actively invited** — demonstrating interoperability across independent implementations is a working-group-phase goal, not something this single-implementation suite can establish on its own. Where an entry carries a reference-implementation-specific diagnostic (the `__expectedError` substring), it is explicitly non-normative; an external implementation asserts only the verdict and any receipt assertions.

## Expected Results Schema - Common Core (All Versions)

Each `expected.json` file contains:
- `suiteVersion`: conformance suite version label
- `specVersion`: target spec version (`0.1`, `0.2`, `0.3`, or `0.4`)
- `fixtures`: array of expectation entries

Every fixture entry, in every version package, includes:
- `filename`: path relative to the version package (`valid/...` or `invalid/...`)
- `expectedResult`: `accept` or `reject` - the top-level verdict on the entry's primary verification surface (structural for v0.1-v0.3 and for v0.4 structural entries; the evaluation outcome for v0.4 evaluation-mode entries, as defined under "Pass Criteria" below)
- `reason`: human-readable test intent
- `category`: conformance bucket (for example `required-fields`, `ttl`, `signature`, `holder-binding`, `consent-lifecycle`, `adversarial`)
- `specVersion`: `0.1`, `0.2`, `0.3`, or `0.4`
- `conformanceLevel`: `baseline` or `extended`

v0.1, v0.2, and v0.3 entries use only these fields.

Example entry (v0.2):

```json
{
  "filename": "invalid/missing-signature.jsonld",
  "expectedResult": "reject",
  "reason": "Reject fixture: Missing signature.",
  "category": "signature",
  "specVersion": "0.2",
  "conformanceLevel": "baseline"
}
```

## v0.4 Expectation Entries (Full Schema)

v0.4 entries extend the common core with the fields below. Every field is optional per entry; when present, it is part of the entry's pass criteria.

### `validationMode`

Selects the verification surface for the entry's primary verdict:
- **absent** -> structural validation (the default). `expectedResult: "accept"` means the fixture passes the full v0.4 structural contract with zero violations; `"reject"` means at least one violation. Structural validation includes cryptographic signature verification (for example, a bit-flipped `signature.value` or a tampered signed region is a structural reject) but evaluates no wall-clock freshness and produces no receipt.
- **`"evaluation"`** -> the fixture is processed through the six-stage evaluation sequence under the entry's `evaluationContext`, producing a structured receipt. The verdict is derived from the receipt outcome (see "Pass Criteria" below).

The published v0.4 matrix uses exactly these two forms.

### `evaluationContext`

The evaluation environment for an evaluation-mode entry. Runners MUST construct their evaluator's context from these values rather than from ambient state. Members:

- `now` - the instant the evaluator MUST evaluate at, as an RFC 3339 / ISO 8601 date-time string. This is the clock for all freshness, expiry, and liveness-window math in the entry (manifest `issuedAt`/`expiresAt`, consent expiry and withdrawal, delegation expiry, liveness attestation classification). Runners MUST pin the evaluation clock to this value; never substitute the wall clock (see the runner note on fixture expiry below).
- `maxSupportedTrustTier` - the highest trust tier the evaluator can verify (integer; the matrix uses `0` and `1`). Claims or facets whose required tier exceeds it are treated as unverifiable and recorded `trustTierUnsupported` without downgrading (Base Section 6.4.5).
- `verifierChallenge` - the verifier-issued nonce for an interactive presentation: one of the verifier-issued values consumed by the Verify-stage presentation-proof sub-step (EXT-T1 Sections T1.2 and T1.4 sub-step 2b). When set, the manifest MUST carry a `presentationProof` whose `challenge` equals it; a missing proof records `presentationProofStatus: "missing-required"` and a mismatched challenge records `"failed"` - both are replay-suspect and reject the manifest for interactive verification.
- `verifierAudience` - this verifier's identifier; when set alongside `verifierChallenge`, the proof's `audience` MUST match it (EXT-T1 Section T1.2).
- `presentedAssuranceClass` - the assurance class of the presented unlock gesture, as the evaluator determined it under EXT-T1 Section T1.3.3 (`software`, `hardware-uv`, or `hardware-bound`; defaults fail-closed to `software`). A facet whose `requiredAssuranceClass` exceeds the presented class is withheld and recorded `assuranceInsufficient`.
- `intendedScope` - the operation token(s) the evaluator intends to perform, matched literally against each governing consent's `scope` during Stage 4 Consent (Base Sections 1.4.4 and 3.1.4, fail closed): an intended operation not literally present in the consent scope denies the facet with consent status `scope-mismatch`.
- `omitProcessedAt` - receipt-comparison convenience only: when `true`, the produced receipt omits its `processedAt` timestamp so runner output is deterministic and byte-comparable across runs. It changes no evaluation semantics.

### `schemaValidation`

The expectation for the schema-sweep surface, independent of the entry's primary verdict:
- `schemaValidation.expectedResult` - `accept` or `reject`: whether the fixture passes the direct JSON Schema check against `spec/v0.4/schema.json`.
- `schemaValidation.classification` - why the two surfaces agree or differ:
  - `schema-detectable` - the structural schema itself catches the defect; a schema-only check rejects this fixture.
  - `evaluator-only` - the schema accepts the fixture; only the evaluator catches the defect (crypto verification, temporal math, challenge matching, tier logic, resource limits).

When `schemaValidation` is absent, the fixture is expected to pass the structural schema (an implicit `accept`); every entry whose schema expectation is `reject` carries the object explicitly. Consistent with `spec/v0.4/CONFORMANCE.md` Section 5.3: a schema-only implementation MUST NOT claim full evaluator conformance from the schema sweep alone.

### Receipt assertions (`expected*` fields)

Evaluation-mode entries pin receipt fields. Every assertion present in an entry MUST hold in addition to the `expectedResult` verdict. The receipt field vocabulary is defined in Base Section 3.3.1 (and Section 3.3.1.1); the tier-mechanics value sets are defined in EXT-T1.

- `expectedReceiptOutcome` - equality against the receipt's `outcome`: one of `accepted`, `accepted-with-warnings`, `accepted-partial`, or `rejected` (Base Section 3.3.1).
- `expectedSignatureCheck` - equality against the receipt's `signatureCheck` (Base Section 3.3.1; the matrix exercises `valid`, `invalid`, and `unsupported-profile`).
- `expectedFreshnessCheck` - equality against the receipt's `freshnessCheck` (Base Sections 3.1.2 and 3.3.1; the matrix exercises `expired`, `stale`, and `not-evaluated` - the latter when a prior verification failure means freshness is never reached).
- `expectedKeyRefResolution` - equality against the receipt's `keyRefResolution` (Base Sections 1.6.4 and 3.3.1; the matrix exercises `unresolved`, which caps keyRef-derived identity at Tier 0).
- `expectedRevocationStatus` - equality against the receipt's `revocationStatus` (Base Sections 3.3.1 and 3.4). Defined by the suite contract; not exercised by a current v0.4 entry (non-revocation-aware evaluators record `unchecked`).
- `expectedHolderBindingStatus` - equality against the receipt's `holderBindingStatus` (EXT-T1 Section T1.1 value set; the matrix exercises `absent`).
- `expectedPresentationProofStatus` - equality against the receipt's `presentationProofStatus` (EXT-T1 Section T1.2; the matrix exercises `verified`, `failed`, `missing-required`, and `absent`).
- `expectedEffectiveTrustTier` - equality against the receipt's `effectiveTrustTier` (integer 0-3; Base Section 6.4.5, EXT-T1 Section T1.0).
- `expectedLivenessFreshnessClass` - equality against the receipt's `livenessStatus.freshnessClass` (EXT-T1 Section T1.3: `live`, `recent`, `stale`, or `unknown`; an attestation past its `validUntil` is `unknown` regardless of `attestedAt`).
- `expectedFacetStatus` - object `{ facetId, status, assuranceStatus? }`. The receipt's `facetStatuses` MUST contain an entry whose `facetId` equals `facetId`, and that entry's `status` MUST equal `status` (the v0.4 per-facet status set, Base Section 3.3.1). When `assuranceStatus` is present, the receipt entry's `assuranceStatus.assertedClass` and `assuranceStatus.met` MUST both match (EXT-T1 Section T1.3.3 echo object).
- `expectedClaimStatus` - object `{ claimRef?, status, tier? }`. The receipt's `claimStatuses` MUST contain an entry for `claimRef` (when given; otherwise any entry), whose `status` equals `status` (the matrix exercises `unprocessable` and `trustTierUnsupported`); when `tier` is present, the entry's recorded `tier` MUST equal it.
- `expectedConsentStatus` - object `{ consentRef?, status }`. The receipt's `consentStatuses` MUST contain an entry for `consentRef` (when given; otherwise any entry) whose `status` equals `status` (the per-consent values of Base Section 3.1.4; the matrix exercises `expired`, `withdrawn`, `scope-mismatch`, and `condition-violated`).
- `expectedWarningsContain` - array of substring markers matched against the receipt's warnings surface: for each marker, at least one warning entry on the produced receipt MUST contain it as a substring. Markers assert that the receipt surfaces the specific fail-closed condition (for example an empty-scope delegation or the unbound-claims backcompat warning); they do not pin the warning entry's full text.
- `expectedUnprocessedEntry` - object `{ kind, type }`. The receipt's `unprocessedEntries` MUST contain at least one entry whose `kind` and `type` both match (for example an unrecognized pointer `@type`, Base Section 1.4.5).

### Reserved fixture-embedded members (`__` prefix)

Some invalid v0.4 fixture files embed harness-control members prefixed with a double underscore. They are suite plumbing, not manifest content:
- `__validate` - fallback validation-mode selector, used only when the `expected.json` entry does not set `validationMode`.
- `__expectedError` - a diagnostic substring of the reference implementation's rejection message, asserting the fixture is rejected for the intended reason. External implementations produce their own error text and are not required to match it; the normative pass criterion is the `expected.json` entry (verdict plus any receipt assertions).

### Dual-expectation entries

One fixture carries deliberately opposed expectations on its two surfaces: `valid/v03-backcompat-manifest.jsonld` has `expectedResult: "accept"` under `validationMode: "evaluation"` (a v0.3 envelope processed through the EXT-T1 Section T1.6.4 backwards-compatibility path, with binding statuses `absent`, the effective tier capped at 0, and the unbound-claims warning) while its `schemaValidation` records `expectedResult: "reject"` (the v0.4 structural schema rejects a v0.3 envelope). Both expectations are recorded on the same entry, and an implementation claiming both surfaces MUST reproduce both verdicts. The reverse split also occurs without leaving the accept column: `valid/manifest-locked-facet-below-floor.jsonld` is schema-accepted (`evaluator-only`) but is an evaluation-mode reject proving the assurance floor fails closed.

## Pass Criteria (v0.4)

To claim v0.4 conformance against this suite (normative statement: `spec/v0.4/CONFORMANCE.md` Section 5), an implementation MUST:

1. Process every fixture listed in `conformance/v0.4/expected.json`; do not infer expected behavior from the directory name alone.
2. For each entry, derive the verdict on the entry's surface and match `expectedResult`:
   - **Structural entries** (no `validationMode`): `accept` iff the fixture passes the full structural contract (including signature verification) with zero violations.
   - **Evaluation-mode entries** (`validationMode: "evaluation"`): execute the six-stage sequence under the entry's `evaluationContext` and emit a structured receipt. The verdict maps from the receipt's `outcome`: `rejected` -> `reject`; any accepted outcome (`accepted`, `accepted-with-warnings`, `accepted-partial`) -> `accept`.
3. For evaluation-mode entries, additionally satisfy every `expected*` receipt assertion present on the entry (outcome, scalar receipt fields, per-facet/claim/consent statuses, warnings markers, unprocessed entries) as defined above.
4. For schema-only verification, follow each entry's `schemaValidation.expectedResult` / `classification` where present - and note that a schema-only run covers only the schema-detectable subset; full conformance requires the evaluator surface.

## Runner Note - Fixture Clocks And The 2030 Expiry

- Evaluation-mode entries MUST be evaluated at the pinned `evaluationContext.now`, never the wall clock. The expected outcomes (freshness verdicts, consent expiry, delegation expiry, liveness classes) are only defined at those instants.
- The structural surface is clock-independent by design (cross-field checks such as `issuedAt <= expiresAt` need no clock), so structural entries are stable over time.
- All valid v0.4 fixtures are signed with a manifest-level `expiresAt` of `2030-06-01T00:00:00Z`. A runner that applies wall-clock freshness to the valid set (or ignores the pinned `now`) will begin rejecting every valid fixture after 2030-06-01. Pin `now` from `evaluationContext` as specified above; if the suite is exercised with real-time freshness or remains in service past that date, the fixtures must be re-signed (re-generated with fresh expiry) before June 2030.

## Conformance Levels

Conformance levels used by this suite:
- `v0.1-baseline`: passes all v0.1 fixture expectations
- `v0.2-baseline`: passes all v0.2 baseline fixture expectations
- `v0.2-extended`: passes v0.2 baseline plus revocation-aware expectations
- `v0.3-baseline`: passes all v0.3 baseline fixture expectations
- `v0.3-extended`: passes v0.3 baseline plus the revocation-aware expectations (`signature.statusRef` / `revocationCursor` fixtures)
- `v0.4-baseline`: passes all v0.4 baseline fixture expectations on the structural and evaluation surfaces (the Base + EXT-T1 / Tier-0-Tier-1 surface)
- `v0.4-extended`: passes v0.4 baseline plus the extended entries (Tier-2 ZKP binding proofs, Tier-3 ceremony proofs, and the assurance-floor fixtures)

Entry-level `conformanceLevel` values (`baseline` or `extended`) are used inside each `expected.json` to mark which fixtures belong to the extended lane. Note that a v0.4 conformance claim additionally names the tiers and optional features it covers (`spec/v0.4/CONFORMANCE.md` Section 1); the baseline/extended split is the suite's fixture-selection mechanism for that claim.

## Report And Status Schemas

Machine-readable schemas:
- `conformance/schema/conformance-report.schema.json`
- `conformance/schema/conformance-status.schema.json`

These define the standard JSON formats for implementation test reports and hosted conformance status declarations. Their `specVersion` / level enumerations currently cover v0.1/v0.2 only; the v0.3/v0.4 report vocabulary lands in a future schema update. Until then, report v0.3/v0.4 runs directly against the per-version `expected.json` matrices.

## Reference Harness (Non-Normative)

The repo-local TypeScript reference harness is one of many possible implementations; third-party adopters do not need Node/TypeScript. For cross-checking, from `packages/universal-manifest/`:
- `npm run test:v04:conformance` - the v0.4 structural + evaluation matrix against `expected.json`
- `npm run test:v04:schema` - the direct Draft 2020-12 schema sweep over all v0.4 conformance fixtures and examples
- `npm run test:v04:evaluator` / `npm run test:v04:behavioral` - evaluator and behavioral paths
- `npm test` - all suites, v0.1 through v0.4

## Badges

Badge assets:
- `conformance/badges/v0.1-baseline.svg`
- `conformance/badges/v0.2-baseline.svg`
- `conformance/badges/v0.2-extended.svg`

v0.3 and v0.4 badge assets are not yet issued; they follow once the v0.4 draft locks.

Typical usage:

```markdown
![UM conformance v0.2 baseline](./badges/v0.2-baseline.svg)
```
