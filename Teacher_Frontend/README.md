# NOME.AI · 教师端前端

完整的可交互教师端前端，基于 Stitch 初始设计 + 产品 PRD 优化而来。

## 启动方式

```bash
# 在 frontend 目录下
python3 -m http.server 8765
# 或使用任意静态文件服务器
```

访问 `http://localhost:8765/` 即可。

## 目录结构

```
frontend/
├── index.html                # 主入口（含应用初始化）
├── css/
│   ├── design-system.css     # 设计系统 tokens（色彩/字体/间距/动效/反模式）
│   └── layout.css            # 布局（侧边栏/顶栏/卡片/网格/模态/侧滑面板）
├── js/
│   ├── common.js             # 共享工具（图标/路由/Toast/Modal/侧滑面板）
│   ├── mock-data.js          # 模拟数据
│   └── pages/
│       ├── dashboard.js      # 教学工作台
│       ├── calendar.js       # 课程日历
│       ├── assignments.js    # 作业管理（含批改模态）
│       ├── students.js       # 学生列表
│       ├── student-profile.js# 学生档案详情
│       ├── reports.js        # 数据报告
│       └── not-found.js      # 404 页面
```

## 路由（基于 hash）

| 路径 | 页面 |
|------|------|
| `#dashboard` | 教学工作台（默认首页） |
| `#calendar` | 课程日历 |
| `#students` | 学生档案列表 |
| `#student-profile` | 学生档案详情（默认展示李明） |
| `#assignments` | 作业管理 |
| `#reports` | 数据报告 |

## 核心交互

- **侧边栏导航**：5 个主模块，点击切换
- **待处理事件卡**：点击跳转对应模块
- **课程块**：点击打开右侧滑出面板，显示完整教学大纲（含 AI 生成的回顾/重点/节奏/已掌握）
- **作业行**：点击打开批改模态（60/40 分屏，含 AI 纠错标注、错因标签、AI 智能分析）
- **学生卡**：点击进入学生档案
- **学生档案**：含知识图谱（点击节点查看详情）、动态标签（hover 显示证据）、AI 建议（采纳/忽略）
- **数据报告**：含线图、堆叠面积图（纯 SVG 绘制，无需图表库）

## 设计系统亮点

- **完全使用 PRD 中定义的色彩**：Warm Paper #FAFAF8, Deep Teal #0D9488, Deep Ink #1C1917
- **字体**：Satoshi（英文/数字）+ MiSans（中文回退）+ JetBrains Mono（数据）
- **动效**：staggered 入场（50ms 间隔），spring physics（仅 transform/opacity），无 bounce/elastic
- **响应式**：< 1024px 侧边栏折叠，< 768px 单列堆叠
- **可访问性**：所有交互元素 ≥ 44px 触摸目标，焦点态有清晰的 outline

## 与 Stitch 设计的对比

优化并修复的问题：

1. ✅ **统一中文文案**：所有英文文案已改为中文（"Teacher Portal" → "教师端" 等）
2. ✅ **统一中文姓名**：Zhang Lin → 李明、Wang Yi → 王雅静 等
3. ✅ **统一中文科目名**：Functions → 函数、Calculus → 微积分 等
4. ✅ **统一中文按钮**：Adopt/Ignore → 采纳/忽略
5. ✅ **统一主色**：所有页面都使用 Deep Teal #0D9488（Stitch 用了 M3 衍生色 #00685f）
6. ✅ **完整导航**：6 个页面间可互相跳转，sidebar 高亮跟随
7. ✅ **真实交互**：课程侧滑面板、批改模态、Toast 提示、Tab 切换
8. ✅ **动画效果**：卡片 staggered 入场、hover 状态、点击反馈
9. ✅ **细节补全**：压力指数 gauge、错因分布条形图、教学节奏波形图等

## 待补充

- [ ] 与后端 API 对接（当前为 mock data）
- [ ] 用户登录/鉴权
- [ ] iPad/移动端完整适配
- [ ] 学生端实现（独立项目）
- [ ] 暗色模式
