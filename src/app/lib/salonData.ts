export type Course = {
  name: string;
  duration: string;
  price: string;
};

export type SalonDetail = {
  id: number;
  name: string;
  rating: number;
  reviewCount: number;
  tags: string[];
  price: string;
  area: string;
  hours: string;
  description: string;
  appeal: string;
  courses: Course[];
  therapistCount: string;
  therapistTypes: string;
  therapistProfile: string;
  phone: string;
  address: string;
  access: string;
  closedDays: string;
  note?: string;
};

export const SALONS: SalonDetail[] = [
  {
    id: 1,
    name: "極楽の宙 博多店",
    rating: 4.9,
    reviewCount: 127,
    tags: ["完全個室", "厳選アロマ", "24時間営業"],
    price: "60分 ¥8,000〜",
    area: "博多・住吉",
    hours: "24時間営業",
    description:
      "洗練された空間で、熟練のセラピストによる極上の施術を体感。完全個室でプライバシーを守りながら、心身の疲れを癒します。厳選したアロマオイルと丁寧なカウンセリングで非日常の時間をご提供。",
    appeal:
      "博多駅から徒歩5分の好立地ながら、ドアを開けた瞬間から静謐な非日常空間が広がります。全室防音の完全個室で、外の喧騒を忘れてゆっくりとお寛ぎください。厳選した天然アロマオイルは施術前にカウンセリングでお選びいただけます。24時間営業のため、深夜・早朝のご利用も大歓迎です。",
    courses: [
      { name: "アロマリラクゼーション", duration: "60分", price: "¥8,000" },
      { name: "アロマリラクゼーション", duration: "90分", price: "¥11,000" },
      { name: "アロマリラクゼーション", duration: "120分", price: "¥14,000" },
      { name: "プレミアムボディケア", duration: "90分", price: "¥15,000" },
      { name: "プレミアムボディケア", duration: "120分", price: "¥19,000" },
      { name: "ホットストーン＋アロマ", duration: "90分", price: "¥16,000" },
      { name: "ホットストーン＋アロマ", duration: "120分", price: "¥20,000" },
    ],
    therapistCount: "在籍6名",
    therapistTypes: "20〜30代の女性セラピスト専属",
    therapistProfile:
      "全員が国際アロマセラピスト資格を保有。ボディワーク経験3年以上のベテランスタッフが揃っています。初回は必ずカウンセリングシートをもとに体調・お悩みをヒアリングし、お一人おひとりに合った施術をご提供します。",
    phone: "092-260-XXXX",
    address: "福岡市博多区博多駅前2-X-X 博多プレミアムビル3F",
    access: "JR・地下鉄「博多駅」博多口より徒歩5分",
    closedDays: "年中無休（24時間営業）",
    note: "完全予約制。当日予約はお電話にてご確認ください。",
  },
  {
    id: 2,
    name: "天空スパ 天神",
    rating: 4.8,
    reviewCount: 98,
    tags: ["完全個室", "女性セラピスト", "カップルOK"],
    price: "60分 ¥7,500〜",
    area: "中洲・天神・薬院",
    hours: "11:00〜翌4:00",
    description:
      "天神の中心部に位置するラグジュアリーサロン。女性セラピストのみが在籍し、丁寧なカウンセリングから始まる贅沢な時間をご提供。上質な空間でゆったりとお寛ぎください。",
    appeal:
      "天神コア近くのプレミアムビル上層階に位置し、窓からの夜景を楽しみながら施術を受けられる唯一無二のロケーションが自慢です。カップルルームは2名同時施術に対応しており、特別なひとときをご一緒にお過ごしいただけます。女性セラピストのみの在籍で安心してご利用いただけます。",
    courses: [
      { name: "スタンダードアロマ", duration: "60分", price: "¥7,500" },
      { name: "スタンダードアロマ", duration: "90分", price: "¥10,500" },
      { name: "スタンダードアロマ", duration: "120分", price: "¥13,500" },
      { name: "リンパドレナージュ", duration: "60分", price: "¥9,000" },
      { name: "リンパドレナージュ", duration: "90分", price: "¥12,500" },
      { name: "カップルコース", duration: "90分", price: "¥22,000（2名）" },
      { name: "カップルコース", duration: "120分", price: "¥28,000（2名）" },
    ],
    therapistCount: "在籍8名",
    therapistTypes: "20〜30代の女性セラピスト専属",
    therapistProfile:
      "丁寧な接客と確かな技術で高い支持を得ているスタッフが揃っています。アロマ・リンパ・ストーンなど複数の資格を持つセラピストも在籍。リピーターからの指名も多く、お気に入りのスタッフを繰り返しご利用いただけます。",
    phone: "092-714-XXXX",
    address: "福岡市中央区天神1-X-X 天神スカイビル7F",
    access: "地下鉄「天神駅」南改札より徒歩3分",
    closedDays: "不定休（営業カレンダーをご確認ください）",
  },
  {
    id: 7,
    name: "La Mer Blanc 出張専門",
    rating: 4.7,
    reviewCount: 78,
    tags: ["出張専門", "ホテル対応", "事前予約制"],
    price: "60分 ¥9,000〜",
    area: "出張",
    hours: "10:00〜翌2:00",
    description:
      "ご指定の場所へセラピストが伺う出張専門サロン。ホテルや自宅など、プライベートな空間でフランス式の本格アロマボディケアをご体験いただけます。完全事前予約制で安心です。",
    appeal:
      "「サロンへ行く時間がない」「自分の部屋でリラックスしたい」そんな方のための完全出張型サロンです。福岡市内のホテル・自宅・宿泊施設へセラピストが道具一式を持参してお伺いします。フランスで修業した代表セラピストが直接監修したオリジナルメニューで、本場パリスパの雰囲気をお届けします。",
    courses: [
      { name: "フレンチアロマ（出張）", duration: "60分", price: "¥9,000" },
      { name: "フレンチアロマ（出張）", duration: "90分", price: "¥13,000" },
      { name: "フレンチアロマ（出張）", duration: "120分", price: "¥17,000" },
      { name: "プレミアム全身ケア（出張）", duration: "120分", price: "¥20,000" },
      { name: "プレミアム全身ケア（出張）", duration: "150分", price: "¥24,000" },
    ],
    therapistCount: "在籍3名",
    therapistTypes: "フランス研修経験のある女性セラピスト",
    therapistProfile:
      "代表を含む全員がフランス・パリのスパスクールで研修経験を持つ実力派ぞろい。出張先での準備から後片付けまでスタッフが全て行うため、お客様はリラックスすることだけに集中していただけます。",
    phone: "090-XXXX-XXXX（予約専用）",
    address: "福岡市内全域・近郊に出張対応",
    access: "福岡市内のホテル・自宅・宿泊施設へ出張（交通費込み）",
    closedDays: "不定休（要事前予約）",
    note: "前日17時までのご予約をお願いしております。当日予約は応相談。",
  },
];
