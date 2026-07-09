# Universal Manifest v0.4 - Conformance

v0.4 extends v0.3 with format independence (an abstract data model plus production rules, with JSON-LD as the reference encoding and CBOR-LD as a second encoding), concrete Tier-1 binding mechanics (holder binding, presentation proof, liveness), per-facet liveness and assurance floors, Tier-2 ZKP and Tier-3 ceremony proof profiles, an extended receipt-disposition vocabulary, a statusRef resolution schema, JWE algorithm constraints, bilateral sessions with manifest forwarding, and the private-data handling wave covering per-facet isolation, write consent, unlock windows, key-lifecycle receipts, and sensitivity-ordering rules.

Conformance in v0.4 is defined against the **abstract data model**, not against any single serialization. An implementation conforms by correctly handling the abstract properties and semantics of a manifest after consuming it through at least one production rule (Base Section 4.5).

Primary references:

- Spec text: the v0.4 document set rendered at `/spec/v0.4/` (the normative source of truth), starting with the Base (Tier-0 / Tier-1 Core)
- `spec/v0.4/README.md`
- Signature profile (unchanged from v0.2): `spec/v0.2/SIGNATURE-PROFILE.md`

## 1) Conformance targets

v0.4 defines conformance for:

- **Evaluator (Consumer).** Consumes a v0.4 manifest through a production rule and processes it through the six-stage evaluation sequence, producing a structured receipt.
- **Holder.** Assembles and presents a v0.4 manifest, including (at Tier 1 or above) the holder-binding and presentation-proof material the relying party will verify.
- **Bilateral Participant.** Implements both Evaluator and Holder behaviour. In a bilateral exchange (Base Section 6.4.6), both parties independently evaluate the other's manifest; the interaction tier floor is the maximum of both parties' `requiredTrustTier` — a negotiated floor, distinct from the `effectiveTrustTier` each party verifies and records in its receipt.

A conformance claim names the **tiers** and **optional features** it covers. The tier stack is additive: a Tier-1 claim implies Tier-0; Base + EXT-T1 is the Tier-1 surface; Base + EXT-T1 + EXT-T2 is the Tier-2 surface; and so on. Optional features (statusRef, bilateral sessions, federation, CBOR-LD, scope registry, and the rest of EXT-OPT) are claimed independently of tier.

Bounded selective minimum disclosure is part of the v0.4 Base behavior. In plain language, each viewer, verifier, system, or use case receives only the minimum information it is allowed or needs to see. A v0.4 Base conformance claim covers this bounded profile through Stage 3 Project, Stage 4 Consent, sealed-entry handling, and structured receipts. It does not claim full unlinkability, cover-slot indistinguishability, resolver-operator privacy, or complete residual-fingerprint resistance; those require the higher-privacy Tier-2 / per-target implementation chain and an explicit matching claim.

## 2) Required behaviour (evaluator)

For the bounded selective-minimum-disclosure profile, the Project and Consent stages work together: the evaluator processes only the facets, claims, pointers, and device entries relevant to the viewer/verifier/system/use case and authorized by the interaction context; withheld facets are not projected and are not evidence of absence; and the receipt records the resulting per-facet outcome honestly.

An evaluator claiming v0.4 conformance MUST:

