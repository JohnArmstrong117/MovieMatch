/** Predefined reason codes stored on moderation_reports.reason_code */
export const SAFETY_REASON_OPTIONS = [
  { code: 'harassment', label: 'Harassment or bullying' },
  { code: 'hate', label: 'Hate or discrimination' },
  { code: 'sexual', label: 'Sexual content' },
  { code: 'spam', label: 'Spam or scams' },
  { code: 'other', label: 'Something else' },
] as const;

export type SafetyReasonCode = (typeof SAFETY_REASON_OPTIONS)[number]['code'];
