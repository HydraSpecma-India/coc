import type { AttachmentUpload, MeasurementEntry } from "@/lib/coc-inputs/types";

export interface StepData {
  measurements: MeasurementEntry[];
  attachments: AttachmentUpload[];
  /** values stamped on the template (field key → printed value) */
  manualValues: Record<string, string>;
}

const pageOf = (m: Pick<MeasurementEntry, "pageNumber">) => m.pageNumber ?? 0;

/** All template pages that have data-entry fields (0 = fields without a page number). */
export function pagesIn(...lists: MeasurementEntry[][]): number[] {
  return Array.from(new Set(lists.flat().map(pageOf))).sort((a, b) => a - b);
}

/**
 * Takes the incoming values only for the fields on `allowedPages` (and supplier documents when
 * `allowDocuments`), everything else stays as it was – a step can never change another step's data.
 */
export function mergeStepData(
  base: StepData,
  incoming: { measurements: MeasurementEntry[]; attachments: AttachmentUpload[]; measurementValues: Record<string, string> },
  allowedPages: Set<number>,
  allowDocuments: boolean,
): StepData {
  const pageByKey = new Map<string, number>();
  for (const m of [...base.measurements, ...incoming.measurements]) pageByKey.set(m.key, pageOf(m));
  const allowed = (key: string) => allowedPages.has(pageByKey.get(key) ?? -1);

  const baseByKey = new Map(base.measurements.map((m) => [m.key, m]));
  const inByKey = new Map(incoming.measurements.map((m) => [m.key, m]));
  const order = incoming.measurements.length ? incoming.measurements.map((m) => m.key) : base.measurements.map((m) => m.key);
  for (const m of base.measurements) if (!order.includes(m.key)) order.push(m.key);
  const measurements = order
    .map((k) => (allowed(k) ? inByKey.get(k) ?? baseByKey.get(k) : baseByKey.get(k) ?? undefined))
    .filter((m): m is MeasurementEntry => Boolean(m))
    // a field outside this step that nobody filled yet keeps an empty entry from the incoming list
    .concat(incoming.measurements.filter((m) => !allowed(m.key) && !baseByKey.has(m.key)).map((m) => ({ ...m, value: "", printed: undefined, status: "" as const })));

  const photos = [
    ...base.attachments.filter((a) => a.fieldKey && !allowed(a.fieldKey)),
    ...incoming.attachments.filter((a) => a.fieldKey && allowed(a.fieldKey)),
  ];
  const documents = allowDocuments ? incoming.attachments.filter((a) => !a.fieldKey) : base.attachments.filter((a) => !a.fieldKey);

  const manualValues = { ...base.manualValues };
  for (const [k, page] of pageByKey) {
    if (!allowedPages.has(page)) continue;
    delete manualValues[k];
    const v = incoming.measurementValues[k];
    if (v) manualValues[k] = v;
  }

  return { measurements, attachments: [...photos, ...documents], manualValues };
}
