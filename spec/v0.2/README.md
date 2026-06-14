# Universal Manifest Spec (v0.2 draft)

> Universal Manifest is an open specification for portable state capsules. It is not tied to any particular programming language, framework, or runtime. The TypeScript helper in this repository is one reference implementation; you can build a conformant implementation in any language using the published spec artifacts and conformance fixtures.

v0.2 is a **draft direction** for the next iteration of the Universal Manifest spec. It is not finalized, but this repo includes draft artifacts (schema/context/conformance) so implementers can begin validating the profile.

Primary goal of v0.2:

- define an interoperable **signature profile** (canonicalization + signing + verification checklist)
- define profile-extension direction for revocation-aware verification posture

## Build your own implementation (any language)

Use the specification and fixtures as your source of truth, regardless of language or runtime:

- Read conformance requirements: `spec/v0.2/CONFORMANCE.md`
- Run the implementation-neutral suite flow: `conformance/README.md`
- Optional reference: `packages/universal-manifest/` (TypeScript reference implementation)

Start here:

- `spec/v0.2/SIGNATURE-PROFILE.md`
- Migration from v0.1: `/docs/guides/MIGRATION-V01-V02.md`

## v0.2 draft artifacts (in this repo)

- JSON-LD context: `spec/v0.2/schema.jsonld`
- Structural schema: `spec/v0.2/schema.json`
- Conformance draft: `spec/v0.2/CONFORMANCE.md`

Note: v0.2 remains a draft until the signature profile decision is treated as locked and fixtures are considered stable.

Current publication targets:

- `https://universalmanifest.net/ns/universal-manifest/v0.2/schema.jsonld`
- `https://universalmanifest.net/ns/universal-manifest/v0.2/schema.json`
- `https://universalmanifest.net/spec/v02/`

## Security Considerations

v0.2 introduces a **production-grade signature profile** for cryptographic integrity and authenticity verification. All v0.2 manifests MUST include a valid signature.

### Signature Profile (Required)

The v0.2 signature profile uses:

- **Algorithm**: Ed25519 (public-key signature)
- **Canonicalization**: JCS (RFC 8785) — deterministic JSON representation
- **Encoding**: base64url for signature values

**Verification requirements:**

1. Validate `signature.algorithm === "Ed25519"` and `signature.canonicalization === "JCS-RFC8785"`
2. Remove `signature` field from manifest
3. Canonicalize remaining JSON using JCS (RFC 8785)
4. Verify Ed25519 signature over canonical bytes using public key from `signature.keyRef` or `signature.publicKeySpkiB64`

Full specification: `spec/v0.2/SIGNATURE-PROFILE.md`

> *Non-normative note:* See the conformance fixtures for validation examples. A TypeScript reference implementation is available in `packages/universal-manifest/` for those who want one.

### Critical Security Requirements

**All v0.2 consumers MUST implement:**

1. **TTL enforcement**: Reject manifests where `now > expiresAt` (prevents replay attacks)
2. **Signature verification**: Reject manifests with invalid or missing signatures (prevents tampering)
3. **Profile validation**: Reject unsupported signature algorithms/canonicalization methods (prevents downgrade attacks)
4. **Resource limits**: Enforce maximum manifest size (1 MB) and nesting depth (10 levels) to prevent DoS

### Revocation-Aware Verification (Optional)

For high-security contexts, consumers MAY implement revocation-aware verification:

- Check `signature.statusRef` endpoint for revocation status
- Enforce `signature.revocationCursor` monotonicity to prevent stale-status acceptance
- Reject manifests when revocation status is unavailable (fail-closed policy)

See `spec/v0.2/SIGNATURE-PROFILE.md:136-144` for revocation verification checklist.

### Key Compromise and Rotation

Issuers MUST:

- Rotate signing keys regularly (30-90 days for high-volume issuers)
- Publish public keys at stable `signature.keyRef` URLs
- Maintain revocation infrastructure (`signature.statusRef` endpoints)
- Respond to key compromise incidents within 24 hours

See `/docs/security/THREAT-MODEL.md` section 8 for operational guidance.

### Privacy Considerations

- **Opaque manifest IDs**: Use `urn:uuid:<uuidv4>` for `@id` and rotate per issuance to prevent correlation
- **Pairwise DIDs**: Use relationship-specific DIDs in `subject` field to prevent cross-context tracking
- **Minimal disclosure**: Include only necessary claims/consents; consider selective disclosure for sensitive data
- **Transport security**: Resolve manifests over HTTPS to prevent eavesdropping

#### Private data handling model

v0.2 supports two valid privacy paths:

- **Projection model (normative)**: issue consumer-specific derived manifests with only approved data.
- **Encrypted inline facets (optional guidance profile)**: keep sensitive facet payloads encrypted in-document while preserving a verifiable cleartext envelope.

This is an additive model. Implementers may use projection only, encrypted inline facets only, or both.

Operational guidance:

- projection path: maintain projection regeneration and TTL policies when consumer scope changes.
- encrypted path: define key discovery, key rotation, and revocation procedures, then re-sign updated manifests after encrypted payload/key changes.

### Threat Model

The v0.2 security model addresses:

- **Replay attacks**: Mitigated by TTL enforcement
- **Tampering**: Prevented by Ed25519 signature verification
- **Key compromise**: Mitigated by key rotation and revocation infrastructure
- **Revocation bypass**: Addressed by revocation-aware verification (when implemented)
- **DoS attacks**: Prevented by resource limits (size, depth, rate limiting)
- **Privacy leakage**: Reduced by opaque IDs, minimal disclosure, pairwise DIDs
- **Signature stripping**: Prevented by mandatory signature requirement

Comprehensive threat analysis: `/docs/security/THREAT-MODEL.md`

### Security Contact

Report vulnerabilities to: **security@universalmanifest.net** (see `/SECURITY.md`)
