// ★★ 第983便（2026-09-29・カッキーさん）: サーバーが作った「一回限りのアップロード先」（Supabase Storage の署名付きURL）へ、
//   ブラウザから画像を直接送る共通の道具（第981便の写メ日記と同じやり方・実機で確認済み）。
// ★ supabase-js を通さない（アプリ内ブラウザで送る前に止まる事故の対策）。★ サーバーも通さない（Vercel の受け取り上限 約4.5MB）。
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

export async function putToSignedUrl(signedUrl: string, file: Blob): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const fd = new FormData();
    fd.append('cacheControl', STORAGE_CACHE_CONTROL);
    fd.append('', file);
    const r = await fetch(signedUrl, {
      method: 'PUT',
      body: fd,
      headers: { 'x-upsert': 'false', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    });
    if (!r.ok) {
      console.error('signed upload failed:', r.status, await r.text().catch(() => ''));
      return { ok: false, error: '画像を送れませんでした。もう一度選んでください。' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: '通信できませんでした。電波のよい場所で、もう一度選んでください。' };
  }
}
