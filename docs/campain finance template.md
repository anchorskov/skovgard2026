---
title: "Campaign Finance"
resources:
- src: css/finance.css
---

Below is our monthly summary for the campaign. We update this page at the start of each month.

## Current Month Summary

- **Reporting month:** {{MONTH YEAR}}  
- **Balance forward (as of {{MONTH START DATE}}):** ${{BALANCE_FORWARD}}  
- **Contributions received in {{MONTH}}:** ${{CONTRIBUTIONS_THIS_MONTH}}  
- **Expenditures in {{MONTH}}:** ${{EXPENDITURES_THIS_MONTH}}  
- **Cash on hand at {{MONTH END DATE}}:** ${{CASH_ON_HAND}}  
- **Debts and obligations:** ${{DEBTS}}  

*Notes:* {{NOTES ABOUT CONTRIBUTIONS, IN-KIND EXPENSES, PROCESSING FEES, OR CHECKS CLEARED. Example: “Contributions include $200 from individual donors and $262.90 in candidate in-kind contributions. Expenditures include campaign check #1050 ($125 to Wyoming SOS) and Anedot processing fees ($8.60). Cash on hand reconciles with Wells Fargo bank statement as of {{MONTH END DATE}}.”}}

### Year-to-date snapshot (through {{MONTH END DATE}})
- **Total contributions received (YTD):** ${{YTD_CONTRIBUTIONS}}  
- **Total expenditures (YTD):** ${{YTD_EXPENDITURES}}  
- **Cash on hand (as of {{MONTH END DATE}}):** ${{CASH_ON_HAND}}  

For detailed line-item contributions and expenses, please see the PDFs posted below.

## Expense PDFs

{{< finance_pdfs dir="static/finance" >}}

<details>
  <summary><strong>View Expenses {{MONTH YEAR}} (inline)</strong></summary>
  {{< pdf_embed src="/finance/Expenses {{MONTH YEAR}}.pdf" height="800" >}}
</details>

## Contribution PDFs

{{< finance_contributions_pdfs dir="static/finance/contributions" >}}

<details>
  <summary><strong>View {{MONTH YEAR}} Contributions (inline)</strong></summary>
  {{< pdf_embed src="/finance/contributions/{{MONTH YEAR}} Contributions.pdf" height="800" >}}
</details>
