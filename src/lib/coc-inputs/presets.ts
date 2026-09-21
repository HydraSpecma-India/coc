import type { InputFieldDef, InputSection, TemplateInputConfig } from "@/lib/coc-inputs/types";

/**
 * Ready-made data-entry layouts that admins can load in "Data entry fields" and then adjust.
 * Page numbers follow the template PDF (page 1 = certificate filled from D365FO).
 */

let n = 0;
const id = (p: string) => `${p}_${(++n).toString(36)}`;

const num = (key: string, label: string, extra: Partial<InputFieldDef> = {}): InputFieldDef => ({
  id: id("f"), key, label, type: "number", required: true, qr: true, ...extra,
});
const txt = (key: string, label: string, extra: Partial<InputFieldDef> = {}): InputFieldDef => ({
  id: id("f"), key, label, type: "text", required: true, qr: true, ...extra,
});
const ok = (key: string, label: string, extra: Partial<InputFieldDef> = {}): InputFieldDef => ({
  id: id("f"), key, label, type: "passfail", required: true, qr: false, ...extra,
});
const chk = (key: string, label: string): InputFieldDef => ({ id: id("f"), key, label, type: "checkbox", required: false, qr: false, defaultValue: "Yes" });

const section = (pageNumber: number, title: string, fields: InputFieldDef[], description?: string): InputSection => ({
  id: id("s"), pageNumber, title, description, printSheet: true, fields,
});

/** HydraSpecma Baseframe Module COC-1070.0049 Rev.02 (8-page pack). */
export function baseframe10700049Preset(): TemplateInputConfig {
  n = 0;
  const interfacePos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) =>
    [4, 5, 6].includes(p)
      ? num(`IfPos${p}`, `Interface hole position ${p}`, { unit: "mm", nominal: "727,4 +/- 5", min: 722.4, max: 732.4 })
      : ok(`IfPos${p}`, `Interface hole position ${p} (Go / No-go)`),
  );

  return {
    version: 1,
    sections: [
      section(
        2,
        "Appendix B – Flatness of baseframe (COC-1070.0049-2)",
        [1, 2, 3, 4, 5].map((p) => num(`Flatness${p}`, `Flatness point ${p}`, { unit: "mm", nominal: "Max 4 mm", max: 4, placeholder: "e.g. <1" })),
        "Measure and control flatness after mounting 3020.0919 into 3020.1212. Enter the reading for points 1–5.",
      ),
      section(
        3,
        "Appendix A – Interface holes for cabinets (COC-1070.0049-1)",
        [...interfacePos, txt("IfCheckedBy", "Checked by (initials)", { qr: false })],
        "Positions 4, 5 and 6: type the actual dimension. Other positions: Go / No-go check.",
      ),
      section(
        4,
        "Serial number registration – check list (SN-1070.0049 1/2)",
        [
          chk("ChkAssembled", "Assembled"),
          chk("ChkAirLeak", "Air leak test"),
          chk("ChkAirFan", "Air fan test"),
          chk("ChkPipeLeak", "Pipe system leak test"),
          chk("ChkInterface", "Interface dimension for cabinet"),
          chk("ChkFlatness", "Flatness of baseframe"),
          chk("ChkTraceability", "Part traceability"),
          chk("ChkPlugs", "Check for plugs"),
          chk("ChkSeal", "Check seal"),
          chk("ChkComplete", "Complete inspection"),
          chk("ChkPacking", "Packing"),
          txt("ChecklistInitials", "Initials", { qr: false }),
          { id: id("f"), key: "ChecklistDate", label: "Date", type: "date", required: true, qr: false },
        ],
      ),
      section(
        5,
        "Serial number registration – components (SN-1070.0049 2/2)",
        [
          txt("WeldAssySerial", "Baseframe weld assy 3020.1212 – serial no."),
          txt("FanSerial", "Fan 1072.0016 – serial no."),
          txt("PipeBatch1", "Cooling system – pipe 9018.0251 batch no. (1)"),
          txt("PipeBatch2", "Cooling system – pipe 9018.0251 batch no. (2)"),
          txt("ManifoldDate7010_0086", "Manifold 7010.0086 – date"),
          txt("ManifoldDate7010_0087", "Manifold 7010.0087 – date"),
          txt("HeatExchanger1Serial", "Heat exchanger 2080.0002 – serial no. 1"),
          txt("HeatExchanger2Serial", "Heat exchanger 2080.0002 – serial no. 2"),
          txt("HeatExchanger3Serial", "Heat exchanger 2080.0002 – serial no. 3"),
        ],
        "Scan the barcode / QR label of each component or type the number.",
      ),
      section(
        6,
        "Test instruction – Baseframe air leak test (TI-1070.0049-1)",
        [
          num("AirLeakResult", "Results after 5 min", { unit: "L/s", nominal: "<= 14 L/s within 5 min", max: 14 }),
          { id: id("f"), key: "AirLeakPrintout", label: "Leak test print-out (photo)", type: "photo", required: true, qr: false, help: "Photograph the Lindab LT600 print-out – it is placed on the page like the glued slip." },
        ],
      ),
      section(7, "Test instruction – Baseframe air fan test (TI-1070.0049-2)", [
        txt("FanTestNote", "Noise / collision observed", { qr: false, defaultValue: "Nil" }),
      ]),
      section(
        8,
        "Test instruction – Pipe system leak test (TI-1071.0267)",
        [
          txt("PipeTestNo", "Test of pipe system no.", { required: false }),
          num("InletStart", "Inlet pressure start of test", { unit: "bar", nominal: "5,35 - 5,45 bar", min: 5.35, max: 5.45 }),
          num("InletEnd", "Inlet pressure end of test after 60 min", { unit: "bar" }),
          num("InletDrop", "Inlet pressure drop", { unit: "bar", nominal: "<= 0,05 bar", max: 0.05 }),
          num("OutletStart", "Outlet pressure start of test", { unit: "bar", nominal: "5,35 - 5,45 bar", min: 5.35, max: 5.45 }),
          num("OutletEnd", "Outlet pressure end of test after 60 min", { unit: "bar" }),
          num("OutletDrop", "Outlet pressure drop", { unit: "bar", nominal: "<= 0,05 bar", max: 0.05 }),
          txt("PipeTestSignedBy", "Tested by", { qr: false }),
          { id: id("f"), key: "PipeTestDate", label: "Test date", type: "date", required: true, qr: false },
        ],
      ),
    ],
    attachments: {
      enabled: true,
      required: false,
      minCount: 0,
      label: "Supplier quality documents & test reports",
      hint: "Optional: capture any extra supplier certificates or reports – they are added at the end of the COC.",
    },
  };
}

export const INPUT_PRESETS = [
  {
    id: "baseframe-1070-0049",
    name: "Baseframe Module COC-1070.0049 Rev.02 (8 pages)",
    description: "Appendix B flatness (5), Appendix A interface holes (10), SN registration, air-leak test with print-out photo, fan test, pipe test.",
    build: baseframe10700049Preset,
  },
];
