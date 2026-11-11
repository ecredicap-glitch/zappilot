alter table public.campaign_messages drop constraint if exists campaign_messages_purpose_check;
alter table public.campaign_messages add constraint campaign_messages_purpose_check check(purpose in ('campaign','optout_confirmation','conversation_reply'));
alter table public.campaign_messages drop constraint if exists campaign_messages_campaign_id_phone_normalized_key;
create unique index if not exists campaign_messages_campaign_contact_unique on public.campaign_messages(campaign_id,phone_normalized) where purpose='campaign';
create table if not exists public.conversations(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 wa_instance_id uuid not null references public.wa_instances(id) on delete cascade,contact_id uuid not null references public.contacts(id) on delete cascade,
 status text not null default 'open' check(status in ('open','closed')),assigned_to uuid references auth.users(id) on delete set null,
 unread_count integer not null default 0 check(unread_count>=0),classification text not null default 'Outros' check(classification in ('Interessado','Dúvida','Sem interesse','Pedido de descadastro','Outros')),
 last_message_at timestamptz,last_message_preview text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,wa_instance_id,contact_id)
);
create index if not exists conversations_workspace_recent_idx on public.conversations(workspace_id,status,last_message_at desc);
create table if not exists public.messages(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,wa_instance_id uuid not null references public.wa_instances(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,provider_message_id text,direction text not null check(direction in ('inbound','outbound','system')),
 body text not null default '',message_type text not null default 'text',status text not null default 'received' check(status in ('queued','received','sent','delivered','read','failed')),
 classification text not null default 'Outros' check(classification in ('Interessado','Dúvida','Sem interesse','Pedido de descadastro','Outros')),
 classification_source text not null default 'rule' check(classification_source in ('ai','rule','fallback')),
 sender_user_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),sent_at timestamptz
);
create unique index if not exists messages_provider_unique_idx on public.messages(workspace_id,provider_message_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at);
alter table public.campaign_messages add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
alter table public.campaign_messages add column if not exists message_log_id uuid references public.messages(id) on delete set null;
create table if not exists public.conversation_notes(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(length(body) between 1 and 5000),created_at timestamptz not null default now()
);
create index if not exists conversation_notes_recent_idx on public.conversation_notes(conversation_id,created_at desc);
create table if not exists public.quick_replies(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 title text not null,body text not null,created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.members add column if not exists display_name text;
update public.members m set display_name=coalesce(nullif(u.raw_user_meta_data->>'name',''),nullif(u.raw_user_meta_data->>'full_name','')) from auth.users u where u.id=m.user_id and m.display_name is null;
create or replace function public.seed_default_pipeline(target_workspace uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into public.pipeline_stages(workspace_id,name,position,is_won,is_lost) values
  (target_workspace,'Novo',0,false,false),(target_workspace,'Contatado',1,false,false),(target_workspace,'Respondeu',2,false,false),
  (target_workspace,'Interessado',3,false,false),(target_workspace,'Proposta',4,false,false),(target_workspace,'Fechado',5,true,false),(target_workspace,'Perdido',6,false,true)
 on conflict(workspace_id,name) do nothing;
end $$;
create table if not exists public.pipeline_stages(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null,position integer not null default 0,is_won boolean not null default false,is_lost boolean not null default false,
 created_at timestamptz not null default now(),unique(workspace_id,name)
);
create table if not exists public.leads(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 contact_id uuid not null references public.contacts(id) on delete cascade,stage_id uuid not null references public.pipeline_stages(id) on delete restrict,
 source text,status text not null default 'open' check(status in ('open','won','lost')),last_activity_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(workspace_id,contact_id)
);
create index if not exists leads_stage_idx on public.leads(workspace_id,stage_id,updated_at desc);
create or replace function public.seed_pipeline_for_workspace() returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.seed_default_pipeline(new.id);return new;end $$;
revoke all on function public.seed_default_pipeline(uuid) from public,anon,authenticated;
grant execute on function public.seed_default_pipeline(uuid) to service_role;
drop trigger if exists seed_workspace_pipeline on public.workspaces;
create trigger seed_workspace_pipeline after insert on public.workspaces for each row execute procedure public.seed_pipeline_for_workspace();
do $$ declare w record;begin for w in select id from public.workspaces loop perform public.seed_default_pipeline(w.id);end loop;end $$;
alter table public.conversations enable row level security;alter table public.messages enable row level security;alter table public.conversation_notes enable row level security;alter table public.quick_replies enable row level security;alter table public.pipeline_stages enable row level security;alter table public.leads enable row level security;
create policy conversations_member_select on public.conversations for select to authenticated using(public.is_workspace_member(workspace_id));
drop policy if exists conversations_member_update on public.conversations;
create policy messages_member_select on public.messages for select to authenticated using(public.is_workspace_member(workspace_id));
create policy notes_member_select on public.conversation_notes for select to authenticated using(public.is_workspace_member(workspace_id));
create policy notes_member_insert on public.conversation_notes for insert to authenticated with check(public.is_workspace_member(workspace_id) and author_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and c.workspace_id=conversation_notes.workspace_id));
create policy quick_replies_member_all on public.quick_replies for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create policy pipeline_stages_member_select on public.pipeline_stages for select to authenticated using(public.is_workspace_member(workspace_id));
create policy leads_member_all on public.leads for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id) and exists(select 1 from public.contacts ct where ct.id=contact_id and ct.workspace_id=leads.workspace_id) and exists(select 1 from public.pipeline_stages ps where ps.id=stage_id and ps.workspace_id=leads.workspace_id));
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select,insert on public.conversation_notes to authenticated;
grant select,insert,update,delete on public.quick_replies to authenticated;
grant select on public.pipeline_stages to authenticated;
grant select,insert,update,delete on public.leads to authenticated;

