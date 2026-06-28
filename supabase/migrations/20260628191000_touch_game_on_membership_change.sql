create or replace function private.touch_game_for_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_game_id uuid := coalesce(new.game_id, old.game_id);
begin
  if target_game_id is not null then
    update public.games
    set updated_at = now()
    where id = target_game_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists touch_game_on_membership_change
on public.memberships;

create trigger touch_game_on_membership_change
after insert or update or delete on public.memberships
for each row execute function private.touch_game_for_membership_change();
