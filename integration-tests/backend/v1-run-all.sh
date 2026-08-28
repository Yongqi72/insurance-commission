#!/bin/bash
# v1 后端穿透流·全量脚本
# 覆盖 5 条穿透流（每条对应一个不同终态/分支决策），每条流一个真实实体从入口走到终态，
# 全程真实 API + 真实 DB + 真实 OSS，禁 fixture 抄近路。
#
# 依赖：后端已在 BASE_URL 监听，管理员账号/密码见下方变量，OSS 凭证已配置在 backend/.env。
# 环境有 http_proxy/https_proxy 时会拦截 127.0.0.1，所有 curl 调用需带 --noproxy '*'。
#
# 用法：
#   ./v1-run-all.sh            跑全部 5 条流
#   ./v1-run-all.sh flow1      只跑 flow1（可选 flow1..flow5）
#
# 各流状态隔离：flow1/2/3 各自新建独立批次，互不依赖，可并行执行；
# flow4→flow5 依赖全局唯一一套阶梯规则，必须按顺序串行（flow5 依赖 flow4 建好的完整规则）。

set -u
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-IntegrationTest123!}"
FIXTURES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/fixtures" && pwd)"
DOWNLOADS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/downloads" && pwd)"
TS="$(date +%s)"

PASS=0
FAIL=0
FAIL_DETAIL=()

curl_json() {
  # curl_json <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -s --noproxy '*' -X "$method" "$BASE_URL$path" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "$body" -w '\n%{http_code}'
  else
    curl -s --noproxy '*' -X "$method" "$BASE_URL$path" \
      -H "Authorization: Bearer $TOKEN" -w '\n%{http_code}'
  fi
}

# 返回体存入 $RESP_BODY，状态码存入 $RESP_CODE
call() {
  local raw
  raw="$(curl_json "$@")"
  RESP_CODE="$(echo "$raw" | tail -n1)"
  RESP_BODY="$(echo "$raw" | sed '$d')"
}

step() { echo "  · $1"; }
pass() { PASS=$((PASS+1)); echo "    ✅ $1"; }
fail() { FAIL=$((FAIL+1)); FAIL_DETAIL+=("$1"); echo "    ❌ $1"; }

assert_eq() {
  # assert_eq <label> <actual> <expected>
  if [ "$2" == "$3" ]; then pass "$1（实际=$2）"; else fail "$1（期望=$3，实际=$2）"; fi
}

login() {
  local raw code body
  raw="$(curl -s --noproxy '*' -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" -w '\n%{http_code}')"
  code="$(echo "$raw" | tail -n1)"
  body="$(echo "$raw" | sed '$d')"
  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    echo "❌ 登录失败，HTTP $code，body=$body"
    exit 1
  fi
  TOKEN="$(echo "$body" | jq -r '.data.accessToken')"
}

upload_file() {
  # upload_file <batchId> <filepath> -> 设置 RESP_BODY / RESP_CODE
  local batchId="$1" filepath="$2"
  local raw
  raw="$(curl -s --noproxy '*' -X POST "$BASE_URL/api/commission-batches/$batchId/imports" \
    -H "Authorization: Bearer $TOKEN" -F "file=@$filepath" -w '\n%{http_code}')"
  RESP_CODE="$(echo "$raw" | tail -n1)"
  RESP_BODY="$(echo "$raw" | sed '$d')"
}

