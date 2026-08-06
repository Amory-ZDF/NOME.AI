// ============================================================
// NOME.AI Student App — Mock data (aligned with student-prd.md models)
// NOTE: This module is the mock adapter for the API layer (src/api).
// ============================================================

export const student = {
  id: 'stu-001',
  name: 'Alex',
  avatar: null,
  joinedDays: 45,
  gradeInfo: 'A-Level · Year 12 Science',
}

// ---------------- Tasks ----------------
export const initialTasks = [
  {
    id: 't-overdue',
    title: 'Physics Chapter 3 · Momentum Conservation Practice',
    type: 'teacher_assigned',
    subject: 'Physics',
    estimatedMinutes: 40,
    dueAt: '2026-08-04T22:00:00',
    assignedBy: 'Mr. Chen',
    priority: 'P1',
    isOverdue: true,
    status: 'pending',
  },
  {
    id: 't1',
    title: 'Math P3 Ch7 Review · Calculus Extrema Set',
    type: 'teacher_assigned',
    subject: 'A-Level Math',
    estimatedMinutes: 45,
    dueAt: '2026-08-05T22:00:00',
    assignedBy: 'Ms. Wang',
    priority: 'P0',
    lastAccuracy: 62,
    isOverdue: false,
    status: 'pending',
    exerciseSetId: 'set-t1',
  },
  {
    id: 't2',
    title: 'IELTS Reading · Cambridge 18 Test 2 Passage 1',
    type: 'teacher_assigned',
    subject: 'IELTS Reading',
    estimatedMinutes: 30,
    dueAt: '2026-08-06T20:00:00',
    assignedBy: 'Ms. Li',
    priority: 'P1',
    isOverdue: false,
    status: 'pending',
    exerciseSetId: 'set-t2',
  },
  {
    id: 't3',
    title: 'Error Review · 3 questions (Derivative calculation)',
    type: 'error_review',
    subject: 'A-Level Math',
    estimatedMinutes: 20,
    dueAt: null,
    assignedBy: null,
    priority: 'P2',
    isOverdue: false,
    status: 'pending',
  },
  {
    id: 't4',
    title: 'Trigonometry Variant Drill (AI recommended)',
    type: 'ai_recommended',
    subject: 'A-Level Math',
    estimatedMinutes: 25,
    dueAt: '2026-08-07T22:00:00',
    assignedBy: null,
    priority: 'P2',
    isOverdue: false,
    status: 'pending',
  },
]

export const greetingData = {
  message: 'Your trigonometry accuracy improved by 12% — keep it up!',
  fallback: 'A little progress every day adds up faster than you think.',
}

// ---------------- Exercise sets ----------------
// hints: L1 clarify L2 knowledge L3 method L4 key step L5 full solution (L6 = variant after solving)
const mkHints = (h1, h2, h3, h4, h5) => [
  { level: 1, title: 'Clarify the Question', content: h1 },
  { level: 2, title: 'Relevant Knowledge', content: h2 },
  { level: 3, title: 'Method Hint', content: h3 },
  { level: 4, title: 'Key Step', content: h4 },
  { level: 5, title: 'Full Solution', content: h5 },
]

