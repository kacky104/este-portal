// fukuX DM の共有定数・型（クライアント専用ロジックから参照）。
// DB（x_conversations / x_messages / x_conversation_reads / RLS / RPC）は適用済み。ここはUIの取得・送信のみ。

// 会話を既読化したとき、ヘッダーのDM未読バッジを再取得させるためのウィンドウイベント名。
// （1会話の既読では全体の未読が0とは限らないので、ヘッダー側は set(0) ではなく再取得する。）
export const DM_READ_EVENT = 'fukux:dm-read';

export type DmOtherProfile = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  kind: 'user' | 'therapist' | 'shop' | 'official';
  isVerified: boolean;
  status: string;
};
