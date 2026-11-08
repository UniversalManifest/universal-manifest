#!/usr/bin/env node
import http from 'node:http'

import { CONTEXT_HEADER, evaluateFixture, parseConformanceContext } from './lib.mjs'

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json')
  res.end(`${JSON.stringify(payload)}\n`)
}

async function handleValidate(req, res) {
  let body
  try {
    body = await readRequestBody(req)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    sendJson(res, 400, { fixture: 'http-fixture', result: 'reject', reason: `failed to read body: ${reason}` })
    return
  }

  // Adapter contract 1.1: the body carries the fixture and nothing else; the
  // per-fixture conformance context arrives in a request header.
  const context = parseConformanceContext(req.headers[CONTEXT_HEADER])

  // A malformed document is a conformance reject, not a transport failure.
  sendJson(res, 200, evaluateFixture(body, context))
}

function main() {
  const port = Number(process.env.PORT ?? 8788)

  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/validate') {
      handleValidate(req, res).catch((error) => {
        const reason = error instanceof Error ? error.message : String(error)
        sendJson(res, 500, { fixture: 'http-fixture', result: 'reject', reason })
      })
      return
    }

    if (req.method === 'GET' && req.url === '/healthz') {
      sendJson(res, 200, { status: 'ok' })
      return
    }

    sendJson(res, 404, {
      fixture: 'http-fixture',
      result: 'reject',
      reason: 'not found',
    })
  })

  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`TypeScript adapter server listening on http://127.0.0.1:${port}\n`)
  })
}

main()
