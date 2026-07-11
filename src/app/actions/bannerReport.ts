'use server';

import { createServiceClient } from '@/app/lib/supabase/service';

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

  // 連投防止: 同一メール×同一URLの未対応報告が24時間以内にあれば重複として弾く。
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await svc
    .from('banner_reports')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .eq('page_url', pageUrl)
    .gte('created_at', since);
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
  return { ok: true };
}
