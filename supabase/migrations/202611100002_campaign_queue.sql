alter table public.wa_instances add column if not exists daily_limit integer not null default 100 check(daily_limit between 1 and 100000);
alter table public.wa_instances add column if not exists warmup_enabled boolean not null default true;
alter table public.wa_instances add column if not exists warmup_start date not null default current_date;
alter table public.wa_instances add column if not exists warmup_daily_step integer not null default 10 check(warmup_daily_step between 1 and 10000);
alter table public.wa_instances add column if not exists allowed_days smallint[] not null default array[1,2,3,4,5,6]::smallint[];
alter table public.wa_instances add column if not exists allowed_start time not null default '08:00';
alter table public.wa_instances add column if not exists allowed_end time not null default '19:00';
alter table public.wa_instances add column if not exists timezone text not null default 'America/Belem';
alter table public.wa_instances add column if not exists min_interval_seconds integer not null default 15 check(min_interval_seconds between 1 and 3600);
alter table public.wa_instances add column if not exists max_interval_seconds integer not null default 45 check(max_interval_seconds between 1 and 3600);
alter table public.wa_instances add column if not exists batch_size integer not null default 20 check(batch_size between 1 and 1000);
alter table public.wa_instances add column if not exists batch_pause_min_seconds integer not null default 180 check(batch_pause_min_seconds between 1 and 86400);
alter table public.wa_instances add column if not exists batch_pause_max_seconds integer not null default 480 check(batch_pause_max_seconds between 1 and 86400);
alter table public.wa_instances add column if not exists queue_lease_until timestamptz;
alter table public.wa_instances add column if not exists dedupe_days integer not null default 7 check(dedupe_days between 1 and 365);
create table if not exists public.contacts(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null,phone text not null,phone_normalized text not null,product text,origin text,
 opt_in boolean not null default false,opt_in_source text,opt_in_at timestamptz,
 status text not null default 'active' check(status in ('active','blocked','unsubscribed')),
 custom_data jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,phone_normalized),check((not opt_in) or (nullif(opt_in_source,'') is not null and opt_in_at is not null))
);
create index if not exists contacts_workspace_optin_idx on public.contacts(workspace_id,opt_in,status);
create table if not exists public.contact_lists(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,name text not null,created_at timestamptz not null default now(),unique(workspace_id,name)
);
create table if not exists public.list_contacts(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,list_id uuid not null references public.contact_lists(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,created_at timestamptz not null default now(),primary key(list_id,contact_id)
);
create table if not exists public.optouts(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 phone_normalized text not null,source text not null default 'manual',created_at timestamptz not null default now(),unique(workspace_id,phone_normalized)
);
create table if not exists public.templates(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 title text not null,category text not null default 'primeiro contato',body text not null,variables text[] not null default '{}',active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.campaigns(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 wa_instance_id uuid not null references public.wa_instances(id) on delete restrict,list_id uuid references public.contact_lists(id) on delete set null,
 template_id uuid references public.templates(id) on delete set null,title text not null,status text not null default 'draft' check(status in ('draft','scheduled','running','paused','cancelled','completed')),
 message_body text not null,scheduled_start timestamptz not null default now(),timezone text not null default 'America/Belem',created_by uuid references auth.users(id) on delete set null,
 total_count integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists campaigns_workspace_created_idx on public.campaigns(workspace_id,created_at desc);
create table if not exists public.campaign_messages(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,wa_instance_id uuid not null references public.wa_instances(id) on delete restrict,
 contact_id uuid not null references public.contacts(id) on delete restrict,phone text not null,phone_normalized text not null,
 rendered_message text not null,media jsonb not null default '[]'::jsonb,
 status text not null default 'queued' check(status in ('queued','sending','sent','delivered','read','replied','failed','cancelled')),
 attempts smallint not null default 0 check(attempts between 0 and 3),scheduled_at timestamptz not null default now(),sent_at timestamptz,
 provider_message_id text,last_error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(campaign_id,phone_normalized)
);
create index if not exists campaign_queue_due_idx on public.campaign_messages(status,scheduled_at) where status='queued';
create index if not exists campaign_messages_workspace_status_idx on public.campaign_messages(workspace_id,status);
create table if not exists public.campaign_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,event_type text not null,message text not null,created_at timestamptz not null default now()
);
alter table public.campaigns add column if not exists is_system boolean not null default false;
alter table public.campaigns add column if not exists system_kind text;
create unique index if not exists campaigns_system_unique_idx on public.campaigns(workspace_id,wa_instance_id,system_kind);
alter table public.campaign_messages add column if not exists purpose text not null default 'campaign' check(purpose in ('campaign','optout_confirmation'));
create table if not exists public.campaign_worker_lock(id smallint primary key check(id=1),owner_id uuid,lease_until timestamptz);
insert into public.campaign_worker_lock(id,owner_id,lease_until) values(1,null,null) on conflict(id) do nothing;
alter table public.campaign_worker_lock enable row level security;
create or replace function public.acquire_campaign_worker_lock(worker uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare got smallint;
begin
 update public.campaign_worker_lock set owner_id=worker,lease_until=now()+interval '130 seconds' where id=1 and (owner_id is null or lease_until<now() or owner_id=worker) returning id into got;
 return got is not null;
end $$;
create or replace function public.release_campaign_worker_lock(worker uuid) returns void language sql security definer set search_path=public as $$
 update public.campaign_worker_lock set owner_id=null,lease_until=null where id=1 and owner_id=worker;
$$;
revoke all on function public.acquire_campaign_worker_lock(uuid) from public,anon,authenticated;
revoke all on function public.release_campaign_worker_lock(uuid) from public,anon,authenticated;
grant execute on function public.acquire_campaign_worker_lock(uuid) to service_role;
grant execute on function public.release_campaign_worker_lock(uuid) to service_role;
create or replace function public.claim_next_campaign_message() returns table(
 message_id uuid,campaign_id uuid,workspace_id uuid,wa_instance_id uuid,instance_name text,contact_id uuid,phone text,phone_normalized text,
 rendered_message text,media jsonb,attempts smallint,timezone text,allowed_days smallint[],allowed_start time,allowed_end time,
 daily_limit integer,warmup_enabled boolean,warmup_start date,warmup_daily_step integer,min_interval_seconds integer,max_interval_seconds integer,
 batch_size integer,batch_pause_min_seconds integer,batch_pause_max_seconds integer,dedupe_days integer
) language plpgsql security definer set search_path=public as $$
declare candidate record; claimed uuid;
begin
 for candidate in
  select cm.id,cm.wa_instance_id from public.campaign_messages cm
  join public.campaigns c on c.id=cm.campaign_id and c.status='running'
  join public.contacts ct on ct.id=cm.contact_id
  join public.wa_instances wi on wi.id=cm.wa_instance_id
  where cm.status='queued' and cm.scheduled_at<=now()
   and (cm.purpose='optout_confirmation' or (ct.status='active' and ct.opt_in=true))
   and (cm.purpose='optout_confirmation' or not exists(select 1 from public.optouts o where o.workspace_id=cm.workspace_id and o.phone_normalized=cm.phone_normalized))
   and not exists(select 1 from public.campaign_messages old where old.workspace_id=cm.workspace_id and old.phone_normalized=cm.phone_normalized and old.id<>cm.id and old.purpose='campaign' and cm.purpose='campaign' and old.sent_at>=now()-(wi.dedupe_days||' days')::interval and old.status in ('sent','delivered','read','replied'))
  order by cm.scheduled_at,cm.created_at limit 50
 loop
  claimed:=null;
  update public.wa_instances wi set queue_lease_until=now()+interval '130 seconds'
   where wi.id=candidate.wa_instance_id and wi.status='open' and (wi.queue_lease_until is null or wi.queue_lease_until<now())
   returning wi.id into claimed;
  if claimed is null then continue; end if;
  update public.campaign_messages cm set status='sending',attempts=cm.attempts+1,updated_at=now()
   where cm.id=candidate.id and cm.status='queued' returning cm.id into claimed;
  if claimed is null then update public.wa_instances set queue_lease_until=null where id=candidate.wa_instance_id;continue;end if;
  return query select cm.id,cm.campaign_id,cm.workspace_id,wi.id,wi.instance_name,cm.contact_id,cm.phone,cm.phone_normalized,
   cm.rendered_message,cm.media,cm.attempts,wi.timezone,wi.allowed_days,wi.allowed_start,wi.allowed_end,wi.daily_limit,
   wi.warmup_enabled,wi.warmup_start,wi.warmup_daily_step,wi.min_interval_seconds,wi.max_interval_seconds,wi.batch_size,
   wi.batch_pause_min_seconds,wi.batch_pause_max_seconds,wi.dedupe_days
   from public.campaign_messages cm join public.wa_instances wi on wi.id=cm.wa_instance_id where cm.id=candidate.id;
  return;
 end loop;
end $$;
create or replace function public.release_wa_queue_lease(target uuid) returns void language sql security definer set search_path=public as $$
 update public.wa_instances set queue_lease_until=null where id=target;
$$;
revoke all on function public.claim_next_campaign_message() from public,anon,authenticated;
revoke all on function public.release_wa_queue_lease(uuid) from public,anon,authenticated;
grant execute on function public.claim_next_campaign_message() to service_role;
grant execute on function public.release_wa_queue_lease(uuid) to service_role;

do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaigns') then execute 'alter publication supabase_realtime add table public.campaigns'; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_messages') then execute 'alter publication supabase_realtime add table public.campaign_messages'; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='campaign_events') then execute 'alter publication supabase_realtime add table public.campaign_events'; end if;
 end if;
end $$;
alter table public.contacts enable row level security;alter table public.contact_lists enable row level security;alter table public.list_contacts enable row level security;alter table public.optouts enable row level security;alter table public.templates enable row level security;alter table public.campaigns enable row level security;alter table public.campaign_messages enable row level security;alter table public.campaign_events enable row level security;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('campaign-media','campaign-media',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','audio/mpeg','audio/ogg','audio/mp4']) on conflict(id) do nothing;
create policy contacts_member_select on public.contacts for select to authenticated using(public.is_workspace_member(workspace_id));
create policy contacts_member_insert on public.contacts for insert to authenticated with check(public.is_workspace_member(workspace_id));
create policy contacts_member_update on public.contacts for update to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create policy contact_lists_member_all on public.contact_lists for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create policy list_contacts_member_all on public.list_contacts for all to authenticated using(public.is_workspace_member(workspace_id) and exists(select 1 from public.contacts ct where ct.id=contact_id and ct.workspace_id=list_contacts.workspace_id) and exists(select 1 from public.contact_lists cl where cl.id=list_id and cl.workspace_id=list_contacts.workspace_id)) with check(public.is_workspace_member(workspace_id) and exists(select 1 from public.contacts ct where ct.id=contact_id and ct.workspace_id=list_contacts.workspace_id) and exists(select 1 from public.contact_lists cl where cl.id=list_id and cl.workspace_id=list_contacts.workspace_id));
create policy optouts_member_select on public.optouts for select to authenticated using(public.is_workspace_member(workspace_id));
create policy templates_member_all on public.templates for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create policy campaigns_member_select on public.campaigns for select to authenticated using(public.is_workspace_member(workspace_id));
create policy campaigns_member_insert on public.campaigns for insert to authenticated with check(public.is_workspace_member(workspace_id) and not is_system and system_kind is null and exists(select 1 from public.wa_instances wi where wi.id=wa_instance_id and wi.workspace_id=campaigns.workspace_id) and (list_id is null or exists(select 1 from public.contact_lists cl where cl.id=list_id and cl.workspace_id=campaigns.workspace_id)));
create policy campaigns_member_update on public.campaigns for update to authenticated using(public.is_workspace_member(workspace_id) and not is_system) with check(public.is_workspace_member(workspace_id) and not is_system and system_kind is null and exists(select 1 from public.wa_instances wi where wi.id=wa_instance_id and wi.workspace_id=campaigns.workspace_id) and (list_id is null or exists(select 1 from public.contact_lists cl where cl.id=list_id and cl.workspace_id=campaigns.workspace_id)));
create policy campaign_messages_member_select on public.campaign_messages for select to authenticated using(public.is_workspace_member(workspace_id));
create policy campaign_messages_optin_insert on public.campaign_messages for insert to authenticated with check(
 public.is_workspace_member(workspace_id) and purpose='campaign' and exists(select 1 from public.campaigns c where c.id=campaign_messages.campaign_id and c.workspace_id=campaign_messages.workspace_id) and exists(select 1 from public.wa_instances wi where wi.id=campaign_messages.wa_instance_id and wi.workspace_id=campaign_messages.workspace_id) and exists(select 1 from public.contacts ct where ct.id=contact_id and ct.workspace_id=campaign_messages.workspace_id and ct.id=campaign_messages.contact_id and ct.status='active' and ct.opt_in=true and ct.phone_normalized=campaign_messages.phone_normalized)
 and not exists(select 1 from public.optouts o where o.workspace_id=campaign_messages.workspace_id and o.phone_normalized=campaign_messages.phone_normalized)
);
create policy campaign_events_member_select on public.campaign_events for select to authenticated using(public.is_workspace_member(workspace_id));
grant select,insert,update on public.contacts,public.contact_lists,public.list_contacts,public.templates,public.campaigns to authenticated;
grant select on public.optouts,public.campaign_messages,public.campaign_events to authenticated;
grant insert on public.campaign_messages to authenticated;
grant usage,select on all sequences in schema public to authenticated;
create policy campaign_media_member_select on storage.objects for select to authenticated using(bucket_id='campaign-media' and public.is_workspace_member((storage.foldername(name))[1]::uuid));
create policy campaign_media_member_insert on storage.objects for insert to authenticated with check(bucket_id='campaign-media' and public.is_workspace_member((storage.foldername(name))[1]::uuid));








