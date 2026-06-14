# Universal Manifest v0.3 — Conformance

v0.3 extends v0.2 with a normative evaluation contract (the six-stage evaluation sequence), encrypted facets via JWE inline profile, structured receipts, and normative promotions of cross-DID binding, `requiredTrustTier`, and agent delegation.

Primary references:

- Spec text: `/docs/W3C-STYLE-SPEC-v03.html` (the normative source of truth)
- `spec/v0.3/README.md`
- Signature profile (unchanged from v0.2): `spec/v0.2/SIGNATURE-PROFILE.md`

## 1) Conformance targets

v0.3 defines conformance for:

- **Evaluator (Consumer).** Receives a v0.3 manifest and processes it through the six-stage evaluation sequence, producing a structured receipt.
- **Issuer.** Produces a v0.3 manifest with a Signature Profile A signature, valid envelope, and (where applicable) normative claim/consent/pointer entries.
- **Bilateral Participant.** Implements both Evaluator and Issuer behaviour. In a bilateral exchange (Section 6.4.6), both parties independently evaluate the other's manifest; the effective trust tier is the maximum of both parties' `requiredTrustTier`.

## 2) Required behaviour (evaluator)

An evaluator claiming v0.3 conformance MUST:

1. Execute all six stages of the evaluation sequence in order (Arrive, Verify, Project, Consent, Compose, Receipt). See spec text Section 3.1.
2. Produce a structured receipt for every processed manifest. The receipt MUST include `@type` (with `um:Receipt`), `manifestId`, `outcome`, `signatureCheck`, `freshnessCheck`, and `facetStatuses` (empty array when the manifest contains zero facets). See spec text Section 3.3.
3. Honour the v0.2 baseline behaviour: required envelope fields, TTL rejection, Signature Profile A signature verification including the `keyRef` ↔ `publicKeySpkiB64` consistency check (Section 1.6.4).
4. Treat encrypted facets as sealed entries when the evaluator lacks a decryption key. MUST NOT reject a manifest solely because it contains undecryptable encrypted facets. See spec text Section 2.3 and Section 3.1.4.
5. Match `consents[].facetRef` against each projected facet's `@id`. When no matching consent entry exists, record the facet status as `"consent-missing"` and MUST NOT process the facet's data. See spec text Section 1.4.4 and Section 3.1.4.
6. Treat expired or withdrawn consents as absent (records `consent-missing` or `consent-denied`).
7. Respect `requiredTrustTier` declarations at the manifest, claim, and facet levels. Tier floors raise only — claim/facet-level floors MUST NOT lower the manifest-level floor. See spec text Section 6.4.5.
8. Record `trustTierUnsupported` in the receipt when the required tier has no implemented verification profile (e.g., Tier 3 in v0.3). MUST NOT downgrade to a lower tier.
9. Apply a clock-skew tolerance of ≤60 seconds for `issuedAt`/`expiresAt` comparisons. Manifests with `issuedAt` more than 60 seconds in the future SHOULD be rejected with `freshnessCheck: "stale"`. Wider tolerances MUST be documented in the conformance claim. See spec text Section 3.1.2.
10. Ignore unknown fields for processing purposes but MUST NOT strip them before signature verification.
11. When `signature.statusRef` is present and the evaluator claims revocation-aware verification, resolve revocation status. Evaluators not implementing revocation-aware verification MUST report `revocationStatus: "unchecked"` and MUST NOT claim revocation-aware conformance.

## 3) Required behaviour (issuer)

An issuer claiming v0.3 conformance MUST:

