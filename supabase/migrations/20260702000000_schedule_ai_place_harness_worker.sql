create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'ai-place-harness-worker';

select cron.schedule(
  'ai-place-harness-worker',
  '*/5 * * * *',
  $worker$
    select net.http_post(
      url := 'https://aiva-ai-marketing.vercel.app/api/ai-place-diagnosis/harness/worker',
      headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'Authorization',
        'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'ai_place_harness_worker_cron_secret'
          order by created_at desc
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 300000
    );
  $worker$
);
