import type { InputFieldDef, InputSection, Placement, TemplateInputConfig } from "@/lib/coc-inputs/types";

/**
 * Ready-made data-entry layouts that admins can load in "Data entry fields" and then adjust.
 * Page numbers follow the template PDF (page 1 = certificate filled from D365FO).
 *
 * Placements were measured from the COC-1070.0049 Rev.02 template PDF (points, top-left origin,
 * A4 595.56 × 842.04) so every value is stamped into its own box on the original page –
 * exactly where it used to be handwritten. "Place on template" turns them into designer elements.
 */

let n = 0;
const id = (p: string) => `${p}_${(++n).toString(36)}`;

const at = (page: number, x: number, y: number, w: number, h: number, extra: Partial<Placement> = {}): Placement => ({
  page, x, y, w, h, align: "center", fontSize: 10, ...extra,
});

const num = (key: string, label: string, extra: Partial<InputFieldDef> = {}): InputFieldDef => ({
  id: id("f"), key, label, type: "number", required: true, qr: true, ...extra,
});
const txt = (key: string, label: string, extra: Partial<InputFieldDef> = {}): InputFieldDef => ({
  id: id("f"), key, label, type: "text", required: true, qr: true, ...extra,
});
const ok = (key: string, label: string, extra: Partial<InputFieldDef> = {}): InputFieldDef => ({
  id: id("f"), key, label, type: "passfail", required: true, qr: false, ...extra,
});
const chk = (key: string, label: string, extra: Partial<InputFieldDef> = {}): InputFieldDef => ({
  id: id("f"), key, label, type: "checkbox", required: false, qr: false, defaultValue: "Yes", ...extra,
});

const section = (pageNumber: number, title: string, fields: InputFieldDef[], description?: string): InputSection => ({
  id: id("s"), pageNumber, title, description, printSheet: false, fields,
});

/* ── measured table geometry ───────────────────────────────────────────── */

// Page 2 – Appendix B result row (cells 1..5)
const P2_COLS: Array<[number, number]> = [[57, 153], [153, 249], [250, 346], [346, 442], [442, 538]];
// Page 3 – Appendix A, table 1 (positions 1..5) and table 2 (positions 6..10)
const P3_T1_COLS: Array<[number, number]> = [[241, 300], [301, 360], [360, 411], [411, 474], [475, 538]];
const P3_T2_COLS: Array<[number, number]> = [[192, 260], [261, 330], [330, 399], [400, 469], [469, 538]];
// Page 4 – check list rows (top, bottom) in the order of the paper form
const P4_ROWS: Array<[number, number]> = [
  [208, 228], [228, 248], [249, 268], [269, 289], [289, 312], [313, 336], [336, 356], [357, 380], [380, 403], [404, 424], [424, 444],
];

const cell = (page: number, [x0, x1]: [number, number], top: number, bottom: number, extra: Partial<Placement> = {}) =>
  at(page, x0 + 2, top + 1, x1 - x0 - 4, bottom - top - 2, extra);

