// 駅ちかのサイトスコア（ランキング加点）のチェック表（第2000便・2026-11-12・カッキーさん）。★ 純粋関数だけ。
//   項目と点数は、他社の公式HP管理画面の「スコア対応」（11/12 に読んだ）と、駅ちかの採点表（第1906便）による。
//   ★ ここで出すのは「フクエスサイトに設定があるか」だけ。点数は、駅ちかへサイトスコア申請をして確認されたあとに付く。

export type EkScoreState = 'done' | 'part' | 'none';
export type EkScoreItem = {
  key: string; label: string;
  /** 点数の書き方（「3点」「3〜5点」） */ points: string;
  state: EkScoreState;
  /** いまの状態の一言 */ note: string;
  /** どこで設定するか */ where: 'links' | 'widgets' | 'ekichika';
};

const hostOf = (u: string): string => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const pathOf = (u: string): string => { try { return new URL(u).pathname; } catch { return ''; } };
const isEkichika = (u: string) => /(^|\.)ranking-deli\.jp$/.test(hostOf(u));
const isCocoa = (u: string) => /(^|\.)cocoa-job\.jp$/.test(hostOf(u));
/** 駅ちかのお店ページ（…/style◯/<番号>/ など、最後が数字） */
const isEkichikaShop = (u: string) => isEkichika(u) && /\/\d{1,9}\/?$/.test(pathOf(u));
const isCocoaShop = (u: string) => isCocoa(u) && /\/shop\/\d+/.test(pathOf(u));

export function ekichikaScoreItems(input: {
  links: ReadonlyArray<{ link: string }>;
  widgets: ReadonlyArray<{ src: string }>;
  ek: { therapist: boolean; schedule: boolean; diary: boolean; review: boolean };
  /** 在籍の人数と、駅ちかと結びついている人数（分からなければ null） */
  cast: { total: number; linked: number } | null;
}): EkScoreItem[] {
  const urls = input.links.map((l) => String(l.link ?? '')).filter(Boolean);
  const has = (f: (u: string) => boolean) => urls.some(f);
  const by = (ok: boolean, yes: string, no: string): Pick<EkScoreItem, 'state' | 'note'> => ({ state: ok ? 'done' : 'none', note: ok ? yes : no });
  const banner = (ok: boolean) => by(ok, 'リンクに入っています', 'まだ入っていません');
  const wDiary = input.widgets.some((w) => isEkichika(w.src) && /diary/i.test(w.src));
  const wReview = input.widgets.some((w) => isEkichika(w.src) && /review|kuchikomi/i.test(w.src));
  const direct = input.ek.schedule || input.ek.diary || input.ek.review;
  const ratio = input.cast && input.cast.total > 0 ? input.cast.linked / input.cast.total : null;
  const castNote = !input.ek.therapist ? '「セラピスト」が フクエス のままです'
    : ratio === null ? '駅ちかにしています'
    : `駅ちかと結びついている方 ${input.cast!.linked} ／ ${input.cast!.total} 名（${ratio >= 0.9 ? '9割以上＝5点の対象' : ratio >= 0.5 ? '半分以上＝3点の対象' : '半分未満＝対象外'}）`;
  return [
    { key: 'ek_shop', label: '駅ちか店舗詳細ページへのバナー', points: '3点', where: 'links', ...banner(has(isEkichikaShop)) },
    { key: 'ek_area', label: '駅ちかエリアページへのバナー', points: '5点', where: 'links', ...banner(has((u) => isEkichika(u) && !isEkichikaShop(u))) },
    { key: 'cocoa_shop', label: 'ココア店舗詳細ページへのバナー', points: '2点', where: 'links', ...banner(has(isCocoaShop)) },
    { key: 'cocoa_area', label: 'ココアエリアページへのバナー', points: '3点', where: 'links', ...banner(has((u) => isCocoa(u) && !isCocoaShop(u))) },
    { key: 'direct', label: '駅ちか直リンク（出勤・写メ日記・口コミ）', points: '2点', where: 'ekichika', ...by(direct, '駅ちかにしている項目があります', '出勤・写メ日記・口コミがどれも フクエス のままです') },
    {
      key: 'widget', label: 'ウィジェット（写メ日記・口コミ）', points: '各1点', where: 'widgets',
      state: wDiary && wReview ? 'done' : wDiary || wReview ? 'part' : 'none',
      note: `写メ日記 ${wDiary ? '○' : '×'}・口コミ ${wReview ? '○' : '×'}`,
    },
    {
      key: 'cast', label: '在籍女性の直リンク', points: '3〜5点', where: 'ekichika',
      state: !input.ek.therapist ? 'none' : ratio !== null && ratio < 0.5 ? 'part' : 'done', note: castNote,
    },
    { key: 'eyoyaku', label: 'eネット予約ページリンク', points: '2点', where: 'links', ...by(has((u) => /(^|\.)e-yoyaku\.jp$/.test(hostOf(u))), 'リンクに入っています', 'まだ入っていません（eネット予約を使っているお店だけ）') },
  ];
}
