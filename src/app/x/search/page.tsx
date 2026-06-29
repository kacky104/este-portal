import { XSearch } from '../XSearch';

// ユーザー検索は公開情報。入力に応じた取得はすべて XSearch（クライアント）がデバウンスして行うため、
// この server page は薄いラッパー（cookie を読まない・要ログインにしない）。
export const metadata = { title: 'ユーザー検索｜fukuX' };

export default function XSearchPage() {
  return <XSearch />;
}