/** HydraSpecma Baseframe Module COC-1070.0049 Rev.02 (7-page template + supplier reports). */
export function baseframe10700049Preset(): TemplateInputConfig {
  n = 0;

  const interfacePos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => {
    const place = p <= 5 ? cell(3, P3_T1_COLS[p - 1], 222, 240) : cell(3, P3_T2_COLS[p - 6], 331, 348);
    return [4, 5, 6].includes(p)
      ? num(`IfPos${p}`, `Interface hole position ${p}`, { unit: "mm", nominal: "727,4 +/- 5", min: 722.4, max: 732.4, placements: [place] })
      : ok(`IfPos${p}`, `Interface hole position ${p} (Go / No-go)`, { placements: [place] });
  });

  const checkNames: Array<[string, string]> = [
    ["ChkAssembled", "Assembled"],
    ["ChkAirLeak", "Air leak test"],
    ["ChkAirFan", "Air fan test"],
    ["ChkPipeLeak", "Pipe system leak test"],
    ["ChkInterface", "Interface dimension for cabinet"],
    ["ChkFlatness", "Flatness of baseframe"],
    ["ChkTraceability", "Part traceability"],
    ["ChkPlugs", "Check for plugs"],
    ["ChkSeal", "Check seal"],
    ["ChkComplete", "Complete inspection"],
    ["ChkPacking", "Packing"],
  ];

  return {
    version: 1,
    sections: [
      section(
        2,
        "Page 2 · Appendix B – Flatness of baseframe (COC-1070.0049-2)",
        [1, 2, 3, 4, 5].map((p) =>
          num(`Flatness${p}`, `Flatness point ${p}`, {
            unit: "mm", nominal: "Max 4 mm", max: 4, placeholder: "e.g. <1",
            placements: [cell(2, P2_COLS[p - 1], 699, 736, { fontSize: 13 })],
          }),
        ),
        "Measure and control flatness after mounting 3020.0919 into 3020.1212. Enter the reading for points 1–5.",
      ),
      section(
        3,
        "Page 3 · Appendix A – Interface holes for cabinets (COC-1070.0049-1)",
        [
          ...interfacePos,
          txt("IfCheckedBy", "Checked by (signature / initials)", {
            qr: false,
            placements: [
              ...P3_T1_COLS.map((c) => cell(3, c, 241, 259, { fontSize: 8 })),
              ...P3_T2_COLS.map((c) => cell(3, c, 348, 366, { fontSize: 8 })),
            ],
          }),
        ],
        "Positions 4, 5 and 6: type the actual dimension. Other positions: Go / No-go check.",
      ),
      section(
        4,
        "Page 4 · Serial number registration – check list (SN-1070.0049 1/2)",
        [
          ...checkNames.map(([key, label], i) =>
            chk(key, label, { placements: [at(4, 523, P4_ROWS[i][0] + (P4_ROWS[i][1] - P4_ROWS[i][0] - 11) / 2, 11, 11)] }),
          ),
          txt("ChecklistInitials", "Initials", {
            qr: false,
            placements: P4_ROWS.map(([t, b]) => cell(4, [388, 444], t, b, { fontSize: 8 })),
          }),
          {
            id: id("f"), key: "ChecklistDate", label: "Date", type: "date", required: true, qr: false,
            placements: P4_ROWS.map(([t, b]) => cell(4, [445, 502], t, b, { fontSize: 7.5 })),
          },
        ],
      ),
      section(
        5,
        "Page 5 · Serial number registration – components (SN-1070.0049 2/2)",
        [
          txt("WeldAssySerial", "Baseframe weld assy 3020.1212 – serial no.", { placements: [at(5, 178, 85, 98, 13, { align: "left" })] }),
          txt("FanSerial", "Fan 1072.0016 – serial no.", { placements: [at(5, 178, 150, 98, 13, { align: "left" })] }),
          txt("PipeBatch1", "Cooling system – pipe 9018.0251 batch no. (1)", { placements: [at(5, 178, 217, 98, 13, { align: "left" })] }),
          txt("PipeBatch2", "Cooling system – pipe 9018.0251 batch no. (2)", { placements: [at(5, 178, 245, 98, 13, { align: "left" })] }),
          txt("ManifoldDate7010_0086", "Manifold 7010.0086 – date", { placements: [at(5, 178, 272, 98, 13, { align: "left" })] }),
          txt("ManifoldDate7010_0087", "Manifold 7010.0087 – date", { placements: [at(5, 178, 300, 98, 13, { align: "left" })] }),
          txt("HeatExchanger1Serial", "Heat exchanger 2080.0002 – serial no. 1", { placements: [at(5, 183, 386, 92, 13, { align: "left" })] }),
          txt("HeatExchanger2Serial", "Heat exchanger 2080.0002 – serial no. 2", { placements: [at(5, 183, 414, 92, 13, { align: "left" })] }),
          txt("HeatExchanger3Serial", "Heat exchanger 2080.0002 – serial no. 3", { placements: [at(5, 183, 442, 92, 13, { align: "left" })] }),
        ],
        "Scan the barcode / QR label of each component or type the number.",
      ),
      section(
        6,
        "Page 6 · Test instruction – Baseframe air leak test (TI-1070.0049-1)",
        [
          num("AirLeakResult", "Results after 5 min", {
            unit: "L/s", nominal: "<= 14 L/s within 5 min", max: 14,
            placements: [at(6, 195, 370, 132, 15, { fontSize: 12 })],
          }),
          {
            id: id("f"), key: "AirLeakPrintout", label: "Leak test print-out (photo)", type: "photo", required: true, qr: false,
            help: "Photograph the Lindab LT600 print-out – it is stamped on the page where the slip used to be glued.",
            placements: [at(6, 360, 400, 190, 385)],
          },
        ],
      ),
      section(7, "Page 7 · Test instruction – Baseframe air fan test (TI-1070.0049-2)", [
        txt("FanTestNote", "Noise / collision observed", { qr: false, defaultValue: "Nil", placements: [at(7, 330, 462, 150, 16, { fontSize: 12 })] }),
      ]),
    ],
    attachments: {
      enabled: true,
      required: false,
      minCount: 0,
      label: "Supplier test reports",
      hint: "Photograph supplier documents that are not part of the template (e.g. the Ymer pipe-system leak test). They are added after the template pages.",
    },
    stamps: [
      // Serial no. box on every appendix page + the serial line on the registration page
      { fieldName: "TopLevelSerialNumber", ...at(2, 447, 114, 92, 15, { align: "left" }) },
      { fieldName: "TopLevelSerialNumber", ...at(3, 427, 147, 110, 16, { align: "left" }) },
      { fieldName: "TopLevelSerialNumber", ...at(4, 437, 106, 120, 16, { align: "left" }) },
      { fieldName: "TopLevelSerialNumber", ...at(4, 366, 471, 185, 16, { align: "left", fontSize: 11 }) },
      { fieldName: "TopLevelSerialNumber", ...at(5, 400, 40, 150, 16, { align: "right" }) },
      { fieldName: "TopLevelSerialNumber", ...at(6, 442, 113, 95, 16, { align: "left" }) },
      { fieldName: "TopLevelSerialNumber", ...at(7, 471, 113, 85, 16, { align: "left" }) },
      // Date next to the logo on each page (was handwritten)
      { fieldName: "COCDate", ...at(2, 190, 36, 90, 14, { align: "left" }) },
      { fieldName: "COCDate", ...at(3, 200, 68, 90, 14, { align: "left" }) },
      { fieldName: "COCDate", ...at(4, 200, 32, 90, 14, { align: "left" }) },
      { fieldName: "COCDate", ...at(5, 150, 40, 90, 14, { align: "left" }) },
      { fieldName: "COCDate", ...at(6, 200, 42, 90, 14, { align: "left" }) },
      { fieldName: "COCDate", ...at(7, 200, 42, 90, 14, { align: "left" }) },
    ],
  };
}

export const INPUT_PRESETS = [
  {
    id: "baseframe-1070-0049",
    name: "Baseframe Module COC-1070.0049 Rev.02 (pre-mapped on template)",
    description: "Appendix B flatness (5), Appendix A interface holes (10), SN check list & component serials, air-leak result + print-out photo, fan test – all stamped on the template pages.",
    build: baseframe10700049Preset,
  },
];