export const exerciseSets = {
  'set-t1': {
    taskId: 't1',
    title: 'Math P3 · Ch7 Review Practice',
    subject: 'A-Level Math',
    questions: [
      {
        id: 'q1',
        order: 1,
        type: 'calculation',
        topic: 'Calculus - Differentiation',
        difficulty: 3,
        content: `Given <span class="math">f(x) = x<sup>3</sup> − 3x<sup>2</sup> + 2</span>, find <span class="math">f′(x)</span> and evaluate <span class="math">f′(2)</span>.`,
        acceptKeywords: ['0'],
        correctDisplay: "f′(x) = 3x² − 6x, so f′(2) = 0",
        errorType: 'calculation',
        hints: mkHints(
          'What is the question asking? First find the derivative f′(x), then substitute x = 2. What is the power rule?',
          'Recall the power rule: (xⁿ)′ = n·xⁿ⁻¹, and the derivative of a constant is 0.',
          'Differentiate term by term: the derivative of x³ is 3x², of −3x² is −6x, and of the constant 2 is 0.',
          'f′(x) = 3x² − 6x. Substitute x = 2: f′(2) = 3×4 − 6×2 = 12 − 12 = 0.',
          'Full solution: f′(x) = 3x² − 6x; f′(2) = 3(2)² − 6(2) = 12 − 12 = 0.'
        ),
      },
      {
        id: 'q2',
        order: 2,
        type: 'choice',
        topic: 'Calculus - Extrema',
        difficulty: 3,
        content: `To find the absolute maximum and minimum of <span class="math">f(x) = 2x<sup>3</sup> − 5x<sup>2</sup> + 3x − 1</span> on the closed interval [0, 2], which method should you use?`,
        options: [
          'A. Compare only the endpoint values f(0) and f(2)',
          'B. Solve f′(x)=0 for critical points, then compare values at critical points and endpoints',
          'C. Simply sketch the graph and eyeball the highest point',
          'D. Solve f″(x)=0 and those points are enough',
        ],
        correctIndex: 1,
        acceptKeywords: ['B'],
        correctDisplay: 'B. Solve f′(x)=0 for critical points, then compare values at critical points and endpoints',
        errorType: 'method',
        hints: mkHints(
          'Where can the extrema of a continuous function on a closed interval occur? Only at the endpoints?',
          'Extreme value theorem: extrema occur at critical points (f′(x)=0 or derivative undefined) or at interval endpoints.',
          'Full workflow: ① find f′(x); ② solve f′(x)=0 for critical points inside the interval; ③ evaluate the function at all critical points and endpoints; ④ compare to get max/min.',
          'f′(x) = 6x² − 10x + 3 = 0 gives x = (5±√7)/6, both inside [0,2]. Then evaluate and compare f(0), f(2) and the two critical points.',
          'Full solution: f′(x)=6x²−10x+3=0 → x=(5±√7)/6. Values: f(0)=−1, f(2)=5, critical values ≈ 0.35 and −1.63. Max is 5, min ≈ −1.63. Answer: B.'
        ),
      },
      {
        id: 'q3',
        order: 3,
        type: 'calculation',
        topic: 'Calculus - Extrema',
        difficulty: 4,
        content: `Given <span class="math">f(x) = 2x<sup>3</sup> − 5x<sup>2</sup> + 3x − 1</span>, find the maximum and minimum values of <span class="math">f(x)</span> on the interval [0, 2].`,
        acceptKeywords: ['5'],
        correctDisplay: 'Maximum f(2) = 5; minimum ≈ −1.63 (at the critical point)',
        errorType: 'calculation',
        hints: mkHints(
          'What are you asked to find? Among which candidate points must the max and min be compared?',
          'Candidates for extrema on a closed interval = stationary points (f′(x)=0) + interval endpoints.',
          'Differentiate f(x), solve f′(x)=0 to find critical points, then compare function values together with the endpoints.',
          'f′(x) = 6x² − 10x + 3 = 0 gives x = (5±√7)/6 ≈ 0.392 and 1.274. Values: f(0)=−1, f(2)=5, f(0.392)≈−0.37, f(1.274)≈−1.63.',
          'Full solution: comparing candidates: f(0)=−1, f(2)=5, f((5−√7)/6)≈−0.37, f((5+√7)/6)≈−1.63. Maximum 5 (at x=2); minimum ≈ −1.63.'
        ),
      },
      {
        id: 'q4',
        order: 4,
        type: 'fill_blank',
        topic: 'Limits - L\'Hôpital\'s Rule',
        difficulty: 2,
        content: `Evaluate the limit: <span class="math">lim<sub>x→0</sub> (sin 2x) / x</span> = ______.`,
        acceptKeywords: ['2'],
        correctDisplay: '2',
        errorType: 'knowledge',
        hints: mkHints(
          'This is a 0/0 form limit. What tools do you know for 0/0 limits?',
          'Standard limit lim(x→0) sin x / x = 1, or L\'Hôpital\'s rule (differentiate numerator and denominator separately).',
          'Method 1: let t = 2x, then sin 2x / x = 2·(sin t / t) → 2×1. Method 2: L\'Hôpital: (sin 2x)′/(x)′ = 2cos 2x / 1.',
          'By L\'Hôpital: lim (2cos 2x)/1 = 2cos 0 = 2.',
          'Answer: 2. Using lim(x→0) sin x/x = 1, the expression = 2·lim(2x→0) sin(2x)/(2x) = 2.'
        ),
      },
      {
        id: 'q5',
        order: 5,
        type: 'choice',
        topic: 'Trigonometry - Double Angle',
        difficulty: 2,
        content: `Which expression equals <span class="math">cos 2θ</span>?`,
        options: [
          'A. 2sin θ cos θ',
          'B. cos²θ − sin²θ',
          'C. sin²θ + cos²θ',
          'D. 1 + 2sin²θ',
        ],
        correctIndex: 1,
        acceptKeywords: ['B'],
        correctDisplay: 'B. cos²θ − sin²θ',
        errorType: 'knowledge',
        hints: mkHints(
          'The question asks for the double-angle formula for cosine. Can you write the addition formula cos(α+β)?',
          'cos(α+β) = cos α cos β − sin α sin β. What happens when α = β = θ?',
          'Substitute α = β = θ into the addition formula to derive the first form of cos 2θ.',
          'cos 2θ = cos(θ+θ) = cos θ cos θ − sin θ sin θ = cos²θ − sin²θ.',
          'Answer: B. cos 2θ = cos²θ − sin²θ (equivalently 1 − 2sin²θ or 2cos²θ − 1). Note that A is the formula for sin 2θ.'
        ),
      },
      {
        id: 'q6',
        order: 6,
        type: 'calculation',
        topic: 'Calculus - Tangent Line',
        difficulty: 3,
        content: `Find the equation of the tangent line to <span class="math">y = x<sup>2</sup> + 1</span> at the point (1, 2).`,
        acceptKeywords: ['y = 2x', 'y=2x', '2x'],
        correctDisplay: 'y = 2x',
        errorType: 'method',
        hints: mkHints(
          'What two pieces of information does a tangent line need? The point is given — what is missing?',
          'Slope of the tangent = the derivative evaluated at the point. Point-slope form: y − y₀ = k(x − x₀).',
          'First find y′ = 2x, substitute x = 1 for the slope k, then use point-slope form.',
          'y′ = 2x, k = y′(1) = 2. Point-slope: y − 2 = 2(x − 1), which simplifies to y = 2x.',
          'Full solution: y′ = 2x → k = 2; y − 2 = 2(x − 1) → y = 2x.'
        ),
      },
    ],
  },
  'set-t2': {
    taskId: 't2',
    title: 'IELTS Reading · Cambridge 18 Test 2 P1',
    subject: 'IELTS Reading',
    questions: [
      {
        id: 'r1',
        order: 1,
        type: 'choice',
        topic: 'Reading Skills - Detail Location',
        difficulty: 2,
        content: `Passage 1 discusses barriers to adopting green roofs. According to the passage, which is explicitly stated as the main barrier?`,
        options: [
          'A. A lack of technical expertise for installation',
          'B. High upfront installation cost and a long payback period',
          'C. Government regulations banning retrofits on old buildings',
          'D. Complete public disinterest in green roofs',
        ],
        correctIndex: 1,
        acceptKeywords: ['B'],
        correctDisplay: 'B. High upfront installation cost and a long payback period',
        errorType: 'reading',
        hints: mkHints(
          'The question asks what is "explicitly stated". Locate the paragraph about green roof barriers/obstacles first.',
          'IELTS detail questions hinge on locating keywords + synonym replacement. The passage uses "high upfront costs" and "long payback period".',
          'Distinguish "explicitly stated" from "inferred". Options A/C/D have no direct support in the text or over-infer.',
          'Paragraph two: "The main barrier remains the high upfront installation cost, combined with a long payback period..."',
          'Answer: B. The passage\'s "high upfront installation cost" and "long payback period" correspond directly to option B via synonym replacement.'
        ),
      },
      {
        id: 'r2',
        order: 2,
        type: 'choice',
        topic: 'Reading Skills - True/False',
        difficulty: 3,
        content: `Statement: "Toronto has mandated green roofs on all new commercial buildings since the 1990s." Is this TRUE, FALSE or NOT GIVEN?`,
        options: ['A. TRUE', 'B. FALSE', 'C. NOT GIVEN'],
        correctIndex: 1,
        acceptKeywords: ['B', 'FALSE'],
        correctDisplay: 'B. FALSE',
        errorType: 'reading',
        hints: mkHints(
          'What do the three options mean? FALSE requires a direct contradiction with the passage.',
          'Locate the keywords: Toronto, 1990s, mandatory, commercial buildings.',
          'The passage says Toronto "encourages" green roofs rather than "mandates" them, and the scope differs.',
          'Passage: "Toronto has encouraged green roofs since the 1990s through incentive programs" — encouraged ≠ mandated.',
          'Answer: B (FALSE). The passage describes an incentive-based policy, directly contradicting "mandated".'
        ),
      },
      {
        id: 'r3',
        order: 3,
        type: 'fill_blank',
        topic: 'Reading Skills - Gap Fill',
        difficulty: 2,
        content: `Fill in the blank (NO MORE THAN TWO WORDS): Studies show green roofs can cut building cooling energy demand by up to ______.`,
        acceptKeywords: ['25%', '25 percent'],
        correctDisplay: '25%',
        errorType: 'reading',
        hints: mkHints(
          'Locate: cooling energy / reduce. Note the "no more than two words" limit.',
          'Scan for numbers and percent signs — the answer is usually nearby.',
          'The passage contains "cooling energy demand by up to 25%".',
          'Passage: "Studies show green roofs can cut cooling energy demand by up to 25% in summer."',
          'Answer: 25%.'
        ),
      },
    ],
  },
}

