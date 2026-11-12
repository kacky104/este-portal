'use server';

import { dbMessage } from '@/app/lib/crm/dbError';
import { businessDateNowJST } from '@/app/lib/crm/consentMatch';
import { CRM_MONEY_CATEGORIES, CRM_MONEY_DIRECTIONS, type CrmMoneyCategory, type CrmMoneyMove, type CrmMoneyBalance, type CrmMoneyDay } from '@/app/lib/crm/types';
import { assertCrm, validDate, readFail, emptyAgg, therapistNames, aggBalance, type MoneyTotal, moneyTotals } from '@/app/lib/crm/server/core';

function toMove(r: Record<string, unknown>, names: Map<number, string>): CrmMoneyMove {
  const tid = Number(r.therapist_id);
  return {
    id: Number(r.id),
    therapistId: tid,
    therapistName: names.get(tid) ?? '(不明)',
    date: String(r.business_date),
    direction: r.direction === 'to_therapist' ? 'to_therapist' : 'to_shop',
    category: (CRM_MONEY_CATEGORIES as readonly string[]).includes(String(r.category)) ? (r.category as CrmMoneyCategory) : 'other',
    amount: Number(r.amount) || 0,
    memo: String(r.memo ?? ''),
    createdAt: String(r.created_at),
    cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
  };
}

/** 金銭授受タブ：女子ごとの残高（通算）と、月の動き（ym は YYYY-MM） */
export async function getCrmMoney(
  salonId: number,
  ym: string,
): Promise<{ ok: true; balances: CrmMoneyBalance[]; moves: CrmMoneyMove[]; therapists: { id: number; name: string }[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: '月が不正です' };
  const svc = auth.svc;
  // ★ 第1221便（カッキーさん）: 残高は【今日の営業日まで】で数える（報酬確定の画面・締めの未精算の判定と同じ区切り）。
  //   前は区切りなしで、明日や来週の予約に報酬を入れた時点で残高が動いていた（画面どうしで数字が食い違う）。
  // ★ 第1226便: 残高は DB 側の関数で1人1行
  let names: Map<number, string>;
  let totals: Map<number, MoneyTotal>;
  try {
    [names, totals] = await Promise.all([therapistNames(svc, salonId), moneyTotals(svc, salonId, { untilDate: businessDateNowJST() })]);
  } catch (e) {
    return readFail(e); // ★ 2026-10-09 点検#10
  }
  const balances: CrmMoneyBalance[] = [];
  for (const [tid, tt] of totals) {
    const t = tt.total;
    balances.push({ therapistId: tid, name: names.get(tid) ?? '(不明)', ...t, balance: aggBalance(t) });
  }
  balances.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name, 'ja'));

  const [y, m] = ym.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const { data: mv, error: mvErr } = await svc.from('crm_money_moves')
    .select('id, therapist_id, business_date, direction, category, amount, memo, created_at, cancelled_at')
    .eq('salon_id', salonId).gte('business_date', `${ym}-01`).lt('business_date', next)
    .order('business_date', { ascending: false }).order('id', { ascending: false }).limit(1000);
  if (mvErr) return readFail(new Error(mvErr.message)); // ★ 2026-11-12 点検#9: 読めなかった回に「動きが無い」と出さない
  const { data: ts, error: tsErr } = await svc.from('therapists').select('id, name, is_active').eq('salon_id', salonId).order('id');
  if (tsErr) return readFail(new Error(tsErr.message));
  return {
    ok: true,
    balances,
    moves: (mv ?? []).map((r) => toMove(r, names)),
    // ★ 2026-10-09 点検#21: 非公開（is_active=false）の子も選べるように（残高が残っているのに精算を記録できなかった）。非公開は後ろに「（非公開）」付きで
    therapists: [...(ts ?? [])]
      .sort((a, b) => Number(a.is_active === false) - Number(b.is_active === false) || Number(a.id) - Number(b.id))
      .map((t) => ({ id: Number(t.id), name: String(t.name ?? '') + (t.is_active === false ? '（非公開）' : '') })),
  };
}

