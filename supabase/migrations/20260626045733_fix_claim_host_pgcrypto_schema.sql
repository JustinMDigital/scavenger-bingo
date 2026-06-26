create or replace function public.claim_host(
  game_code text,
  pin text,
  display_name text
)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game public.games;
  target_secret private.host_secrets;
  claimed_membership public.memberships;
  cleaned_display_name text := nullif(trim(display_name), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if cleaned_display_name is null then
    raise exception 'Host name is required';
  end if;

  select *
  into target_game
  from public.games
  where code = upper(trim(game_code))
    and is_active is true;

  if target_game.id is null then
    raise exception 'Game not found';
  end if;

  select *
  into target_secret
  from private.host_secrets
  where game_id = target_game.id;

  if target_secret.game_id is null
    or extensions.crypt(pin, target_secret.pin_hash) <> target_secret.pin_hash then
    raise exception 'Invalid host PIN';
  end if;

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

revoke execute on function public.claim_host(text, text, text) from public, anon;
grant execute on function public.claim_host(text, text, text) to authenticated;
