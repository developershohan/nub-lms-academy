/*
 * Quiz attempts are graded against a snapshot taken when the attempt starts: the questions drawn
 * from the quiz's bank, in the order shown, with their options and answer key. Teachers can then
 * edit or delete questions without changing how any past attempt was graded or what it shows.
 * Everything here is pure, so the rules are unit-tested and shared by the service and the pages.
 */

export type QuizQuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "FILL_BLANK" | "ORDERING";

export type SnapshotOption = { id: string; content: string; isCorrect: boolean };

export type SnapshotQuestion = {
  id: string;
  prompt: string;
  type: QuizQuestionType;
  points: number;
  /** In the order this attempt shows them. For FILL_BLANK these are the accepted answers, never shown. */
  options: SnapshotOption[];
  /** ORDERING only: option ids in the right order (`options` holds the shuffled order shown). */
  correctOrder?: string[];
};

export type AttemptSnapshot = { version: 1; questions: SnapshotQuestion[] };

export type QuestionResponse = { selectedOptionIds: string[]; textAnswer: string | null };

export type GradedAnswer = QuestionResponse & { questionId: string; isCorrect: boolean; pointsAwarded: number };

type LiveQuestion = {
  id: string;
  prompt: string;
  type: QuizQuestionType;
  points: number;
  /** Already sorted by sortOrder - for ORDERING that is the correct order. */
  options: SnapshotOption[];
};

/** Fisher-Yates over a copy. `random` is injectable so tests can pin the order. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/**
 * The questions one attempt gets. With a draw count, that many questions are picked at random from
 * the bank (shown in quiz order unless shuffled). Choice options shuffle when the quiz asks for it
 * - True/False always stays True, False. Ordering items are always shuffled, and never left in the
 * correct order, or the question would answer itself.
 */
export function buildAttemptSnapshot(
  questions: LiveQuestion[],
  settings: { shuffleQuestions: boolean; shuffleOptions: boolean; drawCount: number | null },
  random: () => number = Math.random
): AttemptSnapshot {
  let picked = questions;
  if (settings.drawCount != null && settings.drawCount < questions.length) {
    const chosen = new Set(shuffle(questions, random).slice(0, settings.drawCount).map((q) => q.id));
    picked = questions.filter((q) => chosen.has(q.id));
  }
  if (settings.shuffleQuestions) picked = shuffle(picked, random);

  return {
    version: 1,
    // Only what grading and review need - the live rows also carry sortOrder, quizId and so on.
    questions: picked.map(({ id, prompt, type, points, options }) => {
      const q = { id, prompt, type, points, options: options.map(({ id, content, isCorrect }) => ({ id, content, isCorrect })) };
      if (q.type === "ORDERING") {
        const correctOrder = q.options.map((o) => o.id);
        let shown = shuffle(q.options, random);
        // A shuffle can land back on the answer; rotating one place always breaks it.
        if (shown.length > 1 && shown.every((o, i) => o.id === correctOrder[i])) shown = [...shown.slice(1), shown[0]];
        return { ...q, options: shown, correctOrder };
      }
      const shuffleThese = settings.shuffleOptions && (q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE");
      return { ...q, options: shuffleThese ? shuffle(q.options, random) : q.options };
    }),
  };
}

/** What a student may see while answering: no answer key, and no accepted answers for blanks. */
export function publicQuestion(question: SnapshotQuestion) {
  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    points: question.points,
    options: question.type === "FILL_BLANK" ? [] : question.options.map(({ id, content }) => ({ id, content })),
  };
}

export type PublicQuestion = ReturnType<typeof publicQuestion>;

