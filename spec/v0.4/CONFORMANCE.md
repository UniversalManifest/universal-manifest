# Universal Manifest v0.4 - Conformance

v0.4 extends v0.3 with format independence (an abstract data model plus production rules, with JSON-LD as the reference encoding and CBOR-LD as a second encoding), concrete Tier-1 binding mechanics (holder binding, presentation proof, liveness), Tier-2 ZKP and Tier-3 ceremony proof profiles, an extended receipt-disposition vocabulary, a statusRef resolution schema, JWE algorithm constraints, and the bilateral session model with manifest forwarding.

Conformance in v0.4 is defined against the **abstract data model**, not against any single serialization. An implementation conforms by correctly handling the abstract properties and semantics of a manifest after consuming it through at least one production rule (Base Section 4.5).

Primary references:

- Spec text: the v0.4 document set rendered at `/spec/v0.4/` (the normative source of truth), starting with the Base (Tier-0 / Tier-1 Core)
- `spec/v0.4/README.md`
- Signature profile (unchanged from v0.2): `spec/v0.2/SIGNATURE-PROFILE.md`

## 1) Conformance targets

v0.4 defines conformance for:

- **Evaluator (Consumer).** Consumes a v0.4 manifest through a production rule and processes it through the six-stage evaluation sequence, producing a structured receipt.
- **Holder.** Assembles and presents a v0.4 manifest, including (at Tier 1 or above) the holder-binding and presentation-proof material the relying party will verify.
- **Bilateral Participant.** Implements both Evaluator and Holder behaviour. In a bilateral exchange (Base Section 6.4.6), both parties independently evaluate the other's manifest; the effective interaction tier is the maximum of both parties' `requiredTrustTier`.

A conformance claim names the **tiers** and **optional features** it covers. The tier stack is additive: a Tier-1 claim implies Tier-0; Base + EXT-T1 is the Tier-1 surface; Base + EXT-T1 + EXT-T2 is the Tier-2 surface; and so on. Optional features (statusRef, bilateral sessions, federation, CBOR-LD, scope registry, and the rest of EXT-OPT) are claimed independently of tier.

## 2) Required behaviour (evaluator)

An evaluator claiming v0.4 conformance MUST:

1. Execute all six stages of the evaluation sequence in order (Arrive, Verify, Project, Consent, Compose, Receipt). See spec text Section 3.1.
2. Consume the manifest through at least one conformant production rule and operate on the resulting abstract data model. JSON-LD is the reference encoding; an evaluator MAY additionally support CBOR-LD or another conformant encoding. See spec text Section 1.7 and Section 4.5.
3. Verify the signature over the canonical signing bytes defined by the production rule, and honour the v0.2/v0.3 baseline behaviour: required envelope fields, TTL rejection, Signature Profile A verification including the `keyRef` ↔ `publicKeySpkiB64` consistency check.
4. Pin the content-hashed v0.4 context document and verify its hash before trusting term definitions; an evaluator MUST NOT dereference an arbitrary remote context at evaluation time. See spec text Section 6.10.
5. Produce a structured receipt for every processed manifest. The receipt MUST include `@type` (with `um:Receipt`), `manifestId`, `outcome`, `signatureCheck`, `freshnessCheck`, and `facetStatuses` (empty array when the manifest contains zero facets). See spec text Section 3.3.
6. Record each per-facet status using the v0.4 status set: `processed`, `opaque`, `consent-denied`, `consent-missing`, `trustTierUnsupported`, or `not-projected`. See spec text Section 3.3.1.
7. Treat encrypted facets as sealed entries when the evaluator lacks a decryption key, and MUST NOT reject a manifest solely because it contains undecryptable encrypted facets. See spec text Section 2.3 and Section 3.1.4.
8. Match `consents[].facetRef` against each projected facet's `@id`. When no matching consent entry exists, record `consent-missing` and MUST NOT process the facet's data. Treat expired or withdrawn consents as absent. See spec text Section 1.4.4 and Section 3.1.4.
9. For any claim relied upon at Tier 1 or above, require a verified holder binding; a claim lacking a verifiable holder binding MUST be capped at Tier 0 (`holderBindingStatus: "failed"` or `"missing-required"`). See spec text Section 6.6 and EXT-T1.
10. When an interactive presentation is required, require a `presentationProof` whose `challenge` and `audience` match the verifier-issued challenge; reject or cap claims that fail this proof-of-possession. See EXT-T1 Section T1.2.
11. MUST NOT treat a stale liveness attestation as equivalent to current human presence; an attestation past its `validUntil` is `unknown` regardless of `attestedAt`. See EXT-T1 Section T1.3.
12. Respect `requiredTrustTier` declarations at the manifest, claim, and facet levels. Tier floors raise only - claim and facet floors MUST NOT lower the manifest-level floor. See spec text Section 6.4.5.
13. Record `trustTierUnsupported` in the receipt when the required tier has no implemented verification profile (e.g., a Tier-2 or Tier-3 requirement on a Tier-1 evaluator), and MUST NOT downgrade to a lower tier.
14. Apply a clock-skew tolerance of ≤60 seconds for `issuedAt`/`expiresAt` comparisons. Manifests with `issuedAt` more than 60 seconds in the future SHOULD be rejected with `freshnessCheck: "stale"`. Wider tolerances MUST be documented in the conformance claim. See spec text Section 3.1.2.
15. Preserve unknown members for processing purposes (so the signature still verifies) and act only on recognized members. Unknown members MUST NOT be stripped before signature verification and MUST NOT change a decision.
16. When `signature.statusRef` is present and the evaluator claims revocation-aware verification, resolve revocation status per the statusRef resolution schema (Section 3.4) and record `revocationStatus`. Evaluators not implementing revocation-aware verification MUST report `revocationStatus: "unchecked"` and MUST NOT claim revocation-aware conformance.