/** 報酬確定の画面の「精算」欄 */
export async function getCrmMoneyDay(
  salonId: number,
  therapistId: number,
  dateISO: string,
): Promise<{ ok: true; day: CrmMoneyDay } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO) || !Number.isInteger(therapistId)) return { ok: false, error: '指定が不正です' };
  const svc = auth.svc;
  // ★ 2026-10-09 点検#10: moneyTotals（rpc が無いときの fallback）が読めなかったら ok:false（例外のまま画面へ出さない）
  const totalsP = moneyTotals(svc, salonId, { therapistId, untilDate: dateISO, day: dateISO }) // ★ 第1226便
    .then((t) => ({ ok: true as const, t }))
    .catch((e: unknown) => ({ ok: false as const, e }));
  const [totalsR, namesR, { data: conf, error: confErr }, { data: mv, error: mvErr }] = await Promise.all([
    totalsP,
    therapistNames(svc, salonId).then((n) => ({ ok: true as const, n })).catch((e: unknown) => ({ ok: false as const, e })),
    svc.from('crm_pay_confirms').select('therapist_id').eq('salon_id', salonId).eq('therapist_id', therapistId).eq('business_date', dateISO).maybeSingle(),
    svc.from('crm_money_moves')
      .select('id, therapist_id, business_date, direction, category, amount, memo, created_at, cancelled_at')
      .eq('salon_id', salonId).eq('therapist_id', therapistId).eq('business_date', dateISO).order('id'),
  ]);
  if (!totalsR.ok) return readFail(totalsR.e);
  if (!namesR.ok) return readFail(namesR.e); // ★ 第1987便
  const names = namesR.n;
  // ★ 2026-11-12 点検#9: 確定の印・その日の動きを読めなかった回は止める（「未確定」「動きなし」と出さない）
  if (confErr) return readFail(new Error(confErr.message));
  if (mvErr) return readFail(new Error(mvErr.message));
  const totals = totalsR.t;
  const tt = totals.get(therapistId);
  const today = tt?.day ?? emptyAgg();
  // 前日までの残高 ＝ その日までの通算 − その日の分
  const prior = tt ? aggBalance(tt.total) - aggBalance(today) : 0;
  return {
    ok: true,
    day: {
      prior,
      received: today.received,
      pay: today.pay,
      payConfirmed: !!conf,
      moves: (mv ?? []).map((r) => toMove(r, names)),
      balance: prior + aggBalance(today),
    },
  };
}

/** お金の動きを1件足す */
export async function addCrmMoneyMove(
  salonId: number,
  input: { therapistId: number; date: string; direction: string; category: string; amount: number; memo: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const tid = Number(input.therapistId);
  if (!Number.isInteger(tid) || tid <= 0) return { ok: false, error: '女子を選んでください' };
  if (!validDate(String(input.date))) return { ok: false, error: '日付が不正です' };
  if (!(CRM_MONEY_DIRECTIONS as readonly string[]).includes(String(input.direction))) return { ok: false, error: '渡す向きが不正です' };
  if (!(CRM_MONEY_CATEGORIES as readonly string[]).includes(String(input.category))) return { ok: false, error: '種別が不正です' };
  const amount = Math.round(Number(input.amount) || 0);
  if (amount < 1 || amount > 10000000) return { ok: false, error: '金額は1円以上で入れてください' };
  const { data: t } = await auth.svc.from('therapists').select('salon_id').eq('id', tid).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'このお店の女子ではありません' };
  // ★ 第1225便（カッキーさん）: 二重送信よけ。同じセラピスト・同じ日・同じ向き・同じ種別・同じ金額の取り消していない記録が
  //   直近10秒以内にあれば入れない（画面の busy が効く前の二度押し・反応が遅いときの押し直し）。本当に2回なら10秒待てば入る。
  const { data: dup, error: dupErr } = await auth.svc.from('crm_money_moves').select('id')
    .eq('salon_id', salonId).eq('therapist_id', tid).eq('business_date', input.date)
    .eq('direction', input.direction).eq('category', input.category).eq('amount', amount)
    .is('cancelled_at', null)
    .gte('created_at', new Date(Date.now() - 10_000).toISOString())
    .limit(1);
  if (dupErr) return { ok: false, error: dbMessage(dupErr) };
  if (dup && dup.length > 0) return { ok: false, error: '同じ内容を数秒前に記録しています（二重でなければ、少し待ってからもう一度）' };
  const { error } = await auth.svc.from('crm_money_moves').insert({
    salon_id: salonId,
    therapist_id: tid,
    business_date: input.date,
    direction: input.direction,
    category: input.category,
    amount,
    memo: String(input.memo ?? '').trim().slice(0, 200),
    created_by: auth.userId,
  });
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

/** お金の動きを取り消す（消さずに取り消した時刻を入れる） */
export async function cancelCrmMoneyMove(
  salonId: number,
  moveId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc.from('crm_money_moves')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('salon_id', salonId).eq('id', moveId).is('cancelled_at', null).select('id');
  if (error) return { ok: false, error: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: '見つからないか、もう取り消してあります' };
  return { ok: true };
}
