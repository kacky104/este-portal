'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { ADMIN_UUID } from '@/app/lib/admin';
import { salonInArea } from '@/app/lib/areas';
import {
  isValidFeatureSlug,
  isValidEmailFormat,
  featureLabel,
  MAX_JOB_FEATURES,
} from '@/app/lib/jobs';
import {
  WORK_EXPERIENCE_VALUES,
  type WorkExperience,
  WORK_PICKUP_VALUES,
  type WorkPickup,
  WORK_AREA_CHOICES,
  EXPERIENCE_LABEL,
  PICKUP_LABEL,
  MAX_DISPLAY_NAME_LEN,
  MAX_CURRENT_JOB_LEN,
  MAX_CONTACT_LEN,
  MAX_NOTE_LEN,
  type WorkMatchInput,
  type SuggestedStore,
} from '@/app/lib/workMatch';

// フクエスワーク「求職マッチング」エントリー（/jobs/matching の公開フォーム）と、
// 運営の斡旋支援（応募が少ない掲載店舗を希望エリアで絞って上位提案）のサーバーアクション。
//
// 方針（listingInquiry.ts / jobs.ts の作法を踏襲）:
//  - 公開フォームの INSERT は service_role（テーブルに公開INSERTポリシーを持たせない＝直叩きスパム遮断）。
//  - honeypot（画面に見えない website 欄）が埋まっていたらボットとみなし成功を装って静かに捨てる。
//  - 送信成立後に運営宛メール通知（notifyAdmin・失敗しても送信自体は成功扱い）。
//  - 提案（suggestStoresForEntry）は運営（ADMIN_UUID）本人のみ。読み取りは service_role
//    （非表示・件数集計を通す必要があるため）。書き込みは行わない。
//  - 選択肢のホワイトリスト・文字数上限・入出力の型は非serverモジュール @/app/lib/workMatch に集約。

