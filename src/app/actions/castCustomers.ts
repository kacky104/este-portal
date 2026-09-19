'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { businessDateJSTFrom, DAY_START_HOUR } from '@/lib/dutyStatus';

// ★ 第496便: /cast お客様記録帳（セラピスト本人だけの手帳）。
// 表 cast_customer_logs は anon/authenticated を閉じてあるので、ここで
// ログイン中の user_id → therapists.id を確かめてから service_role で読み書きする（castImasugu と同じ流儀）。
// ★ お店（オーナー）・運営画面からは読まない。この表を他の画面で使わないこと。
// ★ 第518便: お客様記録帳と報酬帳を「記録帳」にまとめた。1行にコース金額（amount・空欄可）を持たせ、
//   今日の報酬・カレンダーの日ごとの合計は、この金額を営業日（朝6時区切り）で足して出す。
//   旧報酬帳（cast_earnings）の分も合計には足す（新しい入力は記録帳だけ）。

export type CustomerLog = {
  id: number;
  servedAt: string;      // ISO
  name: string;
  visitCount: number | null; // 手入力の回数（null＝自動）
  shownCount: number;    // 画面に出す回数（手入力があればそれ、無ければ同じ名前を日時順に数えた番号）
  memo: string;
  amount: number | null; // コース金額（円・空欄は null）
  businessDate: string;  // 営業日（朝6時区切り・YYYY-MM-DD）
};

export type LogInput = { servedAt: string; name: string; visitCount: string; memo: string; amount: string };
export type DaySum = { total: number; count: number; oldTotal: number };

type Result<T> = { ok: true } & T | { ok: false; error: string };

const NAME_MAX = 40;
const MEMO_MAX = 200;
const FETCH_MAX = 5000;
const LIST_MAX = 200;
const AMOUNT_MAX = 9999999;

// 名前の比べ方：全角半角をそろえ、空白を無くし、小文字にする（「田中 さん」と「田中さん」を同じ人に数える）。
function nameKey(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

// "YYYY-MM-DDTHH:mm"（日本時間）→ ISO。★ ずれない様に +09:00 を付けて読む
function jstLocalToIso(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function myTherapistId(): Promise<number | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const { data } = await svc.from('therapists').select('id').eq('user_id', user.id).maybeSingle();
  return data?.id != null ? Number(data.id) : null;
}

function clean(input: LogInput):
  { ok: true; row: { served_at: string; customer_name: string; visit_count: number | null; memo: string; amount: number | null } } | { ok: false; error: string } {
  const served = jstLocalToIso(input.servedAt);
  if (!served) return { ok: false, error: '日時を入れてください' };
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: '名前を入れてください' };
  if (name.length > NAME_MAX) return { ok: false, error: `名前は${NAME_MAX}字までです` };
  const memo = input.memo.trim();
  if (memo.length > MEMO_MAX) return { ok: false, error: `メモは${MEMO_MAX}字までです` };
  let visit: number | null = null;
  const vc = input.visitCount.normalize('NFKC').trim();
  if (vc) {
    if (!/^\d{1,4}$/.test(vc) || Number(vc) < 1) return { ok: false, error: '回数は1〜9999の数字で入れてください' };
    visit = Number(vc);
  }
  let amount: number | null = null;
  const am = String(input.amount ?? '').normalize('NFKC').replace(/[,\s¥円]/g, '');
  if (am) {
    if (!/^\d{1,7}$/.test(am) || Number(am) > AMOUNT_MAX) return { ok: false, error: '金額は0〜9,999,999円の数字で入れてください' };
    amount = Number(am);
  }
  return { ok: true, row: { served_at: served, customer_name: name, visit_count: visit, memo, amount } };
}

