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

### Preset for COC-1070.0049 (Baseframe Module) – pre-mapped

*Load preset…* creates the fields **with their positions measured from the template PDF**:
page 2 flatness points 1–5 (result row), page 3 interface holes 1–10 + signature rows, page 4
check list (initials / date / check mark per row) and serial line, page 5 component serial / batch
numbers, page 6 air-leak result + the **print-out photo in the glue area**, page 7 fan-test note,
plus the serial no. and date on every page. Save, then press **Place & publish** (or *Place & review
in designer*). The values are stamped on the original template pages – the COC PDF keeps its
7 pages. Supplier reports that are not part of the template (e.g. the Ymer pipe-system test) are
captured under *Supplier test reports* and added after the template pages.

## Map the fields onto the template (designer)

“Place on template” writes the positions into a draft version as ordinary designer elements
(ids starting with `de-`; running it again replaces them, hand-placed elements are kept). You can
move / resize them in the designer. For other templates, drag the fields from the palette group
**“Data entry · Page N”** onto the page:

* Text / number / OK-NOK / date fields → *Field* element (or a table cell bound to the key).
* Checkbox fields → *Checkbox* element (ticked when the value is Yes/OK).
* **Photo** fields → *Image* element bound to the key; the photo is drawn inside that frame.

## How values reach the PDF

1. Every value is stamped where a designer element with the same field name is placed.
2. A value that is not placed anywhere is stamped in a small “Recorded values” box at the bottom of
   its own template page (no extra pages). Tick *Extra data sheet page* on a section only if you
   prefer a separate data sheet page for such values.
3. Supplier documents (camera capture section) are added after the template pages.

Note: the built-in PDF fonts support Western (WinAnsi) characters only – other scripts (e.g. Tamil)
are printed as `?`.

## QR codes and barcodes

Each scan-enabled field has a scan button that reads **QR codes and 1D barcodes** (Code 128/39/93,
EAN-8/13, UPC, ITF, Codabar, Data Matrix). Each section also has *Scan to fill* for multi-value QR
codes. Supported payloads:

* plain text → the field whose button was pressed
* JSON `{"Flatness":"0.32","PumpSerial":"P-778812"}` (keys or labels)
* `Flatness=0.32;PumpSerial=P-778812` or `key: value` lines

Scanning uses the native `BarcodeDetector` (Android Chrome / Edge) and falls back to `jsQR` + ZXing
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

## Sign-out / session-timeout redirect

System Settings → Application Rules → **Login Redirect URL** (e.g. `https://coc.hydraspecma.com/signin`)
and **Session Timeout (minutes)**. Sign-out and inactivity time-out now redirect the browser explicitly
to that URL. When it is blank the browser's own origin + `/signin` is used, so the user never lands on
the App Service's internal host name.
