'use client';

import { useEffect, useState } from 'react';
import {
  getConecfGirlExtras, saveConecfGirlComments, saveConecfGirlQa, saveConecfGirlSiteFields, saveConecfGirlBadges, type ConecfGirlExtras,
} from '@/app/actions/conecfGirls';
import {
  len, overSites, COMMENT_SITE_LIMITS, CATCH_MAX, SHOP_COMMENT_MAX, SHOP_TITLE_MAX, GIRL_COMMENT_MAX,
  QA_MAX, QA_TEXT_MAX, EKICHIKA_CATCH_MAX, EKICHIKA_COMMENTS_MAX, ESUTAMA_DESCRIPTION_MAX,
  EKICHIKA_P_GENRES, EKICHIKA_P_GENRE_MAX, EKICHIKA_GENRE_GROUPS, EKICHIKA_GENRE_MAX, EKICHIKA_OPTIONS_MAX, EKICHIKA_ROOKIE, CONSTELLATIONS,
  ESUTAMA_TYPES, ESUTAMA_TYPE_MAX, ESUTAMA_BODY_STYLES, ESUTAMA_QUESTIONS, ESUTAMA_QUESTION_MAX, ESUTAMA_QUALIFIED_MAX, ESUTAMA_SNS,
  type QaItem,
} from '@/lib/conecfSiteFields';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import { BADGE_CATEGORY_ORDER, BADGE_CATEGORY_LABELS, BADGE_CATEGORY_COLORS, BADGES_BY_CATEGORY, MAX_BADGES } from '@/lib/therapistBadges';

// コネックエフ「女性プロフィール編集」のタブ：コメント／各サイト項目／Q&A（第414便・2026-09-17）。
// ★ ベンリーの同じタブに寄せた。★ 候補と上限は駅ちか・エステ魂の管理画面の実物（設計メモ §4・§5）。
// ★★ この便は【保存まで】。★ サイトへ送るのは次の便（★ 画面にもそう書く）。

// ★★ 第724便（2026-09-23・カッキーさん）: タブを【サイトごと】（フクエス／駅ちか／エステ魂）にした。
//   ★ それまでは コメント／各サイト項目／Q&A の3タブで、「どの項目がどのサイトに行くか」を店舗様が組み立てる必要があった。
//   ★ 今は「そのサイトに反映するもの」が1つのタブにまとまる。保存ボタンはタブごとに1つ（中で複数の action を呼ぶ）。
//     フクエス … キャッチコピー・お店コメント（★ 駅ちか・エステ魂にも同じ内容を送る）
//     駅ちか   … お店コメントのタイトル・女の子コメント（★ エステ魂にも）・駅ちか専用の項目・Q&A（10問）
//     エステ魂 … エステ魂専用の項目（特徴・エステ歴・資格・体型・質問・SNS）
export type ExtraTab = 'fukues' | 'ekichika' | 'esutama';

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const INPUT = 'w-full border border-slate-300 rounded bg-white px-2 py-1.5 text-[14px] focus:outline-none focus:border-[#1e88e5]';
// ★ 第447便: エステ魂へも送れるようになった（第430便）。★ 「準備中」のままだった案内を直す
// ★ 第724便: NOTE_SEND（駅ちか・エステ魂は更新する）はタブごとの文に置き換えたので外した
// ★ 第457便（カッキーさん）: すぐ前でサイト名を言っているところ用（★ 同じサイト名を2度言わない）
const NOTE_SEND_SHORT = '保存後、上の【更新する】を押してください。';

// ★ 第724便: タブの中の区画の見出し（★ render の中で作らない。作ると入力のたびに作り直されてフォーカスが飛ぶ）
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2">
      <p className="text-[13.5px] font-bold text-slate-700 pt-3 pb-1 border-b border-slate-200">{title}</p>
      {children}
    </div>
  );
}

