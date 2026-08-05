/**
 * NOME.AI - Mock 数据
 */

const MockData = {
  // 当前用户
  user: {
    name: '王老师',
    role: '数学组主管',
    avatar: '王',
  },

  // ===== 教学工作台 =====
  dashboard: {
    pending: {
      ungraded: { count: 5, latest: '张三 - 数学 P3 练习' },
      stressAlerts: { count: 2, students: ['王五', '赵六'] },
      stagnant: { count: 1, students: ['周七'] },
      abnormal: { count: 2, details: '未完成/超时' },
    },
    weekSummary: {
      total: 12,
      todayCount: 3,
    },
    courses: [
      { id: 'c1', time: '10:00', endTime: '11:30', student: '张三', class: null, type: 'A-Level 数学 P3', subject: 'alevel_math', status: 'upcoming' },
      { id: 'c2', time: '14:00', endTime: '15:30', student: null, class: '高二A班', type: 'IELTS Reading', subject: 'ielts', status: 'upcoming' },
      { id: 'c3', time: '16:00', endTime: '17:30', student: '李四', class: null, type: 'A-Level 数学 P4', subject: 'alevel_math', status: 'upcoming' },
    ],
    assignments: [
      { id: 'a1', student: '张三', title: '数学 P3 Chapter 6 练习', subject: 'A-Level数学', submittedAt: getDate(-3), waitingDays: 3, status: 'pending' },
      { id: 'a2', student: '李四', title: 'IELTS Reading 剑18 T2', subject: 'IELTS', submittedAt: getDate(-1), waitingDays: 1, status: 'pending' },
      { id: 'a3', student: '王五', title: '数学 P4 微积分作业', subject: 'A-Level数学', submittedAt: getDate(0), waitingDays: 0, status: 'pending' },
    ],
    alerts: [
      { id: 'al1', studentId: 's1', student: '王五', type: 'score_drop', message: '近三次数学作业正确率从 85% 下降到 62%, 建议查看错题分布', timestamp: getDate(0, -2), severity: 'red' },
      { id: 'al2', studentId: 's2', student: '张三', type: 'repeated_error', message: '计算错误连续3次出现, 可能存在运算习惯问题', timestamp: getDate(-1), severity: 'amber' },
      { id: 'al3', studentId: 's3', student: '赵六', type: 'stress', message: '学习压力指数持续升高, 建议安排1对1沟通', timestamp: getDate(-1), severity: 'red' },
    ],
  },

  // ===== 课程日历 =====
  calendar: {
    today: new Date(),
    weekCourses: generateWeekCourses(),
  },

  // ===== 学生列表 =====
  students: [
    { id: 's1', name: '李明', avatar: '李', score: 42, target: 80, status: 'risk', tags: ['计算粗心', '视觉学习者'], lastActive: getDate(0, -2), class: '高二(1)班' },
    { id: 's2', name: '王雅静', avatar: '王', score: 78, target: 85, status: 'normal', tags: ['几何专长', '分析能力强'], lastActive: getDate(0, -10), class: '高二(1)班' },
    { id: 's3', name: '赵子豪', avatar: '赵', score: 94, target: 90, status: 'excellent', tags: ['代数精通', 'Speed Learner'], lastActive: getDate(0, -5), class: '高二(1)班' },
    { id: 's4', name: '陈思雨', avatar: '陈', score: 62, target: 80, status: 'attention', tags: ['三角函数', '逻辑思维'], lastActive: getDate(0, 0), class: '高二(2)班' },
    { id: 's5', name: '刘一帆', avatar: '刘', score: 71, target: 80, status: 'normal', tags: ['稳定型', '执行到位'], lastActive: getDate(0, -1), class: '高二(1)班' },
    { id: 's6', name: '孙文博', avatar: '孙', score: 55, target: 80, status: 'attention', tags: ['缺乏练习', '需要督促'], lastActive: getDate(-2), class: '高二(2)班' },
    { id: 's7', name: '周婷婷', avatar: '周', score: 83, target: 85, status: 'normal', tags: ['阅读强', '写作待加强'], lastActive: getDate(0, -3), class: '高二(1)班' },
    { id: 's8', name: '吴梓涵', avatar: '吴', score: 38, target: 80, status: 'risk', tags: ['基础薄弱', '需要基础补课'], lastActive: getDate(-5), class: '高二(2)班' },
  ],

  // ===== 学生档案详情 =====
  studentDetail: {
    id: 's1',
    name: '李明',
    avatar: '李',
    grade: '10年级',
    class: 'A 班',
    subject: 'A-Level 数学',
    targetScore: 'A*',
    currentScore: 78,
    targetScoreNum: 85,
    stressIndex: 62,
    teachingStyle: '渐进引导型',
    knowledgeGraph: [
      { id: 'k1', code: 'F', name: '函数', mastery: 88, level: 'mastery' },
      { id: 'k2', code: 'A', name: '代数', mastery: 75, level: 'good' },
      { id: 'k3', code: 'C', name: '微积分', mastery: 52, level: 'weak' },
      { id: 'k4', code: 'G', name: '几何', mastery: 41, level: 'critical' },
      { id: 'k5', code: 'T', name: '三角函数', mastery: 68, level: 'good' },
      { id: 'k6', code: 'S', name: '数列', mastery: 78, level: 'good' },
      { id: 'k7', code: 'V', name: '向量', mastery: 45, level: 'weak' },
      { id: 'k8', code: 'P', name: '概率', mastery: 80, level: 'mastery' },
    ],
    tags: [
      { id: 't1', label: '计算粗心', confidence: 72, evidence: '过去两周5次作业, 3次出现计算失误', category: 'learning_issue' },
      { id: 't2', label: '视觉学习者', confidence: 85, evidence: '配合图示讲解时理解速度提升40%', category: 'learning_style' },
      { id: 't3', label: '逻辑思维', confidence: 76, evidence: '方法题正确率高于平均15%', category: 'positive' },
      { id: 't4', label: '主动提问', confidence: 68, evidence: '近一周主动提问5次, 涉及3个不同知识点', category: 'positive' },
    ],
    recentWork: [
      { id: 'w1', date: getDate(-3), type: '模考', title: '期中模拟考', score: 82, max: 100 },
      { id: 'w2', date: getDate(-5), type: '作业', title: '几何练习 #4', score: 65, max: 100 },
      { id: 'w3', date: getDate(-7), type: '测验', title: '函数变换小测', score: 94, max: 100 },
      { id: 'w4', date: getDate(-10), type: '作业', title: '代数应用题', score: 78, max: 100 },
      { id: 'w5', date: getDate(-15), type: '测验', title: '周测 #3', score: 88, max: 100 },
    ],
    feedback: {
      accuracy: 72,
      accuracyChange: -15,
      avgTime: 23,
      timeChange: 5,
      hintsPerQuestion: 1.2,
      errorDist: { knowledge: 20, method: 30, calculation: 40, reading: 10, execution: 0 },
      alert: '计算错误连续3次出现, 建议下节课重点复习运算技巧, 配合 2-3 道专项计算训练',
    },
    execution: {
      weeklyCompleted: 4,
      weeklyTotal: 6,
      avgDelay: 0.5,
      last14Days: [3,2,4,3,1,0,2,3,2,4,3,2,3,1], // 14 days of completed
    },
    suggestions: [
      { id: 'sg1', text: '建议下节课前10分钟进行计算专项训练, 重点突破符号运算', type: 'method' },
      { id: 'sg2', text: '该生近期压力偏高, 建议减少作业量20%, 给学生喘息空间', type: 'pressure' },
      { id: 'sg3', text: '三角函数章节的变式题正确率提升至78%, 可以推进到下一章节', type: 'progress' },
    ],
  },

  // ===== 作业管理 =====
  assignments: [
    { id: 'as1', title: 'Chapter 6 综合练习', className: '高二A班', subject: '数学', assignedAt: getDate(-6), dueAt: getDate(-1), submitted: 18, total: 20, status: 'pending', pendingCount: 3 },
    { id: 'as2', title: 'IELTS Reading - Mock Test', className: '李四、王五', subject: '英语', assignedAt: getDate(-4), dueAt: getDate(2), submitted: 2, total: 2, status: 'pending', pendingCount: 2 },
    { id: 'as3', title: '微积分基础训练', className: '高二A班', subject: '数学', assignedAt: getDate(-9), dueAt: getDate(-4), submitted: 20, total: 20, status: 'completed', pendingCount: 0 },
    { id: 'as4', title: 'P4 力学练习', className: '张三', subject: '物理', assignedAt: getDate(-14), dueAt: getDate(-9), submitted: 1, total: 1, status: 'graded', pendingCount: 0 },
    { id: 'as5', title: '几何证明题集', className: '高二A班', subject: '数学', assignedAt: getDate(-2), dueAt: getDate(3), submitted: 12, total: 20, status: 'active', pendingCount: 0 },
  ],

  // ===== 数据报告 =====
  reports: {
    overview: {
      classAvg: { value: 76.3, change: 2.4, trend: 'up' },
      completionRate: { value: 87, change: 0, trend: 'stable' },
      attentionNeeded: { value: 3, change: 0, trend: 'stable' },
      avgStudyTime: { value: 4.2, change: -0.3, trend: 'down' },
    },
    scoreTrend: [72, 73, 75, 74, 76, 75, 77, 76, 78, 77, 76, 78, 79, 78, 80, 79, 78, 80, 81, 80, 82, 81, 80, 82, 83, 82, 81, 83, 84, 83],
    errorDistribution: {
      labels: ['第1周', '第2周', '第3周', '第4周'],
      knowledge: [25, 22, 20, 18],
      method: [30, 32, 30, 28],
      calculation: [35, 36, 38, 40],
      reading: [10, 10, 12, 14],
    },
    attentionStudents: [
      { id: 's4', name: '陈思雨', initials: '陈', risk: 'Logic Gap', level: 'High (P0)', avg: 78, color: 'error' },
      { id: 's5', name: '王雅静', initials: '王', risk: 'Calculation Fluency', level: 'Medium (P1)', avg: 42, color: 'warning' },
      { id: 's6', name: '刘一帆', initials: '刘', risk: 'Attention Drift', level: 'Low (P2)', avg: 115, color: 'success' },
    ],
  },
};

