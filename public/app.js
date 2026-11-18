const get = id => document.getElementById(id)
const rows = get('server-rows')
const filters = [...document.querySelectorAll('[data-filter]')]
const runButton = get('run-check')
const search = get('search')
const stateLabels = {
  pending: 'Pending',
  online: 'Available',
  error: 'Service error',
  redirect: 'Redirect',
  unreachable: 'No response'
}
const time = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })
let snapshot = null
let filter = 'all'
let offline = false
let requesting = false
let inFlight = false
let manualRuns = 0

function hasIssue(result) {
  return result.state !== 'online' && result.state !== 'pending'
}

function renderRows() {
  if (!snapshot) return
  const query = search.value.trim().toLowerCase()
  const matches = snapshot.results.filter(result =>
    (filter === 'all' || (filter === 'online' ? result.state === 'online' : hasIssue(result))) &&
    [result.name, result.provider, result.url].some(value => value.toLowerCase().includes(query))
  )

  const fragment = document.createDocumentFragment()
  for (const result of matches) {
    const row = get('server-row').content.cloneNode(true)
    const url = new URL(result.url)
    const protocol = url.protocol.slice(0, -1)
    const address = row.querySelector('.address')
    const label = url.host + (url.pathname === '/' ? '' : url.pathname) + url.search
    row.querySelector('.server-name').textContent = result.name
    row.querySelector('.provider').textContent = result.provider
    row.querySelector('.protocol').textContent = protocol.toUpperCase()
    if (protocol === 'http' || protocol === 'https') {
      const link = document.createElement('a')
      link.href = url.href
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = label
      address.append(link)
    } else {
      address.textContent = url.hostname + ':' + (url.port || '21')
    }
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
  const { results, lastCheckedAt } = snapshot
  const available = results.filter(result => result.state === 'online').length
  const issues = results.filter(hasIssue).length
  get('available-count').textContent = lastCheckedAt ? available : '—'
  get('issue-count').textContent = lastCheckedAt ? issues : '—'
  get('total-count').textContent = results.length
  const blocks = results.map(result => {
    const block = document.createElement('i')
    block.dataset.state = result.state
    return block
  })
  get('status-strip').replaceChildren(...blocks)
  get('last-check').textContent = lastCheckedAt
    ? 'Last checked at ' + time.format(lastCheckedAt)
    : 'Waiting for the first check'
  if (lastCheckedAt) {
    get('announcement').textContent = 'Check complete. ' + available + ' of ' + results.length +
      ' endpoints available. ' + issues + ' with issues.'
  }
  renderRows()
}

function renderControls() {
  const checking = requesting || (!offline && snapshot?.checking)
  const cooldown = !offline && snapshot?.manualAfter > Date.now()
  runButton.setAttribute('aria-disabled', String(Boolean(!snapshot || offline || checking || cooldown)))
  runButton.dataset.checking = String(Boolean(checking))
  get('run-label').textContent = checking ? 'Checking…' : 'Check now'

  if (offline) get('schedule').textContent = 'Automatic checks unavailable'
  else if (checking) get('schedule').textContent = 'Check in progress'
  else if (snapshot?.nextCheckAt) {
    const remaining = Math.max(0, Math.ceil((snapshot.nextCheckAt - Date.now()) / 1000))
    get('schedule').textContent = 'Next check in ' + remaining + 's'
  }
}

function setConnection(connected) {
  offline = !connected
  const badge = get('connection')
  badge.dataset.state = connected ? 'online' : 'error'
  badge.textContent = connected ? 'Local checker' : 'Checker offline'
  const error = get('connection-error')
  if (!connected && error.hidden) {
    error.textContent = snapshot
      ? 'Could not reach the local checker. Showing the last available results.'
      : 'Could not reach the local checker. Start the app and reload this page.'
  }
  error.hidden = connected
  if (!connected && !snapshot) get('empty-state').hidden = true
}

function acceptSnapshot(next) {
  const update = !snapshot || snapshot.lastCheckedAt !== next.lastCheckedAt
  snapshot = next
  setConnection(true)
  if (update) renderResults()
  renderControls()
}

async function refresh() {
  if (inFlight || requesting) return
  inFlight = true
  const currentRun = manualRuns
  try {
    const response = await fetch('/api/status', { signal: AbortSignal.timeout(3000) })
    if (!response.ok) throw new Error('Checker unavailable')
    const next = await response.json()
    if (currentRun === manualRuns) acceptSnapshot(next)
  } catch {
    if (currentRun === manualRuns) {
      setConnection(false)
      renderControls()
    }
  } finally {
    inFlight = false
  }
}

runButton.addEventListener('click', async () => {
  if (runButton.getAttribute('aria-disabled') === 'true' || requesting) return
  requesting = true
  manualRuns += 1
  get('announcement').textContent = 'Check in progress.'
  renderControls()
  try {
    const response = await fetch('/api/check', { method: 'POST', signal: AbortSignal.timeout(3000) })
    if (!response.ok && response.status !== 429) throw new Error('Could not start a check')
    acceptSnapshot(await response.json())
  } catch {
    setConnection(false)
  } finally {
    requesting = false
    renderControls()
    void refresh()
  }
})

search.addEventListener('input', renderRows)
for (const button of filters) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter
    for (const option of filters) option.setAttribute('aria-pressed', String(option === button))
    renderRows()
  })
}

void refresh()
setInterval(() => void refresh(), 1000)
