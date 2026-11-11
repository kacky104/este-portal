-- 第1227便（2026-10-06）: salon_bookings の「同じセラピスト・同じ開始時刻は1行だけ」の UNIQUE を
--   【キャンセル以外】だけに絞る（部分ユニーク索引）。キャンセル行は何行あってもよい。
--
-- ★ なぜ: 今までの UNIQUE(therapist_id, slot_start) はキャンセル行も数えるため、同じ枠へ再予約・移動・変更するとき、
--   コード側がキャンセル行を【物理削除】してから入れていた（3か所）。CRM 以前の作りだが、いまは消えると困るものが乗っている:
--   悪質キャンセルの印（cancel_bad）・顧客台帳のキャンセル回数・同意書・セラピストページ（/cast）の「キャンセル」表示（第1213便）。
-- ★ これから: 有効な予約（status <> 'cancelled'）だけが「1枠1行」。時間帯の重なりは既存の EXCLUDE（salon_bookings_no_overlap・
--   これも cancelled は対象外）が引き続き防ぐ。コード側（第1227便）はキャンセル行の削除をやめる。
-- ★ フリー客（therapist_id IS NULL）の部分ユニーク索引（第2026-08-14便）も同じく cancelled を外す。
-- ★ 既存データ: 有効な予約の重複は今までの UNIQUE が防いでいたので、新しい索引の作成は失敗しない。
-- ★ 順番: ★★ この SQL を先に流してから push ★★（逆だと、SQL 前にコードが出ると同じ枠への再予約が 23505 で「既に予約が入っています」になる）。
-- ★ 冪等（再実行しても安全）。

-- 1) 今までの UNIQUE（制約・または一意索引）を探して落とす。名前は環境で違うので探す。
do $$
declare r record;
begin
  -- 制約として付いているもの
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.salon_bookings'::regclass
      and c.contype = 'u'
      and cardinality(c.conkey) = 2
      and (select array_agg(a.attname::text)
             from unnest(c.conkey) k
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) @> array['therapist_id', 'slot_start']
  loop
    execute format('alter table public.salon_bookings drop constraint %I', r.conname);
    raise notice 'dropped constraint %', r.conname;
  end loop;
  -- 制約ではなく一意索引として付いているもの（部分索引＝WHERE 付きは除く）
  for r in
    select i.indexrelid::regclass::text as idxname
    from pg_index i
    where i.indrelid = 'public.salon_bookings'::regclass
      and i.indisunique
      and i.indpred is null
      and i.indnatts = 2
      and (select array_agg(a.attname::text)
             from unnest(i.indkey::int2[]) k
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k) @> array['therapist_id', 'slot_start']
  loop
    execute format('drop index if exists %s', r.idxname);
    raise notice 'dropped index %', r.idxname;
  end loop;
end $$;

-- 2) 有効な予約だけ「1枠1行」
create unique index if not exists salon_bookings_active_slot_uniq
  on public.salon_bookings (therapist_id, slot_start)
  where status <> 'cancelled' and therapist_id is not null;

-- 3) フリー客の部分ユニーク索引も cancelled を外す
drop index if exists public.salon_bookings_free_slot_uniq;
create unique index salon_bookings_free_slot_uniq
  on public.salon_bookings (salon_id, slot_start)
  where therapist_id is null and status <> 'cancelled';

comment on index public.salon_bookings_active_slot_uniq is
  '同一セラピスト・同一開始時刻の有効な予約は1行（cancelled は対象外・第1227便）。違反コードは 23505。';

-- 確認（適用後に別途流す）。
-- 一意のものが salon_bookings_active_slot_uniq・salon_bookings_free_slot_uniq（どちらも WHERE 付き）と主キーだけならOK。
-- select indexname, indexdef from pg_indexes where schemaname='public' and tablename='salon_bookings' and indexdef ilike '%unique%';
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.salon_bookings'::regclass and contype in ('u','x');