# ========== Flow 1：批次创建 + 导入(含部分行失败) + OSS归档 + 状态切换不锁定 + 文件级失败负例 ==========
flow1() {
  echo "=== Flow 1：批次全生命周期主线（创建→导入含容错→归档→状态切换）==="
  local batchName="IT-Flow1-$TS"

  step "创建批次"
  call POST /api/commission-batches "{\"name\":\"$batchName\"}"
  local batchId; batchId="$(echo "$RESP_BODY" | jq -r '.data.id')"
  assert_eq "创建批次返回 201/200 且 status=doing" "$(echo "$RESP_BODY" | jq -r '.data.status')" "doing"
  [ -z "$batchId" ] || [ "$batchId" == "null" ] && { fail "创建批次未拿到 id，后续步骤跳过"; return; }

  step "上传含 3 条合法+2 条非法行的 Excel"
  upload_file "$batchId" "$FIXTURES_DIR/mixed-valid-invalid.xlsx"
  assert_eq "导入接口 HTTP 201（含 OSS 归档，未抛错即证明 OSS 上传成功）" "$RESP_CODE" "201"
  assert_eq "成功行数=3" "$(echo "$RESP_BODY" | jq -r '.data.successCount')" "3"
  assert_eq "失败行数=2" "$(echo "$RESP_BODY" | jq -r '.data.failCount')" "2"
  local failReasons; failReasons="$(echo "$RESP_BODY" | jq -r '.data.failRows | length')"
  assert_eq "failRows 长度=2" "$failReasons" "2"

  step "查询批次明细，确认 3 条成功记录已入库"
  call GET "/api/commission-batches/$batchId/policy-records?page=1&pageSize=20"
  assert_eq "明细总数=3" "$(echo "$RESP_BODY" | jq -r '.data.total')" "3"
  local wo1; wo1="$(echo "$RESP_BODY" | jq -r '.data.list[0].workOrderNo')"
  assert_eq "首条按创建时间升序，工作单号=WO-IT-0001" "$wo1" "WO-IT-0001"

  step "文件级失败负例：损坏文件"
  upload_file "$batchId" "$FIXTURES_DIR/corrupt.xlsx"
  if [ "$RESP_CODE" == "201" ]; then
    fail "损坏文件预期不应成功，实际 201，body=$RESP_BODY"
  else
    pass "损坏文件被拒绝（HTTP $RESP_CODE）"
  fi

  step "文件级失败负例：找不到「账单」sheet"
  upload_file "$batchId" "$FIXTURES_DIR/wrong-sheet-name.xlsx"
  if [ "$RESP_CODE" == "201" ]; then
    fail "错误 sheet 名预期不应成功，实际 201，body=$RESP_BODY"
  else
    pass "找不到账单 sheet 被拒绝（HTTP $RESP_CODE）"
  fi

  step "标记批次为已完成"
  call PATCH "/api/commission-batches/$batchId/status" '{"status":"done"}'
  assert_eq "状态切换为 done" "$(echo "$RESP_BODY" | jq -r '.data.status')" "done"

  step "状态切换后仍可继续导入（不锁定）"
  # 复用 second-import.xlsx 验证 done 状态下导入接口仍可用
  upload_file "$batchId" "$FIXTURES_DIR/second-import.xlsx"
  assert_eq "已完成状态下导入仍返回 201" "$RESP_CODE" "201"

  echo "$batchId" > /tmp/it-flow1-batch-id.txt
}

# ========== Flow 2：删除某次导入撤销 ==========
flow2() {
  echo "=== Flow 2：删除某次导入撤销（保单记录移除，OSS 原文件保留）==="
  local batchName="IT-Flow2-$TS"

  step "创建独立批次"
  call POST /api/commission-batches "{\"name\":\"$batchName\"}"
  local batchId; batchId="$(echo "$RESP_BODY" | jq -r '.data.id')"

  step "导入 2 条合法记录"
  upload_file "$batchId" "$FIXTURES_DIR/second-import.xlsx"
  assert_eq "导入成功 2 行" "$(echo "$RESP_BODY" | jq -r '.data.successCount')" "2"
  local importFileId; importFileId="$(echo "$RESP_BODY" | jq -r '.data.importFileId')"

  step "确认 2 条明细已入库"
  call GET "/api/commission-batches/$batchId/policy-records?page=1&pageSize=20"
  assert_eq "明细总数=2" "$(echo "$RESP_BODY" | jq -r '.data.total')" "2"

  step "删除该次导入（硬删除）"
  call DELETE "/api/commission-batches/$batchId/imports/$importFileId"
  assert_eq "删除接口 HTTP 200" "$RESP_CODE" "200"

  step "确认关联保单记录已被移除"
  call GET "/api/commission-batches/$batchId/policy-records?page=1&pageSize=20"
  assert_eq "明细总数=0" "$(echo "$RESP_BODY" | jq -r '.data.total')" "0"

  step "确认导入记录列表也已移除"
  call GET "/api/commission-batches/$batchId/imports"
  assert_eq "导入记录列表长度=0" "$(echo "$RESP_BODY" | jq -r '.data | length')" "0"
}

