'use server';

import { type Svc, assertCrm, readFail } from '@/app/lib/crm/server/core';

// ── 顧客の取り込み（第566便・2026-09-20）──────────────────
// ★ スマホの連絡先（.vcf）・CSV から読んだ「名前・電話番号」を台帳に入れる（読むのはブラウザ・lib/crm/importParse.ts）。
// ★ 電話番号で名寄せする：もう台帳にいる番号の人は新しく作らない（名前が空なら名前だけ入れる・足りない番号を足す）。
// ★ 電話番号が無い（形が違う）行は取り込まない（名寄せできないため）。

const IMPORT_MAX = 3000;
export type CrmImportStatus = 'new' | 'exists' | 'dup' | 'invalid';
export type CrmImportPreviewRow = { name: string; phones: string[]; status: CrmImportStatus; existingName: string };

function cleanImportRows(rows: { name: string; phones: string[] }[]) {
  return (rows ?? []).slice(0, IMPORT_MAX).map((r) => ({
    name: String(r?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    phones: [...new Set((Array.isArray(r?.phones) ? r.phones : []).map((p) => String(p).replace(/[^0-9]/g, '')).filter((p) => /^\d{10,13}$/.test(p)))].slice(0, 5),
  }));
}

async function phoneOwners(svc: Svc, salonId: number, phones: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const uniq = [...new Set(phones)];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await svc.from('salon_customer_phones').select('phone, customer_id').eq('salon_id', salonId).in('phone', uniq.slice(i, i + 300));
    // ★ 2026-11-12 点検#3: 読めなかったら投げる。前は「台帳に誰もいない」と受け取って全員を新規にし、
    //   名前だけ作ったあと電話番号が重複で入らず、電話番号の無い同じ名前のお客様がまとめてできる道があった
    if (error) throw new Error(error.message);
    (data ?? []).forEach((d) => out.set(String(d.phone), Number(d.customer_id)));
  }
  return out;
}

async function classifyImport(svc: Svc, salonId: number, rows: { name: string; phones: string[] }[]) {
  const owners = await phoneOwners(svc, salonId, rows.flatMap((r) => r.phones));
  return classifyImportUsing(svc, salonId, rows, owners);
}
async function classifyImportUsing(svc: Svc, salonId: number, rows: { name: string; phones: string[] }[], owners: Map<string, number>) {
  const ids = [...new Set([...owners.values()])];
  const names = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await svc.from('salon_customers').select('id, name').eq('salon_id', salonId).in('id', ids.slice(i, i + 300));
    if (error) throw new Error(error.message); // ★ 点検#3: 名前を読めなかった回に「名前が空の人」と決めつけて上書きしない
    (data ?? []).forEach((c) => names.set(Number(c.id), String(c.name ?? '')));
  }
  const seen = new Set<string>();
  return rows.map((r) => {
    let status: CrmImportStatus = 'new';
    let existingId: number | null = null;
    if (r.phones.length === 0) status = 'invalid';
    else if (r.phones.some((p) => seen.has(p))) status = 'dup';
    else {
      const hit = r.phones.find((p) => owners.has(p));
      if (hit) { status = 'exists'; existingId = owners.get(hit)!; }
    }
    r.phones.forEach((p) => seen.add(p));
    return { ...r, status, existingId, existingName: existingId != null ? names.get(existingId) ?? '' : '' };
  });
}
/** ★ 2026-10-09 点検#25: 取り込みで「番号の持ち主」をもう一度読まないよう、判定と一緒に返す */
async function classifyImportWithOwners(svc: Svc, salonId: number, rows: { name: string; phones: string[] }[]) {
  const owners = await phoneOwners(svc, salonId, rows.flatMap((r) => r.phones));
  return { owners, rows: await classifyImportUsing(svc, salonId, rows, owners) };
}

/** 取り込む前の確認（新規／もう台帳にいる／ファイルの中で重複／番号なし） */
export async function previewCrmImport(
  salonId: number,
  rows: { name: string; phones: string[] }[],
): Promise<{ ok: true; rows: CrmImportPreviewRow[]; truncated: boolean } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const clean = cleanImportRows(rows);
  let res: Awaited<ReturnType<typeof classifyImport>>;
  try { res = await classifyImport(auth.svc, salonId, clean); } catch (e) { return readFail(e); } // ★ 点検#3
  return {
    ok: true,
    truncated: (rows ?? []).length > IMPORT_MAX,
    rows: res.map((r) => ({ name: r.name, phones: r.phones, status: r.status, existingName: r.existingName })),
  };
}

