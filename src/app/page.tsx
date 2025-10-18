"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

type JobStatusResponse = {
  jobId: string
  runId: string
  status: string
  result: unknown
  error: unknown
  createdAt: number | null
  finishedAt: number | null
  elapsedTime: number | null
}

type LogPayload = {
  status?: string
  logs?: unknown[]
  error?: unknown
}

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [jobId, setJobId] = useState("")
  const [runId, setRunId] = useState("")
  const [status, setStatus] = useState("")
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
    }
  }, [])

  const canStart = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading])

  const startJob = useCallback(async () => {
    if (!canStart) return

    eventSourceRef.current?.close()
    setLoading(true)
    setError(null)
    setLogs([])
    setStatus("running")
    setJobId("")
    setRunId("")

    try {
      const response = await fetch("/api/jobs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: { input_text: prompt } }),
      })

      if (!response.ok) {
        throw new Error(`Failed to start job (${response.status})`)
      }

      const data: { jobId: string; runId: string } = await response.json()
      setJobId(data.jobId)
      setRunId(data.runId)
    } catch (err) {
      setStatus("")
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [canStart, prompt])

  const checkStatus = useCallback(async () => {
    if (!jobId) return
    setError(null)

    try {
      const response = await fetch(`/api/jobs/${jobId}/status`)
      if (!response.ok) {
        throw new Error(`Status request failed (${response.status})`)
      }
      const data: JobStatusResponse = await response.json()
      setStatus(data.status)
      if (data.error) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [jobId])

  const subscribeLogs = useCallback(() => {
    if (!jobId || !runId) return

    eventSourceRef.current?.close()
    const source = new EventSource(`/api/logs/stream?jobId=${encodeURIComponent(jobId)}&runId=${encodeURIComponent(runId)}`)
    eventSourceRef.current = source

    source.onmessage = (event) => {
      try {
        const payload: LogPayload = JSON.parse(event.data)
        if (payload.status) setStatus(payload.status)
        if (payload.error) {
          setError(typeof payload.error === "string" ? payload.error : JSON.stringify(payload.error))
        }
        if (Array.isArray(payload.logs)) {
          const formattedLogs = payload.logs.map((item) => JSON.stringify(item))
          if (formattedLogs.length > 0) {
            setLogs((prev) => [...prev, ...formattedLogs])
          }
        }
        if (payload.status && payload.status !== "running") {
          source.close()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    source.onerror = () => {
      source.close()
    }
  }, [jobId, runId])

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
        <header>
          <h1 className="text-3xl font-semibold">Dify Long-Run Workflow Demo</h1>
          <p className="mt-2 text-sm text-slate-600">
            フォーム送信で Dify ワークフローを起動し、ブラウザを閉じても完走するバックグラウンド実行を検証します。
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
            プロンプト
            <textarea
              className="w-full resize-y rounded border border-slate-300 px-3 py-2 text-base shadow-sm outline-none focus:border-slate-500"
              rows={4}
              placeholder="ワークフローに渡したい入力を記述してください"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={startJob}
              disabled={!canStart}
              className="rounded bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Starting..." : "Start"}
            </button>
            <button
              type="button"
              onClick={checkStatus}
              disabled={!jobId}
              className="rounded border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Status
            </button>
            <button
              type="button"
              onClick={subscribeLogs}
              disabled={!runId}
              className="rounded border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ログ表示 (SSE)
            </button>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-700">jobId</dt>
              <dd className="break-all font-mono text-xs text-slate-600">{jobId || "-"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">runId</dt>
              <dd className="break-all font-mono text-xs text-slate-600">{runId || "-"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">status</dt>
              <dd className="text-base font-semibold text-slate-900">{status || "-"}</dd>
            </div>
            {error && (
              <div className="sm:col-span-2">
                <dt className="font-semibold text-red-600">error</dt>
                <dd className="break-all rounded bg-red-50 p-2 text-xs text-red-700">{error}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800">Workflow Logs</h2>
          <p className="mt-1 text-xs text-slate-500">
            Dify API のログ検索結果を 2 秒間隔でポーリングし、SSE 経由で新着のみを追記します。
          </p>
          <pre className="mt-4 max-h-80 overflow-auto rounded bg-slate-900 p-4 text-xs text-slate-100">
            {logs.length ? logs.join("\n\n") : "ログはまだありません"}
          </pre>
        </section>
      </div>
    </main>
  )
}
