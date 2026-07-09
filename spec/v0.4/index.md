---
lang: en
title: Universal Manifest v0.4 — Document Set Index (Conformance-Tier Stack)
---

# Universal Manifest v0.4 — Document Set (Conformance-Tier Stack)

The v0.4 specification is published as a **conformance-tier stack**: a breadth-first Primer, a Tier-0/Tier-1 Base, four companion profiles that a conformance claim *adds* by tier or by optional feature, and a Cookbook of worked examples. The question that decides what you read and build is *"what level of assurance am I certifying to?"*

v0.3 remains the stable published reference; v0.4 is the production-candidate milestone.

## The documents

| # | Document | Role | Words | Status |
|---|----------|------|------:|--------|
| 1 | [primer.md](primer.md) | **Primer** — breadth-first overview: what UM is, the shape of a manifest, the lifecycle, the core guarantees, a one-glance map of tiers + extensions. Informative; no MUSTs. | ~2,300 | Informative |
| 2 | [core.md](core.md) | **Base** — everything to build a conformant Tier-0/Tier-1 evaluator and holder, including a top-level manifest object/field map. Names advanced/optional features and points to the extensions for their mechanics. | ~11,000 | Production-candidate + PREVIEW-named |
| 3 | [ext-t1.md](ext-t1.md) | **EXT-T1** — Tier-1 binding mechanics: holder binding, presentation proof, liveness, Stage-2 sub-steps, the 7-step claim-proof path, v0.3 backwards compat. | ~3,200 | Normative (T1.3.1–T1.3.3 PREVIEW) |
| 4 | [ext-t2.md](ext-t2.md) | **EXT-T2** — Tier-2 ZKP proof profiles (2A/2B), the BBS+ unlinkable disclosure track, post-quantum migration. | ~2,400 | PREVIEW |
| 5 | [ext-t3.md](ext-t3.md) | **EXT-T3** — Tier-3 multi-party ceremony: model, attester-role taxonomy, threshold-protocol guidance. | ~1,000 | PREVIEW |
| 6 | [ext-opt.md](ext-opt.md) | **EXT-OPT** — tier-orthogonal optional features: abstract data model + CBOR-LD, statusRef protocol, receipts-as-class, bilateral sessions, federation, profile registration, scope registry, trustWeight/category trust, extended schemas, crypto summary, class registry. | ~6,400 | Mixed (PREVIEW-tagged per part) |
| 7 | [cookbook.md](cookbook.md) | **Cookbook** — all 24 worked examples, by scenario, tagged by tier. Informative. | ~2,600 | Informative |

## How to read it, by what you are certifying to

- **Tier-0 (signature-only) evaluator** → Base only.
- **Tier-1 (attested / proof-backed) evaluator or holder** → Base + EXT-T1.
- **Tier-2 (Sybil-resistant cryptographic binding) deployment** → Base + EXT-T1 + EXT-T2.
- **Tier-3 (multi-party co-signed) deployment** → Base + EXT-T1 + EXT-T2 + EXT-T3.
- **Adding revocation, federation, sessions, CBOR-LD, a new manifest class, or other optional features** → Base + the relevant parts of EXT-OPT.
- **Just want concrete payloads** → Primer → Cookbook.

## What this restructure does and does not do

**Does:** relocate and re-frame existing content into a tier-stack architecture; add three net-new artifacts (Primer, Cookbook, this index); apply a concision pass; preserve every normative requirement (moved/deferred, never silently dropped); keep the Base at "what conformance demands" altitude by *naming* advanced capabilities and *specifying* them in extensions — the same discipline that kept v0.3 digestible.

**Does not:** reword normative meaning, change any wire shape, or alter conformance semantics. The **anchor discipline**: each document owns its anchors; cross-citations between the Base and the extensions run in both directions and are verified by the rendered-anchor guard.

## Provenance

This set was restructured from the earlier single-file v0.4 draft into the Conformance-Tier Stack architecture (the "Strategy B" layout) in June 2026. The restructuring relocated and re-framed existing content into the tier-stack and added three net-new artifacts (Primer, Cookbook, this index); it preserved every normative requirement and changed no wire shape.
