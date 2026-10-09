// フクエスCRM「グループ・提携店で共有するNG・要注意リスト」を、画面で申し込む・承認するときの決まり（第1328便・2026-10-09）。
//   ★ 純粋関数と文だけ。通信もDBも触らない。表は 追加SQL_第1328便。口は src/app/actions/crmGroupJoin.ts。
//
// ★★★ カッキーさんの決定（10/9）
//   ・申込書は、CRM の画面で署名する（代表者の名前の入力 ＋ 同意のチェック。手書きサイン・パスワードの入れ直しは無し）。
//   ・最初の店どうしが署名して始まり、あとから店を足していく。
//   ・店を足すときは、今いる全部の店が「この店が加わることを認める」を押す。
//     ★ 全員が認めてから、足す店に申込書を出す（先に出すと、断られた場合でも、足す店に「だれとだれがグループか」が知られてしまう）。
//     ★ 1店でも認めなければ、足さない。足す店には何も知らせない（運営の画面にだけ出る）。
// ★★★ どの店とどの店がグループ・提携かは秘密の情報。★ このファイルにも番人にも、実在の店の名前を書かない。
//   ★ 申込み・承認の画面には、相手の店の名前が出る（お互いを相手として認めるための署名なので、ここだけは隠せない）。
//     署名・承認が済んだあとは、店の名前を出さない。
// ⚠ 申込書の文は、弁護士の確認前の下書き。文を直したら、版（CRM_GROUP_APPLY_VERSION）を変えること
//   （署名済みの分は、署名した時の文の写しが DB に残る。まだそろっていない申込みは、署名のし直しになる）。

/** 申込書の版。★ 文を1字でも直したら変える */
export const CRM_GROUP_APPLY_VERSION = '2026-10-09-下書き';

export const CRM_GROUP_SIGNER_NAME_MAX = 40;

/**
 * 申込書の本文（参加店舗の一覧は、画面と記録で別に持つ）。★ 署名した時、この文の写しを残す
 * ★ 個人のお店（法人でない）も入れる。責任を負うのは、法人のお店なら法人・個人のお店なら事業主ご本人なので、頭で「店舗」の意味を決めている。
 *   運営が入れる「運営者」の欄（法人名。個人なら屋号かお名前）は、相手の店にも見える。署名のときに入れる名前は、運営の記録にだけ残る。
 */
