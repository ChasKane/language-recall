/**
 * Minimal `obsidian` module stub for unit tests.
 *
 * This keeps tests hermetic and avoids relying on Obsidian's runtime
 * while still allowing our modules to import types/classes.
 */

export class Plugin {
  // Tests may new() or extend this class.
  app: unknown;

  async loadData(): Promise<unknown> {
    return undefined;
  }

  async saveData(_data: unknown): Promise<void> {}

  registerView(): void {}

  addRibbonIcon(): void {}

  addSettingTab(): void {}
}

export class Modal {
  contentEl: HTMLElement;

  constructor(public app: unknown) {
    this.contentEl = document.createElement('div');
  }

  setTitle(_title: string): void {}

  open(): void {}

  close(): void {}

  onOpen(): void {}

  onClose(): void {}
}

export class PluginSettingTab {
  containerEl: HTMLElement;

  constructor(
    public app: unknown,
    public plugin: unknown,
  ) {
    this.containerEl = document.createElement('div');
  }
}

export class Setting {
  controlEl: HTMLElement;

  constructor(public containerEl: HTMLElement) {
    this.controlEl = document.createElement('div');
  }

  setName(_name: string): this {
    return this;
  }

  setDesc(_desc: string): this {
    return this;
  }

  addText(_cb: (text: TextComponent) => void): this {
    return this;
  }

  addButton(_cb: (button: ButtonComponent) => void): this {
    return this;
  }
}

export class TextComponent {
  setValue(_v: string): this {
    return this;
  }
  setPlaceholder(_v: string): this {
    return this;
  }
  getValue(): string {
    return '';
  }
}

export class ButtonComponent {
  setButtonText(_v: string): this {
    return this;
  }
  setCta(): this {
    return this;
  }
  onClick(_cb: () => void): this {
    return this;
  }
}

export class WorkspaceLeaf {}
export class FileView {
  containerEl: HTMLElement;
  allowNoFile?: boolean;
  icon?: string;

  constructor(_leaf: WorkspaceLeaf) {
    this.containerEl = document.createElement('div');
    this.containerEl.className = 'view-content';
  }

  async setState(_state: unknown, _result: unknown): Promise<void> {}

  getState(): unknown {
    return {};
  }
}

export type ViewStateResult = unknown;

export function parseYaml(text: string): unknown {
  // Minimal YAML parser for simple `key: value` frontmatter used in tests.
  // This is intentionally tiny (no nested objects, no arrays).
  const out: Record<string, string> = {};
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, '');
    out[key] = value;
  }

  return out;
}

export function stringifyYaml(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${String(v ?? '')}`)
    .join('\n');
}

export async function requestUrl(_opts: unknown): Promise<{ json: unknown }> {
  throw new Error('requestUrl is not available in unit tests');
}