// ── 公開フォーム送信 ──────────────────────────────────
export async function submitWorkMatchEntry(
  input: WorkMatchInput,
): Promise<{ ok: boolean; error?: string }> {
  // honeypot：ボットは隠し欄も埋めがち。成功を装って何もしない（再試行の学習をさせない）。
  if ((input.website ?? '').trim() !== '') return { ok: true };

  const displayName = (input.displayName ?? '').trim();
  const currentJob = (input.currentJob ?? '').trim();
  const note = (input.note ?? '').trim();
  const contactPhone = (input.contactPhone ?? '').trim();
  const contactLine = (input.contactLine ?? '').trim();
  const contactEmail = (input.contactEmail ?? '').trim();

  // 年齢（18〜99の整数）。
  const ageRaw = String(input.age ?? '').trim();
  if (!/^\d{1,3}$/.test(ageRaw)) return { ok: false, error: '年齢は半角数字で入力してください' };
  const age = Number(ageRaw);
  if (age < 18 || age > 99) return { ok: false, error: '年齢は18〜99の範囲で入力してください' };

  // 経験・送迎（ホワイトリスト）。
  const experience = (input.experience ?? '').trim();
  if (!(WORK_EXPERIENCE_VALUES as readonly string[]).includes(experience)) {
    return { ok: false, error: '経験の有無を選択してください' };
  }
  const wantsPickup = (input.wantsPickup ?? 'either').trim();
  if (!(WORK_PICKUP_VALUES as readonly string[]).includes(wantsPickup)) {
    return { ok: false, error: '送迎の希望が不正です' };
  }

  // 希望エリア（AREA_ORDER の実エリアのみ・重複除去。空＝こだわらない）。
  const desiredAreas = [...new Set((input.desiredAreas ?? []).map((s) => String(s ?? '').trim()))]
    .filter((a) => a !== '' && (WORK_AREA_CHOICES as readonly string[]).includes(a));

  // 希望特徴（JOB_FEATURES の slug のみ・重複除去・上限）。
  const desiredFeatures = [...new Set((input.desiredFeatures ?? []).map((s) => String(s ?? '').trim()))]
    .filter((s) => isValidFeatureSlug(s))
    .slice(0, MAX_JOB_FEATURES);

  // 文字数上限。
  if (displayName.length > MAX_DISPLAY_NAME_LEN) return { ok: false, error: `お名前は${MAX_DISPLAY_NAME_LEN}文字以内で入力してください` };
  if (currentJob.length > MAX_CURRENT_JOB_LEN) return { ok: false, error: `現在の職業は${MAX_CURRENT_JOB_LEN}文字以内で入力してください` };
  if (note.length > MAX_NOTE_LEN) return { ok: false, error: `その他ご希望は${MAX_NOTE_LEN}文字以内で入力してください` };
  if (contactPhone.length > MAX_CONTACT_LEN || contactLine.length > MAX_CONTACT_LEN || contactEmail.length > MAX_CONTACT_LEN) {
    return { ok: false, error: '連絡先が長すぎます' };
  }

  // 連絡先は電話・LINE・メールのうち最低1つ必須。
  if (contactPhone === '' && contactLine === '' && contactEmail === '') {
    return { ok: false, error: '連絡先を電話・LINE・メールのいずれか1つ以上入力してください' };
  }
  // メールを入力した場合は形式チェック。
  if (contactEmail !== '' && !isValidEmailFormat(contactEmail)) {
    return { ok: false, error: 'メールアドレスの形式が正しくありません' };
  }

  const svc = createServiceClient();
  const { error } = await svc.from('work_match_entries').insert({
    display_name: displayName || null,
    age,
    experience,
    current_job: currentJob || null,
    desired_areas: desiredAreas,
    wants_pickup: wantsPickup,
    desired_features: desiredFeatures,
    contact_phone: contactPhone || null,
    contact_line: contactLine || null,
    contact_email: contactEmail || null,
    note: note || null,
  });
  if (error) return { ok: false, error: '送信に失敗しました。時間をおいてお試しください' };

  // 運営宛メール通知（表示は日本語ラベルに変換）。
  const areasLabel = desiredAreas.length > 0 ? desiredAreas.join('、') : '（こだわらない）';
  const featuresLabel = desiredFeatures.length > 0 ? desiredFeatures.map(featureLabel).join('、') : '（指定なし）';
  await notifyAdmin('【フクエスワーク】求職マッチングのエントリー', [
    `お名前: ${displayName || '(未記入)'}`,
    `年齢: ${age}歳`,
    `経験: ${EXPERIENCE_LABEL[experience as WorkExperience]}`,
    `現在の職業: ${currentJob || '(未記入)'}`,
    `希望エリア: ${areasLabel}`,
    `送迎: ${PICKUP_LABEL[wantsPickup as WorkPickup]}`,
    `希望条件: ${featuresLabel}`,
    '',
    '─── 連絡先 ───',
    `電話: ${contactPhone || '(なし)'}`,
    `LINE: ${contactLine || '(なし)'}`,
    `メール: ${contactEmail || '(なし)'}`,
    '',
    '─── その他ご希望 ───',
    note || '(なし)',
    '',
    '※ /admin ＞ 店舗管理 ＞ 求職マッチング エントリー から、条件に合う店舗の提案が確認できます。',
  ]);
  return { ok: true };
}

