// セラピストカード用の特徴バッジ表示（小型）。
// 色は therapistBadges.ts の getBadgeColors（カテゴリ別）を流用。詳細ページ/編集UIと同じ配色。
// 純粋な表示コンポーネント（フック・cookie 不使用）なのでサーバー/クライアント両方から使える。
//
// ★★ このカードでは「バッジは必ず2行以内」を守ること。守っているのは max-h-[33px] + overflow-hidden の2つ。
//   カードは高さ固定＋はみ出し切り落とし（GridCard の h-[168px] / h-28 + overflow-hidden）なので、
//   バッジが3行になると、その下にある口コミ件数・写メ日記バッジが押し出されて消える。
//
//   数字の根拠（Playwright で実測）:
//     バッジ1個の高さ = 文字9px + 上下padding 2px×2 + 枠線1px×2 = 15px、行と行のすき間 gap-0.5 = 2px。
//     → 2行 = 15+2+15 = 32px ／ 3行目の始まりは 34px。その間を取って 33px にしてある。
//        2行目が1px欠けることも、3行目が覗くこともない。
//   ★ 文字サイズ・上下padding・gap を変えたら、この 33px は必ず計算し直すこと。
//
//   入りきらないバッジは行ごと消える（バッジは全部同じ高さなので、半端に切れた見た目にはならない）。
//   どれが残るかは並び順で決まるので、sanitizeBadges がカテゴリ順（ランク・人気 → 経験 → 外見 →
//   雰囲気 → スキル）に揃えている。狭いカードでも「NO.1」など集客力の高いバッジが必ず先に残る。
//
//   左右の padding は px-1（4px）。px-1.5（6px）に戻すと、スマホ390pxの在籍一覧で6個が3行になる
//   （必要な幅 188px → 200px に対して、使えるのは194pxしかないため）。戻すなら必ず実測し直すこと。
import { getBadgeColors, MAX_BADGES } from '@/lib/therapistBadges';

export function FeatureBadges({
  badges,
  className = '',
}: {
  badges?: string[] | null;
  className?: string;
}) {
  const list = (badges ?? []).slice(0, MAX_BADGES);
  if (list.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-0.5 max-h-[33px] overflow-hidden ${className}`}>
      {list.map((label) => {
        const c = getBadgeColors(label);
        if (!c) return null; // 未知ラベルは出さない
        return (
          <span
            key={label}
            className="text-[9px] font-bold leading-none px-1 py-0.5 rounded-full border whitespace-nowrap"
            style={{ backgroundColor: c.fill, color: c.text, borderColor: c.border }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
