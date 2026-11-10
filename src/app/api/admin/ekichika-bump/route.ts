import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { shouldBumpNow, bumpResetMinOf, normalizeBumpTimes, nextDueBumpTime, type BumpSetting } from '@/lib/ekichikaBump';
import { esutamaAppealRowLabel } from '@/lib/esutamaAppealRows';
import { shouldPressEsutamaOpt, ESUTAMA_OPT_DEFAULT, type EsutamaOptKey } from '@/lib/esutamaOption';
import { businessDateJSTFrom } from '@/lib/dutyStatus';
import { shouldPostEsutama, esutamaPostTextProblem, pickEsutamaPostImages, isDailyPostKey } from '@/lib/esutamaPost';
import { normalizeMovieSchedule, shouldPostEkichikaMovie, movieRowProblem, isConecfVideoPath } from '@/lib/ekichikaMovie';
import { normalizeMagazineSchedule, shouldPostEkichikaMagazine, magazineRowProblem } from '@/lib/ekichikaMagazine';
import { normalizeCocoaMovieSchedule, shouldPostCocoaMovie } from '@/lib/cocoaMovie';
import { normalizeRankImagePairs, normalizeRankImageInterval, shouldRotateRankImage } from '@/lib/ekichikaRankImage';
import { shouldRunZenkokuOpt, normalizeNewsItems, normalizeRecItems, newsItemProblem } from '@/lib/zenkokuOption';
import { shouldRunVanillaBlog, normalizeVanillaBlogItems, pickVanillaBlogItem } from '@/lib/vanillaBlog';

