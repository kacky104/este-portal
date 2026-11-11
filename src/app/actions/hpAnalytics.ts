'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { fetchAllRows } from '@/app/lib/fetchAllRows';
import { hpPageLabel, hpSourceKind, hpSourceLabel, jstDayHour, HP_EK_KINDS, type HpEkKind } from '@/lib/hpStats';
import { sanitizeHpBlocks } from '@/app/lib/hpSite';
import { isSalonBookable } from '@/app/salon/[id]/salonBookable';

// ★ 第1792便（カッキーさん・2026-11-08・オイルクエスト様のご要望）: 公式HP（フクエスサイト）のアクセス解析の読み取り。
//   ★ 見られるのは、その店のオーナー様と運営だけ（コネックエフで運営が店舗として操作中も同じ）。
//   ★ 数は表 hp_stats（日 × 切り口 × 値）。期間とその前の同じ長さの期間を読み、くらべた数（Δ）も返す。

export type HpTotals = { users: number; newUsers: number; sessions: number; pv: number; tel: number; line: number; contact: number; book: number; ek: number };   // ★ 第1878便: book＝ネット予約のタップ
export type HpAnalytics = {
  site: { domain: string | null; slug: string } | null;
  from: string; to: string; prevFrom: string; prevTo: string;
  totals: HpTotals; prev: HpTotals;
  daily: Array<{ day: string; users: number; pv: number; tel: number; line: number; contact: number; book: number }>;
  sources: Array<{ key: string; label: string; kind: 'search' | 'direct' | 'site'; users: number; sessions: number; pv: number; tel: number; line: number; contact: number; book: number; firstTel: number; firstLine: number; firstContact: number; firstBook: number; prevUsers: number }>;
  pages: Array<{ key: string; label: string; pv: number; prevPv: number; tel: number; line: number; contact: number; book: number; ek: number }>;
  /** ★ 第1940便: 駅ちかへのタップ（項目ごと・この期間）。ek は合計（totals.ek と同じ） */
  ekBy: Record<HpEkKind, number>;
  therapists: Array<{ id: number; name: string; imageUrl: string | null; pv: number; prevPv: number; tel: number; line: number; book: number; workDays: number; diaries: number }>;
  heat: number[][];     // [曜日 0=日..6][時 0..23] の閲覧
  heatOut: number[][];  // 同じ形の 電話＋LINE＋お問い合わせ
  devices: { sp: number; pc: number };
  insights: string[];
  /** ★ 第1879便: いま使っているか（使っていないものはタイルに「未使用」と出す）。LINE＝URLあり／ネット予約＝予約受付ON＋コースあり／お問い合わせ＝フォームON */
  usage: { line: boolean; book: boolean; contact: boolean; /** ★ 第1940便: 公式HP管理で、どれか1つでもリンク先を駅ちかにしているか */ ek: boolean };
};

type Fail = { ok: false; error: string };
type StatRow = { day: string; dim: string; key: string; pv: number; sessions: number; users: number; new_users: number; tel: number; line: number; contact: number; book: number; ek_therapist?: number; ek_schedule?: number; ek_diary?: number; ek_review?: number };
const ekOf = (r: StatRow) => (r.ek_therapist ?? 0) + (r.ek_schedule ?? 0) + (r.ek_diary ?? 0) + (r.ek_review ?? 0);

async function assertOwner(salonId: number): Promise<{ ok: true } | Fail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインしてください' };
  if (user.id === ADMIN_UUID) return { ok: true };
  const svc = createServiceClient();
  const { data: s } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!s || (s.owner_id as string | null) !== user.id) return { ok: false, error: 'このお店の解析は見られません' };
  return { ok: true };
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400_000) + 1;
}
const zero = (): HpTotals => ({ users: 0, newUsers: 0, sessions: 0, pv: 0, tel: 0, line: 0, contact: 0, book: 0, ek: 0 });
const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

