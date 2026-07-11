'use server';

import { createServiceClient } from '@/app/lib/supabase/service';

// 新規店舗の初回情報入力フォーム（/salon-intake/[token]）のサーバー処理。
// salon_intakes は RLS で運営のみアクセス可のため、公開側（未ログインの店舗）は
// 必ずこの Server Action（service_role）を経由する。毎回トークン一致＋pending＋期限内を検証する。

const PHOTO_BUCKET = 'salon-intake-photos';
const MAX_PHOTOS = 10;

// フォーム表示用の最小情報。他店舗の情報や入力済み内容は返さない。
export type IntakeGate =
  | { state: 'ok'; label: string | null }
  | { state: 'notfound' }
  | { state: 'expired' }
  | { state: 'submitted' };

type IntakeRow = {
  id: string;
  label: string | null;
  status: 'pending' | 'submitted' | 'done';
  expires_at: string;
};

async function findIntake(token: string): Promise<IntakeRow | null> {
  const t = token.trim();
  // トークン形式（48桁hex）以外は問い合わせず弾く（総当たり・変な入力の早期カット）。
  if (!/^[0-9a-f]{48}$/.test(t)) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from('salon_intakes')
    .select('id, label, status, expires_at')
    .eq('token', t)
    .maybeSingle();
  return (data as IntakeRow | null) ?? null;
}

function gateOf(row: IntakeRow | null): IntakeGate {
  if (!row) return { state: 'notfound' };
  if (row.status !== 'pending') return { state: 'submitted' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { state: 'expired' };
  return { state: 'ok', label: row.label };
}

// フォームページ（サーバーコンポーネント）から呼ぶ表示可否判定。
export async function getSalonIntakeGate(token: string): Promise<IntakeGate> {
  return gateOf(await findIntake(token));
}

// 写真アップロード用の署名付きURLを発行（トークン検証つき）。
// クライアントは storage.uploadToSignedUrl(path, signedToken, file) でアップロードする。
export async function createIntakePhotoUploadUrl(
  token: string,
  ext: string,
): Promise<{ ok: true; path: string; signedToken: string; publicUrl: string } | { ok: false; error: string }> {
  const row = await findIntake(token);
  if (gateOf(row).state !== 'ok' || !row) return { ok: false, error: 'このURLは無効です' };
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'jpg';
  const path = `${row.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const svc = createServiceClient();
  const { data, error } = await svc.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: 'アップロード準備に失敗しました。時間をおいてお試しください' };
  const { data: { publicUrl } } = svc.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return { ok: true, path, signedToken: data.token, publicUrl };
}

export type SalonIntakeInput = {
  salonName: string;
  area: string;
  area2: string;
  dispatch: string; // 出張の有無（'あり' / 'なし' / ''）
  address: string;
  access: string;
  phone: string;
  hours: string;
  closedDays: string;
  priceCourses: string;
  description: string;
  paymentMethods: string;
  officialUrl: string;
  contactName: string;
  contactEmail: string;
  note: string;
  photoUrls: string[];
};

// 送信。必須＝店舗名・住所・担当者名・連絡先メール。成功で status='submitted'（再送信不可）。
export async function submitSalonIntake(
  token: string,
  input: SalonIntakeInput,
): Promise<{ ok: boolean; error?: string }> {
  const row = await findIntake(token);
  const gate = gateOf(row);
  if (gate.state === 'submitted') return { ok: false, error: 'このフォームは送信済みです' };
  if (gate.state !== 'ok' || !row) return { ok: false, error: 'このURLは無効です。お手数ですが運営までご連絡ください' };

  const v = (s: string, max: number) => s.trim().slice(0, max);
  const salonName = v(input.salonName, 100);
  const address = v(input.address, 200);
  const contactName = v(input.contactName, 50);
  const contactEmail = v(input.contactEmail, 254);

  if (!salonName) return { ok: false, error: '店舗名を入力してください' };
  if (!input.area.trim()) return { ok: false, error: 'エリアを選択してください' };
  if (!input.dispatch.trim()) return { ok: false, error: '出張の有無を選択してください' };
  if (!address) return { ok: false, error: '住所を入力してください' };
  if (!contactName) return { ok: false, error: 'ご担当者名を入力してください' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { ok: false, error: 'メールアドレスの形式が正しくありません' };

  // 写真URLは自バケットの公開URLのみ許可（外部URLの混入を防ぐ）・上限枚数でカット。
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${row.id}/`;
  const photoUrls = (input.photoUrls ?? []).filter((u) => typeof u === 'string' && u.startsWith(prefix)).slice(0, MAX_PHOTOS);

  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_intakes')
    .update({
      salon_name: salonName,
      area: v(input.area, 30) || null,
      area2: v(input.area2, 30) || null,
      dispatch: v(input.dispatch, 20) || null,
      address,
      access: v(input.access, 200) || null,
      phone: v(input.phone, 30) || null,
      hours: v(input.hours, 100) || null,
      closed_days: v(input.closedDays, 100) || null,
      price_courses: v(input.priceCourses, 2000) || null,
      description: v(input.description, 2000) || null,
      payment_methods: v(input.paymentMethods, 200) || null,
      official_url: v(input.officialUrl, 300) || null,
      contact_name: contactName,
      contact_email: contactEmail,
      note: v(input.note, 1000) || null,
      photo_urls: photoUrls,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending'); // 二重送信ガード（同時送信でも片方だけ通る）
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };
  return { ok: true };
}
