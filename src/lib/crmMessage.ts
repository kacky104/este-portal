// フクエスCRM「連絡文のひな形」（第1947便・2026-11-12）。
// ★ 本文の {差し込み} を予約の中身に置き換える【だけ】の部品（画面でもサーバーでも使う・DB は読まない）。
// ★ 決めたこと（カッキーさん 2026-11-11）
//   ・差し込みは日本語（CTIv2 の <%= $resv.date %> のような式は書かせない）
//   ・「差し込みが空の行は消す」（CTIv2 は if 文が要った）
//   ・{電話番号} は作らない（セラピストに電話番号を見せない方針）
//   ・作るのは今のデータで作れるものだけ（ホテル・ドライバーなどは要望があってから）

export type CrmMessageItem = { kind: string; name: string; minutes: number; price: number; pay: number };

/** 置き換えに使う予約の中身（画面がすでに持っている値だけで作れる） */
export type CrmMessageContext = {
  /** 営業日（YYYY-MM-DD） */
  date: string;
  slotStartISO: string;
  slotEndISO: string;
  therapistId: number | null;
  therapistName: string;
  courseName: string;
  courseMin: number;
  customerName: string;
  items: CrmMessageItem[];
  priceTotal: number | null;
  payTotal: number | null;
  pointsYen: number;
  paymentLabel: string;
  note: string;
  source: string;
  ordinal: number | null;
  visits: number | null;
  cancels: number | null;
  badCancels: number | null;
  cautionMemo: string;
  room: string;
  /** 出勤情報の自由項目（題名 → 選んだ値） */
  toggles: Record<string, string>;
  salonName: string;
  salonTel: string;
  /** 前回（同じお客様・同じ女子）。無ければ null */
  prev: { date: string; priceTotal: number | null; nomination: string } | null;
};

export type CrmMessageVar = { key: string; label: string; example: string };

/** 差し込みの一覧（設定画面の右に出す順） */
export const CRM_MESSAGE_VARS: Array<{ group: string; vars: CrmMessageVar[] }> = [
  {
    group: '日時',
    vars: [
      { key: '日付', label: '日付（例 11/12(木)）', example: '11/12(木)' },
      { key: '開始', label: '開始時刻', example: '23:40' },
      { key: '終了', label: '終了時刻', example: '0:50' },
      { key: '開始（25時表記）', label: '開始（深夜は24時・25時…）', example: '23:40' },
      { key: '終了（25時表記）', label: '終了（深夜は24時・25時…）', example: '24:50' },
      { key: '時間', label: 'コース＋延長の分数', example: '70分' },
    ],
  },
  {
    group: '女子・お客様',
    vars: [
      { key: '女子', label: '担当の女子', example: 'ゆあ' },
      { key: '女子（フリーなら「フリー」）', label: '担当未定なら「フリー」・決まっていれば「◯◯さん」', example: 'ゆあさん' },
      { key: 'お客様名', label: 'お客様の名前', example: '田中' },
      { key: '新規・リピート', label: 'このお店で1件目なら「新規」、それ以外は「リピート」', example: 'リピート' },
      { key: '何回目', label: '「新規」「2回目」「3回目」…', example: '3回目' },
      { key: '利用回数', label: '来店した回数', example: '2' },
      { key: 'キャンセル回数', label: 'キャンセルの回数（悪質を含む）', example: '0' },
      { key: '要注意メモ', label: '顧客台帳の要注意メモ', example: '' },
    ],
  },
  {
    group: '料金',
    vars: [
      { key: 'コース', label: 'コース名', example: '70分' },
      { key: 'コース料金', label: 'コースの料金', example: '10,000円' },
      { key: '指名', label: '指名（フリー・ネット指名・本指名など）', example: '本指名' },
      { key: '指名料金', label: '指名の料金', example: '2,000円' },
      { key: '延長', label: '延長（無ければ空）', example: '延長10分' },
      { key: '延長料金', label: '延長の料金（無ければ空）', example: '2,000円' },
      { key: 'オプション', label: 'オプション（いくつでも・無ければ空）', example: '花蜜コスプレセット' },
      { key: 'オプション料金', label: 'オプションの料金の合計（無ければ空）', example: '3,000円' },
      { key: '割引', label: '割引（無ければ空）', example: '1000円割引' },
      { key: '割引額', label: '割引の額の合計（無ければ空）', example: '1,000円' },
      { key: '料金合計', label: '料金の合計', example: '16,000円' },
      { key: 'お客様から受け取る額', label: '料金合計からフクエスポイントを引いた額', example: '16,000円' },
      { key: '女子報酬', label: '女子の報酬の合計', example: '8,000円' },
      { key: '支払い方法', label: '現金・カードなど', example: 'カード' },
    ],
  },
  {
    group: '前回（同じお客様・同じ女子）',
    vars: [
      { key: '前回の日付', label: '前回の日付（無ければ空）', example: '11/02' },
      { key: '前回の料金', label: '前回の料金合計（無ければ空）', example: '14,000円' },
      { key: '前回の指名', label: '前回の指名（無ければ空）', example: '本指名' },
    ],
  },
  {
    group: 'そのほか',
    vars: [
      { key: '予約メモ', label: '予約の備考', example: '' },
      { key: '部屋', label: 'その日の出勤情報の部屋', example: 'B506' },
      { key: '入り口', label: '「ネット予約」か「店で受付」', example: '店で受付' },
      { key: '店名', label: 'お店の名前', example: 'Aillis' },
      { key: '店の電話番号', label: 'お店の電話番号', example: '070-xxxx-xxxx' },
    ],
  },
];

