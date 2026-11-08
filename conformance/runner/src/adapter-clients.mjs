import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

// Transport-owned association: adapter JSON cannot mint an invocation receipt.
const commandInvocations = new WeakMap()
export function getCommandInvocation(result) {
  const record = result && typeof result === 'object' ? commandInvocations.get(result) : null
  return record ? structuredClone(record) : null
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * Adapter contract version carried on every conformance context.
 *
 * `1.0` was fixture-JSON only. `1.1` adds the out-of-band conformance context
 * described below. The payload is the original fixture bytes; an adapter that
 * ignores the context still receives a standalone document.
 */
export const ADAPTER_CONTRACT_VERSION = '1.1'

/** Command mode: the context arrives as this environment variable (JSON). */
export const CONTEXT_ENV_VAR = 'UM_CONFORMANCE_CONTEXT'

/** HTTP mode: the context arrives as these request headers. */
export const CONTEXT_HEADER = 'x-um-conformance-context'
export const SPEC_VERSION_HEADER = 'x-um-spec-version'
export const VALIDATION_MODE_HEADER = 'x-um-validation-mode'

/**
 * Build the per-fixture conformance context handed to the adapter.
 *
 * The context is delivered *beside* the payload, never inside it. Injecting
 * members into the fixture document would change the bytes an adapter
 * canonicalizes, and the v0.4 signing input excludes only `signature`,
 * `presentationProof`, and `postQuantumSignature` — so any injected member
 * would break signature verification on every signed fixture.
 *
 * `validationMode` and `evaluationContext` are omitted when the expectation
 * entry does not set them, so their absence is unambiguous.
 */
export function buildAdapterContext(fixture) {
  if (!fixture || typeof fixture !== 'object') return null

  const context = {
    contractVersion: ADAPTER_CONTRACT_VERSION,
    fixture: typeof fixture.filename === 'string' ? fixture.filename : '',
    specVersion: typeof fixture.specVersion === 'string' ? fixture.specVersion : '',
    conformanceLevel: typeof fixture.conformanceLevel === 'string' ? fixture.conformanceLevel : '',
    category: typeof fixture.category === 'string' ? fixture.category : '',
  }

  if (typeof fixture.validationMode === 'string' && fixture.validationMode.length > 0) {
    context.validationMode = fixture.validationMode
  }

  if (fixture.evaluationContext && typeof fixture.evaluationContext === 'object') {
    context.evaluationContext = fixture.evaluationContext
  }

  return context
}

/**
 * JSON with every non-ASCII code unit escaped, so the result is safe to carry
 * in an HTTP header value. `JSON.stringify` already escapes newlines and other
 * control characters; this closes the remaining gap.
 */
export function toHeaderSafeJson(value) {
  const json = JSON.stringify(value)
  let out = ''
  for (let index = 0; index < json.length; index += 1) {
    const unit = json.charCodeAt(index)
    // JSON.stringify already escaped the C0 controls, so anything still below
    // 0x7f is printable ASCII and passes through. Everything from 0x7f up is
    // escaped per UTF-16 code unit, which is also the correct JSON escape for
    // an astral code point (both surrogate halves are emitted).
    out += unit < 0x7f ? json[index] : `\\u${unit.toString(16).padStart(4, '0')}`
  }
  return out
}

function parseJsonFromOutput(stdout) {
  const trimmed = stdout.trim()
  if (trimmed.length === 0) {
    throw new Error('Adapter produced empty stdout; expected JSON output')
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    const lines = trimmed
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(lines[index])
      } catch {
        // Continue scanning for the most recent valid JSON line.
      }
    }
  }

  throw new Error('Adapter stdout did not contain parseable JSON')
}

function serializePayload(payload) {
  // Buffer/string inputs are already the document, including any violations
  // that its parser must see. Keep object callers' historical serialization.
  return Buffer.isBuffer(payload) || typeof payload === 'string' ? payload : JSON.stringify(payload)
}

