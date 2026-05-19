# Universal Manifest v0.2 — Conformance (Draft)

v0.2 exists to define an interoperable integrity profile (signature + canonicalization) while preserving v0.1’s adoption-friendly shape.

Primary references:

- `spec/v0.2/README.md`
- `spec/v0.2/SIGNATURE-PROFILE.md`

## 1) Conformance targets

v0.2 defines conformance for:

- **Consumer (Verifier)** — receives a v0.2 manifest and verifies it for use.
- **Issuer (Signer)** — produces a v0.2 manifest and signs it deterministically.

## 2) Required behavior (consumer)

A consumer claiming v0.2 support MUST:

1. Validate required fields and `@type` includes `um:Manifest`.
2. Enforce TTL (must not use if `now > expiresAt`).
3. Verify signature using the v0.2 profile:
   - `signature.algorithm === "Ed25519"`
   - `signature.canonicalization === "JCS-RFC8785"`
   - compute signing input (remove `signature`, canonicalize using JCS)
   - verify Ed25519 signature
4. Ignore unknown fields safely (same forward-compat rule as v0.1).

If verification fails, the manifest MUST be rejected for use (may be retained for debugging).

### 2.4 Private data path handling (implementation guidance)

To preserve interoperability, consumers SHOULD support both privacy operating models:

- projection-derived manifests (subset views signed as independent manifests),
- manifests containing encrypted inline facet payloads (opaque facet content with intact envelope/signature verification).

Consumers that cannot decrypt an encrypted facet payload SHOULD continue processing the rest of the manifest after successful signature and TTL validation, while reporting that facet as unreadable/opaque.

### 2.3 Tier 1 assurance obligations (when claimed)

If a consumer claims Tier 1 assurance for any claim, subject binding, or bilateral interaction outcome, it MUST:

1. Enforce an explicit attester trust policy (for example, allowlist/denylist or equivalent policy controls) for every attester or issuer used to justify Tier 1 acceptance.
2. Enforce freshness/expiry checks on Tier 1 proof material:
   - reject expired proof/attestation material (including explicit expiry fields when present);
   - reject stale attestations/presentations that exceed locally configured freshness bounds.
3. Treat Tier 1 as not satisfied (unverified or downgraded) when required trust-policy or freshness checks cannot be completed.

### 2.1 Profile identification and extension behavior

- Consumers MUST treat `signature.algorithm` + `signature.canonicalization` as the profile identifier.
- Consumers MUST reject unsupported profile pairs when strict v0.2 verification is required by policy.
- Consumers MAY support additional profile pairs in future versions, but MUST NOT silently reinterpret unsupported pairs as if they were the baseline profile.

### 2.2 Revocation extension lane

If a manifest includes revocation metadata (for example, `signature.statusRef` and/or `signature.revocationCursor`), then:

- Consumers claiming revocation-aware conformance MUST evaluate revocation status using those fields before acceptance.
- Consumers that do not implement revocation-aware conformance MUST report revocation status as `unchecked` and MUST NOT claim revocation-aware verification.

## 3) Required behavior (issuer)

An issuer claiming v0.2 support MUST:

1. Produce a v0.2 manifest (`manifestVersion: "0.2"`) with required fields.
2. Remove `signature` from signing input.
3. Canonicalize using JCS (RFC 8785) and sign with Ed25519.
4. Embed the signature as defined in `spec/v0.2/schema.json`.

If issuer policy requires revocation-aware verification by consumers, issuers SHOULD provide stable, dereferenceable revocation status metadata (for example via `signature.statusRef`) and SHOULD rotate revocation cursor/event information as state changes.

## 4) Conformance fixtures

To claim v0.2 conformance, an implementation MUST:

1. Accept all “valid fixtures”
2. Reject all “invalid fixtures”

### 4.1 Valid fixtures

- `examples/v0.2/minimal-signed-manifest.jsonld`
- `examples/v0.2/manifest-with-pointers-signed.jsonld`
- `examples/v0.2/manifest-with-facets-signed.jsonld`
- `examples/v0.2/manifest-with-revocation-metadata.jsonld`
- `examples/v0.2/metaverse-mum-cache-freshness-and-change-log-v02.jsonld`
- `examples/v0.2/portable-identity-profile-xr-revocation-metadata-v02.jsonld`

### 4.2 Invalid fixtures

- `examples/v0.2/invalid/expired-for-use.jsonld`
- `examples/v0.2/invalid/invalid-expiresAt-format.jsonld`
- `examples/v0.2/invalid/invalid-issuedAt-format.jsonld`
- `examples/v0.2/invalid/missing-signature.jsonld`
- `examples/v0.2/invalid/invalid-signature.jsonld`
- `examples/v0.2/invalid/invalid-signature-algorithm.jsonld`
- `examples/v0.2/invalid/invalid-signature-canonicalization.jsonld`
- `examples/v0.2/invalid/invalid-signature-created-format.jsonld`
- `examples/v0.2/invalid/missing-signature-key-material.jsonld`
- `examples/v0.2/invalid/invalid-signature-public-key.jsonld`
- `examples/v0.2/invalid/issued-after-expires-signed.jsonld`

## 5) Adversarial and misuse expectations

v0.2 conformance verification MUST include rejection tests for:

1. profile spoofing:
   - invalid `signature.algorithm`
   - invalid `signature.canonicalization`
2. signature misuse:
   - missing key material
   - malformed embedded public key
   - invalid `signature.created` timestamp format
3. temporal misuse:
   - invalid `issuedAt` or `expiresAt` timestamp format
   - `issuedAt > expiresAt`
   - expired manifests presented for use after TTL has elapsed

These cases are represented by the invalid fixture set in section 4.2.

## 6) Standalone conformance suite (external adopter path)

For implementation-neutral, external conformance execution, use the standalone suite documentation:

- Site guide: Standalone Conformance Suite
- Suite package root (repo path): `conformance/README.md`

The standalone suite is intended to be language-neutral. It packages fixtures plus expected outcomes so implementations can prove equivalent v0.2 verification behavior across runtimes.

## 7) Reference harness (repo-local)

This repo includes a TypeScript reference harness (one of many possible implementations):

- `packages/universal-manifest/` → `npm test`

Third-party adopters do not need Node/TypeScript; the fixtures are designed to be portable. You can build a conformant harness in any language.

## 8) Implementation onboarding package (non-normative)

For a complete implementation walk-through and handoff package:

- Repo guide: `../../docs/guides/IMPLEMENTATION-GUIDE.md`
- Quick card: `../../docs/guides/QUICK-REFERENCE.md`
- Agent handoff: `../../docs/guides/AGENT-HANDOFF.md`
- Site guide: Implementation Guide (see repo: `../../docs/guides/IMPLEMENTATION-GUIDE.md`)
- Site quick card: Quick Reference (see repo: `../../docs/guides/QUICK-REFERENCE.md`)
