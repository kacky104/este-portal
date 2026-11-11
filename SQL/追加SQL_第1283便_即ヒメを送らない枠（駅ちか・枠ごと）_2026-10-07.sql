-- 追加SQL 第1283便（2026-10-07）: 即ヒメを「送らない」枠を、枠ごとに持てるようにする（駅ちか・コネックエフの店）
--
-- ■ 何のためか（カッキーさんの決定）
--   コネックエフの店は、店舗様がホームでその枠の「更新する」を押せば、フクエスの「今すぐ」を
--   駅ちかの即ヒメとして自動で送る。駅ちかが2枠ある店は、枠2にも同じように送る（既定）。
--     ・枠2にも送ると、駅ちかへのログインが倍になり、回数制のプランでは枠2の回数も使う。
--     ・送りたくない枠だけ、運営が /admin の「駅ちかの店舗ページ登録」の一覧で「即ヒメ（送る）」を「送らない」にする。
--   この列に【送らない】を入れる。false（既定）＝今までどおり送る。
--   ★ ラビリンス様（1枠）は false のまま＝動きは変わらない。
--   ★ 第323便で外した sokuhime_auto（店舗様が自分で入れるスイッチ）とは別の列。あちらは今も見ない。
--
-- ■ 順番
--   ① 【1】を流す（列を足すだけ。どの店の動きも変わらない）   ★ 必ず push より先に
--   ② push する
--   ★ 逆（先に push）になったときのために、列が無いあいだは「止めた枠は無い」として進む作りにしてあるが、
--     本番の DB では確かめていない。効かなければ【1】を流すまで即ヒメの周が止まる。★ だから【1】を先に。

-- 【1】列を足す（何度流しても同じ）
alter table public.salon_import_sources
  add column if not exists sokuhime_push_off boolean not null default false;

comment on column public.salon_import_sources.sokuhime_push_off is
  '即ヒメを送らない枠（第1283便）。true のとき、この枠へはフクエスの「今すぐ」を即ヒメとして送らない（周が入らない）。既定 false＝送る。運営が /admin で枠ごとに切り替える。駅ちかで、書く向き（write / write_auto）の枠にだけ意味がある。';

select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'salon_import_sources' and column_name = 'sokuhime_push_off';


-- 【2】確かめる（読むだけ）: 駅ちかへ書く向きの枠と、即ヒメを送るかどうか
-- select s.salon_id, sa.name, s.slot, s.link_mode, s.is_enabled, s.sokuhime_push_off
--   from public.salon_import_sources s join public.salons sa on sa.id = s.salon_id
--  where s.provider = 'ekichika' and s.link_mode in ('write', 'write_auto')
--  order by s.salon_id, s.slot;

-- ■ SQL で切り替えたいとき（ふだんは /admin のボタンで）
-- update public.salon_import_sources set sokuhime_push_off = true  where salon_id = <店舗ID> and provider = 'ekichika' and slot = 2;   -- 送らない
-- update public.salon_import_sources set sokuhime_push_off = false where salon_id = <店舗ID> and provider = 'ekichika' and slot = 2;   -- 送る
