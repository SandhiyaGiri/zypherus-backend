# Railway Environment Variables Setup

## ⚠️ Important: Single Service Deployment

Your backend is configured to deploy as a **single service** using Docker. Railway will NOT create separate services for dev-server, stt-worker, and llm-service. All three services run within one container using the `start-stack.sh` script.

## Environment Variables Configuration

Configure these environment variables in your Railway project dashboard:

## Required Environment Variables

### LiveKit Configuration
```
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_WS_URL=wss://your-livekit-domain.com
LIVEKIT_WS_URL_FRONTEND=wss://your-livekit-domain.com
```

### Groq Configuration
```
GROQ_API_KEY=your-groq-api-key
GROQ_STT_MODEL=whisper-large-v3-turbo
GROQ_LLM_MODEL=moonshotai/kimi-k2-instruct
```

### Supabase Configuration
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

### CORS Configuration (Optional)
```
# Allow all origins (default for public SDK service)
# Leave CORS_ORIGINS unset to allow all domains

# OR restrict to specific domains (comma-separated)
CORS_ORIGINS=https://myapp.com,https://another-app.com,http://localhost:3000
```

### Service Configuration
```
STT_ROOM_NAME=zypherus-demo
STT_PARTICIPANT_IDENTITY=stt-worker
NODE_ENV=production
DEV_SERVER_PORT=4000
LLM_SERVICE_PORT=4300
PORT=4000

# SSL Configuration (if you encounter certificate issues)
NODE_TLS_REJECT_UNAUTHORIZED=0
```

## How to Set Environment Variables in Railway

1. Go to your Railway project dashboard
2. Click on your service
3. Go to the "Variables" tab
4. Add each environment variable with its value
5. Click "Deploy" to apply the changes

## Port Configuration

Railway automatically sets these ports, but you can override if needed:
- `PORT=4000` (for dev-server)
- `LLM_SERVICE_PORT=4300` (for llm-service)

## Getting API Keys

### LiveKit
1. Sign up at [https://livekit.io](https://livekit.io)
2. Create a new project
3. Get your API key and secret from the project settings
4. Use your LiveKit cloud URL for `LIVEKIT_WS_URL`

### Groq
1. Sign up at [https://console.groq.com](https://console.groq.com)
2. Create an API key
3. Use the API key for `GROQ_API_KEY`

### Supabase
1. Sign up at [https://supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings → API
4. Copy the `service_role` key (starts with `eyJ...`) for `SUPABASE_SERVICE_KEY`
5. Copy the project URL for `SUPABASE_URL`
6. Run the database setup script from `scripts/setup-database.sql` in SQL Editor

## Health Check

Your deployed service will be available at:
- Main API: `https://your-railway-domain.railway.app/health`
- LLM Service: `https://your-railway-domain.railway.app/health` (same domain, different internal port)

## Deployment Process

1. **Connect Repository**: Link your GitHub repository to Railway
2. **Select Dockerfile**: Railway will automatically detect `Dockerfile.backend`
3. **Set Environment Variables**: Add all the variables listed above
4. **Deploy**: Railway will build and deploy as a single service

## Troubleshooting Multiple Services Issue

If Railway tries to create multiple services:
1. Delete the current Railway project
2. Create a new project
3. Manually select "Deploy from Dockerfile"
4. Set Dockerfile path to: `Dockerfile.backend`
5. Ensure `.railwayignore` is present (prevents auto-detection of individual services)

## Frontend Integration

Once deployed, update your frontend to use the Railway URL:
- Replace `localhost:4000` with your Railway domain
- Update WebSocket connections to use the Railway domain
