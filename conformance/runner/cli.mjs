#!/usr/bin/env node
import { runCli } from './src/cli.mjs'

runCli(process.argv.slice(2)).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Runner error: ${reason}\n`)
  process.exitCode = 1
})
