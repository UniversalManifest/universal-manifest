# Universal Manifest Spec (v0.4)

Copyright (c) 2026 the Universal Manifest contributors. All rights reserved.
This Editor's Draft is under review by the OMA3 Technical Working Group. Formal governance, IPR, patent, and license terms are pending and will be established with OMA3.

> Universal Manifest is an open specification for portable state manifests. A manifest is not static metadata: v0.4 pairs the manifest with runtime governance — a six-stage evaluation that checks signature, freshness, projection, and consent (and, composing the Base machinery, whether the policy and authorization state a governed or agentic action relies on is still current) and emits a structured receipt as evidence of what was actually verified. It is not tied to any particular programming language, framework, runtime, or wire format. v0.4 makes that last independence explicit: the manifest is defined as an abstract data model, and a manifest is written to bytes through a production rule. JSON-LD is the reference encoding; CBOR-LD is a second encoding defined to demonstrate format independence. The TypeScript helper in this repository is one reference implementation; you can build a conformant implementation in any language using the published spec artifacts and conformance fixtures.

v0.4 is the **Format Independence and Edge Interoperability** iteration of the Universal Manifest specification. The normative source of truth is the v0.4 document set rendered at `https://universalmanifest.net/spec/v0.4/` (Base + four extension profiles + Primer + Cookbook). In this repository, the editable source for that rendered document set is the markdown-canonical stack at `internal editorial record`. This directory holds the structured artifacts implementers consume directly: the JSON Schema, the JSON-LD context, and the conformance summary.

The v0.4 document set is organized as a **conformance-tier stack**. The question that decides what you read and build is "what level of assurance am I certifying to?" A breadth-first Primer orients you; the Base specifies everything required for a Tier-0 / Tier-1 evaluator and holder; four companion profiles add depth by tier or by optional feature; and the Cookbook collects worked examples.

## The v0.4 document set

| Document | Role | Status |
|----------|------|--------|
| Primer | Breadth-first overview: what UM is, the shape of a manifest, the lifecycle, the core guarantees, a one-glance map of tiers and extensions. No normative requirements. | Informative |
| Base (Tier-0 / Tier-1 Core) | Everything required to build a conformant Tier-0 / Tier-1 evaluator and holder. Names advanced and optional features and points to the extensions for their mechanics. | Production-candidate (some members PREVIEW) |
| EXT-T1 (Tier-1 Binding Profile) | Tier-1 binding mechanics: holder binding, presentation proof, liveness attestation, the Stage-2 sub-steps, the end-to-end claim-proof path, v0.3 backwards compatibility. | Normative (Sections T1.3.1–T1.3.3 PREVIEW) |
| EXT-T2 (Tier-2 Cryptographic-Binding Profile) | Tier-2 ZKP proof profiles, the BBS+ unlinkable-disclosure track, the post-quantum migration path. | PREVIEW |
| EXT-T3 (Tier-3 Ceremony Profile) | Tier-3 multi-party ceremony: model, signer-role taxonomy, threshold-protocol guidance. | PREVIEW |
| EXT-OPT (Optional-Feature Profiles) | Tier-orthogonal optional features: the abstract data model and its CBOR-LD encoding, the statusRef resolution protocol, receipts-as-a-class with hash-chaining, the bilateral session model, federation, profile registration, the agent-delegation scope registry, trustWeight and category trust, extended schemas, the cryptographic-requirements summary, and the design-stage candidate profiles (current policy-state resolution, represented-person consent, referral-route attribution, GeoPose primary pose values). | Mixed (PREVIEW per part) |
| Cookbook | Worked examples, organized by scenario and tagged by tier. | Informative |

## What v0.4 adds over v0.3

