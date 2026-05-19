# Universal Manifest v0.1 — Well‑Known Names (Registry, Draft)

This file is a **non‑normative** registry of *well‑known* names used in the v0.1 examples/stubs.

Goal:

- reduce fragmentation across early adopters
- make it easier for systems to interoperate by “recognizing” common strings

v0.1 intentionally allows additional fields and arbitrary objects; treat this as guidance, not a hard contract.

## Facet names (`facets[].name`)

- `canonicalProfilePointer` — Pointer to canonical identity/profile source (any stable URL)
- `publicCapsule` — Safe‑to‑render projection for public displays
- `publicProfile` — Public profile projection suitable for web/social surfaces

- `venueIdentity` — Venue identity fields (name, locale, timezone)
- `venuePolicy` — Venue policy envelope (safe mode, content rules)
- `edgeNode` — Edge node identity + discovery + base URL

- `deviceIdentity` — Device identity + hardware/capabilities
- `venueAssociation` — Device → venue association (ref + minimal venue identity)

## Pointer names (`pointers[].name`)

Identity + canonical storage:

- `solidPod.creatorCanonical`
- `solidPod.venueCanonical`

Messaging / signaling:

- `matrix.userId`
- `matrixRoom.updates`
- `matrixRoom.revocations`

Federation / social:

- `activityPub.actor`

Reference implementation operational pointers (example integration):

- `edgeBaseUrl`
- `edgeDescriptor`
- `universalManifest.current`
- `consumerExperience`

Metaverse integration pointers (non-normative candidate family):

- `metaverse.profile` — projected cross-world profile reference
- `metaverse.avatar` — canonical avatar asset or descriptor reference
- `metaverse.avatar.translationProfile` — avatar translation framework metadata profile
- `metaverse.inventory` — inventory/wearables reference bundle
- `metaverse.socialGraph` — social graph reference bundle
- `metaverse.reputation` — reputation and trust reference bundle
- `metaverse.complianceProof` — compliance evidence reference bundle
- `metaverse.preferencesBundle` — preference/security/credential bundle reference

Portable Identity Profile XR pointers (non-normative candidate family):

- `portableIdentity.profile` — canonical portable profile reference
- `portableIdentity.avatar` — avatar asset reference for XR projection
- `portableIdentity.wearables` — wearable/inventory reference bundle
- `portableIdentity.translationProfile` — avatar translation profile reference
- `portableIdentity.proofBundle` — trust/compliance proof bundle reference

Payment handle pointers (non-normative candidate family):

- `payment.public.checkout` — public-safe checkout session or intent URL
- `payment.gateway.stripe.accountRef` — Stripe account/customer reference pointer (tokenized/externalized)
- `payment.gateway.paypal.merchantRef` — PayPal merchant/order reference pointer (tokenized/externalized)
- `payment.gateway.crypto.settlementRef` — crypto settlement session/order pointer
- `payment.protected.bundle` — protected handle bundle pointer for projection or encrypted-inline delivery

Privacy signal integration pointers (non-normative candidate family):

- `privacy.gpcSupportResource` — `/.well-known/gpc.json` support-resource reference

## Claim names (`claims[].name`)

- `role` — role assertion (e.g., `creator`, `venue`, `display`)
- `verification.status` — verification state (e.g., `unverified`, `verified`)
- `policy.safeMode` — safe mode policy value (e.g., `PG-13`)

Metaverse claim names (non-normative candidate family):

- `metaverse.reputation.level` — normalized reputation level or class
- `metaverse.reputation.score` — machine-readable reputation score
- `metaverse.transaction.complianceStatus` — transaction compliance decision status
- `metaverse.security.assuranceLevel` — declared security assurance level

Portable Identity Profile XR claim names (non-normative candidate family):

- `portableIdentity.verification.status` — portable verification status claim
- `portableIdentity.age.over18` — age-threshold attestation indicator
- `portableIdentity.policy.tier` — policy/risk tier classification

## Consent names (`consents[].name`)