1. Execute all six stages of the evaluation sequence in order (Arrive, Verify, Project, Consent, Compose, Receipt). See spec text Section 3.1.
2. Consume the manifest through at least one conformant production rule and operate on the resulting abstract data model. JSON-LD is the reference encoding; an evaluator MAY additionally support CBOR-LD or another conformant encoding. See spec text Section 1.7 and Section 4.5.
3. Verify the signature over the canonical signing bytes defined by the production rule, and honour the v0.2/v0.3 baseline behaviour: required envelope fields, TTL rejection, Signature Profile A verification including the `keyRef` ↔ `publicKeySpkiB64` consistency check.
4. Pin the content-hashed v0.4 context document and verify its hash before trusting term definitions; an evaluator MUST NOT dereference an arbitrary remote context at evaluation time. The expected hash is the sha2-256 multihash `zQmY71ixd6ez6UkXpzGJ7fiMpwL26jzQwWp9CV6kwX4Kb4f`, computed over the exact bytes of the versioned context document (verbatim body and computation rule: Base Appendix B, EXT-OPT Section O1.7). See spec text Section 6.10.
5. Produce a structured receipt for every processed manifest. The receipt MUST include `@type` (with `um:Receipt`), `manifestId`, `outcome`, `signatureCheck`, `freshnessCheck`, and `facetStatuses` (empty array when the manifest contains zero facets). See spec text Section 3.3.
6. Record each per-facet status using the v0.4 status set: `processed`, `opaque`, `consent-denied`, `consent-missing`, `trustTierUnsupported`, `assuranceInsufficient`, `not-projected`, or `written` (`assuranceInsufficient` and `written` arise from the assurance-floor and write-authorization PREVIEW features). See spec text Section 3.3.1.
7. Treat encrypted facets as sealed entries when the evaluator lacks a decryption key, and MUST NOT reject a manifest solely because it contains undecryptable encrypted facets. See spec text Section 2.3 and Section 3.1.4.
8. Match `consents[].facetRef` against each projected facet's `@id`. When no matching consent entry exists, record `consent-missing` and MUST NOT process the facet's data. Treat expired or withdrawn consents as absent. See spec text Section 1.4.4 and Section 3.1.4.
9. For any claim relied upon at Tier 1 or above, require a verified holder binding; a claim lacking a verifiable holder binding MUST be capped at Tier 0 (`holderBindingStatus: "failed"` for a failed binding, `"absent"` for a missing one). See spec text Section 6.6 and EXT-T1.
10. When an interactive presentation is required, require a `presentationProof` whose `challenge` and `audience` match the verifier-issued challenge; reject or cap claims that fail this proof-of-possession. Of the three `proofType` values, only `did-auth` is exercised by the fixture suite and reference implementation today; `sd-jwt-kb` and `bbs-derived` are at-risk (see Section 9) and MUST fail closed when unimplemented. See EXT-T1 Section T1.2.
11. MUST NOT treat a stale liveness attestation as equivalent to current human presence; an attestation past its `validUntil` is `unknown` regardless of `attestedAt`. See EXT-T1 Section T1.3.
12. Respect `requiredTrustTier` declarations at the manifest, claim, and facet levels. Tier floors raise only - claim and facet floors MUST NOT lower the manifest-level floor. See spec text Section 6.4.5.
13. When claiming the per-facet floors PREVIEW feature, respect `requiredLiveness` floors: a facet carrying the floor MUST NOT be processed unless a validated `livenessAttestation` satisfies the requested `minFreshness` and, when required, `userVerified: true`. An evaluator that does not implement floor enforcement MUST fail closed: a floor-bearing facet is withheld, never processed (Base Section 4.7). See EXT-T1 Section T1.3.1.
14. When claiming the per-facet floors PREVIEW feature, respect `requiredAssuranceClass` floors: a facet below its required class MUST be withheld, MUST NOT be downgraded, and MUST be recorded `assuranceInsufficient` (the `assuranceStatus` echo object SHOULD additionally be recorded). The same fail-closed baseline applies to evaluators that do not implement floor enforcement. See EXT-T1 Section T1.3.3.
15. Record `trustTierUnsupported` in the receipt when the required tier has no implemented verification profile (e.g., a Tier-2 or Tier-3 requirement on a Tier-1 evaluator), and MUST NOT downgrade to a lower tier.
16. Apply the Section 3.1.2 clock-skew discipline at its stated normative levels: the tolerance for `issuedAt`/`expiresAt` comparisons SHOULD be no more than 60 seconds; manifests with `issuedAt` more than 60 seconds in the future SHOULD be rejected with `freshnessCheck: "stale"`; wider tolerances MUST be documented in the conformance claim. See spec text Section 3.1.2.
17. Preserve unknown members for processing purposes (so the signature still verifies) and act only on recognized members. Unknown members MUST NOT be stripped before signature verification and MUST NOT change a decision.
18. When `signature.statusRef` is present and the evaluator claims revocation-aware verification, resolve revocation status per the statusRef resolution schema (Section 3.4) and record `revocationStatus`. Evaluators not implementing revocation-aware verification MUST report `revocationStatus: "unchecked"` and MUST NOT claim revocation-aware conformance.
19. When claiming the private-data PREVIEW features, enforce their fail-closed limits: per-facet isolation claims are cross-field structural obligations, writes require target-facet write consent, unlock windows never lower per-facet floors or isolation, key-lifecycle receipt events are assertions rather than erasure proof, and derived writes MUST NOT down-label when a profile supplies a sensitivity ordering. See Base Sections 2.3.5, 3.1.4, 7.2 and EXT-OPT Sections O3 and O4.5.

## 3) Required behaviour (holder)

A holder claiming v0.4 conformance MUST:

1. Set `manifestVersion: "0.4"` and include the v0.4 versioned context `https://universalmanifest.net/ns/v0.4` in `@context`.
2. Generate an opaque `@id` (e.g., `urn:uuid:<uuidv4>`) per Section 1.2.2, and produce the manifest through a conformant production rule.
3. Bind `subject` to a stable identifier URI (typically a DID), and bound `expiresAt` to a sensible interaction lifetime relative to `issuedAt`.
4. Sign the manifest using Signature Profile A (`signature.algorithm: "Ed25519"`, `signature.canonicalization: "JCS-RFC8785"`, `signature.keyRef` present, `signature.value` populated over the canonical signing bytes).
5. Where consents are used, include them as full v0.4 consent entries with `@id`, `@type: "um:Consent"`, `facetRef` matching a facet's `@id`, `scope`, `purpose`, `grantedAt`, and `expiresAt`.
6. Where encrypted facets are used, set `encryptionProfile: "jwe-inline-v1"` on the facet and supply a conformant JWE JSON Serialization object as the `entity` value, using an algorithm pair consistent with the JWE algorithm constraints. See spec text Section 2.3.2 and Section 2.4.
7. Where per-facet floors are used, provide well-formed `requiredLiveness` and `requiredAssuranceClass` values and the liveness/provenance evidence needed for the evaluator to satisfy or refuse those floors. See EXT-T1 Section T1.3.
8. For any claim intended to be relied upon at Tier 1 or above, include a `holderBinding` with a valid `mode` (`sd-jwt-kb`, `bbs-holder-commitment`, or `reciprocal-control`) and the fields that mode requires (e.g., `cnfThumbprint` for `sd-jwt-kb`; `boundDid`, `subjectProof`, and `boundDidProof` for `reciprocal-control`). See EXT-T1 Section T1.1.
9. When presenting interactively, include a `presentationProof` containing `proofType`, `challenge`, `audience`, `created`, and `proofValue`. See EXT-T1 Section T1.2.
10. Where Tier-2 binding is asserted, include a `bindingProof` of a defined `type` (`ZkLinkedSecretProof` or `ZkHdDerivationProof`) with the fields that type requires. See EXT-T2 and spec text Section 6.4.7.
11. Where Tier-3 ceremony is asserted, include a `ceremonyProof` (`type: "ThresholdAttestationProof"`) with `threshold`, `attesters`, `ceremonyId`, and `aggregateProof`. See EXT-T3 and spec text Section 6.4.8.
12. Where `identity.crossDidBinding` claims are issued, populate all required fields (`@type`, `issuer`, `boundDids` containing at least 2 DIDs) and, for attester-asserted bindings, the attester triple (`attester`, `attestationMethod`, `attestedAt`); the triple is OPTIONAL when a cryptographic `bindingProof` or `ceremonyProof` carries the binding. See spec text Section 6.4.4.
13. Where `um:agentDelegation` pointers are issued, populate all required fields (`@type: "um:agentDelegation"`, `delegateType`, `delegatedBy` matching the manifest `subject`, `delegatedAt`, `expiresAt`), using registered scope values where the scope registry applies. See spec text Section 6.5 and EXT-OPT.
14. Where write authorization, unlock-window, key-lifecycle receipt, or sensitivity-ordering PREVIEW features are claimed, use the wire members and scope/event/profile tokens defined by Base Sections 3.1.4 and 7.2 plus EXT-OPT Sections O3 and O4.5.

## 4) Required behaviour (bilateral participant)

A Conformant Bilateral Participant MUST implement both Evaluator Behaviour (Section 2) and Holder Behaviour (Section 3). In a bilateral exchange:

- Both parties present manifests.
- Both parties independently evaluate the other's manifest through the six-stage sequence.
- The interaction tier floor for the exchange is the maximum of either party's `requiredTrustTier` — a negotiated floor, distinct from the `effectiveTrustTier` each party verifies and records in its receipt.
- For Sybil-critical or high-risk actions, parties MUST fail closed when required tier checks are not satisfied.
- For lower-risk actions, parties MAY degrade to a restricted mode that excludes trust-transitive or high-impact operations.
- Receipts produced within a bilateral session MUST carry `exchangeId` and `evaluatorId`. The full session object, paired-receipt correlation, and receipt hash-chaining are specified in EXT-OPT Section O4.

See spec text Section 4.3 and Section 6.4.6; EXT-OPT Section O4.

## 5) Conformance fixtures

To claim v0.4 conformance, an implementation MUST:

1. Process every fixture listed in `conformance/v0.4/expected.json`.
2. Match each fixture's `expectedResult`; do not infer expected behavior from the directory name alone.
3. For evaluation-mode fixtures, emit a structured receipt whose outcome and facet status match the expected outcome.
4. For schema-only verification, follow each fixture's `schemaValidation.expectedResult` / `classification` where present.

### 5.1 Valid fixtures

