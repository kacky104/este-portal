'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';

// リンクバナー設置報告の送信（/x/banner/report）。未ログインでも送信可のため、
// クライアントから直接 INSERT させず（banner_reports に INSERT ポリシーなし）、
// この Server Action がバリデーション＋スパム対策を通したうえで service_role で書き込む。

// 貼ったバナーの種類（DB格納値 → 表示名）。フォーム・運営パネルと共用。
export type BannerSite = 'fukux' | 'fukues' | 'work';
const VALID_SITES: BannerSite[] = ['fukux', 'fukues', 'work'];

export type BannerReportInput = {
  salonName: string;
  email: string;
  sites: string[];
  pageUrl: string;
  xHandle: string; // 任意（空文字可）
  comment: string; // 任意（空文字可）
  website: string; // honeypot（画面に出さない入力。値が入っていたらbotとみなし黙って成功扱い）
};

export async function submitBannerReport(
  input: BannerReportInput,
): Promise<{ ok: boolean; error?: string }> {
  // honeypot: bot が埋めた場合は何もせず成功を装う（bot に判別材料を与えない）。
  if (input.website.trim() !== '') return { ok: true };

  const salonName = input.salonName.trim();
  const email = input.email.trim();
  const pageUrl = input.pageUrl.trim();
  const xHandle = input.xHandle.trim().replace(/^@/, '');
  const comment = input.comment.trim();
  const sites = [...new Set(input.sites)].filter((s): s is BannerSite =>
    (VALID_SITES as string[]).includes(s),
  );

  if (salonName.length < 1 || salonName.length > 100) return { ok: false, error: 'サロン名は1〜100文字で入力してください' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, error: 'メールアドレスの形式が正しくありません' };
  if (sites.length === 0) return { ok: false, error: '貼ったバナーの種類を選択してください' };
  if (!/^https?:\/\/.+\..+/.test(pageUrl) || pageUrl.length > 500) return { ok: false, error: '設置ページURLは http(s):// から始まるURLを入力してください' };
  if (xHandle.length > 30) return { ok: false, error: '@IDは30文字以内で入力してください' };
  if (comment.length > 1000) return { ok: false, error: '補足コメントは1000文字以内で入力してください' };

  const svc = createServiceClient();

  // 連投防止: 同一メール×同一URLの未対応（status='open'）報告が24時間以内にあれば重複として弾く。
  // 対応済み(done)は除外＝運営が対応した直後の再報告（URL修正等）はブロックしない。
  // チェック自体はbest-effort: クエリ失敗時はログのみ残して送信は通す（重複より取りこぼしの方が痛い）。
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: dupErr } = await svc
    .from('banner_reports')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('page_url', pageUrl)
    .eq('status', 'open')
    .gte('created_at', since);
  if (dupErr) console.error('[submitBannerReport] 重複チェック失敗:', dupErr.message);
  if ((count ?? 0) > 0) return { ok: false, error: '同じ内容の報告を受付済みです。確認まで数日お待ちください' };

  const { error } = await svc.from('banner_reports').insert({
    salon_name: salonName,
    email,
    sites,
    page_url: pageUrl,
    x_handle: xHandle || null,
    comment: comment || null,
  });
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  // 運営へメール通知（失敗しても送信自体は成功扱い）。
  await notifyAdmin(`【fukuX】リンクバナー設置報告（${salonName}）`, [
    `サロン名: ${salonName}`,
    `バナー: ${sites.join('・')}`,
    `設置ページ: ${pageUrl}`,
    `連絡先: ${email}${xHandle ? `／fukuX: @${xHandle}` : ''}`,
    '',
    '確認・対応: https://fukues.com/x/admin →「報告」タブ',
  ]);
  return { ok: true };
}

// 貼ったバナー種類の表示名（管理通知・UI共用）。
const SITE_LABEL: Record<BannerSite, string> = {
  fukues: 'フクエス',
  work: 'フクエスワーク',
  fukux: 'fukuX',
};

// ── /mypage（ログイン中オーナー）向けの簡易リンクバナー設置報告 ──
// 公開フォーム（submitBannerReport）と同じ banner_reports テーブルに保存するが、
// 連絡先メールはログインセッションから取得（オーナーが入力不要）＝ honeypot 等も不要。
// 入力は「店名・設置ページURL・貼ったバナー種類（複数可）・任意コメント」のみの簡易版。
export async function submitMyBannerReport(input: {
  salonName: string;
  pageUrl: string;
  sites: string[];
  comment: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const email = (user.email ?? '').trim();

  const salonName = input.salonName.trim();
  const pageUrl = input.pageUrl.trim();
  const comment = input.comment.trim();
  const sites = [...new Set(input.sites)].filter((s): s is BannerSite =>
    (VALID_SITES as string[]).includes(s),
  );

  if (salonName.length < 1 || salonName.length > 100) return { ok: false, error: '店名は1〜100文字で入力してください' };
  if (sites.length === 0) return { ok: false, error: '貼ったバナーの種類を選択してください' };
  if (!/^https?:\/\/.+\..+/.test(pageUrl) || pageUrl.length > 500) return { ok: false, error: '設置ページURLは http(s):// から始まるURLを入力してください' };
  if (comment.length > 1000) return { ok: false, error: '補足コメントは1000文字以内で入力してください' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'ログイン中のメールアドレスを取得できませんでした' };

  const svc = createServiceClient();

  // 連投防止（公開フォームと同条件）：同一メール×同一URLの未対応(open)報告が24時間以内にあれば弾く。
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: dupErr } = await svc
    .from('banner_reports')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('page_url', pageUrl)
    .eq('status', 'open')
    .gte('created_at', since);
  if (dupErr) console.error('[submitMyBannerReport] 重複チェック失敗:', dupErr.message);
  if ((count ?? 0) > 0) return { ok: false, error: '同じ内容の報告を受付済みです。確認まで数日お待ちください' };

  const { error } = await svc.from('banner_reports').insert({
    salon_name: salonName,
    email,
    sites,
    page_url: pageUrl,
    x_handle: null,
    comment: comment || null,
  });
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  await notifyAdmin(`【フクエス】リンクバナー設置報告（${salonName}）`, [
    `サロン名: ${salonName}`,
    `バナー: ${sites.map((s) => SITE_LABEL[s]).join('・')}`,
    `設置ページ: ${pageUrl}`,
    `連絡先: ${email}`,
    comment ? `補足: ${comment}` : '',
    '',
    '確認・対応: https://fukues.com/x/admin →「報告」タブ',
  ]);
  return { ok: true };
}
