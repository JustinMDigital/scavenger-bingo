do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'memberships'
  ) then
    execute 'alter publication supabase_realtime add table public.memberships';
  end if;
end
$$;

alter table public.memberships replica identity full;

create or replace function public.kick_player_membership(
  target_membership_id uuid
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_membership public.memberships;
  kicked_membership public.memberships;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_membership
  from public.memberships
  where id = target_membership_id
  for update;

  if not found then
    raise exception 'Player membership not found';
  end if;

  if target_membership.role <> 'player' then
    raise exception 'Only players can be kicked from the lobby';
  end if;

  if not (select private.is_game_host(target_membership.game_id)) then
    raise exception 'Host access required';
  end if;

  delete from public.memberships
  where id = target_membership_id
    and role = 'player'
  returning * into kicked_membership;

  return kicked_membership;
end;
$$;

revoke execute on function public.kick_player_membership(uuid)
from public, anon;

grant execute on function public.kick_player_membership(uuid)
to authenticated;