drop function if exists public.claim_next_campaign_message();
create or replace function public.claim_next_campaign_message() returns table(
 message_id uuid,campaign_id uuid,workspace_id uuid,wa_instance_id uuid,instance_name text,contact_id uuid,phone text,phone_normalized text,
 rendered_message text,media jsonb,attempts smallint,timezone text,allowed_days smallint[],allowed_start time,allowed_end time,
 daily_limit integer,warmup_enabled boolean,warmup_start date,warmup_daily_step integer,min_interval_seconds integer,max_interval_seconds integer,
 batch_size integer,batch_pause_min_seconds integer,batch_pause_max_seconds integer,dedupe_days integer,purpose text,conversation_id uuid,message_log_id uuid
) language plpgsql security definer set search_path=public as $$
declare candidate record; claimed uuid;
begin
 update public.campaign_messages set status=case when attempts>=3 then 'failed' else 'queued' end,scheduled_at=now(),updated_at=now() where status='sending' and updated_at<now()-interval '3 minutes';
 for candidate in
  select cm.id,cm.wa_instance_id from public.campaign_messages cm
  join public.campaigns c on c.id=cm.campaign_id and c.status='running'
  join public.contacts ct on ct.id=cm.contact_id
  join public.wa_instances wi on wi.id=cm.wa_instance_id
  where cm.status='queued' and cm.scheduled_at<=now()
   and (cm.purpose='optout_confirmation' or (ct.status='active' and (cm.purpose='conversation_reply' or ct.opt_in=true)))
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
   wi.batch_pause_min_seconds,wi.batch_pause_max_seconds,wi.dedupe_days,cm.purpose,cm.conversation_id,cm.message_log_id
   from public.campaign_messages cm join public.wa_instances wi on wi.id=cm.wa_instance_id where cm.id=candidate.id;
  return;
 end loop;
end $$;
revoke all on function public.claim_next_campaign_message() from public,anon,authenticated;
grant execute on function public.claim_next_campaign_message() to service_role;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversations') then execute 'alter publication supabase_realtime add table public.conversations';end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then execute 'alter publication supabase_realtime add table public.messages';end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='conversation_notes') then execute 'alter publication supabase_realtime add table public.conversation_notes';end if;
 end if;
end $$;

