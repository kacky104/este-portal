import { Resend } from 'resend';
import { createServiceClient } from '@/app/lib/supabase/service';
import { forwardsDiaryFromFukues, readDiarySource } from '@/lib/diarySource';

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
  枠?: number;           // 同一媒体の何枠目か（本枠=1・B枠=2…）。skip系では付かないことがある。
  宛先: string;          // 伏字（ログや画面に出しても安全な形）
  status: string;        // 'sent' | 'would_send' | 'failed:…' | 'skipped:…'
  error?: string;
};

export type ForwardResult = {
  ok: boolean;
  apply: boolean;
  注意: string;
  diaryId: string;
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

type Svc = ReturnType<typeof createServiceClient>;

type Payload = {
  therapistId: number;
  salonId: number;
  source: string;
  title: string | null;
  content: string | null;
  attachments: Array<{ filename: string; content: string }>;
  外した理由: string[];
  totalBytes: number;
};

/**
 * 日記1件から「送る中身」を組み立てる（件名・本文・添付画像）。
 * ★ 初回送信（forwardDiary）と再送（retryFailedForwards）で同じものを使う。
 *   別々に書くと、片方だけ直して食い違う。
 */
async function buildPayload(svc: Svc, diaryId: string): Promise<{ ok: true; payload: Payload } | { ok: false; error: string }> {
  const { data: diary, error: dErr } = await svc
    .from('diary_posts')
    .select('id, therapist_id, salon_id, images, title, content')
    .eq('id', diaryId)
    .maybeSingle();
  if (dErr || !diary) return { ok: false, error: `日記が見つかりません（${dErr?.message ?? 'not found'}）` };

  const therapistId = diary.therapist_id as number;
  const salonId = diary.salon_id as number;

  const { data: salon } = await svc.from('salons').select('diary_source').eq('id', salonId).maybeSingle();
  const source = (salon?.diary_source as string | null) ?? 'benry';

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

  return { ok: true, payload: { therapistId, salonId, source, title, content, attachments, 外した理由, totalBytes: total } };
}

/**
 * 1件の写メ日記を、その子の転送先ぜんぶへ送る。
 * @param diaryId diary_posts.id（uuid）
 * @param apply   true で実際に送る。既定 false は試し打ち（1通も送らない）。
 */
export async function forwardDiary(diaryId: string, apply = false): Promise<ForwardResult> {
  const base: ForwardResult = {
    ok: true, apply,
    注意: apply ? '送信しました' : '試し打ち（1通も送っていません）',
    diaryId, 宛先: [],
  };
  const svc = createServiceClient();

  // 1〜2. 日記本体と「送る中身」（件名・本文・添付）を組み立てる
  const built = await buildPayload(svc, diaryId);
  if (!built.ok) return { ...base, ok: false, 注意: built.error };
  const { therapistId, salonId, source, title, content, attachments, 外した理由, totalBytes } = built.payload;

  // 3. 転送先（媒体×枠）
  const { data: fwd } = await svc
    .from('therapist_diary_forward')
    .select('provider, slot, address, is_enabled')
    .eq('therapist_id', therapistId);
  const rows = fwd ?? [];

  const result: ForwardResult = {
    ...base,
    therapistId, salonId, 正本: source,
    件名: title ?? '(タイトルなし)',
    本文の文字数: content?.length ?? 0,
    添付: { 枚数: attachments.length, 合計KB: Math.round(totalBytes / 1024), ...(外した理由.length ? { 外した理由 } : {}) },
    宛先: [],
  };

  // 5. 送らない条件をここで確定させる（理由が読み取れる形で残す）
  const log = async (provider: string, status: string, error?: string, slot?: number) => {
    await svc.from('diary_forward_log').insert({ diary_id: diaryId, therapist_id: therapistId, provider, slot: slot ?? null, status, error: error ?? null });
  };

  // ★★ 試し打ち（apply:false）は、正本が 'benry' でも止めずに宛先まで見せる。
  //   「送る前に目で確かめる」ためのものなのに、確かめるために salons.diary_source を
  //   'fukues' へ切り替えねばならない、という順序の逆転を避けるため。
  //   切り替えると受信側（resend-inbound）がベンリー経由の日記を捨て始める＝本番の運用が変わってしまう。
  //   実際に送るのは apply:true のときだけなので、誤送信は増えない。
  // ★★ 判定は src/lib/diarySource.ts の一本線（第99便）。★ ここに値を直書きしない。
  if (!forwardsDiaryFromFukues(source)) {
    // ★ 送らなかった理由に【どの入口だったか】を残す（§372: 一緒くたにしない）。
    //   ★ 以前は入口が2つしか無かったので 'skipped:source_is_benry' と決め打っていた。
    //     'ekichika' の店が増えた今、決め打つと記録が嘘になる。
    const why = 'skipped:source_is_' + readDiarySource(source);
    if (apply) {
      result.宛先.push({ provider: '-', 宛先: '-', status: why });
      await log('-', why);
      return result;
    }
    result.注意 = `試し打ち（1通も送っていません）／この店舗の正本は ${readDiarySource(source)} のため、実運用では送られません`;
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
  if (apply && !apiKey) {
    result.ok = false;
    result.宛先.push({ provider: '-', 宛先: '-', status: 'failed:RESEND_API_KEY 未設定' });
    return result;
  }
  // ★ 試し打ちでは1通も送らないため、キーが無くても宛先の確認だけは進める。
  const resend = new Resend(apiKey ?? 'dry-run');

  // 6. 送る
  for (const row of rows) {
    const provider = row.provider as string;
    const slot = Number((row as { slot?: number }).slot ?? 1);
    const address = row.address as string;
    if (row.is_enabled === false) {
      result.宛先.push({ provider, 枠: slot, 宛先: mask(address), status: 'skipped:disabled' });
      if (apply) await log(provider, 'skipped:disabled', undefined, slot);
      continue;
    }
    if (!apply) {
      result.宛先.push({ provider, 枠: slot, 宛先: mask(address), status: 'would_send' });
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
        result.宛先.push({ provider, 枠: slot, 宛先: mask(address), status: 'failed', error: error.message });
        await log(provider, 'failed', error.message, slot);
        result.ok = false;
      } else {
        result.宛先.push({ provider, 枠: slot, 宛先: mask(address), status: 'sent' });
        await log(provider, 'sent', undefined, slot);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      result.宛先.push({ provider, 枠: slot, 宛先: mask(address), status: 'failed', error: msg });
      await log(provider, 'failed', msg, slot);
      result.ok = false;
    }
  }

  return result;
}

// ── 失敗した転送の再送（第37便）────────────────────────────────────
//
// ★★★ 5分ルール（2026-08-27 に駅ちかの写メ投稿画面で確認）
//   駅ちかには「同じ女性から同じタイトル（件名）での5分以内の投稿は反映されません」
//   という重複防止がある。再送は件名も本文も同じなので、失敗直後に投げ直すと
//   【Resendは成功を返すのに媒体側は黙って捨てる】＝新しい「送ったつもり」が生まれる。
//   だから MIN_AGE_MIN 以上あいたものだけを拾う。5分きっかりではなく余裕を持たせる。
//
// ★★ 二重送信の防止
//   拾うときに attempts を版番号として compare-and-swap する
//   （読んだ attempts と一致する行だけ 'retrying' に書き換えられる）。
//   cronの周が重なっても、同じ行を2回送らない。
//   途中で落ちて 'retrying' のまま残った行も、時間が経てば対象に戻る。
//
// ★ 正本が 'benry' に戻っていたら送らない。
//   「フクエスをやめた店舗に、あとから再送で届く」を防ぐ。

/** 失敗から再送までに最低これだけあける（分）。駅ちかの5分ルールに余裕を足した値。 */
const MIN_AGE_MIN = 10;
/** 何回まで再送するか（初回を含む）。これを超えたら諦めてログに残したままにする。 */
const MAX_ATTEMPTS = 3;

export type RetryResult = {
  ok: boolean;
  apply: boolean;
  注意: string;
  対象件数: number;
  再送: Array<{ diaryId: string; provider: string; 枠: number; 宛先: string; status: string; error?: string }>;
};

/**
 * 失敗した転送を拾い直して送る（VPSのcronから叩く想定）。
 * @param opts.apply true で実際に送る。既定 false は試し打ち（1通も送らない）。
 * @param opts.limit 1回で拾う最大件数（既定20・上限100）。
 */
export async function retryFailedForwards(opts: { limit?: number; apply?: boolean } = {}): Promise<RetryResult> {
  const apply = opts.apply === true;
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20), 1), 100);
  const svc = createServiceClient();
  const out: RetryResult = {
    ok: true, apply,
    注意: apply ? '再送しました' : '試し打ち（1通も送っていません）',
    対象件数: 0, 再送: [],
  };

  const cutoff = new Date(Date.now() - MIN_AGE_MIN * 60_000).toISOString();
  const { data: rows, error } = await svc
    .from('diary_forward_log')
    .select('id, diary_id, therapist_id, provider, slot, attempts')
    .in('status', ['failed', 'retrying'])
    .lt('attempts', MAX_ATTEMPTS)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return { ...out, ok: false, 注意: `対象の取得に失敗しました（${error.message}）` };

  const targets = rows ?? [];
  out.対象件数 = targets.length;
  if (targets.length === 0) {
    // ★ 「0件」を報告するときは0の理由が読み取れる形にする（第35便の反省）
    out.注意 = `再送が必要な転送はありません（${MIN_AGE_MIN}分以上前・${MAX_ATTEMPTS}回未満の failed/retrying が対象）`;
    return out;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (apply && !apiKey) return { ...out, ok: false, 注意: 'RESEND_API_KEY 未設定' };
  const resend = new Resend(apiKey ?? 'dry-run');

  for (const row of targets) {
    const diaryId = String(row.diary_id);
    const provider = String(row.provider);
    const slot = Number((row as { slot?: number }).slot ?? 1);
    const attempts = Number(row.attempts ?? 1);
    const note = (status: string, 宛先: string, err?: string) =>
      out.再送.push({ diaryId, provider, 枠: slot, 宛先, status, ...(err ? { error: err } : {}) });
    const mark = async (status: string, err?: string | null) => {
      await svc.from('diary_forward_log').update({ status, error: err ?? null, attempts: attempts + 1 }).eq('id', row.id);
    };

    // 宛先（消されている・無効化されていることがある）
    const { data: fwd } = await svc
      .from('therapist_diary_forward')
      .select('address, is_enabled')
      .eq('therapist_id', row.therapist_id)
      .eq('provider', provider)
      .eq('slot', slot)
      .maybeSingle();
    if (!fwd || fwd.is_enabled === false) {
      note('skipped:no_address', '-');
      if (apply) await mark('skipped:no_address');
      continue;
    }
    const address = String(fwd.address);

    const built = await buildPayload(svc, diaryId);
    if (!built.ok) {
      note('skipped:diary_gone', mask(address), built.error);
      if (apply) await mark('skipped:diary_gone', built.error);
      continue;
    }
    if (!forwardsDiaryFromFukues(built.payload.source)) {
      const why = 'skipped:source_is_' + readDiarySource(built.payload.source);
      note(why, mask(address));
      if (apply) await mark(why);
      continue;
    }

    if (!apply) { note('would_retry', mask(address)); continue; }

    // ★ 先に取りにいく（attempts を版番号にした compare-and-swap）
    const { data: claimed } = await svc
      .from('diary_forward_log')
      .update({ status: 'retrying', attempts: attempts + 1 })
      .eq('id', row.id)
      .eq('attempts', attempts)
      .select('id');
    if (!claimed || claimed.length === 0) { note('skipped:taken', mask(address)); continue; }

    const { title, content, attachments } = built.payload;
    try {
      const { error: sErr } = await resend.emails.send({
        from: FROM,
        to: address,
        subject: title ?? '写メ日記',
        text: content ?? '',
        ...(attachments.length ? { attachments } : {}),
      });
      if (sErr) {
        note('failed', mask(address), sErr.message);
        await svc.from('diary_forward_log').update({ status: 'failed', error: sErr.message }).eq('id', row.id);
        out.ok = false;
      } else {
        note('sent', mask(address));
        await svc.from('diary_forward_log').update({ status: 'sent', error: null }).eq('id', row.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      note('failed', mask(address), msg);
      await svc.from('diary_forward_log').update({ status: 'failed', error: msg }).eq('id', row.id);
      out.ok = false;
    }
  }

  return out;
}
