'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';

// ★ 第496便: /cast お客様記録帳（セラピスト本人だけの手帳）。
// 表 cast_customer_logs は anon/authenticated を閉じてあるので、ここで
// ログイン中の user_id → therapists.id を確かめてから service_role で読み書きする（castImasugu と同じ流儀）。
// ★ お店（オーナー）・運営画面からは読まない。この表を他の画面で使わないこと。

export type CustomerLog = {
  id: number;
  servedAt: string;      // ISO
  name: string;
  visitCount: number | null; // 手入力の回数（null＝自動）
  shownCount: number;    // 画面に出す回数（手入力があればそれ、無ければ同じ名前を日時順に数えた番号）
  memo: string;
};

type Result<T> = { ok: true } & T | { ok: false; error: string };

const NAME_MAX = 40;
const MEMO_MAX = 200;
const FETCH_MAX = 5000;
const LIST_MAX = 200;

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

function clean(input: { servedAt: string; name: string; visitCount: string; memo: string }):
  { ok: true; row: { served_at: string; customer_name: string; visit_count: number | null; memo: string } } | { ok: false; error: string } {
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
  return { ok: true, row: { served_at: served, customer_name: name, visit_count: visit, memo } };
}

export async function listCustomerLogs(query: string): Promise<Result<{ logs: CustomerLog[]; total: number }>> {
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('cast_customer_logs')
    .select('id, served_at, customer_name, visit_count, memo')
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
    };
  });

  const q = nameKey(query);
  const hit = q ? all.filter((l) => nameKey(l.name).includes(q)) : all;
  hit.reverse(); // 新しい順
  return { ok: true, logs: hit.slice(0, LIST_MAX), total: hit.length };
}

export async function addCustomerLog(input: { servedAt: string; name: string; visitCount: string; memo: string }): Promise<Result<object>> {
  const tid = await myTherapistId();
  if (tid == null) return { ok: false, error: 'ログインし直してください' };
  const c = clean(input);
  if (!c.ok) return c;
  const svc = createServiceClient();
  const { error } = await svc.from('cast_customer_logs').insert({ ...c.row, therapist_id: tid });
  if (error) return { ok: false, error: '保存できませんでした' };
  return { ok: true };
}

export async function updateCustomerLog(id: number, input: { servedAt: string; name: string; visitCount: string; memo: string }): Promise<Result<object>> {
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
