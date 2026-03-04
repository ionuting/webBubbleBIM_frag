/**
 * Project Settings — panou flotant de configurare globală a proiectului.
 *
 * Conține:
 *  • Secțiunea "Relații Boolean" — configurare BooleanRulesEngine (prioritate,
 *    subiecți, cutere, activat/dezactivat)
 *
 * Montare: apelați `mountProjectSettingsPanel()` din main.ts o singură dată.
 * Toggle: folosiți funcția returnată sau `setProjectSettingsToggle()`.
 */

import { BooleanRulesEngine, IFC_CATEGORIES, type BooleanRule } from "./boolean-rules";

// ─── Toggle wiring (similar cu nodal-graph) ───────────────────────────────────

let _togglePS: (() => void) | null = null;
export const setProjectSettingsToggle = (fn: () => void): void => {
  _togglePS = fn;
};
export const toggleProjectSettings = (): void => _togglePS?.();

// ─── CSS ──────────────────────────────────────────────────────────────────────

const PS_CSS = `
/* ── Project Settings overlay ─────────────────────────────── */
#ps-portal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9500;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(2px);
}

.ps-dialog {
  background: var(--bim-ui_bg-base, #1a1d23);
  border: 1px solid var(--bim-ui_bg-contrast-40, #3a3d47);
  border-radius: 0.75rem;
  box-shadow: 0 12px 48px rgba(0,0,0,0.75);
  width: min(820px, 92vw);
  max-height: 88vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--bim-ui_bg-contrast-100, #e8eaed);
  font-family: sans-serif;
  font-size: 0.87rem;
}

.ps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  background: var(--bim-ui_bg-contrast-5, #22252d);
  border-bottom: 1px solid var(--bim-ui_bg-contrast-20, #2e3138);
  flex-shrink: 0;
}

.ps-header-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: 0.01em;
}

.ps-close {
  background: none;
  border: none;
  color: var(--bim-ui_bg-contrast-60, #8b909a);
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0.25rem 0.4rem;
  border-radius: 0.375rem;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.ps-close:hover { background: var(--bim-ui_bg-contrast-10, #282b33); color: #fff; }

.ps-body {
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Section ─────────────────────────────────────────────── */
.ps-section {
  border: 1px solid var(--bim-ui_bg-contrast-20, #2e3138);
  border-radius: 0.5rem;
  overflow: hidden;
}

.ps-section-header {
  background: var(--bim-ui_bg-contrast-5, #22252d);
  padding: 0.625rem 1rem;
  font-weight: 600;
  font-size: 0.92rem;
  border-bottom: 1px solid var(--bim-ui_bg-contrast-20, #2e3138);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.ps-section-body {
  padding: 0.875rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ps-desc {
  color: var(--bim-ui_bg-contrast-60, #8b909a);
  font-size: 0.82rem;
  line-height: 1.55;
  margin-bottom: 0.25rem;
}

/* ── Rules table ─────────────────────────────────────────── */
.ps-rules-header, .ps-rule-row {
  display: grid;
  grid-template-columns: 4rem 1fr 1fr 1fr 5rem 2.75rem;
  gap: 0.5rem;
  align-items: center;
}

.ps-rules-header {
  padding: 0.35rem 0.5rem;
  background: var(--bim-ui_bg-contrast-10, #282b33);
  border-radius: 0.375rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--bim-ui_bg-contrast-60, #8b909a);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ps-rule-row {
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--bim-ui_bg-contrast-20, #2e3138);
  border-radius: 0.375rem;
  background: var(--bim-ui_bg-contrast-5, #22252d);
  transition: background 0.12s;
}
.ps-rule-row:hover { background: var(--bim-ui_bg-contrast-10, #282b33); }
.ps-rule-row.disabled { opacity: 0.52; }

/* ── Controls inside rows ────────────────────────────────── */
.ps-num {
  width: 100%;
  background: var(--bim-ui_bg-base, #1a1d23);
  border: 1px solid var(--bim-ui_bg-contrast-30, #363a44);
  border-radius: 0.3rem;
  color: var(--bim-ui_bg-contrast-100, #e8eaed);
  font-size: 0.85rem;
  padding: 0.3rem 0.4rem;
  text-align: center;
  -moz-appearance: textfield;
}
.ps-num::-webkit-outer-spin-button,
.ps-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.ps-num:focus { outline: 2px solid #4f9cf9; outline-offset: -1px; }

.ps-tag-input {
  width: 100%;
  background: var(--bim-ui_bg-base, #1a1d23);
  border: 1px solid var(--bim-ui_bg-contrast-30, #363a44);
  border-radius: 0.3rem;
  color: var(--bim-ui_bg-contrast-100, #e8eaed);
  font-size: 0.8rem;
  padding: 0.3rem 0.4rem;
  font-family: monospace;
  resize: none;
  min-height: 2.2rem;
}
.ps-tag-input:focus { outline: 2px solid #4f9cf9; outline-offset: -1px; }

.ps-name-input {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--bim-ui_bg-contrast-20, #2e3138);
  color: var(--bim-ui_bg-contrast-100, #e8eaed);
  font-size: 0.83rem;
  padding: 0.2rem 0;
}
.ps-name-input:focus { outline: none; border-bottom-color: #4f9cf9; }

/* enable/disable toggle */
.ps-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
}
.ps-toggle input[type=checkbox] {
  width: 1rem;
  height: 1rem;
  accent-color: #4f9cf9;
  cursor: pointer;
}

.ps-btn {
  background: var(--bim-ui_bg-contrast-10, #282b33);
  border: 1px solid var(--bim-ui_bg-contrast-30, #363a44);
  border-radius: 0.375rem;
  color: var(--bim-ui_bg-contrast-80, #c5c8d0);
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0.35rem 0.75rem;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s;
}
.ps-btn:hover { background: var(--bim-ui_bg-contrast-20, #2e3138); border-color: #4f9cf9; color: #fff; }
.ps-btn.danger:hover { border-color: #f87171; color: #f87171; }
.ps-btn.primary { background: #1e3a6e; border-color: #4f9cf9; color: #93c5fd; }
.ps-btn.primary:hover { background: #2a4d8f; }
.ps-btn-icon {
  background: none;
  border: none;
  color: var(--bim-ui_bg-contrast-50, #72788a);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem;
  border-radius: 0.3rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}
.ps-btn-icon:hover { background: rgba(248,113,113,0.12); color: #f87171; }

.ps-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* ── Tag pills ───────────────────────────────────────────── */
.ps-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.ps-pill {
  background: var(--bim-ui_bg-contrast-10, #282b33);
  border: 1px solid var(--bim-ui_bg-contrast-30, #363a44);
  border-radius: 9999px;
  padding: 0.1rem 0.45rem;
  font-size: 0.74rem;
  color: var(--bim-ui_bg-contrast-80, #c5c8d0);
}
.ps-pill.cutter { border-color: #f97316; color: #fdba74; }
.ps-pill.subject { border-color: #4f9cf9; color: #93c5fd; }
`;