1. Set `manifestVersion: "0.3"` and include `https://universalmanifest.net/ns/v0.3` in `@context`.
2. Generate an opaque `@id` (e.g., `urn:uuid:<uuidv4>`) per Section 1.2.2.
3. Bind `subject` to a stable identifier URI (typically a DID).
4. Bound `expiresAt` to a sensible interaction lifetime relative to `issuedAt`.
5. Sign the manifest using Signature Profile A (`signature.algorithm: "Ed25519"`, `signature.canonicalization: "JCS-RFC8785"`, `signature.keyRef` present, `signature.value` populated per the signing-input procedure).
6. Where consents are used, include them as full v0.3 consent entries with `@id`, `@type: "um:Consent"`, `facetRef` matching a facet's `@id`, `scope`, `purpose`, `grantedAt`, and `expiresAt`. Issuers using deployment contexts with external consent (e.g., pre-negotiated bilateral agreements) MAY emit an empty `consents` array per Section 1.4.4, but evaluators will then treat all facets as `consent-missing` unless they apply an external consent model out of scope of this specification.
7. Where encrypted facets are used, set `encryptionProfile: "jwe-inline-v1"` on the facet and supply a conformant JWE JSON Serialization object as the `entity` value per Section 2.3.2.
8. Where `requiredTrustTier` declarations are used, declare floors at manifest, claim, or facet level. Claim/facet floors MUST NOT lower the manifest floor.
9. Where `identity.crossDidBinding` claims are issued, populate all required fields (`@type`, `issuer`, `boundDids` containing at least 2 DIDs, `attester`, `attestationMethod`, `attestedAt`).
10. Where `um:agentDelegation` pointers are issued, populate all required fields (`@type: "um:agentDelegation"`, `delegateType`, `delegatedBy` matching the manifest `subject`, `delegatedAt`, `expiresAt`).

## 4) Required behaviour (bilateral participant)

A Conformant Bilateral Participant MUST implement both Evaluator Behaviour (Section 2) and Issuer Behaviour (Section 3). In a bilateral exchange:

- Both parties present manifests.
- Both parties independently evaluate the other's manifest through the six-stage sequence.
- The effective trust tier for the interaction is the maximum of either party's `requiredTrustTier`.
- For Sybil-critical or high-risk actions, parties MUST fail closed when required tier checks are not satisfied.
- For lower-risk actions, parties MAY degrade to a restricted mode that excludes trust-transitive or high-impact operations.

See spec text Section 4.3 and Section 6.4.6.

## 5) Conformance fixtures

To claim v0.3 conformance, an implementation MUST:

1. Accept all valid fixtures listed below.
2. Reject all invalid fixtures listed below for the stated reason.
3. For each valid fixture, the evaluator MUST emit a structured receipt whose outcome matches the fixture's expected outcome.

### 5.1 Valid fixtures

Located under `conformance/v0.3/valid/`:

- `minimal-signed-manifest.jsonld` — minimum v0.3 signed manifest (envelope + signature only).
- `manifest-with-facets.jsonld` — manifest with two plaintext facets.
- `manifest-with-facets-and-consents.jsonld` — manifest demonstrating the `consents[].facetRef → facets[].@id` linkage.
- `manifest-with-encrypted-facet.jsonld` — manifest containing a JWE inline encrypted facet (recipients-only structural shape; the cryptographic material is illustrative).
- `manifest-with-cross-did-binding.jsonld` — manifest containing an `identity.crossDidBinding` claim with all required fields.
- `manifest-with-agent-delegation.jsonld` — manifest containing a `um:agentDelegation` pointer.
- `manifest-with-required-trust-tier.jsonld` — manifest with manifest-level, claim-level, and facet-level `requiredTrustTier` declarations.
- `manifest-with-revocation-metadata.jsonld` — manifest with `signature.statusRef` and `signature.revocationCursor`.
- `manifest-with-devices-array.jsonld` — manifest exercising the reserved `devices` array (carried through unchanged per Section 1.4.6).

### 5.2 Invalid fixtures

Located under `conformance/v0.3/invalid/`:

- `wrong-manifest-version.jsonld` — declares `manifestVersion: "0.2"` (v0.3 requires `"0.3"`).
- `missing-signature.jsonld` — no `signature` member.
- `invalid-signature-algorithm.jsonld` — `signature.algorithm` is not `"Ed25519"`.
- `invalid-signature-canonicalization.jsonld` — `signature.canonicalization` is not `"JCS-RFC8785"`.
- `expired-manifest.jsonld` — `expiresAt` in the past.
- `issued-after-expires.jsonld` — `issuedAt` greater than `expiresAt`.
- `cross-did-binding-missing-attester.jsonld` — `identity.crossDidBinding` claim missing required `attester` field.
- `cross-did-binding-single-did.jsonld` — `identity.crossDidBinding` with only one DID in `boundDids` (Section 6.4.4 requires ≥ 2).
- `agent-delegation-missing-delegate-type.jsonld` — `um:agentDelegation` pointer missing required `delegateType`.
- `agent-delegation-invalid-delegate-type.jsonld` — `um:agentDelegation` with `delegateType` value outside the enum.
- `consent-missing-facet-ref.jsonld` — consent entry without `facetRef`.
- `invalid-trust-tier.jsonld` — `requiredTrustTier` value outside the 0..3 integer range.
- `encrypted-facet-malformed-jwe.jsonld` — `encryptionProfile: "jwe-inline-v1"` but missing required JWE fields (e.g., `iv`, `tag`).

