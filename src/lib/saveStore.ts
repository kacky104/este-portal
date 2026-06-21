// 保存ストア（ハイブリッド）。
// - 未ログイン: localStorage 読み書き（従来仕様）。
// - ログイン中: saved_items（DB）読み書き。初回に自分の保存をメモリキャッシュへ。
// 保存ボタン・/saved・ヘッダーバッジは savedSalons.ts / savedTherapists.ts 経由でこのストアを使い、
// バックエンド（local/DB）を意識しなくてよい。変更時は従来と同じイベントを必ず発火する。
import { createClient } from '@/app/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

export type SavedSalon = { id: number; name: string };
export type SavedTherapist = { id: number; name: string; salonId: number };

export const SAVED_SALONS_EVENT = 'saved-salons-changed';
export const SAVED_THERAPISTS_EVENT = 'saved-therapists-changed';

const SALON_KEY = 'saved_salons';
const THERAPIST_KEY = 'saved_therapists';

// ── module state ──
let session: Session | null = null;
let dbReady = false;
// DBモードのキャッシュ（保存順=古い順で保持。/saved 側が reverse して新しい順に表示）。
let dbSalonIds: number[] = [];
let dbTherapistIds: number[] = [];
let initialized = false;

const loggedIn = () => session != null;

function emit(event: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(event));
}
function emitAll() {
  emit(SAVED_SALONS_EVENT);
  emit(SAVED_THERAPISTS_EVENT);
}

// ── localStorage helpers（未ログイン用・従来仕様） ──
function readLocalSalons(): SavedSalon[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SALON_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is SavedSalon => x != null && typeof x.id === 'number' && typeof x.name === 'string');
  } catch {
    return [];
  }
}
function writeLocalSalons(list: SavedSalon[]) {
  try { window.localStorage.setItem(SALON_KEY, JSON.stringify(list)); } catch { /* 容量超過等は無視 */ }
}
function readLocalTherapists(): SavedTherapist[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(THERAPIST_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return p.filter(
      (x): x is SavedTherapist =>
        x != null && typeof x.id === 'number' && typeof x.name === 'string' && typeof x.salonId === 'number'
    );
  } catch {
    return [];
  }
}
function writeLocalTherapists(list: SavedTherapist[]) {
  try { window.localStorage.setItem(THERAPIST_KEY, JSON.stringify(list)); } catch { /* 無視 */ }
}

// ── 初期化（認証購読＋DBキャッシュ） ──
export function initSaveStore() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const supabase = createClient();
  supabase.auth.onAuthStateChange((event, sess) => {
    session = sess ?? null;
    if (event === 'SIGNED_IN' && sess) {
      // ログイン時：端末の保存を DB へマージ → クリア → DB を読み込む
      mergeLocalToDb(sess.user.id).then(loadDbCache);
    } else if (event === 'INITIAL_SESSION') {
      if (sess) loadDbCache();
      else emitAll(); // 未ログイン（localStorage）モード確定
    } else if (event === 'SIGNED_OUT') {
      dbReady = false;
      dbSalonIds = [];
      dbTherapistIds = [];
      emitAll(); // localStorage モードへ
    }
    // TOKEN_REFRESHED / USER_UPDATED 等は保存に影響なし
  });
}

async function loadDbCache() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('saved_items')
    .select('item_type, item_id, created_at')
    .order('created_at', { ascending: true });
  if (error) { dbReady = false; return; }
  const rows = (data ?? []) as { item_type: string; item_id: number | string }[];
  dbSalonIds = rows.filter(r => r.item_type === 'salon').map(r => Number(r.item_id));
  dbTherapistIds = rows.filter(r => r.item_type === 'therapist').map(r => Number(r.item_id));
  dbReady = true;
  emitAll();
}

async function mergeLocalToDb(userId: string) {
  const ls = readLocalSalons();
  const lt = readLocalTherapists();
  const rows = [
    ...ls.map(s => ({ user_id: userId, item_type: 'salon', item_id: s.id })),
    ...lt.map(t => ({ user_id: userId, item_type: 'therapist', item_id: t.id })),
  ];
  if (rows.length) {
    const supabase = createClient();
    await supabase
      .from('saved_items')
      .upsert(rows, { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true });
  }
  // マージ後は端末側をクリア（DBを単一ソースに。再マージや二重表示を防止）。
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SALON_KEY);
    window.localStorage.removeItem(THERAPIST_KEY);
  }
}