## 3) Required behaviour (holder)

A holder claiming v0.4 conformance MUST:

1. Set `manifestVersion: "0.4"` and include the v0.4 versioned context `https://universalmanifest.net/ns/v0.4` in `@context`.
2. Generate an opaque `@id` (e.g., `urn:uuid:<uuidv4>`) per Section 1.2.2, and produce the manifest through a conformant production rule.
3. Bind `subject` to a stable identifier URI (typically a DID), and bound `expiresAt` to a sensible interaction lifetime relative to `issuedAt`.
4. Sign the manifest using Signature Profile A (`signature.algorithm: "Ed25519"`, `signature.canonicalization: "JCS-RFC8785"`, `signature.keyRef` present, `signature.value` populated over the canonical signing bytes).
5. Where consents are used, include them as full v0.4 consent entries with `@id`, `@type: "um:Consent"`, `facetRef` matching a facet's `@id`, `scope`, `purpose`, `grantedAt`, and `expiresAt`.
6. Where encrypted facets are used, set `encryptionProfile: "jwe-inline-v1"` on the facet and supply a conformant JWE JSON Serialization object as the `entity` value, using an algorithm pair consistent with the JWE algorithm constraints. See spec text Section 2.3.2 and Section 2.4.
7. For any claim intended to be relied upon at Tier 1 or above, include a `holderBinding` with a valid `mode` (`sd-jwt-kb`, `bbs-holder-commitment`, or `reciprocal-control`) and the fields that mode requires (e.g., `cnfThumbprint` for `sd-jwt-kb`; `boundDid`, `subjectProof`, and `boundDidProof` for `reciprocal-control`). See EXT-T1 Section T1.1.
8. When presenting interactively, include a `presentationProof` containing `proofType`, `challenge`, `audience`, `created`, and `proofValue`. See EXT-T1 Section T1.2.
9. Where Tier-2 binding is asserted, include a `bindingProof` of a defined `type` (`ZkLinkedSecretProof` or `ZkHdDerivationProof`) with the fields that type requires. See EXT-T2 and spec text Section 6.4.7.
10. Where Tier-3 ceremony is asserted, include a `ceremonyProof` (`type: "ThresholdAttestationProof"`) with `threshold`, `attesters`, `ceremonyId`, and `aggregateProof`. See EXT-T3 and spec text Section 6.4.8.
11. Where `identity.crossDidBinding` claims are issued, populate all required fields (`@type`, `issuer`, `boundDids` containing at least 2 DIDs, `attester`, `attestationMethod`, `attestedAt`).
12. Where `um:agentDelegation` pointers are issued, populate all required fields (`@type: "um:agentDelegation"`, `delegateType`, `delegatedBy` matching the manifest `subject`, `delegatedAt`, `expiresAt`), using registered scope values where the scope registry applies. See spec text Section 6.5 and EXT-OPT.

## 4) Required behaviour (bilateral participant)

A Conformant Bilateral Participant MUST implement both Evaluator Behaviour (Section 2) and Holder Behaviour (Section 3). In a bilateral exchange:

