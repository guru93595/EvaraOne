# 🚀 CRITICAL FIXES DEPLOYMENT CHECKLIST

## Pre-Deployment (Local Development)

### 1. Verify All Fixes Applied
```bash
# Run verification script
bash verify_fixes.sh

# Expected output:
# ✅ ALL CRITICAL FIXES VERIFIED SUCCESSFULLY
```

If any checks fail, stop and fix them before proceeding.

---

### 2. Generate MQTT Certificates

**For Local Development (Self-Signed):**
```bash
# Follow guide in MQTT_TLS_SETUP.md → "For Local Development"
bash <<'EOF'
mkdir -p backend/config/certs
cd backend/config/certs

# Generate CA
openssl genrsa -out ca.key 2048
openssl req -new -x509 -days 365 -key ca.key -out ca.crt \
  -subj "/C=IN/ST=State/L=City/O=Evara/CN=mosquitto-ca"

# Generate Server
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr \
  -subj "/C=IN/ST=State/L=City/O=Evara/CN=localhost"

openssl x509 -req -in server.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365

chmod 444 ca.crt server.crt server.key
echo "✅ Certificates generated"
EOF
```

**For Production (Let's Encrypt):**
- Follow guide in MQTT_TLS_SETUP.md → "For Production"
- OR use Railway's certificate management

---

### 3. Test Locally with Docker Compose

```bash
# Start services
docker-compose up -d

# Wait for services to start
sleep 5

# Test MQTT authentication (should FAIL)
mosquitto_pub -h localhost -p 1883 -t "test" -m "hello"
# Expected: Connection refused ✓

# Test MQTT with TLS and credentials (should SUCCEED)
mosquitto_pub -h localhost -p 8883 \
  -u backend_service -P \
  (get password from docker-compose.yml) \
  -t "test" -m "hello" \
  --cafile backend/config/certs/ca.crt
# Expected: Success ✓

# View logs
docker-compose logs -f backend

# Verify: Look for messages like:
# [MQTT] ✅ Connected to broker (backoff reset)
# ✅ Environment Variables Validated
```

---

## Production Deployment (Railway)

### 4. Prepare Production Environment

```bash
# Copy template and fill in actual values
cp .env.production.example .env.production

# Edit with production values:
nano .env.production

# Required fields to fill:
# - FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
# - REDIS_URL (from Railway Redis service)
# - MQTT_BROKER_URL (your MQTT service hostname)
# - MQTT_USERNAME / MQTT_PASSWORD (strong passwords!)
# - ALLOWED_ORIGINS (your production domain)
# - SENTRY_DSN (from Sentry.io)
```

### 5. Set Environment Variables in Railway

```bash
# Use Railroad CLI or Railway Dashboard

# Option A: Via Railway CLI
railway secret set $(cat .env.production | xargs)

# Option B: Via Dashboard (one by one)
railway secret set FIREBASE_PROJECT_ID=xxx
railway secret set FIREBASE_CLIENT_EMAIL=xxx
railway secret set FIREBASE_PRIVATE_KEY="---BEGIN PRIVATE KEY--..."
railway secret set REDIS_URL=redis://...
railway secret set MQTT_BROKER_URL=mqtts://...
railway secret set MQTT_USERNAME=backend_service
railway secret set MQTT_PASSWORD=strong_password_min_16_chars
railway secret set SENTRY_DSN=https://...
railway secret set ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
railway secret set NODE_ENV=production
railway secret set LOG_LEVEL=info
```

### 6. Upload MQTT Certificates to Railway

**Option A: Via Docker Secrets**
```bash
# If Railway supports secrets, upload certificates
railway secret set MQTT_CA_CERT="$(cat backend/config/certs/ca.crt)"
railway secret set MQTT_SERVER_CERT="$(cat backend/config/certs/server.crt)"
railway secret set MQTT_SERVER_KEY="$(cat backend/config/certs/server.key)"
```

**Option B: Mount via Volumes**
```bash
# In docker-compose.yml for production (Railway Deploy):
# Add as volumes in Railway deployment
volumes:
  - ./backend/config/certs:/mosquitto/certs:ro
```

**Option C: Self-signed via Railway Embedded**
```bash
# Generate certs in Railway's build step
# Add to Dockerfile entrypoint:
RUN if [ ! -f /mosquitto/certs/server.crt ]; then \
  mkdir -p /mosquitto/certs && \
  openssl req -x509 -newkey rsa:4096 -keyout /mosquitto/certs/server.key \
  -out /mosquitto/certs/server.crt -days 365 -nodes \
  -subj "/CN=mosquitto"; fi
```

### 7. Update Railway Deployment

```bash
# Commit all changes
git add -A
git commit -m "🔒 Apply Phase 1 critical security fixes

- MQTT: Add authentication + TLS encryption
- Tenancy: Enforce device visibility checks
- Logging: Sanitize sensitive data (API keys, passwords)
- Rate limiting: Remove superadmin bypass
- Environment: Validate production requirements

Fixes critical vulnerabilities: MQTT spoofing, data leakage, key exposure"

# Push to main branch
git push origin main

# Deploy via Railway
railway deployment create

# Monitor deployment logs
railway logs --follow
```

### 8. Verify Production Deployment

**Check logs for success messages:**
```bash
railway logs | grep "✅"

# Look for:
# ✅ Backend running on port 8000
# ✅ Firestore connectivity OK
# ✅ Redis adapter enabled
# ✅ Environment Variables Validated
# ✅ MQTT connected
```

**Test MQTT Connection (Production):**
```bash
# From your local machine (test device credentials)
mosquitto_pub -h mqtt.your-production-domain.com -p 8883 \
  -u device_test_001 -P device_password \
  -t devices/device_test_001/telemetry \
  -m '{"level":50}' \
  --cafile backend/config/certs/ca.crt

# Expected: Message published successfully
```

**Test API Endpoints:**
```bash
# Test authentication
curl -X POST https://api.your-production-domain.com/api/v1/auth/verify-token \
  -H "Authorization: Bearer $(your_valid_token)"
# Expected: 200 OK (user profile)

# Test device endpoint
curl -X GET https://api.your-production-domain.com/api/v1/nodes \
  -H "Authorization: Bearer $(your_valid_token)"
# Expected: 200 OK (list of devices)

# Test hidden device returns 403
curl -X GET https://api.your-production-domain.com/api/v1/devices/hidden_device_id \
  -H "Authorization: Bearer $(customer_token)"
# Expected: 403 Forbidden
```

**Check Logs for Sanitization:**
```bash
# Trigger an error
curl -X POST https://api.your-production-domain.com/api/v1/devices \
  -H "Authorization: Bearer invalid_token" \
  -H "X-API-Key: secret123"

# Check logs
railway logs | grep "X-API-Key"
# Expected: No "secret123" visible (should be [REDACTED])
```

---

## Post-Deployment Verification

### 9. Run Full Verification Suite

```bash
# On production environment
bash <<'EOF'
echo "🔍 Verifying production critical fixes..."

# 1. MQTT Authentication
mosquitto_pub -h localhost -p 1883 -t "test" -m "hello" 2>&1 | grep -i "refused" && \
  echo "✅ MQTT requires authentication" || echo "❌ MQTT allows anonymous access"

# 2. Device Visibility
curl -s https://api/v1/nodes?role=customer | jq '.[] | select(.isVisibleToCustomer==false)' | wc -l | \
  grep "^0$" && echo "✅ Customers cannot see hidden devices" || echo "❌ Hidden devices are visible"

# 3. API Key Sanitization
curl -s https://api/v1/health -H "X-API-Key: secret123" && \
  curl -s https://api/v1/health 2>&1 | grep -i "secret" || echo "✅ API keys not in logs"

# 4. Rate Limiting
for i in {1..101}; do curl -s https://api/v1/health; done | grep -i "429" && \
  echo "✅ Rate limiting applies to all users" || echo "❌ Rate limiting might be bypassed"

# 5. Environment Validation
docker logs $(docker ps | grep backend | awk '{print $1}') | grep "Environment Variables Validated" && \
  echo "✅ Environment validation passed" || echo "❌ Environment validation failed"
EOF
```

### 10. Monitor for Issues (Week 1)

```bash
# Monitor error rate
railway logs | grep ERROR | wc -l
# Expected: <5/hour (normal operations)

# Check for repeated connection failures
railway logs | grep "MQTT\|Redis\|Firebase" | grep -i error | wc -l
# Expected: <3/hour

#  Verify rate limiting is working
railway logs | grep "429" | wc -l
# Expected: >0 (at least some throttled requests)

# Check for API key leaks
railway logs | grep -E "api[_-]?key|password|token" | grep -v "\[REDACTED\]" | wc -l
# Expected: 0 (no sensitive values visible)
```

---

## Rollback Plan (If Issues)

```bash
# If something goes wrong in production:

# Option 1: Rollback to previous version
railway deployment rollback <previous-deployment-id>

# Option 2: Disable MQTT TLS temporarily
railway secret set MQTT_USE_TLS=false
railway deployment create

# Option 3: Revert rate limiting
git revert HEAD
git push origin main
railway deployment create

# Then investigate and fix
```

---

## Final Checklist

- [ ] All fixes verified locally (verify_fixes.sh passes)
- [ ] Certificates generated and stored securely
- [ ] Passwords changed from defaults
- [ ] Environment variables set in Railway
- [ ] Git commit created with clear message
- [ ] Deployment pushed to production
- [ ] Logs monitored for errors
- [ ] API endpoints tested (auth, device list, hidden devices)
- [ ] MQTT connection verified with credentials
- [ ] No API keys visible in logs
- [ ] Rate limiting applies to all users
- [ ] Team notified of changes
- [ ] Documentation updated
- [ ] Schedule Phase 2 fixes (next week)

---

## If Deployment Fails

### MQTT Connection Issues
```bash
# Check MQTT logs
railway logs backend | grep -i mqtt

# Common issues:
# "authentication failed" → Check MQTT_USERNAME, MQTT_PASSWORD
# "ssl/tls error" → Check certificates are readable, format is valid
# "connection refused" → Check MQTT_BROKER_URL and port
```

### Environment Variable Not Found
```bash
# Verify secrets are set
railway secret list

# If missing, set them again
railway secret set KEY=value

# Restart deployment
railway deployment create
```

### Redis Connection Failed
```bash
# Check Redis is running
railway logs redis | tail -20

# Verify REDIS_URL format: redis://[user][:password]@host:port
railway secret get REDIS_URL

# If format wrong, update it
railway secret set REDIS_URL=redis://...
```

---

## Support & Escalation

**If problems persist after rollback:**
1. Check deployment logs for root cause
2. Review BACKEND_SECURITY_AUDIT_REPORT.md for context
3. Consult CRITICAL_FIXES_APPLIED.md for details of changes
4. Contact backend team lead with error logs

---

**Deployment Checklist Version:** 1.0  
**Last Updated:** April 16, 2026  
**Status:** Ready for Production Deployment