- **Abstract data model and production rules (Format Independence).** v0.4 defines the manifest as an abstract data model independent of serialization, plus production rules that write it to a concrete wire format. JSON-LD is the **reference encoding** and the default for interoperation; **CBOR-LD** is a second encoding defined in EXT-OPT to demonstrate format independence. Conformance is defined against the abstract data model, not against any single serialization. See Base Section 1.7 and Section 4.5; EXT-OPT Section O1.
- **Versioned context document with context integrity.** Term definitions for v0.4 are fixed by the versioned context document identified by `https://universalmanifest.net/ns/v0.4` (which, upon publication, will also be served there; until then the normative copy is `schema.jsonld` in this directory); its normative body is `schema.jsonld` in this directory, reproduced verbatim with its content hash in Base Appendix B. Evaluators MUST pin the content-hashed context and verify its multihash (the expected value is under Namespace URIs below and in Base Appendix B) before trusting term definitions, rather than fetching an arbitrary remote context at evaluation time. The `um:` term prefix is version-independent and expands to `https://universalmanifest.net/ns/um#`. See Base Section 6.10 and Appendix B.
- **Bounded selective minimum disclosure.** v0.4 names the core privacy behavior in plain language: each viewer, verifier, system, or use case receives only the minimum information it is allowed or needs to see. The bounded v0.4 profile is implemented through Stage 3 Project, Stage 4 Consent, sealed-entry handling, and structured receipts. It does not by itself claim full unlinkability, cover-slot indistinguishability, resolver-operator privacy, or complete resistance to residual fingerprinting. See Base Sections 3.1.3, 3.1.4, 3.3, and 7.1.
- **Tier-1 binding made concrete.** Any claim relied upon at Tier 1 or above now requires a verified **holder binding** proving the presenting subject is the credentialed holder, in three modes (`sd-jwt-kb`, `bbs-holder-commitment`, `reciprocal-control`). **Presentation proof** (`presentationProof`) provides proof-of-possession that binds a manifest to a specific verifier and moment, preventing replay. **Liveness attestation** (`livenessAttestation`) proves human presence at its `attestedAt` time but not at verification time. See Base Section 6.6 and EXT-T1.
- **Per-facet liveness and assurance floors.** A facet can require a validated `requiredLiveness` floor (`minFreshness` plus optional `userVerified`) and, for locked-tier portable-unlock profiles, a `requiredAssuranceClass` floor (`software` < `hardware-uv` < `hardware-bound`). These floors compose with `requiredTrustTier`, can only raise the bar, and fail closed with receipt evidence such as `assuranceInsufficient` / `assuranceStatus`. PREVIEW. See Base Sections 2.1, 3.3.1, and EXT-T1 Section T1.3.
- **Tier-2 cryptographic binding profile.** The Tier-2 ZKP proof object, named but deferred in v0.3, is specified here: two proof profiles (`ZkLinkedSecretProof`, `ZkHdDerivationProof`) for proving control of multiple DIDs in zero knowledge, plus the BBS+ unlinkable-disclosure track and a post-quantum migration path. PREVIEW. See EXT-T2 and Base Section 6.4.7.
- **Tier-3 multi-party ceremony.** Tier 3, reserved in v0.3, gains a concrete `ceremonyProof` (`ThresholdAttestationProof`) carrying a `threshold`, `attesters`, `ceremonyId`, and an `aggregateProof` for co-signed, highest-stakes deployments. PREVIEW. See EXT-T3 and Base Section 6.4.8.
- **Receipt-disposition vocabulary (extended).** The structured receipt carries richer disposition fields: `keyRefResolution`, per-consent `consentStatuses`, per-claim `claimStatuses` (with `claimRef`, status, and optional `tier`), `unprocessedEntries`, the credential-binding status fields (`holderBindingStatus`, `presentationProofStatus`, `livenessStatus`, `crossDidBindingStatus`), and `effectiveTrustTier`. The `facetStatuses` status set adds `assuranceInsufficient` and `written` (both PREVIEW-driven) to v0.3's values. See Base Section 3.3.
- **Private-data handling and locked-facet auditability.** v0.4 adds per-facet cryptographic isolation obligations for deployments that claim isolation, write authorization via target-facet write-consent, private-data derived-write sensitivity ordering, key-lifecycle receipt events (`facet-key-rotated`, `facet-key-shredded`), and unlock-window audit fields for time-boxed access. PREVIEW where marked in the source profiles. See Base Sections 2.3.5, 3.1.4, 7.2 and EXT-OPT Sections O3 and O4.5.
- **statusRef resolution schema.** v0.4 defines the revocation-status resolution protocol and its response schema (`manifestId`, `status` in `active` / `revoked` / `suspended`, `updatedAt`, optional `reason` / `cursor` / `nextCheck`) and the status-endpoint conformance criteria. See Base Section 3.4 and EXT-OPT Section O2.
- **Bilateral session model and manifest forwarding.** The Base carries the bilateral field surface (`exchangeId` and `evaluatorId` on receipts) and the bilateral-exchange security model. EXT-OPT specifies the full session object (`um:BilateralSession` with `sessionId`, `exchangeId`, two `participants`, `initiatedAt`, `expiresAt`, and strictly-forward lifecycle `state`), paired-receipt correlation, receipt hash-chaining (`seq` / `prevHash`), federation, and manifest forwarding across resolver operators. See Base Section 3.5 and Section 6.4.6; EXT-OPT Sections O3 and O4.
- **JWE algorithm constraints.** Encrypted facets gain a normative MUST-implement baseline algorithm pair and an evaluation contract for algorithm negotiation. See Base Section 2.4.
- **Optional structural extensions.** EXT-OPT adds the agent-delegation scope registry, category trust and `trustWeight`, an `actorState` member, a two-component `devices` schema, and a derived-variant sensor-consent vocabulary, each independently optional. See EXT-OPT Sections O6 through O9.
- **Design-stage candidate profiles (PREVIEW, not yet on the wire).** Four candidate registered profiles are drafted in EXT-OPT: **current policy-state resolution** (supersession pointers, policy windows with deny/escalate dispositions, and `um:reason:policy:*` codes — is a consent/authorization record still current before a governed or agentic action proceeds?), **asset-bound represented-person consent** (the consent state of the person depicted, scanned, performed, or replicated *inside* a portable asset, as distinct from asset/token ownership, with carrier binding and currency resolution), **signed referral-route attribution** (verifiable route provenance, route-scoped disclosure via consent conditions, and minimal attribution receipts — with ad-network, marketplace, payment-rail, and buyer-data-sharing behavior explicitly out of UM scope), and **GeoPose primary pose values** (an OGC GeoPose payload or pointer as the primary position-plus-orientation value for an asset, object, dataset record, or scene element, with UM governing signature, provenance, consent/current-state policy, projection, and receipts around that value). These are design drafts: their members are not in the published schema/context or fixture suite and carry no conformance tests until finalized. See EXT-OPT Sections O2.6, O12, O13, and O14.

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
- The versioned context URI identifies an immutable document. Its normative body is `schema.jsonld` in this directory; the verbatim body and its content hash are reproduced in Base Appendix B. Evaluators verify the sha2-256 multihash `zQmY71ixd6ez6UkXpzGJ7fiMpwL26jzQwWp9CV6kwX4Kb4f` over the exact document bytes rather than trusting any retrieval channel (Base Section 6.10; computation rule in EXT-OPT Section O1.7).
- The `um:` term prefix is version-independent and expands to the base IRI `https://universalmanifest.net/ns/um#`.
- Hosted-artifact URLs (reserved; upon publication each will be served byte-identical to its copy in this directory — until then, use the in-repo copies as the normative source):
  - `https://universalmanifest.net/ns/universal-manifest/v0.4/schema.jsonld` — the published artifact copy of the versioned context document (`schema.jsonld` in this directory)
  - `https://universalmanifest.net/ns/universal-manifest/v0.4/schema.json` (`schema.json` in this directory)
  - `https://universalmanifest.net/spec/v0.4/` (rendered from the document set in this repository)

