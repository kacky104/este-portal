import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';

// ── 外部媒体取り込み: 取得対象の一覧を返す＋前周ぶんの掃除（第28便／掃除は第34便）──────
// 中継役VPS（住宅系IPで駅ちかに到達できる）が毎時これを叩き、
// 返ってきた店舗ぶんだけ駅ちかのHTMLを取得して /api/import/ingest へ送る。
//   GET /api/import/targets  (Authorization: Bearer <CRON_SECRET>)
// VPS側の使い方:
//   1) このリストを受け取る
//   2) 各 shopUrl を取得 → 正規表現 /\/{externalId}\/(\d+)\// で個人ページIDを抽出
//   3) 各個人ページ（shopUrl + castId + '/'）を取得
//   4) POST /api/import/ingest { sourceId, todayISO, casts:[{castId, html}] }
//
// ★★★ mode（第36便・フェーズ4）— 毎時と1日1回で役割を分ける
//   GET /api/import/targets?mode=list … 毎時の周。listMode=true の店は個人ページを1件も取らず、
//     girlslist を1〜2ページ取って POST /api/import/ingest-list に送る（当日の出勤だけ）。
//   GET /api/import/targets            … 1日1回の周（既定・従来どおり）。個人ページで週間予定を維持。
//   ※ 引数なしが従来の挙動なので、VPSが古いままでも壊れない。
//   実測（第36便）: 1周 343リクエスト・約12分 → 毎時13リクエスト・約20秒 ＋ 1日1回330リクエスト。
//   もともとVPSは毎周 girlslist を取っていたのに、castId を抜いたあとHTMLを捨てていた。
//   その捨てていたHTMLに本日の出勤時刻・名前・年齢・サイズが全部載っていた。
//
// ★ 非表示店（salons.is_hidden=true）は必ず除外する（第31便）。
//   フクエスに店舗削除機能は無く、掲載終了した店は is_hidden で伏せて残す設計。
//   ここで絞らないと、掲載終了後も毎時05分に駅ちかを取りに行き、
//   「再掲載時にすぐ復活できるように」残してあるデータを裏で書き換え続けてしまう。
//
// ★★★ ここで「掃除」もやる理由（第34便・禁則234）
//   駅ちかの在籍一覧から消えた子は個人ページを取りに行かないので、最後に書かれた出勤が
//   永久に残る。これを倒す処理は「その店の1周が全部終わったあと」でないと打てない。
//   ingest の中では打てない —— VPSは10件ずつに割って送ってくる（禁則222）ので、
//   chunk 1 を処理した時点で残りを全員倒してしまうから。
//   いっぽう import.sh には flock が入っている（禁則231）ので、このAPIが叩かれた時点で
//   前の1周は必ず完全に終わっている。だから「1周の入口」であるここが唯一の安全な場所になる。
//   VPS側は1行も変えなくてよい。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 掃除の閾値。1店あたりの chunk の広がりは実測で数分（アイリス143名・15chunkで16:13〜16:14）、
// いっぽう前周に書かれた行は60分以上古い。30分はその中間で、両側に十分な余裕がある。
const SWEEP_MARGIN_MS = 30 * 60 * 1000;
// 1回で倒せる上限（その店の今日以降の有効な出勤に対する割合）。駅ちか側の一時的な不調で
// 在籍一覧が短く返ったとき、全員を休みに倒す事故を防ぐ（禁則207と同じ思想の安全弁）。
const SWEEP_MAX_RATIO = 0.3;

