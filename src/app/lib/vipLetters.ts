import type { SupabaseClient } from '@supabase/supabase-js';
import { isVipLetterVisible } from '@/lib/vipLetterWindow';

// VIPレター：会員受信側の型・取得ロジック・未読数。
// 配信（作成）は service_role 専用（src/app/actions/vipLetters.ts）。ここは受信側の読み取りのみ。

export type VipLetterCoupon = {
  discount: string;
  terms: string | null;
  expiresAt: string | null; // 'YYYY-MM-DD'
  color: string;            // couponColors のキー
};

export type MemberVipLetter = {
  recipientId: string;      // vip_letter_recipients.id（既読更新に使う）
  read: boolean;            // read_at != null
  receivedAt: string;       // ISO（letter.created_at）
  salonId: number;
  salonName: string;
  title: string;
  body: string;
  coupon: VipLetterCoupon | null; // coupon_discount が無ければ null
};

/** 受信箱を読んだ結果。★ error が null のときだけ letters は「本当の中身」。 */
export type MemberVipLetterResult = {
  letters: MemberVipLetter[];
  /** ★ 読めなかった理由。★ null なら読めた（そのときの 0件 は「本当に0件」） */
  error: string | null;
};

/** 自分宛のVIPレター（recipients に自分がいるもの）を新しい順で取得。RLS（本人のみ）に依存。
 *
 * ★★★ 読めなかったときに「0件」を返さない（2026-09-06・第179便）。
 *   ★ 以前は失敗しても空の配列を返していたので、画面には「VIPレターはまだありません」と出た。
 *     ★★ そのため【届いていない】のか【読めていない】のかが誰にも分からなかった。
 *   ★ 理由をそのまま持ち帰り、画面に出す（作法3-3：読めなかった≠無かった）。
 */
export async function getMemberVipLetters(supabase: SupabaseClient): Promise<MemberVipLetterResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { letters: [], error: 'ログインが確認できませんでした' };

  const { data: rows, error } = await supabase
    .from('vip_letter_recipients')
    .select('id, read_at, letter:vip_letters(id, salon_id, title, body, coupon_discount, coupon_terms, coupon_expires_at, coupon_color, created_at)')
    .order('created_at', { ascending: false });

  if (error) return { letters: [], error: error.message };
  if (!rows) return { letters: [], error: '受信箱の中身を読み取れませんでした' };

  // 店名をまとめて取得。
  const salonIds = [...new Set(
    rows.map(r => {
      const letter = (r as Record<string, unknown>).letter as Record<string, unknown> | null;
      return letter ? Number(letter.salon_id) : NaN;
    }).filter(n => !Number.isNaN(n))
  )];
  const salonNameById = new Map<number, string>();
  if (salonIds.length > 0) {
    const { data: salons } = await supabase.from('salons').select('id, name').in('id', salonIds);
    for (const s of (salons ?? []) as Record<string, unknown>[]) {
      salonNameById.set(Number(s.id), (s.name as string) ?? '');
    }
  }

  const out: MemberVipLetter[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const letter = r.letter as Record<string, unknown> | null;
    if (!letter) continue; // レターが消えている等
    // ★ 30日を過ぎたレターは出さない（★ 日数の正は src/lib/vipLetterWindow.ts）。
    //   ★★ 消しているのは【表示】だけ。★ 行は残っている。
    //   ★ 日時が読めないものは出す（★「読めなかった」を「期限切れ」に倒さない）。
    if (!isVipLetterVisible((letter.created_at as string | null) ?? null)) continue;
    const discount = (letter.coupon_discount as string | null) ?? null;
    const sid = Number(letter.salon_id);
    out.push({
      recipientId: r.id as string,
      read: r.read_at != null,
      receivedAt: (letter.created_at as string) ?? '',
      salonId: sid,
      salonName: salonNameById.get(sid) ?? '',
      title: (letter.title as string) ?? '',
      body: (letter.body as string) ?? '',
      coupon: discount
        ? {
            discount,
            terms: (letter.coupon_terms as string | null) ?? null,
            expiresAt: (letter.coupon_expires_at as string | null) ?? null,
            color: (letter.coupon_color as string | null) ?? 'pink',
          }
        : null,
    });
  }
  // letter.created_at の新しい順に整える（recipients の order が embedded に効かない場合の保険）。
  out.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  return { letters: out, error: null };
}

/** 未読数を数えた結果。★ 数えられなかったときは count を返さない（0と混ぜない）。 */
export type VipUnreadResult = { count: number } | { error: string };

/** 自分の未読VIPレター数（read_at が null）。NotificationBell の未読数に合算する。RLS（本人のみ）に依存。
 *
 * ★★★ 30日を過ぎたレターは数えない（2026-09-06）。
 *   ★ 受信箱に出さないものを未読として数えると、**開きに行けない未読**がベルに残る。
 *   ★ ベルと一覧をずらさない（notificationFeed.ts と同じ考え方）。
 */
export async function getVipUnreadCount(supabase: SupabaseClient): Promise<VipUnreadResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { count: 0 }; // ★ 未ログインは「未読なし」で正しい（読めなかった、ではない）
  // ★ 期間で絞るため、件数だけ（head)ではなく行を取って数える。★ 未読は多くならない
  const { data, error } = await supabase
    .from('vip_letter_recipients')
    .select('id, letter:vip_letters(created_at)')
    .is('read_at', null);
  // ★ 読めなかったときに 0 を返さない。★ 呼び出し側で「?」を出す
  if (error) return { error: error.message };
  if (!data) return { error: '未読数を読み取れませんでした' };
  let n = 0;
  for (const r of data as Record<string, unknown>[]) {
    const letter = r.letter as Record<string, unknown> | null;
    if (!letter) continue;
    if (isVipLetterVisible((letter.created_at as string | null) ?? null)) n++;
  }
  return { count: n };
}
