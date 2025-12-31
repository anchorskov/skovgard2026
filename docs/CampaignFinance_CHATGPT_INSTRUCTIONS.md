# CampaignFinance_CHATGPT_INSTRUCTIONS  
Updated: 2025-10-01

## Purpose
Maintain transparent, accurate monthly finance reporting on **skovgard2026.org**, aligned with FEC rules and reconciled to the bank. Keep the public page simple and the back office precise.

## Inputs
- Google Sheets monthly ledger: contributions, expenditures, in-kind.
- Bank CSV or statement: verify cash on hand and dates.
- Anedot dashboard: gross receipts and processing fees.
- Local project repo at `/home/anchor/projects/skovgard2026`.

## Style and Paths
- Step-Block format, command tone, inclusive “we/us,” no em dashes.
- Reference exact paths:
  - Page: `content/finance/_index.md`
  - PDFs: `static/finance/YYYY-MM-Expenses.pdf`
  - PDFs: `static/finance/contributions/YYYY-MM-Contributions.pdf`
  - Symlinks:  
    - `static/finance/latest-Expenses.pdf` → latest month  
    - `static/finance/contributions/latest-Contributions.pdf` → latest month
- Use `campain finance template.md` as the canonical content template.

---

## Monthly Workflow

**1) Gather data**
- Export or copy the month’s rows from Google Sheets.
- Download bank activity CSV or read the statement for the same month.
- From Anedot, capture **gross** contributions. Processing fee is **4% + $0.30** per transaction.

**2) Normalize**
- Contributions: list by date, name, employer/occupation if available, amount.
- Candidate funds: record as contributions; if paid out-of-pocket for an expense, also record as **in-kind** expenditure.
- Processing fees: record as **expenditure** (Fundraising or Fees). Do not net against contribution on the site totals.
- In-kind: add to both Contributions and Expenditures for the correct month. Does not affect bank cash.

**3) Calculate**
- Monthly totals:
  - `contrib_month = sum(all contributions including candidate and in-kind)`
  - `exp_month = sum(all expenditures including fees and in-kind)`
- Reconcile cash:
  - `end_balance = begin_balance + contrib_month - exp_month`
  - Verify `end_balance` equals bank ending balance for the month.
- YTD:
  - `contrib_ytd += contrib_month`
  - `exp_ytd += exp_month`
  - `cash_on_hand = contrib_ytd - exp_ytd` must equal bank as of month end.

**4) Produce PDFs**
- Contributions PDF file name: `static/finance/contributions/YYYY-MM-Contributions.pdf`
- Expenses PDF file name: `static/finance/YYYY-MM-Expenses.pdf`
- Include a header, table with Date, Name/Vendor, Category, Amount, and a monthly total line.
- Letter size, portrait. Keep clean and legible.

**5) Update finance page**
- Edit `content/finance/_index.md`
  - Set “Reporting month”
  - Set Balance forward, Contributions, Expenditures, Cash on hand, Debts
  - Update YTD snapshot
  - Keep “Notes” concise: list notable donors, candidate in-kind, large vendors, and fee handling.

**6) Symlinks (optional convenience)**
```bash
# From repo root
ln -sf "2025-09-Expenses.pdf" static/finance/latest-Expenses.pdf
ln -sf "2025-09-Contributions.pdf" static/finance/contributions/latest-Contributions.pdf
```

**7) Verify and publish**
```bash
hugo server -D
# Open http://localhost:1313/finance/ and check links, month, and totals

git add content/finance/_index.md static/finance/*.pdf static/finance/contributions/*.pdf
git commit -m "Finance: update YYYY-MM with PDFs and reconciled totals"
git push
```

---

## FEC Guidance

**Committee:** Skovgard for Senate • **FEC ID:** **C00903369**

**Thresholds**
- Under **$5,000** raised or spent: no periodic Form 3 yet.
- At or above **$5,000**: begin **Form 3** quarterly reporting. First Form 3 must include all activity from before crossing the threshold.
- Electronic filing becomes mandatory at higher totals. We will start with Webforms and move to FECFile when appropriate.

**Transparency while under $5,000**
- File a voluntary **Form 99: Miscellaneous Report** to keep the federal record current.

Form 99 link:  
👉 https://webforms.fec.gov/wfja/form99

**Form 99 text template**
```
Skovgard for Senate (FEC ID: C00903369) is voluntarily submitting this Form 99 for transparency.

Reporting period: [e.g., July 1 – September 30, 2025]

Total contributions to date: $[YTD contributions]
Total expenditures to date: $[YTD expenditures]
Cash on hand as of [month end date]: $[COH]

The committee remains under the $5,000 threshold that triggers required quarterly reporting. 
Full monthly summaries and supporting PDFs are posted at https://www.skovgard2026.org/finance.
Our first Form 3 will be filed once the statutory threshold is crossed.
```

**When we cross $5,000**
- Prepare **Form 3** for the appropriate quarterly period.
- Include all activity from the cycle start or committee formation through the quarter end.
- Ensure bank reconciliation and PDF support are complete before submission.

---

## Anedot Net vs Gross
- Record **gross** contribution on Contributions.
- Record the processing fee as an **Expenditure**: category “Fundraising” or “Fees.”
- Bank deposits show **net** amount. Reconciliation uses the formula with gross receipts and recorded fees so cash still matches the bank.

---

## Edge Cases and Rules
- Back-date in-kind to the month incurred. If discovered late, move it to the correct month in both PDFs and page notes.
- Never publish sensitive PII beyond FEC norms. Name and amount are fine for the public PDFs.
- Keep amounts to two decimals. Use ISO dates in tables.
- Round only at display time. Store precise values in Sheets.

---

## Example: September 2025
- Balance forward: **$661.40**
- Contributions in September: **$2,249.00**  
  - Heather Yeager $1,000.00  
  - Candidate $1,200.00 total including $49.00 in-kind legal drafting  
- Expenditures in September: **$2,223.00**  
  - L2 Inc $1,973.70  
  - Clerk of District Court $160.00  
  - Anedot fee $40.30  
  - Candidate in-kind legal drafting $49.00  
- Cash on hand at Sep 30: **$687.40**  
- YTD contributions example including opening $500: **$4,661.95**  
- YTD expenditures example: **$3,974.55**

Use these as a pattern only. Replace with current month’s figures.

---

## WSL Quick Commands

**Move PDFs from Windows Downloads**
```bash
mv "/mnt/c/Users/ancho/Downloads/2025-09-Expenses.pdf"    /home/anchor/projects/skovgard2026/static/finance/

mv "/mnt/c/Users/ancho/Downloads/2025-09-Contributions.pdf"    /home/anchor/projects/skovgard2026/static/finance/contributions/
```

**Verify**
```bash
ls /home/anchor/projects/skovgard2026/static/finance/
ls /home/anchor/projects/skovgard2026/static/finance/contributions/
```

---

## QA Checklist
- [ ] PDFs exist with correct names and totals.
- [ ] `_index.md` month, YTD, and COH match the bank.
- [ ] Anedot fee recorded on Expenditures, not netted from Contributions.
- [ ] In-kind added to both Contributions and Expenditures for the correct month.
- [ ] Finance page renders the newest month links.
- [ ] If under $5,000, Form 99 filed with the current memo and totals. If over, prepare Form 3.
