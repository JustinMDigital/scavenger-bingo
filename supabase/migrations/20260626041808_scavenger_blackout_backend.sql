create extension if not exists pgcrypto;

create schema if not exists private;

create type public.hunt_phase as enum ('live', 'review');
create type public.membership_role as enum ('player', 'host');
create type public.submission_status as enum ('pending', 'approved', 'retake');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  phase public.hunt_phase not null default 'live',
  active_stop_id uuid,
  timer_running boolean not null default true,
  timer_started_at timestamptz not null default now(),
  timer_seconds_total integer not null default 1800 check (timer_seconds_total >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_code_format check (code = upper(code) and code ~ '^[A-Z0-9-]{3,24}$')
);

create table public.groups (
  game_id uuid not null references public.games(id) on delete cascade,
  slug text not null,
  name text not null,
  short_name text not null,
  color_key text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  primary key (game_id, slug),
  constraint groups_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create table public.tasks (
  game_id uuid not null references public.games(id) on delete cascade,
  slug text not null,
  title text not null,
  description text not null,
  icon text not null,
  is_free boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  primary key (game_id, slug),
  constraint tasks_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  slug text not null,
  name text not null,
  detail text not null,
  arrive_time text not null,
  leave_time text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, slug),
  constraint stops_slug_format check (slug ~ '^[a-z0-9-]+$')
);

alter table public.games
  add constraint games_active_stop_id_fkey
  foreign key (active_stop_id) references public.stops(id)
  on delete set null;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null,
  group_slug text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, user_id),
  foreign key (game_id, group_slug) references public.groups(game_id, slug),
  constraint memberships_player_group_required check (
    (role = 'player' and group_slug is not null)
    or (role = 'host' and group_slug is null)
  ),
  constraint memberships_display_name_present check (length(trim(display_name)) > 0)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  group_slug text not null,
  task_slug text not null,
  submitted_by uuid not null references auth.users(id) on delete cascade,
  image_path text not null,
  image_name text not null,
  status public.submission_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, group_slug, task_slug),
  foreign key (game_id, group_slug) references public.groups(game_id, slug),
  foreign key (game_id, task_slug) references public.tasks(game_id, slug)
);

create table private.host_secrets (
  game_id uuid primary key references public.games(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index memberships_user_game_idx on public.memberships(user_id, game_id);
create index memberships_game_role_idx on public.memberships(game_id, role);
create index submissions_game_group_idx on public.submissions(game_id, group_slug);
create index submissions_game_status_idx on public.submissions(game_id, status);
create index stops_game_sort_idx on public.stops(game_id, sort_order);
create index tasks_game_sort_idx on public.tasks(game_id, sort_order);
create index groups_game_sort_idx on public.groups(game_id, sort_order);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_games_updated_at
before update on public.games
for each row execute function private.touch_updated_at();

create trigger touch_stops_updated_at
before update on public.stops
for each row execute function private.touch_updated_at();

create trigger touch_memberships_updated_at
before update on public.memberships
for each row execute function private.touch_updated_at();

create trigger touch_submissions_updated_at
before update on public.submissions
for each row execute function private.touch_updated_at();

create or replace function private.is_game_member(target_game_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.game_id = target_game_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_game_host(target_game_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.game_id = target_game_id
      and m.user_id = (select auth.uid())
      and m.role = 'host'
  );
$$;

create or replace function private.player_group_slug(target_game_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select m.group_slug
  from public.memberships m
  where m.game_id = target_game_id
    and m.user_id = (select auth.uid())
    and m.role = 'player'
  limit 1;
$$;

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
    or crypt(pin, target_secret.pin_hash) <> target_secret.pin_hash then
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

grant usage on schema private to authenticated;
grant execute on function private.is_game_member(uuid) to authenticated;
grant execute on function private.is_game_host(uuid) to authenticated;
grant execute on function private.player_group_slug(uuid) to authenticated;

grant select on public.games to authenticated;
grant update on public.games to authenticated;

grant select on public.groups to authenticated;

grant select on public.tasks to authenticated;

grant select, insert, update, delete on public.stops to authenticated;

grant select, insert, update on public.memberships to authenticated;

grant select, insert, update on public.submissions to authenticated;

alter table public.games enable row level security;
alter table public.groups enable row level security;
alter table public.tasks enable row level security;
alter table public.stops enable row level security;
alter table public.memberships enable row level security;
alter table public.submissions enable row level security;

create policy "authenticated can read active games"
on public.games
for select
to authenticated
using (is_active is true);

create policy "hosts can update their game"
on public.games
for update
to authenticated
using ((select private.is_game_host(id)))
with check ((select private.is_game_host(id)));

create policy "authenticated can read active game groups"
on public.groups
for select
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = groups.game_id
      and g.is_active is true
  )
);

create policy "authenticated can read active game tasks"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = tasks.game_id
      and g.is_active is true
  )
);

