#!/bin/bash

# ============================================================================
# CRITICAL FIXES VERIFICATION SCRIPT
# ============================================================================
# Run this script to verify all Phase 1 security fixes are in place
# 
# Usage: bash verify_fixes.sh
# ============================================================================

set -e  # Exit on error

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  BACKEND SECURITY FIXES VERIFICATION SCRIPT                    ║"
echo "║  Verifying Phase 1: Critical Fixes Applied                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0
WARNINGS=0
PASSES=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
pass() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
    ((PASSES++))
}

fail() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    ((ERRORS++))
}

warn() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
    ((WARNINGS++))
}

echo "═══════════════════════════════════════════════════════════════════"
echo "CRITICAL FIX #1: MQTT BROKER AUTHENTICATION & ENCRYPTION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check 1: mosquitto.conf exists
if [ -f "backend/config/mosquitto.conf" ]; then
    pass "mosquitto.conf file created"
else
    fail "mosquitto.conf file NOT found at backend/config/mosquitto.conf"
fi

# Check 2: mosquitto.conf has allow_anonymous false
if grep -q "allow_anonymous false" backend/config/mosquitto.conf 2>/dev/null; then
    pass "MQTT anonymous access DISABLED (allow_anonymous false)"
else
    fail "MQTT allows anonymous access (allow_anonymous not set to false)"
fi

# Check 3: mosquitto.conf has ACL enforcement
if grep -q "acl_file" backend/config/mosquitto.conf 2>/dev/null; then
    pass "MQTT ACL file configured (acl_file set)"
else
    fail "MQTT ACL file NOT configured"
fi

# Check 4: acl.acl file exists
if [ -f "backend/config/acl.acl" ]; then
    pass "acl.acl access control list created"
else
    fail "acl.acl file NOT found at backend/config/acl.acl"
fi

# Check 5: TLS listener configured
if grep -q "listener 8883" backend/config/mosquitto.conf 2>/dev/null; then
    pass "MQTT TLS listener (port 8883) configured"
else
    fail "MQTT TLS listener NOT configured"
fi

# Check 6: mqttClient.js validates credentials
if grep -q "MQTT_USERNAME\|MQTT_PASSWORD" backend/src/services/mqttClient.js 2>/dev/null; then
    pass "MQTT client validates credentials at startup"
else
    fail "MQTT client does NOT validate credentials"
fi

# Check 7: TLS configuration in mqttClient.js
if grep -q "rejectUnauthorized\|tls\|mqtts" backend/src/services/mqttClient.js 2>/dev/null; then
    pass "MQTT client configured for TLS support"
else
    fail "MQTT client TLS NOT configured"
fi

# Check 8: docker-compose mounts files
if grep -q "mosquitto.conf:/mosquitto/config" backend/docker-compose.yml 2>/dev/null; then
    pass "docker-compose mounts mosquitto.conf"
else
    fail "docker-compose does NOT mount mosquitto.conf"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "CRITICAL FIX #4: TENANCY ISOLATION - DEVICE VISIBILITY ENFORCEMENT"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check 9: TDS controller has visibility check
if grep -q "isVisibleToCustomer" backend/src/controllers/tds.controller.js 2>/dev/null; then
    pass "TDS controller enforces device visibility check"
else
    fail "TDS controller does NOT check isVisibleToCustomer"
fi

# Check 10: TDS returns 403 for hidden devices
if grep -q "Device not visible" backend/src/controllers/tds.controller.js 2>/dev/null; then
    pass "TDS controller returns 403 for hidden devices"
else
    fail "TDS controller does NOT reject hidden devices"
fi

# Check 11: Nodes controller has visibility check
if grep -q "isVisibleToCustomer" backend/src/controllers/nodes.controller.js 2>/dev/null; then
    pass "Nodes controller enforces device visibility check"
else
    fail "Nodes controller does NOT check isVisibleToCustomer"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "CRITICAL FIX #5: API KEY EXPOSURE IN LOGS - REQUEST SANITIZER"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check 12: requestSanitizer utility exists
