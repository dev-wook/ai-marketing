import { after } from 'next/server'

const workerPath = '/api/ai-place-diagnosis/harness/worker'
const defaultDelayMs = 1000

export function scheduleAiPlaceHarnessWorkerRun({
  delayMs = defaultDelayMs,
  origin,
}: {
  origin: string
  delayMs?: number
}) {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.warn('AI place harness background worker skipped: CRON_SECRET is not configured.')
    return false
  }

  after(async () => {
    const safeDelayMs = Math.max(0, delayMs)

    if (safeDelayMs > 0) {
      await delay(safeDelayMs)
    }

    try {
      await fetch(new URL(workerPath, origin), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cronSecret}`,
          'x-aiva-worker-chain': '1',
        },
        cache: 'no-store',
      })
    } catch (error) {
      console.error('AI place harness background worker trigger failed', {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return true
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
