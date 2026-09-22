# COC workflow (steps per template and part number)

Admin → System Settings → **Workflow**.

1. Tick **Enable COC workflows** → **Save**.
2. **New workflow**:
   - **Templates** – tick the templates it is for (none = any template).
   - **Part numbers** – one per line; `*` = all, `1070.*` = starts with 1070, `?` = one character.
   - **Company** – one company or all.
   - **Steps** – for every step choose *who* (roles), the *template pages* it fills and whether it captures supplier documents.
     - Step 1 is always done in **New COC**: select production order + sales order reference (optionally check the customer order data).
     - Middle steps (e.g. "Quality – measurements pages 2–3") are done from **Pending Inspection** and handed to the next step.
     - The **last step** fills every page no other step has, signs and **issues** the COC.
     - Each page belongs to one step. A step without roles is open to everyone who may create COCs (step 1) / complete COCs (later steps). Admins can always act.
   - **Roles that may skip the workflow** – they issue directly.
3. **Test a part number** shows which workflow and steps apply.

Settings are stored in `coc_app_settings` (`workflow.inspection`) – no migration needed.

## Running a COC

| Where | Who | Action |
|---|---|---|
| New COC | step-1 role | Select orders (+ step-1 pages) → **Send to next step**. No signature, no COC number; the serial is reserved. |
| Pending Inspection | role of the current step | "Your step" badge → **Open step** → enter the step's pages → **Complete step**, or **Send back** to the previous step, or **Reject**. |
| Pending Inspection | last-step role | Enter remaining data, sign with **your own** signature → **Issue COC** (COC number assigned, PDF/SharePoint/Teams/D365 as usual). |
| Pending Inspection | submitter | **Withdraw** while waiting. |

Data from earlier steps is shown read-only; the server only accepts values for the pages of the current step. The steps are copied onto the COC when it is sent, so later changes to the workflow do not affect COCs already running.

## Other rules

- Stored signatures are personal: every user sees and uses only their own (My Signatures).
- Audit Logs are for administrators only.