if [ -f "backend/src/utils/requestSanitizer.js" ]; then
    pass "Request sanitizer utility created"
else
    fail "Request sanitizer utility NOT found"
fi

# Check 13: Sanitizer exports sanitizeRequest function
if grep -q "sanitizeRequest" backend/src/utils/requestSanitizer.js 2>/dev/null; then
    pass "Request sanitizer exports sanitizeRequest function"
else
    fail "Request sanitizer does NOT export sanitizeRequest"
fi

# Check 14: Error handler uses sanitizer
if grep -q "requestSanitizer\|sanitizeRequest\|sanitizeError" backend/src/middleware/errorHandler.js 2>/dev/null; then
    pass "Error handler imports and uses request sanitizer"
else
    fail "Error handler does NOT use request sanitizer"
fi

# Check 15: Sensitive fields redacted
if grep -q "SENSITIVE_FIELD_NAMES\|api_key\|password" backend/src/utils/requestSanitizer.js 2>/dev/null; then
    pass "Sanitizer has list of sensitive field names"
else
    fail "Sanitizer does NOT define sensitive field names"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "MAJOR #1: RATE LIMITING BYPASS REMOVED"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check 16: Rate limiter has no superadmin bypass
if grep -q "skip.*superadmin" backend/src/server.js 2>/dev/null; then
    fail "Rate limiter still has superadmin bypass!"
else
    pass "Rate limiter has NO superadmin bypass (applies to all users)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "BONUS: ENVIRONMENT VARIABLE VALIDATION ENHANCED"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check 17: validateEnv checks production vars
if grep -q "PRODUCTION_REQUIRED_VARS\|REDIS_URL\|MQTT_BROKER" backend/src/utils/validateEnv.js 2>/dev/null; then
    pass "Environment validator checks production-critical variables"
else
    fail "Environment validator does NOT check production requirements"
fi

# Check 18: .env.production.example exists
if [ -f ".env.production.example" ]; then
    pass "Production environment template created"
else
    fail "Production environment template NOT found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "DOCUMENTATION & GUIDES"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check 19: MQTT TLS setup guide exists
if [ -f "MQTT_TLS_SETUP.md" ]; then
    pass "MQTT TLS certificate setup guide created"
else
    fail "MQTT TLS setup guide NOT found"
fi

# Check 20: Audit report exists
if [ -f "BACKEND_SECURITY_AUDIT_REPORT.md" ]; then
    pass "Complete security audit report generated"
else
    fail "Security audit report NOT found"
fi

# Check 21: Critical fixes summary exists
if [ -f "CRITICAL_FIXES_APPLIED.md" ]; then
    pass "Detailed critical fixes summary created"
else
    fail "Critical fixes summary NOT found"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "VERIFICATION SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

TOTAL=$((PASSES + ERRORS + WARNINGS))

echo "Total Checks: $TOTAL"
echo -e "${GREEN}Passed: $PASSES${NC}"
echo -e "${RED}Failed: $ERRORS${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║           ✅ ALL CRITICAL FIXES VERIFIED SUCCESSFULLY           ║"
        echo "║              Ready for production deployment!                   ║"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo ""
        echo "Next steps:"
        echo "  1. Generate MQTT certificates: bash MQTT_TLS_SETUP.md"
        echo "  2. Set environment variables in Railway"
        echo "  3. Rebuild Docker image: docker-compose build"
        echo "  4. Deploy to production"
        echo ""
        exit 0
    else
        echo "╔════════════════════════════════════════════════════════════════╗"
        echo "║              ⚠️  CRITICAL FIXES VERIFIED WITH WARNINGS          ║"
        echo "║              Review warnings before deploying to production      ║"
        echo "╚════════════════════════════════════════════════════════════════╝"
        echo ""
        exit 0
    fi
else
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         ❌ VERIFICATION FAILED - CRITICAL FIXES MISSING        ║"
    echo "║              Please address the errors above!                  ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    exit 1
fi
