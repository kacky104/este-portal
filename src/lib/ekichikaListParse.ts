// 駅ちか（ranking-deli.jp）の「女の子一覧」(girlslist) ページHTMLを構造化データに変換するパーサー（第36便）。
//
// ★ このファイルは純粋関数のみ。Supabase も React も import しない（禁則180）。
// ★ 個人ページ用の ekichikaParse.ts とは別物。役割が違う:
//     ekichikaParse     … 1人ぶん・今日以降7日ぶんの出勤（週間予定）
//     ekichikaListParse … 全員ぶん・当日ぶんだけの出勤（このファイル）
//   週間予定は一覧ページに載っていないので、当日=毎時この一覧／週間=1日1回 個人ページ、
//   という二段構えで使う（第36便）。
//
// ★★★ なぜこれを作るか（第36便で実測）
//   VPSの import.sh は毎周 girlslist を取っているが、castId を正規表現で抜いたあと
//   HTMLを捨てている。その捨てているHTMLに、本日の出勤時刻・名前・年齢・サイズが
//   全部載っていた。つまり手元にある情報を捨てて、同じものを個人ページ330件で
//   取り直していた。1周 343リクエスト → 13リクエストになる。
//
// 取得元の構造（2026-08-26 実測・アイリス34821 と enju42129 の girlslist）:
//   <li class="girl-box">
//     <figure><div class="figure-inner clearfix">
//       <a href=".../{externalId}/{castId}/">                        ← castId
//         <div class="figure-front">
//           <div class="image p-imgWrap">
//             <img ...>
//             <p class="attend-ico today"><span>本日出勤</span></p>   ← 出勤の子だけ
//           </div>
//           <div class="detail">
//             <p class="bust-size">D</p>
//             <p class="data-name ellipsis">りおん<span class="age">(23)</span></p>
//             <p class="data-size ellipsis">T:150 B:84 W:55 H:88</p>
//             <ul class="girl-genre"><li class="girl-tag genre38">素人</li>…</ul>
//           </div>
//           <div class="waiting sokuiku">
//             <ul><li class="waiting-icon today"><img></li>
//                 <li class="waiting-cont today">10:00<span>▶︎</span>17:00</li></ul>
//           </div>
//
// ★★★ 状態のクラスは1種類ではない（第36便 13:05 に実地で判明）:
//     waiting-cont today    … 本日出勤
//     waiting-cont sokuiku  … ★ 即ヒメ（いますぐ案内可能）。出勤中の子に付く
//     waiting-cont shihatu  … 始発姫。★ 出勤開始から1時間以内に即ヒメ設定した子（＝即ヒメの一種）
//     waiting-cont normal   … 本日出勤なし
//
// ★★★ 名前の訂正（第39便・店舗の管理画面 /admin/sokuiku/ で確認）
//   クラス名は sokuiku だが、駅ちかの【表示名は「即ヒメ」】。第36便で「即イキ」と書いたのは誤り。
//   店舗と話すときは「即ヒメ」。コードのクラス名だけ昔のまま残っている。
//
// ★★★ 外側の div の sokuiku に意味は無い（第39便・実物37人で確認）
//     <div class="waiting sokuiku  normal ">   ← ★ 休みの子にも sokuiku が付いている
//     <div class="waiting sokuiku ">           ← 即ヒメ中の子
//   外側は「この店は即ヒメ対応」程度の印。★ 個人の状態は内側の waiting-cont でしか判らない。
//   外側を見て判定する作りにすると、全員が即ヒメになる。
//
// ★★ 即ヒメの印は2か所に出る（どちらも実測）:
//     <li class="waiting-cont sokuiku">17:00<span> ▶︎ </span>00:00</li>
//     <p class="attend-ico sokuiku"><span>即ヒメ!!</span></p>
//   ここでは waiting-cont 側だけを見る（出勤判定と同じ場所＝ずれようがない）。
//
// ★★★ 即ヒメの残り時間は公開ページに出ていない（第39便で確認）
//   管理画面には「[〜20:37迄] 残り4分2秒」が出るが、公開ページの waiting-cont には
//   出勤時刻しか無い。→ 取り込み側は【次の周で消す】設計にすること。期限を推測しない。
//
// ★★ 即ヒメは店舗あたり5枠まで（管理画面の仕様）。
//   フクエスの「今すぐ」に人数制限は無いので、★ 取り込むと常に5人以下になる。
//   「駅ちかの人数とフクエスの今すぐの人数が合わない」は異常ではない。
//
// ★★ normal に「要TEL」が入ることがある（第39便・37人中22人）
//   第36便は「normal の中身は空」と書いたが、実物では "要TEL" が入っていた。
//   ★ 意味は【休み】（2026-08-27・福岡メンズエステ業界の慣行としてオーナー様に確認済み）。
//   → normal＝休み のままで正しい。第36便の判断は変えない。
//   ★ 中身のテキストで判定しないこと。normal かどうかだけを見る。
//     「要TEL」以外の文言が入っても、normal である限り休みとして扱えばよい。
//   today 以外の3つは【営業時間中にしか現れない】。朝08:35の調査ではアイリス100名・enju63名とも
//   today と normal しか出ておらず、「2種類しか無い」と誤って結論した。13:05 の周で enju の5名が
//   判定不能になって発覚した（sokuiku 4・shihatu 1）。時刻はどれも正しく入っていた。
//
// ★★★ だから判定はクラス名の列挙ではなく「時刻が読めるか」で行う:
//     normal            → 休み（時刻の有無を問わない）
//     normal 以外＋時刻2つ → 出勤（クラス名を問わない。新しい待機状態が増えても追随する）
//     それ以外           → 'unknown'＝触らない（レイアウト変更に対する安全弁は殺していない）
//
//   日跨ぎは「翌」を付けず素の時刻で出る（例 16:00 ▶︎ 05:00）。個人ページ側の
//   normTime が「翌」を外した形と揃うので、両者の値は一致する。
//
// ★★ 同じ p.data-size でも中身が違う（パーサを共用してはいけない）:
//     個人ページ … "25歳/ 164cm B:87 W:54 H:85"（身長が cm、年齢が同じ行）
//     一覧       … "T:150 B:84 W:55 H:88"（身長が T:、年齢は span.age に別出し）
//
// ★★★ 安全弁（禁則207と同じ思想）
//   waiting-cont そのものが見付からない＝駅ちかのレイアウト変更。この場合は 'unknown' を返し、
//   呼び出し側は出勤を「触らない」こと。全員を一斉に休みへ倒す事故を防ぐ。
//   'off' を返すのは normal が実際に出ていたときだけにしてある。

