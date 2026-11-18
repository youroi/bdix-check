import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkEndpoint } from './docs/checks.js'

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
