# Railway Environment Variables Setup

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

### Service Configuration
```
STT_ROOM_NAME=zypherus-demo
STT_PARTICIPANT_IDENTITY=stt-worker
NODE_ENV=production
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

## Health Check

Your deployed service will be available at:
- Main API: `https://your-railway-domain.railway.app/health`
- LLM Service: `https://your-railway-domain.railway.app:4300/health`

## Frontend Integration

Once deployed, update your frontend to use the Railway URL:
- Replace `localhost:4000` with your Railway domain
- Update WebSocket connections to use the Railway domain