// ★ 第726便: フクエスの特徴バッジ（マイページ /mypage/therapist/[id] と同じ見た目・同じ上限）
function BadgePicker({ badges, onChange }: { badges: string[]; onChange: (v: string[]) => void }) {
  const atMax = badges.length >= MAX_BADGES;
  const toggle = (label: string) => {
    if (badges.includes(label)) onChange(badges.filter((b) => b !== label));
    else if (!atMax) onChange([...badges, label]);
  };
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-pink-700 bg-pink-50 border border-pink-100 rounded px-3 py-2 leading-relaxed">
        設定すると特徴検索・特徴別ページに載り、お客様に見つけてもらいやすくなります。（最大{MAX_BADGES}つ・{badges.length} / {MAX_BADGES} 選択中）
      </p>
      {BADGE_CATEGORY_ORDER.map((cat) => {
        const colors = BADGE_CATEGORY_COLORS[cat];
        return (
          <div key={cat}>
            <p className="text-[12px] font-bold text-slate-400 mb-1.5 flex items-center gap-1.5">
              {BADGE_CATEGORY_LABELS[cat]}
              <span aria-hidden className="inline-block w-4 h-2.5 rounded-full border" style={{ backgroundColor: colors.fill, borderColor: colors.border }} />
            </p>
            <div className="flex flex-wrap gap-1.5">
              {BADGES_BY_CATEGORY[cat].map((label) => {
                const selected = badges.includes(label);
                const disabled = !selected && atMax;
                return (
                  <button key={label} type="button" disabled={disabled} onClick={() => toggle(label)} aria-pressed={selected}
                    className={`inline-flex items-center px-3 py-1.5 rounded-full text-[12px] font-bold border-2 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    style={selected
                      ? { backgroundColor: colors.fill, color: colors.text, borderColor: colors.text }
                      : { backgroundColor: '#F9FAFB', color: '#9CA3AF', borderColor: '#E5E7EB' }}>
                    {selected ? '✓ ' : ''}{label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ★ 第448便: warn を渡すと、注意として赤字で出す（★ 見落とすと更新できない決まりごと用）
function Row({ label, children, hint, warn }: { label: string; children: React.ReactNode; hint?: string; warn?: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-1.5 sm:gap-3 items-start py-3 border-b border-slate-100 last:border-b-0">
      <div className="pt-1.5 text-[14px]">{label}</div>
      <div className="space-y-1">
        {children}
        {warn && (
          <p className="text-[12.5px] font-bold text-rose-700 border border-rose-200 bg-rose-50 px-2 py-1.5 leading-relaxed">{warn}</p>
        )}
        {hint && <p className="text-[12px] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function Counter({ text, max, limits }: { text: string; max: number; limits?: ReadonlyArray<readonly [string, number]> }) {
  const over = limits ? overSites(text, limits) : [];
  return (
    <p className="text-[12px] text-slate-500 flex flex-wrap gap-x-3">
      <span className={len(text) > max ? 'text-rose-600' : ''}>{len(text)}/{max}</span>
      {over.length > 0 && <span className="text-amber-700">★ {over.join('・')}を超えています（そのサイトへは送れません）</span>}
    </p>
  );
}

function Chips({ all, picked, max, onChange }: { all: readonly string[]; picked: string[]; max: number; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((c) => {
        const on = picked.includes(c);
        const full = !on && picked.length >= max;
        return (
          <button
            key={c}
            type="button"
            disabled={full}
            onClick={() => onChange(on ? picked.filter((x) => x !== c) : [...picked, c])}
            className={`h-7 px-2.5 rounded-full border text-[12.5px] ${on ? 'bg-[#1e88e5] border-[#1e88e5] text-white' : 'bg-white border-slate-300 text-[#212121]'} disabled:opacity-35`}
          >
            {on && <span className="mr-0.5">{picked.indexOf(c) + 1}.</span>}{c}
          </button>
        );
      })}
    </div>
  );
}

type Ek = { pGenres: string[]; genres: string[]; options: string; rookie: string; constellation: string; catchcopy: string; comments: string };
type Es = { types: string[]; experience: string; qualified: string; bodyStyle: string; answers: Record<string, string>; sns: Record<string, string>; description: string };
const arr = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const rec = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : {});
const toEk = (f: Record<string, unknown>): Ek => ({ pGenres: arr(f.pGenres), genres: arr(f.genres), options: str(f.options), rookie: str(f.rookie), constellation: str(f.constellation), catchcopy: str(f.catchcopy), comments: str(f.comments) });
const toEs = (f: Record<string, unknown>): Es => ({ types: arr(f.types), experience: str(f.experience), qualified: str(f.qualified), bodyStyle: str(f.bodyStyle), answers: { ...rec(f.answers) }, sns: { ...rec(f.sns) }, description: str(f.description) });

export function GirlExtraTab({
  tab, id, salonId, enabled, onToast,
}: { tab: ExtraTab; id: number; salonId: number; enabled: boolean; onToast: (m: string) => void }) {
  const [x, setX] = useState<ConecfGirlExtras | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [slotIdx, setSlotIdx] = useState(0);

  useEffect(() => {
    let alive = true;
    getConecfGirlExtras({ id }).then((res) => {
      if (!alive) return;
      if (res.ok) setX(res.data); else setError(res.error);
    }).catch(() => { if (alive) setError('読み込めませんでした'); });
    return () => { alive = false; };
  }, [id]);

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>{error}</div>;
  if (!x) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;

  const saveBar = (onClick: () => void, label = '保存') => (
    <div className="sticky bottom-0 bg-white/90 backdrop-blur border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-3">
      {!enabled && <span className="text-[12px] text-amber-700">保存するには、ホームで「コネックエフに切り替える」を押してください</span>}
      {enabled && !x.ready && <span className="text-[12px] text-amber-700">準備中です（運営の設定が済むと保存できます）</span>}
      <button type="button" disabled={saving || !enabled || !x.ready} onClick={onClick}
        className="h-8 min-w-[80px] px-5 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
        {saving ? '保存中…' : label}
      </button>
    </div>
  );

  // ── 共通: コメント欄 ──
  const c = x.comments;
  const setC = (k: keyof ConecfGirlExtras['comments'], v: string) => setX((p) => (p ? { ...p, comments: { ...p.comments, [k]: v } } : p));

  // ── 共通: そのサイトの専用項目（ID・PASS の枠ごとに1つ） ──
  const provider = tab === 'ekichika' ? 'ekichika' : tab === 'esutama' ? 'esutama' : null;
  const mine = provider ? x.siteFields.filter((s) => s.provider === provider) : [];
  const cur = mine.length > 0 ? mine[Math.min(slotIdx, mine.length - 1)] : null;
  const setFields = (f: Record<string, unknown>) => setX((p) => (p && cur ? {
    ...p, siteFields: p.siteFields.map((s) => (s.provider === cur.provider && s.slot === cur.slot ? { ...s, fields: f } : s)),
  } : p));
  const slotPills = mine.length > 1 && (
    <div className="flex flex-wrap gap-1 px-4 pt-4">
      {mine.map((s, i) => (
        <button key={s.provider + '#' + s.slot} type="button" onClick={() => setSlotIdx(i)}
          className={`h-8 px-4 rounded-full text-[13px] ${i === slotIdx ? 'bg-[#1e88e5] text-white' : 'bg-black/[0.06] text-[#212121]'}`}>
          {s.label}
        </button>
      ))}
    </div>
  );
  const noFields = (name: string) => (
    <p className="text-[13px] text-slate-500 py-2">{name}のID・PASSが登録されていないため、{name}専用の項目はありません。</p>
  );

  // ── Q&A（駅ちか） ──
  const qa: QaItem[] = Array.from({ length: QA_MAX }, (_, i) => x.qa[i] ?? { q: '', a: '' });
  const setQa = (i: number, k: 'q' | 'a', v: string) => setX((p) => {
    if (!p) return p;
    const next = Array.from({ length: QA_MAX }, (_, j) => p.qa[j] ?? { q: '', a: '' });
    next[i] = { ...next[i], [k]: v };
    return { ...p, qa: next };
  });

  // ══ フクエス ══
  if (tab === 'fukues') {
    const onSave = async () => {
      setSaving(true);
      const res = await saveConecfGirlComments({ id, comments: c });
      const rb = await saveConecfGirlBadges({ id, badges: x.badges });
      setSaving(false);
      if (!res.ok) { onToast(res.error); return; }
      if (!rb.ok) { onToast(rb.error); return; }
      void revalidateSalon(salonId); void revalidateTherapist(id);
      onToast('保存しました（フクエスに反映しました。駅ちか・エステ魂へは上の【更新する】で送ります）');
    };
    return (
      <div className={CARD}>
        <Section title="フクエスに反映">
          <Row label="キャッチフレーズ">
            <input className={INPUT} value={c.catchphrase} onChange={(e) => setC('catchphrase', e.target.value)} />
            <Counter text={c.catchphrase} max={CATCH_MAX} limits={COMMENT_SITE_LIMITS.catch} />
          </Row>
          <Row label="詳細プロフィール">
            <textarea rows={8} className={INPUT} value={c.profileText} onChange={(e) => setC('profileText', e.target.value)} />
            <Counter text={c.profileText} max={SHOP_COMMENT_MAX} limits={COMMENT_SITE_LIMITS.shopComment} />
          </Row>
          {/* ★ 第726便（カッキーさん）: フクエスの特徴バッジもここで（★ 駅ちか・エステ魂には送らない。フクエスだけ） */}
          <Row label="特徴バッジ">
            <BadgePicker badges={x.badges} onChange={(v) => setX((p) => (p ? { ...p, badges: v } : p))} />
          </Row>
        </Section>
        {saveBar(() => void onSave())}
      </div>
    );
  }

  // ══ 駅ちか ══
  if (tab === 'ekichika') {
    const onSave = async () => {
      setSaving(true);
      const r1 = await saveConecfGirlComments({ id, comments: c });
      const r2 = await saveConecfGirlQa({ id, qa });
      const r3 = cur ? await saveConecfGirlSiteFields({ id, provider: cur.provider, slot: cur.slot, fields: cur.fields }) : null;
      setSaving(false);
      const bad = [r1, r2, r3].find((r) => r && !r.ok);
      if (bad && !bad.ok) { onToast(bad.error); return; }
      if (r3 && r3.ok) setFields(r3.data.fields);
      void revalidateSalon(salonId); void revalidateTherapist(id);
      onToast('駅ちかの項目を保存しました。' + NOTE_SEND_SHORT);
    };
    return (
      <div className={CARD}>
        {slotPills}
        <Section title="駅ちかに反映">
          {/* ★ 第729便（カッキーさん）: 駅ちか専用のキャッチコピー・お店からのメッセージ（★ 空ならフクエスの内容を送る）。
              ★ 置き場は駅ちかの項目（site_fields）。★ ID・PASS が無い店は欄が出ない（送る先が無い） */}
          {cur && (() => {
            const f = toEk(cur.fields);
            const up = (k: keyof Ek, v: unknown) => setFields({ ...f, [k]: v });
            return (
              <>
                <Row label="女の子キャッチコピー" hint={f.catchcopy ? undefined : `空のままなら、フクエスのキャッチフレーズ「${c.catchphrase || '（未入力）'}」を送ります。`}>
                  <input className={INPUT} value={f.catchcopy} onChange={(e) => up('catchcopy', e.target.value)} placeholder="駅ちか専用（空ならフクエスと同じ）" />
                  <Counter text={f.catchcopy} max={EKICHIKA_CATCH_MAX} />
                </Row>
                <Row label="お店からのメッセージ（タイトル）">
                  <input className={INPUT} value={c.shopTitle} onChange={(e) => setC('shopTitle', e.target.value)} />
                  <Counter text={c.shopTitle} max={SHOP_TITLE_MAX} />
                </Row>
                <Row label="お店からのメッセージ" hint={f.comments ? undefined : '空のままなら、フクエスの詳細プロフィールを送ります。'}>
                  <textarea rows={8} className={INPUT} value={f.comments} onChange={(e) => up('comments', e.target.value)} placeholder="駅ちか専用（空ならフクエスと同じ）" />
                  <Counter text={f.comments} max={EKICHIKA_COMMENTS_MAX} />
                </Row>
              </>
            );
          })()}
          <Row label="女の子からのメッセージ">
            <textarea rows={5} className={INPUT} value={c.girlComment} onChange={(e) => setC('girlComment', e.target.value)} />
            <Counter text={c.girlComment} max={GIRL_COMMENT_MAX} limits={COMMENT_SITE_LIMITS.girlComment} />
          </Row>
          {!cur ? noFields('駅ちか') : (() => {
            const f = toEk(cur.fields);
            const up = (k: keyof Ek, v: unknown) => setFields({ ...f, [k]: v });
            return (
              <>
                <Row label="優先タグ" hint={`女の子ランキングで上位に出やすくなるタグです。${EKICHIKA_P_GENRE_MAX}つまで。`}>
                  <Chips all={EKICHIKA_P_GENRES} picked={f.pGenres} max={EKICHIKA_P_GENRE_MAX} onChange={(v) => up('pGenres', v)} />
                </Row>
                <Row label={`ジャンル（${f.genres.length}/${EKICHIKA_GENRE_MAX}）`} hint="押した順に並びます。先頭の3つが大きなアイコンで出ます。">
                  <div className="space-y-2">
                    {EKICHIKA_GENRE_GROUPS.map(([g, xs]) => (
                      <div key={g}>
                        <p className="text-[12px] font-bold text-black/50 mb-1">{g}</p>
                        <Chips all={xs} picked={f.genres} max={EKICHIKA_GENRE_MAX} onChange={(v) => up('genres', v)} />
                      </div>
                    ))}
                  </div>
                </Row>
                <Row label="可能オプション" hint="（△は要確認）">
                  <textarea rows={3} className={INPUT} value={f.options} onChange={(e) => up('options', e.target.value)} />
                  <Counter text={f.options} max={EKICHIKA_OPTIONS_MAX} />
                </Row>
                <Row label="新人・体験入店">
                  <div className="flex flex-wrap gap-4">
                    {EKICHIKA_ROOKIE.map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 text-[14px]">
                        <input type="radio" checked={f.rookie === v} onChange={() => up('rookie', v)} className="accent-[#1e88e5]" />{l}
                      </label>
                    ))}
                  </div>
                </Row>
                <Row label="星座">
                  <select className={`${INPUT} max-w-[180px]`} value={f.constellation} onChange={(e) => up('constellation', e.target.value)}>
                    <option value="">表示しない</option>
                    {CONSTELLATIONS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                  </select>
                </Row>
              </>
            );
          })()}
        </Section>
        <Section title={`女の子へ質問（Q&A・10問・各${QA_TEXT_MAX}文字まで）`}>
          {qa.map((item, i) => (
            <Row key={i} label={`質問${i + 1}`}>
              <input className={INPUT} placeholder="質問" value={item.q} onChange={(e) => setQa(i, 'q', e.target.value)} />
              <input className={INPUT} placeholder="回答" value={item.a} onChange={(e) => setQa(i, 'a', e.target.value)} />
              {(len(item.q) > QA_TEXT_MAX || len(item.a) > QA_TEXT_MAX) && <p className="text-[12px] text-rose-600">{QA_TEXT_MAX}文字までです</p>}
            </Row>
          ))}
        </Section>
        {saveBar(() => void onSave())}
      </div>
    );
  }

  // ══ エステ魂 ══
  const onSaveEs = async () => {
    if (!cur) return;
    setSaving(true);
    const res = await saveConecfGirlSiteFields({ id, provider: cur.provider, slot: cur.slot, fields: cur.fields });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    setFields(res.data.fields);
    onToast('エステ魂の項目を保存しました。' + NOTE_SEND_SHORT);
  };
  return (
    <div className={CARD}>
      {slotPills}
      <Section title="エステ魂に反映するもの">
        <p className="text-[12px] text-slate-500 py-2">セラピストコメントは「駅ちか」タブの女の子からのメッセージが送られます。{NOTE_SEND_SHORT}</p>
        {!cur ? noFields('エステ魂') : (() => {
          const f = toEs(cur.fields);
          const up = (k: keyof Es, v: unknown) => setFields({ ...f, [k]: v });
          return (
            <>
              {/* ★ 第729便: エステ魂専用のショップコメント（★ 空ならフクエスの詳細プロフィールを送る） */}
              <Row label="ショップコメント" hint={f.description ? undefined : '空のままなら、フクエスの詳細プロフィールを送ります。'}>
                <textarea rows={6} className={INPUT} value={f.description} onChange={(e) => up('description', e.target.value)} placeholder="エステ魂専用（空ならフクエスと同じ）" />
                <Counter text={f.description} max={ESUTAMA_DESCRIPTION_MAX} />
              </Row>
              {/* ★★ 第448便（カッキーさん）: 特徴が0個だとエステ魂へ更新できない。★ 見落とさないよう赤字で出す */}
              <Row
                label={`セラピストの特徴（${f.types.length}/${ESUTAMA_TYPE_MAX}）`}
                warn={f.types.length === 0
                  ? '★ 必ず1つ以上えらんでください。0個のままだと、エステ魂へ更新できません（4つまで）'
                  : undefined}
                hint={f.types.length > 0 ? 'エステ魂では必須です。4つまで。' : undefined}
              >
                <Chips all={ESUTAMA_TYPES} picked={f.types} max={ESUTAMA_TYPE_MAX} onChange={(v) => up('types', v)} />
              </Row>
              <Row label="エステ歴">
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" maxLength={2} className={`${INPUT} max-w-[80px]`} value={f.experience} onChange={(e) => up('experience', e.target.value)} />
                  <span>年</span>
                </div>
              </Row>
              <Row label="資格">
                <textarea rows={2} className={INPUT} value={f.qualified} onChange={(e) => up('qualified', e.target.value)} />
                <Counter text={f.qualified} max={ESUTAMA_QUALIFIED_MAX} />
              </Row>
              <Row label="体型">
                <select className={`${INPUT} max-w-[200px]`} value={f.bodyStyle} onChange={(e) => up('bodyStyle', e.target.value)}>
                  <option value="">未選択</option>
                  {ESUTAMA_BODY_STYLES.map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                </select>
              </Row>
              {ESUTAMA_QUESTIONS.map(([k, l]) => (
                <Row key={k} label={l}>
                  <input className={INPUT} value={f.answers[k] ?? ''} onChange={(e) => up('answers', { ...f.answers, [k]: e.target.value })} />
                  <Counter text={f.answers[k] ?? ''} max={ESUTAMA_QUESTION_MAX} />
                </Row>
              ))}
              {ESUTAMA_SNS.map(([k, l]) => (
                <Row key={k} label={l}>
                  <input className={INPUT} placeholder="URL" value={f.sns[k] ?? ''} onChange={(e) => up('sns', { ...f.sns, [k]: e.target.value })} />
                </Row>
              ))}
            </>
          );
        })()}
      </Section>
      {cur && saveBar(() => void onSaveEs())}
    </div>
  );
}
