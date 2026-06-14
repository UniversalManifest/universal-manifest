# Universal Manifest Spec (v0.3)

> Universal Manifest is an open specification for portable state capsules. It is not tied to any particular programming language, framework, or runtime. The TypeScript helper in this repository is one reference implementation; you can build a conformant implementation in any language using the published spec artifacts and conformance fixtures.

v0.3 is the **current published** version of the Universal Manifest specification. The normative source of truth is the full HTML specification at `/docs/W3C-STYLE-SPEC-v03.html` (rendered at `https://universalmanifest.net/spec/v0.3/`). This directory holds the structured artifacts implementers consume directly: the JSON Schema, the JSON-LD context, the conformance summary, and the signature-profile pointer.

## What v0.3 adds over v0.2

- **Six-stage evaluation sequence** (Arrive → Verify → Project → Consent → Compose → Receipt) — every conformant evaluator MUST execute all six stages in order. See `CONFORMANCE.md` and the spec text Section 3.1.
- **Structured receipts** — normative receipt schema with four outcome categories (`accepted`, `accepted-with-warnings`, `accepted-partial`, `rejected`) and five facet status values (`processed`, `opaque`, `consent-denied`, `consent-missing`, `not-projected`). Spec text Section 3.3.
- **Encrypted facets (JWE inline profile)** — facets MAY carry encrypted payloads using a JWE JSON Serialization object as `entity` when `encryptionProfile: "jwe-inline-v1"` is declared. Sealed-entry handling for evaluators without decryption keys. Spec text Section 2.3.
- **Normative schemas for the structural arrays** — v0.3 promotes `claims`, `consents`, `pointers`, and `devices` from "convention" to normative schemas. The four arrays have defined required/optional fields. Spec text Section 1.4.
- **`requiredTrustTier` declaration** — manifest-level, claim-level, and facet-level minimum trust tier (raise-only floor). Unsupported tiers yield `trustTierUnsupported` status without downgrading. Spec text Section 6.4.5.
- **`identity.crossDidBinding` claim** — normatively defined cross-DID binding primitive with required attester fields. Spec text Section 6.4.4.
- **`um:agentDelegation` pointer** — normatively defined agent delegation pointer with `delegateType`, `delegatedBy`, `delegatedAt`, `expiresAt`, optional `scope` and `livenessEndpoint`. Spec text Section 6.5.
- **Tier 2 cryptographic binding** — normatively defined as ZKP-backed cross-DID control, marked "at risk" pending v0.4 proof-profile work. Spec text Section 6.4.2.
- **60-second clock-skew tolerance** — evaluators SHOULD allow ≤60s tolerance for `issuedAt`/`expiresAt` comparisons. Spec text Section 3.1.2.
- **Key-substitution attack mitigation** — `keyRef` vs `publicKeySpkiB64` consistency check is now normatively required. Spec text Section 1.6.4.

Signature Profile A (JCS + Ed25519) carries forward from v0.2 unchanged. The signing input procedure, verifier checklist, and revocation-aware extension are identical to v0.2.

## Build your own implementation (any language)

Use the specification and fixtures as your source of truth, regardless of language or runtime:

- Read the normative spec text: `/docs/W3C-STYLE-SPEC-v03.html` (rendered at `/spec/v0.3/`)
- Read conformance requirements: `spec/v0.3/CONFORMANCE.md`
- Validate against structural schema: `spec/v0.3/schema.json`
- Use the JSON-LD context: `spec/v0.3/schema.jsonld`
- Run the implementation-neutral suite flow: `conformance/README.md` with v0.3 fixtures at `conformance/v0.3/`
- Optional reference: `packages/universal-manifest/` (TypeScript reference implementation)

## v0.3 artifacts (this directory)

- `README.md` — this file
- `CONFORMANCE.md` — conformance requirements (evaluator, issuer, bilateral participant) + fixture index
- `schema.json` — JSON Schema for structural validation of v0.3 manifests
- `schema.jsonld` — JSON-LD context defining v0.3 terms
- (Signature Profile A is unchanged from v0.2; see `/spec/v0.2/SIGNATURE-PROFILE.md` for the profile text.)

