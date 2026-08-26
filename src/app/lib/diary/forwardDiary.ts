import { Resend } from 'resend';
import { createServiceClient } from '@/app/lib/supabase/service';

// ── 写メ日記の他媒体転送（第36便・第2弾）────────────────────────────────
//
// フクエスで書かれた写メ日記を、駅ちか／エスラブの「投稿用メールアドレス」へ送る。
// 件名=タイトル・本文=日記・添付=写真、という媒体側の受け口の作法に合わせる。
//
// ★★★ 勝ち筋は【即時反映】。ベンリー経由だと他媒体への反映が10分後、フクエスからだと即時。
//   だから cron に積まず、投稿の流れの中で同期的に送る。遅らせると価値が消える。
//
// ★★★ 二重投稿を防ぐ唯一の仕掛けは salons.diary_source。
//   'fukues' の店舗だけ送る。'benry' の店舗は他媒体で書いてベンリー経由で受け取るので送らない。
//   受信側（/api/webhooks/resend-inbound）は 'fukues' の店舗宛のメールを受け取らずに捨てること。
//   受け取ってから重複判定する形にすると、判定は必ずどこかで外れる。
//
// ★★ apply の既定は false（試し打ち）。1通も送らずに「何を、どこへ、どんな形で送るつもりか」を返す。
//   第36便の取り込みで機能した形をそのまま踏襲している。本番に当てる前に必ず目で見られる。
//
// ★ 失敗しても例外を投げない。日記の投稿そのものは成立させる（fukuX同時投稿と同じ best-effort）。
//   結果は diary_forward_log に残すので、あとから再送できる。

const FROM = 'フクエス写メ日記 <diary@send.fukues.com>';

// 添付の上限。媒体側の制限は未確認なので控えめに置く（第36便）。
// ★ 超えたぶんは黙って捨てず、返り値の「添付から外した」に理由を残すこと。
const MAX_ATTACH = 4;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

export type ForwardTarget = {
  provider: string;
  宛先: string;          // 伏字（ログや画面に出しても安全な形）
  status: string;        // 'sent' | 'would_send' | 'failed:…' | 'skipped:…'
  error?: string;
};

export type ForwardResult = {
  ok: boolean;
  apply: boolean;
  注意: string;
  diaryId: number;
  therapistId?: number;
  salonId?: number;
  正本?: string;
  件名?: string;
  本文の文字数?: number;
  添付?: { 枚数: number; 合計KB: number; 外した理由?: string[] };
  宛先: ForwardTarget[];
};

/** アドレスを伏字にする。d-abcd1234@x.com → d-ab****34@x.com */
function mask(addr: string): string {
  const at = addr.indexOf('@');
  if (at < 0) return '****';
  const local = addr.slice(0, at);
  const dom = addr.slice(at);
  if (local.length <= 4) return `****${dom}`;
  return `${local.slice(0, 2)}****${local.slice(-2)}${dom}`;
}

/**
 * 1件の写メ日記を、その子の転送先ぜんぶへ送る。
 * @param diaryId diary_posts.id
 * @param apply   true で実際に送る。既定 false は試し打ち（1通も送らない）。
 */
