'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { findMediaSite } from '@/lib/mediaSites';
import { providerLabel } from '@/lib/mediaAudit';
import { sortTherapistsByManual } from '@/lib/therapistOrder';
import { readConecfGirlOrder, isMissingOrderTable } from '@/app/lib/conecf/girlOrder';
import { isNewFaceActive } from '@/lib/newFace';
import {
  bodyTypeFromSizes, normalizeConecfGirl, CONECF_MAX_IMAGES, type ConecfGirlInput,
} from '@/lib/conecfGirl';
import { parseBodyType } from '@/lib/bodyType';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { deleteTherapistWithCleanup, setTherapistActive } from '@/app/actions/therapistAdmin';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { isSavableTarget } from '@/lib/conecfTargets';
import { therapistNameDupMessage } from '@/lib/therapistNameDup';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { splitSavableTherapistPhotos } from '@/lib/storageOwnPath';
import {
  normalizeComments, normalizeQa, normalizeSiteFields, SITE_FIELD_PROVIDERS, type QaItem,
} from '@/lib/conecfSiteFields';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { loadCastIds } from '@/lib/mediaCastIds';
import { needsConsent } from '@/lib/mediaConsent';
import { startMediaTherapistCreatePush } from '@/app/actions/mediaCredentials';

// コネックエフ「女性一覧・女性の編集」の受け口（第398便・1c・2026-09-17）。
//
// ★ 権限：ログイン中の人が owner の店（getConecfAccess と同じ選び方）。★ 他店のセラピストは触れない。
// ★ 書き込み：service_role で、列を限定して書く（therapistAdmin.ts と同じ作法）。
// ★★ 親データはフクエスの therapists。★ 保存すると age / body_type / 写真 もフクエスの表示に即時反映される。
// ★ conecf_therapist_profiles / conecf_therapist_targets は service_role 専用（RLS で閉じてある）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Svc = ReturnType<typeof createServiceClient>;

async function resolveSalon(opts: { write?: boolean } = {}): Promise<Result<{ svc: Svc; salonId: number; area: string | null }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  // ★ 第1399便: 運営が店を選んでいるときは、その店（lib/conecf/actingSalon.ts）。店舗様は今までどおり自分の店
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, area, conecf_enabled_at, crm_until'), user.id, actingId)
    .limit(1).maybeSingle();
  if (!salon) return { ok: false, error: '店舗情報が見つかりません' };
  // ★ 第399便: 書き込みは「コネックエフに切り替え済み」の店だけ（★ 切り替え前は見るだけ）
  if (opts.write && !salon.conecf_enabled_at) return { ok: false, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  // ★ 第1243便: セット（コネックエフ＋フクエスCRM）を OFF にした店は、保存・取り込みを止める（見るのはできる）
  if (opts.write && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) return { ok: false, error: CONECF_STOPPED_MESSAGE };
  return { ok: true, data: { svc, salonId: Number(salon.id), area: (salon.area as string | null) ?? null } };
}

async function ownTherapist(svc: Svc, salonId: number, therapistId: number) {
  const { data } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, profile_image_url, profile_images, is_new_face, new_face_since, is_active')
    .eq('id', therapistId)
    .maybeSingle();
  if (!data || Number(data.salon_id) !== salonId) return null;
  return data;
}

function imagesOf(t: { profile_images?: unknown; profile_image_url?: unknown }): string[] {
  const arr = Array.isArray(t.profile_images) ? (t.profile_images as unknown[]).filter((x): x is string => typeof x === 'string' && x !== '') : [];
  if (arr.length > 0) return arr.slice(0, CONECF_MAX_IMAGES);
  return typeof t.profile_image_url === 'string' && t.profile_image_url ? [t.profile_image_url] : [];
}

// ────────────────────────────────────────────────
export type ConecfGirlRow = {
  id: number; name: string; age: string | null; bodyType: string | null; imageUrl: string | null;
  isNewFace: boolean; isActive: boolean; joinedOn: string | null;
  /**
   * ★ 第1504便（カッキーさん・C）: 駅ちかの番号（castId）が結びついているか。
   *   null ＝ この店は駅ちかの ID・PASS を登録していない（札を出さない）。false ＝ 「駅ちか未登録」の札。
   *   10/15 ラビリンス様: 「＋新規登録」だけで駅ちかへの登録（サイトへ登録）を押していなかった＝一覧で分かるように。
   */
  ekichikaLinked: boolean | null;
};

