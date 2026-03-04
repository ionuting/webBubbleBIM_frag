/**
 * GraphML Builder Node — v2
 *
 * Modificări față de v1:
 *  - Port de intrare "matrices" — prima Matrix4 din serie devine world-transform
 *    aplicat tuturor coordonatelor de ax (translație / rotație a întregii clădiri)
 *  - Câmpurile non-interax sunt acum select (dropdown) legate de BIMLibrary
 *  - Orientare corectă uși/ferestre: openingW ÎNTOTDEAUNA pe direcția start→end
 *  - Presets globale per categorie; override per tip în textarea
 */

import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import { NodeRegistry } from "./node-registry";
import { BooleanRulesEngine } from "./boolean-rules";

/** Plugin identifier (side-effect: registers the node on import). */
export const GRAPHML_BUILDER_PLUGIN = "graphml-builder";

// ─── GraphML parsing ───────────────────────────────────────────────────────────

interface GMLNode {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  z: number;
  props: Record<string, string>;
}

interface GMLEdge {
  id: string;
  source: string;
  target: string;
}

interface ParsedGML {
  nodes: Map<string, GMLNode>;
  edges: GMLEdge[];
}

function parseGraphML(xml: string): ParsedGML {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) throw new Error("XML invalid: " + parseErr.textContent?.slice(0, 120));

  const nodes = new Map<string, GMLNode>();
  const edges: GMLEdge[] = [];

  for (const el of doc.querySelectorAll("node")) {
    const id = el.getAttribute("id") ?? "";
    const props: Record<string, string> = {};
    for (const d of el.querySelectorAll("data")) {
      const k = d.getAttribute("key");
      if (k) props[k] = d.textContent?.trim() ?? "";
    }
    nodes.set(id, {
      id,
      type: props["type"] ?? "",
      name: props["name"] ?? id,
      x: parseFloat(props["x"] ?? "0") || 0,
      y: parseFloat(props["y"] ?? "0") || 0,
      z: parseFloat(props["z"] ?? "0") || 0,
      props,
    });
  }

  for (const el of doc.querySelectorAll("edge")) {
    edges.push({
      id: el.getAttribute("id") ?? "",
      source: el.getAttribute("source") ?? "",
      target: el.getAttribute("target") ?? "",
    });
  }

  return { nodes, edges };
}

// ─── Axis grid computation ─────────────────────────────────────────────────────

function computeAxisGrid(axisXStr: string, axisZStr: string) {
  const toPositions = (str: string): number[] => {
    const dists = str
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((v) => !isNaN(v));
    const pos = [0];
    let cum = 0;
    for (const d of dists) { cum += Math.abs(d); pos.push(cum); }
    return pos;
  };

  const xPos = toPositions(axisXStr);
  const zPos = toPositions(axisZStr);
  const nX = xPos.length;
  const nZ = zPos.length;

  const getCoord = (nameIndex: number): { x: number; z: number } | null => {
    const li = nameIndex - 1;
    if (li < 0) return null;
    const xi = li % nX;
    const zi = Math.floor(li / nX);
    if (xi >= nX || zi >= nZ) return null;
    return { x: xPos[xi], z: zPos[zi] };
  };

  return { xPos, zPos, nX, nZ, getCoord };
}

// ─── Override / preset helpers ─────────────────────────────────────────────────

type KVMap = Record<string, string>;
type OvMap = Map<string, KVMap>;

function parseOverrides(text: string): OvMap {
  const result: OvMap = new Map();
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    const ci = l.indexOf(":");
    if (ci < 0) continue;
    const typeName = l.slice(0, ci).trim();
    result.set(typeName, parseKV(l.slice(ci + 1).trim()));
  }
  return result;
}

function parseKV(str: string): KVMap {
  const result: KVMap = {};
  for (const pair of str.split(",")) {
    const ei = pair.indexOf("=");
    if (ei < 0) continue;
    result[pair.slice(0, ei).trim()] = pair.slice(ei + 1).trim();
  }
  return result;
}

// ─── IFC GUID helper ──────────────────────────────────────────────────────────

const IFC64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function makeGuid(): string {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  let r = "";
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < uuid.length; i += 2) {
    acc = (acc << 8) | parseInt(uuid.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 6) { bits -= 6; r += IFC64[(acc >> bits) & 0x3f]; }
  }
  if (bits > 0) r += IFC64[(acc << (6 - bits)) & 0x3f];
  return r.slice(0, 22);
}

// ─── Node Registration ─────────────────────────────────────────────────────────

