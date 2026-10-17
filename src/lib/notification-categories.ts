/*
 * Notification categories: what users switch on and off on /notifications/preferences. Each
 * notification type belongs to one. Pure data, shared by notify() and the preferences page.
 */

export const NOTIFICATION_CATEGORIES = {
  messages: {
    label: "Messages",
    description: "New messages in your conversations, course groups and support threads.",
    defaults: { inApp: true, email: false },
    /** Emails for chat would arrive faster than anyone reads them; a digest comes later. */
    emailAvailable: false,
    inAppLocked: false,
  },
  learning: {
    label: "Your learning",
    description: "Enrollments and changes to your course access.",
    defaults: { inApp: true, email: false },
    emailAvailable: true,
    inAppLocked: false,
  },
  teaching: {
    label: "Teaching",
    description: "Course review decisions, new reviews and co-instructor invitations.",
    defaults: { inApp: true, email: true },
    emailAvailable: true,
    inAppLocked: false,
  },
  payments: {
    label: "Payments",
    description: "Purchases, refunds and anything that needs you to act on a payment.",
    defaults: { inApp: true, email: true },
    emailAvailable: true,
    inAppLocked: false,
  },
  account: {
    label: "Account",
    description: "Teacher applications and changes to your account. Always shown in the app.",
    defaults: { inApp: true, email: true },
    emailAvailable: true,
    inAppLocked: true,
  },
  admin: {
    label: "Admin alerts",
    description: "Courses changed after review, disputed payments, new applications and support requests.",
    defaults: { inApp: true, email: false },
    emailAvailable: true,
    inAppLocked: true,
  },
} as const;

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
  enrollment: "learning",
  certificate: "learning",
  course_decision: "teaching",
  course_review: "teaching",
  course_instructor: "teaching",
  new_student: "teaching",
  payment: "payments",
  refund: "payments",
  teacher_application: "account",
  "course-review": "admin",
  "payment-dispute": "admin",
  teacher_application_received: "admin",
  support_request: "admin",
} as const satisfies Record<string, NotificationCategory>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export function categoryOf(type: string): NotificationCategory {
  return (NOTIFICATION_TYPES as Record<string, NotificationCategory>)[type] ?? "account";
}

/** Locked channels can't be switched off; a saved "off" from before a lock is ignored. */
export function effectivePreference(
  category: NotificationCategory,
  saved: { inApp: boolean; email: boolean } | undefined
) {
  const info = NOTIFICATION_CATEGORIES[category];
  const pref = saved ?? info.defaults;
  return { inApp: info.inAppLocked || pref.inApp, email: info.emailAvailable && pref.email };
}
