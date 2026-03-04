/**
 * BIMLibrary — registru global de preset-uri pentru nodurile din Node Editor.
 *
 * Utilizare:
 *   import { BIMLibrary } from "./bim-library";
 *   BIMLibrary.register("wall", { id: "my-wall", name: "Perete custom", value: "thickness=0.30,height=3,color=#aaa" });
 *
 * Categorii built-in: "graphml" | "storey-height" | "wall" | "column" | "beam" | "window" | "door"
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LibraryItem {
  /** Identificator unic în cadrul categoriei */
  id: string;
  /** Nume afișat în dropdown */
  name: string;
  /**
   * Valoarea efectivă stocată în params când item-ul este selectat.
   * - Pentru "graphml": cale URL ex. "/construction.graphml"
   * - Pentru "storey-height": valoare numerică ex. "3.0"
   * - Pentru "wall"|"column"|"beam"|"window"|"door": pereche key=val separate prin virgulă
   *   ex. "thickness=0.25,height=3,color=#d4a96a"
   */
  value: string;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

class BIMLibraryClass {
  private readonly _items = new Map<string, LibraryItem[]>();

  /**
   * Înregistrează (sau suprascrie) un item într-o categorie.
   * Apelează înainte de `mountNodalGraphPanel()` pentru a apărea imediat în dropdown-uri.
   */
  register(category: string, item: LibraryItem): void {
    if (!this._items.has(category)) this._items.set(category, []);
    const list = this._items.get(category)!;
    const idx = list.findIndex((i) => i.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.push(item);
  }

  /** Șterge un item dintr-o categorie după id. */
  unregister(category: string, id: string): void {
    const list = this._items.get(category);
    if (list) {
      const idx = list.findIndex((i) => i.id === id);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  /** Returnează toate item-urile dintr-o categorie (copie), sau [] dacă nu există. */
  getByCategory(category: string): LibraryItem[] {
    return [...(this._items.get(category) ?? [])];
  }

  /** Returnează un item după id. */
  getById(category: string, id: string): LibraryItem | undefined {
    return this._items.get(category)?.find((i) => i.id === id);
  }

  /** Returnează un item a cărui `value` se potrivește exact. */
  findByValue(category: string, value: string): LibraryItem | undefined {
    return this._items.get(category)?.find((i) => i.value === value);
  }

  /** Lista tuturor categoriilor înregistrate. */
  getCategories(): string[] {
    return [...this._items.keys()];
  }
}

/**
 * Instanță globală a registrului de obiecte BIM.
 * Registrați tipuri custom înainte de `mountNodalGraphPanel()`.
 */
export const BIMLibrary = new BIMLibraryClass();

// ─── Default library items ─────────────────────────────────────────────────────

// GraphML fișiere
BIMLibrary.register("graphml", { id: "construction", name: "construction.graphml", value: "/construction.graphml" });

// Înălțimi etaj
BIMLibrary.register("storey-height", { id: "h25", name: "2.5 m", value: "2.5" });
BIMLibrary.register("storey-height", { id: "h28", name: "2.8 m", value: "2.8" });
BIMLibrary.register("storey-height", { id: "h30", name: "3.0 m", value: "3.0" });
BIMLibrary.register("storey-height", { id: "h32", name: "3.2 m", value: "3.2" });
BIMLibrary.register("storey-height", { id: "h36", name: "3.6 m", value: "3.6" });
BIMLibrary.register("storey-height", { id: "h40", name: "4.0 m", value: "4.0" });

// Pereți (thickness=T,height=H,color=C)
BIMLibrary.register("wall", { id: "beton-20", name: "Beton 20 cm", value: "thickness=0.20,height=3,color=#d4a96a" });
BIMLibrary.register("wall", { id: "beton-25", name: "Beton 25 cm", value: "thickness=0.25,height=3,color=#c8a060" });
BIMLibrary.register("wall", { id: "beton-30", name: "Beton 30 cm", value: "thickness=0.30,height=3,color=#bc9555" });
BIMLibrary.register("wall", { id: "caramida-25", name: "Cărămidă 25 cm", value: "thickness=0.25,height=3,color=#c87941" });
BIMLibrary.register("wall", { id: "caramida-375", name: "Cărămidă 37.5 cm (exterior)", value: "thickness=0.375,height=3,color=#b96c35" });
BIMLibrary.register("wall", { id: "gips-10", name: "Gips-carton 10 cm", value: "thickness=0.10,height=3,color=#e0d8c8" });
BIMLibrary.register("wall", { id: "gips-12", name: "Gips-carton 12.5 cm", value: "thickness=0.125,height=3,color=#ddd4c0" });
BIMLibrary.register("wall", { id: "exterior-beton", name: "Exterior beton+izol. 40 cm", value: "thickness=0.40,height=3,color=#a08060" });

// Coloane (width=W,depth=D,color=C)
BIMLibrary.register("column", { id: "c25x25", name: "C25×25 cm", value: "width=0.25,depth=0.25,color=#7dd3fc" });
BIMLibrary.register("column", { id: "c30x30", name: "C30×30 cm", value: "width=0.30,depth=0.30,color=#7dd3fc" });
BIMLibrary.register("column", { id: "c35x35", name: "C35×35 cm", value: "width=0.35,depth=0.35,color=#60bef0" });
BIMLibrary.register("column", { id: "c40x40", name: "C40×40 cm", value: "width=0.40,depth=0.40,color=#5ab0e8" });
BIMLibrary.register("column", { id: "c30x60", name: "C30×60 cm (panou)", value: "width=0.30,depth=0.60,color=#4aa0e0" });
BIMLibrary.register("column", { id: "c50x50", name: "C50×50 cm", value: "width=0.50,depth=0.50,color=#4090d8" });

// Grinzi (width=W,depth=D,color=C)
BIMLibrary.register("beam", { id: "g25x25", name: "G25×25 cm", value: "width=0.25,depth=0.25,color=#b07010" });
BIMLibrary.register("beam", { id: "g25x40", name: "G25×40 cm", value: "width=0.25,depth=0.40,color=#a06010" });
BIMLibrary.register("beam", { id: "g25x50", name: "G25×50 cm", value: "width=0.25,depth=0.50,color=#a16207" });
BIMLibrary.register("beam", { id: "g30x50", name: "G30×50 cm", value: "width=0.30,depth=0.50,color=#8c5205" });
BIMLibrary.register("beam", { id: "g30x60", name: "G30×60 cm", value: "width=0.30,depth=0.60,color=#7a4800" });

// Ferestre (width=W,height=H,sill_height=S,color=C)
BIMLibrary.register("window", { id: "wd90x90", name: "90×90 cm", value: "width=0.90,height=0.90,sill_height=1.00,color=#93c5fd" });
BIMLibrary.register("window", { id: "wd90x120", name: "90×120 cm", value: "width=0.90,height=1.20,sill_height=0.90,color=#93c5fd" });
BIMLibrary.register("window", { id: "wd120x120", name: "120×120 cm", value: "width=1.20,height=1.20,sill_height=0.90,color=#93c5fd" });
BIMLibrary.register("window", { id: "wd150x120", name: "150×120 cm", value: "width=1.50,height=1.20,sill_height=0.90,color=#7bc0fb" });
BIMLibrary.register("window", { id: "wd180x90", name: "180×90 cm (vitrină)", value: "width=1.80,height=0.90,sill_height=0.45,color=#bdd8fd" });
BIMLibrary.register("window", { id: "wd200x140", name: "200×140 cm", value: "width=2.00,height=1.40,sill_height=0.80,color=#6bb0f8" });

// Uși (width=W,height=H,color=C)
BIMLibrary.register("door", { id: "d80x210", name: "80×210 cm", value: "width=0.80,height=2.10,color=#86efac" });
BIMLibrary.register("door", { id: "d90x210", name: "90×210 cm", value: "width=0.90,height=2.10,color=#86efac" });
BIMLibrary.register("door", { id: "d100x210", name: "100×210 cm (intrare)", value: "width=1.00,height=2.10,color=#6de898" });
BIMLibrary.register("door", { id: "d120x210", name: "120×210 cm (dublă)", value: "width=1.20,height=2.10,color=#5ddb8b" });
BIMLibrary.register("door", { id: "d90x220", name: "90×220 cm", value: "width=0.90,height=2.20,color=#86efac" });
