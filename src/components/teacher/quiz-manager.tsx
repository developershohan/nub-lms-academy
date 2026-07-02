"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionSuccess } from "@/hooks/use-action-success";
import { questionTypes } from "@/lib/validations/quiz";
import {
  createQuizAction,
  updateQuizSettingsAction,
  deleteQuizAction,
  createQuestionAction,
  updateQuestionAction,
  deleteQuestionAction,
  type ActionState,
} from "@/app/teacher/(dashboard)/courses/[courseId]/edit/quiz-actions";

type Option = { id: string; content: string; isCorrect: boolean };
type QuestionType = (typeof questionTypes)[number];
type Question = { id: string; prompt: string; type: QuestionType; points: number; options: Option[] };
type Quiz = {
  id: string;
  title: string;
  description: string | null;
  passingScore: number;
  maxAttempts: number | null;
  timeLimitSec: number | null;
  updatedAt: Date;
  questions: Question[];
};

const initialState: ActionState = {};
const TYPE_ITEMS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  TRUE_FALSE: "True / False",
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function optionsToText(question?: Question) {
  if (!question || question.type === "TRUE_FALSE") return "";
  return question.options.map((o) => (o.isCorrect ? `*${o.content}` : o.content)).join("\n");
}

function QuestionFields({ question }: { question?: Question }) {
  const [type, setType] = useState<QuestionType>(question?.type ?? "SINGLE_CHOICE");
  const trueAnswer = question?.options.find((o) => o.content === "True")?.isCorrect ? "true" : "false";

  return (
    <>
      <div className="space-y-1.5">
        <Label>Question</Label>
        <Textarea name="prompt" defaultValue={question?.prompt} rows={2} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select name="type" value={type} onValueChange={(v) => setType(v as QuestionType)} items={TYPE_ITEMS}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {questionTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_ITEMS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Points</Label>
          <Input name="points" type="number" min={1} defaultValue={question?.points ?? 1} required />
        </div>
      </div>
      {type === "TRUE_FALSE" ? (
        <div className="space-y-1.5">
          <Label>Correct answer</Label>
          <Select
            name="trueFalseAnswer"
            defaultValue={question ? trueAnswer : "true"}
            items={{ true: "True", false: "False" }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">True</SelectItem>
              <SelectItem value="false">False</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Options (one per line, prefix the correct one(s) with *)</Label>
          <Textarea name="options" defaultValue={optionsToText(question)} rows={4} placeholder={"*Paris\nLondon\nBerlin"} />
        </div>
      )}
    </>
  );
}

function QuestionRow({ question }: { question: Question }) {
  const [editing, setEditing] = useState(false);
  const action = updateQuestionAction.bind(null, question.id);
  const [updateState, updateAction] = useActionState(action, initialState);
  const [deleteState, deleteAction] = useActionState(deleteQuestionAction, initialState);

  useActionSuccess(updateState, initialState, () => {
    toast.success("Question updated");
    setEditing(false);
  });
  useActionSuccess(deleteState, initialState, () => toast.success("Question deleted"));

  if (editing) {
    return (
      <form action={updateAction} className="space-y-3 rounded-md border p-3">
        <QuestionFields question={question} />
        {updateState.error && <p className="text-sm text-destructive">{updateState.error}</p>}
        <div className="flex gap-2">
          <SubmitButton label="Save" pendingLabel="Saving..." />
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span>{question.prompt}</span>
        <Badge variant="secondary">{TYPE_ITEMS[question.type]}</Badge>
        <Badge variant="outline">{question.points} pt</Badge>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <form action={deleteAction}>
          <input type="hidden" name="questionId" value={question.id} />
          <Button type="submit" size="sm" variant="ghost">
            Delete
          </Button>
        </form>
      </div>
      {deleteState.error && <p className="text-sm text-destructive">{deleteState.error}</p>}
    </div>
  );
}

function AddQuestionForm({ quizId }: { quizId: string }) {
  const [state, formAction] = useActionState(createQuestionAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);

  useActionSuccess(state, initialState, () => {
    toast.success("Question added");
    formRef.current?.reset();
    setResetKey((k) => k + 1);
  });

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-md border border-dashed p-3">
      <input type="hidden" name="quizId" value={quizId} />
      <QuestionFields key={resetKey} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton label="Add question" pendingLabel="Adding..." />
    </form>
  );
}

function QuizSettingsForm({ quiz }: { quiz: Quiz }) {
  const action = updateQuizSettingsAction.bind(null, quiz.id);
  const [state, formAction] = useActionState(action, initialState);

  useActionSuccess(state, initialState, () => toast.success("Quiz settings saved"));

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Title</Label>
        <Input name="title" defaultValue={quiz.title} required />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label>Description</Label>
        <Textarea name="description" defaultValue={quiz.description ?? ""} rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label>Passing score (%)</Label>
        <Input name="passingScore" type="number" min={0} max={100} defaultValue={quiz.passingScore} required />
      </div>
      <div className="space-y-1.5">
        <Label>Max attempts (blank = unlimited)</Label>
        <Input name="maxAttempts" type="number" min={1} defaultValue={quiz.maxAttempts ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label>Time limit in seconds (blank = none)</Label>
        <Input name="timeLimitSec" type="number" min={0} defaultValue={quiz.timeLimitSec ?? ""} />
      </div>
      <div className="flex items-end sm:col-span-2">
        {state.error && <p className="mr-auto text-sm text-destructive">{state.error}</p>}
        <SubmitButton label="Save quiz settings" pendingLabel="Saving..." />
      </div>
    </form>
  );
}

function QuizCard({ quiz }: { quiz: Quiz }) {
  const [deleteState, deleteAction] = useActionState(deleteQuizAction, initialState);
  useActionSuccess(deleteState, initialState, () => toast.success("Quiz deleted"));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{quiz.title}</CardTitle>
        <form action={deleteAction}>
          <input type="hidden" name="quizId" value={quiz.id} />
          <Button type="submit" size="sm" variant="ghost">
            Delete quiz
          </Button>
        </form>
      </CardHeader>
      <CardContent className="space-y-4">
        {deleteState.error && <p className="text-sm text-destructive">{deleteState.error}</p>}
        <QuizSettingsForm key={quiz.updatedAt.getTime()} quiz={quiz} />
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Questions</p>
          {quiz.questions.map((q) => (
            <QuestionRow key={q.id} question={q} />
          ))}
          <AddQuestionForm quizId={quiz.id} />
        </div>
      </CardContent>
    </Card>
  );
}

function AddQuizForm({ courseId }: { courseId: string }) {
  const [state, formAction] = useActionState(createQuizAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useActionSuccess(state, initialState, () => {
    toast.success("Quiz added");
    formRef.current?.reset();
  });

  return (
    <form ref={formRef} action={formAction} className="flex items-start gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="flex-1 space-y-1.5">
        <Input name="title" placeholder="New quiz title" required />
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </div>
      <SubmitButton label="Add quiz" pendingLabel="Adding..." />
    </form>
  );
}

export function QuizManager({ courseId, quizzes }: { courseId: string; quizzes: Quiz[] }) {
  return (
    <div className="space-y-4">
      {quizzes.map((quiz) => (
        <QuizCard key={quiz.id} quiz={quiz} />
      ))}
      <AddQuizForm courseId={courseId} />
    </div>
  );
}
