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

/**
 * ヒーロー直下のクイックナビ本体。items は hpTopbarNavItems() の戻り値を渡す。
 * 表示のON/OFFはCSS（COMMON の .hp-quicknav が 640px 以上で display:none）。
 */
export function QuickNav({ items, order = 0 }: { items: HpMenuItem[]; order?: number }) {
  return (
    // order の既定は 0（ヒーローの直下）。ヒーローより前に出したいひな形だけ負の値を渡す。
    <nav className="hp-quicknav" style={{ order }} aria-label="クイックメニュー">
      {items.map((m) => (
        <a key={m.label} className="hp-qn-item" href={m.href} {...(m.current ? { 'aria-current': 'page' as const } : {})}>
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
export function TherapistCards({
  therapists,
  limit,
  grid = false,
}: {
  therapists: HpTherapist[];
  limit?: number;
  /**
   * 一覧ページ（/therapist）向けの並べ方にするか（2026-08-12）。
   * true だと .hp-th-grid が付き、ひな形側で「トップは横スクロール・一覧ページはグリッド」を
   * 出し分けられる。トップは抜粋なので横に流す方が収まりが良い、という使い分け。
   */
  grid?: boolean;
}) {
  const list = typeof limit === 'number' ? therapists.slice(0, limit) : therapists;
  return (
    <div className={`hp-th-row${grid ? ' hp-th-grid' : ''}`}>
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
              /* ★ ここだけ意図的に MAX_BADGES を使わず 4個で固定している。
                 公式HPのセラピストカードは幅118〜176pxしかなく、ポータルのカード（192〜260px）より
                 かなり狭い。ここを MAX_BADGES に追随させると、タイプA/B/C すべてでバッジが3〜4行に
                 なりカードが縦に伸びて店舗様のレイアウトが崩れる。増やす前に必ず実測すること。 */
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
 * 出勤の行（トップの「本日の出勤」と /schedule の各日タブが共用する。2026-08-18 第23便）。
 *
 * ★★ この DOM は 4ひな形すべての CSS の前提になっている。要素を足す・入れ替えると
 *   タイプS/A/B の写真グリッド（.hp-sched-thumb::after のグラデーション、
 *   .hp-sched-body の絶対配置）が丸ごと崩れる。styles.ts の「本日の出勤」の節を必ず読むこと。
 * ★ ラッパーを足さないこと。COMMON が .hp-sched-body を display:contents にして
 *   A/B/C の「名前 …… 時間」1行レイアウトを作っている。
 *
 * time は「その日の出勤時間」（例「12:00〜22:00」）。トップは本日ぶん（todayTime）、
 * /schedule は week[i] を渡す＝同じ部品で日替わりの表になる。
 */
export function ScheduleRows({ rows }: { rows: { t: HpTherapist; time: string }[] }) {
  return (
    <div className="hp-sched-list">
      {rows.map(({ t, time }) => (
        <a
          key={t.id}
          className="hp-sched-row"
          href={`${EMBED_SITE_URL}/therapist/${t.id}`}
          target="_blank"
          rel="noopener"
        >
          <span className="hp-sched-thumb">
            {t.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.imageUrl} alt={t.name} />
            ) : (
              <span className="hp-sched-noimg" />
            )}
          </span>
          <span className="hp-sched-body">
            <span className="hp-sched-name">{t.name}</span>
            {/* 出勤欄は名前と年齢だけ（体型・特徴はセラピスト一覧に任せて情報量を絞る） */}
            <span className="hp-sched-meta">{t.age !== null ? `${t.age}歳` : ''}</span>
            <span className="hp-sched-time">{time}</span>
          </span>
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
