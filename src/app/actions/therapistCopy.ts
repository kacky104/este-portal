'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { generateCopyForTherapist } from '@/app/lib/therapistCopyCore';

// ── AI紹介文生成（第30便・2026-08-24）────────────────────────────
// /mypage/therapist/[id] の「AIで下書き」ボタンから呼ぶ server action。
// 生成そのものは app/lib/therapistCopyCore.ts に置き、ここは
// 「認可」「月間枠の管理」「利用ログ」だけを担う。
// （運営用の一括生成 /api/admin/therapist-copy-batch も同じ core を使う）
//
// ⚠ セキュリティ（therapistAdmin.ts と同方針・厳守）:
//  - ANTHROPIC_API_KEY はサーバー専用モジュール内でのみ使用。クライアントへ出さない。
//  - 先頭で assertOwner（salons.owner_id === auth.uid() または ADMIN_UUID）を再検証。
//  - 対象セラピストが本当にその salon のものかは core 側でも確認する。
//
// ★ 月間枠（第30便オーナー確定）:
//  - 写真あり・なしを合算した1つの枠。既定10回 / フクエスワーク契約店は20回。
//    （第35便で 20/40 から引き下げた。値は salons.ai_copy_quota_text が正で、ここは既定値のみ）
//  - 1回のボタン押下＝1消費（作り直しで複数回APIを叩いても消費は1）。
//  - 失敗した回は消費しない。毎月1日（JST）にリセット。
//  - 運営（ADMIN_UUID）の代行生成は枠を消費しない（新店舗の初期設定を代行するため）。

/** 今月の利用状況。unlimited=true は運営アカウント（枠を見ない）。 */
export type QuotaState = {
  used: number;
  limit: number;
  unlimited: boolean;
};

export type GenerateResult =
  | {
      ok: true;
      catchphrase: string;
      profileText: string;
      tries: number;
      short: boolean;
      usedImage: boolean;
      /**
       * ★ キャッチにサイズ表現（カップ・スリーサイズ等）が残ったので空にした（第122便）。
       * ★★ 黙って消さないための印。★ 画面ではまだ出していない（第123便の候補）。
       */
      catchDropped: boolean;
      /** ★ やり直しても紹介文に残った「使わないと決めた語」（第123便）。★ 空なら守られた。 */
      forbiddenLeft: string[];
      /** 消費後の残り回数（画面表示用） */
      quota: QuotaState;
    }
  | { ok: false; error: string; quota?: QuotaState };

// ログインユーザーがその salon の owner（または管理者UID）かをサーバー側で検証。
async function assertOwner(
  salonId: number,
): Promise<{ userId: string; isAdmin: boolean } | { error: string }> {
  if (!Number.isFinite(salonId)) return { error: '対象店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };

  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { error: '店舗が見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  const isAdmin = user.id === ADMIN_UUID;
  if (ownerId !== user.id && !isAdmin) {
    return { error: 'この店舗の操作権限がありません' };
  }
  return { userId: user.id, isAdmin };
}

/**
 * カレンダー月の初日（JST）を UTC の ISO 文字列で返す。
 * ★ Vercel のサーバーは UTC で動くので、素直に new Date() の月で切ると
 *   毎月1日の 00:00〜09:00(JST) が前月扱いになる。JST に寄せてから月初を作る。
 */
function monthStartIsoJst(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // JST での年月を取り、その月初 00:00(JST) = 前月末日 15:00(UTC)。
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1, -9, 0, 0)).toISOString();
}

/** 今月の利用件数と店舗の枠を引く。運営の代行分（by_admin）は数えない。 */
async function loadQuota(
  svc: ReturnType<typeof createServiceClient>,
  salonId: number,
  isAdmin: boolean,
): Promise<QuotaState> {
  const since = monthStartIsoJst();
  const [salonRes, usageRes] = await Promise.all([
    svc.from('salons').select('ai_copy_quota_text').eq('id', salonId).maybeSingle(),
    svc
      .from('ai_copy_usage')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('by_admin', false)
      .gte('created_at', since),
  ]);

  return {
    used: usageRes.count ?? 0,
    // 列が引けない場合でも機能を止めないよう既定値に倒す（マイグレーション前でも動く）。
    limit: Number(salonRes.data?.ai_copy_quota_text ?? 10),
    unlimited: isAdmin,
  };
}

/** 店舗オーナー向けに今月の残り回数だけを返す（/mypage の表示用）。 */
export async function getTherapistCopyQuota(
  salonId: number,
): Promise<{ ok: true; quota: QuotaState } | { ok: false; error: string }> {
  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };
  try {
    return { ok: true, quota: await loadQuota(createServiceClient(), salonId, auth.isAdmin) };
  } catch {
    return { ok: false, error: '利用状況を取得できませんでした' };
  }
}

/**
 * セラピストのキャッチ・紹介文の下書きを生成する。DBには保存しない。
 * @param salonId  対象店舗
 * @param therapistId  対象セラピスト（salonId 配下であることを検証する）
 * @param useImage  プロフィール写真をAIに渡すか（店舗が都度選べる。枠の消費量は変わらない）
 */
export async function generateTherapistCopy(
  salonId: number,
  therapistId: number,
  useImage: boolean,
): Promise<GenerateResult> {
  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();

  // ── 月間枠のチェック ──────────────────────────────────────
  // 運営（ADMIN_UUID）は代行のため枠を見ない。新店舗の初期設定を運営が引き受ける前提。
  const quota = await loadQuota(svc, salonId, auth.isAdmin);
  if (!quota.unlimited && quota.used >= quota.limit) {
    return {
      ok: false,
      error: `今月の作成回数（${quota.limit}回）を使い切りました。来月1日にリセットされます。`,
      quota,
    };
  }

  const gen = await generateCopyForTherapist(svc, salonId, therapistId, useImage);

  // 失敗した回は記録しない＝枠を消費しない（オーナー確定のルール）。
  if (!gen.ok) return { ok: false, error: gen.error, quota };

  // 記録する。kind は「実際に写真を渡せたか」＝原価の把握用で、枠の計算には使わない。
  const { error: logErr } = await svc.from('ai_copy_usage').insert({
    salon_id: salonId,
    therapist_id: Number(therapistId),
    kind: gen.usedImage ? 'image' : 'text',
    api_calls: gen.tries,
    by_admin: auth.isAdmin,
  });
  // 記録に失敗しても下書きは返す（店舗の作業を止めない）。枠の取りこぼしは許容する。
  if (logErr) console.error('[therapistCopy] usage log failed:', logErr.message);

  const after: QuotaState = {
    ...quota,
    used: quota.used + (quota.unlimited || logErr ? 0 : 1),
  };

  return {
    ok: true,
    catchphrase: gen.catchphrase,
    profileText: gen.profileText,
    tries: gen.tries,
    short: gen.short,
    usedImage: gen.usedImage,
    // ★ キャッチにサイズ表現が残ったので空にした（第122便）。★ 黙って消さないための印。
    //   ★★ 画面ではまだ出していない（第123便の候補）。★ 値だけは呼び出し側へ渡す。
    catchDropped: gen.catchDropped,
    forbiddenLeft: gen.forbiddenLeft,
    quota: after,
  };
}