- Both parties present manifests.
- Both parties independently evaluate the other's manifest through the six-stage sequence.
- The effective trust tier for the interaction is the maximum of either party's `requiredTrustTier`.
- For Sybil-critical or high-risk actions, parties MUST fail closed when required tier checks are not satisfied.
- For lower-risk actions, parties MAY degrade to a restricted mode that excludes trust-transitive or high-impact operations.
- Receipts produced within a bilateral session MUST carry `exchangeId` and `evaluatorId`. The full session object, paired-receipt correlation, and receipt hash-chaining are specified in EXT-OPT Section O4.

See spec text Section 4.3 and Section 6.4.6; EXT-OPT Section O4.

## 5) Conformance fixtures

To claim v0.4 conformance, an implementation MUST:

1. Accept all valid fixtures listed below.
2. Reject all invalid fixtures listed below for the stated reason.
3. For each valid fixture, the evaluator MUST emit a structured receipt whose outcome matches the fixture's expected outcome.

### 5.1 Valid fixtures

Located under `conformance/v0.4/valid/`:

- `minimal-signed-manifest.jsonld` - baseline v0.4 signed envelope (no facets, no claims) verifying under Signature Profile A.
- `manifest-with-holder-binding.jsonld` - claim carrying a `holderBinding` in `sd-jwt-kb` mode per Section 6.6.1.
- `manifest-with-bilateral-session-receipt.jsonld` - manifest with facets and consents suitable for bilateral session evaluation.
- `manifest-with-zkp-binding-proof.jsonld` - claim carrying a `ZkLinkedSecretProof` `bindingProof` per Section 6.4.7.
- `manifest-with-ceremony-proof.jsonld` - claim carrying a `ThresholdAttestationProof` `ceremonyProof` per Section 6.4.8.
- `manifest-with-agent-delegation-scopes.jsonld` - `um:agentDelegation` pointer with core scope values per Section 6.5.
- `manifest-with-encrypted-facet.jsonld` - facet using the JWE inline profile (carried forward from v0.3).

### 5.2 Invalid fixtures

Located under `conformance/v0.4/invalid/`:

- `holder-binding-invalid-mode.jsonld` - `holderBinding.mode` outside the enum (`sd-jwt-kb` | `bbs-holder-commitment` | `reciprocal-control`).
- `holder-binding-missing-cnf.jsonld` - `sd-jwt-kb` mode without the required `cnfThumbprint`.
- `ceremony-proof-insufficient-attesters.jsonld` - `ceremonyProof.attesters` smaller than the M required by `threshold`.
- `binding-proof-invalid-type.jsonld` - `bindingProof.type` not `ZkLinkedSecretProof` or `ZkHdDerivationProof`.
- `missing-signature.jsonld` - no `signature` member.
- `claim-tier-below-manifest-floor.jsonld` - `claim.requiredTrustTier` lower than `manifest.requiredTrustTier` (Section 6.4.5; the floor raises only).

The reference implementation exercises every fixture in this list, and the expected outcomes are recorded in `conformance/v0.4/expected.json`.

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

Several v0.4 capabilities are built into the draft on the editors' recommended defaults and are marked **PREVIEW** - under active working-group review and revisable before the schema locks. The Base (Tier-0 / Tier-1 core) is the production-candidate surface that a developer can ship and interoperate on, the same test v0.3 passed. PREVIEW surfaces include:

- **Tier-2 ZKP binding profiles** (EXT-T2) and **Tier-3 ceremony** (EXT-T3) - the proof objects are structurally defined; the verification profiles are PREVIEW.
- **Receipt as a first-class manifest class** with hash-chaining, the **bilateral session model**, **federation** and manifest forwarding, **profile registration**, the **agent-delegation scope registry**, **category trust / trustWeight**, and the **extended structural schemas** (EXT-OPT) - claimed as optional features, PREVIEW per part.
- **Post-quantum signatures** (Base Section 6.7) - named as a migration path; PREVIEW.

A conformance claim SHOULD state which PREVIEW features, if any, it implements, since their wire shape may still change.

## 10) Implementation onboarding package (non-normative)

- Repo guide: `../../docs/guides/IMPLEMENTATION-GUIDE.md`
- Quick card: `../../docs/guides/QUICK-REFERENCE.md`
- Agent handoff: `../../docs/guides/AGENT-HANDOFF.md`
