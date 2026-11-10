'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { autoPostTimeLabel } from '@/lib/announceAuto';
import { COCOA_TEMPLATES_MAX, COCOA_TITLE_MAX, COCOA_BODY_MAX, titleTooLong, bodyTooLong, COCOA_ACCOUNT_SLOTS, COCOA_ACCOUNT_LABEL, normalizeCocoaSchedule, effectiveCocoaSchedule, type CocoaScheduleRow } from '@/lib/conecfCocoa';
import { postCocoaForSalon, postCocoaForAccount, hasEkichikaLogin } from '@/app/lib/conecf/cocoaPost';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { normalizeCocoaMovieSchedule, type CocoaMovieRow } from '@/lib/cocoaMovie';

// コネックエフ「ココア店長ブログ」の受け口（第404便・2026-09-17）。
// ★ 書き込みは「コネックエフに切り替え済み」の自店だけ（service_role）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  // ★ 第1399便: 運営が店を選んでいるときは、その店（lib/conecf/actingSalon.ts）。店舗様は今までどおり自分の店
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at, crm_until'), user.id, actingId)
    .limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) return { ok: false as const, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  // ★ 第1243便: セット（コネックエフ＋フクエスCRM）を OFF にした店は、保存・取り込みを止める（見るのはできる）
  if (write && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  return { ok: true as const, svc, salonId: Number(salon.id) };
}

export type CocoaTemplateRow = { id: number; title: string; body: string; imageUrl: string | null; isActive: boolean; lastPostedAt: string | null };
export type CocoaData = {
  salonId: number; enabled: boolean; postEmail: string; lastPostedAt: string | null; lastResult: string | null;
  timeLabel: string | null; max: number; titleMax: number; bodyMax: number; templates: CocoaTemplateRow[];
  /** ★ 第474便: 駅ちかのID・PASSがあるか（★ 無ければ自動投稿は止まっている） */
  hasEkichika: boolean;
  /** ★ 第1833便: A・B・C の3アカウント（表 conecf_cocoa_accounts が無ければ null＝今までの1つの画面） */
  accounts: CocoaAccountRow[] | null;
};

export type CocoaAccountRow = {
  slot: number; label: string; enabled: boolean; postEmail: string;
  /** 保存してある行（空なら今までどおり1日1回） */ schedule: CocoaScheduleRow[];
  /** 実際に使う行（空のときは店ごとに決まった時刻1つ） */ effective: CocoaScheduleRow[];
  lastPostedAt: string | null; lastResult: string | null;
  /** ★ 第1917便: 動画の記事（列が無い＝SQL 未適用なら null） */
  movie: { enabled: boolean; schedule: CocoaMovieRow[]; lastAt: string | null; lastResult: string | null } | null;
};

export async function getConecfCocoa(): Promise<Result<CocoaData>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const { data: st } = await r.svc.from('conecf_cocoa_settings').select('*').eq('salon_id', r.salonId).maybeSingle();
  const { data: temps } = await r.svc.from('conecf_cocoa_templates').select('*').eq('salon_id', r.salonId).order('sort_order').order('id');
  const acc = await r.svc.from('conecf_cocoa_accounts').select('slot, enabled, post_email, schedule, last_posted_at, last_result').eq('salon_id', r.salonId);
  const mv = await r.svc.from('conecf_cocoa_accounts').select('slot, movie_enabled, movie_schedule, movie_last_at, movie_last_result').eq('salon_id', r.salonId);
  const accounts: CocoaAccountRow[] | null = acc.error ? null : COCOA_ACCOUNT_SLOTS.map((slot) => {
    const x = (acc.data ?? []).find((d) => Number(d.slot) === slot);
    const y = mv.error ? null : (mv.data ?? []).find((d) => Number(d.slot) === slot);
    const schedule = normalizeCocoaSchedule(x?.schedule);
    return {
      slot, label: COCOA_ACCOUNT_LABEL[slot], enabled: x?.enabled === true, postEmail: (x?.post_email as string | null) ?? '',
      schedule, effective: effectiveCocoaSchedule(r.salonId, schedule),
      lastPostedAt: (x?.last_posted_at as string | null) ?? null, lastResult: (x?.last_result as string | null) ?? null,
      movie: mv.error ? null : { enabled: y?.movie_enabled === true, schedule: normalizeCocoaMovieSchedule(y?.movie_schedule), lastAt: (y?.movie_last_at as string | null) ?? null, lastResult: (y?.movie_last_result as string | null) ?? null },
    };
  });
  return {
    ok: true,
    data: {
      salonId: r.salonId,
      enabled: st?.enabled === true,
      postEmail: (st?.post_email as string | null) ?? '',
      lastPostedAt: (st?.last_posted_at as string | null) ?? null,
      lastResult: (st?.last_result as string | null) ?? null,
      timeLabel: autoPostTimeLabel(r.salonId),
      max: COCOA_TEMPLATES_MAX, titleMax: COCOA_TITLE_MAX, bodyMax: COCOA_BODY_MAX,
      hasEkichika: await hasEkichikaLogin(r.svc, r.salonId),
      accounts,
      templates: (temps ?? []).map((t) => ({
        id: Number(t.id), title: String(t.title ?? ''), body: String(t.body ?? ''),
        imageUrl: (t.image_url as string | null) ?? null, isActive: t.is_active !== false,
        lastPostedAt: (t.last_posted_at as string | null) ?? null,
      })),
    },
  };
}

