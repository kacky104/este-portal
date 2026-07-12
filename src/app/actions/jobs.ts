'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { AREA_SLUGS_LIST } from '@/app/lib/areas';
import { sendApplicationMail } from '@/app/lib/jobs/sendApplicationMail';
import { normalizePhone, isValidPhone } from '@/app/lib/validation/phone';
// 'use server' ファイルは async 関数以外を export できないため、定数・型は非serverモジュールから import する。
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  MAX_JOB_FEATURES,
  MAX_JOB_HERO_IMAGES,
  MAX_JOB_GALLERY_IMAGES,
  MAX_GALLERY_CAPTION_LEN,
  MAX_JOB_AREA_LEN,
  MAX_JOB_WORK_HOURS_LEN,
  MAX_JOB_BENEFITS_LEN,
  MAX_JOB_QUALIFICATIONS_LEN,
  type JobGalleryItem,
  MAX_THERAPIST_VOICES,
  MAX_VOICE_COMMENT_LEN,
  isValidAgeGroup,
  type TherapistVoice,
  isValidFeatureSlug,
  isValidEmailFormat,
  sanitizeFeatures,
  sanitizeHeroUrls,
  sanitizeGallery,
  sanitizeVoices,
  validateCelebrationMoney,
  WORK_NEWS_MAX,
} from '@/app/lib/jobs';

// フクエスワーク（セラピスト求人）フェーズ2のサーバーアクション群。
//
// 方針（booking.ts の作法を踏襲）:
//  - エラーは握りつぶさず文言化して画面に返す（mypage予約一覧の silent 0件バグの反省）。
//  - 書き込みはすべて認証ユーザークライアント（RLS経由）。owner本人 or ADMIN_UUID を
//    salons.owner_id 照合で二重チェックする。service_role は書き込みに使わない
//    （書き込みRLSポリシー整備済み。adminも同ポリシーでUUID判定される）。
//  - admin の一覧・代理作成の「読み取り」だけは、非表示サロンの求人も見える必要があるため
//    service_role（createServiceClient）で取得する。
//  - 1店舗1求人（UNIQUE(salon_id)）。作成時のみ published_at=now、編集時は published_at を
//    触らず updated_at のみ更新（掲載日の水増し防止）。
//  - 公開側ISR（/jobs・/jobs/[id]・/salon/[id]・sitemap）は書き込み成功時に revalidatePath で即時更新。

// 募集要項は area / work_hours / benefits / qualifications の4項目。
// access はフォーム／表示から撤去（エリア行のフォールバック用に公開側 fetchJobById でのみ読む）。
// access カラムは DB 温存し、ここ（フォーム書き込み経路）では SELECT / UPDATE 対象に含めない＝既存値をそのまま保持する。
const JOB_COLUMNS =
  'id, salon_id, title, description, salary_text, salary_min, salary_max, area, work_hours, benefits, qualifications, notify_email, apply_email, apply_line_url, celebration_money, features, hero_image_urls, gallery_images, therapist_voices, is_active, published_at, updated_at';

export type JobFormInput = {
  title: string;
  description: string;
  salary_text: string;
  salary_min: string | number | null;
  salary_max: string | number | null;
  // 募集要項の4項目（自由記述・任意・上限字数でクランプ）。
  area: string;
  work_hours: string;
  benefits: string;
  qualifications: string;
  notify_email: string;
  // 応募用の公開連絡先（任意）。notify_email（非公開の応募通知先）とは別物で求人ページに表示する。
  // optional：この機能デプロイ前の古いタブから送られない場合に既存値を温存するため（更新時 undefined ガードで使用）。
  apply_email?: string;
  apply_line_url?: string;
  // お祝い金（円・任意）。空文字 → null。undefined（機能デプロイ前の古いタブ）は更新時にペイロードから除外＝既存値温存。
  celebration_money?: string | number | null;
  features: string[];
  // 求人バナー画像URL（16:9・job-hero-images バケット・最大3枚・空配列可）。先頭がメイン画像。
  hero_image_urls: string[];
  // 「お店の雰囲気」ギャラリー（正方形・最大6枚・空配列可）。各要素 { url, caption }。
  gallery_images: JobGalleryItem[];
  // 在籍セラピストの声（最大3件・空配列可）。各要素 { rating, ageGroup, comment }。
  therapist_voices: TherapistVoice[];
};

export type MyJob = {
  id: number;
  salon_id: number;
  title: string;
  description: string;
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  area: string;
  work_hours: string;
  benefits: string;
  qualifications: string;
  notify_email: string;
  apply_email: string | null;
  apply_line_url: string | null;
  celebration_money: number | null;
  features: string[];
  hero_image_urls: string[];
  gallery_images: JobGalleryItem[];
  therapist_voices: TherapistVoice[];
  is_active: boolean;
  published_at: string | null;
  updated_at: string | null;
};