export async function listConecfGirls(): Promise<Result<{ salonId: number; girls: ConecfGirlRow[] }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const { data, error } = await svc
    .from('therapists')
    .select('id, name, age, body_type, profile_image_url, profile_images, is_new_face, new_face_since, is_active')
    .eq('salon_id', salonId);
  if (error) return { ok: false, error: error.message };
  const ids = (data ?? []).map((t) => Number(t.id));
  const joined = new Map<number, string | null>();
  if (ids.length > 0) {
    const { data: prof } = await svc.from('conecf_therapist_profiles').select('therapist_id, joined_on').in('therapist_id', ids);
    (prof ?? []).forEach((p) => joined.set(Number(p.therapist_id), (p.joined_on as string | null) ?? null));
  }
  // ★ 第1504便: 駅ちかの番号の結び（C・「駅ちか未登録」の札）。★ 鍵が無い店は null（札を出さない）。読めなければ null（「未登録」と決めつけない）
  const linkedEk = new Set<number>();
  let ekichikaKnown = false;
  {
    const { data: creds } = await svc.from('salon_media_credentials').select('slot, is_enabled').eq('salon_id', salonId).eq('provider', 'ekichika');
    const slots = (creds ?? []).filter((c) => c.is_enabled === true).map((c) => Number(c.slot ?? 1));
    if (slots.length > 0 && ids.length > 0) {
      ekichikaKnown = true;
      for (const slot of slots) {
        const { maps, error: mErr } = await loadCastIds(svc, {
          therapists: (data ?? []).map((t) => ({ id: Number(t.id), import_cast_id: null })), provider: 'ekichika', slot,
        });
        if (mErr) { ekichikaKnown = false; break; }
        for (const [tid, cid] of maps.castIdOf) if (cid) linkedEk.add(Number(tid));
      }
      // ★ 旧列（import_cast_id）も枠1の番号として数える（loadCastIds に旧列を渡していないので、ここで足す）
      const { data: legacy } = await svc.from('therapists').select('id, import_cast_id').eq('salon_id', salonId).not('import_cast_id', 'is', null);
      for (const t of legacy ?? []) if (String(t.import_cast_id ?? '').trim()) linkedEk.add(Number(t.id));
    }
  }
  const rows: ConecfGirlRow[] = (data ?? []).map((t) => ({
    id: Number(t.id),
    name: (t.name as string | null) ?? '',
    age: t.age != null ? String(t.age) : null,
    bodyType: (t.body_type as string | null) ?? null,
    imageUrl: imagesOf(t)[0] ?? null,
    isNewFace: isNewFaceActive(t.is_new_face as boolean | null, t.new_face_since as string | null),
    isActive: t.is_active !== false,
    joinedOn: joined.get(Number(t.id)) ?? null,
    ekichikaLinked: ekichikaKnown ? linkedEk.has(Number(t.id)) : null,
  }));
  // ★ 第1384便: 店舗様が決めた順（無ければ今までどおり あいうえお順）
  const order = await readConecfGirlOrder(svc, salonId);
  return { ok: true, data: { salonId, girls: sortTherapistsByManual(rows, (x) => x.id, (x) => x.name, (x) => !x.isActive, order) } };
}

// ────────────────────────────────────────────────
// ★★ セラピストの並び順（第1384便・2026-10-10・カッキーさん）。
//   ・コネックエフのセラピスト一覧で、つまんで並べ替えた順を覚える（「先頭へ」も同じ受け口）。
//   ・保存するのは【公開中の方の id を上から順に】。表は conecf_girl_order（店ごとに1行）。★ therapists の行には触らない。
//   ・★ 書けるのは「コネックエフに切り替え済み」で止めていない自店だけ（resolveSalon の守り）。他店の id は断る。
//   ・変わるのはコネックエフの中の並びだけ（フクエスの店舗ページ・各サイトへは送らない＝ revalidate もしない）。
/** いまの並び（上から順の id）。★ セラピスト登録状況一覧が同じ順に並べるために読む */
export async function getConecfGirlOrder(): Promise<Result<{ order: number[] }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  return { ok: true, data: { order: await readConecfGirlOrder(r.data.svc, r.data.salonId) } };
}

export async function saveConecfGirlOrder(input: { ids: number[] }): Promise<Result<{ count: number }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const raw = Array.isArray(input?.ids) ? input.ids : [];
  if (raw.length > 2000) return { ok: false, error: '人数が多すぎます' };
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isInteger(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    ids.push(n);
  }
  // ★ 自店のセラピストだけ（他店の id が混じっていたら、保存しない）
  const { data: own, error: ownErr } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  if (ownErr) return { ok: false, error: 'セラピストを読み込めませんでした' };
  const ownIds = new Set((own ?? []).map((t) => Number(t.id)));
  if (ids.some((id) => !ownIds.has(id))) return { ok: false, error: '並び順を保存できませんでした。画面を読み込み直してから、もう一度お試しください' };

  const { error } = await svc
    .from('conecf_girl_order')
    .upsert({ salon_id: salonId, therapist_ids: ids, updated_at: new Date().toISOString() }, { onConflict: 'salon_id' });
  if (error) {
    if (isMissingOrderTable(error.code)) return { ok: false, error: '並び順の保存先がまだ用意されていません（追加SQL 第1384便）。運営事務局までご連絡ください' };
    console.error('[conecf] 並び順を保存できなかった', salonId, error.code, error.message);
    return { ok: false, error: '並び順を保存できませんでした。時間をおいて、もう一度お試しください' };
  }
  return { ok: true, data: { count: ids.length } };
}

