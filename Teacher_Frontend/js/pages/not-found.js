/**
 * NOME.AI - 404 页面
 */

Pages.notFound = function() {
  return `
    <div class="topbar">
      <h1 class="page-title">页面未找到</h1>
    </div>
    <div class="page">
      <div class="empty-state">
        <div class="empty-state-icon">${Icons.alertCircle}</div>
        <div class="empty-state-title">您访问的页面不存在</div>
        <div class="empty-state-desc">请检查 URL, 或返回工作台继续操作</div>
        <a href="#dashboard" class="btn btn-primary">${Icons.arrowLeft} 返回工作台</a>
      </div>
    </div>
  `;
};
