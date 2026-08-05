/**
 * NOME.AI - 页面: 教学工作台
 */

Pages = window.Pages || {};

Pages.dashboard = function() {
  const data = MockData.dashboard;
  const today = new Date();
  const weekDays = generateMiniWeek(today);

  return `
    <div class="topbar">
      <div class="topbar-left">
        <div>
          <div class="page-title">教学工作台</div>
          <div class="page-subtitle">${formatDate(today)} ${dayName(today)}</div>
        </div>
      </div>
      <div class="topbar-right">
        <button class="btn btn-secondary">
          <span style="width:1rem;height:1rem">${Icons.filter}</span>
          全部班级
          <span style="width:0.875rem;height:0.875rem;margin-left:0.25rem">${Icons.chevronRight}</span>
        </button>
        <button class="icon-button" title="通知">
          ${Icons.bell}
          <span class="dot"></span>
        </button>
        <button class="icon-button" title="设置">${Icons.settings}</button>
      </div>
    </div>

    <div class="page stagger">

      <!-- 待处理事件 -->
      <section class="page-section">
        <div class="card-header" style="margin-bottom: 1rem">
          <h2 class="card-title">${Icons.alertCircle} 待处理事件</h2>
          <a href="#assignments" class="card-link">查看全部 →</a>
        </div>
        <div class="pending-grid">
          ${renderPendingCard('amber', Icons.document, '待批改作业', data.pending.ungraded.count, '份', data.pending.ungraded.latest)}
          ${renderPendingCard('red', Icons.alert, '压力风险学生', data.pending.stressAlerts.count, '人', data.pending.stressAlerts.students.join('、'))}
          ${renderPendingCard('amber', Icons.clock, '长期停滞学生', data.pending.stagnant.count, '人', data.pending.stagnant.students.join('、'))}
          ${renderPendingCard('blue', Icons.alertCircle, '异常作业', data.pending.abnormal.count, '份', data.pending.abnormal.details)}
        </div>
      </section>

      <!-- 今日课程 -->
      <section class="page-section">
        <div class="card" style="cursor:pointer" onclick="Router.navigate('calendar')">
          <div class="card-header">
            <h2 class="card-title">${Icons.calendar} 今日课程</h2>
            <div style="display:flex;align-items:center;gap:0.75rem">
              <span class="text-secondary" style="font-size:0.875rem">${data.weekSummary.todayCount} 节 · 本周 ${data.weekSummary.total} 节</span>
              <a href="#calendar" class="card-link" onclick="event.stopPropagation()">查看完整日历 →</a>
            </div>
          </div>

          <!-- 迷你日历 -->
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

          <!-- 课程列表 -->
          <div class="course-list">
            ${data.courses.map(c => `
              <div class="course-row" onclick="openCourseDetail('${c.id}')">
                <div class="course-time">${c.time}</div>
                <div class="course-info">
                  <div class="course-name">${c.student || c.class}</div>
                  <div class="course-meta">${c.type}</div>
                </div>
                <span class="badge ${c.subject === 'alevel_math' ? 'badge-info' : 'badge-neutral'}">${c.subject === 'alevel_math' ? 'A-Level 数学' : c.subject === 'ielts' ? 'IELTS' : c.type.split(' ')[0]}</span>
                <div style="display:flex;align-items:center;gap:0.5rem;color:var(--warm-stone)">
                  <span class="status-dot status-dot-active"></span>
                  <span style="font-size:0.75rem">${c.time} - ${c.endTime}</span>
                </div>
                <span style="color:var(--warm-stone);width:1rem;height:1rem">${Icons.chevronRight}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- 待批改 + 学生预警 -->
      <section class="page-section">
        <div class="two-col">
          <!-- 待批改作业 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.document} 作业</h2>
              <div style="display:flex;align-items:center;gap:0.5rem">
                <span class="text-secondary" style="font-size:0.875rem">待批改 ${data.assignments.length} 份</span>
                <a href="#assignments" class="card-link">进入作业管理 →</a>
              </div>
            </div>
            <div>
              ${data.assignments.map(a => `
                <div class="list-row" onclick="openGrading('${a.id}')">
                  <div class="avatar avatar-sm" style="background:var(--gray-200)">${a.student[0]}</div>
                  <div class="list-row-content">
                    <div class="list-row-title">${a.student} · ${a.title}</div>
                    <div class="list-row-meta">${a.subject} · ${a.submittedAt ? getRelativeTime(a.submittedAt) : ''}</div>
                  </div>
                  <span class="badge ${a.waitingDays > 2 ? 'badge-warning' : 'badge-neutral'}">${a.waitingDays > 0 ? `等待 ${a.waitingDays} 天` : '今天提交'}</span>
                  <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();Toast.show('正在打开批改界面...', 'info')">批改</button>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 学生预警 -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">${Icons.alert} 学生预警</h2>
              <a href="#students" class="card-link">全部学生 →</a>
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

Pages.dashboard_init = function() {
  // 任何需要初始化的逻辑
};

function renderPendingCard(iconType, icon, label, count, unit, hint) {
  return `
    <div class="pending-card" onclick="handlePendingClick('${label}')">
      <div class="pending-icon ${iconType}">${icon}</div>
      <div class="pending-label">
        <span>${label}</span>
        <span class="badge badge-p0">P1</span>
      </div>
      <div class="pending-count">${count}<span class="pending-unit">${unit}</span></div>
      <div class="text-secondary" style="font-size:0.75rem;margin-top:0.5rem">最近: ${hint}</div>
    </div>
  `;
}

function generateMiniWeek(today) {
  const days = [];
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      date: d.getDate(),
      dayName: ['一', '二', '三', '四', '五', '六', '日'][i],
      isToday: d.toDateString() === today.toDateString(),
      courseCount: i === 0 ? 3 : (i < 5 ? Math.floor(Math.random() * 3) + 1 : 0),
    });
  }
  return days;
}

function handlePendingClick(label) {
  if (label.includes('批改作业') || label.includes('异常作业')) {
    Router.navigate('assignments');
  } else if (label.includes('学生')) {
    Router.navigate('students');
  } else {
    Toast.show(`正在处理: ${label}`, 'info');
  }
}

function openCourseDetail(courseId) {
  const course = MockData.dashboard.courses.find(c => c.id === courseId);
  if (!course) return;

  SlidePanel.open(`
    <div class="card-header" style="margin-bottom: 1rem">
      <span class="badge ${course.subject === 'alevel_math' ? 'badge-info' : 'badge-neutral'}">即将开始</span>
      <span class="text-secondary" style="font-size:0.8125rem">${course.time} - ${course.endTime}</span>
    </div>
    <h3 class="headline-md" style="margin-bottom: 1rem">${course.type}</h3>

    <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;padding:0.75rem;background:var(--gray-50);border-radius:var(--r-md)">
      <div class="avatar avatar-md">${course.student ? course.student[0] : '班'}</div>
      <div>
        <div style="font-size:0.875rem;font-weight:500">${course.student || course.class}</div>
        <div class="text-secondary" style="font-size:0.75rem">上次课: 3天前 · 作业完成率 87%</div>
      </div>
    </div>

    <div class="tabs" style="margin-bottom:1.5rem">
      <div class="tab active">课程大纲</div>
      <div class="tab">作业</div>
      <div class="tab">历史记录</div>
    </div>

    <div class="stagger">
      <div class="card" style="margin-bottom:0.75rem;padding:1rem">
        <div class="label-sm" style="margin-bottom:0.5rem">上节课回顾</div>
        <ul style="font-size:0.875rem;line-height:1.8;color:var(--deep-ink);list-style:disc;padding-left:1.25rem">
          <li>复习了复数的极坐标表示 (Polar Form) 及 De Moivre's Theorem</li>
          <li>应用 De Moivre's Theorem 解决三角恒等式展开问题</li>
        </ul>
      </div>

      <div class="card" style="margin-bottom:0.75rem;padding:1rem">
        <div class="label-sm" style="margin-bottom:0.5rem">本节课重点</div>
        <ul style="font-size:0.875rem;line-height:1.8;color:var(--deep-ink);list-style:decimal;padding-left:1.25rem">
          <li><strong>Differentiation techniques</strong> - 掌握常用函数的求导法则, 包括 Product rule 和 Quotient rule</li>
          <li><strong>Implicit differentiation</strong> - 学习对隐函数进行求导, 并应用于切线方程求解</li>
          <li><strong>Parametric differentiation</strong> - 处理参数方程的求导问题及相关几何应用</li>
        </ul>
      </div>

      <div class="card" style="margin-bottom:0.75rem;padding:1rem">
        <div class="label-sm" style="margin-bottom:0.5rem">建议节奏</div>
        <div style="display:flex;align-items:flex-end;gap:0.5rem;height:3.5rem;margin-top:0.5rem">
          <div style="flex:1;height:30%;background:var(--gray-200);border-radius:4px 4px 0 0"></div>
          <div style="flex:1;height:60%;background:var(--teal-tint-strong);border-radius:4px 4px 0 0"></div>
          <div style="flex:1;height:100%;background:var(--deep-teal);border-radius:4px 4px 0 0"></div>
          <div style="flex:1;height:80%;background:var(--teal-tint-strong);border-radius:4px 4px 0 0"></div>
          <div style="flex:1;height:50%;background:var(--teal-tint);border-radius:4px 4px 0 0"></div>
          <div style="flex:1;height:25%;background:var(--gray-200);border-radius:4px 4px 0 0"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.625rem;color:var(--warm-stone);margin-top:0.5rem">
          <span>引入</span><span>概念</span><span>例题</span><span>练习</span><span>总结</span><span>答疑</span>
        </div>
      </div>

      <div class="card" style="padding:1rem;background:var(--teal-tint);border-color:var(--deep-teal)">
        <div class="label-sm" style="margin-bottom:0.5rem">已掌握内容 (可快速带过)</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
          <span class="badge badge-success">✓ 基础求导</span>
          <span class="badge badge-success">✓ 链式法则</span>
          <span class="badge badge-success">✓ 多项式函数</span>
        </div>
      </div>
    </div>
  `, {
    title: '课程大纲',
    subtitle: 'AI 生成 · 可修改',
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
