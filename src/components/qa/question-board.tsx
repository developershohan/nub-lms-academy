"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowBigUp, CheckCircle2, MessageCircleQuestion, Pin, Search } from "lucide-react";
import { toast } from "sonner";
import type { AnswerSummary, QuestionSummary } from "@/server/chat/qa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Lesson = { id: string; title: string };

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function QuestionThread({ question, currentUserId, instructor, onChanged }: { question: QuestionSummary; currentUserId: string; instructor: boolean; onChanged(): void }) {
  const [answers, setAnswers] = useState<AnswerSummary[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api(`/api/v1/questions/${question.id}`)
        .then((data) => setAnswers(data.answers))
        .catch(() => setAnswers([])),
    [question.id]
  );

  useEffect(() => {
    let cancelled = false;
    api(`/api/v1/questions/${question.id}`)
      .then((data) => !cancelled && setAnswers(data.answers))
      .catch(() => !cancelled && setAnswers([]));
    return () => {
      cancelled = true;
    };
  }, [question.id]);

  async function act(body: object, after?: () => void) {
    setBusy(true);
    try {
      await api(`/api/v1/questions/${question.id}`, { method: "POST", body: JSON.stringify(body) });
      after?.();
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 border-t px-4 py-4">
      <p className="text-sm whitespace-pre-wrap">{question.body}</p>
      {answers === null && <p className="text-xs text-muted-foreground">Loading answers…</p>}
      {answers && answers.length > 0 && (
        <ul className="space-y-3">
          {answers.map((a) => (
            <li key={a.id} className={cn("rounded-lg px-3 py-2 text-sm", a.accepted ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted")}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{a.author.name ?? "Member"}</span>
                {a.isInstructor && <Badge variant="secondary">Instructor</Badge>}
                {a.accepted && (
                  <span className="inline-flex items-center gap-1 text-primary">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Answer
                  </span>
                )}
                <span suppressHydrationWarning>{formatRelativeTime(new Date(a.createdAt))}</span>
                {!a.accepted && (instructor || question.author.id === currentUserId) && (
                  <button type="button" className="ml-auto underline" disabled={busy} onClick={() => void act({ action: "accept", answerId: a.id })}>
                    Mark as the answer
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void act({ action: "answer", body: draft.trim() }, () => setDraft(""));
        }}
      >
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={instructor ? "Answer as the instructor…" : "Know the answer? Help a classmate…"} rows={2} maxLength={4000} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
            Post answer
          </Button>
          {instructor && (
            <>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "pin", pinned: !question.pinned })}>
                <Pin /> {question.pinned ? "Unpin" : "Pin"}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act({ action: "answered", answered: !question.answeredAt })}>
                <CheckCircle2 /> {question.answeredAt ? "Mark unanswered" : "Mark answered"}
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/**
 * Lesson Q&A for one course: searchable, top-voted or newest first, with an "Answered by
 * instructor" badge. Students ask about a lesson and upvote; instructors answer and pin.
 */
export function QuestionBoard({
  courseId,
  lessons,
  currentUserId,
  instructor,
  initialQuestionId,
}: {
  courseId: string;
  lessons: Lesson[];
  currentUserId: string;
  instructor: boolean;
  initialQuestionId?: string | null;
}) {
  const [questions, setQuestions] = useState<QuestionSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [sort, setSort] = useState<"top" | "new">("top");
  const [unanswered, setUnanswered] = useState(false);
  const [open, setOpen] = useState<string | null>(initialQuestionId ?? null);
  const [asking, setAsking] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [askLesson, setAskLesson] = useState(lessons[0]?.id ?? "");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ sort });
    if (query.trim()) params.set("q", query.trim());
    if (lessonId) params.set("lesson", lessonId);
    if (unanswered) params.set("unanswered", "1");
    try {
      const data = await api(`/api/v1/courses/${courseId}/questions?${params}`);
      setQuestions(data.questions);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load questions");
      setQuestions([]);
    }
  }, [courseId, sort, query, lessonId, unanswered]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  async function ask() {
    try {
      const data = await api(`/api/v1/courses/${courseId}/questions`, {
        method: "POST",
        body: JSON.stringify({ lessonId: askLesson, title: title.trim(), body: body.trim() }),
      });
      setAsking(false);
      setTitle("");
      setBody("");
      await load();
      setOpen(data.question.id);
      toast.success("Question posted - your instructor has been told");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post the question");
    }
  }

  async function upvote(q: QuestionSummary) {
    setQuestions((current) => current?.map((x) => (x.id === q.id ? { ...x, voted: !x.voted, upvotes: x.upvotes + (x.voted ? -1 : 1) } : x)) ?? current);
    try {
      await api(`/api/v1/questions/${q.id}`, { method: "POST", body: JSON.stringify({ action: "upvote" }) });
    } catch {
      void load();
    }
  }

  const selectClass = "h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" aria-label="Search questions" className="pl-8" />
        </div>
        <select aria-label="Lesson" className={selectClass} value={lessonId} onChange={(e) => setLessonId(e.target.value)}>
          <option value="">All lessons</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
        <select aria-label="Sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as "top" | "new")}>
          <option value="top">Top voted</option>
          <option value="new">Newest</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={unanswered} onChange={(e) => setUnanswered(e.target.checked)} className="size-4 accent-primary" />
          Unanswered
        </label>
        {lessons.length > 0 && (
          <Button size="sm" onClick={() => setAsking((v) => !v)}>
            <MessageCircleQuestion /> Ask a question
          </Button>
        )}
      </div>

      {asking && (
        <form
          className="space-y-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <select aria-label="Which lesson is this about?" className={cn(selectClass, "w-full")} value={askLesson} onChange={(e) => setAskLesson(e.target.value)}>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's your question?" maxLength={160} aria-label="Question title" required />
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add detail: what you tried, where you got stuck…" rows={3} maxLength={4000} required />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!title.trim() || !body.trim()}>
              Post question
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {questions === null && <p className="text-sm text-muted-foreground">Loading questions…</p>}
      {questions && questions.length === 0 && (
        <div className="rounded-xl bg-card p-10 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">
          <MessageCircleQuestion className="mx-auto mb-2 size-6" aria-hidden />
          No questions yet{query || lessonId || unanswered ? " for this filter" : ""}.
        </div>
      )}
      {questions && questions.length > 0 && (
        <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
          {questions.map((q) => (
            <li key={q.id}>
              <div className="flex items-start gap-3 px-4 py-3">
                <button
                  type="button"
                  aria-pressed={q.voted}
                  aria-label={`Upvote (${q.upvotes})`}
                  onClick={() => void upvote(q)}
                  className={cn(
                    "flex w-11 shrink-0 flex-col items-center rounded-lg border py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    q.voted ? "border-primary/50 bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <ArrowBigUp className="size-4" aria-hidden />
                  <span className="font-semibold tabular-nums">{q.upvotes}</span>
                </button>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === q.id ? null : q.id)} aria-expanded={open === q.id}>
                  <span className="flex flex-wrap items-center gap-2">
                    {q.pinned && <Pin className="size-3.5 text-amber-foreground dark:text-amber" aria-label="Pinned" />}
                    <span className="font-medium">{q.title}</span>
                    {q.answeredAt && (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="size-3" aria-hidden /> Answered by instructor
                      </Badge>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {q.author.name ?? "A student"} · {q.lessonTitle} · {q.answerCount} {q.answerCount === 1 ? "answer" : "answers"} ·{" "}
                    <span suppressHydrationWarning>{formatRelativeTime(new Date(q.createdAt))}</span>
                  </span>
                </button>
              </div>
              {open === q.id && <QuestionThread question={q} currentUserId={currentUserId} instructor={instructor} onChanged={() => void load()} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
