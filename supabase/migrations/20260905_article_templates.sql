-- 駅ちかの新着情報：枠の写しと、店舗様のテンプレート（第158便・2026-09-05）
--
-- ★★★ 箱を3つに分ける（media_roster_snapshots と同じ考え方・第50便）
--   media_article_slots     … 相手側がいまどうなっているかの【写し】（読んだ事実）
--   salon_article_templates … これから出す【文章】（店舗様が書いたもの）
--   salon_media_audit       … 何が起きたかの【記録】（追記専用）
--   ★ 3つを混ぜないこと。混ぜると「読んだ」と「送った」が同じ列に並ぶ。


-- ────────────────────────────────────────────────────────────
-- ① 枠の写し
-- ────────────────────────────────────────────────────────────
--
-- ★★★ なぜ要るか（2026-09-05 の実弾で分かった）
--   駅ちかへ送れて、管理画面にも載ったのに、**公開ページには出なかった**。
--   ★ 枠そのものが「非表示」だったから。★ それは一覧にしか書いていない。
--   → ★ 店舗様が登録する【前】に「この枠はいま非表示です」「この枠はカラです」と言いたい。
--   ★★ そのためには、読んだ結果をフクエス側に置いておく必要がある。
--
-- ★ 店舗×媒体×枠（mediaSlot）につき【最新1件だけ】上書き。★ 履歴は監査ログのほう。

create table if not exists public.media_article_slots (
  salon_id   bigint      not null references public.salons(id) on delete cascade,
  provider   text        not null,                 -- 'ekichika'
  slot       smallint    not null default 1,       -- ★ 媒体の登録枠（mediaSlot）。記事のカテゴリーではない

  flow_id    uuid,
  read_at    timestamptz not null default now(),

  -- ★ 画面が jsonb を開かずに数を出せるように、数は列で持つ（media_work_plans と同じ）
  total      smallint    not null,                 -- 読めた枠の数（駅ちかは5のはず）
  shown      smallint    not null,                 -- ★ 公開ページに出ている枠の数
  empty      smallint    not null,                 -- ★ 記事がまだ無い枠の数

  -- rows: [{ slot, label, hasArticle, visible, title, updatedAt }]
  --   slot     … 記事のカテゴリー 1〜5（★ 上の slot 列＝媒体の登録枠 とは別物）
  --   label    … 相手の言葉のカテゴリー名（速報NEWS / 新人速報 …）
  --   visible  … true 表示 / false 非表示 / null 分からない
  --     ★★★ null を false に倒さないこと。「出ない」と「分からない」は別（作法 3-5）
  rows       jsonb       not null default '[]'::jsonb,

  primary key (salon_id, provider, slot)
);

-- ★★ salon_media_credentials / media_roster_snapshots と同じ扱い。
--   RLS 有効・ポリシーなし・anon/authenticated に GRANT なし ＝ service_role からのみ。
--   画面へは Server Action（オーナー検証つき）を通してしか出さない。
alter table public.media_article_slots enable row level security;
revoke all on public.media_article_slots from anon, authenticated;

comment on table public.media_article_slots is
  '駅ちかの新着情報の枠の写し（店舗×媒体×枠につき最新1件を上書き）。★ 読んだ事実であって、送る計画でも送った記録でもない（第158便）。';

comment on column public.media_article_slots.slot is
  E'媒体の登録枠（mediaSlot）。★ rows[].slot（記事のカテゴリー1〜5）とは【別物】。同じ「枠」という言葉を2つの意味で使わないこと（第156便）。';

comment on column public.media_article_slots.shown is
  E'公開ページに出ている枠の数。★ 一覧の「表示/非表示」ボタンの値から数えたもの。★ 記事の脇に出る (表示) の文字ではない（あれは公開状態ではない・2026-09-05 実測）。';

comment on column public.media_article_slots.rows is
  E'[{slot,label,hasArticle,visible,title,updatedAt}]。visible は true/false/null の3値。★ null（分からない）を false（非表示）に倒さないこと。';


-- ────────────────────────────────────────────────────────────
-- ② 店舗様のテンプレート
-- ────────────────────────────────────────────────────────────
--
-- ★★★ 決めごと（2026-09-05・カッキーさん）
--   ・ローテは【案A】＝1本の列を順番に回す。★ テンプレート自身が「どの枠へ出すか」を持つ
--   ・★★★ **店舗様が選んだ枠しか触らない。** ★ 選ばれていない枠には1文字も書かない
--   ・1日◯回。既定は4回（★ 30分おきは駅ちかに迷惑・カッキーさんの判断）
--
-- ★★ article_slot に既定値を作らない（not null だが default 無し）。
--   ★ 「うっかり速報NEWSを上書き」する道を、DBの形として残さない（第155便の口と同じ作法）。

