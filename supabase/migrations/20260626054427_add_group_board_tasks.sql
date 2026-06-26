create table public.group_board_tasks (
  game_id uuid not null references public.games(id) on delete cascade,
  group_slug text not null,
  task_slug text not null,
  slot_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, group_slug, task_slug),
  unique (game_id, group_slug, slot_order),
  foreign key (game_id, group_slug)
    references public.groups(game_id, slug)
    on delete cascade,
  foreign key (game_id, task_slug)
    references public.tasks(game_id, slug)
    on delete cascade,
  constraint group_board_tasks_slot_order_range
    check (slot_order between 1 and 25)
);

create index group_board_tasks_game_group_idx
on public.group_board_tasks(game_id, group_slug, slot_order);

create index group_board_tasks_game_task_idx
on public.group_board_tasks(game_id, task_slug);

create trigger touch_group_board_tasks_updated_at
before update on public.group_board_tasks
for each row execute function private.touch_updated_at();

insert into public.group_board_tasks (
  game_id,
  group_slug,
  task_slug,
  slot_order
)
select
  g.game_id,
  g.slug,
  t.slug,
  t.sort_order
from public.groups g
join public.tasks t
  on t.game_id = g.game_id
where t.sort_order between 1 and 25
on conflict do nothing;

grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.group_board_tasks to authenticated;

alter table public.group_board_tasks enable row level security;

drop policy if exists "authenticated can read active game tasks"
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

create policy "hosts can insert tasks"
on public.tasks
for insert
to authenticated
with check ((select private.is_game_host(game_id)));

create policy "hosts can update tasks"
on public.tasks
for update
to authenticated
using ((select private.is_game_host(game_id)))
with check ((select private.is_game_host(game_id)));

create policy "hosts can delete tasks"
on public.tasks
for delete
to authenticated
using ((select private.is_game_host(game_id)));

create policy "members can read visible board assignments"
on public.group_board_tasks
for select
to authenticated
using (
  (select private.is_game_host(game_id))
  or group_slug = (select private.player_group_slug(game_id))
);

create policy "hosts can insert board assignments"
on public.group_board_tasks
for insert
to authenticated
with check ((select private.is_game_host(game_id)));

create policy "hosts can update board assignments"
on public.group_board_tasks
for update
to authenticated
using ((select private.is_game_host(game_id)))
with check ((select private.is_game_host(game_id)));

create policy "hosts can delete board assignments"
on public.group_board_tasks
for delete
to authenticated
using ((select private.is_game_host(game_id)));

drop policy if exists "players can insert group submissions"
on public.submissions;

drop policy if exists "members can update permitted submissions"
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
    from public.group_board_tasks gbt
    where gbt.game_id = submissions.game_id
      and gbt.group_slug = submissions.group_slug
      and gbt.task_slug = submissions.task_slug
  )
);

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
      from public.group_board_tasks gbt
      where gbt.game_id = submissions.game_id
        and gbt.group_slug = submissions.group_slug
        and gbt.task_slug = submissions.task_slug
    )
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_board_tasks'
  ) then
    alter publication supabase_realtime add table public.group_board_tasks;
  end if;
end;
$$;
