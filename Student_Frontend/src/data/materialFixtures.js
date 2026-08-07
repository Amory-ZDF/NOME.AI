const FIXTURE_DEFINITIONS = {
  alevel_handwritten_calculus_note: {
    suggestedTitle: 'Differentiation and Stationary Points',
    materialType: 'handwritten_draft',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
    folderId: 'f-math-ch7',
    folderPath: 'A-Level Math / Ch7 Calculus',
    questionBlocks: [
      {
        id: 'hand-q1',
        label: 'Worked example',
        text: 'Differentiate y = x³ - 6x² + 9x + 4 and find its stationary points.',
      },
    ],
    answerBlocks: [
      {
        id: 'hand-a1',
        questionId: 'hand-q1',
        text: "y′ = 3x² - 12x + 9 = 3(x - 1)(x - 3), so x = 1 or x = 3.",
      },
    ],
    content: [
      { t: 'h', v: 'Stationary-point method' },
      { t: 'p', v: "Differentiate first: y′ = 3x² - 12x + 9 = 3(x - 1)(x - 3)." },
      { t: 'p', v: 'Set y′ = 0, then use yʺ = 6x - 12 to classify x = 1 and x = 3.' },
    ],
    linkedTopics: ['calculus-differentiation', 'calculus-extrema'],
    linkedErrors: [],
    confidence: 0.84,
  },
  alevel_past_paper: {
    suggestedTitle: '9709/31 May/June 2022 Past Paper',
    materialType: 'past_paper',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
    folderId: 'f-math-ch7',
    folderPath: 'A-Level Math / Ch7 Calculus',
    questionBlocks: [
      {
        id: 'paper-q1',
        label: 'Question 1',
        text: 'Find the stationary points of y = x³ - 6x² + 9x + 4.',
      },
      {
        id: 'paper-q2',
        label: 'Question 2',
        text: 'Use the second derivative to classify each stationary point.',
      },
    ],
    answerBlocks: [],
    content: [
      { t: 'h', v: '9709/31 May/June 2022' },
      { t: 'p', v: 'Question 1: Find the stationary points of y = x³ - 6x² + 9x + 4.' },
      { t: 'p', v: 'Question 2: Use the second derivative to classify each stationary point.' },
    ],
    linkedTopics: ['calculus-extrema'],
    linkedErrors: [],
    confidence: 0.97,
  },
  alevel_mark_scheme: {
    suggestedTitle: '9709/31 May/June 2022 Mark Scheme',
    materialType: 'mark_scheme',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
    folderId: 'f-math-ch7',
    folderPath: 'A-Level Math / Ch7 Calculus',
    questionBlocks: [
      {
        id: 'ms-q1',
        label: 'Question 1',
        text: 'Find the stationary points of y = x³ - 6x² + 9x + 4.',
      },
      {
        id: 'ms-q2',
        label: 'Question 2',
        text: 'Use the second derivative to classify each stationary point.',
      },
    ],
    answerBlocks: [
      {
        id: 'ms-a1',
        questionId: 'ms-q1',
        text: "M1 differentiate; A1 solve 3x² - 12x + 9 = 0 to obtain x = 1, 3.",
      },
      {
        id: 'ms-a2',
        questionId: 'ms-q2',
        text: 'B1 yʺ = 6x - 12; x = 1 is a maximum and x = 3 is a minimum.',
      },
    ],
    content: [
      { t: 'h', v: 'Question 1 marking points' },
      { t: 'p', v: "M1 differentiate; A1 solve 3x² - 12x + 9 = 0 to obtain x = 1, 3." },
      { t: 'h', v: 'Question 2 marking points' },
      { t: 'p', v: 'B1 yʺ = 6x - 12; x = 1 is a maximum and x = 3 is a minimum.' },
    ],
    linkedTopics: ['calculus-extrema'],
    linkedErrors: [],
    confidence: 0.94,
  },
  ielts_reading_passage: {
    suggestedTitle: 'Urban Bees — IELTS Reading Passage',
    materialType: 'ielts_passage',
    examBoard: 'Cambridge English',
    subject: 'IELTS Reading',
    chapter: 'Academic Reading',
    folderId: 'f-ielts-reading',
    folderPath: 'IELTS / Reading',
    questionBlocks: [
      {
        id: 'ielts-q1',
        label: 'Matching heading 1',
        text: 'Choose the heading that best describes how city gardens support wild bees.',
      },
    ],
    answerBlocks: [
      {
        id: 'ielts-a1',
        questionId: 'ielts-q1',
        text: 'Heading vi — Unexpected refuges for pollinators.',
      },
    ],
    content: [
      { t: 'h', v: 'Urban Bees' },
      { t: 'p', v: 'Small city gardens can offer continuous flowering seasons and shelter from agricultural pesticides.' },
      { t: 'p', v: 'Researchers found that diverse planting, rather than garden size alone, predicted bee abundance.' },
    ],
    linkedTopics: ['ielts-matching-headings', 'ielts-scanning'],
    linkedErrors: [],
    confidence: 0.68,
  },
  homework: {
    suggestedTitle: 'Calculus Homework — Applications of Differentiation',
    materialType: 'homework',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
    folderId: 'f-math-ch7',
    folderPath: 'A-Level Math / Ch7 Calculus',
    questionBlocks: [
      {
        id: 'homework-q1',
        label: 'Exercise 7.4, Question 3',
        text: 'A rectangle has perimeter 40 cm. Find the dimensions that maximise its area.',
      },
    ],
    answerBlocks: [
      {
        id: 'homework-a1',
        questionId: 'homework-q1',
        text: 'Let the sides be x and 20 - x; A = 20x - x² has a maximum at x = 10.',
      },
    ],
    content: [
      { t: 'h', v: 'Applications of differentiation' },
      { t: 'p', v: 'Question 3: A rectangle has perimeter 40 cm. Find the dimensions that maximise its area.' },
      { t: 'p', v: 'Working: A = x(20 - x); A′ = 20 - 2x, so the maximum occurs at x = 10 cm.' },
    ],
    linkedTopics: ['calculus-optimisation'],
    linkedErrors: [],
    confidence: 0.91,
  },
  error_photo: {
    suggestedTitle: 'Error Photo — Stationary Point Classification',
    materialType: 'error_photo',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
    folderId: 'f-math-ch7-errors',
    folderPath: 'A-Level Math / Ch7 Calculus / Errors',
    questionBlocks: [
      {
        id: 'error-q1',
        label: 'Captured question',
        text: 'Classify the stationary point at x = 3 when yʺ = 6x - 12.',
      },
    ],
    answerBlocks: [
      {
        id: 'error-a1',
        questionId: 'error-q1',
        text: 'Correction: yʺ(3) = 6 > 0, so the stationary point is a minimum, not a maximum.',
      },
    ],
    content: [
      { t: 'h', v: 'Captured error' },
      { t: 'p', v: 'My answer labelled x = 3 as a maximum after substituting into the second derivative.' },
      { t: 'p', v: 'Correction: yʺ(3) = 6 > 0, so the graph curves upwards and the point is a minimum.' },
    ],
    linkedTopics: ['calculus-second-derivative', 'calculus-extrema'],
    linkedErrors: ['error-calculus-stationary-point'],
    confidence: 0.72,
  },
}

const deepFreeze = (value) => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

export const MATERIAL_FIXTURES = deepFreeze(FIXTURE_DEFINITIONS)
