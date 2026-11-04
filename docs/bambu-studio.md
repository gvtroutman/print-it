# Ticket pipeline and Bambu Studio

The owner's `/queue` groups active tickets into **Review → Prepare → Ready →
Printing → Pickup**. Every column sorts by oldest request first, with ticket number breaking ties.
Search by ticket number, title, member, filename, material or color. **Needs
attention** finds missing models, flags and failed/cancelled linked jobs. Done
and Declined leave the active pipeline; finished orders remain in History.

The existing public statuses remain Requested, Accepted, Printing, Delivery and
Done. Prepare and Ready are two views of Accepted, distinguished by the owner's
preparation confirmation. Pickup is Delivery. Existing accepted tickets need
their checklist confirmed once. Existing Printing/Delivery/Done tickets continue
normally; the migration never changes their status or usage.

## Prepare a ticket

Accept the request. If it has no model, **Add the model** on its ticket. The owner
can also replace a model before printing, for example after fixing geometry or
converting GLB to STL. Both operations use the same byte validation, storage and
upload limits as intake. Replacement resets preparation and clears the original
model-source link. The model remains private.

Open the file in Bambu Studio, check the model/orientation/supports, requested
filament and all copies, and slice it. **Mark ready** requires confirmation of all
three checks. Missing models and unresolved flags block it. **Move to Printing**
only works after preparation. Flagging or replacing a model resets preparation.
**Return to preparation** is available while the ticket is Accepted.

## Windows helper

Open `/bambu-studio` in the app and download
[printit-bambu.ps1](../public/helpers/printit-bambu.ps1). In PowerShell, from its
download folder, run (replace the example origin with your instance):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\printit-bambu.ps1 -BaseUrl "https://print.example"
```

For a custom installation, add `-BambuPath "C:\path\to\bambu-studio.exe"`.
The helper detects standard Bambu Studio installations, copies itself into
`%LOCALAPPDATA%\PrintIt\BambuStudio`, and registers `printit-bambu://` under the
current user's registry. No administrator privileges are needed. Configuration
contains the app origin and executable path, with no session or cloud token.

Click **Open in Bambu Studio** on a ticket or queue card. Its short-lived
credential uses the existing [slicer-token mechanism](../src/lib/slicer-token.ts):
30 minutes, one ticket, with account suspension and scope rechecked on download.
The helper only downloads from the configured origin, refuses redirects, bounds
the download size and checks the full byte count. It saves a local filename such
as `PI-42-abc12345.stl` and passes that path to Studio as an argument. Downloaded
models remain under the helper's `models` directory; remove old files there when
you no longer need them.

Supported handoff formats: STL, 3MF, OBJ, AMF, STEP and STP. Export GLB/GLTF/PLY as
STL or 3MF first. On macOS/Linux or without the helper, use **Download** and import
the model into Studio. The existing PrusaSlicer helper also remains available.
You send the print from Studio after selecting the printer/profile and filament.

The local-file bridge is based on Bambu's own
[file-loading implementation](https://github.com/bambulab/BambuStudio/blob/master/src/slic3r/GUI/GUI_App.cpp),
and avoids relying on its remote-download protocol for a private self-hosted file.

## Link print jobs and import runtime

1. Connect Bambu Lab under the printer cards on `/queue`, using the existing
   emailed-code sign-in. Refresh history there when needed.
2. Save each Studio project with its ticket number, for example `PI-42 bracket`.
3. Send the print from Studio. On the ticket, choose the job under **Bambu print
   jobs** and click **Link job**. Matching ticket numbers are suggestions; the
   owner always chooses. The dropdown includes matching jobs and the latest 40
   unlinked jobs, with printer, start time, outcome and unique job id.
4. Link every plate/copy run or retry. A ticket can have many jobs; a job can only
   belong to one ticket. Unlink on its old ticket before reassigning. Cloud sync
   preserves assignments. Removing a ticket releases its job assignments while
   preserving printer history.
5. Review the result, record actual filament meters if known, and move the ticket
   to Pickup. **Import actual hours** replaces its recorded runtime with the sum
   of successful linked jobs' end-minus-start durations. It works on Delivery or
   Done tickets, excludes failed/cancelled attempts and estimates, and refuses
   active jobs, unknown outcomes and successful jobs with incomplete runtime.

Repeated imports replace the measurement rather than accumulating it. Adding a
new completed plate changes the next import's total. Confirm that every requested
copy is represented. Bambu's estimated grams never become actual extrusion meters.

The queue and ticket refresh while visible. When tickets are Accepted or Printing,
history is checked at most once per minute; quiet history keeps the existing
15-minute interval. This is page-driven cloud history polling, not a background
printer-control service. Synced outcomes never automatically move a ticket to
Pickup or Done. A failed job stays visible, and the owner checks print quality and
quantity before marking completion.

## API and verification

Owner-only endpoints, also described in `/docs`:

- `POST /api/stories/{id}/model`: multipart `file`; add/replace before Printing.
- `POST /api/stories/{id}/prepare`: `{ "ready": true, "confirmed": true }`;
  reset with `{ "ready": false }`.
- `GET /api/stories/{id}/bambu-jobs`: assigned jobs.
- `POST` or `DELETE /api/stories/{id}/bambu-jobs`: `{ "jobId": "..." }`.
- `POST /api/stories/{id}/bambu-runtime`: replace actual runtime from linked jobs.

Existing `POST /advance` now requires confirmed preparation before Printing.
All mutations are owner-only, audited, and retain existing Origin protections.
Assignment/runtime operations lock the ticket and relevant jobs against changes
while processing. Neither a helper credential nor cloud sync can mutate tickets.

```bash
npm run verify:pipeline
npm run verify:bambu
npm run verify:order-usage
```

On Windows, `npm run verify:bambu-helper` checks the helper parser/origin rules.
The pipeline suite uses isolated records and renders the actual queue. The
database-backed API and queue suites also include the preparation step; run those
only against their disposable development database, as documented in their files.

Deploy with the normal migration step before starting the new app image. The
additive `20261014020000_ticket_pipeline` migration adds preparation and nullable
job assignments without rewriting existing data.
