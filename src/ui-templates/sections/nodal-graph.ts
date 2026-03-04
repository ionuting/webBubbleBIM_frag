import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import * as WEBIFC from "web-ifc";
import { NodeRegistry } from "./node-registry";
import { BIMLibrary } from "./bim-library";

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "bim-node-editor-v2";
const LAYOUT_KEY = "bim-ne-layout-v1";
const STYLE_NAME = "node-editor-highlight";
const GRID_SIZE = 24;

// ─── Fragments element state ────────────────────────────────────────────────────

let _geoEngine: FRAGS.GeometryEngine | null = null;
export const _neModelIds = new Map<string, string>(); // nodeId → Fragments modelId

/** Generates a compact 22-char IFC-style GlobalId using crypto.randomUUID */
const generateGuid = (): string => {
  // Generate a standard UUID, strip hyphens, then base64url-encode the 16 bytes
  const uuid = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, "")
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  // Pack hex pairs into bytes and convert to IFC base64 alphabet
  const IFC64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let result = "";
  let bits = 0;
  let accum = 0;
  for (let i = 0; i < uuid.length; i += 2) {
    accum = (accum << 8) | parseInt(uuid.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += IFC64[(accum >> bits) & 0x3f];
    }
  }
  if (bits > 0) result += IFC64[(accum << (6 - bits)) & 0x3f];
  return result.slice(0, 22);
};

const getGeoEngine = async (): Promise<FRAGS.GeometryEngine> => {
  if (_geoEngine) return _geoEngine;
  const api = new WEBIFC.IfcAPI();
  api.SetWasmPath("/node_modules/web-ifc/", false);
  await api.Init();
  _geoEngine = new FRAGS.GeometryEngine(api);
  return _geoEngine;
};

// ─── Layout persistence ───────────────────────────────────────────────────────

interface NELayout {
  mode: "float" | "dock";
  float: { x: number; y: number; w: number; h: number };
  dockH: number;
}

const defaultLayout = (): NELayout => ({
  mode: "float",
  float: { x: 72, y: 48, w: Math.max(820, window.innerWidth - 88), h: Math.max(420, window.innerHeight - 64) },
  dockH: Math.round(window.innerHeight * 0.44),
});

const loadLayout = (): NELayout => {
  try {
    const d = defaultLayout();
    const stored = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}") as Partial<NELayout>;
    return { ...d, ...stored, float: { ...d.float, ...(stored.float ?? {}) } };
  } catch { return defaultLayout(); }
};

const saveLayout = (l: NELayout) => localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));

const CATS_KEY = "bim-ne-cats-v1";
const loadCatState = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(CATS_KEY) || "{}"); } catch { return {}; } };
const saveCatState = (s: Record<string, boolean>) => localStorage.setItem(CATS_KEY, JSON.stringify(s));

const NODE_WIDTH = 200;
const NODE_HEADER_H = 36;
const PORT_RADIUS = 7;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PortDef {
  id: string;
  label: string;
}

export interface ParamDef {
  id: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  type?: "text" | "textarea" | "select";
  /** Categoria din BIMLibrary din care se populează opțiunile dropdown-ului. */
  selectSource?: string;
  /** Opțiuni statice pentru dropdown (alternativă la selectSource). */
  selectOptions?: Array<{ value: string; label: string }>;
}

export interface NodeTypeDef {
  type: string;
  label: string;
  color: string;
  icon: string;
  inputs: PortDef[];
  outputs: PortDef[];
  params: ParamDef[];
  /** Palette category group (built-in or custom). */
  category?: string;
  isSink?: boolean;
}

export interface NodeInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  params: Record<string, string>;
}

export interface Connection {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface GraphData {
  nodes: NodeInstance[];
  connections: Connection[];
}

// ─── Node type registry ───────────────────────────────────────────────────────

const NODE_TYPES: NodeTypeDef[] = [
  {
    type: "model-source",
    label: "Model",
    category: "Query",
    color: "#6366f1",
    icon: "📦",
    inputs: [],
    outputs: [{ id: "items", label: "Items" }],
    params: [{ id: "modelId", label: "Model ID", placeholder: "e.g. MyModel (leave empty = all)" }],
  },
  {
    type: "category-filter",
    label: "Category Filter",
    category: "Query",
    color: "#0ea5e9",
    icon: "🏷",
    inputs: [{ id: "items", label: "Items" }],
    outputs: [{ id: "items", label: "Items" }],
    params: [{ id: "category", label: "IFC Category", placeholder: "e.g. IfcWall" }],
  },
  {
    type: "storey-filter",
    label: "Storey Filter",
    category: "Query",
    color: "#10b981",
    icon: "🏢",
    inputs: [{ id: "items", label: "Items" }],
    outputs: [{ id: "items", label: "Items" }],
    params: [{ id: "storey", label: "Storey Name", placeholder: "e.g. Ground Floor" }],
  },
  {
    type: "union",
    label: "Union",
    category: "Query",
    color: "#8b5cf6",
    icon: "∪",
    inputs: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    outputs: [{ id: "items", label: "Items" }],
    params: [],
  },
  {
    type: "intersect",
    label: "Intersect",
    category: "Query",
    color: "#ec4899",
    icon: "∩",
    inputs: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    outputs: [{ id: "items", label: "Items" }],
    params: [],
  },
  {
    type: "isolate",
    label: "Isolate",
    category: "Display",
    color: "#ef4444",
    icon: "◎",
    inputs: [{ id: "items", label: "Items" }],
    outputs: [],
    params: [],
    isSink: true,
  },
  {
    type: "highlight",
    label: "Highlight",
    category: "Display",
    color: "#f97316",
    icon: "✦",
    inputs: [{ id: "items", label: "Items" }],
    outputs: [],
    params: [{ id: "color", label: "Color (hex)", placeholder: "#4dc0ff", defaultValue: "#4dc0ff" }],
    isSink: true,
  },
  {
    type: "print",
    label: "Print",
    category: "Display",
    color: "#0d9488",
    icon: "📋",
    inputs: [{ id: "items", label: "Items" }],
    outputs: [{ id: "items", label: "Items" }],
    params: [{ id: "label", label: "Label", placeholder: "e.g. Walls result" }],
  },
  {
    type: "add-wall",
    label: "Add Wall",
    category: "Elements",
    color: "#d97706",
    icon: "🧱",
    inputs: [{ id: "matrices", label: "Matrices" }],
    outputs: [],
    params: [
      { id: "walls", label: "Walls — startX,startZ,endX,endZ (per linie)", type: "textarea", placeholder: "0,0,5,0\n0,0,0,5", defaultValue: "0,0,5,0" },
      { id: "height", label: "Height (m)", placeholder: "3", defaultValue: "3" },
      { id: "thickness", label: "Thickness (m)", placeholder: "0.2", defaultValue: "0.2" },
      { id: "elevation", label: "Elevation (m)", placeholder: "0", defaultValue: "0" },
      { id: "color", label: "Color (hex)", placeholder: "#d4a96a", defaultValue: "#d4a96a" },
      { id: "hide", label: "Ascunde din viewer (true/false)", placeholder: "false", defaultValue: "false" },
    ],
    isSink: true,
  },
  {
    type: "add-beam",
    label: "Add Beam",
    category: "Elements",
    color: "#b45309",
    icon: "⬛",
    inputs: [{ id: "matrices", label: "Matrices" }],
    outputs: [],
    params: [
      { id: "beams", label: "Beams — x1,y1,z1,x2,y2,z2 (per linie)", type: "textarea", placeholder: "0,3,0,5,3,0", defaultValue: "0,3,0,5,3,0" },
      { id: "width", label: "Width (m)", placeholder: "0.2", defaultValue: "0.2" },
      { id: "depth", label: "Depth (m)", placeholder: "0.4", defaultValue: "0.4" },
      { id: "color", label: "Color (hex)", placeholder: "#a16207", defaultValue: "#a16207" },
      { id: "hide", label: "Ascunde din viewer (true/false)", placeholder: "false", defaultValue: "false" },
    ],
    isSink: true,
  },
  {
    type: "add-column",
    label: "Add Column",
    category: "Elements",
    color: "#0891b2",
    icon: "🏛",
    inputs: [{ id: "matrices", label: "Matrices" }],
    outputs: [],
    params: [
      { id: "columns", label: "Columns — x,z (per linie)", type: "textarea", placeholder: "0,0\n5,0\n5,5", defaultValue: "0,0" },
      { id: "width", label: "Width (m)", placeholder: "0.3", defaultValue: "0.3" },
      { id: "depth", label: "Depth (m)", placeholder: "0.3", defaultValue: "0.3" },
      { id: "height", label: "Height (m)", placeholder: "3", defaultValue: "3" },
      { id: "elevation", label: "Elevation (m)", placeholder: "0", defaultValue: "0" },
      { id: "color", label: "Color (hex)", placeholder: "#7dd3fc", defaultValue: "#7dd3fc" },
      { id: "hide", label: "Ascunde din viewer (true/false)", placeholder: "false", defaultValue: "false" },
    ],
    isSink: true,
  },
  {
    type: "add-slab",
    label: "Add Slab",
    category: "Elements",
    color: "#6b7280",
    icon: "⬜",
    inputs: [{ id: "matrices", label: "Matrices" }],
    outputs: [],
    params: [
      { id: "contours", label: "Slabs — x1,z1;x2,z2;... (per linie)", type: "textarea", placeholder: "0,0;5,0;5,4;0,4", defaultValue: "0,0;5,0;5,4;0,4" },
      { id: "thickness", label: "Thickness (m)", placeholder: "0.25", defaultValue: "0.25" },
      { id: "elevation", label: "Elevation (m)", placeholder: "3", defaultValue: "3" },
      { id: "color", label: "Color (hex)", placeholder: "#9ca3af", defaultValue: "#9ca3af" },
      { id: "hide", label: "Ascunde din viewer (true/false)", placeholder: "false", defaultValue: "false" },
    ],
    isSink: true,
  },
  {
    type: "add-covering",
    label: "Add Covering",
    category: "Elements",
    color: "#7c3aed",
    icon: "🪟",
    inputs: [{ id: "matrices", label: "Matrices" }],
    outputs: [],
    params: [
      { id: "contours", label: "Coverings — x1,z1;x2,z2;... (per linie)", type: "textarea", placeholder: "0,0;5,0;5,4;0,4", defaultValue: "0,0;5,0;5,4;0,4" },
      { id: "thickness", label: "Thickness (m)", placeholder: "0.02", defaultValue: "0.02" },
      { id: "elevation", label: "Elevation (m)", placeholder: "0", defaultValue: "0" },
      { id: "color", label: "Color (hex)", placeholder: "#c4b5fd", defaultValue: "#c4b5fd" },
      { id: "hide", label: "Ascunde din viewer (true/false)", placeholder: "false", defaultValue: "false" },
    ],
    isSink: true,
  },
  {
    type: "build-geometry",
    label: "Build Geometry",
    category: "Geometry",
    color: "#1d4ed8",
    icon: "🔷",
    inputs: [{ id: "matrices", label: "Matrices" }],
    outputs: [{ id: "meshes", label: "Meshes" }],
    params: [
      { id: "shape", label: "Shape (box / cylinder / extrude)", placeholder: "box", defaultValue: "box" },
      { id: "items", label: "Items (box: w,h,d,px,py,pz | cyl: r,h,seg,px,py,pz | extrude: x1,z1;x2,z2;...)", type: "textarea", placeholder: "1,1,1,0,0,0", defaultValue: "1,1,1,0,0,0" },
      { id: "extrudeDepth", label: "Extrude Depth (m)", placeholder: "1", defaultValue: "1" },
      { id: "extrudeElevation", label: "Extrude Elevation Y (m)", placeholder: "0", defaultValue: "0" },
      { id: "category", label: "IFC Category", placeholder: "IfcBuildingElementProxy", defaultValue: "IfcBuildingElementProxy" },
      { id: "function", label: "Funcție (SOLID / VOID)", placeholder: "SOLID", defaultValue: "SOLID" },
      { id: "color", label: "Color (hex)", placeholder: "#4f86c6", defaultValue: "#4f86c6" },
      { id: "hide", label: "Ascunde din viewer (true/false)", placeholder: "false", defaultValue: "false" },
    ],
  },
  {
    type: "boolean-op",
    label: "Boolean Op",
    category: "Geometry",
    color: "#9f1239",
    icon: "✂️",
    inputs: [
      { id: "targets", label: "Targets" },
      { id: "tools", label: "Tools" },
    ],
    outputs: [{ id: "meshes", label: "Meshes" }],
    params: [
      { id: "opType", label: "Operație (DIFFERENCE / UNION)", placeholder: "DIFFERENCE", defaultValue: "DIFFERENCE" },
      { id: "category", label: "IFC Category", placeholder: "IfcBuildingElementProxy", defaultValue: "IfcBuildingElementProxy" },
      { id: "color", label: "Color (hex)", placeholder: "#e11d48", defaultValue: "#e11d48" },
      { id: "hide", label: "Ascunde din viewer (true/false)", placeholder: "false", defaultValue: "false" },
    ],
  },
  {
    type: "transform-matrix",
    label: "Transform Matrix",
    category: "Geometry",
    color: "#059669",
    icon: "📐",
    inputs: [],
    outputs: [{ id: "matrices", label: "Matrices" }],
    params: [
      { id: "transforms", label: "Transforms — x,y,z,rx,ry,rz° (per linie)", type: "textarea", placeholder: "0,0,0,0,0,0\n5,0,0,0,0,0", defaultValue: "0,0,0,0,0,0" },
    ],
  },
];

const getTypeDef = (type: string): NodeTypeDef => {
  const builtin = NODE_TYPES.find((t) => t.type === type);
  if (builtin) return builtin;
  const plugin = NodeRegistry.getPlugin(type);
  if (plugin) return plugin.def as unknown as NodeTypeDef;
  return NODE_TYPES[0];
};

// ─── Persistence ──────────────────────────────────────────────────────────────

const loadGraph = (): GraphData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nodes: [], connections: [] };
    const parsed = JSON.parse(raw) as GraphData;
    return parsed.nodes && parsed.connections ? parsed : { nodes: [], connections: [] };
  } catch {
    return { nodes: [], connections: [] };
  }
};