export async function createConecfGirl(input: { name: string; isNewFace: boolean }): Promise<Result<{ id: number }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId, area } = r.data;
  const name = String(input.name ?? '').trim();
  if (!name) return { ok: false, error: '女性名を入れてください' };
  if ([...name].length > 10) return { ok: false, error: '女性名は10文字までです' };
  const isNew = input.isNewFace === true;
  const { data, error } = await svc
    .from('therapists')
    .insert({
      salon_id: salonId, name, area,
      is_new_face: isNew, new_face_since: isNew ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  const dup = therapistNameDupMessage(error);
  if (dup) return { ok: false, error: dup };
  if (error || !data) return { ok: false, error: `追加に失敗しました: ${error?.message ?? ''}` };
  return { ok: true, data: { id: Number(data.id) } };
}

// ── 第1504便（2026-10-15・カッキーさん・A）: 「＋新規登録」の直後に、各サイトへも登録する ─────────────────
//
// ★ 10/15 ラビリンス様: 「＋新規登録」だけでコネックエフの登録は終わりと思い、駅ちかへの登録（「サイトへ登録」→「登録」）を押していなかった。
//   → 登録した直後に「駅ちか・エステ魂へも登録しますか？」と聞き、「はい」ならここで各サイトの登録の流れを始める。
// ★ 中身は「サイトへ登録」の画面の「登録」ボタンと【同じ action】（startMediaTherapistCreatePush）。★ 写真は無ければ飛ばして登録だけ（既定どおり）。
//   同じ名前がもう相手サイトに居れば、新しく作らず結びつける（第1495便）。前の更新が動いていても順番待ち（第1296便）。
// ★ 送る先は「ID・PASS が登録されて止めていないサイト」（駅ちか・エステ魂）。向き（フクエスから反映）・同意は startRelayFlow の入口が見る。

type RegisterSite = { provider: string; slot: number; label: string };

async function registerSitesOf(svc: Svc, salonId: number): Promise<RegisterSite[]> {
  const { data: creds } = await svc
    .from('salon_media_credentials').select('provider, slot, is_enabled, consent_version')
    .eq('salon_id', salonId).in('provider', ['ekichika', 'esutama']);
  const out: RegisterSite[] = [];
  for (const c of creds ?? []) {
    if (c.is_enabled !== true) continue;
    if (needsConsent((c.consent_version as string | null) ?? null)) continue;
    const provider = String(c.provider);
    const slot = Number(c.slot ?? 1);
    if (out.some((x) => x.provider === provider && x.slot === slot)) continue;
    out.push({ provider, slot, label: (findMediaSite(provider)?.name ?? providerLabel(provider)) + (slot > 1 ? `（枠${slot}）` : '') });
  }
  return out;
}

/**
 * ★ 第1505便（2026-10-15・カッキーさん・案2）: 「保存」だけで各サイトへ送ってよいサイト＝【番号は結びついているが、写真をまだ1枚も送っていない】サイト。
 *   登録直後の子は相手サイトに名前だけで載っている。その間だけ「保存」で自動的に送り、写真が1枚でも送られたら今までどおり「保存して更新」を押してもらう。
 *   ★ 物差しは conecf_photo_pushes（第421便・送った写真の記録）に行が無いこと。★ 鍵が無い・止めている・番号が無いサイトは対象外。
 */
export async function listConecfFreshPhotoSites(input: { id: number }): Promise<Result<{ providers: string[] }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'セラピストが見つかりません' };
  const { data: creds } = await svc
    .from('salon_media_credentials').select('provider, slot, is_enabled')
    .eq('salon_id', salonId).in('provider', ['ekichika', 'esutama']);
  const providers = new Set<string>();
  for (const c of creds ?? []) {
    if (c.is_enabled !== true) continue;
    const provider = String(c.provider);
    const slot = Number(c.slot ?? 1);
    if (providers.has(provider)) continue;
    const { maps, error: mErr } = await loadCastIds(svc, {
      therapists: [{ id: Number(t.id), import_cast_id: (t as { import_cast_id?: string | null }).import_cast_id ?? null }], provider, slot,
    });
    if (mErr) continue;                         // ★ 読めなければ送らない側
    if (!maps.castIdOf.get(Number(t.id))) continue;   // ★ 番号が無い＝まだ登録していない（送れない）
    const { count, error: pErr } = await svc
      .from('conecf_photo_pushes').select('image_slot', { count: 'exact', head: true })
      .eq('therapist_id', Number(t.id)).eq('provider', provider).eq('slot', slot);
    if (pErr) continue;
    if ((count ?? 0) === 0) providers.add(provider);
  }
  return { ok: true, data: { providers: [...providers] } };
}

/** 登録直後の小窓に出す「登録できるサイト」。★ 無ければ小窓を出さない */
export async function listConecfRegisterSites(): Promise<Result<{ sites: RegisterSite[] }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  return { ok: true, data: { sites: await registerSitesOf(r.data.svc, r.data.salonId) } };
}

/** その方を、登録できるサイトすべてへ登録する（1サイトずつ・結果を返す）。★ 相手に人が増える操作 */
export async function registerConecfGirlToSites(input: { id: number }): Promise<Result<{ results: Array<{ label: string; ok: boolean; note: string; waiting: boolean }> }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const own = await ownTherapist(svc, salonId, Number(input.id));
  if (!own) return { ok: false, error: 'セラピストが見つかりません' };
  const sites = await registerSitesOf(svc, salonId);
  if (sites.length === 0) return { ok: false, error: '登録できるサイトがありません（ID・パスワード登録をご確認ください）' };
  const results: Array<{ label: string; ok: boolean; note: string; waiting: boolean }> = [];
  for (const s of sites) {
    const res = await startMediaTherapistCreatePush({ salonId, provider: s.provider, slot: s.slot, therapistId: Number(input.id) });
    results.push(res.ok
      ? { label: s.label, ok: true, note: res.data.note, waiting: res.data.waiting }
      : { label: s.label, ok: false, note: res.error, waiting: false });
  }
  return { ok: true, data: { results } };
}

// ────────────────────────────────────────────────
export type ConecfGirlDetail = {
  salonId: number;
  id: number;
  images: string[];
  form: {
    name: string; nameKana: string; nameHira: string; nameRomaji: string;
    joinedOn: string; isNewFace: boolean; isActive: boolean;
    age: string; birthDate: string;
    height: string; bust: string; cup: string; waist: string; hip: string; weight: string;
    bloodType: string; style: string; lookType: string;
  };
  sites: Array<{ provider: string; slot: number; label: string; enabled: boolean }>;
  /** ★ 第1549便: お店の既定画像（/mypage）が入っているか。★ 写真の無い子は、これを駅ちかの1枚目として送る */
  hasSalonPlaceholder: boolean;
};