**Live-URL state (v0.4 is pre-publication).** The `https://universalmanifest.net/...` URLs above are the namespace and publication endpoints v0.4 reserves; while v0.4 is a production-candidate that has not yet been published, some of them are not yet serving their final v0.4 artifacts. Until publication, the **normative source for every artifact is its in-repo copy** — the context document at `spec/v0.4/schema.jsonld`, the schema at `spec/v0.4/schema.json`, the rendered document set under `docs/spec-v0.4/`, and the conformance suite under `conformance/v0.4/`. Context integrity does not depend on any of these URLs resolving: an evaluator pins the content-hashed context and verifies the multihash `zQmY71ixd6ez6UkXpzGJ7fiMpwL26jzQwWp9CV6kwX4Kb4f` over the exact bytes, never trusting a retrieval channel (Base Section 6.10). Do not treat a URL above resolving (or not) as evidence about an artifact's validity; verify the hash.

## Six-stage evaluation sequence (summary)

Every conformant evaluator MUST execute these stages in order for every v0.4 manifest it processes. Each stage produces a defined output that feeds the next, and the evaluator MAY stop early at any stage by emitting a rejection.

1. **Arrive** - parse the manifest from a conformant encoding; confirm required envelope members and that `@type` includes `um:Manifest`; preserve (but do not act on) unknown members so they survive signature verification.
2. **Verify** - verify the signature over the canonical signing bytes; enforce freshness (TTL and 60s clock-skew); when a claim leans on stronger identity binding, run the Stage-2 binding sub-steps (EXT-T1); optionally resolve revocation status.
3. **Project** - apply bounded selective minimum disclosure: extract only the facets, claims, pointers, and devices the viewer, verifier, system, or use case is allowed or needs to see. A facet that is absent is *not projected*, not evidence of absence.
4. **Consent** - match `consents[].facetRef` against each projected facet's `@id`; check scope, purpose, and validity window. Sealed (encrypted) facets are acknowledged as present, never guessed at.
5. **Compose** - produce one of four outcomes: `accepted`, `accepted-with-warnings`, `accepted-partial`, or `rejected`. The result MUST be machine-readable and MUST include per-facet status.
6. **Receipt** - emit a structured receipt that honestly records what the evaluator did, including the gap between what a manifest declared it needed and what could be verified. Receipts MAY be signed (Signature Profile A) and MAY themselves be chainable manifests (EXT-OPT).

