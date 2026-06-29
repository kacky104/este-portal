import { XListSkeleton } from './XSkeleton';

// /x 配下のルートセグメント共通のローディングUI。
// force-dynamic な各ページ（タイムライン/プロフィール/設定/店舗/運営/開設）への遷移時、
// サーバー描画（cookie認証＋複数クエリ）の完了を待たずに即スケルトンを表示し、体感速度を上げる。
// 純粋に表示のみ＝ISR/RLS/データ取得ロジックには一切影響しない。
export default function XLoading() {
  return (
    <div className="py-3">
      <XListSkeleton rows={4} variant="post" />
    </div>
  );
}
