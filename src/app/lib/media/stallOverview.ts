import type { createServiceClient } from '@/app/lib/supabase/service';
import { computeMediaLinkAlerts } from '@/app/lib/media/linkAlerts';
import { collectDiaryStall } from '@/app/lib/media/diaryStallCollect';
import { mediaSlotLabel } from '@/lib/mediaLinkStall';
import { isWriteDirection } from '@/lib/mediaLinkMode';
import { workProblemOf, workProblemShort } from '@/lib/workProblem';
import { stallKey, type StallItem, type StallOverview } from '@/lib/stallDigest';
import { loadLoginRejectPaused } from '@/app/lib/media/loginAutoPause';
import { LOGIN_REJECT_WATCH_MESSAGE } from '@/lib/loginAutoPause';

// 全店の「止まっているもの・うまくいっていないもの」の【材料集め】（第1340便・2026-10-09）。
//
// ★ なぜ要るか・どの見張りの線を使うかは lib/stallDigest.ts の頭。
// ★ ここは読むだけ（DB に書かない・相手サイトへ行かない・メールを出さない）。
// ★ 判定は全部、今ある関数を呼ぶ（店の画面の赤い帯・ホームの「うまくいっていないこと」と同じ答えになる）:
//   取り込み・書き込み … computeMediaLinkAlerts（店ごと）
//   写メ日記の巡回     … collectDiaryStall
//   うまくいっていないこと … workProblemOf（鍵が使える枠だけ。記録の引き方は actions/mediaCredentials.ts の getMediaOverview と同じ）
// ★ 読めなかった店は errors に入れる（「止まっていない」に数えない）。

type Svc = ReturnType<typeof createServiceClient>;

/** 同時にいくつまで読むか（店が増えても、DB へ一度に押し寄せない） */
const PARALLEL = 6;

async function inBatches<T>(list: T[], fn: (x: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < list.length; i += PARALLEL) {
    await Promise.all(list.slice(i, i + PARALLEL).map(fn));
  }
}