See Base Section 3.1 for normative details and `packages/universal-manifest/` for the reference six-stage evaluator implementation.

## Tiered trust model (summary)

Four tiers, strictly additive. A claim verified at a higher tier automatically satisfies every lower tier. Relying parties choose their tier from their own threat model; the specification mandates no minimum.

- **Tier 0 - Signature-only.** Zero friction. Claims are self-asserted; the only cryptographic check is the manifest signature. MUST NOT be used as sufficient assurance for Sybil-critical decisions.
- **Tier 1 - Attested / proof-backed.** Low friction. Claims carry external proof of issuance plus a verified holder binding proving the presenter is the credentialed holder. Evaluators MUST enforce attester trust policy and freshness on proof material. Mechanics in EXT-T1.
- **Tier 2 - Cryptographic binding (ZKP).** Medium friction. Control of multiple DIDs is proven in zero knowledge without revealing key material. Profile in EXT-T2 (PREVIEW).
- **Tier 3 - Multi-party ceremony.** High friction. Multiple attesters co-sign via a threshold protocol. Profile in EXT-T3 (PREVIEW). Evaluators encountering a tier with no implemented verification profile MUST record `trustTierUnsupported` and MUST NOT downgrade.

See Base Section 6.4.2 for normative tier definitions, Section 6.4.5 for `requiredTrustTier` enforcement, and Section 6.4.6 for bilateral exchange semantics.

## Format independence (summary)

v0.4 separates *what a manifest means* from *how it is written down*.

