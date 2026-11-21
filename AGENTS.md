# Project instructions

- Run development commands and application runtimes inside Docker Sandbox.
- Use Conventional Commits 1.0.0 for commit messages. [Specification](https://www.conventionalcommits.org/en/v1.0.0/)
- Consult the documentation bundled in `node_modules/next/dist/docs/` when changing Next.js code or configuration.
- Keep the pop-up script vanilla JavaScript.
- Avoid repeated broad test runs without new evidence. Use targeted checks for the changed behavior and report exactly what was verified.
- Ask before introducing compatibility aliases or legacy fallbacks. Discuss data-preserving database migrations separately from renames.

## Mandatory workflow for every UI change

1. Read the relevant design rules and inventory every affected screen, caller and state before editing. [DESIGN.md](DESIGN.md)
2. Make the change in the shared component and update affected callers together. Preserve validation, save boundaries, dirty state, keyboard navigation and pending-state behavior. Ask before introducing a design exception.
3. Check the real UI in the integrated browser at desktop and mobile widths in both themes. Scroll to the bottom of each affected screen and check keyboard focus. Compare card padding, first-section offsets, action alignment and visual hierarchy across peer screens.
4. Report the exact screens, viewports and states checked. If browser access is blocked or only a sample was reviewed, describe the remaining visual verification as incomplete.

- For notices, empty states and forms, follow §§12–13. Offer a concrete action only when loaded data establishes that it applies. Check which actions the current view already offers.
- For collections, follow §§17–19 and the table-width rules. Verify shared search, filters, pagination and selection. Selected IDs survive pagination, reset when filters change and exclude later arrivals from all-results selection.
- Check fixed Source widths across tagged lists, the Tags minimum width of 280 px, aligned top and bottom controls, and the pinned right-edge action menu. [Table column widths](DESIGN.md#table-column-widths)
