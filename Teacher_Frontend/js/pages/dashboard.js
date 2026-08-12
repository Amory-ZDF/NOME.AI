/**
 * NOME.AI - 页面: 教学工作台
 */

Pages = window.Pages || {};

Pages.dashboard = async function() {
  const data = await API.getDashboard();
  API._dashboardCache = data; // cache for openCourseDetail
  const today = new Date();
  const weekDays = generateMiniWeek(today);
  const _ = (k) => t('dashboard.' + k);
  const _c = (k) => t('common.' + k);

  return `
    <div class="topbar">
      <div class="topbar-left">
        <div>
          <div class="page-title">${_('title')}</div>
          <div class="page-subtitle">${formatDate(today)} ${dayName(today)}</div>
        </div>
      </div>
      <div class="topbar-right">
        <button class="btn btn-secondary">
          ${Icons.filter} ${_c('all_classes')}
          <span style="width:0.875rem;height:0.875rem;margin-left:0.25rem">${Icons.chevronRight}</span>
        </button>
        <button class="icon-button" title="${_c('nav_settings')}">${Icons.bell}<span class="dot"></span></button>
        ${App.renderLangToggle()}
        <button class="icon-button" title="${_c('nav_settings')}">${Icons.settings}</button>
      </div>
    </div>

    <div class="page stagger">

      <!-- 待处理事件 -->
      <section class="page-section">
        <div class="card-header" style="margin-bottom: 1rem">
          <h2 class="card-title">${Icons.alertCircle} ${_('pending_events')}</h2>
          <a href="#assignments" class="card-link">${_c('view_all')} →</a>
        </div>
        <div class="pending-grid">
          ${renderPendingCard('amber', Icons.document, _('pending_ugrading'), data.pending.ungraded.count, _c('unit_count'), data.pending.ungraded.latest)}
          ${renderPendingCard('red', Icons.alert, _('pending_stress'), data.pending.stressAlerts.count, _c('unit_person'), data.pending.stressAlerts.students.join('、'))}
          ${renderPendingCard('amber', Icons.clock, _('pending_stagnant'), data.pending.stagnant.count, _c('unit_person'), data.pending.stagnant.students.join('、'))}
          ${renderPendingCard('blue', Icons.alertCircle, _('pending_abnormal'), data.pending.abnormal.count, _c('unit_count'), data.pending.abnormal.details)}
        </div>
      </section>

      <!-- 今日课程 -->
      <section class="page-section">
        <div class="card" style="cursor:pointer" onclick="Router.navigate('calendar')">
          <div class="card-header">
            <h2 class="card-title">${Icons.calendar} ${_('courses_today')}</h2>
            <div style="display:flex;align-items:center;gap:0.75rem">
              <span class="text-secondary" style="font-size:0.875rem">${data.weekSummary.todayCount} ${_('courses_week_total')} · ${_('courses_week')} ${data.weekSummary.total} ${_('courses_week_total')}</span>
              <a href="#calendar" class="card-link" onclick="event.stopPropagation()">${_c('view_calendar')} →</a>
            </div>
          </div>

          <div class="mini-calendar" style="margin-bottom: 1.25rem; padding: 0 0.5rem;">
            ${weekDays.map(d => `
              <div class="mini-day ${d.isToday ? 'today' : ''}">
                <div class="mini-day-name">${d.dayName}</div>
                <div class="mini-day-num">${d.date}</div>
                <div class="mini-day-dots">
                  ${d.courseCount > 0 ? `<div class="mini-day-dot"></div>` : ''}
                  ${d.courseCount > 1 ? `<div class="mini-day-dot"></div>` : ''}
                  ${d.courseCount > 2 ? `<div class="mini-day-dot"></div>` : ''}
                  ${d.courseCount > 3 ? `<span style="font-size:0.625rem;color:var(--deep-teal);margin-left:2px">+${d.courseCount - 3}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>

          <div class="course-list">
            ${data.courses.map(c => {
              const subjKey = c.subject === 'alevel_math' ? 'common.subject_alevel_math' : c.subject === 'ielts' ? 'common.subject_ielts_reading' : 'common.subject_math';
              return `
              <div class="course-row" onclick="openCourseDetail('${c.id}')">
                <div class="course-time">${c.time}</div>
                <div class="course-info">
                  <div class="course-name">${c.student || c.class}</div>
                  <div class="course-meta">${c.type}</div>
                </div>
                <span class="badge ${c.subject === 'alevel_math' ? 'badge-info' : 'badge-neutral'}">${t(subjKey)}</span>
                <div style="display:flex;align-items:center;gap:0.5rem;color:var(--warm-stone)">
                  <span class="status-dot status-dot-active"></span>
                  <span style="font-size:0.75rem">${c.time} - ${c.endTime}</span>
                </div>
                <span style="color:var(--warm-stone);width:1rem;height:1rem">${Icons.chevronRight}</span>
              </div>
            `;}).join('')}
          </div>
        </div>
      </section>

      <!-- 待批改 + 学生预警 -->
      <section class="page-section">
        <div class="two-col">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.document} ${_('assignments')}</h2>
              <div style="display:flex;align-items:center;gap:0.5rem">
                <span class="text-secondary" style="font-size:0.875rem">${_('assignments_pending')} ${data.assignments.length} ${_c('unit_count')}</span>
                <a href="#assignments" class="card-link">${_c('enter_assignments')} →</a>
              </div>
            </div>
            <div>
              ${data.assignments.map(a => `
                <div class="list-row" onclick="openGrading('${a.id}')">
                  <div class="avatar avatar-sm" style="background:var(--gray-200)">${a.student[0]}</div>
                  <div class="list-row-content">
                    <div class="list-row-title">${a.student} · ${a.title}</div>
                    <div class="list-row-meta">${a.subject} · ${getRelativeTime(a.submittedAt)}</div>
                  </div>
                  <span class="badge ${a.waitingDays > 2 ? 'badge-warning' : 'badge-neutral'}">${a.waitingDays > 0 ? `${_c('waiting')} ${a.waitingDays} ${_c('unit_day')}` : _c('submitted_today')}</span>
                  <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();Toast.show('${t('toast.opening_grading')}', 'info')">${_c('grade')}</button>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.alert} ${_('student_alerts')}</h2>
              <a href="#students" class="card-link">${_c('view_all_students')} →</a>
            </div>
            <div>
              ${data.alerts.map(al => `
                <div class="alert-item" onclick="Router.navigate('students');setTimeout(()=>openStudentProfile('${al.studentId}'), 100)">
                  <div class="alert-bar ${al.severity === 'red' ? 'error' : al.severity === 'amber' ? 'warning' : 'success'}"></div>
                  <div class="alert-content">
                    <div class="alert-title">${al.student}</div>
                    <div class="alert-desc">${al.message}</div>
                  </div>
                  <div class="alert-time">${getRelativeTime(al.timestamp)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </section>

    </div>
  `;
};

Pages.dashboard_init = function() {};

function renderPendingCard(iconType, icon, label, count, unit, hint) {
  const _c = (k) => t('common.' + k);
  return `
    <div class="pending-card" onclick="handlePendingClick('${label}')">
      <div class="pending-icon ${iconType}">${icon}</div>
      <div class="pending-label">
        <span>${label}</span>
        <span class="badge badge-p0">P1</span>
      </div>
      <div class="pending-count">${count}<span class="pending-unit"> ${unit}</span></div>
      <div class="text-secondary" style="font-size:0.75rem;margin-top:0.5rem">${_c('latest')}: ${hint}</div>
    </div>
  `;
}

function generateMiniWeek(today) {
  const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const days = [];
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      date: d.getDate(),
      dayName: t('calendar.days.' + dayKeys[i]),
      isToday: d.toDateString() === today.toDateString(),
      courseCount: i === 0 ? 3 : (i < 5 ? Math.floor(Math.random() * 3) + 1 : 0),
    });
  }
  return days;
}

