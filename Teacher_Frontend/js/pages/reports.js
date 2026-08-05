/**
 * NOME.AI - 页面: 数据报告
 */

Pages.reports = function() {
  const data = MockData.reports;
  return `
    <div class="topbar">
      <div class="topbar-left">
        <div>
          <h1 class="page-title">数据报告</h1>
          <div class="page-subtitle">分析班级整体学情与学生个体差异</div>
        </div>
      </div>
      <div class="topbar-right">
        <div style="display:flex;background:var(--gray-100);border-radius:var(--r-md);padding:0.25rem;gap:0.125rem">
          <button class="btn btn-ghost btn-sm" style="background:transparent">Week</button>
          <button class="btn btn-sm" style="background:white;color:var(--deep-ink);box-shadow:var(--shadow-sm)">Month</button>
          <button class="btn btn-ghost btn-sm" style="background:transparent">Semester</button>
        </div>
        <button class="btn btn-secondary">${Icons.download} Export</button>
        <button class="icon-button">${Icons.bell}</button>
        <button class="icon-button">${Icons.settings}</button>
      </div>
    </div>

    <div class="page stagger">

      <!-- 班级概览 -->
      <section class="page-section">
        <div class="three-col-asym">
          ${renderMetricCard('班级平均分 CLASS AVG', data.overview.classAvg.value + '%', data.overview.classAvg.change + '%', 'up')}
          ${renderMetricCard('作业完成率 COMPLETION RATE', data.overview.completionRate.value + '%', 'Stable', 'stable')}
          ${renderMetricCard('需关注学生 ATTENTION NEEDED', data.overview.attentionNeeded.value, 'Students', 'warning')}
          ${renderMetricCard('平均学习时长 AVG STUDY TIME', data.overview.avgStudyTime.value + 'h', 'Daily', 'down', data.overview.avgStudyTime.change)}
        </div>
      </section>

      <!-- 趋势图 -->
      <section class="page-section">
        <div class="two-col">
          <!-- 成绩趋势 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">成绩趋势 Score Trend</h2>
              <div style="display:flex;gap:0.875rem;font-size:0.75rem;color:var(--warm-stone)">
                <span style="display:flex;align-items:center;gap:0.375rem"><span class="status-dot status-dot-active"></span>Class Avg</span>
                <span style="display:flex;align-items:center;gap:0.375rem"><span class="status-dot" style="background:var(--gray-400)"></span>Individual</span>
              </div>
            </div>
            ${renderLineChart(data.scoreTrend)}
          </div>

          <!-- 错因分布变化 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">错因分布变化</h2>
              <button class="icon-button" style="width:1.5rem;height:1.5rem">${Icons.alertCircle}</button>
            </div>
            ${renderStackedAreaChart(data.errorDistribution)}
          </div>
        </div>
      </section>

      <!-- 学生排行/关注 -->
      <section class="page-section">
        <div class="card" style="padding:0;overflow:hidden">
          <div style="padding:1.25rem 1.5rem 0">
            <div class="tabs" style="border-bottom:1px solid var(--whisper-line)">
              <div class="tab" onclick="switchReportTab(this, 'improved')">进步最大</div>
              <div class="tab active" onclick="switchReportTab(this, 'attention')">需要关注</div>
            </div>
          </div>
          <table class="data-table">
            <thead>
              <tr>
                <th>STUDENT</th>
                <th>RISK FACTOR</th>
                <th>FOCUS LEVEL</th>
                <th class="right">AVG DURATION</th>
                <th class="right">ACTION</th>
              </tr>
            </thead>
            <tbody>
              ${data.attentionStudents.map(s => renderAttentionRow(s)).join('')}
            </tbody>
          </table>
          <div style="padding:0.875rem 1.5rem;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--whisper-line);font-size:0.8125rem">
            <span class="text-secondary" style="font-style:italic">Showing 3 of 42 students</span>
            <a href="#" class="card-link" onclick="event.preventDefault();Toast.show('正在加载详细分析', 'info')">Explore more detailed analysis →</a>
          </div>
        </div>
      </section>
    </div>
  `;
};