export type AdminJobRow = MyJob & { salonName: string; salonHidden: boolean; newCount: number };

type Err = { ok: false; error: string };

// ── マッピング ───────────────────────────────────────
function mapJob(row: Record<string, unknown>): MyJob {
  return {
    id: Number(row.id),
    salon_id: Number(row.salon_id),
    title: (row.title as string | null) ?? '',
    description: (row.description as string | null) ?? '',
    salary_text: (row.salary_text as string | null) ?? '',
    salary_min: row.salary_min == null ? null : Number(row.salary_min),
    salary_max: row.salary_max == null ? null : Number(row.salary_max),
    area: (row.area as string | null) ?? '',
    work_hours: (row.work_hours as string | null) ?? '',
    benefits: (row.benefits as string | null) ?? '',
    qualifications: (row.qualifications as string | null) ?? '',
    notify_email: (row.notify_email as string | null) ?? '',
    apply_email: (row.apply_email as string | null) ?? null,
    apply_line_url: (row.apply_line_url as string | null) ?? null,
    celebration_money: row.celebration_money == null ? null : Number(row.celebration_money),
    features: sanitizeFeatures(row.features),
    hero_image_urls: sanitizeHeroUrls(row.hero_image_urls),
    gallery_images: sanitizeGallery(row.gallery_images),
    therapist_voices: sanitizeVoices(row.therapist_voices),
    is_active: Boolean(row.is_active),
    published_at: (row.published_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

// ── 公開側ISRの即時再検証（書き込み成功時に呼ぶ） ──
function revalidateJobsPublic(salonId?: number): void {
  revalidatePath('/jobs');
  revalidatePath('/jobs/[id]', 'page');
  // 新着情報（work_news）の過去ページ専用ルート（2ページ目以降）。投稿・編集・削除・公開切替で
  // 求人詳細タブ（page=1）だけでなく過去ページの内容も変わりうるため一括再検証。
  revalidatePath('/jobs/[id]/news/[page]', 'page');
  // 特徴タグページ（全slug一括）。タグ付け替えでどのタグページにも影響しうるため全体を再検証。
  revalidatePath('/jobs/tag/[slug]', 'page');
  revalidatePath('/salon/[id]', 'page');
  if (salonId != null) revalidatePath(`/salon/${salonId}`, 'layout');
  // sitemap にも求人URL／タグページが含まれるため更新。
  revalidatePath('/sitemap.xml');
}

// ── 認証・所有権 ───────────────────────────────────────
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  return { ok: true as const, user, supabase };
}

// 指定サロンの owner本人 or 運営(ADMIN_UUID) であることを認証クライアント（RLS）で検証する。
async function assertSalonOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  salonId: number,
): Promise<{ ok: true } | Err> {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { ok: false, error: 'サロンが見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== userId && userId !== ADMIN_UUID) {
    return { ok: false, error: 'このサロンの求人を操作する権限がありません' };
  }
  return { ok: true };
}

// ── バリデーション ───────────────────────────────────
function parseSalary(v: string | number | null | undefined): { value: number | null; invalid?: true } {
  if (v === null || v === undefined) return { value: null };
  const s = String(v).trim();
  if (s === '') return { value: null };
  if (!/^\d+$/.test(s)) return { value: null, invalid: true };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) return { value: null, invalid: true };
  return { value: n };
}