export async function collectStallOverview(svc: Svc, now: Date): Promise<StallOverview> {
  const items: StallItem[] = [];
  const errors: string[] = [];

  // ── 0. 枠と、鍵 ──
  const [srcRes, credRes] = await Promise.all([
    svc.from('salon_import_sources').select('salon_id, provider, slot, link_mode'),
    svc.from('salon_media_credentials').select('salon_id, provider, slot, is_enabled, password_enc'),
  ]);
  if (srcRes.error) errors.push('連携の枠（salon_import_sources）を読めなかった: ' + srcRes.error.message);
  if (credRes.error) errors.push('ログイン情報（salon_media_credentials）を読めなかった: ' + credRes.error.message);
  const sources = (srcRes.data ?? []) as Array<{ salon_id: number; provider: string; slot: number; link_mode: string | null }>;
  // ★ password_enc は「あるか」だけを見る。中身はどこにも出さない
  const registered = ((credRes.data ?? []) as Array<{ salon_id: number; provider: string; slot: number | null; is_enabled: boolean | null; password_enc: string | null }>)
    .filter((c) => Boolean(c.password_enc))
    .map((c) => ({ salonId: Number(c.salon_id), provider: String(c.provider), slot: Number(c.slot ?? 1), enabled: c.is_enabled !== false }));
  const creds = registered.filter((c) => c.enabled).map(({ salonId, provider, slot }) => ({ salonId, provider, slot }));
  // ★ 第1378便: 一時停止している枠（登録は残っている）。「ID・パスワードが違う」ために自動で止めたものを、下の 4 で拾う
  const pausedCreds = registered.filter((c) => !c.enabled).map(({ salonId, provider, slot }) => ({ salonId, provider, slot }));

  const salonIds = Array.from(new Set([...sources.map((s) => Number(s.salon_id)), ...creds.map((c) => c.salonId), ...pausedCreds.map((c) => c.salonId)])).sort((a, b) => a - b);
  const nameOf = new Map<number, string>();
  if (salonIds.length > 0) {
    const { data: names, error: nameErr } = await svc.from('salons').select('id, name').in('id', salonIds);
    if (nameErr) errors.push('店の名前を読めなかった（番号だけで出す）: ' + nameErr.message);
    for (const r of names ?? []) nameOf.set(Number((r as { id: number }).id), String((r as { name: unknown }).name ?? ''));
  }
  const linkModeOf = new Map<string, string | null>();
  for (const s of sources) linkModeOf.set(Number(s.salon_id) + '#' + s.provider + '#' + Number(s.slot), s.link_mode ?? null);

  // ── 1. 取り込み・書き込み（店ごと。店の画面の赤い帯と同じ計算）──
  const sourceSalons = Array.from(new Set(sources.map((s) => Number(s.salon_id)))).sort((a, b) => a - b);
  await inBatches(sourceSalons, async (salonId) => {
    try {
      const r = await computeMediaLinkAlerts(svc, salonId);
      if (!r.ok) { errors.push('店 ' + salonId + ' の取り込み・書き込みを調べられなかった: ' + r.error); return; }
      for (const a of r.data) {
        const base = { watch: a.watch, salonId, provider: a.provider, slot: a.slot, reason: a.reason } as const;
        items.push({
          ...base,
          key: stallKey(base),
          salonName: nameOf.get(salonId) ?? '',
          siteLabel: mediaSlotLabel(a.provider, a.slot),
          elapsedHours: typeof a.elapsedHours === 'number' && Number.isFinite(a.elapsedHours) ? a.elapsedHours : null,
          message: a.message,
        });
      }
    } catch (e) {
      errors.push('店 ' + salonId + ' の取り込み・書き込みを調べている途中で落ちた: ' + (e instanceof Error ? e.message : '理由不明'));
    }
  });

  // ── 2. 写メ日記の巡回 ──
  let diarySlots = 0;
  let diaryQuiet = 0;
  try {
    const d = await collectDiaryStall(svc, now);
    if (!d.ok) errors.push('写メ日記の巡回を調べられなかった: ' + d.error);
    else {
      diarySlots = d.checked;
      diaryQuiet = d.quiet.length;
      for (const s of d.stalled) {
        const base = { watch: 'diary', salonId: s.salonId, provider: 'ekichika', slot: s.slot, reason: s.clock + '_' + s.reason } as const;
        items.push({
          ...base,
          key: stallKey(base),
          salonName: s.salonName || (nameOf.get(s.salonId) ?? ''),
          siteLabel: mediaSlotLabel('ekichika', s.slot),
          elapsedHours: Number.isFinite(s.elapsedHours) ? s.elapsedHours : null,
          message: s.message,
        });
      }
    }
  } catch (e) {
    errors.push('写メ日記の巡回を調べている途中で落ちた: ' + (e instanceof Error ? e.message : '理由不明'));
  }

  // ── 3. うまくいっていないこと（鍵が使える枠だけ）──
  //   ★ 書く向きの枠は、ホームに出るもの全部（ログイン・反映できていない・自動が止まった など）。
  //   ★ 読む向きの枠は、ログインだけ（出勤を送っていないので、送信の失敗は起きない。古い記録を拾わない）。
  await inBatches(creds, async (c) => {
    try {
      const base = () => svc
        .from('salon_media_audit')
        .select('event, outcome, created_at, detail')
        .eq('salon_id', c.salonId).eq('provider', c.provider).eq('slot', c.slot)
        .order('created_at', { ascending: false });
      const [workQ, loginQ] = await Promise.all([
        base().in('event', ['read_work', 'plan_work', 'write_work', 'verify_work', 'relay_gave_up', 'relay_expired', 'link_mode_changed']).limit(40),
        base().in('event', ['login', 'credential_saved']).limit(8),
      ]);
      if (workQ.error || loginQ.error) {
        errors.push('店 ' + c.salonId + '・' + c.provider + '（枠' + c.slot + '）の記録を読めなかった: ' + ((workQ.error ?? loginQ.error)?.message ?? '理由不明'));
        return;
      }
      const write = isWriteDirection(linkModeOf.get(c.salonId + '#' + c.provider + '#' + c.slot) ?? null);
      const merged = [...(write ? (workQ.data ?? []) : []), ...(loginQ.data ?? [])]
        .map((r) => ({ event: String(r.event), outcome: String(r.outcome), createdAt: String(r.created_at), detail: r.detail as unknown }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      const p = workProblemOf(merged);
      if (!p) return;
      if (!write && p.kind !== 'login') return;
      const t = Date.parse(p.at);
      const b2 = { watch: 'problem', salonId: c.salonId, provider: c.provider, slot: c.slot, reason: p.kind } as const;
      items.push({
        ...b2,
        key: stallKey(b2),
        salonName: nameOf.get(c.salonId) ?? '',
        siteLabel: mediaSlotLabel(c.provider, c.slot),
        elapsedHours: Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / 3600000) : null,
        message: workProblemShort(p),
      });
    } catch (e) {
      errors.push('店 ' + c.salonId + '・' + c.provider + '（枠' + c.slot + '）を調べている途中で落ちた: ' + (e instanceof Error ? e.message : '理由不明'));
    }
  });

  // ── 4. 「ID・パスワードが違う」ために自動で一時停止した枠（第1378便）──
  //   ★ 一時停止の枠は上の 3 が見ない（鍵が使える枠だけ）。そのままだと、自動で止めた瞬間に「ログインできていません」が消えて、
  //     「全部直りました」のメールが出てしまう。★ 同じ名前（problem・login）で残す＝知らせ済みの続きとして扱われる（新しいメールも出ない）。
  //   ★ 店舗様が自分で一時停止した枠は拾わない（記録の印で分ける・lib/loginAutoPause.ts）。
  //   ★ 読めなかったときは errors に入れる（読めなかった回を「直った」と数えない）。
  {
    const bySalon = new Map<number, Array<{ provider: string; slot: number }>>();
    for (const c of pausedCreds) {
      const list = bySalon.get(c.salonId) ?? [];
      list.push({ provider: c.provider, slot: c.slot });
      bySalon.set(c.salonId, list);
    }
    await inBatches([...bySalon.entries()], async ([salonId, list]) => {
      try {
        const rejected = await loadLoginRejectPaused(svc, salonId, list, (m) => errors.push(m));
        for (const p of list) {
          if (!rejected.has(p.provider + '#' + p.slot)) continue;
          const b4 = { watch: 'problem', salonId, provider: p.provider, slot: p.slot, reason: 'login' } as const;
          items.push({
            ...b4,
            key: stallKey(b4),
            salonName: nameOf.get(salonId) ?? '',
            siteLabel: mediaSlotLabel(p.provider, p.slot),
            elapsedHours: null,
            message: LOGIN_REJECT_WATCH_MESSAGE,
          });
        }
      } catch (e) {
        errors.push('店 ' + salonId + ' の一時停止の理由を調べている途中で落ちた: ' + (e instanceof Error ? e.message : '理由不明'));
      }
    });
  }

  return {
    items,
    checked: { salons: salonIds.length, credentials: creds.length, diarySlots, diaryQuiet },
    errors,
  };
}
