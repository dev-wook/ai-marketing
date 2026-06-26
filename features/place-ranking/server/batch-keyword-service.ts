import type {
  PlaceRankingBatchKeyword,
  PlaceRankingBatchRunResponse,
} from '../types'
import { collectNaverPlaceRankings } from './naver-place-rankings'
import { recordPlaceRankingSnapshots } from './ranking-snapshot-service'
import {
  createPlaceRankingBatchKeyword,
  deletePlaceRankingBatchKeyword,
  listPlaceRankingBatchKeywords,
  updatePlaceRankingBatchKeywordRunStatus,
} from './batch-keyword-repository'

export async function readPlaceRankingBatchKeywords() {
  return listPlaceRankingBatchKeywords()
}

export async function addPlaceRankingBatchKeyword(keyword: string) {
  const safeKeyword = normalizeKeyword(keyword)

  if (!safeKeyword) {
    throw new Error('추적할 키워드를 입력해주세요.')
  }

  return createPlaceRankingBatchKeyword(safeKeyword)
}

export async function removePlaceRankingBatchKeyword(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('삭제할 키워드 정보가 올바르지 않습니다.')
  }

  await deletePlaceRankingBatchKeyword(id)
}

export async function runPlaceRankingDailyBatch({
  snapshotDate,
}: {
  snapshotDate?: string
} = {}): Promise<PlaceRankingBatchRunResponse> {
  const keywords = await listPlaceRankingBatchKeywords({ activeOnly: true })
  const results: PlaceRankingBatchRunResponse['results'] = []

  for (const item of keywords) {
    const result = await runSingleKeyword(item, { snapshotDate })

    results.push(result)
  }

  const successCount = results.filter((result) => result.ok).length

  return {
    ranAt: new Date().toISOString(),
    totalKeywords: keywords.length,
    successCount,
    failureCount: results.length - successCount,
    results,
  }
}

async function runSingleKeyword(
  item: PlaceRankingBatchKeyword,
  {
    snapshotDate,
  }: {
    snapshotDate?: string
  } = {},
) {
  try {
    const ranking = await collectNaverPlaceRankings({
      keyword: item.keyword,
      limit: 75,
    })
    const snapshot = await recordPlaceRankingSnapshots({
      keyword: ranking.keyword,
      snapshotDate,
      items: ranking.items,
    })
    const changeSummary = summarizeRankChanges(snapshot.changesByPlaceId)
    const message = snapshot.snapshotDate
      ? `${snapshot.snapshotDate} 기준 ${snapshot.totalSaved}개 순위를 기록했습니다.${changeSummary}`
      : `${snapshot.totalSaved}개 순위를 기록했습니다.${changeSummary}`

    await updatePlaceRankingBatchKeywordRunStatus({
      id: item.id,
      status: 'success',
      message,
    })

    return {
      keyword: item.keyword,
      ok: true,
      savedCount: snapshot.totalSaved,
      message,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '순위 기록 중 문제가 발생했습니다.'

    await updatePlaceRankingBatchKeywordRunStatus({
      id: item.id,
      status: 'failed',
      message,
    })

    return {
      keyword: item.keyword,
      ok: false,
      savedCount: 0,
      message,
    }
  }
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}

function summarizeRankChanges(
  changesByPlaceId: Awaited<ReturnType<typeof recordPlaceRankingSnapshots>>['changesByPlaceId'],
) {
  const changes = Object.values(changesByPlaceId)
  const upCount = changes.filter((change) => change?.direction === 'up').length
  const downCount = changes.filter((change) => change?.direction === 'down').length

  if (upCount === 0 && downCount === 0) {
    return ''
  }

  return ` 변동: 상승 ${upCount}개, 하락 ${downCount}개.`
}
