# Universal Manifest v0.2 (Draft) — Signature Profile

This document proposes a first “real” signature profile for Universal Manifest (post‑v0.1).

Design constraints:

- **Local-first**: verification must be feasible on constrained devices (Android TV / edge boxes)
- **Portable**: third parties should be able to implement verification without adopting an entire ecosystem
- **Stable signing input**: signature must be computed over a canonical form
- **Forward compatible**: allow future profiles without breaking old consumers

v0.1 note:

- v0.1 `signature` is intentionally permissive and not interoperable across implementations.

## 0) Not either-or (profiles are additive)

This is **not** an either-or decision long-term.

We can:

- start with a pragmatic profile that is easiest for broad adoption (e.g., JCS + Ed25519), and
- add a Data Integrity profile later if/when we need “sign the RDF meaning” semantics.

The compatibility strategy is:

- **Consumers** verify the profiles they support and ignore/skip unknown profiles safely.
- **Issuers** can choose a profile appropriate to the surface; future versions may also support attaching more than one proof.

The key is to keep each profile explicit about:

- canonicalization rules
- signing input
- verifier checklist

## 1) Options considered

### Option A — W3C Data Integrity (JSON-LD / RDF canonicalization)

Pros:

- aligns with JSON-LD semantics (sign what the graph *means*)
- existing patterns from Verifiable Credentials ecosystems

Cons:

- higher complexity for early adopters
- canonicalization + library support is more specialized

### Option B — JWS / JOSE (JSON-level canonicalization)

Pros:

- widely implemented primitives across languages
- can avoid RDF expansion/canonicalization

Cons:

- you sign the JSON representation (what it *is*), not necessarily the RDF graph meaning
- you must define canonicalization rules explicitly

## 2) Proposed v0.2 profile (recommended): JCS + Ed25519

Recommendation for v0.2:

- Canonicalization: **JSON Canonicalization Scheme** (JCS, RFC 8785)
- Signature: **Ed25519**
- Signature encoding: **base64url**

Rationale:

- easiest adoption path for third parties
- deterministic signing input without requiring JSON-LD processing
- matches our current “state capsule” usage where the JSON shape is the primary contract

## 3) Signature shape (draft)

v0.2 continues to use a `signature` top-level field, but constrains its semantics.

Proposed fields:

- `signature.algorithm` — MUST be `"Ed25519"` (v0.2 profile)
- `signature.canonicalization` — MUST be `"JCS-RFC8785"`
- `signature.keyRef` — URI reference to verification key material (recommended: DID URL or HTTPS URL)
- `signature.publicKeySpkiB64` — OPTIONAL base64-encoded SPKI DER public key bytes (escape hatch for offline/fixture/local-first verification)
- `signature.created` — ISO 8601 date-time (optional but recommended)
- `signature.value` — base64url-encoded Ed25519 signature over canonical bytes
- `signature.statusRef` — OPTIONAL URI to revocation/status material for this signature
- `signature.revocationCursor` — OPTIONAL monotonic status cursor/version string for cache-aware revocation checks

Notes:

- `signature` is **not included** in the signing input (to avoid circularity).
- Additional fields MAY exist (future profiles), but consumers should rely on `algorithm` + `canonicalization` to decide whether they can verify.
- If `statusRef`/`revocationCursor` are present, they are metadata for revocation-aware policy checks and do not change signature canonicalization input.

## 4) Signing input (normative for this profile)

To compute the signature:

1. Start with the manifest JSON object.
2. Remove the `signature` property entirely.
3. Canonicalize the remaining object using JCS (RFC 8785), producing a UTF‑8 byte sequence.
4. Compute Ed25519 signature over those bytes.
5. Set `signature` on the manifest with the fields defined above.

This yields a stable, portable verification input for any implementation that supports JCS + Ed25519.

## 5) Verifier checklist (consumer)

A verifier implementing this profile MUST:

1. Confirm the value is a v0.x Universal Manifest (required fields and `@type` includes `um:Manifest`).
2. Enforce TTL:
   - reject for use if `now > expiresAt`
   - (recommended) sanity-check `issuedAt <= expiresAt`
3. Determine signature profile support:
   - require `signature.algorithm === "Ed25519"`
   - require `signature.canonicalization === "JCS-RFC8785"`
   - require `signature.value`
4. Obtain a public key:
   - if `signature.publicKeySpkiB64` exists, a consumer MAY use it directly (SPKI DER bytes, base64)
   - otherwise resolve `signature.keyRef` to public key material (method-specific; e.g., DID resolution or HTTPS fetch)
5. Recompute signing input (remove `signature`, JCS canonicalize).
6. Verify Ed25519 signature over canonical bytes.

If verification fails, the manifest MUST be rejected for use (but may be retained for debugging).

### 5.1 Profile identification and unsupported profiles

Consumers MUST treat `signature.algorithm` + `signature.canonicalization` as the explicit profile identity.

- If the pair is unsupported for the verifier, the manifest MUST be rejected when strict verification is required by policy.
- Consumers MUST NOT reinterpret unknown pairs as the baseline profile.

### 5.2 Revocation-aware verification extension

For consumers claiming revocation-aware verification:

1. If `signature.statusRef` is present, resolve status from that URI (or a configured equivalent).
2. If `signature.revocationCursor` is present, use it to prevent stale-status acceptance and to drive cache revalidation policy.
3. If revocation status cannot be determined and policy requires active status, the manifest MUST be rejected for use.

Consumers that do not implement revocation-aware verification MUST report revocation status as `unchecked` and MUST NOT claim revocation-aware conformance.

## 6) Issuer checklist

An issuer implementing this profile SHOULD:

- generate `@id` as `urn:uuid:<uuidv4>` and rotate it per issuance
- use short TTLs appropriate to the surface
- ensure `subject` is stable and correct for the intended consumer
- publish verification material reachable from `signature.keyRef` (or distribute it out-of-band)
- if revocation-aware behavior is required by relying parties, publish stable status metadata via `signature.statusRef` and rotate `signature.revocationCursor` whenever status changes

## 7) Future compatibility

This profile is intentionally explicit via:

- `signature.algorithm`
- `signature.canonicalization`

Future profiles can be added by introducing new values (e.g., post-quantum algorithms, alternative canonicalization, or a Data Integrity proof model).

## 8) Data Integrity path (future, not v0.2)

If/when signing the RDF graph meaning becomes critical, a future version may add a Data Integrity `proof` model and an RDF dataset canonicalization requirement.

Until then, the recommended early-adopter path is JCS + Ed25519 for interoperability.
