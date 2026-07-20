do $$
declare
  target_game_id_value uuid;
begin
  for target_game_id_value in
    select g.id
    from public.games g
    where exists (
      select 1
      from public.tasks t
      where t.game_id = g.id
        and t.is_free is true
    )
      and not exists (
        select 1
        from public.submissions s
        where s.game_id = g.id
      )
  loop
    delete from public.group_board_tasks
    where game_id = target_game_id_value;

    insert into public.group_board_tasks (
      game_id,
      group_slug,
      task_slug,
      slot_order
    )
    with center_task as (
      select t.slug
      from public.tasks t
      where t.game_id = target_game_id_value
        and t.is_free is true
      order by t.sort_order, t.slug
      limit 1
    ),
    shared_tasks as (
      select
        t.slug,
        row_number() over (order by t.sort_order, t.slug)::integer as slot_order
      from public.tasks t
      where t.game_id = target_game_id_value
        and t.is_free is false
      order by t.sort_order, t.slug
      limit 4
    ),
    group_shared_tasks as (
      select
        g.slug as group_slug,
        shared_tasks.slug as task_slug,
        shared_tasks.slot_order
      from public.groups g
      cross join shared_tasks
      where g.game_id = target_game_id_value
    ),
    varied_slot_numbers as (
      select
        slots.slot_order,
        row_number() over (order by slots.slot_order)::integer as slot_rank
      from generate_series(1, 25) as slots(slot_order)
      where not exists (
          select 1
          from shared_tasks st
          where st.slot_order = slots.slot_order
        )
        and slots.slot_order <> 13
    ),
    randomized_tasks as (
      select
        g.slug as group_slug,
        t.slug as task_slug,
        row_number() over (
          partition by g.slug
          order by md5(g.slug || ':task:' || t.slug), t.sort_order, t.slug
        )::integer as task_rank
      from public.groups g
      join public.tasks t
        on t.game_id = target_game_id_value
      where g.game_id = target_game_id_value
        and t.is_free is false
        and not exists (
          select 1
          from shared_tasks st
          where st.slug = t.slug
        )
    ),
    group_varied_tasks as (
      select
        randomized_tasks.group_slug,
        randomized_tasks.task_slug,
        varied_slot_numbers.slot_order
      from randomized_tasks
      join varied_slot_numbers
        on varied_slot_numbers.slot_rank = randomized_tasks.task_rank
    ),
    center_tasks as (
      select
        g.slug as group_slug,
        center_task.slug as task_slug,
        13 as slot_order
      from public.groups g
      cross join center_task
      where g.game_id = target_game_id_value
    ),
    board_tasks as (
      select group_slug, task_slug, slot_order
      from group_shared_tasks
      union all
      select group_slug, task_slug, slot_order
      from group_varied_tasks
      union all
      select group_slug, task_slug, slot_order
      from center_tasks
    )
    select
      target_game_id_value,
      board_tasks.group_slug,
      board_tasks.task_slug,
      board_tasks.slot_order
    from board_tasks
    order by board_tasks.group_slug, board_tasks.slot_order;
  end loop;
end $$;