// query: 名前の部分一致（空は全部）／day: 営業日 YYYY-MM-DD で絞る（空は全部）
export async function listCustomerLogs(query: string, day = ''): Promise<Result<{ logs: CustomerLog[]; total: number }>> {
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('cast_customer_logs')
    .select('id, served_at, customer_name, visit_count, memo, amount')
    .eq('therapist_id', tid)
    .order('served_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(FETCH_MAX);
  if (error) return { ok: false, error: '記録帳を読めませんでした（準備中の可能性があります）' };

  // 回数：同じ名前を日時の古い順に数える。★ 手入力の回数がある行はその数字にし、以降はそこから続けて数える
  const counter = new Map<string, number>();
  const all: CustomerLog[] = (data ?? []).map((r) => {
    const name = String(r.customer_name ?? '');
    const key = nameKey(name);
    const manual = r.visit_count != null ? Number(r.visit_count) : null;
    const shown = manual ?? (counter.get(key) ?? 0) + 1;
    counter.set(key, shown);
    return {
      id: Number(r.id),
      servedAt: String(r.served_at),
      name,
      visitCount: manual,
      shownCount: shown,
      memo: String(r.memo ?? ''),
      amount: r.amount != null ? Number(r.amount) : null,
      businessDate: businessDateJSTFrom(new Date(String(r.served_at)).getTime()),
    };
  });

  const q = nameKey(query);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
  const hit = all.filter((l) => (!q || nameKey(l.name).includes(q)) && (!d || l.businessDate === d));
  hit.reverse(); // 新しい順
  return { ok: true, logs: hit.slice(0, LIST_MAX), total: hit.length };
}

export async function addCustomerLog(input: LogInput): Promise<Result<object>> {
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const c = clean(input);
  if (!c.ok) return c;
  const svc = createServiceClient();
  const { error } = await svc.from('cast_customer_logs').insert({ ...c.row, therapist_id: tid });
  if (error) return { ok: false, error: '保存できませんでした' };
  return { ok: true };
}

export async function updateCustomerLog(id: number, input: LogInput): Promise<Result<object>> {
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const c = clean(input);
  if (!c.ok) return c;
  const svc = createServiceClient();
  // ★ 本人の行だけ（therapist_id も条件に入れる）
  const { error } = await svc
    .from('cast_customer_logs')
    .update({ ...c.row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('therapist_id', tid);
  if (error) return { ok: false, error: '保存できませんでした' };
  return { ok: true };
}

export async function deleteCustomerLog(id: number): Promise<Result<object>> {
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const svc = createServiceClient();
  const { error } = await svc.from('cast_customer_logs').delete().eq('id', id).eq('therapist_id', tid);
  if (error) return { ok: false, error: '消せませんでした' };
  return { ok: true };
}

// ★ 第518便: 月の日ごとの報酬（営業日ごと）。ym は "YYYY-MM"。
//   total ＝ 記録帳のコース金額＋旧報酬帳（cast_earnings）の金額。count ＝ 記録帳の件数＋旧報酬帳の人数。oldTotal ＝ 旧報酬帳の分だけ。
//   ★ 営業日は朝6時区切りなので、served_at は「月初の朝6時 〜 翌月初の朝6時（JST）」で引く。
export async function getRecordMonth(ym: string): Promise<Result<{ days: Record<string, DaySum> }>> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return { ok: false, error: '月が正しくありません' };
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const [y, m] = ym.split('-').map(Number);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const hh = String(DAY_START_HOUR).padStart(2, '0');
  const from = new Date(`${ym}-01T${hh}:00:00+09:00`).toISOString();
  const to = new Date(`${nextYm}-01T${hh}:00:00+09:00`).toISOString();
  const svc = createServiceClient();

  const [logsRes, oldRes] = await Promise.all([
    svc.from('cast_customer_logs').select('served_at, amount').eq('therapist_id', tid).gte('served_at', from).lt('served_at', to).limit(FETCH_MAX),
    svc.from('cast_earnings').select('work_date, amount').eq('therapist_id', tid).gte('work_date', `${ym}-01`).lt('work_date', `${nextYm}-01`).limit(FETCH_MAX),
  ]);
  if (logsRes.error) return { ok: false, error: '記録帳を読めませんでした（準備中の可能性があります）' };

  const days: Record<string, DaySum> = {};
  const bump = (k: string, amount: number, old: boolean) => {
    const d = days[k] ?? { total: 0, count: 0, oldTotal: 0 };
    d.total += amount;
    d.count += 1;
    if (old) d.oldTotal += amount;
    days[k] = d;
  };
  for (const r of logsRes.data ?? []) {
    bump(businessDateJSTFrom(new Date(String(r.served_at)).getTime()), r.amount != null ? Number(r.amount) || 0 : 0, false);
  }
  // ★ 旧報酬帳は読めなくても記録帳の分は出す（表が無い・権限が無いときは足さないだけ）
  for (const r of oldRes.error ? [] : oldRes.data ?? []) {
    bump(String(r.work_date).slice(0, 10), Number(r.amount) || 0, true);
  }
  return { ok: true, days };
}
