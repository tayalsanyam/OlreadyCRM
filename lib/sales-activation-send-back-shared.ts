/** Client-safe helpers for activation send-back task titles (no DB imports). */

export const ACTIVATION_SEND_BACK_TASK_MARKER = "Activation send-back";

export function isActivationSendBackTaskTitle(title: string): boolean {
  return title.includes(ACTIVATION_SEND_BACK_TASK_MARKER);
}

export function activationSendBackPipelineId(title: string): string | null {
  const m = title.match(/\[PIPE:([0-9a-f-]{36})\]/i);
  return m?.[1] ?? null;
}
