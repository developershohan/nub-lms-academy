"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitQuizAttemptAction, type ActionState } from "@/app/student/quiz/[quizId]/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const initialState: ActionState = {};

type Option = { id: string; content: string };
type Question = {
  id: string;
  prompt: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  points: number;
  options: Option[];
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Submitting..." : "Submit quiz"}
    </Button>
  );
}

export function QuizAttemptForm({ attemptId, questions }: { attemptId: string; questions: Question[] }) {
  const action = submitQuizAttemptAction.bind(null, attemptId);
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {questions.map((question, index) => (
        <div key={question.id} className="space-y-3 rounded-md border p-4">
          <p className="font-medium">
            {index + 1}. {question.prompt}{" "}
            <span className="text-sm font-normal text-muted-foreground">({question.points} pt)</span>
          </p>
          {question.type === "MULTIPLE_CHOICE" ? (
            <div className="space-y-2">
              {question.options.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <Checkbox name={`q_${question.id}`} value={option.id} />
                  {option.content}
                </label>
              ))}
            </div>
          ) : (
            <RadioGroup name={`q_${question.id}`}>
              {question.options.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value={option.id} />
                  {option.content}
                </label>
              ))}
            </RadioGroup>
          )}
        </div>
      ))}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
