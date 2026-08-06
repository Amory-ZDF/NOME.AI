/**
 * NOME.AI - 页面: 学生列表
 */

Pages.students = function() {
  const data = MockData.students;
  const _ = (k) => t('students.' + k);
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
        <input class="input input-search" style="width:14rem" placeholder="${_('search_placeholder')}" />
        <button class="btn btn-secondary">${_c('filter')}</button>
        <button class="btn btn-secondary">${_('sort_by_risk')}</button>
        ${App.renderLangToggle()}
        <button class="icon-button">${Icons.bell}</button>
      </div>
    </div>

    <div class="page">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
        <span class="text-secondary" style="font-size:0.8125rem">${_('quick_filters')}</span>
        <button class="chip chip-error" onclick="filterByRisk('risk')">${_('needs_attention')} <span class="mono">(2)</span></button>
        <button class="chip chip-warning" onclick="filterByRisk('attention')">${_('attention')} <span class="mono">(2)</span></button>
        <button class="chip" onclick="filterByClass('')">${_('all_students')}</button>
        <button class="chip" onclick="filterByClass('高二(1)班')">高二(1)班</button>
        <button class="chip" onclick="filterByClass('高二(2)班')">高二(2)班</button>
      </div>

      <div class="student-grid stagger" style="display:grid;grid-template-columns:repeat(2, 1fr);gap:1rem">
        ${data.map(s => renderStudentCard(s)).join('')}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1.5rem;padding:0 0.5rem">
        <span class="text-secondary" style="font-size:0.8125rem">${I18n.isZh() ? '显示 1-' + data.length + ' ' + _('showing') + data.length + _('students_total') : 'Showing 1-' + data.length + ' ' + _('of_total') + ' ' + data.length + ' ' + _('students_total')}</span>
        <div style="display:flex;gap:0.25rem">
          <button class="icon-button" disabled style="opacity:0.4">${Icons.chevronLeft}</button>
          <button class="btn btn-primary btn-sm" style="width:2.25rem;height:2.25rem;padding:0">1</button>
          <button class="btn btn-ghost btn-sm" style="width:2.25rem;height:2.25rem;padding:0">2</button>
          <button class="btn btn-ghost btn-sm" style="width:2.25rem;height:2.25rem;padding:0">3</button>
          <span style="padding:0 0.5rem;color:var(--warm-stone)">...</span>
          <button class="icon-button">${Icons.chevronRight}</button>
        </div>
      </div>
    </div>

    <style>
      @media (max-width: 768px) {
        .student-grid { grid-template-columns: 1fr !important; }
      }
    </style>
  `;
};

function renderStudentCard(s) {
  const _ = (k) => t('students.' + k);
  const _c = (k) => t('common.' + k);
  const progress = (s.score / s.target) * 100;
  const statusConfig = {
    risk: { label: _c('risk_high'), color: 'var(--error-red)', bg: 'var(--red-tint)' },
    attention: { label: _c('risk_medium'), color: 'var(--alert-amber)', bg: 'var(--amber-tint)' },
    normal: { label: _c('status_good'), color: 'var(--success-green)', bg: 'var(--green-tint)' },
    excellent: { label: _c('status_excellent'), color: 'var(--success-green)', bg: 'var(--green-tint)' },
  };
  const st = statusConfig[s.status];

  return `
    <div class="card card-interactive" onclick="openStudentProfile('${s.id}')">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.875rem">
        <div style="display:flex;align-items:center;gap:0.75rem">
          <div class="avatar avatar-lg" style="background:${st.bg};color:${st.color}">${s.avatar}</div>
          <div>
            <div style="font-size:1rem;font-weight:600;color:var(--deep-ink)">${s.name}</div>
            <div class="text-secondary" style="font-size:0.75rem;margin-top:0.125rem">${_c('student_id')}: 20230${s.id.padStart(4, '0')} · ${_c('class_label')}: ${s.class}</div>
          </div>
        </div>
        <div style="text-align:right">
          <span class="badge" style="background:${st.bg};color:${st.color}">${st.label}</span>
          <div class="mono" style="font-size:1.5rem;font-weight:700;color:${st.color};margin-top:0.5rem;line-height:1">${s.score}<span style="font-size:0.875rem;color:var(--warm-stone);font-weight:400">%</span></div>
          <div class="label-sm" style="margin-top:0.25rem">${_c('avg_score')}</div>
        </div>
      </div>

      <div style="display:flex;gap:0.375rem;flex-wrap:wrap;margin-bottom:0.875rem">
        ${s.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}
      </div>

      <div style="margin-bottom:0.875rem">
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.75rem;color:var(--warm-stone);margin-bottom:0.375rem">
          <span>${_('learning_progress')}</span>
          <span class="mono">${Math.floor(s.score * 0.3)}/${28} ${_('lessons_completed')}</span>
        </div>
        <div class="progress" style="height:0.5rem">
          <div class="progress-bar ${progress < 50 ? 'progress-bar-error' : progress < 75 ? 'progress-bar-warning' : 'progress-bar-success'}" style="width:${Math.min(progress, 100)}%"></div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:0.875rem;border-top:1px solid var(--whisper-line)">
        <span class="text-secondary" style="font-size:0.75rem;display:flex;align-items:center;gap:0.375rem">
          <span style="width:0.875rem;height:0.875rem">${Icons.clock}</span>
          ${_c('last_active')}: ${getRelativeTime(s.lastActive)}
        </span>
        <span style="color:var(--deep-teal);font-size:0.8125rem;font-weight:500">${_c('view_profile')} →</span>
      </div>
    </div>
  `;
}

function filterByRisk(level) {
  Toast.show(`${t('toast.filter_class')} ${level === 'risk' ? (I18n.isZh() ? '高风险' : 'High Risk') : (I18n.isZh() ? '关注中' : 'Watching')}`, 'info', 1500);
}

function filterByClass(className) {
  Toast.show(`${t('toast.filter_class')} ${className || (I18n.isZh() ? '全部' : 'All')}`, 'info', 1500);
}

window.openStudentProfile = function(studentId) {
  Router.navigate('student-profile');
  setTimeout(() => {
    if (typeof window.loadStudentDetail === 'function') {
      window.loadStudentDetail(studentId);
    }
  }, 100);
};
