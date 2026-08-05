/**
 * NOME.AI - 页面: 作业管理
 */

Pages.assignments = function() {
  const data = MockData.assignments;
  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1 class="page-title">作业管理</h1>
      </div>
      <div class="topbar-right">
        <button class="btn btn-primary" onclick="Toast.show('布置作业功能开发中', 'info')">${Icons.plus} 布置作业</button>
        <button class="icon-button">${Icons.bell}</button>
        <button class="icon-button">${Icons.settings}</button>
      </div>
    </div>

    <div class="page stagger">
      <!-- 筛选 chips -->
      <section class="page-section" style="display:flex;gap:0.5rem;flex-wrap:wrap">
        <button class="chip active" onclick="setAssignmentFilter(this, 'all')">全部 <span class="mono">${data.length}</span></button>
        <button class="chip" onclick="setAssignmentFilter(this, 'pending')">待批改 <span class="mono">${data.filter(a => a.status === 'pending').length}</span></button>
        <button class="chip" onclick="setAssignmentFilter(this, 'graded')">已批改</button>
        <button class="chip" onclick="setAssignmentFilter(this, 'overdue')">已逾期</button>
      </section>

      <!-- 子 tab -->
      <section class="page-section" style="display:flex;align-items:center;justify-content:space-between">
        <div class="tabs" style="border-bottom:none">
          <div class="tab active">按作业查看</div>
          <div class="tab">按学生查看</div>
        </div>
        <span class="text-secondary" style="font-size:0.8125rem">共 ${data.length} 个作业</span>
      </section>

      <!-- 作业表格 -->
      <section class="page-section">
        <div class="card" style="padding:0;overflow:hidden">
          <table class="data-table">
            <thead>
              <tr>
                <th>作业名称</th>
                <th>班级/学生</th>
                <th>科目</th>
                <th>布置时间</th>
                <th>截止时间</th>
                <th class="right">提交率</th>
                <th>状态</th>
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
  const submittedRatio = a.submitted / a.total;
  const statusBadge = a.status === 'pending'
    ? `<span class="badge badge-warning">待批改 ${a.pendingCount} 份</span>`
    : a.status === 'completed'
    ? `<span class="badge badge-success">已完成</span>`
    : a.status === 'graded'
    ? `<span class="badge badge-neutral">已批改</span>`
    : `<span class="badge badge-info">进行中</span>`;

  return `
    <tr onclick="toggleAssignmentExpand(this, '${a.id}')">
      <td>
        <div style="font-weight:500;color:var(--deep-ink)">${a.title}</div>
      </td>
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
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openGradingModal('${a.id}')">批改</button>
      </td>
    </tr>
  `;
}

