// 公式ホームページのセクション部品（2026-08-11 マルチページ化 段階1）。
//
// トップ（抜粋）と下層ページ（全件）で同じ見た目を使い回すための部品。
// ここに置くのは「セクションの中身」だけで、<section> の class・id・order は
// 呼び出し側が持つ（交互の地色や並び替えの計算はトップ側にしかないため）。
//
// ★ ラッパーの要素を足さないこと。
//   .hp-th-body / .hp-sched-body は display:contents（styles.ts:39, 122）で
//   「カード直下に並ぶ」見え方を作っている。間に1枚挟むとA/B/Cの表示が崩れる。

import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import type { HpCourse, HpTherapist } from '@/app/hp/_lib/data';
import type { HpMenuItem } from '@/app/hp/_lib/sections';

// ── SPクイックナビ（2026-08-11）──────────────────────
// ヒーロー直下に出す4分割のアイコンメニュー（スマホ幅のみ・PCはヘッダーのナビが担当）。
// 項目とリンク先は hpTopbarNavItems() をそのまま使う＝PCナビと必ず一致する。

const QN_JP: Record<string, string> = {
  NEWS:      '新着情報',
  SYSTEM:    '料金システム',
  THERAPIST: 'セラピスト',
  ACCESS:    'アクセス',
};

/** ラベルに対応する線画アイコン（電話アイコンと同じ stroke=currentColor の作法）。 */
function QnIcon({ label }: { label: string }) {
  const common = { width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const, focusable: false as const };
  switch (label) {
    case 'NEWS': // 新聞
      return (
        <svg {...common}>
          <path d="M4 5h13v14H6a2 2 0 0 1-2-2V5z" />
          <path d="M17 8h2a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2" />
          <path d="M7 9h7M7 12.5h7M7 16h4" />
        </svg>
      );
    case 'SYSTEM': // ¥（料金）
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 7.5l3 4.2 3-4.2M12 11.7V17M9.6 13.4h4.8M9.6 15.6h4.8" />
        </svg>
      );
    case 'THERAPIST': // 人
      return (
        <svg {...common}>
          <circle cx="12" cy="8.2" r="3.4" />
          <path d="M5.5 19.5c.8-3.6 3.4-5.4 6.5-5.4s5.7 1.8 6.5 5.4" />
        </svg>
      );
    default: // ACCESS: 地図ピン
      return (
        <svg {...common}>
          <path d="M20 10.2c0 5.6-8 11.3-8 11.3s-8-5.7-8-11.3a8 8 0 0 1 16 0z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>
      );
  }
}

/**
 * ヒーロー直下のクイックナビ本体。items は hpTopbarNavItems() の戻り値を渡す。
 * 表示のON/OFFはCSS（COMMON の .hp-quicknav が 640px 以上で display:none）。
 */
export function QuickNav({ items }: { items: HpMenuItem[] }) {
  return (
    <nav className="hp-quicknav" style={{ order: 0 }} aria-label="クイックメニュー">
      {items.map((m) => (
        <a key={m.label} className="hp-qn-item" href={m.href} {...(m.current ? { 'aria-current': 'page' as const } : {})}>
          <QnIcon label={m.label} />
          <span className="hp-qn-en">{m.label}</span>
          <span className="hp-qn-jp">{QN_JP[m.label] ?? ''}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * 下層ページのパンくず（ホーム › 現在地）。
 * 見た目の主張は最小限。構造化データ（BreadcrumbList）は各ページ側が別に出す。
 */
export function Crumb({ homeHref, label }: { homeHref: string; label: string }) {
  return (
    <nav className="hp-crumb" aria-label="パンくずリスト">
      <a href={homeHref}>ホーム</a>
      <span className="hp-crumb-sep" aria-hidden="true">›</span>
      <span>{label}</span>
    </nav>
  );
}

/** セクションの飾り（EN ラベル・番号・罫線）。表示の有無は各ひな形のCSSが決める。 */
export function SecHead({ no, en, jp }: { no: string; en: string; jp: string }) {
  return (
    <>
      <div className="hp-idx">{no}</div>
      <div className="hp-en">{en}</div>
      <h2 className="hp-h2">{jp}</h2>
      <div className="hp-rule" />
    </>
  );
}

/**
 * セラピストのカード一覧。
 * limit を渡すと先頭 n 人だけ（トップの抜粋用）。並びは data.ts のソート済みのまま
 * （出勤中が先頭・同着は名前順）なので、抜粋しても「本日出勤の人が優先で出る」。
 *
 * カードのリンク先はフクエス本体のセラピストページ（公式HP側には個別ページを作らない）。
 * 本体と内容が重複せず、HPからフクエスへの実流入にもなる。
 */
export function TherapistCards({ therapists, limit }: { therapists: HpTherapist[]; limit?: number }) {
  const list = typeof limit === 'number' ? therapists.slice(0, limit) : therapists;
  return (
    <div className="hp-th-row">
      {list.map((t) => (
        <a key={t.id} className="hp-th-card" href={`${EMBED_SITE_URL}/therapist/${t.id}`} target="_blank" rel="noopener">
          <div className="hp-th-frame">
            {t.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.imageUrl} alt={t.name} />
            ) : (
              <div className="hp-th-noimg" />
            )}
          </div>
          {/* 名前より下は hp-th-body でひとまとめにする。COMMON で display:contents に
              しているので A/B/C の見え方は従来どおり（カード直下に並ぶ）。
              タイプSだけがこれを写真の上に重ねるレイヤーとして使う（出勤ブロックと同じ作法）。 */}
          <div className="hp-th-body">
            <div className="hp-th-name">{t.name}</div>
            {(t.age !== null || t.bodyType) && (
              <div className="hp-th-age">
                {t.age !== null && <span className="hp-th-age-num">{t.age}歳</span>}
                {/* 体型はタイプSでは非表示（写真に重ねる情報を名前と年齢に絞るため） */}
                {t.bodyType && <span className="hp-th-body-type">{t.bodyType}</span>}
              </div>
            )}
            {t.catchphrase && <div className="hp-th-catch">{t.catchphrase}</div>}
            {t.badges.length > 0 && (
              <div className="hp-th-badges">
                {t.badges.slice(0, 4).map((bd) => (
                  <span key={bd} className="hp-th-badge">{bd}</span>
                ))}
              </div>
            )}
            {t.onDuty && <span className="hp-th-onduty">本日出勤</span>}
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * コース料金のグループ一覧（groupCourses() の結果をそのまま渡す）。
 * limit を渡すと先頭 n グループだけ（トップの抜粋用）。
 */
export function CourseGroups({ grouped, limit }: { grouped: [string, HpCourse[]][]; limit?: number }) {
  const list = typeof limit === 'number' ? grouped.slice(0, limit) : grouped;
  return (
    <>
      {list.map(([name, items]) => (
        <div key={name} className="hp-course-group">
          <h3 className="hp-course-name">{name}</h3>
          {items.map((c, i) => (
            <div key={i} className="hp-course-row">
              <span className="hp-course-min">{c.duration}</span>
              <span className="hp-course-price">{c.price}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