// ===== 辅助函数：生成日期 =====
function getDate(daysOffset = 0, hoursOffset = null) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  if (hoursOffset !== null) {
    d.setHours(d.getHours() + hoursOffset);
  }
  return d.toISOString();
}

// ===== 辅助函数：生成本周课程 =====
function generateWeekCourses() {
  const courses = [];
  const today = new Date();
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayOfWeek + 1);

  const templates = [
    { hour: 9, duration: 90, student: '张三', type: 'A-Level 数学 P3' },
    { hour: 10, duration: 90, student: '李四', type: 'A-Level 物理' },
    { hour: 14, duration: 90, class: '高二A班', type: 'IELTS Reading' },
    { hour: 15, duration: 60, student: '王五', type: 'A-Level 数学 P3' },
    { hour: 16, duration: 90, student: '赵六', type: 'A-Level 化学' },
  ];

  // 随机生成本周的课程
  for (let i = 0; i < 5; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dayCourses = templates.slice(0, Math.floor(Math.random() * 3) + 1);
    dayCourses.forEach((t, idx) => {
      if (Math.random() > 0.4) {
        const start = new Date(day);
        start.setHours(t.hour + idx, 0, 0, 0);
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + t.duration);
        courses.push({
          id: `wk-${i}-${idx}`,
          title: t.type,
          student: t.student,
          class: t.class,
          start: start.toISOString(),
          end: end.toISOString(),
          status: start < new Date() ? 'completed' : 'upcoming',
        });
      }
    });
  }
  return courses;
}

// ===== 暴露到全局 =====
window.MockData = MockData;