Located under `conformance/v0.4/valid/`. These fixtures are accepted at the suite level — several in evaluation mode with `accepted-partial` / `accepted-with-warnings` outcomes and receipt-observable statuses — with two deliberate exceptions called out in their entries: one evaluation-mode reject that proves the assurance floor fails closed, and one v0.3 envelope that the v0.4 structural schema rejects while the evaluator accepts it through the backwards-compatibility path:

- `minimal-signed-manifest.jsonld` - baseline v0.4 signed envelope (no facets, no claims) verifying under Signature Profile A.
- `manifest-with-holder-binding.jsonld` - claim carrying a `holderBinding` in `sd-jwt-kb` mode per EXT-T1 Section T1.1.
- `manifest-with-bilateral-session-receipt.jsonld` - manifest with facets and consents suitable for bilateral session evaluation.
- `manifest-with-zkp-binding-proof.jsonld` - claim carrying a `ZkLinkedSecretProof` `bindingProof` per Section 6.4.7.
- `manifest-with-ceremony-proof.jsonld` - claim carrying a `ThresholdAttestationProof` `ceremonyProof` per Section 6.4.8 (transitional: predates the `protocol` member, which is REQUIRED only at wire freeze - EXT-T3 Section T3.1).
- `manifest-with-agent-delegation-scopes.jsonld` - `um:agentDelegation` pointer with core scope values per Section 6.5.
- `manifest-with-encrypted-facet.jsonld` - facet using the JWE inline profile (carried forward from v0.3).
- `manifest-with-isolated-facets.jsonld` - two encrypted facets with distinct recipient `kid` values and distinct IVs for the per-facet isolation smoke path.
- `facet-required-liveness.jsonld` - facet carrying a well-formed `requiredLiveness` floor.
- `profile-facet-sensitivity-ordering.jsonld` - profile-defined facet sensitivity ordering for derived-write monotonicity (transitional manifest-carried shape - see Section 9 / UM-v04-DEC-03).
- `consent-with-write-scope.jsonld` - consent whose `scope` includes a write operation for a target facet.
- `receipt-facet-key-shredded.jsonld` - receipt manifest carrying `facet-key-rotated` / `facet-key-shredded` lifecycle events.
- `consent-unlock-window.jsonld` - consent carrying `unlock.window` scope and an enumerated unlock-window facet set.
- `facet-required-assurance-class.jsonld` - locked facet carrying `requiredAssuranceClass: "hardware-bound"` plus a locked liveness floor.
- `facet-assurance-hardware-uv.jsonld` - facet carrying the intermediate `requiredAssuranceClass: "hardware-uv"` rung.
- `facet-assurance-software.jsonld` - facet carrying the default/lowest `requiredAssuranceClass: "software"` rung.
- `manifest-locked-facet-below-floor.jsonld` - structurally valid manifest that MUST reject in evaluation mode with `assuranceInsufficient` when presented with a software-class unlock below a `hardware-bound` floor.
- `manifest-with-unknown-members.jsonld` - unknown root members, an unknown entity field, and a devices array, all covered by a genuine signature; an implementation that strips unknown members before verification fails this fixture.
- `manifest-with-bbs-holder-binding.jsonld` - `bbs-holder-commitment` holder binding carrying its required `commitment` and `proofValue` plus an optional `pseudonymScope` per EXT-T1 Section T1.1.1.
- `manifest-with-reciprocal-holder-binding.jsonld` - `reciprocal-control` holder binding carrying its required `boundDid`, `subjectProof`, and `boundDidProof` per EXT-T1 Section T1.1.
- `manifest-with-presentation-proof.jsonld` - interactive presentation with a genuine did-auth `presentationProof` per EXT-T1 Section T1.2; the manifest signature excludes `presentationProof` from the signing input, and `keyRefResolution: "unresolved"` caps keyRef-derived identity at Tier 0.
- `manifest-with-liveness-attestation.jsonld` - well-formed `livenessAttestation` evaluated inside its validity window; `livenessStatus.freshnessClass` records `live` per EXT-T1 Section T1.3.
- `liveness-attestation-past-valid-until.jsonld` - stale-liveness replay check: an attestation past its `validUntil` classifies `unknown` regardless of `attestedAt` and is never treated as current human presence.
- `agent-delegation-fail-closed-defaults.jsonld` - delegation with an empty `scope` (grants no capabilities) and no `delegateId` (attributed to no agent); both fail-closed defaults are receipt-observable warnings (`accepted-with-warnings`).
- `facet-without-consent.jsonld` - facet with no governing consent entry records `consent-missing` and is not processed (`accepted-partial`).
- `consent-expired.jsonld` - expired consent treated as absent: facet `consent-denied` with consent status `expired`.
- `consent-withdrawn.jsonld` - withdrawn consent (`withdrawnAt` set) treated as absent: facet `consent-denied` with consent status `withdrawn`.
- `consent-scope-mismatch-read.jsonld` - intended `read` operation not literally present in the consent `scope`: facet `consent-denied` with consent status `scope-mismatch`.
- `consent-unknown-condition.jsonld` - consent condition the evaluator cannot recognize or enforce fails closed: facet `consent-denied` with consent status `condition-violated`.
- `encrypted-facet-sealed-entry.jsonld` - encrypted facet the evaluator cannot decrypt is acknowledged as a sealed entry (`opaque`, outcome `accepted-partial`), never rejected solely for being undecryptable.
- `claim-unrecognized-type.jsonld` - unrecognized claim `@type` treated as unprocessable (present but unverifiable above Tier 0) and recorded in `claimStatuses`.
- `pointer-unrecognized-type.jsonld` - unrecognized pointer `@type` recorded as present (receipt `unprocessedEntries`) and not acted on.
- `claim-tier-cap-no-holder-binding.jsonld` - claim relied upon at Tier 1 with no `holderBinding` is capped at Tier 0: `holderBindingStatus: "absent"`, `effectiveTrustTier` 0, claim recorded `trustTierUnsupported`.
- `claim-tier-unsupported-by-evaluator.jsonld` - Tier-2 claim on a Tier-1 evaluator treated as unverifiable and recorded `trustTierUnsupported` without downgrading (`accepted-partial`).
- `cross-did-binding-proof-only.jsonld` - `identity.crossDidBinding` carrying a cryptographic `bindingProof` and no attester triple; the attester fields are required only for attester-asserted bindings per Section 6.4.4.
- `v03-backcompat-manifest.jsonld` - v0.3 envelope processed through the EXT-T1 Section T1.6.4 backwards-compatibility path (`absent` binding statuses, tier capped at 0, unbound-claims warning); the v0.4 structural schema rejects it while the evaluator accepts it.

