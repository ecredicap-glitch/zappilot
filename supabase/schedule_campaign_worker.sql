-- Schedule the worker every minute using Supabase Cron + Vault.
-- Run this manually after replacing each placeholder, and set the same
-- CAMPAIGN_WORKER_SECRET in the Edge Function secrets.
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co','zappilot_project_url');
select vault.create_secret('YOUR_SUPABASE_PUBLISHABLE_KEY','zappilot_publishable_key');
select vault.create_secret('GENERATE_A_LONG_RANDOM_SECRET','zappilot_campaign_worker_secret');

select cron.schedule(
  'zappilot-campaign-worker',
  '* * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='zappilot_project_url') || '/functions/v1/campaign-worker',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey',(select decrypted_secret from vault.decrypted_secrets where name='zappilot_publishable_key'),
        'x-campaign-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='zappilot_campaign_worker_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);
