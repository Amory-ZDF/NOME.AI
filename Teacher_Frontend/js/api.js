/**
 * NOME.AI - API Adapter
 * Replaces MockData with real Teacher-Backend API calls.
 * Data shapes are transformed to match what existing pages expect.
 */

const API_BASE = 'http://localhost:3002/api/v1/teacher';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`API ${json.code} - ${json.message}`);
  return json.data;
}

const API = {
  async getDashboard() {
    const d = await apiFetch('/dashboard');
    return {
      pending: {
        ungraded:    { count: d.pending.ungradedCount, latest: d.pending.latestUngraded },
        stressAlerts:{ count: d.pending.stressAlertCount, students: d.pending.stressStudents },
        stagnant:    { count: d.pending.stagnantCount, students: d.pending.stagnantStudents },
        abnormal:    { count: d.pending.abnormalCount, details: '未完成/超时' },
      },
      weekSummary: { total: d.weekCourseCount, todayCount: 3 },
      courses: (d.todayCourses || []).map(c => ({
        id: c.id, time: c.time, endTime: c.endTime,
        student: c.studentName, class: c.className,
        type: c.courseType, subject: c.subject, status: c.status,
      })),
      assignments: (d.pendingAssignments || []).map(a => ({
        id: a.id, student: a.studentName, title: a.title,
        subject: a.subject, submittedAt: a.submittedAt, waitingDays: a.waitingDays, status: 'pending',
      })),
      alerts: (d.studentAlerts || []).map(al => ({
        id: al.id, studentId: al.studentId, student: al.studentName,
        type: al.type, message: al.message, timestamp: al.timestamp, severity: al.severity,
      })),
    };
  },

  async getCalendar() {
    const d = await apiFetch('/courses');
    return {
      today: new Date(),
      weekCourses: (d.courses || []).map(c => ({
        id: c.id, title: c.title,
        student: c.studentName, class: c.className,
        start: c.startTime, end: c.endTime, status: c.status,
      })),
    };
  },

  async getStudents(search, classId, risk) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (classId) params.set('classId', classId);
    if (risk) params.set('risk', risk);
    const qs = params.toString();
    const data = await apiFetch('/students' + (qs ? '?' + qs : ''));
    return data.map(s => ({
      id: s.id, name: s.name, avatar: s.avatar,
      score: s.currentScore, target: s.targetScore,
      status: s.status, tags: s.tags,
      lastActive: s.lastActiveAt, class: s.className,
    }));
  },

  async getStudentDetail(id) {
    const [d, kg, tags, fb, ex, sug, rw] = await Promise.all([
      apiFetch('/students/' + id),
      apiFetch('/students/' + id + '/knowledge-graph'),
      apiFetch('/students/' + id + '/tags'),
      apiFetch('/students/' + id + '/feedback?period=7d'),
      apiFetch('/students/' + id + '/execution'),
      apiFetch('/students/' + id + '/suggestions'),
      apiFetch('/students/' + id + '/recent-work'),
    ]);

    return {
      id: d.id, name: d.name, avatar: d.avatar,
      grade: d.grade, class: d.className,
      subject: (d.subjects || [])[0] || 'A-Level 数学',
      targetScore: d.targetScoreLabel,
      currentScore: d.currentScore, targetScoreNum: d.targetScore,
      stressIndex: d.stressIndex || 62, teachingStyle: d.teachingStyle || '渐进引导型',
      knowledgeGraph: kg.map(k => ({
        id: k.id, code: k.code, name: k.name, mastery: k.mastery, level: k.level,
      })),
      tags: tags.map(t => ({
        id: t.id, label: t.label, confidence: t.confidence, evidence: t.evidence, category: t.category,
      })),
      recentWork: rw.map(w => ({
        id: w.id, date: w.date,
        type: w.type === 'mock_exam' ? '模考' : w.type === 'homework' ? '作业' : '测验',
        title: w.title, score: w.score, max: w.maxScore,
      })),
      feedback: {
        accuracy: fb.accuracy, accuracyChange: fb.accuracyChange,
        avgTime: fb.avgTimePerQuestion, timeChange: fb.timeChange,
        hintsPerQuestion: fb.hintsPerQuestion,
        errorDist: fb.errorDistribution || { knowledge: 20, method: 30, calculation: 40, reading: 10, execution: 0 },
        alert: fb.alertMessage || '',
      },
      execution: {
        weeklyCompleted: ex.weeklyCompleted, weeklyTotal: ex.weeklyTotal,
        avgDelay: ex.avgDelayDays, last14Days: ex.last14Days,
      },
      suggestions: sug.map((s, i) => ({
        id: s.id, text: s.detail || s.title, type: s.type,
      })),
    };
  },

  async getAssignments() {
    return await apiFetch('/assignments');
  },

  async getReports() {
    const [ov, st, ed, at] = await Promise.all([
      apiFetch('/reports/overview'),
      apiFetch('/reports/score-trend'),
      apiFetch('/reports/error-distribution'),
      apiFetch('/reports/students?type=attention'),
    ]);

    return {
      overview: {
        classAvg:        { value: ov.classAvg.value, change: ov.classAvg.change, trend: ov.classAvg.trend || 'up' },
        completionRate:  { value: ov.completionRate.value, change: ov.completionRate.change, trend: ov.completionRate.trend || 'stable' },
        attentionNeeded: { value: ov.attentionCount.value, change: ov.attentionCount.change, trend: ov.attentionCount.trend || 'stable' },
        avgStudyTime:    { value: ov.avgStudyHours.value, change: ov.avgStudyHours.change, trend: ov.avgStudyHours.trend || 'down' },
      },
      scoreTrend: st.classAverage || [],
      errorDistribution: {
        labels: ed.labels || [],
        knowledge: (ed.series && ed.series.knowledge) || [],
        method: (ed.series && ed.series.method) || [],
        calculation: (ed.series && ed.series.calculation) || [],
        reading: (ed.series && ed.series.reading) || [],
      },
      attentionStudents: at.map(s => ({
        id: s.studentId, name: s.name, initials: s.avatar || s.name[0],
        risk: s.riskFactor || '', level: s.focusLevel || 'P1',
        avg: s.avgMinutesPerDay || 0,
        color: s.focusLevel === 'P0' ? 'error' : s.focusLevel === 'P1' ? 'warning' : 'success',
      })),
    };
  },

  async gradeSubmission(submissionId, studentId, score, comment) {
    return await apiFetch(`/submissions/${submissionId}/grade`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, score, comment }),
    });
  },

  // ===== AI 洞察（长期记忆 agent 写入共享 DB，教师端只读呈现）=====
  async getInsightsStudents() {
    return await apiFetch('/insights/students');
  },

  async getInsightsTags(studentId) {
    const qs = studentId ? '?studentId=' + encodeURIComponent(studentId) : '';
    return await apiFetch('/insights/tags' + qs);
  },

  async getInsightsReports(studentId, period) {
    const params = new URLSearchParams();
    if (studentId) params.set('studentId', studentId);
    if (period) params.set('period', period);
    const qs = params.toString();
    return await apiFetch('/insights/reports' + (qs ? '?' + qs : ''));
  },

  async getInsights() {
    const [students, tags, reports] = await Promise.all([
      this.getInsightsStudents(),
      this.getInsightsTags(),
      this.getInsightsReports(),
    ]);
    return { students, tags, reports };
  },
};
