# File Upload REST API

A simple REST API that saves any file sent to it.

## Features

- Upload single or multiple files
- Capture POST request metadata (URL, headers, body, query params, etc.)
- List all uploaded files and captured metadata
- Configurable file size limits
- Health check endpoint
- Production-ready error handling

## Quick Start

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. The API will be available at `http://localhost:3000`

### Test the API

Upload a single file:
```bash
curl -X POST -F "file=@/path/to/your/file.txt" http://localhost:3000/upload
```

Upload multiple files:
```bash
curl -X POST -F "files=@file1.txt" -F "files=@file2.txt" http://localhost:3000/upload/multiple
```

Capture request metadata (no file needed):
```bash
# Send JSON data
curl -X POST http://localhost:3000/capture \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@example.com"}'

# Send form data
curl -X POST http://localhost:3000/capture \
  -d "name=John&email=john@example.com"

# With query parameters
curl -X POST "http://localhost:3000/capture?user=123&source=mobile" \
  -d "action=login"
```

List uploaded files:
```bash
curl http://localhost:3000/files
```

List captured metadata:
```bash
curl http://localhost:3000/metadata
```

View specific metadata file:
```bash
curl http://localhost:3000/metadata/request-1234567890.json
```

## API Endpoints

### File Upload
- `POST /upload` - Upload a single file (field name: `file`)
- `POST /upload/multiple` - Upload multiple files (field name: `files`, max 10)
- `GET /files` - List all uploaded files

### Request Capture
- `POST /capture` - Capture and save all request metadata (headers, body, query params, URL, etc.)
- `GET /metadata` - List all captured metadata files
- `GET /metadata/:filename` - View specific metadata file

### Health
- `GET /health` - Health check

The `/capture` endpoint extracts and saves:
- Timestamp and ISO date
- HTTP method and URL
- Query parameters
- Request headers
- Request body (JSON, form data, etc.)
- Client IP address
- Protocol and security info
- Cookies (if present)

## Configuration

Create a `.env` file (optional):
```
PORT=3000
UPLOAD_DIR=./uploads
METADATA_DIR=./metadata
MAX_FILE_SIZE=104857600
```

- `PORT`: Server port (default: 3000)
- `UPLOAD_DIR`: Directory to save files (default: ./uploads)
- `METADATA_DIR`: Directory to save captured request metadata (default: ./metadata)
- `MAX_FILE_SIZE`: Max file size in bytes (default: 100MB)

## Easy Deployment Options

### Option 1: Render.com (Recommended - Free Tier Available)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and sign up
3. Click "New" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables if needed
6. Click "Create Web Service"

Your API will be live at `https://your-service.onrender.com`

### Option 2: Railway.app (Free Tier Available)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "Start a New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js and deploys

### Option 3: Fly.io (Free Tier Available)

1. Install Fly CLI: `brew install flyctl` (macOS)
2. Login: `flyctl auth login`
3. Launch app: `flyctl launch`
4. Deploy: `flyctl deploy`

### Option 4: DigitalOcean App Platform

1. Push code to GitHub
2. Go to DigitalOcean → App Platform
3. Create new app from GitHub
4. Configure build and run commands
5. Deploy

### Option 5: Heroku

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create`
4. Deploy: `git push heroku main`

### Option 6: VPS (DigitalOcean, Linode, AWS EC2)

1. SSH into your server
2. Install Node.js: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -`
3. Clone your repo: `git clone <your-repo>`
4. Install dependencies: `npm install`
5. Install PM2: `npm install -g pm2`
6. Start server: `pm2 start server.js`
7. Setup nginx reverse proxy (optional)

Example nginx config:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Production Considerations

- Set appropriate `MAX_FILE_SIZE` to prevent abuse
- Implement authentication if needed
- Consider using cloud storage (AWS S3, Google Cloud Storage) for uploaded files
- Add rate limiting to prevent spam
- Set up monitoring and logging
- Use HTTPS in production

## License

MIT