# ========== Flow 3：回填(第三方未配置)+人工补录留痕+覆盖修改+筛选 ==========
flow3() {
  echo "=== Flow 3：回填全部未匹配 + 人工补录留痕 + 覆盖修改 + 回填状态筛选 ==="
  local batchName="IT-Flow3-$TS"

  step "创建独立批次并导入 3 条合法记录"
  call POST /api/commission-batches "{\"name\":\"$batchName\"}"
  local batchId; batchId="$(echo "$RESP_BODY" | jq -r '.data.id')"
  upload_file "$batchId" "$FIXTURES_DIR/mixed-valid-invalid.xlsx"
  assert_eq "导入成功 3 行" "$(echo "$RESP_BODY" | jq -r '.data.successCount')" "3"

  step "触发开始回填（第三方接口未配置）"
  call POST "/api/commission-batches/$batchId/policy-records/fill" ""
  assert_eq "回填接口 HTTP 201（未匹配不是失败）" "$RESP_CODE" "201"
  assert_eq "matchedCount=0" "$(echo "$RESP_BODY" | jq -r '.data.matchedCount')" "0"
  assert_eq "unmatchedCount=3" "$(echo "$RESP_BODY" | jq -r '.data.unmatchedCount')" "3"

  step "按 unmatched 筛选，确认 3 条"
  call GET "/api/commission-batches/$batchId/policy-records?page=1&pageSize=20&fillStatus=unmatched"
  assert_eq "unmatched 筛选总数=3" "$(echo "$RESP_BODY" | jq -r '.data.total')" "3"
  local recordId; recordId="$(echo "$RESP_BODY" | jq -r '.data.list[0].id')"

  step "人工补录销售人员姓名（首次，旧值应为空）"
  call PATCH "/api/policy-records/$recordId/sales-name" '{"salesName":"张三"}'
  assert_eq "补录接口 HTTP 200" "$RESP_CODE" "200"
  assert_eq "salesName 更新为张三" "$(echo "$RESP_BODY" | jq -r '.data.salesName')" "张三"
  assert_eq "salesFillSource 变为 manual" "$(echo "$RESP_BODY" | jq -r '.data.salesFillSource')" "manual"

  step "查询补录历史，确认 1 条日志"
  call GET "/api/policy-records/$recordId/sales-fill-logs"
  assert_eq "日志条数=1" "$(echo "$RESP_BODY" | jq -r '.data | length')" "1"
  assert_eq "首条日志 oldValue=null" "$(echo "$RESP_BODY" | jq -r '.data[0].oldValue')" "null"
  assert_eq "首条日志 newValue=张三" "$(echo "$RESP_BODY" | jq -r '.data[0].newValue')" "张三"

  step "覆盖修改（已是 manual 的记录允许再次覆盖）"
  call PATCH "/api/policy-records/$recordId/sales-name" '{"salesName":"李四"}'
  assert_eq "覆盖后 salesName=李四" "$(echo "$RESP_BODY" | jq -r '.data.salesName')" "李四"

  step "确认新增第二条日志，不覆盖旧日志"
  call GET "/api/policy-records/$recordId/sales-fill-logs"
  assert_eq "日志条数=2（按 changedAt 倒序，最新在前）" "$(echo "$RESP_BODY" | jq -r '.data | length')" "2"
  assert_eq "最新日志 oldValue=张三" "$(echo "$RESP_BODY" | jq -r '.data[0].oldValue')" "张三"
  assert_eq "最新日志 newValue=李四" "$(echo "$RESP_BODY" | jq -r '.data[0].newValue')" "李四"

  step "按 manual 筛选，确认仅这 1 条"
  call GET "/api/commission-batches/$batchId/policy-records?page=1&pageSize=20&fillStatus=manual"
  assert_eq "manual 筛选总数=1" "$(echo "$RESP_BODY" | jq -r '.data.total')" "1"

  step "按 unmatched 筛选，确认其余 2 条仍未匹配"
  call GET "/api/commission-batches/$batchId/policy-records?page=1&pageSize=20&fillStatus=unmatched"
  assert_eq "unmatched 筛选总数=2" "$(echo "$RESP_BODY" | jq -r '.data.total')" "2"
}

