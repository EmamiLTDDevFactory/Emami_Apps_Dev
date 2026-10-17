# Mega prompt for building a non-SAP app on Emami Apps

The consolidated, ordered prompt set used to build Setu Helpdesk (Oct 2026), for reuse on any future non-SAP app:
a master prompt, an inputs table, 18 phase prompts with checkpoints (from syncing the repo to deploying on
dev.emamiapps.in), security / performance / no-impact checklists, every original request, and lessons learned.

- `Emami Apps - Non-SAP App Mega Prompt.docx` - editable version
- `Emami Apps - Non-SAP App Mega Prompt.pdf` - read-only version (same content)

How to use: fill in the inputs table, paste the master prompt into a new Claude Code session in this repository,
then give the phase prompts in order, checking each checkpoint before moving on. It contains no credentials -
share those only through a secure channel or the gitignored `.env`.

After editing the Word file, refresh its contents list (right-click > Update Field) and re-export the PDF.