// Bank single-question sets reuse the same structure
export const bankExerciseSets = {
  'bq1': { title: 'Bank Practice · Second Derivative', subject: 'A-Level Math', questions: [
    { ...exerciseSets['set-t1'].questions[1], id: 'bq1-q1', order: 1 },
  ]},
  'bq2': { title: 'Bank Practice · Proof by Induction', subject: 'A-Level Math', questions: [
    {
      id: 'bq2-q1', order: 1, type: 'proof', topic: 'Algebra - Mathematical Induction', difficulty: 4,
      content: `Prove by mathematical induction that for any positive integer <span class="math">n</span>, the sum of the first <span class="math">n</span> squares equals <span class="math">n(n+1)(2n+1)/6</span>.`,
      acceptKeywords: ['n=1', 'k+1', 'induction'],
      correctDisplay: 'Two induction steps: verify n=1; assume n=k and prove n=k+1.',
      errorType: 'method',
      hints: mkHints(
        'What are the two steps of mathematical induction?',
        '① Verify the base case n=1; ② assume n=k holds, then prove n=k+1 holds.',
        'For n=k+1, the left side = 1²+2²+…+k²+(k+1)². Substitute the induction hypothesis for the first k terms.',
        'k(k+1)(2k+1)/6 + (k+1)² = (k+1)[k(2k+1)+6(k+1)]/6 = (k+1)(k+2)(2k+3)/6, exactly the formula for n=k+1.',
        'Full proof: n=1 gives 1=1×2×3/6 ✓; assume n=k, then for n=k+1 the sum is k(k+1)(2k+1)/6+(k+1)²=(k+1)(k+2)(2k+3)/6 ✓. By induction the formula holds.'
      ),
    },
  ]},
  'bq3': { title: 'Bank Practice · Fraction Simplification', subject: 'A-Level Math', questions: [
    {
      id: 'bq3-q1', order: 1, type: 'choice', topic: 'Algebra - Factorisation', difficulty: 1,
      content: `Simplify: <span class="math">(x<sup>2</sup> − 9) / (x + 3)</span>, where <span class="math">x ≠ −3</span>.`,
      options: ['A. x − 3', 'B. x + 3', 'C. x² − 3', 'D. Cannot be simplified'],
      correctIndex: 0,
      acceptKeywords: ['A', 'x - 3', 'x-3'],
      correctDisplay: 'A. x − 3',
      errorType: 'knowledge',
      hints: mkHints('Can the numerator be factorised? What structure is x²−9?', 'Difference of squares: a²−b² = (a+b)(a−b).', 'x²−9 = (x+3)(x−3), then cancel with the denominator.', 'x²−9 = (x+3)(x−3), so the expression = (x−3) (x≠−3).', 'Answer: A. Factor with difference of squares and cancel (x+3).'),
    },
  ]},
}