/** 取り込む（画面でチェックが入っている行だけ送る） */
export async function importCrmCustomers(
  salonId: number,
  rows: { name: string; phones: string[] }[],
): Promise<{ ok: true; created: number; updated: number; skipped: number } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  // ★ 点検#3: 台帳を読めなかった回は、1人も作らずに止める
  let classified: Awaited<ReturnType<typeof classifyImportWithOwners>>;
  try { classified = await classifyImportWithOwners(svc, salonId, cleanImportRows(rows)); } catch (e) { return readFail(e); }
  const { owners, rows: res } = classified;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // 新規：まとめて作る（200人ずつ）
  const news = res.filter((r) => r.status === 'new');
  for (let i = 0; i < news.length; i += 200) {
    const chunk = news.slice(i, i + 200);
    const now = new Date().toISOString();
    const { data, error } = await svc.from('salon_customers')
      .insert(chunk.map((r) => ({ salon_id: salonId, name: r.name, updated_at: now })))
      .select('id');
    if (error || !data || data.length !== chunk.length) { if (error) console.error('[crm] 取り込みが途中で止まった', salonId, error.message); return { ok: false, error: `取り込みの途中で止まりました（${created}人まで登録済み）。もう一度取り込むと、続きから入ります` }; }
    const phoneRows = chunk.flatMap((r, k) => r.phones.map((phone) => ({ customer_id: Number(data[k].id), salon_id: salonId, phone })));
    const { error: pErr } = await svc.from('salon_customer_phones').insert(phoneRows);
    if (pErr) {
      // まとめて入らなければ1件ずつ（その間に同じ番号が登録された等）
      // ★ 点検#3: 1つも番号が入らなかった人は、作った行を消す（電話番号の無いお客様を残さない＝次の電話で台帳に当たらない）
      const okIds = new Set<number>();
      for (const p of phoneRows) {
        const { error: oneErr } = await svc.from('salon_customer_phones').insert(p);
        if (!oneErr) okIds.add(p.customer_id);
      }
      const orphan = data.map((d) => Number(d.id)).filter((id) => !okIds.has(id));
      if (orphan.length > 0) {
        const { error: oErr } = await svc.from('salon_customers').delete().eq('salon_id', salonId).in('id', orphan);
        if (oErr) console.error('[crm] 取り込み: 番号の入らなかった行を消せなかった', salonId, orphan.length, oErr.message);
      }
      created += chunk.length - orphan.length;
      skipped += orphan.length;
    } else {
      created += chunk.length;
    }
  }

  // もう台帳にいる人：名前が空なら入れる・足りない番号を足す（5件まで）
  // ★ 2026-10-09 点検#25: 前は1人ごとに 名前の update・番号の select・持ち主の select・insert（最大4往復）＝3,000人で数千往復になり、
  //   Vercel の実行時間で切れると途中まで入って返事が無かった。→ いまの番号を300人ずつまとめて読み、持ち主は判定のときの owners を使い、
  //   足す番号は200件ずつまとめて insert。名前の update だけ（名前が空の人限定・まれ）は1人ずつのまま。
  const exists = res.filter((x) => x.status === 'exists' && x.existingId != null);
  const haveByCustomer = new Map<number, Set<string>>();
  const existIds = [...new Set(exists.map((r) => r.existingId!))];
  for (let i = 0; i < existIds.length; i += 300) {
    const { data: cur, error: cErr } = await svc.from('salon_customer_phones').select('customer_id, phone')
      .eq('salon_id', salonId).in('customer_id', existIds.slice(i, i + 300));
    if (cErr) { console.error('[crm] 取り込みが途中で止まった', salonId, cErr.message); return { ok: false, error: `取り込みの途中で止まりました（新規 ${created}人は登録済み・既存の人はまだ）。もう一度取り込むと、続きから入ります` }; }
    for (const p of cur ?? []) {
      const k = Number(p.customer_id);
      if (!haveByCustomer.has(k)) haveByCustomer.set(k, new Set());
      haveByCustomer.get(k)!.add(String(p.phone));
    }
  }
  const toInsert: { customer_id: number; salon_id: number; phone: string }[] = [];
  for (const r of exists) {
    const id = r.existingId!;
    let changed = false;
    if (!r.existingName.trim() && r.name) {
      await svc.from('salon_customers').update({ name: r.name, updated_at: new Date().toISOString() }).eq('salon_id', salonId).eq('id', id);
      changed = true;
    }
    const have = haveByCustomer.get(id) ?? new Set<string>();
    // ★ owners は取り込む全番号の持ち主（判定のとき読んだもの）。別の人の番号は足さない。自分の番号は have で除く
    const add = r.phones.filter((p) => !have.has(p) && !owners.has(p)).slice(0, Math.max(0, 5 - have.size));
    for (const phone of add) { toInsert.push({ customer_id: id, salon_id: salonId, phone }); have.add(phone); }
    if (add.length > 0) changed = true;
    if (changed) updated++; else skipped++;
  }
  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200);
    const { error: pErr } = await svc.from('salon_customer_phones').insert(chunk);
    if (pErr) {
      // まとめて入らなければ1件ずつ（その間に同じ番号が登録された等）
      for (const p of chunk) await svc.from('salon_customer_phones').insert(p);
    }
  }
  skipped += res.filter((r) => r.status === 'dup' || r.status === 'invalid').length;
  return { ok: true, created, updated, skipped };
}
