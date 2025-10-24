# SDK Distribution Testing Guide

## ✅ Testing Checklist

Before deploying to production, test these endpoints and workflows.

---

## Step 1: Update Database Schema

First, update your Supabase database with the new `sdk_downloads` table.

### In Supabase SQL Editor:

```sql
-- Run the updated setup-database.sql file
-- Or just run this section:

CREATE TABLE IF NOT EXISTS sdk_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sdk_version TEXT NOT NULL,
  package_name TEXT NOT NULL DEFAULT 'sdk',
  download_url TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sdk_downloads_user_id ON sdk_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_sdk_downloads_api_key_id ON sdk_downloads(api_key_id);
CREATE INDEX IF NOT EXISTS idx_sdk_downloads_created_at ON sdk_downloads(created_at);
CREATE INDEX IF NOT EXISTS idx_sdk_downloads_version ON sdk_downloads(sdk_version);

ALTER TABLE sdk_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own SDK downloads" ON sdk_downloads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all SDK downloads" ON sdk_downloads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

CREATE POLICY "Service role can insert SDK downloads" ON sdk_downloads
  FOR INSERT WITH CHECK (true);
```

---

## Step 2: Build and Deploy Backend

### Local Testing:

```bash
cd /Users/sandhiya.cv/Downloads/react_app/react-app/backend

# Install dependencies
pnpm install

# Build
pnpm build

# Start services
docker-compose up -d
```

### Verify Services Running:

```bash
# Check health
curl http://localhost:4000/health

# Should return:
# {"status":"ok","version":"1.0.0","timestamp":"..."}
```

---

## Step 3: Create GitHub Release

### Build SDK Tarballs:

```bash
cd /Users/sandhiya.cv/Downloads/react_app/react-app
./scripts/prepare-sdk-release.sh
```

This creates:
- `releases/zypherus-sdk-0.0.0.tgz`
- `releases/zypherus-shared-types-0.0.0.tgz`
- `releases/checksums.txt`

### Create GitHub Release:

1. Go to your GitHub repository
2. Click "Releases" → "Create a new release"
3. **Tag version**: `v0.0.1`
4. **Release title**: `Zypherus SDK v0.0.1`
5. **Upload assets**:
   - `zypherus-sdk-0.0.0.tgz`
   - `zypherus-shared-types-0.0.0.tgz`
   - `checksums.txt`
6. **Publish release**

### Get Download URLs:

After publishing, right-click each asset → "Copy link address"

URLs will be:
```
https://github.com/SandhiyaGiri/zypherus-backend/releases/download/v0.0.1/zypherus-sdk-0.0.0.tgz
https://github.com/SandhiyaGiri/zypherus-backend/releases/download/v0.0.1/zypherus-shared-types-0.0.0.tgz
```

### Update Backend Configuration:

Edit `backend/apps/dev-server/src/routes/sdk.ts`:

```typescript
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'SandhiyaGiri';
const GITHUB_REPO = process.env.GITHUB_REPO || 'zypherus-backend';

const SDK_RELEASES = {
  latest: 'v0.0.1',
  versions: {
    'v0.0.1': {
      sdk: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.0.1/zypherus-sdk-0.0.0.tgz`,
      sharedTypes: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v0.0.1/zypherus-shared-types-0.0.0.tgz`,
    },
  },
};
```

Rebuild and restart:
```bash
pnpm build
docker-compose restart backend
```

---

## Step 4: Test SDK Endpoints

### 4.1 Test Version Endpoint (Public)

```bash
curl http://localhost:4000/api/sdk/versions
```

Expected:
```json
{
  "latest": "v0.0.1",
  "versions": ["v0.0.1"],
  "packages": ["sdk", "shared-types"]
}
```

### 4.2 Get API Key

```bash
# Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'

# Save the access_token from response

# Generate API key
curl -X POST http://localhost:4000/api/keys \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test SDK Key"}'

# Save the key (starts with zk_...)
```