export async function saveConecfCocoaSettings(input: { enabled: boolean; postEmail: string }): Promise<Result<{ saved: true }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const email = String(input.postEmail ?? '').trim();
  if (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: '投稿用メールアドレスの形が正しくありません' };
  if (input.enabled && email === '') return { ok: false, error: '自動投稿を始めるには、投稿用メールアドレスを入れてください' };
  const { error } = await r.svc.from('conecf_cocoa_settings').upsert({
    salon_id: r.salonId, enabled: input.enabled === true, post_email: email || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'salon_id' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { saved: true } };
}

export async function saveConecfCocoaTemplate(input: { id?: number; title: string; body: string; imageUrl: string | null }): Promise<Result<{ id: number }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const title = String(input.title ?? '').trim();
  const body = String(input.body ?? '');
  if (!title && !body.trim()) return { ok: false, error: 'タイトルか本文を入れてください' };
  if (titleTooLong(title)) return { ok: false, error: `タイトルは全角${COCOA_TITLE_MAX}文字までです` };
  if (bodyTooLong(body)) return { ok: false, error: `本文は全角${COCOA_BODY_MAX}文字までです` };
  const imageUrl = typeof input.imageUrl === 'string' && /^https:\/\//.test(input.imageUrl) ? input.imageUrl : null;

  if (input.id) {
    const { data: own } = await r.svc.from('conecf_cocoa_templates').select('id').eq('id', input.id).eq('salon_id', r.salonId).maybeSingle();
    if (!own) return { ok: false, error: 'このテンプレは見つかりません' };
    const { error } = await r.svc.from('conecf_cocoa_templates').update({ title, body, image_url: imageUrl, updated_at: new Date().toISOString() }).eq('id', input.id).eq('salon_id', r.salonId);
    if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
    return { ok: true, data: { id: Number(input.id) } };
  }
  const { count } = await r.svc.from('conecf_cocoa_templates').select('id', { count: 'exact', head: true }).eq('salon_id', r.salonId);
  if ((count ?? 0) >= COCOA_TEMPLATES_MAX) return { ok: false, error: `テンプレは${COCOA_TEMPLATES_MAX}本までです` };
  const { data, error } = await r.svc.from('conecf_cocoa_templates').insert({ salon_id: r.salonId, title, body, image_url: imageUrl, sort_order: (count ?? 0) + 1 }).select('id').single();
  if (error || !data) return { ok: false, error: `保存に失敗しました: ${error?.message ?? ''}` };
  return { ok: true, data: { id: Number(data.id) } };
}

export async function setConecfCocoaTemplateActive(input: { id: number; isActive: boolean }): Promise<Result<{ ok: true }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { error } = await r.svc.from('conecf_cocoa_templates').update({ is_active: input.isActive === true, updated_at: new Date().toISOString() }).eq('id', input.id).eq('salon_id', r.salonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { ok: true } };
}

