import { HP_COLOR_VARIANTS, type HpTemplateKey } from '@/app/lib/hpSite';

// ひな形の簡易サムネイル（2026-08-09）。
//
// デザイン一覧（/hp/templates・公開）と運営用ギャラリー（/hp/[slug]/admin）の両方で使う。
// 公開ページの実CSS（styles.ts）は 640px 幅前提の文字列で縮小すると崩れるため、
// サムネはこの簡易表現で「雰囲気の当たり」だけを見せ、実際の見え方は
// 実物プレビュー（/hp/[slug]/preview/…）に任せる、という役割分担。
// 純粋な表示部品（state なし）なのでサーバー/クライアントどちらからでも使える。

export const HP_TEMPLATE_NOTES: Record<HpTemplateKey, string> = {
  s: '白地の最上位デザイン。全幅の写真と固定ナビで、王道の高級メンズエステを表現。シャンパンゴールド・ワインレッド・ロイヤルブルー・エメラルドグリーンの4種類。',
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

// タイプSのサムネ写真が用意されている配色（public/hp-s/thumb-{色}.webp）。
// ここに無いキーはシャンパンゴールドの写真にフォールバックする。
const HP_S_THUMB_COLORS = ['gold', 'wine', 'blue', 'emerald'];

/**
 * 実物のキービジュアル写真のURL（用意が無い組み合わせは null）。
 * 大きさは呼び出し側で決めたいので（デザイン一覧は大きく・ギャラリーは168px固定）、
 * URLだけを返して <img> は呼び出し側で置く、という分け方にしている。
 */
export function hpDesignThumbSrc(template: HpTemplateKey, colorKey?: string): string | null {
  if (template !== 's') return null;
  const key = HP_S_THUMB_COLORS.includes(colorKey ?? '') ? colorKey : 'gold';
  return `/hp-s/thumb-${key}.webp`;
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
    // GRACE だけは簡易サムネではなく【実物のキービジュアル写真】を出す（2026-08-12 要望）。
    // 配色ごとに撮り分けた写真があるので、抽象的なモックより「どんなサイトか」が一目で伝わる。
    // 画像は public/hp-s/thumb-{色}.webp（16:9・640×360）。配色を足すときはここに1行足す。
    // object-right: モデルが写真の右側にいるため、カードが細くなっても必ず入るように右端で固定する。
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={hpDesignThumbSrc(template, colorKey) ?? ''}
        alt=""
        loading="lazy"
        className="block w-full object-cover object-right"
        style={{ height: 168 }}
      />
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