create policy "authenticated can read active game stops"
on public.stops
for select
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = stops.game_id
      and g.is_active is true
  )
);

create policy "hosts can insert stops"
on public.stops
for insert
to authenticated
with check ((select private.is_game_host(game_id)));

create policy "hosts can update stops"
on public.stops
for update
to authenticated
using ((select private.is_game_host(game_id)))
with check ((select private.is_game_host(game_id)));

create policy "hosts can delete stops"
on public.stops
for delete
to authenticated
using ((select private.is_game_host(game_id)));

create policy "members can read own membership or host game memberships"
on public.memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_game_host(game_id))
);

create policy "players can join a game group"
on public.memberships
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'player'
  and group_slug is not null
);

create policy "players can update their own player membership"
on public.memberships
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and role = 'player'
  and group_slug is not null
);

create policy "members can read visible submissions"
on public.submissions
for select
to authenticated
using (
  (select private.is_game_host(game_id))
  or group_slug = (select private.player_group_slug(game_id))
);

create policy "players can insert group submissions"
on public.submissions
for insert
to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and group_slug = (select private.player_group_slug(game_id))
);

create policy "players can replace group submissions"
on public.submissions
for update
to authenticated
using (group_slug = (select private.player_group_slug(game_id)))
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and group_slug = (select private.player_group_slug(game_id))
);

create policy "hosts can review submissions"
on public.submissions
for update
to authenticated
using ((select private.is_game_host(game_id)))
with check ((select private.is_game_host(game_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "players can upload proof files for their group"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'proofs'
  and exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.role = 'player'
      and m.game_id::text = (storage.foldername(name))[1]
      and m.group_slug = (storage.foldername(name))[2]
      and (storage.foldername(name))[4] = (select auth.uid())::text
  )
);

create policy "players and hosts can read proof files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'proofs'
  and (
    exists (
      select 1
      from public.memberships m
      where m.user_id = (select auth.uid())
        and m.role = 'host'
        and m.game_id::text = (storage.foldername(name))[1]
    )
    or exists (
      select 1
      from public.memberships m
      where m.user_id = (select auth.uid())
        and m.role = 'player'
        and m.game_id::text = (storage.foldername(name))[1]
        and m.group_slug = (storage.foldername(name))[2]
    )
  )
);

create policy "players can replace their uploaded proof files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'proofs'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'proofs'
  and owner_id = (select auth.uid())::text
);

