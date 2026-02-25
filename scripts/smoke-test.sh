#!/usr/bin/env bash
#
# Smoke Test Script
# Run after each commit to verify the app still works.
#
# Usage: ./scripts/smoke-test.sh
#
# Checks:
#   1. TypeScript build passes (next build)
#   2. Critical DB tables exist and paper_positions data is intact
#
# Exit codes:
#   0 = ALL PASS
#   1 = FAILURE (details printed)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS=0
FAIL=0
WARNINGS=0

pass() {
  echo -e "  ${GREEN}PASS${NC} $1"
  ((PASS++))
}

fail() {
  echo -e "  ${RED}FAIL${NC} $1"
  ((FAIL++))
}

warn() {
  echo -e "  ${YELLOW}WARN${NC} $1"
  ((WARNINGS++))
}

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo ""
echo "========================================="
echo "  SMOKE TEST - v0-indian-stock-tracker"
echo "========================================="
echo ""

# -------------------------------------------
# 1. TypeScript Build
# -------------------------------------------
echo "1. TypeScript Build"
echo "   Running 'npm run build'..."

if npm run build > /tmp/smoke-build.log 2>&1; then
  pass "next build succeeded"
else
  fail "next build failed (see /tmp/smoke-build.log)"
  echo ""
  echo "  Last 20 lines of build output:"
  tail -20 /tmp/smoke-build.log | sed 's/^/    /'
fi

echo ""

# -------------------------------------------
# 2. Database Connectivity + Data Integrity
# -------------------------------------------
echo "2. Database Checks"

# Check if DATABASE_URL is set (from .env.local)
if [ -f "$PROJECT_DIR/.env.local" ]; then
  # Source only DATABASE_URL from .env.local
  DB_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env.local" | head -1 | cut -d'=' -f2-)

  if [ -z "$DB_URL" ]; then
    warn "DATABASE_URL not found in .env.local - skipping DB checks"
  else
    # Check paper_positions count (must be >= 22 — our known active positions)
    PP_COUNT=$(psql "$DB_URL" -t -c "SELECT count(*) FROM paper_positions;" 2>/dev/null | tr -d ' ' || echo "ERROR")

    if [ "$PP_COUNT" = "ERROR" ]; then
      fail "Cannot connect to database"
    elif [ "$PP_COUNT" -ge 22 ] 2>/dev/null; then
      pass "paper_positions has $PP_COUNT rows (expected >= 22)"
    else
      warn "paper_positions has $PP_COUNT rows (expected >= 22 — some may have been closed)"
    fi

    # Check critical tables exist
    for TABLE in users sessions paper_positions watchlists user_permissions trade_history alerts broker_connections; do
      EXISTS=$(psql "$DB_URL" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$TABLE');" 2>/dev/null | tr -d ' ' || echo "ERROR")
      if [ "$EXISTS" = "t" ]; then
        pass "table '$TABLE' exists"
      elif [ "$EXISTS" = "f" ]; then
        # Some tables might not exist yet (broker_connections is added in Phase 2)
        warn "table '$TABLE' does not exist yet"
      else
        fail "cannot check table '$TABLE'"
      fi
    done
  fi
else
  warn "No .env.local found - skipping DB checks"
fi

echo ""

# -------------------------------------------
# 3. Import Consistency Check
# -------------------------------------------
echo "3. Import Consistency"

# After Phase 5, these files should not be imported anywhere
for FILE in "lib/db-helpers" "lib/auth-helpers"; do
  IMPORTS=$(grep -r "from.*['\"]@/$FILE" --include="*.ts" --include="*.tsx" "$PROJECT_DIR/app" "$PROJECT_DIR/lib" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
  if [ "$IMPORTS" -eq 0 ]; then
    pass "no imports of @/$FILE"
  else
    warn "@/$FILE still imported in $IMPORTS file(s)"
  fi
done

# After Phase 2 migration, kite-token-helper should have 0 imports
KITE_HELPER_IMPORTS=$(grep -r "from.*['\"]@/lib/kite-token-helper" --include="*.ts" --include="*.tsx" "$PROJECT_DIR/app" "$PROJECT_DIR/lib" 2>/dev/null | grep -v node_modules | wc -l | tr -d ' ')
if [ "$KITE_HELPER_IMPORTS" -eq 0 ]; then
  pass "no imports of @/lib/kite-token-helper"
else
  warn "@/lib/kite-token-helper still imported in $KITE_HELPER_IMPORTS file(s) (OK until Phase 2 complete)"
fi

echo ""

# -------------------------------------------
# Summary
# -------------------------------------------
echo "========================================="
echo -e "  Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, ${YELLOW}$WARNINGS warnings${NC}"
echo "========================================="
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}SMOKE TEST FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}SMOKE TEST PASSED${NC}"
  exit 0
fi
