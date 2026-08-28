-- 「1回目だけ承認、以降は自動」の向きを足す（第48便・設計メモ 追記14 §55）。
--
-- ★★★ なぜ列を増やさないのか
--   auto を別の列（auto_push_enabled）にすると、**「read なのに auto」が作れてしまう。**
--   第45便で link_mode を1列3値にしたのと同じ理由で、ここも1列4値にする。
--   ★ 立ちうる状態を作ってから CHECK で禁じる、をしない。そもそも立てられなくする。
--
--     none       … 連携しない
--     read       … 駅ちかから読む
--     write      … フクエスから書く（★ 毎回、人が承認する）
--     write_auto … フクエスから書く（★ 承認なしで自動反映）
--
-- ★★ 取りこぼしたときにどちらへ倒れるか（採用の決め手・§55-1）
--   既存の判定は `link_mode = 'write'`。'write_auto' を足して直し忘れた箇所は
--   **false になる＝送らない**。★ 安全側に倒れる。逆（read の判定に混ざって書く）は起きない。
--   ★ 読み取り側の2か所（/api/import/targets・ingest系）は `= 'read'` を見ているので影響なし。
--
-- ★★★ この適用だけでは何も変わらない。
--   'write_auto' の行はまだ1つも無く、自動にするには
--   【いまの向きになってから1回でも反映が成功していること】が要る（§54）。
--   ★ 実弾が0回のいまは、どの店も自動にできない。**当てても挙動は不変。**

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'salon_import_sources_link_mode_check'
       and conrelid = 'public.salon_import_sources'::regclass
  ) then
    alter table public.salon_import_sources
      drop constraint salon_import_sources_link_mode_check;
  end if;

  alter table public.salon_import_sources
    add constraint salon_import_sources_link_mode_check
    check (link_mode in ('none', 'read', 'write', 'write_auto'));
end $$;

comment on column public.salon_import_sources.link_mode is
  E'連携の向き。none=連携しない / read=駅ちかから読む / write=フクエスから書く（毎回承認）/ write_auto=フクエスから書く（自動）。★ 同時に立てられないよう1列に持つ（第45便→第48便）。機能ごとに向きを分けないこと。';

-- 確認用（適用後に別途流す）
-- ★ 既存6店が read のままであること（挙動が変わっていない証拠）:
-- select id, salon_id, provider, slot, link_mode from public.salon_import_sources order by id;
--
-- ★ 制約が効いていること（これはエラーになるのが正しい。流さなくてよい）:
-- update public.salon_import_sources set link_mode = 'auto' where id = 1;
