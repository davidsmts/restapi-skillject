// Download lol.sh file
app.get('/download/lol', (req, res) => {
  const filePath = path.join(__dirname, 'files', 'lol.sh');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Shell script not found' });
  }

  res.download(filePath, 'lol.sh', (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});
// Download hello.sh file
app.get('/download/hello', (req, res) => {
  const filePath = path.join(__dirname, 'files', 'hello.sh');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Shell script not found' });
  }

  res.download(filePath, 'hello.sh', (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const METADATA_DIR = process.env.METADATA_DIR || './metadata';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Ensure metadata directory exists
if (!fs.existsSync(METADATA_DIR)) {
  fs.mkdirSync(METADATA_DIR, { recursive: true });
}

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 100 * 1024 * 1024) // Default 100MB
  }
});

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Upload single file
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    success: true,
    message: 'File uploaded successfully',
    file: {
      originalName: req.file.originalname,
      savedName: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    }
  });
});

// Upload multiple files
app.post('/upload/multiple', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const filesInfo = req.files.map(file => ({
    originalName: file.originalname,
    savedName: file.filename,
    size: file.size,
    mimetype: file.mimetype,
    path: file.path
  }));

  res.json({
    success: true,
    message: `${req.files.length} file(s) uploaded successfully`,
    files: filesInfo
  });
});

// Helper function to capture request data
const captureRequestData = (req, res) => {
  const timestamp = Date.now();
  const requestData = {
    timestamp: timestamp,
    date: new Date(timestamp).toISOString(),
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
    query: req.query,
    params: req.params,
    headers: req.headers,
    body: req.body,
    ip: req.ip,
    ips: req.ips,
    hostname: req.hostname,
    protocol: req.protocol,
    secure: req.secure,
    cookies: req.cookies
  };

  // Save metadata to file
  const filename = `request-${timestamp}.json`;
  const filePath = path.join(METADATA_DIR, filename);

  fs.writeFile(filePath, JSON.stringify(requestData, null, 2), (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to save request data' });
    }

    res.json({
      success: true,
      message: 'Request data captured successfully',
      savedAs: filename,
      data: requestData
    });
  });
};

// Capture GET request data (with full metadata)
app.get('/capture', captureRequestData);

// Capture all POST request data (without file requirement)
app.post('/capture', captureRequestData);

// List uploaded files
app.get('/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read upload directory' });
    }

    const fileStats = files.map(filename => {
      const filePath = path.join(UPLOAD_DIR, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        uploadedAt: stats.mtime
      };
    });

    res.json({ files: fileStats });
  });
});

// Get specific file content
app.get('/files/:filename', (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);

  // Security check: ensure the file path is within UPLOAD_DIR
  const resolvedPath = path.resolve(filePath);
  const resolvedUploadDir = path.resolve(UPLOAD_DIR);

  if (!resolvedPath.startsWith(resolvedUploadDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Check if download query param is set
  if (req.query.download === 'true') {
    res.download(filePath);
  } else {
    res.sendFile(resolvedPath);
  }
});

// List captured metadata
app.get('/metadata', (req, res) => {
  fs.readdir(METADATA_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read metadata directory' });
    }

    const metadataFiles = files.filter(f => f.endsWith('.json')).map(filename => {
      const filePath = path.join(METADATA_DIR, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        capturedAt: stats.mtime
      };
    });

    res.json({ metadata: metadataFiles });
  });
});

// Get specific metadata file
app.get('/metadata/:filename', (req, res) => {
  const filePath = path.join(METADATA_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Metadata file not found' });
  }

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read metadata file' });
    }

    res.json(JSON.parse(data));
  });
});

// Download PPTX file
app.get('/download/pptx', (req, res) => {
  const filePath = path.join(__dirname, 'files', 'dummy.pptx');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'PPTX file not found' });
  }

  res.download(filePath, 'dummy.pptx', (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

// Download SH file
app.get('/download/sh', (req, res) => {
  const filePath = path.join(__dirname, 'files', 'hello.sh');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Shell script not found' });
  }

  res.download(filePath, 'hello.sh', (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: error.message });
  }

  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`File upload server running on port ${PORT}`);
  console.log(`Upload directory: ${path.resolve(UPLOAD_DIR)}`);
  console.log(`Metadata directory: ${path.resolve(METADATA_DIR)}`);
  console.log(`Max file size: ${parseInt(process.env.MAX_FILE_SIZE || 100 * 1024 * 1024)} bytes`);
});
