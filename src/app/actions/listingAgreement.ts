'use server';

// 広告掲載 申込書 兼 誓約書（運営 ⇄ 店舗）の読み書き（第1174便・2026-10-04・カッキーさん）。
// ★ 表は listing_agreements（RLS 全閉）。ここで【誰か】を確かめてから service_role で読み書きする。
//   ・店舗側 … ログイン中の人が owner_id の店だけ（「代筆は無効」なので、オーナー本人のアカウントでしかサインできない）
//   ・運営側 … ADMIN_UUID だけ
// ★ 文面は lib/listingAgreement.ts。サインのときに、その時点の文面の写し（body_text）と sha256 を一緒に残す。
// ★ 読むのは /mypage/agreement と /admin/agreements を開いたときだけ（TOP・店舗ページ・マイページ本体の読み取りは増やさない）。

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { sendAgreementMail } from '@/app/lib/listing/sendAgreementMail';
import {
  AGREEMENT_VERSION, agreementBodyText, agreementInputError, normalizeAgreementInput, type AgreementInput,
} from '@/lib/listingAgreement';

type Err = { ok: false; error: string };

export type AgreementRecord = {
  id: number;
  salonId: number | null;
  version: string;
  bodyText: string;
  salonName: string;
  address: string;
  phone: string;
  email: string;
  companyName: string;
  representative: string;
  signaturePng: string;
  signedAt: string;
};

const COLS = 'id, salon_id, version, body_text, salon_name, address, phone, email, company_name, representative, signature_png, signed_at';

type Row = {
  id: number; salon_id: number | null; version: string; body_text: string; salon_name: string; address: string; phone: string;
  email: string; company_name: string; representative: string; signature_png: string; signed_at: string;
};
const toRecord = (r: Row): AgreementRecord => ({
  id: Number(r.id), salonId: r.salon_id == null ? null : Number(r.salon_id), version: r.version, bodyText: r.body_text,
  salonName: r.salon_name, address: r.address, phone: r.phone, email: r.email, companyName: r.company_name,
  representative: r.representative, signaturePng: r.signature_png, signedAt: r.signed_at,
});

/** ログイン中の人の店（マイページと同じ選び方: 表示中を優先して1件） */
async function myContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon, error } = await svc
    .from('salons').select('id, name, address, phone')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true }).order('id', { ascending: true })
    .limit(1).maybeSingle();
  if (error) return { ok: false as const, error: '店舗情報を読めませんでした' };
  if (!salon) return { ok: false as const, error: '店舗のアカウントでログインしてください' };
  return { ok: true as const, user, svc, salon: salon as { id: number; name: string | null; address: string | null; phone: string | null } };
}

export type MyAgreementPage = {
  ok: true;
  salonId: number;
  /** 記入欄に初めから入れておく内容（登録内容・前回のサインがあればそちら） */
  prefill: AgreementInput;
  /** いちばん新しいサイン（無ければ null） */
  latest: AgreementRecord | null;
  /** いまの版にサイン済みか */
  signedCurrent: boolean;
};

