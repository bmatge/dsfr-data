/**
 * Bloc « composant libre » dans le Tableau de bord (#1111) : il s'affiche, et
 * sa configuration se lit sans s'editer — la validation contre le manifeste
 * vit dans le Studio IA.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Widget } from '@dsfr-data/shared';
import { getWidgetIcon, renderWidget } from '../../../apps/dashboard/src/widgets';
import { closeConfigModal, openConfigModal } from '../../../apps/dashboard/src/widget-config';

const BLOC: Widget = {
  id: 'b1',
  type: 'component',
  title: 'Élèves par commune',
  position: { row: 0, col: 0 },
  config: {
    components: [
      {
        tag: 'dsfr-data-pivot',
        attributes: [
          { name: 'id', value: 'croise' },
          { name: 'source', value: 'src' },
          { name: 'row', value: 'Commune' },
        ],
      },
      {
        tag: 'dsfr-data-list',
        attributes: [
          { name: 'source', value: 'croise' },
          { name: 'caption', value: '<img src=x onerror=alert(1)>' },
        ],
      },
    ],
  },
};

describe('#1111 — Tableau de bord : bloc composant libre', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="drop-cell"></div>
      <div id="config-modal"><h2 id="config-modal-title"></h2><div id="config-modal-body"></div></div>`;
  });

  it('s’affiche avec la liste de ses composants', () => {
    const cell = document.querySelector<HTMLElement>('.drop-cell')!;
    renderWidget(BLOC, cell);
    expect(cell.textContent).toContain('Composants : dsfr-data-pivot, dsfr-data-list');
    expect(getWidgetIcon('component')).toBe('ri-code-box-line');
  });

  it('la configuration est en lecture seule, echappee, et renvoie au Studio IA', () => {
    openConfigModal(BLOC);
    const corps = document.getElementById('config-modal-body')!;
    expect(corps.textContent).toContain('se modifie dans le Studio IA');
    // Aucun champ d'edition des composants : seul le titre (commun) s'edite.
    expect([...corps.querySelectorAll('input, select, textarea')].map((e) => e.id)).toEqual([
      'config-title',
    ]);
    const codes = [...corps.querySelectorAll('code')].map((c) => c.textContent);
    expect(codes[0]).toBe('<dsfr-data-pivot id="croise" source="src" row="Commune">');
    // La valeur est affichee comme du texte, jamais interpretee.
    expect(corps.querySelector('img')).toBeNull();
    expect(codes[1]).toContain('onerror=alert(1)');
    closeConfigModal();
  });
});
