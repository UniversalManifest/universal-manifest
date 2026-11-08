# Universal Manifest Conformance Runner

Node ESM CLI runner for Universal Manifest conformance suites.

## What it does

- Loads the expected-results index for each version you name with `--versions`:
  - `conformance/v0.5/expected.json`, the current suite and the one the public
    repository carries. Always pass `--versions 0.5` there.
  - `conformance/v0.1`, `v0.2` and `v0.4` indexes come from the development
    repository; the v0.5 release copy does not carry them. A copy without an
    index refuses that version with a clear message.
- Resolves each expected entry and loads its original fixture bytes without parsing.
- Invokes an adapter in one of two modes:
  - `command`: spawn adapter command, send fixture JSON on stdin, parse JSON stdout.
  - `http`: POST fixture JSON to adapter endpoint, parse JSON response.
- Delivers each entry's `validationMode` and `evaluationContext` to the adapter
  (see "Conformance context" below).
- Compares adapter results to expected outcomes.
- Emits a JSON report. Its schema, `conformance/schema/conformance-report.schema.json`,
  is not in the v0.5 release copy.

## Adapter response contract

Adapter output must be JSON with at least:

```json
{
  "result": "accept",
  "reason": "validated"
}
```

Allowed `result` values:
- `accept`
- `reject`

Optional fields:
- `fixture` (string)
- `error` (string; used as fallback reason)

Other fields are ignored unless an expectation entry requests the behavioral
assertions below. An adapter may return additional diagnostics.

### Optional behavioral assertions

Local expectation entries may add `expectedChecks` (a list of executed-check
labels) and `expectedBehavior` (selected fields in the adapter's `behavior`
object). Every requested check must appear in the returned `checks` array.
Objects select fields recursively; arrays require the exact length and order;
primitive values, including explicit `false` and `null`, must match exactly.
Missing behavior fails an assertion. A matching aggregate verdict alone cannot
pass these entries. Reports retain `actualChecks`, `actualBehavior` and any
`assertionFailures` for those entries.

These are **runner-only expectations**. `buildAdapterContext` never forwards
them, the expected verdict or the expected reason to either adapter transport.
The tested payload stays unchanged.

## Conformance context (adapter contract 1.1)

Each version's `expected.json` (v0.4 and v0.5) selects a **verification surface** per entry
(`validationMode`) and pins the **evaluation environment** (`evaluationContext`,
including the mandatory clock `now`). Those values are part of the fixture's
definition: `conformance/README.md` requires a runner to construct the
evaluator's context from them and never from ambient state. Contract 1.1
delivers them to the adapter.

### Where the context is delivered

| Mode | Transport | Payload |
| --- | --- | --- |
| `command` | environment variable `UM_CONFORMANCE_CONTEXT` (JSON) | stdin: the fixture document, unchanged |
| `http` | request header `x-um-conformance-context` (JSON) | body: the fixture document, unchanged |

HTTP mode additionally sets two scalar convenience headers for adapters where
parsing JSON out of a header is awkward. The full context is always on
`x-um-conformance-context`; these merely duplicate two of its fields:

- `x-um-spec-version` — e.g. `0.4`
- `x-um-validation-mode` — e.g. `evaluation` (absent when the entry sets none)

### Context shape

```json
{
  "contractVersion": "1.1",
  "fixture": "invalid/expired-manifest.jsonld",
  "specVersion": "0.4",
  "conformanceLevel": "baseline",
  "category": "temporal",
  "validationMode": "evaluation",
  "evaluationContext": {
    "now": "2026-06-01T00:01:00.000Z",
    "maxSupportedTrustTier": 0,
    "omitProcessedAt": true
  }
}
```

`validationMode` and `evaluationContext` are **omitted** when the expectation
entry does not set them, so their absence is unambiguous. The remaining fields
are always present. `evaluationContext` is passed through verbatim; the runner
never interprets it. Its member semantics are defined once, in
`conformance/README.md` under "v0.4 Expectation Entries" — not here.

The context deliberately carries **no expected result**. An adapter cannot
derive a verdict from it, only the conditions under which to compute one.

### Backward compatibility

The context extension is additive and out-of-band:

- Stdin and the HTTP body carry the fixture document and nothing else. The
  runner now sends the **original file bytes**, preserving member order,
  whitespace, escapes, duplicates and malformed JSON. Older runner versions
  parsed and reserialized fixtures, which silently erased duplicate members.
- Existing adapters can continue to ignore the environment variable and
  headers; they still receive a standalone JSON document to ingest themselves.

The programmatic transport helpers accept a `Buffer` or string as a raw
document. Existing object-payload callers still get `JSON.stringify` transport;
an object cannot retain duplicate-member evidence. `loadExpectedSuites` returns
`fixtureBytes` (a `Buffer`) for each fixture, and `runConformanceSuite` passes
those bytes as the first argument to `invokeAdapter`. Custom callbacks that
previously consumed parsed objects must now perform their own ingestion.

