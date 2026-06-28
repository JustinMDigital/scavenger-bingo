do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table public.groups;
  end if;
end;
$$;

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
  source_group_slug text;
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

  select g.slug
  into source_group_slug
  from public.groups g
  where g.game_id = target_game_id
    and g.slug <> created_group.slug
  order by g.sort_order, g.created_at, g.slug
  limit 1;

  if source_group_slug is not null then
    insert into public.group_board_tasks (
      game_id,
      group_slug,
      task_slug,
      slot_order
    )
    select
      target_game_id,
      created_group.slug,
      gbt.task_slug,
      gbt.slot_order
    from public.group_board_tasks gbt
    where gbt.game_id = target_game_id
      and gbt.group_slug = source_group_slug
    on conflict (game_id, group_slug, task_slug) do nothing;
  end if;

  return created_group;
end;
$$;

revoke execute on function public.add_game_group(uuid, text)
from public, anon;

grant execute on function public.add_game_group(uuid, text)
to authenticated;
