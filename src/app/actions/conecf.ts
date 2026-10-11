'use server';

import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { createServiceClient } from '@/app/lib/supabase/service';
import { setMediaLinkMode } from '@/app/actions/mediaCredentials';
import { providerLabel } from '@/lib/mediaAudit';
import { computeMediaLinkAlerts } from '@/app/lib/media/linkAlerts';
import { hasEkichikaLogin } from '@/app/lib/conecf/cocoaPost';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isSetPlanActive, SET_PLAN_NEED_MESSAGE } from '@/lib/setPlan';
import { startDiaryMixedOnSwitch } from '@/app/lib/conecf/diaryMixed';
import { cookies } from 'next/headers';
import { operatorActingSalonId } from '@/app/lib/conecf/actingSalon';
import { CONECF_ACT_COOKIE } from '@/lib/conecfActing';

// コネックエフ（conecf.com）の入口の権限（第395便・1a・2026-09-17）。
//
// ★ 誰が入れるか：店舗オーナー（salons.owner_id = 自分）と運営（ADMIN_UUID）だけ。
// ★ 判定はサーバーで行う。★ 画面は結果に従って「ログイン」「店舗なし」「中身」を出し分けるだけ。
// ★ 店舗の選び方は /mypage/media（useMediaGate）と同じ：非表示でない店を先に、id の若い順で1件。
//   ★ 複数店舗の切り替えは第1弾では作らない。
// ★★ 書くのは enableConecf（切り替え）だけ。★ 第1265便: 切り替えたとき、写メ日記の移行期間（30日）も一緒に始める。
// ★★ 第1241便（2026-10-06・カッキーさん）: コネックエフはフクエスCRM とのセット販売（月額22,000円・税込）になった。
//   ・contract ＝ セットを契約しているか（salons.crm_until・lib/setPlan.ts）。運営が /admin で ON にした店だけ true。
//   ・契約していない店は、入って見ることはできるが「コネックエフに切り替える」を押せない（enableConecf がサーバーで止める）。
//   ・第1243便: 切り替え済みでセットの契約が無い店は「止めている店」（保存・取り込み・各サイトへの送信を止める。lib/conecf/contract.ts）。
// ★★★ 第1399便（2026-10-11・カッキーさん）: 運営アカウントは、店を選んで、その店のコネックエフを開ける（保存・送信まで）。
//   ・選んだ店は cookie（lib/conecfActing.ts）。★ 運営アカウントでログインしているときにしか読まない。
//   ・acting ＝ 運営が【ほかの人の店】を操作中（画面のいちばん上に帯を出す・同意の代行を止める）。
//   ・切り替え前・契約なし・止めている店の決まりは、運営が入っても同じ（その店の状態のまま）。

export type ConecfAccess =
  | { ok: true; role: 'owner' | 'operator'; email: string; salonId: number | null; salonName: string; enabledAt: string | null; contract: boolean; /** ★ 第1399便: 運営が、ほかの人の店を操作中 */ acting: boolean }
  | { ok: false; reason: 'login' }
  | { ok: false; reason: 'no_salon'; email: string };

export async function getConecfAccess(): Promise<ConecfAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'login' };

  const email = user.email ?? '';

  // ★★★ 第1399便: 運営が店を選んでいるときは、その店を開く（運営アカウント以外は actingId が必ず null）。
  //   ★ 持ち主でない店を読むので service_role。選んだ店が見つからないときは「選んでいない」に戻す（下の、運営の店なしと同じ形）。
  const actingId = await operatorActingSalonId(user.id);
  if (actingId != null) {
    const svc = createServiceClient();
    const { data: picked } = await svc
      .from('salons')
      .select('id, name, owner_id, conecf_enabled_at, crm_until')
      .eq('id', actingId)
      .maybeSingle();
    if (picked) {
      return {
        ok: true,
        role: 'operator',
        email,
        salonId: Number(picked.id),
        salonName: (picked.name as string | null) ?? '',
        enabledAt: (picked.conecf_enabled_at as string | null) ?? null,
        contract: isSetPlanActive((picked.crm_until as string | null) ?? null, getCalendarDateJST()),
        acting: ((picked.owner_id as string | null) ?? null) !== user.id,
      };
    }
    return { ok: true, role: 'operator', email, salonId: null, salonName: '', enabledAt: null, contract: true, acting: false };
  }

  const { data: salon } = await supabase
    .from('salons')
    .select('id, name, conecf_enabled_at, crm_until')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (salon) {
    return {
      ok: true,
      role: user.id === ADMIN_UUID ? 'operator' : 'owner',
      email,
      salonId: Number(salon.id),
      salonName: (salon.name as string | null) ?? '',
      enabledAt: (salon.conecf_enabled_at as string | null) ?? null,
      contract: isSetPlanActive((salon.crm_until as string | null) ?? null, getCalendarDateJST()),
      acting: false,
    };
  }

  // ★ 運営は店舗を持っていなくても入れる（★ 中身の画面は、店舗を選べるようになるまで空）
  if (user.id === ADMIN_UUID) {
    return { ok: true, role: 'operator', email, salonId: null, salonName: '', enabledAt: null, contract: true, acting: false };
  }

  return { ok: false, reason: 'no_salon', email };
}