/** ★ 第1549便: お店の既定画像が入っているか（salons.therapist_placeholder_url）。★ 読めなければ false（案内を出す側に倒す） */
async function salonHasPlaceholder(svc: SupabaseClient, salonId: number): Promise<boolean> {
  const { data } = await svc.from('salons').select('therapist_placeholder_url').eq('id', salonId).maybeSingle();
  return !!String((data as { therapist_placeholder_url?: string | null } | null)?.therapist_placeholder_url ?? '').trim();
}

export async function getConecfGirl(input: { id: number }): Promise<Result<ConecfGirlDetail>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };

  const { data: p } = await svc.from('conecf_therapist_profiles').select('*').eq('therapist_id', t.id).maybeSingle();
  // ★ 数字のサイズがまだ無い方は、フクエスの body_type から埋めて出す（★ 取り込み・マイページで入れた値を捨てない）
  const fromBody = parseBodyType((t.body_type as string | null) ?? null);
  const s = (x: unknown) => (x === null || x === undefined ? '' : String(x));

  const { data: creds } = await svc.from('salon_media_credentials').select('provider, slot').eq('salon_id', salonId);
  const { data: tg } = await svc.from('conecf_therapist_targets').select('provider, slot, enabled').eq('therapist_id', t.id);
  const off = new Set((tg ?? []).filter((x) => x.enabled === false).map((x) => `${x.provider}#${x.slot}`));
  const sites = (creds ?? [])
    .filter((c) => {
      const site = findMediaSite(String(c.provider));
      return !!site && site.accepting && (site.can.includes('work') || site.can.includes('therapist'));
    })
    .map((c) => {
      const slot = Number(c.slot);
      const label = providerLabel(String(c.provider)) + (slot > 1 ? `（枠${slot}）` : '');
      return { provider: String(c.provider), slot, label, enabled: !off.has(`${c.provider}#${slot}`) };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));

  return {
    ok: true,
    data: {
      salonId,
      id: Number(t.id),
      images: imagesOf(t),
      hasSalonPlaceholder: await salonHasPlaceholder(svc, salonId),
      form: {
        name: s(t.name),
        nameKana: s(p?.name_kana), nameHira: s(p?.name_hira), nameRomaji: s(p?.name_romaji),
        joinedOn: s(p?.joined_on),
        isNewFace: isNewFaceActive(t.is_new_face as boolean | null, t.new_face_since as string | null),
        isActive: t.is_active !== false,
        age: s(t.age), birthDate: s(p?.birth_date),
        height: s(p?.height ?? fromBody?.height), bust: s(p?.bust ?? fromBody?.bust), cup: s(p?.cup ?? fromBody?.cup),
        waist: s(p?.waist ?? fromBody?.waist), hip: s(p?.hip ?? fromBody?.hip), weight: s(p?.weight),
        bloodType: s(p?.blood_type), style: s(p?.style), lookType: s(p?.look_type),
      },
      sites,
    },
  };
}

export async function saveConecfGirl(input: { id: number; values: ConecfGirlInput }): Promise<Result<{ age: string | null; bodyType: string }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };

  const n = normalizeConecfGirl(input.values ?? { name: '' }, new Date());
  if (!n.ok) return n;
  const v = n.value;
  const bodyType = bodyTypeFromSizes(v);

  // ★ 新人：付けた瞬間だけ日付を入れる（★ 付けたままなら日付を動かさない＝60日の数え直しをしない）
  const wasNew = t.is_new_face === true;
  const patch: Record<string, unknown> = {
    name: v.name,
    age: v.age != null ? String(v.age) : null,
    body_type: bodyType || null,
    is_new_face: v.isNewFace,
  };
  if (v.isNewFace && !wasNew) patch.new_face_since = new Date().toISOString();
  if (!v.isNewFace) patch.new_face_since = null;

  const { error: upErr } = await svc.from('therapists').update(patch).eq('id', t.id).eq('salon_id', salonId);
  const dupUp = therapistNameDupMessage(upErr);
  if (dupUp) return { ok: false, error: dupUp };
  if (upErr) return { ok: false, error: `保存に失敗しました: ${upErr.message}` };

  const { error: pErr } = await svc.from('conecf_therapist_profiles').upsert({
    therapist_id: t.id,
    // ★ 第444便: カタカナ・ひらがな・ローマ字は画面から外した。★ 空で上書きしないよう、保存では触らない
    joined_on: v.joinedOn,
    // ★ 第445便: 生年月日・体重は画面から外した。★ 空で上書きしないよう、保存では触らない
    height: v.height, bust: v.bust, cup: v.cup, waist: v.waist, hip: v.hip,
    // ★ 第446便: スタイル・タイプは画面から外した。★ 空で上書きしないよう、保存では触らない
    blood_type: v.bloodType,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id' });
  if (pErr) return { ok: false, error: `保存に失敗しました（追加の項目）: ${pErr.message}` };

  return { ok: true, data: { age: patch.age as string | null, bodyType } };
}

export async function saveConecfGirlImages(input: { id: number; images: string[] }): Promise<Result<{ images: string[] }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const given = (Array.isArray(input.images) ? input.images : [])
    .filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(u))
    .slice(0, CONECF_MAX_IMAGES);
  // ★★★ 第1285便: 新しく入れる写真は、フクエスの保管庫にある【この方自身の】写真だけ受け付ける。
  //   ★ それまでは https なら何でも通った。他店の写真の URL を入れられた（＝他店の写真を自店の写真として出せた。
  //     さらに、その方を削除すると他店のファイルが消えた ― そちらは lib/therapistDelete.ts でも塞いだ）。
  //   ★ いますでに入っている URL はそのまま通す（昔の取り込みで外部の URL が入っている方の写真を、保存のたびに消さない）。
  //   ★ 黙って落とさない。断って理由を返す（保存したのに写真が消えた、を作らない）。
  const current = [
    ...(Array.isArray(t.profile_images) ? (t.profile_images as unknown[]).filter((x): x is string => typeof x === 'string') : []),
    ...(typeof t.profile_image_url === 'string' ? [t.profile_image_url] : []),
  ];
  const split = splitSavableTherapistPhotos(given, current, Number(t.id), process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  if (split.rejected.length > 0) {
    console.error('[conecf] 受け付けない写真の URL が来た', salonId, Number(t.id), split.rejected.length);
    return { ok: false, error: 'この写真は保存できません。画面から写真を選び直してください（この方の写真として上げたものだけ使えます）' };
  }
  const images = split.ok;
  const { error } = await svc
    .from('therapists')
    .update({ profile_image_url: images[0] ?? null, profile_images: images })
    .eq('id', t.id).eq('salon_id', salonId);
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { images } };
}