export async function deleteConecfCocoaTemplate(input: { id: number }): Promise<Result<{ ok: true }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const { error } = await r.svc.from('conecf_cocoa_templates').delete().eq('id', input.id).eq('salon_id', r.salonId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { ok: true } };
}

/** 「いま1回投稿する」（自動の日付は動かさない＝手動は何度でも） */
export async function postConecfCocoaNow(): Promise<Result<{ title: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const res = await postCocoaForSalon(r.svc, r.salonId, true, false);
  if (res.posted) return { ok: true, data: { title: res.title ?? '' } };
  if (res.skipped === 'no-ekichika-login') return { ok: false, error: '駅ちかのID・パスワードが登録されていない（または一時停止中の）ため投稿できません' };
  return { ok: false, error: res.error ?? '投稿できませんでした（' + (res.skipped ?? '') + '）' };
}

/**
 * ★ 第474便: サイドバーに「ココア店長ブログ」を出すか。
 *   ★ 駅ちかのID・PASSがある店 ＋ 自動投稿がオンのままの店（★ ID・PASSを外しても止める画面を残す）。
 *   ★ 読めなければ出す（★ 止める道を隠さない）。
 */
export async function getConecfCocoaNavVisible(): Promise<boolean> {
  try {
    const r = await resolve(false);
    if (!r.ok) return true;   // ★ 店が決められないときは今までどおり出す
    if (await hasEkichikaLogin(r.svc, r.salonId)) return true;
    const { data: st } = await r.svc.from('conecf_cocoa_settings').select('enabled').eq('salon_id', r.salonId).maybeSingle();
    if (st?.enabled === true) return true;
    // ★ 第1833便: A・B・C のどれかが自動のまま
    const a = await r.svc.from('conecf_cocoa_accounts').select('slot').eq('salon_id', r.salonId).eq('enabled', true).limit(1);
    return !a.error && (a.data ?? []).length > 0;
  } catch {
    return true;
  }
}

// ── ★★ 第1833便: A・B・C の3アカウント ──
export async function saveConecfCocoaAccount(input: { slot: number; enabled: boolean; postEmail: string; schedule: CocoaScheduleRow[] }): Promise<Result<{ saved: true }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!(COCOA_ACCOUNT_SLOTS as readonly number[]).includes(slot)) return { ok: false, error: 'アカウントの指定が不正です' };
  const email = String(input.postEmail ?? '').trim();
  if (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: '投稿用メールアドレスの形が正しくありません' };
  if (input.enabled && email === '') return { ok: false, error: '自動投稿を始めるには、投稿用メールアドレスを入れてください' };
  const schedule = normalizeCocoaSchedule(input.schedule);
  // ★ 選んだテンプレートが自店のものか
  const ids = schedule.map((x) => x.templateId).filter((x): x is number => x !== null);
  if (ids.length > 0) {
    const { data: own } = await r.svc.from('conecf_cocoa_templates').select('id').eq('salon_id', r.salonId).in('id', ids);
    const ok = new Set((own ?? []).map((d) => Number(d.id)));
    if (ids.some((i) => !ok.has(i))) return { ok: false, error: '選んだテンプレートが見つかりません。読み込み直してください' };
  }
  const { error } = await r.svc.from('conecf_cocoa_accounts').upsert({
    salon_id: r.salonId, slot, enabled: input.enabled === true, post_email: email || null, schedule, updated_at: new Date().toISOString(),
  }, { onConflict: 'salon_id,slot' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  // ★ A は今までの表にも写す（表が切り替わる前の画面・周と食い違わないように）
  if (slot === 1) {
    await r.svc.from('conecf_cocoa_settings').upsert({ salon_id: r.salonId, enabled: input.enabled === true, post_email: email || null, updated_at: new Date().toISOString() }, { onConflict: 'salon_id' });
  }
  return { ok: true, data: { saved: true } };
}

/** 「いま1回投稿する」（アカウントごと。テンプレートは順番に） */
export async function postConecfCocoaAccountNow(input: { slot: number; templateId?: number | null }): Promise<Result<{ title: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!(COCOA_ACCOUNT_SLOTS as readonly number[]).includes(slot)) return { ok: false, error: 'アカウントの指定が不正です' };
  // ★ 第1835便: テンプレートを選んで送れる（選ばなければ順番に）
  const tid = Number(input.templateId);
  const res = await postCocoaForAccount(r.svc, r.salonId, slot, Number.isInteger(tid) && tid > 0 ? tid : null, true, null);
  if (res.posted) return { ok: true, data: { title: res.title ?? '' } };
  if (res.skipped === 'no-ekichika-login') return { ok: false, error: '駅ちかのID・パスワードが登録されていない（または一時停止中の）ため投稿できません' };
  if (res.skipped === 'no-address') return { ok: false, error: '投稿用メールアドレスを入れて「保存」を押してください' };
  return { ok: false, error: res.error ?? '投稿できませんでした（' + (res.skipped ?? '') + '）' };
}

