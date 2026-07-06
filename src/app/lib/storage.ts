// Supabase Storage アップロード共通定数。
//
// STORAGE_CACHE_CONTROL:
//   アップロード時の cacheControl（秒）。デフォルトは 3600（1時間）で、
//   ブラウザ／CDN のキャッシュがほぼ効かず Cached Egress を浪費していた。
//   本プロジェクトのアップロードパスは全て `{id}/{timestamp}.{ext}` 等で
//   ユニーク化されており、同一URLの内容は不変（差し替え時は必ず別URLになる）。
//   よって 1年（31536000秒）まで長期化しても古い画像を引き続けるバグは起きない。
//   ※ 固定ファイル名に上書きする設計（同一URLで内容が変わる）へ流用しないこと。
export const STORAGE_CACHE_CONTROL = '31536000';
