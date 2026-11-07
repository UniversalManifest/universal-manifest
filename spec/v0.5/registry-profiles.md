<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SumSet Tech LLC -->

> **v0.5.0 release candidate 1.** Published as tag `v0.5.0-rc.1` of `UniversalManifest/universal-manifest`. Wire version `0.5`; namespace `https://universalmanifest.net/ns/v0.5`; reading routes `/spec/v0.5/`. A release candidate is not the final v0.5.0 release, and it is not a completed implementation or conformance qualification. Feature-specific PREVIEW and conditional requirements remain in force.

> This is the **draft standalone profile registry** required by [EXT-OPT §O6](ext-opt.md#o6-profile-registration-mechanism). It prepares the list of Universal Manifest profiles and subsidiary value registries that share §O6's registration process. Its draft tables do not independently establish registration. Once published under §O6, this registry is **versioned independently of the specification** and is updated between specification releases.
>
> **Status:** This document is <span class="preview-tag">PREVIEW</span> — it is the first issue of the registry and is under maintainer review. Entries marked `provisional` are not yet registered and confer no conformance standing.

> **Editor's note (remove before first publication).** Two questions must be answered by the maintainers before this document can be published as normative, and both are marked inline where they bite:
>
> 1. **The post-quantum suite's registration remains pending.** “Signature Profile B” means JCS + ES256 in [EXT-OPT §O15](ext-opt.md#o15-signature-profile-b-jcs--es256); [EXT-T2 §T2.3.2](ext-t2.md#t23-post-quantum-signatures) uses the descriptive name **JCS + ML-DSA-65**. The proposed post-quantum identifier and verification/carrier parameters still require §O6 review and conformance integration. No additional profile letter is adopted by this draft.
> 2. **§O6's status vocabulary has three values** (`active`, `deprecated`, `sunset`) and §O6 step 1 requires at least one conformance fixture before registration. Most profiles named across the document set are design-stage and have no fixture, so under a literal reading they cannot appear here at all. This draft adds a fourth status, **`provisional`**, for entries that are named in the specification set but not yet registrable. Adding it is new normative text and requires maintainer adoption.

# Universal Manifest Profile Registry <span class="preview-tag">PREVIEW</span>

**Companion to:** [Base specification](core.md).
**Governed by:** [EXT-OPT §O6](ext-opt.md#o6-profile-registration-mechanism).
**Registry categories:** `signature`, `trust`, `domain`, `binding`.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 \[[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)\] \[[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)\] when, and only when, they appear in ALL CAPITALS, as shown here.

## R1. Scope

This document prepares the registry that [EXT-OPT §O6](ext-opt.md#o6-profile-registration-mechanism) requires. §O6 defines the registration *mechanism*; this document holds the draft *contents*. Explicit recognition in the Base or a normative extension remains the authority for existing profiles. A draft entry does not activate an additional registration.

This registry is published independently of the specification version. A profile is registered, deprecated, or sunset by editing this document through the process in [R4](#r4-registration-procedure); no specification release is required and none is implied. Where the published `schema.json` enumerates values that correspond to entries here — today, the `algorithm` enumeration of the `signature` category — that enumeration is the **wire projection** of this registry, and this registry is the governing record.

An implementation MUST NOT infer that an identifier is registered because it appears in a specification draft, a design note, or a conformance fixture. Registration is constituted by an entry in this document with status `active`.

## R2. Identifier Grammar and Categories

Every registered profile has a canonical identifier of the form:

```
um:profile:<category>:<name>
```

`<category>` MUST be exactly one of the four values below. `<name>` is a lowercase token using hyphens as word separators.

- **`signature`** — signature suites. A suite's identity is the (`algorithm`, `canonicalization`) pair; the identifier in this category names that pair.
- **`trust`** — trust, binding, and assurance profiles.
- **`domain`** — domain-specific manifest class profiles.
- **`binding`** — credential binding profiles.

Identifiers are globally unique. An identifier MUST NOT be reused after deprecation, and MUST NOT be reassigned to different semantics.

Profile identifiers are `@id`-coerced in the published JSON-LD context, so a registered identifier expands as a compact IRI under the version-independent `um:` prefix and is a globally unique IRI rather than a bare label. Receipt reason codes and consent condition values, which also route through this registry's process ([R6](#r6-subsidiary-value-registries)), are **not** `@id`-coerced: they are inert literal strings compared as opaque tokens. Registrants MUST NOT assume the two behave alike.

## R3. Entry Fields and Status Vocabulary

Each entry carries the six fields §O6 requires: **identifier**, **name**, **version**, **status**, **specification URI**, and **registration date**.

Status values:

- **`active`** — registered. The profile has completed [R4](#r4-registration-procedure), including at least one conformance fixture integrated into the suite. Only an `active` profile is registered for conformance purposes.
- **`provisional`** — named in the specification document set, but not registered. It has not completed R4 and MAY lack a conformance fixture. A `provisional` entry confers **no** conformance standing, and an evaluator MUST NOT treat a `provisional` identifier as recognized. This status exists so that identifiers already visible in the specification set are reserved against collision and are publicly accounted for. *(PENDING maintainer adoption — see the editor's note above; §O6 as written defines only the three statuses below.)*
- **`deprecated`** — registered, superseded or withdrawn, and carrying a date and a superseding-profile reference where one exists. Evaluators SHOULD warn on a reference to a deprecated profile but MUST NOT reject a manifest solely for referencing one.
- **`sunset`** — withdrawn at a major-version boundary. Evaluators MAY reject.

Where a specification URI is given as a section reference rather than a stable published URL, the entry is by definition not yet independently citable; such entries are `provisional`.

## R4. Registration Procedure

In this document, **the maintainers** means the maintainers of the canonical `UniversalManifest/universal-manifest` repository, acting through its public process.

Registration follows the five steps of [EXT-OPT §O6](ext-opt.md#o6-profile-registration-mechanism), restated here as the operative procedure:

1. **Proposal.** The author submits a specification to the maintainers via the UM-RFC mechanism, including a scope statement, normative requirements using RFC 2119 keywords, security considerations, an interoperability assessment, and **at least one conformance test fixture**.
2. **Review.** The maintainers review for completeness, security, and interoperability, and MUST verify that the proposed profile does not conflict with an existing profile at the same extension point.
3. **Conformance integration.** The author supplies the fixtures; the maintainers integrate them into the conformance suite.
4. **Registration.** On the maintainers' public acceptance, the profile receives its canonical identifier and its entry is added to this document with status `active`.
5. **Maintenance.** The author maintains the specification and its tests. The maintainers MAY deprecate a profile if maintenance lapses, a security issue arises, or a superseding profile is registered.

**Conflict resolution.** Two profiles defining incompatible semantics at the same extension point MUST NOT both be registered without resolution. The maintainers MUST resolve by merging them, selecting one, or defining an explicit compatibility boundary.

**Registration policy.** §O6 does not name a registration policy in the IANA sense, and this document does not invent one. Registration today requires the maintainers' public acceptance at step 4. Whether a lighter-weight path with designated expert review should exist for low-risk profiles is an open question recorded in §O6 and is **not** settled by this document.

## R5. The Registry

### R5.1 Category: `signature`

**`um:profile:signature:jcs-ed25519`**
- Name: Signature Profile A
- Version: 1.0
- Status: `active`
- Specification: Base §1.6 (Signature Profile A — JCS + Ed25519)
- Registered: 2026-08-08 (in use since v0.2)
- Notes: The mandatory-to-implement baseline. Every evaluator MUST support this profile. For wire `0.5`, the candidate applies all six predicates of [Base §1.6.1.1](core.md#ed25519-acceptance-boundary): canonical non-identity prime-order A/R, canonical S and the full-challenge uncofactored equation over exact signing bytes. Earlier specification versions retain their own acceptance rules. This is a version-bound constraint on the existing pair, not an additional suite registration; current-source/runtime and adversarial qualification remain required.

**`um:profile:signature:jcs-es256`**
- Name: Signature Profile B
- Version: 1.0
- Status: `active`
- Specification: EXT-OPT §O15 (Signature Profile B — JCS + ES256)
- Registered: 2026-08-08 (recognized in v0.4)
- Notes: ECDSA over NIST P-256 with SHA-256. Canonicalization and signing input are identical to Profile A. `signature.value` is the base64url of the raw 64-byte `R || S`; DER is rejected. The profile imposes **no** low-S rule and **no** RFC 6979 requirement, because hardware signers expose no nonce control. Optional-additive for evaluators. This profile exists so that hardware key custody — Secure Enclave, StrongBox, TPM — is reachable, since those chips hold P-256 keys only.

**`um:profile:signature:jcs-ml-dsa-65`**
- Name: JCS + ML-DSA-65 *(proposed registration; see editor's note)*
- Version: 0.1
- Status: `provisional`
- Specification: EXT-T2 §T2.3.2 (post-quantum signatures)
- Registered: not registered
- Notes: ML-DSA-65 with `JCS-RFC8785` canonicalization, carried in `postQuantumSignature` rather than `signature`. PREVIEW. The identifier is reserved here against collision; the profile has no conformance fixture and is not registrable until it does.

### R5.2 Category: `trust`

**`um:profile:trust:locked-tier-portable-unlock`** — Version 0.1 — Status `provisional` — Specification: EXT-T1 §T1.3.3 — Not registered.

**`um:profile:trust:zkp-bbs-linked-secret`** — Version 0.1 — Status `provisional` — Specification: EXT-T2 §T2.1 — Not registered.

**`um:profile:trust:tier2-privacy-preserving-binding`** — Version 0.1 — Status `provisional` — Specification: EXT-T2 — Not registered.

**`um:profile:trust:current-policy-state`** — Version 0.1 — Status `provisional` — Specification: EXT-OPT §O2.6 — Not registered.

### R5.3 Category: `domain`

**`um:profile:domain:receipt`** — Version 0.1 — Status `provisional` — Specification: EXT-OPT §O3 — Not registered.

**`um:profile:domain:represented-person-consent`** — Version 0.1 — Status `provisional` — Not registered.

**`um:profile:domain:referral-route-attribution`** — Version 0.1 — Status `provisional` — Specification: EXT-OPT §O13 — Not registered.

**`um:profile:domain:geopose-primary-pose`** — Version 0.1 — Status `provisional` — Not registered.

**`um:profile:domain:personal-data-vault`** — Version 0.1 — Status `provisional` — Not registered.
- Notes: **This identifier already appears on the wire but is defined in no specification section.** It is recorded here to make that gap visible and to reserve the identifier. It MUST NOT be treated as recognized until a defining section exists and it completes [R4](#r4-registration-procedure).

### R5.4 Category: `binding`

**`um:profile:binding:sd-jwt-kb`** — Version 0.1 — Status `provisional` — Specification: EXT-T1 §T1.1 — Not registered.

**`um:profile:binding:apple-devicecheck-token`** — Version 0.1 — Status `provisional` — Not registered.

**`um:profile:binding:webauthn-uv-platform`** — Version 0.1 — Status `provisional` — Not registered.

## R6. Subsidiary Value Registries

§O6 governs five subsidiary value registries in addition to the profile categories above. They share this document's registration process but are enumerated in their defining sections rather than restated here, because their contents change with the specification's wire format rather than independently of it.

- **Receipt event classes** — EXT-OPT §O3.2.
- **Receipt reason codes** — EXT-OPT §O3.3. Values are opaque literal strings, not IRIs.
- **Agent-delegation scope values** — EXT-OPT §O7.
- **Liveness `proofType` values** — EXT-T1 §T1.3 defines validation mechanics for the recommended `webauthn-uv` method. This draft is not evidence of a completed registration. A successfully validated proof may satisfy the specified liveness floor; the method name or a registry entry alone cannot validate a proof or establish hardware provenance.
- **Additional JWE algorithm pairs** — Base §2.4.

A value appearing in a design-stage draft is **not** registered. Appearance of a candidate token in a draft confers no context registration and no conformance standing.

## R7. Maintenance

On publication under [R4](#r4-registration-procedure), this document becomes the registry of record. Maintainer changes then take effect on publication, independently of any specification release. The current draft has not performed that publication act.

Each change MUST preserve the append-only property of identifiers: entries may change status and version, but an identifier once published here is never reused for different semantics, and never removed.
