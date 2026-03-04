# Custom Node Plugins — Ghid de utilizare

Sistemul de node editor suportă extinderea cu noduri personalizate prin intermediul unui registru de plugin-uri. Poți adăuga orice tip de nod fără să modifici codul intern al editorului.

---

## Cuprins

1. [Concepte de bază](#1-concepte-de-baz%C4%83)
2. [Structura unui plugin](#2-structura-unui-plugin)
3. [Înregistrarea unui nod nou](#3-%C3%AEnregistrarea-unui-nod-nou)
4. [Contextul de execuție (NodeExecContext)](#4-contextul-de-execu%C8%9Bie-nodeexeccontext)
5. [Tipuri de porturi](#5-tipuri-de-porturi)
6. [Parametri configurabili](#6-parametri-configurabili)
7. [Exemple complete](#7-exemple-complete)
8. [Organizarea în fișiere separate](#8-organizarea-%C3%AEn-fi%C8%99iere-separate)
9. [FAQ & cazuri speciale](#9-faq--cazuri-speciale)

---

## 1. Concepte de bază

Fiecare nod din editor are:
- un **tip** (`type`) — string unic, identificatorul intern
- o **definiție vizuală** (`NodePluginDef`) — culoare, icon, porturi, parametri
- o **funcție de execuție** (`execute`) — rulează când graful este executat

Nodurile comunică prin **porturi**:
- **Input** — preia date de la noduri conectate upstream
- **Output** — expune date pentru noduri downstream
- **Params** — câmpuri text editabile direct în UI-ul nodului

---

## 2. Structura unui plugin

Un plugin este un obiect cu două câmpuri:

```typescript
import type { NodePlugin } from "./src/ui-templates/sections/node-registry";

const myPlugin: NodePlugin = {
  def: {
    type: "my-node",          // identificator unic, folosit și la serializare
    label: "My Node",         // textul afișat pe nod și în paletă
    color: "#7c3aed",         // culoarea header-ului (CSS color string)
    icon: "⚡",               // emoji sau simbol afișat în paletă și pe nod
    category: "My Category",  // grupul din paletă (string liber)

    inputs: [
      { id: "items", label: "Items" },
    ],
    outputs: [
      { id: "result", label: "Result" },
    ],
    params: [
      {
        id: "threshold",
        label: "Threshold",
        placeholder: "10",
        defaultValue: "10",
        type: "text",   // "text" (default) sau "textarea" pentru blocuri mari
      },
    ],
    isSink: false,  // true = nod fără output, re-executat la fiecare run
  },

  execute: async (ctx) => {
    const threshold = parseInt(ctx.node.params["threshold"] ?? "10", 10);
    const items = ctx.getInput(ctx.nodeId, "items");
    ctx.log(`threshold = ${threshold}`, "info");
    ctx.out.set("result", items);
  },
};
```

### Câmpuri `NodePluginDef`

| Câmp | Tip | Obligatoriu | Descriere |
|------|-----|-------------|-----------|
| `type` | `string` | ✅ | ID unic; folosit la serializare/deserializare grafuri |
| `label` | `string` | ✅ | Afișat pe nod și în paletă |
| `color` | `string` | ✅ | Orice culoare CSS (`#hex`, `rgb()`, `hsl()`) |
| `icon` | `string` | ✅ | Emoji sau text scurt (1–2 caractere) |
| `category` | `string` | ✅ | Grupul din paletă; noduri cu același string sunt colapsate împreună |
| `inputs` | `Array<{id, label}>` | ✅ | Porturile de intrare (poate fi `[]`) |
| `outputs` | `Array<{id, label}>` | ✅ | Porturile de ieșire (poate fi `[]`) |
| `params` | `Array<{...}>` | ✅ | Parametri editabili în UI (poate fi `[]`) |
| `isSink` | `boolean` | ❌ | `true` forțează re-execuția la fiecare run |

---

## 3. Înregistrarea unui nod nou

### Pasul 1 — Importă `NodeRegistry` în `main.ts`

```typescript
// src/main.ts
import { NodeRegistry } from "./ui-templates";
```

### Pasul 2 — Apelează `register()` ÎNAINTE de `mountNodalGraphPanel()`

```typescript
// src/main.ts
NodeRegistry.register(myPlugin);

// abia DUPĂ register(), montezi editorul:
mountNodalGraphPanel(components);
```

> ⚠️ Dacă înregistrezi după ce editorul e montat, nodul NU va apărea în paletă decât după reload.

### Pasul 3 — Verifică că nodul apare în paletă

Deschide Node Editor → caută categoria specificată → nodul tău apare în lista colapsabilă.

---

## 4. Contextul de execuție (`NodeExecContext`)

Funcția `execute` primește un obiect `ctx` cu toate utilitarele necesare:

```typescript
interface NodeExecContext {
  node: {
    id: string;
    type: string;
    x: number;
    y: number;
    params: Record<string, string>;  // valorile parametrilor editați de user
  };
  nodeId: string;               // alias pentru node.id
  components: OBC.Components;   // instanța principală a aplicației

  out: Map<string, any>;        // scrie output-urile aici

  getInput(nodeId, portId): Record<string, Set<number>> | null;
  //   Citește un ModelIdMap (model → Set<expressID>) de pe un port de intrare.
  //   Combină automat toate conexiunile upstream. Returnează null dacă nimic conectat.

  getRawInput(nodeId, portId): any | null;
  //   Valoarea brută de pe prima conexiune a unui port (pentru date non-IFC).

  getRawInputAll(nodeId, portId): any[];
  //   Toate valorile brute de pe toate conexiunile unui port, aplatizate.

  log(msg, level?): void;
  //   Scrie în consola editorului.
  //   level: "info" | "ok" | "warn" | "error"  (default "info")

  neModelIds: Map<string, string>;
  //   nodeId → Fragments modelId. Folosit pentru a gestiona modele create de nod.
  //   La re-run, dispune modelul vechi înainte de a crea unul nou.

  getGeoEngine(): Promise<GeometryEngine>;
  //   Returnează instanța singleton GeometryEngine (web-ifc).
  //   Prima apelare inițializează WASM; apelările ulterioare returnează cache-ul.
}
```

### Exemple de utilizare a `ctx`

```typescript
// Citire parametru
const name = ctx.node.params["name"] ?? "default";

// Citire date IFC de pe portul "items"
const items = ctx.getInput(ctx.nodeId, "items");
// items: { "model-uuid": Set<123, 456, ...>, ... } | null

// Scriere output
ctx.out.set("result", items);

// Log în consolă
ctx.log("Operație completă", "ok");
ctx.log(`Eroare: ${e.message}`, "error");

// Acces la orice serviciu ThatOpen
const fragments = ctx.components.get(OBC.FragmentsManager);

// GeometryEngine pentru geometrie procedurală
const geoEng = await ctx.getGeoEngine();
const geom = new THREE.BufferGeometry();
geoEng.getExtrusion(geom, { profilePoints: [...], direction: [0,0,1], length: 3, cap: true });
```

---

## 5. Tipuri de porturi

### Porturi IFC (`ModelIdMap`)

Tipul standard pentru fluxul de elemente IFC este `Record<string, Set<number>>`:

```typescript
// Exemplu de ModelIdMap returnat de noduri "Query":
{
  "urn:fragments:model-abc": Set { 123, 456, 789 },
  "urn:fragments:model-xyz": Set { 101, 202 },
}
```

Folosește `getInput()` pentru a citi și `out.set()` pentru a expune.

### Porturi de date generice

Pentru valori non-IFC (numere, șiruri, matrice de puncte etc.) folosește `getRawInput()` / `getRawInputAll()` și transmite orice valoare prin `out.set()`.

---

## 6. Parametri configurabili

```typescript
params: [
  // Câmp text simplu (default)
  { id: "height", label: "Height (m)", placeholder: "3.0", defaultValue: "3.0" },

  // Câmp text multi-linie (util pentru JSON sau liste)
  { id: "points", label: "Profile Points (JSON)", placeholder: "[[0,0],[1,0],...]", type: "textarea" },
]
```

La execuție, valoarea curentă este în `ctx.node.params["height"]` (string). Convertește manual la `number` / `JSON.parse` etc.

---

## 7. Exemple complete

### Exemplu 1 — Nod de filtrare personalizată

Filtrează elementele IFC după un atribut arbitrar:

```typescript
// src/bim-components/CustomComponent/plugins/filter-by-volume.ts

import type { NodePlugin } from "../../../ui-templates";
import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";

export const filterByVolumePlugin: NodePlugin = {
  def: {
    type: "filter-by-volume",
    label: "Filter by Volume",
    color: "#0369a1",
    icon: "📦",
    category: "My Filters",
    inputs: [{ id: "items", label: "Items" }],
    outputs: [{ id: "result", label: "Filtered" }],
    params: [
      { id: "minVol", label: "Min Volume (m³)", placeholder: "1.0", defaultValue: "1.0" },
    ],
  },
  execute: async (ctx) => {
    const items = ctx.getInput(ctx.nodeId, "items");
    if (!items) { ctx.log("Fără input", "warn"); return; }

    const minVol = parseFloat(ctx.node.params["minVol"] ?? "1.0");
    const fragments = ctx.components.get(OBC.FragmentsManager);

    const result: Record<string, Set<number>> = {};

    for (const [modelId, ids] of Object.entries(items)) {
      const model = fragments.list.get(modelId);
      if (!model) continue;

      for (const id of ids) {
        // logică personalizată de filtrare
        result[modelId] ??= new Set();
        result[modelId].add(id);
      }
    }

    ctx.out.set("result", result);
    ctx.log(`Filtrat: ${Object.values(result).reduce((a, s) => a + s.size, 0)} elemente`, "ok");
  },
};
```

### Exemplu 2 — Nod sink (fără output)

Un nod de export care nu transmite date mai departe:

```typescript
export const exportToCsvPlugin: NodePlugin = {
  def: {
    type: "export-csv",
    label: "Export CSV",
    color: "#15803d",
    icon: "📄",
    category: "Export",
    inputs: [{ id: "items", label: "Items" }],
    outputs: [],
    params: [
      { id: "filename", label: "File Name", placeholder: "export.csv", defaultValue: "export.csv" },
    ],
    isSink: true,  // re-executat la fiecare Run
  },
  execute: async (ctx) => {
    const items = ctx.getInput(ctx.nodeId, "items");
    if (!items) { ctx.log("Fără date de exportat", "warn"); return; }

    const filename = ctx.node.params["filename"] ?? "export.csv";
    const rows = ["Model,ExpressID"];

    for (const [modelId, ids] of Object.entries(items)) {
      for (const id of ids) {
        rows.push(`${modelId},${id}`);
      }
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();

    ctx.log(`Exportat ${rows.length - 1} rânduri → ${filename}`, "ok");
  },
};
```

### Exemplu 3 — Nod cu geometrie procedurală

```typescript
import * as THREE from "three";

export const extrudedShapePlugin: NodePlugin = {
  def: {
    type: "extruded-shape",
    label: "Extruded Shape",
    color: "#b45309",
    icon: "🧱",
    category: "Geometry Tools",
    inputs: [],
    outputs: [{ id: "geom", label: "Geometry" }],
    params: [
      { id: "width",  label: "Width (m)",  placeholder: "2", defaultValue: "2" },
      { id: "depth",  label: "Depth (m)",  placeholder: "2", defaultValue: "2" },
      { id: "height", label: "Height (m)", placeholder: "3", defaultValue: "3" },
    ],
  },
  execute: async (ctx) => {
    const w = parseFloat(ctx.node.params["width"]  ?? "2");
    const d = parseFloat(ctx.node.params["depth"]  ?? "2");
    const h = parseFloat(ctx.node.params["height"] ?? "3");

    const geoEng = await ctx.getGeoEngine();
    const geom = new THREE.BufferGeometry();

    // Profil în planul XY, direcție Z, apoi se rotește după nevoie
    const half_w = w / 2, half_d = d / 2;
    geoEng.getExtrusion(geom, {
      profilePoints: [
        -half_w, -half_d, 0,
         half_w, -half_d, 0,
         half_w,  half_d, 0,
        -half_w,  half_d, 0,
      ],
      direction: [0, 0, 1],
      length: h,
      cap: true,
    });

    ctx.out.set("geom", geom);
    ctx.log(`Geometrie creată: ${w}×${d}×${h} m`, "ok");
  },
};
```

---

## 8. Organizarea în fișiere separate

Recomandare de structură de fișiere:

```
src/
  bim-components/
    CustomComponent/
      plugins/
        filter-by-volume.ts    ← câte un fișier per plugin
        export-csv.ts
        extruded-shape.ts
        index.ts               ← re-exportă toate plugin-urile
  main.ts                      ← înregistrează plugin-urile
```

**`src/bim-components/CustomComponent/plugins/index.ts`**:
```typescript
export { filterByVolumePlugin } from "./filter-by-volume";
export { exportToCsvPlugin }    from "./export-csv";
export { extrudedShapePlugin }  from "./extruded-shape";
```

**`src/main.ts`**:
```typescript
import { NodeRegistry } from "./ui-templates";
import {
  filterByVolumePlugin,
  exportToCsvPlugin,
  extrudedShapePlugin,
} from "./bim-components/CustomComponent/plugins";

// ÎNAINTE de mountNodalGraphPanel()
NodeRegistry.register(filterByVolumePlugin);
NodeRegistry.register(exportToCsvPlugin);
NodeRegistry.register(extrudedShapePlugin);

// ... restul inițializării
mountNodalGraphPanel(components);
```

---

## 9. FAQ & cazuri speciale

### Pot suprascrie un nod built-in?

Nu direct — nodurile built-in sunt definite static în `nodal-graph.ts`. Poți totuși să înregistrezi un plugin cu același `type` string: va apărea un warning în consolă și va folosi versiunea ta **în palette și la execuție** (deoarece `getTypeDef()` caută mai întâi în built-ins; pentru suprascrierea completă trebuie modificat sursa).

### De ce nodul meu nu apare în paletă?

- Verifică că `NodeRegistry.register()` este apelat **înainte** de `mountNodalGraphPanel()`
- Verifică că `type` este un string non-gol și unic

### Cum salvez starea unui nod între execuții?

Folosește `ctx.neModelIds` pentru resurse Fragments (modele IFC create de nod). Pentru alte date, poți folosi un `Map` extern declarat în modulul plugin-ului (variabilă modul).

### Pot folosi `async/await` și fetch în execute?

Da, `execute` este `async`. Poți face orice operație asincronă.

### `getInput` vs `getRawInput` — când folosesc ce?

- `getInput` — când aștepți **elemente IFC** (`Record<string, Set<number>>`); merge automat cu multiple upstream
- `getRawInput` — când aștepți **orice altceva** (număr, string, geometrie THREE.js, array de puncte etc.)

### Cum testez un nod fără UI?

```typescript
import { NodeRegistry } from "./src/ui-templates";
import { myPlugin } from "./my-plugin";

NodeRegistry.register(myPlugin);

const plugin = NodeRegistry.getPlugin("my-node")!;
const out = new Map<string, any>();

await plugin.execute({
  node: { id: "test-1", type: "my-node", x: 0, y: 0, params: { threshold: "5" } },
  nodeId: "test-1",
  components: mockComponents,
  out,
  getInput: () => null,
  getRawInput: () => null,
  getRawInputAll: () => [],
  log: console.log,
  neModelIds: new Map(),
  getGeoEngine: async () => mockGeoEngine,
});

console.log(out.get("result"));
```
