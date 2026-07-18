/* Tiny shared form validators — customer-facing forms (checkout, leads,
   onboarding, contact details) use these so the rules and messages stay in
   sync everywhere. Each returns an error message, or null when the value is
   fine. The kiosk translates its own messages via i18n, so it applies the
   same rules with its own strings. */

export function nameError(value: string, label = "Name"): string | null {
  const v = value.trim();
  if (!v) return `${label} is required.`;
  if (v.length < 2) return `${label} must be at least 2 characters.`;
  return null;
}

export function phoneError(value: string, { required = true } = {}): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return required ? "Phone number is required." : null;
  if (digits.length < 7) return "Enter a valid phone number (at least 7 digits).";
  if (digits.length > 15) return "Phone number looks too long.";
  return null;
}

/** Style for the inline message under an invalid field. */
export const fieldErrorStyle: React.CSSProperties = {
  fontSize: 12.5, color: "var(--camel)", textAlign: "left",
};