/** 店舗側: 画面を開いたとき */
export async function getMyListingAgreement(): Promise<MyAgreementPage | Err> {
  const ctx = await myContext();
  if (!ctx.ok) return ctx;
  const { data, error } = await ctx.svc
    .from('listing_agreements').select(COLS)
    .eq('salon_id', ctx.salon.id)
    .order('signed_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return { ok: false, error: '読めませんでした。少し待ってからもう一度お試しください' };
  const latest = data ? toRecord(data as unknown as Row) : null;
  const prefill = normalizeAgreementInput(latest
    ? { salonName: latest.salonName, address: latest.address, phone: latest.phone, email: latest.email, companyName: latest.companyName, representative: latest.representative }
    : { salonName: ctx.salon.name ?? '', address: ctx.salon.address ?? '', phone: ctx.salon.phone ?? '', email: ctx.user.email ?? '', companyName: '', representative: '' });
  return { ok: true, salonId: Number(ctx.salon.id), prefill, latest, signedCurrent: !!latest && latest.version === AGREEMENT_VERSION };
}

/** 店舗側: サインして送信 */
export async function submitListingAgreement(
  raw: Partial<AgreementInput>, agreed: boolean, signaturePng: string,
): Promise<{ ok: true; record: AgreementRecord } | Err> {
  if (agreed !== true) return { ok: false, error: '同意のチェックを入れてください' };
  const input = normalizeAgreementInput(raw);
  const bad = agreementInputError(input);
  if (bad) return { ok: false, error: bad };
  const sig = String(signaturePng ?? '');
  // サインは PNG か WebP（CRM の同意書と同じ決まり）
  if (!/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 300 || sig.length > 400000) {
    return { ok: false, error: 'サインを書いてください' };
  }
  const ctx = await myContext();
  if (!ctx.ok) return ctx;

  // 連続送信の見張り（1店あたり 24時間で10件まで）
  const { count } = await ctx.svc
    .from('listing_agreements').select('id', { count: 'exact', head: true })
    .eq('salon_id', ctx.salon.id)
    .gte('signed_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if ((count ?? 0) >= 10) return { ok: false, error: '送信が多すぎます。時間をおいてからもう一度お試しください' };

  // 出し直しかどうか（前にも提出があるか）。★ 第1177便: お知らせのメールの文言に使う
  const { data: prev } = await ctx.svc
    .from('listing_agreements').select('id').eq('salon_id', ctx.salon.id).limit(1).maybeSingle();
  const resubmit = !!prev;

  const h = await headers();
  const bodyText = agreementBodyText();
  const { data, error } = await ctx.svc.from('listing_agreements').insert({
    salon_id: ctx.salon.id,
    version: AGREEMENT_VERSION,
    body_text: bodyText,
    body_sha256: createHash('sha256').update(bodyText, 'utf8').digest('hex'),
    salon_name: input.salonName,
    address: input.address,
    phone: input.phone,
    email: input.email,
    company_name: input.companyName,
    representative: input.representative,
    signature_png: sig,
    signed_by: ctx.user.id,
    user_agent: (h.get('user-agent') ?? '').slice(0, 300),
    ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 60),
  }).select(COLS).single();
  if (error || !data) return { ok: false, error: '送信できませんでした。もう一度お試しください' };
  const record = toRecord(data as unknown as Row);

  // ★★ 第1177便（カッキーさん）: 提出・出し直しがあったら、店舗様（ログインのメール）と運営に知らせる。
  //   マイページは代表者様のほかにスタッフの方も開くので、代表者様が心当たりのない提出に気づけるようにする。
  //   ★ どちらも失敗しても提出は成立させる（例外を投げない作り）。★ 送り終わってから返す（途中で切られないように）。
  const signedAtLabel = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(record.signedAt));
  const [mail] = await Promise.all([
    sendAgreementMail({
      to: [ctx.user.email ?? '', input.email],
      salonName: input.salonName, representative: input.representative,
      receiptNo: record.id, signedAtLabel, resubmit,
    }),
    notifyAdmin(
      `【申込書・誓約書】${input.salonName}（${resubmit ? '出し直し' : '提出'}）`,
      [
        `${input.salonName}（店舗ID ${ctx.salon.id}）から「申込書 兼 誓約書」の${resubmit ? '出し直し' : '提出'}がありました。`,
        '',
        `受付番号：${record.id}`,
        `ご記入日：${signedAtLabel}`,
        `代表者名：${input.representative}`,
        ...(input.companyName ? [`法人名：${input.companyName}`] : []),
        `所在地：${input.address}`,
        `電話番号：${input.phone}`,
        `メール：${input.email}`,
        '',
        `控え：https://fukues.com/admin/agreements/${record.id}`,
      ],
      { replyTo: input.email },
    ),
  ]);
  if (!mail.ok) console.error('[listingAgreement] 店舗様へのお知らせメールを送れなかった', mail.error);
  return { ok: true, record };
}

