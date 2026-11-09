# Universal Manifest

A portable, signed context envelope for systems that don't share a backend.

Universal Manifest is a JSON-LD document format that lets two parties exchange verified identity, trust, consent, and capability information in a single handshake. A person walks into a venue, connects to a service, or meets another device. Both sides present a manifest. Both sides verify what the other sent. Both sides produce a receipt recording what they checked, what they accepted, and what they couldn't read. No central server required.

**Latest release: v0.5.0** ([`v0.5.0`](https://github.com/UniversalManifest/universal-manifest/releases/tag/v0.5.0)) | [Read the spec](https://universalmanifest.net/spec/v0.5/) | [universalmanifest.net](https://universalmanifest.net)

**Normative source:** the repository files at a release tag, such as `v0.5.0`, are normative, and a tag never changes. `main` is the working copy. The website renders a reading view of each version.

## Specification Versions

| Version | Status | Frozen permalink (normative) | Working path |
|---------|--------|------------------------------|--------------|
| v0.5 | Released: v0.5.0, 2026-11-08 | [tag `v0.5.0`](https://github.com/UniversalManifest/universal-manifest/tree/v0.5.0/spec/v0.5) | [spec/v0.5/](spec/v0.5/) |
| v0.4 | Published | [commit `d797414`](https://github.com/UniversalManifest/universal-manifest/tree/d7974146a2d3da7f095c53edc8d7e05fa4a2b920/spec/v0.4) | [spec/v0.4/](spec/v0.4/) |
| v0.3 | Previous | [commit `b0b9fbf`](https://github.com/UniversalManifest/universal-manifest/tree/b0b9fbfecbbe73f42b11900c4a22bcf6277140c0/spec/v0.3) | [spec/v0.3/](spec/v0.3/) |
| v0.2 | Previous | [commit `013a82d`](https://github.com/UniversalManifest/universal-manifest/tree/013a82db5be48289a7e3b60c7e3dbb0dd2d5f502/spec/v0.2) | [spec/v0.2/](spec/v0.2/) |
| v0.1 | Legacy | [commit `1dfac07`](https://github.com/UniversalManifest/universal-manifest/tree/1dfac07c8192359d28257333ba55785392cd251f/spec/v0.1) | [spec/v0.1/](spec/v0.1/) |

v0.5 is the first version with a release tag. For v0.1 to v0.4, the frozen permalink is the commit that last changed that version's folder. Each version's reading view is at `https://universalmanifest.net/spec/v0.N/`. A versioned context and schema never change after publication: a change to a term needs a new version.

## What v0.5 Changes

- **Wire version.** New manifests declare `manifestVersion: "0.5"` and the v0.5 context. Each is newly signed; changing the version or context of a v0.4 document invalidates its signature.
- **Stricter Signature Profile A.** Ed25519 over JCS, with canonical prime-order points, a canonical S and the full-challenge equation.
- **Signature Profile B.** JCS + ES256 beside Profile A, for hardware key custody.
- **Resource limits.** A megabyte is 1,000,000 octets over the JCS-canonical form, depth counts containers, and the array limit applies to every array.
- **I-JSON input.** The whole manifest as received must be I-JSON, including members outside the signing input.
- **Consent entries.** When more than one entry governs a facet, every entry must be satisfied.
- **Release boundary.** v0.5 is a mechanism with reference suppliers. It claims no real-world identity, issuer or revocation result, and conformance level is `none`.

Full notes: [v0.5.0](https://github.com/UniversalManifest/universal-manifest/releases/tag/v0.5.0) and [spec/v0.5/README.md](spec/v0.5/README.md). v0.5.0 keeps the wire files of release candidate 1 ([`v0.5.0-rc.1`](https://github.com/UniversalManifest/universal-manifest/releases/tag/v0.5.0-rc.1)) and corrects text only.

## Standards Engagement

Earlier versions were reviewed in the OMA3 Technical Working Group, and publication asserts no OMA3 ratification.

## Using This Specification

The v0.5 suite is in [conformance/v0.5/](conformance/v0.5/): 198 cases indexed by `expected.json`. See [conformance/README.md](conformance/README.md). Implementations run it with the reference runner in [conformance/runner/](conformance/runner/), or with their own adapter.

## Author

Created by Grig Bilham, [Sumset Tech LLC](https://sumset.tech).

## Licensing

- **`spec/v0.5/` and later revisions:** the [Apache License, Version 2.0](LICENSE). Copyright (c) 2026 SumSet Tech LLC and the Universal Manifest contributors.
- **Earlier published revisions, `spec/v0.1/` to `spec/v0.4/`:** each keeps the notices and terms it carried when published. This section does not change them. [LICENSE-DOCS](LICENSE-DOCS) (W3C Software and Document License) stays in this repository for those revisions.
- **Code or tooling added to this repository:** [LICENSE](LICENSE) (Apache 2.0).

## Contributing and Security

Changes are proposed as issues and pull requests on this repository. The maintainers accept them after review here. Change control for the media types and the profile registry rests with the maintainers. See [CONTRIBUTING.md](CONTRIBUTING.md).

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md). Do not report them in public issues. To cite the specification, see [CITATION.cff](CITATION.cff).
