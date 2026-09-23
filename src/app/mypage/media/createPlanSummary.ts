// 「新しく登録」の前に見せる要約（第260便・第759便で TherapistBoard から切り出し）。
// ★ フクエスリンクの TherapistBoard と、コネックエフの SiteCompareBoard（セラピスト登録状況一覧）が使う。

/**
 * ★★ 試し打ちの `plan` から、店舗様に見せる行だけを取り出す（第260便）。
 *   ★ 出すのは 名前・年齢・サイズ・特徴・写真（設計メモ §4 B）。★ `plan` 全部は並べない（steps や guards は仕組みの言葉）。
 */
export function summarizeCreatePlan(plan: Record<string, unknown>): Array<{ k: string; v: string }> {
  const v = (plan.values && typeof plan.values === 'object' ? plan.values : {}) as Record<string, unknown>;
  const s = (x: unknown) => (x === null || x === undefined || x === '' ? '' : String(x));
  const rows: Array<{ k: string; v: string }> = [];
  rows.push({ k: '名前', v: s(v.name) || '（空）' });
  rows.push({ k: '年齢', v: s(v.age) ? `${s(v.age)}歳` : '送りません（未設定）' });
  // ★ 第264便: 欄の名前が媒体で違う（駅ちか bust/waist/hip/cup ／ エステ魂 sizeB/sizeW/sizeH/sizeCup）。★ どちらでも読む
  const bust = s(v.bust) || s(v.sizeB), waist = s(v.waist) || s(v.sizeW), hip = s(v.hip) || s(v.sizeH), cup = s(v.cup) || s(v.sizeCup);
  const size = [s(v.tall) ? `T${s(v.tall)}` : '', bust ? `B${bust}` : '', waist ? `W${waist}` : '', hip ? `H${hip}` : '']
    .filter(Boolean).join(' ');
  rows.push({ k: 'サイズ', v: (size || '送りません（未設定）') + (cup ? `（${cup}カップ）` : '') });
  const badges = Array.isArray(plan.badges) ? (plan.badges as unknown[]).map(s).filter(Boolean) : [];
  rows.push({ k: '特徴', v: badges.length > 0 ? badges.join('・') : 'なし' });
  // ★ 写真は「送るか」だけ。★ 在処（bucket/path）は店舗様に意味が無い
  const hasPhoto = !!(plan.photo && typeof plan.photo === 'object');
  const photoNote = '送りません' + (s(plan.photoSkipped) ? `（${s(plan.photoSkipped)}）` : '');
  // ★ 第431便: エステ魂は count／駅ちかは alsoSlots（2枚目以降）で枚数を出す
  const ph = (hasPhoto ? plan.photo : {}) as { count?: unknown; alsoSlots?: unknown };
  const photoCount = !hasPhoto ? 0 : Number(ph.count) > 0 ? Number(ph.count) : 1 + (Array.isArray(ph.alsoSlots) ? ph.alsoSlots.length : 0);
  rows.push({ k: '写真', v: hasPhoto ? `${photoCount}枚送ります（1枚目がトップ画像になります）` : photoNote });
  return rows;
}
