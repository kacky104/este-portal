-- セラピスト本人の了承（媒体×用途ごと）— 第118便・2026-09-03
--
-- ★★★ なぜ要るか
--   エステ魂の写メ日記は【セラピスト本人のアカウント】から投稿する（店舗の管理画面からは投稿できない）。
--   ★ 店舗が繋いだからといって全員ぶん送ると、了承していない人の日記が本人のアカウントから出る。
--   → 送る相手は【1人ずつの了承】で決める（カッキーさん・2026-09-03）。
--
-- ★★★ 決めごと
--   ・既定は 'unknown'（まだ聞いていない）。★ 行が無いのも同じ意味。★ どちらも【送らない】
--   ・'declined'（断られた）を 'unknown' と分ける。★ 店舗様の次の行動が違う（もう聞かない／聞く）
--   ・ここに入るのは【店舗様の申告】。★ 本人の署名ではない。★ 画面でもそう書く
--   ・あとから取り消せる（state を戻すだけ）

create table if not exists public.therapist_media_consent (
  therapist_id bigint      not null references public.therapists(id) on delete cascade,
  provider     text        not null,                       -- 'esutama' など
  kind         text        not null,                       -- 'diary'（用途。増えたらここに足す）
  state        text        not null default 'unknown'
                 check (state in ('unknown', 'agreed', 'declined')),
  -- ★ いつ・誰が入れたか。★ 「了承あり」に誰がしたのかを後から辿れるように
  decided_at   timestamptz,
  decided_by   uuid,
  updated_at   timestamptz not null default now(),
  primary key (therapist_id, provider, kind)
);

-- 店舗の画面は「この店の全員ぶん」を一度に引く
create index if not exists therapist_media_consent_therapist_idx
  on public.therapist_media_consent (therapist_id);

-- ★★ anon / authenticated には GRANT しない。★ 取得も更新も server action（service_role）だけ。
--   ★ therapist_diary_forward と同じ扱い（第27便・第84便）。
revoke all on public.therapist_media_consent from anon, authenticated;

-- ★ 確かめ方
--   select therapist_id, provider, kind, state, decided_at from public.therapist_media_consent order by therapist_id;
