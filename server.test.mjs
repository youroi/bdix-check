import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { test } from 'node:test'
import { setTimeout as wait } from 'node:timers/promises'
import { createChecker, loadTargets } from './server.mjs'

async function listen(t, server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    const closed = new Promise(resolve => server.close(resolve))
    server.closeAllConnections?.()
    return closed
  })
  return '127.0.0.1:' + server.address().port
}

test('the public starter list loads with both web and FTP endpoints', () => {
  const targets = loadTargets(new URL('./servers.json', import.meta.url))
  assert.ok(targets.some(target => target.url.startsWith('http:')))
  assert.ok(targets.some(target => target.url.startsWith('ftp:')))
})

test('checks HTTP and FTP, updates automatically, and accepts local manual checks', async t => {
  let followedRedirect = false
  const httpAddress = await listen(t, createServer((request, response) => {
    if (request.url === '/redirect') return response.writeHead(302, { Location: '/destination' }).end()
    if (request.url === '/destination') followedRedirect = true
    if (request.url === '/denied') return response.writeHead(403).end()
    response.end('OK')
  }))
  const ftpAddress = await listen(t, createTcpServer(socket => {
    socket.resume()
    socket.write('120 Waiting\r\n220-Example\r\n')
    socket.end('220 Ready\r\n')
  }))
  const timeoutAddress = await listen(t, createTcpServer(socket => {
    socket.resume()
  }))
  const targets = [
    ['HTTP ready', 'http://' + httpAddress + '/'],
    ['Redirect', 'http://' + httpAddress + '/redirect'],
    ['HTTP denied', 'http://' + httpAddress + '/denied'],
    ['FTP ready', 'ftp://' + ftpAddress + '/'],
    ['FTP timeout', 'ftp://' + timeoutAddress + '/']
  ].map(([name, url]) => ({ name, provider: 'Local test', url }))
  const address = await listen(t, createChecker(targets, {
    intervalMs: 900,
    timeoutMs: 500,
    manualCooldownMs: 700
  }))
  const origin = 'http://' + address
  const getStatus = async () => (await fetch(origin + '/api/status')).json()

  async function completedAfter(previousTime) {
    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      const state = await getStatus()
      if (!state.checking && state.lastCheckedAt > previousTime) return state
      await wait(30)
    }
    assert.fail('The checker did not finish a new round in time.')
  }

  const first = await completedAfter(0)
  assert.deepEqual(first.results.map(result => result.state), [
    'online', 'redirect', 'error', 'online', 'unreachable'
  ])
  assert.deepEqual(first.results.map(result => result.detail), [
    'HTTP 200', 'HTTP 302', 'HTTP 403', 'FTP 220 · Service ready', 'Connection timed out'
  ])
  assert.ok(first.results[3].latencyMs > 0)
  assert.equal(first.results[4].latencyMs, null)
  const crossOrigin = await fetch(origin + '/api/check', { method: 'POST', headers: { Origin: 'http://example.com' } })
  assert.equal(crossOrigin.status, 403)
  const manual = () => fetch(origin + '/api/check', { method: 'POST', headers: { Origin: origin } })
  assert.equal((await manual()).status, 202)
  assert.equal((await manual()).status, 429)
  const second = await completedAfter(first.lastCheckedAt)
  const third = await completedAfter(second.lastCheckedAt)
  assert.ok(third.nextCheckAt > third.lastCheckedAt)
  assert.equal(third.results[0].state, 'online')
  assert.equal(third.results[3].state, 'online')
  assert.equal(followedRedirect, false)

  const dashboard = await fetch(origin)
  assert.equal(dashboard.status, 200)
  assert.match(await dashboard.text(), /BDIX server check/)
})
