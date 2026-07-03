export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidPhone10(value: string): boolean {
  const digits = normalizePhoneDigits(value);
  return digits.length === 10;
}

export function isValidEmailOptional(value: string): boolean {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const PHONE_ERROR = "Phone must be exactly 10 digits";
export const EMAIL_ERROR = "Enter a valid email address";
