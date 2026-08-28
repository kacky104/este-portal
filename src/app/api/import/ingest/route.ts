import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { parseEkichikaCast, normalizeName } from '@/lib/ekichikaParse';
import { loadCastIds, rememberCastId } from '@/lib/mediaCastIds';

// ── 外部媒体取り込み: 個人ページHTMLを受けて解析・照合・反映（第28便）──────
// 中継役VPSが集めた個人ページの生HTMLを受け取り、
//   1) パーサーで {名前・年齢・サイズ・出勤} に変換
//   2) castId → 名前 の順でフクエスのセラピストと照合（名前は正規化して完全一致）
//      設定 create_missing が ON なら、どちらでも当たらなかった子を非公開で新規作成する（第35便）
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
//
// ★★ create_missing（第35便・禁則242の解消）
//   駅ちかにいてフクエスにいない子を作る。作るのは salon_id・name・area・年齢・サイズ・castId だけで、
//   写真もキャッチも入らない。そのまま公開すると写真なしのカードが一斉に並ぶので
//   is_active=false（非公開）で作り、オーナーが中身を入れてから公開する運用にした。
//   作られたことはサイトからは分からないので、salon_import_runs.created / created_names に残す。
//
// ★★ 照合に castId を使う理由（第35便）
//   名前だけで照合していると、フクエス側で名前を変えた子が「未登録」に見えて、
//   create_missing が重複レコードを静かに作ってしまう。castId が入っている子は castId を先に見る。
//   既存の子は import_cast_id が空なので、当面は実質これまでどおり名前照合で動く。
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