### 5.2 Invalid fixtures

Located under `conformance/v0.4/invalid/`:

- `holder-binding-invalid-mode.jsonld` - `holderBinding.mode` outside the enum (`sd-jwt-kb` | `bbs-holder-commitment` | `reciprocal-control`).
- `holder-binding-missing-cnf.jsonld` - `sd-jwt-kb` mode without the required `cnfThumbprint`.
- `ceremony-proof-insufficient-attesters.jsonld` - `ceremonyProof.attesters` smaller than the M required by `threshold`.
- `binding-proof-invalid-type.jsonld` - `bindingProof.type` not `ZkLinkedSecretProof` or `ZkHdDerivationProof`.
- `missing-signature.jsonld` - no `signature` member.
- `claim-tier-below-manifest-floor.jsonld` - `claim.requiredTrustTier` lower than `manifest.requiredTrustTier` (Section 6.4.5; the floor raises only).
- `required-liveness-bad-minfreshness.jsonld` - `requiredLiveness.minFreshness` uses a value outside `live` / `recent` / `stale`.
- `required-liveness-not-object.jsonld` - `requiredLiveness` is not an object.
- `facet-assurance-class-bad-enum-shape.jsonld` - `requiredAssuranceClass` uses a value outside `software` / `hardware-uv` / `hardware-bound`.
- `facet-assurance-class-not-string-shape.jsonld` - `requiredAssuranceClass` is not a string enum value.
- `bad-signature-value.jsonld` - cryptographically wrong `signature.value` (bit-flipped after signing); Ed25519 verification over the Section 1.6.3 signing input fails, while a signature-presence-only implementation would accept.
- `tampered-after-signing.jsonld` - `subject` mutated after signing, so the signature no longer covers the canonical bytes.
- `key-substitution-mismatch.jsonld` - embedded `publicKeySpkiB64` substituted with a foreign key after signing (the Section 1.6.4 key-substitution attack).
- `expired-manifest.jsonld` - evaluation clock past `expiresAt`; the signature is genuine and only TTL math rejects (`freshnessCheck: "expired"`).
- `issued-after-expires.jsonld` - `issuedAt` later than `expiresAt` (cross-field temporal misuse over a genuine signature).
- `future-issued-at.jsonld` - `issuedAt` more than 60 seconds in the future; rejected with `freshnessCheck: "stale"` per Section 3.1.2.
- `manifest-version-mismatch.jsonld` - `manifestVersion: "0.5"` is supported by no v0.4 processing path (v0.3 envelopes instead take the EXT-T1 Section T1.6.4 backwards-compatibility path).
- `unsupported-signature-profile.jsonld` - `signature.algorithm: "ES256"` is not a supported profile pair; rejected with `signatureCheck: "unsupported-profile"`.
- `type-missing-um-manifest.jsonld` - `@type` does not include `um:Manifest`.
- `context-wrong-namespace.jsonld` - `@context` carries a substituted namespace that cannot match the pinned v0.4 context document (Section 6.10 context substitution).
- `holder-binding-reciprocal-missing-fields.jsonld` - `reciprocal-control` mode without `subjectProof` / `boundDidProof`; rejected as a binding failure.
- `holder-binding-bbs-missing-commitment.jsonld` - `bbs-holder-commitment` mode without its required `commitment` field (EXT-T1 Section T1.1.1).
- `presentation-proof-challenge-mismatch.jsonld` - `presentationProof.challenge` does not match the verifier-issued nonce; replay-suspect, rejected for interactive verification.
- `presentation-proof-audience-mismatch.jsonld` - `presentationProof.audience` does not match this verifier; rejected for interactive verification.
- `presentation-proof-missing-when-challenged.jsonld` - the verifier issued a challenge and the manifest carries no `presentationProof`; `presentationProofStatus: "missing-required"`, rejected for interactive verification.
- `liveness-missing-valid-until.jsonld` - `livenessAttestation` without its required `validUntil` (EXT-T1 Section T1.3).
- `agent-delegation-delegatedby-mismatch.jsonld` - `um:agentDelegation` whose `delegatedBy` does not match the manifest `subject` (Section 6.5.1).
- `agent-delegation-expired.jsonld` - `um:agentDelegation` past its `expiresAt`; expired delegations are rejected (Section 6.5.1).
- `encrypted-facet-malformed-jwe.jsonld` - encrypted facet whose JWE lacks `iv` and `tag`; structural conformance requires all five JWE JSON Serialization fields (Section 2.3.2).
- `facet-tier-below-manifest-floor.jsonld` - `facet.requiredTrustTier` lower than `manifest.requiredTrustTier` (Section 6.4.5; the floor raises only).
- `v03-backcompat-tier-floor-unsatisfiable.jsonld` - v0.3 envelope declaring a Tier-1 floor that cannot be satisfied at the backwards-compatibility Tier-0 cap; rejected per Section 6.4.5 and EXT-T1 Section T1.6.4.
- `claim-proof-oversize-vp.jsonld` - embedded `claimProof` VP over the 50 KB per-VP limit (Section 6.4.3).
- `missing-subject.jsonld` - missing required `subject` (Section 1.3.2).
- `missing-expires-at.jsonld` - missing required `expiresAt` (Section 1.3.3).
- `consent-missing-facet-ref.jsonld` - consent entry missing its required `facetRef` (Section 1.4.4).
- `signature-keyref-without-embedded-key.jsonld` - `keyRef` resolution unavailable by construction and no `publicKeySpkiB64` embedded; the manifest cannot be verified (Section 1.6.4 key-resolution ladder).