// ---------------- Error book ----------------
export const initialErrors = [
  {
    id: 'e1',
    questionId: 'q-err-1',
    subject: 'A-Level Math',
    errorType: 'calculation',
    questionSummary: 'Given f(x)=2x³−5x²+3x−1, find the max and min on the interval [0,2].',
    questionContent: `Given <span class="math">f(x) = 2x<sup>3</sup> − 5x<sup>2</sup> + 3x − 1</span>, find the maximum and minimum values of <span class="math">f(x)</span> on the interval [0, 2].`,
    errorDescription: 'Sign slip in calculation: dropped the negative sign on −10x after differentiating, leading to wrong critical points.',
    relatedTopic: 'Calculus - Differentiation',
    topicId: 'calculus-deriv',
    firstOccurredAt: '2026-07-30',
    lastOccurredAt: '2026-07-30',
    repeatCount: 2,
    status: 'pending_review',
    studentAnswer: "f'(x) = 6x² + 10x + 3 (sign error)",
    correctAnswer: "f'(x) = 6x² − 10x + 3, critical points x=(5±√7)/6; max f(2)=5, min ≈ −1.63",
    analysis: 'Root cause is sign handling. Suggestion: after differentiating, check each term\'s sign and verify f′(x) at a test point (e.g. x=1).',
    acceptKeywords: ['5'],
    redoHistory: [],
  },
  {
    id: 'e2',
    questionId: 'q-err-2',
    subject: 'IELTS Reading',
    errorType: 'reading',
    questionSummary: 'T/F/NG: Toronto has mandated green roofs on new commercial buildings since the 1990s.',
    questionContent: `Statement: "Toronto has mandated green roofs on all new commercial buildings since the 1990s." Is this TRUE, FALSE or NOT GIVEN?`,
    errorDescription: 'Misreading: failed to distinguish "encourage" from "mandate"; read incentive programs as mandatory regulation.',
    relatedTopic: 'Reading Skills - True/False',
    topicId: 'ielts-tfng',
    firstOccurredAt: '2026-07-28',
    lastOccurredAt: '2026-07-28',
    repeatCount: 1,
    status: 'reviewing',
    studentAnswer: 'NOT GIVEN',
    correctAnswer: 'FALSE — the passage describes an incentive policy, directly contradicting "mandated"',
    analysis: 'In T/F/NG, a direct contradiction between passage and statement means FALSE. Watch modal/degree word swaps: mandatory vs encourage.',
    acceptKeywords: ['b', 'false'],
    options: ['A. TRUE', 'B. FALSE', 'C. NOT GIVEN'],
    correctIndex: 1,
    redoHistory: [],
  },
  {
    id: 'e3',
    questionId: 'q-err-3',
    subject: 'A-Level Math',
    errorType: 'method',
    questionSummary: 'Find the tangent line to y = x² + 1 at the point (1, 2).',
    questionContent: `Find the equation of the tangent line to <span class="math">y = x<sup>2</sup> + 1</span> at the point (1, 2).`,
    errorDescription: 'Method error: plugged the point into the original function instead of using the derivative for the tangent slope.',
    relatedTopic: 'Calculus - Tangent Line',
    topicId: 'calculus-tangent',
    firstOccurredAt: '2026-07-22',
    lastOccurredAt: '2026-08-01',
    repeatCount: 2,
    status: 'mastered',
    studentAnswer: 'y = 2x + 1',
    correctAnswer: 'y = 2x',
    analysis: 'Tangent slope = derivative value. y′ = 2x, k = y′(1) = 2, point-slope gives y − 2 = 2(x − 1) → y = 2x.',
    acceptKeywords: ['y = 2x', 'y=2x'],
    redoHistory: [{ attemptedAt: '2026-08-01', answer: 'y = 2x', isCorrect: true, timeSpent: 180 }],
  },
]