- **Abstract data model.** A manifest is a set of abstract properties and semantics (the envelope members, facets, claims, consents, pointers, devices, the signature, and the receipt). Conformance is defined against this model.
- **Production rules.** A production rule writes the abstract model into, and reads it back from, a concrete wire format. JSON-LD is the **reference encoding** that conforming implementations are expected to interoperate with by default; **CBOR-LD** is a second encoding defined in EXT-OPT. The same manifest MAY be produced in any conformant encoding without changing its meaning.
- **Canonical signing.** The signature is computed over the canonical signing bytes defined by the production rule, so a manifest verifies independently of the encoding it traveled in.

See Base Section 1.7 and Section 4.5; EXT-OPT Section O1.

## Security considerations (selected)

v0.4 carries forward all v0.2 and v0.3 security guidance and adds:

- **Context integrity** is normative (Base Section 6.10): evaluators MUST pin the content-hashed v0.4 context document and verify its hash before trusting term definitions, rather than dereferencing an arbitrary remote context at evaluation time. The expected multihash and the verbatim context body are reproduced in Base Appendix B (and under Namespace URIs above).
- **Holder binding is required for Tier 1+** (Base Section 6.6, EXT-T1): a claim relied upon at Tier 1 or above without a verified holder binding MUST be capped at Tier 0. Liveness attestation proves presence only at `attestedAt`; evaluators MUST NOT treat a stale liveness attestation as current human presence.
- **Replay resistance** (EXT-T1): an interactive presentation MUST carry a `presentationProof` binding the manifest to the verifier's `challenge` and `audience`.
- **JWE algorithm constraints** (Base Section 2.4): encrypted facets MUST support the baseline algorithm pair; the evaluation contract governs which algorithms an evaluator accepts.
- **Bilateral correlation tokens** (EXT-OPT Section O4): `sessionId` and `exchangeId` MUST each be generated with at least 128 bits of entropy and MUST NOT encode party identifiers.
- **`requiredTrustTier` enforcement** remains normative and raise-only - claim and facet floors MUST NOT lower the manifest-level floor.

## Privacy considerations (selected)

- **Selective minimum disclosure is a bounded Base behavior** (Base Sections 3.1.3 and 7.1): each viewer, verifier, system, or use case receives only the minimum information it is allowed or needs to see. This is holder-controlled projection plus consent gating, sealed-entry handling, and receipt evidence.
- **Do not overclaim unlinkability.** The bounded v0.4 profile does not by itself prove verifier-verifier unlinkability, issuer-verifier unlinkability, cover-slot indistinguishability, resolver-operator privacy, or absence of residual fingerprinting. The BBS+ holder-binding mode (EXT-T1, EXT-T2) and the Tier-2 Track B path are the higher-privacy route.
- **Holder-controlled disclosure** is a first-class behavior: evaluators cannot infer what was withheld, and a not-projected facet is never treated as evidence of absence.

## Complementary standards and scope boundaries

UM is an envelope, evaluation, and receipt layer that composes with neighboring standards. It does not replace them, and several capability families are deliberately deferred rather than silently missing.

**Carrier and provenance standards (C2PA, COG, and similar).** A manifest can carry — or point to — an external-standard artifact unmodified, while UM supplies the governance record around it: signature, consent and current-state policy, projection, and receipt evidence. The carried artifact remains independently verifiable under its own standard: a receiver performs two independent checks (the UM envelope evaluation, and the carried standard's own verification), and passing one never substitutes for the other. UM defines no C2PA/COG trust-list, certificate-chain, asset-binding, or media-provenance verification semantics. See EXT-OPT Section O1.6 and use-case document UC-20 (`docs/oma3-use-case-document.md`). The same posture holds for **OGC GeoPose** (O14 PREVIEW carries or points to GeoPose payloads; validating GeoPose data and reference frames remains OGC's job) and for **W3C VC/DID material** (carried and verified as claims/claimProof; UM issues nothing and mandates no DID method).

**Explicitly deferred (FORWARD) — classified, not silent.** The authoritative row-level classification of every requirement not fully met by v0.4 lives in the use-case document, Sections 5.2 and 7 (`docs/oma3-use-case-document.md`): each row is PARTIAL, v0.4 PREVIEW, or FORWARD with a named candidate path. The headline FORWARD items:

