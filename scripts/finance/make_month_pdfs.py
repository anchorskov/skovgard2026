# scripts/finance/make_month_pdfs.py
#!/usr/bin/env python3

import argparse
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

DATA_BY_MONTH = {
    "2026-03": {
        "contributions": [
            ("2026-03-09", "C. Jolley", "Campaign Contribution", 15.00),
            ("2026-03-11", "Jimmy Skovgard", "Candidate Contribution", 2000.00),
            ("2026-03-16", "Jimmy Skovgard", "Candidate Contribution (Stripe Test)", 5.00),
            ("2026-03-16", "Jimmy Skovgard", "Candidate Contribution (WinRed Test)", 10.00),
            ("2026-03-25", "Caleb H.", "Campaign Contribution (WinRed)", 50.00),
        ],
        "expenses": [
            ("2026-03-16", "CWFR", "Booth Space", 355.00),
            ("2026-03-16", "The Hangar", "Venue Space", 50.00),
            ("2026-03-31", "Wells Fargo", "Monthly Service Fee", 15.00),
            ("2026-03-09", "Anedot", "Processing Fee", 0.90),
            ("2026-03-16", "Stripe", "Processing Fee", 0.45),
            ("2026-03-25", "WinRed", "Processing Fee", 1.97),
        ],
    },
    "2025-12": {
        "contributions": [
            ("2025-12-09", "Cindy Jolly", "Campaign Contribution", 15.00),
        ],
        "expenses": [
            ("2025-12-09", "Anedot", "Fees", 0.90),
        ],
    }
}


def format_currency(amount):
    return f"{amount:.2f}"


def month_label(month):
    parsed = datetime.strptime(month, "%Y-%m")
    return parsed.strftime("%B %Y")


def build_pdf(path, title, headers, rows, total_label, total_amount):
    doc = SimpleDocTemplate(str(path), pagesize=letter, title=title)
    styles = getSampleStyleSheet()

    table_data = [headers]
    for row in rows:
        table_data.append([row[0], row[1], row[2], format_currency(row[3])])

    table = Table(table_data, colWidths=[90, 200, 160, 70])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (-1, 1), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    )

    total_line = f"{total_label} ${format_currency(total_amount)}"

    elements = [
        Paragraph(title, styles["Title"]),
        Spacer(1, 12),
        table,
        Spacer(1, 12),
        Paragraph(total_line, styles["Normal"]),
    ]

    doc.build(elements)


def main():
    parser = argparse.ArgumentParser(description="Create monthly finance PDFs.")
    parser.add_argument("month", help="Month in YYYY-MM format")
    args = parser.parse_args()

    if args.month not in DATA_BY_MONTH:
        raise SystemExit(f"No data configured for {args.month}.")

    month_name = month_label(args.month)
    data = DATA_BY_MONTH[args.month]

    contributions_path = Path("static/finance/contributions") / f"{args.month}-Contributions.pdf"
    expenses_path = Path("static/finance") / f"{args.month}-Expenses.pdf"

    contributions_path.parent.mkdir(parents=True, exist_ok=True)
    expenses_path.parent.mkdir(parents=True, exist_ok=True)

    contributions_total = sum(row[3] for row in data["contributions"])
    expenses_total = sum(row[3] for row in data["expenses"])

    build_pdf(
        contributions_path,
        f"Contributions for {month_name}",
        ["Date", "Name", "Category", "Amount"],
        data["contributions"],
        f"Total Contributions ({month_name}):",
        contributions_total,
    )

    build_pdf(
        expenses_path,
        f"Expenditures for {month_name}",
        ["Date", "Vendor", "Category", "Amount"],
        data["expenses"],
        f"Total Expenditures ({month_name}):",
        expenses_total,
    )


if __name__ == "__main__":
    main()
