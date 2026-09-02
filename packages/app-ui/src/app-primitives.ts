/**
 * Primitives internes de boutons (docs/ux/actions.md, lot UX 5 #542).
 *
 * Le DSFR couvre les boutons texte (`fr-btn*`), les fermetures (`fr-btn--close`),
 * les onglets (`fr-tabs`) et les tags cliquables (`fr-tag`). Deux besoins des
 * éditeurs n'ont pas d'équivalent et sont normalisés ici, sur les tokens DSFR :
 *
 * - `app-btn--icon` : bouton icône seule, cible ≥ 32×32 px (`--sm` : 24×24, le
 *   minimum WCAG 2.5.8), états hover / focus-visible / disabled garantis.
 *   Variantes : `--muted` (gris jusqu'au survol), `--danger` (rouge).
 *   Le nom accessible vient de `title` ou `aria-label` ; l'icône est `aria-hidden`.
 * - `app-card-choice` : carte cliquable (tuile de type, jeu d'exemple, choix
 *   d'onboarding, zone d'ajout). État sélectionné via `aria-pressed="true"` ou
 *   `.selected` ; variantes `--compact` (colonne centrée), `--dashed` (zone
 *   d'ajout), `--featured` (mise en avant).
 *
 * Les styles sont injectés une fois par page (depuis <app-header>).
 */
export function injectAppPrimitives(): void {
  if (document.getElementById('app-primitives-style')) return;
  const style = document.createElement('style');
  style.id = 'app-primitives-style';
  style.textContent = `
.app-btn--icon{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:2rem;min-height:2rem;padding:0;margin:0;border:0;border-radius:.25rem;background:none;color:var(--text-action-high-blue-france,#000091);font-size:1rem;line-height:1;cursor:pointer;flex-shrink:0;vertical-align:middle}
.app-btn--icon:hover{background:var(--background-alt-blue-france-hover,#ececfe)}
.app-btn--icon:focus-visible{outline:2px solid var(--border-active-blue-france,#0a76f6);outline-offset:2px}
.app-btn--icon:disabled,.app-btn--icon[aria-disabled="true"]{color:var(--text-disabled-grey,#929292);background:none;cursor:not-allowed;opacity:.6}
.app-btn--icon--sm{min-width:1.5rem;min-height:1.5rem;font-size:.875rem}
.app-btn--icon--muted{color:var(--text-mention-grey,#666)}
.app-btn--icon--muted:hover{color:var(--text-action-high-blue-france,#000091)}
.app-btn--icon--danger{color:var(--text-default-error,#ce0500)}
.app-btn--icon--danger:hover{background:var(--background-contrast-error,#fddede)}
.app-btn--icon i,.app-btn--icon [class^="fr-icon-"],.app-btn--icon [class*=" fr-icon-"]{font-size:1em;line-height:1}
.app-card-choice{display:flex;align-items:center;gap:.75rem;width:100%;box-sizing:border-box;padding:.75rem 1rem;margin:0;border:1px solid var(--border-default-grey,#ddd);border-radius:.25rem;background:var(--background-default-grey,#fff);color:var(--text-title-grey,#161616);font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}
.app-card-choice:hover{border-color:var(--border-action-high-blue-france,#000091);background:var(--background-alt-blue-france,#f5f5fe)}
.app-card-choice:focus-visible{outline:2px solid var(--border-active-blue-france,#0a76f6);outline-offset:2px}
.app-card-choice[aria-pressed="true"],.app-card-choice.selected,.app-card-choice--featured{border-color:var(--border-action-high-blue-france,#000091);background:var(--background-alt-blue-france,#f5f5fe)}
.app-card-choice[aria-pressed="true"],.app-card-choice.selected{box-shadow:inset 0 0 0 1px var(--border-action-high-blue-france,#000091)}
.app-card-choice--compact{flex-direction:column;justify-content:center;gap:.25rem;padding:.75rem .25rem;text-align:center}
.app-card-choice--dashed{justify-content:center;border-style:dashed;background:transparent;color:var(--text-action-high-blue-france,#000091)}
.app-card-choice--dashed:hover{background:var(--background-alt-blue-france,#f5f5fe)}
.app-card-choice > i:first-child,.app-card-choice > [class^="fr-icon-"]:first-child{color:var(--text-action-high-blue-france,#000091);flex-shrink:0}
`;
  document.head.appendChild(style);
}
