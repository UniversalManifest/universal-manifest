# Security Policy

## Reporting Vulnerabilities

**Do NOT open public GitHub issues for security vulnerabilities.**

Please report security issues by email to: **security@universalmanifest.net**

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact

## Supported Versions

| Version | Status |
|---------|--------|
| v0.3    | Current published specification |
| v0.2    | Previous version, maintained |
| v0.1    | Legacy, no active updates |

## Response Timeline

- **Acknowledgment**: Within 48 hours of receipt
- **Critical issues**: Fix and patch within 30 days
- **Severity assessment**: Conducted during initial review

## Cryptographic Profile

The v0.2 signature profile uses Ed25519 signatures with JCS (RFC 8785) canonicalization. The v0.3 specification extends this with a normative receiver pipeline, encrypted inline facets (JWE), and structured receipts.

## Contact

Security inquiries: security@universalmanifest.net
