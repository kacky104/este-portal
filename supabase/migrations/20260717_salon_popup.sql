-- サロン詳細ページの左下ポップアップ画像（オーナーが /mypage「ポップアップ」タブで設定）。
-- Supabase ダッシュボードの SQL Editor で全文を実行してください（冪等・再実行可）。
--
-- 追加する列:
--   popup_image_url : 画像URL（salon-images バケットに popup_ 接頭辞で保存した公開URL）。未設定は NULL。
--   popup_link      : クリック時の遷移先（任意）。NULL/空ならクリックしても移動しない。
--   popup_enabled   : 表示ON/OFF。既定 false（＝既存サロンは何も出ない。オーナーがONにしたときだけ表示）。

alter table public.salons add column if not exists popup_image_url text;
alter table public.salons add column if not exists popup_link      text;
alter table public.salons add column if not exists popup_enabled    boolean not null default false;

-- オーナーが自分のサロン行を更新できる UPDATE ポリシー（無い場合のみ作成）。
-- ※ /mypage のサロン編集がクライアントから salons を更新できている環境では既に存在するはず。
--   本ブロックは冪等な保険（既存なら何もしない）。owner_id = ログインユーザーの行だけを許可。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'salons'
      AND policyname = 'salons_update_owner'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "salons_update_owner"
        ON public.salons FOR UPDATE
        USING     (auth.uid() = owner_id)
        WITH CHECK (auth.uid() = owner_id)
    $p$;
  END IF;
END $$;