export const ERROR_TYPE_META = {
  calculation: { label: 'Calculation', color: '#D97706' },
  method: { label: 'Method', color: '#0EA5E9' },
  knowledge: { label: 'Knowledge', color: '#0D9488' },
  reading: { label: 'Misreading', color: '#78716C' },
  execution: { label: 'Execution', color: '#8B5CF6' },
}

// ---------------- Notes ----------------
export const initialNoteFolders = [
  {
    id: 'f-math', name: 'A-Level Math', noteCount: 12, autoCreated: true,
    children: [
      { id: 'f-math-ch6', name: 'Ch6 Trigonometry', parentId: 'f-math', noteCount: 5, autoCreated: true },
      { id: 'f-math-ch7', name: 'Ch7 Calculus', parentId: 'f-math', noteCount: 7, autoCreated: true },
    ],
  },
  {
    id: 'f-ielts', name: 'IELTS', noteCount: 16, autoCreated: true,
    children: [
      { id: 'f-ielts-read', name: 'Reading', parentId: 'f-ielts', noteCount: 8, autoCreated: true },
      { id: 'f-ielts-write', name: 'Writing', parentId: 'f-ielts', noteCount: 5, autoCreated: true },
      { id: 'f-ielts-vocab', name: 'Vocabulary', parentId: 'f-ielts', noteCount: 3, autoCreated: true },
    ],
  },
]

