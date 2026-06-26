create index if not exists games_active_stop_id_idx
on public.games(active_stop_id);

create index if not exists memberships_game_group_slug_idx
on public.memberships(game_id, group_slug);

create index if not exists submissions_game_task_slug_idx
on public.submissions(game_id, task_slug);

create index if not exists submissions_submitted_by_idx
on public.submissions(submitted_by);

update public.games g
set active_stop_id = s.id,
    updated_at = now()
from public.stops s
where g.code = 'FAMILY'
  and s.game_id = g.id
  and s.slug = 'riverside-pavilion'
  and g.active_stop_id is null;
