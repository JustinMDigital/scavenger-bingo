create or replace function public.configure_game_code(
  desired_game_code text,
  pin text,
  display_name text
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_game_code text := upper(trim(desired_game_code));
  cleaned_display_name text := nullif(trim(display_name), '');
  matched_game_id uuid;
  matching_game_count bigint;
  target_game public.games;
  claimed_membership public.memberships;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if cleaned_display_name is null then
    raise exception 'Host name is required';
  end if;

  if clean_game_code is null or clean_game_code !~ '^[A-Z0-9-]{3,24}$' then
    raise exception 'Game code must be 3-24 uppercase letters, numbers, or hyphens';
  end if;

  with matching_games as (
    select g.id
    from public.games g
    join private.host_secrets hs
      on hs.game_id = g.id
    where g.is_active is true
      and extensions.crypt(pin, hs.pin_hash) = hs.pin_hash
  )
  select count(*), (array_agg(id))[1]
  into matching_game_count, matched_game_id
  from matching_games;

  if matching_game_count = 0 then
    raise exception 'Invalid host PIN';
  end if;

  if matching_game_count > 1 then
    raise exception 'Host PIN matches more than one active game';
  end if;

  if exists (
    select 1
    from public.games g
    where g.code = clean_game_code
      and g.id <> matched_game_id
  ) then
    raise exception 'Game code is already in use';
  end if;

  update public.games
  set code = clean_game_code,
      updated_at = now()
  where id = matched_game_id
  returning * into target_game;

  insert into public.memberships (
    game_id,
    user_id,
    role,
    group_slug,
    display_name
  )
  values (
    target_game.id,
    (select auth.uid()),
    'host',
    null,
    cleaned_display_name
  )
  on conflict (game_id, user_id)
  do update set
    role = excluded.role,
    group_slug = excluded.group_slug,
    display_name = excluded.display_name,
    updated_at = now()
  returning * into claimed_membership;

  return claimed_membership;
end;
$$;
