import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { ADAPTER_CONTRACT_VERSION, createAdapterInvoker } from './adapter-clients.mjs'
import { SUPPORTED_SPEC_VERSIONS, normalizeSpecVersion, runConformanceSuite, writeReport } from './core.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_CONFORMANCE_ROOT = path.resolve(__dirname, '..', '..')

function usage() {
  return [
    'Universal Manifest Conformance Runner',
    '',
    'Usage:',
    '  node cli.mjs --mode command --adapter-command "node ../adapters/typescript/adapter.mjs" --report ./report.json',
    '  node cli.mjs --mode http --adapter-endpoint http://127.0.0.1:8788/validate --report ./report.json',
    '',
    'Options:',
    '  --mode <command|http>            Adapter invocation mode (required)',
    '  --adapter-command <string>       Command to execute for command mode',
    '  --adapter-endpoint <url>         Endpoint URL for HTTP mode',
    '  --report <path>                  Report file path (default: ./conformance-report.json)',
    '  --conformance-root <path>        Path to conformance root (default: ../ from runner)',
    `  --versions <csv>                 Spec versions to test (supported: ${SUPPORTED_SPEC_VERSIONS.join(',')}; default: 0.1,0.2)`,
    '  --timeout-ms <number>            Per-fixture timeout in milliseconds (default: 15000)',
    '  --baseline                       Run baseline fixtures only (exclude extended fixtures)',
    '  --suite-version <string>         Explicit suite version override',
    '  --impl-name <string>             Implementation name',
    '  --impl-version <string>          Implementation version',
    '  --impl-language <string>         Implementation language',
    '  --impl-organization <string>     Organization name',
    '  --impl-repository <string>       Repository URL',
    '  --help                           Show this help',
  ].join('\n')
}

function parseVersions(rawVersions) {
  const input = typeof rawVersions === 'string' ? rawVersions : '0.1,0.2'
  const values = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeSpecVersion)

  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

async function loadDefaultSuiteVersion(conformanceRoot) {
  const packageJsonPath = path.join(conformanceRoot, 'package.json')
  try {
    const raw = await fs.readFile(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.version === 'string' && parsed.version.length > 0) {
      return parsed.version
    }
  } catch {
    // Fall back to stable default when package metadata is missing.
  }

  return '1.0.0'
}

function buildImplementationMetadata(values) {
  return {
    name: values['impl-name'] ?? 'unknown-implementation',
    version: values['impl-version'] ?? '0.0.0',
    language: values['impl-language'] ?? 'unknown',
    organization: values['impl-organization'] ?? 'unknown',
    repository: values['impl-repository'] ?? 'unknown',
  }
}

export async function runCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      mode: { type: 'string' },
      'adapter-command': { type: 'string' },
      'adapter-endpoint': { type: 'string' },
      report: { type: 'string' },
      'conformance-root': { type: 'string' },
      versions: { type: 'string' },
      'timeout-ms': { type: 'string' },
      baseline: { type: 'boolean' },
      'suite-version': { type: 'string' },
      'impl-name': { type: 'string' },
      'impl-version': { type: 'string' },
      'impl-language': { type: 'string' },
      'impl-organization': { type: 'string' },
      'impl-repository': { type: 'string' },
      help: { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.help) {
    process.stdout.write(`${usage()}\n`)
    return
  }

  const mode = values.mode
  if (mode !== 'command' && mode !== 'http') {
    throw new Error('--mode must be one of: command, http')
  }

  const adapterCommand = values['adapter-command']
  const adapterEndpoint = values['adapter-endpoint']

  if (mode === 'command' && (!adapterCommand || adapterCommand.trim().length === 0)) {
    throw new Error('--adapter-command is required in command mode')
  }

  if (mode === 'http' && (!adapterEndpoint || adapterEndpoint.trim().length === 0)) {
    throw new Error('--adapter-endpoint is required in http mode')
  }

  const conformanceRoot = path.resolve(values['conformance-root'] ?? DEFAULT_CONFORMANCE_ROOT)
  const versions = parseVersions(values.versions)
  const suiteVersion = values['suite-version'] ?? (await loadDefaultSuiteVersion(conformanceRoot))
  const reportPath = path.resolve(values.report ?? path.join(process.cwd(), 'conformance-report.json'))
  const timeoutMs = Number(values['timeout-ms'] ?? 15000)

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number')
  }

  const invokeAdapter = createAdapterInvoker({
    mode,
    command: adapterCommand,
    endpoint: adapterEndpoint,
    timeoutMs,
  })

  const implementation = buildImplementationMetadata(values)

  const report = await runConformanceSuite({
    conformanceRoot,
    versions,
    implementation,
    suiteVersion,
    baselineOnly: values.baseline ?? false,
    invokeAdapter,
  })

  const outputPath = await writeReport(report, reportPath)

  process.stdout.write(`Conformance report written: ${outputPath}\n`)
  process.stdout.write(`Adapter contract: ${ADAPTER_CONTRACT_VERSION}\n`)
  if (values.baseline) {
    process.stdout.write('Fixture selection: baseline-only\n')
  }

  process.stdout.write(`Pass: ${report.pass}\n`)
  for (const version of versions.map((value) => `v${value}`)) {
    const summary = report.results[version]
    if (!summary) continue
    process.stdout.write(
      `${version} -> total: ${summary.total}, passed: ${summary.passed}, failed: ${summary.failed}, skipped: ${summary.skipped}\n`
    )
  }

  if (!report.pass) {
    process.exitCode = 1
  }
}
