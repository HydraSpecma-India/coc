# Quality inspection workflow

For selected item numbers a COC is prepared by production and issued by quality.

## Set up (Admin → System Settings → Workflow)

1. Tick **Enable the inspection workflow** and click **Save**.
2. **New workflow** → name, company (or *All companies*) and the item numbers.
   - One per line or comma separated. `*` = every item, `1070.*` = every item starting with 1070, `?` = any one character.
   - A company-specific workflow wins over *All companies*; an exact item number wins over a wildcard.
3. *Roles that may still issue directly* – ticked roles skip the inspection (e.g. Admin). Leave all unticked to always inspect.
4. *Production may already fill the template data fields* – when unticked, production only prepares page 1 and quality enters all inspection data.
5. Use **Test an item** to check which workflow applies.

Settings are stored in `coc_app_settings` under the key `workflow.inspection` – no database migration is needed.

## Flow

| Step | Who | What happens |
|---|---|---|
| 1 | Production (New COC) | Selects production order, sales order reference, serial number → **Send to Quality Inspection**. No signature, no COC number yet. The serial number is reserved. |
| 2 | Pending Inspection menu | The COC waits (badge shows the count). Production can **withdraw** its own submission. |
| 3 | Quality (permission *Complete, sign & approve COC*) | **Inspect & issue** → enters / corrects the template data, captures documents, signs, previews and **Issues** the COC. The company-wise COC number is assigned now and the PDF, SharePoint, Teams and D365 steps run as for a direct COC. |
| – | Quality | **Reject** with a reason → the COC is cancelled, the serial number is free again, production sees the reason under *Rejected / withdrawn*. |

Items without an active workflow are issued directly, exactly as before.

## Technical notes

- Pending documents are `coc_documents` rows with status `DRAFT`, no `coc_number` and `d365_context_json.workflow.state = PENDING_INSPECTION`. They do not appear in Completed COCs.
- The data prepared by production is stored in `coc_document_values` (`__workflow_payload`) and removed after the COC is issued.
- Two inspectors cannot issue the same COC: the document is claimed (`ISSUING`) before the number is assigned.
- API: `GET/PUT /api/admin/workflow`, `GET /api/workflow/match`, `GET /api/workflow/pending`, `GET /api/workflow/inspections/:id`, `POST …/issue`, `POST …/reject`.
