# MQTT TLS Certificate Generation Guide

## For Local Development (Self-Signed)

### Generate Self-Signed Certificates

```bash
# 1. Create a working directory
mkdir -p backend/config/certs
cd backend/config/certs

# 2. Generate CA private key
openssl genrsa -out ca.key 2048

# 3. Generate CA certificate (self-signed)
openssl req -new -x509 -days 365 -key ca.key -out ca.crt \
  -subj "/C=IN/ST=State/L=City/O=YourOrg/CN=mosquitto-ca"

# 4. Generate server private key
openssl genrsa -out server.key 2048

# 5. Generate certificate signing request (CSR)
openssl req -new -key server.key -out server.csr \
  -subj "/C=IN/ST=State/L=City/O=YourOrg/CN=localhost"

# 6. Sign the server certificate with CA
openssl x509 -req -in server.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 365

# 7. Set proper permissions (read-only for container)
chmod 444 ca.crt server.crt server.key
```

### Result
```
backend/config/certs/
├── ca.crt           # CA certificate (used by clients)
├── ca.key           # CA private key (keep secure)
├── server.crt       # Server certificate
├── server.key       # Server private key
└── server.csr       # Certificate signing request (can delete)
```

---

## For Production (Let's Encrypt)

### Create Certificates with Let's Encrypt (Recommended)

```bash
# 1. Install certbot
sudo apt-get update
sudo apt-get install certbot

# 2. Generate certificate for your domain
sudo certbot certonly --standalone \
  -d mqtt.yourdomain.com \
  --non-interactive --agree-tos --email admin@yourdomain.com

# 3. Copy to MQTT config directory
sudo cp /etc/letsencrypt/live/mqtt.yourdomain.com/fullchain.pem backend/config/certs/server.crt
sudo cp /etc/letsencrypt/live/mqtt.yourdomain.com/privkey.pem backend/config/certs/server.key

# 4. Set permissions
chmod 444 backend/config/certs/server.crt
chmod 400 backend/config/certs/server.key
```

### Set Up Auto-Renewal

```bash
# Certbot automatically renews via cron
# Verify renewal
sudo certbot renew --dry-run

# When certificate renews, restart MQTT broker
# (Railway will handle this automatically)
```

---

## For Railway Deployment (Production)

### Using Railway Secrets

1. **Generate certificates locally** (or use Let's Encrypt)
2. **Store in Railway secrets:**
   ```bash
   railway secret set MQTT_CA_CERT="$(cat backend/config/certs/ca.crt)"
   railway secret set MQTT_SERVER_CERT="$(cat backend/config/certs/server.crt)"
   railway secret set MQTT_SERVER_KEY="$(cat backend/config/certs/server.key)"
   ```

3. **Update docker-compose.yml** to read from secrets:
   ```yaml
   mosquitto:
     environment:
       - MQTT_CA_CERT=${MQTT_CA_CERT}
       - MQTT_SERVER_CERT=${MQTT_SERVER_CERT}
       - MQTT_SERVER_KEY=${MQTT_SERVER_KEY}
   ```

4. **Write certificates to container** at startup:
   ```bash
   # In Dockerfile or entrypoint script
   echo "$MQTT_CA_CERT" > /mosquitto/certs/ca.crt
   echo "$MQTT_SERVER_CERT" > /mosquitto/certs/server.crt
   echo "$MQTT_SERVER_KEY" > /mosquitto/certs/server.key
   chmod 444 /mosquitto/certs/*.crt
   chmod 400 /mosquitto/certs/*.key
   ```

---

## Testing Certificates

### Test Connection (Local)

```bash
# Connect with TLS (should succeed with valid credentials)
mosquitto_sub -h localhost -p 8883 \
  -u backend_service -P your_password \
  -t test \
  --cafile backend/config/certs/ca.crt

# Without credentials (should fail)
mosquitto_sub -h localhost -p 8883 \
  -t test \
  --cafile backend/config/certs/ca.crt
→ "Connection Refused"  ✓

# Without TLS (should fail)
mosquitto_sub -h localhost -p 1883 \
  -u backend_service -P your_password \
  -t test
→ "Connection refused"  ✓
```

### Verify Certificate Chain

```bash
# Check certificate validity
openssl x509 -in server.crt -text -noout

# Verify CA signature
openssl verify -CAfile ca.crt server.crt
→ "server.crt: OK"

# Check certificate expiry
openssl x509 -enddate -noout -in server.crt
→ "notAfter=Apr 16 2027 12:00:00 GMT"
```

---

## Security Checklist

- [ ] TLS enabled on port 8883 (MQTTS)
- [ ] `allow_anonymous false` in mosquitto.conf
- [ ] ACL file deployed (`acl.acl`)
- [ ] Device passwords generated (one per device)
- [ ] CA certificate stored securely (not in git)
- [ ] Server key file permissions set to 400
- [ ] Certificate renewed before expiry (Let's Encrypt)
- [ ] MQTT_CONNECTION_REQUIRED validation passes in startup

---

## Troubleshooting

### Connection Refused
**Problem:** `Error: Connection refused (111)`
- Solution: Check if Mosquitto is running: `docker ps | grep mosquitto`
- Check firewall: `sudo ufw allow 8883`

### Bad Certificate
**Problem:** `Error: Error:ssl_handshake_failure`
- Solution: Verify CA cert matches server cert: `openssl verify -CAfile ca.crt server.crt`

### Authentication Failed
**Problem:** `Error: Connection refused - not authorised`
- Solution: Verify credentials in passwd file: `mosquitto_passwd -U /mosquitto/config/passwd`

### Certificate Expired
**Problem:** Connect succeeds but messages don't flow
- Solution: Renew certificate: `sudo certbot renew`

---

## References

- [Let's Encrypt Setup](https://letsencrypt.org/)
- [Mosquitto TLS Documentation](https://mosquitto.org/man/mosquitto-conf-5.html)
- [OpenSSL Commands](https://www.openssl.org/docs/manmaster/man1/)
