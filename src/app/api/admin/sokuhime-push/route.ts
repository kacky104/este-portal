import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { needsConsent } from '@/lib/mediaConsent';
// ★ 第325便: 「いま今すぐの人がいるか」を、画面と同じ物差しで見る（★ 決め方を2つ持たない）
import { isOwnerLiveRow, isCastLiveRow, type ImasuguRow } from '@/lib/imasugu';

// ── 即ヒメの周（第215便・2026-09-08）─────────────────────────────────────
//   POST /api/admin/sokuhime-push  (Authorization: Bearer <CRON_SECRET>)
//   body(form): （なし）                    … ★ 数えるだけ。中継ジョブを積まない
//   body(form): dryrun=true                 … ★ 積むが【試し打ち】。駅ちかを1文字も触らない
//                                              （読んで計画を「連携の記録」に残すだけ）
//   body(form): apply=true                  … ★★★ 実弾。1周1店舗【最大6人】まとめて押す（第327便）
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
// ★★★★ 【第327便】（2026-09-13・カッキーさんの指示）: **1回のフローで最大6人**（それまでは1人だけ）。
//   ★ 理由: 即ヒメ枠はオプションで15枠まで増やせる。1周1人・5分ごとでは45分の「今すぐ」の間に
//     9人しか通せず、枠が埋まらないまま終わっていた（★ ラビリンス様は5枠だが、15枠の店がある）。
//   ★★ 代わりに【周を10分に延ばす】。★ 駅ちかへのログインは 12回/時 → 6回/時（半分）。
//     ★ 通せる人数は 45分で9人 → 45分で最大24人。★ ログインを減らしつつ、詰まりも消える。
//   ★★★ 1人ずつ「確認→設定」を送るのは今までどおり（相手のアカウントを触るので順番に）。
//     ★ 変えたのは【照合】だけ: 1人ごとに読み直していたのを、**最後に1回だけ読み直して全員まとめて**照合する。
//     ★ だから1周の通信は「1人につき POST 2回 ＋ 最後に GET 1回」。
//   ★ 1人がだめ（在籍していない・出勤中でない）でも周ごと落とさない。★ その人の理由を記録して次の人へ。
//   ★ 残りは次の周が拾う（10分ごと・今すぐは45分もつ・第326便で30分から延ばした）。
//
// ★★★ ベンリー（Mr.Venrey）などの「即姫」タイマーを使っている店では、
//   相手のほうが先に枠を埋めることがある。★ そのときフクエスは **必ず譲る**
//   （planSokuhime が already_on で送らない）。★ 二重登録しない。
//
// ★ 対象（★ 2つとも要る）:
//     ① 駅ちかが「フクエスから反映」（link_mode が write / write_auto）
//     ② 連携の説明に同意済み（認証情報を使う操作は同意の後ろ）
//   ★★ ① を外さない。★ 駅ちかから取り込んでいる店へフクエスから書かない（第214便の方針）。
//
// ★★★★ 【第323便】（2026-09-13・カッキーさんの指示）: 「即ヒメの自動が入っている店だけ」（sokuhime_auto）を
//   **条件から外した**。★ エステ魂の即セラ（sokusera-push）と同じく、【フクエスから反映なら自動】に揃えた。
//   ★ 同じ画面に2つの決まりが並んでいて、店舗様が取り違えた（★ 即セラはスイッチ無しで動く）。
//   ★★ sokuhime_auto の列と受け口（setSokuhimeAuto）は残してあるが、**この周はもう見ない**。
//     ★ 落ち着いたら消す。★ 見ない列を残していることを、ここに書いておく（★ 次に読む人が探せるように）。
//   ★ 実行前にカッキーさんが確認: 駅ちかを write にしている店舗はラビリンス様だけ（2026-09-13）。
//
// crontab（VPS・★ 第327便で10分ごとへ）:
//   ★★ 2026-09-13 に VPS を見たら、**この行はそもそも入っていなかった**（第215便で入れ忘れ）。
//     ★ つまり即ヒメの周は、この日まで一度も回っていない。★ 同じ取りこぼしを防ぐため、ここに実物を写しておく。
//   ★ 分は 8-59/10（8・18・28・38・48・58分）。★ 他の周とぶつからない分を選んだ:
//       3-59/10 … work-news-auto ／ */10 … announce-auto
//       */5・1-59/5 … diary-auto-push・sokusera-push・article-auto（★ 8 は5で割り切れないので当たらない）
//   ★ まず試し打ち（駅ちかを1文字も触らない・記録だけ溜める）:
//   8-59/10 * * * * . /root/import.env; /usr/bin/curl -sS -X POST https://fukues.com/api/admin/sokuhime-push --oauth2-bearer $CRON_SECRET -d dryrun=true >> /root/import.log 2>&1
//   ★ 記録が狙いどおりなら dryrun=true を apply=true に差し替える（実弾）:
//   8-59/10 * * * * . /root/import.env; /usr/bin/curl -sS -X POST https://fukues.com/api/admin/sokuhime-push --oauth2-bearer $CRON_SECRET -d apply=true >> /root/import.log 2>&1
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
  // ★ 駅ちかへ「書く」向きの枠だけ（★ 第323便: sokuhime_auto は見ない。即セラの周と同じ条件）
  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('salon_id, slot')
    .eq('provider', PROVIDER).eq('is_enabled', true)
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

  /**
   * ★★★★ 【第325便】（2026-09-13・カッキーさんの指示）: 【仕事がある店舗だけ】積む。
   *   ★ それまでは、フクエスから反映の枠なら**誰も「今すぐ」でなくても周のたびにログイン**していた。
   *     ★ 相手のサイトに用も無く入る回数は、少ないほうがよい（★ 中継の枠も無駄に埋まる）。
   *   ★★ 「仕事がある」は2つ。★ 片方だけだと**外す仕事が永久に走らない**:
   *     ① いま「今すぐ」の方がいる（★ これから上げる）
   *     ② フクエスが入れた枠が残っている（★ 「今すぐ」が終わったら外す・removed_at が空）
   *   ★ ①の物差しは画面（getSokuhimeCandidates）とも中継（planSokuhime）とも同じ関数を使う。
   *     ★ 取り込み枠（駅ちか由来）は数えない（★ エコーバックしない・第214便）。
   *   ★★ ここは【積むかどうか】だけを決める。★ 誰を上げるかは今までどおり中継の中で決める
   *     （★ 枠の空きは駅ちかを読まないと分からない。★ ここで decide しない）。
   */
  const ids = rows.map((r) => Number(r.salon_id));
  const now = new Date();
  const liveSalons = new Set<number>();
  const openSalons = new Set<number>();
  if (ids.length > 0) {
    const { data: ths, error: thErr } = await svc
      .from('therapists')
      .select('salon_id, is_available_now, available_until, is_available_now_cast, available_until_cast, is_available_now_import, available_until_import')
      .in('salon_id', ids).eq('is_active', true);
    if (thErr) return NextResponse.json({ ok: false, error: thErr.message }, { status: 500 });
    for (const t of (ths ?? []) as Array<Record<string, unknown>>) {
      const row = t as unknown as ImasuguRow;
      if (isOwnerLiveRow(row, now) || isCastLiveRow(row, now)) liveSalons.add(Number(t['salon_id']));
    }
    // ★★ 24時間より古い記録は数えない。★ 中継の計画（planSokuhime）が見る範囲と同じにする。
    //   ★ ここを広くすると、中継が触らない古い1行のせいで【永久に周のたびにログイン】になる。
    const { data: open, error: opErr } = await svc
      .from('media_sokuhime_pushes')
      .select('salon_id')
      .eq('provider', PROVIDER).is('removed_at', null)
      .gte('pushed_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString())
      .in('salon_id', ids);
    if (opErr) return NextResponse.json({ ok: false, error: opErr.message }, { status: 500 });
    for (const o of (open ?? []) as Array<{ salon_id: number }>) openSalons.add(Number(o.salon_id));
  }

  const started: string[] = [];
  const skipped: Array<{ target: string; why: string }> = [];

  for (const r of rows) {
    const target = r.salon_id + '/' + PROVIDER + '#' + r.slot;
    if (!consentOk.has(Number(r.salon_id) + '#' + Number(r.slot))) {
      skipped.push({ target, why: '連携の説明にまだ同意していない' });
      continue;
    }
    // ★ 第325便: 上げる人も、外す枠も無い店舗には入らない（★ 用が無いのにログインしない）
    if (!liveSalons.has(Number(r.salon_id)) && !openSalons.has(Number(r.salon_id))) {
      skipped.push({ target, why: '「今すぐ」の方がいない（外す枠も無い）ので入らなかった' });
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
