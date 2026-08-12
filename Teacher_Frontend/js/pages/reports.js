/**
 * NOME.AI - 页面: 数据报告
 */

Pages.reports = async function() {
  const data = await API.getReports();
  const _ = (k) => t('reports.' + k);
  const _c = (k) => t('common.' + k);

  return `
    <div class="topbar">
      <div class="topbar-left">
        <div>
          <h1 class="page-title">${_('title')}</h1>
          <div class="page-subtitle">${_('subtitle')}</div>
        </div>
      </div>
      <div class="topbar-right">
        <div style="display:flex;background:var(--gray-100);border-radius:var(--r-md);padding:0.25rem;gap:0.125rem">
          <button class="btn btn-ghost btn-sm" style="background:transparent">${_('week')}</button>
          <button class="btn btn-sm" style="background:white;color:var(--deep-ink);box-shadow:var(--shadow-sm)">${_('month')}</button>
          <button class="btn btn-ghost btn-sm" style="background:transparent">${_('semester')}</button>
        </div>
        <button class="btn btn-secondary">${_c('export')}</button>
        ${App.renderLangToggle()}
        <button class="icon-button">${Icons.bell}</button>
      </div>
    </div>

    <div class="page stagger">

      <section class="page-section">
        <div class="three-col-asym">
          ${renderMetricCard(_('class_avg'), data.overview.classAvg.value + '%', data.overview.classAvg.change + '%', 'up')}
          ${renderMetricCard(_('completion_rate'), data.overview.completionRate.value + '%', _('stable'), 'stable')}
          ${renderMetricCard(_('attention_needed'), data.overview.attentionNeeded.value, _('students'), 'warning')}
          ${renderMetricCard(_('avg_study_time'), data.overview.avgStudyTime.value + 'h', t('common.unit_hours_per_day'), 'down')}
        </div>
      </section>

      <section class="page-section">
        <div class="two-col">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${_('score_trend')}</h2>
              <div style="display:flex;gap:0.875rem;font-size:0.75rem;color:var(--warm-stone)">
                <span style="display:flex;align-items:center;gap:0.375rem"><span class="status-dot status-dot-active"></span>${_('class_avg_label')}</span>
                <span style="display:flex;align-items:center;gap:0.375rem"><span class="status-dot" style="background:var(--gray-400)"></span>${_('individual')}</span>
              </div>
            </div>
            ${renderLineChart(data.scoreTrend)}
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${_('error_dist_change')}</h2>
              <button class="icon-button" style="width:1.5rem;height:1.5rem">${Icons.alertCircle}</button>
            </div>
            ${renderStackedAreaChart(data.errorDistribution)}
          </div>
        </div>
      </section>

      <section class="page-section">
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:1.25rem 1.5rem 0">
            <div class="tabs" style="border-bottom:1px solid var(--whisper-line)">
              <div class="tab" onclick="switchReportTab(this, 'improved')">${_('improved')}</div>
              <div class="tab active" onclick="switchReportTab(this, 'attention')">${_('attention_list')}</div>
            </div>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>${_('col_student')}</th>
                <th>${_('col_risk')}</th>
                <th>${_('col_focus')}</th>
                <th class="right">${_('col_duration')}</th>
                <th class="right">${_('col_action')}</th>
              </tr>
            </thead>
            <tbody>
              ${data.attentionStudents.map(s => renderAttentionRow(s)).join('')}
            </tbody>
          </table>
          <div style="padding:0.875rem 1.5rem;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--whisper-line);font-size:0.8125rem">
            <span class="text-secondary" style="font-style:italic">${_('showing_of')} 3 ${_('of_total')} 42 ${t('common.students_total')}</span>
            <a href="#" class="card-link" onclick="event.preventDefault();Toast.show('${I18n.isZh() ? '正在加载详细分析' : 'Loading detailed analysis'}', 'info')">${_('explore_more')} →</a>
          </div>
        </div>
      </section>
    </div>
  `;
};

function renderMetricCard(label, value, change, trend) {
  const _ = (k) => t('reports.' + k);
  const _c = (k) => t('common.' + k);
  const trendIcon = trend === 'up' ? '↗' : trend === 'down' ? '↘' : trend === 'warning' ? '⚠' : '—';
  const trendColor = trend === 'up' ? 'var(--success-green)' : trend === 'down' ? 'var(--warm-stone)' : trend === 'warning' ? 'var(--alert-amber)' : 'var(--warm-stone)';

  return `
    <div class="card">
      <div class="label-sm" style="margin-bottom:0.5rem">${label}</div>
      <div class="mono" style="font-size:1.875rem;font-weight:700;color:var(--deep-ink);line-height:1.1">${value}</div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;font-size:0.75rem;color:${trendColor}">
        <span style="font-weight:600">${trendIcon}</span>
        <span>${change}</span>
        <span class="text-secondary" style="font-weight:400">${_c('vs_last_month')}</span>
      </div>
      <div class="progress" style="margin-top:0.875rem">
        <div class="progress-bar ${trend === 'warning' ? 'progress-bar-warning' : trend === 'down' ? 'progress-bar-error' : ''}" style="width:${trend === 'warning' ? '60%' : '75%'}"></div>
      </div>
    </div>
  `;
}