function setAssignmentFilter(el, filter) {
  $$('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  Toast.show(`已切换到: ${el.textContent.trim()}`, 'info', 1500);
}

function toggleAssignmentExpand(row, id) {
  // 简化: 实际可通过点击行进入详情
  openGradingModal(id);
}

function openGradingModal(assignmentId) {
  const a = MockData.assignments.find(x => x.id === assignmentId);
  if (!a) return;

  const modalContent = `
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:2rem">

      <!-- 左侧: 学生作答 -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem">
          <div>
            <h3 class="headline-sm">批改: ${a.title}</h3>
            <div class="text-secondary" style="font-size:0.8125rem;margin-top:0.25rem">学生: 王雅静 · 提交于 ${formatDate(a.assignedAt)} 14:20</div>
          </div>
          <span class="text-secondary" style="font-size:0.8125rem">第 1/${a.total} 份作业</span>
        </div>

        <!-- 题目区 -->
        <div class="card" style="margin-bottom:1rem;padding:1.25rem">
          <div style="font-size:0.75rem;color:var(--deep-teal);font-weight:600;margin-bottom:0.5rem">题目 02 (15分)</div>
          <div style="font-size:0.9375rem;line-height:1.7;color:var(--deep-ink);margin-bottom:0.75rem">
            一个质量为 m 的小球在光滑水平面上以速度 v 运动, 撞击墙壁后以 v/2 的速度反向弹回。求碰撞过程中冲量的大小。
          </div>
          <div class="text-secondary" style="font-size:0.75rem">知识点: 动量定理 · 难度: ★★★☆☆</div>
        </div>

        <!-- 学生作答 -->
        <div class="card" style="padding:1.25rem">
          <div class="label-sm" style="margin-bottom:0.75rem">学生作答</div>
          <div style="font-family:var(--font-mono);font-size:0.875rem;line-height:1.8;color:var(--deep-ink)">
            <div>设初速度方向为正方向</div>
            <div style="margin-top:0.5rem">I = Δp = m·v₂ - m·v₁</div>
            <div style="margin-top:0.5rem">I = m · (v/2 <span style="background:rgba(220,38,38,0.12);padding:0 0.25rem;border-radius:2px">-(-v)</span>) <span style="background:rgba(220,38,38,0.12);color:var(--error-red);padding:0 0.25rem;border-radius:2px;text-decoration:underline">方向错误</span></div>
            <div style="margin-top:0.5rem">冲量大小为 0.5mv</div>
          </div>

          <!-- AI 纠错标注 -->
          <div style="margin-top:1rem;padding:0.75rem;background:var(--red-tint);border-radius:var(--r-md);border-left:3px solid var(--error-red)">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
              <span style="width:1rem;height:1rem;color:var(--error-red)">${Icons.alertCircle}</span>
              <strong style="font-size:0.8125rem;color:var(--error-red)">AI 纠错: 反向速度应取负值。v₂ = -v/2</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧: 批改控制 -->
      <div>
        <div class="card" style="position:sticky;top:6rem;padding:1.5rem">

          <!-- 分数输入 -->
          <div style="margin-bottom:1.5rem">
            <div class="label-sm" style="margin-bottom:0.5rem">得分 (满分 15)</div>
            <div style="display:flex;align-items:center;gap:0.5rem">
              <input type="number" value="8" class="input" style="font-family:var(--font-mono);font-size:1.5rem;font-weight:600;text-align:center;width:5rem;height:3.5rem" />
              <button class="btn btn-ghost btn-sm" onclick="this.previousElementSibling.value=parseInt(this.previousElementSibling.value)-1">-1</button>
              <button class="btn btn-ghost btn-sm" onclick="this.previousElementSibling.previousElementSibling.value=parseInt(this.previousElementSibling.previousElementSibling.value)+1">+1</button>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.75rem;padding:0.5rem 0.75rem;background:var(--teal-tint);border-radius:var(--r-md)">
              <span style="width:1rem;height:1rem;color:var(--deep-teal)">${Icons.lightbulb}</span>
              <span style="font-size:0.8125rem;color:var(--deep-ink)">AI 建议分数: <strong>9</strong></span>
              <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="Toast.show('已采用 AI 建议', 'success', 1500)">采用</button>
            </div>
          </div>

          <!-- 错因标签 -->
          <div style="margin-bottom:1.5rem">
            <div class="label-sm" style="margin-bottom:0.5rem">错误标签</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
              <button class="chip" onclick="this.classList.toggle('active')">知识缺失</button>
              <button class="chip active" style="background:var(--red-tint);color:var(--error-red);border-color:transparent" onclick="this.classList.toggle('active');this.style.background='';this.style.color=''">计算错误</button>
              <button class="chip" onclick="this.classList.toggle('active')">审题不清</button>
              <button class="chip" onclick="this.classList.toggle('active')">方法错误</button>
              <button class="chip" style="border-style:dashed;color:var(--warm-stone)">+ 添加标签</button>
            </div>
          </div>

          <!-- AI 分析 -->
          <div style="margin-bottom:1.5rem;padding:0.875rem;background:var(--teal-tint);border-radius:var(--r-md);border:1px solid var(--teal-tint-strong)">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
              <span style="width:1rem;height:1rem;color:var(--deep-teal)">${Icons.lightbulb}</span>
              <strong style="font-size:0.8125rem;color:var(--deep-teal)">AI 智能分析</strong>
            </div>
            <p style="font-size:0.8125rem;line-height:1.6;color:var(--deep-ink)">
              该生对动量定理的物理意义理解清晰, 但在矢量运算方面存在典型偏差。建议强调"正方向"在动量计算中的闭环运用。
            </p>
          </div>

          <!-- 教师评语 -->
          <div style="margin-bottom:1.5rem">
            <div class="label-sm" style="margin-bottom:0.5rem">教师评语</div>
            <textarea class="input" rows="3" style="height:auto;padding:0.5rem 0.75rem;line-height:1.5;resize:vertical">解题步骤完整, 但要注意动量是矢量, 反向运动的速度必须代入负值。下次注意矢量运算细节。</textarea>
          </div>

          <!-- 操作 -->
          <div style="display:flex;gap:0.5rem">
            <button class="btn btn-secondary" style="flex:1" onclick="Modal.close()">跳过</button>
            <button class="btn btn-primary" style="flex:2" onclick="submitGrading()">提交批改</button>
          </div>
        </div>
      </div>
    </div>
  `;

  Modal.open(modalContent, {
    title: '批改作业',
    footer: `
      <span class="text-secondary" style="font-size:0.8125rem;margin-right:auto">操作记录: 4秒前自动保存草稿</span>
      <button class="btn btn-secondary" onclick="Modal.close()">关闭</button>
    `,
  });
}

function submitGrading() {
  Modal.close();
  Toast.show('批改已提交, 已通知学生', 'success');
}

window.openGradingModal = openGradingModal;
