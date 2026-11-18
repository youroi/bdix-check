import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { performance } from 'node:perf_hooks'

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']]
].map(([path, [file, type]]) => [path, {
  body: readFileSync(new URL('./public/' + file, import.meta.url)),
  type
}]))

export function loadTargets(file) {
  const entries = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(entries) || !entries.length || entries.length > 50) {
    throw new Error('Add between 1 and 50 entries to the server list.')
  }

  const seen = new Set()
  return entries.map((entry, index) => {
    const number = index + 1
    if (typeof entry?.name !== 'string' || !entry.name.trim() ||
        typeof entry.provider !== 'string' || !entry.provider.trim() ||
        typeof entry.url !== 'string') {
      throw new Error('Entry ' + number + ' needs a name, provider, and URL.')
    }

    const url = URL.parse(entry.url)
    if (!url || !['http:', 'https:', 'ftp:'].includes(url.protocol) || !url.hostname ||
        url.username || url.password || url.hash ||
        (url.protocol === 'ftp:' && (url.pathname !== '/' && url.pathname !== '' || url.search))) {
      throw new Error('Entry ' + number + ' needs an HTTP(S) URL or an FTP host URL, with no credentials.')
    }
    if (seen.has(url.href)) throw new Error('Entry ' + number + ' repeats a URL.')
    seen.add(url.href)
    return { name: entry.name.trim(), provider: entry.provider.trim(), url: url.href }
  })
}

function checkFtp(url, signal) {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const socket = createConnection({ host, port: Number(url.port || 21), signal })
    let buffer = ''
    let received = 0
    let multilineCode = ''

    function finish(result) {
      resolve(result)
      socket.destroy()
    }

    socket.setEncoding('ascii')
    socket.on('error', reject)
    socket.on('close', () => reject(new Error('FTP connection closed.')))
    socket.on('data', chunk => {
      received += chunk.length
      if (received > 8192) {
        finish({ state: 'error', detail: 'FTP greeting exceeded 8 KB' })
        return
      }
      buffer += chunk
      let end
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, '')
        buffer = buffer.slice(end + 1)
        if (multilineCode && !line.startsWith(multilineCode + ' ')) continue

        const reply = /^(\d{3})([ -]|$)/.exec(line)
        if (!reply) {
          finish({ state: 'error', detail: 'Unexpected FTP greeting' })
          return
        }
        const [, code, separator] = reply
        if (separator === '-') {
          multilineCode = code
          continue
        }

        multilineCode = ''
        if (code === '120') continue
        finish({
          state: code === '220' ? 'online' : 'error',
          detail: code === '220' ? 'FTP 220 · Service ready' : 'FTP ' + code
        })
        return
      }
    })
  })
}

async function checkTarget(target, timeoutMs) {
  const start = performance.now()
  const signal = AbortSignal.timeout(timeoutMs)
  const url = new URL(target.url)
  try {
    let result
    if (url.protocol === 'ftp:') {
      result = await checkFtp(url, signal)
    } else {
      const response = await fetch(url, { redirect: 'manual', signal })
      const { status } = response
      response.body?.cancel().catch(() => {})
      result = {
        state: response.ok ? 'online' : status >= 300 && status < 400 ? 'redirect' : 'error',
        detail: 'HTTP ' + status
      }
    }
    return { ...result, latencyMs: Math.max(1, Math.round(performance.now() - start)) }
  } catch (error) {
    const code = error.cause?.code ?? error.code
    const detail = signal.aborted || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT'
      ? 'Connection timed out'
      : ({
          ECONNREFUSED: 'Connection refused',
          ENOTFOUND: 'DNS lookup failed',
          EAI_AGAIN: 'DNS lookup failed',
          EHOSTUNREACH: 'Network unreachable',
          ENETUNREACH: 'Network unreachable',
          ECONNRESET: 'Connection reset'
        }[code] ?? (url.protocol === 'ftp:' ? 'FTP greeting not received' : 'Connection failed'))
    return { state: 'unreachable', detail, latencyMs: null }
  }
}

export function createChecker(targets, {
  intervalMs = 60_000,
  timeoutMs = 5_000,
  manualCooldownMs = 5_000
} = {}) {
  let results = targets.map(target => ({ ...target, state: 'pending', detail: '', latencyMs: null }))
  let lastCheckedAt = null
  let nextCheckAt = null
  let manualAfter = 0
  let checking = false
  let timer
  let stopped = false

  async function runChecks() {
    if (checking || stopped) return
    clearTimeout(timer)
    checking = true
    nextCheckAt = null

    const checked = []
    for (let start = 0; start < targets.length && !stopped; start += 8) {
      const batch = await Promise.all(targets.slice(start, start + 8).map(async target =>
        ({ ...target, ...await checkTarget(target, timeoutMs) })))
      checked.push(...batch)
    }
    if (stopped) return

    results = checked
    lastCheckedAt = Date.now()
    nextCheckAt = lastCheckedAt + intervalMs
    checking = false
    timer = setTimeout(runChecks, intervalMs)
  }

  function reply(response, status, body, type = 'application/json; charset=utf-8') {
    response.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    })
    response.end(body)
  }

  const server = createServer((request, response) => {
    const { host, origin } = request.headers
    const port = server.address().port
    if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) {
      return reply(response, 403, '{"error":"Use the local checker address."}')
    }

    const snapshot = () => JSON.stringify({
      results, checking, lastCheckedAt, nextCheckAt, manualAfter, intervalMs
    })

    if (request.method === 'GET' && request.url === '/api/status') {
      return reply(response, 200, snapshot())
    }
    if (request.method === 'POST' && request.url === '/api/check') {
      if (origin !== 'http://' + host) return reply(response, 403, '{"error":"Use the local dashboard."}')
      if (checking || Date.now() < manualAfter) return reply(response, 429, snapshot())
      manualAfter = Date.now() + manualCooldownMs
      void runChecks()
      return reply(response, 202, snapshot())
    }

    const asset = assets.get(request.url)
    if (request.method === 'GET' && asset) return reply(response, 200, asset.body, asset.type)
    return reply(response, 404, '{"error":"Not found."}')
  })

  server.on('listening', runChecks)
  server.on('close', () => {
    stopped = true
    clearTimeout(timer)
  })
  return server
}

if (import.meta.main) {
  try {
    const file = process.env.BDIX_SERVERS_FILE ?? new URL('./servers.json', import.meta.url)
    const port = Number(process.env.BDIX_PORT ?? 4173)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('BDIX_PORT must be a port between 1 and 65535.')
    }
    const server = createChecker(loadTargets(file))
    server.on('error', error => {
      console.error('Could not start the checker:', error.message)
      process.exitCode = 1
    })
    server.listen(port, '127.0.0.1', () => console.log('BDIX Check is running at http://127.0.0.1:' + port))
  } catch (error) {
    console.error('Could not load the BDIX configuration:', error.message)
    process.exitCode = 1
  }
}
