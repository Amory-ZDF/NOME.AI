#!/usr/bin/env bash
# ============================================================
# NOME.AI agent 链路多轮验证脚本
# 用法:
#   1. 先启动后端: cd backend && uvicorn app.main:app --reload --port 8000
#   2. 保证 .env 里有 DEEPSEEK_API_KEY 或 QWEN_API_KEY
#   3. bash scripts/verify_agent.sh
#
# 它模拟一个学生连续答错同一道题, 逐层解锁 hint_level 0->4,
# 验证 diagnosis -> framework -> hint 的完整多轮链路。
# ============================================================

set -e

BASE="http://127.0.0.1:8000/api"
STUDENT="verify-student-01"
QID="q-verify-01"

echo "=========================================="
echo "0) 健康检查"
echo "=========================================="
curl -s --max-time 5 "$BASE/../health" | python3 -m json.tool || echo "  [!] /health 失败"

# 基础题目上下文
Q_BODY='{
  "student_id": "'$STUDENT'",
  "question": {
    "id": "'$QID'",
    "topic": "Kinematics - SUVAT Equations",
    "type": "calculation",
    "difficulty": 3,
    "content": "<p>A ball is thrown vertically upwards at 20 m/s. How high does it go? (g=9.8 m/s^2)</p>",
    "correct_answer": "20.4 m",
    "knowledge_node_id": "kin-02"
  },
  "progress": {
    "question_id": "'$QID'",
    "current_answer": "10 m",
    "status": "wrong",
    "hint_level": HINT_LEVEL_PLACEHOLDER,
    "solved_at_hint_level": null,
    "attempts": [
      {"answer": "10 m", "submitted_at": "2026-08-11T10:00:00", "is_correct": false}
    ]
  }
}'

send() {
  local hint_level="$1"
  local label="$2"
  local body="${Q_BODY//HINT_LEVEL_PLACEHOLDER/$hint_level}"
  echo ""
  echo "=========================================="
  echo "$label  (hint_level=$hint_level)"
  echo "=========================================="
  curl -s --max-time 120 \
    -X POST "$BASE/agent/analyze" \
    -H "Content-Type: application/json" \
    -d "$body" | python3 -m json.tool
  echo ""
}

# 多轮验证: 学生每次都答错, 逐层解锁 hint
send 0 "轮1: 首次答错(hint_level=0)"
send 1 "轮2: 看了一个提示还错(hint_level=1)"
send 2 "轮3: 两个提示还错(hint_level=2)"
send 3 "轮4: 三个提示还错(hint_level=3)"
send 4 "轮5: 四个提示还错(hint_level=4)"
send 5 "轮6: 到顶(hint_level=5)"

echo ""
echo "=========================================="
echo "完成。重点看:"
echo "  - 每轮 diagnosis 是否有 error_type + why_wrong"
echo "  - knowledge 类错因时 framework 是否有 weak_links (依赖前置知识点)"
echo "  - hint 是否逐层深入 (title 从 Clarify 到 Full Solution)"
echo "=========================================="