type SweepLog = { sourceId: number; salonId: number; swept: number; skipped?: string };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // ★ mode（第36便・フェーズ4）
  //   'list' … 毎時の周。girlslist方式の店（listMode=true）は当日の掃除を
  //            /api/import/ingest-list が自分でやるので、ここでは掃除しない。
  //   'full' … 1日1回の周（既定）。従来どおり全店を「今日以降」で掃除する。
  //   ※ 引数なし＝'full'。VPSが古いままでも挙動が変わらないようにしてある。
  const mode = new URL(req.url).searchParams.get('mode') === 'list' ? 'list' : 'full';

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('salon_import_sources')
    .select('id, salon_id, provider, external_id, shop_url, import_schedule, import_profile, create_missing, list_mode, salons!inner(is_hidden)')
    .eq('is_enabled', true)
    .eq('salons.is_hidden', false)
    .order('id');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const targets = (data ?? []).map((s) => ({
    sourceId: s.id,
    salonId: s.salon_id,
    provider: s.provider,
    externalId: s.external_id,
    shopUrl: s.shop_url,
    importSchedule: s.import_schedule,
    importProfile: s.import_profile,
    createMissing: s.create_missing,
    listMode: s.list_mode,
  }));

  // ── 前周ぶんの掃除 ────────────────────────────────────────────────
  // 有効化は環境変数で行う（IMPORT_SWEEP=on）。既定は off なので、デプロイしただけでは
  // 挙動が変わらない。imported_at が毎時ちゃんと更新されるのを1周ぶん見てから on にすること。
  // 止めたくなったら Vercel の環境変数から IMPORT_SWEEP を消して Redeploy するだけでよい。
  const sweep: SweepLog[] = [];
  if (process.env.IMPORT_SWEEP === 'on') {
    const todayISO = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); // Asia/Tokyo
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    let touched = 0;

    for (const t of targets) {
      const log: SweepLog = { sourceId: t.sourceId, salonId: t.salonId, swept: 0 };

      // ★ girlslist方式の店を毎時ここで掃除してはいけない（第36便）。
      //   この掃除は「今日以降」の行を見るが、その店の明日以降の行は1日1回の full 周でしか
      //   更新されない。毎時打つと、明日以降の予定が丸ごと「古い」と判定されて倒れる。
      //   当日ぶんは ingest-list が「一覧に居ない＝在籍から消えた」で直接倒している。
      if (mode === 'list' && t.listMode) { log.skipped = 'list mode（当日ぶんは ingest-list が掃除する）'; sweep.push(log); continue; }

      // 安全弁1: 直近1時間に成功した回があり、失敗した回が無いこと。
      // 取得に失敗した周のあとで倒すと、届かなかったのを「消えた」と誤認する。
      const { data: runs } = await supabase
        .from('salon_import_runs')
        .select('status')
        .eq('source_id', t.sourceId)
        .gte('started_at', hourAgo);
      const statuses = (runs ?? []).map((r) => r.status as string);
      if (!statuses.includes('ok') || statuses.includes('error')) {
        log.skipped = 'no clean run in the last hour';
        sweep.push(log);
        continue;
      }

      const { data: ths } = await supabase.from('therapists').select('id').eq('salon_id', t.salonId);
      const ids = (ths ?? []).map((r) => r.id as number);
      if (ids.length === 0) { log.skipped = 'no therapists'; sweep.push(log); continue; }

      // その店の「直近の取り込み時刻」= 前周の最後の chunk が書いた時刻。
      const { data: newest } = await supabase
        .from('therapist_schedules')
        .select('imported_at')
        .in('therapist_id', ids)
        .gte('schedule_date', todayISO)
        .not('imported_at', 'is', null)
        .order('imported_at', { ascending: false })
        .limit(1);
      const latest = newest?.[0]?.imported_at as string | undefined;
      if (!latest) { log.skipped = 'no imported rows yet'; sweep.push(log); continue; }
      const cutoff = new Date(new Date(latest).getTime() - SWEEP_MARGIN_MS).toISOString();

      // 倒す候補。imported_at が NULL の行（＝人が入れた行）はここで確実に外れる。
      //
      // ★ 既知のトレードオフ（第34便）: ingest は cast.schedule.length > 0 のときだけ upsert する
      //   （禁則207の安全弁）。だから個人ページの解析に失敗した子は imported_at が更新されず、
      //   ここで倒される。ただし
      //     ・駅ちかのレイアウト変更で全員が解析失敗 → 下の安全弁2（3割）が効いて中止される
      //     ・単発の取得失敗 → その子だけ1時間休みになるが、次の回で復活する（自己修復する）
      //   ので許容している。もし「解析失敗の子は触らない」を厳密にやりたくなったら、
      //   ingest 側で schedule が空でも imported_at だけは更新する形に変えること。
      const { data: stale } = await supabase
        .from('therapist_schedules')
        .select('id')
        .in('therapist_id', ids)
        .gte('schedule_date', todayISO)
        .not('imported_at', 'is', null)
        .lt('imported_at', cutoff)
        .eq('is_active', true);
      const staleIds = (stale ?? []).map((r) => r.id as number);
      if (staleIds.length === 0) { sweep.push(log); continue; }

      // 安全弁2: 一度に倒しすぎない。
      const { count } = await supabase
        .from('therapist_schedules')
        .select('id', { count: 'exact', head: true })
        .in('therapist_id', ids)
        .gte('schedule_date', todayISO)
        .eq('is_active', true);
      const live = count ?? 0;
      if (live > 0 && staleIds.length / live > SWEEP_MAX_RATIO) {
        log.skipped = `too many (${staleIds.length}/${live}) — 駅ちか側の不調を疑うこと`;
        sweep.push(log);
        continue;
      }

      // 倒す。行は消さない（is_active=false にするだけ）ので、updated_at で後から追える。
      const { error: upErr } = await supabase
        .from('therapist_schedules')
        .update({ is_active: false, start_time: null, end_time: null, updated_at: new Date().toISOString() })
        .in('id', staleIds);
      if (upErr) { log.skipped = upErr.message; sweep.push(log); continue; }

      log.swept = staleIds.length;
      touched += staleIds.length;
      sweep.push(log);
    }

    // 倒した行があれば公開ページを無効化する（禁則227: ルート雛形＋layout）。
    if (touched > 0) {
      revalidatePath('/salon/[id]', 'layout');
      revalidatePath('/hp/[slug]', 'layout');
      revalidatePath('/therapist/[id]', 'layout');
      revalidatePath('/area/[slug]', 'page');
      revalidatePath('/');
    }
  }

  return NextResponse.json({ ok: true, mode, count: targets.length, targets, sweep }, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