export async function saveConecfGirlTargets(input: {
  id: number; targets: Array<{ provider: string; slot: number; enabled: boolean }>;
}): Promise<Result<{ saved: number }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const rows = (Array.isArray(input.targets) ? input.targets : [])
    // ★ 第408便: フクエスは外せない（保存しない）
    .filter((x) => isSavableTarget(String(x.provider)) && findMediaSite(String(x.provider)) && Number.isInteger(Number(x.slot)) && Number(x.slot) >= 1 && Number(x.slot) <= 20)
    .map((x) => ({ therapist_id: t.id, provider: String(x.provider), slot: Number(x.slot), enabled: x.enabled === true, updated_at: new Date().toISOString() }));
  if (rows.length === 0) return { ok: true, data: { saved: 0 } };
  const { error } = await svc.from('conecf_therapist_targets').upsert(rows, { onConflict: 'therapist_id,provider,slot' });
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { saved: rows.length } };
}

/**
 * ★ 第409便: 「送り先サイト」で送らない組（therapistId#provider#slot）。★ 「女性をサイトへ登録」で登録ボタンを隠すため。
 * ★ 切り替え前の店は空（★ フクエスリンクの画面は変わらない）。★ 読めなければ空（★ 受け口の buildGirlCreatePlan 等が断る）
 */
export async function listConecfTargetOffs(): Promise<Result<{ offs: string[] }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const { data: salon } = await svc.from('salons').select('conecf_enabled_at').eq('id', salonId).maybeSingle();
  if (!salon?.conecf_enabled_at) return { ok: true, data: { offs: [] } };
  const { data: ths } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  const ids = (ths ?? []).map((t) => Number(t.id));
  if (ids.length === 0) return { ok: true, data: { offs: [] } };
  const { data, error } = await svc
    .from('conecf_therapist_targets').select('therapist_id, provider, slot')
    .in('therapist_id', ids).eq('enabled', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { offs: (data ?? []).map((x) => `${x.therapist_id}#${x.provider}#${x.slot}`) } };
}

// ────────────────────────────────────────────────
// ★★ 第414便: コメント・Q&A・各サイト項目（ベンリーの「コメント／各サイト項目／Q&A」）。
//   ★ 決めごとは src/lib/conecfSiteFields.ts。★ この便は保存まで（★ サイトへ送るのは次の便）。
//   ★ SQL（20260917_conecf_girl_site_fields.sql）がまだの間は、読むときは空で出し、保存は断る。

export type ConecfGirlExtras = {
  comments: { catchphrase: string; profileText: string; shopTitle: string; girlComment: string };
  /** ★ 第726便: フクエスの特徴バッジ（therapists.feature_badges）。★ マイページと同じ列・同じ上限（sanitizeBadges） */
  badges: string[];
  qa: QaItem[];
  siteFields: Array<{ provider: string; slot: number; label: string; fields: Record<string, unknown> }>;
  ready: boolean;
};

export async function getConecfGirlExtras(input: { id: number }): Promise<Result<ConecfGirlExtras>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const { data: th } = await svc.from('therapists').select('catchphrase, profile_text, feature_badges').eq('id', t.id).maybeSingle();
  const { data: p } = await svc.from('conecf_therapist_profiles').select('*').eq('therapist_id', t.id).maybeSingle();
  const prof = (p ?? {}) as Record<string, unknown>;
  const { data: sf, error: sfErr } = await svc.from('conecf_therapist_site_fields').select('provider, slot, fields').eq('therapist_id', t.id);
  const { data: creds } = await svc.from('salon_media_credentials').select('provider, slot').eq('salon_id', salonId);
  const got = new Map((sf ?? []).map((x) => [`${x.provider}#${x.slot}`, (x.fields ?? {}) as Record<string, unknown>]));
  const siteFields = (creds ?? [])
    .filter((c) => SITE_FIELD_PROVIDERS.includes(String(c.provider)))
    .map((c) => {
      const slot = Number(c.slot);
      return {
        provider: String(c.provider), slot,
        label: providerLabel(String(c.provider)) + (slot > 1 ? `（枠${slot}）` : ''),
        fields: got.get(`${c.provider}#${slot}`) ?? {},
      };
    })
    .sort((a, b) => SITE_FIELD_PROVIDERS.indexOf(a.provider) - SITE_FIELD_PROVIDERS.indexOf(b.provider) || a.slot - b.slot);
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    ok: true,
    data: {
      comments: {
        catchphrase: s(th?.catchphrase), profileText: s(th?.profile_text),
        shopTitle: s(prof.shop_title), girlComment: s(prof.girl_comment),
      },
      badges: sanitizeBadges(th?.feature_badges),
      qa: Array.isArray(prof.qa) ? (prof.qa as QaItem[]) : [],
      siteFields,
      // ★ SQL がまだなら site_fields が読めない（★ 画面で「準備中」と出す）
      ready: !sfErr,
    },
  };
}