// ─── Category helpers ─────────────────────────────────────────────────────────

const parseCategories = (raw: string): string[] =>
  raw.split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const joinCategories = (arr: string[]): string => arr.join(", ");

// ─── Build rule row DOM ───────────────────────────────────────────────────────

function buildRuleRow(rule: BooleanRule, onChange: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = `ps-rule-row${rule.enabled ? "" : " disabled"}`;
  row.dataset.ruleId = rule.id;

  // Priority
  const prioWrap = document.createElement("div");
  const prioIn = document.createElement("input");
  prioIn.type = "number";
  prioIn.className = "ps-num";
  prioIn.value = String(rule.priority);
  prioIn.min = "0";
  prioIn.max = "9999";
  prioIn.title = "Prioritate (integer): valori mai mari = procesare primă";
  prioIn.addEventListener("change", () => {
    const v = parseInt(prioIn.value, 10);
    if (!isNaN(v)) BooleanRulesEngine.updateRule(rule.id, { priority: Math.max(0, v) });
  });
  prioWrap.appendChild(prioIn);

  // Name
  const nameWrap = document.createElement("div");
  const nameIn = document.createElement("input");
  nameIn.type = "text";
  nameIn.className = "ps-name-input";
  nameIn.value = rule.name;
  nameIn.placeholder = "Descriere regulă…";
  nameIn.title = "Descriere/nume regulă";
  nameIn.addEventListener("change", () => {
    BooleanRulesEngine.updateRule(rule.id, { name: nameIn.value });
  });
  nameWrap.appendChild(nameIn);

  // Subjects
  const subjWrap = document.createElement("div");
  const subjIn = document.createElement("textarea");
  subjIn.className = "ps-tag-input";
  subjIn.value = joinCategories(rule.subjects);
  subjIn.rows = 1;
  subjIn.placeholder = "IfcWall, IfcCovering";
  subjIn.title = "Categorii IFC care sunt TĂIATE (subiecți) — separate prin virgulă";
  subjIn.addEventListener("change", () => {
    BooleanRulesEngine.updateRule(rule.id, { subjects: parseCategories(subjIn.value) });
  });
  subjWrap.appendChild(subjIn);

  // Cutters
  const cutWrap = document.createElement("div");
  const cutIn = document.createElement("textarea");
  cutIn.className = "ps-tag-input";
  cutIn.value = joinCategories(rule.cutters);
  cutIn.rows = 1;
  cutIn.placeholder = "IfcColumn, IfcBeam";
  cutIn.title = "Categorii IFC care TAIE (cutere) — separate prin virgulă";
  cutIn.addEventListener("change", () => {
    BooleanRulesEngine.updateRule(rule.id, { cutters: parseCategories(cutIn.value) });
  });
  cutWrap.appendChild(cutIn);

  // Enabled toggle + label
  const toggleWrap = document.createElement("div");
  toggleWrap.className = "ps-toggle";
  const enabledCb = document.createElement("input");
  enabledCb.type = "checkbox";
  enabledCb.checked = rule.enabled;
  enabledCb.title = "Activează / dezactivează regula";
  enabledCb.addEventListener("change", () => {
    BooleanRulesEngine.updateRule(rule.id, { enabled: enabledCb.checked });
    row.className = `ps-rule-row${enabledCb.checked ? "" : " disabled"}`;
  });
  const enabledLbl = document.createElement("span");
  enabledLbl.style.cssText = "font-size:0.78rem;color:var(--bim-ui_bg-contrast-60,#8b909a)";
  enabledLbl.textContent = rule.enabled ? "Activ" : "Inactiv";
  enabledCb.addEventListener("change", () => {
    enabledLbl.textContent = enabledCb.checked ? "Activ" : "Inactiv";
  });
  toggleWrap.append(enabledCb, enabledLbl);

  // Remove button
  const removeWrap = document.createElement("div");
  removeWrap.style.display = "flex";
  removeWrap.style.justifyContent = "center";
  const removeBtn = document.createElement("button");
  removeBtn.className = "ps-btn-icon";
  removeBtn.title = "Șterge regula";
  removeBtn.innerHTML = "🗑";
  removeBtn.addEventListener("click", () => {
    BooleanRulesEngine.removeRule(rule.id);
    onChange();
  });
  removeWrap.appendChild(removeBtn);

  row.append(prioWrap, nameWrap, subjWrap, cutWrap, toggleWrap, removeWrap);
  return row;
}

