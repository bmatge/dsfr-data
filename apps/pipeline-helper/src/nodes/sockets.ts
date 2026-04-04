import { ClassicPreset } from 'rete';

/** Data socket — carries row data between components */
export const DataSocket = new ClassicPreset.Socket('data');

/** Command socket — carries commands (where, page, orderBy) upstream */
export const CommandSocket = new ClassicPreset.Socket('command');
