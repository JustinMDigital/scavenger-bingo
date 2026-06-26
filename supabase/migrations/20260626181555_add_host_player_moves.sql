create or replace function public.move_player_membership(
  target_membership_id uuid,
  target_group_slug text
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_group_slug text := nullif(trim(target_group_slug), '');
  target_membership public.memberships;
  moved_membership public.memberships;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if cleaned_group_slug is null then
    raise exception 'Team is required';
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
    raise exception 'Only players can be moved between teams';
  end if;

  if not (select private.is_game_host(target_membership.game_id)) then
    raise exception 'Host access required';
  end if;

  if not exists (
    select 1
    from public.groups g
    where g.game_id = target_membership.game_id
      and g.slug = cleaned_group_slug
  ) then
    raise exception 'Team not found for this game';
  end if;

  update public.memberships
  set group_slug = cleaned_group_slug,
      updated_at = now()
  where id = target_membership_id
    and role = 'player'
  returning * into moved_membership;

  return moved_membership;
end;
$$;

revoke execute on function public.move_player_membership(uuid, text)
from public, anon;

grant execute on function public.move_player_membership(uuid, text)
to authenticated;
