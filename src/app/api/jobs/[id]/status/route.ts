import { NextRequest, NextResponse } from 'next/server'
import { kvGetJSON } from '@/lib/kv'

export const dynamic = 'force-dynamic'

type JobMeta = {
  jobId: string
  runId: string
  status: string
  createdAt?: number
  finishedAt?: number
  elapsedTime?: number
}

type JobResult = {
  outputs?: unknown
  error?: unknown
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ message: 'jobId is required' }, { status: 400 })
  }

  const [meta, result] = await Promise.all([
    kvGetJSON<JobMeta>(`job:${id}:meta`),
    kvGetJSON<JobResult>(`job:${id}:result`),
  ])

  if (!meta) {
    return NextResponse.json({ message: 'not found' }, { status: 404 })
  }

  return NextResponse.json({
    jobId: meta.jobId,
    runId: meta.runId,
    status: meta.status,
    createdAt: meta.createdAt ?? null,
    finishedAt: meta.finishedAt ?? null,
    elapsedTime: meta.elapsedTime ?? null,
    result: result?.outputs ?? null,
    error: result?.error ?? null,
  })
}
