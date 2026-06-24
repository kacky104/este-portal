// サイト運営者（最上位の管理者）の Supabase Auth UID。
// サーバー認可（admin/layout.tsx）とクライアント表示制御（admin/page.tsx）の
// 両方からこの単一定義を参照し、UIDの二重管理を避ける。
export const ADMIN_UUID = '63aca737-b399-4fb2-bf92-8a3816955d69';

// 口コミ審査（/moderation）にアクセスできるモデレーターの UID 一覧。
// 運営者（ADMIN_UUID）＋ 審査を手伝うスタッフ。
// ここに UID を足すと /moderation の閲覧と承認/却下/削除が可能になる（/admin には影響しない）。
export const MODERATOR_UUIDS: string[] = [
  ADMIN_UUID,
  '2cace8de-0156-4f0d-ac06-675f35a2f774', // 審査スタッフ
];
