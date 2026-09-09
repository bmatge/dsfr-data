/**
 * CodeMirror editor wrapper for the playground
 */

// CodeMirror is loaded as a global script in the HTML
declare const CodeMirror: {
  fromTextArea(el: HTMLTextAreaElement, options: Record<string, unknown>): CodeMirrorEditor;
};

export interface CodeMirrorEditor {
  getValue(): string;
  setValue(value: string): void;
  on(event: string, handler: (cm: CodeMirrorEditor, event: KeyboardEvent) => void): void;
  setSize(width: number | string | null, height: number | string | null): void;
  getWrapperElement(): HTMLElement;
  getScrollerElement(): HTMLElement;
  refresh(): void;
}

export function initEditor(textareaId: string): CodeMirrorEditor {
  const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
  if (!textarea) {
    throw new Error(`Textarea #${textareaId} not found`);
  }

  const editor = CodeMirror.fromTextArea(textarea, {
    mode: 'htmlmixed',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2,
    indentWithTabs: false,
  });

  // CodeMirror creates a hidden textarea for input; label it for accessibility
  const cmTextarea = document.querySelector('.CodeMirror textarea');
  if (cmTextarea) cmTextarea.setAttribute('aria-label', 'Editeur de code HTML');

  // La zone de défilement de CodeMirror 5 (tabindex=-1) ne contient aucun
  // élément focusable (le textarea est un frère) : dès que le code dépasse la
  // hauteur de l'éditeur, axe la signale (scrollable-region-focusable,
  // WCAG 2.1.1). On la rend atteignable au clavier.
  const scroller = editor.getScrollerElement();
  scroller.setAttribute('tabindex', '0');
  scroller.setAttribute('aria-label', 'Défilement du code');

  observeEditorSize(editor);

  return editor;
}

/**
 * Rafraichit CodeMirror quand son conteneur change de taille (#611).
 *
 * CM5 calcule sa fenetre d'affichage a l'initialisation. Depuis que
 * l'editeur est dimensionne par le flex de sa colonne et non par une hauteur
 * en dur, cette taille change APRES l'init — au premier calcul de layout, au
 * glissement du separateur d'`app-layout-builder`, au passage en mode
 * empile. Sans `refresh()`, CM garde son ancienne fenetre : lignes non
 * rendues en bas, gouttiere desalignee.
 *
 * `ResizeObserver` plutot qu'un `resize` de fenetre : le separateur
 * redimensionne la colonne sans que la fenetre bouge. Le rendu est reporte a
 * l'image suivante pour ne pas relancer un calcul de layout dans le callback
 * de l'observateur (boucle « ResizeObserver loop » signalee par le
 * navigateur).
 */
function observeEditorSize(editor: CodeMirrorEditor): void {
  if (typeof ResizeObserver === 'undefined') return;
  const wrapper = editor.getWrapperElement();
  let pending = false;
  const observer = new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      editor.refresh();
    });
  });
  observer.observe(wrapper);
}