# ========== Flow 4：阶梯规则冲突拒绝 + 完整性判定 + 变更历史 ==========
flow4() {
  echo "=== Flow 4：阶梯规则区间冲突拒绝 + 完整性判定（不完整→完整）+ 变更历史 ==="

  step "（前置）当前应无任何阶梯规则"
  call GET "/api/commission-tiers"
  assert_eq "初始 tiers 为空数组" "$(echo "$RESP_BODY" | jq -r '.data.tiers | length')" "0"
  assert_eq "初始 ruleComplete=false" "$(echo "$RESP_BODY" | jq -r '.data.ruleComplete')" "false"

  step "新增档位 (0,50]=2元"
  call POST /api/commission-tiers '{"lowerBound":0,"upperBound":50,"unitPrice":2}'
  assert_eq "新增成功 HTTP 201" "$RESP_CODE" "201"

  step "尝试新增重叠档位 (30,80]=2.5元，应被拒绝"
  call POST /api/commission-tiers '{"lowerBound":30,"upperBound":80,"unitPrice":2.5}'
  if [ "$RESP_CODE" == "201" ]; then
    fail "重叠档位预期被拒绝，实际 201"
  else
    local code; code="$(echo "$RESP_BODY" | jq -r '.code')"
    assert_eq "重叠档位返回错误码 1005（CONFLICT）" "$code" "1005"
  fi

  step "此时表不完整（仅覆盖 0~50）"
  call GET "/api/commission-tiers"
  assert_eq "ruleComplete=false（未覆盖到无穷）" "$(echo "$RESP_BODY" | jq -r '.data.ruleComplete')" "false"

  step "新增补齐档位 (50,+∞)=2.4元（upperBound 留空）"
  call POST /api/commission-tiers '{"lowerBound":50,"unitPrice":2.4}'
  assert_eq "补齐档位成功 HTTP 201" "$RESP_CODE" "201"

  step "此时表完整（0 起点，覆盖到无穷，相邻首尾相接）"
  call GET "/api/commission-tiers"
  assert_eq "ruleComplete=true" "$(echo "$RESP_BODY" | jq -r '.data.ruleComplete')" "true"
  assert_eq "tiers 按 lowerBound 升序，第一档 lowerBound=0" "$(echo "$RESP_BODY" | jq -r '.data.tiers[0].lowerBound')" "0"

  step "查看变更历史，应只有 2 条（被拒绝的冲突操作不产生日志）"
  call GET "/api/commission-tiers/change-logs"
  assert_eq "变更历史条数=2" "$(echo "$RESP_BODY" | jq -r '.data | length')" "2"
  assert_eq "最新一条 operationType=create" "$(echo "$RESP_BODY" | jq -r '.data[0].operationType')" "create"
}

