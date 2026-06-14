# Universal Manifest Spec (v0.4)

> Universal Manifest is an open specification for portable state capsules. It is not tied to any particular programming language, framework, runtime, or wire format. v0.4 makes that last independence explicit: the manifest is defined as an abstract data model, and a manifest is written to bytes through a production rule. JSON-LD is the reference encoding; CBOR-LD is a second encoding defined to demonstrate format independence. The TypeScript helper in this repository is one reference implementation; you can build a conformant implementation in any language using the published spec artifacts and conformance fixtures.

v0.4 is the **Format Independence and Edge Interoperability** iteration of the Universal Manifest specification. The normative source of truth is the v0.4 document set rendered at `https://universalmanifest.net/spec/v0.4/` (Base + four extension profiles + Primer + Cookbook). This directory holds the structured artifacts implementers consume directly: the JSON Schema, the JSON-LD context, and the conformance summary.

The v0.4 document set is organized as a **conformance-tier stack**. The question that decides what you read and build is "what level of assurance am I certifying to?" A breadth-first Primer orients you; the Base specifies everything required for a Tier-0 / Tier-1 evaluator and holder; four companion profiles add depth by tier or by optional feature; and the Cookbook collects worked examples.

## The v0.4 document set

| Document | Role | Status |
|----------|------|--------|
| Primer | Breadth-first overview: what UM is, the shape of a manifest, the lifecycle, the core guarantees, a one-glance map of tiers and extensions. No normative requirements. | Informative |
| Base (Tier-0 / Tier-1 Core) | Everything required to build a conformant Tier-0 / Tier-1 evaluator and holder. Names advanced and optional features and points to the extensions for their mechanics. | Production-candidate (some members PREVIEW) |
| EXT-T1 (Tier-1 Binding Profile) | Tier-1 binding mechanics: holder binding, presentation proof, liveness attestation, the Stage-2 sub-steps, the end-to-end claim-proof path, v0.3 backwards compatibility. | Normative |
| EXT-T2 (Tier-2 Cryptographic-Binding Profile) | Tier-2 ZKP proof profiles, the BBS+ unlinkable-disclosure track, the post-quantum migration path. | PREVIEW |
| EXT-T3 (Tier-3 Ceremony Profile) | Tier-3 multi-party ceremony: model, signer-role taxonomy, threshold-protocol guidance. | PREVIEW |
| EXT-OPT (Optional-Feature Profiles) | Tier-orthogonal optional features: the abstract data model and its CBOR-LD encoding, the statusRef resolution protocol, receipts-as-a-class with hash-chaining, the bilateral session model, federation, profile registration, the agent-delegation scope registry, trustWeight and category trust, extended schemas, and the cryptographic-requirements summary. | Mixed (PREVIEW per part) |
| Cookbook | Worked examples, organized by scenario and tagged by tier. | Informative |

## What v0.4 adds over v0.3

