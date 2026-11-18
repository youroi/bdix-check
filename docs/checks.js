export async function checkEndpoint({ url }, probe = fetch) {
  const start = performance.now()
  const signal = AbortSignal.timeout(8000)
  const options = {
    method: 'HEAD',
    mode: 'no-cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'manual',
    referrerPolicy: 'no-referrer',
    signal
  }
  if (url.startsWith('http:')) options.targetAddressSpace = 'local'
  try {
    const response = await probe(url, options)
    const latencyMs = Math.max(1, Math.round(performance.now() - start))
    if (response.type === 'opaqueredirect') {
      return { state: 'redirect', detail: 'Server returned a redirect', latencyMs }
    }
    if (response.type === 'opaque') {
      return { state: 'online', detail: 'HTTP status hidden by browser', latencyMs }
    }
    return {
      state: response.ok ? 'online' : 'error',
      detail: 'HTTP ' + response.status,
      latencyMs
    }
  } catch {
    return {
      state: 'unreachable',
      detail: signal.aborted ? 'Timed out' : 'Blocked by browser or no route',
      latencyMs: null
    }
  }
}
