# Template data entry (pages 2+), QR scanning and camera capture

Page 1 of a COC is filled from D365FO. The other pages of a template (measurement sheets, serial
number registration, test instructions …) are filled manually by the user in **New COC → Step 2**.

## Admin: define the fields

Templates → *Data fields* (or the template detail page → *Data entry fields*), route
`/admin/templates/{id}/inputs`. Requires `manageTemplates` to edit; anyone with `viewTemplates` can view.

* **Sections** map to template pages (page 2, 3 …). Each section has a title, optional instructions
  and *Print data sheet in PDF*.
* **Fields**: label, key, type (`text`, `number`, `passfail`, `dropdown`, `date`, `multiline`,
  `checkbox`), unit, min / max, nominal text, default, help, *Required*, *Allow QR scan*.
  Numbers outside min/max are flagged **NOK** to the user and on the PDF.
* **Bulk add**: one field per line, `Label | unit | min | max`.
* **Supplier documents**: enable camera capture, make it required, set a minimum count.

The configuration is stored in `coc_app_settings` under `template.inputs.{templateId}` (no migration
needed) and can be changed without publishing a new template version. Every issued COC stores a
snapshot of the fields and values in `coc_document_values` (`__measurements`), so later changes never
alter historical certificates.

## How values reach the PDF

1. If the designer has a *Field* element whose field name equals the key, the value is printed there.
2. All other fields of a section with *Print data sheet* are printed on an appended
   **Measurement data sheet** (spec, value, OK/NOK, manual/QR source).
3. Captured documents are appended after that: photos as full A4 pages, PDFs page by page, each
   stamped with COC number, production order and serial number.

Note: the built-in PDF fonts support Western (WinAnsi) characters only – other scripts (e.g. Tamil)
are printed as `?`.

## QR codes

Each QR-enabled field has a scan button; each section has *Scan to fill*. Supported payloads:

* plain text → the field whose button was pressed
* JSON `{"Flatness":"0.32","PumpSerial":"P-778812"}` (keys or labels)
* `Flatness=0.32;PumpSerial=P-778812` or `key: value` lines

Scanning uses the native `BarcodeDetector` (Android Chrome / Edge) and falls back to `jsQR`
(iOS Safari, Firefox). The camera requires **HTTPS**; on plain HTTP the user can take a photo of the
QR code instead.

## Camera capture of supplier documents

*Take photo* opens the rear camera on phones; *Upload file* accepts images and PDFs. Photos are
resized to max 2000 px and JPEG-compressed on the device; *Document mode* converts to high-contrast
black & white. Limits: 20 documents, 12 MB each, 40 MB total. Each document is also stored
individually as a PDF in the `coc-generated` bucket under `attachments/{yyyy}/{COC}/` and is listed
on the Completed COC page (`/api/coc/{id}/attachments/{index}`).

## Responsive layout

The app shell switches automatically: phone (< 768 px) top bar + drawer + bottom tabs, tablet
(768–1279 px) icon rail, desktop (≥ 1280 px) full sidebar. The New COC wizard shows a sticky
action bar below 1024 px, and PDFs are rendered with PDF.js on touch devices (mobile browsers do not
display PDFs inside iframes).