function trimOrNull(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

// 募集要項の自由記述4項目用：trim → 空文字は null 正規化 → 上限字数でクランプ（超過分を切り詰め）。
// 他項目のような「超過でエラー」ではなく、店側入力を弾かずに丸める方針（task 指定）。
function trimClampOrNull(v: string | null | undefined, max: number): string | null {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  return s.length > max ? s.slice(0, max) : s;
}

type CleanJob = {
  title: string;
  description: string;
  salary_text: string;
  salary_min: number | null;
  salary_max: number | null;
  area: string | null;
  work_hours: string | null;
  benefits: string | null;
  qualifications: string | null;
  notify_email: string | null;
  apply_email: string | null;
  apply_line_url: string | null;
  celebration_money: number | null;
  features: string[];
  hero_image_urls: string[];
  gallery_images: JobGalleryItem[];
  therapist_voices: TherapistVoice[];
};

function validate(input: JobFormInput): { ok: true; clean: CleanJob } | Err {
  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  const salary_text = String(input.salary_text ?? '').trim();

  if (!title) return { ok: false, error: '求人タイトルを入力してください' };
  if (!description) return { ok: false, error: '仕事内容を入力してください' };
  if (!salary_text) return { ok: false, error: '給与（表示テキスト）を入力してください' };

  const min = parseSalary(input.salary_min);
  const max = parseSalary(input.salary_max);
  if (min.invalid || max.invalid) {
    return { ok: false, error: '給与（数値）は0以上の整数で入力してください' };
  }
  // 片方だけ入力は不可（両方入力 or 両方空）。
  if ((min.value === null) !== (max.value === null)) {
    return { ok: false, error: '給与の下限・上限は「両方入力」か「両方空欄」にしてください' };
  }
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { ok: false, error: '給与の下限は上限以下にしてください' };
  }

  // 応募通知メール（必須）。未入力（空文字・空白のみ）は保存を拒否する。入力値はメール形式も検証
  // （無効値は Resend 送信失敗でサイレントに通知が消えるため、ここで弾く）。
  // ※既存レコードに未入力のものが残る可能性があるため、送信側の booking_email フォールバックは温存。
  const notifyEmail = trimOrNull(input.notify_email);
  if (!notifyEmail) {
    return { ok: false, error: '応募通知メールを入力してください' };
  }
  if (!isValidEmailFormat(notifyEmail)) {
    return { ok: false, error: '応募通知メールの形式が正しくありません' };
  }

  // 応募用メールアドレス（任意・公開）。空なら null。非空なら形式検証（notify_email と同じ isValidEmailFormat）。
  // notify_email（非公開の通知先）とは別カラムで、求人ページに mailto: で公開表示する。
  const applyEmail = trimOrNull(input.apply_email);
  if (applyEmail && !isValidEmailFormat(applyEmail)) {
    return { ok: false, error: '応募用メールアドレスの形式が正しくありません' };
  }

  // 応募用LINE URL（任意・公開）。空なら null。非空なら http/https のみ許可（fukux_url と同じ new URL()＋protocol 検証）。
  const applyLineUrl = trimOrNull(input.apply_line_url);
  if (applyLineUrl) {
    try {
      const u = new URL(applyLineUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad protocol');
    } catch {
      return { ok: false, error: '応募用LINE URLの形式が正しくありません（https://〜）' };
    }
  }

  // お祝い金（任意・公開）。空/undefined → null（0に変換しない）。正の整数のみ許可（負数・小数・非数値・0・上限超過はエラー）。
  // クライアント・サーバー共用の validateCelebrationMoney で検証（同一ルール）。undefined を null に「正規化」して
  // 上書きすることは更新経路の undefined ガード（ペイロード除外）で防ぐため、ここでは検証のみに徹する。
  const celebration = validateCelebrationMoney(input.celebration_money);
  if (!celebration.ok) return { ok: false, error: celebration.error };

  // 特徴タグ：配列＋各slugホワイトリスト＋重複除去＋最大件数。不正slugは拒否（サイレント除外しない）。
  const rawFeatures = Array.isArray(input.features) ? input.features.map((s) => String(s)) : [];
  const features: string[] = [];
  for (const slug of rawFeatures) {
    if (!isValidFeatureSlug(slug)) {
      return { ok: false, error: '不正な特徴タグが含まれています' };
    }
    if (!features.includes(slug)) features.push(slug);
  }
  if (features.length > MAX_JOB_FEATURES) {
    return { ok: false, error: `特徴タグは最大${MAX_JOB_FEATURES}個までです` };
  }

  // 求人バナー画像：配列＋各要素を文字列化・空要素除去・重複除去。上限3枚を超えたらエラー
  // （サイレント切り詰めしない＝クライアントのバグに気付けるようにする）。
  const rawHeroUrls = Array.isArray(input.hero_image_urls) ? input.hero_image_urls.map((s) => String(s)) : [];
  const heroUrls: string[] = [];
  for (const url of rawHeroUrls) {
    const s = url.trim();
    if (s !== '' && !heroUrls.includes(s)) heroUrls.push(s);
  }
  if (heroUrls.length > MAX_JOB_HERO_IMAGES) {
    return { ok: false, error: `バナー画像は最大${MAX_JOB_HERO_IMAGES}枚までです` };
  }

  // 「お店の雰囲気」ギャラリー：各要素 {url, caption}。url必須・空/重複除去、caption は30字上限。
  // 上限6枚を超えたらエラー（サイレント切り詰めしない）。
  const rawGallery = Array.isArray(input.gallery_images) ? input.gallery_images : [];
  const gallery: JobGalleryItem[] = [];
  const gallerySeen = new Set<string>();
  for (const item of rawGallery) {
    const url = String((item as JobGalleryItem | undefined)?.url ?? '').trim();
    if (url === '' || gallerySeen.has(url)) continue;
    const caption = String((item as JobGalleryItem | undefined)?.caption ?? '').replace(/\s+/g, ' ').trim();
    if (caption.length > MAX_GALLERY_CAPTION_LEN) {
      return { ok: false, error: `キャプションは${MAX_GALLERY_CAPTION_LEN}文字以内で入力してください` };
    }
    gallerySeen.add(url);
    gallery.push({ url, caption });
  }
  if (gallery.length > MAX_JOB_GALLERY_IMAGES) {
    return { ok: false, error: `お店の雰囲気の画像は最大${MAX_JOB_GALLERY_IMAGES}枚までです` };
  }

  // 在籍セラピストの声：各要素 {rating, ageGroup, comment}。防御的に整える（不正エントリは除外）。
  //  - ageGroup が AGE_GROUPS 外（未選択の '' 含む）→ そのエントリを除外
  //  - rating は整数1-5にクランプ（範囲外・非数はクランプ／既定5）
  //  - comment は200字にクランプ（超過分を切り詰め）。空コメントは除外
  //  - 先頭から最大3件で切り詰め（超過分はサイレント破棄）
  const rawVoices = Array.isArray(input.therapist_voices) ? input.therapist_voices : [];
  const voices: TherapistVoice[] = [];
  for (const item of rawVoices) {
    const rec = (item ?? {}) as Partial<TherapistVoice>;
    if (!isValidAgeGroup(rec.ageGroup)) continue;
    let rating = Math.round(Number(rec.rating));
    if (!Number.isFinite(rating)) rating = 5;
    rating = Math.min(5, Math.max(1, rating));
    let comment = String(rec.comment ?? '').trim();
    if (comment === '') continue;
    if (comment.length > MAX_VOICE_COMMENT_LEN) comment = comment.slice(0, MAX_VOICE_COMMENT_LEN);
    voices.push({ rating, ageGroup: rec.ageGroup, comment });
    if (voices.length >= MAX_THERAPIST_VOICES) break;
  }

  return {
    ok: true,
    clean: {
      title,
      description,
      salary_text,
      salary_min: min.value,
      salary_max: max.value,
      // 募集要項4項目：上限字数でクランプ・空文字は null 正規化。
      area: trimClampOrNull(input.area, MAX_JOB_AREA_LEN),
      work_hours: trimClampOrNull(input.work_hours, MAX_JOB_WORK_HOURS_LEN),
      benefits: trimClampOrNull(input.benefits, MAX_JOB_BENEFITS_LEN),
      qualifications: trimClampOrNull(input.qualifications, MAX_JOB_QUALIFICATIONS_LEN),
      notify_email: notifyEmail,
      apply_email: applyEmail,
      apply_line_url: applyLineUrl,
      celebration_money: celebration.value,
      features,
      // バナー画像URLは自前ストレージのアップロード結果（最大3枚・先頭がメイン）。空配列可。
      hero_image_urls: heroUrls,
      // 「お店の雰囲気」ギャラリー（最大6枚・各 {url, caption}）。空配列可。
      gallery_images: gallery,
      // 在籍セラピストの声（最大3件・各 {rating, ageGroup, comment}）。空配列可。
      therapist_voices: voices,
    },
  };
}

// ── 取得（オーナー本人/運営）：非公開も見える ──
export async function getMyJob(
  salonId: number,
): Promise<{ ok: true; job: MyJob | null } | Err> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const { data, error } = await auth.supabase
    .from('salon_jobs')
    .select(JOB_COLUMNS)
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, job: data ? mapJob(data) : null };
}

