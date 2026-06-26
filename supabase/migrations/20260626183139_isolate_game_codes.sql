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
  target_game public.games;
  target_secret private.host_secrets;
  template_game public.games;
  template_secret private.host_secrets;
  cloned_game public.games;
  first_stop_id uuid;
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

  select g.*
  into target_game
  from public.games g
  where g.code = clean_game_code
    and g.is_active is true
  limit 1;

  if found then
    select hs.*
    into target_secret
    from private.host_secrets hs
    where hs.game_id = target_game.id;

    if extensions.crypt(pin, target_secret.pin_hash) <> target_secret.pin_hash then
      raise exception 'Invalid host PIN';
    end if;
  else
    if exists (
      select 1
      from public.games g
      where g.code = clean_game_code
    ) then
      raise exception 'Game code is already in use';
    end if;

    select g.*
    into template_game
    from public.games g
    join private.host_secrets hs
      on hs.game_id = g.id
    where g.is_active is true
      and extensions.crypt(pin, hs.pin_hash) = hs.pin_hash
    order by g.created_at, g.id
    limit 1;

    if not found then
      raise exception 'Invalid host PIN';
    end if;

    select hs.*
    into template_secret
    from private.host_secrets hs
    where hs.game_id = template_game.id;

    insert into public.games (
      code,
      name,
      phase,
      timer_running,
      timer_started_at,
      timer_seconds_total,
      is_active
    )
    values (
      clean_game_code,
      template_game.name,
      'live',
      false,
      now(),
      template_game.timer_seconds_total,
      true
    )
    returning * into cloned_game;

    insert into public.groups (
      game_id,
      slug,
      name,
      short_name,
      color_key,
      sort_order
    )
    select
      cloned_game.id,
      g.slug,
      g.name,
      g.short_name,
      g.color_key,
      g.sort_order
    from public.groups g
    where g.game_id = template_game.id
    order by g.sort_order, g.created_at, g.slug;

    insert into public.tasks (
      game_id,
      slug,
      title,
      description,
      icon,
      is_free,
      sort_order
    )
    select
      cloned_game.id,
      t.slug,
      t.title,
      t.description,
      t.icon,
      t.is_free,
      t.sort_order
    from public.tasks t
    where t.game_id = template_game.id
    order by t.sort_order, t.created_at, t.slug;

    with source_stops as (
      select
        extensions.gen_random_uuid() as new_id,
        s.slug,
        s.name,
        s.detail,
        s.arrive_time,
        s.leave_time,
        s.sort_order,
        s.created_at
      from public.stops s
      where s.game_id = template_game.id
    ),
    inserted_stops as (
      insert into public.stops (
        id,
        game_id,
        slug,
        name,
        detail,
        arrive_time,
        leave_time,
        sort_order
      )
      select
        new_id,
        cloned_game.id,
        slug,
        name,
        detail,
        arrive_time,
        leave_time,
        sort_order
      from source_stops
      order by sort_order, created_at, slug
      returning id, sort_order, created_at
    )
    select id
    into first_stop_id
    from inserted_stops
    order by sort_order, created_at, id
    limit 1;

    insert into public.group_board_tasks (
      game_id,
      group_slug,
      task_slug,
      slot_order
    )
    select
      cloned_game.id,
      gbt.group_slug,
      gbt.task_slug,
      gbt.slot_order
    from public.group_board_tasks gbt
    where gbt.game_id = template_game.id
    order by gbt.group_slug, gbt.slot_order;

    update public.games
    set active_stop_id = first_stop_id,
        timer_seconds_total = case
          when first_stop_id is null then timer_seconds_total
          else 1800
        end,
        updated_at = now()
    where id = cloned_game.id
    returning * into target_game;

    insert into private.host_secrets (game_id, pin_hash)
    values (target_game.id, template_secret.pin_hash)
    returning * into target_secret;
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

revoke execute on function public.configure_game_code(text, text, text)
from public, anon;

grant execute on function public.configure_game_code(text, text, text)
to authenticated;
