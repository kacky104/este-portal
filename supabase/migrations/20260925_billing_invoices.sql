-- 請求書の自動発行（第815便・2026-09-25・カッキーさん）★ 案・まだ流していない
--
-- ★ 流れ: 毎月1日に店舗ごとの契約から【下書き】を作る → カッキーさんが管理画面で確かめる → 「発行」
--         → PDF を作って非公開 Storage に置く → 店舗マイページのお知らせ＋メール（★ 後で LINE も）
--         → 入金を確かめたら「入金済み」（振込／現金）
-- ★ 決めごと（カッキーさん）
--   ・免税事業者の間（〜2027年8月）も「小計＋消費税10%＝合計」と書く。★ 1円未満は切り捨て
--   ・登録番号は設定の欄を空にしておく（入れれば請求書に出る）
--   ・毎月1日発行・当月25日期限・振込（どうしてもの店は現金）
--   ・宛名は店舗名（店ごとに変えられる欄あり）
--   ・割引は店ごとに条件が違う → 契約の行に【マイナスの金額・期間つき】で入れる
-- ★ 書き込みはすべてサーバ（service role）から。★ 店舗オーナーは【自分の店の・発行済みの】請求書だけ読める
-- ★ 金額はすべて円の整数（税抜）。★ 税額・合計は発行時に計算して請求書に固定する

-- ── 1. 発行者の設定（1行だけ）──────────────────────────────────
create table if not exists public.billing_settings (
  id               smallint primary key default 1 check (id = 1),
  issuer_name      text not null default '',   -- 屋号・発行者名
  issuer_address   text not null default '',
  issuer_tel       text not null default '',
  issuer_email     text not null default '',
  registration_no  text,                       -- 適格請求書発行事業者の登録番号（T＋13桁）。★ null＝出さない
  bank_info        text not null default '',   -- 振込先（銀行名・支店・種別・口座番号・名義を改行区切り）
  tax_rate_pct     smallint not null default 10 check (tax_rate_pct between 0 and 100),
  due_day          smallint not null default 25 check (due_day between 1 and 28),
  note             text not null default '',   -- 請求書の下に出す一言（振込手数料のお願いなど）
  updated_at       timestamptz not null default now()
);
insert into public.billing_settings (id) values (1) on conflict (id) do nothing;

-- ── 2. 品目の一覧 ─────────────────────────────────────────────
create table if not exists public.billing_items (
  id          serial primary key,
  name        text not null,                  -- フクエス掲載料／フクエスワーク掲載料／フクエスCRM／オプションバナー など
  unit_price  integer not null,               -- 税抜・円（割引の品目ならマイナス）
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
insert into public.billing_items (name, unit_price, sort_order)
select 'フクエス掲載料', 60000, 10
where not exists (select 1 from public.billing_items where name = 'フクエス掲載料');

-- ── 3. 店舗ごとの請求先 ───────────────────────────────────────
create table if not exists public.salon_billing_profiles (
  salon_id        integer primary key references public.salons(id) on delete cascade,
  recipient_name  text,                       -- ★ null＝店舗名を使う
  billing_email   text,                       -- ★ null＝オーナーのログインメールに送る
  payment_method  text not null default 'transfer' check (payment_method in ('transfer', 'cash')),
  memo            text not null default '',   -- 契約時の条件など（カッキーさん用・請求書には出ない）
  updated_at      timestamptz not null default now()
);

-- ── 4. 店舗ごとの契約（毎月の請求の元）──────────────────────────
--   ★ 1行＝1品目。割引は unit_price をマイナスにした行（例: 割引 −10,000・2026-10〜2026-12）
--   ★ start_month〜end_month の月だけ下書きに入る（月は各月1日の日付で持つ）。end_month null＝ずっと
create table if not exists public.salon_billing_lines (
  id           serial primary key,
  salon_id     integer not null references public.salons(id) on delete cascade,
  item_id      integer references public.billing_items(id) on delete set null,
  label        text not null,                 -- 請求書に出る品名（品目名をもとに変えられる）
  unit_price   integer not null,              -- 税抜・円（割引はマイナス）
  quantity     integer not null default 1 check (quantity > 0),
  start_month  date not null check (extract(day from start_month) = 1),
  end_month    date check (end_month is null or extract(day from end_month) = 1),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  check (end_month is null or end_month >= start_month)
);
create index if not exists idx_salon_billing_lines_salon on public.salon_billing_lines (salon_id);

-- ── 5. 請求書 ─────────────────────────────────────────────────
create table if not exists public.invoices (
  id              bigserial primary key,
  salon_id        integer not null references public.salons(id) on delete restrict,
  invoice_no      text unique,                -- 発行時に付ける（例: FK-202610-0001）。★ 下書きは null
  billing_month   date not null check (extract(day from billing_month) = 1),
  status          text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'void')),
  recipient_name  text not null,              -- 発行時の宛名を固定
  payment_method  text not null default 'transfer' check (payment_method in ('transfer', 'cash')),
  issue_date      date,
  due_date        date,
  subtotal        integer not null default 0, -- 税抜の合計（割引を引いたあと）
  tax_amount      integer not null default 0,
  total           integer not null default 0,
  tax_rate_pct    smallint not null default 10,
  issuer_snapshot jsonb,                      -- 発行時の発行者設定を丸ごと固定（後で設定を変えても過去の請求書は変わらない）
  pdf_path        text,                       -- invoices バケット内のパス
  issued_at       timestamptz,
  paid_at         timestamptz,
  paid_method     text check (paid_method is null or paid_method in ('transfer', 'cash')),
  admin_note      text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- ★ 1店1か月に有効な請求書は1通（取り消したものは除く）