# ========== Flow 5：提成汇总实时计算（未配置/完整两态）+ 导出Excel + OSS归档 + 导出历史重新下载 ==========
flow5() {
  echo "=== Flow 5：提成汇总实时计算 + 导出报表 + OSS 归档 + 导出历史重新下载（依赖 Flow4 已建好完整阶梯规则）==="
  local batchName="IT-Flow5-$TS"

  step "创建批次并导入 3 条记录（常熟×2/太仓×1）"
  call POST /api/commission-batches "{\"name\":\"$batchName\"}"
  local batchId; batchId="$(echo "$RESP_BODY" | jq -r '.data.id')"
  upload_file "$batchId" "$FIXTURES_DIR/mixed-valid-invalid.xlsx"
  assert_eq "导入成功 3 行" "$(echo "$RESP_BODY" | jq -r '.data.successCount')" "3"

  step "全部未匹配时查询汇总：规则已完整（Flow4），但记录尚无 salesName，各组应为空汇总"
  call GET "/api/commission-batches/$batchId/commission-summary"
  assert_eq "ruleComplete=true（沿用 Flow4 全局规则）" "$(echo "$RESP_BODY" | jq -r '.data.ruleComplete')" "true"

  step "获取常熟组 2 条记录 id，人工补录为同一销售'张三'"
  call GET "/api/commission-batches/$batchId/policy-records?page=1&pageSize=20"
  local id1 id2
  id1="$(echo "$RESP_BODY" | jq -r '.data.list[] | select(.policyholder=="常熟") | .id' | sed -n '1p')"
  id2="$(echo "$RESP_BODY" | jq -r '.data.list[] | select(.policyholder=="常熟") | .id' | sed -n '2p')"
  call PATCH "/api/policy-records/$id1/sales-name" '{"salesName":"张三"}'
  assert_eq "常熟第1条补录成功" "$RESP_CODE" "200"
  call PATCH "/api/policy-records/$id2/sales-name" '{"salesName":"张三"}'
  assert_eq "常熟第2条补录成功" "$RESP_CODE" "200"

  step "太仓组记录保持未匹配（不补录），验证 AC-16 不计入汇总"
  call GET "/api/commission-batches/$batchId/commission-summary"
  local changshu_ticket changshu_commission taicang_items
  changshu_ticket="$(echo "$RESP_BODY" | jq -r '.data.groups[] | select(.policyholder=="常熟") | .items[0].ticketCount')"
  changshu_commission="$(echo "$RESP_BODY" | jq -r '.data.groups[] | select(.policyholder=="常熟") | .items[0].commission')"
  taicang_items="$(echo "$RESP_BODY" | jq -r '.data.groups[] | select(.policyholder=="太仓") | .items | length')"
  assert_eq "常熟组张三票数=2" "$changshu_ticket" "2"
  assert_eq "常熟组张三提成=2票×2元(0,50]档=4" "$changshu_commission" "4"
  assert_eq "太仓组 items 为空（AC-16 未匹配不计入）" "$taicang_items" "0"

  step "导出提成报表 Excel（blob）"
  curl -s --noproxy '*' -X GET "$BASE_URL/api/commission-batches/$batchId/commission-report" \
    -H "Authorization: Bearer $TOKEN" -D "$DOWNLOADS_DIR/export-headers.txt" \
    -o "$DOWNLOADS_DIR/exported-report.xlsx" -w '%{http_code}' > /tmp/it-export-code.txt
  local exportCode; exportCode="$(cat /tmp/it-export-code.txt)"
  assert_eq "导出接口 HTTP 200" "$exportCode" "200"
  local contentType; contentType="$(grep -i '^Content-Type' "$DOWNLOADS_DIR/export-headers.txt" | tr -d '\r')"
  echo "    (Content-Type: $contentType)"

  step "解析导出的 Excel，断言按投保人分 sheet + 销售汇总 + 合计"
  local inspect; inspect="$(node "$FIXTURES_DIR/inspect-xlsx.js" "$DOWNLOADS_DIR/exported-report.xlsx" 2>&1)"
  local sheetNames; sheetNames="$(echo "$inspect" | jq -r '.sheetNames | join(",")' 2>/dev/null)"
  echo "    (sheets: $sheetNames)"
  if echo "$sheetNames" | grep -q "常熟" && echo "$sheetNames" | grep -q "太仓"; then
    pass "导出文件含常熟/太仓两个 sheet"
  else
    fail "导出文件 sheet 名不含预期投保人，实际=$sheetNames"
  fi

  step "确认导出记录已生成（OSS 归档 + 导出历史）"
  call GET "/api/commission-batches/$batchId/exports"
  assert_eq "导出历史条数=1" "$(echo "$RESP_BODY" | jq -r '.data | length')" "1"
  local downloadUrl; downloadUrl="$(echo "$RESP_BODY" | jq -r '.data[0].downloadUrl')"
  if [ -n "$downloadUrl" ] && [ "$downloadUrl" != "null" ]; then
    pass "导出历史记录含 downloadUrl（签名 URL）"
  else
    fail "导出历史记录缺少 downloadUrl"
  fi

  step "重新下载（直接用 downloadUrl，不重新调用计算接口）"
  local dlCode; dlCode="$(curl -s -o "$DOWNLOADS_DIR/redownloaded.xlsx" -w '%{http_code}' "$downloadUrl")"
  assert_eq "重新下载 HTTP 200" "$dlCode" "200"
}

run_all() {
  login
  flow1
  flow2
  flow3
  flow4
  flow5
}

case "${1:-all}" in
  flow1) login; flow1 ;;
  flow2) login; flow2 ;;
  flow3) login; flow3 ;;
  flow4) login; flow4 ;;
  flow5) login; flow4; flow5 ;;  # flow5 依赖 flow4 建好的完整规则
  all) run_all ;;
  *) echo "用法: $0 [flow1|flow2|flow3|flow4|flow5|all]"; exit 1 ;;
esac

echo ""
echo "=================================="
echo "通过 $PASS 项 / 失败 $FAIL 项"
if [ "$FAIL" -gt 0 ]; then
  echo "失败详情："
  for d in "${FAIL_DETAIL[@]}"; do echo "  - $d"; done
  exit 1
fi
exit 0
