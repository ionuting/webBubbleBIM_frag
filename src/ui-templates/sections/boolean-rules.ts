/**
 * BooleanRulesEngine
 *
 * Registru global de reguli boolean pentru operații de tip CSG (Constructive
 * Solid Geometry) la nivelul categoriilor IFC. Regulile sunt ordonate după
 * prioritate (integer descrescător) și se aplică atât în Node Editor cât și
 * la nivel de aplicație.
 *
 * Persistență: localStorage (cheie "bim__boolean-rules-v1")
 *
 * Reguli implicite:
 *  P=100  IfcSpace               ← tăiat de IfcWall, IfcColumn, IfcBeam, IfcSlab, IfcWindow, IfcDoor
 *  P=50   IfcWall, IfcCovering   ← tăiate de IfcColumn, IfcBeam, IfcWindow, IfcDoor
 */

const STORAGE_KEY = "bim__boolean-rules-v1";

// ─── Data model ───────────────────────────────────────────────────────────────

export interface BooleanRule {
  /** Identificator unic stabil (generat la creare, nu se modifică). */
  id: string;
  /** Descriere afișată în Project Settings. */
  name: string;
  /**
   * Prioritate de procesare (integer ≥ 0).
   * Valori mai mari → regula este evaluată primă.
   * 0–9   rezervate pentru sistem; regulile utilizatorului ar trebui să folosească ≥ 10.
   */
  priority: number;
  /**
   * Categorii IFC care primesc tăierea boolean ("subiectele" golite).
   * Exemple: "IfcWall", "IfcSpace", "IfcCovering"
   */
  subjects: string[];
  /**
   * Categorii IFC care efectuează tăierea ("cuterele" / elementele-gol).
   * Exemple: "IfcColumn", "IfcBeam", "IfcWindow", "IfcDoor"
   */
  cutters: string[];
  /** Dezactivează regula temporar fără a o șterge. */
  enabled: boolean;
}

// ─── Default built-in rules ───────────────────────────────────────────────────

export const BOOLEAN_DEFAULT_RULES: BooleanRule[] = [
  {
    id: "sys-space",
    name: "IfcSpace — tăiat de orice element structural sau de închidere",
    priority: 100,
    subjects: ["IfcSpace"],
    cutters: ["IfcWall", "IfcColumn", "IfcBeam", "IfcSlab", "IfcWindow", "IfcDoor"],
    enabled: true,
  },
  {
    id: "sys-wall",
    name: "IfcWall / IfcCovering — tăiate de structural și goluri",
    priority: 50,
    subjects: ["IfcWall", "IfcCovering"],
    cutters: ["IfcColumn", "IfcBeam", "IfcWindow", "IfcDoor"],
    enabled: true,
  },
];

// ─── Known IFC categories (for autocomplete / select) ─────────────────────────

export const IFC_CATEGORIES = [
  "IfcWall",
  "IfcWallStandardCase",
  "IfcCovering",
  "IfcSlab",
  "IfcRoof",
  "IfcColumn",
  "IfcBeam",
  "IfcWindow",
  "IfcDoor",
  "IfcSpace",
  "IfcStair",
  "IfcRamp",
  "IfcFurniture",
  "IfcPlate",
  "IfcMember",
];

// ─── Engine class ─────────────────────────────────────────────────────────────

class BooleanRulesEngineClass {
  private _rules: BooleanRule[] = [];
  private readonly _listeners = new Set<() => void>();

  constructor() {
    this._loadFromStorage();
  }

  // ── Query ────────────────────────────────────────────────────────────────────

  /** Returnează toate regulile sortate descrescător după prioritate. */
  getRules(): BooleanRule[] {
    return [...this._rules].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Returnează toate categoriile cutter active pentru un subiect dat.
   * Regulile disabled sunt ignorate.
   */
  getCuttersFor(subjectCategory: string): string[] {
    const cutters = new Set<string>();
    for (const rule of this._rules) {
      if (!rule.enabled) continue;
      if (rule.subjects.includes(subjectCategory)) {
        rule.cutters.forEach((c) => cutters.add(c));
      }
    }
    return [...cutters];
  }

  /**
   * Returnează toate subiectele pe care categoria cutter le poate tăia.
   * Regulile disabled sunt ignorate.
   */
  getSubjectsFor(cutterCategory: string): string[] {
    const subjects = new Set<string>();
    for (const rule of this._rules) {
      if (!rule.enabled) continue;
      if (rule.cutters.includes(cutterCategory)) {
        rule.subjects.forEach((s) => subjects.add(s));
      }
    }
    return [...subjects];
  }

  /**
   * Verifică dacă o categorie subiect este tăiată de o categorie cutter,
   * conform regulilor active, ținând cont de prioritate.
   */
  isCutBy(subjectCategory: string, cutterCategory: string): boolean {
    for (const rule of this.getRules()) {
      if (!rule.enabled) continue;
      if (rule.subjects.includes(subjectCategory) && rule.cutters.includes(cutterCategory)) {
        return true;
      }
    }
    return false;
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  /** Adaugă o regulă nouă. Returnează regula cu id generat. */
  addRule(rule: Omit<BooleanRule, "id">): BooleanRule {
    const newRule: BooleanRule = {
      ...rule,
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this._rules.push(newRule);
    this._persist();
    this._notify();
    return newRule;
  }

  /** Actualizează câmpurile unei reguli existente după id. */
  updateRule(id: string, patch: Partial<Omit<BooleanRule, "id">>): void {
    const rule = this._rules.find((r) => r.id === id);
    if (!rule) return;
    Object.assign(rule, patch);
    this._persist();
    this._notify();
  }

  /** Șterge o regulă după id. */
  removeRule(id: string): void {
    const before = this._rules.length;
    this._rules = this._rules.filter((r) => r.id !== id);
    if (this._rules.length !== before) {
      this._persist();
      this._notify();
    }
  }

  /** Resetează la regulile built-in, ștergând orice regulă personalizată. */
  resetToDefaults(): void {
    this._rules = BOOLEAN_DEFAULT_RULES.map((r) => ({ ...r }));
    this._persist();
    this._notify();
  }

  // ── Change listeners ─────────────────────────────────────────────────────────

  /**
   * Abonează un listener la orice mutație.
   * Returnează o funcție de dezabonare.
   */
  onChanged(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._rules));
    } catch (_) {
      // storage unavailable — ignore
    }
  }

  private _loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          this._rules = parsed as BooleanRule[];
          return;
        }
      }
    } catch (_) {
      // corrupt storage — fall through to defaults
    }
    this._rules = BOOLEAN_DEFAULT_RULES.map((r) => ({ ...r }));
  }

  private _notify(): void {
    this._listeners.forEach((l) => {
      try { l(); } catch (_) { /* ignore listener errors */ }
    });
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/**
 * Instanță globală a motorului de reguli boolean.
 * Disponibilă atât în Node Editor cât și în aplicație directă.
 *
 * @example
 * // Verifică dacă IfcWall este tăiată de IfcColumn conform regulilor active
 * BooleanRulesEngine.isCutBy("IfcWall", "IfcColumn"); // → true
 *
 * // Obține toate cuterele pentru IfcWall
 * BooleanRulesEngine.getCuttersFor("IfcWall"); // → ["IfcColumn","IfcBeam","IfcWindow","IfcDoor"]
 */
export const BooleanRulesEngine = new BooleanRulesEngineClass();
