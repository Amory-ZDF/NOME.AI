/**
 * NOME.AI - 页面: 作业管理
 */

Pages.assignments = async function() {
  const data = await API.getAssignments();
  API._assignmentCache = data; // cache for openGradingModal
  const _ = (k) => t('assignments.' + k);
  const _c = (k) => t('common.' + k);

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1 class="page-title">${_('title')}</h1>
      </div>
      <div class="topbar-right">
        <button class="btn btn-primary" onclick="Toast.show('${t('toast.dev_in_progress')}', 'info')">${Icons.plus} ${_('assign_new')}</button>
        ${App.renderLangToggle()}
        <button class="icon-button">${Icons.bell}</button>
      </div>
    </div>

    <div class="page stagger">
      <section class="page-section" style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button class="chip active" onclick="setAssignmentFilter(this, 'all')">${_('filter_all')} <span class="mono">${data.length}</span></button>
        <button class="chip" onclick="setAssignmentFilter(this, 'pending')">${_('filter_pending')} <span class="mono">${data.filter(a => a.status === 'pending').length}</span></button>
        <button class="chip" onclick="setAssignmentFilter(this, 'graded')">${_('filter_graded')}</button>
        <button class="chip" onclick="setAssignmentFilter(this, 'overdue')">${_('filter_overdue')}</button>
      </section>

      <section class="page-section" style="display:flex;align-items:center;justify-content:space-between">
        <div class="tabs" style="border-bottom:none">
          <div class="tab active">${_('view_by_assignment')}</div>
          <div class="tab">${_('view_by_student')}</div>
        </div>
        <span class="text-secondary" style="font-size:0.8125rem">${data.length} ${_('total_assignments')}</span>
      </section>

      <section class="page-section">
        <div class="card" style="padding:0;overflow:hidden">
          <table class="data-table">
            <thead>
              <tr>
                <th>${_('col_name')}</th>
                <th>${_('col_class')}</th>
                <th>${_('col_subject')}</th>
                <th>${_('col_assigned')}</th>
                <th>${_('col_due')}</th>
                <th class="right">${_('col_submission')}</th>
                <th>${_('col_status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${data.map(a => renderAssignmentRow(a)).join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
};

function renderAssignmentRow(a) {
  const _ = (k) => t('assignments.' + k);
  const submittedRatio = a.submitted / a.total;
  const statusBadge = a.status === 'pending'
    ? `<span class="badge badge-warning">${_('filter_pending')} ${a.pendingCount} ${t('assignments.pending_count')}</span>`
    : a.status === 'completed'
    ? `<span class="badge badge-success">${t('common.completed')}</span>`
    : a.status === 'graded'
    ? `<span class="badge badge-neutral">${t('common.graded')}</span>`
    : `<span class="badge badge-info">${t('common.active')}</span>`;

  return `
    <tr onclick="toggleAssignmentExpand(this, '${a.id}')">
      <td><div style="font-weight:500;color:var(--deep-ink)">${a.title}</div></td>
      <td>${a.className}</td>
      <td><span class="badge badge-subject">${a.subject}</span></td>
      <td class="mono text-secondary" style="font-size:0.8125rem">${formatDate(a.assignedAt)}</td>
      <td class="mono text-secondary" style="font-size:0.8125rem">${formatDate(a.dueAt)}</td>
      <td class="right">
        <div style="display:flex;align-items:center;gap:0.5rem;justify-content:flex-end">
          <span class="mono" style="font-weight:500">${a.submitted}/${a.total}</span>
          <div class="progress" style="width:60px">
            <div class="progress-bar" style="width:${submittedRatio * 100}%"></div>
          </div>
        </div>
      </td>
      <td>${statusBadge}</td>
      <td class="right">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openGradingModal('${a.id}')">${t('common.grade')}</button>
      </td>
    </tr>
  `;
}

function setAssignmentFilter(el, filter) {
  $$('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  Toast.show(`${t('toast.filter_applied')} ${el.textContent.trim().split(' ')[0]}`, 'info', 1500);
}

function toggleAssignmentExpand(row, id) {
  openGradingModal(id);
}

function openGradingModal(assignmentId) {
  // Use cached store or fetch via API
  const a = (typeof API !== 'undefined' && API._assignmentCache)
    ? API._assignmentCache.find(x => x.id === assignmentId)
    : MockData.assignments.find(x => x.id === assignmentId);
  if (!a) return;
  const _ = (k) => t('assignments.' + k);
  const _c = (k) => t('common.' + k);

  const modalContent = `
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:2rem">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">
          <div>
            <h3 class="headline-sm">${_('grading_title')}: ${a.title}</h3>
            <div class="text-secondary" style="font-size:0.8125rem;margin-top:0.25rem">${_('student_label')}: ${I18n.isZh() ? '王雅静' : 'Wang Yajing'} · ${_('submitted_at')} ${formatDate(a.assignedAt)} 14:20</div>
          </div>
          <span class="text-secondary" style="font-size:0.8125rem">${I18n.isZh() ? '第' : 'Q'} 1/${a.total} ${_('of_total')}</span>
        </div>

        <div class="card" style="margin-bottom:1rem;padding:1.25rem">
          <div style="font-size:0.75rem;color:var(--deep-teal);font-weight:600;margin-bottom:0.5rem">${I18n.isZh() ? '题目 02 (15分)' : 'Question 02 (15 pts)'}</div>
          <div style="font-size:0.9375rem;line-height:1.7;color:var(--deep-ink);margin-bottom:0.75rem">
            ${I18n.isZh()
              ? '一个质量为 m 的小球在光滑水平面上以速度 v 运动, 撞击墙壁后以 v/2 的速度反向弹回。求碰撞过程中冲量的大小。'
              : 'A ball of mass m moves on a frictionless surface with velocity v. After hitting a wall, it rebounds with velocity v/2 in the opposite direction. Find the magnitude of impulse during collision.'}
          </div>
          <div class="text-secondary" style="font-size:0.75rem">${I18n.isZh() ? '知识点: 动量定理' : 'Topic: Impulse-Momentum'} · ${I18n.isZh() ? '难度' : 'Difficulty'}: ★★★☆☆</div>
        </div>

        <div class="card" style="padding:1.25rem">
          <div class="label-sm" style="margin-bottom:0.75rem">${_('student_answer')}</div>
          <div style="font-family:var(--font-mono);font-size:0.875rem;line-height:1.8;color:var(--deep-ink)">
            <div>${I18n.isZh() ? '设初速度方向为正方向' : 'Let initial velocity direction be positive'}</div>
            <div style="margin-top:0.5rem">I = Δp = m·v₂ - m·v₁</div>
            <div style="margin-top:0.5rem">I = m · (v/2 <span style="background:rgba(220,38,38,0.12);padding:0 0.25rem;border-radius:2px">-(-v)</span>) <span style="background:rgba(220,38,38,0.12);color:var(--error-red);padding:0 0.25rem;border-radius:2px;text-decoration:underline">${I18n.isZh() ? '方向错误' : 'Direction error'}</span></div>
            <div style="margin-top:0.5rem">${I18n.isZh() ? '冲量大小为 0.5mv' : 'Impulse magnitude = 0.5mv'}</div>
          </div>

          <div style="margin-top:1rem;padding:0.75rem;background:var(--red-tint);border-radius:var(--r-md);border-left:3px solid var(--error-red)">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
              <span style="width:1rem;height:1rem;color:var(--error-red)">${Icons.alertCircle}</span>
              <strong style="font-size:0.8125rem;color:var(--error-red)">${_('ai_correction')}: ${I18n.isZh() ? '反向速度应取负值。v₂ = -v/2' : 'Rebound velocity should be negative. v₂ = -v/2'}</strong>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="position:sticky;top:6rem;padding:1.5rem">
          <div style="margin-bottom:1.5rem">
            <div class="label-sm" style="margin-bottom:0.5rem">${_('score_label')} 15)</div>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <input type="number" value="8" class="input" style="font-family:var(--font-mono);font-size:1.5rem;font-weight:600;text-align:center;width:5rem;height:3.5rem" />
              <button class="btn btn-ghost btn-sm" onclick="this.previousElementSibling.value=parseInt(this.previousElementSibling.value)-1">-1</button>
              <button class="btn btn-ghost btn-sm" onclick="this.previousElementSibling.previousElementSibling.value=parseInt(this.previousElementSibling.previousElementSibling.value)+1">+1</button>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.75rem;padding:0.5rem 0.75rem;background:var(--teal-tint);border-radius:var(--r-md)">
              <span style="width:1rem;height:1rem;color:var(--deep-teal)">${Icons.lightbulb}</span>
              <span style="font-size:0.8125rem;color:var(--deep-ink)">${_('ai_suggested')}: <strong>9</strong></span>
              <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="Toast.show('${t('toast.ai_suggestion_adopted')}', 'success', 1500)">${_('use_ai')}</button>
            </div>
          </div>

          <div style="margin-bottom:1.5rem">
            <div class="label-sm" style="margin-bottom:0.5rem">${_('error_tags')}</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
              <button class="chip" onclick="this.classList.toggle('active')">${_('tag_knowledge')}</button>
              <button class="chip active" style="background:var(--red-tint);color:var(--error-red);border-color:transparent" onclick="this.classList.toggle('active');this.style.background='';this.style.color=''">${_('tag_calculation')}</button>
              <button class="chip" onclick="this.classList.toggle('active')">${_('tag_reading')}</button>
              <button class="chip" onclick="this.classList.toggle('active')">${_('tag_method')}</button>
              <button class="chip" style="border-style:dashed;color:var(--warm-stone)">${_('add_tag')}</button>
            </div>
          </div>

          <div style="margin-bottom:1.5rem;padding:0.875rem;background:var(--teal-tint);border-radius:var(--r-md);border:1px solid var(--teal-tint-strong)">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
              <span style="width:1rem;height:1rem;color:var(--deep-teal)">${Icons.lightbulb}</span>
              <strong style="font-size:0.8125rem;color:var(--deep-teal)">${_('ai_analysis')}</strong>
            </div>
            <p style="font-size:0.8125rem;line-height:1.6;color:var(--deep-ink)">
              ${I18n.isZh()
                ? '该生对动量定理的物理意义理解清晰, 但在矢量运算方面存在典型偏差。建议强调"正方向"在动量计算中的闭环运用。'
                : 'The student understands the impulse-momentum theorem clearly but has a typical gap in vector operations. Recommend emphasizing the consistent use of "positive direction" in momentum calculations.'}
            </p>
          </div>

          <div style="margin-bottom:1.5rem">
            <div class="label-sm" style="margin-bottom:0.5rem">${_('teacher_feedback')}</div>
            <textarea class="input" rows="3" style="height:auto;padding:0.5rem 0.75rem;line-height:1.5;resize:vertical">${I18n.isZh()
              ? '解题步骤完整, 但要注意动量是矢量, 反向运动的速度必须代入负值。下次注意矢量运算细节。'
              : 'Steps are complete, but remember momentum is a vector. Rebound velocity must be negative. Pay attention to vector operation details next time.'}</textarea>
          </div>

          <div style="display:flex;gap:0.5rem">
            <button class="btn btn-secondary" style="flex:1" onclick="Modal.close()">${_c('skip')}</button>
            <button class="btn btn-primary" style="flex:2" onclick="submitGrading()">${_('submit_grading')}</button>
          </div>
        </div>
      </div>
    </div>
  `;

  Modal.open(modalContent, {
    title: _('grading_title'),
    footer: `
      <span class="text-secondary" style="font-size:0.8125rem;margin-right:auto">${t('toast.draft_saved')}</span>
      <button class="btn btn-secondary" onclick="Modal.close()">${_c('close')}</button>
    `,
  });
}

function submitGrading() {
  Modal.close();
  Toast.show(t('toast.grading_submitted'), 'success');
}

window.openGradingModal = openGradingModal;
