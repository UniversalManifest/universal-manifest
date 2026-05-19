# Universal Manifest Spec (v0.1 draft)

> Universal Manifest is an open specification for portable state capsules. It is not tied to any particular programming language, framework, or runtime. The TypeScript helper in this repository is one reference implementation; you can build a conformant implementation in any language using the published spec artifacts and conformance fixtures.

## Overview

The **Universal Manifest** is a **portable state capsule**: a single document that can be moved between compatible apps/devices to convey identity references, permissions/roles/consents, device registrations, and pointers to canonical data sources.

It is designed for **local-first** environments (venue edges + public displays) where consumers must tolerate partial connectivity and rely on cached, verifiable state.

## Build your own implementation (any language)

Use the specification and fixtures as your source of truth, regardless of language or runtime:

- Read conformance requirements: `spec/v0.1/CONFORMANCE.md`
- Run the implementation-neutral suite flow: `conformance/README.md`
- Optional reference: `packages/universal-manifest/` (TypeScript reference implementation)

## Core types

### `um:Manifest`

Required fields:

- `@context` — JSON-LD context (this repo provides `spec/v0.1/schema.jsonld`)
- `@id` — a globally unique manifest identifier (URI; recommended `urn:uuid:...`)
- `@type` — MUST include `um:Manifest`
- `manifestVersion` — spec version (e.g., `"0.1"`)
- `subject` — who this manifest is about (URI; e.g., DID)
- `issuedAt` — ISO 8601 date-time
- `expiresAt` — ISO 8601 date-time

Optional fields (v0.1):

- `facets` — composable sub-documents (`um:Facet`)
- `claims`, `consents`, `devices`, `pointers` — structured state sections
- `signature` — signature for integrity (format is intentionally permissive in v0.1)

### `um:Facet`

Reusable “parts” that can be composed into a manifest.

Common fields:

- `@type` — MUST include `um:Facet`
- `name` — human-readable label (optional)
- `ref` — URI to canonical source (optional)
- `entity` — embedded or referenced entity (`um:Entity` or JSON-LD node; optional)

### `um:Entity`

Base class for embedded entities.

Common fields:

- `@id` — URI
- `@type` — entity type(s)

## ID + caching guidance (constrained devices / public displays)

- **v0.1 recommendation:** issuers generate `@id` as `urn:uuid:<uuidv4>` (opaque, globally unique, offline-safe).
- **Future option:** add a separate content hash (or adopt content-addressed IDs) once canonicalization rules are locked down.

- Consumers cache the **full manifest** only while it is actively needed for rendering/interaction.
- Logs should store **only the manifest `@id`** (and optionally a content hash) to keep telemetry small and enable future recovery workflows without overbuilding now.

## Security Considerations

**v0.1 is a draft specification with intentionally permissive signature semantics. It MUST NOT be used in production security-critical contexts.**

### Signature Limitations

The v0.1 `signature` field is intentionally permissive and not interoperable across implementations. There is no defined canonicalization scheme, signature algorithm, or verification profile. This means:

- Manifests cannot be reliably verified for integrity or authenticity
- Tampering attacks are not cryptographically prevented
- Cross-implementation signature verification is not guaranteed

**For production use cases requiring tamper protection, implementers MUST migrate to v0.2** (see `/spec/v0.2/SIGNATURE-PROFILE.md`).

Migration runbook: `/docs/guides/MIGRATION-V01-V02.md`

### TTL Enforcement (Required)

All manifest consumers MUST enforce time-to-live (TTL) validity:

- **REQUIRED**: Reject manifests where `now > expiresAt`
- **RECOMMENDED**: Validate `issuedAt <= expiresAt` to detect malformed manifests

TTL enforcement provides a basic defense against replay attacks (presenting expired manifests).

> *Non-normative note:* See the conformance fixtures for validation examples. A TypeScript reference implementation is available in `packages/universal-manifest/` for those who want one.

### Privacy Considerations

- **Opaque identifiers**: Issuers SHOULD use `urn:uuid:<uuidv4>` for `@id` to prevent correlation across contexts. Rotate `@id` per issuance.
- **Minimal disclosure**: Include only claims/consents necessary for the immediate use case.
- **Subject privacy**: Use pseudonymous or pairwise DIDs in `subject` field to prevent tracking.

### Resource Limits (Recommended)

To prevent denial-of-service attacks, consumers SHOULD enforce limits on manifest size and structure:

- Maximum total JSON size: 1 MB
- Maximum JSON nesting depth: 10 levels
- Maximum array sizes: 1,000 elements per array

See `/docs/security/THREAT-MODEL.md` for comprehensive security guidance.

## Files

- `spec/v0.1/schema.jsonld` — JSON-LD context defining `um:Manifest`, `um:Facet`, `um:Entity`
- `spec/v0.1/schema.json` — JSON Schema for basic structural validation
- `spec/v0.1/REGISTRY.md` — Well-known facet/pointer/claim/consent names (non-normative)
- `spec/v0.1/CONFORMANCE.md` — Conformance requirements + fixture list (draft)
