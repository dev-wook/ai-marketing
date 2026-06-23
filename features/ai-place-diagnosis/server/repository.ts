import { getPostgresPool } from '@/lib/postgres/server'
import type {
  AiPlaceBenchmarkProfileSummary,
  AiPlaceDiagnosisResponse,
} from '../types'

const aiPlaceHarnessBatchDelayMs = 75_000

type KeywordRow = {
  id: string
  keyword: string
  normalized_keyword: string
  active_profile_id: string | null
}

export type AiPlaceKeywordRow = KeywordRow & {
  region_term: string | null
  service_term: string | null
  need_term: string | null
  intent_cluster_key: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

type BenchmarkProfileRow = {
  id: string
  status: AiPlaceBenchmarkProfileSummary['status']
  profile_version: string
  rubric_version: string
  algorithm_version: string
  prompt_version: string | null
  model_name: string | null
  statistics_json: unknown
  signal_json: {
    strongSignals?: string[]
    weakSignals?: string[]
    newSignals?: string[]
    diagnosisHints?: string[]
    calibrationHints?: string[]
  } | null
  llm_summary_json: unknown
  data_confidence: string | number
  window_start: string
  window_end: string
}

type DiagnosisRunRow = {
  diagnosis_result_json: AiPlaceDiagnosisResponse
}

export type AiPlaceDiagnosisCalibrationSampleRow = {
  place_id: string
  rank_at_diagnosis: number
  absolute_score: string | number
  category_scores_json: unknown
  semantic_scores_json: unknown
  diagnosis_result_json: unknown
  created_at: string
}

export type AiPlaceHarnessJobRow = {
  id: string
  keyword_id: string
  collection_run_id: string | null
  status: 'PENDING' | 'RUNNING' | 'RETRY_WAIT' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
  next_rank_start: number
  batch_size: number
  total_count: number
  evaluated_count: number
  retry_count?: number
  next_attempt_at?: string
}

export type AiPlaceBenchmarkRefreshStatusRow = {
  keyword: string
  normalized_keyword: string
  profile_status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'FAILED' | null
  profile_created_at: string | null
  profile_sample_count: number | null
  profile_data_confidence: string | number | null
  job_id: string | null
  job_status: 'PENDING' | 'RUNNING' | 'RETRY_WAIT' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | null
  job_next_rank_start: number | null
  job_total_count: number | null
  job_evaluated_count: number | null
  job_created_at: string | null
  job_completed_at: string | null
  job_error_message: string | null
  job_retry_count: number | null
  job_next_attempt_at: string | null
}

export type AiPlaceHarnessSnapshotRow = {
  id: string
  collection_run_id: string
  place_id: string
  rank: number
  place_name: string | null
  normalized_payload_json: {
    normalized?: unknown
    features?: unknown
  }
  field_status_json: unknown
  data_completeness: string | number
}

export async function upsertAiPlaceKeyword(keyword: string) {
  const normalizedKeyword = normalizeKeyword(keyword)
  const intent = parseKeywordIntent(normalizedKeyword)
  const pool = getPostgresPool()
  const result = await pool.query<AiPlaceKeywordRow>(
    `
      insert into public.ai_place_keywords (
        keyword,
        normalized_keyword,
        region_term,
        service_term,
        need_term,
        intent_cluster_key
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (normalized_keyword)
      do update set
        keyword = excluded.keyword,
        region_term = coalesce(public.ai_place_keywords.region_term, excluded.region_term),
        service_term = coalesce(public.ai_place_keywords.service_term, excluded.service_term),
        need_term = coalesce(public.ai_place_keywords.need_term, excluded.need_term),
        intent_cluster_key = coalesce(public.ai_place_keywords.intent_cluster_key, excluded.intent_cluster_key),
        is_active = true
      returning
        id,
        keyword,
        normalized_keyword,
        active_profile_id,
        region_term,
        service_term,
        need_term,
        intent_cluster_key,
        is_active,
        created_at,
        updated_at
    `,
    [
      keyword.trim(),
      normalizedKeyword,
      intent.regionTerm,
      intent.serviceTerm,
      intent.needTerm,
      intent.intentClusterKey,
    ],
  )

  return result.rows[0]
}

export async function listAiPlaceKeywords({
  activeOnly = false,
  ids,
}: {
  activeOnly?: boolean
  ids?: string[]
} = {}) {
  const pool = getPostgresPool()
  const result = await pool.query<AiPlaceKeywordRow>(
    `
      select
        id,
        keyword,
        normalized_keyword,
        active_profile_id,
        region_term,
        service_term,
        need_term,
        intent_cluster_key,
        is_active,
        created_at,
        updated_at
      from public.ai_place_keywords
      where ($1::boolean = false or is_active = true)
        and (coalesce(array_length($2::uuid[], 1), 0) = 0 or id = any($2::uuid[]))
      order by updated_at desc, created_at desc
    `,
    [activeOnly, ids ?? []],
  )

  return result.rows
}

export async function getAiPlaceKeywordById(id: string) {
  const pool = getPostgresPool()
  const result = await pool.query<AiPlaceKeywordRow>(
    `
      select
        id,
        keyword,
        normalized_keyword,
        active_profile_id,
        region_term,
        service_term,
        need_term,
        intent_cluster_key,
        is_active,
        created_at,
        updated_at
      from public.ai_place_keywords
      where id = $1
      limit 1
    `,
    [id],
  )

  return result.rows[0] ?? null
}

export async function deactivateAiPlaceKeyword(id: string) {
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.ai_place_keywords
      set is_active = false
      where id = $1
    `,
    [id],
  )
}

export async function createAiPlaceCollectionRun({
  keywordId,
  searchContext,
}: {
  keywordId: string
  searchContext: unknown
}) {
  const pool = getPostgresPool()
  const result = await pool.query<{ id: string }>(
    `
      insert into public.ai_place_collection_runs (
        keyword_id,
        status,
        collector_version,
        search_context_json
      )
      values ($1, 'RUNNING', $2, $3::jsonb)
      returning id
    `,
    [keywordId, 'ai-place-collector-v1', JSON.stringify(searchContext ?? {})],
  )

  return result.rows[0].id
}

export async function completeAiPlaceCollectionRun({
  collectionRunId,
  resultCount,
  status = 'COMPLETED',
  errorMessage,
}: {
  collectionRunId: string
  resultCount: number
  status?: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  errorMessage?: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.ai_place_collection_runs
      set completed_at = now(),
          status = $2,
          result_count = $3,
          error_message = $4
      where id = $1
    `,
    [collectionRunId, status, resultCount, errorMessage ?? null],
  )
}

