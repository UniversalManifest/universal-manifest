#!/usr/bin/env node
import { CONTEXT_ENV_VAR, evaluateFixture, parseConformanceContext } from './lib.mjs'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function main() {
  const input = await readStdin()

  // Adapter contract 1.1: stdin carries the fixture and nothing else; the
  // per-fixture conformance context arrives in the environment.
  const context = parseConformanceContext(process.env[CONTEXT_ENV_VAR])

  const result = evaluateFixture(input, context)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main().catch((error) => {
  const reason = error instanceof Error ? error.message : String(error)
  process.stdout.write(`${JSON.stringify({ fixture: 'stdin-fixture', result: 'reject', reason })}\n`)
})
