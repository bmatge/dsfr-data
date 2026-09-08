import { describe, it, expect } from 'vitest';
import { appendQuery } from '../../packages/shared/src/api/url';

/**
 * Assemblage de la chaine de requete des generateurs (#615).
 *
 * CE FICHIER EXISTE A CAUSE DE DONNEES FAUSSES, SANS ERREUR. Les generateurs
 * concatenaient `?` sans regarder si l'URL en avait deja un. Sur une source
 * OpenDataSoft deja parametree — et elles le sont couramment — le serveur
 * lisait le dernier parametre existant comme valant tout le reste, et
 * ignorait purement et simplement le `select` et le `group_by` ajoutes.
 *
 * L'utilisateur recevait des donnees BRUTES non agregees, dans un graphique
 * qui s'affichait normalement. C'est le seul defaut de cette serie a produire
 * un resultat faux plutot qu'un rendu vide ou un script mort.
 */

describe('appendQuery', () => {
  it('ouvre la chaine de requete quand il n’y en a pas', () => {
    expect(appendQuery('https://x.gouv.fr/records', 'select=a&group_by=b')).toBe(
      'https://x.gouv.fr/records?select=a&group_by=b'
    );
  });

  it('la PROLONGE quand il y en a deja une — le defaut', () => {
    // `…/records?refine=annee:2024` + `?select=…` donnait une seconde
    // interrogation : le serveur lisait `refine=annee:2024?select=…` et
    // perdait l'agregation en silence.
    expect(appendQuery('https://x.gouv.fr/records?refine=annee:2024', 'select=a')).toBe(
      'https://x.gouv.fr/records?refine=annee:2024&select=a'
    );
  });

  it('reconnait une chaine de requete vide mais presente', () => {
    expect(appendQuery('https://x.gouv.fr/records?', 'select=a')).toBe(
      'https://x.gouv.fr/records?&select=a'
    );
  });

  it('laisse le fragment en queue', () => {
    // Un `#…` doit rester le dernier element de l'URL, sans quoi il avalerait
    // les parametres ajoutes.
    expect(appendQuery('https://x.gouv.fr/records#tableau', 'select=a')).toBe(
      'https://x.gouv.fr/records?select=a#tableau'
    );
    expect(appendQuery('https://x.gouv.fr/records?a=1#tableau', 'select=b')).toBe(
      'https://x.gouv.fr/records?a=1&select=b#tableau'
    );
  });

  it('rend l’URL inchangee quand il n’y a rien a ajouter', () => {
    expect(appendQuery('https://x.gouv.fr/records', '')).toBe('https://x.gouv.fr/records');
    expect(appendQuery('https://x.gouv.fr/records?a=1', '')).toBe('https://x.gouv.fr/records?a=1');
  });

  it('produit une URL que le navigateur relit a l’identique', () => {
    // Verification de bout en bout : les parametres ajoutes doivent etre
    // lisibles comme tels, pas noyes dans la valeur du precedent.
    const url = new URL(
      appendQuery('https://x.gouv.fr/records?refine=annee:2024', 'select=sum(pop)&group_by=region')
    );

    expect(url.searchParams.get('refine')).toBe('annee:2024');
    expect(url.searchParams.get('select')).toBe('sum(pop)');
    expect(url.searchParams.get('group_by')).toBe('region');
  });
});
