/** Public support page — deep link to the Submit concern tab. */
export const SUPPORT_SUBMIT_CONCERN_PATH = "/support?tab=submit";

export const SUPPORT_SUBMIT_CONCERN_HINT =
  `Raise a ticket via **Submit concern**: ${SUPPORT_SUBMIT_CONCERN_PATH}`;

export function supportSubmitConcernLink(): string {
  return `[Submit concern](${SUPPORT_SUBMIT_CONCERN_PATH})`;
}