/** Typed answers match ignoring case, accents written as composed/decomposed, and extra spaces. */
export function normaliseAnswer(text: string) {
  return text.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function gradeQuestion(
  question: SnapshotQuestion,
  response: QuestionResponse,
  { partialCredit }: { partialCredit: boolean }
): { isCorrect: boolean; pointsAwarded: number } {
  const full = (isCorrect: boolean) => ({ isCorrect, pointsAwarded: isCorrect ? question.points : 0 });
  const optionIds = new Set(question.options.map((o) => o.id));
  const chosen = [...new Set(response.selectedOptionIds)].filter((id) => optionIds.has(id));

  switch (question.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE": {
      const correct = question.options.find((o) => o.isCorrect)?.id;
      return full(chosen.length === 1 && chosen[0] === correct);
    }
    case "MULTIPLE_CHOICE": {
      const correct = new Set(question.options.filter((o) => o.isCorrect).map((o) => o.id));
      const right = chosen.filter((id) => correct.has(id)).length;
      const wrong = chosen.length - right;
      if (right === correct.size && wrong === 0) return full(true);
      if (!partialCredit || correct.size === 0) return full(false);
      // Each right pick earns its share and each wrong pick cancels one, so ticking every box earns nothing.
      return { isCorrect: false, pointsAwarded: round2(question.points * Math.max(0, (right - wrong) / correct.size)) };
    }
    case "FILL_BLANK": {
      const answer = normaliseAnswer(response.textAnswer ?? "");
      return full(answer !== "" && question.options.some((o) => normaliseAnswer(o.content) === answer));
    }
    case "ORDERING": {
      const order = question.correctOrder ?? [];
      if (chosen.length === order.length && chosen.every((id, i) => id === order[i])) return full(true);
      if (!partialCredit || order.length < 2 || chosen.length !== order.length) return full(false);
      // Credit for each neighbouring pair in the right sequence: one item out of place costs a
      // pair or two, rather than every position after it.
      const next = new Map(order.slice(0, -1).map((id, i) => [id, order[i + 1]]));
      const goodPairs = chosen.slice(0, -1).filter((id, i) => next.get(id) === chosen[i + 1]).length;
      return { isCorrect: false, pointsAwarded: round2((question.points * goodPairs) / (order.length - 1)) };
    }
  }
}

/** Grades every question in the snapshot - unanswered ones score 0 - into answer rows and a score. */
export function gradeAttempt(
  snapshot: AttemptSnapshot,
  responses: Map<string, QuestionResponse>,
  settings: { partialCredit: boolean; passingScore: number }
) {
  const answers: GradedAnswer[] = snapshot.questions.map((question) => {
    const response = responses.get(question.id) ?? { selectedOptionIds: [], textAnswer: null };
    return { questionId: question.id, ...response, ...gradeQuestion(question, response, settings) };
  });
  const pointsPossible = snapshot.questions.reduce((sum, q) => sum + q.points, 0);
  const pointsEarned = round2(answers.reduce((sum, a) => sum + a.pointsAwarded, 0));
  const score = pointsPossible > 0 ? Math.round((pointsEarned / pointsPossible) * 100) : 0;
  return { answers, pointsEarned, pointsPossible, score, passed: score >= settings.passingScore };
}

/**
 * Reads answers posted as `q_<questionId>` fields, keeping only what the snapshot allows: known
 * option ids, one choice for single-answer questions, each ordering item once, short typed text.
 */
export function readResponses(snapshot: AttemptSnapshot, form: FormData) {
  const responses = new Map<string, QuestionResponse>();
  for (const question of snapshot.questions) {
    const values = form.getAll(`q_${question.id}`).map(String);
    if (question.type === "FILL_BLANK") {
      const text = (values[0] ?? "").trim().slice(0, 500);
      if (text) responses.set(question.id, { selectedOptionIds: [], textAnswer: text });
      continue;
    }
    const known = new Set(question.options.map((o) => o.id));
    let ids = [...new Set(values)].filter((id) => known.has(id));
    if (question.type === "SINGLE_CHOICE" || question.type === "TRUE_FALSE") ids = ids.slice(0, 1);
    if (ids.length > 0) responses.set(question.id, { selectedOptionIds: ids, textAnswer: null });
  }
  return responses;
}
