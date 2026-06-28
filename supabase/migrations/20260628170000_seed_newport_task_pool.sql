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
        ('28th-street-benches', '28th Street Benches', 'Rest at the benches at 28th Street and take a photo.', 'Armchair', false, 1),
        ('playground-hopscotch', 'Playground Hopscotch', 'Play hopscotch at the playground.', 'Grid3X3', false, 2),
        ('friendly-pelican', 'Friendly Pelican', 'Take a photo with the friendly pelican near the playground.', 'Bird', false, 3),
        ('flying-blue-discs', 'Flying Blue Discs', 'Take a team photo on the flying blue discs near the pelican.', 'Circle', false, 4),
        ('newport-trolley-stop', 'Newport Trolley Stop', 'Find a Newport Beach trolley stop sign and take a photo.', 'Bus', false, 5),
        ('non-pier-restroom', 'Non-Pier Restroom', 'Photograph a public restroom that is not at Newport Pier.', 'Toilet', false, 6),
        ('striped-beach-towel', 'Striped Beach Towel', 'Take a photo with a striped beach towel.', 'Waves', false, 7),
        ('tommy-bahama-umbrella', 'Tommy Bahama Umbrella', 'Take a photo with a Tommy Bahama beach umbrella.', 'Umbrella', false, 8),
        ('kids-lighthouse', 'Kids Lighthouse', 'Take a team photo at the Kids Lighthouse.', 'Landmark', false, 9),
        ('lifeguard-donor-wall', 'Lifeguard Donor Wall', 'Take a photo at the new lifeguard station donor wall.', 'Badge', false, 10),
        ('italian-restaurant', 'Italian Restaurant', 'Take a photo in front of an Italian restaurant.', 'Utensils', false, 11),
        ('mexican-food-restaurant', 'Mexican Food Restaurant', 'Take a photo in front of a Mexican food restaurant.', 'UtensilsCrossed', false, 12),
        ('dont-look-up-sign', 'Don''t Look Up Sign', 'Take a photo under the "Don''t look up here" sign.', 'Signpost', false, 13),
        ('2807-flag-salute', '2807 Flag Salute', 'Take a photo pledging allegiance under the American flag at 2807.', 'Flag', false, 14),
        ('balboa-fun-zone-ferris-wheel', 'Balboa Fun Zone Ferris Wheel', 'Take a team photo with the Balboa Fun Zone Ferris wheel in the background.', 'FerrisWheel', false, 15),
        ('balboa-pavilion-sign', 'Balboa Pavilion Sign', 'Take a photo at the Balboa Pavilion sign.', 'Landmark', false, 16),
        ('balboa-island-ferry-sign', 'Balboa Island Ferry Sign', 'Take a photo at the Balboa Island Ferry entrance or sign.', 'Ship', false, 17),
        ('public-fire-ring', 'Public Fire Ring', 'Find a public fire ring near Balboa Pier and take a photo.', 'Flame', false, 18),
        ('balboa-pier', 'Balboa Pier', 'Take a team photo at the end of Balboa Pier.', 'Waves', false, 19),
        ('newport-pier', 'Newport Pier', 'Take a team photo at the end of Newport Pier.', 'Waves', false, 20),
        ('dory-fleet-sign', 'Dory Fleet Sign', 'Take a photo with the Dory Fleet Fish Market sign.', 'Fish', false, 21),
        ('beach-volleyball-court', 'Beach Volleyball Court', 'Find a beach volleyball court and take a team action photo.', 'Volleyball', false, 22),
        ('ferris-wheel-ticket-booth', 'Ferris Wheel Ticket Booth', 'Take a photo with the Ferris wheel ticket booth or ride sign.', 'Ticket', false, 23),
        ('balboa-bar-or-frozen-banana', 'Balboa Bar Or Frozen Banana', 'Take a photo with a Balboa Bar or frozen banana.', 'IceCreamBowl', false, 24),
        ('random-act-of-kindness', 'Random Act Of Kindness', 'Perform a random act of kindness, then take a photo.', 'HeartHandshake', false, 25),
        ('selfie-with-a-dog', 'Selfie With A Dog', 'Take a selfie with a dog.', 'Dog', false, 26),
        ('team-pyramid', 'Team Pyramid', 'Build a team pyramid and take a photo.', 'Triangle', false, 27),
        ('22nd-street-pizza-delivery', '22nd Street Pizza Delivery', 'Take a photo with a 22nd Street Pizza boardwalk delivery person.', 'Truck', false, 28),
        ('enjoy-a-slice', 'Enjoy A Slice', 'Enjoy a slice at the chosen pizza place and take a team photo.', 'Pizza', false, 29),
        ('22nd-street-pizza-box', '22nd Street Pizza Box', 'Take a photo with a 22nd Street Pizza box.', 'Pizza', false, 30),
        ('team-drink-break', 'Team Drink Break', 'Take a team drink-break photo.', 'CupSoda', false, 31),
        ('team-jello-shot', 'Team Jello Shot', 'Take a team jello-shot photo.', 'Martini', false, 32),
        ('arcade-tickets', 'Arcade Tickets', 'Win arcade tickets and take a photo.', 'Ticket', false, 33),
        ('figure-8s', 'Figure 8s', 'Do figure 8s at the blacktop near a school.', 'Bike', false, 34),
        ('hero-who-did-go', 'Hero Who Did Go', 'Take a group selfie with the "Hero who did go" statue or sign.', 'Trophy', false, 35),
        ('newport-elementary-sign', 'Newport Elementary Sign', 'Take a photo at the Newport Elementary principal-name sign.', 'School', false, 36),
        ('college-shirt', 'College Shirt', 'Take a photo with someone wearing a college t-shirt.', 'Shirt', false, 37),
        ('penny', 'Penny', 'Find a penny and take a photo.', 'Coins', false, 38),
        ('lifeguard-truck', 'Lifeguard Truck', 'Take a photo with a lifeguard in a truck.', 'Truck', false, 39),
        ('chargers-or-rams-shirt', 'Chargers Or Rams Shirt', 'Take a photo with someone wearing an LA Chargers or LA Rams t-shirt.', 'Shirt', false, 40),
        ('usa-soccer-fan', 'USA Soccer Fan', 'Take a photo with a USA soccer fan.', 'Goal', false, 41),
        ('grab-a-piece-of-candy', 'Grab A Piece Of Candy', 'Grab a piece of candy and take a photo.', 'Candy', false, 42)
    ) as task_seed(slug, title, description, icon, is_free, sort_order)
    order by task_seed.sort_order;

    insert into public.group_board_tasks (
      game_id,
      group_slug,
      task_slug,
      slot_order
    )
    -- Keep the opening four tasks shared, then give each group exactly three
    -- hard/variable tasks in spaced board slots. Hard tasks are sort_order >= 37.
    with shared_tasks as (
      select
        t.slug,
        row_number() over (order by t.sort_order, t.slug)::integer as slot_order
      from public.tasks t
      where t.game_id = target_game_id_value
        and t.sort_order <= 4
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
      where slot_order not in (7, 16, 23)
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
