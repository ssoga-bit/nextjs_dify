import { NextRequest, NextResponse } from 'next/server'
import { kvSetJSON } from '@/lib/kv'

export const dynamic = 'force-dynamic'

const CALLBACK_SECRET = process.env.CALLBACK_SECRET
const JOB_META_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

if (!CALLBACK_SECRET) {
  throw new Error('CALLBACK_SECRET is not set')
}

type CallbackPayload = {
  jobId?: string
  workflow_run_id?: string
  status?: string
  outputs?: unknown
  error?: unknown
  elapsed_time?: number
}

export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get('x-callback-secret')
  if (!secretHeader || secretHeader !== CALLBACK_SECRET) {
    return new NextResponse('unauthorized', { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as CallbackPayload
  const { jobId, workflow_run_id: runId, status, outputs, error, elapsed_time: elapsedTime } = body

  if (!jobId || !runId) {
    return new NextResponse('bad request', { status: 400 })
  }

  const resolvedStatus = status ?? (error ? 'failed' : 'succeeded')

  await kvSetJSON(`job:${jobId}:meta`, {
    jobId,
    runId,
    status: resolvedStatus,
    finishedAt: Date.now(),
    elapsedTime,
  }, JOB_META_TTL_SECONDS)

  await kvSetJSON(`job:${jobId}:result`, {
    outputs,
    error,
  }, JOB_META_TTL_SECONDS)

  return NextResponse.json({ ok: true })
}
