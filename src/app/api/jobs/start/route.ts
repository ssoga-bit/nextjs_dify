import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { kvSetJSON } from '@/lib/kv'
import { startWorkflowStreaming } from '@/lib/dify'

export const dynamic = 'force-dynamic'

const JOB_META_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

export async function POST(req: NextRequest) {
  const { inputs = {} } = await req.json().catch(() => ({ inputs: {} as Record<string, unknown> }))

  const jobId = randomUUID()
  const { runId } = await startWorkflowStreaming({ ...inputs, job_id: jobId })

  await kvSetJSON(`job:${jobId}:meta`, {
    jobId,
    runId,
    status: 'running',
    createdAt: Date.now(),
  }, JOB_META_TTL_SECONDS)

  return NextResponse.json({ jobId, runId })
}
