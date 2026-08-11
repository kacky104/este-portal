import { HP_COLOR_VARIANTS, type HpTemplateKey } from '@/app/lib/hpSite';

// ひな形の簡易サムネイル（2026-08-09）。
//
// デザイン一覧（/hp/templates・公開）と運営用ギャラリー（/hp/[slug]/admin）の両方で使う。
// 公開ページの実CSS（styles.ts）は 640px 幅前提の文字列で縮小すると崩れるため、
// サムネはこの簡易表現で「雰囲気の当たり」だけを見せ、実際の見え方は
// 実物プレビュー（/hp/[slug]/preview/…）に任せる、という役割分担。
// 純粋な表示部品（state なし）なのでサーバー/クライアントどちらからでも使える。

export const HP_TEMPLATE_NOTES: Record<HpTemplateKey, string> = {
  s: '白地の最上位デザイン。全幅の写真と固定ナビで、王道の高級メンズエステを表現。シャンパンゴールドとワインレッドの2種類。',
  a: '黒基調・明朝体の高級路線。落ち着いた大人向けの店舗に。',
  b: '生成り地のやわらかい印象。清潔感・癒やし系の店舗に。',
  c: '白地に太字とアクセント。都会的でシャープな印象に。',
};

/** ひな形＋色キー → サムネ用のアクセント2色（deep が無いひな形は accent で代用）。 */
export function hpVariantColors(template: HpTemplateKey, colorKey: string): { accent: string; deep: string } {
  const list = HP_COLOR_VARIANTS[template];
  const v = list.find((x) => x.key === colorKey) ?? list[0];
  const accent = v.css['--hp-accent'] ?? '#c4a469';
  const deep = v.css['--hp-accent-deep'] ?? v.css['--hp-accent-soft'] ?? accent;
  return { accent, deep };
}

export function DesignThumb({
  template,
  accent,
  deep,
  colorKey,
}: {
  template: HpTemplateKey;
  accent: string;
  deep: string;
  /** タイプSのように「地色まで変わる配色」を持つひな形で、どの配色かを伝える（2026-08-11） */
  colorKey?: string;
}) {
  if (template === 's') {
    // GRACE: 白地・全幅ヒーローに左寄せ文字＋上部ナビ。
    // 配色によって地色まで変わるので、公開ページ（styles.ts の .hp-s / .hp-s-wine）と同じ組で塗る。
    const wine = colorKey === 'wine';
    const c = wine
      ? { bg: '#fdf8f7', ink: '#4a3238', head: '#5d464a', line: '#efdcdd', soft: '#e3cccd', hero: '#fdf1f1', band: '#eeddde' }
      : { bg: '#fdfbf7', ink: '#4a4238', head: '#5d5346', line: '#eee4d4', soft: '#d8cbb4', hero: '#fbf6ec', band: '#eadfcd' };
    return (
      <div style={{ background: c.bg, color: c.ink, height: 168, fontFamily: 'serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderBottom: wine ? `2px solid ${accent}` : `1px solid ${c.line}` }}>
          <span style={{ fontSize: 7, letterSpacing: '.2em', color: accent }}>SALON</span>
          <span style={{ display: 'flex', gap: 5 }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ width: 12, height: 2, background: c.soft }} />
            ))}
          </span>
          <span style={{ fontSize: 6, letterSpacing: '.15em', color: '#fff', background: accent, padding: '2px 7px' }}>RESERVE</span>
        </div>
        <div style={{ position: 'relative', height: 66, background: `linear-gradient(105deg, ${c.hero} 42%, ${deep}55 75%, ${accent}44)` }}>
          <div style={{ position: 'absolute', left: 10, top: 14 }}>
            <div style={{ width: 58, height: 4, background: c.head, marginBottom: 5 }} />
            <div style={{ width: 40, height: 4, background: c.head, marginBottom: 8 }} />
            <div style={{ width: 30, height: 2, background: accent }} />
          </div>
          <div style={{ position: 'absolute', right: 12, top: 8, bottom: 8, width: 34, background: `linear-gradient(160deg, ${deep}88, ${accent}66)`, borderRadius: 3 }} />
        </div>
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontSize: 7, letterSpacing: '.3em', color: accent }}>CONCEPT</div>
          <div style={{ width: 22, height: 1, background: accent, margin: '5px 0 7px' }} />
          {/* ワインはコース名がワインの帯になるので、サムネでも1本を帯で表す */}
          <div style={{ height: 3, background: wine ? accent : c.band, marginBottom: 4 }} />
          <div style={{ height: 3, background: c.band, width: '62%' }} />
          <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ flex: 1, height: 22, background: '#fff', border: `1px solid ${c.band}` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (template === 'a') {
    // LUXE: 黒基調・明朝・細い金の罫線
    return (
      <div style={{ background: '#17161a', color: '#e8e3d9', padding: '14px 12px', height: 168, fontFamily: 'serif' }}>
        <div style={{ height: 44, background: `linear-gradient(135deg, ${accent}66, #0b0a0c 70%)`, border: `1px solid ${accent}55` }} />
        <div style={{ width: 22, height: 1, background: accent, margin: '14px auto 8px' }} />
        <div style={{ fontSize: 8, letterSpacing: '.28em', textAlign: 'center', color: accent }}>CONCEPT</div>
        <div style={{ margin: '10px auto 0', width: '78%' }}>
          <div style={{ height: 3, background: '#3a3730', marginBottom: 5 }} />
          <div style={{ height: 3, background: '#3a3730', marginBottom: 5 }} />
          <div style={{ height: 3, background: '#3a3730', width: '60%' }} />
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: 30, background: '#232026', border: `1px solid ${accent}33` }} />
          ))}
        </div>
      </div>
    );
  }
  if (template === 'b') {
    // CLEAN: 生成り地・丸ゴシック・面で見せる
    return (
      <div style={{ background: '#faf7f2', color: '#4a463f', padding: '14px 12px', height: 168 }}>
        <div style={{ height: 44, background: `linear-gradient(135deg, ${accent}, ${deep})`, borderRadius: 10 }} />
        <div style={{ fontSize: 9, fontWeight: 800, marginTop: 12, color: deep }}>コンセプト</div>
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 3, background: '#ded8cf', borderRadius: 2, marginBottom: 5 }} />
          <div style={{ height: 3, background: '#ded8cf', borderRadius: 2, marginBottom: 5 }} />
          <div style={{ height: 3, background: '#ded8cf', borderRadius: 2, width: '55%' }} />
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: 30, background: '#fff', borderRadius: 8, border: '1px solid #e7e1d8' }} />
          ))}
        </div>
      </div>
    );
  }
  // MODE: 白地・太ゴシック・連番と極太アクセント
  return (
    <div style={{ background: '#fff', color: '#111114', padding: '14px 12px', height: 168 }}>
      <div style={{ height: 44, background: '#111114' }} />
      {/* アクセント帯はヒーローの【下】に置く。中に重ねると mono（黒）が黒地に沈んで見えないため */}
      <div style={{ width: 52, height: 5, background: accent }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: accent }}>01</span>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.1em' }}>CONCEPT</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 3, background: '#e3e3e6', marginBottom: 5 }} />
        <div style={{ height: 3, background: '#e3e3e6', marginBottom: 5 }} />
        <div style={{ height: 3, background: '#e3e3e6', width: '50%' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 30, background: '#f1f1f3' }} />
        ))}
      </div>
    </div>
  );
}