// ── 駅ちかの上位表示を自動で押す周（第1305便・2026-10-08）────────────────
// ★★ 第1314便: エステ魂の集客ワンクリックアピール（店舗情報）も同じ周で押す（provider='esutama' の行）。
//   ★ 道（URL）は変えない＝crontab はそのまま。★ 押し方は lib/esutamaAppealFlow.ts、押すかの判断は同じ shouldBumpNow。
//   POST /api/admin/ekichika-bump  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }   … ★ apply 既定 false（試し打ち）＝誰に押しに行くつもりかを返すだけ。中継ジョブを積まない
//
// ★★★ 見るのは【自動が入っている駅ちかの枠】だけ（salon_import_sources.bump_auto = true）。既定は false。
//   ★ crontab に足しても、店舗様が入れるまで（ラビリンス様は追加SQL_第1305便で入れる）何も起きない。
// ★ 押すかどうかは src/lib/ekichikaBump.ts の shouldBumpNow（純粋関数・番人あり）。ここは DB を読んで渡し、結果のとおりに流れを始めるだけ。
//   ★ 流れの中でもう一度、駅ちかの管理画面トップの最終更新日で決め直す（店舗様が駅ちかで手で押した直後なら押さない）。
// ★ 入口の検査（コネックエフの文への同意・切り替え済み・セットの契約・「反映しない」・ログインに続けて失敗）は startRelayFlow がする。
//
// ★ 間隔がいちばん短くて10分なので、周は5分ごと。★ 区切り（例: 10:00・10:20…）の4分後に回るよう、分をずらしてある。
//   crontab（VPS）:
//   4-59/5 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/ekichika-bump -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/ekichika-bump.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = {
  salon_id: number;
  provider: string;
  slot: number | null;
  bump_start_min: number | null;
  bump_end_min: number | null;
  bump_interval_min: number | null;
  /** ★ 第1922便: 時刻指定（0時からの分）・押しに行った最後の回 */
  bump_times?: number[] | null;
  bump_times_done_at?: string | null;
  bump_last_at: string | null;
  bump_remaining: number | null;
  bump_read_at: string | null;
  bump_auto_at: string | null;
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const svc = createServiceClient();
  const now = new Date();
  const BASE_COLS = 'salon_id, provider, slot, bump_start_min, bump_end_min, bump_interval_min, bump_last_at, bump_remaining, bump_read_at, bump_auto_at';
  const readRows = async (cols: string): Promise<{ data: Row[] | null; error: { message: string } | null }> => {
    const res = await svc.from('salon_import_sources').select(cols).in('provider', ['ekichika', 'esutama']).eq('bump_auto', true);
    return { data: (res.data as unknown as Row[] | null) ?? null, error: res.error ? { message: res.error.message } : null };
  };
  let { data, error } = await readRows(BASE_COLS + ', bump_times, bump_times_done_at');
  // ★ 第1922便: 時刻指定の列がまだ無い（追加SQL_第1922便が未適用）ときは、今までどおりの列で読み直す＝周（エステ魂・全国など）を止めない
  if (error && /bump_times/.test(error.message)) {
    ({ data, error } = await readRows(BASE_COLS));
  }
  // ★ 列が無い（追加SQL_第1305便が未適用）ときもここで返す。★ 何もしない
  if (error) return NextResponse.json({ ok: false, error: '自動の上位表示の設定を読めなかった: ' + error.message }, { status: 500 });

  const results: Array<{ salonId: number; provider: string; slot: number; reason: string; started?: boolean; note?: string }> = [];
  // ★ 第1826便: エステ魂は同じ店で1回の周に1つだけ始める（同時に始めると2つ目以降は「別の手順がまだ走っていた」で止まり、更新結果が埋まる）。
  //   ★ 始められなかったものは「始めた時刻」を書かないので、5分後の周で順に始まる
  const esutamaStarted = new Set<number>();
  /** ★ 第1926便: 時刻指定の回を始められなかったとき、書いた印（済みの回・始めた時刻）を元の値に戻す */
  const undoTimesMark = async (r: Row, slot: number) => {
    const { error: uErr } = await svc.from('salon_import_sources')
      .update({ bump_times_done_at: r.bump_times_done_at ?? null, bump_auto_at: r.bump_auto_at ?? null })
      .eq('salon_id', r.salon_id).eq('provider', r.provider).eq('slot', slot);
    if (uErr) console.error('[ekichika-bump] 時刻指定の印を戻せなかった', r.salon_id, slot, uErr.message);
  };
  // ★ 第1930便: 集客ワンクリックアピールを行ごとに設定している店（conecf_esutama_appeal_rows に行がある店）は、
  //   今までの「3行まとめて」（salon_import_sources の esutama）では押さない。★ 表が無い（SQL 未適用）ときは今までどおり
  const appealRowsRes = await svc.from('conecf_esutama_appeal_rows')
    .select('salon_id, row_key, auto, start_min, end_min, interval_min, times, times_done_at, auto_at, last_at, remaining, read_at');
  const appealRows = appealRowsRes.error ? [] : (appealRowsRes.data ?? []);
  const appealRowSalons = new Set(appealRows.map((x) => Number(x.salon_id)));
  for (const r of data ?? []) {
    if (r.provider === 'esutama' && appealRowSalons.has(Number(r.salon_id))) continue;
    const slot = Number(r.slot ?? 1);
    const setting: BumpSetting = {
      enabled: true,
      startMin: Number(r.bump_start_min),
      endMin: Number(r.bump_end_min),
      intervalMin: Number(r.bump_interval_min),
      times: r.provider === 'ekichika' ? normalizeBumpTimes(r.bump_times) : null,
    };
    const judge = shouldBumpNow({
      now, setting,
      state: { lastAt: r.bump_last_at, remaining: r.bump_remaining, readAt: r.bump_read_at, autoAt: r.bump_auto_at, timesDoneAt: r.bump_times_done_at ?? null },
      // ★ 第1407便: 0回を読んだあとは、サイトの回数が戻る時刻（駅ちか 0:00・エステ魂 6:00）を過ぎたらまた見に行く
      resetMin: bumpResetMinOf(r.provider),
    });
    if (!judge.bump || !apply) { results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: judge.reason }); continue; }

    // ★ 始める前に「始めた時刻」を書く（同じ枠を立て続けに始めない）。★ 書けなければ始めない（二重に押しに行かない側）
    // ★ 第1922便: 時刻指定は、どの回を押しに行くか（bump_times_done_at）も一緒に書く＝同じ回を2回押さない・近い時刻も1つずつ
    const dueAt = setting.times ? nextDueBumpTime(now, setting.times, r.bump_times_done_at ?? null) : null;
    const { error: aErr } = await svc.from('salon_import_sources')
      .update(dueAt ? { bump_auto_at: now.toISOString(), bump_times_done_at: dueAt } : { bump_auto_at: now.toISOString() })
      .eq('salon_id', r.salon_id).eq('provider', r.provider).eq('slot', slot);
    if (aErr) { results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: 'mark_failed', note: aErr.message }); continue; }

    try {
      const f = await startRelayFlow({
        salonId: r.salon_id, provider: r.provider, slot,
        intent: 'bump_auto', actor: 'cron:ekichika-bump',
        bump: { setting },
        // ★ 第1929便: 時刻指定の回は、同じ枠で別の流れが走っていたら順番待ち（終わりしだい始まる・15分まで）
        ...(dueAt ? { whenBusy: 'wait' as const } : {}),
      });
      if (r.provider === 'esutama') esutamaStarted.add(Number(r.salon_id));
      // ★ 第1926便（2026-11-11・03:36 の回が抜けた）: 同じ枠で別の流れ（即ヒメなど）が走っていて始められなかったときは、
      //   時刻指定の「済み」と始めた時刻を元に戻す＝5分後の見回りで同じ回をやり直す（時刻を30分過ぎるまで）
      if (!f.ok && f.reason === 'busy' && dueAt) await undoTimesMark(r, slot);
      results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: 'ok', started: f.ok, note: f.note });
    } catch (e) {
      console.error('[ekichika-bump] 流れを始められなかった', r.salon_id, slot, e instanceof Error ? e.message : 'unknown');
      if (dueAt) await undoTimesMark(r, slot);
      results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: 'start_failed' });
    }
  }

  // ★★ 第1930便: 集客ワンクリックアピールの行ごとの自動。★ 同じ店で押す時刻が来た行をまとめて、1つの流れで順に押す
  {
    const bySalon = new Map<number, typeof appealRows>();
    for (const x of appealRows) {
      if (x.auto !== true) continue;
      const sid = Number(x.salon_id);
      bySalon.set(sid, [...(bySalon.get(sid) ?? []), x]);
    }
    for (const [sid, rows] of bySalon) {
      const due: Array<{ x: (typeof appealRows)[number]; dueAt: string | null }> = [];
      for (const x of rows) {
        const times = normalizeBumpTimes(x.times);
        const setting: BumpSetting = { enabled: true, startMin: Number(x.start_min), endMin: Number(x.end_min), intervalMin: Number(x.interval_min), times };
        const judge = shouldBumpNow({
          now, setting,
          state: { lastAt: x.last_at ?? null, remaining: x.remaining == null ? null : Number(x.remaining), readAt: x.read_at ?? null, autoAt: x.auto_at ?? null, timesDoneAt: x.times_done_at ?? null },
          resetMin: bumpResetMinOf('esutama'),
        });
        if (judge.bump) due.push({ x, dueAt: times ? nextDueBumpTime(now, times, x.times_done_at ?? null) : null });
      }
      if (due.length === 0) continue;
      const label = due.map((d) => esutamaAppealRowLabel(String(d.x.row_key))).join('・');
      if (!apply) { results.push({ salonId: sid, provider: 'esutama:appeal', slot: 1, reason: 'ok', note: label }); continue; }
      if (esutamaStarted.has(sid)) { results.push({ salonId: sid, provider: 'esutama:appeal', slot: 1, reason: 'busy_this_round', note: label }); continue; }
      // ★ 始める前に印を書く（同じ回を2回押さない）。★ 始められなかったら元に戻す（次の周でやり直す）
      for (const d of due) {
        await svc.from('conecf_esutama_appeal_rows')
          .update(d.dueAt ? { auto_at: now.toISOString(), times_done_at: d.dueAt } : { auto_at: now.toISOString() })
          .eq('salon_id', sid).eq('row_key', d.x.row_key);
      }
      const undo = async () => {
        for (const d of due) {
          await svc.from('conecf_esutama_appeal_rows')
            .update({ auto_at: d.x.auto_at ?? null, times_done_at: d.x.times_done_at ?? null })
            .eq('salon_id', sid).eq('row_key', d.x.row_key);
        }
      };
      try {
        const f = await startRelayFlow({
          salonId: sid, provider: 'esutama', slot: 1, intent: 'bump_auto', actor: 'cron:esutama-appeal',
          esutamaAppeal: { rows: due.map((d) => String(d.x.row_key)) },
        });
        if (f.ok) esutamaStarted.add(sid);
        else if (f.reason === 'busy') await undo();
        results.push({ salonId: sid, provider: 'esutama:appeal', slot: 1, reason: 'ok', started: f.ok, note: label + '／' + f.note });
      } catch (e) {
        console.error('[ekichika-bump] 集客アピール（行ごと）を始められなかった', sid, e instanceof Error ? e.message : 'unknown');
        await undo();
        results.push({ salonId: sid, provider: 'esutama:appeal', slot: 1, reason: 'start_failed', note: label });
      }
    }
  }

  // ★★ 第1799便: エステ魂【オプション】（集客ブースト・セラピストアピール）も同じ周で押す。★ crontab はそのまま
  //   ★ 見るのは、運営が ON（admin_enabled）にして、店舗様が自動を入れた（auto）行だけ。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  const opt = await svc.from('conecf_esutama_options')
    .select('salon_id, option_key, start_min, end_min, interval_min, times_min, last_at, remaining, read_at')
    .eq('admin_enabled', true).eq('auto', true);
  if (!opt.error) {
    for (const o of opt.data ?? []) {
      const key = String(o.option_key) as EsutamaOptKey;
      const def = ESUTAMA_OPT_DEFAULT[key];
      if (!def) continue;
      const setting = {
        startMin: o.start_min == null ? def.startMin : Number(o.start_min),
        endMin: o.end_min == null ? def.endMin : Number(o.end_min),
        intervalMin: o.interval_min == null ? def.intervalMin : Number(o.interval_min),
        timesMin: Array.isArray(o.times_min) && o.times_min.length > 0 ? (o.times_min as number[]).map(Number) : def.timesMin,
      };
      const judge = shouldPressEsutamaOpt({
        key, setting, now,
        state: { lastAt: (o.last_at as string | null) ?? null, remaining: o.remaining == null ? null : Number(o.remaining), readAt: (o.read_at as string | null) ?? null },
      });
      const base = { salonId: Number(o.salon_id), provider: 'esutama:' + key, slot: 1 };
      if (!judge.press || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
      if (esutamaStarted.has(Number(o.salon_id))) { results.push({ ...base, reason: 'next_round' }); continue; }
      // ★ 始める前に「読みに行った時刻」を書く（同じ行を立て続けに始めない）。★ 書けなければ始めない
      const { error: mErr } = await svc.from('conecf_esutama_options')
        .update({ read_at: now.toISOString() }).eq('salon_id', o.salon_id).eq('option_key', key);
      if (mErr) { results.push({ ...base, reason: 'mark_failed', note: mErr.message }); continue; }
      try {
        const f = await startRelayFlow({
          salonId: Number(o.salon_id), provider: 'esutama', slot: 1,
          intent: 'bump_auto', actor: 'cron:esutama-option',
          esutamaOpt: { key },
        });
        esutamaStarted.add(Number(o.salon_id));
        results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
      } catch (e) {
        console.error('[esutama-option] 流れを始められなかった', o.salon_id, key, e instanceof Error ? e.message : 'unknown');
        results.push({ ...base, reason: 'start_failed' });
      }
    }
  }

  // ★★ 第1811便: エステ魂【オプション】の投稿（リアルタイム集客）も同じ周で送る。★ crontab はそのまま
  //   ★ 見るのは、運営が ON（admin_enabled）にして、店舗様が自動を入れた（auto）行だけ。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  const posts = await svc.from('conecf_esutama_posts')
    .select('salon_id, post_key, title, body, start_min, end_min, interval_min, last_at, read_at, images, next_image, updated_at')
    .eq('admin_enabled', true).eq('auto', true);
  if (!posts.error) {
    for (const o of posts.data ?? []) {
      const key = String(o.post_key);
      const title = String(o.title ?? '');
      const bodyText = String(o.body ?? '');
      const base = { salonId: Number(o.salon_id), provider: 'esutama:' + key, slot: 1 };
      const judge = shouldPostEsutama({
        now, key, hasText: esutamaPostTextProblem(title, bodyText, key) === null,
        setting: { startMin: Number(o.start_min), endMin: Number(o.end_min), intervalMin: Number(o.interval_min) },
        state: { lastAt: (o.last_at as string | null) ?? null, readAt: (o.read_at as string | null) ?? null, updatedAt: (o.updated_at as string | null) ?? null },
      });
      if (!judge.post || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
      if (esutamaStarted.has(Number(o.salon_id))) { results.push({ ...base, reason: 'next_round' }); continue; }
      // ★ 始める前に「始めた時刻」を書く（同じ行を立て続けに始めない＝二重に投稿しない）。★ 書けなければ始めない
      const { error: mErr } = await svc.from('conecf_esutama_posts')
        .update({ read_at: now.toISOString() }).eq('salon_id', o.salon_id).eq('post_key', key);
      if (mErr) { results.push({ ...base, reason: 'mark_failed', note: mErr.message }); continue; }
      try {
        const f = await startRelayFlow({
          salonId: Number(o.salon_id), provider: 'esutama', slot: 1,
          intent: 'bump_auto', actor: 'cron:esutama-post',
          esutamaPost: { key, title, body: bodyText, images: isDailyPostKey(key) ? [] : pickEsutamaPostImages(key, o.images, o.next_image) },
        });
        // ★ 第1816便: 始められなかった（同じ店のエステ魂で別の流れが走っていた等）ときは「始めた時刻」を戻す。
        //   ★ 戻さないと、次に試すのが約1時間後になる（11/9 12:04 に集客アピールとぶつかって1回抜けた）。戻せば5分後の周でまた試す
        esutamaStarted.add(Number(o.salon_id));
        if (!f.ok) await svc.from('conecf_esutama_posts').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', o.salon_id).eq('post_key', key);
        results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
      } catch (e) {
        console.error('[esutama-post] 流れを始められなかった', o.salon_id, key, e instanceof Error ? e.message : 'unknown');
        results.push({ ...base, reason: 'start_failed' });
      }
    }
  }

  // ★★ 第1840便: 駅ちかの動画投稿（ベンリーから移す）。★ crontab はそのまま。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  //   ★ 見るのは、運営が ON（admin_enabled）にして、店舗様が自動を入れた（auto）行だけ。時刻の行のいちばん近い過去の予定を1本
  {
    const mv = await svc.from('conecf_ekichika_movies')
      .select('salon_id, slot, schedule, last_due_at, salons!inner(conecf_enabled_at)')
      .eq('admin_enabled', true).eq('auto', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!mv.error) {
      for (const o of mv.data ?? []) {
        const sid = Number(o.salon_id), slot = Number(o.slot ?? 1);
        const base = { salonId: sid, provider: 'ekichika:movie', slot };
        const schedule = normalizeMovieSchedule(o.schedule);
        const judge = shouldPostEkichikaMovie({ now, schedule, lastDueAt: (o.last_due_at as string | null) ?? null });
        if (!judge.post || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
        const row = schedule[judge.index];
        if (movieRowProblem(row)) { results.push({ ...base, reason: 'row_problem' }); continue; }
        const { data: video } = await svc.from('conecf_videos').select('path, content_type').eq('id', row.videoId).eq('salon_id', sid).maybeSingle();
        if (!video || !isConecfVideoPath(String(video.path))) { results.push({ ...base, reason: 'no_video' }); continue; }
        // ★ 始める前に「受け持った予定時刻」を書く（同じ時刻に二重に送らない）。★ 書けなければ始めない
        const { error: mErr } = await svc.from('conecf_ekichika_movies').update({ last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot);
        if (mErr) { results.push({ ...base, reason: 'mark_failed', note: mErr.message }); continue; }
        try {
          const f = await startRelayFlow({
            salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:ekichika-movie',
            ekichikaMovie: { index: judge.index, girlName: row.girlName, title: row.title, body: row.body, deleteSame: row.deleteSame, videoPath: String(video.path), videoType: String(video.content_type ?? 'video/mp4') },
          });
          // ★ 始められなかった（同じ枠で別の流れが走っていた等）ときは印を戻す（5分後の周でまた試す）
          if (!f.ok) await svc.from('conecf_ekichika_movies').update({ last_due_at: (o.last_due_at as string | null) ?? null }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
        } catch (e) {
          console.error('[ekichika-movie] 流れを始められなかった', sid, slot, e instanceof Error ? e.message : 'unknown');
          await svc.from('conecf_ekichika_movies').update({ last_due_at: (o.last_due_at as string | null) ?? null }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'start_failed' });
        }
      }
    }
  }

  // ★★ 第1846便: 駅ちかの店舗メイン／ランキングの入れ替え（ベンリーから移す）。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  //   ★ 運営が ON（admin_enabled）にして、店舗様が自動を入れた（auto）行だけ。間隔が過ぎていたら next_index の組を置く
  {
    const rk = await svc.from('conecf_ekichika_rankimgs')
      .select('salon_id, slot, interval_min, pairs, next_index, last_due_at, salons!inner(conecf_enabled_at)')
      .eq('admin_enabled', true).eq('auto', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!rk.error) {
      for (const o of rk.data ?? []) {
        const sid = Number(o.salon_id), slot = Number(o.slot ?? 1);
        const base = { salonId: sid, provider: 'ekichika:rankimg', slot };
        const pairs = normalizeRankImagePairs(o.pairs);
        const prevDue = (o.last_due_at as string | null) ?? null;
        const judge = shouldRotateRankImage({ now, intervalMin: normalizeRankImageInterval(o.interval_min), lastDueAt: prevDue, pairCount: pairs.length });
        if (!judge.post || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
        const index = Math.max(0, Number(o.next_index ?? 0)) % pairs.length;
        const pair = pairs[index];
        // ★ 始める前に「受け持った時刻」を書く（同じ回を二重に始めない）。★ 書けなければ始めない
        const { error: gErr } = await svc.from('conecf_ekichika_rankimgs').update({ last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot);
        if (gErr) { results.push({ ...base, reason: 'mark_failed', note: gErr.message }); continue; }
        try {
          const f = await startRelayFlow({
            salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:ekichika-rankimg',
            ekichikaRankImage: { index, nextIndex: (index + 1) % pairs.length, main: pair.main, ranking: pair.ranking },
          });
          // ★ 始められなかった（同じ枠で別の流れが走っていた等）ときは印を戻す（5分後の周でまた試す）
          if (!f.ok) await svc.from('conecf_ekichika_rankimgs').update({ last_due_at: prevDue }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
        } catch (e) {
          console.error('[ekichika-rankimg] 流れを始められなかった', sid, slot, e instanceof Error ? e.message : 'unknown');
          await svc.from('conecf_ekichika_rankimgs').update({ last_due_at: prevDue }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'start_failed' });
        }
      }
    }
  }

  // ★★ 第1917便: ココアの店長ブログ「動画の記事」（ベンリーから移す）。★ 列が無い（SQL 未適用）ときは黙って飛ばす
  //   ★ 見るのは movie_enabled の行だけ。★ 駅ちかの同じ枠でログインして、ココアへ入る
  {
    const cm = await svc.from('conecf_cocoa_accounts')
      .select('salon_id, slot, movie_schedule, movie_last_due_at, salons!inner(conecf_enabled_at)')
      .eq('movie_enabled', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!cm.error) {
      for (const o of cm.data ?? []) {
        const sid = Number(o.salon_id), slot = Number(o.slot ?? 1);
        const base = { salonId: sid, provider: 'ekichika:cocoa-movie', slot };
        const prev = (o.movie_last_due_at as string | null) ?? null;
        const judge = shouldPostCocoaMovie({ now, schedule: normalizeCocoaMovieSchedule(o.movie_schedule), lastDueAt: prev });
        if (!judge.post || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
        // ★ 始める前に「受け持った予定時刻」を書く（同じ時刻に二重に出さない）。★ 書けなければ始めない
        const { error: cErr } = await svc.from('conecf_cocoa_accounts').update({ movie_last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot);
        if (cErr) { results.push({ ...base, reason: 'mark_failed', note: cErr.message }); continue; }
        try {
          const f = await startRelayFlow({ salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:cocoa-movie', cocoaMovie: {} });
          if (!f.ok) await svc.from('conecf_cocoa_accounts').update({ movie_last_due_at: prev }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
        } catch (e) {
          console.error('[cocoa-movie] 流れを始められなかった', sid, slot, e instanceof Error ? e.message : 'unknown');
          await svc.from('conecf_cocoa_accounts').update({ movie_last_due_at: prev }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'start_failed' });
        }
      }
    }
  }

  // ★★ 第1844便: 駅ちかのプラチナムマガジン（ベンリーから移す）。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  //   ★ 見るのは、運営が ON（admin_enabled）にして、店舗様が自動を入れた（auto）行だけ。★ 会員にメールが届くので二重送りは特に避ける
  {
    const mg = await svc.from('conecf_ekichika_magazines')
      .select('salon_id, slot, schedule, last_due_at, salons!inner(conecf_enabled_at)')
      .eq('admin_enabled', true).eq('auto', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!mg.error) {
      for (const o of mg.data ?? []) {
        const sid = Number(o.salon_id), slot = Number(o.slot ?? 1);
        const base = { salonId: sid, provider: 'ekichika:magazine', slot };
        const schedule = normalizeMagazineSchedule(o.schedule);
        const judge = shouldPostEkichikaMagazine({ now, schedule, lastDueAt: (o.last_due_at as string | null) ?? null });
        if (!judge.post || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
        const row = schedule[judge.index];
        if (magazineRowProblem(row)) { results.push({ ...base, reason: 'row_problem' }); continue; }
        // ★ 始める前に「受け持った予定時刻」を書く（同じ時刻に二重に送らない）。★ 書けなければ始めない
        const { error: gErr } = await svc.from('conecf_ekichika_magazines').update({ last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot);
        if (gErr) { results.push({ ...base, reason: 'mark_failed', note: gErr.message }); continue; }
        try {
          const f = await startRelayFlow({
            salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:ekichika-magazine',
            ekichikaMagazine: { index: judge.index, title: row.title, body: row.body },
          });
          // ★ 始められなかった（同じ枠で別の流れが走っていた等）ときは印を戻す（5分後の周でまた試す）
          if (!f.ok) await svc.from('conecf_ekichika_magazines').update({ last_due_at: (o.last_due_at as string | null) ?? null }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
        } catch (e) {
          console.error('[ekichika-magazine] 流れを始められなかった', sid, slot, e instanceof Error ? e.message : 'unknown');
          await svc.from('conecf_ekichika_magazines').update({ last_due_at: (o.last_due_at as string | null) ?? null }).eq('salon_id', sid).eq('slot', slot);
          results.push({ ...base, reason: 'start_failed' });
        }
      }
    }
  }

  // ★★ 第1903便: バニラの店長ブログ（ベンリーから移す）。★ crontab はそのまま（この周に入れた）
  //   ★ 見るのは、運営が ON（admin_enabled）にして、店舗様が自動を入れた（auto）行だけ。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  {
    const vb = await svc.from('conecf_vanilla_blog')
      .select('salon_id, times_min, items, next_item, delete_old, last_blog_id, read_at, last_at, salons!inner(conecf_enabled_at)')
      .eq('admin_enabled', true).eq('auto', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!vb.error) {
      for (const o of vb.data ?? []) {
        const sid = Number(o.salon_id);
        const base = { salonId: sid, provider: 'vanilla:blog', slot: 1 };
        const judge = shouldRunVanillaBlog({
          now, timesMin: Array.isArray(o.times_min) ? (o.times_min as number[]).map(Number) : [],
          state: { lastAt: (o.last_at as string | null) ?? null, readAt: (o.read_at as string | null) ?? null },
        });
        if (!judge.run || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
        const pick = pickVanillaBlogItem(normalizeVanillaBlogItems(o.items), Number(o.next_item ?? 0));
        if (!pick) { results.push({ ...base, reason: 'no_items' }); continue; }
        const { error: mErr } = await svc.from('conecf_vanilla_blog').update({ read_at: now.toISOString() }).eq('salon_id', sid);
        if (mErr) { results.push({ ...base, reason: 'mark_failed', note: mErr.message }); continue; }
        try {
          const f = await startRelayFlow({
            salonId: sid, provider: 'vanilla', slot: 1, intent: 'bump_auto', actor: 'cron:vanilla-blog',
            vanillaBlog: { item: pick.item, index: pick.index, deleteOld: o.delete_old !== false, prevId: (o.last_blog_id as string | null) ?? null },
          });
          // ★ 始められなかった（別の流れが走っていた等）ときは「始めた時刻」を戻す（5分後の周でまた試す）
          if (!f.ok) await svc.from('conecf_vanilla_blog').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', sid);
          results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
        } catch (e) {
          console.error('[vanilla-blog] 流れを始められなかった', sid, e instanceof Error ? e.message : 'unknown');
          results.push({ ...base, reason: 'start_failed' });
        }
      }
    }
  }

  // ★★ 第1831便: 全国エステランキングのニュース・おすすめセラピスト（ベンリーから移した）。★ crontab はそのまま
  //   ★ 見るのは、運営が ON（admin_enabled）にして、店舗様が自動を入れた（auto）行だけ。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  //   ★ 同じ店の全国は1回の周で1つだけ始める（待機中の周より先に。待機中は5分後の周でもよい）
  const zenkokuStarted = new Set<number>();
  {
    const zo = await svc.from('conecf_zenkoku_options')
      .select('salon_id, option_key, times_min, items, next_item, remaining, read_at, last_at, last_outcome, salons!inner(conecf_enabled_at)')
      .eq('admin_enabled', true).eq('auto', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!zo.error) {
      for (const o of zo.data ?? []) {
        const key = String(o.option_key) === 'recommend' ? 'recommend' as const : 'news' as const;
        const sid = Number(o.salon_id);
        const base = { salonId: sid, provider: 'zenkoku:' + key, slot: 1 };
        const judge = shouldRunZenkokuOpt({
          key, now, timesMin: Array.isArray(o.times_min) ? (o.times_min as number[]).map(Number) : [],
          state: { lastAt: (o.last_at as string | null) ?? null, readAt: (o.read_at as string | null) ?? null, remaining: o.remaining == null ? null : Number(o.remaining), lastOutcome: (o.last_outcome as string | null) ?? null },
        });
        if (!judge.run || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
        const news = key === 'news' ? normalizeNewsItems(o.items) : [];
        const recs = key === 'recommend' ? normalizeRecItems(o.items) : [];
        const item = key === 'news' && news.length > 0 ? news[judge.slot % news.length] : undefined;
        if (key === 'news' && (!item || newsItemProblem(item))) { results.push({ ...base, reason: 'no_items' }); continue; }
        if (key === 'recommend' && recs.length === 0) { results.push({ ...base, reason: 'no_items' }); continue; }
        if (zenkokuStarted.has(sid)) { results.push({ ...base, reason: 'next_round' }); continue; }
        const { error: mErr } = await svc.from('conecf_zenkoku_options').update({ read_at: now.toISOString() }).eq('salon_id', sid).eq('option_key', key);
        if (mErr) { results.push({ ...base, reason: 'mark_failed', note: mErr.message }); continue; }
        try {
          const f = await startRelayFlow({
            salonId: sid, provider: 'zenkoku', slot: 1, intent: 'bump_auto', actor: 'cron:zenkoku-option',
            zenkokuOpt: key === 'news' ? { key, item } : { key, items: recs, nextIndex: Number(o.next_item ?? 0) },
          });
          zenkokuStarted.add(sid);
          // ★ 始められなかった（別の流れが走っていた等）ときは「始めた時刻」を戻す（5分後の周でまた試す）
          if (!f.ok) await svc.from('conecf_zenkoku_options').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', sid).eq('option_key', key);
          results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
        } catch (e) {
          console.error('[zenkoku-option] 流れを始められなかった', sid, key, e instanceof Error ? e.message : 'unknown');
          results.push({ ...base, reason: 'start_failed' });
        }
      }
    }
  }

  // ★★ 第1810便（カッキーさん「A」）: 全国エステランキングの待機中。その営業日の出勤時間に入った方を全員待機中にする
  //   ★ 対象は「フクエスから反映（自動）」の全国エステランキングの枠だけ。★ 15分に1回まで（bump_auto_at を使う）
  {
    const zk = await svc.from('salon_import_sources')
      .select('salon_id, slot, bump_auto_at, salons!inner(conecf_enabled_at)')
      .eq('provider', 'zenkoku').eq('link_mode', 'write_auto').eq('is_enabled', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!zk.error) {
      const dateISO = businessDateJSTFrom(now.getTime());
      for (const z of zk.data ?? []) {
        const slot = Number(z.slot ?? 1);
        const base = { salonId: Number(z.salon_id), provider: 'zenkoku:wait', slot };
        if (zenkokuStarted.has(Number(z.salon_id))) { results.push({ ...base, reason: 'next_round' }); continue; }
        const last = z.bump_auto_at ? Date.parse(String(z.bump_auto_at)) : 0;
        if (now.getTime() - last < 14 * 60000) { results.push({ ...base, reason: 'interval' }); continue; }
        if (!apply) { results.push({ ...base, reason: 'ok' }); continue; }
        const { error: mErr } = await svc.from('salon_import_sources').update({ bump_auto_at: now.toISOString() })
          .eq('salon_id', z.salon_id).eq('provider', 'zenkoku').eq('slot', slot);
        if (mErr) { results.push({ ...base, reason: 'mark_failed', note: mErr.message }); continue; }
        try {
          const f = await startRelayFlow({ salonId: Number(z.salon_id), provider: 'zenkoku', slot, intent: 'bump_auto', actor: 'cron:zenkoku-wait', zenkokuWait: { dateISO } });
          results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
        } catch (e) {
          console.error('[zenkoku-wait] 流れを始められなかった', z.salon_id, e instanceof Error ? e.message : 'unknown');
          results.push({ ...base, reason: 'start_failed' });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    target: results.length,
    started: results.filter((x) => x.started).length,
    results,
    note: apply ? '自動の上位表示の周' : '試し打ち（何も積んでいない）',
  });
}