export const initialNotes = [
  {
    id: 'n1',
    title: 'Trigonometry Formula Derivations',
    folderId: 'f-math-ch6',
    folderPath: 'A-Level Math / Ch6 Trigonometry',
    tags: ['formulas', 'derivation'],
    linkedTopics: ['trig-double-angle'],
    linkedErrors: ['e1'],
    source: 'typed',
    createdAt: '2026-07-28',
    updatedAt: '2026-07-30',
    content: [
      { t: 'p', v: 'Double-angle formulas are derived from the addition formulas — a core exam point for Ch6.' },
      { t: 'h', v: 'Double Angle Formulas' },
      { t: 'formula', v: 'cos 2θ = cos²θ − sin²θ = 1 − 2sin²θ = 2cos²θ − 1' },
      { t: 'formula', v: 'sin 2θ = 2 sin θ cos θ' },
      { t: 'p', v: 'Memory tip: cos 2θ has three equivalent forms — pick the one that fits the given conditions. Recognise 1−2sin²θ instantly.' },
      { t: 'p', v: 'Common mistake: writing sin 2θ as sin²θ — that confuses angle doubling with powers.' },
    ],
    aiSuggestions: [
      { type: 'split_note', message: 'Suggest splitting the "Double Angle" section into a standalone note to link better with error e1.' },
      { type: 'related_content', message: 'High overlap found with "Ch6 Addition Formulas note" — consider a two-way link.' },
    ],
  },
  {
    id: 'n2',
    title: 'Calculus: Extrema Solving Steps',
    folderId: 'f-math-ch7',
    folderPath: 'A-Level Math / Ch7 Calculus',
    tags: ['extrema', 'workflow'],
    linkedTopics: ['calculus-extrema'],
    linkedErrors: ['e1'],
    source: 'ai_organized',
    createdAt: '2026-07-25',
    updatedAt: '2026-08-02',
    content: [
      { t: 'p', v: 'Standard workflow for extrema of continuous functions on closed intervals (class summary + AI organised).' },
      { t: 'h', v: 'The Four-Step Method' },
      { t: 'p', v: '① Differentiate f′(x); ② solve f′(x)=0 for critical points inside the interval; ③ evaluate critical points AND endpoints; ④ compare to get the extrema.' },
      { t: 'formula', v: 'f′(x) = 0 ⇒ critical point candidates; endpoints always checked' },
      { t: 'p', v: 'Classic pitfall: forgetting the endpoints! Extrema on a closed interval always occur at critical points or endpoints.' },
    ],
    aiSuggestions: [
      { type: 'link_topic', message: 'This note matches syllabus Unit 7.2 "Extrema" with 94% confidence — link it?' },
    ],
  },
  {
    id: 'n3',
    title: 'IELTS Reading: T/F/NG Strategy',
    folderId: 'f-ielts-read',
    folderPath: 'IELTS / Reading',
    tags: ['T/F/NG', 'strategy'],
    linkedTopics: ['ielts-tfng'],
    linkedErrors: ['e2'],
    source: 'handwritten',
    createdAt: '2026-07-20',
    updatedAt: '2026-07-28',
    content: [
      { t: 'p', v: 'TRUE: statement matches the passage via synonym replacement; FALSE: direct contradiction; NOT GIVEN: not mentioned or undecidable.' },
      { t: 'h', v: 'Key Principles' },
      { t: 'p', v: 'FALSE requires finding an actual contradiction point, not just "not mentioned". Modal verbs (must/should/can) and degree words (all/some) are frequent traps.' },
      { t: 'p', v: 'Workflow: underline keywords → scan to locate the paragraph → read closely and compare.' },
    ],
    aiSuggestions: [
      { type: 'link_topic', message: 'Detected direct relevance to error e2 (Toronto green roofs T/F/NG) — auto-linked.' },
    ],
  },
  {
    id: 'n4',
    title: 'IELTS Paraphrase List 3',
    folderId: 'f-ielts-vocab',
    folderPath: 'IELTS / Vocabulary',
    tags: ['vocabulary'],
    linkedTopics: [],
    linkedErrors: [],
    source: 'typed',
    createdAt: '2026-07-18',
    updatedAt: '2026-07-18',
    content: [
      { t: 'p', v: 'barrier ↔ obstacle / hurdle; mandatory ↔ compulsory / required; incentive ↔ motivation.' },
      { t: 'p', v: 'Synonym replacement is the core of reading questions — collect 10 pairs per day.' },
    ],
    aiSuggestions: [],
  },
]

