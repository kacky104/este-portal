'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';

// ★ 第498便: /cast 報酬帳（セラピスト本人だけ）。
// 表 cast_earnings は anon/authenticated を閉じてあるので、ここで
// ログイン中の user_id → therapists.id を確かめてから service_role で読み書きする（castCustomers と同じ流儀）。
// ★ お店（オーナー）・運営画面からは読まない。

export type EarningRow = { amount: number; memo: string };
type Result<T> = { ok: true } & T | { ok: false; error: string };

const ROW_MAX = 50;
const AMOUNT_MAX = 9999999;
const MEMO_MAX = 60;

function isDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

async function myTherapistId(): Promise<number | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const { data } = await svc.from('therapists').select('id').eq('user_id', user.id).maybeSingle();
  return data?.id != null ? Number(data.id) : null;
}

export async function getEarningsDay(date: string): Promise<Result<{ rows: EarningRow[] }>> {
  if (!isDate(date)) return { ok: false, error: '日付が正しくありません' };
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('cast_earnings')
    .select('position, amount, memo')
    .eq('therapist_id', tid)
    .eq('work_date', date)
    .order('position', { ascending: true });
  if (error) return { ok: false, error: '報酬帳を読めませんでした（準備中の可能性があります）' };
  return { ok: true, rows: (data ?? []).map((r) => ({ amount: Number(r.amount), memo: String(r.memo ?? '') })) };
}

// その日の分をまとめて保存（1人目から順に position を振り直す）。★ 先に上書き、あとで余った番号を消す（途中で失敗しても消えすぎない順）
export async function saveEarningsDay(date: string, rows: EarningRow[]): Promise<Result<object>> {
  if (!isDate(date)) return { ok: false, error: '日付が正しくありません' };
  if (!Array.isArray(rows) || rows.length > ROW_MAX) return { ok: false, error: `1日${ROW_MAX}人までです` };
  for (const r of rows) {
    if (!Number.isInteger(r.amount) || r.amount < 0 || r.amount > AMOUNT_MAX) return { ok: false, error: '金額は0〜9,999,999円で入れてください' };
    if (typeof r.memo !== 'string' || r.memo.trim().length > MEMO_MAX) return { ok: false, error: `メモは${MEMO_MAX}字までです` };
  }
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const svc = createServiceClient();
  const now = new Date().toISOString();
  if (rows.length > 0) {
    const { error } = await svc.from('cast_earnings').upsert(
      rows.map((r, i) => ({ therapist_id: tid, work_date: date, position: i + 1, amount: r.amount, memo: r.memo.trim(), updated_at: now })),
      { onConflict: 'therapist_id,work_date,position' },
    );
    if (error) return { ok: false, error: '保存できませんでした' };
  }
  const { error: delErr } = await svc
    .from('cast_earnings')
    .delete()
    .eq('therapist_id', tid)
    .eq('work_date', date)
    .gt('position', rows.length);
  if (delErr) return { ok: false, error: '保存できませんでした' };
  return { ok: true };
}

// 月のカレンダー用：日ごとの合計と人数。ym は "YYYY-MM"
export async function getEarningsMonth(ym: string): Promise<Result<{ days: Record<string, { total: number; count: number }> }>> {
  if (!/^\d{4}-\d{2}$/.test(ym) || !isDate(`${ym}-01`)) return { ok: false, error: '月が正しくありません' };
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('cast_earnings')
    .select('work_date, amount')
    .eq('therapist_id', tid)
    .gte('work_date', `${ym}-01`)
    .lt('work_date', next)
    .limit(5000);
  if (error) return { ok: false, error: '報酬帳を読めませんでした（準備中の可能性があります）' };
  const days: Record<string, { total: number; count: number }> = {};
  for (const r of data ?? []) {
    const k = String(r.work_date).slice(0, 10);
    const d = days[k] ?? { total: 0, count: 0 };
    d.total += Number(r.amount) || 0;
    d.count += 1;
    days[k] = d;
  }
  return { ok: true, days };
}
