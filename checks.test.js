import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { checkEndpoint, checkEndpoints } from './docs/checks.js'

test('local web checks use a credential-free HEAD request and accept an opaque response', async () => {
  const endpoint = { url: 'http://10.16.100.244/' }
  const result = await checkEndpoint(endpoint, async (url, options) => {
    assert.equal(url, endpoint.url)
    assert.equal(options.method, 'HEAD')
    assert.equal(options.targetAddressSpace, 'local')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.mode, 'no-cors')
    assert.equal(options.cache, 'no-store')
    return { type: 'opaque' }
  })
  assert.equal(result.state, 'online')
  assert.equal(result.detail, 'HTTP status hidden by browser')
  assert.ok(result.latencyMs > 0)
})

test('readable HTTP errors and blocked requests remain separate', async () => {
  const endpoint = { url: 'https://example.test/' }
  const response = await checkEndpoint(endpoint, async (url, options) => {
    assert.equal(options.targetAddressSpace, undefined)
    return new Response(null, { status: 503 })
  })
  const blocked = await checkEndpoint(endpoint, async () => { throw new TypeError('Failed to fetch') })
  assert.equal(response.detail, 'HTTP 503')
  assert.equal(response.state, 'error')
  assert.deepEqual(blocked, {
    state: 'unreachable', detail: 'Blocked by browser or no route', latencyMs: null
  })
})

test('large lists check 12 endpoints at a time and report each completed batch', async () => {
  const started = []
  const batches = []
  const round = checkEndpoints(Array.from({ length: 31 }, (_, index) => index), (start, batch) => {
    batches.push([start, batch.length])
  }, endpoint => new Promise(resolve => {
    started.push(() => resolve(endpoint))
  }))

  for (const expected of [12, 12, 7]) {
    assert.equal(started.length, expected)
    started.splice(0).forEach(resolve => resolve())
    await setImmediate()
  }
  await round
  assert.deepEqual(batches, [[0, 12], [12, 12], [24, 7]])
})

test('published catalogue contains hundreds of unique web URLs', () => {
  const endpoints = JSON.parse(readFileSync(new URL('./docs/servers.json', import.meta.url), 'utf8'))
  const urls = endpoints.map(endpoint => new URL(endpoint.url))
  assert.ok(urls.length >= 300 && urls.length <= 400)
  assert.equal(new Set(urls.map(url => url.href)).size, urls.length)
  assert.ok(urls.every(url => ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password))
})