function handlePendingClick(label) {
  const _c = (k) => t('common.' + k);
  if (label.includes('待批改') || label.includes('Ungraded') || label.includes('Abnormal') || label.includes('异常')) {
    Router.navigate('assignments');
  } else if (label.includes('学生') || label.includes('Student')) {
    Router.navigate('students');
  } else {
    Toast.show(`${_c('view_detail')}: ${label}`, 'info');
  }
}

function openCourseDetail(courseId) {
  const course = (API._dashboardCache ? API._dashboardCache.courses : MockData.dashboard.courses).find(c => c.id === courseId);
  if (!course) return;
  const _ = (k) => t('calendar.' + k);

  SlidePanel.open(`
    <div class="card-header" style="margin-bottom: 1rem">
      <span class="badge badge-info">${_('about_to_start')}</span>
      <span class="text-secondary" style="font-size:0.8125rem">${course.time} - ${course.endTime}</span>
    </div>
    <h3 class="headline-md" style="margin-bottom: 1rem">${course.type}</h3>

    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;padding:0.75rem;background:var(--gray-50);border-radius:var(--r-md)">
      <div class="avatar avatar-md">${course.student ? course.student[0] : '班'}</div>
      <div>
        <div style="font-size:0.875rem;font-weight:500">${course.student || course.class}</div>
        <div class="text-secondary" style="font-size:0.75rem">${_('last_session')}: 3 ${t('common.unit_day')}${I18n.isZh() ? '前' : ' ago'} · ${_('completion_rate')} 87%</div>
      </div>
    </div>

    <div class="tabs" style="margin-bottom:1.5rem">
      <div class="tab active">${_('lesson_plan')}</div>
      <div class="tab">${_('homework')}</div>
      <div class="tab">${_('history')}</div>
    </div>

    <div class="stagger">
      <div class="card" style="margin-bottom:0.75rem;padding:1rem">
        <div class="label-sm" style="margin-bottom:0.5rem">${_('review')}</div>
        <ul style="font-size:0.875rem;line-height:1.8;color:var(--deep-ink);list-style:disc;padding-left:1.25rem">
          <li>${I18n.isZh() ? '复习了复数的极坐标表示 (Polar Form) 及 De Moivre 定理' : 'Reviewed polar form of complex numbers and De Moivre\'s Theorem'}</li>
          <li>${I18n.isZh() ? '应用 De Moivre 定理解决三角恒等式展开问题' : 'Applied De Moivre\'s Theorem to expand trigonometric identities'}</li>
        </ul>
      </div>

      <div class="card" style="margin-bottom:0.75rem;padding:1rem">
        <div class="label-sm" style="margin-bottom:0.5rem">${_('outline')}</div>
        <ul style="font-size:0.875rem;line-height:1.8;color:var(--deep-ink);list-style:decimal;padding-left:1.25rem">
          <li><strong>${I18n.isZh() ? '求导技巧' : 'Differentiation techniques'}</strong> - ${I18n.isZh() ? '掌握常用函数的求导法则, 包括乘法法则和除法法则' : 'Master derivation rules including product and quotient rules'}</li>
          <li><strong>${I18n.isZh() ? '隐函数求导' : 'Implicit differentiation'}</strong> - ${I18n.isZh() ? '学习对隐函数进行求导, 并应用于切线方程求解' : 'Differentiate implicit functions and apply to tangent equations'}</li>
          <li><strong>${I18n.isZh() ? '参数方程求导' : 'Parametric differentiation'}</strong> - ${I18n.isZh() ? '处理参数方程的求导问题及相关几何应用' : 'Handle parametric differentiation and geometric applications'}</li>
        </ul>
      </div>

      <div class="card" style="margin-bottom:0.75rem;padding:1rem">
        <div class="label-sm" style="margin-bottom:0.5rem">${_('pacing')}</div>
        <div style="display:flex;align-items:flex-end;gap:0.5rem;height:3.5rem;margin-top:0.5rem">
          ${t('calendar.phases').map((p, i) => {
            const heights = [30, 60, 100, 80, 50, 25];
            const colors = ['var(--gray-200)', 'var(--teal-tint-strong)', 'var(--deep-teal)', 'var(--teal-tint-strong)', 'var(--teal-tint)', 'var(--gray-200)'];
            return `<div style="flex:1;height:${heights[i]}%;background:${colors[i]};border-radius:4px 4px 0 0"></div>`;
          }).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.625rem;color:var(--warm-stone);margin-top:0.5rem">
          ${t('calendar.phases').map(p => `<span>${p}</span>`).join('')}
        </div>
      </div>

      <div class="card" style="padding:1rem;background:var(--teal-tint);border-color:var(--deep-teal)">
        <div class="label-sm" style="margin-bottom:0.5rem">${_('mastered_content')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          <span class="badge badge-success">✓ ${I18n.isZh() ? '基础求导' : 'Basic Diff'}</span>
          <span class="badge badge-success">✓ ${I18n.isZh() ? '链式法则' : 'Chain Rule'}</span>
          <span class="badge badge-success">✓ ${I18n.isZh() ? '多项式函数' : 'Polynomials'}</span>
        </div>
      </div>
    </div>
  `, {
    title: _('lesson_plan'),
    subtitle: _('lesson_plan_sub'),
  });
}

function openGrading(assignmentId) {
  Router.navigate('assignments');
  setTimeout(() => {
    if (typeof window.openGradingModal === 'function') {
      window.openGradingModal(assignmentId);
    }
  }, 200);
}

function openStudentProfile(studentId) {
  if (typeof window.openStudentProfile === 'function') {
    window.openStudentProfile(studentId);
  }
}