### 4.3 Test SDK Download

```bash
# Set your API key
export API_KEY=zk_your_api_key_here

# Download SDK
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:4000/api/sdk/download/latest \
  -L -o test-sdk.tgz

# Check file downloaded
ls -lh test-sdk.tgz
# Should show file size (e.g., ~50KB)

# Download shared types
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:4000/api/sdk/download/latest?package=shared-types \
  -L -o test-shared-types.tgz

ls -lh test-shared-types.tgz
```

### 4.4 Test Download Tracking

```bash
# View your download stats
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:4000/api/sdk/stats
```

Expected:
```json
{
  "total_downloads": 2,
  "by_version": {
    "v0.0.1": 2
  },
  "by_package": {
    "sdk": 1,
    "shared-types": 1
  },
  "recent_downloads": [
    {
      "version": "v0.0.1",
      "package": "shared-types",
      "downloaded_at": "2025-10-24T...",
      "ip_address": "::1"
    },
    {
      "version": "v0.0.1",
      "package": "sdk",
      "downloaded_at": "2025-10-24T...",
      "ip_address": "::1"
    }
  ]
}
```

### 4.5 Verify Database Logging

In Supabase:
```sql
SELECT * FROM sdk_downloads ORDER BY created_at DESC LIMIT 10;
```

Should show your downloads with:
- `user_id`
- `api_key_id`
- `sdk_version`
- `package_name`
- `download_url`
- `ip_address`
- `created_at`

---

## Step 5: Test Install Scripts

### 5.1 Test Bash Installer

```bash
# Set API key
export ZYPHERUS_API_KEY=$API_KEY
export ZYPHERUS_BACKEND_URL=http://localhost:4000

# Create test directory
mkdir /tmp/sdk-test
cd /tmp/sdk-test
npm init -y

# Run installer
/Users/sandhiya.cv/Downloads/react_app/react-app/scripts/install-zypherus-sdk.sh

# Verify installation
npm list @zypherus/sdk @zypherus/shared-types livekit-client
```

### 5.2 Test Node.js Installer

```bash
# Clean test directory
rm -rf /tmp/sdk-test
mkdir /tmp/sdk-test
cd /tmp/sdk-test
npm init -y

# Run Node.js installer
export ZYPHERUS_API_KEY=$API_KEY
export ZYPHERUS_BACKEND_URL=http://localhost:4000
node /Users/sandhiya.cv/Downloads/react_app/react-app/scripts/install-zypherus-sdk.mjs

# Verify installation
npm list @zypherus/sdk
```

---

## Step 6: Test Production (Render)

Once deployed to Render:

### 6.1 Update URLs

```bash
export BACKEND_URL=https://your-app.onrender.com
export ZYPHERUS_BACKEND_URL=$BACKEND_URL
```

### 6.2 Test All Endpoints

```bash
# Health check
curl $BACKEND_URL/health

# SDK versions
curl $BACKEND_URL/api/sdk/versions

# Login and get API key
# ... (same as Step 4.2 but with $BACKEND_URL)

# Download SDK
curl -H "Authorization: Bearer $API_KEY" \
  $BACKEND_URL/api/sdk/download/latest \
  -L -o prod-test-sdk.tgz

# Check stats
curl -H "Authorization: Bearer $API_KEY" \
  $BACKEND_URL/api/sdk/stats
```

### 6.3 Test Install Scripts Against Production

```bash
rm -rf /tmp/sdk-prod-test
mkdir /tmp/sdk-prod-test
cd /tmp/sdk-prod-test
npm init -y

export ZYPHERUS_API_KEY=$API_KEY
export ZYPHERUS_BACKEND_URL=https://your-app.onrender.com

# Run installer
/path/to/install-zypherus-sdk.sh
```

---

## Step 7: Admin Testing (Optional)

If you have admin access:

```bash
# Get admin API key (from an admin user)
export ADMIN_API_KEY=zk_admin_key_here

# View global statistics
curl -H "Authorization: Bearer $ADMIN_API_KEY" \
  http://localhost:4000/api/sdk/admin/stats
```

Expected:
```json
{
  "total_downloads": 10,
  "by_version": {
    "v0.0.1": 10
  },
  "by_package": {
    "sdk": 6,
    "shared-types": 4
  },
  "by_user": {
    "user1@example.com": 5,
    "user2@example.com": 5
  },
  "recent_downloads": [...]
}
```

---

## Step 8: Error Testing

### Test Invalid API Key

```bash
curl -H "Authorization: Bearer invalid_key" \
  http://localhost:4000/api/sdk/download/latest
```

Expected: `401 Unauthorized`

### Test Invalid Version

```bash
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:4000/api/sdk/download/v999.0.0
```

Expected: `404 Not Found` with available versions

### Test Rate Limiting

```bash
# Make 70 requests quickly (exceeds 60/min limit)
for i in {1..70}; do
  curl -H "Authorization: Bearer $API_KEY" \
    http://localhost:4000/api/sdk/versions &
done
wait
```

Expected: Some requests return `429 Too Many Requests`

---

## Step 9: Integration Testing

### Test Real Frontend Integration

1. Create test React app:
```bash
npm create vite@latest test-integration -- --template react-ts
cd test-integration
```

2. Install SDK via script:
```bash
export ZYPHERUS_API_KEY=$API_KEY
export ZYPHERUS_BACKEND_URL=http://localhost:4000
../scripts/install-zypherus-sdk.sh
```

3. Test in code:
```typescript
// src/App.tsx
import { ZypherusClient, createDevServerTokenProvider } from '@zypherus/sdk';

const client = new ZypherusClient({
  tokenProvider: createDevServerTokenProvider({
    baseUrl: 'http://localhost:4000',
    roomName: 'test',
    autoCreate: true,
    fetchImpl: async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer YOUR_API_KEY`);
      return fetch(input, { ...init, headers });
    },
  }),
});

console.log('SDK loaded successfully!', client);
```

4. Run app:
```bash
npm run dev
```

5. Check browser console for "SDK loaded successfully!"

---

## ✅ Success Criteria

All tests should pass:

- ✅ Database table created successfully
- ✅ Backend endpoints respond correctly
- ✅ GitHub Release created with tarballs
- ✅ SDK downloads work with API key
- ✅ Download tracking logs to database
- ✅ Stats endpoints return correct data
- ✅ Install scripts work (bash and Node.js)
- ✅ Rate limiting enforced
- ✅ Error handling works
- ✅ SDK integrates in real React app

---

## 🐛 Common Issues

### Issue: "Failed to download SDK (HTTP 404)"

**Solution**: Check GitHub Release URLs are correct and public.

```bash
# Test GitHub URL directly
curl -L https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v0.0.1/zypherus-sdk-0.0.0.tgz -I
# Should return: HTTP/2 200
```

### Issue: "Failed to log SDK download"

**Solution**: Check Supabase service key and table exists.

```bash
# Verify Supabase connection
curl -X POST http://localhost:4000/api/keys \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}'
# If this works, Supabase connection is fine
```

### Issue: "Policy violation" in database

**Solution**: Check RLS policies are created correctly.

```sql
-- In Supabase SQL Editor
SELECT * FROM sdk_downloads;
-- Should work for service role
```

---

## 📝 Post-Deployment Checklist

After everything works:

- [ ] Update `SDK_USER_GUIDE.md` with production URLs
- [ ] Update install scripts with production backend URL
- [ ] Create API key for testing and share with team
- [ ] Monitor first few real user downloads
- [ ] Check Supabase usage and storage
- [ ] Set up alerts for API errors
- [ ] Document any production-specific configuration

---

**Testing complete!** 🎉 Your SDK distribution system is ready for production.

