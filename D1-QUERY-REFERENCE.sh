#!/bin/bash
# D1 Database Query Reference
# Use these queries to verify donation form data is stored correctly

echo "========================================"
echo "D1 Database Query Reference"
echo "========================================"
echo ""
echo "Prerequisites:"
echo "  ✓ Wrangler CLI installed"
echo "  ✓ D1 database 'ballot_sources' created"
echo "  ✓ Migrations applied"
echo ""

echo "========================================"
echo "TABLE 1: donors"
echo "========================================"
echo ""
echo "View all donors:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT id, first_name, last_name, email, phone, city, state, zip FROM donors ORDER BY id DESC LIMIT 10;"'
echo ""

echo "View specific donor by email:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT * FROM donors WHERE email = '\''john@example.com'\'';"'
echo ""

echo "Count total donors:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT COUNT(*) as total_donors FROM donors;"'
echo ""

echo "View donors from specific state:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT id, first_name, last_name, city, state FROM donors WHERE state = '\''WY'\'' ORDER BY id DESC LIMIT 10;"'
echo ""

echo "========================================"
echo "TABLE 2: contributions"
echo "========================================"
echo ""
echo "View all contributions:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT id, donor_id, amount_cents, currency, payment_intent_id, status FROM contributions ORDER BY id DESC LIMIT 10;"'
echo ""

echo "View contribution by payment intent ID:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT * FROM contributions WHERE payment_intent_id = '\''pi_1234567890abcdefg'\'';"'
echo ""

echo "View contributions for specific donor:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT id, amount_cents, currency, status FROM contributions WHERE donor_id = 1;"'
echo ""

echo "Sum total amount donated:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT SUM(amount_cents)/100 as total_usd FROM contributions WHERE status = '\''succeeded_webhook'\'';"'
echo ""

echo "Count contributions by status:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT status, COUNT(*) as count FROM contributions GROUP BY status;"'
echo ""

echo "========================================"
echo "TABLE 3: contribution_attestations"
echo "========================================"
echo ""
echo "View all attestations:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT id, contribution_id, us_citizen, personal_funds, age_18, not_federal_contractor, personal_card FROM contribution_attestations ORDER BY id DESC LIMIT 10;"'
echo ""

echo "View attestations for specific contribution:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT * FROM contribution_attestations WHERE contribution_id = 1;"'
echo ""

echo "View IP addresses and user agents:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT contribution_id, ip, user_agent FROM contribution_attestations ORDER BY id DESC LIMIT 10;"'
echo ""

echo "========================================"
echo "JOIN QUERIES: Complete Donation Records"
echo "========================================"
echo ""
echo "Get complete donation with donor + contribution + attestations:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT'
echo '      d.id as donor_id,'
echo '      d.first_name,'
echo '      d.last_name,'
echo '      d.email,'
echo '      d.city,'
echo '      d.state,'
echo '      c.id as contribution_id,'
echo '      c.amount_cents,'
echo '      c.payment_intent_id,'
echo '      c.status,'
echo '      a.us_citizen,'
echo '      a.personal_funds,'
echo '      a.age_18,'
echo '      a.not_federal_contractor,'
echo '      a.personal_card'
echo '    FROM donors d'
echo '    LEFT JOIN contributions c ON d.id = c.donor_id'
echo '    LEFT JOIN contribution_attestations a ON c.id = a.contribution_id'
echo '    ORDER BY d.id DESC LIMIT 5;"'
echo ""

echo "========================================"
echo "ANALYTICS QUERIES"
echo "========================================"
echo ""
echo "Total donations by state:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT d.state, COUNT(*) as donations, SUM(c.amount_cents)/100 as total_usd'
echo '     FROM donors d'
echo '     LEFT JOIN contributions c ON d.id = c.donor_id'
echo '     WHERE c.status = '\''succeeded_webhook'\'
echo '     GROUP BY d.state'
echo '     ORDER BY total_usd DESC;"'
echo ""

echo "Average donation amount:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT AVG(amount_cents)/100 as avg_usd, MIN(amount_cents)/100 as min_usd, MAX(amount_cents)/100 as max_usd FROM contributions WHERE status = '\''succeeded_webhook'\'';"'
echo ""

echo "Failed vs succeeded:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT status, COUNT(*) as count, SUM(amount_cents)/100 as total_usd FROM contributions GROUP BY status;"'
echo ""

echo "========================================"
echo "DATA QUALITY CHECKS"
echo "========================================"
echo ""
echo "Donations missing email address:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT COUNT(*) as missing_email FROM donors WHERE email IS NULL OR email = '\'''\'';"'
echo ""

echo "Donations missing phone:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT COUNT(*) as missing_phone FROM donors WHERE phone IS NULL OR phone = '\'''\'';"'
echo ""

echo "Donations >$200 with employer:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT COUNT(*) as with_employer FROM donors'
echo '     WHERE id IN (SELECT donor_id FROM contributions WHERE amount_cents > 20000)'
echo '     AND employer IS NOT NULL AND employer != '\'''\'';"'
echo ""

echo "Donations with all attestations:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT COUNT(*) as with_all_attestations FROM contribution_attestations'
echo '     WHERE us_citizen = 1 AND personal_funds = 1 AND age_18 = 1'
echo '     AND not_federal_contractor = 1 AND personal_card = 1;"'
echo ""

echo "========================================"
echo "EXAMPLE: Verify Specific Donation"
echo "========================================"
echo ""
echo "Step 1: Find donor by email"
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT id FROM donors WHERE email = '\''john@example.com'\'';" | grep id'
echo ""
echo "Step 2: Get donor_id from result (e.g., 42)"
echo ""
echo "Step 3: View all records for that donor"
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT'
echo '      d.*,'
echo '      c.id as contribution_id,'
echo '      c.amount_cents,'
echo '      c.payment_intent_id,'
echo '      c.status'
echo '    FROM donors d'
echo '    LEFT JOIN contributions c ON d.id = c.donor_id'
echo '    WHERE d.id = 42;"'
echo ""
echo "Step 4: View attestations for that contribution (e.g., contribution_id = 123)"
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT * FROM contribution_attestations WHERE contribution_id = 123;"'
echo ""

echo "========================================"
echo "EXPORT ALL DATA (for backup/audit)"
echo "========================================"
echo ""
echo "Export donors as JSON:"
echo ""
echo '  wrangler d1 execute ballot_sources --local --command \'
echo '    "SELECT json_group_object(id, json_object('\''first_name'\'', first_name, '\''last_name'\'', last_name, '\''email'\'', email)) as donors FROM donors;" | jq'
echo ""

echo "========================================"
echo "IMPORTANT: Production vs Local"
echo "========================================"
echo ""
echo "Local development (testing):"
echo '  wrangler d1 execute ballot_sources --local --command "SELECT COUNT(*) FROM donors;"'
echo ""
echo "Production (live site):"
echo '  wrangler d1 execute ballot_sources --remote --command "SELECT COUNT(*) FROM donors;"'
echo ""
echo "Default is --local (uses local testing database)"
echo "Use --remote ONLY for production queries"
echo ""

echo "========================================"
echo "BACKUP YOUR DATA"
echo "========================================"
echo ""
echo "Export all tables to SQL file:"
echo ""
echo "  # Get donations"
echo '  wrangler d1 execute ballot_sources --remote --command "SELECT * FROM donors;" > donors.sql'
echo '  wrangler d1 execute ballot_sources --remote --command "SELECT * FROM contributions;" > contributions.sql'
echo '  wrangler d1 execute ballot_sources --remote --command "SELECT * FROM contribution_attestations;" > attestations.sql'
echo ""

echo "========================================"
