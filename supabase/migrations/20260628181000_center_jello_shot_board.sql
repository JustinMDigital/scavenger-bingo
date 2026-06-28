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
        and t.slug = 'team-jello-shot'
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
    with shared_tasks as (
      select
        t.slug,
        row_number() over (order by t.sort_order, t.slug)::integer as slot_order
      from public.tasks t
      where t.game_id = target_game_id_value
        and t.sort_order <= 4
        and t.slug <> 'team-jello-shot'
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
    center_tasks as (
      select
        g.slug as group_slug,
        'team-jello-shot'::text as task_slug,
        13 as slot_order
      from public.groups g
      where g.game_id = target_game_id_value
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
        slot_order,
        row_number() over (order by slot_order)::integer as non_hard_rank
      from generate_series(5, 25) as slots(slot_order)
      where slot_order not in (7, 13, 16, 23)
    ),
    randomized_hard_tasks as (
      select
        g.slug as group_slug,
        t.slug as task_slug,
        row_number() over (
          partition by g.slug
          order by md5(g.slug || ':hard:' || t.slug), t.sort_order, t.slug
        )::integer as hard_rank
      from public.groups g
      join public.tasks t
        on t.game_id = target_game_id_value
      where g.game_id = target_game_id_value
        and t.sort_order >= 37
        and t.slug <> 'team-jello-shot'
    ),
    group_hard_tasks as (
      select
        randomized_hard_tasks.group_slug,
        randomized_hard_tasks.task_slug,
        hard_slot_numbers.slot_order
      from randomized_hard_tasks
      join hard_slot_numbers
        on hard_slot_numbers.hard_rank = randomized_hard_tasks.hard_rank
    ),
    randomized_non_hard_tasks as (
      select
        g.slug as group_slug,
        t.slug as task_slug,
        row_number() over (
          partition by g.slug
          order by md5(g.slug || ':non-hard:' || t.slug), t.sort_order, t.slug
        )::integer as non_hard_rank
      from public.groups g
      join public.tasks t
        on t.game_id = target_game_id_value
      where g.game_id = target_game_id_value
        and t.sort_order > 4
        and t.sort_order < 37
        and t.slug <> 'team-jello-shot'
    ),
    group_non_hard_tasks as (
      select
        randomized_non_hard_tasks.group_slug,
        randomized_non_hard_tasks.task_slug,
        non_hard_slot_numbers.slot_order
      from randomized_non_hard_tasks
      join non_hard_slot_numbers
        on non_hard_slot_numbers.non_hard_rank =
          randomized_non_hard_tasks.non_hard_rank
    ),
    board_tasks as (
      select group_slug, task_slug, slot_order
      from group_shared_tasks
      union all
      select group_slug, task_slug, slot_order
      from group_non_hard_tasks
      union all
      select group_slug, task_slug, slot_order
      from group_hard_tasks
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