- **Abstract data model and production rules (Format Independence).** v0.4 defines the manifest as an abstract data model independent of serialization, plus production rules that write it to a concrete wire format. JSON-LD is the **reference encoding** and the default for interoperation; **CBOR-LD** is a second encoding defined in EXT-OPT to demonstrate format independence. Conformance is defined against the abstract data model, not against any single serialization. See Base Section 1.7 and Section 4.5; EXT-OPT Section O1.
- **Versioned context document with context integrity.** Term definitions for v0.4 are fixed by the versioned context document served at `https://universalmanifest.net/ns/v0.4`. Evaluators MUST pin the content-hashed context and verify its multihash before trusting term definitions, rather than fetching an arbitrary remote context at evaluation time. The `um:` term prefix is version-independent and expands to `https://universalmanifest.net/ns/um#`. See Base Section 6.10 and Appendix B.
- **Tier-1 binding made concrete.** Any claim relied upon at Tier 1 or above now requires a verified **holder binding** proving the presenting subject is the credentialed holder, in three modes (`sd-jwt-kb`, `bbs-holder-commitment`, `reciprocal-control`). **Presentation proof** (`presentationProof`) provides proof-of-possession that binds a manifest to a specific verifier and moment, preventing replay. **Liveness attestation** (`livenessAttestation`) proves human presence at its `attestedAt` time but not at verification time. See Base Section 6.6 and EXT-T1.
- **Tier-2 cryptographic binding profile.** The Tier-2 ZKP proof object, named but deferred in v0.3, is specified here: two proof profiles (`ZkLinkedSecretProof`, `ZkHdDerivationProof`) for proving control of multiple DIDs in zero knowledge, plus the BBS+ unlinkable-disclosure track and a post-quantum migration path. PREVIEW. See EXT-T2 and Base Section 6.4.7.
- **Tier-3 multi-party ceremony.** Tier 3, reserved in v0.3, gains a concrete `ceremonyProof` (`ThresholdAttestationProof`) carrying a `threshold`, `attesters`, `ceremonyId`, and an `aggregateProof` for co-signed, highest-stakes deployments. PREVIEW. See EXT-T3 and Base Section 6.4.8.
- **Receipt-disposition vocabulary (extended).** The structured receipt carries richer disposition fields: `keyRefResolution`, per-consent `consentStatuses`, per-claim `claimStatuses` (with `claimRef`, status, and optional `tier`), `unprocessedEntries`, the credential-binding status fields (`holderBindingStatus`, `presentationProofStatus`, `livenessStatus`), and `effectiveTrustTier`. The `facetStatuses` status set adds `trustTierUnsupported` to v0.3's values. See Base Section 3.3.
- **statusRef resolution schema.** v0.4 defines the revocation-status resolution protocol and its response schema (`manifestId`, `status` in `active` / `revoked` / `suspended`, `updatedAt`, optional `reason` / `cursor` / `nextCheck`) and the status-endpoint conformance criteria. See Base Section 3.4 and EXT-OPT Section O2.
- **Bilateral session model and manifest forwarding.** The Base carries the bilateral field surface (`exchangeId` and `evaluatorId` on receipts) and the bilateral-exchange security model. EXT-OPT specifies the full session object (`um:BilateralSession` with `sessionId`, `exchangeId`, two `participants`, `initiatedAt`, `expiresAt`, and strictly-forward lifecycle `state`), paired-receipt correlation, receipt hash-chaining (`seq` / `prevHash`), federation, and manifest forwarding across resolver operators. See Base Section 3.5 and Section 6.4.6; EXT-OPT Sections O3 and O4.
- **JWE algorithm constraints.** Encrypted facets gain a normative MUST-implement baseline algorithm pair and an evaluation contract for algorithm negotiation. See Base Section 2.4.
- **Optional structural extensions.** EXT-OPT adds the agent-delegation scope registry, category trust and `trustWeight`, an `actorState` member, a two-component `devices` schema, and a derived-variant sensor-consent vocabulary, each independently optional. See EXT-OPT Sections O6 through O9.

Signature Profile A (JCS + Ed25519) carries forward from v0.2 and v0.3 unchanged. The six-stage evaluation sequence (Arrive, Verify, Project, Consent, Compose, Receipt) carries forward as the conceptual spine, with Stage-2 sub-steps for binding verification specified in EXT-T1.

## Build your own implementation (any language)

Use the specification and fixtures as your source of truth, regardless of language, runtime, or encoding:

- Read the normative spec text: the v0.4 document set rendered at `/spec/v0.4/` (start with the Base)
- Read conformance requirements: `spec/v0.4/CONFORMANCE.md`
- Validate against the structural schema: `spec/v0.4/schema.json`
- Use the JSON-LD context: `spec/v0.4/schema.jsonld`
- Run the implementation-neutral suite flow: `conformance/README.md` with v0.4 fixtures at `conformance/v0.4/`
- Optional reference: `packages/universal-manifest/` (TypeScript reference implementation)

## v0.4 artifacts (this directory)

- `README.md` - this file
- `CONFORMANCE.md` - conformance requirements (evaluator, holder, bilateral participant) plus the fixture index
- `schema.json` - JSON Schema for structural validation of v0.4 manifests
- `schema.jsonld` - JSON-LD context defining v0.4 terms
- (Signature Profile A is unchanged from v0.2; see `/spec/v0.2/SIGNATURE-PROFILE.md` for the profile text.)

## Namespace URIs

- Manifests MUST set `@context` to include the v0.4 versioned context document `https://universalmanifest.net/ns/v0.4` (or include this URI when an array form is used).
- The `um:` term prefix is version-independent and expands to the base IRI `https://universalmanifest.net/ns/um#`.
- Hosted artifacts:
  - `https://universalmanifest.net/ns/universal-manifest/v0.4/schema.jsonld`
  - `https://universalmanifest.net/ns/universal-manifest/v0.4/schema.json`
  - `https://universalmanifest.net/spec/v0.4/`

## Six-stage evaluation sequence (summary)

Every conformant evaluator MUST execute these stages in order for every v0.4 manifest it processes. Each stage produces a defined output that feeds the next, and the evaluator MAY stop early at any stage by emitting a rejection.

1. **Arrive** - parse the manifest from a conformant encoding; confirm required envelope members and that `@type` includes `um:Manifest`; preserve (but do not act on) unknown members so they survive signature verification.
2. **Verify** - verify the signature over the canonical signing bytes; enforce freshness (TTL and 60s clock-skew); when a claim leans on stronger identity binding, run the Stage-2 binding sub-steps (EXT-T1); optionally resolve revocation status.
3. **Project** - extract only the facets, claims, pointers, and devices relevant to the evaluator's context. A facet that is absent is *not projected*, not evidence of absence.
4. **Consent** - match `consents[].facetRef` against each projected facet's `@id`; check scope, purpose, and validity window. Sealed (encrypted) facets are acknowledged as present, never guessed at.
5. **Compose** - produce one of four outcomes: `accepted`, `accepted-with-warnings`, `accepted-partial`, or `rejected`. The result MUST be machine-readable and MUST include per-facet status.
6. **Receipt** - emit a structured receipt that honestly records what the evaluator did, including the gap between what a manifest declared it needed and what could be verified. Receipts MAY be signed (Signature Profile A) and MAY themselves be chainable manifests (EXT-OPT).