NodeRegistry.register({
  def: {
    type: "graphml-builder",
    label: "GraphML Builder",
    icon: "🏗",
    color: "#1e40af",
    category: "Elements",
    inputs: [{ id: "matrices", label: "Matrices" }],
    outputs: [],
    isSink: true,
    params: [
      {
        id: "filePath",
        label: "GraphML (fișier)",
        type: "select",
        selectSource: "graphml",
        placeholder: "/construction.graphml",
        defaultValue: "/construction.graphml",
      },
      {
        id: "axisX",
        label: "Distanțe inter-ax X (m), separate prin virgulă",
        placeholder: "2, 1.5, 2.5",
        defaultValue: "2, 1.5, 2.5",
      },
      {
        id: "axisZ",
        label: "Distanțe inter-ax Z (m), separate prin virgulă",
        placeholder: "4, 3, 3",
        defaultValue: "4, 3, 3",
      },
      {
        id: "height",
        label: "Înălțime etaj",
        type: "select",
        selectSource: "storey-height",
        placeholder: "3",
        defaultValue: "3.0",
      },
      {
        id: "wallPreset",
        label: "Tip perete (preset librărie)",
        type: "select",
        selectSource: "wall",
        placeholder: "",
        defaultValue: "",
      },
      {
        id: "wallTypes",
        label: "Pereți — override per tip (auto-populat)",
        type: "textarea",
        placeholder: "W25: thickness=0.25,height=3,color=#d4a96a",
        defaultValue: "",
      },
      {
        id: "columnPreset",
        label: "Tip coloană (preset librărie)",
        type: "select",
        selectSource: "column",
        placeholder: "",
        defaultValue: "",
      },
      {
        id: "columnTypes",
        label: "Coloane — override per tip (auto-populat)",
        type: "textarea",
        placeholder: "C25x25: width=0.25,depth=0.25,color=#7dd3fc",
        defaultValue: "",
      },
      {
        id: "beamPreset",
        label: "Tip grindă (preset librărie)",
        type: "select",
        selectSource: "beam",
        placeholder: "",
        defaultValue: "",
      },
      {
        id: "beamTypes",
        label: "Grinzi — override per tip (auto-populat)",
        type: "textarea",
        placeholder: "C25x25: width=0.25,depth=0.25,color=#a16207",
        defaultValue: "",
      },
      {
        id: "windowPreset",
        label: "Tip fereastră (preset librărie)",
        type: "select",
        selectSource: "window",
        placeholder: "",
        defaultValue: "",
      },
      {
        id: "windowTypes",
        label: "Ferestre — override per tip (auto-populat)",
        type: "textarea",
        placeholder: "wd120x120: width=1.2,height=1.2,sill_height=0.9,color=#93c5fd",
        defaultValue: "",
      },
      {
        id: "doorPreset",
        label: "Tip ușă (preset librărie)",
        type: "select",
        selectSource: "door",
        placeholder: "",
        defaultValue: "",
      },
      {
        id: "doorTypes",
        label: "Uși — override per tip (auto-populat)",
        type: "textarea",
        placeholder: "d90x210: width=0.9,height=2.1,color=#86efac",
        defaultValue: "",
      },
      {
        id: "hide",
        label: "Ascunde din viewer",
        type: "select",
        placeholder: "false",
        defaultValue: "false",
        selectOptions: [
          { value: "false", label: "Nu — afișează în viewer" },
          { value: "true", label: "Da — ascunde geometria" },
        ],
      },
    ],
  },

  execute: async (ctx) => {
    const { nodeId, components, log, neModelIds, getGeoEngine, getRawInput } = ctx;
    const p = ctx.node.params;

    const filePath = ((p.filePath ?? "").trim()) || "/construction.graphml";
    const height = Math.max(0.5, parseFloat(p.height ?? "3") || 3);
    const hideAll = (p.hide ?? "false").trim().toLowerCase() === "true";

    // ── World-transform from matrices input ────────────────────────────────────
    const inputMatrices = getRawInput(nodeId, "matrices") as THREE.Matrix4[] | null;
    const worldMatrix: THREE.Matrix4 | null =
      Array.isArray(inputMatrices) && inputMatrices.length > 0 ? inputMatrices[0] : null;

    // ── 1. Load GraphML ────────────────────────────────────────────────────────
    log(`🏗 GraphML Builder: se încarcă "${filePath}"…`, "info");
    let xml: string;
    try {
      const resp = await fetch(filePath);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      xml = await resp.text();
    } catch (err) {
      log(`⚠ Eroare încărcare GraphML: ${(err as Error).message}`, "error");
      return;
    }

    // ── 2. Parse ───────────────────────────────────────────────────────────────
    let parsed: ParsedGML;
    try { parsed = parseGraphML(xml); }
    catch (err) { log(`⚠ Parsare GraphML eșuată: ${(err as Error).message}`, "error"); return; }

    const { nodes, edges } = parsed;
    const axNodes = [...nodes.values()].filter((n) => n.type === "ax");
    const wallNodes = [...nodes.values()].filter((n) => n.type === "wall");
    const winNodes = [...nodes.values()].filter((n) => n.type === "window");
    const doorNodes = [...nodes.values()].filter((n) => n.type === "door");
    const roomNodes = [...nodes.values()].filter((n) => n.type === "room");

    log(`📋 Elemente: ${axNodes.length} ax · ${wallNodes.length} pereți · ${winNodes.length} ferestre · ${doorNodes.length} uși · ${roomNodes.length} camere`, "info");

    // ── 3. Axis 3D coordinates ─────────────────────────────────────────────────
    const { getCoord, nX, nZ } = computeAxisGrid(p.axisX ?? "2,1.5,2.5", p.axisZ ?? "4,3,3");
    log(`📐 Grilă ax: ${nX} col × ${nZ} rând = ${nX * nZ} intersecții`, "info");

    const axPos = new Map<string, THREE.Vector3>();
    for (const ax of axNodes) {
      const nameIdx = parseInt(ax.name, 10);
      const coord = getCoord(nameIdx);
      if (coord) {
        axPos.set(ax.id, new THREE.Vector3(coord.x, 0, coord.z));
      } else {
        axPos.set(ax.id, new THREE.Vector3(ax.x * 0.01, 0, -ax.y * 0.01));
        if (!isNaN(nameIdx))
          log(`⚠ Ax "${ax.name}" (idx=${nameIdx}) depășește grila → fallback canvas.`, "warn");
      }
    }

    // ── 4. Apply world matrix to all axis positions ────────────────────────────
    if (worldMatrix) {
      for (const pos of axPos.values()) pos.applyMatrix4(worldMatrix);
      log("📐 World-transform aplicat pe toate axele din matrices input.", "info");
    }

    // ── 5. Wall connectivity: ax → wall → ax ──────────────────────────────────
    const wallConn = new Map<string, { s: string; e: string }>();
    for (const wall of wallNodes) {
      let startId: string | null = null;
      let endId: string | null = null;
      for (const edge of edges) {
        if (edge.target === wall.id && nodes.get(edge.source)?.type === "ax") startId = edge.source;
        if (edge.source === wall.id && nodes.get(edge.target)?.type === "ax") endId = edge.target;
      }
      if (startId && endId) wallConn.set(wall.id, { s: startId, e: endId });
    }

    // ── 6. Opening → wall mapping ──────────────────────────────────────────────
    const openingWall = new Map<string, string>();
    for (const op of [...winNodes, ...doorNodes]) {
      for (const edge of edges) {
        if (edge.source === op.id && nodes.get(edge.target)?.type === "wall") openingWall.set(op.id, edge.target);
        if (edge.target === op.id && nodes.get(edge.source)?.type === "wall") openingWall.set(op.id, edge.source);
      }
    }

    // ── 7. Discover types → auto-populate textareas ───────────────────────────
    const discWalls = new Set<string>();
    const discCols = new Set<string>();
    const discBeams = new Set<string>();
    const discWins = new Set<string>();
    const discDoors = new Set<string>();

    for (const w of wallNodes) {
      discWalls.add(w.name.toUpperCase());
      if (w.props["has_beam"]?.toLowerCase() === "true" && w.props["beam_type"])
        discBeams.add(w.props["beam_type"]);
    }
    for (const ax of axNodes) {
      if (ax.props["has_column"]?.toLowerCase() === "true" && ax.props["column_type"])
        discCols.add(ax.props["column_type"]);
    }
    for (const w of winNodes) discWins.add(w.name.toLowerCase());
    for (const d of doorNodes) discDoors.add(d.name.toLowerCase());

    let updated = false;
    const autoFill = (key: string, types: Set<string>, defaultsFn: (t: string) => KVMap) => {
      if ((p[key] ?? "").trim() || types.size === 0) return;
      p[key] = [...types]
        .map((t) => `${t}: ${Object.entries(defaultsFn(t)).map(([k, v]) => `${k}=${v}`).join(",")}`)
        .join("\n");
      updated = true;
    };

    autoFill("wallTypes", discWalls, (name) => {
      const preset = p.wallPreset?.trim() ? parseKV(p.wallPreset) : null;
      const m = name.match(/\d+/);
      const thk = m ? Math.max(0.10, Math.min(0.99, parseInt(m[0]) / 100)) : 0.25;
      return (preset ? { ...preset, thickness: preset.thickness ?? thk.toFixed(2) }
        : { thickness: thk.toFixed(2), height: height.toFixed(1), color: "#d4a96a" }) as KVMap;
    });
    autoFill("columnTypes", discCols, (name) => {
      const preset = p.columnPreset?.trim() ? parseKV(p.columnPreset) : null;
      const m = name.match(/C?(\d+)[xX](\d+)/);
      return (preset ?? { width: m ? (parseInt(m[1]) / 100).toFixed(2) : "0.25", depth: m ? (parseInt(m[2]) / 100).toFixed(2) : "0.25", color: "#7dd3fc" }) as KVMap;
    });
    autoFill("beamTypes", discBeams, (name) => {
      const preset = p.beamPreset?.trim() ? parseKV(p.beamPreset) : null;
      const m = name.match(/C?(\d+)[xX](\d+)/);
      return (preset ?? { width: m ? (parseInt(m[1]) / 100).toFixed(2) : "0.25", depth: m ? (parseInt(m[2]) / 100).toFixed(2) : "0.25", color: "#a16207" }) as KVMap;
    });
    autoFill("windowTypes", discWins, (name) => {
      const preset = p.windowPreset?.trim() ? parseKV(p.windowPreset) : null;
      const m = name.match(/(\d+)[xX](\d+)/);
      return (preset ?? { width: m ? (parseInt(m[1]) / 100).toFixed(2) : "1.20", height: m ? (parseInt(m[2]) / 100).toFixed(2) : "1.20", sill_height: "0.90", color: "#93c5fd" }) as KVMap;
    });
    autoFill("doorTypes", discDoors, (name) => {
      const preset = p.doorPreset?.trim() ? parseKV(p.doorPreset) : null;
      const m = name.match(/(\d+)[xX](\d+)/);
      return (preset ?? { width: m ? (parseInt(m[1]) / 100).toFixed(2) : "0.90", height: m ? (parseInt(m[2]) / 100).toFixed(2) : "2.10", color: "#86efac" }) as KVMap;
    });

    if (updated) {
      log("✨ Textareas auto-generate din tipurile descoperite în GraphML.", "ok");
      const nodeEl = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
      if (nodeEl) {
        const taKeys = ["wallTypes", "columnTypes", "beamTypes", "windowTypes", "doorTypes"];
        nodeEl.querySelectorAll<HTMLTextAreaElement>(".ne-param-textarea").forEach((ta, i) => {
          if (i < taKeys.length && p[taKeys[i]]) ta.value = p[taKeys[i]];
        });
      }
    }

    if (hideAll) { log("🏗 GraphML Builder: geometrie ascunsă.", "info"); return; }

    // ── 8. Parse overrides + global presets ───────────────────────────────────
    const ovWall = parseOverrides(p.wallTypes ?? "");
    const ovCol = parseOverrides(p.columnTypes ?? "");
    const ovBeam = parseOverrides(p.beamTypes ?? "");
    const ovWin = parseOverrides(p.windowTypes ?? "");
    const ovDoor = parseOverrides(p.doorTypes ?? "");

    const presetWall = p.wallPreset?.trim() ? parseKV(p.wallPreset) : null;
    const presetCol = p.columnPreset?.trim() ? parseKV(p.columnPreset) : null;
    const presetBeam = p.beamPreset?.trim() ? parseKV(p.beamPreset) : null;
    const presetWindow = p.windowPreset?.trim() ? parseKV(p.windowPreset) : null;
    const presetDoor = p.doorPreset?.trim() ? parseKV(p.doorPreset) : null;

    /** type-override > global-preset > {} */
    const resolveOv = (ovMap: OvMap, key: string, preset: KVMap | null): KVMap => {
      const typeOv = ovMap.get(key);
      if (typeOv && Object.keys(typeOv).length > 0) return typeOv;
      return preset ?? {};
    };

    // ── 9. Prepare Fragments model ─────────────────────────────────────────────
    const frags = components.get(OBC.FragmentsManager);
    const modelId = `ne-graphml-${nodeId}`;
    if (neModelIds.has(nodeId)) {
      try { await frags.core.disposeModel(neModelIds.get(nodeId)!); } catch (_) { /* */ }
      neModelIds.delete(nodeId);
    }
    const bytes = FRAGS.EditUtils.newModel({ raw: true });
    await frags.core.load(bytes, { modelId, raw: true });
    neModelIds.set(nodeId, modelId);

    const geoEng = await getGeoEngine();
    const identityLt = frags.core.editor.createLocalTransform(modelId, new THREE.Matrix4().identity());
    const matCache = new Map<string, ReturnType<typeof frags.core.editor.createMaterial>>();

    const getMat = (color: string, transparent = false, opacity = 1) => {
      const key = `${color}:${transparent}:${opacity}`;
      if (!matCache.has(key)) {
        matCache.set(key, frags.core.editor.createMaterial(modelId,
          new THREE.MeshLambertMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, transparent, opacity })));
      }
      return matCache.get(key)!;
    };

    const allElements: any[] = [];
    const addEl = (
      category: string, geom: THREE.BufferGeometry, color: string,
      globalTransform = new THREE.Matrix4().identity(), transparent = false, opacity = 1,
    ) => {
      allElements.push({
        attributes: { _category: { value: category }, GlobalId: { value: makeGuid(), type: 4 } } as any,
        globalTransform,
        samples: [{ localTransform: identityLt, representation: frags.core.editor.createShell(modelId, geom), material: getMat(color, transparent, opacity) }],
      });
    };

    let nCol = 0, nWall = 0, nBeam = 0, nWin = 0, nDoor = 0, nRoom = 0;

    // ──── Geometry record types — defer wall commit until boolean cuts applied ──
    type ColRecord  = {
      axId: string;
      geomLocal: THREE.BufferGeometry;
      /** WASM geometry in world-space – used as boolean cutter. */
      geomCutter: THREE.BufferGeometry;
      color: string;
      transform: THREE.Matrix4;
    };
    type WallRecord = { wallId: string; geomWorld: THREE.BufferGeometry; color: string };
    /** BoxGeometry centered at origin, world placement stored in `transform`.
     *  geomCutter is a geoEng.getWall() geometry (WASM-format, world-space)
     *  used only for boolean operations – avoids the library index-array bug. */
    type OpenRecord = {
      category: string;
      geomBox: THREE.BufferGeometry;
      /** WASM wall geometry in world-space for boolean cutting. */
      geomCutter?: THREE.BufferGeometry;
      wallId: string | undefined;
      color: string;
      transparent: boolean;
      opacity: number;
      transform: THREE.Matrix4;
    };

    const colRecords:  ColRecord[]  = [];
    const wallRecords: WallRecord[] = [];
    const openRecords: OpenRecord[] = [];

    // ── 10a. Columns ──────────────────────────────────────────────────────────
    for (const ax of axNodes) {
      if (ax.props["has_column"]?.toLowerCase() !== "true") continue;
      const colType = ax.props["column_type"] ?? "C25x25";
      const ov      = resolveOv(ovCol, colType, presetCol);
      const m       = colType.match(/C?(\d+)[xX](\d+)/i);
      const cw      = parseFloat(ov.width  ?? "0") || (m ? parseInt(m[1]) / 100 : 0.25);
      const cd      = parseFloat(ov.depth  ?? "0") || (m ? parseInt(m[2]) / 100 : 0.25);
      const cc      = ov.color ?? "#7dd3fc";
      const pos     = axPos.get(ax.id);
      if (!pos) continue;
      const g = new THREE.BoxGeometry(cw, height, cd);
      g.translate(0, height / 2, 0);           // bake vertical offset into geom (visual)
      // WASM cutter – column box in world space using geoEng so indices are FRAGS-compatible
      const colCutterGeom = new THREE.BufferGeometry();
      geoEng.getWall(colCutterGeom, {
        start:    [pos.x - cw / 2, 0, pos.z],
        end:      [pos.x + cw / 2, 0, pos.z],
        direction: [0, 1, 0], elevation: 0, offset: 0,
        thickness: cd, height,
        cuttingPlaneNormal: [0, 0, 0], cuttingPlanePosition: [0, 0, 0],
      });
      colRecords.push({
        axId: ax.id,
        geomLocal: g,
        geomCutter: colCutterGeom,
        color: cc,
        transform: new THREE.Matrix4().makeTranslation(pos.x, 0, pos.z),
      });
      nCol++;
    }
    // Commit columns to Fragments (no boolean target applied to columns)
    for (const cr of colRecords) {
      addEl("IfcColumn", cr.geomLocal, cr.color, cr.transform);
    }

    // ── 10b. Walls + Beams ────────────────────────────────────────────────────
    for (const wall of wallNodes) {
      const conn = wallConn.get(wall.id);
      if (!conn) continue;
      const sPos = axPos.get(conn.s);
      const ePos = axPos.get(conn.e);
      if (!sPos || !ePos) continue;

      const wName  = wall.name.toUpperCase();
      const ov     = resolveOv(ovWall, wName, presetWall);
      const nm     = wName.match(/\d+/);
      const defThk = nm ? Math.max(0.10, Math.min(0.99, parseInt(nm[0]) / 100)) : 0.25;
      const thk    = parseFloat(ov.thickness ?? "0") || defThk;
      const wallH  = parseFloat(ov.height    ?? "0") || height;
      const wallC  = ov.color ?? "#d4a96a";

      const wGeom = new THREE.BufferGeometry();
      geoEng.getWall(wGeom, {
        start: [sPos.x, 0, sPos.z], end: [ePos.x, 0, ePos.z],
        direction: [0, 1, 0], elevation: 0, offset: 0, thickness: thk, height: wallH,
        cuttingPlaneNormal: [0, 0, 0], cuttingPlanePosition: [0, 0, 0],
      });
      // Wall geometry from getWall is already in world space → defer to boolean step
      wallRecords.push({ wallId: wall.id, geomWorld: wGeom, color: wallC });
      nWall++;

      if (wall.props["has_beam"]?.toLowerCase() === "true") {
        const bType = wall.props["beam_type"] ?? "C25x25";
        const bOv   = resolveOv(ovBeam, bType, presetBeam);
        const bm    = bType.match(/C?(\d+)[xX](\d+)/i);
        const bw    = parseFloat(bOv.width ?? "0") || (bm ? parseInt(bm[1]) / 100 : 0.25);
        const bd    = parseFloat(bOv.depth ?? "0") || (bm ? parseInt(bm[2]) / 100 : 0.25);
        const bc    = bOv.color ?? "#a16207";
        const dir   = new THREE.Vector3(ePos.x - sPos.x, 0, ePos.z - sPos.z);
        const len   = dir.length();
        if (len > 0.01) {
          dir.normalize();
          const mid = new THREE.Vector3((sPos.x + ePos.x) / 2, wallH + bd / 2, (sPos.z + ePos.z) / 2);
          const q   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
          addEl("IfcBeam", new THREE.BoxGeometry(len, bd, bw), bc,
            new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(mid));
          nBeam++;
        }
      }
    }

    // ── Helper: wall thickness ─────────────────────────────────────────────────
    const wallThkById = (wallId: string): number => {
      const wn = nodes.get(wallId);
      if (!wn) return 0.25;
      const wName = wn.name.toUpperCase();
      const ov    = resolveOv(ovWall, wName, presetWall);
      const nm    = wName.match(/\d+/);
      return parseFloat(ov.thickness ?? "0") || (nm ? Math.max(0.10, Math.min(0.99, parseInt(nm[0]) / 100)) : 0.25);
    };

    // ── Helper: opening world Matrix4 ─────────────────────────────────────────
    /**
     * BoxGeometry convention: BoxGeometry(openingW, openingH, depth)
     *   • openingW → local X  ── aligned with wall direction via setFromUnitVectors
     *   • openingH → local Y  ── world vertical
     *   • depth    → local Z  ── wall normal (through wall)
     */
    const openingTransform = (
      wallId: string | undefined,
      openingNode: GMLNode,
      openingW: number,
      yCenter: number,
    ): THREE.Matrix4 => {
      const conn = wallId ? wallConn.get(wallId) : null;
      const sPos = conn ? axPos.get(conn.s) : null;
      const ePos = conn ? axPos.get(conn.e) : null;

      if (sPos && ePos) {
        const rawDir = new THREE.Vector3(ePos.x - sPos.x, 0, ePos.z - sPos.z);
        const len    = rawDir.length();
        const dir    = rawDir.clone().normalize();
        const rawOffset = parseFloat(openingNode.props["offset"] ?? "1") || 1;
        const t   = Math.max(openingW / 2, Math.min(len - openingW / 2, rawOffset));
        const pos = new THREE.Vector3(sPos.x + dir.x * t, yCenter, sPos.z + dir.z * t);
        const q   = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
        return new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(pos);
      }
      return new THREE.Matrix4().makeTranslation(openingNode.x * 0.01, yCenter, -openingNode.y * 0.01);
    };

    // ── 10c. Windows ──────────────────────────────────────────────────────────
    for (const win of winNodes) {
      const wallId  = openingWall.get(win.id);
      const wName   = win.name.toLowerCase();
      const ov      = resolveOv(ovWin, wName, presetWindow);
      const ww      = parseFloat(ov.width       ?? "0") || 1.2;
      const wh      = parseFloat(ov.height      ?? "0") || 1.2;
      const sillH   = parseFloat(ov.sill_height ?? win.props["sill_height"] ?? "0.9") || 0.9;
      const wc      = ov.color ?? "#93c5fd";
      const depth   = (wallId ? wallThkById(wallId) : 0.25) + 0.02;
      const yCenter = sillH + wh / 2;

      // WASM cutter – opening shape in world space, same index structure as wall target
      let winCutterGeom: THREE.BufferGeometry | undefined;
      const winConn = wallId ? wallConn.get(wallId) : null;
      const winSPos = winConn ? axPos.get(winConn.s) : null;
      const winEPos = winConn ? axPos.get(winConn.e) : null;
      if (winSPos && winEPos) {
        const winRawDir = new THREE.Vector3(winEPos.x - winSPos.x, 0, winEPos.z - winSPos.z);
        const winLen    = winRawDir.length();
        const winDir    = winRawDir.clone().normalize();
        const rawOff    = parseFloat(win.props["offset"] ?? "1") || 1;
        const winT      = Math.max(ww / 2, Math.min(winLen - ww / 2, rawOff));
        const cx = winSPos.x + winDir.x * winT;
        const cz = winSPos.z + winDir.z * winT;
        winCutterGeom = new THREE.BufferGeometry();
        geoEng.getWall(winCutterGeom, {
          start:     [cx - winDir.x * ww / 2, 0, cz - winDir.z * ww / 2],
          end:       [cx + winDir.x * ww / 2, 0, cz + winDir.z * ww / 2],
          direction: [0, 1, 0], elevation: sillH, offset: 0,
          thickness: depth, height: wh,
          cuttingPlaneNormal: [0, 0, 0], cuttingPlanePosition: [0, 0, 0],
        });
      }

      openRecords.push({
        category: "IfcWindow",
        geomBox: new THREE.BoxGeometry(ww, wh, depth),
        geomCutter: winCutterGeom,
        wallId,
        color: wc,
        transparent: true,
        opacity: 0.70,
        transform: openingTransform(wallId, win, ww, yCenter),
      });
      nWin++;
    }

    // ── 10d. Doors ────────────────────────────────────────────────────────────
    for (const door of doorNodes) {
      const wallId  = openingWall.get(door.id);
      const dName   = door.name.toLowerCase();
      const ov      = resolveOv(ovDoor, dName, presetDoor);
      const dw      = parseFloat(ov.width  ?? "0") || 0.9;
      const dh      = parseFloat(ov.height ?? "0") || 2.1;
      const dc      = ov.color ?? "#86efac";
      const depth   = (wallId ? wallThkById(wallId) : 0.25) + 0.02;
      const yCenter = dh / 2;

      // WASM cutter – door opening in world space
      let doorCutterGeom: THREE.BufferGeometry | undefined;
      const doorConn = wallId ? wallConn.get(wallId) : null;
      const doorSPos = doorConn ? axPos.get(doorConn.s) : null;
      const doorEPos = doorConn ? axPos.get(doorConn.e) : null;
      if (doorSPos && doorEPos) {
        const doorRawDir = new THREE.Vector3(doorEPos.x - doorSPos.x, 0, doorEPos.z - doorSPos.z);
        const doorLen    = doorRawDir.length();
        const doorDir    = doorRawDir.clone().normalize();
        const rawOff     = parseFloat(door.props["offset"] ?? "1") || 1;
        const doorT      = Math.max(dw / 2, Math.min(doorLen - dw / 2, rawOff));
        const cx = doorSPos.x + doorDir.x * doorT;
        const cz = doorSPos.z + doorDir.z * doorT;
        doorCutterGeom = new THREE.BufferGeometry();
        geoEng.getWall(doorCutterGeom, {
          start:     [cx - doorDir.x * dw / 2, 0, cz - doorDir.z * dw / 2],
          end:       [cx + doorDir.x * dw / 2, 0, cz + doorDir.z * dw / 2],
          direction: [0, 1, 0], elevation: 0, offset: 0,
          thickness: depth, height: dh,
          cuttingPlaneNormal: [0, 0, 0], cuttingPlanePosition: [0, 0, 0],
        });
      }

      openRecords.push({
        category: "IfcDoor",
        geomBox: new THREE.BoxGeometry(dw, dh, depth),
        geomCutter: doorCutterGeom,
        wallId,
        color: dc,
        transparent: true,
        opacity: 0.85,
        transform: openingTransform(wallId, door, dw, yCenter),
      });
      nDoor++;
    }

    // Commit opening visual elements (semi-transparent boxes at world position)
    for (const or of openRecords) {
      addEl(or.category, or.geomBox.clone(), or.color, or.transform, or.transparent, or.opacity);
    }

    // ── 10e. Boolean DIFFERENCE: walls ← openings + columns ──────────────────
    //
    // Strategy: bake every tool's world transform INTO its geometry so that the
    // mesh passed to getBooleanOperation always has an identity matrix.  This
    // avoids matrixWorld propagation issues with standalone (scene-less) meshes.

    // Group openings by wall id
    const openingsPerWall = new Map<string, OpenRecord[]>();
    for (const or of openRecords) {
      if (!or.wallId) continue;
      if (!openingsPerWall.has(or.wallId)) openingsPerWall.set(or.wallId, []);
      openingsPerWall.get(or.wallId)!.push(or);
    }
    // Index column records by axis id for O(1) lookup
    const colsByAxId = new Map<string, ColRecord>();
    for (const cr of colRecords) colsByAxId.set(cr.axId, cr);

    let nCut = 0;
    for (const wr of wallRecords) {
      const conn  = wallConn.get(wr.wallId);
      const tools: THREE.Mesh[] = [];

      // ── Opening tools ────────────────────────────────────────────────────────
      // Use geomCutter (WASM getWall geometry, already world-space) so that
      // operand index structure matches the target wall – works around the
      // minification bug in FRAGS BooleanOperation where it reads the target's
      // index array (n[r]) instead of the operand's own indices.
      for (const or of (openingsPerWall.get(wr.wallId) ?? [])) {
        if (!BooleanRulesEngine.isCutBy("IfcWall", or.category)) continue;
        if (!or.geomCutter) continue;   // no wall geometry available as cutter
        tools.push(new THREE.Mesh(or.geomCutter));
      }

      // ── Column tools at wall endpoints ────────────────────────────────────────
      if (conn) {
        for (const axId of [conn.s, conn.e]) {
          const cr = colsByAxId.get(axId);
          if (!cr) continue;
          if (!BooleanRulesEngine.isCutBy("IfcWall", "IfcColumn")) continue;
          tools.push(new THREE.Mesh(cr.geomCutter));
        }
      }

      if (tools.length > 0) {
        const resultGeom = new THREE.BufferGeometry();
        try {
          geoEng.getBooleanOperation(resultGeom, {
            type: "DIFFERENCE",
            target: new THREE.Mesh(wr.geomWorld),   // already in world space
            operands: tools,
          });
          addEl("IfcWall", resultGeom, wr.color);
          nCut++;
        } catch (e) {
          log(`⚠ Boolean cut perete "${wr.wallId}": ${(e as Error).message} — geometrie originală păstrată`, "warn");
          addEl("IfcWall", wr.geomWorld, wr.color);
        }
      } else {
        addEl("IfcWall", wr.geomWorld, wr.color);
      }
    }
    if (nCut > 0) {
      log(`✂️ Boolean DIFFERENCE aplicat: ${nCut} / ${nWall} pereți tăiați cu succes.`, "ok");
    }

    // ── 10f. Rooms ────────────────────────────────────────────────────────────
    const slabOrient = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

    for (const room of roomNodes) {
      const connAxIds: string[] = [];
      for (const edge of edges) {
        if (edge.source === room.id && nodes.get(edge.target)?.type === "ax") connAxIds.push(edge.target);
        if (edge.target === room.id && nodes.get(edge.source)?.type === "ax") connAxIds.push(edge.source);
      }
      if (connAxIds.length < 3) continue;
      const pts: THREE.Vector2[] = [];
      for (const axId of connAxIds) { const pos = axPos.get(axId); if (pos) pts.push(new THREE.Vector2(pos.x, pos.z)); }
      if (pts.length < 3) continue;
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
      const cz = pts.reduce((s, q) => s + q.y, 0) / pts.length;
      pts.sort((a, b) => Math.atan2(a.y - cz, a.x - cx) - Math.atan2(b.y - cz, b.x - cx));
      const profile = pts.flatMap((q) => [q.x, -q.y, 0]);
      const rGeom = new THREE.BufferGeometry();
      try {
        geoEng.getExtrusion(rGeom, { profilePoints: profile, direction: [0, 0, 1], length: 0.12, cap: true });
        addEl("IfcSlab", rGeom, "#4b5563", slabOrient.clone());
        nRoom++;
      } catch (e) {
        log(`⚠ Camera "${room.name}": eroare geometrie — ${(e as Error).message}`, "warn");
      }
    }

    // ── 11. Commit ────────────────────────────────────────────────────────────
    if (allElements.length === 0) {
      log("⚠ Niciun element generat. Verificați GraphML și parametrii de grilă.", "warn");
      await frags.core.disposeModel(modelId);
      neModelIds.delete(nodeId);
      return;
    }
    await frags.core.editor.createElements(modelId, allElements);
    await frags.core.update(true);
    log(`✅ GraphML generat: ${nCol} coloane · ${nWall} pereți (${nCut} tăiați) · ${nBeam} grinzi · ${nWin} ferestre · ${nDoor} uși · ${nRoom} camere → "${modelId}"`, "ok");

    // ── 12. Active rules summary ──────────────────────────────────────────────
    const generatedCategories: string[] = [];
    if (nCol  > 0) generatedCategories.push("IfcColumn");
    if (nWall > 0) generatedCategories.push("IfcWall");
    if (nBeam > 0) generatedCategories.push("IfcBeam");
    if (nWin  > 0) generatedCategories.push("IfcWindow");
    if (nDoor > 0) generatedCategories.push("IfcDoor");
    if (nRoom > 0) generatedCategories.push("IfcSlab");

    const activeRules    = BooleanRulesEngine.getRules().filter((r) => r.enabled);
    const relevantRules  = activeRules.filter((r) =>
      r.subjects.some((s) => generatedCategories.includes(s)) &&
      r.cutters.some((c)  => generatedCategories.includes(c)),
    );
    if (relevantRules.length > 0) {
      log("⚡ Reguli boolean aplicate (Project Settings):", "info");
      for (const rule of relevantRules) {
        const ms = rule.subjects.filter((s) => generatedCategories.includes(s));
        const mc = rule.cutters .filter((c) => generatedCategories.includes(c));
        log(`  P=${rule.priority} │ ${ms.join(", ")} ←✂— ${mc.join(", ")}`, "info");
      }
    }
  },
});
