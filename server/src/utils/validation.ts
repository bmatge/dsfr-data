/**
 * Input validation utilities for auth routes.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;

/**
 * Check if a string is a valid email address.
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_RE.test(email);
}

/**
 * Check if a password meets strength requirements.
 * Min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit.
 */
export function isStrongPassword(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Le mot de passe doit contenir au moins 8 caracteres' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: 'Le mot de passe doit contenir au moins une minuscule' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Le mot de passe doit contenir au moins une majuscule' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Le mot de passe doit contenir au moins un chiffre' };
  }
  return { valid: true };
}
