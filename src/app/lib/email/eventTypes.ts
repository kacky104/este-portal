// Resend の Webhook から届くメールイベントの種別（2026-08-16 追加・第19便）。
//
// ★ ここは 'use server' ではない普通のモジュール。
//   Webhook（サーバー）と管理画面（クライアント）の両方から読むので、必ずここに置くこと
//   （lib/hp/inquiryStatus.ts・lib/booking/source.ts と同じ理由・禁則61）。
//
// ★ DB（email_events.event_type）には CHECK を付けていない。
//   Resend のイベント種別は今後も増えるので、DB で縛ると購読を1つ足しただけで
//   Webhook が 500 を返し続け、Svix のリトライで他のイベントまで詰まる（禁則77 と同じ考え方）。
//   妥当性の判断はこのファイルだけが持つ。

/**
 * 記録する【トラブル4種】。Resend 側の購読もこの4つだけにしてある。
 *
 * ★ ここに種別を足すときは、Resend ダッシュボードの Webhook 設定でも
 *   同じイベントを購読すること。片方だけでは何も起きない（届かない／捨てられる）。
 *
 * notify: バウンス検知の目的そのもの＝「気づけない」を潰すため、運営へ即メールする種別。
 *   delivery_delayed はまだ配信を諦めていない状態で、そのあと delivered になることが多い。
 *   ここでメールを飛ばすと「様子見の通知」で受信箱が埋まるので false にしてある。
 */
export const EMAIL_TROUBLE_EVENTS = [
  { key: 'email.bounced',          label: '不達（バウンス）', notify: true,  severity: 'bad'  },
  { key: 'email.complained',       label: '迷惑メール報告',   notify: true,  severity: 'bad'  },
  { key: 'email.failed',           label: '送信失敗',         notify: true,  severity: 'bad'  },
  { key: 'email.delivery_delayed', label: '配信遅延',         notify: false, severity: 'warn' },
] as const;

export type EmailTroubleEvent = (typeof EMAIL_TROUBLE_EVENTS)[number]['key'];

export function isEmailTroubleEvent(v: unknown): v is EmailTroubleEvent {
  return EMAIL_TROUBLE_EVENTS.some((e) => e.key === v);
}

/** 種別 → 表示名。購読を増やしたのにここを直し忘れても落ちないよう、素のキーへ落とす。 */
export function emailEventLabel(key: string): string {
  return EMAIL_TROUBLE_EVENTS.find((e) => e.key === key)?.label ?? key;
}

/** 運営へ即メールする種別か。 */
export function shouldNotifyAdmin(key: string): boolean {
  return EMAIL_TROUBLE_EVENTS.find((e) => e.key === key)?.notify === true;
}

/** 表示の強さ。'bad'＝赤、'warn'＝黄、それ以外＝灰。 */
export function emailEventSeverity(key: string): 'bad' | 'warn' | 'info' {
  return EMAIL_TROUBLE_EVENTS.find((e) => e.key === key)?.severity ?? 'info';
}

/**
 * bounce の種類（Amazon SES 由来の値がそのまま来る）を日本語にする。
 *
 * ★ Permanent と Transient で【運営がやること】が違うので、必ず出し分けること。
 *   Permanent … 宛先が存在しない等。アドレスを直さない限り、二度と届かない
 *   Transient … 受信箱が満杯・一時的な拒否。放っておいて届くこともある
 */
export function bounceTypeLabel(v: string | null): string {
  switch (v) {
    case 'Permanent':    return '恒久的（アドレスを直さないと二度と届きません）';
    case 'Transient':    return '一時的（相手側の都合。時間をおくと届くことがあります）';
    case 'Undetermined': return '原因不明';
    default:             return v ?? '';
  }
}

/** bounce の細目。よく出るものだけ日本語にし、それ以外は素の値を返す。 */
export function bounceSubTypeLabel(v: string | null): string {
  switch (v) {
    case 'General':          return '一般';
    case 'NoEmail':          return 'そのアドレスは存在しません';
    case 'Suppressed':       return '過去に不達だったため送信元でブロック中';
    case 'OnAccountSuppressionList': return 'アカウントの抑制リストに載っています';
    case 'MailboxFull':      return '受信箱が満杯です';
    case 'MessageTooLarge':  return 'メールが大きすぎます';
    case 'ContentRejected':  return '内容が拒否されました';
    case 'AttachmentRejected': return '添付が拒否されました';
    default:                 return v ?? '';
  }
}

// ─────────────────────────────────────────────────────────────
// ★ 第1753便（2026-11-06・カッキーさん）: 「何のメールが届かなかったか」を種類に分けて、一言と対処を出す。
//   それまでは「店舗名が出ている＝予約通知／空欄＝お問い合わせの自動返信」の2つしか言い分けていなかったが、
//   セラピストの招待（打ち間違いが多い）が混ざって、本当に見るべき予約通知の不達が埋もれていた。
//   ★ 見分けは件名と payload.fukues.kind（受け口が付ける）。純粋関数（通信も DB も触らない）。
// ─────────────────────────────────────────────────────────────
export type EmailTroubleKind = 'booking' | 'cast_invite' | 'inquiry_reply' | 'other';

export function classifyEmailTrouble(input: {
  subject: string | null | undefined;
  salonId: number | null | undefined;
  payloadKind?: string | null;
}): EmailTroubleKind {
  if (input.payloadKind === 'cast_invite') return 'cast_invite';
  const sub = String(input.subject ?? '');
  if (/セラピストページ連携|招待/.test(sub)) return 'cast_invite';
  if (/お問い合わせを承りました|お問い合わせ/.test(sub)) return 'inquiry_reply';
  if (/予約/.test(sub)) return 'booking';
  // 件名で分からなくても、店が予約通知の宛先と一致していれば予約通知
  if (input.salonId != null) return 'booking';
  return 'other';
}

/** 種類 → 札・一言・対処・重さ。★ 予約通知だけが「赤（お客様の取りこぼし）」。ほかは薄く */
export function emailTroubleGuide(kind: EmailTroubleKind): { label: string; line: string; todo: string; strong: boolean } {
  switch (kind) {
    case 'booking':
      return {
        label: '予約通知',
        line: 'この店の予約通知が届いていません',
        todo: '店舗編集の「予約通知メール」を直し、ネット予約設定の「テスト送信」で疎通を確かめてから対応済みに。',
        strong: true,
      };
    case 'cast_invite':
      return {
        label: 'セラピスト招待',
        line: 'セラピストページの招待メールが届いていません（宛先の打ち間違いの可能性）',
        todo: '店舗様に、そのセラピストのメールアドレスを確かめて（例: icloud.com を cloud.com）、直してもう一度招待してもらう。',
        strong: false,
      };
    case 'inquiry_reply':
      return {
        label: 'お問い合わせの自動返信',
        line: 'お問い合わせをくださった方への自動返信が届いていません（相手の打ち間違い）',
        todo: 'こちらからは直せません。電話番号が分かればそちらへ連絡し、分からなければそのまま対応済みに。',
        strong: false,
      };
    default:
      return {
        label: 'その他',
        line: 'フクエスから送ったメールが届いていません',
        todo: '件名と宛先から送り先を確かめてください。',
        strong: false,
      };
  }
}
