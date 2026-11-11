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
import { normalizeEsutamaNoteItems, pickEsutamaNoteItem } from '@/lib/esutamaNote';
// ★ 第1958便: 「印を書く → 流れを始める → 始められなかったら印を戻す」の手順はここ1か所（前は12か所に同じ形を書いていた）
import { runMarked, type RoundResult } from '@/lib/markedStart';

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
  // ★ 第1960便（総点検の整理）: 追加SQL_第1305便・第1922便は流してある（11/12 確認）。列が無いときの読み直しは消した
  const rowsRes = await svc.from('salon_import_sources')
    .select('salon_id, provider, slot, bump_start_min, bump_end_min, bump_interval_min, bump_last_at, bump_remaining, bump_read_at, bump_auto_at, bump_times, bump_times_done_at')
    .in('provider', ['ekichika', 'esutama']).eq('bump_auto', true);
  const data = (rowsRes.data as unknown as Row[] | null) ?? null;
  const error = rowsRes.error;
  if (error) return NextResponse.json({ ok: false, error: '自動の上位表示の設定を読めなかった: ' + error.message }, { status: 500 });

  const results: RoundResult[] = [];
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
  //   今までの「3行まとめて」（salon_import_sources の esutama）では押さない
  const appealRowsRes = await svc.from('conecf_esutama_appeal_rows')
    .select('salon_id, row_key, auto, start_min, end_min, interval_min, times, times_done_at, auto_at, last_at, remaining, read_at');
  const appealRows = appealRowsRes.error ? [] : (appealRowsRes.data ?? []);
  // ★ 第1960便: 行ごとの設定を読めなかった回は、エステ魂の「3行まとめて」も押さない（行ごとの店を前の押し方で押してしまわないように）
  const appealUnknown = !!appealRowsRes.error;
  const appealRowSalons = new Set(appealRows.map((x) => Number(x.salon_id)));
  for (const r of data ?? []) {
    if (r.provider === 'esutama' && (appealUnknown || appealRowSalons.has(Number(r.salon_id)))) continue;
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
    results.push(await runMarked({
      tag: 'ekichika-bump', base: { salonId: r.salon_id, provider: r.provider, slot }, undoOn: 'busy',
      mark: async () => await svc.from('salon_import_sources')
        .update(dueAt ? { bump_auto_at: now.toISOString(), bump_times_done_at: dueAt } : { bump_auto_at: now.toISOString() })
        .eq('salon_id', r.salon_id).eq('provider', r.provider).eq('slot', slot),
      // ★ 第1926便（2026-11-11・03:36 の回が抜けた）: 同じ枠で別の流れ（即ヒメなど）が走っていて始められなかったときは、
      //   時刻指定の「済み」と始めた時刻を元に戻す＝5分後の見回りで同じ回をやり直す（時刻を30分過ぎるまで）。間隔で押す設定のときは戻さない
      undo: async () => { if (dueAt) await undoTimesMark(r, slot); },
      afterStart: () => { if (r.provider === 'esutama') esutamaStarted.add(Number(r.salon_id)); },
      start: () => startRelayFlow({
        salonId: r.salon_id, provider: r.provider, slot,
        intent: 'bump_auto', actor: 'cron:ekichika-bump',
        bump: { setting },
        // ★ 第1929便: 時刻指定の回は、同じ枠で別の流れが走っていたら順番待ち（終わりしだい始まる・15分まで）
        ...(dueAt ? { whenBusy: 'wait' as const } : {}),
      }),
    }));
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
      const undo = async () => {
        for (const d of due) {
          await svc.from('conecf_esutama_appeal_rows')
            .update({ auto_at: d.x.auto_at ?? null, times_done_at: d.x.times_done_at ?? null })
            .eq('salon_id', sid).eq('row_key', d.x.row_key);
        }
      };
      results.push(await runMarked({
        tag: 'esutama-appeal', base: { salonId: sid, provider: 'esutama:appeal', slot: 1 }, undoOn: 'busy',
        mark: async () => {
          for (const d of due) {
            await svc.from('conecf_esutama_appeal_rows')
              .update(d.dueAt ? { auto_at: now.toISOString(), times_done_at: d.dueAt } : { auto_at: now.toISOString() })
              .eq('salon_id', sid).eq('row_key', d.x.row_key);
          }
          return { error: null };
        },
        undo,
        afterStart: (f) => { if (f.ok) esutamaStarted.add(sid); },
        note: (f) => label + '／' + f.note,
        failNote: label,
        start: () => startRelayFlow({
          salonId: sid, provider: 'esutama', slot: 1, intent: 'bump_auto', actor: 'cron:esutama-appeal',
          esutamaAppeal: { rows: due.map((d) => String(d.x.row_key)) },
        }),
      }));
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
      // ★ 始める前に「読みに行った時刻」を書く（同じ行を立て続けに始めない）。
      // ★ 第1954便: 同じ店のエステ魂で別の流れとぶつかって始められなかったときは戻す（戻さないと、時刻で押す種類は約30分後になる）
      results.push(await runMarked({
        tag: 'esutama-option', base, undoOn: 'busy',
        mark: async () => await svc.from('conecf_esutama_options').update({ read_at: now.toISOString() }).eq('salon_id', o.salon_id).eq('option_key', key),
        undo: async () => { await svc.from('conecf_esutama_options').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', o.salon_id).eq('option_key', key); },
        afterStart: () => { esutamaStarted.add(Number(o.salon_id)); },
        start: () => startRelayFlow({
          salonId: Number(o.salon_id), provider: 'esutama', slot: 1,
          intent: 'bump_auto', actor: 'cron:esutama-option',
          esutamaOpt: { key },
        }),
      }));
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
      // ★ 始める前に「始めた時刻」を書く（同じ行を立て続けに始めない＝二重に投稿しない）。
      // ★ 第1816便: 始められなかったときは戻す（戻さないと次に試すのが約1時間後。11/9 12:04 に集客アピールとぶつかって1回抜けた）
      results.push(await runMarked({
        tag: 'esutama-post', base, undoOn: 'any',
        mark: async () => await svc.from('conecf_esutama_posts').update({ read_at: now.toISOString() }).eq('salon_id', o.salon_id).eq('post_key', key),
        undo: async () => { await svc.from('conecf_esutama_posts').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', o.salon_id).eq('post_key', key); },
        afterStart: () => { esutamaStarted.add(Number(o.salon_id)); },
        start: () => startRelayFlow({
          salonId: Number(o.salon_id), provider: 'esutama', slot: 1,
          intent: 'bump_auto', actor: 'cron:esutama-post',
          esutamaPost: { key, title, body: bodyText, images: isDailyPostKey(key) ? [] : pickEsutamaPostImages(key, o.images, o.next_image) },
        }),
      }));
    }
  }

  // ★★ 第1941便: エステ魂の写メNote（決めた投稿内容を、決めた間隔で1件ずつ・代理ログイン）。★ crontab はそのまま。★ 表が無い（SQL 未適用）ときは黙って飛ばす
  //   ★ 間隔の決まりはリアルタイム集客と同じ（shouldPostEsutama）。★ 同じ店のエステ魂で別の流れを始めた回は次の周へ
  {
    const notes = await svc.from('conecf_esutama_notes')
      .select('salon_id, items, next_index, start_min, end_min, interval_min, last_at, read_at, updated_at, salons!inner(conecf_enabled_at)')
      .eq('admin_enabled', true).eq('auto', true)
      .not('salons.conecf_enabled_at', 'is', null);
    if (!notes.error) {
      for (const o of notes.data ?? []) {
        const base = { salonId: Number(o.salon_id), provider: 'esutama:note', slot: 1 };
        const pick = pickEsutamaNoteItem(normalizeEsutamaNoteItems(o.items), Number(o.next_index ?? 0));
        const judge = shouldPostEsutama({
          now, hasText: pick !== null,
          setting: { startMin: Number(o.start_min), endMin: Number(o.end_min), intervalMin: Number(o.interval_min) },
          state: { lastAt: (o.last_at as string | null) ?? null, readAt: (o.read_at as string | null) ?? null, updatedAt: (o.updated_at as string | null) ?? null },
        });
        if (!judge.post || !pick || !apply) { results.push({ ...base, reason: judge.reason }); continue; }
        if (esutamaStarted.has(Number(o.salon_id))) { results.push({ ...base, reason: 'next_round' }); continue; }
        // ★ 始める前に「始めた時刻」を書く（同じ行を立て続けに始めない）。始められなかったら戻す（5分後の周でまた試す）
        results.push(await runMarked({
          tag: 'esutama-note', base, undoOn: 'any',
          mark: async () => await svc.from('conecf_esutama_notes').update({ read_at: now.toISOString() }).eq('salon_id', o.salon_id),
          undo: async () => { await svc.from('conecf_esutama_notes').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', o.salon_id); },
          afterStart: () => { esutamaStarted.add(Number(o.salon_id)); },
          start: () => startRelayFlow({
            salonId: Number(o.salon_id), provider: 'esutama', slot: 1,
            intent: 'diary_auto', actor: 'cron:esutama-note',
            esutamaNote: { index: pick.index, nextIndex: pick.nextIndex, therapistId: pick.item.therapistId as number, title: pick.item.title, body: pick.item.body, categoryId: pick.item.categoryId, images: pick.item.images },
          }),
        }));
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
        // ★ 始める前に「受け持った予定時刻」を書く（同じ時刻に二重に送らない）。始められなかったら戻す
        results.push(await runMarked({
          tag: 'ekichika-movie', base, undoOn: 'any',
          mark: async () => await svc.from('conecf_ekichika_movies').update({ last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot),
          undo: async () => { await svc.from('conecf_ekichika_movies').update({ last_due_at: (o.last_due_at as string | null) ?? null }).eq('salon_id', sid).eq('slot', slot); },
          start: () => startRelayFlow({
            salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:ekichika-movie',
            ekichikaMovie: { index: judge.index, girlName: row.girlName, title: row.title, body: row.body, deleteSame: row.deleteSame, videoPath: String(video.path), videoType: String(video.content_type ?? 'video/mp4') },
          }),
        }));
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
        // ★ 始める前に「受け持った時刻」を書く（同じ回を二重に始めない）。始められなかったら戻す
        results.push(await runMarked({
          tag: 'ekichika-rankimg', base, undoOn: 'any',
          mark: async () => await svc.from('conecf_ekichika_rankimgs').update({ last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot),
          undo: async () => { await svc.from('conecf_ekichika_rankimgs').update({ last_due_at: prevDue }).eq('salon_id', sid).eq('slot', slot); },
          start: () => startRelayFlow({
            salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:ekichika-rankimg',
            ekichikaRankImage: { index, nextIndex: (index + 1) % pairs.length, main: pair.main, ranking: pair.ranking },
          }),
        }));
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
        // ★ 始める前に「受け持った予定時刻」を書く（同じ時刻に二重に出さない）。始められなかったら戻す
        results.push(await runMarked({
          tag: 'cocoa-movie', base, undoOn: 'any',
          mark: async () => await svc.from('conecf_cocoa_accounts').update({ movie_last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot),
          undo: async () => { await svc.from('conecf_cocoa_accounts').update({ movie_last_due_at: prev }).eq('salon_id', sid).eq('slot', slot); },
          start: () => startRelayFlow({ salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:cocoa-movie', cocoaMovie: {} }),
        }));
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
        // ★ 始める前に「受け持った予定時刻」を書く（同じ時刻に二重に送らない）。始められなかったら戻す（5分後の周でまた試す）
        results.push(await runMarked({
          tag: 'ekichika-magazine', base, undoOn: 'any',
          mark: async () => await svc.from('conecf_ekichika_magazines').update({ last_due_at: judge.dueAt }).eq('salon_id', sid).eq('slot', slot),
          undo: async () => { await svc.from('conecf_ekichika_magazines').update({ last_due_at: (o.last_due_at as string | null) ?? null }).eq('salon_id', sid).eq('slot', slot); },
          start: () => startRelayFlow({
            salonId: sid, provider: 'ekichika', slot, intent: 'bump_auto', actor: 'cron:ekichika-magazine',
            ekichikaMagazine: { index: judge.index, title: row.title, body: row.body },
          }),
        }));
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
        results.push(await runMarked({
          tag: 'vanilla-blog', base, undoOn: 'any',
          mark: async () => await svc.from('conecf_vanilla_blog').update({ read_at: now.toISOString() }).eq('salon_id', sid),
          undo: async () => { await svc.from('conecf_vanilla_blog').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', sid); },
          start: () => startRelayFlow({
            salonId: sid, provider: 'vanilla', slot: 1, intent: 'bump_auto', actor: 'cron:vanilla-blog',
            vanillaBlog: { item: pick.item, index: pick.index, deleteOld: o.delete_old !== false, prevId: (o.last_blog_id as string | null) ?? null },
          }),
        }));
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
        results.push(await runMarked({
          tag: 'zenkoku-option', base, undoOn: 'any',
          mark: async () => await svc.from('conecf_zenkoku_options').update({ read_at: now.toISOString() }).eq('salon_id', sid).eq('option_key', key),
          undo: async () => { await svc.from('conecf_zenkoku_options').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', sid).eq('option_key', key); },
          afterStart: () => { zenkokuStarted.add(sid); },
          start: () => startRelayFlow({
            salonId: sid, provider: 'zenkoku', slot: 1, intent: 'bump_auto', actor: 'cron:zenkoku-option',
            zenkokuOpt: key === 'news' ? { key, item } : { key, items: recs, nextIndex: Number(o.next_item ?? 0) },
          }),
        }));
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
        // ★ 第1954便: 別の流れとぶつかって始められなかったときは印を戻す（15分待たず、5分後の周でまた試す）
        results.push(await runMarked({
          tag: 'zenkoku-wait', base, undoOn: 'busy',
          mark: async () => await svc.from('salon_import_sources').update({ bump_auto_at: now.toISOString() }).eq('salon_id', z.salon_id).eq('provider', 'zenkoku').eq('slot', slot),
          undo: async () => { await svc.from('salon_import_sources').update({ bump_auto_at: (z.bump_auto_at as string | null) ?? null }).eq('salon_id', z.salon_id).eq('provider', 'zenkoku').eq('slot', slot); },
          start: () => startRelayFlow({ salonId: Number(z.salon_id), provider: 'zenkoku', slot, intent: 'bump_auto', actor: 'cron:zenkoku-wait', zenkokuWait: { dateISO } }),
        }));
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
