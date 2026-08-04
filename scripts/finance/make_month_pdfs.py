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
    "2026-07": {
        "contributions": [
            ("2026-07-12", "Susan Lasher", "Campaign Contribution (Stripe)", 100.00),
            ("2026-07-15", "Mollie Hand", "Campaign Contribution (Stripe)", 100.00),
            ("2026-07-21", "Jimmy Skovgard", "Candidate Loan", 500.00),
        ],
        "expenses": [
            ("2026-07-02", "Citiwerks Cafe", "Travel - Meal", 6.08),
            ("2026-07-02", "Campbell County Fair", "Booth Rental (Check 1053)", 75.00),
            ("2026-07-03", "Citiwerks Cafe", "Travel - Meal", 4.23),
            ("2026-07-03", "Natrona County Republican Women", "Space Rental (Check 1063)", 50.00),
            ("2026-07-06", "Night Heron", "Travel - Meal", 4.25),
            ("2026-07-06", "Citiwerks Cafe", "Travel - Meal", 6.08),
            ("2026-07-06", "Big D #66", "Travel - Fuel", 13.23),
            ("2026-07-06", "Walmart #3778", "Campaign Supplies", 19.59),
            ("2026-07-06", "Tumbleweed Express", "Travel - Fuel", 24.73),
            ("2026-07-07", "L2 Data", "Voter Data (Candidate Advance)", 2678.00),
            ("2026-07-08", "EmailListVerify", "Email Verification (Candidate Advance)", 210.00),
            ("2026-07-08", "Republican Party", "Space Rental (Check 1057)", 30.00),
            ("2026-07-09", "GotPrint.com", "Campaign Printing", 127.24),
            ("2026-07-10", "Frosty's Lounge", "Travel - Meal", 22.45),
            ("2026-07-13", "Sam's Club #6425", "Travel - Fuel", 1.95),
            ("2026-07-13", "Sam's Club #6425", "Travel - Fuel", 14.98),
            ("2026-07-13", "Sam's Club #6425", "Travel - Fuel", 31.77),
            ("2026-07-14", "Big D #18", "Travel - Fuel", 1.46),
            ("2026-07-14", "Big D #66", "Travel - Fuel", 22.66),
            ("2026-07-14", "Arrow Service", "Travel - Fuel", 35.07),
            ("2026-07-14", "Albany County", "Event Space", 105.00),
            ("2026-07-15", "Google Cloud", "Cloud Services", 10.00),
            ("2026-07-17", "Big D #66", "Travel - Fuel", 26.94),
            ("2026-07-17", "Sam's Club #6425", "Travel - Fuel", 39.87),
            ("2026-07-20", "Fast Stop", "Travel - Fuel", 2.98),
            ("2026-07-20", "Fast Lane", "Travel - Fuel", 8.01),
            ("2026-07-20", "Fast Stop", "Travel - Fuel", 22.11),
            ("2026-07-20", "Maverik #5054", "Travel - Fuel", 27.86),
            ("2026-07-20", "Sam's Club #6425", "Travel - Fuel", 29.53),
            ("2026-07-20", "Sam's Club #6425", "Travel - Fuel", 37.62),
            ("2026-07-20", "Sam's Club #6425", "Travel - Fuel", 38.74),
            ("2026-07-21", "Albertsons #2061", "Travel - Meal", 11.57),
            ("2026-07-21", "Big D #66", "Travel - Fuel", 31.31),
            ("2026-07-23", "Shenhav LLC", "Advertising", 19.90),
            ("2026-07-24", "Sam's Club #6425", "Travel - Fuel", 1.95),
            ("2026-07-24", "Sam's Club #6425", "Travel - Fuel", 42.17),
            ("2026-07-24", "Integrity Project", "Charitable Contribution", 5.00),
            ("2026-07-27", "Jackalope Trading", "Campaign Supplies", 3.77),
            ("2026-07-27", "Fast Lane", "Travel - Fuel", 4.17),
            ("2026-07-27", "Family Dollar", "Campaign Supplies", 10.30),
            ("2026-07-27", "Super Foods Gas", "Travel - Fuel", 32.02),
            ("2026-07-27", "Google Cloud", "Cloud Services", 50.00),
            ("2026-07-28", "Kayb Coffee", "Travel - Meal", 3.84),
            ("2026-07-28", "Sam's Club #6425", "Travel - Fuel", 45.36),
            ("2026-07-29", "Sam's Club #6425", "Travel - Fuel", 38.28),
            ("2026-07-30", "Big D #66", "Travel - Fuel", 39.02),
            ("2026-07-31", "Stripe", "Processing Fees", 6.40),
        ],
    },
    "2026-05": {
        "contributions": [
            ("2026-05-08", "A. Jolley", "Campaign Contribution (Anedot)", 15.00),
            ("2026-05-11", "Eric Hutchins", "Campaign Contribution (Stripe)", 1000.00),
        ],
        "expenses": [
            ("2026-05-01", "Natrona County Republican Party", "May 5 Fundraiser Fee (Check 1008)", 50.00),
            ("2026-05-08", "Anedot", "Processing Fee (Jolley contribution)", 0.90),
            ("2026-05-11", "Stripe", "Processing Fee (Hutchins contribution)", 29.30),
            ("2026-05-15", "Staples", "Business Cards (Check 1052)", 105.99),
            ("2026-05-22", "Wyoming Secretary of State", "Primary Registration Fee", 751.00),
        ],
    },
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

    table = Table(table_data, colWidths=[90, 200, 160, 70], repeatRows=1)
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