/**
 * 店舗側: マイページの上の帯を出すかどうか（第1175便・カッキーさん）。
 * ★ 'new' ＝ 一度も出していない・'renew' ＝ 前の版には出したが今の版はまだ・'none' ＝ 提出済み（帯を出さない）。
 * ★ マイページを開いたときに1回だけ（小さな読み取り: 店舗1本＋サイン1本・版と id だけ）。
 * ★ 読めなかったとき（表がまだ無い・通信の失敗など）は 'none'＝帯を出さない（マイページを止めない）。
 */
export async function getMyAgreementNotice(): Promise<{ need: 'none' | 'new' | 'renew' }> {
  try {
    const ctx = await myContext();
    if (!ctx.ok) return { need: 'none' };
    const { data, error } = await ctx.svc
      .from('listing_agreements').select('id, version')
      .eq('salon_id', ctx.salon.id)
      .order('signed_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return { need: 'none' };
    if (!data) return { need: 'new' };
    return { need: (data as { version: string }).version === AGREEMENT_VERSION ? 'none' : 'renew' };
  } catch {
    return { need: 'none' };
  }
}

// ── 運営側 ─────────────────────────────────────────────────────────────

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true };
}

export type AgreementAdminRow = {
  salonId: number;
  salonName: string;
  isHidden: boolean;
  /** いちばん新しいサイン（サインの画像と文面は入れない＝一覧を軽く） */
  latest: { id: number; version: string; representative: string; signedAt: string } | null;
};

/** 運営側: 全店の提出の様子（2本: 店舗の一覧・サインの一覧） */
export async function getListingAgreementAdminList(): Promise<{ ok: true; currentVersion: string; rows: AgreementAdminRow[] } | Err> {
  const adm = await requireAdmin();
  if (!adm.ok) return adm;
  const svc = createServiceClient();
  const [salonsRes, agRes] = await Promise.all([
    svc.from('salons').select('id, name, is_hidden').order('is_hidden', { ascending: true }).order('id', { ascending: true }).limit(2000),
    svc.from('listing_agreements').select('id, salon_id, version, representative, signed_at').order('signed_at', { ascending: false }).limit(5000),
  ]);
  if (salonsRes.error || agRes.error) return { ok: false, error: '読めませんでした' };
  const latestBySalon = new Map<number, AgreementAdminRow['latest']>();
  for (const a of (agRes.data ?? []) as { id: number; salon_id: number | null; version: string; representative: string; signed_at: string }[]) {
    if (a.salon_id == null || latestBySalon.has(Number(a.salon_id))) continue; // 新しい順なので、最初に出たものが最新
    latestBySalon.set(Number(a.salon_id), { id: Number(a.id), version: a.version, representative: a.representative, signedAt: a.signed_at });
  }
  const rows = ((salonsRes.data ?? []) as { id: number; name: string | null; is_hidden: boolean | null }[]).map((s) => ({
    salonId: Number(s.id), salonName: s.name ?? '', isHidden: !!s.is_hidden, latest: latestBySalon.get(Number(s.id)) ?? null,
  }));
  return { ok: true, currentVersion: AGREEMENT_VERSION, rows };
}

/** 運営側: 1件の中身（文面の写し・記入欄・サイン） */
export async function getListingAgreementAdmin(id: number): Promise<{ ok: true; record: AgreementRecord } | Err> {
  const adm = await requireAdmin();
  if (!adm.ok) return adm;
  const svc = createServiceClient();
  const { data, error } = await svc.from('listing_agreements').select(COLS).eq('id', Number(id)).maybeSingle();
  if (error) return { ok: false, error: '読めませんでした' };
  if (!data) return { ok: false, error: '見つかりません' };
  return { ok: true, record: toRecord(data as unknown as Row) };
}