export const CRM_GROUP_APPLY_BODY = `フクエスCRM「グループ・提携店で共有するNG・要注意リスト」利用申込書

この画面に表示されている全部の店舗（以下「参加店舗」といいます）は、うさぎのひとやすみ合同会社（以下「運営」といいます）に対し、フクエスCRMの「グループ・提携店で共有するNG・要注意リスト」（以下「共有機能」といいます）を、参加店舗の間で使うことを申し込み、次の内容に同意します。

この申込書で「店舗」とは、その店舗を運営する法人、または個人事業主をいいます。

第1　関係についての表明
1. 参加店舗は、同じ法人、グループ会社、または実際にお客様を案内し合っている業務提携先です。
2. 参加店舗は、全部の店舗がお互いを、共有の相手として知り、認めています。
3. 関係がなくなったとき（提携の解消、経営者の交代、閉店など）は、すぐに運営に知らせます。
4. 事実と違う申込みによって、お客様・ほかの店舗・運営に損害が出たときは、その申込みをした店舗が責任を負います。

第2　利用の目的と、してはいけないこと
共有機能は、セラピストの安全を守ることと、店舗への危害や損害を防ぐことのためだけに使います。参加店舗は、次のことをしません。
・共有された内容を、参加店舗の外に伝えること（口頭、画面の写真、書き写しをふくみます）
・共有された内容を、営業・宣伝・勧誘など、ほかの目的に使うこと
・共有された内容を、SNSや口コミサイトなどに書きこむこと
・個人的な感情や、店どうしの競争のために、事実でないことを書くこと
参加店舗は、受付などで画面を見るスタッフにも、この決まりを守らせます。

第3　共有できる内容
1. 共有できるのは、次の行為があったお客様だけです。暴力・脅し／盗み／つきまとい・待ち伏せ／盗撮・録音／サービス外の行為の強要／泥酔・薬物／そのほか、セラピストや店舗への危害にあたるもの。
2. 無断キャンセルと、料金のもめごとは、共有できません。
3. 書くのは、実際に起きた事実だけにします。うわさや推測は書きません。はっきり確かめられていないときは、「疑い」として共有します。
4. セラピストの名前、お客様の住所・勤務先・家族のことなど、関係のないことは書きません。
5. まちがいが分かったとき、事情が変わったときは、すぐに直すか、取り下げます。
6. 共有される項目は、お客様の名前、電話番号、起きた日、分類、何をされたか、確かめ方、確かさ（確認済み・疑い）です。
7. 書いた内容についての責任は、その共有を出した店舗が負います。

第4　お客様への知らせ
参加店舗は、共有機能を使い始める前に、次のことを自分の責任で行い、使っているあいだ続けます。
1. お客様にサインしてもらう同意書に、グループ店舗・提携店舗と共有することがある、という文を入れます（フクエスCRMの同意書を使っている店舗は、設定の画面のボタンで文を足せます）。
2. フクエスの公式ホームページを使っていない店舗は、(1) どんな場合に共有するか、(2) 何を共有するか、(3) だれと共有するか、(4) 何のために共有するか、(5) お客様からの問い合わせ先、の5つを、自分のサイトの利用規約（または個人情報の取り扱い）に載せ、店頭にも掲示します。文の例は、運営が案内します。
3. 文を入れる前に同意書へサインしたお客様には、その同意は及びません。参加店舗は、このことを理解したうえで共有機能を使います。
4. 運営は、参加店舗が1と2を行っているかを確かめることがあります。行っていないときは、行うまで共有機能を止めることができます。

第5　お客様からの求めへの対応
1. お客様ご本人から、共有された内容について「見せてほしい」「直してほしい」「消してほしい」「使うのをやめてほしい」と求められたときの窓口は、その共有を出した店舗です。
2. 求めを受けた店舗が、その共有を出した店舗でないときは、参加店舗の間で確かめ、出した店舗に引き継ぎます。
3. 出した店舗は、法令に従って、遅れずに対応します。対応する責任は店舗にあります。

第6　秘密の扱い
1. どの店舗が参加店舗であるかは、参加店舗と運営だけの秘密とします。参加店舗は、お客様や外部の人に、ほかの参加店舗の名前を伝えません。運営も、法令で求められた場合を除いて、外部に伝えません。
2. 共有機能の画面には、どの店舗が共有を出したかは表示されません。知る必要があるときは、参加店舗の間で直接確かめます。
3. フクエスCRMのログイン情報は、各店舗が責任をもって管理します。スタッフが辞めたときは、パスワードを変えます。
4. 共有された内容がもれたとき、またはもれたおそれがあるときは、すぐに運営とほかの参加店舗に知らせます。

第7　表示が出たときの扱い
1. 共有された電話番号から予約が入ると、スケジュールと受付の画面に「グループ・提携店でNG」などの表示が出ます。表示は参考の情報です。電話番号が同じというだけで、別の方のこともあります。
2. 予約は自動では断られません。受けるか断るかは、それぞれの店舗が、名前などを確かめたうえで決めます。その結果についての責任は、判断をした店舗が負います。
3. 電話番号を変えたお客様や、非通知でかけてきたお客様には、表示は出ません。表示が出ないことは、安全を保証するものではありません。

第8　運営の立場
1. 運営は、共有機能の仕組みを用意し、データを預かる立場です。共有された内容が事実かどうかを確かめる立場ではなく、内容についての責任を負いません。
2. 運営は、保守、問い合わせへの対応、法令で求められた場合を除いて、共有された内容を見ません。法令にもとづく求め（警察、裁判所など）があったときは、共有された内容を出すことがあります。
3. 運営は、この申込書に反する使い方があったとき、またはそのおそれがあるときは、共有機能の全部または一部を止め、共有を取り下げることができます。
4. 運営は、だれが・いつ・登録、変更、取り下げをしたかの記録を残します。

第9　店舗が加わるとき・抜けるとき・終わるとき
1. あとから店舗が加わるときは、そのときの全部の参加店舗が、画面で認めます。加わった店舗には、それまでに共有された内容も見えるようになります。
2. 参加店舗は、運営に知らせることで、いつでも共有機能から抜けられます。
3. 店舗が抜けたとき、フクエスCRMを解約したとき、第1の関係がなくなったときは、その店舗が出していた共有は、ほかの店舗から見えなくなります。その店舗からも、共有の内容は見えなくなります。
4. 取り下げた共有のデータは、運営が定める期間がたったあとに消します。
5. 抜けたあと・終わったあとも、第2（外に伝えない・ほかの目的に使わない）と第6（秘密の扱い）は守ります。

第10　そのほか
1. この申込書は、フクエスCRM利用規約と「顧客データの取り扱い」に加えて適用します。共有機能について内容が食い違うときは、この申込書を優先します。
2. 運営は、法令の変更などで必要なときは、この内容を変えることがあります。変えるときは、あらかじめ参加店舗に知らせます。
3. この申込みは、フクエスCRMの画面で、代表者（または代表者から任された人）の名前を入れ、同意のチェックを入れることで行います。運営は、申し込んだ内容、日時、参加店舗の一覧を記録します。
4. この申込書に書いていないことは、参加店舗と運営が話し合って決めます。`;