// ── 第1399便: 運営が店を選ぶ ─────────────────────────────────────────

export type ConecfOperatorSalon = { id: number; name: string; hidden: boolean; switched: boolean; contract: boolean };

/** 運営アカウントか。★ ログインしていない・運営でないときは null */
async function operatorUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user && user.id === ADMIN_UUID ? user.id : null;
}

/** 店を選ぶ一覧（運営だけ）。★ 非表示の店も出す（準備中の店の設定を手伝うことがある）。id の若い順 */
export async function listConecfOperatorSalons(): Promise<{ ok: true; data: ConecfOperatorSalon[] } | { ok: false; error: string }> {
  if (!(await operatorUserId())) return { ok: false, error: '運営アカウントでログインしてください' };
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salons')
    .select('id, name, is_hidden, conecf_enabled_at, crm_until')
    .order('id', { ascending: true })
    .limit(1000);
  if (error) return { ok: false, error: error.message };
  const today = getCalendarDateJST();
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: Number(r.id),
      name: (r.name as string | null) ?? '',
      hidden: r.is_hidden === true,
      switched: !!r.conecf_enabled_at,
      contract: isSetPlanActive((r.crm_until as string | null) ?? null, today),
    })),
  };
}

/**
 * ★★★ 運営が「この店として操作する」を選ぶ／やめる（salonId: null）。
 *   ・運営アカウントだけ。ほかの人が呼んでも何も起きない（cookie も付けない）。
 *   ・選んだ店が本当にあるかを確かめてから cookie に入れる。
 *   ・cookie は httpOnly（画面の JavaScript からは読めない・書けない）。
 *   ・★ 期限は付けない（ブラウザを閉じるか「やめる」まで）。画面を開いたまま期限が来て、画面とサーバーの店が食い違うのを避ける。
 */