create table if not exists public.salon_article_templates (
  id           bigint      generated always as identity primary key,
  salon_id     bigint      not null references public.salons(id) on delete cascade,
  provider     text        not null default 'ekichika',
  slot         smallint    not null default 1,      -- ★ 媒体の登録枠（mediaSlot）

  -- ★★★ 記事のカテゴリー 1〜5。★ ここが「どの枠を上書きするか」
  article_slot smallint    not null check (article_slot between 1 and 5),

  title        text        not null,
  body         text        not null,                -- ★ HTML（<p><br><b>）。画像・外部リンクは入れない

  -- ★ 誰の紹介か（フクエスのセラピスト）。★ 送るときに駅ちかの girl_id へ引き直す
  --   ★★ null なら【読んだページの選択をそのまま返す】＝勝手に変えない
  therapist_id bigint      references public.therapists(id) on delete set null,

  -- ★ 自動で回すか。★ 既定は false（★ 作っただけでは何も起きない）
  is_active    boolean     not null default false,

  -- ★ 並び順（案Aの「1本の列」）。★ 同じ値なら id 順
  sort_order   smallint    not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ★ 自動の周が「この店の回す対象」を引く
create index if not exists salon_article_templates_active_idx
  on public.salon_article_templates (salon_id, provider, slot, is_active, sort_order, id);

alter table public.salon_article_templates enable row level security;
revoke all on public.salon_article_templates from anon, authenticated;

comment on table public.salon_article_templates is
  '駅ちかの新着情報へ出す文章（店舗様が書いたもの）。★ 1本ずつ順番に回す（案A）。★ テンプレート自身が出す枠を持つ（第158便）。';

comment on column public.salon_article_templates.article_slot is
  E'記事のカテゴリー 1〜5（1速報NEWS/2新人速報/3激アツ割引情報/4イベント速報/5緊急出勤速報）。★ 既定値を作っていない＝必ず選ばせる。★ 選ばれていない枠には触らない。';

comment on column public.salon_article_templates.is_active is
  E'自動で回すか。★ 既定は false。★ 作っただけでは何も起きない（第43便の作法）。';

comment on column public.salon_article_templates.therapist_id is
  E'誰の紹介か（フクエス側のセラピスト）。★ null なら駅ちかの編集ページの選択をそのまま返す＝勝手に変えない。';


-- ────────────────────────────────────────────────────────────
-- ③ 1日◯回（店舗ごと）
-- ────────────────────────────────────────────────────────────
--
-- ★ 既定は4回（カッキーさんの判断・2026-09-05）。
--   > 30分おきに1回上げるのは無意味というか駅ちかに迷惑ですね。1日に4回更新くらいが良いと思います。
-- ★★ 0 は「送らない」。★ null と混ぜない（行が無い＝まだ決めていない＝既定の4）。

create table if not exists public.salon_article_settings (
  salon_id       bigint      not null references public.salons(id) on delete cascade,
  provider       text        not null default 'ekichika',
  slot           smallint    not null default 1,

  posts_per_day  smallint    not null default 4 check (posts_per_day between 0 and 12),

  -- ★ 自動で回すか（店舗ごとの元栓）。★ 既定は false
  auto_enabled   boolean     not null default false,

  -- ★ 回した位置（案Aの「1本の列」のどこまで進んだか）
  rotation_index smallint    not null default 0,
  -- ★ その日に何本出したか。★ 区切りは営業日（朝6時）
  last_day       text,
  last_count     smallint    not null default 0,

  updated_at     timestamptz not null default now(),
  primary key (salon_id, provider, slot)
);

alter table public.salon_article_settings enable row level security;
revoke all on public.salon_article_settings from anon, authenticated;

comment on column public.salon_article_settings.posts_per_day is
  E'1日に出す本数。★ 既定4（カッキーさんの判断）。★ 0は「送らない」。★ 上限12。';

comment on column public.salon_article_settings.last_day is
  E'最後に出した営業日（YYYY-MM-DD・朝6時区切り）。★ 暦の0時ではない（DAY_START_HOUR=6）。';


-- ★ 確かめ方（適用後に別途流す）
--   select table_name from information_schema.tables
--    where table_schema='public'
--      and table_name in ('media_article_slots','salon_article_templates','salon_article_settings');
--   ★ 3行返れば成功
