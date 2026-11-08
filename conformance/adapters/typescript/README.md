# TypeScript Reference Adapter

Reference adapter for the standalone Universal Manifest conformance runner.

Uses validators from:
- `packages/universal-manifest/dist/index.js`

## Command mode

Reads fixture JSON from stdin and writes a standardized JSON result to stdout.
Both entry points pass the original bytes to `evaluateFixture`, which decodes
UTF-8 and calls the reference package's `parseIJsonDocument` before selecting a
validation surface. Duplicate member names, including escaped-equal names,
reject at ingestion; they are never collapsed by a preliminary `JSON.parse`.
Direct object callers of `evaluateFixture` remain supported, but cannot test
duplicate-member rejection because the raw evidence is already lost.

Run manually:

```bash
cat /path/to/fixture.json | node ./adapter.mjs
```

Expected output shape:

```json
{
  "fixture": "urn:um:example",
  "result": "accept",
  "reason": "0.1 manifest validated (structural)",
  "manifestVersion": "0.1",
  "validationMode": "structural",
  "specVersion": "0.1"
}
```

Evaluation-mode results additionally carry `receiptOutcome`.
For an ingestion failure, the manifest version is `unknown` and the diagnostic
fixture label is the context's `fixture` when supplied, otherwise
`stdin-fixture`. No partially parsed document is used to derive a label.

## Conformance context (adapter contract 1.1)

The runner delivers each fixture's `validationMode` and `evaluationContext`
beside the payload — see `conformance/runner/README.md` for the contract. This
adapter reads it from:

- command mode: the `UM_CONFORMANCE_CONTEXT` environment variable
- HTTP mode: the `x-um-conformance-context` request header

Both are optional. Without a context the adapter falls back to the fixture's
embedded `__validate` sentinel, which is how it behaved under contract 1.0.

For v0.4 and v0.5, `evaluationContext.now` pins the clock in both `fresh` and
`evaluation` modes. These routes reject missing or malformed clocks; they **never**
substitute the wall clock. The `fresh` route passes that clock to the maintained
signature and freshness validator and returns an ordinary result without a receipt.
The `evaluation` route returns an evaluation receipt. The v0.1 and v0.2 routes
retain their existing clock behavior.

## Surfaces

### Internal contextual liveness V1 opt-in

For the existing v0.4 `evaluation` surface, launch either adapter with
`UM_CONFORMANCE_LIVENESS_V1` set to a JSON object containing `evaluationContext`
(including an explicit `now` date-time) and optional `livenessValidation`
(the current contextual V1 registration configuration). Omitted or `null`
validation uses the V1 API without an installed validator and truthfully reports
that proof verification did not execute. The absent environment control retains
legacy evaluation. Empty, malformed, duplicate or invalid configuration refuses
evaluation, and its UTF-8 representation is limited to 65,536 bytes.

The process reads this control once. HTTP context headers, per-request fields,
holder fields and runner expectations cannot install registration authority or
replace the V1 evaluator clock, purpose or challenge. They can still select the
existing surface and provide a diagnostic label.

Configured results expose `behavior.receipt`, `behavior.processedFacets` and
`behavior.localLivenessDiagnosticsV1`, including rejected evaluations. `checks`
is the actual diagnostic `checksExecuted` array. Receipt outcomes determine the
aggregate verdict; callers must inspect facet statuses and released facets to
learn what was withheld. Diagnostics are local and separate from the shared
receipt. This opt-in adds no normative carrier or receipt fields.

The current V1 APIs report a repeated counter as `non-increasing` while retaining
validated proof status; this adapter preserves that result. It does not maintain
a persistent replay database or consume/update counters. Synthetic proof-derived
UV does not establish a human gesture or hardware assurance.

### Private V1 capability observations

The trusted process launcher may additionally set
`UM_CONFORMANCE_CAPABILITY_OBSERVATIONS` to the exact accepted private identity
`PROPOSED_UNREGISTERED:8e3b8f39300a9c1a3f6fc6f1fc396ca377a4d62beea8644847f7454beac0ee54`.
The module reads this selector once; an explicit unsupported value refuses
validation. Omission preserves the complete default output. Request context,
holder fields, receipts and expected metadata cannot enable production or supply
check results. Non-V1 evaluation never produces these observations.

The V1 return may then add `executedChecks` entries with exactly `checkId`,
`executionKind`, `outcome`, `payloadSha256` and `contextSha256`. Digests bind the
original payload bytes and original context JSON parsed by this adapter. Direct
object payloads, unparsed contexts and contexts changed after parsing yield no
records. A coherent ordered diagnostic prefix comes directly from the maintained
V1 package: completed earlier stages pass, an attempted failing terminal stage
fails, and unentered stages are absent. Unknown or contradictory diagnostics
yield no credit. No aggregate verdict or ordinary signature-check string can
substitute for a primitive observation.

Local IDs are `um.typescript.liveness.v1/<stage>`, using the ten stage entries in
`packages/universal-manifest/src/liveness.ts:166-239` and the separately pinned
loaded `dist/liveness.js`. Carrier, client data, same origin, authenticator data,
authorized key and signature encoding are structural. Authority/time,
authenticated flags and counter read/comparison are behavioral. Only
`assertion-signature` is cryptographic, around the actual software Node
verification. A counter record with `non-increasing` is a completed observation,
not monotonic advancement, persistence, replay prevention or hardware proof.
Permission denial and missing validation yield no signature observations.

These private adapter records do not register or adopt the contract, certify
P13, strengthen software authority into hardware assurance, or establish full
standard, protected release, source, device or public acceptance.

| Suite | Surfaces |
| --- | --- |
| v0.1, v0.2 | `structural`, `fresh` |
| v0.4 | `structural`, `fresh`, `evaluation` (six-stage sequence, receipt outcome maps to the verdict) |

`bilateral` is explicitly unsupported: this reference package has no bilateral
session API. A parsed bilateral request returns `result: "reject"`,
`validationMode: "bilateral"`, an unsupported-mode reason and `checks: []`.
It cannot pass the Rust bilateral behavioral expectations by rejecting a
negative fixture for the unrelated reason that the API is absent.

The v0.4 package contains one v0.3 envelope, exercised through the v0.4
backwards-compatibility path. The suite version from the conformance context —
not the envelope's own `manifestVersion` — selects the v0.4 surface for it.

## HTTP mode

Start HTTP wrapper:

```bash
node ./server.mjs
```

Endpoints:
- `POST /validate` -> accepts fixture bytes, returns standardized result JSON.
- `GET /healthz` -> health check.

Malformed JSON is a `200` response with `result: "reject"`, matching command
mode. This lets the runner distinguish an implementation rejection from a
transport failure. Request-read failures still return `400`.

Default bind:
- `http://127.0.0.1:8788`

Override port:

```bash
PORT=9090 node ./server.mjs
```
