/**
 * NOME.AI - 页面: 课程日历
 */

Pages.calendar = function() {
  const today = new Date();
  const weekStart = getWeekStart(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  // 课程时间槽 (8:00 - 20:00, 每2小时)
  const timeSlots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(d);
  }

  // 课程数据 - 按天分组
  const coursesByDay = {};
  for (let i = 0; i < 7; i++) {
    const dayStr = days[i].toDateString();
    coursesByDay[dayStr] = MockData.calendar.weekCourses.filter(c => {
      return new Date(c.start).toDateString() === dayStr;
    });
  }

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1 class="page-title">课程日历</h1>
      </div>
      <div class="topbar-right">
        <div style="display:flex;background:var(--gray-100);border-radius:var(--r-md);padding:0.25rem;gap:0.125rem">
          <button class="btn btn-ghost btn-sm" style="background:transparent">月视图</button>
          <button class="btn btn-sm" style="background:white;color:var(--deep-ink);box-shadow:var(--shadow-sm)">周视图</button>
        </div>
        <button class="btn btn-secondary btn-icon" title="上一周">${Icons.chevronLeft}</button>
        <button class="btn btn-secondary">今天</button>
        <button class="btn btn-secondary btn-icon" title="下一周">${Icons.chevronRight}</button>
        <span class="text-secondary" style="font-size:0.875rem;margin:0 0.5rem">${formatDate(weekStart)} - ${formatDate(weekEnd)}</span>
        <button class="icon-button">${Icons.bell}</button>
        <button class="icon-button">${Icons.settings}</button>
      </div>
    </div>

    <div class="page" style="padding: 1.5rem 2rem 2rem">
      <div class="card" style="padding:0;overflow:hidden">

        <!-- 日历头部 -->
        <div style="display:grid;grid-template-columns:80px repeat(7, 1fr);border-bottom:1px solid var(--whisper-line);background:var(--gray-50)">
          <div style="padding:0.75rem"></div>
          ${days.map((d, i) => `
            <div style="padding:0.75rem 0.5rem;text-align:center;${d.toDateString() === today.toDateString() ? 'background:var(--teal-tint);color:var(--deep-teal);font-weight:600' : ''}">
              <div class="label-sm" style="${d.toDateString() === today.toDateString() ? 'color:var(--deep-teal)' : ''}">${['周一','周二','周三','周四','周五','周六','周日'][i]}</div>
              <div style="font-size:1.125rem;font-weight:600;margin-top:0.25rem;font-family:var(--font-mono)">${d.getMonth() + 1}/${d.getDate()}</div>
            </div>
          `).join('')}
        </div>

        <!-- 日历主体 -->
        <div style="display:grid;grid-template-columns:80px repeat(7, 1fr);min-height:600px">
          ${timeSlots.map((time, slotIdx) => `
            <div style="display:contents">
              <div style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--warm-stone);font-family:var(--font-mono);border-right:1px solid var(--whisper-line);text-align:right">
                ${time}
              </div>
              ${days.map((d, dayIdx) => {
                const slotHour = parseInt(time);
                const coursesAtSlot = (coursesByDay[d.toDateString()] || []).filter(c => {
                  const h = new Date(c.start).getHours();
                  return h >= slotHour && h < slotHour + 2;
                });
                const isToday = d.toDateString() === today.toDateString();
                const isPast = d < today && !isToday;

                return `
                  <div style="border-right:1px solid var(--whisper-line);border-bottom:1px solid var(--whisper-line);padding:0.25rem;min-height:80px;${isToday ? 'background:rgba(13, 148, 136, 0.02)' : ''}">
                    ${coursesAtSlot.map((c, idx) => {
                      const start = new Date(c.start);
                      const end = new Date(c.end);
                      return `
                        <div onclick="openCourseDetail('${c.id}')" style="
                          background:var(--teal-tint);
                          border-left:3px solid var(--deep-teal);
                          border-radius:var(--r-sm);
                          padding:0.375rem 0.5rem;
                          font-size:0.75rem;
                          cursor:pointer;
                          margin-bottom:0.25rem;
                          transition:all 200ms cubic-bezier(0.16, 1, 0.3, 1);
                          ${isPast || c.status === 'completed' ? 'opacity:0.55' : ''}
                        " onmouseover="this.style.background='var(--teal-tint-strong)'" onmouseout="this.style.background='var(--teal-tint)'">
                          <div style="font-weight:600;color:var(--deep-ink);font-family:var(--font-mono)">
                            ${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}
                          </div>
                          <div style="color:var(--deep-ink);font-weight:500;margin-top:0.125rem">${c.student || c.class}</div>
                          <div class="text-secondary" style="font-size:0.6875rem">${c.title}</div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display:flex;gap:1rem;margin-top:1.5rem;justify-content:flex-end">
        <button class="btn btn-secondary">${Icons.download} 导出本周课表</button>
        <button class="btn btn-primary" onclick="Toast.show('新建课程功能开发中', 'info')">${Icons.plus} 新建课程</button>
      </div>
    </div>
  `;
};

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
