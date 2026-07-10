-- タイムライン（おすすめ/フォロー中/お店 全タブ共通）タブバー直下のバナースライダー。
-- 5枠固定（slot 1〜5）・16:9（1280×720）・リンクURL任意。/x/admin の「バナー」タブで運営が管理する。
-- 行が存在する枠だけ表示（0件ならスライダー自体を出さない）。

create table if not exists public.x_banners (
  slot int primary key check (slot between 1 and 5),
  image_url text not null,
  link_url text,
  updated_at timestamptz not null default now()
);

alter table public.x_banners enable row level security;

-- 読み取り: 誰でも（タイムライン同様、未ログインにも表示するため anon 含む）
drop policy if exists x_banners_select on public.x_banners;
create policy x_banners_select on public.x_banners
  for select to anon, authenticated
  using (true);

-- 書き込み: 運営（kind=official）または最上位管理者（ADMIN_UUID＝src/app/lib/admin.ts と同一値）。
-- /x/admin にログインする管理ユーザーは official プロフィールを持たない場合があるため UID でも許可する。
drop policy if exists x_banners_write on public.x_banners;
create policy x_banners_write on public.x_banners
  for all to authenticated
  using (x_my_kind() = 'official' or auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid)
  with check (x_my_kind() = 'official' or auth.uid() = '63aca737-b399-4fb2-bf92-8a3816955d69'::uuid);
