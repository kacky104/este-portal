import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { toEsutamaTypeIds, explainBadgeMapping } from '@/lib/mediaBadgeMap';
import { parseBodyType } from '@/lib/bodyType';
// ★★★ 値の型は**中継側の正本**をそのまま使う（★ girlCreatePlan.ts・第257便と同じ判断。★ ここで別の形に緩めない）
import type { EsutamaCastCreateValues } from '@/lib/esutamaRequests';

// ── エステ魂へ「1人を登録する」ための材料を作る（第263便で1か所に寄せた）───────────
//
// ★★★ なぜ寄せたか … 駅ちかの girlCreatePlan.ts（第257便）と同じ理由。
//   第232便からこの組み立ては `/api/admin/media-cast-create`（★ 運営だけの curl の口）にあった。
//   ★ これから **店舗様の画面から**も同じことをする（設計メモ_セラピスト登録を店舗様の画面から §5 ⑥）。
//   ★★ 2か所に同じ組み立てを書くと、**片方だけ直したときに緩いほうから通る**（第255便(2) で踏んだ）。
//
// ★★ ここがすること … 【材料を作るだけ】
//   ① 店舗・セラピストを読んで、送れる相手かを確かめる
//   ② 送る値を組み立てる（名前・特徴・年齢・サイズ）
//   ③ 画面や記録に出す `plan` と、注意（warnings）を作る
//
// ★★★ ここがしないこと
//   ・**送らない**（★ `startRelayFlow` は呼ばない）。★ 誰の権限で送るかは呼び出し側が決める
//   ・認証（★ curl の口は CRON_SECRET・店舗様の画面は assertSalonOwner）
//   ・写真（★ エステ魂は登録の流れで写真を送らない・第232便。★ 写真は cast_photo の別の口・第243便）
//
// ★★★★ 【第263便】切り出しただけ。★ 振る舞い・`plan` の形・文言は route.ts にあったときと**一字一句同じ**。
//   ★ 変えたければ、切り出しが通った（試し打ちの JSON が一致した）**あと**に別の便で。

export type CastCreateInput = {
  salonId: number;
  therapistId: number;
  /** 掲載枠 */
  slot: number;
};

export type CastCreatePlan = {
  /** ★ 画面にも記録にも出せる形（★ 秘密は入れない） */
  plan: Record<string, unknown>;
  /** ★ 店舗様に見せる注意 */
  warnings: string[];
  /** ★ `startRelayFlow` にそのまま渡す材料 */
  relay: {
    castCreate: { therapistId: number; values: EsutamaCastCreateValues };
  };
};

export type CastCreatePlanResult =
  | { ok: true; data: CastCreatePlan }
  | { ok: false; status: number; error: string };

/**
 * 送る材料を作る。★ ここでは1人も作らない。
 *
 * @param svc  service client（★ 呼び出し側が作る。★ 認証は呼び出し側の責任）
 */
