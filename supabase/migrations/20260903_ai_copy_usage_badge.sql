-- 第113便（2026-09-03）: ai_copy_usage.kind に特徴バッジ生成を足す
--
-- ★ いまの CHECK は kind in ('text','image')（20260824_ai_copy_quota.sql）。
--   ★ バッジ生成をこの表に記録したいが、そのままだと入らない。
-- ★★ 'image' / 'text' に混ぜないこと。★ 混ぜると「紹介文を何本作ったか」が狂う。
--   ★ 別の値にすれば、あとから両方を別々に数えられる（引き継ぎメモ 3-5 と同じ筋）。
-- ★ 実行は Supabase の SQL Editor で。★ このブロックだけ流す。

do $$
declare c text;
begin
  -- ★ 制約名は環境で違いうるので、定義から引いて外す
  select con.conname into c
   from pg_constraint con
   where con.conrelid = 'public.ai_copy_usage'::regclass
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%kind%';
  if c is not null then
    execute format('alter table public.ai_copy_usage drop constraint %I', c);
  end if;

  alter table public.ai_copy_usage
    add constraint ai_copy_usage_kind_check
    check (kind in ('text', 'image', 'badge_text', 'badge_image'));
end $$;

-- 確認（適用後に別途流す）。4つの値が並べば成功。
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.ai_copy_usage'::regclass and conname = 'ai_copy_usage_kind_check';