export async function setConecfActingSalon(input: { salonId: number | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await operatorUserId())) return { ok: false, error: '運営アカウントでログインしてください' };
  const store = await cookies();
  if (input.salonId == null) {
    store.delete(CONECF_ACT_COOKIE);
    return { ok: true };
  }
  const salonId = Math.trunc(Number(input.salonId));
  if (!Number.isSafeInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗の指定が不正です' };
  const svc = createServiceClient();
  const { data: salon, error } = await svc.from('salons').select('id').eq('id', salonId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!salon) return { ok: false, error: '店舗が見つかりません' };
  store.set(CONECF_ACT_COOKIE, String(salonId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return { ok: true };
}

/**
 * ★★ 外枠（ConecfShell）が最初に要るものを【1回】で返す（第1117便・2026-10-03）。
 *
 * ★ もとは画面が3本の server action を別々に呼んでいた:
 *   getConecfAccess（ログイン＋店）／getMediaLinkAlerts（ログイン＋店＋4〜5本）／getConecfCocoaNavVisible（ログイン＋店＋2本）
 *   → ログインの確認と店の読みが毎ページ3回ずつ重なっていた。★ ここでは1回にして、残りを同時に出す。
 * ★ 権限は getConecfAccess がそのまま決める（★ 店が取れた＝自分の店。赤帯の計算は権限確認を二重にしない）。
 * ★ 店が無いとき（運営の店なし・未ログイン）は赤帯なし・ココア非表示（★ 今までどおり）。
 * ★ ココアの出し分け: 駅ちかの ID・PASS がある店、または自動投稿がオンの店（第474便）。
 *   ★ 読めなければ出す（★ 止める道を隠さない）。★ 赤帯は読めなければ空（★ 画面は止めない）。
 */
export type ConecfShellState = { access: ConecfAccess; alerts: MediaLinkAlert[]; cocoaNav: boolean };

export async function getConecfShellState(): Promise<ConecfShellState> {
  const access = await getConecfAccess();
  if (!access.ok || access.salonId == null) return { access, alerts: [], cocoaNav: false };
  const svc = createServiceClient();
  const salonId = access.salonId;
  const [alerts, cocoaNav] = await Promise.all([
    computeMediaLinkAlerts(svc, salonId).then((r) => (r.ok ? r.data : [])).catch(() => [] as MediaLinkAlert[]),
    (async () => {
      try {
        if (await hasEkichikaLogin(svc, salonId)) return true;
        const { data: st } = await svc.from('conecf_cocoa_settings').select('enabled').eq('salon_id', salonId).maybeSingle();
        return st?.enabled === true;
      } catch {
        return true;
      }
    })(),
  ]);
  return { access, alerts, cocoaNav };
}

/**
 * ★★ 「コネックエフに切り替える」（第399便・カッキーさんの決定）。
 * ★ 店舗様が自分で押す。★ 押すと salons.conecf_enabled_at に今の時刻が入り、
 *   セラピストの追加・写真・年齢・サイズ・公開・出勤を /mypage で直せなくなる（案B）。
 * ★ 戻すのは運営だけ（★ 行ったり来たりの事故を避ける）。★ ここでは戻す口を作らない。
 * ★ すでに入っていれば何もしない（★ 日付を上書きしない）。
 */
export async function enableConecf(input: { stopRead?: boolean } = {}): Promise<
  | { ok: true; enabledAt: string }
  | { ok: false; error: string; readingSites?: string[] }
> {
  const a = await getConecfAccess();
  if (!a.ok) return { ok: false, error: 'ログインが必要です' };
  if (a.salonId == null) return { ok: false, error: '店舗が選ばれていません' };
  if (a.enabledAt) return { ok: true, enabledAt: a.enabledAt };
  // ★ 第1241便: セット（コネックエフ＋フクエスCRM）を契約していない店は切り替えられない。
  //   ★ 第1243便: 運営の店も同じ（切り替えたあと契約が無いと「止めている店」になるため。試すときは /admin でセットを ON にしてから）
  if (!a.contract) return { ok: false, error: SET_PLAN_NEED_MESSAGE };
  const svc = createServiceClient();

  // ★★ 第400便: 「駅ちかから反映」が残っていたら、先に止める（★ 取り込みがコネックエフの出勤を上書きするため）。
  //   ★ 黙って止めない。★ 画面に聞いてから（stopRead: true）止める。★ 止めるのは向きを 'none' にするだけ（ID・PASSは残る）。
  const { data: reading, error: rErr } = await svc
    .from('salon_import_sources')
    .select('provider, slot')
    .eq('salon_id', a.salonId)
    .eq('link_mode', 'read');
  if (rErr) return { ok: false, error: rErr.message };
  if ((reading ?? []).length > 0) {
    const names = [...new Set((reading ?? []).map((r) => providerLabel(String(r.provider))))];
    if (input.stopRead !== true) {
      return { ok: false, error: `いま ${names.join('・')} から反映しています`, readingSites: names };
    }
    for (const r of reading ?? []) {
      const res = await setMediaLinkMode({ salonId: a.salonId, provider: String(r.provider), slot: Number(r.slot ?? 1), mode: 'none' });
      if (!res.ok) return { ok: false, error: `${providerLabel(String(r.provider))}からの反映を止められませんでした: ${res.error}` };
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await svc
    .from('salons')
    .update({ conecf_enabled_at: now })
    .eq('id', a.salonId)
    .is('conecf_enabled_at', null)
    .select('conecf_enabled_at')
    .maybeSingle();
  if (error) return { ok: false, error: `切り替えに失敗しました: ${error.message}` };
  // ★★ 第1265便（2026-10-07・カッキーさんの決定）: 切り替えた店は、写メ日記の移行期間（30日）を始める。
  //   期間中は、セラピストがフクエスで1度投稿するまで、駅ちかに書いた写メ日記もフクエスに取り込む（lib/diaryMixedPeriod.ts）。
  //   ★ いまの呼び出しで切り替わったときだけ（data がある＝この update が印を入れた）。すでに切り替え済みの店は上で返っている。
  //   ★ 失敗しても切り替えは成立させる（中で連携の記録に「設定できませんでした」を残す。写メ日記転送の画面から始められる）。
  if (data) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await startDiaryMixedOnSwitch(svc, a.salonId, 'shop:' + (user?.id ?? 'unknown'));
  }
  return { ok: true, enabledAt: (data?.conecf_enabled_at as string | null) ?? now };
}
