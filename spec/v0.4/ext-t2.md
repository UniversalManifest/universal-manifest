---
lang: en
title: Universal Manifest v0.4 — EXT-T2: Tier-2 Cryptographic-Binding Profile
---

> This is a **companion profile** to the [Universal Manifest v0.4 Base specification](core.md). It specifies the **Tier-2** cryptographic cross-DID binding profiles, the unlinkable (BBS+) selective-disclosure track that shares the same cryptography, and the post-quantum signature migration path. Read the [Base](core.md) and [EXT-T1](ext-t1.md) first.
>
> **Status:** All content in this profile is <span class="preview-tag">PREVIEW</span> — under active working-group review, built on the editors' recommended defaults, and fully revisable before the v0.4 schema is locked.

# EXT-T2: Tier-2 Cryptographic-Binding Profile <span class="preview-tag">PREVIEW</span>

**Companion to:** [Base specification](core.md), building on [EXT-T1](ext-t1.md).
**Registry categories:** `trust`, `signature`.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 \[[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)\] \[[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)\] when, and only when, they appear in ALL CAPITALS, as shown here.

## T2.0. Scope and Relationship to the Base

The Base defines **Tier 2 — Cryptographic binding** ([Base §6.4.2](core.md#tiered-trust-model)) as the assurance level at which cross-DID control is *cryptographically proven via zero-knowledge proof, without revealing private key material*, and reserves the `bindingProof` field on `identity.crossDidBinding` claims ([Base §6.4.4](core.md#identitycrossdidbinding-claim)) and the `postQuantumSignature` member ([Base §6.7](core.md#post-quantum-signatures), [Base §1.6.3](core.md#signing-input-procedure)). This profile specifies:

- **The Tier-2 ZKP proof profiles** (T2.1) — Profile 2A (BBS+ linked-secret) and Profile 2B (HD-derivation), carried in `bindingProof`.
- **The selective-disclosure dual-track model** (T2.2) — Track A (SD-JWT baseline, which stays in scope of [EXT-T1](ext-t1.md)) and Track B (BBS+ unlinkable derived proofs), which is the privacy face of the same cryptography and is required to claim Tier-2 privacy-preserving binding ([T2.2.2](#t222-claiming-tier-2-privacy-preserving-binding)).
- **The post-quantum signature profile** (T2.3) — forward-looking quantum-resistant signing and its dual-signature migration path.

These are bundled here for tier coherence: a deployment certifying to Tier-2 high assurance generally needs the ZK proof, the unlinkable privacy track, and a forward-crypto plan together. Tier-2 evaluators MUST also implement [EXT-T1](ext-t1.md), since Tier 2 is strictly additive over Tier 1.

## T2.1. Tier 2 ZKP Proof Profile

This profile provides cryptographic proof that the same entity controls multiple DIDs without revealing private key material or linking secrets. v0.4 provides two proof profiles for Tier 2 cross-DID binding. Both use the `bindingProof` field on `identity.crossDidBinding` claims.

**Cardinality.** Both proof profiles are strictly pairwise: one `bindingProof` proves control over exactly one pair of DIDs. A claim that carries a `bindingProof` MUST therefore list **exactly 2** entries in `boundDids` ([Base §6.4.4](core.md#identitycrossdidbinding-claim)), and the proof binds to that pair in array order (Profile 2B's public inputs are position-sensitive — [T2.1.3](#t213-verification-procedure)). Control of more than two DIDs is expressed as multiple `identity.crossDidBinding` claims, each carrying its own pairwise proof; since every such claim's `boundDids` includes the manifest `subject` per [Base §6.4.4](core.md#identitycrossdidbinding-claim), an N-DID assertion is a star of pairwise claims around the subject. An evaluator encountering a `bindingProof` on a claim whose `boundDids` cardinality is not exactly 2 MUST treat the proof as failing verification (recorded `failed` and capped at Tier 0, per [T2.1.3](#t213-verification-procedure)); it MUST NOT select a sub-pair to verify. *(Wire note: the published `schema.json` constrains `boundDids` only to `minItems: 2`; the exactly-2-with-`bindingProof` rule is normative prose at this design stage and is aligned in the schema at wire freeze. Attester-asserted claims without a `bindingProof` keep the ≥ 2 cardinality.)*

### T2.1.1. Profile 2A: BBS+ Linked-Secret Proof

The holder possesses a secret `s` committed in the credentials of both DIDs. The ZK proof demonstrates equality of committed secrets across credentials without revealing `s`, following the AnonCreds link-secret model adapted for Universal Manifest. The two credentials are carried in (or resolvable from) the claim's `claimProof` entries ([Base §6.4.3](core.md#claimsclaimproof-field)); a Profile-2A claim without resolvable credentials for both `boundDids` fails verification. Evaluators MUST verify the BBS+ proof of equality against the issuer's BLS12-381 G2 public keys for both credentials; the proof inherently demonstrates that the presenter possesses the holder-committed secret in both credentials.

A Profile 2A `bindingProof` MUST contain:

- `type` — MUST be `"ZkLinkedSecretProof"`.
- `cryptosuite` — MUST be `"bbs-2023"` per the W3C Data Integrity BBS Cryptosuites.
- `proofPurpose` — MUST be `"authentication"`.
- `proofValue` — Base64url-encoded BBS+ derived proof bytes.
- `publicInputs` — An object containing `commitmentA` and `commitmentB`, the BBS+ commitments from each credential.

BBS+ signatures (\[[BBS+](#references)\]) are the RECOMMENDED cryptographic suite for privacy-preserving Tier 2 operations: BBS+ derived proofs are unlinkable across presentations, and selective disclosure is native to the signature scheme.

### T2.1.2. Profile 2B: HD Derivation Proof

Both DIDs are derived from a common master seed via hierarchical deterministic key derivation (BIP-32/SLIP-10). The ZK proof demonstrates that a master seed exists such that the two public keys are derivable at declared paths, without revealing the seed.

A Profile 2B `bindingProof` MUST contain:

- `type` — MUST be `"ZkHdDerivationProof"`.
- `proofSystem` — The ZK proof system used (e.g., `"groth16"`). Evaluators MUST support Groth16 \[[Groth16](#references)\]; MAY support PLONK or Bulletproofs.
- `circuit` — URI identifying the HD derivation circuit (e.g., `"urn:uuid:circuit-hd-derivation-v1"`).
- `proofValue` — Base64url-encoded proof bytes.
- `publicInputs` — An object containing `publicKeyA`, `publicKeyB`, `derivationPathA`, and `derivationPathB`.

Groth16 proofs require a per-circuit trusted setup ceremony. The ceremony parameters MUST be publicly auditable. Evaluators MUST verify proofs against the published verification key.

### T2.1.3. Verification Procedure

When an evaluator encounters an `identity.crossDidBinding` claim carrying a `bindingProof`, it MUST apply the following procedure (the declared `requiredTrustTier` governs what the verified result must satisfy, not whether the proof is verified):

1. Confirm the claim's `boundDids` cardinality is exactly 2 ([T2.1](#t21-tier-2-zkp-proof-profile)), and identify the proof type from `bindingProof.type`.
2. For `ZkLinkedSecretProof` (Profile 2A): verify the BBS+ derived proof against the issuer's BLS12-381 G2 public keys referenced in the claim's credentials, and confirm that the proof demonstrates equality of the committed holder secret. Then **bind the proof to the claimed DIDs**: confirm that each credential against which the proof verifies resolves to a **distinct** member of `boundDids` as its credential subject — together, the two credential subjects MUST equal the `boundDids` pair. A proof whose credential subjects do not match `boundDids` demonstrates only that the presenter controls *some* pair of credentials, not the claimed binding.
3. For `ZkHdDerivationProof` (Profile 2B): resolve the circuit URI, retrieve the verification key, construct the public inputs from the declared public keys and derivation paths, and verify the ZK proof. Then **bind the public inputs to the claimed DIDs**: resolve each bound DID's DID document and confirm that `publicKeyA` is a verification method of `boundDids[0]` and `publicKeyB` is a verification method of `boundDids[1]`, respectively (listed in, or referenced from a verification relationship of, that DID's DID document). A bound DID whose DID document cannot be resolved fails this check. The ZK proof alone demonstrates only that the two *declared* keys derive from one master seed; the DID-document check is what ties those keys to the DIDs the claim asserts are bound — without it, a holder could present a valid proof over two keys it controls while `boundDids` names arbitrary DIDs.
4. Record the result in the receipt. A proof that both verifies and binds elevates the claim to Tier 2. Any failure or mismatch in steps 1–3 — a cardinality violation, a failing proof, a credential subject that is not a distinct member of `boundDids`, or a declared public key that is not a verification method of its respective bound DID — MUST cause the claim to be recorded as `failed` and treated at Tier 0, regardless of any accompanying attestations; evaluators MAY apply stricter local policy (for example, rejecting the manifest). Only an *absent* `bindingProof` falls back to attester-asserted Tier 1 evaluation.

*(Worked example: Tier 2 cross-DID binding with linked-secret proof — see [Cookbook](cookbook.md).)*

**Preview — built on default:** This makes **Groth16** the mandatory-to-implement proof system for Profile 2B (smallest proofs, fastest verification), with PLONK permitted as an optional alternative for deployments that prefer a universal setup. Working-group input is requested on whether the trusted-setup cost of Groth16 justifies making PLONK the baseline instead. Flag to revise.

## T2.2. Selective Disclosure: Dual-Track Model

Universal Manifest supports selective disclosure at the manifest level through holder-controlled projection ([Base §3.1.3](core.md#stage-3-project)), encrypted facets ([Base §2.3](core.md#encrypted-facets-jwe-inline-profile)), and credential-level disclosure inside claims. For credential-level selective disclosure, v0.4 defines two interoperable tracks so deployments can choose between web-native simplicity and unlinkable privacy:

- **Track A — SD-JWT (baseline, default).** Selective disclosure of JWT/JSON credential fields using SD-JWT \[[RFC9901](#references)\], with key binding via KB-JWT ([EXT-T1 §T1.1](ext-t1.md#t11-holder-binding)). This is the mandatory-to-implement baseline and the default for web and JWT environments, where library support is broad and integration is simplest. *(Track A's mechanics live in [EXT-T1](ext-t1.md); it is named here for completeness of the dual-track model.)*
- **Track B — BBS+ derived proofs (privacy-critical).** Unlinkable selective disclosure using BBS+ derived proofs \[[VC-DI-BBS](#references)\], where each presentation is cryptographically unlinkable to other presentations of the same credential. Track B is RECOMMENDED for privacy-critical deployments and is **required to claim Tier 2 privacy-preserving binding** ([T2.2.2](#t222-claiming-tier-2-privacy-preserving-binding)).

Manifest-level selective presentation composes with both tracks via facet projection, claim filtering, and pointer elision: the holder controls which facets, claims, and pointers appear in a given manifest instance, and Track A or Track B controls disclosure *within* a presented credential. Spatial-computing deployments, where the same subject may be observed across many venues, SHOULD use Track B to prevent cross-platform correlation. Deployments default to Track A where unlinkability is not required.

### T2.2.1. Privacy Considerations for Track B

The **privacy–binding tension** is fundamental: stronger binding enables correlation, while stronger privacy prevents binding verification. The specification provides mechanisms for both and requires evaluators to define their trust tier based on their threat model. Evaluators MUST NOT require cross-DID binding unless their use case demands Sybil resistance or trust transitivity; subjects SHOULD use the minimum binding tier that satisfies their evaluators' requirements. **BBS+ pseudonym scope:** if `pseudonymScope` is reused across verifiers, cross-verifier correlation becomes possible; issuers SHOULD generate unique scope URIs per verifier relationship, and evaluators MUST NOT use a shared pseudonym scope for multiple independent verifier relationships ([EXT-T1 §T1.6.1](ext-t1.md#t161-bbs-pseudonym-scope)).

**Preview:** The dual-track model is built on the editors' default (SD-JWT baseline; BBS+ for privacy-critical and Tier 2). Working-group input is requested on whether Track B should be mandatory for any class of spatial-computing deployment.

### T2.2.2. Claiming Tier-2 Privacy-Preserving Binding <span class="preview-tag">PREVIEW</span>

**Tier-2 privacy-preserving binding** — the property Track B is REQUIRED for ([T2.0](#t20-scope-and-relationship-to-the-base), [T2.2](#t22-selective-disclosure-dual-track-model)) — is a claimable conformance label, not a new mechanism. Its candidate registered-profile identifier is `um:profile:trust:tier2-privacy-preserving-binding` (a `trust`-category profile per [EXT-OPT §O6](ext-opt.md#o6-profile-registration-mechanism); the identifier is provisional until registration). Following the thin conformance-profile-label precedent of [EXT-T1 §T1.3.3](ext-t1.md#t133-locked-tier-portable-unlock-profile-umprofiletrustlocked-tier-portable-unlock), the label names a bundle of existing requirements and defines no new ceremony, cryptography, or member. A deployment conforms to the label when, together:

1. cross-DID binding is verified at Tier 2 via a [T2.1](#t21-tier-2-zkp-proof-profile) proof profile, including the `boundDids` binding steps of [T2.1.3](#t213-verification-procedure);
2. credential-level selective disclosure uses Track B (BBS+ derived proofs, [T2.2](#t22-selective-disclosure-dual-track-model)) for the credentials involved — Track A alone MUST NOT be the basis of this claim; and
3. the pseudonym-scope discipline of [T2.2.1](#t221-privacy-considerations-for-track-b) / [EXT-T1 §T1.6.1](ext-t1.md#t161-bbs-pseudonym-scope) is applied.

The label is claimed in the deployment's conformance claim ([EXT-OPT §O11.1](ext-opt.md#o111-conformance-claim-contents-candidate-template), item 2 — implemented modules and claimed PREVIEW features); it adds no manifest wire member.

## T2.3. Post-Quantum Signatures

This profile defines a post-quantum signature profile providing quantum-resistant signing as a supplement to the baseline Ed25519 profile (Signature Profile A, [Base §1.6](core.md#signature-profile-a-jcs--ed25519)).

### T2.3.1. Candidate Algorithms

The following NIST-standardized post-quantum signature algorithms are candidates:

- **ML-DSA (CRYSTALS-Dilithium)** — NIST FIPS 204 \[[FIPS204](#references)\]. Lattice-based, moderate signature size (~2.4 KB for ML-DSA-65), fast verification. The leading candidate for general-purpose post-quantum signatures.
- **SLH-DSA (SPHINCS+)** — NIST FIPS 205 \[[FIPS205](#references)\]. Hash-based, larger signatures (~8–30 KB), no lattice assumptions (conservative choice). Suitable as a fallback if lattice-based schemes are broken.
- **FN-DSA (FALCON)** — NIST (pending standardization). Lattice-based, compact signatures (~666 bytes for FALCON-512), more complex implementation. Suitable for constrained devices where signature size is critical.

### T2.3.2. Profile Naming

The post-quantum profile follows the signature-profile naming convention of [Base §1.6](core.md#signature-profile-a-jcs--ed25519). The recommended baseline profile is **Signature Profile B: JCS + ML-DSA-65**. Profile B shares Profile A's canonicalization: in a `postQuantumSignature` object following Profile B, `canonicalization` MUST be `"JCS-RFC8785"` and `algorithm` MUST be `"ML-DSA-65"`; the `algorithm` + `canonicalization` pair identifies the profile, exactly as [Base §1.6.5](core.md#profile-identification) requires for `signature`, and an evaluator that processes `postQuantumSignature` at all MUST apply the same unsupported-pair rejection discipline to it.

### T2.3.3. Dual-Signature Migration Path

The transition from Ed25519 to post-quantum signatures uses a dual-signature period. During this period, manifests carry both an Ed25519 signature (in the existing `signature` field) and a post-quantum signature (in a new `postQuantumSignature` field).

- Evaluators that support the post-quantum profile MUST verify both signatures, and MUST reject the manifest if **either** verification fails. Dual verification is conjunctive: one valid signature never compensates for the other's failure. (Accepting on one-of-two would let a forgery under a broken algorithm ride on the other signature's validity — defeating the purpose of carrying both during exactly the period this mechanism exists to protect.)
- Evaluators that do not yet support the post-quantum profile MUST verify only the Ed25519 signature and MUST ignore the `postQuantumSignature` field.
- The dual-signature period begins when the post-quantum profile is published and ends when the working group declares Ed25519-only manifests non-conformant at a major-version boundary.

The `postQuantumSignature` field follows the same schema as `signature` ([Base §1.6](core.md#signature-profile-a-jcs--ed25519)) with the `algorithm` field set to the post-quantum algorithm identifier (e.g., `"ML-DSA-65"`). Both proofs are computed over the same signing input: the canonical bytes of [Base §1.6.3](core.md#signing-input-procedure) with the `signature`, `postQuantumSignature`, and (if present) `presentationProof` properties removed, so that neither signature's bytes feed the other's input.

*(Worked example: dual-signature manifest — see [Cookbook](cookbook.md).)*

**Notes (working-group):** Whether the dual-signature mechanism should use a separate top-level field or an array of signature objects is open (separate field is simpler for backward compatibility; an array is more extensible). ML-DSA-65 signatures (~2.4 KB) are significantly larger than Ed25519 (64 bytes); the working group is assessing whether this size increase matters for constrained-device deployments.

## References

Cited in this profile (full descriptors in the published artifact):

- **[BBS+]** BBS+ Signature Scheme / BBS Signatures.
- **[VC-DI-BBS]** Verifiable Credentials Data Integrity BBS Cryptosuites (`bbs-2023`).
- **[Groth16]** Groth, *On the Size of Pairing-Based Non-interactive Arguments*.
- **[RFC9901]** SD-JWT (Selective Disclosure for JWTs).
- **[FIPS204]** ML-DSA (CRYSTALS-Dilithium). **[FIPS205]** SLH-DSA (SPHINCS+). FN-DSA (FALCON), NIST.

---

*Companion to the [Base specification](core.md). For the Tier-1 layer this builds on, see [EXT-T1](ext-t1.md); for Tier-3 ceremonies, see [EXT-T3](ext-t3.md).*