export async function forwardDiary(diaryId: number, apply = false): Promise<ForwardResult> {
  const base: ForwardResult = {
    ok: true, apply,
    注意: apply ? '送信しました' : '試し打ち（1通も送っていません）',
    diaryId, 宛先: [],
  };
  const svc = createServiceClient();

  // 1. 日記
  const { data: diary, error: dErr } = await svc
    .from('diary_posts')
    .select('id, therapist_id, salon_id, images, title, content')
    .eq('id', diaryId)
    .maybeSingle();
  if (dErr || !diary) return { ...base, ok: false, 注意: `日記が見つかりません（${dErr?.message ?? 'not found'}）` };

  const therapistId = diary.therapist_id as number;
  const salonId = diary.salon_id as number;

  // 2. 正本の選択
  const { data: salon } = await svc.from('salons').select('diary_source').eq('id', salonId).maybeSingle();
  const source = (salon?.diary_source as string | null) ?? 'benry';

  // 3. 転送先
  const { data: fwd } = await svc
    .from('therapist_diary_forward')
    .select('provider, address, is_enabled')
    .eq('therapist_id', therapistId);
  const rows = fwd ?? [];

  // 4. 送る中身を組み立てる
  const title = (diary.title as string | null)?.trim() || null;
  const content = (diary.content as string | null)?.trim() || null;
  const urls = ((diary.images as string[] | null) ?? []).filter(Boolean);

  const 外した理由: string[] = [];
  const attachments: Array<{ filename: string; content: string }> = [];
  let total = 0;
  for (const [i, url] of urls.entries()) {
    if (attachments.length >= MAX_ATTACH) { 外した理由.push(`${urls.length - MAX_ATTACH}枚が枚数上限(${MAX_ATTACH})超過`); break; }
    try {
      const r = await fetch(url);
      if (!r.ok) { 外した理由.push(`${i + 1}枚目が取得失敗(${r.status})`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (total + buf.length > MAX_TOTAL_BYTES) { 外した理由.push(`${i + 1}枚目以降が容量上限(${MAX_TOTAL_BYTES / 1024 / 1024}MB)超過`); break; }
      total += buf.length;
      const ext = (url.split('?')[0]?.split('.').pop() ?? 'jpg').slice(0, 4);
      attachments.push({ filename: `photo${i + 1}.${ext}`, content: buf.toString('base64') });
    } catch (e) {
      外した理由.push(`${i + 1}枚目が取得失敗(${e instanceof Error ? e.message : 'unknown'})`);
    }
  }

  const result: ForwardResult = {
    ...base,
    therapistId, salonId, 正本: source,
    件名: title ?? '(タイトルなし)',
    本文の文字数: content?.length ?? 0,
    添付: { 枚数: attachments.length, 合計KB: Math.round(total / 1024), ...(外した理由.length ? { 外した理由 } : {}) },
    宛先: [],
  };

  // 5. 送らない条件をここで確定させる（理由が読み取れる形で残す）
  const log = async (provider: string, status: string, error?: string) => {
    await svc.from('diary_forward_log').insert({ diary_id: diaryId, therapist_id: therapistId, provider, status, error: error ?? null });
  };

  if (source !== 'fukues') {
    result.宛先.push({ provider: '-', 宛先: '-', status: 'skipped:source_is_benry' });
    if (apply) await log('-', 'skipped:source_is_benry');
    return result;
  }
  if (rows.length === 0) {
    result.宛先.push({ provider: '-', 宛先: '-', status: 'skipped:no_address' });
    if (apply) await log('-', 'skipped:no_address');
    return result;
  }
  if (!title && !content && attachments.length === 0) {
    result.宛先.push({ provider: '-', 宛先: '-', status: 'skipped:empty' });
    if (apply) await log('-', 'skipped:empty');
    return result;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    result.ok = false;
    result.宛先.push({ provider: '-', 宛先: '-', status: 'failed:RESEND_API_KEY 未設定' });
    return result;
  }
  const resend = new Resend(apiKey);

  // 6. 送る
  for (const row of rows) {
    const provider = row.provider as string;
    const address = row.address as string;
    if (row.is_enabled === false) {
      result.宛先.push({ provider, 宛先: mask(address), status: 'skipped:disabled' });
      if (apply) await log(provider, 'skipped:disabled');
      continue;
    }
    if (!apply) {
      result.宛先.push({ provider, 宛先: mask(address), status: 'would_send' });
      continue;
    }
    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: address,
        subject: title ?? '写メ日記',
        text: content ?? '',
        ...(attachments.length ? { attachments } : {}),
      });
      if (error) {
        result.宛先.push({ provider, 宛先: mask(address), status: 'failed', error: error.message });
        await log(provider, 'failed', error.message);
        result.ok = false;
      } else {
        result.宛先.push({ provider, 宛先: mask(address), status: 'sent' });
        await log(provider, 'sent');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      result.宛先.push({ provider, 宛先: mask(address), status: 'failed', error: msg });
      await log(provider, 'failed', msg);
      result.ok = false;
    }
  }

  return result;
}