- **C2PA-carry / external-standard-wrapper profile** — a dedicated carried-standard verification-result receipt field and an unknown-carried-standard disposition value (the wrapper *architecture* itself is v0.4 PREVIEW, Section O1).
- **Holder-generated ZK predicates and range proofs** — v0.4 supports issuer-asserted threshold claims (e.g. `ageOver`) and Tier-2 privacy hooks; holder-side predicate synthesis is a future registered profile, and an issuer-signed boolean is not equivalent to a holder-generated proof.
- **Proof-of-personhood uniqueness** — v0.4 carries provider attestations at Tier 1 with namespace separation and freshness; a one-person-one-account primitive (nullifier-style per-context uniqueness) is a future profile. The Tier-2 profiles prove cross-DID *control*, not uniqueness.
- **Dedicated storage-policy vocabulary** — v0.4 composes consent `scope`/`conditions`/purpose-binding, encrypted facets, sealed entries, and pointer-first storage; a declarative `storagePolicy` object, retention-duration tiers, and a storage-conflict reason code are future registered-profile work, and unenforceable storage requests fail closed today.
- **WASM content trust and inter-service authorization** — spatial/RP1-driven registered-profile candidates (publisher/module-hash trust chains; service-to-service message authorization), not Base additions.
- **Compact CBOR-LD/COSE handshake profile** — the CBOR-LD encoding is PREVIEW now; the finalized compact profile (token registry, packet-size/latency budgets, fail-closed timeout disposition, carried-status-only freshness) is future. UM here is compliance-enabling and audit-friendly; it certifies no aviation, traffic, facility, medical, or industrial-control system.
- **Cross-encoding signature portability** — v0.4 signs per production (re-encoding requires re-signing); one abstract-model signature verifying across encodings is an open working-group decision.
- **Gig/creator profile family** — engagement-agreement objects, a no-custodial-intermediary invariant, dispute/non-delivery dispositions, and non-custodial settlement conventions are future profiles; payment rails, custody, pricing, fees, and escrow execution are out of UM scope but compose with UM-carried context and receipts.
- **Child-protection profile family** — age-band assurance context, guardian delegation, policy-snapshot-bound revocable consent, and privacy-preserving minor status are described as *capabilities*; normative promotion is gated on a legal/children's-rights review, and UM certifies no COPPA/GDPR/Children's-Code/eSafety compliance.
- **W3C Data Integrity / alternate signature suites** — future additive profiles beside Signature Profile A, never a silent replacement.

**Domain integration guidance (non-normative).** RP1/spatial-fabric, smart-glasses/bystander consent, healthcare handoff, education/competence credentials, social/profile projection, agent ecosystems (ERC-8004, MCP, A2A, OASF), OMATrust proof alignment, and public discovery/publication policy are supported today by composing Base + EXT mechanics; they are documented as integration guidance (`integrations/`), not Base normative scope. Domain-specific profiles may be registered later through EXT-OPT Section O6.

**Not UM scope (composes, never owned).** Ad-network/marketplace operation, payment rails, custody, escrow execution, buyer-data sharing; C2PA/COG verification semantics; GeoPose validation; VC issuance and DID-method governance; authentication and federation protocols (OIDC, ActivityPub/AT); legal or regulatory compliance certification; and device/TLS/network side-channel control.

## Status

v0.4 is the **Format Independence and Edge Interoperability** iteration. The Base is the production-candidate core, on track to harden toward v1.0; several advanced tiers and optional features are marked **PREVIEW** and are revisable before the schema locks. The latest stable published version remains v0.3 at `/spec/v0.3/`.

Selective minimum disclosure is in v0.4 as a bounded Base profile: holder-controlled projection, consent gating, sealed-entry handling, and receipt evidence. The deeper high-privacy per-target work remains a separate implementation chain: v0.4 does not claim full unlinkability, cover-slot indistinguishability, resolver-operator privacy, or complete high-privacy conformance unless a later profile explicitly does so.

Future changes are managed through the RFC mechanism and breaking-change policy in the project governance docs.
