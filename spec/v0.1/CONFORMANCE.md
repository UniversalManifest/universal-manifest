# Universal Manifest v0.1 — Conformance (Draft)

This document defines what it means for an implementation to “support Universal Manifest v0.1”.

v0.1 goals:

- be easy to adopt (even without JSON-LD tooling)
- be safe to cache in local-first environments (TTL + small payload)
- be forward-compatible (unknown fields MUST be safely ignored)

## 1) Conformance targets

There are two primary implementation targets:

### A) Consumer

A **consumer** receives manifests and uses them to drive a surface (display, admin, web profile, etc.).

### B) Issuer

An **issuer** produces manifests for a subject and delivers them to consumers (directly or via intermediaries like an edge).

## 2) Required behavior (consumer)

### 2.1 Parse + identify

A consumer MUST treat a value as a v0.1 Universal Manifest when:

- it is a JSON object, and
- it contains all required fields from `spec/v0.1/README.md`, and
- `@type` includes `um:Manifest` (string or array)

### 2.2 Unknown fields

A consumer MUST ignore unknown fields safely:

- unknown top-level properties
- unknown `facets[].entity` shapes
- unknown `claims` / `consents` / `devices` / `pointers` item shapes

This requirement is what allows early adopters to extend the document without fragmentation.

### 2.3 TTL / freshness

Consumers MUST enforce TTL for *use*:

- If `now > expiresAt`, a consumer MUST NOT use the manifest to grant permissions or render user/venue/device state.
- Consumers MAY retain expired manifests for debugging, but MUST treat them as expired.

Consumers MUST sanity-check:

- `issuedAt` and `expiresAt` are ISO 8601 / RFC 3339 date-time strings (with timezone)
- `issuedAt <= expiresAt`

Consumers SHOULD sanity-check:

- `issuedAt` not unreasonably far in the future (clock skew)

### 2.4 Caching + logging

Consumers are advised to follow these caching and logging practices:

- cache full manifests only while in active use
- log primarily by manifest `@id` (not full payload)

See `integrations/reference-runtime.md` for one reference implementation pattern (non-normative).

## 3) Required behavior (issuer)

### 3.1 Manifest ID (`@id`)

Issuers MUST set `@id` to a globally unique URI.

v0.1 recommendation:

- `urn:uuid:<uuidv4>`

### 3.2 Subject

Issuers MUST set `subject` to a stable identifier URI (recommended: DID, but not required).

### 3.3 TTL

Issuers SHOULD use short TTLs for safety (hours/days depending on surface).

## 4) Signature (v0.1)

v0.1 includes `signature` only as a permissive placeholder.

- Consumers MAY verify signatures when present.
- Issuers SHOULD include signatures when they have a stable key reference.

The interoperable signature profile is intentionally deferred (see `docs/STATE-OF-THE-PROJECT.md`).

## 5) Conformance test fixtures

To claim conformance, an implementation MUST:

1. **Accept** all “valid fixtures”
2. **Reject** all “invalid fixtures”

### 5.1 Valid fixtures

Located under `examples/v0.1/` and `examples/v0.1/stubs/`:

- `examples/v0.1/minimal-manifest.jsonld`
- `examples/v0.1/type-array-manifest.jsonld`
- `examples/v0.1/unknown-fields-manifest.jsonld`
- `examples/v0.1/manifest-with-facets.jsonld`
- `examples/v0.1/stubs/venue-edge-manifest.jsonld`
- `examples/v0.1/stubs/display-device-manifest.jsonld`
- `examples/v0.1/stubs/creator-public-capsule-manifest.jsonld`
- `examples/v0.1/stubs/social-profile-manifest.jsonld`
- `examples/v0.1/stubs/display-envelope-manifest.jsonld`

### 5.2 Invalid fixtures

Located under `examples/v0.1/invalid/`:

- `examples/v0.1/invalid/missing-context.jsonld`
- `examples/v0.1/invalid/missing-id.jsonld`
- `examples/v0.1/invalid/empty-id.jsonld`
- `examples/v0.1/invalid/wrong-type.jsonld`
- `examples/v0.1/invalid/missing-subject.jsonld`
- `examples/v0.1/invalid/issued-after-expires.jsonld`
- `examples/v0.1/invalid/invalid-issuedAt-format.jsonld`
- `examples/v0.1/invalid/invalid-expiresAt-format.jsonld`
- `examples/v0.1/invalid/expired-for-use.jsonld`
- `examples/v0.1/invalid/facets-not-array.jsonld`
- `examples/v0.1/invalid/facet-wrong-type.jsonld`

## 6) Standalone conformance suite (external adopter path)

For implementation-neutral, external conformance execution, use the standalone suite documentation:

- Site guide: Standalone Conformance Suite
- Suite package root (repo path): `conformance/README.md`

The standalone suite is intended to be language-neutral. It packages fixtures plus expected outcomes so implementations can prove equivalent accept/reject behavior without depending on TypeScript internals.

## 7) Reference harness (repo-local)

This repo includes a TypeScript reference harness (one of many possible implementations):

- `packages/universal-manifest/` → `npm test`

Third-party adopters do not need Node/TypeScript; the fixtures are designed to be portable. You can build a conformant harness in any language.

## 7.1 Non-normative GPC integration proof pack

The repo also includes a non-normative GPC proof pack used by the TypeScript reference implementation to exercise runtime-aligned behavior:

- `examples/integrations/gpc/runtime/`
- `examples/integrations/gpc/support-resource/`
- `examples/v0.1/stubs/gpc-evidence-projection-manifest.jsonld`

These fixtures are not part of the v0.1 core conformance minimum. They exist to prove one integration lane implementation path:

- runtime signal normalization from `Sec-GPC` / `navigator.globalPrivacyControl`
- `/.well-known/gpc.json` support-resource parsing
- optional UM evidence projection using consent/pointer structures

## 8) Implementation onboarding package (non-normative)

For a complete implementation walk-through and handoff package:

- Repo guide: `../../docs/guides/IMPLEMENTATION-GUIDE.md`
- Quick card: `../../docs/guides/QUICK-REFERENCE.md`
- Agent handoff: `../../docs/guides/AGENT-HANDOFF.md`
- Site guide: Implementation Guide (see repo: `../../docs/guides/IMPLEMENTATION-GUIDE.md`)
- Site quick card: Quick Reference (see repo: `../../docs/guides/QUICK-REFERENCE.md`)
