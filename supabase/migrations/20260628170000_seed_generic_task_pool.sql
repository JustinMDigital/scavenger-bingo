do $$
declare
  target_game_id_value uuid;
begin
  for target_game_id_value in
    select g.id
    from public.games g
    where not exists (
      select 1
      from public.submissions s
      where s.game_id = g.id
    )
  loop
    delete from public.group_board_tasks
    where game_id = target_game_id_value;

    delete from public.tasks
    where game_id = target_game_id_value;

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
      target_game_id_value,
      task_seed.slug,
      task_seed.title,
      task_seed.description,
      task_seed.icon,
      task_seed.is_free,
      task_seed.sort_order
    from (
      values
        ('group-selfie', 'Group Selfie', 'Take one photo with everyone in your group visible.', 'Camera', false, 1),
        ('something-red', 'Something Red', 'Find something red and take a clear photo.', 'Badge', false, 2),
        ('helpful-sign', 'Helpful Sign', 'Find a sign that helps people navigate.', 'Signpost', false, 3),
        ('interesting-seat', 'Interesting Seat', 'Find a bench, chair, or place to sit.', 'Armchair', false, 4),
        ('water-break', 'Water Break', 'Take a photo of a water bottle or drink stop.', 'Droplets', false, 5),
        ('plant-detail', 'Plant Detail', 'Take a close photo of a plant, leaf, or flower.', 'Leaf', false, 6),
        ('something-round', 'Something Round', 'Find something round and snap a photo.', 'Circle', false, 7),
        ('team-pose', 'Team Pose', 'Create a team pose and take a photo.', 'Users', false, 8),
        ('cool-hat', 'Cool Hat', 'Find the best hat nearby.', 'HardHat', false, 9),
        ('reflection', 'Reflection', 'Take a photo of a reflection.', 'Glasses', false, 10),
        ('snack', 'Snack', 'Find a snack and take a photo.', 'Cookie', false, 11),
        ('wheels', 'Wheels', 'Find a bike, scooter, cart, or anything with wheels.', 'Bike', false, 12),
        ('free', 'FREE', 'Free space. This one is already yours.', 'Star', true, 13),
        ('public-clock', 'Clock Or Timer', 'Find a clock, timer, or schedule sign.', 'Clock', false, 14),
        ('interesting-texture', 'Interesting Texture', 'Find a texture that looks good up close.', 'Gem', false, 15),
        ('tiny-thing', 'Tiny Thing', 'Find the smallest interesting thing nearby.', 'Bug', false, 16),
        ('tall-thing', 'Tall Thing', 'Find the tallest thing you can see from here.', 'TreePine', false, 17),
        ('trash-can', 'Trash Can', 'Find a trash can and take a clean photo of it.', 'Trash2', false, 18),
        ('animal', 'Animal', 'Find an animal, animal sign, or animal-themed item.', 'Dog', false, 19),
        ('food-place', 'Food Place', 'Find a place that serves or sells food.', 'Utensils', false, 20),
        ('drink-place', 'Drink Place', 'Find a place to get a drink.', 'CupSoda', false, 21),
        ('something-blue', 'Something Blue', 'Find something blue and take a photo.', 'Waves', false, 22),
        ('group-shadow', 'Group Shadow', 'Take a photo of your group shadow.', 'Cloud', false, 23),
        ('kindness', 'Kindness', 'Do something helpful and take an appropriate photo.', 'HeartHandshake', false, 24),
        ('team-jump', 'Team Jump', 'Take a mid-air team jump photo.', 'Triangle', false, 25),
        ('local-landmark', 'Local Landmark', 'Find a recognizable landmark or entrance sign.', 'Landmark', false, 26),
        ('ticket-or-receipt', 'Ticket Or Receipt', 'Find a ticket, receipt, or posted price.', 'Ticket', false, 27),
        ('mail-or-message', 'Mail Or Message', 'Find a mailbox, posted note, or message board.', 'Mailbox', false, 28),
        ('pattern', 'Pattern', 'Find a repeated pattern.', 'Grid3X3', false, 29),
        ('something-shiny', 'Something Shiny', 'Find something shiny or reflective.', 'Gem', false, 30),
        ('team-wave', 'Team Wave', 'Take a photo of everyone waving.', 'Users', false, 31),
        ('weather-detail', 'Weather Detail', 'Take a photo that shows today''s weather.', 'Umbrella', false, 32),
        ('sport-or-game', 'Sport Or Game', 'Find sports gear, a game, or a play area.', 'Goal', false, 33),
        ('public-art', 'Public Art', 'Find art, decoration, or a creative display.', 'Image', false, 34),
        ('transportation', 'Transportation', 'Find a vehicle, transit sign, or route marker.', 'Bus', false, 35),
        ('team-initials', 'Team Initials', 'Find or make your team initials.', 'Flag', false, 36),
        ('number-7', 'Number 7', 'Find the number 7.', 'Hash', false, 37),
        ('someone-laughing', 'Someone Laughing', 'Capture a real laugh from your group.', 'Smile', false, 38),
        ('opposite-colors', 'Opposite Colors', 'Find two very different colors side by side.', 'Palette', false, 39),
        ('something-heavy', 'Something Heavy', 'Find something that looks heavy.', 'Truck', false, 40),
        ('something-light', 'Something Light', 'Find something light, airy, or floating.', 'Bird', false, 41),
        ('final-group-shot', 'Final Group Shot', 'Take one strong group photo for the end of the game.', 'Trophy', false, 42)
    ) as task_seed(slug, title, description, icon, is_free, sort_order)
    order by task_seed.sort_order;

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
        and (
          slots.slot_order <> 13
          or not exists (select 1 from center_task)
        )
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
