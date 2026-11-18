import { checkEndpoints } from './checks.js'

const get = id => document.getElementById(id)
const rows = get('server-rows')
const filters = [...document.querySelectorAll('[data-filter]')]
const runButton = get('run-check')
const search = get('search')
const previousPage = get('previous-page')
const nextPage = get('next-page')
const pageSize = 30
const stateLabels = {
  pending: 'Pending',
  online: 'Responded',
  error: 'HTTP error',
  unreachable: 'Unconfirmed'
}
const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })
let results = []
let lastCheckedAt = null
let checking = false
let checkedCount = 0
let filter = 'all'
let page = 0

const hasIssue = result => ['error', 'unreachable'].includes(result.state)
const responded = result => result.state === 'online'

function renderRows() {
  if (!results.length) return
  const query = search.value.trim().toLowerCase()
  const matches = results.filter(result =>
    (filter === 'all' || (filter === 'online' ? responded(result) : hasIssue(result))) &&
    [result.name, result.provider, result.url].some(value => value.toLowerCase().includes(query))
  )
  const lastPage = Math.max(0, Math.ceil(matches.length / pageSize) - 1)
  page = Math.min(lastPage, page)
  const start = page * pageSize
  const visible = matches.slice(start, start + pageSize)

  const fragment = document.createDocumentFragment()
  for (const result of visible) {
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
  get('pagination').hidden = matches.length <= pageSize
  get('page-range').textContent = (start + 1) + '–' + (start + visible.length) + ' of ' + matches.length
  previousPage.disabled = page === 0
  nextPage.disabled = page === lastPage
}

function renderResults() {
  const count = results.filter(responded).length
  const issues = results.filter(hasIssue).length
  get('available-count').textContent = checkedCount ? count : '—'
  get('issue-count').textContent = checkedCount ? issues : '—'
  get('total-count').textContent = results.length
  const groups = [['online', count], ['unreachable', issues], ['pending', results.length - count - issues]]
  const blocks = groups.filter(([, size]) => size > 0).map(([state, size]) => {
    const block = document.createElement('i')
    block.dataset.state = state
    block.style.flexGrow = size
    return block
  })
  get('status-strip').replaceChildren(...blocks)
  if (lastCheckedAt && !checking) {
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

  get('check-progress').textContent = 'Checked ' + checkedCount + ' of ' + results.length
}

async function runChecks() {
  if (!results.length || checking) return
  checking = true
  checkedCount = 0
  results = results.map(result => ({ ...result, state: 'pending', detail: '', latencyMs: null }))
  renderResults()
  renderControls()
  await checkEndpoints(results, (start, batch) => {
    for (const [offset, result] of batch.entries()) {
      Object.assign(results[start + offset], result)
    }
    checkedCount = start + batch.length
    renderResults()
    renderControls()
  })
  checking = false
  lastCheckedAt = Date.now()
  renderResults()
  renderControls()
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
  } catch {
    get('connection-error').textContent = 'Could not load the server list. Reload this page to retry.'
    get('connection-error').hidden = false
    get('empty-state').hidden = true
    get('check-progress').textContent = 'Server list unavailable'
    return
  }
  void runChecks()
}

runButton.addEventListener('click', () => void runChecks())
search.addEventListener('input', () => {
  page = 0
  renderRows()
})
previousPage.addEventListener('click', () => {
  page--
  renderRows()
})
nextPage.addEventListener('click', () => {
  page++
  renderRows()
})
for (const button of filters) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter
    page = 0
    for (const option of filters) option.setAttribute('aria-pressed', String(option === button))
    renderRows()
  })
}

void start()
