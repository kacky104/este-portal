-- 第1903便（2026-11-10・カッキーさん）バニラ（qzin.jp）の店長ブログをコネックエフで自動投稿に（ベンリーの「バニラ(店長ブログ)」を移す）
-- ★ 1店 = 1行。★ 運営が /admin で ON にした店だけ（admin_enabled）。店舗様はコネックエフで自動の ON/OFF・時刻・中身を決める
-- ★ 形は全国エステランキングのニュース（conecf_zenkoku_options）と同じ考え方:
--     times_min の時刻が来るたびに、items を上から順に1本ずつ投稿する（next_item = 次に出す番号。最後まで行ったら先頭へ）
--     items = [{"title":"…","body":"…","image":"<店>/vanilla_blog_<時刻>.jpg" or null}, …]（10本まで）
-- ★ バニラ側の決まり（11/10 オイルクエスト様の管理画面で確かめた・見るだけ）
--     タイトル 150文字まで ／ 本文 タグ込み 100,000文字まで ／ 画像 1枚・300×300・500KBまで ／ 90日で消える
--     ★ ベンリーは「前の記事を消して新しく出す」形（11/10 時点で一覧は最新の1本だけだった）→ delete_old（既定 true）で同じにする
-- ★ ログインの ID・パスワードは今までの salon_media_credentials に provider='vanilla' で入れる（★ この表は provider に CHECK が無いので変更なし）
-- ★ RLS は閉じる（service_role のサーバーだけが読み書き。ほかの表と同じ）
-- ★ この SQL を流しただけでは何も変わりません（admin_enabled / auto が false・中身も空）

create table if not exists public.conecf_vanilla_blog (
  salon_id       bigint      primary key references public.salons(id) on delete cascade,
  admin_enabled  boolean     not null default false,   -- 運営が開けた店だけ
  auto           boolean     not null default false,   -- 店舗様の自動 ON/OFF
  times_min      integer[]   not null default '{}',    -- 朝6時はじまりの分（6:11 = 371、翌1:00 = 1500）。24個まで
  items          jsonb       not null default '[]'::jsonb,
  next_item      integer     not null default 0,
  delete_old     boolean     not null default true,    -- 新しく出せたら、前にコネックエフが出した記事を消す（ベンリーと同じ）
  last_blog_id   text,                                 -- 最後にコネックエフが出した記事の番号（次に消す相手）
  read_at        timestamptz,                          -- 最後に始めた時刻（同じ時刻に二重に送らない）
  last_at        timestamptz,                          -- 最後に投稿できた時刻
  last_outcome   text,
  updated_at     timestamptz not null default now()
);
alter table public.conecf_vanilla_blog enable row level security; -- ポリシー無し
revoke all on public.conecf_vanilla_blog from anon, authenticated;

comment on table public.conecf_vanilla_blog is
  E'コネックエフのバニラ店長ブログ自動投稿（第1903便）。★ admin_enabled・auto 既定 false。★ times_min の時刻ごとに items を順に1本。★ service_role 専用。';

-- ★ オイルクエスト様（salon_id=5）: 運営として開けるだけ（自動は OFF・中身は空。ベンリーを止めてから画面で入れて ON）
insert into public.conecf_vanilla_blog (salon_id, admin_enabled)
values (5, true)
on conflict (salon_id) do nothing;

-- 確認: select salon_id, admin_enabled, auto, times_min, jsonb_array_length(items) as n, next_item, delete_old, last_at, last_outcome from public.conecf_vanilla_blog;
