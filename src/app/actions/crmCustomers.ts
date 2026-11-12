'use server';

import { normalizePhone } from '@/app/lib/validation/phone';
import { dbMessage } from '@/app/lib/crm/dbError';
import { toCrmCategory, CRM_CATEGORIES, CRM_CATEGORY_LABEL, type CrmCategory, type CrmBookingRow, type CrmCustomerDetail, type CrmCustomerRow, type CrmDormantCustomer, type CrmTherapist } from '@/app/lib/crm/types';
import { type Svc, LIST_LIMIT, HISTORY_LIMIT, assertCrm, emptyStats, statsFor, readFail, consentMap } from '@/app/lib/crm/server/core';

async function phonesFor(svc: Svc, ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (ids.length === 0) return out;
  const { data, error } = await svc
    .from('salon_customer_phones')
    .select('customer_id, phone')
    .in('customer_id', ids)
    .order('id', { ascending: true });
  // ★ 第1987便（点検 §3）: 読めなければ投げる。★ 空のまま詳細を開くと、そのまま保存したときに登録済みの番号が消える
  if (error) throw new Error(error.message);
  for (const p of data ?? []) {
    const k = Number(p.customer_id);
    out.set(k, [...(out.get(k) ?? []), String(p.phone)]);
  }
  return out;
}

type CustomerDbRow = {
  id: number; name: string | null; name_kana: string | null; category: string | null;
  member_no: string | null; caution_memo: string | null; memo?: string | null;
  ng_therapist_ids?: number[] | null; created_at?: string | null; updated_at?: string | null;
};

const LIST_COLS = 'id, name, name_kana, category, member_no, caution_memo, memo, updated_at'; // ★ 第1492便: updated_at（印の検索とまとめて並べ直す）

/**
 * 顧客を探す。
 * ・空: 最近更新された順に50人
 * ・数字だけ（4桁以上）: 電話番号（下4桁でも・途中一致）
 * ・それ以外: 名前・フリガナ・会員番号の部分一致
 */