// ─── Build full panel DOM ─────────────────────────────────────────────────────

function buildProjectSettingsPanel(onClose: () => void): HTMLElement {
  const dialog = document.createElement("div");
  dialog.className = "ps-dialog";

  // Header
  const header = document.createElement("div");
  header.className = "ps-header";

  const titleEl = document.createElement("div");
  titleEl.className = "ps-header-title";
  titleEl.innerHTML = `<span style="font-size:1.15rem">⚙️</span> Project Settings`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "ps-close";
  closeBtn.innerHTML = "✕";
  closeBtn.title = "Închide";
  closeBtn.addEventListener("click", onClose);

  header.append(titleEl, closeBtn);

  // Body
  const body = document.createElement("div");
  body.className = "ps-body";

  // ── Boolean Relations section ────────────────────────────────────────────────
  const boolSection = document.createElement("div");
  boolSection.className = "ps-section";

  const sectHdr = document.createElement("div");
  sectHdr.className = "ps-section-header";
  sectHdr.innerHTML = `<span>⚡</span> Relații Boolean`;

  const sectBody = document.createElement("div");
  sectBody.className = "ps-section-body";

  const desc = document.createElement("p");
  desc.className = "ps-desc";
  desc.innerHTML = `
    Regulile controlează care categorii IFC sunt <strong>tăiate boolean</strong> de alte categorii.
    Câmpul <em>Prioritate</em> (integer) determină ordinea de procesare — valori mai mari sunt evaluate mai întâi.
    Categoriile trebuie scrise exact ca în IFC (ex. <code style="font-size:0.8rem;color:#93c5fd">IfcWall</code>,
    <code style="font-size:0.8rem;color:#fdba74">IfcColumn</code>), separate prin virgulă.
  `;

  // Table header
  const tblHdr = document.createElement("div");
  tblHdr.className = "ps-rules-header";
  tblHdr.innerHTML = `
    <span title="Prioritate integer (crescând = evaluat primul)">Prioritate</span>
    <span>Descriere</span>
    <span title="Categorii IFC tăiate">Subiecți (tăiați)</span>
    <span title="Categorii IFC care taie">Cutere (taie)</span>
    <span>Stare</span>
    <span></span>
  `;

  // Rows container
  const rowsContainer = document.createElement("div");
  rowsContainer.id = "ps-rule-rows";
  rowsContainer.style.display = "flex";
  rowsContainer.style.flexDirection = "column";
  rowsContainer.style.gap = "0.4rem";

  const rebuildRows = () => {
    rowsContainer.innerHTML = "";
    const rules = BooleanRulesEngine.getRules();
    if (rules.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:1.5rem;text-align:center;color:var(--bim-ui_bg-contrast-40,#555a66)";
      empty.textContent = "Nu există reguli. Adăugați o regulă sau resetați la implicite.";
      rowsContainer.appendChild(empty);
    } else {
      for (const rule of rules) {
        rowsContainer.appendChild(buildRuleRow(rule, rebuildRows));
      }
    }
  };

  rebuildRows();

  // Actions
  const actions = document.createElement("div");
  actions.className = "ps-actions";

  const addBtn = document.createElement("button");
  addBtn.className = "ps-btn primary";
  addBtn.innerHTML = "＋ Adaugă regulă";
  addBtn.addEventListener("click", () => {
    BooleanRulesEngine.addRule({
      name: "Regulă nouă",
      priority: 10,
      subjects: ["IfcWall"],
      cutters: ["IfcColumn"],
      enabled: true,
    });
    rebuildRows();
  });

  const resetBtn = document.createElement("button");
  resetBtn.className = "ps-btn";
  resetBtn.innerHTML = "↩ Reset la implicite";
  resetBtn.title = "Șterge toate regulile și revine la cele built-in";
  resetBtn.addEventListener("click", () => {
    if (confirm("Resetezi toate regulile la implicite? Regulile personalizate vor fi șterse.")) {
      BooleanRulesEngine.resetToDefaults();
      rebuildRows();
    }
  });

  actions.append(addBtn, resetBtn);

  // ── Quick reference ───────────────────────────────────────────────────────────
  const refSection = document.createElement("details");
  refSection.style.cssText =
    "color:var(--bim-ui_bg-contrast-60,#8b909a);font-size:0.8rem;border-top:1px solid var(--bim-ui_bg-contrast-20,#2e3138);padding-top:0.5rem;";
  const refSum = document.createElement("summary");
  refSum.textContent = "📋 Categorii IFC comune";
  refSum.style.cursor = "pointer";
  const refBody = document.createElement("div");
  refBody.style.cssText = "margin-top:0.5rem;display:flex;flex-wrap:wrap;gap:0.25rem;";
  for (const cat of IFC_CATEGORIES) {
    const pill = document.createElement("span");
    pill.className = "ps-pill";
    pill.textContent = cat;
    refBody.appendChild(pill);
  }
  refSection.append(refSum, refBody);

  sectBody.append(desc, tblHdr, rowsContainer, actions, refSection);
  boolSection.append(sectHdr, sectBody);
  body.appendChild(boolSection);
  dialog.append(header, body);

  // Subscribe to external rule changes (e.g. from node editor context)
  BooleanRulesEngine.onChanged(rebuildRows);

  return dialog;
}

// ─── Mount function ───────────────────────────────────────────────────────────

/**
 * Montează panoul Project Settings pe document.body.
 * Apelați o singură dată din main.ts.
 * Returnează funcția de toggle (afișare/ascundere).
 */
export const mountProjectSettingsPanel = (): (() => void) => {
  // Inject CSS once
  if (!document.getElementById("ps-styles")) {
    const style = document.createElement("style");
    style.id = "ps-styles";
    style.textContent = PS_CSS;
    document.head.appendChild(style);
  }

  const portal = document.createElement("div");
  portal.id = "ps-portal";
  portal.style.display = "none";
  document.body.appendChild(portal);

  // Close on backdrop click
  portal.addEventListener("click", (e) => {
    if (e.target === portal) toggle();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && portal.style.display !== "none") toggle();
  });

  let panel: HTMLElement | null = null;

  const toggle = () => {
    if (portal.style.display === "none") {
      // Rebuild panel each open so rules list is fresh
      portal.innerHTML = "";
      panel = buildProjectSettingsPanel(toggle);
      portal.appendChild(panel);
      portal.style.display = "flex";
    } else {
      portal.style.display = "none";
    }
  };

  _togglePS = toggle;
  return toggle;
};
