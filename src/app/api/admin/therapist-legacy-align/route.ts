import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { parseAdminBody, truthy, num } from '@/lib/adminBody';
import { LEGACY_ALIGN_SALON_IDS, alignLegacyBadges, alignLegacyParagraphs } from '@/lib/legacyAlign';

// ── 運営用: 以前のバッジ・改行なしの紹介文を今の決まりに揃える（第1125便・2026-10-03・カッキーさんの決定）──
//
// 決めごとの本体は src/lib/legacyAlign.ts（純粋関数・点検 check:legacyalign）。★ AI は使わない。
//   バッジ … 今あるものは消さない（経験・キャリアも残す）。雰囲気・性格／スキルが無ければ、くじで1つずつ足す。
//            6個を超えるときは外見・タイプの後ろから外す。バッジが空の方は触らない（自動の口の仕事）。
//   紹介文 … 改行が1つも無い文章を、文の切れ目で段落に分ける。★ 文字は変えない（入れるのは改行だけ）。
//
//   POST /api/admin/therapist-legacy-align  (Authorization: Bearer <CRON_SECRET>)
//     salonId       対象店舗（必須）。★ アイリス(3)と AROMA-May(12) だけ受ける
//     apply?        true で DB に保存。既定 false（試し打ち＝変える内容を返すだけ・1行も書かない）
//     only?         badges ＝バッジだけ ／ copy ＝紹介文だけ（書かなければ両方）
//     therapistId?  1人だけ
//
// ★ 守り
//   ① 既定は apply=false。★ まず目で見てから流す。
//   ② 保存の直前にその人の行を読み直し、読み直した値から決め直す（一覧を読んだあとで店舗様が直した内容を潰さない）。
//   ③ 返事に「前」と「後」を入れる（apply の返事を取っておけば、元に戻せる）。
//   ④ 何度流しても同じ（2回目は変える方が0人になる）。
//   ⑤ 公開ページの作り直し（revalidatePath）は、実際に保存したときだけ。
// ★ 印の列（feature_badges_auto_at・profile_copy_auto_at）には触らない。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** ★ これを超えたら途中で返す（残りは remaining。もう一度流せば続きから） */
const TIME_BUDGET_MS = 45_000;

type Row = { id: number; name: string | null; feature_badges: unknown; profile_text: unknown };