export async function searchCrmCustomers(
  salonId: number,
  query: string,
): Promise<{ ok: true; customers: CrmCustomerRow[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const q = String(query ?? '').trim().slice(0, 40);
  const digits = normalizePhone(q);

  let rows: CustomerDbRow[] = [];
  if (!q) {
    const { data, error } = await svc
      .from('salon_customers').select(LIST_COLS)
      .eq('salon_id', salonId).order('updated_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) return { ok: false, error: dbMessage(error) };
    rows = (data ?? []) as CustomerDbRow[];
  } else if (/^\d{4,13}$/.test(digits)) {
    const { data: ph, error: pErr } = await svc
      .from('salon_customer_phones').select('customer_id')
      .eq('salon_id', salonId).like('phone', `%${digits}%`).limit(LIST_LIMIT);
    if (pErr) return { ok: false, error: dbMessage(pErr) };
    const ids = [...new Set((ph ?? []).map((p) => Number(p.customer_id)))];
    if (ids.length > 0) {
      const { data, error } = await svc
        .from('salon_customers').select(LIST_COLS)
        .eq('salon_id', salonId).in('id', ids).order('updated_at', { ascending: false });
      if (error) return { ok: false, error: dbMessage(error) };
      rows = (data ?? []) as CustomerDbRow[];
    }
  } else {
    // PostgREST の or() に渡すので , ( ) を落としておく
    const safe = q.replace(/[,()%*\\]/g, ' ').trim();
    if (!safe) return { ok: true, customers: [] };
    const { data, error } = await svc
      .from('salon_customers').select(LIST_COLS)
      .eq('salon_id', salonId)
      .or(`name.ilike.%${safe}%,name_kana.ilike.%${safe}%,member_no.ilike.%${safe}%,memo.ilike.%${safe}%,caution_memo.ilike.%${safe}%`)
      .order('updated_at', { ascending: false }).limit(LIST_LIMIT);
    if (error) return { ok: false, error: dbMessage(error) };
    rows = (data ?? []) as CustomerDbRow[];

    // ★ 第1492便（カッキーさん）: 印の名前で探す。「要注意」＝要注意メモがあるお客様全員、「出禁」（「NG」でも）＝出禁のお客様全員（第1742便で分類は一般・出禁の2つに）。
    //   言葉そのものがメモに書いてある人（上の結果）とまとめて、更新の新しい順に50人まで。
    const special = specialSearchOf(q);
    if (special) {
      let sq = svc.from('salon_customers').select(LIST_COLS).eq('salon_id', salonId);
      sq = special.kind === 'caution'
        ? sq.not('caution_memo', 'is', null).neq('caution_memo', '')
        : sq.eq('category', special.category);
      const { data: sp, error: spErr } = await sq.order('updated_at', { ascending: false }).limit(LIST_LIMIT);
      if (spErr) return { ok: false, error: dbMessage(spErr) };
      const seen = new Set(rows.map((r) => Number(r.id)));
      for (const r of (sp ?? []) as CustomerDbRow[]) if (!seen.has(Number(r.id))) { rows.push(r); seen.add(Number(r.id)); }
      rows.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
      rows = rows.slice(0, LIST_LIMIT);
    }
  }

  const ids = rows.map((r) => Number(r.id));
  let stats: Awaited<ReturnType<typeof statsFor>>;
  let phones: Awaited<ReturnType<typeof phonesFor>>;
  try {
    [stats, phones] = await Promise.all([statsFor(svc, salonId, ids), phonesFor(svc, ids)]);
  } catch (e) {
    return readFail(e); // ★ 第1987便
  }
  return {
    ok: true,
    customers: rows.map((r) => ({
      id: Number(r.id),
      name: r.name ?? '',
      nameKana: r.name_kana ?? '',
      category: toCrmCategory(r.category),
      memberNo: r.member_no ?? '',
      phones: phones.get(Number(r.id)) ?? [],
      cautionMemo: r.caution_memo ?? '',
      stats: stats.get(Number(r.id)) ?? emptyStats(),
      ...(memoHitOf(q, r) ? { memoHit: memoHitOf(q, r)! } : cautionPeekOf(q, r) ? { memoHit: cautionPeekOf(q, r)! } : {}),
    })),
  };
}

/**
 * ★ 第1230便（カッキーさん）: 休眠客＝利用が1回以上あり、最終利用から days 日以上たっていて、これからの予約が無いお客様。
 *   最終利用の古い順（長く来ていない人が上）。読むのは salon_customers（id と名前・最大 5000 人）＋ crm_customer_stats（1人1行）だけ。
 *   ★ 読み取りだけ。DB は変えない。
 */
export async function listCrmDormantCustomers(
  salonId: number,
  days: number,
): Promise<{ ok: true; customers: CrmDormantCustomer[]; total: number } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const d = [30, 60, 90, 180].includes(Number(days)) ? Number(days) : 90;
  const svc = auth.svc;
  const { data, error } = await svc
    .from('salon_customers').select('id, name, member_no, category')
    .eq('salon_id', salonId).order('id').limit(5000);
  if (error) return { ok: false, error: dbMessage(error) };
  const rows = (data ?? []) as Array<{ id: unknown; name: unknown; member_no: unknown; category: unknown }>;
  const ids = rows.map((r) => Number(r.id));
  let stats: Awaited<ReturnType<typeof statsFor>>;
  try {
    stats = await statsFor(svc, salonId, ids);
  } catch (e) {
    return readFail(e); // ★ 第1987便
  }
  const now = Date.now();
  const limitMs = now - d * 86400_000;
  const out: CrmDormantCustomer[] = [];
  for (const r of rows) {
    const s = stats.get(Number(r.id));
    if (!s || s.visits === 0 || s.upcoming > 0 || !s.lastVisitISO) continue;
    const last = new Date(s.lastVisitISO).getTime();
    if (last > limitMs) continue;
    out.push({
      id: Number(r.id),
      name: String(r.name ?? ''),
      memberNo: String(r.member_no ?? ''),
      category: toCrmCategory(r.category),
      visits: s.visits,
      lastVisitISO: s.lastVisitISO,
      daysAgo: Math.floor((now - last) / 86400_000),
    });
  }
  out.sort((a, b) => a.lastVisitISO.localeCompare(b.lastVisitISO));
  return { ok: true, customers: out.slice(0, 200), total: out.length };
}

/**
 * ★ 第1492便: 印の名前での検索（「要注意」・分類の名前）。全角・半角、大文字・小文字は区別しない。
 *   「一般」は全員に近いので対象にしない。
 */
function specialSearchOf(q: string): { kind: 'caution' } | { kind: 'category'; category: CrmCategory } | null {
  const w = q.normalize('NFKC').trim().toUpperCase();
  if (w === '要注意') return { kind: 'caution' };
  if (w === 'NG') return { kind: 'category', category: 'ng' }; // ★ 第1742便: 前の呼び方「NG」でも出禁を出す
  for (const c of CRM_CATEGORIES) {
    if (c === 'general') continue;
    if (CRM_CATEGORY_LABEL[c].toUpperCase() === w) return { kind: 'category', category: c };
  }
  return null;
}

/** ★ 第1492便: 「要注意」で出した人は、要注意メモの書き出しを一覧に出す（メモに「要注意」の言葉が無くても） */
function cautionPeekOf(q: string, r: CustomerDbRow): { kind: 'caution'; text: string } | null {
  if (specialSearchOf(q)?.kind !== 'caution') return null;
  const text = String(r.caution_memo ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return { kind: 'caution', text: text.length > 30 ? text.slice(0, 30) + '…' : text };
}

/** 検索の言葉がメモ・要注意メモのどこに当たったか（前後を少し切り出す・第553便） */
function memoHitOf(q: string, r: CustomerDbRow): { kind: 'caution' | 'memo'; text: string } | null {
  const word = q.trim().toLowerCase();
  if (!word || /^\d{4,13}$/.test(normalizePhone(q))) return null;
  for (const [kind, raw] of [['caution', r.caution_memo], ['memo', r.memo]] as const) {
    const text = String(raw ?? '');
    const i = text.toLowerCase().indexOf(word);
    if (i < 0) continue;
    const from = Math.max(0, i - 12);
    const to = Math.min(text.length, i + word.length + 18);
    return { kind, text: `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ')}${to < text.length ? '…' : ''}` };
  }
  return null;
}

/** 1人の詳細＋予約履歴＋（女子NG用の）セラピスト一覧 */
export async function getCrmCustomer(
  salonId: number,
  customerId: number,
): Promise<
  | { ok: true; customer: CrmCustomerDetail; bookings: CrmBookingRow[]; therapists: CrmTherapist[] }
  | { ok: false; error: string }
> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;

  const { data: c, error } = await svc
    .from('salon_customers')
    .select('id, name, name_kana, category, member_no, caution_memo, memo, ng_therapist_ids, created_at')
    .eq('salon_id', salonId).eq('id', customerId).maybeSingle();
  if (error || !c) return { ok: false, error: 'お客様が見つかりません' };
  const row = c as CustomerDbRow;

  // ★ 第1987便（点検 §3）: 電話番号・予約履歴・セラピストのどれかを読めなければ、詳細を開かない
  //   （電話番号が空のまま開いて保存すると、登録済みの番号が消える＝saveCrmCustomer は送られた番号に合わせて足し引きする）
  let cMap: Map<string, string>;
  const [statsR, phonesR, bRes, tRes] = await Promise.all([
    statsFor(svc, salonId, [customerId]).then((v) => ({ ok: true as const, v })).catch((e: unknown) => ({ ok: false as const, e })),
    phonesFor(svc, [customerId]).then((v) => ({ ok: true as const, v })).catch((e: unknown) => ({ ok: false as const, e })),
    svc.from('salon_bookings')
      .select('id, slot_start, slot_end, course_name, course_min, therapist_id, status, cancel_bad, source, note, customer_name')
      .eq('salon_id', salonId).eq('customer_id', customerId)
      .order('slot_start', { ascending: false }).limit(HISTORY_LIMIT),
    svc.from('therapists').select('id, name, is_active').eq('salon_id', salonId).order('id', { ascending: true }),
  ]);
  if (!statsR.ok) return readFail(statsR.e);
  if (!phonesR.ok) return readFail(phonesR.e);
  if (bRes.error) return readFail(new Error(bRes.error.message));
  if (tRes.error) return readFail(new Error(tRes.error.message));
  const stats = statsR.v;
  const phones = phonesR.v;

  const therapists: CrmTherapist[] = (tRes.data ?? []).map((t) => ({
    id: Number(t.id),
    name: (t.name as string | null) ?? '(名前未設定)',
    isActive: Boolean(t.is_active),
  }));
  const tName = new Map(therapists.map((t) => [t.id, t.name]));

  const bookings: CrmBookingRow[] = (bRes.data ?? []).map((b) => ({
    id: String(b.id),
    slotStartISO: String(b.slot_start),
    slotEndISO: String(b.slot_end),
    courseName: (b.course_name as string | null) ?? '',
    courseMin: Number(b.course_min) || 0,
    therapistId: b.therapist_id == null ? null : Number(b.therapist_id),
    therapistName: b.therapist_id == null ? 'フリー' : (tName.get(Number(b.therapist_id)) ?? '(不明)'), // ★ 文言をそろえた（行が無いときだけ。非公開は名前が出る）
    status: String(b.status),
    cancelBad: Boolean(b.cancel_bad),
    source: String(b.source ?? ''),
    note: (b.note as string | null) ?? '',
    customerName: (b.customer_name as string | null) ?? '',
    consentAt: null as string | null,
  }));
  // 同意書（第574便）：過去の予約のサインも台帳から見られるように
  try {
    cMap = await consentMap(svc, salonId, bookings.map((b) => b.id));
  } catch (e) {
    return readFail(e); // ★ 第1987便
  }
  bookings.forEach((b) => { b.consentAt = cMap.get(b.id) ?? null; });

  return {
    ok: true,
    customer: {
      id: Number(row.id),
      name: row.name ?? '',
      nameKana: row.name_kana ?? '',
      category: toCrmCategory(row.category),
      memberNo: row.member_no ?? '',
      phones: phones.get(customerId) ?? [],
      cautionMemo: row.caution_memo ?? '',
      memo: row.memo ?? '',
      ngTherapistIds: (row.ng_therapist_ids ?? []).map(Number),
      createdAt: row.created_at ?? '',
      stats: stats.get(customerId) ?? emptyStats(),
    },
    bookings,
    therapists,
  };
}

export type CrmCustomerInput = {
  salonId: number;
  customerId: number | null; // null＝新規登録
  name: string;
  nameKana: string;
  category: string;
  memberNo: string;
  phones: string[];
  ngTherapistIds: number[];
  cautionMemo: string;
  memo: string;
};

/** 顧客の登録・更新（電話番号は丸ごと入れ替え） */
export async function saveCrmCustomer(
  input: CrmCustomerInput,
): Promise<{ ok: true; customerId: number } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;

  const name = String(input.name ?? '').trim();
  const nameKana = String(input.nameKana ?? '').trim();
  const memberNo = String(input.memberNo ?? '').trim();
  const cautionMemo = String(input.cautionMemo ?? '').trim();
  const memo = String(input.memo ?? '').trim();
  if (!name) return { ok: false, error: '名前を入力してください' };
  if (name.length > 40 || nameKana.length > 40) return { ok: false, error: '名前・フリガナは40文字までです' };
  if (memberNo.length > 20) return { ok: false, error: '会員番号は20文字までです' };
  if (cautionMemo.length > 500) return { ok: false, error: '要注意メモは500文字までです' };
  if (memo.length > 1000) return { ok: false, error: 'メモは1000文字までです' };

  const phones = [...new Set((input.phones ?? []).map((p) => normalizePhone(p)).filter(Boolean))];
  for (const p of phones) {
    if (!/^\d{10,13}$/.test(p)) return { ok: false, error: `電話番号の形が正しくありません（${p}）` };
  }
  if (phones.length > 5) return { ok: false, error: '電話番号は5件までです' };

  // 女子NGはこの店のセラピストだけに絞る
  // ★ 2026-11-12 点検#2: セラピストを読めなかったら保存しない。前は「この店にセラピストがいない」と受け取って、
  //   女子NG が全部外れた状態で保存していた（画面は「保存しました」）
  const { data: ts, error: tsErr } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  if (tsErr) return readFail(new Error(tsErr.message));
  const own = new Set((ts ?? []).map((t) => Number(t.id)));
  const ngIds = [...new Set((input.ngTherapistIds ?? []).map(Number))].filter((id) => own.has(id));

  // 電話番号が別のお客様に使われていないか
  if (phones.length > 0) {
    const { data: used, error: usedErr } = await svc
      .from('salon_customer_phones').select('customer_id, phone')
      .eq('salon_id', salonId).in('phone', phones);
    if (usedErr) return readFail(new Error(usedErr.message)); // ★ 点検#2: 読めなかった回は「重なっていない」と決めつけない
    const clash = (used ?? []).find((u) => Number(u.customer_id) !== Number(input.customerId));
    if (clash) return { ok: false, error: `${clash.phone} は別のお客様に登録されています` };
  }

  const fields = {
    name,
    name_kana: nameKana,
    category: toCrmCategory(input.category),
    member_no: memberNo,
    ng_therapist_ids: ngIds,
    caution_memo: cautionMemo,
    memo,
    updated_at: new Date().toISOString(),
  };

  let customerId: number;
  if (input.customerId) {
    customerId = Number(input.customerId);
    const { data, error } = await svc
      .from('salon_customers').update(fields)
      .eq('salon_id', salonId).eq('id', customerId).select('id');
    if (error) return { ok: false, error: dbMessage(error) };
    if (!data || data.length === 0) return { ok: false, error: 'お客様が見つかりません' };
  } else {
    const { data, error } = await svc
      .from('salon_customers').insert({ salon_id: salonId, ...fields }).select('id').single();
    if (error || !data) return { ok: false, error: error ? dbMessage(error, '登録') : '登録できませんでした' };
    customerId = Number(data.id);
  }

  // 電話番号の入れ替え。★ 2026-10-09 点検#11: 【先に足して、成功したら消す】（前は 消す→足す で、足すのが重複で失敗すると
  //   元の番号まで消えて、番号の無いお客様が残った＝次にその番号から予約が入っても台帳に当たらない）。
  //   いまの番号を読めなかったときも止める（空のふりをすると全部を「足す」扱いにして重複で失敗する）。
  const isNew = !input.customerId;
  const giveUpNew = async () => { if (isNew) await svc.from('salon_customers').delete().eq('salon_id', salonId).eq('id', customerId); };
  const { data: cur, error: curErr } = await svc.from('salon_customer_phones').select('phone').eq('customer_id', customerId);
  if (curErr) { await giveUpNew(); return readFail(new Error(curErr.message)); }
  const curSet = new Set((cur ?? []).map((p) => String(p.phone)));
  const toDel = [...curSet].filter((p) => !phones.includes(p));
  const toAdd = phones.filter((p) => !curSet.has(p));
  if (toAdd.length > 0) {
    const { error: aErr } = await svc
      .from('salon_customer_phones')
      .insert(toAdd.map((phone) => ({ customer_id: customerId, salon_id: salonId, phone })));
    if (aErr) {
      await giveUpNew(); // ★ 新規のときは、名前だけのお客様を残さない
      return {
        ok: false,
        error: isNew
          ? '電話番号を登録できませんでした（別のお客様と重なっている可能性があります）。お客様は登録していません'
          : '電話番号を登録できませんでした（別のお客様と重なっている可能性があります）。電話番号は元のままです（名前などは保存しました）',
      };
    }
  }
  if (toDel.length > 0) {
    const { error: dErr } = await svc.from('salon_customer_phones').delete().eq('customer_id', customerId).in('phone', toDel);
    if (dErr) { console.error('[crm] 古い電話番号を外せなかった', dErr.message); return { ok: false, error: '古い電話番号を外せませんでした。もう一度保存してください' }; }
  }
  return { ok: true, customerId };
}

/** キャンセル済みの予約に「悪質」を付ける／外す */
export async function setCrmCancelBad(
  salonId: number,
  bookingId: string,
  bad: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc
    .from('salon_bookings')
    .update({ cancel_bad: Boolean(bad) })
    .eq('salon_id', salonId)
    .eq('id', bookingId)
    .eq('status', 'cancelled')
    .select('id');
  if (error) return { ok: false, error: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: 'キャンセル済みの予約だけに付けられます' };
  return { ok: true };
}

/** 女子NGを選ぶためのセラピスト一覧（新規登録フォーム用） */
export async function getCrmTherapists(
  salonId: number,
): Promise<{ ok: true; therapists: CrmTherapist[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc
    .from('therapists').select('id, name, is_active').eq('salon_id', salonId).order('id', { ascending: true });
  if (error) return { ok: false, error: dbMessage(error) };
  return {
    ok: true,
    therapists: (data ?? []).map((t) => ({
      id: Number(t.id),
      name: (t.name as string | null) ?? '(名前未設定)',
      isActive: Boolean(t.is_active),
    })),
  };
}
