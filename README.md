# Universal Manifest

A portable, signed context envelope for systems that don't share a backend.

Universal Manifest is a JSON-LD document format that lets two parties exchange verified identity, trust, consent, and capability information in a single handshake. A person walks into a venue, connects to a service, or meets another device. Both sides present a manifest. Both sides verify what the other sent. Both sides produce a receipt recording what they checked, what they accepted, and what they couldn't read. No central server required.

**Current version: v0.3** | [Read the spec](https://universalmanifest.net/spec/v0.3/) | [universalmanifest.net](https://universalmanifest.net)

## Specification Versions

| Version | Status | Document |
|---------|--------|----------|
| [v0.3](spec/v0.3/) | Current | Evaluation sequence, encrypted facets, structured receipts, trust tier promotions |
| [v0.2](spec/v0.2/) | Previous | Ed25519 signature profile, identity binding, tiered trust model |
| [v0.1](spec/v0.1/) | Legacy | Core JSON-LD envelope, lifecycle, caching |

Each version is preserved at its permalink. The latest published spec is always at [universalmanifest.net/spec/latest/](https://universalmanifest.net/spec/latest/).

## What v0.3 Adds

- **Evaluation sequence**: a six-stage evaluation contract (Arrive, Verify, Project, Consent, Compose, Receipt) that every conformant evaluator follows.
- **Encrypted inline facets**: sensitive data encrypted with JWE so only designated recipients can read it. Everyone else sees the facet as a sealed entry.
- **Structured receipts**: a machine-readable record of what the evaluator checked, accepted, rejected, or couldn't read.
- **Normative promotions**: cross-DID binding, `requiredTrustTier`, and agent delegation move from convention to normative requirement.
- **Structural schemas**: `consents`, `claims`, and `pointers` arrays now have defined schemas. `devices` is reserved for v0.4.
- **Tier 2 defined**: cryptographic binding via zero-knowledge proof of cross-DID control (at risk).

Full change list: [Changes from v0.2](https://universalmanifest.net/spec/v0.3/#changes-from-v02)

## Standards Engagement

Universal Manifest is under review by the OMA3 Technical Working Group. The specification uses W3C document conventions and is designed to compose with existing standards (JSON-LD, DIDs, Verifiable Credentials, JCS/RFC 8785).

## Author

Created by Grig Bilham, [Sumset Tech LLC](https://sumset.tech).

## Licensing

This repository uses dual licensing:

- **[LICENSE](LICENSE)** (Apache 2.0): applies to any code or tooling added to this repository.
- **[LICENSE-DOCS](LICENSE-DOCS)** (W3C Software and Document License): applies to everything in the `spec/` directory.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Specification changes require an issue for discussion before a pull request.

## Security

Report vulnerabilities to security@universalmanifest.net. See [SECURITY.md](SECURITY.md).