// ── 作成/更新（RLS経由・1店舗1件） ──
export async function upsertMyJob(
  salonId: number,
  input: JobFormInput,
): Promise<{ ok: true; job: MyJob } | Err> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const v = validate(input);
  if (!v.ok) return v;
  const c = v.clean;

  const { data: existing, error: exErr } = await auth.supabase
    .from('salon_jobs')
    .select('id')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  const nowIso = new Date().toISOString();

  if (existing) {
    // 編集：published_at は触らない（掲載日の水増し防止）。updated_at のみ更新。
    // 【データ消失防止ガード】後から追加された optional 配列フィールドは「クライアントがフィールドを
    // 送ってきた時だけ」更新する。未送信（input.xxx === undefined、例: その機能をデプロイする前の
    // 古いタブからの保存）の場合は既存値を温存し、validate が既定で入れる [] による上書き＝データ消失を防ぐ。
    // 値が配列で送られていれば（空配列含む）そのまま反映するので、意図的な全消去は引き続き可能。
    const updatePayload: Record<string, unknown> = { ...c, updated_at: nowIso };
    if (input.gallery_images === undefined) delete updatePayload.gallery_images;
    if (input.hero_image_urls === undefined) delete updatePayload.hero_image_urls;
    if (input.features === undefined) delete updatePayload.features;
    if (input.therapist_voices === undefined) delete updatePayload.therapist_voices;
    // 募集要項4項目も同ルール：クライアントが送ってこない（＝機能デプロイ前の古いタブ等）場合は
    // 既存値を温存し、validate 既定の null による上書き＝データ消失を防ぐ。
    if (input.area === undefined) delete updatePayload.area;
    if (input.work_hours === undefined) delete updatePayload.work_hours;
    if (input.benefits === undefined) delete updatePayload.benefits;
    if (input.qualifications === undefined) delete updatePayload.qualifications;
    // 応募用の公開連絡先も同ルール：未送信（機能デプロイ前の古いタブ等）は既存値を温存し、
    // validate 既定の null による上書き＝データ消失を防ぐ。
    if (input.apply_email === undefined) delete updatePayload.apply_email;
    if (input.apply_line_url === undefined) delete updatePayload.apply_line_url;
    // お祝い金も同ルール（gallery_images 消失事故の教訓）。未送信（input.celebration_money === undefined）は
    // ペイロードから除外＝既存値温存。空文字で送られた場合は「明示クリア」として null 更新される（＝非表示）。
    if (input.celebration_money === undefined) delete updatePayload.celebration_money;
    const { data, error } = await auth.supabase
      .from('salon_jobs')
      .update(updatePayload)
      .eq('id', existing.id as number)
      .select(JOB_COLUMNS)
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? '更新に失敗しました' };
    revalidateJobsPublic(salonId);
    return { ok: true, job: mapJob(data) };
  }

  // 新規作成：published_at=now、既定で公開（is_active=true）。
  const { data, error } = await auth.supabase
    .from('salon_jobs')
    .insert({ salon_id: salonId, ...c, is_active: true, published_at: nowIso, updated_at: nowIso })
    .select(JOB_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    if (error?.code === '23505') {
      return { ok: false, error: '既に求人が作成されています。再読み込みしてください' };
    }
    return { ok: false, error: error?.message ?? '作成に失敗しました' };
  }
  revalidateJobsPublic(salonId);
  return { ok: true, job: mapJob(data) };
}