const json = (body: unknown, status = 200) =>
  // ★ charset を明示する（禁則209）。PowerShell 5.1 の文字化け防止
  NextResponse.json(body, { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function POST(req: Request) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ ok: false, error: 'CRON_SECRET is not set' }, 500);
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return json({ ok: false, error: 'unauthorized' }, 401);

  const body = parseAdminBody(await req.text(), req.url);
  if (body === null) return json({ ok: false, error: '本文を読み取れませんでした（JSONのつもりなら形が壊れています）' }, 400);

  const salonId = num(body.salonId);
  if (salonId === null) return json({ ok: false, error: 'salonId が不正です' }, 400);
  if (!LEGACY_ALIGN_SALON_IDS.includes(salonId))
    return json({ ok: false, error: `この口が受ける店舗は ${LEGACY_ALIGN_SALON_IDS.join('・')} だけです（ほかの店は触りません）` }, 400);

  const onlyRaw = typeof body.only === 'string' ? body.only.trim() : '';
  if (onlyRaw !== '' && onlyRaw !== 'badges' && onlyRaw !== 'copy')
    return json({ ok: false, error: 'only は badges か copy です' }, 400);
  const doBadges = onlyRaw !== 'copy';
  const doCopy = onlyRaw !== 'badges';

  const onlyId = body.therapistId != null ? num(body.therapistId) : null;
  if (body.therapistId != null && onlyId === null) return json({ ok: false, error: 'therapistId が不正です' }, 400);
  const apply = truthy(body.apply);

  const svc = createServiceClient();
  const { data: salon } = await svc.from('salons').select('name').eq('id', salonId).maybeSingle();
  if (!salon) return json({ ok: false, error: '店舗が見つかりません' }, 404);

  const { data: rows, error } = await svc
    .from('therapists')
    .select('id, name, feature_badges, profile_text')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) return json({ ok: false, error: error.message }, 500);

  let all = (rows ?? []) as Row[];
  if (onlyId !== null) {
    all = all.filter((r) => Number(r.id) === onlyId);
    if (all.length === 0) return json({ ok: false, error: 'そのセラピストはこの店舗に居ません（または非公開）' }, 404);
  }

  /** 1人ぶんの「変える内容」を決める */
  const planOf = (r: Row) => ({
    badge: doBadges ? alignLegacyBadges(Number(r.id), r.feature_badges) : null,
    para: doCopy ? alignLegacyParagraphs(r.profile_text) : null,
  });

  const count = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
  const 足す語: Record<string, number> = {};
  const 外す語: Record<string, number> = {};
  const 紹介文の内訳: Record<string, number> = {};
  let 枠が無く足せない = 0;
  let バッジを変える = 0;
  let 紹介文を変える = 0;

  const targets: Row[] = [];
  for (const r of all) {
    const p = planOf(r);
    if (p.badge) {
      if (p.badge.changed) {
        バッジを変える++;
        p.badge.added.forEach((b) => count(足す語, b));
        p.badge.dropped.forEach((b) => count(外す語, b));
      }
      if (p.badge.skipped.length > 0) 枠が無く足せない++;
    }
    if (p.para) {
      if (p.para.changed) 紹介文を変える++;
      count(紹介文の内訳, p.para.changed ? `分ける（${p.para.sizes.join('+')}文）` : `触らない（${p.para.reason}）`);
    }
    if (p.badge?.changed || p.para?.changed) targets.push(r);
  }

  const results: Array<Record<string, unknown>> = [];
  let saved = 0;
  let timedOut = false;

  for (const t of targets) {
    if (apply && Date.now() - started > TIME_BUDGET_MS) { timedOut = true; break; }

    let row = t;
    if (apply) {
      // ★★ 保存の直前に読み直す（店舗様がこの間に直していたら、その内容から決め直す）
      const { data: now, error: nowErr } = await svc
        .from('therapists')
        .select('id, name, feature_badges, profile_text')
        .eq('id', t.id)
        .eq('salon_id', salonId)
        .maybeSingle();
      if (nowErr || !now) {
        results.push({ id: t.id, name: t.name, ok: false, error: `読み直せませんでした: ${nowErr?.message ?? '行がありません'}` });
        continue;
      }
      row = now as Row;
    }

    const p = planOf(row);
    const patch: Record<string, unknown> = {};
    // ★★ jsonb（text[] ではない）
    if (p.badge?.changed) patch.feature_badges = p.badge.after;
    if (p.para?.changed) patch.profile_text = p.para.after;

    const one: Record<string, unknown> = { id: row.id, name: row.name, ok: true, saved: false };
    if (p.badge?.changed)
      one.バッジ = { 前: p.badge.before, 後: p.badge.after, 足した語: p.badge.added, 外した語: p.badge.dropped };
    if (p.badge && p.badge.skipped.length > 0) one.枠が無く足せなかった語 = p.badge.skipped;
    if (p.para?.changed) one.紹介文 = { 段落ごとの文の数: p.para.sizes, 後: p.para.after };

    if (apply && Object.keys(patch).length > 0) {
      const { error: upErr } = await svc.from('therapists').update(patch).eq('id', row.id);
      if (upErr) {
        results.push({ id: row.id, name: row.name, ok: false, error: `保存に失敗: ${upErr.message}` });
        continue;
      }
      one.saved = true;
      saved++;
    }
    results.push(one);
  }

  // ★ 作り直すのは、実際に保存したときだけ
  if (saved > 0) {
    revalidatePath('/salon/[id]', 'layout');
    revalidatePath('/therapist/[id]', 'layout');
    revalidatePath('/hp/[slug]', 'layout');
  }

  return json({
    ok: true,
    salon: salon.name,
    apply,
    対象の項目: onlyRaw === '' ? 'バッジと紹介文' : onlyRaw === 'badges' ? 'バッジだけ' : '紹介文だけ',
    在籍: all.length,
    変える人数: targets.length,
    バッジ: doBadges ? { 変える人数: バッジを変える, 足す語: 足す語, 外す語: 外す語, 枠が無く足せない人数: 枠が無く足せない } : '対象外',
    紹介文: doCopy ? { 変える人数: 紹介文を変える, 内訳: 紹介文の内訳 } : '対象外',
    保存した人数: saved,
    失敗: results.filter((r) => r.ok === false).length,
    // ★ apply のとき: まだ保存していない人数（時間切れ・失敗）。0 になるまでもう一度流す
    remaining: apply ? Math.max(0, targets.length - saved) : targets.length,
    時間切れ: timedOut,
    results,
  });
}