/** 参加店の一覧の1行（記録に残す形）。★ DB と、申込み・承認の画面にだけ出る */
export type CrmGroupParty = { salonId: number; name: string; corp: string };

/**
 * 「ほかの店が加わることを認める」ときに、記録に残す文。
 * @param alertCount いま共有されている件数（加わる店に見えるようになる）
 */
export function crmGroupApproveBody(newcomer: Pick<CrmGroupParty, 'name' | 'corp'>, alertCount: number): string {
  return [
    '次の店舗が、グループ・提携店の共有に加わることを認めます。',
    '　' + newcomer.name + '（' + newcomer.corp + '）',
    '加わると、この店舗にも、今までに共有した内容（' + Math.max(0, Math.floor(alertCount)) + '件）が見えるようになります。この店舗が共有した内容も、当店に見えるようになります。',
    '利用申込書（版 ' + CRM_GROUP_APPLY_VERSION + '）の内容は、加わる店舗との間でも同じように当てはまります。',
  ].join('\n');
}

/** 入力してもらう名前（代表者か、任された人）の検査。通れば、前後の空白を落とした名前を返す */
export function checkCrmGroupSignerName(name: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const s = typeof name === 'string' ? name.replace(/[\s　]+/g, ' ').trim() : '';
  if (s.length === 0) return { ok: false, error: 'お名前を入れてください' };
  if (s.length > CRM_GROUP_SIGNER_NAME_MAX) return { ok: false, error: 'お名前は' + CRM_GROUP_SIGNER_NAME_MAX + '文字までです' };
  return { ok: true, name: s };
}