// ── 公開/非公開トグル（削除せず非公開にできる） ──
export async function toggleMyJobActive(
  jobId: number,
): Promise<{ ok: true; is_active: boolean } | Err> {
  if (!Number.isFinite(jobId)) return { ok: false, error: '対象求人が不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const { data: job, error } = await auth.supabase
    .from('salon_jobs')
    .select('id, salon_id, is_active')
    .eq('id', jobId)
    .maybeSingle();
  if (error || !job) return { ok: false, error: '求人が見つかりません' };

  const salonId = Number(job.salon_id);
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const next = !job.is_active;
  const { error: upErr } = await auth.supabase
    .from('salon_jobs')
    .update({ is_active: next, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (upErr) return { ok: false, error: upErr.message };
  revalidateJobsPublic(salonId);
  return { ok: true, is_active: next };
}

// ── おすすめ求人（featured_jobs）編集後の公開ISR即時更新 ──
// おすすめ枠は /jobs トップと各エリアページ（/jobs/area/[slug]）＋出張専門ページ（/jobs/dispatch）に
// 表示されるため、全ページのISRを再検証する。エリア別おすすめ（area 指定）も即時反映するよう、
// トップ＋通常5エリア＋出張専門の全7パスを一律 revalidate する（呼び出し元は編集セットを問わず
// 同じ呼び出しで済ませられる）。出張は /jobs/area/dispatch ではなく単独ルート /jobs/dispatch。
// featured_jobs への書き込み自体は FeaturedJobsManager が authenticated クライアント（RLSで
// admin UUID のみ許可）で行うため、この関数は純粋なキャッシュ無効化のみを担う。
export async function revalidateFeaturedJobs(): Promise<void> {
  revalidatePath('/jobs');
  for (const slug of AREA_SLUGS_LIST) {
    // 出張は /jobs/area/<slug> パターンに乗らない単独ルートのため、ループ内では扱わずループ外で明示追加する。
    if (slug === 'dispatch') continue;
    revalidatePath(`/jobs/area/${slug}`);
  }
  revalidatePath('/jobs/dispatch');
}

// ── 新着情報（work_news）書き込み後の公開ISR即時更新 ──
// work_news はオーナーが mypage から authenticated クライアント直（RLSで自店のみ許可）で
// 書き込むため、この関数は純粋なキャッシュ無効化のみを担う（求人の upsert 等と同じ revalidateJobsPublic を流用）。
// 表示側（求人詳細のタブUI）は段階3で実装予定だが、投稿時点で /jobs 系のISRを更新しておく。
export async function revalidateJobsForOwner(salonId?: number): Promise<void> {
  revalidateJobsPublic(salonId);
}

// ── 新着情報（work_news）のローリング上限（サロンごと最新 WORK_NEWS_MAX=20 件） ──
// 新規投稿が成功したあとにクライアントから呼ぶ（案A：サーバーアクション方式）。
//  - 同一サロンの work_news を created_at 昇順（古い順）で全件見て、20件を超えていたら超過分を「全て」削除する
//    （21件超＝過去データ/競合残りでも20件まで削れるよう slice で超過分をまとめて対象化。LIMIT 1 固定にしない）。
//  - 公開・非公開は問わない（created_at 基準の単純な古い順）。
//  - 削除は必ず salon_id スコープ内：.eq('salon_id', salonId) ＋ .in('id', overflowIds) の二重条件で実行する。
//  - 添付画像がある行は、行削除に成功した分だけ対応する Storage ファイルを掃除する（削除した行の image パスのみを対象）。
//  - 認証ユーザークライアント（RLS）経由。owner本人/ADMIN を salons.owner_id で照合（他サロンには一切触れない）。
const WORK_NEWS_BUCKET = 'work-news-images';

// work-news-images の public URL から Storage パス（{salon_id}/{ts}.{ext}）を取り出す。該当しなければ null。
function workNewsStoragePath(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${WORK_NEWS_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

export async function enforceWorkNewsLimit(
  salonId: number,
): Promise<{ ok: true; deleted: number } | Err> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  // 同一サロンの全 work_news を作成日時の古い順で取得（id・image_url のみ）。
  const { data, error } = await auth.supabase
    .from('work_news')
    .select('id, image_url, created_at')
    .eq('salon_id', salonId)
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: error.message };

  const rows = data ?? [];
  if (rows.length <= WORK_NEWS_MAX) return { ok: true, deleted: 0 };

  // 超過分（古い側から rows.length - 20 件）をまとめて削除対象にする。
  const overflow = rows.slice(0, rows.length - WORK_NEWS_MAX);
  const overflowIds = overflow.map((r) => String(r.id));

  // 【必須】salon_id スコープ内で削除（.eq('salon_id') ＋ .in('id', overflowIds)）。他サロンには波及しない。
  const { data: deleted, error: delErr } = await auth.supabase
    .from('work_news')
    .delete()
    .eq('salon_id', salonId)
    .in('id', overflowIds)
    .select('id');
  if (delErr) return { ok: false, error: delErr.message };

  // 行削除に成功した分だけ、対応する Storage 画像を掃除（削除した行の image パスのみが対象）。
  const deletedIds = new Set((deleted ?? []).map((d) => String(d.id)));
  const paths = overflow
    .filter((r) => deletedIds.has(String(r.id)))
    .map((r) => workNewsStoragePath((r.image_url as string | null) ?? null))
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    const { error: rmErr } = await auth.supabase.storage.from(WORK_NEWS_BUCKET).remove(paths);
    // 画像掃除の失敗は致命ではない（行削除は成立済み）。ログのみ（孤児は残るが表示に影響しない）。
    if (rmErr) console.error('[WorkNews] ローリング削除に伴う画像削除に失敗:', paths, rmErr);
  }

  revalidateJobsPublic(salonId);
  return { ok: true, deleted: deletedIds.size };
}

// ── 削除（confirmはUI側） ──
// job-hero-images の public URL から Storage パスを取り出す。該当しなければ null。
const JOB_IMAGES_BUCKET = 'job-hero-images';
function jobImageStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${JOB_IMAGES_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

export async function deleteMyJob(jobId: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(jobId)) return { ok: false, error: '対象求人が不正です' };
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };

  // 掃除対象の画像URL（バナー最大3枚＋フォトギャラリー最大6枚）も行削除前に控える。
  const { data: job, error } = await auth.supabase
    .from('salon_jobs')
    .select('id, salon_id, hero_image_urls, gallery_images')
    .eq('id', jobId)
    .maybeSingle();
  if (error || !job) return { ok: false, error: '求人が見つかりません' };

  const salonId = Number(job.salon_id);
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return { ok: false, error: own.error };

  const { error: delErr } = await auth.supabase.from('salon_jobs').delete().eq('id', jobId);
  if (delErr) return { ok: false, error: delErr.message };

  // 行削除成功後に job-hero-images の画像を掃除（2026-07-12）。
  // 従来は行削除のみで画像が残置され URL 直打ちで見え続けた。掃除は best-effort
  // （失敗しても削除は成立済み・ログのみ）。enforceWorkNewsLimit と同方針。
  const heroUrls = Array.isArray(job.hero_image_urls) ? (job.hero_image_urls as string[]) : [];
  const galleryUrls = Array.isArray(job.gallery_images)
    ? (job.gallery_images as { url?: unknown }[]).map((g) => String(g?.url ?? ''))
    : [];
  const paths = [...new Set([...heroUrls, ...galleryUrls])]
    .map(jobImageStoragePath)
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    const { error: rmErr } = await auth.supabase.storage.from(JOB_IMAGES_BUCKET).remove(paths);
    if (rmErr) console.error('[deleteMyJob] 求人画像の削除に失敗:', paths, rmErr);
  }

  revalidateJobsPublic(salonId);
  return { ok: true };
}