function renderMetricCard(label, value, change, trend, rawChange) {
  const trendIcon = trend === 'up' ? '↗' : trend === 'down' ? '↘' : trend === 'warning' ? '⚠' : '—';
  const trendColor = trend === 'up' ? 'var(--success-green)' : trend === 'down' ? 'var(--warm-stone)' : trend === 'warning' ? 'var(--alert-amber)' : 'var(--warm-stone)';

  return `
    <div class="card">
      <div class="label-sm" style="margin-bottom:0.5rem">${label}</div>
      <div class="mono" style="font-size:1.875rem;font-weight:700;color:var(--deep-ink);line-height:1.1">${value}</div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;font-size:0.75rem;color:${trendColor}">
        <span style="font-weight:600">${trendIcon}</span>
        <span>${change}</span>
        <span class="text-secondary" style="font-weight:400">vs 上月</span>
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
        <!-- 网格线 -->
        <line x1="0" y1="0" x2="100" y2="0" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="15" x2="100" y2="15" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="30" x2="100" y2="30" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="45" x2="100" y2="45" stroke="rgba(231,229,228,0.4)" stroke-width="0.1" vector-effect="non-scaling-stroke" />
        <!-- 主线 -->
        <polyline points="${points}" fill="none" stroke="#0D9488" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <!-- 数据点 -->
        ${data.map((v, i) => {
          const x = (i / (data.length - 1)) * w;
          const y = h - ((v - min) / (max - min)) * h;
          return `<circle cx="${x}" cy="${y}" r="0.4" fill="#0D9488" vector-effect="non-scaling-stroke" />`;
        }).join('')}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:0.6875rem;color:var(--warm-stone);margin-top:0.25rem;font-family:var(--font-mono)">
        <span>第1天</span><span>第10天</span><span>第20天</span><span>第30天</span>
      </div>
    </div>
  `;
}

function renderStackedAreaChart(data) {
  const { labels, knowledge, method, calculation, reading } = data;
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
            const y1 = h - (sumBefore / 100) * h;
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
        ${labels.map(l => `<span>${l}</span>`).join('')}
      </div>
      <div style="display:flex;justify-content:center;gap:0.875rem;margin-top:0.75rem;font-size:0.6875rem;color:var(--warm-stone);flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.knowledge};border-radius:2px"></span>Knowledge</span>
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.method};border-radius:2px"></span>Method</span>
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.calculation};border-radius:2px"></span>Calc</span>
        <span style="display:flex;align-items:center;gap:0.25rem"><span style="width:8px;height:8px;background:${colors.reading};border-radius:2px"></span>Logic</span>
      </div>
    </div>
  `;
}

function renderAttentionRow(s) {
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

  return `
    <tr onclick="Router.navigate('student-profile')">
      <td>
        <div style="display:flex;align-items:center;gap:0.625rem">
          <div class="avatar avatar-sm" style="background:var(--gray-200)">${s.initials}</div>
          <div>
            <div style="font-weight:500;color:var(--deep-ink)">${s.name}</div>
            <div class="text-secondary" style="font-size:0.75rem">学生档案</div>
          </div>
        </div>
      </td>
      <td>
        <span class="badge" style="background:${levelClass === 'error' ? 'var(--red-tint)' : levelClass === 'warning' ? 'var(--amber-tint)' : 'var(--green-tint)'};color:${colorMap[levelClass]}">${s.risk}</span>
      </td>
      <td><span style="color:${colorMap[levelClass]};font-weight:500">${s.level}</span></td>
      <td class="right mono" style="font-size:0.875rem">${s.avg}<span class="text-secondary" style="font-size:0.75rem">m/day</span></td>
      <td class="right">
        <a href="#student-profile" class="card-link" onclick="event.stopPropagation()">View Path →</a>
      </td>
    </tr>
  `;
}

function switchReportTab(el, type) {
  el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  Toast.show(`已切换到: ${type === 'improved' ? '进步最大' : '需要关注'}`, 'info', 1500);
}
