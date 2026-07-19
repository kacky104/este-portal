'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { areaLabel } from '@/app/lib/areaLabel';
import { revalidateRanking } from '@/app/lib/revalidateTop';

// 週間ランキングの「下駄（ハンデ）」設定。店舗・セラピストごとに毎週のアクセス数へ加算する固定値を設定する。
// 保存は管理者判定付きRPC admin_set_ranking_bonus 経由（各テーブルの更新RLSに依存しない）。
// 公開ランキングには数値は出ないため、この値は「順位を底上げする内部の下駄」として機能する。
const supabase = createClient();

type SalonRow = { id: number; name: string; area: string | null; bonus: number };
type TherapistRow = { id: number; name: string; salonName: string; bonus: number };

export default function RankingHandicapManager({ onToast }: { onToast: (m: string) => void }) {
  const [tab, setTab] = useState<'salon' | 'therapist'>('salon');
  const [salons, setSalons] = useState<SalonRow[]>([]);
  const [therapists, setTherapists] = useState<TherapistRow[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({}); // `${type}:${id}` -> 入力中の文字列
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [{ data: sData, error: sErr }, { data: tData, error: tErr }] = await Promise.all([
      supabase.from('salons').select('id, name, area, ranking_bonus').eq('is_hidden', false).order('id', { ascending: true }),
      supabase
        .from('therapists')
        .select('id, name, ranking_bonus, is_active, salons(name)')
        .eq('is_active', true)
        .order('id', { ascending: true }),
    ]);
    if (sErr || tErr) {
      setError('データの取得に失敗しました');
      setLoaded(true);
      return;
    }
    const s: SalonRow[] = (sData ?? []).map((r) => ({
      id: Number(r.id),
      name: (r.name as string) ?? '',
      area: (r.area as string | null) ?? null,
      bonus: Number((r.ranking_bonus as number | null) ?? 0),
    }));
    const t: TherapistRow[] = (tData ?? []).map((r) => {
      // PostgREST の埋め込み salons は環境により配列/オブジェクトどちらにもなり得るため両対応。
      const row = r as unknown as {
        id: number;
        name: string | null;
        ranking_bonus: number | null;
        salons: { name: string | null } | { name: string | null }[] | null;
      };
      const salonRel = Array.isArray(row.salons) ? row.salons[0] : row.salons;
      return {
        id: Number(row.id),
        name: row.name ?? '',
        salonName: salonRel?.name ?? '',
        bonus: Number(row.ranking_bonus ?? 0),
      };
    });
    const init: Record<string, string> = {};
    s.forEach((r) => (init[`salon:${r.id}`] = String(r.bonus)));
    t.forEach((r) => (init[`therapist:${r.id}`] = String(r.bonus)));
    setSalons(s);
    setTherapists(t);
    setInputs(init);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (type: 'salon' | 'therapist', id: number) => {
    const key = `${type}:${id}`;
    const raw = inputs[key] ?? '0';
    const val = Math.max(0, Math.floor(Number(raw)) || 0);
    setSavingKey(key);
    const { error: rpcErr } = await supabase.rpc('admin_set_ranking_bonus', {
      p_item_type: type,
      p_item_id: id,
      p_bonus: val,
    });
    setSavingKey(null);
    if (rpcErr) {
      onToast(`保存に失敗しました: ${rpcErr.message}`);
      return;
    }
    if (type === 'salon') setSalons((prev) => prev.map((r) => (r.id === id ? { ...r, bonus: val } : r)));
    else setTherapists((prev) => prev.map((r) => (r.id === id ? { ...r, bonus: val } : r)));
    setInputs((prev) => ({ ...prev, [key]: String(val) }));
    revalidateRanking(); // /ranking を即時再検証（反映は次の再生成で）
    onToast(val > 0 ? `下駄（+${val.toLocaleString()}）を保存しました` : '下駄を解除しました');
  };

  const filteredSalons = useMemo(() => {
    const kw = q.trim();
    if (!kw) return salons;
    return salons.filter((r) => r.name.includes(kw));
  }, [salons, q]);

  const filteredTherapists = useMemo(() => {
    const kw = q.trim();
    if (!kw) return therapists;
    return therapists.filter((r) => r.name.includes(kw) || r.salonName.includes(kw));
  }, [therapists, q]);

  const activeCount = tab === 'salon'
    ? salons.filter((r) => r.bonus > 0).length
    : therapists.filter((r) => r.bonus > 0).length;

  const row = (type: 'salon' | 'therapist', id: number, title: string, sub: string) => {
    const key = `${type}:${id}`;
    const current = type === 'salon'
      ? salons.find((r) => r.id === id)?.bonus ?? 0
      : therapists.find((r) => r.id === id)?.bonus ?? 0;
    const inputVal = inputs[key] ?? '0';
    const dirty = String(current) !== String(Math.max(0, Math.floor(Number(inputVal)) || 0));
    return (
      <div key={key} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800 truncate">{title || '—'}</p>
          {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
        </div>
        {current > 0 && (
          <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
            +{current.toLocaleString()}
          </span>
        )}
        <input
          type="number"
          min={0}
          step={100}
          value={inputVal}
          onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
          className="flex-shrink-0 w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-right bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <button
          type="button"
          onClick={() => save(type, id)}
          disabled={savingKey === key || !dirty}
          className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingKey === key ? '保存中…' : '保存'}
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3">
      <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed">
        設定した値が<strong className="text-slate-700">毎週のアクセス数に自動で加算</strong>されます（週リセット後も維持）。
        0 で解除。<strong className="text-slate-700">数値は公開ランキングには表示されません</strong>（順位の底上げのみ）。
      </p>

      {/* 店舗 / セラピスト サブタブ */}
      <div className="flex gap-1.5">
        {([
          ['salon', '店舗', salons.length],
          ['therapist', 'セラピスト', therapists.length],
        ] as const).map(([key, label, count]) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setQ(''); }}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-none ${selected ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 検索（名前で絞り込み。セラピストは所属店名でも可） */}
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tab === 'salon' ? '店舗名で絞り込み' : 'セラピスト名・店名で絞り込み'}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
      />

      <p className="text-[11px] text-slate-400">
        下駄あり：{activeCount}件 / 全{tab === 'salon' ? salons.length : therapists.length}件
      </p>

      {error ? (
        <div className="py-8 text-center text-sm text-rose-400">{error}</div>
      ) : !loaded ? (
        <div className="py-8 text-center text-sm text-slate-400">読み込み中...</div>
      ) : (
        <div className="rounded-2xl border border-slate-100 overflow-hidden max-h-[420px] overflow-y-auto">
          {tab === 'salon' ? (
            filteredSalons.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">該当する店舗がありません</div>
            ) : (
              filteredSalons.map((r) => row('salon', r.id, r.name, r.area ? areaLabel(r.area) : ''))
            )
          ) : filteredTherapists.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">該当するセラピストがありません</div>
          ) : (
            filteredTherapists.map((r) => row('therapist', r.id, r.name, r.salonName))
          )}
        </div>
      )}
    </div>
  );
}
