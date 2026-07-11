-- salon_intakes フォーム改修: 「出張の有無」項目を追加（'あり'/'なし' のテキスト・運営の転記用）。
-- 併せてフォーム側は 第2エリア・支払い方法・写真 の入力を廃止（列は温存＝過去の送信データはそのまま）。
alter table public.salon_intakes
  add column if not exists dispatch text;
