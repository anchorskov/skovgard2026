# CampaignFinance Instructions
Updated: 2026-05-03

## Purpose
Maintain transparent, accurate monthly finance reporting on **skovgard2026.org**, aligned with FEC rules and reconciled to the bank. Keep the public page simple and the back office precise.

## Where this file lives
`/home/anchor/projects/skovgard2026/docs/CampaignFinance_CHATGPT_INSTRUCTIONS.md`

Do not reference `/mnt/data/` — that path does not exist in this environment.

---

## Framework: Astro (not Hugo)

This project migrated from Hugo to Astro in early April 2026. All finance page edits target the Astro environment.

- **Live finance page:** `src/pages/finance/index.astro` — this is what renders at `/finance/`.
- **Parallel record:** `content/finance/_index.md` — human-readable ledger kept in sync with the Astro page. Not routed by Astro; kept for reference and audit trail.
- **Dev server:** `npm run dev` (port 4321). Preview at `http://localhost:4321/finance/`.
- Do not run `hugo server` — no Hugo binary exists on this branch.

---

## Inputs
- Bank statement (Wells Fargo primary account): beginning balance, deposits, withdrawals, ending balance.
- Hilltop account statement: ending balance at month-end (second campaign account).
- Stripe dashboard: succeeded payments, payout dates, fees. Export balance transactions for confirmation.
- WinRed report: gross contributions, fees, net payouts, refunds.
- Anedot dashboard: gross receipts and processing fees (4% + $0.30 per transaction).
- Check register: payee, amount, date posted, date written, memo.

---

## File Paths

| Purpose | Path |
|---------|------|
| Live Astro page | `src/pages/finance/index.astro` |
| Parallel markdown record | `content/finance/_index.md` |
| Expense PDFs | `static/finance/YYYY-MM-Expenses.pdf` |
| Contribution PDFs | `static/finance/contributions/YYYY-MM-Contributions.pdf` |
| Latest expense symlink | `static/finance/latest-Expenses.pdf` |
| Latest contribution symlink | `static/finance/contributions/latest-Contributions.pdf` |
| Content template | `docs/campain finance template.md` |

---

## Monthly Workflow

**1) Gather data**
- Pull bank statement for the month: beginning balance, all deposits and withdrawals, ending balance.
- Pull Hilltop account statement: ending balance only (or full activity if there was movement).
- From Stripe: export succeeded payments and payout report. Note any processor-held amounts at month-end (payouts that land after the last business day).
- From WinRed: download contribution report. Record gross, fee, and net for each succeeded contribution. Note refunds and refund fees separately.
- From Anedot: capture gross contributions and fees. Confirm net matches bank deposit.
- Review check register: categorize each check as expenditure, internal transfer, or outstanding.

**2) Classify transactions**

| Type | Treatment |
|------|-----------|
| Contributions (gross) | Add to contributions total |
| Processing fees | Record as expenditure — do not net against contributions |
| Internal account transfers | Exclude from both contributions and expenditures |
| Failed / incomplete charges | Exclude entirely |
| Refunds | Exclude from contribution totals; note separately if audit clarity needed |
| Outstanding checks | Treat as debts/obligations if using cash basis; move to expenditures once cleared |
| Processor-held balances | Add to cash on hand; note expected payout month |

**3) Calculate**
```
contrib_month  = sum(all succeeded gross contributions)
exp_month      = sum(all cash expenditures + processor fees)
end_balance    = begin_balance + net_deposits - cash_withdrawals

cash_on_hand = primary_bank_ending
             + hilltop_account_ending
             + processor_held_at_month_end
             - outstanding_checks_at_month_end
```

Verify `end_balance` equals primary bank ending balance. Verify `cash_on_hand` reconciles to bank + Hilltop + held funds.

YTD:
```
contrib_ytd += contrib_month
exp_ytd     += exp_month
```

**4) Generate PDFs**

PDFs are generated with Python + ReportLab. Use the existing script pattern from prior months:

```bash
python3 << 'EOF'
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

def make_finance_pdf(out_path, title, rows, total_label, col2_header="Vendor"):
    W, H = letter
    c = canvas.Canvas(out_path, pagesize=(W, H))
    c.setTitle(title); c.setAuthor("(anonymous)")
    c.setCreator("(unspecified)"); c.setSubject("(unspecified)"); c.setKeywords("")
    TABLE_LEFT, TABLE_TOP, ROW_H, TABLE_W = 46, 674, 18, 520
    COL_DIVS, TEXT_X = [90, 290, 450], [6, 96, 296, 456]
    n = len(rows); table_h = (n + 1) * ROW_H; table_bot = TABLE_TOP - table_h
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(TABLE_LEFT + TABLE_W / 2, TABLE_TOP + 22, title)
    c.setFillColorRGB(0.827451, 0.827451, 0.827451)
    c.rect(TABLE_LEFT, TABLE_TOP - ROW_H, TABLE_W, ROW_H, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica-Bold", 10)
    for i, hdr in enumerate(["Date", col2_header, "Category", "Amount"]):
        c.drawString(TABLE_LEFT + TEXT_X[i], TABLE_TOP - ROW_H + 5, hdr)
    c.setFont("Helvetica", 10)
    for row_i, (date, name, category, amount) in enumerate(rows):
        y = TABLE_TOP - (row_i + 2) * ROW_H + 5
        c.drawString(TABLE_LEFT + TEXT_X[0], y, date)
        c.drawString(TABLE_LEFT + TEXT_X[1], y, name)
        c.drawString(TABLE_LEFT + TEXT_X[2], y, category)
        aw = stringWidth(amount, "Helvetica", 10)
        c.drawString(TABLE_LEFT + TABLE_W - 6 - aw, y, amount)
    c.setStrokeColorRGB(0.501961, 0.501961, 0.501961); c.setLineWidth(0.5)
    c.setLineCap(1); c.setLineJoin(1)
    c.rect(TABLE_LEFT, table_bot, TABLE_W, table_h, fill=0, stroke=1)
    for i in range(1, n + 1):
        c.line(TABLE_LEFT, table_bot + i * ROW_H, TABLE_LEFT + TABLE_W, table_bot + i * ROW_H)
    for div_x in COL_DIVS:
        c.line(TABLE_LEFT + div_x, table_bot, TABLE_LEFT + div_x, TABLE_TOP)
    c.setFont("Helvetica", 10); c.setFillColorRGB(0, 0, 0)
    c.drawString(78, table_bot - 22, total_label)
    c.save(); print(f"Created: {out_path}")
EOF
```

Column layout: Date | Vendor/Name | Category | Amount (right-aligned). Letter portrait. Gray header row. Gray grid lines.

After generating, update symlinks:
```bash
cd static/finance
ln -sf "YYYY-MM-Expenses.pdf" latest-Expenses.pdf
cd contributions
ln -sf "YYYY-MM-Contributions.pdf" latest-Contributions.pdf
```

Verify with:
```bash
python3 -c "
import pypdf
r = pypdf.PdfReader('static/finance/YYYY-MM-Expenses.pdf')
print(r.pages[0].extract_text())
"
```

**5) Update finance page**

Update **both** files to keep them in sync:

**`src/pages/finance/index.astro`** (the live page — this is what users see):
- Add the new month at the top of `expensePDFs` and `contributionPDFs` arrays.
- Update the Current Month Summary section: heading, all five data fields, and the narrative paragraph.
- Update the Campaign Totals section: contributions, expenditures, cash on hand.

**`content/finance/_index.md`** (the parallel record):
- Update the same fields and narrative using the template in `docs/campain finance template.md`.
- Update the "Latest" PDF links at the bottom.

Use `docs/campain finance template.md` as the canonical variable list and note format.

**6) Verify and publish**
```bash
# Preview
npm run dev
# Open http://localhost:4321/finance/ and confirm month, links, and totals

# Check changed files
git diff -- content/finance/_index.md src/pages/finance/index.astro
git status --short

# Stage and commit
git add src/pages/finance/index.astro \
        content/finance/_index.md \
        static/finance/YYYY-MM-Expenses.pdf \
        static/finance/contributions/YYYY-MM-Contributions.pdf \
        static/finance/latest-Expenses.pdf \
        static/finance/contributions/latest-Contributions.pdf
git commit -m "Finance: update YYYY-MM with PDFs and reconciled totals"
git push
```

---

## Multi-Processor Treatment

### Stripe
- Record **gross** contribution on Contributions PDF and page total.
- Record **processing fee** as Expenditure (Processing Fee).
- Stripe batches payouts: a single bank deposit may cover multiple contributions.
- Contributions charged late in the month may land as processor-held at month-end. Add to cash on hand; note expected payout month.