export async function saveConecfGirlComments(input: { id: number; comments: Record<string, unknown> }): Promise<Result<{ saved: true }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const n = normalizeComments(input.comments ?? {});
  if (!n.ok) return n;
  const v = n.value;
  // ★ キャッチ・お店コメントはフクエスの表示と同じ列（★ フクエスにもそのまま出る）
  const { error: tErr } = await svc.from('therapists')
    .update({ catchphrase: v.catchphrase || null, profile_text: v.profileText || null })
    .eq('id', t.id).eq('salon_id', salonId);
  if (tErr) return { ok: false, error: `保存に失敗しました: ${tErr.message}` };
  const { error: pErr } = await svc.from('conecf_therapist_profiles').upsert({
    therapist_id: t.id, shop_title: v.shopTitle || null, girl_comment: v.girlComment || null, updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id' });
  if (pErr) return { ok: false, error: `保存に失敗しました（SQL がまだの可能性があります）: ${pErr.message}` };
  return { ok: true, data: { saved: true } };
}

/** ★ 第726便: フクエスの特徴バッジを保存（マイページの保存と同じ列・同じ正規化） */
export async function saveConecfGirlBadges(input: { id: number; badges: unknown }): Promise<Result<{ badges: string[] }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const badges = sanitizeBadges(input.badges);
  const { error } = await svc.from('therapists').update({ feature_badges: badges }).eq('id', t.id).eq('salon_id', salonId);
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true, data: { badges } };
}

export async function saveConecfGirlQa(input: { id: number; qa: unknown }): Promise<Result<{ count: number }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const n = normalizeQa(input.qa);
  if (!n.ok) return n;
  const { error } = await svc.from('conecf_therapist_profiles').upsert({
    therapist_id: t.id, qa: n.value, updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id' });
  if (error) return { ok: false, error: `保存に失敗しました（SQL がまだの可能性があります）: ${error.message}` };
  return { ok: true, data: { count: n.value.length } };
}

export async function saveConecfGirlSiteFields(input: {
  id: number; provider: string; slot: number; fields: Record<string, unknown>;
}): Promise<Result<{ fields: Record<string, unknown> }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: 'この女性は見つかりません' };
  const provider = String(input.provider ?? '');
  const slot = Math.trunc(Number(input.slot));
  if (!SITE_FIELD_PROVIDERS.includes(provider) || !(slot >= 1 && slot <= 20)) return { ok: false, error: 'サイトの指定が不正です' };
  const n = normalizeSiteFields(provider, input.fields ?? {});
  if (!n.ok) return n;
  const fields = n.value as unknown as Record<string, unknown>;
  const { error } = await svc.from('conecf_therapist_site_fields').upsert({
    therapist_id: t.id, provider, slot, fields, updated_at: new Date().toISOString(),
  }, { onConflict: 'therapist_id,provider,slot' });
  if (error) return { ok: false, error: `保存に失敗しました（SQL がまだの可能性があります）: ${error.message}` };
  return { ok: true, data: { fields } };
}

// ── ★★★ 第432便: 女性の削除（退店）──────────────────────────
//   ★ 中身はマイページと同じ deleteTherapistWithCleanup（出勤 → 写メ日記 → 本人 → 写真の掃除）。★ 2か所に書かない。
//   ★ 取り消せない（★ 写真ファイルも消える）。
// ── ★★★ 第433便: 連携しているサイトからも一緒に ────────────────────
//   ★ 駅ちか … 削除（girl_delete・第228便・実弾で何度も通っている。★ 写真も一緒に消える）
//   ★ エステ魂 … 非表示（cast_hide・第229便。★ 公開ページは404・エステ魂の画面から戻せる）
//   ★ それ以外のサイトは自動では消せない（★ 画面に出して、各サイトで消してもらう）
//   ★★ 順番: 先にサイトへの依頼を積む → 全部積めたときだけコネックエフから消す。
//     ★ 1つでも積めなければ（別の更新が動いている等）コネックエフは消さずに止める。
//     ★ 積めたサイトは中継が消しに行く。★ もう一度押すと、そのサイトは「もう居ない」で何もせず終わる（二重に困らない）。

type DeleteSite = { provider: string; slot: number; castId: string; label: string; auto: 'delete' | 'hide' | null };
export type ConecfGirlDeleteInfo = { name: string; linked: Array<{ provider: string; label: string; slot: number; auto: 'delete' | 'hide' | null }> };

/** ★ そのサイトへ中継を積めるか（★ startRelayFlow と同じ条件：ログイン情報あり・停止中でない・「反映しない」でない） */
async function siteReady(svc: Svc, salonId: number, provider: string, slot: number): Promise<boolean> {
  const { data: cred } = await svc.from('salon_media_credentials').select('is_enabled').eq('salon_id', salonId).eq('provider', provider).eq('slot', slot).maybeSingle();
  if (!cred || cred.is_enabled !== true) return false;
  const { data: src } = await svc.from('salon_import_sources').select('link_mode').eq('salon_id', salonId).eq('provider', provider).eq('slot', slot).maybeSingle();
  return !(src && String((src as { link_mode?: string }).link_mode) === 'none');
}

