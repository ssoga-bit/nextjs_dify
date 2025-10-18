function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

function getApiUrl() {
  return requireEnv(process.env.DIFY_API_URL, 'DIFY_API_URL')
}

function getApiKey() {
  return requireEnv(process.env.DIFY_API_KEY, 'DIFY_API_KEY')
}

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getApiKey()}`,
  }
}

type StartWorkflowInput = Record<string, unknown>

export async function startWorkflowStreaming(inputs: StartWorkflowInput) {
  const res = await fetch(`${getApiUrl()}/workflows/run`, {
    method: 'POST',
    headers: {
      ...buildHeaders(),
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      inputs,
      response_mode: 'streaming',
      user: 'web-user',
    }),
  })

  if (!res.ok || !res.body) {
    const message = await res.text().catch(() => '')
    throw new Error(`Dify workflow start failed: ${res.status} ${message}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const payload = JSON.parse(line.slice(6))
          if (payload?.event === 'workflow_started') {
            const runId = payload.workflow_run_id || payload?.data?.workflow_run_id
            if (!runId) continue
            await reader.cancel()
            return { runId, raw: payload }
          }
        } catch {
          // ignore malformed chunk and keep reading
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  throw new Error('Failed to obtain workflow_run_id from Dify')
}

export async function fetchRunDetail(runId: string) {
  const res = await fetch(`${getApiUrl()}/workflows/runs/${runId}`, {
    method: 'GET',
    headers: buildHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch run detail (${res.status})`)
  }
  return res.json()
}

export async function fetchLogs(runId: string) {
  const res = await fetch(`${getApiUrl()}/workflows/logs?workflow_run_id=${encodeURIComponent(runId)}`, {
    method: 'GET',
    headers: buildHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch workflow logs (${res.status})`)
  }
  return res.json()
}
