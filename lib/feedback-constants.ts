/** Structured negative feedback reasons (stored in lead_feedback.negative_reasons). */
export const FEEDBACK_NEGATIVE_REASONS = [
  { value: "too_many_calls", label: "Too many calls" },
  { value: "budget_issues", label: "Budget issues" },
  {
    value: "poor_communication",
    label: "Poor communication by Olready team",
  },
  { value: "no_mua_contact", label: "No contact by any MUA" },
  { value: "other", label: "Other" },
] as const;

export const FEEDBACK_MAX_UNREACHABLE_ATTEMPTS = 3;

export type FeedbackUnreachableAttemptKind = "busy" | "callback" | "no_contact";

export const FEEDBACK_ATTEMPT_KIND_LABELS: Record<
  FeedbackUnreachableAttemptKind,
  string
> = {
  busy: "Busy",
  callback: "Callback requested",
  no_contact: "No contact / didn't answer",
};

export const FEEDBACK_QUEUE_TABS = [
  "to_call",
  "no_contact",
  "follow_ups",
  "done",
  "closed",
] as const;

export type FeedbackQueueTab = (typeof FEEDBACK_QUEUE_TABS)[number];
