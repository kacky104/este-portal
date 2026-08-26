import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { normalizeName } from '@/lib/ekichikaParse';
import { parseEkichikaList, type EkichikaListCast } from '@/lib/ekichikaListParse';

// ── 外部媒体取り込み・girlslist方式（第36便・フェーズ4）────────────────────
// 駅ちかの「女の子一覧」(girlslist) のHTMLを受け取り、当日ぶんの出勤を反映する。
//   POST /api/import/ingest-list  (Authorization: Bearer <CRON_SECRET>)
//   body: { sourceId:number, todayISO:'YYYY-MM-DD', pages:[html,...], apply?:boolean }
//
// ★★★ なぜ作ったか（第36便で実測）
//   VPSの import.sh は毎周 girlslist を取っているが、castId を抜いたあとHTMLを捨てていた。
//   その捨てていたHTMLに本日の出勤時刻・名前・年齢・サイズが全部載っている。
//   つまり手元にある情報を捨てて、同じものを個人ページ330件で取り直していた。
//     1周 343リクエスト・約12分  →  13リクエスト・約20秒（26分の1）
//
// ★★★ 役割分担（既存の /api/import/ingest は消さない）
//   当日ぶん   … このルート。girlslist を毎時。
//   週間予定   … 従来の /api/import/ingest。個人ページを1日1回（03:05）。
//   一覧ページには週間予定が載っていないので、片方だけでは足りない。
//
// ★★ apply の既定は false（試し打ち）。
//   false のときは1行も書かず、「何を書くつもりか」と「いまDBに入っている値」の差分だけ返す。
//   第35便の反省「検証したことと、送り届けたことは別」への構造的な答えで、
//   本番に当てる前に必ず差分を目で見られるようにしてある。
//
// ★★★ 掃除がここで打てる理由（禁則234が構造的に消える）
//   従来の ingest は「VPSが10件ずつ割って送ってくる」ので、chunk 1 の時点で
//   残り全員を倒してしまう危険があり、掃除は1周の入口（targets）でしか打てなかった。
//   girlslist方式は1店ぶんが1回のPOSTで揃うので、「一覧に居ない＝在籍から消えた」を
//   その場で直接判定できる。imported_at の時刻差から間接的に推測する必要が無くなる。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 一度に倒せる上限（その店の当日の有効な出勤に対する割合）。駅ちか側の一時的な不調で
// 一覧が短く返ったとき、全員を休みに倒す事故を防ぐ（targets の SWEEP_MAX_RATIO と同じ思想）。
const SWEEP_MAX_RATIO = 0.3;

// 伏字よけ。駅ちかには「〇〇」のような表記が実在する（第35便・アイリスで実測）。
const MASK_ONLY = /^[〇○●◯＊*xX×✕✖?？!！_＿\-ー–—\s]*$/;
function isCreatableName(raw: string): boolean {
  const name = raw.trim();
  if (!name) return false;
  if (name.length > 20) return false;
  if (MASK_ONLY.test(name)) return false;
  if (!normalizeName(name)) return false;
  return true;
}

