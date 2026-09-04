#!/usr/bin/env bash
set -euo pipefail

# ── girlslist方式の試し打ち／単発実行（第36便）──────────────────────────
#
# 1店だけを girlslist 方式で処理する。既定は【試し打ち】で、1行も書かない。
#
#   bash /root/import-dryrun.sh <sourceId>          … 試し打ち（apply:false）
#   bash /root/import-dryrun.sh <sourceId> apply    … 本番反映（apply:true）
#
# 使う前に crontab と同じ形で環境変数を読むこと（source しただけでは子プロセスに渡らない）:
#   set -a; . /root/import.env; set +a
#
# sourceId は /api/import/targets が返す値。2026-08-26 時点:
#   1=enju / 2=ラビリンス / 3=アマテラス / 4=アイリス / 5=アバンティ / 6=オイルクエスト
#   ※ salon_id とは別物なので注意（sourceId 4 = salon_id 3 = アイリス）。
#
# ★ shopUrl と externalId は targets から取る。ここに URL を書かないこと
#   （店舗が増減したときに、このファイルだけ古くなる事故を防ぐ）。
#
# 配置（Windowsのリポジトリから）:
#   scp scripts/import-dryrun.sh root@160.251.174.184:/root/import-dryrun.sh

SID="${1:?usage: import-dryrun.sh <sourceId> [apply]}"
MODE="${2:-dry}"

APPLY=false
if [ "$MODE" = "apply" ]; then APPLY=true; fi

BASE="https://fukues.com"
SECRET="${CRON_SECRET:?set CRON_SECRET（先に  set -a; . /root/import.env; set +a  を打つこと）}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
# ★★★ 第153便（2026-09-05）: 暦日 → 【営業日】（午前6時始まり）にした。
#   ★ src/lib/dutyStatus.ts の DAY_START_HOUR = 6 と対。★ 駅ちかもエステ魂も6時始まり（実測・第150便）。
#
#   ★★ なぜ要るか（★ 2026-09-05 深夜に実際に見つかった）
#     深夜0〜6時に list を回すと、駅ちかの「本日出勤」（＝駅ちかの営業日＝暦日の前日）を、
#     フクエスの暦日（＝当日）として保存していた。
#     → ★ **フクエスの「明日」に、駅ちかの「今日」の出勤が入る。**
#     ★ 06:05 の list が正しい日付で上書きするので、朝には直っていた。だから気づけなかった。
#
#   ★★★ 一覧ページ（girlslist）には日付ラベルが無い（「本日出勤」としか書いていない）。
#     ★ **照合できないので、ここが唯一の守り。** ★ この行を暦日に戻さないこと。
#     ★ 個人ページ（週間予定）のほうは第153便でラベルを照合するようにした。
#
#   ★ 05:59→前日 / 06:00→当日 / 月またぎも正しい（GNU date で実測）
TODAY="$(TZ=Asia/Tokyo date -d '6 hours ago' +%F)"

echo "=== $(TZ=Asia/Tokyo date '+%F %T')  sourceId=$SID  apply=$APPLY ==="

curl -s -H "Authorization: Bearer $SECRET" "$BASE/api/import/targets" | python3 -c '
import sys,json,re,subprocess,time
BASE,SECRET,UA,TODAY,SID,APPLY = sys.argv[1:7]
data=json.load(sys.stdin)
hit=[x for x in data.get("targets",[]) if str(x.get("sourceId"))==str(SID)]
if not hit:
    have=[str(x.get("sourceId")) for x in data.get("targets",[])]
    raise SystemExit("sourceId %s は targets にいません（いるのは: %s）" % (SID, ", ".join(have)))
t=hit[0]; shop=t["shopUrl"]; ext=str(t["externalId"])
pages=[]; ids=[]
# ★ ページ送りを必ず辿る。アイリスは100人/ページで2ページある（禁則256）。
# ★ 終端の判定は import.sh と同じ。試し打ちと本番で挙動を変えないこと。
PAGE_SIZE=100
for pg in range(1,6):
    u=shop.rstrip("/")+"/girlslist/"+("" if pg==1 else "page%d/"%pg)
    h=subprocess.run(["curl","-s","-A",UA,u],capture_output=True,text=True).stdout
    found=list(dict.fromkeys(re.findall(r"/%s/(\d+)/"%ext,h)))
    new=[c for c in found if c not in ids]
    if not new: break
    ids+=new; pages.append(h)
    has_next=("/girlslist/page%d/"%(pg+1)) in h
    if not has_next and len(found)<PAGE_SIZE: break
    time.sleep(1)
print("salonId",t.get("salonId"),"pages",len(pages),"ids",len(ids),"listMode",t.get("listMode"),flush=True)
if not pages: raise SystemExit("一覧が1ページも取れませんでした")
body=json.dumps({"sourceId":int(SID),"todayISO":TODAY,"pages":pages,"apply":(APPLY=="true")})
r=subprocess.run(["curl","-s","-X","POST","-H","Authorization: Bearer "+SECRET,
  "-H","Content-Type: application/json","--data-binary","@-",
  BASE+"/api/import/ingest-list"],input=body,capture_output=True,text=True)
print(r.stdout[:8000])
' "$BASE" "$SECRET" "$UA" "$TODAY" "$SID" "$APPLY"