export async function buildCastCreatePlan(svc: SupabaseClient, input: CastCreateInput): Promise<CastCreatePlanResult> {
  const { salonId, therapistId, slot } = input;

  const { data: salon, error: sErr } = await svc
    .from('salons').select('id, name').eq('id', salonId).maybeSingle();
  if (sErr) return { ok: false, status: 500, error: sErr.message };
  if (!salon) return { ok: false, status: 404, error: '店舗が見つからない' };

  const { data: th, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, feature_badges, is_active')
    .eq('id', therapistId).maybeSingle();
  if (tErr) return { ok: false, status: 500, error: tErr.message };
  if (!th) return { ok: false, status: 404, error: 'セラピストが見つからない' };

  // ★★★ 他店の人を送らない。★ ここを外すと、店舗を取り違えて登録する事故になる
  if (Number((th as { salon_id?: number }).salon_id) !== salonId)
    return { ok: false, status: 400, error: 'そのセラピストはこの店舗の在籍ではありません' };

  // ★★★ すでに番号が結びついていたら積まない（★ 二重掲載を自分で作らない）
  const { data: link } = await svc
    .from('therapist_media_ids')
    .select('external_cast_id')
    .eq('provider', 'esutama').eq('slot', slot).eq('therapist_id', therapistId)
    .maybeSingle();
  const linkedCastId = link ? String((link as { external_cast_id?: string }).external_cast_id ?? '') : '';
  if (linkedCastId) {
    return {
      ok: false, status: 409,
      error: 'この方はすでにエステ魂の cast_id ' + linkedCastId + ' と結びついています。★ 登録しません',
    };
  }

  // ── 送る内容を組み立てる ─────────────────────────────────
  const name = String((th as { name?: string }).name ?? '').trim();
  if (!name) return { ok: false, status: 400, error: '名前が空のセラピストは送れません' };
  // ★★ 相手は10文字以内。★ **黙って切り詰めない**（切り詰めた名前で登録されると誰か分からなくなる）
  if ([...name].length > 10) {
    return {
      ok: false, status: 400,
      error: 'エステ魂の名前は10文字以内です（「' + name + '」は ' + [...name].length + '文字）。★ フクエス側の表示名を短くしてから送ってください',
    };
  }

  const badges = sanitizeBadges((th as { feature_badges?: unknown }).feature_badges);
  const typeIds = toEsutamaTypeIds(badges);
  const mapping = explainBadgeMapping(badges);

  const size = parseBodyType(String((th as { body_type?: string | null }).body_type ?? '') || null);
  const ageRaw = (th as { age?: number | null }).age;
  const age = ageRaw !== null && ageRaw !== undefined && /^\d{1,2}$/.test(String(ageRaw)) ? String(ageRaw) : null;
  const cupRaw = String(size?.cup ?? '').toUpperCase();
  const sizeCup = /^[A-L]$/.test(cupRaw) ? cupRaw : null;

  const values: EsutamaCastCreateValues = {
    name,
    typeIds,
    age,
    tall: size?.height ?? null,
    sizeB: size?.bust ?? null,
    sizeW: size?.waist ?? null,
    sizeH: size?.hip ?? null,
    sizeCup,
    // ★ フクエスに「スタイル」に当たる欄が無いので送らない（相手のフォームの既定＝未選択のまま）
    bodyStyle: null,
  };

  const warnings: string[] = [];
  // ★★★ 相手の画面の注記:「※3サイズのB(バスト)が未入力の場合、表示されません」（2026-09-09 実測）
  if (!values.sizeB) warnings.push('★ バスト(B)が空です。★ このまま登録すると **エステ魂の公開ページに出ません**');
  if (mapping.esutama.usedDefault) warnings.push('★ 送れる特徴が1つも無いので、既定の「新人」を入れます。★ エステ魂の新人は自動では消えません');
  if (mapping.esutama.overflowBadges.length > 0)
    warnings.push('★ 特徴は4つまでなので、' + mapping.esutama.overflowBadges.join('・') + ' は送りません');
  if ((th as { is_active?: boolean }).is_active === false)
    warnings.push('★ この方はフクエスでは非公開です。★ エステ魂には**即公開**で載ります');

  const plan: Record<string, unknown> = {
    salonId, salonName: String((salon as { name?: string }).name ?? ''),
    provider: 'esutama', slot, therapistId,
    values,
    badges,
    steps: ['login', 'esutama_cast_list（在籍確認）', 'esutama_cast_form（65部品を読む）', 'esutama_cast_create', 'esutama_cast_list（照合＋cast_id回収）'],
    notSent: ['写真（送り方が未調査）', 'set_up_limit（保存と同時に上位表示・残り回数あり）', 'キャッチ・紹介文'],
    warnings,
  };

  return {
    ok: true,
    data: {
      plan,
      warnings,
      relay: { castCreate: { therapistId, values } },
    },
  };
}