export async function saveAiPlaceSnapshot({
  collectionRunId,
  placeId,
  rank,
  placeName,
  category,
  rawPayload,
  normalizedPayload,
  fieldStatus,
  snapshotHash,
  dataCompleteness,
  collectorErrorCount,
}: {
  collectionRunId: string
  placeId: string
  rank?: number
  placeName?: string
  category?: string
  rawPayload: unknown
  normalizedPayload: unknown
  fieldStatus: unknown
  snapshotHash: string
  dataCompleteness: number
  collectorErrorCount: number
}) {
  const pool = getPostgresPool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const legacySnapshotResult = await client.query<{ id: string }>(
      `
        insert into public.ai_place_snapshots (
          collection_run_id,
          place_id,
          rank,
          place_name,
          category,
          raw_payload_json,
          normalized_payload_json,
          field_status_json,
          snapshot_hash,
          data_completeness,
          collector_error_count
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11)
        on conflict (collection_run_id, place_id)
        do update set
          rank = excluded.rank,
          place_name = excluded.place_name,
          category = excluded.category,
          raw_payload_json = excluded.raw_payload_json,
          normalized_payload_json = excluded.normalized_payload_json,
          field_status_json = excluded.field_status_json,
          snapshot_hash = excluded.snapshot_hash,
          data_completeness = excluded.data_completeness,
          collector_error_count = excluded.collector_error_count,
          collected_at = now()
        returning id
      `,
      [
        collectionRunId,
        placeId,
        rank ?? null,
        placeName ?? null,
        category ?? null,
        JSON.stringify(rawPayload ?? {}),
        JSON.stringify(normalizedPayload ?? {}),
        JSON.stringify(fieldStatus ?? {}),
        snapshotHash,
        dataCompleteness,
        collectorErrorCount,
      ],
    )

    await client.query(
      `
        with base_snapshot as (
          insert into public.ai_place_base_snapshots (
            place_id,
            place_name,
            category,
            raw_payload_json,
            normalized_payload_json,
            field_status_json,
            snapshot_hash,
            data_completeness,
            collector_error_count
          )
          values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)
          on conflict (place_id, snapshot_hash)
          do update set
            place_name = excluded.place_name,
            category = excluded.category,
            raw_payload_json = excluded.raw_payload_json,
            normalized_payload_json = excluded.normalized_payload_json,
            field_status_json = excluded.field_status_json,
            data_completeness = excluded.data_completeness,
            collector_error_count = excluded.collector_error_count,
            collected_at = now()
          returning id
        ),
        run_keyword as (
          select keyword_id
          from public.ai_place_collection_runs
          where id = $10
        )
        insert into public.ai_place_keyword_observations (
          keyword_id,
          collection_run_id,
          place_id,
          place_snapshot_id,
          rank
        )
        select
          run_keyword.keyword_id,
          $10,
          $1,
          base_snapshot.id,
          $11
        from run_keyword, base_snapshot
        on conflict (collection_run_id, place_id)
        do update set
          place_snapshot_id = excluded.place_snapshot_id,
          rank = excluded.rank,
          observed_at = now()
      `,
      [
        placeId,
        placeName ?? null,
        category ?? null,
        JSON.stringify(rawPayload ?? {}),
        JSON.stringify(normalizedPayload ?? {}),
        JSON.stringify(fieldStatus ?? {}),
        snapshotHash,
        dataCompleteness,
        collectorErrorCount,
        collectionRunId,
        rank ?? null,
      ],
    )

    await client.query('commit')

    return legacySnapshotResult.rows[0].id
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function getActiveAiPlaceBenchmarkProfile(keywordId: string) {
  const pool = getPostgresPool()
  const result = await pool.query<BenchmarkProfileRow>(
    `
      select
        id,
        status,
        profile_version,
        rubric_version,
        algorithm_version,
        prompt_version,
        model_name,
        statistics_json,
        signal_json,
        llm_summary_json,
        data_confidence,
        window_start::text,
        window_end::text
      from public.ai_place_benchmark_profiles
      where keyword_id = $1
        and status = 'ACTIVE'
      order by created_at desc
      limit 1
    `,
    [keywordId],
  )

  const row = result.rows[0]

  if (!row) {
    return null
  }

  return mapBenchmarkProfile(row)
}

export async function saveAndActivateBenchmarkProfile({
  keywordId,
  windowStart,
  windowEnd,
  profileVersion,
  rubricVersion,
  algorithmVersion,
  promptVersion,
  modelName,
  sourceRunCount,
  sampleCount,
  statistics,
  signal,
  llmSummary,
  dataConfidence,
  status,
}: {
  keywordId: string
  windowStart: string
  windowEnd: string
  profileVersion: string
  rubricVersion: string
  algorithmVersion: string
  promptVersion?: string
  modelName?: string
  sourceRunCount: number
  sampleCount: number
  statistics: unknown
  signal: unknown
  llmSummary: unknown
  dataConfidence: number
  status: 'ACTIVE' | 'DRAFT' | 'FAILED'
}) {
  const pool = getPostgresPool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    if (status === 'ACTIVE') {
      await client.query(
        `
          update public.ai_place_benchmark_profiles
          set status = 'SUPERSEDED'
          where keyword_id = $1
            and status = 'ACTIVE'
        `,
        [keywordId],
      )
    }

    const result = await client.query<{ id: string }>(
      `
        insert into public.ai_place_benchmark_profiles (
          keyword_id,
          window_start,
          window_end,
          status,
          profile_version,
          rubric_version,
          algorithm_version,
          prompt_version,
          model_name,
          source_run_count,
          sample_count,
          statistics_json,
          signal_json,
          llm_summary_json,
          data_confidence
        )
        values (
          $1,
          $2::timestamptz,
          $3::timestamptz,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::jsonb,
          $13::jsonb,
          $14::jsonb,
          $15
        )
        returning id
      `,
      [
        keywordId,
        windowStart,
        windowEnd,
        status,
        profileVersion,
        rubricVersion,
        algorithmVersion,
        promptVersion ?? null,
        modelName ?? null,
        sourceRunCount,
        sampleCount,
        JSON.stringify(statistics ?? {}),
        JSON.stringify(signal ?? {}),
        JSON.stringify(llmSummary ?? null),
        dataConfidence,
      ],
    )
    const profileId = result.rows[0].id

    if (status === 'ACTIVE') {
      await client.query(
        `
          update public.ai_place_keywords
          set active_profile_id = $2
          where id = $1
        `,
        [keywordId, profileId],
      )
    }

    await client.query('commit')

    return profileId
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function findCompletedAiPlaceDiagnosis(cacheKey: string) {
  const pool = getPostgresPool()
  const result = await pool.query<DiagnosisRunRow>(
    `
      select diagnosis_result_json
      from public.ai_place_diagnosis_runs
      where cache_key = $1
        and status in ('COMPLETED', 'PARTIAL')
      order by completed_at desc nulls last, created_at desc
      limit 1
    `,
    [cacheKey],
  )

  return result.rows[0]?.diagnosis_result_json ?? null
}

export async function saveAiPlaceDiagnosisRun({
  keywordId,
  placeId,
  targetSnapshotId,
  benchmarkProfileId,
  cacheKey,
  status,
  rankAtDiagnosis,
  absoluteScore,
  benchmarkPercentile,
  dataConfidence,
  categoryScores,
  quantitativeScores,
  semanticScores,
  diagnosisResult,
  improvements,
  evidence,
  rubricVersion,
  scorerVersion,
  featureExtractorVersion,
  promptVersion,
  modelName,
  geminiInvocation,
}: {
  keywordId: string
  placeId: string
  targetSnapshotId?: string
  benchmarkProfileId?: string
  cacheKey: string
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  rankAtDiagnosis?: number
  absoluteScore: number
  benchmarkPercentile: number | null
  dataConfidence: number
  categoryScores: unknown
  quantitativeScores: unknown
  semanticScores: unknown
  diagnosisResult: AiPlaceDiagnosisResponse
  improvements: unknown
  evidence: unknown
  rubricVersion: string
  scorerVersion: string
  featureExtractorVersion: string
  promptVersion: string
  modelName: string
  geminiInvocation?: unknown
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      insert into public.ai_place_diagnosis_runs (
        keyword_id,
        place_id,
        target_snapshot_id,
        benchmark_profile_id,
        cache_key,
        status,
        rank_at_diagnosis,
        absolute_score,
        benchmark_percentile,
        data_confidence,
        category_scores_json,
        quantitative_scores_json,
        semantic_scores_json,
        diagnosis_result_json,
        improvements_json,
        evidence_json,
        rubric_version,
        scorer_version,
        feature_extractor_version,
        prompt_version,
        model_name,
        gemini_invocation_json,
        completed_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb,
        $16::jsonb, $17, $18, $19, $20, $21, $22::jsonb, now()
      )
      on conflict do nothing
    `,
    [
      keywordId,
      placeId,
      targetSnapshotId ?? null,
      benchmarkProfileId ?? null,
      cacheKey,
      status,
      rankAtDiagnosis ?? null,
      absoluteScore,
      benchmarkPercentile,
      dataConfidence,
      JSON.stringify(categoryScores ?? {}),
      JSON.stringify(quantitativeScores ?? {}),
      JSON.stringify(semanticScores ?? {}),
      JSON.stringify(diagnosisResult),
      JSON.stringify(improvements ?? []),
      JSON.stringify(evidence ?? {}),
      rubricVersion,
      scorerVersion,
      featureExtractorVersion,
      promptVersion,
      modelName,
      JSON.stringify(geminiInvocation ?? null),
    ],
  )
}

export async function listAiPlaceDiagnosisCalibrationSamples({
  keywordId,
  limit = 80,
}: {
  keywordId: string
  limit?: number
}) {
  const pool = getPostgresPool()
  const result = await pool.query<AiPlaceDiagnosisCalibrationSampleRow>(
    `
      select
        place_id,
        rank_at_diagnosis,
        absolute_score,
        category_scores_json,
        semantic_scores_json,
        diagnosis_result_json,
        created_at::text
      from public.ai_place_diagnosis_runs
      where keyword_id = $1
        and status in ('COMPLETED', 'PARTIAL')
        and rank_at_diagnosis is not null
        and absolute_score is not null
        and created_at >= now() - interval '30 days'
      order by created_at desc
      limit $2
    `,
    [keywordId, limit],
  )

  return result.rows
}

export async function createAiPlaceHarnessJob({
  batchSize = 10,
  collectionRunId,
  keywordId,
  runId,
  triggerSource,
  totalCount = 50,
}: {
  batchSize?: number
  collectionRunId: string
  keywordId: string
  runId?: string
  triggerSource?: 'CRON' | 'MANUAL'
  totalCount?: number
}) {
  const pool = getPostgresPool()
  const result = await pool.query<{ id: string }>(
    `
      insert into public.ai_place_harness_jobs (
        keyword_id,
        collection_run_id,
        run_id,
        trigger_source,
        status,
        next_rank_start,
        batch_size,
        total_count,
        started_at,
        next_attempt_at
      )
      values ($1, $2, $3, $4, 'PENDING', 1, $5, $6, now(), now())
      returning id
    `,
    [keywordId, collectionRunId, runId ?? null, triggerSource ?? null, batchSize, totalCount],
  )

  return result.rows[0].id
}

export async function createAiPlaceHarnessRun({
  totalKeywords,
  triggerSource,
}: {
  totalKeywords: number
  triggerSource: 'CRON' | 'MANUAL'
}) {
  const pool = getPostgresPool()
  const result = await pool.query<{ id: string }>(
    `
      insert into public.ai_place_harness_runs (
        trigger_source,
        total_keywords,
        status
      )
      values ($1, $2, 'RUNNING')
      returning id
    `,
    [triggerSource, totalKeywords],
  )

  return result.rows[0].id
}

export async function completeAiPlaceHarnessRun({
  failureCount,
  queuedCount,
  runId,
  skippedCount,
}: {
  runId: string
  queuedCount: number
  skippedCount: number
  failureCount: number
}) {
  const status = failureCount > 0 ? (queuedCount > 0 ? 'PARTIAL' : 'FAILED') : 'COMPLETED'
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.ai_place_harness_runs
      set status = $2,
          queued_count = $3,
          skipped_count = $4,
          failure_count = $5,
          completed_at = now()
      where id = $1
    `,
    [runId, status, queuedCount, skippedCount, failureCount],
  )
}

export async function findActiveAiPlaceHarnessJob(keywordId: string) {
  const pool = getPostgresPool()
  const result = await pool.query<AiPlaceHarnessJobRow>(
    `
      select
        id,
        keyword_id,
        collection_run_id,
        status,
        next_rank_start,
        batch_size,
        total_count,
        evaluated_count,
        retry_count,
        next_attempt_at
      from public.ai_place_harness_jobs
      where keyword_id = $1
        and status in ('PENDING', 'RUNNING', 'RETRY_WAIT')
      order by created_at desc
      limit 1
    `,
    [keywordId],
  )

  return result.rows[0] ?? null
}

export async function claimNextAiPlaceHarnessJob() {
  const pool = getPostgresPool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const lockResult = await client.query<{ locked: boolean }>(
      `select pg_try_advisory_xact_lock(hashtext('ai_place_harness_worker_queue')) as locked`,
    )

    if (!lockResult.rows[0]?.locked) {
      await client.query('commit')
      return null
    }

    const result = await client.query<AiPlaceHarnessJobRow>(
      `
        select
          id,
          keyword_id,
          collection_run_id,
          status,
          next_rank_start,
          batch_size,
          total_count,
          evaluated_count,
          retry_count,
          next_attempt_at
        from public.ai_place_harness_jobs
        where status in ('PENDING', 'RUNNING', 'RETRY_WAIT')
          and collection_run_id is not null
          and next_attempt_at <= now()
          and (locked_at is null or locked_at < now() - interval '2 minutes')
          and (
            status = 'RUNNING'
            or not exists (
              select 1
              from public.ai_place_harness_jobs running_job
              where running_job.status = 'RUNNING'
            )
          )
        order by
          case when status = 'RUNNING' then 0 else 1 end,
          created_at asc
        limit 1
        for update skip locked
      `,
    )
    const job = result.rows[0]

    if (!job) {
      await client.query('commit')
      return null
    }

    await client.query(
      `
        update public.ai_place_harness_jobs
        set status = 'RUNNING',
            batch_size = least(batch_size, 10),
            locked_at = now(),
            started_at = coalesce(started_at, now()),
            error_message = null
        where id = $1
      `,
      [job.id],
    )

    await client.query('commit')

    return job
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function listAiPlaceHarnessSnapshotsForBatch({
  collectionRunId,
  rankEnd,
  rankStart,
}: {
  collectionRunId: string
  rankStart: number
  rankEnd: number
}) {
  const pool = getPostgresPool()
  const result = await pool.query<AiPlaceHarnessSnapshotRow>(
    `
      select
        id,
        collection_run_id,
        place_id,
        rank,
        place_name,
        normalized_payload_json,
        field_status_json,
        data_completeness
      from public.ai_place_snapshots
      where collection_run_id = $1
        and rank between $2 and $3
      order by rank asc
    `,
    [collectionRunId, rankStart, rankEnd],
  )

  return result.rows
}

export async function saveAiPlaceHarnessPlaceScore({
  aiScore,
  categoryScores,
  collectionRunId,
  errorMessage,
  evaluationResult,
  evaluationStatus,
  jobId,
  keywordId,
  modelName,
  placeId,
  profileContext,
  promptVersion,
  rank,
  semanticScores,
  snapshotId,
}: {
  jobId: string
  keywordId: string
  collectionRunId: string
  snapshotId: string
  placeId: string
  rank: number
  evaluationStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED'
  aiScore: number | null
  categoryScores: unknown
  semanticScores: unknown
  profileContext: unknown
  evaluationResult: unknown
  promptVersion: string
  modelName: string
  errorMessage?: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      insert into public.ai_place_harness_place_scores (
        job_id,
        keyword_id,
        collection_run_id,
        snapshot_id,
        place_id,
        rank,
        evaluation_status,
        ai_score,
        category_scores_json,
        semantic_scores_json,
        profile_context_json,
        evaluation_result_json,
        prompt_version,
        model_name,
        error_message
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15
      )
      on conflict (job_id, place_id)
      do update set
        evaluation_status = excluded.evaluation_status,
        ai_score = excluded.ai_score,
        category_scores_json = excluded.category_scores_json,
        semantic_scores_json = excluded.semantic_scores_json,
        profile_context_json = excluded.profile_context_json,
        evaluation_result_json = excluded.evaluation_result_json,
        prompt_version = excluded.prompt_version,
        model_name = excluded.model_name,
        error_message = excluded.error_message
    `,
    [
      jobId,
      keywordId,
      collectionRunId,
      snapshotId,
      placeId,
      rank,
      evaluationStatus,
      aiScore,
      JSON.stringify(categoryScores ?? {}),
      JSON.stringify(semanticScores ?? {}),
      JSON.stringify(profileContext ?? {}),
      JSON.stringify(evaluationResult ?? {}),
      promptVersion,
      modelName,
      errorMessage ?? null,
    ],
  )
}

export async function advanceAiPlaceHarnessJob({
  evaluatedCount,
  jobId,
  nextRankStart,
  status,
  errorMessage,
}: {
  jobId: string
  nextRankStart: number
  evaluatedCount: number
  status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED'
  errorMessage?: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.ai_place_harness_jobs
      set next_rank_start = $2,
          evaluated_count = evaluated_count + $3,
          status = $4,
          locked_at = null,
          next_attempt_at = case when $4 = 'RUNNING' then now() + ($6::text || ' milliseconds')::interval else next_attempt_at end,
          completed_at = case when $4 in ('COMPLETED', 'PARTIAL', 'FAILED') then now() else completed_at end,
          error_message = $5
      where id = $1
        and status = 'RUNNING'
    `,
    [jobId, nextRankStart, evaluatedCount, status, errorMessage ?? null, aiPlaceHarnessBatchDelayMs],
  )
}

export async function scheduleAiPlaceHarnessJobRetry({
  errorMessage,
  jobId,
  retryAfterMs,
}: {
  jobId: string
  retryAfterMs: number
  errorMessage: string
}) {
  const pool = getPostgresPool()

  await pool.query(
    `
      update public.ai_place_harness_jobs
      set status = 'RETRY_WAIT',
          retry_count = retry_count + 1,
          next_attempt_at = now() + ($2::text || ' milliseconds')::interval,
          locked_at = null,
          error_message = $3
      where id = $1
        and status = 'RUNNING'
    `,
    [jobId, Math.max(1000, retryAfterMs), errorMessage],
  )
}

export async function cancelAiPlaceHarnessJobs({ jobId }: { jobId?: string } = {}) {
  const pool = getPostgresPool()
  const result = await pool.query<{ id: string }>(
    `
      update public.ai_place_harness_jobs
      set status = 'FAILED',
          locked_at = null,
          completed_at = now(),
          error_message = '사용자 요청으로 중도취소했습니다.'
      where status in ('PENDING', 'RUNNING', 'RETRY_WAIT')
        and ($1::uuid is null or id = $1::uuid)
      returning id
    `,
    [jobId ?? null],
  )

  return result.rowCount ?? 0
}

export async function listAiPlaceHarnessScores(jobId: string) {
  const pool = getPostgresPool()
  const result = await pool.query<{
    rank: number
    ai_score: string | number | null
    category_scores_json: unknown
    semantic_scores_json: unknown
    evaluation_result_json: unknown
  }>(
    `
      select
        rank,
        ai_score,
        category_scores_json,
        semantic_scores_json,
        evaluation_result_json
      from public.ai_place_harness_place_scores
      where job_id = $1
      order by rank asc
    `,
    [jobId],
  )

  return result.rows
}

export async function listAiPlaceBenchmarkRefreshStatuses() {
  const pool = getPostgresPool()
  const result = await pool.query<AiPlaceBenchmarkRefreshStatusRow>(
    `
      select
        keyword.keyword,
        keyword.normalized_keyword,
        profile.status as profile_status,
        profile.created_at as profile_created_at,
        profile.sample_count as profile_sample_count,
        profile.data_confidence as profile_data_confidence,
        job.id as job_id,
        job.status as job_status,
        job.next_rank_start as job_next_rank_start,
        job.total_count as job_total_count,
        job.evaluated_count as job_evaluated_count,
        job.created_at as job_created_at,
        job.completed_at as job_completed_at,
        job.error_message as job_error_message,
        job.retry_count as job_retry_count,
        job.next_attempt_at as job_next_attempt_at
      from public.ai_place_keywords keyword
      left join lateral (
        select
          id,
          status,
          next_rank_start,
          total_count,
          evaluated_count,
          retry_count,
          next_attempt_at,
          created_at,
          completed_at,
          error_message
        from public.ai_place_harness_jobs
        where keyword_id = keyword.id
        order by created_at desc
        limit 1
      ) job on true
      left join lateral (
        select
          status,
          created_at,
          sample_count,
          data_confidence
        from public.ai_place_benchmark_profiles
        where keyword_id = keyword.id
          and status = 'ACTIVE'
        order by created_at desc
        limit 1
      ) profile on true
      where keyword.is_active = true
      order by coalesce(job.created_at, profile.created_at, keyword.updated_at) desc
    `,
  )

  return result.rows
}

function mapBenchmarkProfile(row: BenchmarkProfileRow): AiPlaceBenchmarkProfileSummary {
  const signal = row.signal_json ?? {}

  return {
    id: row.id,
    status: row.status,
    profileVersion: row.profile_version,
    rubricVersion: row.rubric_version,
    algorithmVersion: row.algorithm_version,
    promptVersion: row.prompt_version ?? undefined,
    modelName: row.model_name ?? undefined,
    dataConfidence: Number(row.data_confidence) || 0,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    signalSummary: {
      strongSignals: toStringArray(signal.strongSignals),
      weakSignals: toStringArray(signal.weakSignals),
      newSignals: toStringArray(signal.newSignals),
      diagnosisHints: toStringArray(signal.diagnosisHints),
      calibrationHints: toStringArray(signal.calibrationHints),
    },
    statistics: row.statistics_json,
  }
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().replace(/\s+/g, ' ')
}

function parseKeywordIntent(keyword: string) {
  const tokens = keyword.split(/\s+/).filter(Boolean)
  const serviceToken = tokens.find((token) => /속눈썹|펌|연장|뷰티|네일|왁싱/.test(token)) ?? null
  const regionToken = tokens.find((token) => token !== serviceToken) ?? null
  const needToken = tokens.find((token) => /자연|유지|추천|잘하는|역/.test(token)) ?? null
  const intentClusterKey = [
    regionToken ? `region:${regionToken}` : null,
    serviceToken ? `service:${serviceToken}` : null,
  ]
    .filter(Boolean)
    .join('|')

  return {
    regionTerm: regionToken,
    serviceTerm: serviceToken,
    needTerm: needToken,
    intentClusterKey: intentClusterKey || null,
  }
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
