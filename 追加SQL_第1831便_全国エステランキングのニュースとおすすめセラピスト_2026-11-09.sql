-- 第1831便（2026-11-09・カッキーさん）全国エステランキングの「ニュース」「おすすめセラピスト」をコネックエフで自動に（ベンリーから移す）
-- ★ 1店 × 1種類 = 1行。★ 運営が /admin で ON にした店だけ（admin_enabled）。店舗様はコネックエフで自動の ON/OFF・時刻・中身を決める
-- ★ RLS は閉じる（service_role のサーバーだけが読み書き。ほかの表と同じ）
--   news      … ニュース投稿（1日5回まで・朝6時に戻る）。times_min の i 番目の時刻に items の i 番目を投稿
--               items = [{"title":"…","body":"…","image":"<店>/zenkoku_news_<時刻>.jpg" or null}, …]（5件まで）
--   recommend … おすすめセラピスト（1名・月の変更回数に上限）。times_min[0] の時刻に items の順で1人ずつ入れ替える
--               items = [{"name":"みあ"}, …]。next_item = 次に入れる方の番号
create table if not exists public.conecf_zenkoku_options (
  salon_id      bigint      not null references public.salons(id) on delete cascade,
  option_key    text        not null check (option_key in ('news', 'recommend')),
  admin_enabled boolean     not null default false,
  auto          boolean     not null default false,
  times_min     integer[]   not null default '{}',   -- 朝6時はじまりの分（6:11 = 371、翌1:00 = 1500）
  items         jsonb       not null default '[]'::jsonb,
  next_item     integer     not null default 0,
  remaining     integer,                             -- 最後に読んだ残り回数（おすすめの月の変更回数）
  read_at       timestamptz,                         -- 最後に始めた・読んだ時刻（同じ時刻に二重に送らない）
  last_at       timestamptz,                         -- 最後に送れた時刻
  last_outcome  text,
  updated_at    timestamptz not null default now(),
  primary key (salon_id, option_key)
);
alter table public.conecf_zenkoku_options enable row level security; -- ポリシー無し

-- ★ オイルクエスト様（salon_id=5）: ベンリーと同じ設定で用意する（ニュースの文章は 11/9 に全国エステランキングに載っていたものをそのまま。画像は画面から入れる）（自動は OFF のまま。ベンリーを止めてから画面で ON）
insert into public.conecf_zenkoku_options (salon_id, option_key, admin_enabled, auto, times_min, items)
values
  (5, 'news', true, false, '{371,401,431,461,491}', '[{"title": "初めての女の子限定☆", "body": "★美女勢ぞろい★\nALL☆TIME\n\nご新規様大サービス！\n初めての女の子限定\n\n★1000円割引★\nお得な情報を随時配信♪\n\nフリーのお客様限定\n本指名・ご予約料別途", "image": null}, {"title": "初めての女の子限定☆", "body": "★美女勢ぞろい★\nALL☆TIME\n\nご新規様大サービス！\n初めての女の子限定\n\n★1000円割引★\nお得な情報を随時配信♪\n\nフリーのお客様限定\n本指名・ご予約料別途", "image": null}, {"title": "☆オフィシャルメルマガ登録割☆", "body": "☆メルマガ登録☆\n\n★美女勢ぞろい★\nALL☆TIME\n\nご新規様大サービス！\nオフィシャル見た\n+\nメルマガ登録\n★2000円割引★\nお得な情報を随時配信♪\n\nご新規様限定コース\nオールタイム　1000円OFF\n\nフリーのお客様限定\n写真指名・ご予約料別途\n博多駅限定", "image": null}, {"title": "初めての女の子限定☆", "body": "★美女勢ぞろい★\nALL☆TIME\n\nご新規様大サービス！\n初めての女の子限定\n\n★1000円割引★\nお得な情報を随時配信♪\n\nフリーのお客様限定\n本指名・ご予約料別途", "image": null}, {"title": "初めての女の子限定☆", "body": "★美女勢ぞろい★\nALL☆TIME\n\nご新規様大サービス！\n初めての女の子限定\n\n★1000円割引★\nお得な情報を随時配信♪\n\nフリーのお客様限定\n本指名・ご予約料別途", "image": null}]'::jsonb),
  (5, 'recommend', true, false, '{369}', '[{"name":"みあ"},{"name":"うる"},{"name":"みみ"},{"name":"りな"}]'::jsonb)
on conflict (salon_id, option_key) do nothing;

-- 確認: select salon_id, option_key, admin_enabled, auto, times_min, items, next_item from public.conecf_zenkoku_options;
