# Railway Quick Start Guide

## 🚀 Deploy to Railway in 5 Minutes

This guide will help you deploy the Zypherus backend to Railway quickly.

### Prerequisites

✅ Railway account ([Sign up free](https://railway.app))  
✅ LiveKit Cloud account ([Sign up free](https://livekit.io))  
✅ Groq API key ([Get one free](https://console.groq.com))  
✅ Supabase project ([Create one free](https://supabase.com))

### Step 1: Fork/Clone Repository

1. Fork this repository to your GitHub account
2. Or clone it and push to your own repository

### Step 2: Connect to Railway

1. Go to [railway.app/new](https://railway.app/new)
2. Click "Deploy from GitHub repo"
3. Select your repository
4. Click "Deploy Now"

### Step 3: Configure Build

Railway should auto-detect the Dockerfile. If not:

1. Go to **Settings** → **Build**
2. Set **Builder**: `Dockerfile`
3. Set **Dockerfile Path**: `Dockerfile.backend`
4. Set **Root Directory**: `backend`

### Step 4: Add Environment Variables

Go to the **Variables** tab and add these variables:

#### Required Variables

```bash
# LiveKit Configuration
LIVEKIT_HOST=wss://your-project.livekit.cloud
LIVEKIT_WS_URL=wss://your-project.livekit.cloud
LIVEKIT_WS_URL_FRONTEND=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# Groq Configuration
GROQ_API_KEY=your-groq-api-key
GROQ_STT_MODEL=whisper-large-v3-turbo
GROQ_LLM_MODEL=moonshotai/kimi-k2-instruct

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Service Configuration
DEV_SERVER_PORT=4000
LLM_SERVICE_PORT=4300
STT_ROOM_NAME=zypherus-demo
STT_PARTICIPANT_IDENTITY=stt-worker
NODE_ENV=production
PORT=4000
```

#### Optional Variables

```bash
# SSL Configuration (only if you have certificate issues)
NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Step 5: Get Your API Keys

#### LiveKit

1. Go to [cloud.livekit.io](https://cloud.livekit.io)
2. Create a project
3. Copy:
   - **API Key** → `LIVEKIT_API_KEY`
   - **API Secret** → `LIVEKIT_API_SECRET`
   - **WebSocket URL** → `LIVEKIT_WS_URL` and `LIVEKIT_WS_URL_FRONTEND`

#### Groq

1. Go to [console.groq.com](https://console.groq.com)
2. Create an API key
3. Copy → `GROQ_API_KEY`

#### Supabase

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a project (wait ~2 minutes for setup)
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret** → `SUPABASE_SERVICE_KEY`
5. Go to **SQL Editor**
6. Copy contents from `scripts/setup-database.sql` and run it

### Step 6: Deploy

1. Click **Deploy** in Railway
2. Wait for build to complete (~3-5 minutes)
3. You'll get a URL like: `https://your-app-name.railway.app`

### Step 7: Verify Deployment

Test your deployment:

```bash
curl https://your-app-name.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-10-24T..."
}
```

### Step 8: Test API Endpoints

#### Create a user (if using auth)

```bash
curl -X POST https://your-app-name.railway.app/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

#### Login

```bash
curl -X POST https://your-app-name.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

This returns an access token.

#### Generate API Key

```bash
curl -X POST https://your-app-name.railway.app/api/keys \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My API Key"}'
```

Returns an API key starting with `zk_...`

### Step 9: Use in Frontend

Update your frontend `.env` or `.env.local`:

```bash
VITE_DEV_SERVER_URL=https://your-app-name.railway.app
VITE_LIVEKIT_ROOM=zypherus-demo
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Then install the SDK:

```bash
npm install https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v0.0.1/zypherus-sdk-0.0.0.tgz livekit-client
```

## 🔧 Troubleshooting

### Check Logs

View real-time logs:
```bash
railway logs
```

Or in the Railway dashboard → **Deployments** → Click latest deployment → **View Logs**

### Common Issues

#### ❌ Build fails

- Check Dockerfile path is set to `backend/Dockerfile.backend`
- Ensure root directory is `backend`
- Verify all package.json files are valid

#### ❌ Health check fails

- Check environment variables are set correctly
- Verify LiveKit credentials
- Check PORT is set to 4000

#### ❌ STT worker not connecting

- Verify LIVEKIT_WS_URL is correct
- Check GROQ_API_KEY is valid
- Review logs for connection errors

#### ❌ API key generation fails

- Verify SUPABASE_SERVICE_KEY is correct (starts with `eyJ...`)
- Check database schema is set up (run setup-database.sql)
- Ensure user profile exists in Supabase

### View Service Status

Check each service is running:

```bash
railway logs | grep "dev-server started"
railway logs | grep "stt-worker started"
railway logs | grep "llm-service started"
```

## 📚 Next Steps

- [Full Deployment Guide](./RAILWAY_DEPLOYMENT_GUIDE.md)
- [Publishing SDK Guide](../RAILWAY_DEPLOYMENT_GUIDE.md#-step-1-publish-sdk-to-github-releases)
- [Environment Variables Reference](./RAILWAY_ENV_SETUP.md)

## 🆘 Need Help?

- Check [Railway Documentation](https://docs.railway.app)
- Review backend logs for errors
- Verify all environment variables are set
- Ensure external services (LiveKit, Groq, Supabase) are working

---

**Deployment successful?** 🎉 You can now use your Railway URL in the frontend application!