const ALL_KEYS = new Set(CRM_MESSAGE_VARS.flatMap((g) => g.vars.map((v) => v.key)));
/** 出勤情報の自由項目は {出勤情報:題名} */
export const CRM_MESSAGE_TOGGLE_PREFIX = '出勤情報:';

function yen(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function jst(iso: string): Date {
  return new Date(new Date(iso).getTime() + 9 * 3600_000);
}
function dateLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${Number(m[2])}/${Number(m[3])}(${WD[d.getUTCDay()]})`;
}
function shortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[2]}/${m[3]}` : '';
}
function hm(iso: string): string {
  const d = jst(iso);
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
/** 営業日の 0:00 からの時刻（深夜は 24:40・25:00 のように） */
function hm24(iso: string, ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return hm(iso);
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 9 * 3600_000;
  const min = Math.round((new Date(iso).getTime() - base) / 60_000);
  if (!Number.isFinite(min) || min < 0) return hm(iso);
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

function ofKind(items: CrmMessageItem[], kind: string): CrmMessageItem[] {
  return items.filter((i) => i.kind === kind);
}
function names(items: CrmMessageItem[]): string {
  return items.map((i) => i.name).filter(Boolean).join('・');
}
function sumPrice(items: CrmMessageItem[]): number | null {
  return items.length ? items.reduce((s, i) => s + (Number(i.price) || 0), 0) : null;
}

/** 差し込み1つの値（知らない名前は null＝そのまま残す） */
export function crmMessageValue(key: string, c: CrmMessageContext): string | null {
  if (key.startsWith(CRM_MESSAGE_TOGGLE_PREFIX)) {
    const title = key.slice(CRM_MESSAGE_TOGGLE_PREFIX.length).trim();
    return c.toggles[title] ?? '';
  }
  if (!ALL_KEYS.has(key)) return null;
  const nom = ofKind(c.items, 'nomination');
  const ext = ofKind(c.items, 'extension');
  const opt = ofKind(c.items, 'option');
  const dis = ofKind(c.items, 'discount');
  const course = ofKind(c.items, 'course');
  switch (key) {
    case '日付': return dateLabel(c.date);
    case '開始': return hm(c.slotStartISO);
    case '終了': return hm(c.slotEndISO);
    case '開始（25時表記）': return hm24(c.slotStartISO, c.date);
    case '終了（25時表記）': return hm24(c.slotEndISO, c.date);
    case '時間': {
      const min = (c.courseMin || 0) + ext.reduce((s, i) => s + (Number(i.minutes) || 0), 0);
      return min > 0 ? `${min}分` : '';
    }
    case '女子': return c.therapistId == null ? '' : c.therapistName;
    case '女子（フリーなら「フリー」）': return c.therapistId == null ? 'フリー' : `${c.therapistName}さん`;
    case 'お客様名': return c.customerName;
    case '新規・リピート': return c.ordinal == null ? '' : c.ordinal === 1 ? '新規' : 'リピート';
    case '何回目': return c.ordinal == null ? '' : c.ordinal === 1 ? '新規' : `${c.ordinal}回目`;
    case '利用回数': return c.visits == null ? '' : String(c.visits);
    case 'キャンセル回数': return c.cancels == null ? '' : String(c.cancels);
    case '要注意メモ': return c.cautionMemo;
    case 'コース': return c.courseName || names(course);
    case 'コース料金': return yen(sumPrice(course));
    case '指名': return names(nom);
    case '指名料金': return yen(sumPrice(nom));
    case '延長': return names(ext);
    case '延長料金': return yen(sumPrice(ext));
    case 'オプション': return names(opt);
    case 'オプション料金': return yen(sumPrice(opt));
    case '割引': return names(dis);
    case '割引額': return yen(sumPrice(dis));
    case '料金合計': return yen(c.priceTotal);
    case 'お客様から受け取る額': return c.priceTotal == null ? '' : yen(Math.max(0, c.priceTotal - (c.pointsYen || 0)));
    case '女子報酬': return yen(c.payTotal);
    case '支払い方法': return c.paymentLabel;
    case '前回の日付': return c.prev ? shortDate(c.prev.date) : '';
    case '前回の料金': return c.prev ? yen(c.prev.priceTotal) : '';
    case '前回の指名': return c.prev ? c.prev.nomination : '';
    case '予約メモ': return c.note;
    case '部屋': return c.room;
    case '入り口': return c.source === 'web' ? 'ネット予約' : '店で受付';
    case '店名': return c.salonName;
    case '店の電話番号': return c.salonTel;
    default: return null;
  }
}

const VAR_RE = /\{([^{}\n]{1,40})\}/g;

/**
 * 本文を組み立てる。
 * hideEmpty: 差し込みが入っている行で、差し込みが全部空なら行ごと消す（差し込みの無い行は消さない）。
 */
export function renderCrmMessage(body: string, c: CrmMessageContext, hideEmpty: boolean): string {
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    let hadVar = false;
    let anyFilled = false;
    const text = line.replace(VAR_RE, (whole, raw: string) => {
      const v = crmMessageValue(raw.trim(), c);
      if (v == null) return whole; // 知らない名前はそのまま（打ち間違いに気づけるように）
      hadVar = true;
      if (v !== '') anyFilled = true;
      return v;
    });
    if (hideEmpty && hadVar && !anyFilled) continue;
    out.push(text);
  }
  return out.join('\n');
}

/** 本文の中の、知らない差し込み（打ち間違い）を返す */
export function unknownCrmMessageVars(body: string): string[] {
  const bad = new Set<string>();
  for (const m of String(body ?? '').matchAll(VAR_RE)) {
    const k = m[1].trim();
    if (k.startsWith(CRM_MESSAGE_TOGGLE_PREFIX)) continue;
    if (!ALL_KEYS.has(k)) bad.add(k);
  }
  return [...bad];
}

/** 見本（どのお店でも使える形の「予約連絡（女子）」）。★ お店ごとの記入欄などは各店で足してもらう */
export const CRM_MESSAGE_SAMPLE_NAME = '予約連絡';
export const CRM_MESSAGE_SAMPLE_BODY = `【予約詳細】

[日付]：{日付}
[名前]：{お客様名}（{新規・リピート}）
[コース]：{コース}
[開始]：{開始}
[終了]：{終了}
[指名]：{指名}
[延長]：{延長}
[オプション]：{オプション}
[割引]：{割引}
[支払い]：{支払い方法}

■料金合計
{料金合計}

■予約メモ：{予約メモ}
`;

/**
 * ★ アイリス様（Aillis・salon 3）の CTIv2「予約連絡」をそのまま移したもの（第1947便）。
 *   見本のボタンには出さない。アイリス様が移るとき、運営アカウントでアイリス様の CRM にだけ貼って保存する。
 */
export const CRM_MESSAGE_AILLIS_BODY = `【予約詳細】

[日付]：{日付}
[名前]：{お客様名}
[コース]：{コース}
[料金]：{コース料金}
[開始]：{開始}
[終了]：{終了}
[指名]：{指名}{前回の日付}
[備考欄]{新規・リピート}{延長}{延長料金}
{支払い方法}
[割引]：{割引}
[オプション]：{オプション}


■料金合計
{料金合計}

■予約メモ ： {予約メモ}


🌷【セラピスト記載事項】🌷
オプションが着いた場合は「あり」と記載ください

（衣装）：
（花蜜）：
（セット）：

【合計金額】
¥
【感想（特徴）】
`;