The reference implementation exercises every fixture in this list, and the expected outcomes are recorded in `conformance/v0.4/expected.json`.

### 5.3 Schema-detectable vs evaluator-only rejections

The direct JSON Schema contract is intentionally structural. `conformance/v0.4/expected.json` is the normative fixture matrix for schema sweep behavior:

- Schema-detectable rejects: `invalid/holder-binding-invalid-mode.jsonld`, `invalid/holder-binding-missing-cnf.jsonld`, `invalid/binding-proof-invalid-type.jsonld`, `invalid/missing-signature.jsonld`, `invalid/required-liveness-bad-minfreshness.jsonld`, `invalid/required-liveness-not-object.jsonld`, `invalid/facet-assurance-class-bad-enum-shape.jsonld`, `invalid/facet-assurance-class-not-string-shape.jsonld`, `invalid/manifest-version-mismatch.jsonld`, `invalid/unsupported-signature-profile.jsonld`, `invalid/type-missing-um-manifest.jsonld`, `invalid/context-wrong-namespace.jsonld`, `invalid/holder-binding-reciprocal-missing-fields.jsonld`, `invalid/holder-binding-bbs-missing-commitment.jsonld`, `invalid/liveness-missing-valid-until.jsonld`, `invalid/encrypted-facet-malformed-jwe.jsonld`, `invalid/v03-backcompat-tier-floor-unsatisfiable.jsonld`, `invalid/missing-subject.jsonld`, `invalid/missing-expires-at.jsonld`, and `invalid/consent-missing-facet-ref.jsonld`.
- Evaluator-only rejects (the schema accepts these; only the evaluator catches them — crypto verification, temporal math, challenge matching, tier logic, and resource limits are not schema-expressible): `invalid/ceremony-proof-insufficient-attesters.jsonld`, `invalid/claim-tier-below-manifest-floor.jsonld`, `valid/manifest-locked-facet-below-floor.jsonld`, `invalid/bad-signature-value.jsonld`, `invalid/tampered-after-signing.jsonld`, `invalid/key-substitution-mismatch.jsonld`, `invalid/expired-manifest.jsonld`, `invalid/issued-after-expires.jsonld`, `invalid/future-issued-at.jsonld`, `invalid/presentation-proof-challenge-mismatch.jsonld`, `invalid/presentation-proof-audience-mismatch.jsonld`, `invalid/presentation-proof-missing-when-challenged.jsonld`, `invalid/agent-delegation-delegatedby-mismatch.jsonld`, `invalid/agent-delegation-expired.jsonld`, `invalid/facet-tier-below-manifest-floor.jsonld`, `invalid/claim-proof-oversize-vp.jsonld`, and `invalid/signature-keyref-without-embedded-key.jsonld`.
- One inversion runs the other way: `valid/v03-backcompat-manifest.jsonld` fails the v0.4 structural schema (it is a v0.3 envelope) but is accepted by the evaluator through the EXT-T1 Section T1.6.4 backwards-compatibility path; its `expected.json` entry records both expectations.