// ── DB 書き込み（楽観的更新。失敗時はキャッシュを戻して再通知） ──
async function writeDb(kind: 'salon' | 'therapist', id: number, add: boolean) {
  if (!session) return;
  const supabase = createClient();
  const event = kind === 'salon' ? SAVED_SALONS_EVENT : SAVED_THERAPISTS_EVENT;
  const revert = () => {
    if (kind === 'salon') {
      dbSalonIds = add ? dbSalonIds.filter(x => x !== id) : (dbSalonIds.includes(id) ? dbSalonIds : [...dbSalonIds, id]);
    } else {
      dbTherapistIds = add ? dbTherapistIds.filter(x => x !== id) : (dbTherapistIds.includes(id) ? dbTherapistIds : [...dbTherapistIds, id]);
    }
    emit(event);
  };
  if (add) {
    const { error } = await supabase
      .from('saved_items')
      .upsert(
        { user_id: session.user.id, item_type: kind, item_id: id },
        { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true }
      );
    if (error) revert();
  } else {
    const { error } = await supabase
      .from('saved_items')
      .delete()
      .eq('user_id', session.user.id)
      .eq('item_type', kind)
      .eq('item_id', id);
    if (error) revert();
  }
}

// ── 公開API：サロン ──
export function getSavedSalons(): SavedSalon[] {
  initSaveStore();
  if (loggedIn()) return dbReady ? dbSalonIds.map(id => ({ id, name: '' })) : [];
  return readLocalSalons();
}
export function isSalonSaved(id: number): boolean {
  initSaveStore();
  if (loggedIn()) return dbReady && dbSalonIds.includes(id);
  return readLocalSalons().some(s => s.id === id);
}
export function salonCount(): number {
  initSaveStore();
  if (loggedIn()) return dbReady ? dbSalonIds.length : 0;
  return readLocalSalons().length;
}
export function toggleSalon(item: SavedSalon): boolean {
  initSaveStore();
  if (loggedIn()) {
    const has = dbSalonIds.includes(item.id);
    dbSalonIds = has ? dbSalonIds.filter(x => x !== item.id) : [...dbSalonIds, item.id];
    emit(SAVED_SALONS_EVENT);
    void writeDb('salon', item.id, !has);
    return !has;
  }
  const list = readLocalSalons();
  const idx = list.findIndex(s => s.id === item.id);
  let now: boolean;
  if (idx >= 0) { list.splice(idx, 1); now = false; }
  else { list.push({ id: item.id, name: item.name }); now = true; }
  writeLocalSalons(list);
  emit(SAVED_SALONS_EVENT);
  return now;
}
export function removeSalon(id: number): void {
  initSaveStore();
  if (loggedIn()) {
    if (!dbSalonIds.includes(id)) return;
    dbSalonIds = dbSalonIds.filter(x => x !== id);
    emit(SAVED_SALONS_EVENT);
    void writeDb('salon', id, false);
    return;
  }
  writeLocalSalons(readLocalSalons().filter(s => s.id !== id));
  emit(SAVED_SALONS_EVENT);
}

// ── 公開API：セラピスト ──
export function getSavedTherapists(): SavedTherapist[] {
  initSaveStore();
  if (loggedIn()) return dbReady ? dbTherapistIds.map(id => ({ id, name: '', salonId: 0 })) : [];
  return readLocalTherapists();
}
export function isTherapistSaved(id: number): boolean {
  initSaveStore();
  if (loggedIn()) return dbReady && dbTherapistIds.includes(id);
  return readLocalTherapists().some(t => t.id === id);
}
export function therapistCount(): number {
  initSaveStore();
  if (loggedIn()) return dbReady ? dbTherapistIds.length : 0;
  return readLocalTherapists().length;
}
export function toggleTherapist(item: SavedTherapist): boolean {
  initSaveStore();
  if (loggedIn()) {
    const has = dbTherapistIds.includes(item.id);
    dbTherapistIds = has ? dbTherapistIds.filter(x => x !== item.id) : [...dbTherapistIds, item.id];
    emit(SAVED_THERAPISTS_EVENT);
    void writeDb('therapist', item.id, !has);
    return !has;
  }
  const list = readLocalTherapists();
  const idx = list.findIndex(t => t.id === item.id);
  let now: boolean;
  if (idx >= 0) { list.splice(idx, 1); now = false; }
  else { list.push({ id: item.id, name: item.name, salonId: item.salonId }); now = true; }
  writeLocalTherapists(list);
  emit(SAVED_THERAPISTS_EVENT);
  return now;
}
export function removeTherapist(id: number): void {
  initSaveStore();
  if (loggedIn()) {
    if (!dbTherapistIds.includes(id)) return;
    dbTherapistIds = dbTherapistIds.filter(x => x !== id);
    emit(SAVED_THERAPISTS_EVENT);
    void writeDb('therapist', id, false);
    return;
  }
  writeLocalTherapists(readLocalTherapists().filter(t => t.id !== id));
  emit(SAVED_THERAPISTS_EVENT);
}
