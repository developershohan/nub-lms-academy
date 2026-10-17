import { describe, expect, it } from "vitest";
import {
  buildAttemptSnapshot,
  gradeAttempt,
  gradeQuestion,
  publicQuestion,
  readResponses,
  type QuizQuestionType,
  type SnapshotQuestion,
} from "./quiz-grading";

const question = (
  id: string,
  type: QuizQuestionType,
  options: [string, boolean][],
  points = 1
): SnapshotQuestion => ({
  id,
  prompt: `Prompt ${id}`,
  type,
  points,
  options: options.map(([content, isCorrect], i) => ({ id: `${id}-${i}`, content, isCorrect })),
});

/** A repeatable stand-in for Math.random. */
function seeded(seed = 7) {
  let state = seed;
  return () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
}

const answer = (selectedOptionIds: string[], textAnswer: string | null = null) => ({ selectedOptionIds, textAnswer });
const none = { partialCredit: false };
const partial = { partialCredit: true };

describe("buildAttemptSnapshot", () => {
  const bank = ["a", "b", "c", "d", "e"].map((id) => question(id, "SINGLE_CHOICE", [["yes", true], ["no", false]]));

  it("draws the requested number of questions, keeping quiz order unless shuffling", () => {
    const snapshot = buildAttemptSnapshot(bank, { shuffleQuestions: false, shuffleOptions: false, drawCount: 3 }, seeded());
    const ids = snapshot.questions.map((q) => q.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual([...ids].sort());
  });

  it("uses the whole bank when the draw count is at least its size", () => {
    const snapshot = buildAttemptSnapshot(bank, { shuffleQuestions: false, shuffleOptions: false, drawCount: 9 });
    expect(snapshot.questions.map((q) => q.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("varies the draw between attempts", () => {
    const draws = new Set(
      Array.from({ length: 20 }, (_, i) =>
        buildAttemptSnapshot(bank, { shuffleQuestions: false, shuffleOptions: false, drawCount: 2 }, seeded(i + 1))
          .questions.map((q) => q.id)
          .join()
      )
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  it("never shuffles True/False, and never leaves an ordering question already solved", () => {
    const tf = question("tf", "TRUE_FALSE", [["True", true], ["False", false]]);
    const order = question("o", "ORDERING", [["1", true], ["2", true]]);
    for (let seed = 1; seed < 30; seed++) {
      const [q1, q2] = buildAttemptSnapshot([tf, order], { shuffleQuestions: false, shuffleOptions: true, drawCount: null }, seeded(seed)).questions;
      expect(q1.options.map((o) => o.content)).toEqual(["True", "False"]);
      expect(q2.options.map((o) => o.id)).not.toEqual(q2.correctOrder);
      expect(q2.correctOrder).toEqual(["o-0", "o-1"]);
    }
  });

  it("keeps only what grading needs from the live rows", () => {
    const live = { ...bank[0], quizId: "quiz", sortOrder: 4, options: bank[0].options.map((o) => ({ ...o, questionId: "a", sortOrder: 0 })) };
    const [q] = buildAttemptSnapshot([live], { shuffleQuestions: false, shuffleOptions: false, drawCount: null }).questions;
    expect(Object.keys(q).sort()).toEqual(["id", "options", "points", "prompt", "type"]);
    expect(Object.keys(q.options[0]).sort()).toEqual(["content", "id", "isCorrect"]);
  });
});

describe("publicQuestion", () => {
  it("hides the answer key and a blank's accepted answers", () => {
    const choice = publicQuestion(question("q", "SINGLE_CHOICE", [["yes", true], ["no", false]]));
    expect(choice.options).toEqual([
      { id: "q-0", content: "yes" },
      { id: "q-1", content: "no" },
    ]);
    expect(publicQuestion(question("b", "FILL_BLANK", [["Paris", true]])).options).toEqual([]);
    expect(JSON.stringify(publicQuestion({ ...question("o", "ORDERING", [["1", true]]), correctOrder: ["o-0"] }))).not.toContain(
      "correctOrder"
    );
  });
});

describe("gradeQuestion", () => {
  const multi = question("m", "MULTIPLE_CHOICE", [["A", true], ["B", true], ["C", false], ["D", false]], 2);

  it("gives multiple choice all or nothing without partial credit", () => {
    expect(gradeQuestion(multi, answer(["m-0", "m-1"]), none)).toEqual({ isCorrect: true, pointsAwarded: 2 });
    expect(gradeQuestion(multi, answer(["m-0"]), none)).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("gives partial credit per right pick, cancelled by wrong picks", () => {
    expect(gradeQuestion(multi, answer(["m-0"]), partial)).toEqual({ isCorrect: false, pointsAwarded: 1 });
    expect(gradeQuestion(multi, answer(["m-0", "m-2"]), partial).pointsAwarded).toBe(0);
    // Ticking every box earns nothing.
    expect(gradeQuestion(multi, answer(["m-0", "m-1", "m-2", "m-3"]), partial).pointsAwarded).toBe(0);
  });

  it("ignores option ids that aren't part of the question", () => {
    expect(gradeQuestion(multi, answer(["m-0", "m-1", "elsewhere"]), none).isCorrect).toBe(true);
  });

  it("needs exactly the one right option for single choice", () => {
    const single = question("s", "SINGLE_CHOICE", [["A", false], ["B", true]]);
    expect(gradeQuestion(single, answer(["s-1"]), partial).isCorrect).toBe(true);
    expect(gradeQuestion(single, answer(["s-1", "s-0"]), partial)).toEqual({ isCorrect: false, pointsAwarded: 0 });
  });

  it("matches a blank ignoring case and spacing, against any accepted answer", () => {
    const blank = question("b", "FILL_BLANK", [["useEffect", true], ["use effect", true]]);
    expect(gradeQuestion(blank, answer([], "  UseEffect "), none).isCorrect).toBe(true);
    expect(gradeQuestion(blank, answer([], "use   effect"), none).isCorrect).toBe(true);
    expect(gradeQuestion(blank, answer([], "useState"), none).isCorrect).toBe(false);
    expect(gradeQuestion(blank, answer([], ""), none).isCorrect).toBe(false);
  });

  it("grades ordering exactly, with partial credit for neighbouring pairs in sequence", () => {
    const order = { ...question("o", "ORDERING", [["1", true], ["2", true], ["3", true], ["4", true]], 3), correctOrder: ["o-0", "o-1", "o-2", "o-3"] };
    expect(gradeQuestion(order, answer(["o-0", "o-1", "o-2", "o-3"]), none)).toEqual({ isCorrect: true, pointsAwarded: 3 });
    // The last item moved to the front: two of three neighbouring pairs still follow each other.
    expect(gradeQuestion(order, answer(["o-3", "o-0", "o-1", "o-2"]), partial)).toEqual({ isCorrect: false, pointsAwarded: 2 });
    expect(gradeQuestion(order, answer(["o-3", "o-0", "o-1", "o-2"]), none).pointsAwarded).toBe(0);
    // An incomplete order earns nothing.
    expect(gradeQuestion(order, answer(["o-0", "o-1"]), partial).pointsAwarded).toBe(0);
  });
});

describe("gradeAttempt", () => {
  it("scores unanswered questions as 0 and rounds the percentage", () => {
    const snapshot = {
      version: 1 as const,
      questions: [
        question("a", "SINGLE_CHOICE", [["yes", true], ["no", false]]),
        question("b", "SINGLE_CHOICE", [["yes", true], ["no", false]]),
        question("c", "SINGLE_CHOICE", [["yes", true], ["no", false]]),
      ],
    };
    const graded = gradeAttempt(snapshot, new Map([["a", answer(["a-0"])], ["b", answer(["b-0"])]]), {
      partialCredit: false,
      passingScore: 67,
    });
    expect(graded).toMatchObject({ pointsEarned: 2, pointsPossible: 3, score: 67, passed: true });
    expect(graded.answers.map((a) => a.questionId)).toEqual(["a", "b", "c"]);
    expect(graded.answers[2]).toMatchObject({ selectedOptionIds: [], isCorrect: false, pointsAwarded: 0 });
  });
});

describe("readResponses", () => {
  const snapshot = {
    version: 1 as const,
    questions: [
      question("s", "SINGLE_CHOICE", [["A", true], ["B", false]]),
      question("b", "FILL_BLANK", [["x", true]]),
      question("o", "ORDERING", [["1", true], ["2", true]]),
    ],
  };

  it("keeps only known options, one choice for single answers, and trimmed text", () => {
    const form = new FormData();
    form.append("q_s", "s-1");
    form.append("q_s", "s-0");
    form.append("q_s", "forged");
    form.append("q_b", `  ${"y".repeat(600)}`);
    form.append("q_o", "o-1");
    form.append("q_o", "o-0");
    form.append("q_o", "o-1");
    form.append("q_unknown", "x");

    const responses = readResponses(snapshot, form);
    expect(responses.get("s")).toEqual(answer(["s-1"]));
    expect(responses.get("b")?.textAnswer).toHaveLength(500);
    expect(responses.get("o")).toEqual(answer(["o-1", "o-0"]));
    expect(responses.has("unknown")).toBe(false);
  });

  it("leaves questions out entirely when nothing was answered", () => {
    const form = new FormData();
    form.append("q_b", "   ");
    expect(readResponses(snapshot, form).size).toBe(0);
  });
});