async function linkedSites(svc: Svc, salonId: number, therapistId: number, legacyCastId: string | null): Promise<DeleteSite[]> {
  const { data: links } = await svc.from('therapist_media_ids').select('provider, slot, external_cast_id').eq('therapist_id', therapistId);
  const out: DeleteSite[] = ((links ?? []) as Array<{ provider: string; slot: number; external_cast_id: string }>).map((l) => {
    const provider = String(l.provider);
    return {
      provider, slot: Number(l.slot ?? 1), castId: String(l.external_cast_id ?? ''), label: providerLabel(provider),
      auto: provider === 'ekichika' ? 'delete' as const : provider === 'esutama' ? 'hide' as const : null,
    };
  });
  // ★ 駅ちかの枠1は、古い結びつき（therapists.import_cast_id）だけの人がいる
  if (legacyCastId && !out.some((x) => x.provider === 'ekichika' && x.slot === 1)) {
    out.push({ provider: 'ekichika', slot: 1, castId: legacyCastId, label: providerLabel('ekichika'), auto: 'delete' });
  }
  // ★ 積めないサイト（「反映しない」・停止中・ログイン情報なし）は自動で消さない側へ
  for (const x of out) {
    if (x.auto && !(await siteReady(svc, salonId, x.provider, x.slot))) x.auto = null;
  }
  return out.sort((a, b) => a.provider.localeCompare(b.provider) || a.slot - b.slot);
}

export async function getConecfGirlDeleteInfo(input: { id: number }): Promise<Result<ConecfGirlDeleteInfo>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: '女性が見つかりません' };
  const { data: legacy } = await svc.from('therapists').select('import_cast_id').eq('id', Number(t.id)).maybeSingle();
  const sites = await linkedSites(svc, salonId, Number(t.id), (legacy?.import_cast_id as string | null) ?? null);
  return { ok: true, data: { name: String(t.name ?? ''), linked: sites.map(({ provider, label, slot, auto }) => ({ provider, label, slot, auto })) } };
}

/**
 * @param alsoSites サイトからも消すなら true（★ 駅ちかは削除・エステ魂は非表示）。false ならコネックエフだけ
 *
 * ★★★ 第1279便（2026-10-07・カッキーさんの OK）: 「サイトからも消す」の順番を逆にした。
 *   これまで … 各サイトへの依頼を【積めた時点】で、すぐにコネックエフ・フクエス側の本人を消していた。
 *             相手サイトでの実際の削除は数分後。そこで失敗すると、本人がもう居ないのでやり直せず、退店した方が駅ちかに残った。
 *   これから … ① すぐ非公開にする ② 各サイトへ依頼する ③ 各サイトで【消えたことを確かめてから】本人を消す。
 *             ③ は中継の流れの終わり（app/lib/conecf/girlDeleteFinish.ts）。確かめられなかったら消さない（非公開のまま残る）。
 *   ★ 依頼を1つも積まないとき（サイトからは消さない・連携が無い・自動で消せるサイトが無い）は、今までどおりすぐ消す。
 *
 * @returns pending … true なら、本人はまだ消していない（各サイトで確かめ終わったら消える）
 * @returns waiting … 依頼を受け付けたサイトのうち、前の更新が動いていて順番待ちのサイト（第1296便）
 *
 * ★★★ 第1296便（2026-10-08）: 各サイトへの依頼は、前の更新が動いていても【順番待ち】で受け付ける。
 *   これまで … 出勤の自動更新などと重なると「別の更新が動いています。少し待ってから、もう一度「削除」を押してください」で断っていた。
 *   これから … 断らずに受け付け、前の更新が終わったら自動で始める。15分たっても始まらなければ取りやめて「更新結果」に出す
 *             （その方は非公開のまま一覧に残る＝もう一度「削除」を押せる）。
 */
export async function deleteConecfGirl(input: { id: number; alsoSites: boolean }): Promise<Result<{ salonId: number; name: string; queued: string[]; manual: string[]; pending: boolean; waiting: string[] }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const t = await ownTherapist(svc, salonId, Number(input.id));
  if (!t) return { ok: false, error: '女性が見つかりません（すでに削除されている可能性があります）' };
  const name = String(t.name ?? '');

  const queued: string[] = [];
  const manual: string[] = [];
  const waiting: string[] = [];
  if (input.alsoSites === true) {
    const { data: legacy } = await svc.from('therapists').select('import_cast_id').eq('id', Number(t.id)).maybeSingle();
    const sites = await linkedSites(svc, salonId, Number(t.id), (legacy?.import_cast_id as string | null) ?? null);
    const autoSites = sites.filter((site) => site.auto && /^\d{1,12}$/.test(site.castId));
    for (const site of sites) if (!autoSites.includes(site)) manual.push(site.label);

    if (autoSites.length > 0) {
      // ① すぐ非公開にする（フクエスから消える・今すぐと、この先の出勤も外れる）。
      //   ★ ここが通らなければ、何も依頼しない（公開されたまま「削除中」にしない）。
      const off = await setTherapistActive({ therapistId: String(t.id), salonId, isActive: false, via: 'conecf' });
      if (!off.ok) return { ok: false, error: '削除を始められませんでした（' + off.error + '）' };

      // ② 各サイトへ依頼する。★ 待つサイトの一覧と依頼の時刻を、流れの文脈に入れて持ち回す
      const deleteAfter = {
        therapistId: Number(t.id),
        requestedAt: new Date().toISOString(),
        waitFor: autoSites.map((site) => ({ provider: site.provider, slot: site.slot, castId: site.castId })),
      };
      for (const site of autoSites) {
        let f;
        try {
          f = site.auto === 'delete'
            ? await startRelayFlow({ salonId, provider: site.provider, slot: site.slot, intent: 'girl_delete', actor: 'conecf:girl-delete', girlDelete: { castId: site.castId }, deleteAfter, whenBusy: 'wait' })
            : await startRelayFlow({ salonId, provider: site.provider, slot: site.slot, intent: 'cast_hide', actor: 'conecf:girl-delete', castHide: { castId: site.castId }, deleteAfter, whenBusy: 'wait' });
        } catch (e) {
          console.error('[conecf] 退店のサイト依頼を積めなかった', (e as Error).message);
          f = { ok: false as const, note: '開始できませんでした' };
        }
        if (!f.ok) {
          const why = 'reason' in f && f.reason === 'busy' ? 'いま' + site.label + 'で別の更新が動いています' : (f.note || '開始できませんでした');
          // ★ 本人は消していない（非公開にしただけ）。少し待って、もう一度「削除」を押せる。
          //   ★ 先に依頼を積めたサイトは、そのまま進む（消えたら、そのサイトの連携は外れる）。本人は、残りのサイトが済むまで消えない。
          return { ok: false, error: site.label + 'への依頼を受け付けられませんでした（' + why + '）。'
            + name + 'さんは非公開にしてあり、まだ削除していません。'
            + (queued.length > 0 ? queued.join('・') + 'には依頼済みです。' : '') + '少し待ってから、もう一度「削除」を押してください' };
        }
        queued.push(site.label + (site.auto === 'delete' ? '（削除）' : '（非表示）'));
        if ('waiting' in f && f.waiting === true) waiting.push(site.label);   // ★ 第1296便
      }
      // ③ は、各サイトで消えたことを確かめ終わったところで（app/lib/conecf/girlDeleteFinish.ts）
      return { ok: true, data: { salonId, name, queued, manual, pending: true, waiting } };
    }
  }

  // ★ 依頼を1つも積まない（サイトからは消さない・連携が無い・自動で消せるサイトが無い）＝今までどおり、すぐ消す
  const res = await deleteTherapistWithCleanup({ therapistId: String(t.id), salonId, via: 'conecf' });   // ★ 第1291便: コネックエフからの削除の印
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: { salonId, name, queued, manual, pending: false, waiting } };
}