Schema-only implementers MUST NOT claim full evaluator conformance from the schema sweep alone. The repo-local `npm run test:v04:schema` command runs the direct Draft 2020-12 schema matrix over all v0.4 conformance fixtures and examples; `npm run test:v04:conformance`, `npm run test:v04:evaluator`, and `npm run test:v04:behavioral` cover the evaluator and behavioral paths.

## 6) Adversarial and misuse expectations

v0.4 conformance verification MUST include rejection tests for the v0.2/v0.3 baseline cases (signature spoofing, signature misuse, temporal misuse, manifest-version mismatch) plus v0.4-specific cases:

1. **Holder-binding bypass** - a claim relied upon at Tier 1+ with no holder binding, or with an invalid `mode`, MUST NOT be treated as Tier 1; it caps at Tier 0. See EXT-T1.
2. **Missing binding fields** - `sd-jwt-kb` without `cnfThumbprint`, or `reciprocal-control` without `boundDid` / `subjectProof` / `boundDidProof`, MUST be rejected as a binding failure.
3. **Trust-tier downgrade attempts** - claim or facet floors that attempt to specify a lower `requiredTrustTier` than the manifest-level floor MUST be rejected (the floor raises only, Section 6.4.5).
4. **Malformed binding/ceremony proofs** - a `bindingProof` with a `type` outside the defined set, or a `ceremonyProof` whose `attesters` count is below the `threshold`, MUST be rejected.
5. **Stale liveness replay** - a `livenessAttestation` past its `validUntil`, or an interactive presentation whose `presentationProof` challenge/audience does not match the verifier's, MUST NOT be accepted as current human presence.
6. **Malformed JWE encrypted facets** - incomplete JWE structures that an evaluator would otherwise sealed-entry through. Structural conformance MUST require all five JWE fields (`protected`, `recipients`, `iv`, `ciphertext`, `tag`).
7. **Context substitution** - a manifest whose context document fails its content-hash check MUST NOT have its term definitions trusted (Section 6.10).
8. **Agent delegation with delegator/subject mismatch** - `um:agentDelegation` with `delegatedBy` not matching the manifest `subject`, and **expired delegation** (`expiresAt` in the past), MUST be rejected. See Section 6.5.

## 7) Standalone conformance suite (external adopter path)

For implementation-neutral, external conformance execution, use the standalone suite documentation:

- Suite package root (repo path): `conformance/README.md`
- v0.4 fixture root: `conformance/v0.4/`
- Expected outcomes: `conformance/v0.4/expected.json`

The standalone suite is language-neutral and encoding-neutral: it packages fixtures plus expected outcomes so implementations can prove equivalent v0.4 verification behaviour across runtimes and across conformant production rules.

## 8) Reference harness (repo-local)

This repo includes a TypeScript reference harness (one of many possible implementations):

- `packages/universal-manifest/` - `npm test` runs structural validation across all example sets, including v0.4 fixtures.

Third-party adopters do not need Node/TypeScript; the fixtures are designed to be portable. You can build a conformant harness in any language and over any conformant encoding.

## 9) Notes on PREVIEW features

