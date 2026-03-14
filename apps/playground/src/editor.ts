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
    indentWithTabs: false
  });

  // CodeMirror creates a hidden textarea for input; label it for accessibility
  const cmTextarea = document.querySelector('.CodeMirror textarea');
  if (cmTextarea) cmTextarea.setAttribute('aria-label', 'Editeur de code HTML');

  return editor;
}
