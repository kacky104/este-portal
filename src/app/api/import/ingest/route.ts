import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { parseEkichikaCast, normalizeName } from '@/lib/ekichikaParse';

// ── 外部媒体取り込み: 個人ページHTMLを受けて解析・照合・反映（第28便）──────
// 中継役VPSが集めた個人ページの生HTMLを受け取り、
//   1) パーサーで {名前・年齢・サイズ・出勤} に変換
//   2) 名前でフクエスのセラピストと照合（正規化して完全一致）
//   3) 出勤を therapist_schedules に upsert
//      （出勤=時刻あり / 休み・未入力=is_active false。未入力の扱いは第30便で「触らない」から変更）
//   4) 年齢・サイズを therapists に update（設定でON時のみ）
//   5) 公開ページ（/salon・/hp・/therapist・トップ）を即時無効化
//   6) 実行結果を salon_import_runs に記録
//   POST /api/import/ingest  (Authorization: Bearer <CRON_SECRET>)
//   body: { sourceId:number, todayISO:'YYYY-MM-DD', casts:[{castId:string, html:string}] }
//
// ★ 原則: 「駅ちかが正本」の店舗だけ取り込む（A モード）。フクエスの手入力は上書きされる。
//   同名がフクエスに2人いる場合は誤更新を避けて両方スキップ（unmatched に記録）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type IngestBody = {
  sourceId?: number;
  todayISO?: string;
  casts?: Array<{ castId?: string; html?: string }>;
};

function isValidISO(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const sourceId = body.sourceId;
  const todayISO = body.todayISO;
  const casts = Array.isArray(body.casts) ? body.casts : [];
  if (typeof sourceId !== 'number' || !isValidISO(todayISO) || casts.length === 0) {
    return NextResponse.json({ ok: false, error: 'sourceId, todayISO, casts are required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 1. 取り込み設定を読む
  const { data: source, error: srcErr } = await supabase
    .from('salon_import_sources')
    .select('id, salon_id, is_enabled, import_schedule, import_profile, create_missing')
    .eq('id', sourceId)
    .single();
  if (srcErr || !source) return NextResponse.json({ ok: false, error: 'source not found' }, { status: 404 });
  if (!source.is_enabled) return NextResponse.json({ ok: true, skipped: 'disabled' });

  // 2. 実行ログ開始
  const { data: run } = await supabase
    .from('salon_import_runs')
    .insert({ source_id: sourceId, status: 'running', fetched: casts.length })
    .select('id')
    .single();
  const runId = run?.id as number | undefined;

  // 3. フクエスの在籍を読み、正規化名の索引を作る（同名は重複として記録）
  //    name に加えて import_aliases（取り込み用別名）も索引に載せる。
  //    駅ちか側だけ表記が違う子（例: 駅ちか「愛」⇔フクエス「アイ」）を名前を変えずに結びつける。
  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, name, import_aliases')
    .eq('salon_id', source.salon_id);
  if (thErr) {
    if (runId) await supabase.from('salon_import_runs').update({ status: 'error', error: thErr.message, finished_at: new Date().toISOString() }).eq('id', runId);
    return NextResponse.json({ ok: false, error: thErr.message }, { status: 500 });
  }
  const byName = new Map<string, number>();      // 正規化名 → therapist_id
  const dupNames = new Set<string>();            // フクエス側で重複する正規化名
  for (const t of therapists ?? []) {
    const id = t.id as number;
    const raws = [t.name as string, ...((t.import_aliases as string[] | null) ?? [])];
    for (const raw of raws) {
      const key = normalizeName(raw);
      if (!key) continue;
      const existing = byName.get(key);
      // 同じ子の name と別名が同じ正規化名になるのは重複扱いにしない
      if (existing !== undefined && existing !== id) dupNames.add(key);
      else byName.set(key, id);
    }
  }

  const unmatched: string[] = [];
  let matched = 0;
  let schedulesUpserted = 0;
  let profilesUpdated = 0;

  // 4. 個人ページごとに解析・照合・反映
  for (const c of casts) {
    if (!c.html) continue;
    const cast = parseEkichikaCast(c.html, todayISO);
    if (!cast.name) continue;
    const key = normalizeName(cast.name);
    if (!key) continue;

    if (dupNames.has(key)) { unmatched.push(`${cast.name}（同名2名以上・自動更新を保留）`); continue; }
    const therapistId = byName.get(key);
    if (!therapistId) { unmatched.push(cast.name); continue; }
    matched++;

    // 4a. 出勤（設定ON かつ 出勤/休みの行があるときだけ）
    if (source.import_schedule && cast.schedule.length > 0) {
      const rows = cast.schedule.map((d) => ({
        therapist_id: therapistId,
        schedule_date: d.date,
        is_active: d.status === 'work',
        start_time: d.status === 'work' ? d.start : null,
        end_time: d.status === 'work' ? d.end : null,
      }));
      const { error } = await supabase
        .from('therapist_schedules')
        .upsert(rows, { onConflict: 'therapist_id,schedule_date' });
      if (!error) schedulesUpserted += rows.length;
    }

    // 4b. 年齢・サイズ（設定ON かつ 取れた値だけ）
    if (source.import_profile) {
      const patch: Record<string, string> = {};
      if (cast.age) patch.age = cast.age;
      if (cast.bodyType) patch.body_type = cast.bodyType;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('therapists').update(patch).eq('id', therapistId);
        if (!error) profilesUpdated++;
      }
    }
  }

  // 5. 公開ページを即時無効化（cron には cookie が無いので /api/revalidate は使わず直接呼ぶ）
  revalidatePath('/salon/[id]', 'layout');
  revalidatePath('/hp/[slug]', 'layout');
  revalidatePath('/therapist/[id]', 'layout');
  revalidatePath('/area/[slug]', 'page');
  revalidatePath('/');

  // 6. 実行ログ確定＋設定側にも最終結果を反映
  const finishedAt = new Date().toISOString();
  if (runId) {
    await supabase.from('salon_import_runs').update({
      status: 'ok',
      finished_at: finishedAt,
      matched,
      unmatched,
      schedules_upserted: schedulesUpserted,
      profiles_updated: profilesUpdated,
    }).eq('id', runId);
  }
  await supabase.from('salon_import_sources').update({
    last_run_at: finishedAt,
    last_status: 'ok',
    last_error: null,
    updated_at: finishedAt,
  }).eq('id', sourceId);

  return NextResponse.json({
    ok: true,
    fetched: casts.length,
    matched,
    unmatched,
    schedulesUpserted,
    profilesUpdated,
  });
}
