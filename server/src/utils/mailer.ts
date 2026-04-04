/**
 * Email sending utilities via SMTP.
 * Uses docker-mailserver on ecosystem-network (port 25, no auth).
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

const FROM = () => process.env.SMTP_FROM || 'noreply@ecosysteme.matge.com';
const APP_URL = () => process.env.APP_URL || 'https://chartsbuilder.matge.com';

/** Escape HTML special characters to prevent injection in email templates. */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Get or create the nodemailer transporter.
 * Lazy-initialized to allow env vars to be set before first use.
 */
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'mailserver',
      port: parseInt(process.env.SMTP_PORT || '25', 10),
      secure: false,
      tls: { rejectUnauthorized: false },
      // No auth — internal Docker network
    });
  }
  return transporter;
}

/**
 * Send a verification email with a one-time token link.
 * The user must click the link to activate their account.
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = `${APP_URL()}/api/auth/verify-email?token=${token}`;
  await getTransporter().sendMail({
    from: `"DSFR Data" <${FROM()}>`,
    to: email,
    subject: 'Confirmez votre adresse email — DSFR Data',
    html: `
      <p>Bonjour,</p>
      <p>Vous avez cree un compte sur <strong>DSFR Data</strong>.</p>
      <p>Cliquez sur le lien ci-dessous pour confirmer votre adresse email et activer votre compte :</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>Ce lien expire dans <strong>24 heures</strong>.</p>
      <p>Si vous n'etes pas a l'origine de cette inscription, ignorez cet email.</p>
    `,
    text: `Confirmez votre email en visitant : ${verifyUrl}\n\nCe lien expire dans 24 heures.`,
  });
}

/**
 * Send a welcome email for ProConnect users (first login).
 * Non-blocking: failure does not prevent login.
 */
export async function sendWelcomeEmail(email: string, displayName: string): Promise<void> {
  const appUrl = APP_URL();
  await getTransporter().sendMail({
    from: `"DSFR Data" <${FROM()}>`,
    to: email,
    subject: 'Bienvenue sur DSFR Data',
    html: `
      <p>Bonjour ${esc(displayName)},</p>
      <p>Votre compte a ete cree sur <a href="${appUrl}">DSFR Data</a> via ProConnect.</p>
      <p>Vous disposez du role <strong>editeur</strong> et pouvez creer des visualisations de donnees.</p>
      <p>Si vous n'etes pas a l'origine de cette connexion, contactez l'administrateur.</p>
    `,
    text: `Bonjour ${displayName},\n\nVotre compte a ete cree sur DSFR Data (${appUrl}) via ProConnect.\nRole : editeur.`,
  });
}

/**
 * Send a password reset email with a one-time token link.
 * Token expires in 1 hour.
 */
export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL()}/?reset-password=${token}`;
  await getTransporter().sendMail({
    from: `"DSFR Data" <${FROM()}>`,
    to: email,
    subject: 'Reinitialisation de votre mot de passe — DSFR Data',
    html: `
      <p>Bonjour,</p>
      <p>Vous avez demande la reinitialisation de votre mot de passe sur <strong>DSFR Data</strong>.</p>
      <p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Ce lien expire dans <strong>1 heure</strong>.</p>
      <p>Si vous n'etes pas a l'origine de cette demande, ignorez cet email. Votre mot de passe actuel ne sera pas modifie.</p>
    `,
    text: `Reinitialisation de votre mot de passe DSFR Data.\n\nCliquez sur ce lien : ${resetUrl}\n\nCe lien expire dans 1 heure.\n\nSi vous n'etes pas a l'origine de cette demande, ignorez cet email.`,
  });
}

/**
 * Override the transporter (for testing with a mock).
 */
export function setTransporter(t: Transporter | null): void {
  transporter = t;
}
