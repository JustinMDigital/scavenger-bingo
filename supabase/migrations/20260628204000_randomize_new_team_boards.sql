create or replace function public.add_game_group(
  target_game_id uuid,
  desired_group_name text default null
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_name text := nullif(
    btrim(regexp_replace(coalesce(desired_group_name, ''), '[[:space:]]+', ' ', 'g')),
    ''
  );
  next_sort_order integer;
  next_group_number integer;
  base_name text;
  base_slug text;
  candidate_slug text;
  candidate_index integer := 2;
  color_keys text[] := array[
    'purple',
    'maroon',
    'orange',
    'blue',
    'green',
    'teal',
    'pink',
    'gold'
  ];
  selected_color_key text;
  created_group public.groups;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.games g
    where g.id = target_game_id
      and g.is_active is true
  ) then
    raise exception 'Game not found';
  end if;

  if not (select private.is_game_host(target_game_id)) then
    raise exception 'Host access required';
  end if;

  select
    coalesce(max(sort_order), 0) + 1,
    count(*)::integer + 1
  into next_sort_order, next_group_number
  from public.groups
  where game_id = target_game_id;

  base_name := coalesce(cleaned_name, 'Team ' || next_group_number);
  base_name := left(base_name, 40);
  base_slug := btrim(
    left(regexp_replace(lower(base_name), '[^a-z0-9]+', '-', 'g'), 48),
    '-'
  );

  if base_slug = '' then
    base_slug := 'team-' || next_group_number;
  end if;

  candidate_slug := base_slug;

  while exists (
    select 1
    from public.groups g
    where g.game_id = target_game_id
      and g.slug = candidate_slug
  ) loop
    candidate_slug := left(base_slug, 44) || '-' || candidate_index;
    candidate_index := candidate_index + 1;
  end loop;

  selected_color_key := color_keys[
    ((next_sort_order - 1) % array_length(color_keys, 1)) + 1
  ];

  insert into public.groups (
    game_id,
    slug,
    name,
    short_name,
    color_key,
    sort_order
  )
  values (
    target_game_id,
    candidate_slug,
    base_name,
    left(base_name, 24),
    selected_color_key,
    next_sort_order
  )
  returning * into created_group;

  insert into public.group_board_tasks (
    game_id,
    group_slug,
    task_slug,
    slot_order
  )
  with center_task as (
    select t.slug
    from public.tasks t
    where t.game_id = target_game_id
      and (t.slug = 'team-jello-shot' or t.is_free is true)
    order by
      (t.slug = 'team-jello-shot') desc,
      t.sort_order,
      t.slug
    limit 1
  ),
  shared_tasks as (
    select
      t.slug,
      row_number() over (order by t.sort_order, t.slug)::integer as slot_order
    from public.tasks t
    where t.game_id = target_game_id
      and t.sort_order < 37
      and not exists (
        select 1
        from center_task c
        where c.slug = t.slug
      )
    order by t.sort_order, t.slug
    limit 4
  ),
  hard_slot_numbers as (
    select *
    from (
      values
        (7, 1),
        (16, 2),
        (23, 3)
    ) as hard_slots(slot_order, hard_rank)
  ),
  non_hard_slot_numbers as (
    select
      slots.slot_order,
      row_number() over (order by slots.slot_order)::integer as non_hard_rank
    from generate_series(5, 25) as slots(slot_order)
    where slots.slot_order not in (7, 16, 23)
      and (
        slots.slot_order <> 13
        or not exists (select 1 from center_task)
      )
  ),
  randomized_hard_tasks as (
    select
      t.slug as task_slug,
      row_number() over (
        order by md5(created_group.slug || ':hard:' || t.slug), t.sort_order, t.slug
      )::integer as hard_rank
    from public.tasks t
    where t.game_id = target_game_id
      and t.sort_order >= 37
      and not exists (
        select 1
        from center_task c
        where c.slug = t.slug
      )
  ),
  group_hard_tasks as (
    select
      randomized_hard_tasks.task_slug,
      hard_slot_numbers.slot_order
    from randomized_hard_tasks
    join hard_slot_numbers
      on hard_slot_numbers.hard_rank = randomized_hard_tasks.hard_rank
  ),
  randomized_non_hard_tasks as (
    select
      t.slug as task_slug,
      row_number() over (
        order by md5(created_group.slug || ':non-hard:' || t.slug), t.sort_order, t.slug
      )::integer as non_hard_rank
    from public.tasks t
    where t.game_id = target_game_id
      and t.sort_order < 37
      and not exists (
        select 1
        from center_task c
        where c.slug = t.slug
      )
      and not exists (
        select 1
        from shared_tasks s
        where s.slug = t.slug
      )
  ),
  group_non_hard_tasks as (
    select
      randomized_non_hard_tasks.task_slug,
      non_hard_slot_numbers.slot_order
    from randomized_non_hard_tasks
    join non_hard_slot_numbers
      on non_hard_slot_numbers.non_hard_rank =
        randomized_non_hard_tasks.non_hard_rank
  ),
  board_tasks as (
    select shared_tasks.slug as task_slug, shared_tasks.slot_order
    from shared_tasks
    union all
    select group_non_hard_tasks.task_slug, group_non_hard_tasks.slot_order
    from group_non_hard_tasks
    union all
    select group_hard_tasks.task_slug, group_hard_tasks.slot_order
    from group_hard_tasks
    union all
    select center_task.slug as task_slug, 13 as slot_order
    from center_task
  )
  select
    target_game_id,
    created_group.slug,
    board_tasks.task_slug,
    board_tasks.slot_order
  from board_tasks
  order by board_tasks.slot_order
  on conflict (game_id, group_slug, task_slug) do nothing;

  return created_group;
end;
$$;

revoke execute on function public.add_game_group(uuid, text)
from public, anon;

grant execute on function public.add_game_group(uuid, text)
to authenticated;