/** 2つの店の集まりが同じか（順番は見ない） */
export function sameCrmGroupParties(a: ReadonlyArray<number>, b: ReadonlyArray<number>): boolean {
  const x = [...new Set(a)].sort((p, q) => p - q);
  const y = [...new Set(b)].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export type CrmGroupSigKind = 'apply' | 'approve' | 'decline';
/** 署名・承認の記録（判断に要る分だけ） */
export type CrmGroupSig = {
  id: number;
  inviteId: number;
  salonId: number;
  kind: CrmGroupSigKind;
  version: string;
  /** 署名した時の参加店の番号 */
  partyIds: number[];
};
export type CrmGroupInviteLite = { id: number; salonId: number };

/** その店が、その「署名待ち」に出したいちばん新しい記録（kinds の中で） */
export function latestCrmGroupSig(sigs: ReadonlyArray<CrmGroupSig>, inviteId: number, salonId: number, kinds: ReadonlyArray<CrmGroupSigKind>): CrmGroupSig | null {
  let best: CrmGroupSig | null = null;
  for (const s of sigs) {
    if (s.inviteId !== inviteId || s.salonId !== salonId || !kinds.includes(s.kind)) continue;
    if (!best || s.id > best.id) best = s;
  }
  return best;
}

/**
 * いま申込書に載る参加店（番号）。
 * ・最初（まだだれも入っていない）: 「署名待ち」の店の全部
 * ・あとから足す: いま入っている店 ＋ その足す店
 */
export function crmGroupPartyIdsFor(memberIds: ReadonlyArray<number>, invites: ReadonlyArray<CrmGroupInviteLite>, invite: CrmGroupInviteLite): number[] {
  if (memberIds.length === 0) return invites.map((i) => i.salonId);
  return [...memberIds, invite.salonId];
}

/**
 * その「署名待ち」の店の申込書への署名が、いまも有効か。
 * ★ 版が今の版で、署名した時の参加店が、いまの参加店と同じこと（あとで店が足された・減ったら、署名し直し）。
 */
export function crmGroupApplyValid(sigs: ReadonlyArray<CrmGroupSig>, memberIds: ReadonlyArray<number>, invites: ReadonlyArray<CrmGroupInviteLite>, invite: CrmGroupInviteLite, version: string): boolean {
  const s = latestCrmGroupSig(sigs, invite.id, invite.salonId, ['apply']);
  if (!s || s.version !== version) return false;
  return sameCrmGroupParties(s.partyIds, crmGroupPartyIdsFor(memberIds, invites, invite));
}

/** 今いる店の、その「署名待ち」への返事: 'approve'（認めた）／'decline'（認めない）／null（まだ） */
export function crmGroupMemberAnswer(sigs: ReadonlyArray<CrmGroupSig>, inviteId: number, memberSalonId: number): 'approve' | 'decline' | null {
  const s = latestCrmGroupSig(sigs, inviteId, memberSalonId, ['approve', 'decline']);
  return s ? (s.kind === 'approve' ? 'approve' : 'decline') : null;
}

/**
 * 足す店に、申込書を出してよいか。
 * ・最初（まだだれも入っていない）: 出してよい（署名待ちの店が2つ以上あるとき）。
 * ・あとから足す: ★★★ 今いる全部の店が認めたあとだけ（先に出すと、足す店に「だれとだれがグループか」が知られる）。
 */
export function crmGroupInviteeCanSign(sigs: ReadonlyArray<CrmGroupSig>, memberIds: ReadonlyArray<number>, invites: ReadonlyArray<CrmGroupInviteLite>, invite: CrmGroupInviteLite): boolean {
  if (memberIds.length === 0) return invites.length >= 2;
  return memberIds.every((m) => crmGroupMemberAnswer(sigs, invite.id, m) === 'approve');
}

/**
 * いま「入れてよい」署名待ちを決める。
 * ・最初: 署名待ちが2店以上で、全部の店の署名が有効なら、全部いっしょに入れる。1店でも欠けていれば、だれも入れない。
 * ・あとから足す: 今いる全部の店が認め、足す店の署名が有効なら、その店を入れる（1店ずつ。入れたら、次の店は新しい顔ぶれで見直す）。
 * @returns 入れる「署名待ち」の番号（この順に入れる）
 */
export function planCrmGroupJoins(input: { memberIds: ReadonlyArray<number>; invites: ReadonlyArray<CrmGroupInviteLite>; sigs: ReadonlyArray<CrmGroupSig>; version: string }): number[] {
  const { invites, sigs, version } = input;
  if (input.memberIds.length === 0) {
    if (invites.length < 2) return [];
    return invites.every((i) => crmGroupApplyValid(sigs, [], invites, i, version)) ? invites.map((i) => i.id) : [];
  }
  const members = [...input.memberIds];
  const out: number[] = [];
  for (const i of invites) {
    if (members.includes(i.salonId)) continue;
    if (!crmGroupInviteeCanSign(sigs, members, invites, i)) continue;
    if (!crmGroupApplyValid(sigs, members, invites, i, version)) continue;
    out.push(i.id);
    members.push(i.salonId);
  }
  return out;
}
