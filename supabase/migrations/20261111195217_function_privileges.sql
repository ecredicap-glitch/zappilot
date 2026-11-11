-- Keep trigger helpers private and limit the membership predicate to signed-in callers.
revoke all on function public.create_default_workspace_for_user() from public, anon, authenticated;
revoke all on function public.seed_pipeline_for_workspace() from public, anon, authenticated;
revoke all on function public.has_workspace_role(uuid, text) from public, anon, authenticated;
grant execute on function public.has_workspace_role(uuid, text) to service_role;

revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
