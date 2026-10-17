/*
 * Notification categories: what users switch on and off on /notifications/preferences. Each
 * notification type belongs to one. Pure data, shared by notify(), the worker and the
 * preferences page.
 *
 * Three channels: in the app (the bell, /notifications), email (Resend) and web push (VAPID).
 * Chat is special: its email is a digest the worker sends after ~30 minutes if the conversation
 * is still unread, and its push waits ~1 minute for the same reason (worker/index.ts). Everything
 * else goes out at once.
 */

export type Channels = { inApp: boolean; email: boolean; push: boolean };

export const NOTIFICATION_CATEGORIES = {
  messages: {
    label: "Messages",
    description: "New messages in your conversations, course channels and support threads.",
    defaults: { inApp: true, email: true, push: true },
    /** One digest email after about 30 minutes if the conversation is still unread. */
    emailAvailable: true,
    emailTiming: "digest",
    pushTiming: "delayed",
    inAppLocked: false,
  },
  learning: {
    label: "Your learning",
    description: "Enrollments, certificates, announcements and answers to your questions.",
    defaults: { inApp: true, email: false, push: true },
    emailAvailable: true,
    emailTiming: "immediate",
    pushTiming: "immediate",
    inAppLocked: false,
  },
  teaching: {
    label: "Teaching",
    description: "Course review decisions, new students, reviews, questions and co-instructor invitations.",
    defaults: { inApp: true, email: true, push: true },
    emailAvailable: true,
    emailTiming: "immediate",
    pushTiming: "immediate",
    inAppLocked: false,
  },
  payments: {
    label: "Payments",
    description: "Purchases, refunds and anything that needs you to act on a payment.",
    defaults: { inApp: true, email: true, push: true },
    emailAvailable: true,
    emailTiming: "immediate",
    pushTiming: "immediate",
    inAppLocked: false,
  },
  account: {
    label: "Account",
    description: "Teacher applications and changes to your account. Always shown in the app.",
    defaults: { inApp: true, email: true, push: true },
    emailAvailable: true,
    emailTiming: "immediate",
    pushTiming: "immediate",
    inAppLocked: true,
  },
  admin: {
    label: "Admin alerts",
    description: "Courses changed after review, disputed payments, applications, support tickets and reports.",
    defaults: { inApp: true, email: false, push: true },
    emailAvailable: true,
    emailTiming: "immediate",
    pushTiming: "immediate",
    inAppLocked: true,
  },
} as const satisfies Record<
  string,
  {
    label: string;
    description: string;
    defaults: Channels;
    emailAvailable: boolean;
    emailTiming: "immediate" | "digest";
    pushTiming: "immediate" | "delayed";
    inAppLocked: boolean;
  }
>;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

/** Who sees a category on the preferences page - a student has no use for "Teaching". */
export function categoriesForRoles(roles: string[]): NotificationCategory[] {
  const teaches = roles.includes("TEACHER") || roles.includes("SUPER_ADMIN");
  const staff = ["ADMIN", "SUPER_ADMIN", "SUPPORT"].some((role) => roles.includes(role));
  return (Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[]).filter(
    (category) => (category !== "teaching" || teaches) && (category !== "admin" || staff)
  );
}

/** Every notification type there is, and its category. Unknown types count as "account". */
export const NOTIFICATION_TYPES = {
  message: "messages",
  announcement: "learning",
  enrollment: "learning",
  certificate: "learning",
  question_answered: "learning",
  course_decision: "teaching",
  course_review: "teaching",
  course_instructor: "teaching",
  new_student: "teaching",
  lesson_question: "teaching",
  payment: "payments",
  refund: "payments",
  teacher_application: "account",
  "course-review": "admin",
  "payment-dispute": "admin",
  teacher_application_received: "admin",
  support_request: "admin",
  ticket_assigned: "admin",
  message_report: "admin",
} as const satisfies Record<string, NotificationCategory>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function categoryOf(type: string): NotificationCategory {
  return (NOTIFICATION_TYPES as Record<string, NotificationCategory>)[type] ?? "account";
}

/** Locked channels can't be switched off; a saved "off" from before a lock is ignored. */
export function effectivePreference(
  category: NotificationCategory,
  saved: { inApp: boolean; email: boolean; push?: boolean } | undefined
): Channels {
  const info = NOTIFICATION_CATEGORIES[category];
  const pref = saved ?? info.defaults;
  return {
    inApp: info.inAppLocked || pref.inApp,
    email: info.emailAvailable && pref.email,
    push: pref.push ?? info.defaults.push,
  };
}
