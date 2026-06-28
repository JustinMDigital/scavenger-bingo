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
    where g.id::text = (storage.foldername(storage.objects.name))[1]
      and g.board_hidden is false
  )
  and exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.role = 'player'
      and m.game_id::text = (storage.foldername(storage.objects.name))[1]
      and m.group_slug = (storage.foldername(storage.objects.name))[2]
      and (storage.foldername(storage.objects.name))[4] = (select auth.uid())::text
  )
  and exists (
    select 1
    from public.group_board_tasks gbt
    join public.tasks t
      on t.game_id = gbt.game_id
      and t.slug = gbt.task_slug
    where gbt.game_id::text = (storage.foldername(storage.objects.name))[1]
      and gbt.group_slug = (storage.foldername(storage.objects.name))[2]
      and gbt.task_slug = (storage.foldername(storage.objects.name))[3]
      and t.is_free is false
  )
);
