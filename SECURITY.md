# Security Policy

## Reporting Vulnerabilities

**Do not open public GitHub issues for security vulnerabilities.**

Please report security issues by email to: **security@universalmanifest.net**

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact

## Supported Versions

| Version | Status |
|---------|--------|
| v0.5    | Released (`v0.5.0`); reports are accepted |
| v0.4    | Published; reports are accepted |
| v0.3    | Previous version |
| v0.2    | Previous version |
| v0.1    | Legacy, no updates |

A published version's context and schema never change. A correction to a published version is made as text errata or in a new version.

## Response

Reports are read and assessed by the maintainers. No fixed response time is promised.

## Cryptographic Profiles

v0.5 Signature Profile A is Ed25519 over the JCS (RFC 8785) canonical form, with canonical prime-order points, a canonical S and the full-challenge equation. Signature Profile B is JCS + ES256. The v0.5 conformance suite in `conformance/v0.5/` exercises both.
