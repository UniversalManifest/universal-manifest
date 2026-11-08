# universal-manifest

TypeScript types and runtime validators for the [Universal Manifest](https://universalmanifest.net) specification.

> Universal Manifest is an open specification, not a TypeScript-only library. This package is a TypeScript reference implementation; conformant implementations can be built in any language using the spec artifacts and conformance fixtures.

## Installation

```bash
npm install universal-manifest
```

## Quick Start

```ts
import {
  assertUniversalManifestV01,
  assertUniversalManifestV01Fresh,
  getManifestId,
} from 'universal-manifest'

// Parse a manifest from any source (API response, file, etc.)
const raw = JSON.parse(jsonString)

// Structural validation -- throws if the manifest is malformed
assertUniversalManifestV01(raw)

// After assertion, `raw` is typed as UniversalManifestV01
console.log('Manifest ID:', getManifestId(raw))
console.log('Subject:', raw.subject)

// Optional freshness check -- also throws if the manifest has expired
assertUniversalManifestV01Fresh(raw)
```

## API Overview

### Types

| Type | Description |
|------|-------------|
| `UmEntityV01` | A typed entity embedded inside a facet (`@id` + `@type` + domain data) |
| `UmFacetV01` | A named data section within a manifest carrying domain payloads or references |
| `UmSignatureV01` | Loosely-typed signature for v0.1 manifests |
| `UmSignatureV02` | Ed25519 + JCS (RFC 8785) signature for v0.2 manifests |
| `UniversalManifestV01` | Full v0.1 manifest document type |
| `UniversalManifestV02` | Full v0.2 manifest document type (requires signature) |
| `UniversalManifestV03` | Full v0.3 manifest document type (six-stage evaluation, encrypted facets, structured receipts) |
| `UmFacetV03` | v0.3 facet, including optional `encryptionProfile` and JWE entity payloads |
| `UmClaimV03` | v0.3 claim base; `UmCrossDidBindingClaimV03` specialises for `identity.crossDidBinding` |
| `UmConsentV03` | v0.3 consent entry (`@id`, `facetRef`, `scope`, `purpose`, `grantedAt`, `expiresAt`) |
| `UmPointerV03` | v0.3 pointer base; `UmAgentDelegationPointerV03` specialises for `um:agentDelegation` |
| `UmJweEntityV03` | JWE JSON Serialization shape used inside encrypted facets |
| `UmSignatureV03` | Signature Profile A object for v0.3 (identical wire shape to v0.2) |
| `UmTrustTier` | Integer 0..3 — trust tier per Section 6.4.2 |
| `UmReceiptV03` | Structured receipt produced by the v0.3 evaluator (Section 3.3) |
| `JsonLdContext` | JSON-LD `@context` value |
| `JsonLdType` | JSON-LD `@type` value |

### Functions

#### `assertUniversalManifestV01(value: unknown)`

Validates that `value` is a structurally correct v0.1 manifest. Checks required fields, date ordering, and facet types. Throws on failure; narrows the type to `UniversalManifestV01` on success.

#### `assertUniversalManifestV01Fresh(value: unknown, now?: Date)`

Runs `assertUniversalManifestV01` then checks that the manifest has not expired relative to `now`.

#### `assertUniversalManifestV02(value: unknown)`

Validates structure **and** verifies the Ed25519 signature using JCS canonicalization. Requires `manifestVersion === "0.2"` and a valid `signature` block with an inline `publicKeySpkiB64`.

#### `assertUniversalManifestV02Fresh(value: unknown, now?: Date)`

Runs `assertUniversalManifestV02` then checks that the manifest has not expired.

#### `assertUniversalManifestV03(value: unknown)`

Validates structure **and** verifies the Ed25519 signature for v0.3 manifests. Layered on top of the v0.2 baseline this enforces the v0.3 normative additions: claim/consent/pointer/facet schemas, `requiredTrustTier` ranges (0..3) and floor-raising rules, JWE inline encrypted facet shape, `identity.crossDidBinding` required fields with ≥2 `boundDids`, and `um:agentDelegation` pointer required fields including subject-to-delegator match.

#### `assertUniversalManifestV03Fresh(value: unknown, now?: Date)`

Runs `assertUniversalManifestV03` then enforces TTL expiry and the v0.3 60-second clock-skew tolerance for `issuedAt`.

#### `evaluateUniversalManifestV03(value: unknown, context?: UmEvaluationContext)`

Executes the v0.3 six-stage evaluation sequence (Arrive → Verify → Project → Consent → Compose → Receipt) and returns a structured receipt. Supports trust-tier capability checks, sealed-entry handling for encrypted facets the evaluator cannot decrypt, optional revocation resolution via the `resolveRevocation` callback, and per-facet consent scope/purpose matching.

#### `assertReceiptV03(value: unknown)`

Validates the structure of a v0.3 receipt object (Section 3.3): outcome, signatureCheck, freshnessCheck, and per-facet status entries.

#### `isJweEntityV03(value: unknown)`, `getJweRecipientKids(entity)`, `isFacetSealedV03(facet, availableKids)`

Helpers for working with JWE inline encrypted facets without forcing a cryptographic JWE library on every evaluator. Conformant evaluators MUST treat encrypted facets they cannot decrypt as sealed entries (Section 2.3 / 3.1.4).

#### `getManifestId(manifest: { '@id': string }): string`

Extracts the `@id` (UMID) from any object carrying an `@id` field.

## v0.2 Signed Manifests

```ts
import { assertUniversalManifestV02 } from 'universal-manifest'

const signed = JSON.parse(signedJsonString)

// Validates structure AND verifies the Ed25519 signature
assertUniversalManifestV02(signed)

console.log('Verified manifest:', signed['@id'])
```

> **Note:** This helper verifies signatures using `signature.publicKeySpkiB64` when present. Resolving `signature.keyRef` (DID resolution / HTTPS fetch) is intentionally out of scope.

## v0.3 Six-Stage Evaluation

```ts
import {
  evaluateUniversalManifestV03,
  isFacetSealedV03,
} from 'universal-manifest'

const signed = JSON.parse(signedJsonString)
const { receipt, manifest } = evaluateUniversalManifestV03(signed, {
  // Operations the evaluator wants to perform — checked against consents[].scope.
  intendedScope: ['read', 'display'],
  intendedPurpose: 'session-personalization',
  // Encrypted facets whose recipient kid the evaluator holds — others are sealed.
  decryptableFacetIds: ['urn:um:facet:public-profile-v03'],
  // Highest trust tier this evaluator can verify.
  maxSupportedTrustTier: 1,
  // Optional: resolve revocation status from signature.statusRef.
  resolveRevocation: (statusRef) => 'active',
  evaluatorId: 'did:web:venue.example#receipt-signer',
})

if (receipt.outcome === 'accepted' || receipt.outcome === 'accepted-with-warnings') {
  // Use facets whose status === 'processed'.
}
```

## v0.5 SD-JWT Holder Binding (Local Source)

`evaluateUniversalManifestV05WithSdJwtHolderBinding(value, context)` returns
`Promise<UmEvaluationResultV05>`. This API is available in the current local
source; this documentation does not establish availability in a published npm
release. The existing `evaluateUniversalManifestV05` remains synchronous.

The async API first runs the existing outer-manifest validation and requires a
verified interactive `did-auth` presentation. It then verifies claim-holder
binding for inline `claimProof` objects with `proofType: 'sd-jwt-kb'` and a
compact SD-JWT+KB string in `proofValue`. Arrays are conjunctive: a failed,
absent or unsupported member prevents an aggregate verified result. URI proofs
are not fetched. Input and context data are detached before awaited processing,
so subsequent caller mutations cannot change the evaluated snapshot.

The exported `UmEvaluationContextWithSdJwtV05` accepts
`sdJwtHolderBinding: UmSdJwtHolderBindingKeysV05`. Supply caller-authenticated
Ed25519 public keys as canonical base64 DER SPKI: an issuer-key map keyed by
the exact claim issuer identifier, plus the holder key. Also supply a pinned
valid `Date`, the verifier's nonempty challenge and audience, and a finite,
positive maximum KB-JWT age in seconds. This bounded implementation supports
EdDSA/Ed25519 and SHA-256, with zero clock skew for credential/KB checks.

The following shows the call shape, not a runnable credential example. Every
input is supplied by the application; key authentication and challenge issuance
must already have occurred:

```ts
import { evaluateUniversalManifestV05WithSdJwtHolderBinding } from 'universal-manifest'

const { receipt } = await evaluateUniversalManifestV05WithSdJwtHolderBinding(
  signedManifestWithDidAuthPresentation,
  {
    now: verificationTime,
    verifierChallenge: issuedChallenge,
    verifierAudience: intendedVerifier,
    sdJwtHolderBinding: {
      issuerPublicKeysSpkiB64: authenticatedIssuerKeys,
      holderPublicKeySpkiB64: authenticatedHolderKey,
      keyBindingMaxAgeSeconds: permittedBindingAgeSeconds,
    },
  },
)
```

Issuer and holder signatures, audience, nonce, time window and disclosure hash
must verify. The issuer-signed, undisclosed `cnf.jwk` must match the explicit
holder key and the claim's `cnfThumbprint`. Cryptographic
`holderBindingStatus: 'verified'` can coexist with an **unverified identity
claim** and `effectiveTrustTier: 0`. It does not establish DID method authority,
key purpose, revocation or subject authorization. The opt-in offline outer-key
resolver below does not supply these separately authenticated issuer/holder
keys. Full Tier-1 identity and full
advanced-proof (S5) support remain incomplete. Manifest-root `sd-jwt-kb` presentation proofs
remain PREVIEW under DEC07 and fail closed. Reference source support does not
establish native delivery, shipping qualification or public conformance.

### Opt-in SD-JWT issuer signing-key authorization (v0.5)

`evaluateUniversalManifestV05WithSdJwtIssuerKeyAuthorization(value, context, authenticatedIssuerDidDocuments)`
returns `Promise<UmEvaluationResultWithIssuerKeyAuthorizationV05>`. It combines
the existing SD-JWT holder verification with a separate issuer relationship
check. The context is `UmEvaluationContextWithSdJwtV05`; the third argument is
`Readonly<Record<string, string>>`, mapping each exact claim issuer to its raw
DID-document JSON. The caller must authenticate each document and establish its
currency before the call. Parsing a document does neither. Manifest/context
fields and trust booleans cannot activate this API.

```ts
import { evaluateUniversalManifestV05WithSdJwtIssuerKeyAuthorization } from 'universal-manifest'

const { receipt, issuerKeyAuthorization } =
  await evaluateUniversalManifestV05WithSdJwtIssuerKeyAuthorization(
    signedManifestWithDidAuthPresentation,
    holderBindingContext, // Same pinned clock, challenge, audience and authenticated keys as above.
    authenticatedCurrentIssuerDocuments, // Exact issuer -> raw JSON string.
  )
```

For each supported inline `sd-jwt-kb` proof, the token's verified `iss` must
equal the claim issuer, and the supplied document's `id` must equal that issuer.
The relationship check uses the exact key that actually verified that proof;
it performs no second key lookup and cannot rescue failed cryptography by
selecting a document key. The input remains one authenticated key per issuer.
Documents, manifest and context/key data are snapshotted before callbacks or
awaited processing.

Only `assertionMethod` grants this issuer role. An absent `proofPurpose`
defaults to it; an explicit incompatible purpose fails. If `verificationMethod`
is present, that exact selector must resolve locally, authorize this purpose
and carry the verified key. Only local `#fragments` expand against the issuer;
a bad selector cannot fall back to another matching method. If it is absent,
one or several distinct authorized methods may carry the verified key. The
check invents no selector and does not reinterpret JWT `kid` or fetch references.
A valid controller DID may differ from the issuer. Repeated references to one
unique method can pass; repeated object definitions of one method ID fail.
The bounded raw-document parser and `JsonWebKey2020` rules described below apply.
The common issuer proof subset is **Ed25519 only**; this adds no P-256 issuer
qualification and preserves existing P-256 subject behavior.

Proof arrays are conjunctive and must be nonempty for authorization success.
Each member needs its own successful cryptography and issuer relationship;
one member or claim cannot cover another. Failed, missing, unsupported or
unresolved members prevent aggregate success. Empty proof sets provide no
evidence. Existing early failures and crypto/unsupported distinctions remain.

Local `issuerKeyAuthorization` contains aggregate `status`, `reason` and
`claims`; each claim has `claimIndex`, `issuer`, `status`, `reason` and `proofs`;
each proof has `proofIndex`, `proofStatus`, `status` and `reason`. Authorization
status is `verified`, `failed` or `not-evaluated`. These diagnostics stay outside
the serialized receipt. A verified proof with a failed relationship rejects
with `um:reason:trust:unbound-claims`, retaining its actual cryptographic results.
Successful authorization preserves the complete holder-wrapper receipt;
existing entrypoints and their full default receipts remain unchanged.

This proves the bounded relationship in caller-authenticated documents. Claim
and effective identity trust remain Tier0, and higher trust-floor refusals remain.
It establishes no attester trust, revocation completion, provider/human identity,
subject/device/person linkage or current permission. It does not invoke the
separate subject-authorization wrapper. Native issuer C ABI, wrappers and package
synchronization remain subsequent work. The canonical local build
and package-export consumer checks use Node 22.22.3, TypeScript 5.9.3 and the
locked `@sd-jwt/core` 0.23.2; they do not establish a published package, fully
reproducible public release, engine/device behavior or whole-Standard conformance.

### Opt-in offline signing-key resolution (v0.5)

Pass `offlineKeyResolution: true` to `evaluateUniversalManifestV05` or its
SD-JWT holder-binding wrapper. Absent/false preserves the existing behavior;
an application `resolveKeyRef` callback remains available when offline mode
is absent/false. Supplying both offline mode and a callback, or a nonboolean
offline option, is rejected before signature verification.

The bounded profile accepts `did:key:` with canonical base58btc (`z`) or
unpadded base64url (`u`), canonical multicodec varints for Ed25519 (`0xed`) or
P-256 (`0x1200`), and validated 32-byte Ed25519 or 33-byte compressed P-256
points. Select the bare DID or its exact `#<same-multibase>` signing method.
Input is bounded to 256 characters. Queries, paths, arbitrary/foreign fragments,
keyAgreement methods, unsupported curves and malformed encodings do not resolve.
Method/codec references: [did:key](https://w3c-ccg.github.io/did-key-spec/) and
[multicodec registry](https://raw.githubusercontent.com/multiformats/multicodec/master/table.csv).

Resolved plus embedded key material must match decoded SPKI bytes exactly;
substitution rejects. A resolved key can verify without an embedded SPKI.
Failed/unavailable resolution may fall back to an embedded key and reports
`unresolved`; without an embedded key it refuses. Without an attempted lookup,
v0.5 reports `not-attempted`. Declared-suite checks and real signature validation
still apply. The selected key also verifies root did-auth, which remains
Ed25519-only; ES256 supports outer signatures, not root did-auth.

Resolution grants no subject/issuer authorization, consent, holder binding or
identity tier: claim/effective identity trust remains Tier0. Signed input is
never rewritten to inject a key. Legacy v0.4 and standalone assertion helpers
retain their defaults. This updates reference source only; installed SDKs,
engines, native products and public packages are not delivery claims here.

### Opt-in subject signing-key authorization (v0.5)

Call `evaluateUniversalManifestV05WithSubjectKeyAuthorization(value, context, authenticatedSubjectDidDocument)`
with a separate raw JSON string. The caller must authenticate that DID document
and establish its currency before calling. A manifest-held document, JSON
context field or `authorized: true` flag cannot opt in. Existing entry points
and default receipts retain their behavior.

The wrapper snapshots candidate and context data, preserving existing callbacks.
It verifies the outer signature once and checks freshness before the relationship.
It uses the exact selected signature key, including offline resolution or embedded
fallback, without a second lookup. The document's `id` must equal the manifest
subject exactly. Its `authentication` or `assertionMethod` must authorize the exact
`signature.keyRef`; top-level `verificationMethod` or `keyAgreement` alone does not suffice.

This bounded [DID Core relationship](https://www.w3.org/TR/2022/REC-did-core-20220719/#verification-relationships)
profile accepts inline methods or references to unique, locally supplied
`verificationMethod` entries. Local `#fragments` expand against the document id;
the evaluator follows no external reference or alias. The selected method contains
only `id`, `type: "JsonWebKey2020"`, a DID `controller`, and `publicKeyJwk`.
The controller may differ from the subject because the subject's relationship
grants authorization.

Public JWKs support `OKP`/`Ed25519` with `x`, or `EC`/`P-256` with `x` and `y`.
Each coordinate uses canonical unpadded base64url for exactly 32 bytes.
Optional `alg` must match `EdDSA` or `ES256`; `use` must be `sig`;
`key_ops` must contain only `verify`. Other method/JWK fields, private material,
conflicting representations, duplicate method ids and mismatched keys fail closed.
The parser rejects duplicate JSON members and invalid I-JSON.

Documents have a 1 MiB byte limit, ten container levels and 1,000 entries per array.
Identifiers use bounded DID/DID URL syntax; supplied ids have a 2,048-character limit.
The wrapper returns the ordinary result plus local `subjectKeyAuthorization`
with `status` and `reason`. Status is `verified`, `failed` or `not-evaluated`;
the diagnostic never enters the serialized receipt.

Earlier failures leave authorization `not-evaluated`. Authorization failure rejects
the evaluation, retains `signatureCheck: "valid"`, and adds
`um:reason:trust:unbound-claims` with a specific reason. Successful authorization
preserves later proof, revocation, consent and trust-floor checks. Root `did-auth`
remains Ed25519-only; root `sd-jwt-kb` remains refused PREVIEW.

This check proves a relationship within the caller-authenticated document, not
real provider or human identity. It grants no Tier1, verified claim or permission;
effective identity trust remains Tier0. The dedicated issuer wrapper above adds
issuer assertionMethod evidence; attester trust, revocation authority and
composition of this subject wrapper with SD-JWT holder binding remain separate.
Neither SD-JWT wrapper invokes this subject wrapper. The subject-authorization
C ABI source slice is independently accepted at ABI 1.6.0 with 198 exports;
issuer C ABI and native wrapper/package synchronization remain separate work.
That source acceptance does not establish installed-package, engine,
device or public-delivery capability.

Local source checks, after installing the locked dependencies and building:

```bash
npm run build
node scripts/test-sd-jwt-holder-binding.mjs
node scripts/test-subject-key-authorization.mjs
npm run test:v05:contract
```

The [focused controls](scripts/test-sd-jwt-holder-binding.mjs) exercise the
integrated async API. The [contract controls](scripts/test-v05-contract.mjs)
preserve existing evaluator behavior and the frozen fixture expectations.

## Running Tests

From this package directory:

```bash
npm test
```

This builds the package, validates all fixtures under `examples/v0.1/`, `examples/v0.2/`, and `examples/v0.3/` (including expected-invalid fixtures), runs the v0.3 six-stage evaluator test suite, and drives the v0.3 conformance fixture suite end-to-end against the reference validator.

## Code Examples

See the [code examples](../../examples/code/) directory for runnable demonstrations:

- [02-validate-and-check-ttl](../../examples/code/02-validate-and-check-ttl/) -- Structural and TTL validation
- [03-create-signed-manifest-v02](../../examples/code/03-create-signed-manifest-v02/) -- Ed25519 signing and verification
- [10-multi-manifest-aggregation](../../examples/code/10-multi-manifest-aggregation/) -- Multi-party validation

## License

Apache-2.0. See `LICENSE`.
