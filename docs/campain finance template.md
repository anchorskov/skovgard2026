# Campaign Finance Content Template
Updated: 2026-05-03

Use this as the variable checklist and note format when updating `content/finance/_index.md` and `src/pages/finance/index.astro`.

---

## Variable Checklist

| Variable | Description | Example |
|----------|-------------|---------|
| `{{MONTH YEAR}}` | Full month and year | April 2026 |
| `{{MONTH}}` | Month name only | April |
| `{{MONTH_START_DATE}}` | First of month short form | Apr 1 |
| `{{MONTH_END_DATE}}` | Last of month short form | Apr 30 |
| `{{BALANCE_FORWARD}}` | Prior month ending balance | 2,618.60 |
| `{{CONTRIBUTIONS_THIS_MONTH}}` | Gross contributions this month | 1,511.85 |
| `{{EXPENDITURES_THIS_MONTH}}` | Cash expenditures this month | 1,621.04 |
| `{{CASH_ON_HAND}}` | Ending cash (all accounts + held − outstanding) | 2,509.41 |
| `{{DEBTS}}` | Outstanding obligations at month-end | 0.00 |
| `{{YTD_CONTRIBUTIONS}}` | Cumulative gross contributions | 8,758.06 |
| `{{YTD_EXPENDITURES}}` | Cumulative expenditures | 6,248.65 |
| `{{NOTES}}` | Narrative paragraph (see format below) |  |

---

## content/finance/_index.md — Fill-in Format

```markdown
---
title: "Campaign Finance"
---

Below is our monthly summary for the campaign. We update this page at the start of each month.

## Current Month Summary

- **Reporting month:** {{MONTH YEAR}}
- **Balance forward (as of {{MONTH_START_DATE}}):** ${{BALANCE_FORWARD}}
- **Contributions received in {{MONTH}}:** ${{CONTRIBUTIONS_THIS_MONTH}}
- **Expenditures in {{MONTH}}:** ${{EXPENDITURES_THIS_MONTH}}
- **Cash on hand at {{MONTH_END_DATE}}:** ${{CASH_ON_HAND}}
- **Debts and obligations:** ${{DEBTS}}

*Notes:* {{NOTES}}

### Campaign totals
- **Total contributions through {{MONTH_END_DATE}}, 2026:** ${{YTD_CONTRIBUTIONS}}
- **Total expenditures since launch 04/24/2025:** ${{YTD_EXPENDITURES}}
- **Cash on hand (as of {{MONTH_END_DATE}}):** ${{CASH_ON_HAND}}

For detailed line-item contributions and expenses, please see the PDFs posted below.

---

## Expense PDFs
Latest: [{{MONTH YEAR}} Expenses](/finance/YYYY-MM-Expenses.pdf)

## Contribution PDFs
Latest: [{{MONTH YEAR}} Contributions](/finance/contributions/YYYY-MM-Contributions.pdf)

---

### Federal Election Commission Filing
Skovgard for Senate is registered with the FEC under **Committee ID C00903369**.
```

---

## src/pages/finance/index.astro — Fields to Update

1. **PDF arrays** — add the new month at the top of both `expensePDFs` and `contributionPDFs`.
2. **Current Month Summary heading** — `Current Month Summary: {{MONTH YEAR}}`
3. **Summary data fields** — five values: balance forward, contributions, expenditures, cash on hand, debts.
4. **Narrative paragraph** — same text as the `_index.md` notes.
5. **Campaign Totals section** — three values: YTD contributions, YTD expenditures, cash on hand.

---

## Notes Format

The `{{NOTES}}` paragraph should cover in order:
1. Contributions — list named donors, WinRed/Anedot processor totals, and any processor-held amounts.
2. Expenditures — list each vendor, purpose, and amount. Note processor fees as a combined line.
3. Internal transfers — identify by check number and destination account (e.g., Hilltop).
4. Outstanding items — any checks written but not yet cleared.
5. Cash on hand components — primary bank balance, Hilltop balance, Stripe-held if any.

**Example (April 2026):**
> April contributions include $1,000.00 from Eric and Pamela Hutchins, $250.00 from Wendy Henderson,
> $100.00 from Beverly Dye, $100.00 from William Plumer, $15.00 from C. Jolley, an additional $46.85
> in WinRed contributions, and processor-held Stripe funds of about $96.80 at month-end. Expenditures
> include $342.50 to The Hangar for event space, $157.50 to The Hangar for venue rental, $625.00 to the
> Wyoming Republican Party for state GOP table rental, $400.00 to KOSA for a candidate announcement,
> $50.00 to the Natrona County Republican Party, and $46.04 in processor fees and fee adjustments.
> Check 1007 ($200.00) was an internal transfer to the Hilltop account and is not counted as an
> expenditure. Cash on hand reflects the primary bank balance, Hilltop account balance, and Stripe-held
> balance.

---

## Math Checks

```
# Monthly balance
begin_balance + contributions - expenditures = cash_on_hand
{{BALANCE_FORWARD}} + {{CONTRIBUTIONS_THIS_MONTH}} - {{EXPENDITURES_THIS_MONTH}} = {{CASH_ON_HAND}}

# YTD
prior_ytd_contributions + contributions_this_month = {{YTD_CONTRIBUTIONS}}
prior_ytd_expenditures  + expenditures_this_month  = {{YTD_EXPENDITURES}}
```

Always verify before updating the page.