function renderLineChart(data) {
  const max = 100, min = 60;
  const w = 100, h = 40;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  }).join(' ');

  return `
    <div style="position:relative;height:200px;padding:1rem 0">
      <svg viewBox="0 0 100 50" style="width:100%;height:100%" preserveAspectRatio="none">
        <line x1="0" y1="0" x2="100" y2="0" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="15" x2="100" y2="15" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="45" x2="100" y2="45" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <polyline points="${points}" fill="none" stroke="#0D9488" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        ${data.map((v, i) => {
          const x = (i / (data.length - 1)) * w;
          const y = h - ((v - min) / (max - min)) * h;
          return `<circle cx="${x}" cy="${y}" r="0.4" fill="#0D9488" vector-effect="non-scaling-stroke" />`;
        }).join('')}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:0.6875rem;color:var(--warm-stone);margin-top:0.25rem;font-family:var(--font-mono)">
        <span>${I18n.isZh() ? '第1天' : 'Day 1'}</span><span>${I18n.isZh() ? '第10天' : 'Day 10'}</span><span>${I18n.isZh() ? '第20天' : 'Day 20'}</span><span>${I18n.isZh() ? '第30天' : 'Day 30'}</span>
      </div>
    </div>
  `;
}

function renderStackedAreaChart(data) {
  const _ = (k) => t('reports.' + k);
  const colors = {
    knowledge: 'rgba(13, 148, 136, 0.7)',
    method: 'rgba(14, 165, 233, 0.7)',
    calculation: 'rgba(217, 119, 6, 0.7)',
    reading: 'rgba(120, 113, 108, 0.7)',
  };

  return `
    <div style="position:relative;height:200px;padding:1rem 0">
      <svg viewBox="0 0 100 50" style="width:100%;height:100%" preserveAspectRatio="none">
        ${['knowledge', 'method', 'calculation', 'reading'].map((key, idx) => {
          const arr = data[key];
          const h = 45;
          const points = arr.map((v, i) => {
            const sumBefore = ['knowledge', 'method', 'calculation', 'reading'].slice(0, idx).reduce((s, k) => s + data[k][i], 0);
            const sumWith = sumBefore + v;
            const x = (i / (arr.length - 1)) * 100;
            const y2 = h - (sumWith / 100) * h;
            return `${x},${y2}`;
          });
          const pointsBottom = arr.map((v, i) => {
            const sumBefore = ['knowledge', 'method', 'calculation', 'reading'].slice(0, idx).reduce((s, k) => s + data[k][i], 0);
            const x = (i / (arr.length - 1)) * 100;
            const y1 = h - (sumBefore / 100) * h;
            return `${x},${y1}`;
          });
          const allPoints = points.concat(pointsBottom.reverse()).join(' ');
          return `<polygon points="${allPoints}" fill="${colors[key]}" />`;
        }).join('')}
      </svg>
      <div style="display:flex;justify-content:space-around;font-size:0.6875rem;color:var(--warm-stone);margin-top:0.25rem">
        ${data.labels.map(l => `<span>${l}</span>`).join('')}
      </div>
      <div style="display:flex;justify-content:center;gap:0.875rem;margin-top:0.75rem;font-size:0.6875rem;color:var(--warm-stone);flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.knowledge};border-radius:2px"></span>${_('error_knowledge')}</span>
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.method};border-radius:2px"></span>${_('error_method')}</span>
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.calculation};border-radius:2px"></span>${_('error_calc')}</span>
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.reading};border-radius:2px"></span>${_('error_reading')}</span>
      </div>
    </div>
  `;
}

function renderAttentionRow(s) {
  const _ = (k) => t('reports.' + k);
  const colorMap = {
    error: 'var(--error-red)',
    warning: 'var(--alert-amber)',
    success: 'var(--success-green)',
  };
  const levelMap = {
    'High (P0)': 'error',
    'Medium (P1)': 'warning',
    'Low (P2)': 'success',
  };
  const levelClass = levelMap[s.level] || 'warning';
  const riskLabels = {
    'Logic Gap': t('reports.risk_logic_gap'),
    'Calculation Fluency': t('reports.risk_calc_fluency'),
    'Attention Drift': t('reports.risk_attention_drift'),
  };
  const riskLabel = riskLabels[s.risk] || s.risk;

  return `
    <tr onclick="Router.navigate('student-profile')">
      <td>
        <div style="display:flex;align-items:center;gap:0.625rem">
          <div class="avatar avatar-sm" style="background:var(--gray-200)">${s.initials}</div>
          <div>
            <div style="font-weight:500;color:var(--deep-ink)">${s.name}</div>
            <div class="text-secondary" style="font-size:0.75rem">${I18n.isZh() ? '学生档案' : 'Student Profile'}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="badge" style="background:${levelClass === 'error' ? 'var(--red-tint)' : levelClass === 'warning' ? 'var(--amber-tint)' : 'var(--green-tint)'};color:${colorMap[levelClass]}">${riskLabel}</span>
      </td>
      <td><span style="color:${colorMap[levelClass]};font-weight:500">${s.level}</span></td>
      <td class="right mono" style="font-size:0.875rem">${s.avg}<span class="text-secondary" style="font-size:0.75rem">${t('common.unit_m_per_day')}</span></td>
      <td class="right">
        <a href="#student-profile" class="card-link" onclick="event.stopPropagation()">${t('common.view_path')} →</a>
      </td>
    </tr>
  `;
}

function switchReportTab(el, type) {
  el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  Toast.show(`${t('toast.filter_applied')} ${type === 'improved' ? t('reports.improved') : t('reports.attention_list')}`, 'info', 1500);
}
