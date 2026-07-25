/**
 * Session variable store for pio sub-sessions.
 *
 * Two-layer variable system:
 * - Read-only layer: session params frozen at construction time
 * - Writable layer: runtime variables with explicit declared types
 *
 * Supports pre-declaration, type enforcement, and template interpolation.
 */

// ---------------------------------------------------------------------------
// SessionVariableStore class
// ---------------------------------------------------------------------------

export class SessionVariableStore {
  private readonly _params: Readonly<Record<string, unknown>>;
  private readonly _writable: Map<string, { value: unknown; type: string }>;
  private readonly _declarations: Map<string, string>;

  constructor(params: Record<string, unknown>) {
    this._params = params;
    this._writable = new Map();
    this._declarations = new Map();
  }

  declare(name: string, type: string): void {
    if (this._declarations.has(name)) {
      const existing = this._declarations.get(name);
      if (existing !== type) {
        throw new Error(
          `Type mismatch for variable '${name}': expected '${existing}', got '${type}'`,
        );
      }
      // Idempotent — same name and type is a no-op
      return;
    }
    this._declarations.set(name, type);
  }

  set(name: string, type: string, value: unknown): void {
    // Read-only protection — params cannot be modified via set()
    if (name in this._params) {
      throw new Error(
        `Cannot set variable '${name}': it is a read-only session parameter`,
      );
    }

    // Type enforcement — check against pre-declared type
    if (this._declarations.has(name)) {
      const declaredType = this._declarations.get(name);
      if (declaredType !== type) {
        throw new Error(
          `Type mismatch for variable '${name}': expected '${declaredType}', got '${type}'`,
        );
      }
    }

    // Type enforcement — check against existing stored type
    const existingWritable = this._writable.get(name);
    if (existingWritable !== undefined && existingWritable.type !== type) {
      throw new Error(
        `Type mismatch for variable '${name}': expected '${existingWritable.type}', got '${type}'`,
      );
    }

    // Value interpolation for strings
    const resolved = this._interpolateValue(value);

    this._writable.set(name, { value: resolved, type });
  }

  get(name: string): unknown | undefined {
    if (this._writable.has(name)) {
      return this._writable.get(name)?.value;
    }
    if (name in this._params) {
      return this._params[name];
    }
    return undefined;
  }

  getAll(): Record<string, unknown> {
    const result = { ...this._params };
    for (const [name, entry] of this._writable) {
      result[name] = entry.value;
    }
    return result;
  }

  isDefined(name: string): boolean {
    return this._writable.has(name);
  }

  interpolate(template: string): string {
    const vars = this.getAll();
    return template.replace(
      /\$\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g,
      (_match, varName) => {
        if (varName in vars) {
          return String(vars[varName]);
        }
        return _match; // Pass through unchanged
      },
    );
  }

  private _interpolateValue(value: unknown): unknown {
    if (typeof value !== "string") {
      return value;
    }
    const vars = this.getAll();
    return value.replace(
      /\$\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g,
      (_match, varName) => {
        if (varName in vars) {
          return String(vars[varName]);
        }
        return _match; // Pass through unchanged
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _store: SessionVariableStore | null = null;

export function setStore(store: SessionVariableStore): void {
  _store = store;
}

export function getStore(): SessionVariableStore | null {
  return _store;
}

// ---------------------------------------------------------------------------
// Test accessors
// ---------------------------------------------------------------------------

export function __testResetStore(): void {
  _store = null;
}