See Base Section 3.1 for normative details and `packages/universal-manifest/` for the reference six-stage evaluator implementation.

## Tiered trust model (summary)

Four tiers, strictly additive. A claim verified at a higher tier automatically satisfies every lower tier. Relying parties choose their tier from their own threat model; the specification mandates no minimum.

- **Tier 0 - Signature-only.** Zero friction. Claims are self-asserted; the only cryptographic check is the manifest signature. MUST NOT be used as sufficient assurance for Sybil-critical decisions.
- **Tier 1 - Attested / proof-backed.** Low friction. Claims carry external proof of issuance plus a verified holder binding proving the presenter is the credentialed holder. Evaluators MUST enforce attester trust policy and freshness on proof material. Mechanics in EXT-T1.
- **Tier 2 - Cryptographic binding (ZKP).** Medium friction. Control of multiple DIDs is proven in zero knowledge without revealing key material. Profile in EXT-T2 (PREVIEW).
- **Tier 3 - Multi-party ceremony.** High friction. Multiple keyholders co-sign via a threshold protocol. Profile in EXT-T3 (PREVIEW). Evaluators encountering a tier with no implemented verification profile MUST record `trustTierUnsupported` and MUST NOT downgrade.

See Base Section 6.4.2 for normative tier definitions, Section 6.4.5 for `requiredTrustTier` enforcement, and Section 6.4.6 for bilateral exchange semantics.

## Format independence (summary)

v0.4 separates *what a manifest means* from *how it is written down*.

- **Abstract data model.** A manifest is a set of abstract properties and semantics (the envelope members, facets, claims, consents, pointers, devices, the signature, and the receipt). Conformance is defined against this model.
- **Production rules.** A production rule writes the abstract model into, and reads it back from, a concrete wire format. JSON-LD is the **reference encoding** that conforming implementations are expected to interoperate with by default; **CBOR-LD** is a second encoding defined in EXT-OPT. The same manifest MAY be produced in any conformant encoding without changing its meaning.
- **Canonical signing.** The signature is computed over the canonical signing bytes defined by the production rule, so a manifest verifies independently of the encoding it traveled in.

See Base Section 1.7 and Section 4.5; EXT-OPT Section O1.

## Security considerations (selected)

v0.4 carries forward all v0.2 and v0.3 security guidance and adds:

- **Context integrity** is normative (Base Section 6.10): evaluators MUST pin the content-hashed v0.4 context document and verify its hash before trusting term definitions, rather than dereferencing an arbitrary remote context at evaluation time.
- **Holder binding is required for Tier 1+** (Base Section 6.6, EXT-T1): a claim relied upon at Tier 1 or above without a verified holder binding MUST be capped at Tier 0. Liveness attestation proves presence only at `attestedAt`; evaluators MUST NOT treat a stale liveness attestation as current human presence.
- **Replay resistance** (EXT-T1): an interactive presentation MUST carry a `presentationProof` binding the manifest to the verifier's `challenge` and `audience`.
- **JWE algorithm constraints** (Base Section 2.4): encrypted facets MUST support the baseline algorithm pair; the evaluation contract governs which algorithms an evaluator accepts.
- **Bilateral correlation tokens** (EXT-OPT Section O4): `sessionId` and `exchangeId` MUST each be generated with at least 128 bits of entropy and MUST NOT encode party identifiers.
- **`requiredTrustTier` enforcement** remains normative and raise-only - claim and facet floors MUST NOT lower the manifest-level floor.

## Privacy considerations (selected)

- **Selective disclosure is dual-track** (Base Section 7): issuer-controlled selective disclosure (which facets and claims are included) plus encryption-controlled readability (which parties can decrypt). The BBS+ holder-binding mode (EXT-T1, EXT-T2) additionally supports unlinkable presentations.
- **Holder-controlled disclosure** is a first-class behavior: evaluators cannot infer what was withheld, and a not-projected facet is never treated as evidence of absence.

## Status

v0.4 is the **Format Independence and Edge Interoperability** iteration. The Base is the production-candidate core, on track to harden toward v1.0; several advanced tiers and optional features are marked **PREVIEW** and are revisable before the schema locks. The latest stable published version remains v0.3 at `/spec/v0.3/`.

Future changes are managed through the RFC mechanism and breaking-change policy in the project governance docs.
