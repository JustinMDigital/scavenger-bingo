drop policy if exists "players can replace group submissions"
on public.submissions;

drop policy if exists "hosts can review submissions"
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
  )
);
