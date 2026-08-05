/**
 * NOME.AI - 页面: 学生档案详情
 */

Pages['student-profile'] = function() {
  const data = MockData.studentDetail;
  const percentOfTarget = (data.currentScore / data.targetScoreNum) * 100;
  const gaugePercent = data.stressIndex / 100;
  const gaugeCircum = 2 * Math.PI * 35;

  return `
    <div class="topbar">
      <div class="topbar-left">
        <button class="icon-button" onclick="Router.navigate('students')">${Icons.arrowLeft}</button>
        <h1 class="page-title">学生档案</h1>
        <select class="input" style="width:auto;height:2rem;font-size:0.875rem">
          <option>李明 (高二A班)</option>
          <option>王雅静 (高二A班)</option>
          <option>赵子豪 (高二A班)</option>
          <option>陈思雨 (高二B班)</option>
        </select>
      </div>
      <div class="topbar-right">
        <span class="text-secondary" style="font-size:0.75rem">Last Update: Just Now</span>
        <button class="icon-button">${Icons.bell}</button>
        <button class="icon-button">${Icons.settings}</button>
      </div>
    </div>

    <div class="page stagger" id="studentProfilePage">

      <!-- 学生信息头部 -->
      <div class="profile-header">
        <div class="profile-identity">
          <div class="avatar avatar-lg" style="background:var(--deep-teal);color:white;font-size:1.5rem">${data.avatar}</div>
          <div class="profile-name-block">
            <div class="profile-name">${data.name}</div>
            <div class="profile-badges">
              <span class="badge badge-subject">${data.grade}</span>
              <span class="badge badge-subject">${data.class}</span>
              <span class="badge badge-p1">目标 ${data.targetScore}</span>
            </div>
          </div>
        </div>

        <div class="profile-score">
          <div class="profile-score-num">
            <span>${data.currentScore}<span style="font-size:0.75rem;color:var(--warm-stone)">%</span></span>
            <span class="text-secondary" style="font-size:0.875rem">/ ${data.targetScoreNum}%</span>
          </div>
          <div class="profile-score-target">Target: ${data.targetScoreNum}% (${data.targetScoreNum - data.currentScore >= 0 ? '+' : ''}${data.targetScoreNum - data.currentScore}%)</div>
          <div class="progress" style="margin-top:0.5rem;height:0.5rem">
            <div class="progress-bar" style="width:${percentOfTarget}%"></div>
          </div>
        </div>

        <div class="profile-stress">
          <div class="gauge">
            <svg class="gauge-svg" viewBox="0 0 80 80">
              <circle class="gauge-bg" cx="40" cy="40" r="35"></circle>
              <circle class="gauge-fill" cx="40" cy="40" r="35"
                stroke-dasharray="${gaugeCircum}"
                stroke-dashoffset="${gaugeCircum * (1 - gaugePercent)}"></circle>
            </svg>
            <div class="gauge-text">
              <div class="gauge-value">${data.stressIndex}</div>
              <div class="gauge-label">Mental Load</div>
            </div>
          </div>
          <div style="text-align:center;font-size:0.75rem;color:var(--alert-amber);font-weight:500">偏高 · 考前1周</div>
        </div>

        <div style="text-align:right">
          <span class="badge badge-p1" style="margin-bottom:0.5rem">讲解方式</span>
          <div style="font-size:0.875rem;font-weight:500;color:var(--deep-ink);margin-top:0.25rem">${data.teachingStyle}</div>
          <div class="text-secondary" style="font-size:0.75rem;margin-top:0.25rem">根据学生模型自动匹配</div>
        </div>
      </div>

      <!-- 主体两列 -->
      <div class="two-col">

        <!-- 左列 -->
        <div class="stagger" style="display:flex;flex-direction:column;gap:1rem">

          <!-- 知识图谱 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.assignment} 知识图谱 Mastery Graph</h2>
              <select class="input" style="width:auto;height:2rem;font-size:0.8125rem">
                <option>A-Level 数学</option>
                <option>IELTS Reading</option>
              </select>
            </div>
            <div style="display:flex;justify-content:center;gap:0.75rem;margin-bottom:0.875rem;flex-wrap:wrap;font-size:0.6875rem;color:var(--warm-stone)">
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--success-green)"></span>Mastery</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--deep-teal)"></span>Stable</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--alert-amber)"></span>Review</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--error-red)"></span>Critical</span>
            </div>
            <div class="knowledge-graph">
              ${data.knowledgeGraph.map(k => `
                <div class="kg-node" onclick="Toast.show('${k.name} 掌握度 ${k.mastery}%', 'info', 1500)">
                  <div class="kg-letter ${k.level}">${k.code}</div>
                  <div class="kg-name">${k.name}</div>
                  <div class="kg-percent">${k.mastery}%</div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 最近作业 -->
          <div class="card" style="padding:0;overflow:hidden">
            <div class="card-header" style="padding:1.5rem 1.5rem 0.5rem">
              <h2 class="card-title">${Icons.document} 最近作业 Recent Work</h2>
            </div>
            <table class="data-table" style="margin-top:0.5rem">
              <thead>
                <tr>
                  <th>作业 / 测验</th>
                  <th>日期</th>
                  <th class="right">得分</th>
                </tr>
              </thead>
              <tbody>
                ${data.recentWork.map(w => `
                  <tr>
                    <td>
                      <div style="font-weight:500;color:var(--deep-ink)">${w.title}</div>
                      <div class="text-secondary" style="font-size:0.75rem;margin-top:0.125rem">${w.type}</div>
                    </td>
                    <td class="text-secondary mono" style="font-size:0.8125rem">${formatDate(w.date)}</td>
                    <td class="right">
                      <span class="mono" style="font-weight:600;color:${w.score >= 85 ? 'var(--success-green)' : w.score >= 60 ? 'var(--alert-amber)' : 'var(--error-red)'}">${w.score}<span class="text-secondary">/${w.max}</span></span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- 反馈分析 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.trending} 反馈分析 Insights</h2>
              <div class="tabs" style="border-bottom:none">
                <div class="tab active">3天</div>
                <div class="tab">7天</div>
                <div class="tab">30天</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
              <div>
                <div class="label-sm" style="margin-bottom:0.5rem">正确率趋势 (本周)</div>
                <div style="display:flex;align-items:flex-end;gap:0.5rem;height:5rem">
                  <div style="flex:1;height:60%;background:var(--teal-tint);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:80%;background:var(--teal-tint-strong);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:50%;background:var(--teal-tint);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:90%;background:var(--deep-teal);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:100%;background:var(--deep-teal);border-radius:3px 3px 0 0"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.6875rem;color:var(--warm-stone);margin-top:0.25rem">
                  <span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>Today</span>
                </div>
              </div>
              <div>
                <div class="label-sm" style="margin-bottom:0.5rem">错因分布</div>
                <div style="display:flex;flex-direction:column;gap:0.5rem">
                  ${Object.entries(data.feedback.errorDist).map(([k, v]) => {
                    if (v === 0) return '';
                    const labels = { knowledge: 'Concept', method: 'Method', calculation: 'Calculation', reading: 'Reading', execution: 'Time Limit' };
                    const colors = { knowledge: 'var(--deep-teal)', method: 'var(--info-blue)', calculation: 'var(--alert-amber)', reading: 'var(--warm-stone)', execution: 'var(--gray-400)' };
                    return `
                      <div style="display:flex;align-items:center;gap:0.5rem">
                        <div style="width:5rem;font-size:0.75rem;color:var(--warm-stone)">${labels[k]}</div>
                        <div class="progress" style="flex:1;height:0.5rem">
                          <div class="progress-bar" style="width:${v * 2}%;background:${colors[k]}"></div>
                        </div>
                        <div class="mono" style="font-size:0.75rem;width:2rem;text-align:right">${v}%</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
            <div style="margin-top:1.25rem;padding:0.875rem;background:var(--teal-tint);border-radius:var(--r-md);border:1px solid var(--teal-tint-strong)">
              <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.375rem">
                <span style="width:1rem;height:1rem;color:var(--deep-teal)">${Icons.lightbulb}</span>
                <strong style="font-size:0.8125rem;color:var(--deep-teal)">AI 洞察 AI Insights</strong>
              </div>
              <p style="font-size:0.8125rem;line-height:1.6;color:var(--deep-ink)">
                ${data.feedback.alert}。建议通过"讲错题 → 训练柔弱基础"模块, 减少低级错误。
              </p>
            </div>
          </div>
        </div>

        <!-- 右列 -->
        <div class="stagger" style="display:flex;flex-direction:column;gap:1rem">

          <!-- 学生标签 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">学习标签 Tags</h2>
              <a class="card-link" onclick="Toast.show('编辑功能开发中', 'info')">编辑 →</a>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
              ${data.tags.map(t => `
                <div class="tag-pill" style="background:${t.category === 'learning_issue' ? 'var(--amber-tint)' : t.category === 'positive' ? 'var(--green-tint)' : 'var(--teal-tint)'};color:${t.category === 'learning_issue' ? 'var(--alert-amber)' : t.category === 'positive' ? 'var(--success-green)' : 'var(--deep-teal)'}" title="${t.evidence}">
                  ${t.label}
                  <span class="tag-pill-confidence" style="color:${t.category === 'learning_issue' ? 'var(--alert-amber)' : t.category === 'positive' ? 'var(--success-green)' : 'var(--deep-teal)'}">${t.confidence}%</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 执行力 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">执行力 Execution</h2>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
              <div class="text-secondary" style="font-size:0.8125rem">Task Completion</div>
              <div style="display:flex;align-items:baseline;gap:0.25rem">
                <span class="mono" style="font-size:1.5rem;font-weight:600;color:var(--deep-ink)">${data.execution.weeklyCompleted * 13}</span>
                <span class="text-secondary" style="font-size:0.875rem">%</span>
              </div>
            </div>
            <div class="text-secondary" style="font-size:0.75rem;margin-bottom:0.5rem">${data.execution.weeklyCompleted * 13}% completed this month</div>
            <div style="display:flex;align-items:flex-end;gap:0.25rem;height:4rem;margin-bottom:0.5rem">
              ${data.execution.last14Days.map((v, i) => {
                const h = Math.max(20, v * 25);
                const color = v < 2 ? 'var(--red-tint)' : 'var(--teal-tint-strong)';
                return `<div style="flex:1;height:${h}%;background:${color};border-radius:2px 2px 0 0"></div>`;
              }).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.6875rem;color:var(--warm-stone)">
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--teal)"></span>Completed</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--red-tint)"></span>Delayed</span>
            </div>
          </div>

          <!-- AI 建议 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.lightbulb} AI 建议 Suggestions</h2>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              ${data.suggestions.map((s, i) => `
                <div style="padding:0.875rem;background:var(--teal-tint);border-radius:var(--r-md);border:1px solid var(--teal-tint-strong)">
                  <div style="font-size:0.8125rem;color:var(--deep-ink);line-height:1.5;margin-bottom:0.625rem">
                    <strong style="display:block;margin-bottom:0.25rem">${i === 0 ? '推进一代数强化专项练习' : i === 1 ? '开启"压力缓解"对话模式' : '完成变式题验证'}</strong>
                    ${i === 0 ? '针对近期低级计算错误, 系统生成了15道错题集' : i === 1 ? '压力值连续3日超标, 建议开启AI心理导向课程' : '已为该生安排3道针对性变式题, 检验掌握度'}
                  </div>
                  <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-sm" style="flex:1" onclick="Toast.show('已采纳建议', 'success', 1500)">采纳 Adopt</button>
                    <button class="btn btn-ghost btn-sm" style="flex:1" onclick="Toast.show('已忽略', 'info', 1500)">忽略 Ignore</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};

window.loadStudentDetail = function(studentId) {
  // 实际项目中根据 studentId 重新加载数据
  // 这里仅做演示
  Toast.show('已加载学生档案: ' + studentId, 'info', 2000);
};