### WinRed
- Record **gross** contribution on Contributions PDF.
- Record **fee** (and refund fee if applicable) as Expenditure.
- WinRed deposits net amounts to the bank. Reconcile gross − fees = net bank deposit.
- Refunds reduce the WinRed net payout; record refund fees as expenditures if material.

### Anedot
- Anedot fee schedule: **4% + $0.30** per transaction.
- Record **gross** on Contributions, **fee** as Expenditure.
- Confirm with Anedot export before finalizing if gross is estimated from net.

---

## Cash on Hand Formula

```
cash_on_hand = primary_bank_ending_balance
             + hilltop_account_ending_balance
             + stripe_processor_held_net
             - outstanding_checks_at_month_end
```

- **Hilltop account:** second Wells Fargo account used for internal transfers. Check 1007 ($200, April 2026) is the funding transfer — not an expenditure.
- **Processor-held:** Stripe payouts that succeed before month-end but deposit after. Estimate net as gross − fee until Stripe export confirms exact amount.
- **Outstanding checks:** checks written in the month but not yet cleared. Treat as debts/obligations on cash basis until they post.

---

## FEC Status (as of April 30, 2026)

**Committee:** Skovgard for Senate  
**FEC ID:** C00903369  
**Total contributions to date:** $8,758.06 — **over the $5,000 threshold**

The $5,000 threshold has been crossed. **Form 3 filing is now required** on the quarterly schedule. The first Form 3 must include all activity from committee formation through the applicable quarter end.

**Filing schedule (Senate):**
- Quarterly reports due: April 15, July 15, October 15, January 31.
- Electronic filing required once the committee exceeds $50,000 in a calendar year.
- Use FECFile or the FEC web portal.

**Form 3 filing checklist:**
- [ ] Itemize contributions of $200 or more (name, address, employer, occupation, date, amount).
- [ ] List all expenditures with payee, address, date, amount, and purpose.
- [ ] Reconcile cash on hand to bank statements.
- [ ] Include all processor fees as disbursements.
- [ ] Do not include internal account transfers as receipts or disbursements.

FEC webforms: https://webforms.fec.gov/  
FEC committee page: https://www.fec.gov/data/committee/C00903369/

---

## Edge Cases and Rules
- Internal transfers between campaign accounts are not contributions or expenditures. Label clearly (e.g., "Acct Xfer — Hilltop").
- Back-date transactions to the month incurred. If discovered late, correct the relevant month's PDF and notes.
- Never publish sensitive PII beyond FEC norms. Name and gross amount are public; address, employer, and occupation are FEC-required on Form 3 but not on the public page.
- Amounts to two decimal places. ISO dates (YYYY-MM-DD) in PDF tables.
- Wells Fargo monthly service fees: record as Expenditure if charged; omit or offset if reversed in the same month (net $0).

---

## QA Checklist
- [ ] Expense PDF exists with correct name, all rows, and correct total.
- [ ] Contributions PDF exists with correct name, all rows, and correct total.
- [ ] Symlinks updated to new month.
- [ ] `src/pages/finance/index.astro`: month heading, all five summary fields, narrative, and campaign totals updated.
- [ ] `content/finance/_index.md`: same fields and narrative updated.
- [ ] Math: begin + contrib − exp = end_balance. YTD figures carry forward correctly.
- [ ] Cash on hand accounts for all accounts + processor-held − outstanding.
- [ ] Processor fees recorded as expenditures, not netted from contributions.
- [ ] Internal transfers excluded from both contributions and expenditures.
- [ ] Finance page renders at `http://localhost:4321/finance/` with correct month and working PDF links.
- [ ] Form 3 prepared and filed for the applicable quarterly period (threshold crossed).

---

## WSL Quick Commands

**Move PDFs from Windows Downloads**
```bash
mv "/mnt/c/Users/ancho/Downloads/YYYY-MM-Expenses.pdf" \
   /home/anchor/projects/skovgard2026/static/finance/

mv "/mnt/c/Users/ancho/Downloads/YYYY-MM-Contributions.pdf" \
   /home/anchor/projects/skovgard2026/static/finance/contributions/
```

**Verify PDF content**
```bash
python3 -c "
import pypdf
for f in [
  'static/finance/YYYY-MM-Expenses.pdf',
  'static/finance/contributions/YYYY-MM-Contributions.pdf',
]:
    r = pypdf.PdfReader(f)
    print(r.pages[0].extract_text())
    print()
"
```