export async function getHpAnalytics(input: { salonId: number; from: string; to: string }): Promise<{ ok: true; data: HpAnalytics } | Fail> {
  const salonId = Number(input.salonId);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isFinite(salonId) || !re.test(input.from) || !re.test(input.to) || input.from > input.to) return { ok: false, error: '期間が正しくありません' };
  const len = daysBetween(input.from, input.to);
  if (len > 400) return { ok: false, error: '期間は400日までにしてください' };
  const auth = await assertOwner(salonId);
  if (!auth.ok) return auth;
  const svc = createServiceClient();

  const [{ data: siteRow }, { data: salonRow }] = await Promise.all([
    svc.from('salon_sites').select('slug, domain, status, blocks').eq('salon_id', salonId).maybeSingle(),
    svc.from('salons').select('line_url, booking_enabled, booking_courses').eq('id', salonId).maybeSingle(),
  ]);
  const lineRaw = String(salonRow?.line_url ?? '').trim();
  const usage = {
    line: lineRaw !== '' && lineRaw !== '#',
    book: isSalonBookable(salonRow?.booking_enabled, salonRow?.booking_courses),
    contact: siteRow ? sanitizeHpBlocks(siteRow.blocks).contact.on : false,
    ek: siteRow ? (() => { const e = sanitizeHpBlocks(siteRow.blocks).ekichika; return e.therapist || e.schedule || e.diary || e.review; })() : false,
  };
  const site = siteRow && siteRow.status === 'live' ? { slug: String(siteRow.slug), domain: (siteRow.domain as string | null) ?? null } : null;

  const prevTo = addDays(input.from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  // ★ 第1940便: 駅ちかへのタップの列（追加SQL_第1940便）。まだ無い間は今までの列だけ読む（解析の画面を止めない）
  const ekReady = !(await svc.from('hp_stats').select('ek_diary').limit(1)).error;
  const cols = `day, dim, key, pv, sessions, users, new_users, tel, line, contact, book${ekReady ? ', ek_therapist, ek_schedule, ek_diary, ek_review' : ''}`;
  const rows = await fetchAllRows<StatRow>((a, b) => svc.from('hp_stats')
    .select(cols)
    .eq('salon_id', salonId).gte('day', prevFrom).lte('day', input.to)
    .order('day').order('dim').order('key').range(a, b) as unknown as PromiseLike<{ data: StatRow[] | null; error: { message?: string } | null }>, 'hp_stats');
  const isCur = (r: StatRow) => r.day >= input.from;
  const ekBy: Record<HpEkKind, number> = { therapist: 0, schedule: 0, diary: 0, review: 0 };

  // ── 合計・日ごと（流入元の行を足すと全体になる）──
  const totals = zero(), prev = zero();
  const dailyMap = new Map<string, { day: string; users: number; pv: number; tel: number; line: number; contact: number; book: number }>();
  for (let i = 0; i < len; i++) { const d = addDays(input.from, i); dailyMap.set(d, { day: d, users: 0, pv: 0, tel: 0, line: 0, contact: 0, book: 0 }); }
  const srcMap = new Map<string, HpAnalytics['sources'][number]>();
  const srcOf = (k: string) => {
    let s = srcMap.get(k);
    if (!s) { s = { key: k, label: hpSourceLabel(k), kind: hpSourceKind(k), users: 0, sessions: 0, pv: 0, tel: 0, line: 0, contact: 0, book: 0, firstTel: 0, firstLine: 0, firstContact: 0, firstBook: 0, prevUsers: 0 }; srcMap.set(k, s); }
    return s;
  };
  const pageMap = new Map<string, HpAnalytics['pages'][number]>();
  const pageOf = (k: string) => {
    let p = pageMap.get(k);
    if (!p) { p = { key: k, label: hpPageLabel(k), pv: 0, prevPv: 0, tel: 0, line: 0, contact: 0, book: 0, ek: 0 }; pageMap.set(k, p); }
    return p;
  };
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const heatOut = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  const devices = { sp: 0, pc: 0 };

  for (const r of rows) {
    const cur = isCur(r);
    if (r.dim === 'src') {
      const t = cur ? totals : prev;
      t.users += r.users; t.newUsers += r.new_users; t.sessions += r.sessions; t.pv += r.pv; t.tel += r.tel; t.line += r.line; t.contact += r.contact; t.book += r.book ?? 0; t.ek += ekOf(r);
      if (cur) {
        for (const k of HP_EK_KINDS) ekBy[k] += r[`ek_${k}`] ?? 0;
        const d = dailyMap.get(r.day);
        if (d) { d.users += r.users; d.pv += r.pv; d.tel += r.tel; d.line += r.line; d.contact += r.contact; d.book += r.book ?? 0; }
        const s = srcOf(r.key);
        s.users += r.users; s.sessions += r.sessions; s.pv += r.pv; s.tel += r.tel; s.line += r.line; s.contact += r.contact; s.book += r.book ?? 0;
      } else srcOf(r.key).prevUsers += r.users;
    } else if (r.dim === 'first' && cur) {
      const s = srcOf(r.key);
      s.firstTel += r.tel; s.firstLine += r.line; s.firstContact += r.contact; s.firstBook += r.book ?? 0;
    } else if (r.dim === 'page') {
      const p = pageOf(r.key);
      if (cur) { p.pv += r.pv; p.tel += r.tel; p.line += r.line; p.contact += r.contact; p.book += r.book ?? 0; p.ek += ekOf(r); } else p.prevPv += r.pv;
    } else if (r.dim === 'hour' && cur) {
      const dow = new Date(`${r.day}T00:00:00Z`).getUTCDay();
      const h = Number(r.key);
      if (h >= 0 && h < 24) { heat[dow][h] += r.pv; heatOut[dow][h] += r.tel + r.line + r.contact + (r.book ?? 0); }
    } else if (r.dim === 'device' && cur) {
      if (r.key === 'pc') devices.pc += r.users; else devices.sp += r.users;
    }
  }

  const sources = [...srcMap.values()].filter((s) => s.users + s.sessions + s.tel + s.line + s.contact + s.book + s.firstTel + s.firstLine + s.firstContact + s.firstBook > 0)
    .sort((a, b) => b.users - a.users || (b.tel + b.line) - (a.tel + a.line));
  const pagesAll = [...pageMap.values()].filter((p) => p.pv + p.tel + p.line + p.contact + p.book + p.ek > 0);

  // ── セラピスト（/therapist/{番号}）。名前・写真・期間中の出勤日数と写メ日記 ──
  const tIds = pagesAll.map((p) => /^\/therapist\/(\d+)$/.exec(p.key)?.[1]).filter((v): v is string => !!v).map(Number);
  const therapists: HpAnalytics['therapists'] = [];
  if (tIds.length > 0) {
    const [{ data: ts }, { data: sch }, { data: di }] = await Promise.all([
      svc.from('therapists').select('id, name, profile_image_url, salon_id').in('id', tIds),
      svc.from('therapist_schedules').select('therapist_id').in('therapist_id', tIds).eq('is_active', true).gte('schedule_date', input.from).lte('schedule_date', input.to).limit(10000),
      svc.from('diary_posts').select('therapist_id').in('therapist_id', tIds).gte('created_at', `${input.from}T00:00:00+09:00`).lte('created_at', `${input.to}T23:59:59+09:00`).limit(10000),
    ]);
    const count = (xs: Array<{ therapist_id: unknown }> | null) => {
      const m = new Map<number, number>();
      for (const x of xs ?? []) m.set(Number(x.therapist_id), (m.get(Number(x.therapist_id)) ?? 0) + 1);
      return m;
    };
    const work = count(sch), diaries = count(di);
    for (const t of ts ?? []) {
      if (Number(t.salon_id) !== salonId) continue;
      const p = pageMap.get(`/therapist/${t.id}`);
      if (!p) continue;
      p.label = `${String(t.name ?? '')}さんのプロフィール`;
      therapists.push({
        id: Number(t.id), name: String(t.name ?? ''), imageUrl: (t.profile_image_url as string | null) ?? null,
        pv: p.pv, prevPv: p.prevPv, tel: p.tel, line: p.line, book: p.book,
        workDays: work.get(Number(t.id)) ?? 0, diaries: diaries.get(Number(t.id)) ?? 0,
      });
    }
    therapists.sort((a, b) => b.pv - a.pv);
  }
  const pages = pagesAll.filter((p) => !p.key.startsWith('/therapist/')).sort((a, b) => b.pv - a.pv);

  // ── ひとこと（数字を読まなくても分かる一文。多すぎないよう最大4つ）──
  const insights: string[] = [];
  const outs = (t: HpTotals) => t.tel + t.line + t.contact + t.book;
  const du = pct(totals.users, prev.users);
  if (du != null && Math.abs(du) >= 10) insights.push(`人数は前の期間より ${du > 0 ? `${du}% 増えました` : `${-du}% 減りました`}（${prev.users.toLocaleString()} → ${totals.users.toLocaleString()}人）。`);
  const dOut = pct(outs(totals), outs(prev));
  if (dOut != null && Math.abs(dOut) >= 10) insights.push(`電話・LINE・ネット予約・お問い合わせは前の期間より ${dOut > 0 ? `${dOut}% 増えました` : `${-dOut}% 減りました`}（${outs(prev)} → ${outs(totals)}件）。`);
  const bestSrc = [...sources].filter((s) => s.tel + s.line + s.contact + s.book > 0).sort((a, b) => (b.tel + b.line + b.contact + b.book) - (a.tel + a.line + a.contact + a.book))[0];
  if (bestSrc) insights.push(`電話・LINE・ネット予約がいちばん多かった流入元は「${bestSrc.label}」（${bestSrc.tel + bestSrc.line + bestSrc.contact + bestSrc.book}件）。`);
  const grow = sources.filter((s) => s.prevUsers >= 5 && s.users >= s.prevUsers * 1.5).sort((a, b) => (b.users - b.prevUsers) - (a.users - a.prevUsers))[0];
  if (grow && insights.length < 4) insights.push(`「${grow.label}」からの人数が大きく伸びています（${grow.prevUsers} → ${grow.users}人）。`);
  let bestCell: [number, number, number] | null = null;
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (!bestCell || heatOut[d][h] > bestCell[2]) bestCell = [d, h, heatOut[d][h]];
  if (bestCell && bestCell[2] >= 3 && insights.length < 4) insights.push(`電話・LINE・ネット予約が多いのは ${'日月火水木金土'[bestCell[0]]}曜日の ${bestCell[1]}時台です。`);
  if (totals.pv === 0) insights.splice(0, insights.length, 'この期間の記録はまだありません（計測はこの機能を入れた日から始まります）。');

  return {
    ok: true,
    data: {
      site, from: input.from, to: input.to, prevFrom, prevTo, totals, prev,
      daily: [...dailyMap.values()], sources, pages, ekBy, therapists, heat, heatOut, devices, insights, usage,
    },
  };
}

/** 今日（日本時間） */
export async function hpAnalyticsToday(): Promise<string> {
  return jstDayHour(Date.now()).day;
}
