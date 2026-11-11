create extension if not exists pgcrypto;
create table if not exists public.workspaces(
 id uuid primary key default gen_random_uuid(), name text not null default 'Meu workspace', created_at timestamptz not null default now()
);
create table if not exists public.members(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null unique references auth.users(id) on delete cascade,
 role text not null default 'Admin' check(role in ('Admin','Operador')), created_at timestamptz not null default now()
);
create index if not exists members_workspace_id_idx on public.members(workspace_id);
create or replace function public.is_workspace_member(target uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.members where workspace_id=target and user_id=auth.uid());
$$;
create or replace function public.has_workspace_role(target uuid, required_role text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.members where workspace_id=target and user_id=auth.uid() and role=required_role);
$$;
create or replace function public.create_default_workspace_for_user() returns trigger language plpgsql security definer set search_path=public as $$
declare new_workspace_id uuid; workspace_name text;
begin
 workspace_name:=coalesce(nullif(new.raw_user_meta_data->>'workspace_name',''),nullif(new.raw_user_meta_data->>'name',''),'Meu workspace');
 insert into public.workspaces(name) values(workspace_name) returning id into new_workspace_id;
 insert into public.members(workspace_id,user_id,role) values(new_workspace_id,new.id,'Admin');
 return new;
end $$;
drop trigger if exists auth_user_create_workspace on auth.users;
create trigger auth_user_create_workspace after insert on auth.users for each row execute procedure public.create_default_workspace_for_user();
do $$
declare auth_user record; new_workspace_id uuid;
begin
 for auth_user in select u.id,u.raw_user_meta_data from auth.users u left join public.members m on m.user_id=u.id where m.user_id is null loop
  insert into public.workspaces(name) values(coalesce(nullif(auth_user.raw_user_meta_data->>'workspace_name',''),nullif(auth_user.raw_user_meta_data->>'name',''),'Meu workspace')) returning id into new_workspace_id;
  insert into public.members(workspace_id,user_id,role) values(new_workspace_id,auth_user.id,'Admin');
 end loop;
end $$;
create table if not exists public.wa_instances(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 instance_name text not null, phone_number text, status text not null default 'close' check(status in ('open','connecting','close','unknown')),
 qr_code text, connected_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,instance_name)
);
create index if not exists wa_instances_workspace_id_idx on public.wa_instances(workspace_id);
create table if not exists public.wa_webhook_events(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 instance_id uuid not null references public.wa_instances(id) on delete cascade, event_name text not null,
 summary jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists wa_webhook_events_instance_created_idx on public.wa_webhook_events(instance_id,created_at desc);
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.wa_instances enable row level security;
alter table public.wa_webhook_events enable row level security;
drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces for select to authenticated using(public.is_workspace_member(id));
drop policy if exists members_workspace_select on public.members;
create policy members_workspace_select on public.members for select to authenticated using(public.is_workspace_member(workspace_id));
drop policy if exists wa_instances_workspace_select on public.wa_instances;
create policy wa_instances_workspace_select on public.wa_instances for select to authenticated using(public.is_workspace_member(workspace_id));
drop policy if exists wa_webhook_admin_select on public.wa_webhook_events;
create policy wa_webhook_admin_select on public.wa_webhook_events for select to authenticated using(public.has_workspace_role(workspace_id,'Admin'));
grant select on public.workspaces,public.members,public.wa_instances,public.wa_webhook_events to authenticated;