Several v0.4 capabilities are built into the draft on the editors' recommended defaults and are marked **PREVIEW** - under active working-group review and revisable before the schema locks. The Base (Tier-0 / Tier-1 core) is the production-candidate surface that a developer can ship and interoperate on, the same test v0.3 passed. PREVIEW comes in two grades (the "two-grade PREVIEW policy" cited from Base Section 4.4): **Grade-1 (structural) PREVIEW** - members already on the wire (context term + shape fixtures) whose enforcement semantics remain revisable. **Grade-2 (design-stage) PREVIEW** - candidate members not yet in the schema/context/fixtures at all. PREVIEW surfaces include:

- **Tier-2 ZKP binding profiles** (EXT-T2) and **Tier-3 ceremony** (EXT-T3) - the proof objects are structurally defined; the verification profiles are PREVIEW.
- **Presentation-proof mechanisms `sd-jwt-kb` and `bbs-derived`** (EXT-T1 Section T1.2) - **at-risk / specification-only.** Of the three `presentationProof.proofType` values, only `did-auth` is exercised by the v0.4 fixture suite and the reference implementation; `sd-jwt-kb` (whose manifest binding depends on the unratified decision UM-v04-DEC-07) and `bbs-derived` have no fixtures and no implementation, so interoperability for the two is not yet demonstrable. An implementation MUST fail them closed rather than report an unverified proof as verified, and a conformance claim relying on interactive presentation SHOULD state which `proofType` it implements. Both are pending working-group ratification and fixtures.
- **Per-facet liveness and assurance floors**, **locked-tier portable unlock**, **per-facet cryptographic isolation**, **write authorization**, and **key-lifecycle receipt events** are present in the source, schema/context where structural, and fixtures where currently covered; enforcement is PREVIEW where marked by the source profiles. **Facet sensitivity ordering** is profile-supplied: the label ordering that gates derived writes comes from a registered profile the deployment pins, not from the manifest under evaluation; the derived-write join rule (Base Section 7.2) stays normative, while the manifest-carried ordering member still present in the current context and fixture set is transitional and comes off the wire before the schema locks. (The reference behavioral harness transitionally sources the q3 test ordering from this manifest-carried member until that same cleanup; a conforming evaluator MUST NOT.)
- **Receipt as a first-class manifest class** with hash-chaining, the **bilateral session model**, **federation** and manifest forwarding, **profile registration**, the **agent-delegation scope registry**, **category trust / trustWeight**, and the **extended structural schemas** (EXT-OPT) - claimed as optional features, PREVIEW per part.
- **Post-quantum signatures** (Base Section 6.7) - named as a migration path; PREVIEW.
- **Design-stage candidate profiles** (EXT-OPT Sections O2.6, O12, O13, O14): **current policy-state resolution**, **asset-bound represented-person consent**, **signed referral-route attribution**, and **GeoPose primary pose values** - PREVIEW at the design stage. Their candidate members and value tokens are not yet in the published schema/context or the fixture suite, and they carry no conformance tests until their designs are finalized (Section 4.4 discipline). A conformance claim MUST NOT include them yet; for evaluators that do not implement them, the existing fail-closed baselines apply (unrecognized claim types unprocessable above Tier 0, unrecognized pointer types recorded but not acted on, unrecognized or unenforceable consent conditions fail closed, and missing or unverifiable GeoPose data is not inferred).

One boundary note that is **not** itself a PREVIEW surface: **selective minimum disclosure** is production-candidate Base behavior (Sections 1 and 2 above), claimed only in its bounded v0.4 form — projection-scoped disclosure, consent gating, sealed-entry handling, and receipt evidence. What remains open is the deeper high-privacy per-target chain: full unlinkability, cover-slot indistinguishability, resolver-operator privacy, and residual-fingerprint measurement. Do not infer those guarantees from a Base conformance claim.

A second boundary note of the same kind: **carrying an external-standard artifact** (for example C2PA content-credential material, an OGC GeoPose payload, or a W3C Verifiable Credential) inside or by reference from a manifest does not extend a v0.4 conformance claim to that artifact. The carried standard verifies under its own rules, independently of the UM envelope evaluation, and a v0.4 receipt records the UM envelope outcome — not the carried standard's verdict. Absent a registered carry profile, an evaluator that cannot evaluate a carried standard preserves it (sealed/opaque or unprocessed, per the fail-closed baselines above) and does not report it as verified. A dedicated carried-standard verification-result field and an unknown-carried-standard disposition value are future registered-profile work, not Base members.

A conformance claim SHOULD state which PREVIEW features, if any, it implements, since their wire shape may still change.

## 10) Implementation onboarding package (non-normative)

- Repo guide: `../../docs/guides/IMPLEMENTATION-GUIDE.md`
- Quick card: `../../docs/guides/QUICK-REFERENCE.md`
- Agent handoff: `../../docs/guides/AGENT-HANDOFF.md`
