# Finance PDFs naming and monthly update workflow

## Naming standard
- Expenses: `YYYY-MM-Expenses.pdf`
- Contributions: `YYYY-MM-Contributions.pdf`

## Folders
- Expenses go in: `static/finance/`
- Contributions go in: `static/finance/contributions/`

## Monthly steps
1. Place this month’s PDFs into the correct folders using the naming standard.
2. Rename any legacy files to match the standard:
   ```bash
   # ./static/finance
   mv "static/finance/Expenses <Month> <Year>.pdf" static/finance/YYYY-MM-Expenses.pdf

   # ./static/finance/contributions
   mv "static/finance/contributions/<Month> <Year> Contributions.pdf" static/finance/contributions/YYYY-MM-Contributions.pdf
