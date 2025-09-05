ProjectInstructions_FileChanges.md
# Project Instructions — File Changes

This document defines how ChatGPT should help with file edits across the Skovgard2026 project.

---

## Overall Goal
The goal of these instructions is to **mirror the dynamic project files on the local machine inside the ChatGPT project files folder**.  
By following these rules, we ensure that edits stay synchronized, reproducible, and auditable across both environments.

---

## Rule 1 — Always Review Files First
- Never propose edits blind.  
- Always request the relevant file(s) before suggesting changes.  
- If not already uploaded, instruct Anchor to run the **zip command** from Quick Reference and provide the files for review.

### Canonical Zip Command
```bash
cd "/home/anchor/projects/skovgard2026"
zip -r "site-review.zip" \
  "config/_default/config.toml" \
  "content" \
  "layouts" \
  "static/css" \
  "static/js" \
  "static/images" \
  "static/finance" \
  "data" \
  "archetypes" \
  -x "public/*" "resources/*" ".git/*" "**/.DS_Store" "**/node_modules/*"


⚠️ If a new root-level folder is added locally (for example, data/ or worker/), this zip command must be modified to include that folder. Otherwise, the chat project files will drift from the local project.

Rule 2 — Use Uploaded Snapshots

Prefer working from site-bundle.txt and site-binary-assets.txt when available.

If needed, confirm changes by checking site-all.zip (binary) or site-zip-manifest.csv (tree).

Always use date-based naming convention for snapshots:

site-review-YYYY-MM-DD.zip

site-bundle-YYYY-MM-DD.txt

site-binary-assets-YYYY-MM-DD.txt

site-zip-manifest-YYYY-MM-DD.csv

site-all-YYYY-MM-DD.zip (optional full snapshot)

tree-YYYY-MM-DD.txt (project folder structure snapshot)

Canonical Tree Command
cd "/home/anchor/projects/skovgard2026"
tree archetypes config content layouts static -L 4 > tree-YYYY-MM-DD.txt


Purpose:
This captures the top-level structure of the project (archetypes, config, content, layouts, static) up to 4 levels deep.
It tracks what files and folders exist, highlights changes such as new content pages, renamed or removed files, and ensures consistency between local and chat project files.

⚠️ If a new root-level folder is added locally, the tree command and the zip command must both be modified to include that folder.

Rule 3 — Edit Cycle

ChatGPT produces the modified file in chat.

Anchor downloads the new file.

Anchor deletes the old version in ChatGPT project space.

Anchor uploads the revised file (with date-based name).

Verify locally with hugo server -D.

Commit and push changes.

ChatGPT must prompt after each change:

✅ Ready to update the project files located here in ChatGPT to mirror the files on your local machine after this change?

Rule 4 — Project-Specific Instructions

Finance updates: Follow CampaignFinance_CHATGPT_INSTRUCTIONS.pdf and always use campain finance template.md.

Wyoming voter file: Follow WyomingVoterFileCHATGPT_INSTRUCTIONS.md. Always output in step-block format.

General edits: Respect the style rules in the Rulebook (Skovgard2026 – Project Rulebook).

Rule 5 — Security & Integrity

Never touch Firebase auth, Hugo layouts, Firestore rules, or UX-critical files without explicit request and confirmation.

Always provide both before and after code when editing.

If blocked, request the minimal zip needed.

✅ With this process, edits stay reproducible, auditable, and in sync across local and project files.


---

Would you like me to **prepare this as a ready-to-upload `ProjectInstructions_FileChanges.md` file** so you can drop it straight into your chat project folder and replace the older version?