// ── ★ 第1834便: テンプレートの写真をサーバー経由で上げる（運営が店を操作中でも入れられるように）──
// ★ 置き場は今までと同じ salon-images/cocoa-<店>-<時刻>.jpg。長い辺 1440px の JPEG に作り直す
export async function uploadConecfCocoaImage(fd: FormData): Promise<Result<{ url: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const file = fd.get('file');
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: '写真を選んでください' };
  if (file.size > 950 * 1024) return { ok: false, error: '写真が大きすぎます（もう少し小さい写真にしてください）' };
  let out: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    out = await sharp(Buffer.from(await file.arrayBuffer())).rotate()
      .resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch {
    return { ok: false, error: '写真として読めませんでした（JPEG・PNG・WebP にしてください）' };
  }
  const path = `cocoa-${r.salonId}-${Date.now()}.jpg`;
  const { error } = await r.svc.storage.from('salon-images').upload(path, out, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) return { ok: false, error: 'アップロードに失敗しました: ' + error.message };
  return { ok: true, data: { url: r.svc.storage.from('salon-images').getPublicUrl(path).data.publicUrl } };
}

// ── ★ 第1917便: ココアの動画の記事（いちばん新しい動画の記事を複製して出す・前の同じ記事は消す） ──
export async function saveConecfCocoaMovie(input: { slot: number; enabled: boolean; schedule: CocoaMovieRow[] }): Promise<Result<{ saved: true }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!(COCOA_ACCOUNT_SLOTS as readonly number[]).includes(slot)) return { ok: false, error: '指定が不正です' };
  const schedule = normalizeCocoaMovieSchedule(input.schedule);
  if (input.enabled === true && schedule.length === 0) return { ok: false, error: '出す時刻を1つ以上入れてください' };
  const { data, error } = await r.svc.from('conecf_cocoa_accounts')
    .update({ movie_enabled: input.enabled === true, movie_schedule: schedule, updated_at: new Date().toISOString() })
    .eq('salon_id', r.salonId).eq('slot', slot).select('slot');
  if (error) return { ok: false, error: '保存できませんでした（追加SQL_第1917便は流しましたか？）' };
  if (!data || data.length === 0) return { ok: false, error: 'このアカウントはまだ保存されていません。先に上の「保存」を押してください' };
  return { ok: true, data: { saved: true } };
}

/** ★ いま1回（ココアの残り回数を1回使う） */
export async function runConecfCocoaMovieNow(input: { slot: number }): Promise<Result<{ note: string }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  const slot = Number(input.slot);
  if (!(COCOA_ACCOUNT_SLOTS as readonly number[]).includes(slot)) return { ok: false, error: '指定が不正です' };
  try {
    const f = await startRelayFlow({ salonId: r.salonId, provider: 'ekichika', slot, intent: 'bump_push', actor: 'conecf:cocoa-movie', cocoaMovie: {} });
    if (!f.ok) return { ok: false, error: f.note };
    return { ok: true, data: { note: f.note } };
  } catch (e) {
    console.error('[conecf] ココアの動画の記事を始められなかった', (e as Error).message);
    return { ok: false, error: '始められませんでした。時間をおいてお試しください' };
  }
}
