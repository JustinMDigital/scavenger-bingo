drop policy if exists "players can update their own player membership"
on public.memberships;

create policy "players can update their own player membership"
on public.memberships
for update
to authenticated
using (
  user_id = (select auth.uid())
  and role = 'player'
  and group_slug is not null
)
with check (
  user_id = (select auth.uid())
  and role = 'player'
  and group_slug is not null
  and group_slug = (select private.player_group_slug(game_id))
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

drop policy if exists "players can delete their own proof files"
on storage.objects;

create policy "players can delete their own proof files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'proofs'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[4] = (select auth.uid())::text
);
