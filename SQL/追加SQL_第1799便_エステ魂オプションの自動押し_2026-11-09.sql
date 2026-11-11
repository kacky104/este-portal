-- ★ 第1799便（2026-11-09・カッキーさん OK 済み）: エステ魂【オプション】をコネックエフで自動で押す
--   ★ 運営が /admin で ON にした店だけ使える（admin_enabled）。★ 店舗様はコネックエフで自動の ON/OFF と時間を決める（auto ほか）。
--   ★ 1店 × 1オプション = 1行。★ RLS は閉じる（service_role の server action だけが読む・書く。ほかの表と同じ）。
--   ★ 対象（押す型）:
--     shop_boost   … 集客ブースト（ご案内状況「◎今すぐご案内可」で表示。1回で1時間・1日24回）
--     cast_appeal  … セラピストアピール（その日の出勤者のうち最終アピールがいちばん古い子を、出勤時間内に）
--     job_appeal   … 求人ワンクリックアピール（求人情報・お仕事体験談を、決めた時刻に）
--   ★ 投稿型・本日体験入店は、作るときにこの check に足す。

create table if not exists public.conecf_esutama_options (
  salon_id       bigint      not null references public.salons(id) on delete cascade,
  option_key     text        not null check (option_key in ('shop_boost', 'cast_appeal', 'job_appeal')),
  admin_enabled  boolean     not null default false,   -- 運営が ON にした店だけ、コネックエフに出る
  auto           boolean     not null default false,   -- 店舗様が「自動で押す」を ON
  start_min      integer     check (start_min between 0 and 2879),   -- 時間帯のはじめ（0時からの分。翌朝は 1440 以上）
  end_min        integer     check (end_min between 0 and 2879),
  interval_min   integer     check (interval_min between 10 and 1440), -- 間隔で押すもの（shop_boost）
  times_min      integer[],                             -- 時刻で押すもの（job_appeal。例 {604, 1206, 1320} = 10:04・20:06・22:00）
  remaining      integer,                               -- 最後に読んだ残り回数
  read_at        timestamptz,                           -- 最後に画面を読んだ時刻
  last_at        timestamptz,                           -- 最後に押せた時刻
  last_outcome   text,                                  -- 最後の結果（ok / no_remaining / error: …）
  updated_at     timestamptz not null default now(),
  primary key (salon_id, option_key)
);

alter table public.conecf_esutama_options enable row level security;
-- ★ policy は作らない（＝ anon / authenticated からは読めない・書けない）

-- 確かめ（読むだけ）
-- select * from public.conecf_esutama_options order by salon_id, option_key;
