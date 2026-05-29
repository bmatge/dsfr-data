/**
 * Bootstrap admin facultatif.
 *
 * Si SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD sont définis dans l'environnement,
 * crée un compte admin (email auto-vérifié) avec ces identifiants au démarrage,
 * uniquement s'il n'existe pas déjà.
 *
 * Destiné à débloquer un déploiement (ex. derrière un reverse proxy sans SMTP,
 * où la vérification email ne peut pas aboutir). À RETIRER après usage : tant
 * que les variables restent définies, le compte sera recréé s'il est supprimé.
 *
 * NB : volontairement piloté par l'environnement et NON codé en dur, pour ne pas
 * committer d'identifiants par défaut dans un dépôt public (backdoor).
 */
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute } from '../db/database.js';

const SALT_ROUNDS = 10;

export async function seedAdminFromEnv(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    console.warn(`[seed-admin] Le compte ${email} existe deja — aucun changement.`);
    return;
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const name = email.split('@')[0];

  await execute(
    `INSERT INTO users (id, email, password_hash, display_name, role, email_verified)
     VALUES (?, ?, ?, ?, 'admin', TRUE)`,
    [id, email, passwordHash, name]
  );

  console.warn(
    `[seed-admin] Compte admin de bootstrap cree pour ${email}. ` +
      `Retirez SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD du .env apres connexion ` +
      `et changez le mot de passe.`
  );
}
