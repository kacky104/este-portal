// ── fukuX 下書き（未送信の投稿）の型と行マッピング ──────────────────────
// 下書きは本人のみ閲覧・編集可（RLS: x_drafts_*_own）。クライアント側で CRUD する。
// x_posts.id は bigint のため parent_post_id は number|string で来る＝String() で正規化して持つ。

export type XDraft = {
  id: string;
  body: string | null;
  images: string[];
  linkUrl: string | null;
  repliesDisabled: boolean;
  // リプライ下書きの返信先 post id（null=通常投稿の下書き）。
  parentPostId: string | null;
  updatedAt: string;
};

export type XDraftRow = {
  id: string;
  body: string | null;
  images: string[] | null;
  link_url: string | null;
  replies_disabled: boolean | null;
  parent_post_id: number | string | null;
  updated_at: string;
};

// x_drafts 行 → XDraft。images 未設定は空配列、parent_post_id は bigint なので String() で正規化。
export function mapDraftRow(r: XDraftRow): XDraft {
  return {
    id: String(r.id),
    body: r.body ?? null,
    images: r.images ?? [],
    linkUrl: r.link_url ?? null,
    repliesDisabled: Boolean(r.replies_disabled),
    parentPostId: r.parent_post_id != null ? String(r.parent_post_id) : null,
    updatedAt: r.updated_at,
  };
}