// ★ create_missing で作ってよい名前か（第35便）。
//   駅ちかには伏字がそのまま入っていることがある（アイリスに「〇〇」が実在した）。
//   これを作ると「〇〇」というセラピストが生まれてしまうので弾く。
//   ここで落ちた子は unmatched に理由つきで残るので、オーナーが手で登録すればよい。
const MASK_ONLY = /^[〇○●◯＊*xX×✕✖?？!！_＿\-ー–—\s]*$/;
function isCreatableName(raw: string): boolean {
  const name = raw.trim();
  if (!name) return false;
  if (name.length > 20) return false;   // 解析失敗で本文が丸ごと入った類を弾く
  if (MASK_ONLY.test(name)) return false;
  if (!normalizeName(name)) return false;
  return true;
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
    .select('id, salon_id, is_enabled, provider, slot, import_schedule, import_profile, create_missing, salons!inner(is_hidden, area)')
    .eq('id', sourceId)
    .single();
  if (srcErr || !source) return NextResponse.json({ ok: false, error: 'source not found' }, { status: 404 });
  if (!source.is_enabled) return NextResponse.json({ ok: true, skipped: 'disabled' });

  // ★ 非表示店（salons.is_hidden=true）は取り込まない（第31便）。
  //   targets 側でも除外しているが、VPSが古いリストを持っていた場合や
  //   手動実行に備えて受け口側でも止める（禁則207と同じ安全弁の考え方）。
  type SalonRel = { is_hidden?: boolean; area?: string | null };
  const salonRel = (source as unknown as { salons?: SalonRel | SalonRel[] | null }).salons;
  const salonRow: SalonRel | undefined = Array.isArray(salonRel) ? salonRel[0] : (salonRel ?? undefined);
  const isHidden = salonRow?.is_hidden === true;
  if (isHidden) return NextResponse.json({ ok: true, skipped: 'hidden' });
  const salonArea = salonRow?.area ?? null;
  // ★★★ 枠（第42便）。castId は枠ごとに別番号（第38便 §17-11）。ingest-list と同じ規則。
  const provider = String((source as unknown as { provider?: string | null }).provider ?? 'ekichika');
  const slot = Number((source as unknown as { slot?: number | null }).slot ?? 1);

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
    .select('id, name, import_aliases, import_cast_id')
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

  // ★ castId の索引は「媒体×枠」で引く（第42便）。旧 import_cast_id は駅ちかの枠1としてのみ混ざる。
  const { maps: castMaps, error: castErr } = await loadCastIds(supabase, {
    therapists: (therapists ?? []) as Array<{ id: number; import_cast_id?: string | null }>,
    provider,
    slot,
  });
  if (castErr) {
    if (runId) await supabase.from('salon_import_runs').update({ status: 'error', error: castErr, finished_at: new Date().toISOString() }).eq('id', runId);
    return NextResponse.json({ ok: false, error: castErr, stage: 'cast-ids' }, { status: 500 });
  }
  const byCastId = castMaps.byCastId;             // castId → therapist_id
  const castIdOf = castMaps.castIdOf;             // therapist_id → いまの castId

  // ★ この chunk が書いた行の印（第34便・禁則234）。
  //   掃除処理（/api/import/targets）はこの列だけを見る。updated_at は手作業でも動くので使えない。
  //   VPSは10件ずつに割って送ってくる（禁則222）ので、chunk ごとに別の時刻が入る。
  //   掃除側は「その店の最新 imported_at から30分以上古い行」を対象にして chunk の差を吸収する。
  const importedAt = new Date().toISOString();

  const unmatched: string[] = [];
  const createdNames: string[] = [];
  let matched = 0;
  let schedulesUpserted = 0;
  let profilesUpdated = 0;
  let castIdFilled = 0;

  // 4. 個人ページごとに解析・照合・反映
  for (const c of casts) {
    if (!c.html) continue;
    const cast = parseEkichikaCast(c.html, todayISO);
    if (!cast.name) continue;
    const key = normalizeName(cast.name);
    if (!key) continue;

    // 4-0. 照合: castId（確実）→ 名前（従来）の順に引く。
    //   castId が入っているのは第35便以降に新規作成した子だけなので、当面はほぼ名前照合で動く。
    let therapistId: number | undefined = c.castId ? byCastId.get(c.castId) : undefined;
    if (therapistId === undefined) {
      if (dupNames.has(key)) { unmatched.push(`${cast.name}（同名2名以上・自動更新を保留）`); continue; }
      therapistId = byName.get(key);
    }

    // 4-0b. どちらでも当たらなかった子。create_missing が ON なら非公開で作る（第35便）。
    let isNew = false;
    if (therapistId === undefined) {
      if (!source.create_missing) { unmatched.push(cast.name); continue; }
      if (!isCreatableName(cast.name)) {
        unmatched.push(`${cast.name}（伏字・記号のみ・作成せず）`);
        continue;
      }
      const { data: made, error: mkErr } = await supabase
        .from('therapists')
        .insert({
          salon_id: source.salon_id,
          name: cast.name.trim(),
          area: salonArea,
          is_active: false,                 // ★ 非公開で作る。公開はオーナーが中身を入れてから。
          age: source.import_profile ? cast.age : null,
          body_type: source.import_profile ? cast.bodyType : null,
        })
        .select('id')
        .single();
      if (mkErr || !made) {
        unmatched.push(`${cast.name}（作成失敗: ${mkErr?.message ?? 'unknown'}）`);
        continue;
      }
      therapistId = made.id as number;
      // ★ 新規作成した子の castId は、枠ごとの表に記録する（第42便）。
      if (c.castId) {
        await rememberCastId(supabase, { therapistId, provider, slot, castId: c.castId });
        castIdOf.set(therapistId, c.castId);
      }
      // 同じ chunk に同名がもう一度来ても二重に作らないよう、その場で索引へ入れる。
      byName.set(key, therapistId);
      if (c.castId) byCastId.set(c.castId, therapistId);
      createdNames.push(cast.name.trim());
      isNew = true;
    }

    if (!isNew) matched++;

    // ★★ castId の一括埋め（第36便）
    //   名前で当たった子のうち import_cast_id が空のものを埋めておくと、次回から castId 照合に乗る。
    //   「フクエス側で名前を変えた子が未登録に見えて重複が増える」（禁則249）を防ぐ。
    //   ★ 既に別の子がその castId を持っている場合は埋めない（取り違えを固定しないため）。
    if (!isNew && c.castId && !castIdOf.get(therapistId) && !byCastId.has(c.castId)) {
      // ★ 枠ごとの表へ。駅ちかの枠1なら旧列にも同じ値を写す（併存・第42便）。
      const { ok } = await rememberCastId(supabase, { therapistId, provider, slot, castId: c.castId });
      if (ok) {
        castIdOf.set(therapistId, c.castId);
        byCastId.set(c.castId, therapistId);
        castIdFilled++;
      }
    }

    // 4a. 出勤（設定ON かつ 出勤/休みの行があるときだけ）
    if (source.import_schedule && cast.schedule.length > 0) {
      const rows = cast.schedule.map((d) => ({
        therapist_id: therapistId,
        schedule_date: d.date,
        is_active: d.status === 'work',
        start_time: d.status === 'work' ? d.start : null,
        end_time: d.status === 'work' ? d.end : null,
        imported_at: importedAt,
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
      created: createdNames.length,
      created_names: createdNames,
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
    castIdFilled,
    created: createdNames.length,
    createdNames,
  }, {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
