grant delete on public.submissions to authenticated;

create policy "hosts can delete submissions"
on public.submissions
for delete
to authenticated
using ((select private.is_game_host(game_id)));

create policy "hosts can delete proof files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'proofs'
  and exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.role = 'host'
      and m.game_id::text = (storage.foldername(name))[1]
  )
);