The reference implementation's tests at `packages/universal-manifest/scripts/test-v03-conformance.mjs` exercise every fixture in this list.

## 6) Adversarial and misuse expectations

v0.3 conformance verification MUST include rejection tests for the v0.2 baseline cases (signature spoofing, signature misuse, temporal misuse — see `spec/v0.2/CONFORMANCE.md` Section 5) plus v0.3-specific cases:

1. **Manifest version mismatch** — manifests declaring `"0.2"` or other values when v0.3 verification is requested.
2. **Trust-tier downgrade attempts** — claims that attempt to specify a lower `requiredTrustTier` than the manifest-level floor (MUST be rejected; the floor raises only per Section 6.4.5).
3. **Cross-DID binding without attester** — binding claims missing required attestation fields.
4. **Malformed JWE encrypted facets** — incomplete JWE structures that an evaluator would otherwise sealed-entry through. Structural conformance MUST require all five JWE fields (`protected`, `recipients`, `iv`, `ciphertext`, `tag`) per Section 2.3.2.
5. **Agent delegation with delegator/subject mismatch** — `um:agentDelegation` with `delegatedBy` not matching the manifest `subject` (Section 6.5.1).
6. **Expired delegation** — `um:agentDelegation` pointers with `expiresAt` already in the past (Section 6.5.1: platforms MUST reject expired delegations).

## 7) Standalone conformance suite (external adopter path)

For implementation-neutral, external conformance execution, use the standalone suite documentation:

- Site guide: Standalone Conformance Suite
- Suite package root (repo path): `conformance/README.md`
- v0.3 fixture root: `conformance/v0.3/`

The standalone suite is intended to be language-neutral. It packages fixtures plus expected outcomes (`conformance/v0.3/expected.json`) so implementations can prove equivalent v0.3 verification behaviour across runtimes.

## 8) Reference harness (repo-local)

This repo includes a TypeScript reference harness (one of many possible implementations):

- `packages/universal-manifest/` — `npm test` runs structural validation across all example sets, including v0.3 fixtures.

Third-party adopters do not need Node/TypeScript; the fixtures are designed to be portable. You can build a conformant harness in any language.

## 9) Notes on partially-implemented v0.3 features

Two trust-tier features are normatively named in v0.3 but their concrete implementation profile is deferred:

- **Tier 2 (ZKP cryptographic binding)** — marked **"at risk"** in Section 6.4.2. The proof object schema, candidate proof systems, and verification procedure live in v0.4-preview Section 6.4.7. v0.3 evaluators encountering a Tier 2 requirement and lacking a proof profile MUST record `trustTierUnsupported` in the receipt.
- **Tier 3 (multi-party ceremony)** — Section 6.4.2 ends with "(Future: v0.4+.)". v0.3 evaluators encountering a Tier 3 requirement MUST record `trustTierUnsupported`.

Full receipt behavioural tests (verifying that receipts honestly reflect pipeline execution) require a test oracle and are planned for v0.3.1 per spec text Section 4.4.

## 10) Implementation onboarding package (non-normative)

- Repo guide: `../../docs/guides/IMPLEMENTATION-GUIDE.md`
- Quick card: `../../docs/guides/QUICK-REFERENCE.md`
- Agent handoff: `../../docs/guides/AGENT-HANDOFF.md`
- Site guide: Implementation Guide (see repo: `../../docs/guides/IMPLEMENTATION-GUIDE.md`)
- Site quick card: Quick Reference (see repo: `../../docs/guides/QUICK-REFERENCE.md`)
