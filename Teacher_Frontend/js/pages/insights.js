/**
 * NOME.AI - 页面: AI 洞察（长期记忆 agent 聚合结果）
 *
 * 数据来自长期记忆 agent 写入共享 Postgres 的表：
 *   student_profiles / student_tags / teacher_reports
 * 教师端只读呈现 —— 这是「两端通过数据库传递信息」的痛点演示：
 * 每个标签都带 evidence + confidence，比传统分数更能回答
 * 「最近发生了什么 / 下节课重点 / 谁需要人工介入」。
 */

Pages.insights = async function() {
  let data;
  try {
    data = await API.getInsights();
  } catch (err) {
    return `
      <div class="topbar"><div class="topbar-left"><h1 class="page-title">AI 洞察</h1></div></div>
      <div class="page">
        <div class="empty-state">
          <div class="empty-state-icon">${Icons.alertCircle}</div>
          <div class="empty-state-title">洞察数据暂不可用</div>
          <div class="empty-state-desc">请确认长期记忆 agent（Python :8000）已运行并完成 seed，教师后端已连接共享数据库。</div>
        </div>
      </div>
    `;
  }

  const { students, tags, reports } = data;

  const catMeta = {
    learning_issue: { label: '学习问题', color: 'var(--error-red)', bg: 'var(--red-tint)' },
    learning_style: { label: '学习风格', color: 'var(--deep-teal)', bg: 'var(--teal-tint)' },
    positive:       { label: '正向',     color: 'var(--success-green)', bg: 'var(--green-tint)' },
    habit:          { label: '习惯',     color: 'var(--info-blue)', bg: 'var(--gray-100)' },
  };
  const statusMeta = {
    pending: { label: '待确认', color: 'var(--alert-amber)', bg: 'var(--amber-tint)' },
    confirmed:{ label: '已确认', color: 'var(--success-green)', bg: 'var(--green-tint)' },
    rejected: { label: '已驳回', color: 'var(--warm-stone)', bg: 'var(--gray-100)' },
  };

  const pressureBar = (p) => {
    if (p == null) return '<span class="text-secondary" style="font-size:0.75rem">—</span>';
    const color = p >= 70 ? 'var(--error-red)' : p >= 50 ? 'var(--alert-amber)' : 'var(--success-green)';
    return `<div class="progress" style="flex:1;height:0.5rem"><div class="progress-bar" style="width:${p}%;background:${color}"></div></div><span class="mono" style="font-size:0.75rem;width:2rem;text-align:right;color:${color}">${p}</span>`;
  };

  const accuracyColor = (a) => a == null ? 'var(--warm-stone)' : a >= 0.8 ? 'var(--success-green)' : a >= 0.6 ? 'var(--alert-amber)' : 'var(--error-red)';

  // 需要人工介入的学生：介入建议明确要求介入（而非「暂不需要」），或压力偏高
  const needsAttention = students.filter(s =>
    (s.pressureIndex != null && s.pressureIndex >= 60) ||
    (s.intervention && s.intervention.includes('需要') && !s.intervention.includes('暂不需要')),
  );

  return `
    <div class="topbar">
      <div class="topbar-left">
        <div>
          <h1 class="page-title">AI 洞察</h1>
          <div class="page-subtitle">长期记忆 agent 聚合的学生画像 · 数据实时来自共享数据库</div>
        </div>
      </div>
      <div class="topbar-right">
        ${App.renderLangToggle()}
      </div>
    </div>

    <div class="page stagger">

      <!-- 概览卡片 -->
      <section class="page-section">
        <div class="pending-grid">
          <div class="pending-card">
            <div class="pending-icon teal">${Icons.users}</div>
            <div class="pending-label"><span>学生画像</span><span class="badge badge-info">AGENT</span></div>
            <div class="pending-count">${students.length}<span class="pending-unit"> 人</span></div>
            <div class="text-secondary" style="font-size:0.75rem;margin-top:0.5rem">确定性聚合 + LLM 叙事</div>
          </div>
          <div class="pending-card">
            <div class="pending-icon amber">${Icons.alert}</div>
            <div class="pending-label"><span>需人工介入</span><span class="badge badge-p0">P0</span></div>
            <div class="pending-count">${needsAttention.length}<span class="pending-unit"> 人</span></div>
            <div class="text-secondary" style="font-size:0.75rem;margin-top:0.5rem">${needsAttention.map(s => s.name).join('、') || '无'}</div>
          </div>
          <div class="pending-card">
            <div class="pending-icon teal">${Icons.tag ?? Icons.document}</div>
            <div class="pending-label"><span>动态标签</span><span class="badge badge-info">EVIDENCE</span></div>
            <div class="pending-count">${tags.length}<span class="pending-unit"> 条</span></div>
            <div class="text-secondary" style="font-size:0.75rem;margin-top:0.5rem">每条带证据 + 置信度</div>
          </div>
          <div class="pending-card">
            <div class="pending-icon blue">${Icons.document}</div>
            <div class="pending-label"><span>周期报告</span><span class="badge badge-neutral">WEEK/MONTH</span></div>
            <div class="pending-count">${reports.length}<span class="pending-unit"> 份</span></div>
            <div class="text-secondary" style="font-size:0.75rem;margin-top:0.5rem">定时触发生成</div>
          </div>
        </div>
      </section>

      <!-- 学生画像表格 -->
      <section class="page-section">
        <div class="card" style="padding:0;overflow:hidden">
          <div class="card-header" style="padding:1.5rem 1.5rem 0.75rem">
            <h2 class="card-title">${Icons.users} 学生画像一览</h2>
            <span class="text-secondary" style="font-size:0.75rem">正确率 · 压力指数 · 下节课重点</span>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>学生</th>
                <th>正确率</th>
                <th>答题量</th>
                <th style="width:10rem">压力指数</th>
                <th>下节课重点</th>
                <th>介入建议</th>
              </tr>
            </thead>
            <tbody>
              ${students.map(s => `
                <tr>
                  <td><div style="font-weight:500;color:var(--deep-ink)">${s.name}</div><div class="text-secondary" style="font-size:0.75rem">${s.id}</div></td>
                  <td class="mono" style="font-weight:600;color:${accuracyColor(s.accuracy)}">${s.accuracy == null ? '—' : Math.round(s.accuracy * 100) + '%'}</td>
                  <td class="mono">${s.totalAnswered}</td>
                  <td><div style="display:flex;align-items:center;gap:0.5rem">${pressureBar(s.pressureIndex)}</div></td>
                  <td style="max-width:16rem"><div style="font-size:0.8125rem;line-height:1.5;color:var(--deep-ink)">${s.nextFocus || '—'}</div></td>
                  <td style="max-width:16rem"><div style="font-size:0.8125rem;line-height:1.5;color:var(--deep-ink)">${s.intervention || '—'}</div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- 动态标签 -->
      <section class="page-section">
        <div class="card" style="padding:0;overflow:hidden">
          <div class="card-header" style="padding:1.5rem 1.5rem 0.75rem">
            <h2 class="card-title">${Icons.trending} 动态标签（证据 + 置信度）</h2>
            <span class="text-secondary" style="font-size:0.75rem">agent 规则引擎生成，教师可确认/驳回</span>
          </div>
          <div style="padding:0 1.5rem 1.5rem;display:flex;flex-direction:column;gap:0.75rem">
            ${tags.map(t => {
              const cm = catMeta[t.category] || { label: t.category, color: 'var(--warm-stone)', bg: 'var(--gray-100)' };
              const sm = statusMeta[t.status] || { label: t.status, color: 'var(--warm-stone)', bg: 'var(--gray-100)' };
              const student = students.find(s => s.id === t.studentId);
              return `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem;border:1px solid var(--whisper-line);border-radius:var(--r-md)">
                  <div class="avatar avatar-sm" style="background:var(--gray-200)">${(student?.name || t.studentId)[0]}</div>
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
                      <span class="tag-pill" style="background:${cm.bg};color:${cm.color}">${t.label}</span>
                      <span class="badge" style="background:${cm.bg};color:${cm.color}">${cm.label}</span>
                      <span class="badge" style="background:${sm.bg};color:${sm.color}">${sm.label}</span>
                      <span class="mono" style="font-size:0.75rem;color:var(--deep-teal)">${t.confidence}%</span>
                    </div>
                    <div class="text-secondary" style="font-size:0.75rem;margin-top:0.375rem;line-height:1.5">${t.evidence}</div>
                  </div>
                </div>
              `;
            }).join('') || '<div class="text-secondary">暂无标签</div>'}
          </div>
        </div>
      </section>

      <!-- 周期报告 -->
      <section class="page-section">
        <div class="card" style="padding:0;overflow:hidden">
          <div class="card-header" style="padding:1.5rem 1.5rem 0.75rem">
            <h2 class="card-title">${Icons.document} 周期报告（LLM 生成）</h2>
            <span class="text-secondary" style="font-size:0.75rem">每周 / 每月定时生成</span>
          </div>
          <div style="padding:0 1.5rem 1.5rem;display:flex;flex-direction:column;gap:0.75rem">
            ${reports.map(r => {
              const student = students.find(s => s.id === r.studentId);
              const periodLabel = r.period === 'weekly' ? '周报' : r.period === 'monthly' ? '月报' : r.period;
              return `
                <div style="padding:1rem;background:var(--teal-tint);border:1px solid var(--teal-tint-strong);border-radius:var(--r-md)">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.625rem">
                    <div style="display:flex;align-items:center;gap:0.5rem">
                      <strong style="font-size:0.875rem;color:var(--deep-teal)">${student?.name || r.studentId}</strong>
                      <span class="badge badge-info">${periodLabel}</span>
                    </div>
                    <span class="text-secondary" style="font-size:0.75rem">${getRelativeTime(r.createdAt)}</span>
                  </div>
                  <p style="font-size:0.8125rem;line-height:1.7;color:var(--deep-ink)">${r.summary}</p>
                </div>
              `;
            }).join('') || '<div class="text-secondary">暂无报告</div>'}
          </div>
        </div>
      </section>

    </div>
  `;
};

Pages.insights_init = function() {};
