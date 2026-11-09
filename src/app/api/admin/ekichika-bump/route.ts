import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { shouldBumpNow, bumpResetMinOf, type BumpSetting } from '@/lib/ekichikaBump';
import { shouldPressEsutamaOpt, ESUTAMA_OPT_DEFAULT, type EsutamaOptKey } from '@/lib/esutamaOption';
import { businessDateJSTFrom } from '@/lib/dutyStatus';
import { shouldPostEsutama, esutamaPostTextProblem, pickEsutamaPostImages, isDailyPostKey } from '@/lib/esutamaPost';

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
  const { data, error } = await svc
    .from('salon_import_sources')
    .select('salon_id, provider, slot, bump_start_min, bump_end_min, bump_interval_min, bump_last_at, bump_remaining, bump_read_at, bump_auto_at')
    .in('provider', ['ekichika', 'esutama'])
    .eq('bump_auto', true);
  // ★ 列が無い（追加SQL_第1305便が未適用）ときもここで返す。★ 何もしない
  if (error) return NextResponse.json({ ok: false, error: '自動の上位表示の設定を読めなかった: ' + error.message }, { status: 500 });

  const results: Array<{ salonId: number; provider: string; slot: number; reason: string; started?: boolean; note?: string }> = [];
  for (const r of (data ?? []) as Row[]) {
    const slot = Number(r.slot ?? 1);
    const setting: BumpSetting = {
      enabled: true,
      startMin: Number(r.bump_start_min),
      endMin: Number(r.bump_end_min),
      intervalMin: Number(r.bump_interval_min),
    };
    const judge = shouldBumpNow({
      now, setting,
      state: { lastAt: r.bump_last_at, remaining: r.bump_remaining, readAt: r.bump_read_at, autoAt: r.bump_auto_at },
      // ★ 第1407便: 0回を読んだあとは、サイトの回数が戻る時刻（駅ちか 0:00・エステ魂 6:00）を過ぎたらまた見に行く
      resetMin: bumpResetMinOf(r.provider),
    });
    if (!judge.bump || !apply) { results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: judge.reason }); continue; }

    // ★ 始める前に「始めた時刻」を書く（同じ枠を立て続けに始めない）。★ 書けなければ始めない（二重に押しに行かない側）
    const { error: aErr } = await svc.from('salon_import_sources')
      .update({ bump_auto_at: now.toISOString() })
      .eq('salon_id', r.salon_id).eq('provider', r.provider).eq('slot', slot);
    if (aErr) { results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: 'mark_failed', note: aErr.message }); continue; }

    try {
      const f = await startRelayFlow({
        salonId: r.salon_id, provider: r.provider, slot,
        intent: 'bump_auto', actor: 'cron:ekichika-bump',
        bump: { setting },
      });
      results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: 'ok', started: f.ok, note: f.note });
    } catch (e) {
      console.error('[ekichika-bump] 流れを始められなかった', r.salon_id, slot, e instanceof Error ? e.message : 'unknown');
      results.push({ salonId: r.salon_id, provider: r.provider, slot, reason: 'start_failed' });
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
        if (!f.ok) await svc.from('conecf_esutama_posts').update({ read_at: (o.read_at as string | null) ?? null }).eq('salon_id', o.salon_id).eq('post_key', key);
        results.push({ ...base, reason: 'ok', started: f.ok, note: f.note });
      } catch (e) {
        console.error('[esutama-post] 流れを始められなかった', o.salon_id, key, e instanceof Error ? e.message : 'unknown');
        results.push({ ...base, reason: 'start_failed' });
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
