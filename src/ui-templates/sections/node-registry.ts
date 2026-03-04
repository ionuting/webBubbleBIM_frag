import type * as OBC from "@thatopen/components";

// ─── Execution context ────────────────────────────────────────────────────────

/**
 * Everything a custom node's execute handler needs. Passed at runtime by the
 * graph executor whenever the switch-case has no built-in match.
 */
export interface NodeExecContext {
  /** Current node being executed */
  node: { id: string; type: string; x: number; y: number; params: Record<string, string> };
  /** Convenience alias for node.id */
  nodeId: string;
  /** Main application Components instance – use get() to access any service */
  components: OBC.Components;
  /**
   * Output port map.
   * Use `out.set("portId", value)` to expose values to downstream nodes.
   */
  out: Map<string, any>;
  /**
   * Reads IFC item sets (ModelIdMap) from an **input** port.
   * Merges across all upstream connections.
   * Returns null when nothing is connected.
   */
  getInput: (nodeId: string, portId: string) => Record<string, Set<number>> | null;
  /** Raw value from the first upstream connection on a port. */
  getRawInput: (nodeId: string, portId: string) => any | null;
  /** All raw values from every upstream connection on a port, flattened. */
  getRawInputAll: (nodeId: string, portId: string) => any[];
  /** Write a line to the node-editor console. */
  log: (msg: string, level?: "info" | "ok" | "warn" | "error") => void;
  /**
   * Map of nodeId → Fragments modelId owned by element nodes.
   * On re-run, dispose the old model before creating a new one.
   */
  neModelIds: Map<string, string>;
  /**
   * Returns the lazily-initialised WASM GeometryEngine singleton.
   * First call initialises web-ifc; subsequent calls return the cached instance.
   */
  getGeoEngine: () => Promise<any>;
}

// ─── Plugin definition ────────────────────────────────────────────────────────

/**
 * Visual / metadata description of a custom node type.
 * Structurally identical to the built-in `NodeTypeDef` but with `category` required.
 */
export interface NodePluginDef {
  /** Unique string identifier (used internally and for serialisation). */
  type: string;
  /** Human-readable display name shown in the canvas header. */
  label: string;
  /** CSS colour string for the node header and palette accent. */
  color: string;
  /** Emoji / icon shown in the palette and node header. */
  icon: string;
  /**
   * Palette category this node appears under.
   * Nodes with the same category string are grouped together.
   */
  category: string;
  inputs: Array<{ id: string; label: string }>;
  outputs: Array<{ id: string; label: string }>;
  params: Array<{
    id: string;
    label: string;
    placeholder: string;
    defaultValue?: string;
    type?: "text" | "textarea" | "select";
    /** Categoria din BIMLibrary din care se populează opțiunile (când type="select"). */
    selectSource?: string;
    /** Opțiuni statice (alternativă la selectSource). */
    selectOptions?: Array<{ value: string; label: string }>;
  }>;
  /** Sink nodes (no outputs) are always re-executed on every run. */
  isSink?: boolean;
}

/** A complete node plugin: visual definition + execution logic. */
export interface NodePlugin {
  def: NodePluginDef;
  execute: (ctx: NodeExecContext) => Promise<void>;
}

// ─── Registry singleton ───────────────────────────────────────────────────────

class NodeRegistryClass {
  private readonly _plugins = new Map<string, NodePlugin>();
  private readonly _categoryOrder: string[] = [];

  /**
   * Register a new node type.
   *
   * Call this **before** `mountNodalGraphPanel()` so the node appears in the
   * palette immediately. Registering after mounting requires a page reload.
   *
   * @example
   * ```ts
   * import { NodeRegistry } from "@/ui-templates";
   *
   * NodeRegistry.register({
   *   def: {
   *     type: "my-custom-node",
   *     label: "My Node",
   *     color: "#7c3aed",
   *     icon: "⚡",
   *     category: "My Plugin",
   *     inputs: [{ id: "items", label: "Items" }],
   *     outputs: [{ id: "result", label: "Result" }],
   *     params: [
   *       { id: "value", label: "Value", placeholder: "42", defaultValue: "42" },
   *     ],
   *   },
   *   execute: async (ctx) => {
   *     const items = ctx.getInput(ctx.nodeId, "items");
   *     ctx.log(`Got ${Object.keys(items ?? {}).length} models`, "info");
   *     ctx.out.set("result", items);
   *   },
   * });
   * ```
   */
  register(plugin: NodePlugin): void {
    if (this._plugins.has(plugin.def.type)) {
      console.warn(`[NodeRegistry] Overwriting existing type: "${plugin.def.type}"`);
    }
    this._plugins.set(plugin.def.type, plugin);
    if (!this._categoryOrder.includes(plugin.def.category)) {
      this._categoryOrder.push(plugin.def.category);
    }
  }

  /** Returns the plugin for a given node type string, or undefined. */
  getPlugin(type: string): NodePlugin | undefined {
    return this._plugins.get(type);
  }

  /** Returns all registered plugins in registration order. */
  getAllPlugins(): NodePlugin[] {
    return Array.from(this._plugins.values());
  }

  /**
   * Returns unique category names in the order they were first registered.
   * Built-in categories always precede custom ones.
   */
  getCategories(): string[] {
    return [...this._categoryOrder];
  }

  /** Returns all plugins belonging to a given category. */
  getByCategory(category: string): NodePlugin[] {
    return Array.from(this._plugins.values()).filter((p) => p.def.category === category);
  }
}

/**
 * Global node plugin registry.
 *
 * Register custom nodes here **before** calling `mountNodalGraphPanel()`.
 * Registered nodes automatically appear in the palette under their category
 * and are executed by the graph runner when selected.
 */
export const NodeRegistry = new NodeRegistryClass();