// ── 運営の斡旋支援：条件に合う店舗を提案 ─────────────────
// 表向きは「マッチング」だが、実運用は“求人の応募が少ない掲載店舗を優先して紹介する”仕組み。
// 女の子の希望エリアで候補を絞り（空＝全エリア）、応募(job_applications)件数の少ない掲載店を上位に並べる。
// 希望特徴の一致数は同数のときの副次的な並べ替えキー（“表向きのマッチ度”）として使う。
export async function suggestStoresForEntry(
  entryId: string,
): Promise<{ ok: true; stores: SuggestedStore[] } | { ok: false; error: string }> {
  // 運営本人のみ（クライアント表示制御に加えサーバー側でも UID を厳格チェック）。
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_UUID) return { ok: false, error: '権限がありません' };

  const svc = createServiceClient();

  // ① エントリー（希望条件）を取得。
  const { data: entry, error: eErr } = await svc
    .from('work_match_entries')
    .select('desired_areas, desired_features, wants_pickup')
    .eq('id', entryId)
    .maybeSingle();
  if (eErr || !entry) return { ok: false, error: 'エントリーが見つかりません' };

  const desiredAreas = Array.isArray(entry.desired_areas) ? (entry.desired_areas as string[]) : [];
  const wantsPickup = (entry.wants_pickup as string | null) ?? 'either';
  // 送迎あり希望なら「送迎あり（sogei）」も一致対象に含める（“表向きのマッチ度”を送迎にも効かせる）。
  const desiredSet = new Set<string>(Array.isArray(entry.desired_features) ? (entry.desired_features as string[]) : []);
  if (wantsPickup === 'want') desiredSet.add('sogei');

  // ② 掲載中（jobs_enabled）かつ表示中（is_hidden=false）の公開求人（is_active）を取得。
  const { data: jobRows, error: jErr } = await svc
    .from('salon_jobs')
    .select('id, title, salon_id, features, published_at, salons!inner(id, name, area, area2, dispatch_type, is_hidden, jobs_enabled)')
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .eq('salons.jobs_enabled', true);
  if (jErr) return { ok: false, error: jErr.message };

  // ③ 応募件数を店舗ごとに集計（全期間・少ないほど優先）。
  const { data: appRows, error: aErr } = await svc.from('job_applications').select('salon_id');
  if (aErr) return { ok: false, error: aErr.message };
  const appCountBySalon = new Map<number, number>();
  for (const r of appRows ?? []) {
    const sid = Number((r as { salon_id: unknown }).salon_id);
    if (Number.isFinite(sid)) appCountBySalon.set(sid, (appCountBySalon.get(sid) ?? 0) + 1);
  }

  // ④ 希望エリアで絞り込み＋一致数を計算。
  const candidates: SuggestedStore[] = [];
  for (const row of jobRows ?? []) {
    // salons!inner は多対一のため単一オブジェクトで返る（配列で返る環境向けに両対応）。
    const salonRaw = (row as { salons: unknown }).salons;
    const salon = (Array.isArray(salonRaw) ? salonRaw[0] : salonRaw) as
      | { id: number; name: string; area: string; area2: string | null; dispatch_type: string }
      | undefined;
    if (!salon) continue;

    const area = (salon.area as string | null) ?? '';
    const area2 = (salon.area2 as string | null) ?? '';
    const dispatchType = (salon.dispatch_type as string | null) ?? 'none';

    // 希望エリア一致（空＝こだわらない＝全店対象）。
    if (desiredAreas.length > 0) {
      const inArea = desiredAreas.some((a) => salonInArea({ area, area2, dispatchType }, a));
      if (!inArea) continue;
    }

    const features = Array.isArray((row as { features: unknown }).features)
      ? ((row as { features: string[] }).features)
      : [];
    const matched = features.filter((f) => desiredSet.has(f));
    const salonId = Number(salon.id);

    candidates.push({
      salonId,
      salonName: (salon.name as string | null) ?? '(名称未設定)',
      area: area || '（エリア未設定）',
      jobId: Number((row as { id: unknown }).id),
      jobTitle: ((row as { title: string | null }).title) ?? '',
      appCount: appCountBySalon.get(salonId) ?? 0,
      overlap: matched.length,
      matchedFeatures: matched.map(featureLabel),
    });
  }

  // ⑤ 並べ替え：応募が少ない順 → 一致数の多い順 → 応募0件など同条件は求人IDの新しい順。
  candidates.sort((a, b) => {
    if (a.appCount !== b.appCount) return a.appCount - b.appCount;
    if (a.overlap !== b.overlap) return b.overlap - a.overlap;
    return b.jobId - a.jobId;
  });

  return { ok: true, stores: candidates.slice(0, 10) };
}