- `publicDisplay` — permission for public display rendering
- `analytics.proofOfPlay` — permission for proof‑of‑play analytics (typically manifestId‑keyed)
- `telemetry.proofOfPlay` — device/ops telemetry permission (typically manifestId‑keyed)
- `social.profilePublic` — permission to publish a public profile surface derived from the manifest

Extended consent names for firewall-style integration experiments (non-normative, backward-compatible):

- `health.shareRecords` — permission to resolve and use full healthcare record pointers
- `health.shareAllergies` — permission to read allergy-related facet content
- `health.shareEmergencyInfo` — permission to read emergency contact facet content
- `ar.recording.faceVisible` — permission to allow face visibility in AR capture contexts
- `ar.recording.voiceAllowed` — permission to allow voice capture in AR contexts
- `ar.overlay.presenceVisible` — permission to render presence overlays in AR consumers
- `metaverse.profilePublic` — permission to project public profile views into metaverse consumers
- `metaverse.socialGraphShare` — permission to expose social-graph references to metaverse consumers
- `metaverse.voiceCapture` — permission to allow voice capture in metaverse contexts
- `metaverse.recording.faceVisible` — permission to allow face visibility in metaverse recording
- `metaverse.inventoryShare` — permission to disclose inventory/wearables references
- `metaverse.reputationShare` — permission to disclose reputation references/claims
- `metaverse.transaction.complianceShare` — permission to disclose compliance proof references
- `metaverse.preferences.sync` — permission to synchronize preference overlays across worlds
- `metaverse.security.postureShare` — permission to disclose security posture/preferences
- `metaverse.credentials.presentation` — permission to present credential-derived claims
- `payment.handle.protected` — permission to resolve protected payment-handle bundles
- `portableIdentity.profilePublic` — permission to disclose portable public-profile projection
- `portableIdentity.voiceCapture` — permission to enable voice capture in XR sessions
- `portableIdentity.translationEnabled` — permission to enable translation overlays
- `portableIdentity.analyticsShare` — permission to share portable analytics signals
- `portableIdentity.recording.faceVisible` — permission to allow face visibility in recording
- `privacy.globalOptOut.gpc` — normalized GPC evidence snapshot for runtime-observed global opt-out state
- `privacy.globalOptOut.scope` — bounded scope metadata for GPC evidence projection
- `privacy.globalOptOut.source` — provenance metadata for GPC evidence projection
- `privacy.globalOptOut.observedAt` — observation timestamp metadata for GPC evidence projection

## Overlay key families (object keys in facet/payload data)

These are namespaced key families for optional payload objects. They are non-normative and
intended to reduce naming drift between issuers and consumers.

Scenario 5 preference/security families:

- `prefs.language.*` — language and translation preferences
- `prefs.financial.*` — payment and settlement preferences
- `prefs.financial.handle.*` — payment-handle classification and delivery metadata
- `prefs.logistics.*` — delivery/fulfillment and location-routing preferences
- `prefs.security.*` — security posture and policy preferences
- `prefs.credentials.*` — credential usage and presentation preferences

Metaverse scenario support families:

- `metaverse.profile.*` — projected profile attributes and projection metadata
- `metaverse.avatar.*` — avatar projection and rendering metadata
- `metaverse.inventory.*` — inventory/wearables projection metadata
- `metaverse.social.*` — social continuity and relationship metadata
- `metaverse.reputation.*` — reputation portability metadata

Portable Identity Profile XR support families:

- `portableIdentity.profile.*` — portable profile projection metadata
- `portableIdentity.avatar.*` — avatar projection and adaptation metadata
- `portableIdentity.capability.*` — device/runtime capability projection metadata
- `portableIdentity.deviceState.*` — runtime state and posture metadata
- `portableIdentity.policy.*` — policy and enforcement metadata

Privacy signal support families:

- `privacy.globalOptOut.*` — portable evidence metadata for runtime-observed privacy signals

## Device trust levels (`devices[].trust`)

- `local` — locally observed but not enrolled
- `enrolled` — enrolled/paired to a venue edge (trusted)
