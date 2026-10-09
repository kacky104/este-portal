-- 追加SQL_第1344便: フクエスCRM の変更マーク（第1116便）を crm_settings・crm_price_items にも付ける 2026-10-09
-- ★ 2026-10-09 点検#5: 60秒更新（lite）は設定・料金表を前回の値で使い回すので、別の端末で部屋・アラーム・料金表を変えても
--   開きっぱなしのスケジュールに出なかった。第1344便の画面側は「マークが前回と違えば full で読む」ので、この2表でもマークを動かす。
-- ★ 使うのは第1116便のトリガー関数 public.crm_change_mark_trg() そのまま（両方の表に salon_id がある）。関数・ポリシーは触らない。
-- ★ 何度流しても二重にならない（drop → create）。

-- 1) 流す前の確認（2表は出ないはず）
select event_object_table
from information_schema.triggers
where trigger_name = 'trg_crm_change_mark'
group by 1 order by 1;

-- 2) 付ける
do $$
declare
  t text;
begin
  foreach t in array array['crm_settings', 'crm_price_items'] loop
    execute format('drop trigger if exists trg_crm_change_mark on public.%I', t);
    execute format(
      'create trigger trg_crm_change_mark after insert or update or delete on public.%I for each row execute function public.crm_change_mark_trg()',
      t
    );
  end loop;
end $$;

-- 3) 流したあとの確認（11表＝第1116便の9表＋2表）
select event_object_table
from information_schema.triggers
where trigger_name = 'trg_crm_change_mark'
group by 1 order by 1;

-- 戻し方:
-- drop trigger if exists trg_crm_change_mark on public.crm_settings;
-- drop trigger if exists trg_crm_change_mark on public.crm_price_items;