// ── /admin 用：全求人一覧（非表示サロン分も見えるよう service_role で取得・読み取りのみ） ──
export async function adminListJobs(): Promise<{ ok: true; jobs: AdminJobRow[] } | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_jobs')
    .select(JOB_COLUMNS)
    .order('published_at', { ascending: false });
  if (error) return { ok: false, error: error.message };

  const jobs = data ?? [];
  const salonIds = [...new Set(jobs.map((j) => Number(j.salon_id)))];
  const jobIds = jobs.map((j) => Number(j.id));
  const salonMap = new Map<number, { name: string; hidden: boolean }>();
  const newCountByJob = new Map<number, number>();
  if (salonIds.length > 0) {
    const { data: salons } = await svc.from('salons').select('id, name, is_hidden').in('id', salonIds);
    (salons ?? []).forEach((s) =>
      salonMap.set(Number(s.id), { name: (s.name as string | null) ?? '', hidden: Boolean(s.is_hidden) }),
    );
  }
  // 各求人の新規応募件数（status='new'）を集計（一覧行に「新規n件」を出すため）。
  if (jobIds.length > 0) {
    const { data: apps } = await svc
      .from('job_applications')
      .select('job_id')
      .eq('status', 'new')
      .in('job_id', jobIds);
    (apps ?? []).forEach((a) => {
      const jid = Number(a.job_id);
      newCountByJob.set(jid, (newCountByJob.get(jid) ?? 0) + 1);
    });
  }

  return {
    ok: true,
    jobs: jobs.map((j) => {
      const info = salonMap.get(Number(j.salon_id));
      return {
        ...mapJob(j),
        salonName: info?.name ?? '(不明)',
        salonHidden: info?.hidden ?? false,
        newCount: newCountByJob.get(Number(j.id)) ?? 0,
      };
    }),
  };
}