function isValidISO(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type Body = { sourceId?: number; todayISO?: string; pages?: unknown; apply?: boolean };
type Diff = { name: string; 現在: string; 新規: string };

const show = (a: boolean, s: string | null, e: string | null) =>
  a ? `出勤 ${s ?? '?'}→${e ?? '?'}` : '休み';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const sourceId = body.sourceId;
  const todayISO = body.todayISO;
  const pages = Array.isArray(body.pages) ? (body.pages as unknown[]).filter((p): p is string => typeof p === 'string' && p.length > 0) : [];
  const apply = body.apply === true;
  if (typeof sourceId !== 'number' || !isValidISO(todayISO) || pages.length === 0)
    return NextResponse.json({ ok: false, error: 'sourceId, todayISO, pages are required' }, { status: 400 });

  const supabase = createServiceClient();

  // 1. 取り込み設定
  const { data: source, error: srcErr } = await supabase
    .from('salon_import_sources')
    .select('id, salon_id, is_enabled, external_id, import_schedule, import_profile, create_missing, salons!inner(is_hidden, area)')
    .eq('id', sourceId)
    .single();
  if (srcErr || !source) return NextResponse.json({ ok: false, error: 'source not found' }, { status: 404 });
  if (!source.is_enabled) return NextResponse.json({ ok: true, skipped: 'disabled' });

  type SalonRel = { is_hidden?: boolean; area?: string | null };
  const rel = (source as unknown as { salons?: SalonRel | SalonRel[] | null }).salons;
  const salonRow: SalonRel | undefined = Array.isArray(rel) ? rel[0] : (rel ?? undefined);
  if (salonRow?.is_hidden === true) return NextResponse.json({ ok: true, skipped: 'hidden' });
  const salonArea = salonRow?.area ?? null;
  const externalId = String(source.external_id);

  // 2. 全ページを解析して castId で1本にまとめる（ページ間で重複しても先勝ち）
  const listed = new Map<string, EkichikaListCast>();
  for (const html of pages) {
    for (const c of parseEkichikaList(html, externalId)) {
      if (!listed.has(c.castId)) listed.set(c.castId, c);
    }
  }
  // ★ 安全弁: 一覧が空＝取得失敗かレイアウト変更。何も書かない（禁則207）。
  if (listed.size === 0)
    return NextResponse.json({ ok: false, error: '一覧から1人も取れなかった（取得失敗かレイアウト変更を疑うこと）', pages: pages.length }, { status: 422 });

  // 3. フクエスの在籍と索引（ingest と同じ規則。castId → 名前 の順で引く）
  const { data: therapists, error: thErr } = await supabase
    .from('therapists')
    .select('id, name, import_aliases, import_cast_id')
    .eq('salon_id', source.salon_id);
  if (thErr) return NextResponse.json({ ok: false, error: thErr.message }, { status: 500 });

  const byName = new Map<string, number>();
  const byCastId = new Map<string, number>();
  const dupNames = new Set<string>();
  const nameOf = new Map<number, string>();
  const castIdOf = new Map<number, string | null>();   // therapist_id → 現在の import_cast_id（第36便）
  for (const t of therapists ?? []) {
    const id = t.id as number;
    nameOf.set(id, t.name as string);
    const cid = t.import_cast_id as string | null;
    castIdOf.set(id, cid);
    if (cid) byCastId.set(cid, id);
    for (const raw of [t.name as string, ...((t.import_aliases as string[] | null) ?? [])]) {
      const key = normalizeName(raw);
      if (!key) continue;
      const exists = byName.get(key);
      if (exists !== undefined && exists !== id) dupNames.add(key);
      else byName.set(key, id);
    }
  }

  // 4. 当日ぶんの既存行（差分表示と掃除に使う）
  const allIds = [...nameOf.keys()];
  const { data: todayRows } = allIds.length
    ? await supabase.from('therapist_schedules')
        .select('therapist_id, is_active, start_time, end_time, imported_at')
        .in('therapist_id', allIds).eq('schedule_date', todayISO)
    : { data: [] as never[] };
  const current = new Map<number, { is_active: boolean; start: string | null; end: string | null; imported: boolean }>();
  for (const r of todayRows ?? []) {
    current.set(r.therapist_id as number, {
      is_active: r.is_active as boolean,
      start: (r.start_time as string | null)?.slice(0, 5) ?? null,
      end: (r.end_time as string | null)?.slice(0, 5) ?? null,
      imported: r.imported_at != null,
    });
  }

  // 5. 照合して、当日ぶんの行を組み立てる
  const importedAt = new Date().toISOString();
  const unmatched: string[] = [];
  const createdNames: string[] = [];
  const diffs: Diff[] = [];
  const seenIds = new Set<number>();          // 一覧に居た＝掃除の対象外
  const castIdFills: Array<{ id: number; castId: string; name: string }> = [];
  const rows: Array<{ therapist_id: number; schedule_date: string; is_active: boolean; start_time: string | null; end_time: string | null; imported_at: string }> = [];
  const profilePatches: Array<{ id: number; age?: string; body_type?: string }> = [];
  let matched = 0, unknownStatus = 0;

  for (const c of listed.values()) {
    if (!c.name || !c.nameKey) { unmatched.push(`${c.name ?? c.castId}（名前が読めない）`); continue; }

    let id: number | undefined = byCastId.get(c.castId);
    if (id === undefined) {
      if (dupNames.has(c.nameKey)) { unmatched.push(`${c.name}（同名2名以上・自動更新を保留）`); continue; }
      id = byName.get(c.nameKey);
    }

    let isNew = false;
    if (id === undefined) {
      if (!source.create_missing) { unmatched.push(c.name); continue; }
      if (!isCreatableName(c.name)) { unmatched.push(`${c.name}（伏字・記号のみ・作成せず）`); continue; }
      if (!apply) { createdNames.push(c.name.trim()); continue; }   // 試し打ちでは作らない
      const { data: made, error: mkErr } = await supabase.from('therapists').insert({
        salon_id: source.salon_id, name: c.name.trim(), area: salonArea,
        is_active: false, import_cast_id: c.castId,
        age: source.import_profile ? c.age : null,
        body_type: source.import_profile ? c.bodyType : null,
      }).select('id').single();
      if (mkErr || !made) { unmatched.push(`${c.name}（作成失敗: ${mkErr?.message ?? 'unknown'}）`); continue; }
      id = made.id as number;
      byName.set(c.nameKey, id); byCastId.set(c.castId, id); nameOf.set(id, c.name.trim());
      createdNames.push(c.name.trim());
      isNew = true;
    }
    if (!isNew) matched++;
    seenIds.add(id);

    // ★★ castId の一括埋め（第36便）
    //   girlslist には在籍全員の castId が載っている。名前で当たった子のうち import_cast_id が
    //   空のものをここで埋めておくと、次回から castId 照合に乗る。
    //   これで「フクエス側で名前を変えた子が未登録に見えて重複が増える」（禁則249）が消える。
    //   ★ 既に別の子がその castId を持っている場合は埋めない。取り違えを固定してしまうため。
    if (!isNew && !castIdOf.get(id) && !byCastId.has(c.castId)) {
      castIdFills.push({ id, castId: c.castId, name: nameOf.get(id) ?? c.name });
      castIdOf.set(id, c.castId);
      byCastId.set(c.castId, id);   // 同じ一覧の中で2人が同じ castId を取り合わないように
    }

    // ★ 'unknown'（waiting-cont が読めない）は触らない。全員を一斉に倒す事故を防ぐ安全弁。
    if (c.status === 'unknown') { unknownStatus++; continue; }
    if (!source.import_schedule) continue;

    const active = c.status === 'work';
    rows.push({
      therapist_id: id, schedule_date: todayISO,
      is_active: active,
      start_time: active ? c.start : null,
      end_time: active ? c.end : null,
      imported_at: importedAt,
    });

    const cur = current.get(id);
    const 現在 = cur ? show(cur.is_active, cur.start, cur.end) : '（行なし）';
    const 新規 = show(active, c.start, c.end);
    if (現在 !== 新規) diffs.push({ name: nameOf.get(id) ?? c.name, 現在, 新規 });

    if (source.import_profile) {
      const patch: { id: number; age?: string; body_type?: string } = { id };
      if (c.age) patch.age = c.age;
      if (c.bodyType) patch.body_type = c.bodyType;
      if (patch.age || patch.body_type) profilePatches.push(patch);
    }
  }

  // 6. 掃除: 在籍しているのに一覧に居なかった子の、当日の出勤を倒す。
  //    ★ imported_at が null の行（＝人が SQL や管理画面で入れた行）は触らない（禁則243）。
  const sweepIds = allIds.filter((id) => {
    if (seenIds.has(id)) return false;
    const cur = current.get(id);
    return !!cur && cur.is_active && cur.imported;
  });
  const liveToday = allIds.filter((id) => current.get(id)?.is_active).length;
  let sweepSkipped: string | undefined;
  if (liveToday > 0 && sweepIds.length / liveToday > SWEEP_MAX_RATIO)
    sweepSkipped = `too many (${sweepIds.length}/${liveToday}) — 駅ちか側の不調を疑うこと`;
  for (const id of sweepSkipped ? [] : sweepIds)
    diffs.push({ name: nameOf.get(id) ?? String(id), 現在: show(true, current.get(id)?.start ?? null, current.get(id)?.end ?? null), 新規: '休み（一覧から消えた）' });

  // 7. 書き込み（apply のときだけ）
  let upserted = 0, swept = 0, profilesUpdated = 0, castIdWritten = 0;
  if (apply) {
    if (rows.length > 0) {
      const { error } = await supabase.from('therapist_schedules').upsert(rows, { onConflict: 'therapist_id,schedule_date' });
      if (error) return NextResponse.json({ ok: false, error: error.message, stage: 'schedules' }, { status: 500 });
      upserted = rows.length;
    }
    if (!sweepSkipped && sweepIds.length > 0) {
      const { error } = await supabase.from('therapist_schedules')
        .update({ is_active: false, start_time: null, end_time: null, updated_at: new Date().toISOString() })
        .in('therapist_id', sweepIds).eq('schedule_date', todayISO).eq('is_active', true);
      if (error) return NextResponse.json({ ok: false, error: error.message, stage: 'sweep' }, { status: 500 });
      swept = sweepIds.length;
    }
    for (const f of castIdFills) {
      const { error } = await supabase.from('therapists').update({ import_cast_id: f.castId }).eq('id', f.id);
      if (!error) castIdWritten++;
    }
    for (const p of profilePatches) {
      const { id, ...patch } = p;
      const { error } = await supabase.from('therapists').update(patch).eq('id', id);
      if (!error) profilesUpdated++;
    }
    if (upserted > 0 || swept > 0) {
      revalidatePath('/salon/[id]', 'layout');
      revalidatePath('/hp/[slug]', 'layout');
      revalidatePath('/therapist/[id]', 'layout');
      revalidatePath('/area/[slug]', 'page');
      revalidatePath('/');
    }
    await supabase.from('salon_import_sources')
      .update({ last_run_at: new Date().toISOString(), last_status: 'ok', last_error: null, updated_at: new Date().toISOString() })
      .eq('id', sourceId);
  }

  return NextResponse.json({
    ok: true,
    apply,
    注意: apply ? '本番反映しました' : '試し打ち（1行も書いていません）',
    sourceId, salonId: source.salon_id, pages: pages.length,
    一覧の人数: listed.size,
    照合: matched,
    作成: createdNames.length, 作成した名前: createdNames,
    未照合: unmatched,
    当日の内訳: {
      出勤: rows.filter((r) => r.is_active).length,
      休み: rows.filter((r) => !r.is_active).length,
      判定不能で触らず: unknownStatus,
    },
    掃除: { 候補: sweepIds.length, 実行: swept, 中止理由: sweepSkipped },
    書込: { 出勤行: upserted, プロフィール: profilesUpdated, castId埋め: castIdWritten },
    castIdを埋める予定: castIdFills.map((f) => `${f.name}=${f.castId}`),
    差分: diffs,
  }, { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
