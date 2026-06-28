alter table public.games
add column if not exists board_hidden boolean not null default true;

alter table public.games
alter column phase set default 'play';

alter table public.games
alter column timer_running set default false;

update public.games g
set board_hidden = false,
    updated_at = now()
where exists (
  select 1
  from public.submissions s
  where s.game_id = g.id
)
or g.phase = 'review';

update public.games g
set phase = 'play',
    active_stop_id = null,
    timer_running = false,
    timer_started_at = now(),
    board_hidden = true,
    updated_at = now()
where g.is_active is true
  and g.phase <> 'review'
  and g.code not like 'CLOSED-%'
  and not exists (
    select 1
    from public.submissions s
    where s.game_id = g.id
  );

drop policy if exists "members can read visible game tasks"
on public.tasks;

create policy "members can read visible game tasks"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = tasks.game_id
      and g.is_active is true
      and (
        (select private.is_game_host(tasks.game_id))
        or g.board_hidden is false
      )
  )
  and (
    (select private.is_game_host(game_id))
    or exists (
      select 1
      from public.group_board_tasks gbt
      where gbt.game_id = tasks.game_id
        and gbt.task_slug = tasks.slug
        and gbt.group_slug = (select private.player_group_slug(tasks.game_id))
    )
  )
);

drop policy if exists "members can read visible board assignments"
on public.group_board_tasks;

create policy "members can read visible board assignments"
on public.group_board_tasks
for select
to authenticated
using (
  (select private.is_game_host(game_id))
  or (
    group_slug = (select private.player_group_slug(game_id))
    and exists (
      select 1
      from public.games g
      where g.id = group_board_tasks.game_id
        and g.is_active is true
        and g.board_hidden is false
    )
  )
);

drop policy if exists "players can upload proof files for their group"
on storage.objects;

create policy "players can upload proof files for their group"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'proofs'
  and exists (
    select 1
    from public.games g
    where g.id::text = (storage.foldername(name))[1]
      and g.board_hidden is false
  )
  and exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.role = 'player'
      and m.game_id::text = (storage.foldername(name))[1]
      and m.group_slug = (storage.foldername(name))[2]
      and (storage.foldername(name))[4] = (select auth.uid())::text
  )
  and exists (
    select 1
    from public.group_board_tasks gbt
    join public.tasks t
      on t.game_id = gbt.game_id
      and t.slug = gbt.task_slug
    where gbt.game_id::text = (storage.foldername(name))[1]
      and gbt.group_slug = (storage.foldername(name))[2]
      and gbt.task_slug = (storage.foldername(name))[3]
      and t.is_free is false
  )
);

drop policy if exists "players can insert group submissions"
on public.submissions;

create policy "players can insert group submissions"
on public.submissions
for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and group_slug = (select private.player_group_slug(game_id))
  and exists (
    select 1
    from public.games g
    where g.id = submissions.game_id
      and g.board_hidden is false
  )
  and exists (
    select 1
    from public.group_board_tasks gbt
    join public.tasks t
      on t.game_id = gbt.game_id
      and t.slug = gbt.task_slug
    where gbt.game_id = submissions.game_id
      and gbt.group_slug = submissions.group_slug
      and gbt.task_slug = submissions.task_slug
      and t.is_free is false
  )
);

drop policy if exists "members can update permitted submissions"
on public.submissions;

create policy "members can update permitted submissions"
on public.submissions
for update
to authenticated
using (
  (select private.is_game_host(game_id))
  or group_slug = (select private.player_group_slug(game_id))
)
with check (
  (select private.is_game_host(game_id))
  or (
    submitted_by = (select auth.uid())
    and status = 'pending'
    and group_slug = (select private.player_group_slug(game_id))
    and exists (
      select 1
      from public.games g
      where g.id = submissions.game_id
        and g.board_hidden is false
    )
    and exists (
      select 1
      from public.group_board_tasks gbt
      join public.tasks t
        on t.game_id = gbt.game_id
        and t.slug = gbt.task_slug
      where gbt.game_id = submissions.game_id
        and gbt.group_slug = submissions.group_slug
        and gbt.task_slug = submissions.task_slug
        and t.is_free is false
    )
  )
);

create or replace function public.get_game_roster(target_game_id uuid)
returns table (
  id uuid,
  game_id uuid,
  role public.membership_role,
  group_slug text,
  display_name text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    m.id,
    m.game_id,
    m.role,
    m.group_slug,
    m.display_name
  from public.memberships m
  where m.game_id = target_game_id
    and (select auth.uid()) is not null
    and (select private.is_game_member(target_game_id))
  order by m.role, m.group_slug, m.created_at, m.display_name;
$$;

revoke execute on function public.get_game_roster(uuid)
from public, anon;

grant execute on function public.get_game_roster(uuid)
to authenticated;

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
      active_stop_id,
      timer_running,
      timer_started_at,
      timer_seconds_total,
      board_hidden,
      is_active
    )
    values (
      clean_game_code,
      template_game.name,
      'play',
      null,
      false,
      now(),
      template_game.timer_seconds_total,
      true,
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
    )
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
    order by sort_order, created_at, slug;

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
    set updated_at = now()
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

create or replace function public.abandon_game_lobby(target_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
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
      phase = 'play',
      active_stop_id = null,
      timer_running = false,
      timer_started_at = now(),
      timer_seconds_total = 1800,
      board_hidden = true,
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
