/**
 * NOME.AI - i18n 国际化模块
 * 支持中英文切换，品牌名 NOME.AI 始终不变
 */

const I18N = {
  // ===== 通用 =====
  common: {
    // 侧边栏
    brand_sub:        { zh: 'Teacher Console',          en: 'Teacher Console' },
    nav_dashboard:    { zh: '工作台',                    en: 'Dashboard' },
    nav_calendar:     { zh: '课程日历',                  en: 'Calendar' },
    nav_students:     { zh: '学生档案',                  en: 'Students' },
    nav_assignments:  { zh: '作业管理',                  en: 'Assignments' },
    nav_reports:      { zh: '数据报告',                  en: 'Reports' },
    nav_insights:     { zh: 'AI 洞察',                   en: 'AI Insights' },
    nav_settings:     { zh: '设置',                      en: 'Settings' },

    // 顶栏通用
    all_classes:      { zh: '全部班级',                  en: 'All Classes' },
    today:            { zh: '今天',                      en: 'Today' },
    search:           { zh: '搜索...',                   en: 'Search...' },
    filter:           { zh: '筛选',                      en: 'Filter' },
    export:           { zh: '导出',                      en: 'Export' },
    sort:             { zh: '排序',                      en: 'Sort' },
    view_all:         { zh: '查看全部',                  en: 'View All' },
    view_all_students:{ zh: '全部学生',                  en: 'All Students' },
    enter:            { zh: '进入',                      en: 'Enter' },
    view_detail:      { zh: '查看详情',                  en: 'View Detail' },
    view_profile:     { zh: '查看档案',                  en: 'View Profile' },
    view_path:        { zh: '查看路径',                  en: 'View Path' },
    view_calendar:    { zh: '查看完整日历',              en: 'View Full Calendar' },
    view_full_profile:{ zh: '查看完整档案',              en: 'View Full Profile' },
    enter_assignments:{ zh: '进入作业管理',              en: 'Assignment Manager' },

    // 状态/标签
    status_good:      { zh: '状态: 良好',                en: 'STATUS: GOOD' },
    status_excellent: { zh: '状态: 优秀',                en: 'STATUS: EXCELLENT' },
    risk_high:        { zh: '风险: 高',                  en: 'RISK: HIGH' },
    risk_medium:      { zh: '风险: 中',                  en: 'RISK: MEDIUM' },
    risk_low:         { zh: '风险: 低',                  en: 'RISK: LOW' },
    avg_score:        { zh: '平均分',                    en: 'AVG SCORE' },
    last_active:      { zh: '最后活跃',                  en: 'Last Active' },
    student_id:       { zh: '学号',                      en: 'ID' },
    class_label:      { zh: '班级',                      en: 'Class' },

    // 按钮
    grade:            { zh: '批改',                      en: 'Grade' },
    view:             { zh: '查看',                      en: 'View' },
    redo:             { zh: '重做',                      en: 'Redo' },
    adopt:            { zh: '采纳',                     en: 'Adopt' },
    ignore:           { zh: '忽略',                     en: 'Ignore' },
    submit:           { zh: '提交',                     en: 'Submit' },
    skip:             { zh: '跳过',                     en: 'Skip' },
    close:            { zh: '关闭',                     en: 'Close' },
    confirm:          { zh: '确认',                     en: 'Confirm' },
    modify:           { zh: '修改',                     en: 'Modify' },
    edit:             { zh: '编辑',                     en: 'Edit' },
    delete:           { zh: '删除',                     en: 'Delete' },
    add:              { zh: '新增',                     en: 'Add' },
    upload:           { zh: '上传',                     en: 'Upload' },
    save:             { zh: '保存',                     en: 'Save' },
    cancel:           { zh: '取消',                     en: 'Cancel' },
    back:             { zh: '返回',                     en: 'Back' },
    next:             { zh: '下一步',                   en: 'Next' },
    prev:             { zh: '上一步',                   en: 'Previous' },
    create:           { zh: '新建',                     en: 'Create' },

    // 科目
    subject_alevel_math:    { zh: 'A-Level 数学',        en: 'A-Level Math' },
    subject_alevel_physics: { zh: 'A-Level 物理',        en: 'A-Level Physics' },
    subject_alevel_chem:    { zh: 'A-Level 化学',        en: 'A-Level Chemistry' },
    subject_ielts_reading:  { zh: 'IELTS 阅读',          en: 'IELTS Reading' },
    subject_ielts_writing: { zh: 'IELTS 写作',          en: 'IELTS Writing' },
    subject_math:           { zh: '数学',                en: 'Math' },
    subject_physics:        { zh: '物理',                en: 'Physics' },
    subject_english:       { zh: '英语',                en: 'English' },

    // 时间
    just_now:         { zh: '刚刚',                      en: 'Just Now' },
    minutes_ago:      { zh: '分钟前',                    en: 'min ago' },
    hours_ago:        { zh: '小时前',                    en: 'hr ago' },
    days_ago:         { zh: '天前',                      en: 'days ago' },
    waiting:          { zh: '等待',                      en: 'Waiting' },
    today_str:        { zh: '今天',                      en: 'Today' },
    yesterday:        { zh: '昨天',                      en: 'Yesterday' },
    vs_last_month:    { zh: '较上月',                    en: 'vs last month' },
    submitted:        { zh: '已提交',                    en: 'Submitted' },
    overdue:          { zh: '已逾期',                    en: 'Overdue' },
    graded:           { zh: '已批改',                    en: 'Graded' },
    completed:        { zh: '已完成',                    en: 'Completed' },
    in_progress:      { zh: '进行中',                    en: 'In Progress' },
    upcoming:         { zh: '即将开始',                  en: 'Upcoming' },
    pending:          { zh: '待批改',                    en: 'Pending' },
    active:           { zh: '进行中',                    en: 'Active' },

    // 单位
    unit_count:       { zh: '份',                        en: '' },           // "5 份" vs "5"
    unit_person:      { zh: '人',                        en: '' },           // "2 人" vs "2"
    unit_hour:        { zh: '小时',                      en: 'h' },
    unit_minutes:     { zh: '分钟',                      en: 'min' },
    unit_minutes_q:   { zh: '分钟/题',                   en: 'min/q' },
    unit_day:         { zh: '天',                        en: 'days' },
    unit_hours_per_day:{ zh: 'h/天',                     en: 'h/day' },
    unit_m_per_day:   { zh: 'm/天',                      en: 'm/day' },

    // 语言
    lang_label:       { zh: '语言',                      en: 'Language' },
    lang_zh:          { zh: '中文',                      en: '中文' },
    lang_en:          { zh: 'English',                   en: 'English' },
    // 工作台通用（代码里以 common.* 查找）
    latest:           { zh: '最近',                      en: 'Latest' },
    waiting_days:     { zh: '等待',                      en: 'Waiting' },
    submitted_today:  { zh: '今天提交',                  en: 'Submitted today' },
  },

  // ===== 工作台 =====
  dashboard: {
    title:            { zh: '教学工作台',                en: 'Teaching Dashboard' },
    subtitle:         { zh: '管理学生进度与课堂安排',     en: 'Manage student progress and class schedules' },
    pending_events:   { zh: '待处理事件',                en: 'Pending Tasks' },
    pending_ugrading: { zh: '待批改作业',                en: 'Ungraded Work' },
    pending_stress:   { zh: '压力风险学生',              en: 'Stress Risk Students' },
    pending_stagnant: { zh: '长期停滞学生',              en: 'Stagnant Students' },
    pending_abnormal: { zh: '异常作业',                  en: 'Abnormal Submissions' },
    courses_today:    { zh: '今日课程',                  en: "Today's Classes" },
    courses_week_total:{ zh: '节',                       en: 'classes' },
    courses_week:     { zh: '本周',                      en: 'This week' },
    assignments:      { zh: '作业',                      en: 'Assignments' },
    assignments_pending:{ zh: '待批改',                  en: 'Pending grading' },
    assignments_assigned:{ zh: '已布置',                en: 'Assigned' },
    student_alerts:   { zh: '学生预警',                  en: 'Student Alerts' },
    motivational_1:   { zh: '三角函数正确率提升了12%, 继续保持', en: 'Trig scores up 12%, keep it up!' },
  },

  // ===== 课程日历 =====
  calendar: {
    title:            { zh: '课程日历',                  en: 'Course Calendar' },
    subtitle:         { zh: '查看和管理所有课程安排',     en: 'View and manage all scheduled classes' },
    week_view:        { zh: '周视图',                    en: 'Week View' },
    month_view:       { zh: '月视图',                    en: 'Month View' },
    prev_week:        { zh: '上一周',                    en: 'Prev Week' },
    next_week:        { zh: '下一周',                    en: 'Next Week' },
    export_schedule:   { zh: '导出本周课表',              en: 'Export This Week' },
    new_course:       { zh: '新建课程',                  en: 'New Course' },
    days: {
      mon: { zh: '周一', en: 'Mon' }, tue: { zh: '周二', en: 'Tue' },
      wed: { zh: '周三', en: 'Wed' }, thu: { zh: '周四', en: 'Thu' },
      fri: { zh: '周五', en: 'Fri' }, sat: { zh: '周六', en: 'Sat' },
      sun: { zh: '周日', en: 'Sun' },
    },
    // 课程大纲侧滑面板
    lesson_plan:      { zh: '课程大纲',                  en: 'Lesson Plan' },
    lesson_plan_sub:  { zh: 'AI 生成 · 可修改',          en: 'AI Generated · Editable' },
    about_to_start:   { zh: '即将开始',                  en: 'About to Start' },
    last_session:     { zh: '上次课',                   en: 'Last Session' },
    completion_rate:  { zh: '作业完成率',                en: 'Completion Rate' },
    review:           { zh: '上节课回顾',                en: 'Last Session Review' },
    new_issues:       { zh: '课后新问题',                en: 'New Issues' },
    outline:          { zh: '本节课重点',                en: "Today's Focus" },
    suggested_examples:{ zh: '建议例题',                 en: 'Suggested Examples' },
    pacing:           { zh: '建议节奏',                  en: 'Suggested Pacing' },
    mastered_content: { zh: '已掌握内容 (可快速带过)',    en: 'Mastered (Quick Review)' },
    homework:         { zh: '作业',                      en: 'Homework' },
    history:          { zh: '历史记录',                  en: 'History' },
    assign_new:       { zh: '布置新作业',                en: 'Assign New' },
    phases:           { zh: ['引入', '概念', '例题', '练习', '总结', '答疑'], 
                        en: ['Intro', 'Concept', 'Example', 'Practice', 'Summary', 'Q&A'] },
  },

  // ===== 作业管理 =====
  assignments: {
    title:            { zh: '作业管理',                  en: 'Assignment Manager' },
    subtitle:         { zh: '查看、批改与布置作业',       en: 'Grade, assign and track student work' },
    filter_all:       { zh: '全部',                      en: 'All' },
    filter_pending:   { zh: '待批改',                    en: 'Pending' },
    filter_graded:    { zh: '已批改',                    en: 'Graded' },
    filter_overdue:   { zh: '已逾期',                    en: 'Overdue' },
    view_by_assignment:{ zh: '按作业查看',              en: 'By Assignment' },
    view_by_student:  { zh: '按学生查看',                en: 'By Student' },
    total_assignments:{ zh: '个作业',                    en: 'assignments' },
    assign_new:       { zh: '布置作业',                  en: 'Assign Work' },
    col_name:         { zh: '作业名称',                  en: 'Assignment' },
    col_class:        { zh: '班级/学生',                 en: 'Class / Student' },
    col_subject:      { zh: '科目',                      en: 'Subject' },
    col_assigned:     { zh: '布置时间',                  en: 'Assigned' },
    col_due:          { zh: '截止时间',                  en: 'Due' },
    col_submission:   { zh: '提交率',                    en: 'Submission' },
    col_status:       { zh: '状态',                      en: 'Status' },
    col_action:       { zh: '操作',                      en: 'Action' },
    pending_count:    { zh: '份',                        en: 'to grade' },
    // 批改界面
    grading_title:    { zh: '批改作业',                  en: 'Grade Submission' },
    student_label:    { zh: '学生',                      en: 'Student' },
    submitted_at:     { zh: '提交于',                   en: 'Submitted' },
    of_total:         { zh: '份作业',                    en: 'submissions' },
    question_label:   { zh: '题目',                      en: 'Question' },
    student_answer:   { zh: '学生作答',                  en: 'Student Answer' },
    ai_correction:    { zh: 'AI 纠错',                   en: 'AI Correction' },
    score_label:      { zh: '得分 (满分',                en: 'Score (Max' },
    ai_suggested:     { zh: 'AI 建议分数',               en: 'AI Suggested' },
    use_ai:           { zh: '采用',                      en: 'Apply' },
    error_tags:       { zh: '错误标签',                  en: 'Error Tags' },
    tag_knowledge:    { zh: '知识缺失',                  en: 'Knowledge Gap' },
    tag_calculation:  { zh: '计算错误',                  en: 'Calculation' },
    tag_reading:      { zh: '审题不清',                  en: 'Misreading' },
    tag_method:       { zh: '方法错误',                  en: 'Method Error' },
    add_tag:          { zh: '+ 添加标签',                en: '+ Add Tag' },
    ai_analysis:      { zh: 'AI 智能分析',               en: 'AI Analysis' },
    teacher_feedback: { zh: '教师评语',                  en: 'Teacher Feedback' },
    submit_grading:   { zh: '提交批改',                  en: 'Submit Grade' },
    draft_saved:      { zh: '操作记录: 已自动保存草稿',   en: 'Autosaved draft' },
  },

  // ===== 学生列表 =====
  students: {
    title:            { zh: '学生档案',                  en: 'Student Profiles' },
    subtitle:         { zh: '管理并跟踪班级学生的学习进度与学术表现', en: 'Track student progress and academic performance' },
    search_placeholder:{ zh: '搜索姓名、学号或标签...',   en: 'Search name, ID or tags...' },
    sort_by_risk:     { zh: '按风险优先',                en: 'By Risk Priority' },
    quick_filters:    { zh: '快速过滤:',                en: 'Quick Filters:' },
    needs_attention:  { zh: '需要关注',                  en: 'Needs Attention' },
    attention:        { zh: '关注中',                    en: 'Watching' },
    all_students:     { zh: '全部',                      en: 'All' },
    showing:          { zh: '名学生, 共',                en: 'of' },
    students_total:   { zh: '名',                        en: 'students' },
    learning_progress:{ zh: '学习进度 (本月)',          en: 'Progress (This Month)' },
    lessons_completed:{ zh: '课时',                      en: 'lessons' },
  },

  // ===== 学生档案详情 =====
  student_profile: {
    title:            { zh: '学生档案',                  en: 'Student Profile' },
    target_label:     { zh: '目标',                      en: 'Target' },
    mental_load:      { zh: '压力指数',                  en: 'Mental Load' },
    mental_load_high: { zh: '偏高 · 考前1周',            en: 'Elevated · Pre-Exam Week' },
    teaching_style:   { zh: '讲解方式',                  en: 'Teaching Style' },
    style_matched:    { zh: '渐进引导型',                en: 'Scaffolded Guidance' },
    auto_matched:     { zh: '根据学生模型自动匹配',       en: 'Auto-matched from student model' },
    knowledge_graph:  { zh: '知识图谱',                  en: 'Mastery Graph' },
    legend_mastery:   { zh: '掌握',                      en: 'Mastery' },
    legend_stable:    { zh: '良好',                      en: 'Stable' },
    legend_review:    { zh: '薄弱',                      en: 'Review' },
    legend_critical:  { zh: '严重不足',                  en: 'Critical' },
    recent_work:      { zh: '最近作业',                  en: 'Recent Work' },
    col_work:         { zh: '作业 / 测验',               en: 'Work / Test' },
    col_date:         { zh: '日期',                      en: 'Date' },
    col_score:        { zh: '得分',                      en: 'Score' },
    insights:         { zh: '反馈分析',                  en: 'Insights' },
    period_3d:        { zh: '3天',                      en: '3 Days' },
    period_7d:        { zh: '7天',                      en: '7 Days' },
    period_30d:       { zh: '30天',                     en: '30 Days' },
    accuracy_trend:   { zh: '正确率趋势 (本周)',         en: 'Accuracy Trend (This Week)' },
    error_distribution:{ zh: '错因分布',                en: 'Error Breakdown' },
    ai_insight:       { zh: 'AI 洞察',                  en: 'AI Insights' },
    tags:             { zh: '学习标签',                  en: 'Learning Tags' },
    execution:        { zh: '执行力',                   en: 'Execution' },
    task_completion:  { zh: '任务完成率',                en: 'Task Completion' },
    completed_this_month:{ zh: '% 本月完成',            en: '% completed this month' },
    completed:        { zh: '已完成',                    en: 'Completed' },
    delayed:          { zh: '延迟',                      en: 'Delayed' },
    suggestions:      { zh: 'AI 建议',                  en: 'AI Suggestions' },
    sugg_title_1:     { zh: '推进一代数强化专项练习',     en: 'Algebra Focused Practice' },
    sugg_detail_1:    { zh: '针对近期低级计算错误, 系统生成了15道错题集', en: '15 targeted questions based on recent calculation errors' },
    sugg_title_2:     { zh: '开启"压力缓解"对话模式',     en: 'Enable Stress-Relief Mode' },
    sugg_detail_2:    { zh: '压力值连续3日超标, 建议开启AI心理导向课程', en: 'Stress index elevated for 3 days, recommend wellbeing check-in' },
    sugg_title_3:     { zh: '完成变式题验证',            en: 'Variant Verification' },
    sugg_detail_3:    { zh: '已为该生安排3道针对性变式题, 检验掌握度', en: '3 variant questions assigned to verify mastery' },
    last_update:      { zh: '最后更新: 刚刚',            en: 'Last Update: Just Now' },
  },

  // ===== 数据报告 =====
  reports: {
    title:            { zh: '数据报告',                  en: 'Analytics' },
    subtitle:         { zh: '分析班级整体学情与学生个体差异', en: 'Class-wide trends and individual student insights' },
    week:             { zh: '本周',                      en: 'Week' },
    month:            { zh: '本月',                      en: 'Month' },
    semester:         { zh: '本学期',                    en: 'Semester' },
    class_avg:        { zh: '班级平均分',                en: 'CLASS AVG' },
    completion_rate:  { zh: '作业完成率',                en: 'COMPLETION RATE' },
    attention_needed: { zh: '需关注学生',                en: 'ATTENTION NEEDED' },
    avg_study_time:   { zh: '平均学习时长',              en: 'AVG STUDY TIME' },
    stable:           { zh: '持平',                      en: 'Stable' },
    students:         { zh: '名学生',                    en: 'students' },
    score_trend:      { zh: '成绩趋势',                  en: 'Score Trend' },
    class_avg_label:  { zh: '班级平均',                  en: 'Class Avg' },
    individual:       { zh: '个人',                      en: 'Individual' },
    error_dist_change:{ zh: '错因分布变化',              en: 'Error Type Evolution' },
    error_knowledge:  { zh: '知识',                     en: 'Knowledge' },
    error_method:     { zh: '方法',                     en: 'Method' },
    error_calc:       { zh: '计算',                      en: 'Calc' },
    error_reading:    { zh: '审题',                     en: 'Logic' },
    improved:         { zh: '进步最大',                  en: 'Most Improved' },
    attention_list:   { zh: '需要关注',                  en: 'Needs Attention' },
    col_student:      { zh: '学生',                      en: 'STUDENT' },
    col_risk:         { zh: '风险因素',                  en: 'RISK FACTOR' },
    col_focus:        { zh: '关注等级',                  en: 'FOCUS LEVEL' },
    col_duration:     { zh: '日均时长',                  en: 'AVG DURATION' },
    col_action:       { zh: '操作',                      en: 'ACTION' },
    showing_of:       { zh: '显示',                      en: 'Showing' },
    of_total:         { zh: '名学生中',                  en: 'of' },
    explore_more:     { zh: '查看更多详细分析',          en: 'Explore more detailed analysis' },
    risk_logic_gap:   { zh: '逻辑断层',                  en: 'Logic Gap' },
    risk_calc_fluency:{ zh: '计算流畅度',                en: 'Calculation Fluency' },
    risk_attention_drift:{ zh: '注意力分散',             en: 'Attention Drift' },
  },

  // ===== 404 =====
  notfound: {
    title:            { zh: '页面未找到',                en: 'Page Not Found' },
    msg:              { zh: '您访问的页面不存在',         en: 'The page you are looking for does not exist.' },
    desc:             { zh: '请检查 URL, 或返回工作台继续操作', en: 'Check the URL, or return to the dashboard.' },
    back_dashboard:   { zh: '返回工作台',                en: 'Back to Dashboard' },
  },

  // ===== 设置 =====
  settings: {
    title:            { zh: '设置',                      en: 'Settings' },
    language:          { zh: '界面语言',                  en: 'Interface Language' },
    language_desc:    { zh: '切换中英文界面',             en: 'Switch between Chinese and English' },
    account:          { zh: '账号',                      en: 'Account' },
    notifications:    { zh: '通知',                      en: 'Notifications' },
  },

  // ===== Toast 消息 =====
  toast: {
    opening_grading:  { zh: '正在打开批改界面...',        en: 'Opening grading view...' },
    ai_suggestion_adopted: { zh: '已采用 AI 建议',        en: 'AI suggestion adopted' },
    ai_suggestion_ignored: { zh: '已忽略',               en: 'Ignored' },
    grading_submitted:{ zh: '批改已提交, 已通知学生',     en: 'Grade submitted, student notified' },
    filter_applied:   { zh: '已切换到:',                  en: 'Filter applied:' },
    filter_class:     { zh: '已过滤:',                   en: 'Filtered:' },
    knowledge_detail: { zh: '掌握度',                    en: 'Mastery' },
    dev_in_progress:  { zh: '功能开发中',                 en: 'Feature in development' },
    student_loaded:   { zh: '已加载学生档案:',           en: 'Loaded student profile:' },
    variant_assigned: { zh: '已安排变式题',              en: 'Variant questions assigned' },
    added_to_tasks:   { zh: '已加入任务列表',            en: 'Added to task list' },
    autosaved:        { zh: '已自动保存草稿',           en: 'Autosaved draft' },
  },
};