const saveGraph = (data: GraphData) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

// ─── Execution engine ────────────────────────────────────────────────────────

type ItemsMap = OBC.ModelIdMap;

const mergeItems = (a: ItemsMap, b: ItemsMap): ItemsMap => {
  const r: ItemsMap = {};
  for (const [k, v] of Object.entries(a)) r[k] = new Set(v);
  for (const [k, v] of Object.entries(b)) {
    if (!r[k]) r[k] = new Set();
    for (const id of v) (r[k] as Set<number>).add(id);
  }
  return r;
};

const intersectItems = (a: ItemsMap, b: ItemsMap): ItemsMap => {
  const r: ItemsMap = {};
  for (const [k, va] of Object.entries(a)) {
    const vb = b[k];
    if (!vb) continue;
    const s = new Set([...va].filter((x) => vb.has(x)));
    if (s.size) r[k] = s;
  }
  return r;
};

const executeGraph = async (
  graphData: GraphData,
  components: OBC.Components,
  status: (msg: string, t?: "info" | "ok" | "error") => void,
  log: (msg: string, level?: "info" | "ok" | "warn" | "error") => void,
) => {
  const fragments = components.get(OBC.FragmentsManager);
  const classifier = components.get(OBC.Classifier);
  const highlighter = components.get(OBF.Highlighter);
  const hider = components.get(OBC.Hider);

  const hasModelNodes = graphData.nodes.some((n) =>
    ["model-source", "category-filter", "storey-filter", "isolate", "highlight", "union", "intersect", "print"].includes(n.type));
  if (hasModelNodes && !fragments.list.size) {
    status("⚠ Niciun model încărcat.", "error");
    log("⚠ Nu există modele Fragments încărcate. Rulează nodul Add Wall fără model.", "warn");
  } else if (hasModelNodes) {
    status("⏳ Clasificare Fragments…", "info");
    await classifier.byModel();
    await classifier.byCategory();
    await classifier.byIfcBuildingStorey();
  }

  const { nodes, connections } = graphData;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Topo sort
  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  for (const c of connections) inDegree.set(c.toNode, (inDegree.get(c.toNode) ?? 0) + 1);
  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const c of connections.filter((c) => c.fromNode === id)) {
      const d = (inDegree.get(c.toNode) ?? 1) - 1;
      inDegree.set(c.toNode, d);
      if (d === 0) queue.push(c.toNode);
    }
  }
  if (order.length !== nodes.length) { status("⚠ Graf ciclic!", "error"); return; }

  const outputs = new Map<string, Map<string, any>>();

  const getInput = (nodeId: string, portId: string): ItemsMap | null => {
    const conns = connections.filter((c) => c.toNode === nodeId && c.toPort === portId);
    if (!conns.length) return null;
    let merged: ItemsMap = {};
    for (const c of conns) {
      const v = outputs.get(c.fromNode)?.get(c.fromPort);
      if (v) merged = mergeItems(merged, v as ItemsMap);
    }
    return merged;
  };

  const getRawInput = (nodeId: string, portId: string): any | null => {
    const conn = connections.find((c) => c.toNode === nodeId && c.toPort === portId);
    if (!conn) return null;
    return outputs.get(conn.fromNode)?.get(conn.fromPort) ?? null;
  };

  const getRawInputAll = (nodeId: string, portId: string): any[] => {
    const conns = connections.filter((c) => c.toNode === nodeId && c.toPort === portId);
    const result: any[] = [];
    for (const c of conns) {
      const v = outputs.get(c.fromNode)?.get(c.fromPort);
      if (Array.isArray(v)) result.push(...v);
      else if (v != null) result.push(v);
    }
    return result;
  };

  // Reset viewer before running
  await hider.set(true);
  for (const [sn] of highlighter.styles) {
    if (sn.startsWith(STYLE_NAME)) await highlighter.clear(sn);
  }

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;
    const out = new Map<string, any>();
    outputs.set(nodeId, out);

    switch (node.type) {
      case "model-source": {
        const modelIdParam = (node.params.modelId ?? "").trim();
        let result: ItemsMap = {};
        const classData = classifier.list.get("model");
        if (classData) {
          for (const [groupName, groupData] of classData) {
            if (modelIdParam && !groupName.includes(modelIdParam)) continue;
            for (const [mId, localIds] of Object.entries(groupData.map)) {
              if (!result[mId]) result[mId] = new Set();
              for (const id of localIds) (result[mId] as Set<number>).add(id);
            }
          }
        }
        out.set("items", result);
        break;
      }
      case "category-filter": {
        const cat = (node.params.category ?? "").trim();
        if (!cat) break;
        const upstream = getInput(nodeId, "items");
        const found = await classifier.find({ entity: [cat] });
        out.set("items", upstream ? intersectItems(upstream, found) : found);
        break;
      }
      case "storey-filter": {
        const storey = (node.params.storey ?? "").trim();
        if (!storey) break;
        const upstream = getInput(nodeId, "items");
        const found = await classifier.find({ storey: [storey] });
        out.set("items", upstream ? intersectItems(upstream, found) : found);
        break;
      }
      case "union": {
        const a = getInput(nodeId, "a") ?? {};
        const b = getInput(nodeId, "b") ?? {};
        out.set("items", mergeItems(a, b));
        break;
      }
      case "intersect": {
        const a = getInput(nodeId, "a");
        const b = getInput(nodeId, "b");
        if (a && b) out.set("items", intersectItems(a, b));
        break;
      }
      case "isolate": {
        const items = getInput(nodeId, "items");
        if (items && !OBC.ModelIdMapUtils.isEmpty(items)) await hider.isolate(items);
        break;
      }
      case "highlight": {
        const items = getInput(nodeId, "items");
        if (!items || OBC.ModelIdMapUtils.isEmpty(items)) break;
        const colorHex = (node.params.color ?? "#4dc0ff").trim();
        const sn = `${STYLE_NAME}-${nodeId}`;
        if (!highlighter.styles.has(sn)) {
          highlighter.styles.set(sn, {
            color: new THREE.Color(colorHex),
            renderedFaces: FRAGS.RenderedFaces.ONE,
            opacity: 1,
            transparent: false,
          });
        }
        await highlighter.highlightByID(sn, items, false, false);
        await highlighter.clear("select");
        break;
      }
      case "print": {
        const items = getInput(nodeId, "items");
        const label = (node.params.label ?? "Print").trim() || "Print";
        if (!items || OBC.ModelIdMapUtils.isEmpty(items)) {
          log(`[${label}] — (empty set)`, "warn");
        } else {
          const total = Object.values(items).reduce((s, set) => s + set.size, 0);
          log(`[${label}] ${total} elements across ${Object.keys(items).length} model(s):`, "ok");
          for (const [modelId, ids] of Object.entries(items)) {
            log(`  · ${modelId}: ${(ids as Set<number>).size} elements`, "info");
          }
        }
        out.set("items", items ?? {});
        break;
      }
      case "add-wall": {
        const wallHeight = Math.max(0.1, parseFloat(node.params.height ?? "3") || 3);
        const wallThk = Math.max(0.05, parseFloat(node.params.thickness ?? "0.2") || 0.2);
        const wallElev = parseFloat(node.params.elevation ?? "0") || 0;
        const wallCol = (node.params.color ?? "#d4a96a").trim() || "#d4a96a";
        const wallLines = (node.params.walls ?? "0,0,5,0").trim().split("\n").filter((l) => l.trim());
        const wallDefs = wallLines.map((l) => {
          const p = l.split(",").map((v) => parseFloat(v.trim()) || 0);
          return { sx: p[0] ?? 0, sz: p[1] ?? 0, ex: p[2] ?? 5, ez: p[3] ?? 0 };
        });
        const wallMatrices = getRawInput(nodeId, "matrices") as THREE.Matrix4[] | null;

        const fragsManagerW = components.get(OBC.FragmentsManager);
        const wallModelId = `ne-wall-${node.id}`;
        if (_neModelIds.has(node.id)) {
          try { await fragsManagerW.core.disposeModel(_neModelIds.get(node.id)!); } catch (_e) { /* ignore */ }
          _neModelIds.delete(node.id);
        }
        const wallHide = (node.params.hide ?? "false").trim().toLowerCase() === "true";
        if (wallHide) { log("🧱 Add Wall: ascuns din viewer.", "info"); break; }
        log("⏳ Construire pereți Fragments…", "info");
        const wallGeoEng = await getGeoEngine();
        const wallBytes = FRAGS.EditUtils.newModel({ raw: true });
        await fragsManagerW.core.load(wallBytes, { modelId: wallModelId, raw: true });
        _neModelIds.set(node.id, wallModelId);
        const wallMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(wallCol), side: THREE.DoubleSide });
        const wallMatId = fragsManagerW.core.editor.createMaterial(wallModelId, wallMat);
        const wallLtId = fragsManagerW.core.editor.createLocalTransform(wallModelId, new THREE.Matrix4().identity());
        const instanceCountW = wallMatrices ? Math.max(wallDefs.length, wallMatrices.length) : wallDefs.length;
        const wallElements: any[] = [];
        for (let i = 0; i < instanceCountW; i++) {
          const def = wallDefs[i % wallDefs.length];
          const wGeom = new THREE.BufferGeometry();
          if (wallMatrices) {
            // Local space: wall along X axis, matrix provides world placement
            const localLen = Math.sqrt((def.ex - def.sx) ** 2 + (def.ez - def.sz) ** 2) || 5;
            wallGeoEng.getWall(wGeom, {
              start: [0, 0, 0], end: [localLen, 0, 0],
              direction: [0, 1, 0], elevation: 0, offset: 0,
              thickness: wallThk, height: wallHeight,
              cuttingPlaneNormal: [0, 0, 0], cuttingPlanePosition: [0, 0, 0],
            });
          } else {
            wallGeoEng.getWall(wGeom, {
              start: [def.sx, wallElev, def.sz], end: [def.ex, wallElev, def.ez],
              direction: [0, 1, 0], elevation: 0, offset: 0,
              thickness: wallThk, height: wallHeight,
              cuttingPlaneNormal: [0, 0, 0], cuttingPlanePosition: [0, 0, 0],
            });
          }
          const wShellId = fragsManagerW.core.editor.createShell(wallModelId, wGeom);
          wallElements.push({
            attributes: { _category: { value: "IfcWall" }, GlobalId: { value: generateGuid(), type: 4 } } as any,
            globalTransform: wallMatrices ? wallMatrices[i % wallMatrices.length].clone() : new THREE.Matrix4().identity(),
            samples: [{ localTransform: wallLtId, representation: wShellId, material: wallMatId }],
          });
        }
        await fragsManagerW.core.editor.createElements(wallModelId, wallElements);
        await fragsManagerW.core.update(true);
        log(`🧱 ${instanceCountW} Wall(s) Fragments create în "${wallModelId}"`, "ok");
        break;
      }

      case "add-beam": {
        const beamW = Math.max(0.05, parseFloat(node.params.width ?? "0.2") || 0.2);
        const beamD = Math.max(0.05, parseFloat(node.params.depth ?? "0.4") || 0.4);
        const beamCol = (node.params.color ?? "#a16207").trim() || "#a16207";
        const beamLines = (node.params.beams ?? "0,3,0,5,3,0").trim().split("\n").filter((l) => l.trim());
        const beamDefs = beamLines.map((l) => {
          const p = l.split(",").map((v) => parseFloat(v.trim()) || 0);
          const start = new THREE.Vector3(p[0] ?? 0, p[1] ?? 3, p[2] ?? 0);
          const end = new THREE.Vector3(p[3] ?? 5, p[4] ?? 3, p[5] ?? 0);
          return { start, end };
        });
        const beamMatrices = getRawInput(nodeId, "matrices") as THREE.Matrix4[] | null;

        const fragsManagerB = components.get(OBC.FragmentsManager);
        const beamModelId = `ne-beam-${node.id}`;
        if (_neModelIds.has(node.id)) {
          try { await fragsManagerB.core.disposeModel(_neModelIds.get(node.id)!); } catch (_e) { /* ignore */ }
          _neModelIds.delete(node.id);
        }
        const beamHide = (node.params.hide ?? "false").trim().toLowerCase() === "true";
        if (beamHide) { log("⬛ Add Beam: ascuns din viewer.", "info"); break; }
        log("⏳ Construire grinzi Fragments…", "info");
        const beamBytes = FRAGS.EditUtils.newModel({ raw: true });
        await fragsManagerB.core.load(beamBytes, { modelId: beamModelId, raw: true });
        _neModelIds.set(node.id, beamModelId);
        const beamMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(beamCol), side: THREE.DoubleSide });
        const beamMatId = fragsManagerB.core.editor.createMaterial(beamModelId, beamMat);
        const beamLtId = fragsManagerB.core.editor.createLocalTransform(beamModelId, new THREE.Matrix4().identity());
        const instanceCountB = beamMatrices ? Math.max(beamDefs.length, beamMatrices.length) : beamDefs.length;
        const beamElements: any[] = [];
        for (let i = 0; i < instanceCountB; i++) {
          const def = beamDefs[i % beamDefs.length];
          let globalTransformB: THREE.Matrix4;
          let beamLen: number;
          if (beamMatrices) {
            beamLen = def.start.distanceTo(def.end) || 5;
            globalTransformB = beamMatrices[i % beamMatrices.length].clone();
          } else {
            const dir = def.end.clone().sub(def.start);
            beamLen = dir.length() || 0.1;
            dir.normalize();
            const mid = def.start.clone().lerp(def.end, 0.5);
            const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
            globalTransformB = new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(mid);
          }
          const bGeom = new THREE.BoxGeometry(beamLen, beamD, beamW);
          const bShellId = fragsManagerB.core.editor.createShell(beamModelId, bGeom);
          beamElements.push({
            attributes: { _category: { value: "IfcBeam" }, GlobalId: { value: generateGuid(), type: 4 } } as any,
            globalTransform: globalTransformB,
            samples: [{ localTransform: beamLtId, representation: bShellId, material: beamMatId }],
          });
        }
        await fragsManagerB.core.editor.createElements(beamModelId, beamElements);
        await fragsManagerB.core.update(true);
        log(`⬛ ${instanceCountB} Beam(s) Fragments create în "${beamModelId}"`, "ok");
        break;
      }

      case "add-column": {
        const colWidth = Math.max(0.05, parseFloat(node.params.width ?? "0.3") || 0.3);
        const colDepth = Math.max(0.05, parseFloat(node.params.depth ?? "0.3") || 0.3);
        const colHeight = Math.max(0.1, parseFloat(node.params.height ?? "3") || 3);
        const colElev = parseFloat(node.params.elevation ?? "0") || 0;
        const colColor = (node.params.color ?? "#7dd3fc").trim() || "#7dd3fc";
        const colLines = (node.params.columns ?? "0,0").trim().split("\n").filter((l) => l.trim());
        const colDefs = colLines.map((l) => {
          const p = l.split(",").map((v) => parseFloat(v.trim()) || 0);
          return { x: p[0] ?? 0, z: p[1] ?? 0 };
        });
        const colMatrices = getRawInput(nodeId, "matrices") as THREE.Matrix4[] | null;

        const fragsManagerC = components.get(OBC.FragmentsManager);
        const colModelId = `ne-col-${node.id}`;
        if (_neModelIds.has(node.id)) {
          try { await fragsManagerC.core.disposeModel(_neModelIds.get(node.id)!); } catch (_e) { /* ignore */ }
          _neModelIds.delete(node.id);
        }
        const colHide = (node.params.hide ?? "false").trim().toLowerCase() === "true";
        if (colHide) { log("🏗 Add Column: ascuns din viewer.", "info"); break; }
        log("⏳ Construire coloane Fragments…", "info");
        const colBytes = FRAGS.EditUtils.newModel({ raw: true });
        await fragsManagerC.core.load(colBytes, { modelId: colModelId, raw: true });
        _neModelIds.set(node.id, colModelId);
        const colMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(colColor), side: THREE.DoubleSide });
        const colMatId = fragsManagerC.core.editor.createMaterial(colModelId, colMat);
        const colLtId = fragsManagerC.core.editor.createLocalTransform(colModelId, new THREE.Matrix4().identity());
        const instanceCountC = colMatrices ? Math.max(colDefs.length, colMatrices.length) : colDefs.length;
        const colGeomBase = new THREE.BoxGeometry(colWidth, colHeight, colDepth);
        colGeomBase.translate(0, colHeight / 2, 0);
        const colElements: any[] = [];
        for (let i = 0; i < instanceCountC; i++) {
          const def = colDefs[i % colDefs.length];
          const cGeom = colGeomBase.clone();
          const cShellId = fragsManagerC.core.editor.createShell(colModelId, cGeom);
          const globalTransformC = colMatrices
            ? colMatrices[i % colMatrices.length].clone()
            : new THREE.Matrix4().makeTranslation(def.x, colElev, def.z);
          colElements.push({
            attributes: { _category: { value: "IfcColumn" }, GlobalId: { value: generateGuid(), type: 4 } } as any,
            globalTransform: globalTransformC,
            samples: [{ localTransform: colLtId, representation: cShellId, material: colMatId }],
          });
        }
        await fragsManagerC.core.editor.createElements(colModelId, colElements);
        await fragsManagerC.core.update(true);
        log(`🏛 ${instanceCountC} Column(s) Fragments create în "${colModelId}"`, "ok");
        break;
      }

      case "add-slab":
      case "add-covering": {
        const isCovering = node.type === "add-covering";
        const slabThk = Math.max(0.01, parseFloat(node.params.thickness ?? (isCovering ? "0.02" : "0.25")) || (isCovering ? 0.02 : 0.25));
        const slabElev = parseFloat(node.params.elevation ?? (isCovering ? "0" : "3")) || 0;
        const slabColor = (node.params.color ?? (isCovering ? "#c4b5fd" : "#9ca3af")).trim() || "#9ca3af";
        const slabContourLines = (node.params.contours ?? "0,0;5,0;5,4;0,4").trim().split("\n").filter((l) => l.trim());
        const slabMatrices = getRawInput(nodeId, "matrices") as THREE.Matrix4[] | null;
        const category = isCovering ? "IfcCovering" : "IfcSlab";
        const prefix = isCovering ? "ne-cov" : "ne-slab";

        const fragsManagerS = components.get(OBC.FragmentsManager);
        const slabModelId = `${prefix}-${node.id}`;
        if (_neModelIds.has(node.id)) {
          try { await fragsManagerS.core.disposeModel(_neModelIds.get(node.id)!); } catch (_e) { /* ignore */ }
          _neModelIds.delete(node.id);
        }
        const slabHide = (node.params.hide ?? "false").trim().toLowerCase() === "true";
        if (slabHide) { log(`${isCovering ? "🪟" : "⬜"} ${isCovering ? "Add Covering" : "Add Slab"}: ascuns din viewer.`, "info"); break; }
        log(`⏳ Construire ${isCovering ? "acoperiri" : "planșee"} Fragments…`, "info");
        const slabGeoEng = await getGeoEngine();
        const slabBytes = FRAGS.EditUtils.newModel({ raw: true });
        await fragsManagerS.core.load(slabBytes, { modelId: slabModelId, raw: true });
        _neModelIds.set(node.id, slabModelId);
        const slabMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(slabColor), side: THREE.DoubleSide });
        const slabMatId = fragsManagerS.core.editor.createMaterial(slabModelId, slabMat);
        const slabLtId = fragsManagerS.core.editor.createLocalTransform(slabModelId, new THREE.Matrix4().identity());
        const instanceCountS = slabMatrices ? Math.max(slabContourLines.length, slabMatrices.length) : slabContourLines.length;
        const slabElements: any[] = [];
        for (let i = 0; i < instanceCountS; i++) {
          const contourStr = slabContourLines[i % slabContourLines.length];
          const pts2dRaw = contourStr.split(";").map((seg) => {
            const xy = seg.split(",").map((v) => parseFloat(v.trim()) || 0);
            return [xy[0] ?? 0, xy[1] ?? 0] as [number, number];
          });
          if (pts2dRaw.length < 3) { log(`⚠ Contur ${i + 1}: minim 3 puncte necesare.`, "warn"); continue; }
          // Profile in XY plane (engine's natural convention), direction +Z.
          // Negate Z input so after a -90° X rotation the contour maps correctly to XZ.
          const profilePoints = pts2dRaw.flatMap(([x, z]) => [x, -z, 0]);
          const sGeom = new THREE.BufferGeometry();
          slabGeoEng.getExtrusion(sGeom, {
            profilePoints,
            direction: [0, 0, 1],
            length: slabThk,
            cap: true,
          });
          const sShellId = fragsManagerS.core.editor.createShell(slabModelId, sGeom);
          // Lay slab flat: rotate -90° around X so Z-extrusion becomes Y-up,
          // then optionally translate to the desired elevation.
          const slabOrient = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
          const globalTransformS = slabMatrices
            ? slabMatrices[i % slabMatrices.length].clone().multiply(slabOrient)
            : new THREE.Matrix4().makeTranslation(0, slabElev, 0).multiply(slabOrient);
          slabElements.push({
            attributes: { _category: { value: category }, GlobalId: { value: generateGuid(), type: 4 } } as any,
            globalTransform: globalTransformS,
            samples: [{ localTransform: slabLtId, representation: sShellId, material: slabMatId }],
          });
        }
        await fragsManagerS.core.editor.createElements(slabModelId, slabElements);
        await fragsManagerS.core.update(true);
        log(`${isCovering ? "🪟" : "⬜"} ${slabElements.length} ${category}(s) Fragments create în "${slabModelId}"`, "ok");
        break;
      }

      case "build-geometry": {
        const bgShape = (node.params.shape ?? "box").trim().toLowerCase();
        const bgCategory = (node.params.category ?? "IfcBuildingElementProxy").trim() || "IfcBuildingElementProxy";
        const bgFunc = (node.params.function ?? "SOLID").trim().toUpperCase();
        const bgIsVoid = bgFunc === "VOID";
        const bgColor = (node.params.color ?? "#4f86c6").trim() || "#4f86c6";
        const bgHide = (node.params.hide ?? "false").trim().toLowerCase() === "true";
        const bgExtrudeDepth = Math.max(0.01, parseFloat(node.params.extrudeDepth ?? "1") || 1);
        const bgExtrudeElevation = parseFloat(node.params.extrudeElevation ?? "0") || 0;
        const bgInputMatrices = getRawInput(nodeId, "matrices") as THREE.Matrix4[] | null;
        const bgItemLines = (node.params.items ?? "1,1,1,0,0,0").trim().split("\n").filter((l) => l.trim());
        const bgCount = bgInputMatrices ? Math.max(bgItemLines.length, bgInputMatrices.length) : bgItemLines.length;

        const fragsManagerG = components.get(OBC.FragmentsManager);
        const bgModelId = `ne-geo-${node.id}`;
        if (_neModelIds.has(node.id)) {
          try { await fragsManagerG.core.disposeModel(_neModelIds.get(node.id)!); } catch (_e) { /* ignore */ }
          _neModelIds.delete(node.id);
        }

        const bgMeshes: THREE.Mesh[] = [];
        for (let i = 0; i < bgCount; i++) {
          const line = bgItemLines[i % bgItemLines.length] ?? "";
          let bgGeom: THREE.BufferGeometry;
          const defPos = new THREE.Vector3(0, 0, 0);
          if (bgShape === "cylinder") {
            const p = line.split(",").map((v) => parseFloat(v.trim()) || 0);
            const bgR = Math.max(0.01, p[0] || 0.3);
            const bgCylH = Math.max(0.01, p[1] || 1);
            const bgSeg = Math.round(Math.max(3, p[2] || 16));
            defPos.set(p[3] || 0, p[4] || 0, p[5] || 0);
            bgGeom = new THREE.CylinderGeometry(bgR, bgR, bgCylH, bgSeg);
          } else if (bgShape === "extrude") {
            const pts2d = line.split(";").map((seg2d) => {
              const xy = seg2d.split(",").map((v) => parseFloat(v.trim()) || 0);
              return [xy[0] ?? 0, xy[1] ?? 0] as [number, number];
            });
            if (pts2d.length < 3) { log(`⚠ Build Geometry extrude ${i + 1}: minim 3 puncte.`, "warn"); continue; }
            // Use GeometryEngine (always indexed) — same convention as add-slab:
            // profile in XY plane with Z-input negated, direction [0,0,1], then RotateX(-90°).
            const bgGeoEng = await getGeoEngine();
            bgGeom = new THREE.BufferGeometry();
            bgGeoEng.getExtrusion(bgGeom, {
              profilePoints: pts2d.flatMap(([x, z]) => [x, -z, 0]),
              direction: [0, 0, 1],
              length: bgExtrudeDepth,
              cap: true,
            });
            bgGeom.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
            defPos.set(0, bgExtrudeElevation, 0);
          } else {
            const p = line.split(",").map((v) => parseFloat(v.trim()) || 0);
            defPos.set(p[3] || 0, p[4] || 0, p[5] || 0);
            bgGeom = new THREE.BoxGeometry(Math.max(0.01, p[0] || 1), Math.max(0.01, p[1] || 1), Math.max(0.01, p[2] || 1));
          }
          if (bgInputMatrices) {
            bgGeom.applyMatrix4(bgInputMatrices[i % bgInputMatrices.length]);
          } else {
            bgGeom.translate(defPos.x, defPos.y, defPos.z);
          }
          bgMeshes.push(new THREE.Mesh(bgGeom, new THREE.MeshLambertMaterial({ color: new THREE.Color(bgColor), side: THREE.DoubleSide, transparent: bgIsVoid, opacity: bgIsVoid ? 0.3 : 1.0 })));
        }
        out.set("meshes", bgMeshes);

        if (!bgHide && bgMeshes.length > 0) {
          const bgBytes = FRAGS.EditUtils.newModel({ raw: true });
          await fragsManagerG.core.load(bgBytes, { modelId: bgModelId, raw: true });
          _neModelIds.set(node.id, bgModelId);
          const bgFragMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(bgColor), side: THREE.DoubleSide, transparent: bgIsVoid, opacity: bgIsVoid ? 0.3 : 1.0 });
          const bgMatId = fragsManagerG.core.editor.createMaterial(bgModelId, bgFragMat);
          const bgLtId = fragsManagerG.core.editor.createLocalTransform(bgModelId, new THREE.Matrix4().identity());
          const bgElements: any[] = [];
          for (const mesh of bgMeshes) {
            const bgShellId = fragsManagerG.core.editor.createShell(bgModelId, mesh.geometry);
            bgElements.push({
              attributes: { _category: { value: bgCategory }, GlobalId: { value: generateGuid(), type: 4 } } as any,
              globalTransform: new THREE.Matrix4().identity(),
              samples: [{ localTransform: bgLtId, representation: bgShellId, material: bgMatId }],
            });
          }
          await fragsManagerG.core.editor.createElements(bgModelId, bgElements);
          await fragsManagerG.core.update(true);
          log(`🔷 ${bgMeshes.length} ${bgCategory} (${bgFunc}) în "${bgModelId}" create.`, "ok");
        } else if (bgHide) {
          log(`🔷 Build Geometry: ${bgMeshes.length} mesh(uri) generate — ascunse din viewer.`, "info");
        }
        break;
      }

      case "boolean-op": {
        const boType = (node.params.opType ?? "DIFFERENCE").trim().toUpperCase() === "UNION" ? "UNION" : "DIFFERENCE";
        const boCategory = (node.params.category ?? "IfcBuildingElementProxy").trim() || "IfcBuildingElementProxy";
        const boColor = (node.params.color ?? "#e11d48").trim() || "#e11d48";
        const boHide = (node.params.hide ?? "false").trim().toLowerCase() === "true";
        const boTargets = getRawInputAll(nodeId, "targets") as THREE.Mesh[];
        const boTools = getRawInputAll(nodeId, "tools") as THREE.Mesh[];

        const fragsManagerBO = components.get(OBC.FragmentsManager);
        const boModelId = `ne-bool-${node.id}`;
        if (_neModelIds.has(node.id)) {
          try { await fragsManagerBO.core.disposeModel(_neModelIds.get(node.id)!); } catch (_e) { /* ignore */ }
          _neModelIds.delete(node.id);
        }
        if (boTargets.length === 0) { log("⚠ Boolean Op: nicio geometrie target.", "warn"); break; }
        if (boTools.length === 0) { log("⚠ Boolean Op: nicio geometrie tool.", "warn"); break; }
        log(`⏳ Boolean ${boType}: ${boTargets.length} target(uri) × ${boTools.length} tool(uri)…`, "info");
        const boGeoEng = await getGeoEngine();
        const boResultMeshes: THREE.Mesh[] = [];
        for (let i = 0; i < boTargets.length; i++) {
          const boGeom = new THREE.BufferGeometry();
          try {
            boGeoEng.getBooleanOperation(boGeom, { type: boType, target: boTargets[i], operands: boTools });
            boResultMeshes.push(new THREE.Mesh(boGeom, new THREE.MeshLambertMaterial({ color: new THREE.Color(boColor), side: THREE.DoubleSide })));
          } catch (err) {
            log(`⚠ Boolean Op target ${i + 1}: ${(err as Error).message}`, "error");
          }
        }
        out.set("meshes", boResultMeshes);

        if (!boHide && boResultMeshes.length > 0) {
          const boBytes = FRAGS.EditUtils.newModel({ raw: true });
          await fragsManagerBO.core.load(boBytes, { modelId: boModelId, raw: true });
          _neModelIds.set(node.id, boModelId);
          const boFragMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(boColor), side: THREE.DoubleSide });
          const boMatId = fragsManagerBO.core.editor.createMaterial(boModelId, boFragMat);
          const boLtId = fragsManagerBO.core.editor.createLocalTransform(boModelId, new THREE.Matrix4().identity());
          const boElements: any[] = [];
          for (const mesh of boResultMeshes) {
            const boShellId = fragsManagerBO.core.editor.createShell(boModelId, mesh.geometry);
            boElements.push({
              attributes: { _category: { value: boCategory }, GlobalId: { value: generateGuid(), type: 4 } } as any,
              globalTransform: new THREE.Matrix4().identity(),
              samples: [{ localTransform: boLtId, representation: boShellId, material: boMatId }],
            });
          }
          await fragsManagerBO.core.editor.createElements(boModelId, boElements);
          await fragsManagerBO.core.update(true);
          log(`✂️ ${boResultMeshes.length} Boolean ${boType} result(uri) în "${boModelId}" (${boCategory}).`, "ok");
        } else if (boHide) {
          log(`✂️ Boolean ${boType}: ${boResultMeshes.length} result(uri) generate — ascunse din viewer.`, "info");
        }
        break;
      }

      case "transform-matrix": {
        const tmLines = (node.params.transforms ?? "0,0,0,0,0,0").trim().split("\n").filter((l) => l.trim());
        const matrices: THREE.Matrix4[] = tmLines.map((l) => {
          const p = l.split(",").map((v) => parseFloat(v.trim()) || 0);
          const [tx, ty, tz, rx, ry, rz] = p;
          const m = new THREE.Matrix4();
          m.makeRotationFromEuler(new THREE.Euler(
            (rx ?? 0) * (Math.PI / 180),
            (ry ?? 0) * (Math.PI / 180),
            (rz ?? 0) * (Math.PI / 180),
          ));
          m.setPosition(tx ?? 0, ty ?? 0, tz ?? 0);
          return m;
        });
        out.set("matrices", matrices);
        log(`📐 Transform Matrix: ${matrices.length} matrici generate.`, "info");
        break;
      }

      default: {
        const plugin = NodeRegistry.getPlugin(node.type);
        if (plugin) {
          await plugin.execute({
            node, nodeId, components, out,
            getInput, getRawInput, getRawInputAll, log,
            neModelIds: _neModelIds,
            getGeoEngine,
          });
        } else {
          log(`⚠ Tip necunoscut: "${node.type}"`, "warn");
        }
        break;
      }
    }
  }

  log("✅ Execuție completă.", "ok");
  status("✓ Execuție completă.", "ok");
};

