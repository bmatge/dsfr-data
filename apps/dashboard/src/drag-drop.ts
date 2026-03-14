/**
 * Dashboard app - Drag and drop handlers
 */

import { state } from './state.js';
import { addWidget, addWidgetFromFavorite } from './widgets.js';
import type { WidgetType } from './state.js';

let draggedData: { type: string; widgetType?: string; favorite?: any } | null = null;

export function initDragAndDrop(): void {
  document.querySelectorAll('.widget-item').forEach(item => {
    item.addEventListener('dragstart', handleWidgetDragStart as EventListener);
    item.addEventListener('dragend', handleDragEnd as EventListener);
  });
  initDropZones();
}

export function initDropZones(): void {
  document.querySelectorAll('.drop-cell').forEach(cell => {
    cell.addEventListener('dragover', handleDragOver as EventListener);
    cell.addEventListener('dragleave', handleDragLeave as EventListener);
    cell.addEventListener('drop', handleDrop as EventListener);
  });
}

function handleWidgetDragStart(e: DragEvent): void {
  const target = e.target as HTMLElement;
  const type = target.dataset.widgetType;
  draggedData = { type: 'new', widgetType: type };
  target.classList.add('dragging');
  e.dataTransfer!.effectAllowed = 'copy';
  e.dataTransfer!.setData('text/plain', JSON.stringify(draggedData));
}

export function handleFavoriteDragStart(e: DragEvent): void {
  const target = e.target as HTMLElement;
  const id = target.dataset.favoriteId;
  const favorite = state.favorites.find(f => f.id === id);
  draggedData = { type: 'favorite', favorite };
  target.classList.add('dragging');
  e.dataTransfer!.effectAllowed = 'copy';
  e.dataTransfer!.setData('text/plain', JSON.stringify(draggedData));
}

function handleDragEnd(e: DragEvent): void {
  (e.target as HTMLElement).classList.remove('dragging');
  draggedData = null;
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'copy';
  (e.currentTarget as HTMLElement).classList.add('drag-over');
}

function handleDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('drag-over');
}

function handleDrop(e: DragEvent): void {
  e.preventDefault();
  (e.currentTarget as HTMLElement).classList.remove('drag-over');

  if (!draggedData) {
    try {
      draggedData = JSON.parse(e.dataTransfer!.getData('text/plain'));
    } catch {
      return;
    }
  }

  const cell = e.currentTarget as HTMLElement;
  const row = parseInt(cell.dataset.row || '0');
  const col = parseInt(cell.dataset.col || '0');

  if (draggedData!.type === 'new') {
    addWidget(draggedData!.widgetType as WidgetType, row, col, cell);
  } else if (draggedData!.type === 'favorite') {
    addWidgetFromFavorite(draggedData!.favorite, row, col, cell);
  }

  draggedData = null;
}
