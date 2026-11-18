import { checkEndpoint } from './checks.js'

const get = id => document.getElementById(id)
const rows = get('server-rows')
const filters = [...document.querySelectorAll('[data-filter]')]
const runButton = get('run-check')
const search = get('search')
const stateLabels = {
  pending: 'Pending',
  online: 'Responded',
  error: 'HTTP error',
  redirect: 'Redirect',
  unreachable: 'Unconfirmed'
}
const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })
let results = []
let lastCheckedAt = null
let nextCheckAt = null
let checking = false
let filter = 'all'

const hasIssue = result => ['error', 'unreachable'].includes(result.state)
const responded = result => ['online', 'redirect'].includes(result.state)

function renderRows() {
  if (!results.length) return
  const query = search.value.trim().toLowerCase()
  const matches = results.filter(result =>
    (filter === 'all' || (filter === 'online' ? responded(result) : hasIssue(result))) &&
    [result.name, result.provider, result.url].some(value => value.toLowerCase().includes(query))
  )

  const fragment = document.createDocumentFragment()
  for (const result of matches) {
    const row = get('server-row').content.cloneNode(true)
    const url = new URL(result.url)
    row.querySelector('.server-name').textContent = result.name
    row.querySelector('.provider').textContent = result.provider
    row.querySelector('.protocol').textContent = url.protocol.slice(0, -1).toUpperCase()
    const link = row.querySelector('.address a')
    link.href = url.href
    link.textContent = url.host + (url.pathname === '/' ? '' : url.pathname) + url.search
    const status = row.querySelector('.status')
    status.dataset.state = result.state
    status.textContent = stateLabels[result.state]
    row.querySelector('.detail').textContent = result.detail
    row.querySelector('.latency').textContent = result.latencyMs === null ? '—' : result.latencyMs + ' ms'
    fragment.append(row)
  }

  const focusedLink = rows.contains(document.activeElement) ? document.activeElement.href : null
  rows.replaceChildren(fragment)
  if (focusedLink) [...rows.querySelectorAll('a')].find(link => link.href === focusedLink)?.focus()
  get('empty-state').hidden = matches.length > 0
  get('empty-state').textContent = 'No servers match this filter.'
}

function renderResults() {
  const count = results.filter(responded).length
  const issues = results.filter(hasIssue).length
  get('available-count').textContent = lastCheckedAt ? count : '—'
  get('issue-count').textContent = lastCheckedAt ? issues : '—'
  get('total-count').textContent = results.length
  const blocks = results.map(result => {
    const block = document.createElement('i')
    block.dataset.state = result.state
    return block
  })
  get('status-strip').replaceChildren(...blocks)
  if (lastCheckedAt) {
    get('last-check').textContent = 'Last checked at ' + time.format(lastCheckedAt)
    get('announcement').textContent = 'Check complete. ' + count + ' of ' + results.length +
      ' endpoints responded. ' + issues + ' with issues.'
  }
  renderRows()
}

function renderControls() {
  runButton.setAttribute('aria-disabled', String(!results.length || checking))
  runButton.dataset.checking = String(checking)
  get('run-label').textContent = checking ? 'Checking…' : 'Check now'

  if (checking) get('schedule').textContent = 'Check in progress'
  else if (nextCheckAt) {
    const remaining = Math.max(0, Math.ceil((nextCheckAt - Date.now()) / 1000))
    get('schedule').textContent = 'Next check in ' + remaining + 's'
  }
}

async function runChecks() {
  if (!results.length || checking) return
  checking = true
  renderControls()
  results = await Promise.all(results.map(async result => ({ ...result, ...await checkEndpoint(result) })))
  checking = false
  lastCheckedAt = Date.now()
  nextCheckAt = lastCheckedAt + 60_000
  renderResults()
  renderControls()
}

function tick() {
  if (document.hidden) return
  if (nextCheckAt && Date.now() >= nextCheckAt) void runChecks()
  else renderControls()
}

async function start() {
  try {
    const response = await fetch('./servers.json')
    if (!response.ok) throw new Error('Could not load the server list')
    const listing = await response.json()
    if (!Array.isArray(listing) || !listing.length) throw new Error('Empty server list')
    results = listing.map(({ name, provider, url }) => {
      const endpoint = new URL(url)
      if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
          typeof name !== 'string' || typeof provider !== 'string') {
        throw new Error('Invalid server entry')
      }
      return { name, provider, url: endpoint.href, state: 'pending', detail: '', latencyMs: null }
    })
    renderResults()
  } catch {
    get('connection-error').textContent = 'Could not load the server list. Reload this page to retry.'
    get('connection-error').hidden = false
    get('empty-state').hidden = true
    get('schedule').textContent = 'Server list unavailable'
    return
  }
  void runChecks()
  setInterval(tick, 1000)
  document.addEventListener('visibilitychange', tick)
}

runButton.addEventListener('click', () => void runChecks())
search.addEventListener('input', renderRows)
for (const button of filters) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter
    for (const option of filters) option.setAttribute('aria-pressed', String(option === button))
    renderRows()
  })
}

void start()