export async function invokeCommandAdapter({ command, payload, timeoutMs, context = null, capture = null }) {
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error('Command mode requires a non-empty adapter command')
  }

  // The fixture and nothing else goes on stdin; contract 1.1 context rides
  // beside it in the child's environment.
  const stdin = serializePayload(payload)
  const contextJson = context === null ? null : JSON.stringify(context)
  const env = context === null ? { ...process.env } : { ...process.env, [CONTEXT_ENV_VAR]: contextJson }
  let record
  if (capture !== null) {
    if (!path.isAbsolute(capture.directory) || !Array.isArray(capture.identityFiles) || capture.identityFiles.length === 0)
      throw new Error('Command capture requires an absolute directory and pinned identity files')
    const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'"
    if (!path.isAbsolute(capture.executable) || !Array.isArray(capture.args) ||
        capture.args.some((s) => typeof s !== 'string') ||
        command !== [capture.executable, ...capture.args].map(quote).join(' ') ||
        capture.identityFiles[0].path !== capture.executable || process.env.NODE_OPTIONS)
      throw new Error('Captured command must match its pinned executable and literal arguments; NODE_OPTIONS must be absent')
    if (new Set(capture.identityFiles.map((p) => p.path)).size !== capture.identityFiles.length)
      throw new Error('Duplicate command identity pin')
    for (const key of Object.keys(env)) if (key.startsWith('UM_CONFORMANCE_')) delete env[key]
    if (contextJson !== null) env[CONTEXT_ENV_VAR] = contextJson
    const identities = []
    for (const pin of capture.identityFiles) {
      if (!path.isAbsolute(pin.path) || !/^[a-f0-9]{64}$/u.test(pin.sha256)) throw new Error('Malformed command identity pin')
      const actual = sha256(await fs.readFile(pin.path))
      if (actual !== pin.sha256) throw new Error('Command identity pin mismatch: ' + pin.path)
      identities.push({ ...pin, observedSha256: actual })
    }
    await fs.mkdir(capture.directory, { recursive: true })
    record = {
      id: randomUUID(), command, identityFiles: identities,
      executable: capture.executable, args: capture.args,
      payloadBase64: Buffer.from(stdin).toString('base64'), payloadSha256: sha256(stdin),
      contextJson, contextSha256: sha256(contextJson ?? ''), startedAt: new Date().toISOString(),
      processIdentity: 'spawned shell PID; executable/helper byte identities pinned separately',
    }
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    if (record) record.pid = child.pid ?? null

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      timedOut = true
      if (!record) reject(new Error(`Adapter command timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      if (!record) reject(error)
      else record.spawnError = error.message
    })

    child.on('close', async (code, signal) => {
      clearTimeout(timer)
      let parsed, failure
      try {
        if (timedOut) throw new Error(`Adapter command timed out after ${timeoutMs}ms`)
        if (code !== 0) throw new Error(`Adapter command exited with code ${code}${stderr.trim() ? ': ' + stderr.trim() : ''}`)
        parsed = parseJsonFromOutput(stdout)
        if (record) {
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            throw new Error('Captured adapter response must be a JSON object')
          for (const pin of record.identityFiles) {
            pin.afterSha256 = sha256(await fs.readFile(pin.path))
            if (pin.afterSha256 !== pin.sha256) throw new Error('Command identity changed during invocation')
          }
        }
      } catch (error) {
        failure = error
      }
      if (record) {
        Object.assign(record, { exitCode: code, signal, timedOut, stdout, stderr,
          endedAt: new Date().toISOString(), adapterResult: parsed ?? null, error: failure?.message ?? null })
        try {
          const file = path.join(capture.directory, record.id + '.json')
          const bytes = JSON.stringify(record, null, 2) + '\n'
          await fs.writeFile(file, bytes, { flag: 'wx' })
          const receipt = { ...record, reference: { path: file, sha256: sha256(bytes), pointer: '' } }
          if (parsed && typeof parsed === 'object') commandInvocations.set(parsed, structuredClone(receipt))
          if (failure) commandInvocations.set(failure, structuredClone(receipt))
        } catch (error) { failure = error }
      }
      if (failure) reject(failure)
      else resolve(parsed)
    })

    // A refused child can close stdin early; its awaited exit remains evidence.
    if (record) child.stdin.on('error', (error) => { record.stdinError = error.message })
    child.stdin.end(stdin)
  })
}

export async function invokeHttpAdapter({ endpoint, payload, timeoutMs, context = null }) {
  if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw new Error('HTTP mode requires a non-empty adapter endpoint')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // The fixture and nothing else goes in the body; contract 1.1 context rides
  // beside it in request headers. A server can ignore the unknown headers. The
  // two scalar headers are a convenience for adapters where parsing JSON out of
  // a header is awkward; the full context is always on CONTEXT_HEADER.
  const headers = { 'content-type': 'application/json' }
  if (context !== null) {
    headers[CONTEXT_HEADER] = toHeaderSafeJson(context)
    if (context.specVersion) headers[SPEC_VERSION_HEADER] = context.specVersion
    if (context.validationMode) headers[VALIDATION_MODE_HEADER] = context.validationMode
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: serializePayload(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Adapter endpoint ${endpoint} returned ${response.status}: ${body}`)
    }

    return await response.json()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Adapter endpoint timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function createAdapterInvoker({ mode, command, endpoint, timeoutMs, capture = null }) {
  const normalizedMode = String(mode ?? '').trim().toLowerCase()
  const normalizedTimeout = Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : 15000

  if (normalizedMode === 'command') {
    return async (payload, fixture) =>
      await invokeCommandAdapter({
        command,
        payload,
        timeoutMs: normalizedTimeout,
        context: buildAdapterContext(fixture),
        capture,
      })
  }

  if (normalizedMode === 'http') {
    return async (payload, fixture) =>
      await invokeHttpAdapter({
        endpoint,
        payload,
        timeoutMs: normalizedTimeout,
        context: buildAdapterContext(fixture),
      })
  }

  throw new Error(`Unsupported adapter mode: ${String(mode)}`)
}

export { parseJsonFromOutput }