// ===== 翻译引擎 =====
const I18n = {
  lang: 'zh', // default

  init() {
    const saved = localStorage.getItem('nome-lang');
    if (saved === 'zh' || saved === 'en') {
      this.lang = saved;
    } else {
      // 检测浏览器语言
      const browserLang = navigator.language || navigator.userLanguage;
      this.lang = browserLang.startsWith('zh') ? 'zh' : 'en';
    }
  },

  t(key) {
    const parts = key.split('.');
    let node = I18N;
    for (const p of parts) {
      if (node && typeof node === 'object' && p in node) {
        node = node[p];
      } else {
        return key; // fallback: return key itself
      }
    }
    if (node && typeof node === 'object' && this.lang in node) {
      const val = node[this.lang];
      // 数组类型直接返回
      if (Array.isArray(val)) return val;
      return val;
    }
    // fallback to zh
    if (node && typeof node === 'object' && 'zh' in node) {
      return node.zh;
    }
    return key;
  },

  // 带参数翻译: t('key', {name: '张三'}) => "学生: 张三"
  tf(key, params) {
    let str = this.t(key);
    if (params && typeof str === 'string') {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return str;
  },

  setLang(lang) {
    this.lang = lang;
    localStorage.setItem('nome-lang', lang);
    // 重新渲染当前页面
    if (typeof App !== 'undefined' && App.handleRoute) {
      App.handleRoute(Router.current);
    }
  },

  toggle() {
    this.setLang(this.lang === 'zh' ? 'en' : 'zh');
  },

  isZh() { return this.lang === 'zh'; },
  isEn() { return this.lang === 'en'; },
  current() { return this.lang; },
};

// 初始化
I18n.init();

// 暴露到全局
window.I18n = I18n;
window.t = (key) => I18n.t(key);
window.tf = (key, params) => I18n.tf(key, params);