with seeded_game as (
  insert into public.games (
    id,
    code,
    name,
    phase,
    timer_running,
    timer_seconds_total
  )
  values (
    '00000000-0000-4000-8000-000000000001',
    'FAMILY',
    'Scavenger Blackout',
    'live',
    true,
    1800
  )
  on conflict (id) do update set
    code = excluded.code,
    name = excluded.name
  returning id
),
seeded_groups as (
  insert into public.groups (
    game_id,
    slug,
    name,
    short_name,
    color_key,
    sort_order
  )
  select seeded_game.id, group_seed.slug, group_seed.name, group_seed.short_name, group_seed.color_key, group_seed.sort_order
  from seeded_game
  cross join (
    values
      ('purple', 'Purple Team', 'Purple', 'purple', 1),
      ('maroon', 'Maroon Team', 'Maroon', 'maroon', 2),
      ('orange', 'Orange Team', 'Orange', 'orange', 3)
  ) as group_seed(slug, name, short_name, color_key, sort_order)
  on conflict (game_id, slug) do update set
    name = excluded.name,
    short_name = excluded.short_name,
    color_key = excluded.color_key,
    sort_order = excluded.sort_order
  returning game_id
),
seeded_stops as (
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
  select stop_seed.id::uuid, seeded_game.id, stop_seed.slug, stop_seed.name, stop_seed.detail, stop_seed.arrive_time, stop_seed.leave_time, stop_seed.sort_order
  from seeded_game
  cross join (
    values
      ('00000000-0000-4000-8000-000000000101', 'riverside-pavilion', 'Riverside Pavilion', 'Regroup by the picnic tables before heading back out.', '10:30 AM', '11:00 AM', 1),
      ('00000000-0000-4000-8000-000000000102', 'oak-trail-gate', 'Oak Trail Gate', 'Regroup by the trail sign before the next play round.', '11:30 AM', '12:15 PM', 2),
      ('00000000-0000-4000-8000-000000000103', 'garden-steps', 'Garden Steps', 'Gather near the stairs before the next round starts.', '12:45 PM', '1:15 PM', 3)
  ) as stop_seed(id, slug, name, detail, arrive_time, leave_time, sort_order)
  on conflict (id) do update set
    name = excluded.name,
    detail = excluded.detail,
    arrive_time = excluded.arrive_time,
    leave_time = excluded.leave_time,
    sort_order = excluded.sort_order
  returning id, game_id, sort_order
),
seeded_tasks as (
  insert into public.tasks (
    game_id,
    slug,
    title,
    description,
    icon,
    is_free,
    sort_order
  )
  select seeded_game.id, task_seed.slug, task_seed.title, task_seed.description, task_seed.icon, task_seed.is_free, task_seed.sort_order
  from seeded_game
  cross join (
    values
      ('group-selfie', 'Group selfie', 'Take one photo with everyone in your group visible.', 'Camera', false, 1),
      ('something-red', 'Something red', 'Find a red object at this stop and snap a clear photo.', 'Badge', false, 2),
      ('bench', 'Bench', 'Find a bench and take a photo from your group''s point of view.', 'Armchair', false, 3),
      ('bird', 'Bird', 'Spot a bird, bird sign, or bird decoration.', 'Bird', false, 4),
      ('water-bottle', 'Water bottle', 'Find a water bottle that belongs to your group.', 'Droplets', false, 5),
      ('flower', 'Flower', 'Take a close photo of any flower nearby.', 'Flower2', false, 6),
      ('sunglasses', 'Sunglasses', 'Find someone wearing sunglasses.', 'Glasses', false, 7),
      ('trail-marker', 'Trail marker', 'Find a sign, marker, or arrow that helps people navigate.', 'Signpost', false, 8),
      ('dog', 'Dog', 'Find a dog, dog sign, or dog-themed item.', 'Dog', false, 9),
      ('ice-cream', 'Ice cream', 'Find ice cream, a cone, or something that looks like dessert.', 'IceCreamBowl', false, 10),
      ('cool-hat', 'Cool hat', 'Find the best hat at this stop.', 'HardHat', false, 11),
      ('bike', 'Bike', 'Find a bike, scooter, or anything with two wheels.', 'Bike', false, 12),
      ('free', 'FREE', 'Free space. This one is already yours.', 'Star', true, 13),
      ('leaf', 'Leaf', 'Find a leaf with an interesting shape.', 'Leaf', false, 14),
      ('playground', 'Playground', 'Find a playground, slide, swing, or climbing structure.', 'Trees', false, 15),
      ('rock', 'Rock', 'Find a rock that looks different from the others.', 'Gem', false, 16),
      ('something-round', 'Something round', 'Find something round and snap a photo.', 'Circle', false, 17),
      ('pinecone', 'Pinecone', 'Find a pinecone, acorn, or seed pod.', 'TreePine', false, 18),
      ('bridge', 'Bridge', 'Find a bridge, railing, or crossing.', 'Route', false, 19),
      ('boat', 'Boat', 'Find a boat, water sign, or something shaped like a boat.', 'Sailboat', false, 20),
      ('trash-can', 'Trash can', 'Find a trash can and take a clean photo of it.', 'Trash2', false, 21),
      ('cloud', 'Cloud', 'Take a photo of a cloud or a cloud-shaped object.', 'Cloud', false, 22),
      ('butterfly', 'Butterfly', 'Find a butterfly, bug, or insect detail.', 'Bug', false, 23),
      ('mailbox', 'Mailbox', 'Find a mailbox, message box, or posted note.', 'Mailbox', false, 24),
      ('snack', 'Snack', 'Find a snack someone brought to the party.', 'Cookie', false, 25)
  ) as task_seed(slug, title, description, icon, is_free, sort_order)
  on conflict (game_id, slug) do update set
    title = excluded.title,
    description = excluded.description,
    icon = excluded.icon,
    is_free = excluded.is_free,
    sort_order = excluded.sort_order
  returning game_id
)
update public.games g
set active_stop_id = '00000000-0000-4000-8000-000000000101'
from seeded_game
where g.id = seeded_game.id
  and g.active_stop_id is null;

insert into private.host_secrets (game_id, pin_hash)
values (
  '00000000-0000-4000-8000-000000000001',
  crypt(gen_random_uuid()::text, gen_salt('bf'))
)
on conflict (game_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stops'
  ) then
    alter publication supabase_realtime add table public.stops;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'submissions'
  ) then
    alter publication supabase_realtime add table public.submissions;
  end if;
end;
$$;
