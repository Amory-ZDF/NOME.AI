/**
 * NOME.AI - 页面: 学生档案详情
 */

Pages['student-profile'] = function() {
  const data = MockData.studentDetail;
  const percentOfTarget = (data.currentScore / data.targetScoreNum) * 100;
  const gaugePercent = data.stressIndex / 100;
  const gaugeCircum = 2 * Math.PI * 35;
  const _ = (k) => t('student_profile.' + k);
  const _c = (k) => t('common.' + k);

  return `
    <div class="topbar">
      <div class="topbar-left">
        <button class="icon-button" onclick="Router.navigate('students')">${Icons.arrowLeft}</button>
        <h1 class="page-title">${_('title')}</h1>
        <select class="input" style="width:auto;height:2rem;font-size:0.875rem">
          <option>${I18n.isZh() ? '李明 (高二A班)' : 'Li Ming (Class A)'}</option>
          <option>${I18n.isZh() ? '王雅静 (高二A班)' : 'Wang Yajing (Class A)'}</option>
          <option>${I18n.isZh() ? '赵子豪 (高二A班)' : 'Zhao Zihao (Class A)'}</option>
          <option>${I18n.isZh() ? '陈思雨 (高二B班)' : 'Chen Siyu (Class B)'}</option>
        </select>
      </div>
      <div class="topbar-right">
        ${App.renderLangToggle()}
        <span class="text-secondary" style="font-size:0.75rem">${_('last_update')}</span>
        <button class="icon-button">${Icons.bell}</button>
      </div>
    </div>

    <div class="page stagger" id="studentProfilePage">

      <div class="profile-header">
        <div class="profile-identity">
          <div class="avatar avatar-lg" style="background:var(--deep-teal);color:white;font-size:1.5rem">${data.avatar}</div>
          <div class="profile-name-block">
            <div class="profile-name">${data.name}</div>
            <div class="profile-badges">
              <span class="badge badge-subject">${data.grade}</span>
              <span class="badge badge-subject">${data.class}</span>
              <span class="badge badge-p1">${_('target_label')} ${data.targetScore}</span>
            </div>
          </div>
        </div>

        <div class="profile-score">
          <div class="profile-score-num">
            <span>${data.currentScore}<span style="font-size:0.75rem;color:var(--warm-stone)">%</span></span>
            <span class="text-secondary" style="font-size:0.875rem">/ ${data.targetScoreNum}%</span>
          </div>
          <div class="profile-score-target">${_c('target_label')}: ${data.targetScoreNum}% (${data.targetScoreNum - data.currentScore >= 0 ? '+' : ''}${data.targetScoreNum - data.currentScore}%)</div>
          <div class="progress" style="margin-top:0.5rem;height:0.5rem">
            <div class="progress-bar" style="width:${percentOfTarget}%"></div>
          </div>
        </div>

        <div class="profile-stress">
          <div class="gauge">
            <svg class="gauge-svg" viewBox="0 0 80 80">
              <circle class="gauge-bg" cx="40" cy="40" r="35"></circle>
              <circle class="gauge-fill" cx="40" cy="40" r="35" stroke-dasharray="${gaugeCircum}" stroke-dashoffset="${gaugeCircum * (1 - gaugePercent)}"></circle>
            </svg>
            <div class="gauge-text">
              <div class="gauge-value">${data.stressIndex}</div>
              <div class="gauge-label">${_('mental_load')}</div>
            </div>
          </div>
          <div style="text-align:center;font-size:0.75rem;color:var(--alert-amber);font-weight:500">${_('mental_load_high')}</div>
        </div>

        <div style="text-align:right">
          <span class="badge badge-p1" style="margin-bottom:0.5rem">${_('teaching_style')}</span>
          <div style="font-size:0.875rem;font-weight:500;color:var(--deep-ink);margin-top:0.25rem">${_('style_matched')}</div>
          <div class="text-secondary" style="font-size:0.75rem;margin-top:0.25rem">${_('auto_matched')}</div>
        </div>
      </div>

      <div class="two-col">

        <div class="stagger" style="display:flex;flex-direction:column;gap:1rem">

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.assignment} ${_('knowledge_graph')}</h2>
              <select class="input" style="width:auto;height:2rem;font-size:0.8125rem">
                <option>${_c('subject_alevel_math')}</option>
                <option>${_c('subject_ielts_reading')}</option>
              </select>
            </div>
            <div style="display:flex;justify-content:center;gap:0.75rem;margin-bottom:0.875rem;flex-wrap:wrap;font-size:0.6875rem;color:var(--warm-stone)">
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--success-green)"></span>${_('legend_mastery')}</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--deep-teal)"></span>${_('legend_stable')}</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--alert-amber)"></span>${_('legend_review')}</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--error-red)"></span>${_('legend_critical')}</span>
            </div>
            <div class="knowledge-graph">
              ${data.knowledgeGraph.map(k => `
                <div class="kg-node" onclick="Toast.show('${k.name} ${t('toast.knowledge_detail')} ${k.mastery}%', 'info', 1500)">
                  <div class="kg-letter ${k.level}">${k.code}</div>
                  <div class="kg-name">${k.name}</div>
                  <div class="kg-percent">${k.mastery}%</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card" style="padding:0;overflow:hidden">
            <div class="card-header" style="padding:1.5rem 1.5rem 0.5rem">
              <h2 class="card-title">${Icons.document} ${_('recent_work')}</h2>
            </div>
            <table class="data-table" style="margin-top:0.5rem">
              <thead>
                <tr>
                  <th>${_('col_work')}</th>
                  <th>${_('col_date')}</th>
                  <th class="right">${_('col_score')}</th>
                </tr>
              </thead>
              <tbody>
                ${data.recentWork.map(w => {
                  const typeMap = { '模考': I18n.isZh() ? '模考' : 'Mock', '作业': I18n.isZh() ? '作业' : 'HW', '测验': I18n.isZh() ? '测验' : 'Quiz' };
                  return `
                  <tr>
                    <td>
                      <div style="font-weight:500;color:var(--deep-ink)">${w.title}</div>
                      <div class="text-secondary" style="font-size:0.75rem;margin-top:0.125rem">${typeMap[w.type] || w.type}</div>
                    </td>
                    <td class="text-secondary mono" style="font-size:0.8125rem">${formatDate(w.date)}</td>
                    <td class="right">
                      <span class="mono" style="font-weight:600;color:${w.score >= 85 ? 'var(--success-green)' : w.score >= 60 ? 'var(--alert-amber)' : 'var(--error-red)'}">${w.score}<span class="text-secondary">/${w.max}</span></span>
                    </td>
                  </tr>
                `;}).join('')}
              </tbody>
            </table>
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.trending} ${_('insights')}</h2>
              <div class="tabs" style="border-bottom:none">
                <div class="tab active">${_('period_3d')}</div>
                <div class="tab">${_('period_7d')}</div>
                <div class="tab">${_('period_30d')}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
              <div>
                <div class="label-sm" style="margin-bottom:0.5rem">${_('accuracy_trend')}</div>
                <div style="display:flex;align-items:flex-end;gap:0.5rem;height:5rem">
                  <div style="flex:1;height:60%;background:var(--teal-tint);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:80%;background:var(--teal-tint-strong);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:50%;background:var(--teal-tint);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:90%;background:var(--deep-teal);border-radius:3px 3px 0 0"></div>
                  <div style="flex:1;height:100%;background:var(--deep-teal);border-radius:3px 3px 0 0"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.6875rem;color:var(--warm-stone);margin-top:0.25rem">
                  <span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>${_c('today')}</span>
                </div>
              </div>
              <div>
                <div class="label-sm" style="margin-bottom:0.5rem">${_('error_distribution')}</div>
                <div style="display:flex;flex-direction:column;gap:0.5rem">
                  ${Object.entries(data.feedback.errorDist).map(([k, v]) => {
                    if (v === 0) return '';
                    const labels = { knowledge: t('reports.error_knowledge'), method: t('reports.error_method'), calculation: t('reports.error_calc'), reading: t('reports.error_reading'), execution: I18n.isZh() ? '执行' : 'Execution' };
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
                <strong style="font-size:0.8125rem;color:var(--deep-teal)">${_('ai_insight')}</strong>
              </div>
              <p style="font-size:0.8125rem;line-height:1.6;color:var(--deep-ink)">
                ${data.feedback.alert}${I18n.isZh() ? '。建议通过"讲错题 → 训练柔弱基础"模块, 减少低级错误。' : '. Recommend using the "review errors → train weak foundations" module to reduce careless mistakes.'}
              </p>
            </div>
          </div>
        </div>

        <div class="stagger" style="display:flex;flex-direction:column;gap:1rem">

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${_('tags')}</h2>
              <a class="card-link" onclick="Toast.show('${t('toast.dev_in_progress')}', 'info')">${_c('edit')} →</a>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
              ${data.tags.map(tag => {
                const zhLabels = { '计算粗心': I18n.isZh() ? '计算粗心' : 'Careless Calc', '视觉学习者': I18n.isZh() ? '视觉学习者' : 'Visual Learner', '逻辑思维': I18n.isZh() ? '逻辑思维' : 'Logical Thinker', '主动提问': I18n.isZh() ? '主动提问' : 'Proactive' };
                return `
                <div class="tag-pill" style="background:${tag.category === 'learning_issue' ? 'var(--amber-tint)' : tag.category === 'positive' ? 'var(--green-tint)' : 'var(--teal-tint)'};color:${tag.category === 'learning_issue' ? 'var(--alert-amber)' : tag.category === 'positive' ? 'var(--success-green)' : 'var(--deep-teal)'}" title="${tag.evidence}">
                  ${zhLabels[tag.label] || tag.label}
                  <span class="tag-pill-confidence" style="color:${tag.category === 'learning_issue' ? 'var(--alert-amber)' : tag.category === 'positive' ? 'var(--success-green)' : 'var(--deep-teal)'}">${tag.confidence}%</span>
                </div>
              `;}).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${_('execution')}</h2>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
              <div class="text-secondary" style="font-size:0.8125rem">${_('task_completion')}</div>
              <div style="display:flex;align-items:baseline;gap:0.25rem">
                <span class="mono" style="font-size:1.5rem;font-weight:600;color:var(--deep-ink)">${data.execution.weeklyCompleted * 13}</span>
                <span class="text-secondary" style="font-size:0.875rem">%</span>
              </div>
            </div>
            <div class="text-secondary" style="font-size:0.75rem;margin-bottom:0.5rem">${data.execution.weeklyCompleted * 13}${_('completed_this_month')}</div>
            <div style="display:flex;align-items:flex-end;gap:0.25rem;height:4rem;margin-bottom:0.5rem">
              ${data.execution.last14Days.map((v, i) => {
                const h = Math.max(20, v * 25);
                const color = v < 2 ? 'var(--red-tint)' : 'var(--teal-tint-strong)';
                return `<div style="flex:1;height:${h}%;background:${color};border-radius:2px 2px 0 0"></div>`;
              }).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.6875rem;color:var(--warm-stone)">
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--teal-tint-strong)"></span>${_('completed')}</span>
              <span style="display:flex;align-items:center;gap:0.25rem"><span class="status-dot" style="background:var(--red-tint)"></span>${_('delayed')}</span>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.lightbulb} ${_('suggestions')}</h2>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.75rem">
              ${data.suggestions.map((s, i) => `
                <div style="padding:0.875rem;background:var(--teal-tint);border-radius:var(--r-md);border:1px solid var(--teal-tint-strong)">
                  <div style="font-size:0.8125rem;color:var(--deep-ink);line-height:1.5;margin-bottom:0.625rem">
                    <strong style="display:block;margin-bottom:0.25rem">${_('sugg_title_' + (i+1))}</strong>
                    ${_('sugg_detail_' + (i+1))}
                  </div>
                  <div style="display:flex;gap:0.5rem">
                    <button class="btn btn-primary btn-sm" style="flex:1" onclick="Toast.show('${t('toast.ai_suggestion_adopted')}', 'success', 1500)">${_c('adopt')}</button>
                    <button class="btn btn-ghost btn-sm" style="flex:1" onclick="Toast.show('${t('toast.ai_suggestion_ignored')}', 'info', 1500)">${_c('ignore')}</button>
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
  Toast.show(t('toast.student_loaded') + ' ' + studentId, 'info', 2000);
};
