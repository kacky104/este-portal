// コネックエフ「駅ちかから最初に1回だけ取り込む」の決めごと（第406便・2026-09-17）。★ 純粋関数だけ。通信もDBも触らない。
//
// ★★ しくみ（VPS の import.sh は1行も変えない）
//   1) 店舗様がボタンを押す → salons.conecf_import_requested_at
//   2) 次の /api/import/targets（15分ごと）がその店の駅ちか枠を listMode=false で返す → started_at
//      ★ VPS は listMode=false の店は個人ページ（週間予定）を取って /api/import/ingest へ送る
//   3) その次の targets で done_at（★ import.sh は flock があるので、次の targets が呼ばれた時点で前の周は必ず終わっている）
// ★★ カッキーさんの決定（2026-09-17）
//   ・1店舗1回だけ（★ 戻すのは運営が SQL で3列を null に）
//   ・駅ちかにいてフクエスにいない子は【公開・NEWなし】で作る（★ すでに在籍している子なので）
//   ・コネックエフで入力済みの日は残す（★ imported_at が null の行＝人が入れた行は触らない）
//   ・年齢・サイズは空のときだけ埋める

export type FirstImportPhase = 'none' | 'waiting' | 'running' | 'done';

export function firstImportPhase(s: {
  requestedAt: string | null; startedAt: string | null; doneAt: string | null;
}): FirstImportPhase {
  if (!s.requestedAt) return 'none';
  if (s.doneAt) return 'done';
  if (s.startedAt) return 'running';
  return 'waiting';
}

/** targets が今回その店に何をするか。hand=渡して started を入れる／finish=done を入れる／skip=何もしない */
export function targetsStep(phase: FirstImportPhase): 'hand' | 'finish' | 'skip' {
  if (phase === 'waiting') return 'hand';
  if (phase === 'running') return 'finish';
  return 'skip';
}

/** ingest がこの店を「最初の1回」として受けてよいか（★ 切り替え済み・渡し済み・未完了の間だけ） */
export function acceptsFirstImport(s: {
  enabledAt: string | null; requestedAt: string | null; startedAt: string | null; doneAt: string | null; provider: string;
}): boolean {
  return !!s.enabledAt && s.provider === 'ekichika' && firstImportPhase(s) === 'running';
}

export type ScheduleIn = { date: string; status: 'work' | 'off'; start: string | null; end: string | null };
export type ExistingRow = { date: string; importedAt: string | null };

/**
 * ★ 取り込む出勤の行を選ぶ。
 *   ・コネックエフ／マイページで人が入れた行（imported_at が null）がある日は【残す】
 *   ・行が無い日、前に取り込んだ行（imported_at あり）の日は駅ちかで埋める
 *   ・★ 非公開の子には出勤を入れない（コネックエフの週間スケジュールと同じ決めごと）→ 休みの行だけ入れる
 */
export function pickFirstImportSchedule(input: {
  incoming: ScheduleIn[]; existing: ExistingRow[]; therapistActive: boolean;
}): { rows: Array<{ date: string; isActive: boolean; start: string | null; end: string | null }>; kept: number } {
  const human = new Set(input.existing.filter((e) => e.importedAt == null).map((e) => e.date));
  const rows: Array<{ date: string; isActive: boolean; start: string | null; end: string | null }> = [];
  let kept = 0;
  for (const d of input.incoming) {
    if (human.has(d.date)) { kept++; continue; }
    const work = d.status === 'work' && input.therapistActive;
    rows.push({ date: d.date, isActive: work, start: work ? d.start : null, end: work ? d.end : null });
  }
  return { rows, kept };
}

/** ★ 年齢・サイズは空のときだけ埋める */
export function fillEmptyProfile(
  current: { age: string | null; bodyType: string | null },
  cast: { age: string | null; bodyType: string | null },
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (!current.age && cast.age) patch.age = cast.age;
  if (!current.bodyType && cast.bodyType) patch.body_type = cast.bodyType;
  return patch;
}