create unique index if not exists uq_invoices_salon_month
  on public.invoices (salon_id, billing_month) where status <> 'void';
create index if not exists idx_invoices_status on public.invoices (status, billing_month);

-- ── 6. 請求書の明細 ───────────────────────────────────────────
create table if not exists public.invoice_lines (
  id          bigserial primary key,
  invoice_id  bigint not null references public.invoices(id) on delete cascade,
  label       text not null,
  unit_price  integer not null,
  quantity    integer not null default 1 check (quantity > 0),
  amount      integer not null,               -- unit_price × quantity
  sort_order  integer not null default 0
);
create index if not exists idx_invoice_lines_invoice on public.invoice_lines (invoice_id);

-- ── 見られる人の範囲（RLS）──────────────────────────────────────
alter table public.billing_settings        enable row level security;
alter table public.billing_items           enable row level security;
alter table public.salon_billing_profiles  enable row level security;
alter table public.salon_billing_lines     enable row level security;
alter table public.invoices                enable row level security;
alter table public.invoice_lines           enable row level security;
-- ★ 設定・品目・請求先・契約は policy なし＝service role だけ（管理画面は server action から）

drop policy if exists invoices_owner_read on public.invoices;
create policy invoices_owner_read on public.invoices
  for select using (
    status in ('issued', 'paid')
    and exists (select 1 from public.salons s where s.id = invoices.salon_id and s.owner_id = auth.uid())
  );

drop policy if exists invoice_lines_owner_read on public.invoice_lines;
create policy invoice_lines_owner_read on public.invoice_lines
  for select using (
    exists (
      select 1 from public.invoices i join public.salons s on s.id = i.salon_id
       where i.id = invoice_lines.invoice_id and i.status in ('issued', 'paid') and s.owner_id = auth.uid()
    )
  );

-- ── PDF の置き場所（非公開の Storage）─────────────────────────────
--   ★ public = false。★ 店舗には server action が期限つきの URL（signed URL）を渡す。★ 直接の読み書き policy は作らない
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- ★ 確かめ方（適用後に流す）
--   select table_name from information_schema.tables
--    where table_schema='public' and table_name in
--      ('billing_settings','billing_items','salon_billing_profiles','salon_billing_lines','invoices','invoice_lines');
--   ★ 6行返れば成功
--   select id, public from storage.buckets where id='invoices';   ★ public=false の1行
