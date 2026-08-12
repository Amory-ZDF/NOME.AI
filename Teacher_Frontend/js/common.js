/**
 * NOME.AI - 共享数据 & 工具
 */

// ===== 字体加载配置 =====
document.documentElement.style.setProperty('--font-display', 'Satoshi, MiSans, sans-serif');

// ===== 图标库 (内联 SVG) =====
const Icons = {
  dashboard: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>',
  calendar: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>',
  users: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>',
  assignment: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>',
  report: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>',
  settings: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>',
  bell: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>',
  search: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>',
  filter: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" /></svg>',
  download: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>',
  plus: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>',
  x: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>',
  check: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>',
  arrowRight: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>',
  arrowLeft: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>',
  chevronLeft: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>',
  chevronRight: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>',
  alert: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>',
  alertCircle: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>',
  document: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>',
  clock: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
  trending: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>',
  trendingDown: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" /></svg>',
  play: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg>',
  lightbulb: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.354a15.06 15.06 0 01-3 0M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 21v-2.25m-4.773-1.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636" /></svg>',
};

// ===== 工具函数 =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const createElement = (html) => {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstChild;
};

const formatDate = (date) => {
  if (typeof date === 'string') date = new Date(date);
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${date.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const getRelativeTime = (date) => {
  if (typeof date === 'string') date = new Date(date);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
  return formatDate(date);
};

const dayName = (date) => {
  if (typeof date === 'string') date = new Date(date);
  return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
};

// ===== Toast 通知系统 =====
const Toast = {
  container: null,
  init() {
    this.container = createElement('<div class="toast-container" id="toastContainer"></div>');
    document.body.appendChild(this.container);
  },
  show(message, type = 'info', duration = 3000) {
    if (!this.container) this.init();
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '!' : 'i';
    const toast = createElement(`
      <div class="toast ${type}">
        <span style="font-weight:700">${icon}</span>
        <span>${message}</span>
      </div>
    `);
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 200ms, transform 200ms';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }
};

// ===== 路由 =====
const Router = {
  current: '',
  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },
  handleRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    this.current = hash;
    if (typeof this.onChange === 'function') this.onChange(hash);
  },
  navigate(path) {
    window.location.hash = path;
  }
};

// ===== 应用初始化 =====
const App = {
  init(config) {
    this.user = config.user || { name: '王老师', role: '数学组主管' };
    this.activeNav = config.activeNav || 'dashboard';
    this.render();
    Router.init();
    Router.onChange = (route) => this.handleRoute(route);
  },

  render() {
    document.body.innerHTML = `
      <div class="app">
        ${this.renderSidebar()}
        <main class="main-content" id="mainContent">
          <!-- 页面内容由路由动态渲染 -->
        </main>
      </div>
    `;
  },

  renderSidebar() {
    const navItems = [
      { id: 'dashboard', label: t('common.nav_dashboard'), icon: Icons.dashboard },
      { id: 'calendar', label: t('common.nav_calendar'), icon: Icons.calendar },
      { id: 'students', label: t('common.nav_students'), icon: Icons.users },
      { id: 'assignments', label: t('common.nav_assignments'), icon: Icons.assignment },
      { id: 'reports', label: t('common.nav_reports'), icon: Icons.report },
    ];

    return `
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-name">NOME.AI</div>
          <div class="brand-sub">Teacher Console</div>
        </div>
        <nav class="nav">
          ${navItems.map(item => `
            <a href="#${item.id}" class="nav-item ${this.activeNav === item.id ? 'active' : ''}" data-nav="${item.id}">
              ${item.icon}
              <span class="nav-label">${item.label}</span>
            </a>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <a href="#settings" class="nav-item" data-nav="settings">
            ${Icons.settings}
            <span class="nav-label">${t('common.nav_settings')}</span>
          </a>
          <div class="user-info">
            <div class="avatar avatar-sm">王</div>
            <div class="user-info-text">
              <div class="user-name">${this.user.name}</div>
              <div class="user-role">${this.user.role}</div>
            </div>
          </div>
        </div>
      </aside>
    `;
  },

  handleRoute(route) {
    // 语言切换时需要重新渲染整个 app（包括 sidebar）
    // 检查 sidebar 是否需要更新（导航标签语言变化）
    const existingSidebar = $('.sidebar');
    if (existingSidebar && this._lastLang !== I18n.current()) {
      // 重新渲染整个 app
      this.render();
      this._lastLang = I18n.current();
    }

    // 更新侧边栏 active
    $$('.nav-item').forEach(item => {
      const isActive = item.dataset.nav === route;
      item.classList.toggle('active', isActive);
    });

    // 渲染对应页面
    const main = $('#mainContent');
    if (!main) return;

    const renderSync = (html) => {
      main.innerHTML = html;
      if (typeof Pages[route + '_init'] === 'function') {
        setTimeout(() => Pages[route + '_init'](), 0);
      }
      window.scrollTo(0, 0);
    };

    if (typeof Pages[route] === 'function') {
      const result = Pages[route]();
      if (result && typeof result.then === 'function') {
        const routeAtStart = route;
        result.then(html => {
          if (Router.current === routeAtStart) renderSync(html);
        }).catch(err => {
          console.error('Page load error:', err);
          if (Router.current === routeAtStart) {
            main.innerHTML = (Pages.notFound ? Pages.notFound() : '<div class="page"><div class="card"><h2>Error</h2><p>' + err.message + '</p></div></div>');
          }
        });
      } else {
        renderSync(result);
      }
    } else {
      main.innerHTML = Pages.notFound();
    }
  },

  // 语言切换按钮（可插入到任何 topbar-right）
  renderLangToggle() {
    const isZh = I18n.isZh();
    return `
      <div class="lang-toggle" onclick="I18n.toggle()" title="${t('common.lang_label')}">
        <span class="${isZh ? 'lang-active' : ''}">中</span>
        <span style="color:var(--gray-300);font-size:0.75rem">/</span>
        <span class="${!isZh ? 'lang-active' : ''}">EN</span>
      </div>
    `;
  },
};

// 语言切换按钮样式（注入一次）
if (!document.getElementById('lang-toggle-style')) {
  const style = document.createElement('style');
  style.id = 'lang-toggle-style';
  style.textContent = `
    .lang-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.375rem 0.625rem;
      border-radius: var(--r-md);
      background: var(--gray-100);
      cursor: pointer;
      transition: background var(--duration-fast) var(--ease-out);
      font-size: 0.8125rem;
      font-weight: 500;
      user-select: none;
    }
    .lang-toggle:hover { background: var(--teal-tint); }
    .lang-toggle span { color: var(--warm-stone); transition: color var(--duration-fast); }
    .lang-toggle .lang-active { color: var(--deep-teal); font-weight: 600; }
  `;
  document.head.appendChild(style);
}

// ===== 侧滑面板 =====
const SlidePanel = {
  open(content, options = {}) {
    this.close();
    const backdrop = createElement(`<div class="slide-panel-backdrop" id="slideBackdrop"></div>`);
    const panel = createElement(`
      <div class="slide-panel" id="slidePanel">
        <div class="slide-panel-header">
          <div>
            <h2 class="headline-sm">${options.title || ''}</h2>
            ${options.subtitle ? `<div class="text-secondary" style="font-size:0.8125rem;margin-top:0.25rem">${options.subtitle}</div>` : ''}
          </div>
          <button class="icon-button" onclick="SlidePanel.close()">${Icons.x}</button>
        </div>
        <div class="slide-panel-body">${content}</div>
      </div>
    `);
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      panel.classList.add('open');
    });
    backdrop.addEventListener('click', () => this.close());
  },
  close() {
    const backdrop = $('#slideBackdrop');
    const panel = $('#slidePanel');
    if (backdrop) backdrop.remove();
    if (panel) panel.remove();
  }
};

// ===== 模态框 =====
const Modal = {
  open(content, options = {}) {
    this.close();
    const backdrop = createElement(`
      <div class="modal-backdrop" id="modalBackdrop">
        <div class="modal">
          ${options.title ? `
            <div class="modal-header">
              <h2 class="headline-sm">${options.title}</h2>
              <button class="icon-button" onclick="Modal.close()">${Icons.x}</button>
            </div>
          ` : ''}
          <div class="modal-body">${content}</div>
          ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
        </div>
      </div>
    `);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });
  },
  close() {
    const backdrop = $('#modalBackdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      setTimeout(() => backdrop.remove(), 200);
    }
  }
};

// ===== 全局导出 =====
window.Icons = Icons;
window.Toast = Toast;
window.Router = Router;
window.App = App;
window.SlidePanel = SlidePanel;
window.Modal = Modal;
window.$ = $;
window.$$ = $$;
window.createElement = createElement;
window.formatDate = formatDate;
window.getRelativeTime = getRelativeTime;
window.dayName = dayName;