// ── /admin 用：代理作成のためのサロン一覧（求人の有無フラグ付き・service_role 読み取り） ──
export async function adminListSalonsForJob(): Promise<
  { ok: true; salons: { id: number; name: string; hasJob: boolean; isHidden: boolean }[] } | Err
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (auth.user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };

  const svc = createServiceClient();
  const [{ data: salons, error: sErr }, { data: jobs, error: jErr }] = await Promise.all([
    svc.from('salons').select('id, name, is_hidden').order('id', { ascending: true }),
    svc.from('salon_jobs').select('salon_id'),
  ]);
  if (sErr) return { ok: false, error: sErr.message };
  if (jErr) return { ok: false, error: jErr.message };

  const withJob = new Set((jobs ?? []).map((j) => Number(j.salon_id)));
  return {
    ok: true,
    salons: (salons ?? []).map((s) => ({
      id: Number(s.id),
      name: (s.name as string | null) ?? '',
      hasJob: withJob.has(Number(s.id)),
      isHidden: Boolean(s.is_hidden),
    })),
  };
}

// ══════════════════════════════════════════════════════════════════
//  応募（job_applications）— フェーズ3
//  INSERT は anon 可の RLS ポリシーがあるが、重複ガード読み取り＋非表示サロン判定が
//  必要なため service_role で統一する（RLSを通らない＝明示チェック必須）。
// ══════════════════════════════════════════════════════════════════

export type JobApplication = {
  id: string;
  jobId: number;
  salonId: number;
  name: string;
  tel: string;
  age: number | null;
  note: string | null;
  status: string;
  createdAt: string;
};

export type JobApplicationInput = {
  name: string;
  tel: string;
  age: string | number | null;
  note: string;
};

function mapApplication(row: Record<string, unknown>): JobApplication {
  return {
    id: String(row.id),
    jobId: Number(row.job_id),
    salonId: Number(row.salon_id),
    name: (row.name as string | null) ?? '',
    tel: (row.tel as string | null) ?? '',
    age: row.age == null ? null : Number(row.age),
    note: (row.note as string | null) ?? null,
    status: (row.status as string | null) ?? 'new',
    createdAt: String(row.created_at),
  };
}

