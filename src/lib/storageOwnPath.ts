// 保管庫（Supabase Storage）のファイルが「そのセラピスト自身のもの」かを見分ける（第1285便・2026-10-07）。★ 純粋関数。
//
// ★★★ なぜ要るか（調査メモ 2-6・10/7 に裏取り）
//   セラピストを削除すると、その方の写真の URL からファイルの場所を取り出して、運営の権限（service_role）で消していた。
//   URL が【どの店のファイルを指しているか】は確かめていなかった。写真の URL は店舗様が保存できる（https なら何でも通った）ので、
//     ① 自店のセラピストの写真として、他店の写真の URL を保存する
//     ② そのセラピストを削除する
//   で、他店のファイルを消せた。写メ日記の写真も同じ掃除を通る。
//
// ★★★ 名前の決まり（アップロードする場所すべてで確かめた・10/7）
//   therapist-photos … `${セラピスト番号}-…`        例: 41-1783435524379.jpg ／ 41-ekichika1-….jpg
//       actions/ownerTherapist.ts ／ conecf/girls/[id]/page.tsx ／ lib/media/ekichikaCastPhotoImport.ts
//   diary-images     … `${セラピスト番号}/…`        例: 41/1783435524379.jpg ／ 41/ekichika_123.jpg ／ 41/mail_…_0.jpg
//       actions/castDiary.ts ／ mypage/MyDiaryList.tsx ／ api/webhooks/resend-inbound ／ lib/media/relayFlow.ts
//   ★ 入れ替えのときの掃除（actions/therapistAdmin.ts の cleanupTherapistPhotos）は、もとからこの決まりで絞っていた。
//   ★ アップロードする場所を足すときは、この決まりを守ること（守らないファイルは、削除のときに残る）。

export const THERAPIST_PHOTO_BUCKET = 'therapist-photos';
export const DIARY_IMAGE_BUCKET = 'diary-images';

function idOf(therapistId: string | number): string | null {
  const s = String(therapistId ?? '').trim();
  return /^[0-9]{1,12}$/.test(s) ? s : null;
}

/** ★ 場所として変なもの（上へ戻る・空・先頭がスラッシュ・制御文字）は通さない */
function sanePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 300) return false;
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) return false;
  return !/[\u0000-\u001f]/.test(path);
}

/** therapist-photos の中の場所が、そのセラピスト自身の写真か。★ `41-` は `4` のセラピストのものではない（ハイフンまで見る） */
export function isOwnTherapistPhotoPath(path: unknown, therapistId: string | number): boolean {
  const id = idOf(therapistId);
  if (id === null || !sanePath(path)) return false;
  return !path.includes('/') && path.startsWith(id + '-') && path.length > id.length + 1;
}

/** diary-images の中の場所が、そのセラピスト自身の写メ日記の写真か（フォルダがセラピスト番号） */
export function isOwnDiaryImagePath(path: unknown, therapistId: string | number): boolean {
  const id = idOf(therapistId);
  if (id === null || !sanePath(path)) return false;
  return path.startsWith(id + '/') && path.length > id.length + 1;
}

/**
 * 公開 URL から、保管庫の中の場所を取り出す。★ フクエスの保管庫（storageBase）の、その箱（bucket）の URL だけ。
 * ★ ほかの URL（外部の画像・別の箱・別のサイト）は null。
 */
export function storagePathFromPublicUrl(url: unknown, bucket: string, storageBase: string): string | null {
  if (typeof url !== 'string') return null;
  const base = String(storageBase ?? '').replace(/\/+$/, '');
  if (base.length === 0) return null;
  const prefix = base + '/storage/v1/object/public/' + bucket + '/';
  if (!url.startsWith(prefix)) return null;
  try {
    const path = decodeURIComponent(url.slice(prefix.length).split('?')[0].split('#')[0]);
    return sanePath(path) ? path : null;
  } catch {
    return null;
  }
}

/** その URL が、フクエスの保管庫にある【そのセラピスト自身の】プロフィール写真か */
export function isOwnTherapistPhotoUrl(url: unknown, therapistId: string | number, storageBase: string): boolean {
  const path = storagePathFromPublicUrl(url, THERAPIST_PHOTO_BUCKET, storageBase);
  return path !== null && isOwnTherapistPhotoPath(path, therapistId);
}

/**
 * ★★★ コネックエフの写真の保存で、受け付けてよい URL か（第1285便）。
 *   ・いますでに入っている URL はそのまま通す（★ 昔の取り込みで外部の URL が入っている方の写真を、保存のたびに消さないため）
 *   ・新しく入れる URL は、フクエスの保管庫にある【そのセラピスト自身の】写真だけ
 */
export function splitSavableTherapistPhotos(
  urls: ReadonlyArray<string>,
  current: ReadonlyArray<string>,
  therapistId: string | number,
  storageBase: string,
): { ok: string[]; rejected: string[] } {
  const have = new Set(current);
  const ok: string[] = [];
  const rejected: string[] = [];
  for (const u of urls) {
    if (have.has(u) || isOwnTherapistPhotoUrl(u, therapistId, storageBase)) ok.push(u);
    else rejected.push(u);
  }
  return { ok, rejected };
}
