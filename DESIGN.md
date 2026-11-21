# Forman admin UI — design conventions

Use these conventions for changes to the admin interface (`/app/*`). Reuse components in
`src/components/patterns` and apply each convention across the affected callers. Follow the
browser verification workflow in [AGENTS.md](AGENTS.md#mandatory-workflow-for-every-ui-change).

## 1. Language and casing

The interface is English. Public form texts have their own language setting.

### Entity names are capitalized

Forman's domain objects are proper nouns in the UI. Write them with a capital letter wherever they
appear: labels, headings, buttons, messages, tooltips and empty states.

| Entity | Plural | Meaning |
|---|---|---|
| Source | Sources | An endpoint that accepts submissions (One-shot, Session or M2M). |
| Built-in Form | Built-in Forms | A public form page that Forman renders for a Source. |
| Pipeline | Pipelines | An ordered set of Actions that runs for each accepted Submission. |
| Action | Actions | One step in a Pipeline (Webhook, Email, CouchDB, Email Confirmation, …). |
| Pipeline Run | Pipeline Runs | One execution of a Pipeline for one Submission. |
| Submission | Submissions | One accepted payload received by a Source. |
| Callback | Callbacks | A Pipeline Run step waiting for an external reply. |
| Inbox | — | The review queue for Submissions. |

- Capitalize the entity inside a longer phrase: "Active Sources", "Delete Pipeline", "No Submissions
  match these filters.", "Open Submission".
- Action and state names that are not entities stay lowercase inside a sentence: "Source
  deactivated", "3 selected", "last 24 hours".
- Words that only look like entities stay lowercase: "actions" in menu labels means operations
  ("Source actions", "Submission actions"), "submission" as the act of submitting
  ("after final submission"), and "tag" / "tags", which are labels, not entities.
- Navigation and page titles use the plural entity name ("Pipelines", "Pipeline Runs"). The page
  title of the Sources collection is "Data Sources"; everywhere else the entity is "Source".
- Everything that is not an entity uses sentence case: "Rows per page", "Clear selection",
  "Try again", "Change the password".
- Use one noun per concept. Do not switch between "Source", "Data Source" and "form" for the same
  thing inside a screen.
- The field that names an entity is labelled "Name" everywhere (Source, Built-in Form, Pipeline,
  Tag). Add a description only when the name has a limited audience, for example "Shown only in
  the admin." on a Built-in Form.

### Casing on buttons, tabs and headings

- Buttons: verb + object, sentence case except for entity names: "Create Source", "Add Action",
  "Delete selected", "Move to Inbox".
- Tabs and section headings: short nouns without a "settings" suffix inside Settings ("General",
  "Protection", "Account", "Tags", "SMTP").
- Table column headers: sentence case, singular where the cell holds one value ("Source",
  "Last Submission", "Status"). The time a Submission arrived is always "Received".
- Filter selects default to "All" plus the plural of the field: "All Sources", "All Pipelines",
  "All types", "All states", "All statuses".

### Numbers, dates and units

- Show dates and times in the browser's time zone using `YYYY-MM-DD HH:mm:ss`.
  Use `LocalDateTime` and the formatter in `src/shared/format/date.ts`.
- Time windows are written "24 h", "7 d", "30 d" in compact labels and "last 24 hours" in sentences.
- Units go after the label in parentheses: "Retention (days)", "Timeout (seconds)",
  "Limit (per minute)".

## 2. Copy rules

1. **No intro paragraphs.** A page title plus its controls must explain the page. Add a description
   only when the page does something the controls do not show.
2. **Help text is one short sentence**, and only where the label is not enough. Do not repeat the
   label in other words.
3. **Empty states** have a title that states the fact and at most one sentence with the next step:
   "No Sources yet" + "Create the first Source to receive submissions."
4. **Confirmations** ask a question in the title and state only the consequence in the body:
   "Delete Pipeline?" + "This action cannot be undone." The confirm button repeats the verb.
5. **Errors** say what failed and what to do next ("Couldn't refresh this page. Try again."). Never
   show server messages, stack traces or IDs of internal records.

Terminology that tests enforce (`tests/unit/*terminology*`, `tests/unit/second-person-copy.test.ts`)
must stay out of the code and of the Markdown documentation.

## 3. Page structure

- **`PageWorkspace`** wraps every admin screen. Use `width="collection"` for lists and the default
  width for detail and editor screens.
- **`PageHeader`** is the only page heading. It takes `title`, optional `metadata` (entity type and identifier),
  `status` (a `StatusBadge`), `back` (link to the parent collection), `actions` (primary button and
  a `MoreVertical` menu) and `documentTitle` for the browser tab.
- **Browser tab titles**: `{name} · {type} · Forman` for admin detail pages, `{page} · Forman` for
  collections (`adminDocumentTitle`), and only the form title on public forms
  (`publicFormDocumentTitle`).
- **All detail headers** use the same order, enforced by PageHeader: title first,
  lifecycle status and one muted wrapping metadata row below, actions on the right. No entity eyebrow above
  the title and no page-specific exceptions. This applies to loaded, loading and error states.
  Metadata includes entity/subtype, ID, relevant timestamps and Source context; omit duplicate
  entity names when already used as the title. Tags join this row when space permits.
  Use public IDs for Sources and Built-in Forms. Do not repeat immutable type or ID in Configuration.
  Related navigation belongs in the action menu. Allow natural wrapping on narrow screens;
  do not reduce font size or truncate essential metadata to force two physical lines.
- **Inbox detail** uses the fixed title "Inbox item". Show the Source name, Received time and ID
  in the header, and full payload values in Data. The browser tab uses `{Source name} · Inbox item`.
- **`ResourceSection`** groups detail content. Give it an `id` when something links to it.
  A single card representing a tab omits its duplicate heading and empty header divider (`hideTitle`).
  `EditorTabPanel` applies this automatically. Keep field spacing, save controls, help text and actions.
  Multiple independent sections inside a tab keep their headings (for example Sign-in and Password
  in Account). Dynamic Action accordions and untabbed sections retain their headings.
- **`EditorTabs`** switches editor sections. The selected tab is kept in the URL hash. The shared tab row
  scrolls horizontally on narrow screens, as in Settings, and reveals the selected tab.

- **Label and value pairs** (`dl`): the label (`dt`) is smaller or equal in size, weight 500 and
  dimmed; the value (`dd`) uses the normal text color. Detail pages use `sm` labels; compact
  mobile cards use `xs` labels. Never dim the value instead of the label.

## 4. Collections

- Source action menus in lists and details show direct relationships: View Submissions,
  View Pipelines and View Built-in Forms (the latter two only when records exist).
  A separate creation group offers Create Pipeline and Create Built-in Form with the Source
  preselected. Unavailable creation actions explain the requirement. Lifecycle actions come last.
  Do not duplicate Inbox, Pipeline Runs or Waiting Callbacks navigation in this menu.

- **`ResourceTable`** uses shared column widths and pins the trailing column marked `sizing: "action"`.
  Truncate long text within the cell and preserve the full value when it is needed for identification.
  Inbox Preview joins up to three nonempty text, numeric or Boolean values and displays one line
  with an ellipsis on overflow. The detail view shows the full payload.
- **Advanced filters** use `FilterPanel`, `FilterField` and `FilterActions`. Apply draft values on
  submit. Shared search, tags and pagination follow §19.
- **`DateRangeFields`** with `useDateRangeError` is the only date range input. It blocks
  From > To before the request.
- **`TagFilter`** shows tag toggles above the table, with one clear action.
- **`ActiveFilterChips`** shows filters that came from a link and have no control in the panel
  (for example `?status=active` on Data Sources or `?period=24h` on Submissions). Each chip is
  labelled "Field: Value" and removes only its own filter. The whole chip is one button
  (accessible name "Remove filter Field: Value"), so it works with the keyboard; do not use Mantine
  `Pill` with its remove button, which is hidden from assistive technology.
- Keep filters, pagination and page size in the URL so a link reproduces the same view.

## 5. Dashboard

- Every summary card is one link to the collection that explains its number, including when the
  number is 0.
- Cards sit in a grid with equal columns: 2 below 992 px, 3 up to 1200 px, 5 above. Every card
  keeps the same width, including a card alone in the last row. The number sits at the bottom of
  the card, so it stays aligned even when a label wraps.

| Card (label / time window) | Target |
|---|---|
| Active Sources | `/app/sources?status=active` |
| Stored Submissions | `/app/submissions` |
| Submissions / Last 24 hours | `/app/submissions?period=24h` |
| Failed Actions / Last 24 hours | `/app/pipeline-runs?actionStatus=failed_24h` |
| Waiting Callbacks | `/app/callbacks` |

- Every card has the same three lines: label (what is counted), number, and time window
  ("Last 24 hours"). A card that counts the current state has no time window, but the line stays
  reserved, so all cards keep the same height and the numbers line up. The window line never holds
  explanations or footnotes, and the label never repeats the window in parentheses.
- Labels say exactly what is counted. Submissions can be deleted by retention, so the overall count
  is "Stored Submissions", not "Total" or "All time".
- The link's accessible name is the label, plus the time window when there is one
  ("Submissions Last 24 hours"), so two cards with the same label stay distinguishable. The number
  is the link's description.
- Color marks only problems that need attention, and only when the value is above 0 (red for
  failures, yellow for waiting items). Neutral counts are never colored.

## 6. Editing and saving

- **`SaveBar`** ends each editable section. Show the dirty state on the left and the primary Save
  action on the right at desktop widths. Enable Save when the section has valid changes and no
  save is pending. Use `notifySaved` for success and show save errors inline. See §13 for narrow layouts.
- **`useUnsavedChanges`** guards navigation away from a dirty editor.
- Fields that depend on a switch appear only while the switch is on (for example honeypot field
  names).

## 7. Destructive and state-changing actions

- **`ConfirmDialog`** is the only confirmation. Its default tone is `danger`. Use `tone="default"`
  for confirmations that do not destroy data. Set `pendingLabel` ("Deleting…") and show errors
  inside the dialog.
- Confirm actions whose effect is hard to undo: delete, deactivate a Source, empty trash.
- Reversible bulk actions (move to trash) skip the dialog and offer **Undo** in a toast instead.
- If an action is unavailable, keep the control disabled and say why next to it (for example
  "Disable the Pipeline before deleting it.").

## 8. Loading, refresh and connection

- First load shows `CollectionSkeleton` or a skeleton of the detail page, with the header already
  visible.
- A failed first load shows `PageState variant="error"` with "Try again".
- A failed refresh keeps the loaded data and shows `AdminResourceNotice`: one line, "Couldn't refresh
  this page. Showing data from {time}." with "Try again".
- When the server is unreachable, `ConnectionBanner` replaces the per-page notices: one sticky
  banner with the time of the last good data, automatic retries (5, 10, 30 s) and "Retry now".
  Navigation checks the connection first and stays on the current page when the server is down.

## 9. Status and color

- `StatusBadge` shows states in tables and headers. Its `status` is one of `active`, `inactive`,
  `success`, `warning` and `error`; the visible text names the state ("Active", "Completed",
  "Waiting", "Failed").
- Red means failure or destruction, yellow means waiting or needs attention, green means active or
  succeeded, gray means inactive or neutral. Do not use color as the only signal; the badge text
  carries the meaning.

## 10. Accessibility

- Every interactive card or row has one accessible name (the label) and a description for the
  value.
- Icon-only buttons have an `aria-label` and a tooltip with the same text.
- Groups of filters, chips and summary cards have a `role="group"` or landmark with a label.
- Keep focus: dialogs return focus to their trigger (`returnFocusTo`), and removed rows move focus
  to the next logical control.

## 11. List navigation and row actions

- Render the primary name and timestamp as plain text. Click a record row or card to open its
  detail. Use a pointer cursor, a visible keyboard focus indicator and Enter to open the detail.
- The row menu contains real links for opening the record and related objects, including native
  browser actions such as opening in a new tab.
- Links, checkboxes, buttons, selection of text and portaled menus never trigger row navigation.
  Modifier clicks retain native link behavior. Selecting records does not change card navigation.
- Every record menu starts with Open [record], followed by available direct relationships (Open
  Source, View Pipelines, View Submissions, etc.). Collection links carry the correct record filter.
  Separate navigation from state changes and destructive operations. Dashboard and nested histories
  follow the same policy. Do not offer links to deleted relationships or unsupported operations.
- Use RowActionsMenu for collection menus. Mobile menu triggers, menu items and checkbox hit areas
  provide 44 px targets. Desktop and mobile expose the same operations and confirmations.
- Inbox state changes reuse bulk-operation rules, including Undo for Trash. Completed Submissions
  can be deleted with confirmation; draft and expired sessions cannot. Pipeline deletion requires
  a disabled Pipeline and no unfinished Runs. Built-in Form unpublishing requires confirmation.
- State-only mutations send only the changed state, preserving concurrently edited configuration.
- Historical Runs remain accessible after their Pipeline is deleted; only the Pipeline link disappears.

### Context menus

- Collection and detail menus share labels, related links and state rules; omit the current object's Open action in its detail.
- Keep related navigation in the detail menu. Reserve standalone header buttons for primary
  operations such as Inbox processing.
- Order: Open object; previews/public links/copy; related data; related configuration; state changes; separated destructive actions. Put Pipeline Runs before Waiting Callbacks.
- Use Open for a detail, View for a collection, Preview form for a safe preview, and Delete permanently for permanent object deletion. Keep Remove Action for removing a Pipeline Action.
- Use Mark as read / Mark as unread only for non-archived Inbox items. Use Move to Inbox to leave the archive.
- Public form availability requires both a published form and an active Source; explain unavailable actions.
- Preserve the originating list's full filters and pagination when opening a related Submission.
- Use RowActionsMenu (detail variant for header menus): 44 px touch targets and items, viewport-constrained dropdowns. Errors from confirmations stay inside their dialogs.

- Trash offers Restore and confirmed Delete permanently in row and detail menus and for selected
  Inbox items. The server restricts permanent deletion to items in Trash and preserves linked
  Submissions and Pipeline Runs. Empty Trash applies to the whole bin.

### Shared controls

- Use the subtle variant for directional icon controls, including Action ordering and table
  pagination. Disabled controls keep their hit area and native disabled behavior, with transparent
  backgrounds and borders and a muted icon in both themes.
- Use the shared `tagAppearance` palette for badges, filters, Source assignment and the Settings
  catalog. Keep opaque backgrounds and dark text in both themes. Show selection with a stronger
  shade and border.
- Use the Mantine theme focus class on admin controls. Keep the 2 px inset outline for keyboard
  focus and the input focus border while editing. Omit the outer halo after pointer activation.

### Supplemental help

- Use the shared `HelpLabel` / `HelpTooltip` and circular info icon next to the relevant label or heading. Reuse it for informational statistics too.
- Tooltips contain short supplemental explanations. Keep input formats, required instructions, security warnings, destructive consequences, errors, and actionable empty states visible.
- Keep long examples and integration documentation in expandable sections. Remove redundant copy instead of moving it into a tooltip.
- Help opens on hover, keyboard focus, or tap; Escape dismisses it without closing the parent dialog. The icon is 14 px with a 28 px desktop / 44 px mobile target and a descriptive accessible name.
- Clicking help must not submit a form, toggle a checkbox, or navigate a table row. Verify both themes and desktop/mobile layouts when changing this shared pattern.

- Keep the specified help-icon hit area without stretching the field label.

- Parenthetical text within a field label (units, constraints, optional markers) inherits the label’s weight and color in admin and Built-in Forms. Do not dim individual label fragments. Separate descriptions remain secondary text.

## 12. Informational messages and empty states

These conventions are mandatory for new and changed admin UI. Use AdminNotice and PageState.

| Purpose | Presentation | Content |
|---|---|---|
| Information explaining a state or prerequisite | Mantine light blue Alert with a circular info icon | Short title, at most one explanatory sentence, optional next-step action |
| Empty collection or filtered result | Neutral PageState with a subdued contextual icon | Factual title, optional explanation; no warning color |
| Warning | Light yellow Alert with a warning icon | Explain the consequence and any required action |
| Error | Light red Alert with an error icon | State what failed and provide a recovery action when available |
| Supplemental field help | Shared HelpLabel / HelpTooltip | Only information not already conveyed by the label |

- Reuse one shared notice component built on Mantine Alert for information, warnings and errors.
  Severity determines its palette and icon. Do not construct independent variants on each page.
  PageState remains the common empty/loading/error-state entry point and should compose the
  shared notice for its error variant. Loading retains its existing skeleton/delayed indicator.
- Share icon sizing, title/body typography, spacing and action placement across notice variants.
  Use Mantine theme tokens and variants; do not add page-specific CSS, colors or spacing.
- Blue marks meaningful contextual information, not ordinary descriptions. Do not convert every
  helper sentence into a colored box. Remove redundant copy before choosing a presentation.
- Inside an existing card, do not add a second border or duplicate padding around an empty state.
  An informational notice may retain its tinted background to distinguish it from surrounding content.
- An empty list is not evidence of missing configuration. Offer Create Source or another setup
  action only when loaded data proves that this is the missing step. Loading failures and unknown
  relationships must not be treated as zero records. Filtered empty states help adjust filters.
- Relationship-scoped lists distinguish Source/Pipeline context from additional filters. Use
  CollectionEmptyState: context alone says "No … for this Source/Pipeline" without setup advice;
  dates, status, search and tags say "No … match these filters" with "Adjust or clear the filters."
  An unfiltered collection states its empty state. Preserve Inbox versus Trash context.
  Do not infer that records never existed: retention or deletion can also produce empty results.
  Apply this rule in both directions of related navigation, including globally empty collections.
- Empty states may offer one concrete next-step action when loaded data proves it is applicable.
  Replace prose-only navigation instructions with a secondary AppLink button; do not duplicate
  the button label in explanatory copy. An empty tag catalog in an assignment editor uses
  "No tags available" and "Manage tags" linking to /app/settings#tags.
  Do not show this action for unassigned tags, search/filter misses, loading or errors.
  Do not link to Settings from the tag catalog itself: its creation controls are already present.
- Keep necessary instructions and actionable states visible. A tooltip supplements a label;
  it must not duplicate a visible explanation or hide the only way to understand an unavailable action.
- Icons reinforce meaning; text conveys it without color. Decorative icons are hidden from assistive
  technology. Use polite status announcements for changing informational states and alerts for errors
  requiring attention; static explanatory notices must not interrupt screen-reader navigation.

### Required development checks

- Before changing message presentation, identify the purpose of each notice in the affected callers.
  Apply the UI verification workflow and check populated, empty, filtered, loading, error and
  unavailable-action states where applicable. Compare icon and text alignment and line wrapping
  across peers. [AGENTS.md](AGENTS.md#mandatory-workflow-for-every-ui-change)

## 13. Form layout and grouping

- Standard admin editors are left aligned and capped at 792 px, including card padding.
  Collection tables keep the available width. Code editors, payload inspectors and previews
  may use the wider detail workspace. Pipeline is also a full-width working editor:
  its header, configuration and Actions share the available width. Keep short inputs
  at a readable width (up to 24rem), while code and long content use available space.
- Use shared FormFields: at most two equal columns, one column in narrow containers.
  Long values and editors span the available form width. Field gaps are 16 px.
- A simple form uses one card. Omit a heading that merely repeats the selected tab.
- A complex form uses named fieldsets with the legend in the top border. Do not surround
  these groups with an additional card. Their legend uses 16 px / 600 and 8 px horizontal padding on both sides
  to separate text from the border. Apply this in FormGroup to every bordered fieldset;
  borderless embedded groups retain zero legend padding.
- Separate independently saved operations. Visual grouping must never alter save boundaries,
  validation, dirty-state handling or pending-state behavior.
- Card/fieldset padding is 16 px; space between groups is 24 px. Use shared patterns and Mantine
  tokens, not per-screen CSS. Fieldsets retain their native disabled and accessible group semantics.
- Source Advanced has Retention, Request limits, Payload limits and Request metadata fieldsets
  with one SaveBar below. Payload limits use two columns and three rows on desktop.
  Settings Tags uses two separate FormGroups, New tag and Existing tags, stacked 24 px apart
  without an outer card. Keep SMTP in one card and retain independent Sign-in and Password sections
  in Account. Use checkboxes for saved boolean settings and keep backup cards at one level.
- Adding a Pipeline Action collapses existing Actions without clearing drafts, opens only the new
  Action and focuses its name in view. Manual expansion may still open multiple Actions.
- Repeated Pipeline Actions remain accordions.
- Keep secondary actions before the primary Save action. Show “Unsaved changes” while dirty.
  At narrow widths, the standard SaveBar places actions above the message and hides the message
  row when clean. On desktop, keep the message area reserved to prevent layout shifts.
- Pipeline basic configuration has no redundant Configuration heading: Name, Enabled
  and Save changes share one desktop row. On narrow screens Name occupies the first
  row, with Enabled and Save below. Preserve dirty, validation and pending feedback.
- In the compact Pipeline configuration, place the message immediately before Save and stack it
  above Save in narrow containers. Keep its space reserved when clean.
- Use the shared tab, focus, label, help and notice patterns across Settings and entity editors.

## 14. Dashboard examples

- Dashboard offers Create example with a choice of a One-shot contact form or a two-step Session
  survey. Use a medium modal with two compact option rows separated by a divider. Stack the
  description and Create button on mobile.
- Explain before creation that this publishes a Built-in Form and creates a Source, a Pipeline
  with an Inbox Action, and one fictitious sample response. Examples remain ordinary editable objects.
- Use numbered names, Example Form N and Example Survey N. Keep existing configurations untouched.
- Create the linked objects and sample response atomically; protect retries and duplicate clicks.
  Process the sample through its Pipeline, never fabricate an Inbox item directly or run unrelated work.
- The completion modal explains the result and offers the Source-scoped Inbox and Open form/survey
  in a new tab. Open the public form, not preview. Keep public anti-abuse protections enabled.
- Distinguish successful creation from pending or failed sample processing. In that case link to
  the Pipeline Run instead of claiming that Inbox is populated. Do not create the graph again.
- Keep focus in the modal; focus the public-form link on completion and expose errors accessibly.

## 15. Modal dialogs

- All admin modals use the shared Mantine Modal theme, including ConfirmDialog and session renewal.
  The modal title is 20 px / 600 with a 1.3 line height; it must be visually stronger than
  both body copy and internal section headings. Do not override title typography per screen.
- Internal section headings use 16 px / 600. Body text uses 14 px, with supplementary
  descriptions in the shared dimmed color. Mantine Text must explicitly use size="sm"
  for body copy; its default size does not inherit the modal body size.
- Modal padding and gaps between related blocks are 16 px. Separate independent sections
  by 24 px. Use Mantine tokens, not local CSS. Keep actions aligned with existing dialog patterns.
- Titles wrap naturally on narrow screens; keep the close control accessible. Preserve focus
  trapping, return focus, validation, pending-state restrictions and keyboard behavior.
- Review creation, confirmation, test, session-renewal and result dialogs together when changing
  this pattern. Check desktop/mobile and both themes, including long titles and bottom actions.

## 16. Configuration bulk actions

- Sources, Built-in Forms and Pipelines reuse ResourceTable checkboxes, selected-row styling
  and the Submissions selection bar (count, actions, Clear selection). Checkbox interactions
  must never open the row detail. Keep the same controls at mobile widths.
- The configuration header checkbox selects the current page only. Changing filters clears selection; pagination preserves it. Selecting all filtered results
  is an explicit action and captures the current matching IDs, excluding future arrivals.
- Preserve entity vocabulary: Activate/Deactivate, Publish/Unpublish, Enable/Disable.
- Confirm batches with their exact item count and consequences. Permanent deletion is red.
  Sources must be inactive and Pipelines disabled before deletion; active Pipeline Runs
  remain a server-side blocker. Never implicitly change state to make deletion possible.
- A batch with known ineligible items is disabled and explains their count. Existing endpoints
  remain authoritative for validation, permissions and concurrent changes.
- Execute explicit selected IDs, guard double submission, refresh after completion and report
  partial failures by name. Keep failed items selected; never claim full success or silently skip them.

## 17. Collection selection

- Collections with bulk actions support explicit all-results selection. The header checkbox selects
  or deselects eligible records on the current page, never every result implicitly.
- Once the page is selected, offer “Select all N” next to “N selected” when more results exist.
  Keep the applicable bulk actions and Clear selection available in both sets of controls.
- Pagination preserves selection; changing search, tags or other filters clears it.
  If the current page has no eligible records but matching eligible records exist elsewhere,
  expose Select all N without requiring a page selection first.
  Draft and expired sessions are not deletable and do not contribute to the selected count.
- Capture matching IDs for all-results selection. Large server-side collections may use a server
  timestamp and filters to identify the same set. Keep the captured set stable across pagination
  and refresh, exclude later arrivals and support individual exclusions.
- Confirm the count, Source context when present, and permanent consequences.
  Submit at most 100 matching records per transaction, show progress and retain the selection
  after a failed batch so retry can continue. Keep the page open until finished; no claim
  of an autonomous background job or completion after closing the page.
- Keep controls usable at mobile widths without widening the page; only the table scrolls.

## 18. Stable asynchronous transitions

- Keep existing collection rows mounted while a changed query loads. Never flash an empty
  state or replace an already loaded table with a skeleton. Skeletons belong to initial loading.
- Only show a loading indicator after 300 ms; it must not change layout height. Mark the
  collection busy immediately for assistive technology. Do not animate data replacement.
- Previous-query rows are provisional: disable selection and bulk execution until the new
  query succeeds. Never treat an old response as the result of newer filters; ignore late responses.
- Background refresh preserves focus, scroll and selection. Selection feedback is immediate;
  no height animation or rearrangement of table controls.
- Test slow responses, overlapping searches, failed requests and recovery, not only fast local
  responses. Check desktop/mobile and both themes. Apply to every asynchronous collection.

## 19. Shared collection UX

- Submissions is the approved reference for full collection screens: Sources, Built-in Forms,
  Pipelines, Inbox, Submissions, Pipeline Runs and Waiting Callbacks.
- Use Mantine DataTable through the shared adapter. Repeat the same pagination controls above
  and below the table. Use `boundaries={1}`, `siblings={1}`, and the previous and next arrows.
  Let Mantine calculate numeric ranges and ellipses, including the first and last pages.
  Keep button widths natural. Use the shared page sizes (10, 50, 100) and default invalid or
  unspecified sizes to 10 in the UI and server queries.
- Search and tags are visible in one wrapping toolbar. Search applies after 300 ms without
  an Apply button, respects IME composition and is never repeated as an applied-filter chip.
- Put additional filters in a desktop popover/mobile modal behind Filters (active count).
  Show removable chips for applied hidden filters. Preserve filters in navigation URLs.
- Replace the result count with contextual selection actions in both table control rows.
  Do not add a separate card that shifts the table when selection changes.
- Preserve entity-specific eligibility, confirmations, side effects and vocabulary.
  Read-only lists do not acquire bulk actions. Dashboard previews and embedded relationship
  tables remain compact; do not add redundant full-list toolbars to them.
- Verify initial, populated, filtered-empty, selected, pending and error states, first/middle/last
  pages, desktop/mobile and both themes before reporting completion.

### Collection review safeguards

- Empty states accept an explicit contextual action and a separate filtered-result action.
  Open the known Source/Pipeline rather than implying it needs creation. Offer Create Source
  only after a successful empty-catalog response; a loading/failed catalog is not empty.
- Configuration bulk actions run at most four individual requests concurrently. Show completed/total
  progress while running, disable duplicate confirmation, retain failures and retry only those failures.
  Submissions and Inbox retain their server-side batches of at most 100.

### Responsive collection toolbar and dashboard previews

- Use CollectionToolbar for Search, visible tags and Filters, including Submissions.
  Search and Filters share the first row and control height. Below 720 px of available
  toolbar width, tags occupy their own row. Filters keeps its natural width; search shrinks.
  Never vertically center Filters beside a wrapped search-and-tags group.
- Below Mantine `md` (992 px), Recent Submissions shows up to five compact linked rows with the
  Source name, received time and state. Omit repeated field labels, tags and action menus.
  Place View all Submissions below the preview. Desktop retains ten table records.

## Email Action presentation

- New Email Actions default to Formatted. Offer JSON as the alternative in Content format.
- Subject is required and editable, initially filled with the current Source name.
  Renaming a Source must not overwrite an Action's saved subject.
- Use a shared FormFields row for Recipients and Content format, followed by a full-width Subject.
  Start Recipients at one line and grow the field as needed.
- Formatted emails include HTML and plain text, use Source schema titles where available,
  retain unmatched keys and all values, and escape user content in HTML.
- Store these options in the existing Action configuration JSON, without a schema migration.
- Existing Email Actions without these options retain JSON and "Forman pipeline output".
  Email Confirmation remains a separate Action.

## Pipeline Action summaries

- Expanded and collapsed Actions share the same compact header.
- Put the accordion chevron before the name. Group the bold numbered name and muted
  Type/Processing text together; do not spread them into fixed table-like columns.
  Label the type explicitly (Type: Inbox), even when it matches Name. Keep status and
  reorder/menu controls on the right. Truncate long summaries without displacing controls.
- On mobile, keep the name and controls above a wrapping metadata row.
- Keep reorder/menu buttons separate from the accordion toggle and retain keyboard access.

### Action validation

- Required Action fields carry the same asterisk as other admin inputs, including
  fields with a separate label. Previously configured secrets stay optional.
- On Save, show a specific error below each invalid field and focus the first one.
  Never blame the name when a different field is missing.
- Distinguish missing email recipients from invalid email addresses.
- Editing a field clears its previous error; revalidate on the next Save.
  Keep server-only failures visible and preserve the draft.

### Expanded Pipeline Actions

- Use the same bordered FormGroup as Settings for General (Name, Type, Enabled),
  type-specific fields and Execution. Legends, padding and group spacing follow §13.
  The accordion is the expandable Action wrapper; do not substitute loose headings
  or add another card around the groups. Omit type-specific groups without fields.
- Keep Action headers full width. Cap the expanded form, including its SaveBar, at
  the shared formWidth (792 px), aligned left like Settings.
- Use shared FormFields: two equal columns where the container permits, one on narrow
  screens, with md spacing. Long text and code span both columns. Apply this grid to
  General, type-specific configuration, Execution and condition rules.
- Execution groups Run condition, Maximum attempts and applicable failure settings.
  Show editable Blocking only where supported; fixed processing mode stays in the header.
- Keep the existing per-Action SaveBar, required markers and field-level validation.

## Dropdown selection

- Admin Mantine Select options use no checkmark and normal text weight, with equal
  text indentation. The committed value has a soft violet background and readable
  dark text in both themes. Hover uses the neutral library background; keyboard
  navigation adds a 2 px inset outline and never masquerades as a committed value.
- Enforce this in AdminTheme, including custom option renderers such as tag colors
  and the DataTable page-size menu.
  Preserve disabled states, search, keyboard navigation and ARIA semantics.
- Native selects retain browser/OS rendering; public forms and the vanilla pop-up
  are outside the admin theme. Do not emulate native menus with page-specific CSS.

## Submission and Inbox detail data

- Both details call their primary content Data. Render fields in source order as a shared
  label–value list, with a fixed 180 px label column on desktop and stacked labels on mobile.
  Preserve multiline text and wrap long values; nested data remains readable without truncation.
- Both Submission and Inbox Data use the shared Fields/JSON control; Fields is the default.
  JSON represents the same data as Fields. Keep the Submission Pipeline Runs table.
  Submission session counters sit in a muted inline footer inside Data, separated by
  a subtle divider. Show Technical details there only when User-Agent or Referer exists;
  it expands those values using DetailRow. Omit the footer when no metadata exists.
  Inbox supplemental technical metadata remains collapsed after Data.
- Inbox header metadata: plain Source name, Received timestamp, ID. Related navigation
  stays in the actions menu; do not add an Action name or relationship links to this row.
- Submission uses the same metadata order, preceded by its meaningful lifecycle status.
  Omit the Source type from the Submission header. Render nonempty tags separately.
- Other detail headers omit redundant object labels (Source, Pipeline, Built-in Form).
  Retain useful status and distinguishing Source type; keep ID last.
  Pipeline Runs show status, Started timestamp and ID beneath the Pipeline name.
- Metadata wraps naturally on narrow screens; do not truncate IDs or add a separate
  metadata row on desktop. Do not render empty Tags placeholders.

## Table column widths

- Tables and their top/bottom controls span the available width. Tags absorbs spare space
  with a minimum of 280 px; do not add a filler column.
- Use tableColumnWidths in ResourceTable and direct DataTable callers. No proportional
  distribution across all columns or per-screen stretching. Source is 260 px in tagged lists.
  Without Tags, the main name (Name/Source/Pipeline/Preview) absorbs spare space.
- Use the shared widths in pixels. Name, Pipeline and Action use 260, Inbox Preview uses 420,
  timestamps use 176, and Type uses 112. Status, State and Progress use 160. The selection column
  uses 44 and the action menu uses 64. Allow 96 for Action counts, 104 for Pipeline counts and
  140 for Submission counts.
- On narrow screens, constrain the outer table to available width and scroll its contents.
  Do not shrink semantic columns. Keep pagination/bulk controls within the visible wrapper.
- Tags retain wrapping, their two-tag preview and overflow control. Preserve accessible
  full names when truncating. Apply this rule to embedded tables as well as full lists.

## Pipeline Run presentation

- Pipeline Runs Progress uses `X / Y`: completed Actions / total Actions. Use the same
  compact text in global and embedded lists; execution outcome belongs in Status.

- Pipeline Run Actions reuse the compact Action summary with a leading chevron, type, attempt
  summary and status. Show Updated once beside the payload label, aligned right. Use the Output
  label when the payload changed. Display payloads as compact JSON with `xs` section gaps and 4 px
  between each label and its code. Keep input, output, errors and retries distinguishable.

## Overflow and global collection actions

- Use DataTable's native edge shadows to indicate horizontal overflow, including before
  pinned actions. Keep them visible in both themes, only on sides with hidden content;
  do not add permanent arrows, extra help text or a second scroll-state implementation.
- Hide Empty Trash only when loaded data confirms the entire Trash is empty.
  A filtered empty result is not an empty Trash. Disable the action during loading
  or failed loading; retain the confirmation before permanent deletion.
