import { ClassicPreset } from 'rete';

export type NodeCategory = 'source' | 'transform' | 'interact' | 'display' | 'a11y';

export interface PipelineNodeConfig {
  label: string;
  component: string;          // dsfr-data-* tag name
  category: NodeCategory;
  icon: string;
  description: string;
  attributes: AttributeDef[];
}

export interface AttributeDef {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number' | 'boolean';
  options?: { value: string; label: string }[];
  default?: string;
  placeholder?: string;
}

/**
 * Custom control that holds a configurable attribute for a pipeline node.
 */
export class AttributeControl extends ClassicPreset.Control {
  onChange?: () => void;

  constructor(
    public def: AttributeDef,
    public value: string = def.default ?? ''
  ) {
    super();
  }

  /** Set value and notify the UI */
  setValue(val: string) {
    this.value = val;
    this.onChange?.();
  }

  /** Update options dynamically (e.g. after execution populates fields) */
  setOptions(options: { value: string; label: string }[]) {
    this.def.type = 'select';
    this.def.options = options;
    this.onChange?.();
  }
}

export type ExecutionStatus = 'idle' | 'loading' | 'success' | 'error' | 'warning';

export interface ExecutionResult {
  status: ExecutionStatus;
  message?: string;
  fields?: string[];
  rowCount?: number;
  sampleData?: Record<string, unknown>[];
}

/**
 * Control that displays execution status and available fields in a node.
 */
export class StatusControl extends ClassicPreset.Control {
  result: ExecutionResult = { status: 'idle' };
  onChange?: () => void;

  update(result: ExecutionResult) {
    this.result = result;
    this.onChange?.();
  }
}

/**
 * A pipeline node representing a dsfr-data-* component.
 */
export class PipelineNode extends ClassicPreset.Node {
  width = 260;
  height = 350;
  category: NodeCategory;
  component: string;
  icon: string;
  description: string;
  statusControl: StatusControl;
  /** Runtime HTML id used during execution */
  runtimeId = '';

  constructor(public config: PipelineNodeConfig) {
    super(config.label);
    this.category = config.category;
    this.component = config.component;
    this.icon = config.icon;
    this.description = config.description;

    // Add attribute controls
    for (const attr of config.attributes) {
      this.addControl(attr.name, new AttributeControl(attr));
    }

    // Add status control (always last)
    this.statusControl = new StatusControl();
    this.addControl('__status__', this.statusControl);
  }

  /** Get all attribute values as a record */
  getAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const [key, ctrl] of Object.entries(this.controls)) {
      if (ctrl instanceof AttributeControl && ctrl.value) {
        attrs[key] = ctrl.value;
      }
    }
    return attrs;
  }
}
