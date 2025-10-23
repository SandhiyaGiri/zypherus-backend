# Render Deployment Guide

## 🚀 Quick Deploy to Render

This guide will help you deploy the Zypherus backend to Render.

### Prerequisites

✅ Render account ([Sign up free](https://render.com))  
✅ GitHub repository with this code  
✅ LiveKit Cloud account  
✅ Groq API key  
✅ Supabase project

---

## Step 1: Push Code to GitHub

If you haven't pushed your code yet, follow these commands:

```bash
# Navigate to backend directory
cd /Users/sandhiya.cv/Downloads/react_app/react-app/backend

# Check current status
git status

# Stage all changes
git add .

# Commit changes
git commit -m "feat: Add Render deployment configuration with Supabase integration"

# Push to GitHub (replace with your branch name)
git push origin feature/production-service-setup-clean

# Or create a new main branch
# git checkout -b main
# git push origin main
```

---

## Step 2: Deploy to Render

### Option A: Using Render Blueprint (Recommended)

1. **Go to Render Dashboard**: [dashboard.render.com](https://dashboard.render.com)
2. **Click "New" → "Blueprint"**
3. **Connect your GitHub repository**
4. **Render will detect `render.yaml` and configure automatically**
5. **Click "Apply"**

### Option B: Manual Deployment

1. **Go to Render Dashboard**: [dashboard.render.com](https://dashboard.render.com)
2. **Click "New" → "Web Service"**
3. **Connect your GitHub repository**
4. **Configure settings**:
   - **Name**: `zypherus-backend`
   - **Environment**: `Docker` (recommended)
   - **Region**: Choose closest to your users
   - **Branch**: `feature/production-service-setup-clean` (or `main`)
   - **Dockerfile Path**: `./Dockerfile.backend`

### Option C: Native Node Deployment (Alternative)

If you prefer native Node.js instead of Docker:

1. **Environment**: `Node`
2. **Build Command**: `pnpm install && pnpm build`
3. **Start Command**: `./start-render.sh`
4. **Root Directory**: Leave blank or set to `backend`

**Note**: Docker deployment (Option A/B) is recommended for better isolation and consistency.

---

## Step 3: Configure Environment Variables

In Render Dashboard → Environment tab, add these variables:

### LiveKit Configuration
```bash
LIVEKIT_HOST=wss://your-project.livekit.cloud
LIVEKIT_WS_URL=wss://your-project.livekit.cloud
LIVEKIT_WS_URL_FRONTEND=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
```

### Groq Configuration
```bash
GROQ_API_KEY=your-groq-api-key
GROQ_STT_MODEL=whisper-large-v3-turbo
GROQ_LLM_MODEL=moonshotai/kimi-k2-instruct
```

### Supabase Configuration
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### Service Configuration (Pre-filled)
```bash
NODE_ENV=production
PORT=4000
DEV_SERVER_PORT=4000
LLM_SERVICE_PORT=4300
STT_ROOM_NAME=zypherus-demo
STT_PARTICIPANT_IDENTITY=stt-worker
```

---

## Step 4: Get Your API Keys

### LiveKit
1. Go to [cloud.livekit.io](https://cloud.livekit.io)
2. Create a project
3. Copy API Key, API Secret, and WebSocket URL

### Groq
1. Go to [console.groq.com](https://console.groq.com)
2. Create an API key
3. Copy the key

### Supabase
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Create a project
3. Go to **Settings** → **API**
4. Copy Project URL and service_role key (starts with `eyJ...`)
5. Go to **SQL Editor** and run `scripts/setup-database.sql`

---

## Step 5: Deploy

1. **Click "Create Web Service"** (or "Apply" if using Blueprint)
2. **Wait for deployment** (~5-10 minutes first time)
3. **Your service will be available at**: `https://your-app.onrender.com`

---

## Step 6: Verify Deployment

### Test Health Endpoint
```bash
curl https://your-app.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2025-10-24T..."
}
```

### Test Authentication
```bash
# Signup
curl -X POST https://your-app.onrender.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'

# Login
curl -X POST https://your-app.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

### Generate API Key
```bash
curl -X POST https://your-app.onrender.com/api/keys \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My API Key"}'
```

---

## Step 7: Update Frontend

Update your frontend `.env.local`:

```bash
VITE_DEV_SERVER_URL=https://your-app.onrender.com
VITE_LIVEKIT_ROOM=zypherus-demo
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

## 🔧 Troubleshooting

### Check Logs

View logs in Render Dashboard → Logs tab, or use CLI:
```bash
# Install Render CLI
npm install -g @render-api/cli

# View logs
render logs -s zypherus-backend -f
```

### Common Issues

#### ❌ Build Fails
- Check Dockerfile path is correct: `./Dockerfile.backend`
- Ensure all dependencies are in `pnpm-lock.yaml`
- Verify Docker context is set to `.` (current directory)

#### ❌ Health Check Fails
- Verify PORT is set to 4000
- Check all required environment variables are set
- Review logs for startup errors

#### ❌ Services Don't Start
- Check LiveKit credentials are correct
- Verify Groq API key is valid
- Ensure Supabase service key is correct

#### ❌ Connection Issues
- Verify LIVEKIT_WS_URL is accessible
- Check firewall/network settings
- Ensure SSL certificates are valid

### View Service Status

In Render logs, check for:
```
dev-server started on port 4000
stt-worker started
llm-service started on port 4300
STT worker connected to LiveKit
```

---

## 📊 Monitoring

### Render Dashboard
- **Metrics**: CPU, Memory, Network usage
- **Logs**: Real-time application logs
- **Events**: Deployment history

### Custom Monitoring
All services log to stdout, visible in Render logs:
```bash
# Filter logs
render logs -s zypherus-backend | grep "ERROR"
render logs -s zypherus-backend | grep "stt-worker"
```

---

## 🔄 Updating Your Deployment

### Automatic Deploys (Recommended)
Render automatically deploys when you push to GitHub:

```bash
cd /Users/sandhiya.cv/Downloads/react_app/react-app/backend
git add .
git commit -m "Update backend services"
git push origin your-branch
# Render will automatically deploy
```

### Manual Deploy
In Render Dashboard:
1. Go to your service
2. Click "Manual Deploy"
3. Select "Clear build cache & deploy" if needed

---

## 💰 Render Free Tier Limits

- **Free tier includes**:
  - 750 hours/month
  - Automatic SSL
  - Auto-deploys from Git
  - 512MB RAM
  - Spins down after 15 min of inactivity

- **Note**: Free tier services spin down after inactivity. First request after spin-down takes ~30-60 seconds.

- **Upgrade to paid plan** ($7/month) for:
  - No spin-down
  - More resources
  - Better performance

---

## 🔒 Security Best Practices

1. **Use Environment Variables**: Never commit secrets to Git
2. **Rotate Keys**: Regularly rotate API keys
3. **Monitor Logs**: Check for suspicious activity
4. **Update Dependencies**: Keep packages up to date
5. **Enable Auto-Deploy**: Automatically deploy security patches

---

## 📚 Additional Resources

- [Render Documentation](https://render.com/docs)
- [Docker on Render](https://render.com/docs/docker)
- [Environment Variables](https://render.com/docs/environment-variables)
- [Render CLI](https://render.com/docs/cli)

---

## 🆘 Need Help?

- Check Render logs for detailed error messages
- Review environment variables are set correctly
- Verify external services (LiveKit, Groq, Supabase) are working
- Contact Render support: [render.com/support](https://render.com/support)

---

**Deployment successful?** 🎉 Your backend is now live on Render!

Next: Update your frontend to use `https://your-app.onrender.com`

