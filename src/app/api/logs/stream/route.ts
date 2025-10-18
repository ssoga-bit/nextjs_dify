import { NextRequest } from 'next/server'
import { fetchLogs, fetchRunDetail } from '@/lib/dify'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type WorkflowDetail = {
  status?: string
}

type LogItem = {
  id?: string
  workflow_run?: {
    id?: string
  }
  [key: string]: unknown
}

type LogsResponse = {
  data?: LogItem[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')
  if (!runId) {
    return new Response('runId is required', { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const sentLogIds = new Set<string>()
      const deadline = Date.now() + 1000 * 300

      const push = (payload: unknown) => {
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(payload)}\n\n`))
      }

      while (Date.now() < deadline) {
        try {
          const [detail, logs] = await Promise.all([
            fetchRunDetail(runId),
            fetchLogs(runId),
          ])

          const status = (detail as WorkflowDetail)?.status ?? 'running'
          const logResponse = logs as LogsResponse
          const items = Array.isArray(logResponse.data) ? logResponse.data : []

          const freshLogs = []
          for (const item of items) {
            const id = typeof item.id === 'string' ? item.id : undefined
            if (id && !sentLogIds.has(id)) {
              sentLogIds.add(id)
              freshLogs.push(item)
            }
          }

          if (freshLogs.length > 0 || status !== 'running') {
            if (freshLogs.length > 0) {
              console.log('[logs/stream] new logs', { runId, count: freshLogs.length })
            }
            if (status !== 'running') {
              console.log('[logs/stream] status update', { runId, status })
            }
            push({ status, logs: freshLogs })
          }

          if (status !== 'running') {
            break
          }
        } catch (error) {
          console.error('[logs/stream] error', { runId, error })
          push({ status: 'unknown', error: error instanceof Error ? error.message : String(error) })
        }

        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