import { normalizeName } from './ekichikaParse';

export type EkichikaListCast = {
  castId: string;
  name: string | null;
  nameKey: string;                          // normalizeName 済み（照合用）
  age: string | null;                       // '23'
  height: string | null;                    // '150'
  bust: string | null;
  cup: string | null;                       // 'D'（'-' などは null）
  waist: string | null;
  hip: string | null;
  bodyType: string | null;                  // 'T150 B84(D) W55 H88'（fukues 表記）
  status: 'work' | 'off' | 'unknown';       // 当日の出勤
  /** ★ 即ヒメ（いますぐ案内可能）。始発姫も即ヒメの一種なので true にする。 */
  sokuhime: boolean;
  start: string | null;                     // 'HH:MM'（status==='work' のみ）
  end: string | null;                       // 'HH:MM'（日跨ぎも素の時刻。表示側が「翌」を付ける）
};

function pick(re: RegExp, s: string): string | null {
  const m = s.match(re);
  return m && m[1] != null ? m[1].trim() : null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ');
}

/** '翌2:00' / '14:00' → '02:00' / '14:00'（ekichikaParse と同じ規則）。 */
function normTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.replace(/翌/g, '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * girlslist 1ページぶんのHTMLを解析する。
 * @param html       一覧ページの生HTML
 * @param externalId 駅ちかの店舗番号（'34821' など）。castId の抽出に使う。
 * @returns          載っていた全員。castId の重複は先勝ちで1件にまとめる。
 *
 * ★ ページ送りは呼び出し側の責任。2ページ目以降も同じ関数に通して連結すること
 *   （アイリスは100人/ページで2ページある。1ページ目だけ読むと101番目以降が
 *   「在籍から消えた子」に化けて掃除で倒れる）。
 */
export function parseEkichikaList(html: string, externalId: string): EkichikaListCast[] {
  const out: EkichikaListCast[] = [];
  const seen = new Set<string>();

  // カードの切り出し。li.girl-box の中に ul.md-state > li が入れ子になっているので
  // </li> では閉じられない。開始タグで割り、各断片を最初の </figure> までに切り詰める。
  const parts = html.split(/<li[^>]*class="[^"]*\bgirl-box\b[^"]*"[^>]*>/);
  const castRe = new RegExp(`/${externalId}/(\\d+)/`);

  for (const raw of parts.slice(1)) {          // parts[0] は最初のカードより前＝捨てる
    const cut = raw.indexOf('</figure>');
    const seg = cut >= 0 ? raw.slice(0, cut) : raw;

    const castId = pick(castRe, seg);
    if (!castId || seen.has(castId)) continue;  // 同じ子が2回出ても1件にする
    seen.add(castId);

    // 名前と年齢。<p class="data-name ellipsis">りおん<span class="age">(23)</span></p>
    const nameBlock = pick(/<p[^>]*class="[^"]*\bdata-name\b[^"]*"[^>]*>([\s\S]*?)<\/p>/, seg) ?? '';
    const age = pick(/<span[^>]*class="[^"]*\bage\b[^"]*"[^>]*>\s*\((\d+)\)/, nameBlock);
    const nameRaw = stripTags(nameBlock).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    const name = nameRaw || null;

    // カップ。未設定の店は '-' や空になるので、その場合は無しにする
    // （そのまま使うと body_type が "B86(-)" のように壊れる。ekichikaParse と同じ判定）。
    const cupRaw = pick(/<p[^>]*class="[^"]*\bbust-size\b[^"]*"[^>]*>([^<]*)<\/p>/, seg);
    const cup = cupRaw && /^[A-Z]+$/.test(cupRaw) ? cupRaw : null;

    const size = pick(/<p[^>]*class="[^"]*\bdata-size\b[^"]*"[^>]*>([^<]*)<\/p>/, seg) ?? '';
    const height = pick(/T\s*[:：]?\s*(\d+)/, size);
    const bust = pick(/B\s*[:：]?\s*(\d+)/, size);
    const waist = pick(/W\s*[:：]?\s*(\d+)/, size);
    const hip = pick(/H\s*[:：]?\s*(\d+)/, size);

    // body_type を fukues 表記で組み立てる（ekichikaParse と同じ形式）。欠けた要素は出さない。
    const bt: string[] = [];
    if (height) bt.push(`T${height}`);
    if (bust) bt.push(cup ? `B${bust}(${cup})` : `B${bust}`);
    if (waist) bt.push(`W${waist}`);
    if (hip) bt.push(`H${hip}`);
    const bodyType = bt.length ? bt.join(' ') : null;

    // 当日の出勤。クラスの並び順に依存しないよう、class 属性を取り出してから判定する。
    // ★ 出勤の判定は「クラス名が today か」ではなく「時刻が2つ読めるか」で行う（第36便）。
    //   駅ちかは営業時間中に today → sokuiku（即イキ）/ shihatu（始発）へ表示を変える。
    //   クラス名を列挙する作りだと、新しい待機状態が増えるたびに取りこぼす。
    const contCls = pick(/<li[^>]*class="([^"]*\bwaiting-cont\b[^"]*)"[^>]*>/, seg);
    // ★ 即ヒメ。始発姫（shihatu）は「出勤開始から1時間以内に即ヒメ設定した子」なので同じ扱い。
    //   ★ 外側の <div class="waiting sokuiku"> ではなく、必ず waiting-cont 側を見ること
    //     （外側は休みの子にも付いている・第39便で実測）。
    const sokuhime = Boolean(contCls && /\b(sokuiku|shihatu)\b/.test(contCls));
    let status: 'work' | 'off' | 'unknown' = 'unknown';
    let start: string | null = null;
    let end: string | null = null;
    if (contCls) {
      const isNormal = /\bnormal\b/.test(contCls);
      const inner = pick(/<li[^>]*class="[^"]*\bwaiting-cont\b[^"]*"[^>]*>([\s\S]*?)<\/li>/, seg) ?? '';
      const times = stripTags(inner).match(/\d{1,2}:\d{2}/g) ?? [];
      if (isNormal) {
        status = 'off';                       // normal は必ず「本日出勤なし」
      } else if (times.length >= 2) {
        status = 'work';
        start = normTime(times[0] ?? null);
        end = normTime(times[1] ?? null);
      }
      // normal でもなく時刻も読めない＝想定外。'unknown' のまま＝触らない（安全弁）。
    }
    // waiting-cont 自体が無い＝レイアウト変更。'unknown' のまま＝触らない（安全弁）。

    out.push({
      castId, name, nameKey: normalizeName(name), age,
      height, bust, cup, waist, hip, bodyType,
      status, sokuhime, start, end,
    });
  }

  return out;
}

/**
 * 「次のページがあるか」の判定。girlslist は100人/ページで、次ページへのリンクが
 * page2/ page3/ … の形で出る。2ページ目には次へのリンクが無いので終端が判る。
 * ★ 呼び出し側で使わなくてもよい（VPS側は「新しいcastIdが出なくなるまで」で
 *   終端を判定している）。両方持っておくと、片方が壊れてももう片方で気づける。
 */
export function hasNextListPage(html: string, externalId: string, currentPage: number): boolean {
  const next = new RegExp(`/${externalId}/girlslist/page${currentPage + 1}/`);
  return next.test(html);
}