// ─── Visual editor factory ────────────────────────────────────────────────────

const createNodeEditor = (components: OBC.Components, onHide?: () => void): HTMLElement => {
  const graph: GraphData = loadGraph();
  const layout: NELayout = loadLayout();

  let offset = { x: 80, y: 60 };
  let zoom = 1;
  let dragging: { nodeId: string; sx: number; sy: number; mx: number; my: number } | null = null;
  let panStart: { mouseX: number; mouseY: number; ox: number; oy: number } | null = null;
  let pendingWire: { fromNode: string; fromPort: string; isOutput: boolean } | null = null;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let winDrag: { startX: number; startY: number; ox: number; oy: number } | null = null;
  let winResize: { startX: number; startY: number; ow: number; oh: number; ox: number; oy: number; edge: "br" | "top" | "l" | "r" } | null = null;

  // ── DOM ──────────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.className = "ne-root";

  // Top bar
  const topBar = document.createElement("div");
  topBar.className = "ne-topbar";

  const titleEl = document.createElement("span");
  titleEl.className = "ne-title";
  titleEl.textContent = "⬡ Fragments Node Editor";

  const statusEl = document.createElement("span");
  statusEl.className = "ne-status";

  const btnBar = document.createElement("div");
  btnBar.className = "ne-btn-bar";

  const mkBtn = (label: string, accent = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = accent ? "ne-btn ne-btn-accent" : "ne-btn";
    return b;
  };

  const clearBtn = mkBtn("✕ Clear");
  const fitBtn = mkBtn("⊡ Fit");
  const saveBtn = mkBtn("💾 Save");
  const openBtn = mkBtn("📂 Open");
  const resetBtn = mkBtn("↺ Reset Viewer");
  const runBtn = mkBtn("▶  Run", true);
  const dockBtn = mkBtn("⊟ Dock");
  const consoleBtn = mkBtn("📋 Console");
  const hideBtn = mkBtn("— Hide");

  // Hidden file input for Open Graph
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.display = "none";
  btnBar.appendChild(fileInput);

  btnBar.append(clearBtn, fitBtn, saveBtn, openBtn, resetBtn, runBtn, consoleBtn, dockBtn, hideBtn);
  topBar.append(titleEl, statusEl, btnBar);

  hideBtn.addEventListener("click", () => onHide?.());

  // ── Console panel ──────────────────────────────────────────────────────────
  const consolePanel = document.createElement("div");
  consolePanel.className = "ne-console";

  const consoleHeader = document.createElement("div");
  consoleHeader.className = "ne-console-header";
  consoleHeader.innerHTML = `<span>OUTPUT</span>`;
  const clearConsoleBtn = document.createElement("button");
  clearConsoleBtn.className = "ne-btn";
  clearConsoleBtn.textContent = "✕ Clear";
  clearConsoleBtn.style.cssText = "padding:0.1rem 0.4rem;font-size:0.7rem;";
  consoleHeader.appendChild(clearConsoleBtn);

  const consoleBody = document.createElement("div");
  consoleBody.className = "ne-console-body";

  consolePanel.append(consoleHeader, consoleBody);

  let consoleVisible = true;
  const toggleConsole = () => {
    consoleVisible = !consoleVisible;
    consolePanel.style.display = consoleVisible ? "flex" : "none";
    root.style.gridTemplateRows = consoleVisible ? "2.75rem 1fr 9rem" : "2.75rem 1fr";
    consoleBtn.textContent = consoleVisible ? "📋 Console" : "📋 Console";
    consoleBtn.style.opacity = consoleVisible ? "1" : "0.5";
    requestAnimationFrame(() => rerenderWires());
  };
  consoleBtn.addEventListener("click", toggleConsole);
  clearConsoleBtn.addEventListener("click", () => { consoleBody.innerHTML = ""; });

  const appendLog = (msg: string, level: "info" | "ok" | "warn" | "error" = "info") => {
    const row = document.createElement("div");
    row.className = `ne-log ne-log-${level}`;
    const ts = new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    row.innerHTML = `<span class="ne-log-ts">${ts}</span><span class="ne-log-msg">${msg}</span>`;
    consoleBody.appendChild(row);
    consoleBody.scrollTop = consoleBody.scrollHeight;
    // Auto-open console if hidden and level is relevant
    if (!consoleVisible && (level === "ok" || level === "error" || level === "warn")) toggleConsole();
  };

  // Whole top bar is the drag handle in float mode (ignore clicks on buttons)
  topBar.style.cursor = "move";
  topBar.addEventListener("mousedown", (e) => {
    if (layout.mode !== "float") return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault(); e.stopPropagation();
    winDrag = { startX: e.clientX, startY: e.clientY, ox: layout.float.x, oy: layout.float.y };
  });
  titleEl.style.cursor = "";
  titleEl.removeEventListener("mousedown", () => { });

  // Sidebar palette
  const sidebar = document.createElement("div");
  sidebar.className = "ne-sidebar";
  const sideTitle = document.createElement("div");
  sideTitle.className = "ne-side-title";
  sideTitle.textContent = "NODES  ·  click to add";
  sidebar.appendChild(sideTitle);

  // ── Build palette grouped by category (built-ins + registered plugins) ──
  const catState = loadCatState();
  const catMap = new Map<string, Array<{ type: string; label: string; color: string; icon: string }>>();
  const pushToCat = (cat: string, type: string, label: string, color: string, icon: string) => {
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push({ type, label, color, icon });
  };
  for (const def of NODE_TYPES) pushToCat(def.category ?? "General", def.type, def.label, def.color, def.icon);
  for (const p of NodeRegistry.getAllPlugins()) pushToCat(p.def.category, p.def.type, p.def.label, p.def.color, p.def.icon);

  for (const [cat, catDefs] of catMap) {
    const catHeader = document.createElement("div");
    catHeader.className = "ne-cat-header";
    const isCollapsed = catState[cat] ?? false;
    if (isCollapsed) catHeader.classList.add("ne-cat-collapsed");
    catHeader.innerHTML = `<span class="ne-cat-arrow">&#9660;</span><span>${cat.toUpperCase()}</span>`;
    sidebar.appendChild(catHeader);

    const catItems = document.createElement("div");
    catItems.className = "ne-cat-items";
    if (isCollapsed) catItems.classList.add("ne-cat-hidden");
    for (const d of catDefs) {
      const item = document.createElement("div");
      item.className = "ne-palette-item";
      item.style.borderLeftColor = d.color;
      item.innerHTML = `<span>${d.icon}</span><span>${d.label}</span>`;
      item.addEventListener("click", () =>
        addNode(d.type, (80 - offset.x) / zoom, (80 - offset.y) / zoom),
      );
      catItems.appendChild(item);
    }
    sidebar.appendChild(catItems);

    catHeader.addEventListener("click", () => {
      const nowCollapsed = catHeader.classList.toggle("ne-cat-collapsed");
      catItems.classList.toggle("ne-cat-hidden", nowCollapsed);
      catState[cat] = nowCollapsed;
      saveCatState(catState);
    });
  }

  // Canvas
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "ne-canvas-wrap";

  const inner = document.createElement("div");
  inner.className = "ne-inner";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("ne-svg");
  svg.setAttribute("overflow", "visible");

  const nodesEl = document.createElement("div");
  nodesEl.className = "ne-nodes";

  const liveWire = document.createElementNS("http://www.w3.org/2000/svg", "path");
  liveWire.classList.add("ne-wire-live");
  liveWire.setAttribute("fill", "none");
  svg.appendChild(liveWire);

  inner.appendChild(svg);
  inner.appendChild(nodesEl);
  canvasWrap.appendChild(inner);

  // Float-mode resize handle (bottom-right corner)
  const resizeBR = document.createElement("div");
  resizeBR.className = "ne-resize-br";
  resizeBR.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    winResize = { startX: e.clientX, startY: e.clientY, ow: layout.float.w, oh: layout.float.h, ox: layout.float.x, oy: layout.float.y, edge: "br" };
  });

  // Float-mode left-edge resize
  const resizeL = document.createElement("div");
  resizeL.className = "ne-resize-l";
  resizeL.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    winResize = { startX: e.clientX, startY: e.clientY, ow: layout.float.w, oh: layout.float.h, ox: layout.float.x, oy: layout.float.y, edge: "l" };
  });

  // Float-mode right-edge resize
  const resizeR = document.createElement("div");
  resizeR.className = "ne-resize-r";
  resizeR.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    winResize = { startX: e.clientX, startY: e.clientY, ow: layout.float.w, oh: layout.float.h, ox: layout.float.x, oy: layout.float.y, edge: "r" };
  });

  // Dock-mode resize handle (top edge splitter)
  const resizeTop = document.createElement("div");
  resizeTop.className = "ne-resize-top";
  resizeTop.addEventListener("mousedown", (e) => {
    e.preventDefault(); e.stopPropagation();
    document.body.style.cursor = "ns-resize";
    winResize = { startX: e.clientX, startY: e.clientY, ow: 0, oh: layout.dockH, ox: 0, oy: 0, edge: "top" };
  });

  root.append(resizeTop, topBar, sidebar, canvasWrap, consolePanel, resizeBR, resizeL, resizeR);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const applyLayout = () => {
    if (layout.mode === "float") {
      const f = layout.float;
      Object.assign(root.style, {
        position: "absolute",
        left: `${f.x}px`, top: `${f.y}px`,
        width: `${f.w}px`, height: `${f.h}px`,
        right: "", bottom: "",
        borderRadius: "0.5rem",
        minWidth: "520px", minHeight: "280px",
      });
      resizeBR.style.display = "block";
      resizeTop.style.display = "none";
      resizeL.style.display = "block";
      resizeR.style.display = "block";
      topBar.style.cursor = "move";
      dockBtn.textContent = "⊟ Dock";
    } else {
      Object.assign(root.style, {
        position: "fixed",
        left: "0", right: "0", bottom: "0", top: "auto",
        width: "auto",
        height: `${layout.dockH}px`,
        borderRadius: "0.5rem 0.5rem 0 0",
        minWidth: "", minHeight: "",
      });
      resizeBR.style.display = "none";
      resizeTop.style.display = "block";
      resizeL.style.display = "none";
      resizeR.style.display = "none";
      topBar.style.cursor = "default";
      dockBtn.textContent = "⊞ Float";
    }
    requestAnimationFrame(() => rerenderWires());
  };

  dockBtn.addEventListener("click", () => {
    layout.mode = layout.mode === "float" ? "dock" : "float";
    saveLayout(layout);
    applyLayout();
  });

  const setStatus = (msg: string, type: "info" | "ok" | "error" = "info") => {
    statusEl.textContent = msg;
    statusEl.className = `ne-status ne-status-${type}`;
    if (statusTimer) clearTimeout(statusTimer);
    if (type !== "info") statusTimer = setTimeout(() => { statusEl.textContent = ""; statusEl.className = "ne-status"; }, 6000);
  };

  const applyTransform = () => {
    inner.style.transform = `translate(${offset.x}px,${offset.y}px) scale(${zoom})`;
  };

  const portScreenPos = (nodeId: string, portId: string, isOutput: boolean) => {
    const el = nodesEl.querySelector<HTMLElement>(
      `[data-node-id="${nodeId}"] [data-port-id="${portId}"][data-is-output="${isOutput}"]`,
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cr = canvasWrap.getBoundingClientRect();
    // Convert from screen-space (relative to canvasWrap) to SVG world-space
    // (inner's local coordinate space, before the translate+scale transform).
    const sx = r.left + r.width / 2 - cr.left;
    const sy = r.top + r.height / 2 - cr.top;
    return { x: (sx - offset.x) / zoom, y: (sy - offset.y) / zoom };
  };

  const bezier = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.max(Math.abs(x2 - x1) * 0.55, 60);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  };

  // ── Wires ──────────────────────────────────────────────────────────────────

  const rerenderWires = () => {
    for (const p of [...svg.querySelectorAll("path.ne-wire")]) p.remove();
    for (const conn of graph.connections) {
      const from = portScreenPos(conn.fromNode, conn.fromPort, true);
      const to = portScreenPos(conn.toNode, conn.toPort, false);
      if (!from || !to) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.classList.add("ne-wire");
      path.setAttribute("fill", "none");
      path.setAttribute("d", bezier(from.x, from.y, to.x, to.y));
      path.setAttribute("data-conn-id", conn.id);
      path.addEventListener("dblclick", () => {
        graph.connections = graph.connections.filter((c) => c.id !== conn.id);
        saveGraph(graph);
        rerenderWires();
      });
      svg.insertBefore(path, liveWire);
    }
  };

  // ── Node rendering ────────────────────────────────────────────────────────

  const renderNode = (node: NodeInstance) => {
    const def = getTypeDef(node.type);
    if (!def) return;

    const el = document.createElement("div");
    el.className = "ne-node";
    el.dataset.nodeId = node.id;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${NODE_WIDTH}px`;

    // Header
    const header = document.createElement("div");
    header.className = "ne-node-header";
    header.style.background = def.color;
    header.style.height = `${NODE_HEADER_H}px`;

    const headerTitle = document.createElement("span");
    headerTitle.className = "ne-node-header-title";
    headerTitle.textContent = `${def.icon}  ${def.label}`;

    const delBtn = document.createElement("button");
    delBtn.className = "ne-node-del";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      graph.connections = graph.connections.filter(
        (c) => c.fromNode !== node.id && c.toNode !== node.id,
      );
      graph.nodes = graph.nodes.filter((n) => n.id !== node.id);
      saveGraph(graph);
      el.remove();
      rerenderWires();
    });
    header.append(headerTitle, delBtn);

    // Ports row
    const portsRow = document.createElement("div");
    portsRow.className = "ne-ports-row";

    const inCol = document.createElement("div");
    inCol.className = "ne-ports-col ne-ports-in";

    for (const p of def.inputs) {
      const wrap = document.createElement("div");
      wrap.className = "ne-port-wrap";
      const circle = document.createElement("div");
      circle.className = "ne-port ne-port-in";
      circle.dataset.portId = p.id;
      circle.dataset.isOutput = "false";
      circle.style.cssText = `width:${PORT_RADIUS * 2}px;height:${PORT_RADIUS * 2}px;`;
      const lbl = document.createElement("span");
      lbl.className = "ne-port-label";
      lbl.textContent = p.label;
      wrap.append(circle, lbl);
      inCol.appendChild(wrap);
      circle.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); handlePortClick(node.id, p.id, false); });
    }

    const outCol = document.createElement("div");
    outCol.className = "ne-ports-col ne-ports-out";

    for (const p of def.outputs) {
      const wrap = document.createElement("div");
      wrap.className = "ne-port-wrap ne-port-wrap-out";
      const circle = document.createElement("div");
      circle.className = "ne-port ne-port-out";
      circle.dataset.portId = p.id;
      circle.dataset.isOutput = "true";
      circle.style.cssText = `width:${PORT_RADIUS * 2}px;height:${PORT_RADIUS * 2}px;`;
      const lbl = document.createElement("span");
      lbl.className = "ne-port-label";
      lbl.textContent = p.label;
      wrap.append(lbl, circle);
      outCol.appendChild(wrap);
      circle.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); handlePortClick(node.id, p.id, true); });
    }

    portsRow.append(inCol, outCol);

    // Params
    const paramsEl = document.createElement("div");
    paramsEl.className = "ne-params";

    for (const paramDef of def.params) {
      const row = document.createElement("div");
      row.className = "ne-param-row";
      const lbl = document.createElement("label");
      lbl.className = "ne-param-label";
      lbl.textContent = paramDef.label;
      let ctrl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      if (paramDef.type === "select") {
        const sel = document.createElement("select");
        sel.className = "ne-param-input ne-param-select";
        const emptyOpt = document.createElement("option");
        emptyOpt.value = "";
        emptyOpt.textContent = "— selectează —";
        sel.appendChild(emptyOpt);
        const opts: Array<{ value: string; label: string }> = paramDef.selectOptions
          ? [...paramDef.selectOptions]
          : (paramDef.selectSource ? BIMLibrary.getByCategory(paramDef.selectSource).map((i) => ({ value: i.value, label: i.name })) : []);
        for (const o of opts) {
          const opt = document.createElement("option");
          opt.value = o.value;
          opt.textContent = o.label;
          sel.appendChild(opt);
        }
        const stored = node.params[paramDef.id] ?? paramDef.defaultValue ?? "";
        sel.value = stored;
        if (sel.value !== stored) {
          // Value not in list — add a temporary option so it displays correctly
          const tmpOpt = document.createElement("option");
          tmpOpt.value = stored;
          tmpOpt.textContent = stored || "— selectează —";
          sel.appendChild(tmpOpt);
          sel.value = stored;
        }
        sel.addEventListener("change", () => { node.params[paramDef.id] = sel.value; saveGraph(graph); });
        sel.addEventListener("mousedown", (e) => e.stopPropagation());
        ctrl = sel;
      } else if (paramDef.type === "textarea") {
        const ta = document.createElement("textarea");
        ta.className = "ne-param-input ne-param-textarea";
        ta.placeholder = paramDef.placeholder;
        ta.value = node.params[paramDef.id] ?? paramDef.defaultValue ?? "";
        ta.rows = 3;
        ta.addEventListener("input", () => { node.params[paramDef.id] = ta.value; saveGraph(graph); });
        ta.addEventListener("mousedown", (e) => e.stopPropagation());
        ta.addEventListener("wheel", (e) => e.stopPropagation());
        ctrl = ta;
      } else {
        const inp = document.createElement("input");
        inp.className = "ne-param-input";
        inp.placeholder = paramDef.placeholder;
        inp.value = node.params[paramDef.id] ?? paramDef.defaultValue ?? "";
        inp.addEventListener("input", () => { node.params[paramDef.id] = inp.value; saveGraph(graph); });
        inp.addEventListener("mousedown", (e) => e.stopPropagation());
        ctrl = inp;
      }
      row.append(lbl, ctrl!);
      paramsEl.appendChild(row);
    }

    el.append(header, portsRow, paramsEl);
    nodesEl.appendChild(el);

    // Drag
    header.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      dragging = { nodeId: node.id, sx: node.x, sy: node.y, mx: e.clientX, my: e.clientY };
      el.classList.add("ne-node-dragging");
    });
  };

  const renderAll = () => {
    nodesEl.innerHTML = "";
    for (const p of [...svg.querySelectorAll("path")]) p.remove();
    svg.appendChild(liveWire);
    for (const n of graph.nodes) renderNode(n);
    rerenderWires();
  };

  // ── Port connection ─────────────────────────────────────────────────────────

  const handlePortClick = (nodeId: string, portId: string, isOutput: boolean) => {
    if (!pendingWire) {
      pendingWire = { fromNode: nodeId, fromPort: portId, isOutput };
      setStatus(isOutput ? "Selectează un port de intrare…" : "Selectează un port de ieșire…");
      return;
    }

    // Determine direction: always output → input
    let fromNode: string, fromPort: string, toNode: string, toPort: string;
    if (pendingWire.isOutput && !isOutput) {
      fromNode = pendingWire.fromNode; fromPort = pendingWire.fromPort;
      toNode = nodeId; toPort = portId;
    } else if (!pendingWire.isOutput && isOutput) {
      fromNode = nodeId; fromPort = portId;
      toNode = pendingWire.fromNode; toPort = pendingWire.fromPort;
    } else {
      setStatus("⚠ Conectează un output (galben) la un input (albastru).", "error");
      pendingWire = null;
      liveWire.setAttribute("d", "");
      return;
    }

    if (fromNode === toNode) { pendingWire = null; liveWire.setAttribute("d", ""); return; }

    // Remove existing connection to this input
    graph.connections = graph.connections.filter(
      (c) => !(c.toNode === toNode && c.toPort === toPort),
    );
    graph.connections.push({ id: `c-${Date.now()}`, fromNode, fromPort, toNode, toPort });
    saveGraph(graph);
    pendingWire = null;
    liveWire.setAttribute("d", "");
    rerenderWires();
    setStatus("✓ Conectat!", "ok");
  };

  // ── Add node ──────────────────────────────────────────────────────────────

  const addNode = (type: string, x: number, y: number) => {
    const def = getTypeDef(type);
    const params: Record<string, string> = {};
    for (const p of def.params) params[p.id] = p.defaultValue ?? "";
    const node: NodeInstance = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type, params,
      x: Math.round(x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(y / GRID_SIZE) * GRID_SIZE,
    };
    graph.nodes.push(node);
    saveGraph(graph);
    renderNode(node);
    rerenderWires();
  };

  // ── Global mouse events ───────────────────────────────────────────────────

  window.addEventListener("mousemove", (e) => {
    if (winDrag) {
      layout.float.x = winDrag.ox + (e.clientX - winDrag.startX);
      layout.float.y = winDrag.oy + (e.clientY - winDrag.startY);
      root.style.left = `${layout.float.x}px`;
      root.style.top = `${layout.float.y}px`;
      return;
    }
    if (winResize) {
      if (winResize.edge === "br") {
        layout.float.w = Math.max(520, winResize.ow + (e.clientX - winResize.startX));
        layout.float.h = Math.max(280, winResize.oh + (e.clientY - winResize.startY));
        root.style.width = `${layout.float.w}px`;
        root.style.height = `${layout.float.h}px`;
      } else if (winResize.edge === "r") {
        layout.float.w = Math.max(520, winResize.ow + (e.clientX - winResize.startX));
        root.style.width = `${layout.float.w}px`;
      } else if (winResize.edge === "l") {
        const dx = e.clientX - winResize.startX;
        const newW = winResize.ow - dx;
        if (newW >= 520) {
          layout.float.w = newW;
          layout.float.x = winResize.ox + dx;
        } else {
          layout.float.w = 520;
          layout.float.x = winResize.ox + (winResize.ow - 520);
        }
        root.style.width = `${layout.float.w}px`;
        root.style.left = `${layout.float.x}px`;
      } else {
        layout.dockH = Math.max(200, winResize.oh + (winResize.startY - e.clientY));
        root.style.height = `${layout.dockH}px`;
      }
      rerenderWires();
      return;
    }
    if (dragging) {
      const node = graph.nodes.find((n) => n.id === dragging!.nodeId)!;
      node.x = dragging.sx + (e.clientX - dragging.mx) / zoom;
      node.y = dragging.sy + (e.clientY - dragging.my) / zoom;
      const el = nodesEl.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`);
      if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; }
      rerenderWires();
      return;
    }
    if (panStart) {
      offset.x = panStart.ox + (e.clientX - panStart.mouseX);
      offset.y = panStart.oy + (e.clientY - panStart.mouseY);
      applyTransform();
      rerenderWires();
      return;
    }
    if (pendingWire) {
      const from = portScreenPos(pendingWire.fromNode, pendingWire.fromPort, pendingWire.isOutput);
      if (!from) return;
      const cr = canvasWrap.getBoundingClientRect();
      // Mouse position must also be in SVG world-space (same transform as portScreenPos).
      const mx = (e.clientX - cr.left - offset.x) / zoom;
      const my = (e.clientY - cr.top - offset.y) / zoom;
      liveWire.setAttribute("d", pendingWire.isOutput ? bezier(from.x, from.y, mx, my) : bezier(mx, my, from.x, from.y));
    }
  });

  window.addEventListener("mouseup", () => {
    if (winDrag) { saveLayout(layout); winDrag = null; }
    if (winResize) { saveLayout(layout); winResize = null; document.body.style.cursor = ""; }
    if (dragging) {
      saveGraph(graph);
      nodesEl.querySelector(`[data-node-id="${dragging.nodeId}"]`)?.classList.remove("ne-node-dragging");
      dragging = null;
    }
    if (panStart) { panStart = null; canvasWrap.style.cursor = ""; }
  });

  canvasWrap.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    // If a wire is pending and user clicked on empty canvas (not a port),
    // cancel the wire but do NOT start panning.
    if (pendingWire) {
      pendingWire = null;
      liveWire.setAttribute("d", "");
      setStatus("↩ Wire anulat.", "info");
      return;
    }
    panStart = { mouseX: e.clientX, mouseY: e.clientY, ox: offset.x, oy: offset.y };
    canvasWrap.style.cursor = "grabbing";
  });

  canvasWrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const cr = canvasWrap.getBoundingClientRect();
    const mx = e.clientX - cr.left;
    const my = e.clientY - cr.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const nz = Math.min(Math.max(zoom * delta, 0.2), 3);
    offset.x = mx - (mx - offset.x) * (nz / zoom);
    offset.y = my - (my - offset.y) * (nz / zoom);
    zoom = nz;
    applyTransform();
    rerenderWires();
  }, { passive: false });

  // ── Buttons ───────────────────────────────────────────────────────────────

  runBtn.addEventListener("click", async () => {
    setStatus("⏳ Execuție…", "info");
    appendLog("── Run ──────────────────────────────", "info");
    try {
      await executeGraph(graph, components, setStatus, appendLog);
    } catch (err) {
      const msg = (err as Error).message;
      setStatus(`⚠ ${msg}`, "error");
      appendLog(`⚠ ${msg}`, "error");
    }
  });

  resetBtn.addEventListener("click", async () => {
    const hider = components.get(OBC.Hider);
    const highlighter = components.get(OBF.Highlighter);
    await hider.set(true);
    for (const [sn] of highlighter.styles) {
      if (sn.startsWith(STYLE_NAME)) await highlighter.clear(sn);
    }
    // Dispose all Fragments element models created by element nodes
    const fragsManager = components.get(OBC.FragmentsManager);
    for (const [nid, mId] of [..._neModelIds]) {
      try { await fragsManager.core.disposeModel(mId); } catch (_e) { /* ignore */ }
      _neModelIds.delete(nid);
      appendLog(`🗑 Model element "${mId}" eliminat.`, "warn");
    }
    setStatus("↺ Viewer resetat.", "ok");
    appendLog("↺ Viewer resetat.", "warn");
  });

  clearBtn.addEventListener("click", () => {
    if (!confirm("Ștergi tot graful?")) return;
    graph.nodes = [];
    graph.connections = [];
    saveGraph(graph);
    renderAll();
    setStatus("Graf șters.", "info");
  });

  fitBtn.addEventListener("click", () => {
    if (!graph.nodes.length) return;
    const xs = graph.nodes.map((n) => n.x);
    const ys = graph.nodes.map((n) => n.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs) + NODE_WIDTH, maxY = Math.max(...ys) + 120;
    const pad = 60;
    const cw = canvasWrap.clientWidth, ch = canvasWrap.clientHeight;
    zoom = Math.min((cw - pad * 2) / (maxX - minX), (ch - pad * 2) / (maxY - minY), 1.5);
    offset.x = pad - minX * zoom;
    offset.y = pad - minY * zoom;
    applyTransform();
    rerenderWires();
  });

  // ── Save graph to JSON file ───────────────────────────────────────────────
  saveBtn.addEventListener("click", () => {
    const json = JSON.stringify(graph, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `node-graph-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("💾 Graf salvat.", "ok");
    appendLog(`💾 Graf exportat: ${a.download} (${graph.nodes.length} noduri, ${graph.connections.length} conexiuni)`, "ok");
  });

  // ── Open graph from JSON file ─────────────────────────────────────────────
  openBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as GraphData;
        if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.connections)) {
          throw new Error("Format JSON invalid: lipsesc câmpurile nodes/connections.");
        }
        if (!confirm(`Încarci graful "${file.name}"?\nAcesta va înlocui graful curent (${graph.nodes.length} noduri).`)) return;
        graph.nodes = parsed.nodes;
        graph.connections = parsed.connections;
        saveGraph(graph);
        renderAll();
        setStatus(`📂 Graf încărcat: ${file.name}`, "ok");
        appendLog(`📂 Graf deschis: "${file.name}" (${graph.nodes.length} noduri, ${graph.connections.length} conexiuni)`, "ok");
      } catch (err) {
        const msg = (err as Error).message;
        setStatus(`⚠ Eroare la citire: ${msg}`, "error");
        appendLog(`⚠ Eroare la deschidere fișier: ${msg}`, "error");
      }
    };
    reader.readAsText(file);
  });

  // ── Initial render ────────────────────────────────────────────────────────
  renderAll();
  applyTransform();
  applyLayout();
  appendLog("Node Editor pornit. Adaugă noduri și apasă ▶ Run.", "info");

  return root;
};

// ─── Mount helper ─────────────────────────────────────────────────────────────

export const mountNodalGraphPanel = (components: OBC.Components): (() => void) => {
  if (!document.getElementById("ne-styles")) {
    const style = document.createElement("style");
    style.id = "ne-styles";
    style.textContent = NE_CSS;
    document.head.appendChild(style);
  }

  const wrapper = document.createElement("div");
  wrapper.id = "nodal-graph-portal";
  wrapper.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;display:none;pointer-events:none;";
  document.body.appendChild(wrapper);

  // Persistent show-tab visible when panel is hidden
  const showTab = document.createElement("button");
  showTab.id = "ne-show-tab";
  showTab.textContent = "⬡ Node Editor";
  showTab.style.display = "none";
  showTab.addEventListener("click", () => {
    wrapper.style.display = "block";
    showTab.style.display = "none";
  });
  document.body.appendChild(showTab);

  const doHide = () => {
    wrapper.style.display = "none";
    showTab.style.display = "block";
  };

  const editor = createNodeEditor(components, doHide);
  wrapper.appendChild(editor);

  return () => {
    const isHidden = wrapper.style.display === "none";
    if (isHidden) {
      wrapper.style.display = "block";
      showTab.style.display = "none";
    } else {
      doHide();
    }
  };
};

// Backward compat — toggle wiring done entirely in main.ts via returned fn

// ─── CSS ──────────────────────────────────────────────────────────────────────

const NE_CSS = `
#nodal-graph-portal { pointer-events: none; }
.ne-root {
  display: grid;
  grid-template-rows: 2.75rem 1fr 9rem;
  grid-template-columns: 11rem 1fr;
  grid-template-areas: "topbar topbar" "sidebar canvas" "console console";
  background: var(--bim-ui_bg-base, #14161b);
  border: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 8px 36px rgba(0,0,0,0.65);
  font-family: sans-serif;
  font-size: 13px;
  color: #d0d3dc;
  pointer-events: all;
  z-index: 9100;
}
/* Console */
.ne-console {
  grid-area: console;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  background: #0d0f14;
  overflow: hidden;
}
.ne-console-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.2rem 0.6rem;
  background: #111318;
  border-bottom: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; color: #555;
  flex-shrink: 0;
}
.ne-console-body {
  flex: 1; overflow-y: auto;
  padding: 0.25rem 0;
  font-family: "Cascadia Code", "Fira Mono", monospace; font-size: 0.73rem;
}
.ne-log {
  display: flex; gap: 0.5rem;
  padding: 0.08rem 0.6rem;
  line-height: 1.5;
  border-left: 2px solid transparent;
}
.ne-log:hover { background: rgba(255,255,255,0.03); }
.ne-log-ts { color: #4a5068; flex-shrink: 0; }
.ne-log-msg { white-space: pre-wrap; word-break: break-all; }
.ne-log-info  { color: #9ca3af; border-left-color: transparent; }
.ne-log-ok    { color: #4ade80; border-left-color: #166534; }
.ne-log-warn  { color: #fbbf24; border-left-color: #78350f; }
.ne-log-error { color: #f87171; border-left-color: #7f1d1d; }
/* Resize handles */
.ne-resize-br {
  grid-area: unset;
  position: absolute; bottom: 0; right: 0;
  width: 18px; height: 18px;
  cursor: se-resize; z-index: 10;
  pointer-events: all;
}
.ne-resize-br::after {
  content: "";
  position: absolute; bottom: 4px; right: 4px;
  width: 8px; height: 8px;
  border-right: 2px solid rgba(255,255,255,0.25);
  border-bottom: 2px solid rgba(255,255,255,0.25);
}
.ne-resize-top {
  position: absolute; top: 0; left: 0; right: 0;
  height: 6px;
  cursor: ns-resize; z-index: 10;
  background: linear-gradient(to bottom, rgba(255,255,255,0.07), transparent);
  pointer-events: all;
}
.ne-resize-l, .ne-resize-r {
  position: absolute; top: 2.75rem; bottom: 0; width: 5px;
  cursor: ew-resize; z-index: 10; pointer-events: all;
}
.ne-resize-l {
  left: 0;
  background: linear-gradient(to right, rgba(255,255,255,0.05), transparent);
}
.ne-resize-r {
  right: 0;
  background: linear-gradient(to left, rgba(255,255,255,0.05), transparent);
}
.ne-topbar {
  grid-area: topbar;
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0 0.75rem;
  background: var(--bim-ui_bg-contrast-10, #1c1f26);
  border-bottom: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
}
.ne-title { font-weight: 700; font-size: 0.85rem; color: var(--bim-ui_accent-base, #6528d7); flex: 0 0 auto; }
.ne-status { flex: 1; font-size: 0.78rem; padding: 0 0.5rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ne-status-ok    { color: #4ade80; }
.ne-status-error { color: #f87171; }
.ne-status-info  { color: #93c5fd; }
.ne-btn-bar { display: flex; gap: 0.3rem; }
.ne-btn {
  padding: 0.25rem 0.6rem; border-radius: 0.25rem;
  border: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  background: var(--bim-ui_bg-contrast-20, #252830);
  color: #d0d3dc; cursor: pointer; font-size: 0.75rem; white-space: nowrap;
}
.ne-btn:hover { background: var(--bim-ui_bg-contrast-40, #3a3d47); }
.ne-btn-accent { background: var(--bim-ui_accent-base, #6528d7); border-color: transparent; color: #fff; font-weight: 600; }
.ne-btn-accent:hover { filter: brightness(1.15); }

.ne-sidebar {
  grid-area: sidebar;
  display: flex; flex-direction: column;
  overflow-y: auto;
  border-right: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  background: var(--bim-ui_bg-contrast-10, #1c1f26);
}
.ne-side-title { padding: 0.5rem 0.75rem 0.3rem; font-size: 0.65rem; letter-spacing: 0.09em; color: #666; font-weight: 700; }
.ne-palette-item {
  display: flex; align-items: center; gap: 0.45rem;
  padding: 0.4rem 0.75rem; cursor: pointer;
  border-left: 3px solid transparent; font-size: 0.78rem;
}
.ne-palette-item:hover { background: var(--bim-ui_bg-contrast-20, #252830); }

.ne-cat-header {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.5rem 0.2rem;
  font-size: 0.6rem; letter-spacing: 0.09em; color: #777; font-weight: 700;
  text-transform: uppercase; cursor: pointer; user-select: none;
  border-top: 1px solid var(--bim-ui_bg-contrast-20, #252830);
  margin-top: 0.15rem;
}
.ne-cat-header:first-of-type { border-top: none; margin-top: 0; }
.ne-cat-header:hover { color: #bbb; }
.ne-cat-arrow { font-size: 0.6rem; transition: transform 0.15s; display: inline-block; line-height: 1; }
.ne-cat-header.ne-cat-collapsed .ne-cat-arrow { transform: rotate(-90deg); }
.ne-cat-items {}
.ne-cat-items.ne-cat-hidden { display: none; }

#ne-show-tab {
  position: fixed;
  bottom: 0; left: 50%;
  transform: translateX(-50%);
  z-index: 9001;
  padding: 0.3rem 1.1rem;
  background: var(--bim-ui_accent-base, #6528d7);
  color: #fff; border: none; border-radius: 0.5rem 0.5rem 0 0;
  font-size: 0.8rem; font-weight: 700; cursor: pointer;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.4);
  letter-spacing: 0.04em;
}
#ne-show-tab:hover { filter: brightness(1.2); }

.ne-canvas-wrap {
  grid-area: canvas; position: relative; overflow: hidden;
  background-color: #181b22;
  background-image: radial-gradient(circle, #2a2d38 1px, transparent 1px);
  background-size: 24px 24px;
  cursor: grab;
}
.ne-inner { position: absolute; top: 0; left: 0; width: 0; height: 0; transform-origin: 0 0; }
.ne-svg { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; overflow: visible; }
.ne-nodes { position: absolute; top: 0; left: 0; }

.ne-wire { stroke: rgba(77,192,255,0.55); stroke-width: 2.5px; cursor: pointer; pointer-events: stroke; }
.ne-wire:hover { stroke: #ff6b6b; stroke-width: 4px; }
.ne-wire-live { stroke: #fbbf24; stroke-width: 2px; stroke-dasharray: 6 3; pointer-events: none; }

.ne-node {
  position: absolute; border-radius: 0.4rem;
  background: var(--bim-ui_bg-contrast-10, #1c1f26);
  border: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  user-select: none;
}
.ne-node:hover { border-color: rgba(255,255,255,0.2); }
.ne-node-dragging { opacity: 0.88; box-shadow: 0 14px 36px rgba(0,0,0,0.8); z-index: 10; }

.ne-node-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 0.5rem; border-radius: 0.4rem 0.4rem 0 0; cursor: grab;
}
.ne-node-header-title { font-size: 0.77rem; font-weight: 700; color: #fff; pointer-events: none; }
.ne-node-del { background: transparent; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 1.05rem; padding: 0 0.1rem; line-height: 1; }
.ne-node-del:hover { color: #ff6b6b; }

.ne-ports-row { display: flex; justify-content: space-between; padding: 0.3rem 0; min-height: 1.4rem; }
.ne-ports-col { display: flex; flex-direction: column; gap: 0.3rem; }
.ne-ports-in { align-items: flex-start; }
.ne-ports-out { align-items: flex-end; }
.ne-port-wrap { display: flex; align-items: center; gap: 0.3rem; padding: 0 0.35rem; }
.ne-port-wrap-out { flex-direction: row-reverse; }
.ne-port { border-radius: 50%; cursor: crosshair; flex-shrink: 0; transition: transform 0.1s; }
.ne-port:hover { transform: scale(1.5); }
.ne-port-in  { background: #4dc0ff; border: 2px solid #0ea5e9; }
.ne-port-out { background: #fbbf24; border: 2px solid #d97706; }
.ne-port-label { font-size: 0.7rem; color: #9ca3af; }

.ne-params { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.3rem 0.5rem 0.5rem; }
.ne-param-row { display: flex; flex-direction: column; gap: 0.1rem; }
.ne-param-label { font-size: 0.65rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
.ne-param-input {
  background: var(--bim-ui_bg-contrast-20, #252830);
  border: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  border-radius: 0.2rem; color: #e2e8f0;
  font-size: 0.78rem; padding: 0.2rem 0.4rem;
  width: 100%; box-sizing: border-box; outline: none;
}
.ne-param-input:focus { border-color: var(--bim-ui_accent-base, #6528d7); }
.ne-param-textarea { resize: vertical; min-height: 3.5rem; line-height: 1.4; font-family: monospace; }
.ne-param-select { cursor: pointer; appearance: auto; }
`;
