import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { needsConsent } from '@/lib/mediaConsent';

// ── 即ヒメの周（第215便・2026-09-08）─────────────────────────────────────
//   POST /api/admin/sokuhime-push  (Authorization: Bearer <CRON_SECRET>)
//   body(form): （なし）                    … ★ 数えるだけ。中継ジョブを積まない
//   body(form): dryrun=true                 … ★ 積むが【試し打ち】。駅ちかを1文字も触らない
//                                              （読んで計画を「連携の記録」に残すだけ）
//   body(form): apply=true                  … ★★★ 実弾。1周1店舗1人だけ押す
//   body(form): salonId=6 therapistId=14    … ★ 運営が1人だけ試す（sokuhime_push・試し打ち既定）
//   body(form): salonId=6 therapistId=14 apply=true … ★ 運営が1人だけ実弾
//
// ★★★ フクエスの「今すぐ」がONの方を、駅ちかの「即ヒメ」枠へ載せる。
//   ★ 押してから45分で消えるので、今すぐが続いていれば次の周が押し直す（planSokuhime が
//     切れた枠を空きとみなす）。
//   ★★ フクエスの「今すぐ」が終わった方は、**フクエスが押した枠だけ**外す
//     （media_sokuhime_pushes に記録がある子だけ・pushedByFukues）。
//     ★ 店舗様が駅ちかで直接押した子は絶対に触らない。
//
// ★★★ **1回のフローで押すのは1人だけ。** ★ 「全員にまとめて」は作らない。
//   ★ 相手のアカウントを触る操作なので、1人ずつ・照合しながら進む（第143便 即セラと同じ作法）。
//   ★ 残りは次の周が拾う（5分ごと・今すぐは30分もつ）。
//
// ★★★ ベンリー（Mr.Venrey）などの「即姫」タイマーを使っている店では、
//   相手のほうが先に枠を埋めることがある。★ そのときフクエスは **必ず譲る**
//   （planSokuhime が already_on で送らない）。★ 二重登録しない。
//
// ★ 対象（★ 3つとも要る）:
//     ① 駅ちかが「フクエスから反映」（link_mode が write / write_auto）
//     ② 即ヒメの自動が入っている（sokuhime_auto = true・第215便で足した1列）
//     ③ 連携の説明に同意済み（認証情報を使う操作は同意の後ろ）
//   ★★ ① を外さない。★ 駅ちかから取り込んでいる店へフクエスから書かない（第214便の方針）。
//
// crontab（VPS・5分ごと。★ 即セラ 1-59/5・日記 と分を分ける）:
//   ★ まずは1日、試し打ちで流す（駅ちかを触らない・記録だけ溜める）:
//   3-59/5 * * * * . /root/import.env; /usr/bin/curl -sS -X POST https://fukues.com/api/admin/sokuhime-push --oauth2-bearer $CRON_SECRET -d dryrun=true >> /root/import.log 2>&1
//   ★ 記録が狙いどおりなら、-d dryrun=true を -d apply=true に差し替える（実弾）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROVIDER = 'ekichika';
/** ★ 1周で積む店舗の上限。★ 一度に走らせすぎない（即セラの周と同じ） */
const MAX_SALONS_PER_RUN = 5;

async function readBody(req: Request): Promise<Record<string, string>> {
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  const o: Record<string, string> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      const v = JSON.parse(text) as unknown;
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) o[k] = String(x);
    } catch { /* 空のまま */ }
    return o;
  }
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  return o;
}

const yes = (v: string | undefined) => v === 'true' || v === '1';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const apply = yes(body.apply);
  const dryrun = yes(body.dryrun);
  const oneSalon = Number(body.salonId);
  const oneTherapist = Number(body.therapistId);

  // ★★ 運営が1人だけ試す道（★ 相手を名指しする）。★ apply を付けなければ試し打ち
  if (Number.isFinite(oneSalon) && oneSalon > 0 && Number.isFinite(oneTherapist) && oneTherapist > 0) {
    const r = await startRelayFlow({
      salonId: oneSalon, provider: PROVIDER, slot: 1,
      intent: 'sokuhime_push',
      sokuhime: { therapistId: oneTherapist, apply },
      actor: 'admin:sokuhime-push',
    });
    return NextResponse.json({ ...r, salonId: oneSalon, therapistId: oneTherapist, apply, intent: 'sokuhime_push' });
  }

  const svc = createServiceClient();
  // ★ 駅ちかへ「書く」向き ＋ 即ヒメの自動が入っている枠だけ
  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('salon_id, slot')
    .eq('provider', PROVIDER).eq('is_enabled', true).eq('sokuhime_auto', true)
    .in('link_mode', ['write', 'write_auto']);
  if (srcErr) return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });

  const rows = (sources ?? []) as Array<{ salon_id: number; slot: number }>;

  // ★★ 同意済みの枠だけ（認証情報を使う操作は同意の後ろ）。★ 1回のクエリで引く
  const { data: creds, error: credErr } = await svc
    .from('salon_media_credentials')
    .select('salon_id, slot, consent_version')
    .eq('provider', PROVIDER)
    .in('salon_id', rows.length > 0 ? rows.map((r) => Number(r.salon_id)) : [0]);
  if (credErr) return NextResponse.json({ ok: false, error: credErr.message }, { status: 500 });
  const consentOk = new Set<string>();
  for (const c of (creds ?? []) as Array<{ salon_id: number; slot: number; consent_version: string | null }>) {
    if (!needsConsent(c.consent_version)) consentOk.add(Number(c.salon_id) + '#' + Number(c.slot ?? 1));
  }

  const started: string[] = [];
  const skipped: Array<{ target: string; why: string }> = [];

  for (const r of rows) {
    const target = r.salon_id + '/' + PROVIDER + '#' + r.slot;
    if (!consentOk.has(Number(r.salon_id) + '#' + Number(r.slot))) {
      skipped.push({ target, why: '連携の説明にまだ同意していない' });
      continue;
    }
    if (started.length >= MAX_SALONS_PER_RUN) { skipped.push({ target, why: '今回の上限に達したので次の周へ' }); continue; }
    // ★ dryrun も apply も付いていなければ、数えるだけ（中継ジョブを積まない）
    if (!apply && !dryrun) { started.push(target); continue; }
    try {
      const res = await startRelayFlow({
        salonId: Number(r.salon_id), provider: PROVIDER, slot: Number(r.slot),
        intent: 'sokuhime_auto',
        // ★★★ apply が明示 true のときだけ実弾。★ dryrun は読んで計画を残すだけ
        sokuhime: { apply },
        actor: 'cron:sokuhime-push',
      });
      // ★ 枠が塞がっている（busy）のは【正常】。★ 次の周が拾う
      if (!res.ok) { skipped.push({ target, why: res.note }); continue; }
      started.push(target);
    } catch (e) {
      skipped.push({ target, why: '開始できなかった: ' + (e instanceof Error ? e.message : 'unknown') });
    }
  }

  return NextResponse.json({
    ok: true, apply, dryrun, targets: rows.length, started, skipped,
    見かた: apply
      ? '中継ジョブを積みました。1店舗につき1人だけ押します。結果は各店舗の「連携の記録」に出ます'
      : dryrun
        ? '★ 試し打ちで積みました。駅ちかは1文字も触りません。計画だけが「連携の記録」に出ます'
        : '★ 数えただけです。中継ジョブを積んでいません',
  });
}