// ─────────────────────────────────────────────────────────────
// ★★ 第1550便（2026-10-17・カッキーさん）: 写真が無いセラピストに使う画像（お店の既定画像）をコネックエフでも変えられるように。
//   ★ 保存先はマイページと同じ salons.therapist_placeholder_url（★ 1か所＝どちらで変えても同じ画像）。
//   ★ 使い道: フクエスのカード（写真なしの子）と、駅ちかの1枚目（第1549便・写真が無いとプロフィールを保存しないため）。
//   ★ 置き場もマイページと同じ salon-images/<店>/therapist_placeholder_<時刻>.jpg（★ /api/relay/file はこの形だけ読める）。
//   ★ 駅ちかは JPEG・PNG だけ・最低 300×400 なので、サーバーで JPEG に作り直す（WebP でも送れるように）。
//   ★ サーバーで受けるので、運営が店を選んで操作しているときも使える。
// ─────────────────────────────────────────────────────────────
const PLACEHOLDER_MAX_UPLOAD = 950 * 1024;   // ★ ブラウザで縮めてから送る（サーバーアクションの上限 1MB の内側）

export async function getConecfPlaceholder(): Promise<Result<{ salonId: number; url: string | null }>> {
  const r = await resolveSalon();
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const { data } = await svc.from('salons').select('therapist_placeholder_url').eq('id', salonId).maybeSingle();
  const url = String((data as { therapist_placeholder_url?: string | null } | null)?.therapist_placeholder_url ?? '').trim();
  return { ok: true, data: { salonId, url: url || null } };
}

export async function saveConecfPlaceholder(fd: FormData): Promise<Result<{ salonId: number; url: string }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const file = fd.get('file');
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: '画像を選んでください' };
  if (file.size > PLACEHOLDER_MAX_UPLOAD) return { ok: false, error: '画像が大きすぎます（もう少し小さい画像にしてください）' };
  let out: Buffer;
  try {
    const sharp = (await import('sharp')).default;
    const img = sharp(Buffer.from(await file.arrayBuffer())).rotate();
    const meta = await img.metadata();
    const w = Number(meta.width ?? 0), h = Number(meta.height ?? 0);
    // ★ 駅ちかの最低推奨（横300×縦400）
    if (w < 300 || h < 400) return { ok: false, error: '画像が小さすぎます（横300×縦400以上にしてください）' };
    out = await img.resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  } catch {
    return { ok: false, error: '画像として読めませんでした（JPEG・PNG・WebP にしてください）' };
  }
  const path = `${salonId}/therapist_placeholder_${Date.now()}.jpg`;
  const { error: upErr } = await svc.storage.from('salon-images').upload(path, out, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (upErr) return { ok: false, error: 'アップロードに失敗しました: ' + upErr.message };
  const url = svc.storage.from('salon-images').getPublicUrl(path).data.publicUrl;
  const { error } = await svc.from('salons').update({ therapist_placeholder_url: url }).eq('id', salonId);
  if (error) {
    await svc.storage.from('salon-images').remove([path]);
    return { ok: false, error: '保存に失敗しました: ' + error.message };
  }
  return { ok: true, data: { salonId, url } };
}

export async function deleteConecfPlaceholder(): Promise<Result<{ salonId: number }>> {
  const r = await resolveSalon({ write: true });
  if (!r.ok) return r;
  const { svc, salonId } = r.data;
  const { error } = await svc.from('salons').update({ therapist_placeholder_url: null }).eq('id', salonId);
  if (error) return { ok: false, error: '削除に失敗しました: ' + error.message };
  return { ok: true, data: { salonId } };
}
