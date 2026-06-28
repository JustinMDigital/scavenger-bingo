update public.games g
set phase = 'play',
    active_stop_id = null,
    timer_running = false,
    timer_started_at = now(),
    board_hidden = true,
    updated_at = now()
where g.is_active is true
  and g.phase <> 'review'
  and g.board_hidden is true
  and g.code not like 'CLOSED-%'
  and not exists (
    select 1
    from public.submissions s
    where s.game_id = g.id
  );
