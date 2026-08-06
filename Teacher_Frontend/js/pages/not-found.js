/**
 * NOME.AI - 页面: 404
 */

Pages.notFound = function() {
  const _ = (k) => t('notfound.' + k);
  return `
    <div class="topbar">
      <h1 class="page-title">${_('title')}</h1>
    </div>
    <div class="page">
      <div class="empty-state">
        <div class="empty-state-icon">${Icons.alertCircle}</div>
        <div class="empty-state-title">${_('msg')}</div>
        <div class="empty-state-desc">${_('desc')}</div>
        <a href="#dashboard" class="btn btn-primary">${Icons.arrowLeft} ${_('back_dashboard')}</a>
      </div>
    </div>
  `;
};