// ---------------- Question bank ----------------
export const bankQuestions = [
  {
    id: 'bq1', subject: 'A-Level Math', topic: 'Calculus - Second Derivative', chapter: 'Ch7 Calculus',
    type: 'choice', difficulty: 5, source: 'past_exam', sourceDetail: 'May 2025 Past Paper',
    correctRate: 64, attemptCount: 842, studentStatus: 'correct', setId: 'bq1',
    preview: 'Given f(x) = sin(x²), find the second derivative f″(x) and evaluate it at x = √(π/2)…',
  },
  {
    id: 'bq2', subject: 'A-Level Math', topic: 'Algebra - Induction', chapter: 'Ch2 Proof',
    type: 'proof', difficulty: 4, source: 'mock', sourceDetail: 'Standard Textbook',
    correctRate: 28, attemptCount: 2100, studentStatus: 'not_attempted', setId: 'bq2',
    preview: 'Prove by induction that for any positive integer n, the sum of the first n squares is n(n+1)(2n+1)/6…',
  },
  {
    id: 'bq3', subject: 'A-Level Math', topic: 'Algebra - Factorisation', chapter: 'Ch1 Algebra',
    type: 'choice', difficulty: 2, source: 'past_exam', sourceDetail: 'May 2025 Past Paper',
    correctRate: 92, attemptCount: 7200, studentStatus: 'correct', setId: 'bq3',
    preview: 'Simplify the expression (x² − 9)/(x + 3) where x ≠ −3…',
  },
  {
    id: 'bq4', subject: 'A-Level Math', topic: 'Calculus - Extrema', chapter: 'Ch7 Calculus',
    type: 'calculation', difficulty: 3, source: 'past_exam', sourceDetail: 'Oct 2024 Past Paper',
    correctRate: 63, attemptCount: 2341, studentStatus: 'wrong', setId: 'bq1',
    preview: 'Given f(x) = x³ − 6x² + 9x + 1, find its local maximum and minimum values on R…',
  },
  {
    id: 'bq5', subject: 'A-Level Math', topic: 'Trigonometry - Double Angle', chapter: 'Ch6 Trigonometry',
    type: 'choice', difficulty: 2, source: 'teacher_upload', sourceDetail: 'Uploaded by Ms. Wang',
    correctRate: 78, attemptCount: 456, studentStatus: 'not_attempted', setId: 'bq3',
    preview: 'If sin θ = 3/5 and θ is in the second quadrant, the value of cos 2θ is…',
  },
  {
    id: 'bq6', subject: 'IELTS Reading', topic: 'Reading Skills - Matching', chapter: 'Cambridge 18',
    type: 'reading', difficulty: 3, source: 'past_exam', sourceDetail: 'Cambridge 18 Test 3',
    correctRate: 55, attemptCount: 1200, studentStatus: 'not_attempted', setId: null,
    preview: 'Reading Passage 2 information matching: match 5 statements to paragraphs A–F…',
  },
]

export const bankRecommendations = [
  { questionId: 'bq4', reason: 'Targets your weak topic: Calculus – Extrema (mastery 48%)' },
  { questionId: 'bq5', reason: 'Double-angle accuracy improved last week — consolidate it' },
  { questionId: 'bq2', reason: 'Induction is an untried high-frequency topic (global accuracy only 28%)' },
]

// ---------------- Profile ----------------
export const profileOverview = {
  currentScore: 78,
  targetScore: 85,
  dailyHours: 4.2,
  streak: 7,
  bestStreak: 14,
  totalQuestions: 156,
  overallAccuracy: 71,
}

export const knowledgeGraphData = {
  'A-Level Math': {
    nodes: [
      { id: 'algebra', name: 'Algebra', mastery: 85, weight: 20, x: 110, y: 90 },
      { id: 'trig', name: 'Trigonometry', mastery: 74, weight: 18, x: 300, y: 60 },
      { id: 'calculus', name: 'Calculus', mastery: 55, weight: 28, x: 250, y: 200 },
      { id: 'complex', name: 'Complex Numbers', mastery: 32, weight: 12, x: 430, y: 140 },
      { id: 'vectors', name: 'Vectors', mastery: 66, weight: 14, x: 450, y: 260 },
      { id: 'proof', name: 'Proof', mastery: 48, weight: 10, x: 90, y: 240 },
    ],
    edges: [
      ['algebra', 'calculus'], ['algebra', 'trig'], ['trig', 'calculus'],
      ['calculus', 'complex'], ['calculus', 'vectors'], ['algebra', 'proof'],
    ],
  },
  'IELTS Reading': {
    nodes: [
      { id: 'detail', name: 'Detail Location', mastery: 80, weight: 22, x: 120, y: 100 },
      { id: 'tfng', name: 'T/F/NG', mastery: 52, weight: 20, x: 320, y: 70 },
      { id: 'match', name: 'Matching', mastery: 45, weight: 18, x: 440, y: 200 },
      { id: 'fill', name: 'Gap Fill', mastery: 71, weight: 16, x: 180, y: 250 },
    ],
    edges: [['detail', 'tfng'], ['detail', 'fill'], ['tfng', 'match'], ['fill', 'match']],
  },
}

