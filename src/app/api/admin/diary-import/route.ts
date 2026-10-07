import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow, diaryBackfillContext } from '@/app/lib/media/relayFlow';
import { importsDiaryFromEkichika, readDiarySource } from '@/lib/diarySource';
import { stampDiaryQueued } from '@/app/lib/media/diaryWatch';
import { syncDiarySource } from '@/app/lib/media/diarySourceSync';
import { diaryMixedRuns } from '@/lib/diaryMixedPeriod';

// ── 写メ日記の取り込みを1回まわす（第95便）─────────────────────────────
//   POST /api/admin/diary-import  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId?: number, slot?: number, since?: 'YYYY-MM-DD', maxPages?: number, apply?: boolean }
//
// ★★★ この口がすること: 中継ジョブ（login）を1件積むだけ。
//   ★ 実際に駅ちかを読むのは毎分の relay.sh（VPS）。★ VPS側に新しい実装は要らない。
//
// ★★★★ 動くのは【入口が 'ekichika' の店】だけ（第99便）。
//   ★ salons.diary_source が 'ekichika' の店だけ回す。★ 'benry'（メールで受け取る）の店を
//     ここで回すと、同じ日記がメールと取り込みで2件並ぶ。
//   ★ 判定は src/lib/diarySource.ts の一本線。★ ここに条件を書き足さないこと。
//   ★ 鍵があっても入口が違えば回さない。★ 切り替えるまでは 0件（＝安全側に止まる）。
//
// ★★★ 動くのは【鍵を預けていただいた店】だけ（設計メモ §6-1）。
//   ★ 出勤は公開ページなので鍵が要らないが、写メ日記は管理画面なので鍵が要る。
//   ★ 2026-09-01 時点で鍵があるのは THE LABYRINTH 様の1店だけ。
//
// ★★ apply 既定 false（試し打ち）。★ 何店ぶん積むつもりかだけ返す。
//   ★ media-auto-push・relay-purge と同じ作法。★ 最初は apply なしで数を見ること。
//
// ★★★ 第1140便（2026-10-03・カッキーさん）: 移行期間の取り込み。
//   salons.diary_mixed_since が入っている店は、入口が 'fukues'（写メ日記はフクエスで書く）でも回す。
//   ★ セラピストは出勤日に1人ずつ切り替えるので、しばらく「フクエスで書く人」と「駅ちかで書く人」が混じる。
//   ★ 駅ちかで書かれた日記だけを取り込む（見分けは relayFlow の saveDiaryDetail ③b・セラピストごとに線を引く）。
//   ★ 第1264便（2026-10-07）: フクエスリンクのホームで「フクエスで書く」を選ぶと自動で入り、「駅ちかで書く」に戻すと消える
//     （setDiaryWritePref・lib/diarySource.ts の nextDiaryMixedSince）。それまでは運営が店ごとに SQL で入れていた（追加SQL_第1140便）。
//     列が空の店は今までどおり。
//   ★ 第1265便（2026-10-07）: コネックエフに切り替えた店も、切り替えてから30日間（＋店舗様の延長14日ずつ）は回す。
//     期限（salons.diary_mixed_until）を過ぎたら、その店へは行かない（ログインもしない）。フクエスリンクの店に期限は無い。
//
// ★ since を渡すと【初回の遡り】になる（それより古い投稿は開かない・ページを遡る）。
//   ★ 渡さなければ通常運転＝一覧の1ページ目だけを見て、新着だけ開く（§371）。
//
// crontab（VPS・15分ごと。★ ③④が済んでから足すこと）:
//   2,17,32,47 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/diary-import -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Body = {
  salonId?: unknown;
  slot?: unknown;
  since?: unknown;
  maxPages?: unknown;
  apply?: unknown;
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const onlySalon = Number(body.salonId);
  const onlySlot = Number(body.slot);
  const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since)
    ? body.since + 'T00:00:00+09:00'
    : null;

  const svc = createServiceClient();

  // ★★ 鍵が登録されていて、止められていない枠だけ。★ 同意も要る（写メ日記は管理画面を読むため）
  let q = svc
    .from('salon_media_credentials')
    .select('salon_id, provider, slot, is_enabled, consent_version')
    .eq('provider', 'ekichika')
    .eq('is_enabled', true);
  if (Number.isFinite(onlySalon) && onlySalon > 0) q = q.eq('salon_id', onlySalon);
  if (Number.isFinite(onlySlot) && onlySlot > 0) q = q.eq('slot', onlySlot);

  const { data: creds, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // ★ 同意していない枠は動かさない（第89便の作法）
  const consented = (creds ?? []).filter(
    (c) => typeof (c as { consent_version?: string | null }).consent_version === 'string'
  );
  const noConsent = (creds ?? []).length - consented.length;

  // ★★★ 入口が 'ekichika' の店だけに絞る（第99便）
  //   ★ 鍵の有無ではなく【店舗が選んだ入口】で決める。
  //   ★ 引けなかったときは回さない。★「分からない」を「回してよい」と読まない（作法 3-5）。
  const salonIds = Array.from(new Set(consented.map((c) => Number((c as { salon_id: number }).salon_id))));
  // ★★★ 第669便: 入口を今の向き・鍵から導き直してから読む（★ 向きを SQL で直接変えても、ここで揃う）。
  //   ★ 試し打ち（apply なし）では書かない。★ 失敗しても周は止めない（syncDiarySource が console.error する）。
  if (apply) {
    for (const id of salonIds) await syncDiarySource(svc, id, 'cron:diary-import');
  }
  const sourceOf = new Map<number, string>();
  // ★ 第897便: 自動の遡り（はじめて ID・PW を入れた店・60日）。★ since が入っている間だけ
  const backfillOf = new Map<number, { since: string; until: string | null }>();
  // ★ 第1140便: 移行期間の取り込み（値は始まりの時刻。第1264便から「フクエスで書く」を選んだときに自動で入る）
  const mixedSinceOf = new Map<number, string>();
  if (salonIds.length > 0) {
    // ★ 列がまだ無くても止めない（SQL と push の順番を問わない）。読めなければ「移行期間の店は無い」として進む
    const { data: mixedRows, error: mixedErr } = await svc.from('salons').select('id, diary_mixed_since').in('id', salonIds);
    if (mixedErr) console.warn('[diary-import] diary_mixed_since を読めなかった（列が無い？）', mixedErr.message);
    for (const r of mixedRows ?? []) {
      const row = r as { id: number; diary_mixed_since?: string | null };
      if (typeof row.diary_mixed_since === 'string' && row.diary_mixed_since) mixedSinceOf.set(Number(row.id), row.diary_mixed_since);
    }
  }
  // ★★★ 第1142便: 移行期間の取り込みは、駅ちかが【駅ちかから反映（read）】のあいだだけ回す。
  //   ★ 店舗様がホームで「駅ちかからの反映を止める」を押したら（link_mode='none'）、写メ日記の取り込みも止める。
  //     ★ 入口が 'ekichika' の店は、止めた瞬間に入口が 'benry' に変わるので元から止まる。
  //       ★ 「フクエスで書く」の店は入口が 'fukues' のまま変わらないので、ここで向きを見ないと回り続けてしまう。
  //   ★ 読めなかったときは回さない（★「分からない」を「回してよい」と読まない）。
  // ★★★ 第1265便（2026-10-07・カッキーさんの決定）: コネックエフに切り替えた店も、【移行期間のあいだだけ】回す。
  //   ・切り替えていない店（フクエスリンク）… 今までどおり、その枠が read のあいだ（期限なし）
  //   ・切り替えた店 … その枠が「フクエスから反映（write / write_auto）」で、期限（salons.diary_mixed_until）の前だけ。
  //     期限は切り替えたときに30日で入り、店舗様が「14日間延長する」で延ばせる（lib/diaryMixedPeriod.ts・番人 check:diarymixed）。
  //   ★ 決め方は diaryMixedRuns の1か所。★ 切り替えたかどうか・期限を読めなかったときは回さない。
  //   ★ diary_mixed_until は新しい列（追加SQL_第1265便）。ほかの列と別に読む＝列が無くても、フクエスリンクの店の取り込みは今までどおり回る。
  const mixedRunSlots = new Set<string>();
  if (mixedSinceOf.size > 0) {
    const mixedIds = [...mixedSinceOf.keys()];
    const nowISO = new Date().toISOString();
    const switchedOf = new Map<number, boolean>();
    const { data: swRows, error: swErr } = await svc.from('salons').select('id, conecf_enabled_at').in('id', mixedIds);
    if (swErr) console.warn('[diary-import] 移行期間の店の切り替えを読めなかった（回さない）', swErr.message);
    for (const r of swRows ?? []) switchedOf.set(Number((r as { id: number }).id), !!(r as { conecf_enabled_at?: string | null }).conecf_enabled_at);
    const untilOf = new Map<number, string>();
    const { data: untilRows, error: untilErr } = await svc.from('salons').select('id, diary_mixed_until').in('id', mixedIds);
    if (untilErr) console.warn('[diary-import] 移行期間の期限を読めなかった（切り替えた店は回さない。列が無い？）', untilErr.message);
    for (const r of untilRows ?? []) {
      const row = r as { id: number; diary_mixed_until?: string | null };
      if (typeof row.diary_mixed_until === 'string' && row.diary_mixed_until) untilOf.set(Number(row.id), row.diary_mixed_until);
    }
    const { data: srcRows, error: srcErr } = await svc
      .from('salon_import_sources')
      .select('salon_id, slot, link_mode, is_enabled')
      .eq('provider', 'ekichika')
      .in('salon_id', mixedIds);
    if (srcErr) console.warn('[diary-import] 移行期間の店の向きを読めなかった（回さない）', srcErr.message);
    for (const r of srcRows ?? []) {
      const row = r as { salon_id: number; slot: number | null; link_mode: string | null; is_enabled: boolean | null };
      const sid = Number(row.salon_id);
      // ★ 切り替えたかどうかが分からない店は回さない（★「分からない」を「回してよい」と読まない）
      if (!switchedOf.has(sid)) continue;
      if (diaryMixedRuns({
        switched: switchedOf.get(sid) === true,
        linkMode: row.link_mode,
        slotEnabled: row.is_enabled !== false,
        until: untilOf.get(sid) ?? null,
        nowISO,
      })) mixedRunSlots.add(sid + '#' + Number(row.slot ?? 1));
    }
  }
  if (salonIds.length > 0) {
    const { data: salonRows, error: salonErr } = await svc
      .from('salons').select('id, diary_source, diary_backfill_since, diary_backfill_until').in('id', salonIds);
    if (salonErr) return NextResponse.json({ ok: false, error: salonErr.message }, { status: 500 });
    for (const r of salonRows ?? []) {
      const row = r as { id: number; diary_source: unknown; diary_backfill_since?: string | null; diary_backfill_until?: string | null };
      sourceOf.set(Number(row.id), readDiarySource(row.diary_source));
      if (row.diary_backfill_since) backfillOf.set(Number(row.id), { since: row.diary_backfill_since, until: row.diary_backfill_until ?? null });
    }
  }

  // ★★ 回すのは: 入口が ekichika の店 ＋【遡りの途中で「フクエスで書く」にした店】（★ until があるときだけ＝切り替え前の日記だけ取り込む）
  // ★ 第1140便: 移行期間の取り込みで回す店か（入口が 'fukues' ＋ 始まりの時刻が入っている）。
  //   ★ 入口が 'ekichika' の店は今までどおりの取り込み（見分けは使わない。フクエスで書いても駅ちかへ送らないので写しが無い）
  //   ★ 第1142便: その枠が「駅ちかから反映（read）」のときだけ（止めた店・止めた枠は回さない）
  //   ★ 第1265便: コネックエフに切り替えた店は、その枠が「フクエスから反映」で、移行期間（期限の前）のあいだだけ（mixedRunSlots）
  const isMixed = (salonId: number, slot: number): boolean =>
    sourceOf.get(salonId) === 'fukues' && mixedSinceOf.has(salonId) && mixedRunSlots.has(salonId + '#' + slot);
  const canRun = (salonId: number, slot: number): boolean => {
    if (importsDiaryFromEkichika(sourceOf.get(salonId))) return true;
    if (isMixed(salonId, slot)) return true;
    const b = backfillOf.get(salonId);
    return !!(b && b.until);
  };
  const slotOf = (c: unknown): number => Number((c as { slot?: number | null }).slot ?? 1);
  const targets = consented.filter((c) => canRun(Number((c as { salon_id: number }).salon_id), slotOf(c)));

  // ★★ 「0件」の理由が読み取れる形で返す（第35便の反省6）。
  //   ★ 鍵はあるのに回らない店を、黙って数から消さない。
  const skipped = consented
    .filter((c) => !canRun(Number((c as { salon_id: number }).salon_id), slotOf(c)))
    .map((c) => ({
      salonId: Number((c as { salon_id: number }).salon_id),
      slot: Number((c as { slot: number }).slot),
      diarySource: sourceOf.get(Number((c as { salon_id: number }).salon_id)) ?? '★ 店舗が引けなかった',
      note: '★ 入口が ekichika ではないため回さない',
    }));
  // ★ 第1140便: 移行期間の取り込みで回す店（試し打ちでも見えるように返す）
  const mixedTargets = targets
    .map((c) => ({ salonId: Number((c as { salon_id: number }).salon_id), slot: slotOf(c) }))
    .filter((t) => isMixed(t.salonId, t.slot))
    .map((t) => ({ ...t, since: mixedSinceOf.get(t.salonId) }));

  if (!apply) {
    return NextResponse.json({
      ok: true,
      applied: false,
      targets: targets.length,
      移行期間の取り込み: mixedTargets,
      skipped,
      noConsent,
      note: '試し打ち。★ apply:true で実際に積みます',
      since,
    });
  }

  const started: Array<{ salonId: number; slot: number; jobId?: string; note: string }> = [];
  for (const c of targets) {
    const salonId = Number((c as { salon_id: number }).salon_id);
    const slot = Number((c as { slot: number }).slot);
    try {
      const r = await startRelayFlow({
        salonId,
        provider: 'ekichika',
        slot,
        intent: 'diary_read',
        actor: 'cron:diary-import',
        // ★ since を渡したときだけ遡る。★ 通常運転は1ページ目だけ
        // ★ 第897便: 自動の遡りの店は、列の since（と until）で遡る（★ 手動の since を渡されたら手動を優先）
        ...(since
          ? diaryBackfillContext({ since, maxPages: Number(body.maxPages), until: backfillOf.get(salonId)?.until ?? null })
          : backfillOf.has(salonId)
            ? diaryBackfillContext({ since: backfillOf.get(salonId)!.since, until: backfillOf.get(salonId)!.until, backfill: true })
            : {}),
        // ★ 第1140便: 移行期間の店は、日記を保存する前に「フクエスで書いたものの写しか」を見る
        ...(isMixed(salonId, slot) ? { diaryMixedSince: mixedSinceOf.get(salonId) } : {}),
      });
      started.push({ salonId, slot, jobId: r.ok ? r.jobId : undefined, note: r.note });
      // ★★ 積めた【後】に心拍を刻む（第100便）。★ 前に刻むと、積めていないのに新しくなる
      if (r.ok) await stampDiaryQueued({ salonId, provider: 'ekichika', slot });
    } catch (e) {
      // ★ 1店で転んでも、ほかの店を止めない
      started.push({ salonId, slot, note: '★ 始められなかった: ' + String((e as Error).message).slice(0, 120) });
    }
  }

  return NextResponse.json({ ok: true, applied: true, targets: targets.length, skipped, noConsent, since, started });
}
