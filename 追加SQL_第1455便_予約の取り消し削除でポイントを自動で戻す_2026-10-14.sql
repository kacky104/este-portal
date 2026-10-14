-- 第1455便（2026-10-14・カッキーさん）: 予約が取り消された・消されたら、フクエスポイントを自動で元に戻す
--
-- ★ 決まりごと（カッキーさん「これは自動にしたい」・範囲は「利用も来店ポイントも自動」）
--   ・予約が「キャンセル」になった／予約が消されたとき、その予約に付いた
--       来店ポイント（visit）→ 取り消す（revoke の行・−50pt）
--       ポイントの利用（use）→ 会員に戻す（refund の行・＋1,000pt）。CRM の「Pt−1,000」も消え、請求書でも差し引かない
--   ・どの画面・どの処理で取り消し・削除しても効くように、予約の表（salon_bookings）のトリガーで行う。
--   ・★ 付けてから90日より前のポイントは触らない（古い予約の定期削除で、昔のポイントまで動かさないため）。
--   ・★ 一度戻したあと予約を「確定」に戻しても、ポイントは自動では付け直さない（利用は同じ予約でもう使えない）。
--   ・★ ポイントの処理に失敗しても、予約の取り消し・削除は止めない（警告だけ）。
--
-- ★ 何度流しても同じ結果。
-- ★ 最後に、いますでに「キャンセル・削除」になっている予約の分（直近90日）を1回だけ戻す（/admin/points ③の行が「取り消し済み」になる）。
-- ★ このSQLだけで動く（アプリの push は表示の文言だけ）。

create or replace function public.points_reverse_for_booking(p_booking_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  since timestamptz := now() - interval '90 days';
begin
  if p_booking_id is null then return; end if;
  -- 先に利用を戻す（＋）→ そのあと来店ポイントを取り消す（−）＝残高がマイナスになりにくい順
  for r in
    select m.* from public.member_points m
    where m.booking_id = p_booking_id and m.kind = 'use' and m.created_at >= since
      and not exists (select 1 from public.member_points x where x.kind = 'refund' and x.booking_id = m.booking_id)
  loop
    insert into public.member_points (user_id, delta, kind, salon_id, booking_id, business_date, note)
      values (r.user_id, -r.delta, 'refund', r.salon_id, r.booking_id, r.business_date, '予約の' || p_reason || 'で自動で戻した')
      on conflict do nothing;
  end loop;
  for r in
    select m.* from public.member_points m
    where m.booking_id = p_booking_id and m.kind = 'visit' and m.created_at >= since
      and not exists (select 1 from public.member_points x where x.kind = 'revoke' and x.booking_id = m.booking_id)
  loop
    insert into public.member_points (user_id, delta, kind, salon_id, booking_id, business_date, note)
      values (r.user_id, -r.delta, 'revoke', r.salon_id, r.booking_id, r.business_date, '予約の' || p_reason || 'で自動で取り消し')
      on conflict do nothing;
  end loop;
end;
$$;
revoke all on function public.points_reverse_for_booking(text, text) from public, anon, authenticated;
grant execute on function public.points_reverse_for_booking(text, text) to service_role;

-- revoke も予約1件に1回（同時に動いても二重にならない）
create unique index if not exists member_points_revoke_booking_uq on public.member_points (booking_id) where kind = 'revoke' and booking_id is not null;

create or replace function public.points_on_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform public.points_reverse_for_booking(old.id::text, '削除');
    elsif new.status = 'cancelled' and coalesce(old.status, '') <> 'cancelled' then
      perform public.points_reverse_for_booking(new.id::text, '取り消し');
    end if;
  exception when others then
    raise warning '[points] 予約 % のポイントを戻せなかった: %', coalesce(new.id::text, old.id::text), sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists points_on_booking_cancel on public.salon_bookings;
create trigger points_on_booking_cancel
  after update of status on public.salon_bookings
  for each row execute function public.points_on_booking_change();
drop trigger if exists points_on_booking_delete on public.salon_bookings;
create trigger points_on_booking_delete
  after delete on public.salon_bookings
  for each row execute function public.points_on_booking_change();

-- いますでにキャンセル・削除になっている予約の分（直近90日）を1回だけ戻す
do $$
declare b record;
begin
  for b in
    select distinct m.booking_id,
           case when s.id is null then '削除' else '取り消し' end as reason
    from public.member_points m
    left join public.salon_bookings s on s.id::text = m.booking_id
    where m.kind in ('visit', 'use') and m.booking_id is not null
      and m.created_at >= now() - interval '90 days'
      and (s.id is null or s.status = 'cancelled')
  loop
    perform public.points_reverse_for_booking(b.booking_id, b.reason);
  end loop;
end $$;

-- 確認（トリガー2つが出れば OK）／戻した行
select tgname from pg_trigger where tgrelid = 'public.salon_bookings'::regclass and tgname like 'points_on_booking_%' order by tgname;
select kind, delta, booking_id, note, created_at from public.member_points where kind in ('revoke', 'refund') order by id desc limit 10;