export const progressTimeline = [
  { date: '07-06', mastery: 52 }, { date: '07-09', mastery: 54 }, { date: '07-12', mastery: 55 },
  { date: '07-15', mastery: 58, event: 'Started trig focused drill' }, { date: '07-18', mastery: 61 },
  { date: '07-21', mastery: 63 }, { date: '07-24', mastery: 66 }, { date: '07-27', mastery: 70 },
  { date: '07-30', mastery: 71, event: 'Trigonometry reached fluent' }, { date: '08-02', mastery: 75 },
  { date: '08-05', mastery: 78 },
]

export const errorPatternData = {
  distribution: { calculation: 40, method: 30, knowledge: 20, reading: 10 },
  insight: 'Calculation slips are your biggest issue (40%), and 42% of them happen during differentiation. Build a habit of substituting a test point back into f′(x) to verify.',
}

export const achievements = [
  { id: 'a1', name: '7-Day Streak', description: 'Studied 7 days in a row', icon: '🔥', earned: true, earnedAt: '2026-08-03', category: 'persistence' },
  { id: 'a2', name: 'First Full Score', description: 'A perfect practice session', icon: '⭐', earned: true, earnedAt: '2026-07-26', category: 'breakthrough' },
  { id: 'a3', name: 'Review ×10', description: 'Completed 10 error redos', icon: '📌', earned: true, earnedAt: '2026-08-01', category: 'habit' },
  { id: 'a4', name: 'Independent ×50', description: '50 correct answers without hints', icon: '💪', earned: true, earnedAt: '2026-07-30', category: 'habit' },
  { id: 'a5', name: '30-Day Streak', description: 'Studied 30 days in a row', icon: '🗓️', earned: false, category: 'persistence', progress: { current: 7, target: 30 } },
  { id: 'a6', name: 'All Subjects Mastered', description: 'Every topic at ≥80% mastery', icon: '🏆', earned: false, category: 'milestone', progress: { current: 3, target: 12 } },
  { id: 'a7', name: '1K Questions', description: '1000 total questions practiced', icon: '⚔️', earned: false, category: 'milestone', progress: { current: 156, target: 1000 } },
  { id: 'a8', name: 'Zero-Hint Week', description: 'A full week without any hints', icon: '🎯', earned: false, category: 'breakthrough' },
]

// ---------------- Homepage ----------------
export const moduleStats = {
  notesCount: 28,
  weeklyExercises: 12,
  latestAccuracy: 78,
  pendingErrorReview: 2,
}

export const learningSummary = {
  overallMastery: 62,
  weeklyCompleted: 12,
  weeklyTotal: 15,
  overdueTasks: 1,
  weakTopics: ['Calculus - Extrema', 'Complex Numbers'],
  knowledgeHeatmap: (() => {
    const topics = [
      ['Quadratics', 88], ['Inequalities', 82], ['Sequences', 76], ['Exp & Log', 71], ['Trig Basics', 74], ['Double Angle', 68], ['Sum-to-Product', 45],
      ['Limits', 62], ['Differentiation', 58], ['Extrema', 48], ['Tangents', 66], ['Integration', 42], ['Definite Integral', 35], ['Diff. Equations', 22],
      ['Complex Arith.', 30], ['Argand Plane', 38], ['Vector Addition', 72], ['Dot Product', 64], ['Cross Product', 41], ['Parametric', 55], ['Polar Coord.', 47],
      ['Induction', 49], ['Contradiction', 70], ['Permutations', 61], ['Probability', 67], ['Statistics', 73], ['Reading Comp.', 80], ['Essay Structure', 63],
    ]
    return topics.map(([topicName, mastery], i) => ({ topicId: `hm-${i}`, topicName, mastery }))
  })(),
}

export const defaultSettings = {
  tone: 35, // 0 encouraging ←→ 100 strict coach
  dailyGoalHours: 4,
  reminderTask: true,
  reminderErrorReview: true,
  reminderStudyTime: false,
}

export function createSeedState() {
  return structuredClone({
    student,
    tasks: initialTasks,
    greeting: greetingData,
    exerciseSets,
    bankExerciseSets,
    errors: initialErrors,
    errorTypeMeta: ERROR_TYPE_META,
    noteFolders: initialNoteFolders,
    notes: initialNotes,
    bankQuestions,
    bankRecommendations,
    profileOverview,
    knowledgeGraphData,
    progressTimeline,
    errorPatternData,
    achievements,
    moduleStats,
      learningSummary,
      sessions: [],
      taskAdjustments: [],
      settings: defaultSettings,
  })
}