// ── 応募の作成（公開・anon経路。サーバーで全項目を再検証） ──
export async function createJobApplication(
  jobId: number,
  input: JobApplicationInput,
): Promise<{ ok: true } | Err> {
  if (!Number.isFinite(jobId)) return { ok: false, error: '対象の求人が不正です' };

  const name = String(input.name ?? '').trim();
  const telInput = String(input.tel ?? '').trim();
  const note = String(input.note ?? '').trim();

  // ③ 氏名・電話の必須＆形式（電話はハイフン除去後の数字桁数で 10〜13 桁を判定）。
  if (!name) return { ok: false, error: 'お名前を入力してください' };
  if (!isValidPhone(telInput)) {
    return { ok: false, error: '電話番号は数字10〜13桁で入力してください' };
  }
  // 以降の重複ガード・保存・通知メールはハイフンなし数字のみに正規化した値で統一する。
  const tel = normalizePhone(telInput);

  // ④ 年齢は入力時のみ 18〜99 の整数。
  let age: number | null = null;
  const ageStr = input.age == null ? '' : String(input.age).trim();
  if (ageStr !== '') {
    if (!/^\d+$/.test(ageStr)) return { ok: false, error: '年齢は数字で入力してください' };
    const a = Number(ageStr);
    if (a < 18 || a > 99) return { ok: false, error: '年齢は18〜99の範囲で入力してください' };
    age = a;
  }

  const svc = createServiceClient();

  // ① 求人が存在＆is_active。
  const { data: job, error: jErr } = await svc
    .from('salon_jobs')
    .select('id, title, is_active, notify_email, salon_id')
    .eq('id', jobId)
    .maybeSingle();
  if (jErr || !job) return { ok: false, error: 'この求人は現在応募を受け付けていません' };
  if (!job.is_active) return { ok: false, error: 'この求人は現在応募を受け付けていません' };

  // ② サロンが is_hidden=false（service_role は RLS を通らないため明示チェック必須）。
  const { data: salon, error: sErr } = await svc
    .from('salons')
    .select('name, is_hidden, booking_email')
    .eq('id', Number(job.salon_id))
    .maybeSingle();
  if (sErr || !salon || salon.is_hidden) {
    return { ok: false, error: 'この求人は現在応募を受け付けていません' };
  }

  // ⑤ 直近1時間の同一 job_id + tel 重複ガード。
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: dup } = await svc
    .from('job_applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('tel', tel)
    .gte('created_at', cutoff)
    .limit(1);
  if (dup && dup.length > 0) {
    return { ok: false, error: 'すでに応募を受け付けています。お店からの連絡をお待ちください' };
  }

  const { error: insErr } = await svc
    .from('job_applications')
    // salon_id は NOT NULL。求人から辿った salon_id を必ず入れる。
    .insert({ job_id: jobId, salon_id: Number(job.salon_id), name, tel, age, note: note || null, status: 'new' });
  if (insErr) return { ok: false, error: insErr.message };

  // 通知メール：notify_email → salons.booking_email → 両方空ならスキップ（応募はDBに残る）。
  const to =
    ((job.notify_email as string | null) ?? '').trim() ||
    ((salon.booking_email as string | null) ?? '').trim() ||
    '';
  await sendApplicationMail({
    to,
    salonName: (salon.name as string | null) ?? '',
    jobTitle: (job.title as string | null) ?? '',
    name,
    tel,
    age,
    note: note || null,
  });

  return { ok: true };
}

// 応募の所有権チェック（application → job → salon.owner_id、本人 or ADMIN）。
// booking.ts の assertBookingOwner と同じ作法で、成功時は service_role クライアントを返す。
async function assertApplicationOwner(
  applicationId: string,
): Promise<{ ok: true; svc: ReturnType<typeof createServiceClient> } | Err> {
  if (!applicationId) return { ok: false, error: '対象の応募が不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const { data: app, error } = await svc
    .from('job_applications')
    .select('job_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (error || !app) return { ok: false, error: '応募が見つかりません' };

  const { data: job, error: jErr } = await svc
    .from('salon_jobs')
    .select('salon_id')
    .eq('id', Number(app.job_id))
    .maybeSingle();
  if (jErr || !job) return { ok: false, error: '求人が見つかりません' };

  const { data: salon, error: sErr } = await svc
    .from('salons')
    .select('owner_id')
    .eq('id', Number(job.salon_id))
    .maybeSingle();
  if (sErr || !salon) return { ok: false, error: 'サロンが見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== auth.user.id && auth.user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この応募を操作する権限がありません' };
  }
  return { ok: true, svc };
}

// ── 応募一覧（オーナー本人 or 運営・service_role 取得・新しい順） ──
export async function getJobApplications(
  salonId: number,
): Promise<{ ok: true; applications: JobApplication[] } | Err> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象サロンが不正です' };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const svc = createServiceClient();
  // 対象サロンの求人ID（1店舗1件だが将来も想定して in で絞る）。
  const { data: jobs, error: jErr } = await svc.from('salon_jobs').select('id').eq('salon_id', salonId);
  if (jErr) return { ok: false, error: jErr.message };
  const jobIds = (jobs ?? []).map((j) => Number(j.id));
  if (jobIds.length === 0) return { ok: true, applications: [] };

  const { data, error } = await svc
    .from('job_applications')
    .select('id, job_id, salon_id, name, tel, age, note, status, created_at')
    .in('job_id', jobIds)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, applications: (data ?? []).map(mapApplication) };
}

// ── 応募ステータス変更（new/contacted/closed・オーナー本人 or 運営） ──
export async function updateApplicationStatus(
  applicationId: string,
  nextStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(APPLICATION_STATUSES as readonly string[]).includes(nextStatus)) {
    return { ok: false, error: 'ステータスが不正です' };
  }
  const auth = await assertApplicationOwner(applicationId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.svc
    .from('job_applications')
    .update({ status: nextStatus as ApplicationStatus })
    .eq('id', applicationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── 応募の削除（confirm前提・オーナー本人 or 運営） ──
export async function deleteApplication(
  applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await assertApplicationOwner(applicationId);
  if (!auth.ok) return { ok: false, error: auth.error };

  const { error } = await auth.svc.from('job_applications').delete().eq('id', applicationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
