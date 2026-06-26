create or replace function public.abandon_game_lobby(target_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_stop_id uuid;
  closed_game_code text;
  removed_memberships bigint;
  deleted_submissions bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not (select private.is_game_host(target_game_id)) then
    raise exception 'Host access required';
  end if;

  loop
    closed_game_code :=
      'CLOSED-' || substring(upper(replace(extensions.gen_random_uuid()::text, '-', '')) from 1 for 12);

    exit when not exists (
      select 1
      from public.games g
      where g.code = closed_game_code
    );
  end loop;

  select s.id
  into first_stop_id
  from public.stops s
  where s.game_id = target_game_id
  order by s.sort_order, s.created_at, s.id
  limit 1;

  with deleted as (
    delete from public.submissions
    where game_id = target_game_id
    returning id
  )
  select count(*)
  into deleted_submissions
  from deleted;

  with deleted as (
    delete from public.memberships
    where game_id = target_game_id
    returning id
  )
  select count(*)
  into removed_memberships
  from deleted;

  update public.games
  set code = closed_game_code,
      phase = 'live',
      active_stop_id = first_stop_id,
      timer_running = false,
      timer_started_at = now(),
      timer_seconds_total = 1800,
      updated_at = now()
  where id = target_game_id;

  return jsonb_build_object(
    'closed_game_code', closed_game_code,
    'deleted_submissions', deleted_submissions,
    'removed_memberships', removed_memberships
  );
end;
$$;

revoke execute on function public.abandon_game_lobby(uuid)
from public, anon;

grant execute on function public.abandon_game_lobby(uuid)
to authenticated;
