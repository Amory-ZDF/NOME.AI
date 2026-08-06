/**
 * NOME.AI - 页面: 设置
 */

Pages.settings = function() {
  const _ = (k) => t('settings.' + k);
  const _c = (k) => t('common.' + k);
  const isZh = I18n.isZh();

  return `
    <div class="topbar">
      <div class="topbar-left">
        <h1 class="page-title">${_('title')}</h1>
      </div>
      <div class="topbar-right">
        ${App.renderLangToggle()}
        <button class="icon-button">${Icons.bell}</button>
      </div>
    </div>

    <div class="page stagger" style="max-width:640px">
      <!-- 语言设置 -->
      <section class="page-section">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.settings} ${_('language')}</h2>
          </div>
          <p class="text-secondary" style="font-size:0.875rem;margin-bottom:1.25rem">${_('language_desc')}</p>

          <div style="display:flex;gap:0.75rem">
            <button onclick="I18n.setLang('zh')" class="card card-interactive" style="flex:1;text-align:center;${isZh ? 'background:var(--teal-tint);border-color:var(--deep-teal)' : ''}">
              <div style="font-size:1.5rem;font-weight:700;color:${isZh ? 'var(--deep-teal)' : 'var(--deep-ink)'}">中文</div>
              <div class="text-secondary" style="font-size:0.75rem;margin-top:0.25rem">Chinese</div>
              ${isZh ? '<div style="margin-top:0.5rem"><span class="badge badge-info">✓ ' + _c('adopt') + '</span></div>' : ''}
            </button>
            <button onclick="I18n.setLang('en')" class="card card-interactive" style="flex:1;text-align:center;${!isZh ? 'background:var(--teal-tint);border-color:var(--deep-teal)' : ''}">
              <div style="font-size:1.5rem;font-weight:700;color:${!isZh ? 'var(--deep-teal)' : 'var(--deep-ink)'}">EN</div>
              <div class="text-secondary" style="font-size:0.75rem;margin-top:0.25rem">English</div>
              ${!isZh ? '<div style="margin-top:0.5rem"><span class="badge badge-info">✓ ' + _c('adopt') + '</span></div>' : ''}
            </button>
          </div>
        </div>
      </section>

      <!-- 账号信息 -->
      <section class="page-section">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.users} ${_('account')}</h2>
          </div>
          <div style="display:flex;align-items:center;gap:1rem;padding:0.5rem 0">
            <div class="avatar avatar-lg" style="background:var(--deep-teal);color:white">${MockData.user.avatar}</div>
            <div>
              <div style="font-size:1rem;font-weight:600">${MockData.user.name}</div>
              <div class="text-secondary" style="font-size:0.8125rem">${MockData.user.role}</div>
            </div>
          </div>
        </div>
      </section>

      <!-- 通知 -->
      <section class="page-section">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">${Icons.bell} ${_('notifications')}</h2>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.75rem">
            ${[
              { label: isZh ? '学生预警通知' : 'Student Alert Notifications', desc: isZh ? '压力风险、成绩下降等实时推送' : 'Real-time alerts for stress and score drops', on: true },
              { label: isZh ? '作业提交提醒' : 'Assignment Submission Alerts', desc: isZh ? '学生提交作业后通知' : 'Notify when students submit work', on: true },
              { label: isZh ? '每日学情摘要' : 'Daily Progress Digest', desc: isZh ? '每天早上8:00发送班级学情汇总' : 'Daily summary at 8:00 AM', on: false },
            ].map(item => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--whisper-line)">
                <div>
                  <div style="font-size:0.875rem;font-weight:500">${item.label}</div>
                  <div class="text-secondary" style="font-size:0.75rem;margin-top:0.125rem">${item.desc}</div>
                </div>
                <div style="width:2.5rem;height:1.5rem;border-radius:9999px;background:${item.on ? 'var(--deep-teal)' : 'var(--gray-200)'};position:relative;cursor:pointer;transition:background 200ms" onclick="this.style.background='${item.on ? 'var(--gray-200)' : 'var(--deep-teal)'}';this.querySelector('span').style.transform='${item.on ? 'translateX(0)' : 'translateX(1rem)'}'">
                  <span style="position:absolute;top:2px;left:2px;width:1.25rem;height:1.25rem;border-radius:50%;background:white;transition:transform 200ms;transform:${item.on ? 'translateX(1rem)' : 'translateX(0)'}"></span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    </div>
  `;
};