Only `expected.json` is parsed by the loader. A malformed fixture reaches the
adapter and must produce a `reject` verdict; a malformed expectation file still
fails loading. An HTTP adapter should return a successful transport response
containing that verdict so the runner records a rejection, not a transport error.
Expected outcomes remain outside the adapter context.

### Why the context is not merged into the fixture

Injecting members into the fixture document would change the bytes an adapter
canonicalizes. The v0.4 signing input excludes only `signature`,
`presentationProof`, and `postQuantumSignature`, so any injected member would
land inside the signing input and break signature verification on every signed
fixture. The context therefore travels beside the document, never inside it.

### Precedence against the embedded `__validate` sentinel

Some fixtures embed a `__validate` member. Per `conformance/README.md` it is a
**fallback only**: the entry's `validationMode` wins when present, and
`__validate` applies when it is absent. Both shipped adapters implement that
precedence.

## Usage

From `conformance/runner`:

Command mode, the v0.5 suite:

```bash
node ./cli.mjs \
  --mode command \
  --adapter-command "node ../adapters/typescript/adapter.mjs" \
  --versions 0.5 \
  --report ./conformance-report.json
```

HTTP mode, the v0.5 suite:

```bash
node ./cli.mjs \
  --mode http \
  --adapter-endpoint http://127.0.0.1:8788/validate \
  --versions 0.5 \
  --report ./conformance-report.json
```

These need the v0.4 or v0.2 index, which the v0.5 release copy does not carry:

The v0.4 corpus (79 vectors):

```bash
node ./cli.mjs \
  --mode command \
  --adapter-command "node ../adapters/typescript/adapter.mjs" \
  --versions 0.4 \
  --report ./conformance-report-v04.json
```

Baseline-only mode (exclude extended fixtures):

```bash
node ./cli.mjs \
  --mode command \
  --adapter-command "node ../adapters/typescript/adapter.mjs" \
  --versions 0.2 \
  --baseline \
  --report ./conformance-report.json
```

## Useful options

- `--versions 0.5` (supported: `0.1`, `0.2`, `0.4`, `0.5`; default `0.1,0.2`, which the v0.5
  release copy does not carry)
- `--baseline` (run baseline fixtures only)
- `--timeout-ms 15000`
- `--conformance-root conformance`
- `--suite-version 1.0.0`
- `--impl-name my-validator`
- `--impl-version 1.2.3`
- `--impl-language rust`
- `--impl-organization Acme`
- `--impl-repository https://github.com/acme/my-validator`

## Fixture resolution

An entry's `filename` is relative to its version package (`valid/...` or
`invalid/...`). The runner tries, in order: the version package, the conformance
root, the repository root, then `examples/<version>/` (not in the v0.5
release copy) — the canonical fixture
source for v0.1–v0.3 per `conformance/README.md`. Because the `examples/` trees
are flat, the final two candidates strip the `valid/` / `invalid/` classifier
segment.

The `examples/` candidates are last, so any filename that resolves inside its
version package resolves there and the fallback cannot re-point it.

## Report schema coverage

The schema file is not in the v0.5 release copy.

`conformance/schema/conformance-report.schema.json` enumerates `0.1`, `0.2`,
`0.3`, and `0.4` — in `specVersionsTested`, in the `results` version keys, in
`conformanceLevel`, and in each detail's `specVersion`. Every version this
runner can execute produces a report that validates against that schema, so
there is no version-dependent notice and no non-validating artifact.

Fixture details may include `assertionFailures` and `actualChecks` string
arrays, `actualBehavior`, `expectedReceiptAssertions`, and `actualReceipt`.
The fourteen expectation names and their shapes are closed. Actual behavior
and receipt values are raw JSON evidence, including malformed values such as
`false`, `0`, or `null`; schema validation does not certify a receipt or its
cryptography. These fields are optional, so existing reports remain valid.
The report and fixture containers continue to reject unknown properties.

`determineConformanceLevel` reports `v0.4-baseline` / `v0.4-extended` using the
level vocabulary already defined in `conformance/README.md`.

## Running from the public repository

The public copy carries the runner, the TypeScript adapter and the TypeScript reference package as source, without tests, built output or dependencies. Build the package once, then run the suite:

```bash
cd packages/universal-manifest && npm ci && npx tsc -p tsconfig.json
```

```bash
cd conformance/runner && node cli.mjs --mode command --adapter-command "node ../adapters/typescript/adapter.mjs" --versions 0.5 --report /absolute/path/report.json
```

Always pass `--report`. The public copy has no runner tests, so `npm test` there finds none.

## npm scripts

They use the default versions or the v0.4 index, which the v0.5 release copy does not carry:

- `npm test` -> run core tests
- `npm run run:typescript-adapter` -> run command-mode suite against TS reference adapter
- `npm run run:typescript-adapter:http` -> run HTTP-mode suite (expects adapter server running)
- `npm run run:typescript-adapter:v04` -> run the v0.4 corpus against the TS reference adapter

## Not in the public copy

The runner's regression tests and its private capability-accounting opt-in stay in the private repository. Without the private contract, the runner refuses that opt-in and runs every ordinary suite unchanged.
