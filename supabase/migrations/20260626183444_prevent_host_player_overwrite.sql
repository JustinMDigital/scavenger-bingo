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
);