## Namespace URIs

- Manifests MUST use `@context` value `https://universalmanifest.net/ns/v0.3` (or include this URI when an array form is used).
- Hosted artifacts:
  - `https://universalmanifest.net/ns/universal-manifest/v0.3/schema.jsonld`
  - `https://universalmanifest.net/ns/universal-manifest/v0.3/schema.json`
  - `https://universalmanifest.net/spec/v0.3/`

## Six-stage evaluation sequence (summary)

Every conformant evaluator MUST execute these stages in order for every v0.3 manifest it processes. Each stage produces a defined output that feeds the next.

1. **Arrive** — parse JSON; confirm required envelope members; ignore (but preserve) unknown fields.
2. **Verify** — signature verification against JCS-canonicalized payload; freshness enforcement (TTL and 60s clock-skew); optional revocation status resolution.
3. **Project** — extract only facets, claims, and pointers relevant to the evaluator's processing context. Facets not included are *not projected*, not *absent*.
4. **Consent** — match `consents[].facetRef` against each projected `facets[].@id`; check scope, purpose, expiry, and `withdrawnAt`. Sealed entries acknowledged but not processed.
5. **Compose** — produce one of four outcomes: `accepted`, `accepted-with-warnings`, `accepted-partial`, or `rejected`. Include per-facet status.
6. **Receipt** — emit a structured receipt that honestly records what the evaluator did. Receipts MAY be signed (Signature Profile A); receipt signing is RECOMMENDED for accountability but not required for v0.3 conformance.

See spec text Section 3.1 for normative details and `packages/universal-manifest/` for the reference six-stage evaluator implementation.

## Tiered trust model (summary)

Four tiers, strictly additive. Relying parties choose based on their threat model.

- **Tier 0 — Signature-only.** Zero friction. Claims are self-asserted; signature verified per the declared profile. MUST NOT be used as sufficient assurance for Sybil-critical decisions.
- **Tier 1 — Attested / claimProof-backed.** Low friction. VP/attestation proof material on claims, or cross-DID binding attestation. Evaluators MUST enforce attester trust policy and freshness on proof material.
- **Tier 2 — Cryptographic binding (ZKP).** Medium friction. ZK proof of cross-DID control. *At risk: implementation profile lives in v0.4-preview; the tier itself is normatively named in v0.3 but the proof-system profile is v0.4 work.*
- **Tier 3 — Multi-party ceremony.** Out of scope for v0.3 (Future: v0.4+). Evaluators encountering Tier 3 requirements MUST record `trustTierUnsupported` in the receipt and MUST NOT downgrade.

See spec text Section 6.4.2 for normative tier definitions, Section 6.4.5 for `requiredTrustTier` enforcement, and Section 6.4.6 for bilateral exchange semantics.

## Security considerations (selected)

v0.3 carries forward all v0.2 security guidance and adds:

- **Key-substitution attack mitigation** is now MUST (Section 1.6.4): the consistency check between `keyRef` and inline `publicKeySpkiB64` is normative; evaluators that skip resolution are non-conformant.
- **Sealed entries and selective disclosure** form a two-layer privacy model: issuer-controlled selective disclosure (which facets are included) plus encryption-controlled readability (which parties can decrypt). Encrypted facets MUST NOT be rejected solely because the evaluator cannot decrypt them. See spec text Section 7.
- **GDPR DPIA obligation** for cross-DID binding operations is now explicit (Section 7, Data Protection paragraph).
- **`requiredTrustTier` enforcement** is normative and raise-only — claim/facet floors cannot lower the manifest-level floor.

## Status

v0.3 was published on 2026-05-19. It is the current published version of the Universal Manifest specification. The next iteration (v0.4) is in preview at `/docs/W3C-STYLE-SPEC-v04-preview.html`; v0.4 adds the Tier 2 ZKP proof profile, Tier 3 ceremony, JWE algorithm constraints, statusRef resolution schema, bilateral session model, profile registration, post-quantum signatures, and federation — all marked [PREVIEW — Working Group Input Requested].

Future changes are managed through the RFC mechanism and breaking-change policy in the project governance docs.
