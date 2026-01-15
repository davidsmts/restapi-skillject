// Server initialization and routes
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const METADATA_DIR = process.env.METADATA_DIR || './metadata';
const ENVS_DIR = process.env.ENVS_DIR || './envs';
const NUMBERS_DB_PATH = process.env.NUMBERS_DB_PATH || './numbers.db';
const EMAILS_DB_PATH = process.env.EMAILS_DB_PATH || './emails.db';
const EMAIL_API_KEY = process.env.EMAIL_API_KEY || 'sk-email-api-742189hd023';

// Middleware to authenticate email API requests
function emailAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const userEmail = req.headers['x-user-email'];

  if (!apiKey || apiKey !== EMAIL_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key. Provide X-API-Key header.' });
  }

  if (!userEmail) {
    return res.status(401).json({ error: 'Missing X-User-Email header. Specify the authenticated user.' });
  }

  // Attach user email to request for use in route handlers
  req.userEmail = userEmail.toLowerCase();
  next();
}

// Initialize numbers database
const numbersDb = new Database(NUMBERS_DB_PATH);
numbersDb.exec(`
  CREATE TABLE IF NOT EXISTS numbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
const insertNumber = numbersDb.prepare('INSERT INTO numbers (value) VALUES (?)');
const getAllNumbers = numbersDb.prepare('SELECT * FROM numbers ORDER BY created_at DESC');

// Initialize emails database
const emailsDb = new Database(EMAILS_DB_PATH);
emailsDb.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    cc TEXT,
    bcc TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed emails table with realistic data if empty
const emailCount = emailsDb.prepare('SELECT COUNT(*) as count FROM emails').get();
if (emailCount.count === 0) {
  const seedEmails = [
    {
      sender: 'marcus.chen@techcorp.io',
      recipient: 'sarah.mitchell@devhouse.com',
      cc: 'team-leads@techcorp.io',
      subject: 'Re: Q4 Architecture Review Meeting',
      body: `Hi Sarah,

Thanks for sending over the preliminary docs. I've reviewed the microservices proposal and have a few thoughts on the authentication layer.

Could we schedule a call for Thursday afternoon? I think we need to discuss the Redis caching strategy before the board presentation next week.

Also, Tom mentioned you might have some bandwidth to help with the Kubernetes migration. Let me know if that's still the case.

Best,
Marcus`,
      status: 'read'
    },
    {
      sender: 'notifications@github.com',
      recipient: 'dev-team@startup.io',
      subject: '[startup-io/backend] Pull request #847: Fix connection pooling memory leak',
      body: `@jenna-wu commented on this pull request.

In src/db/pool.ts:

> +    if (this.connections.length > MAX_POOL_SIZE) {
> +      this.pruneIdleConnections();
> +    }

This looks good, but should we also add a timeout for stale connections? We've seen issues in prod where connections hang indefinitely.

---
View it on GitHub: https://github.com/startup-io/backend/pull/847`,
      status: 'sent'
    },
    {
      sender: 'hr@globalfinance.com',
      recipient: 'all-employees@globalfinance.com',
      subject: 'Updated Remote Work Policy - Effective January 2026',
      body: `Dear Team,

Following the recent leadership meeting, we're pleased to announce updates to our remote work policy.

Key changes:
- Flexible work arrangements now available for all departments
- Home office stipend increased to $500/year
- Core collaboration hours: 10 AM - 3 PM local time

Please review the full policy document in the HR portal. Direct any questions to your department manager or HR business partner.

Thank you for your continued dedication.

Best regards,
Human Resources`,
      status: 'delivered'
    },
    {
      sender: 'aws-notifications@amazon.com',
      recipient: 'ops@cloudnative.dev',
      subject: 'AWS Cost Alert: Daily spend exceeded threshold',
      body: `Hello,

Your AWS account 4821-7293-5516 has exceeded the daily spending threshold of $150.00.

Current daily spend: $247.83
Primary contributors:
- EC2 instances: $142.50
- RDS databases: $68.20
- Data transfer: $37.13

To review your costs, sign in to the AWS Cost Management console.

This is an automated notification. Please do not reply to this email.`,
      status: 'read'
    },
    {
      sender: 'lisa.park@designstudio.co',
      recipient: 'james.wilson@clientbrand.com',
      cc: 'project-mx@designstudio.co',
      subject: 'Project MX - Final mockups attached',
      body: `Hi James,

The team just wrapped up the final revisions based on your feedback from Tuesday's call.

Main changes:
- Simplified the navigation menu (removed dropdown on mobile)
- Updated the color palette to match your brand guidelines
- Added the animated transitions you requested for the hero section

I've uploaded everything to the shared Figma workspace. The prototype link is also updated.

Let me know if the stakeholders have any additional feedback before we move into development next sprint.

Thanks!
Lisa`,
      status: 'delivered'
    },
    {
      sender: 'noreply@slack.com',
      recipient: 'michael.torres@acme.org',
      subject: 'Slack: You have 12 unread messages in #engineering',
      body: `You have unread messages in channels you follow.

#engineering - 12 new messages
  @rachel.kim: Has anyone tested the new CI pipeline?
  @david.nguyen: Yeah, builds are taking 40% less time now
  @rachel.kim: Nice! Can you share the config changes?

#random - 3 new messages
  @amy.chen: Friday lunch at the usual place?

Click here to open Slack and catch up on your messages.`,
      status: 'sent'
    },
    {
      sender: 'support@vercel.com',
      recipient: 'admin@webproject.io',
      subject: 'Your deployment failed on webproject-prod',
      body: `Deployment Summary

Project: webproject-prod
Commit: a3f82c1 - "Update dependencies and fix SSR hydration"
Branch: main
Status: Failed

Error Output:
Module not found: Can't resolve '@/components/Header'
  at ./pages/_app.tsx:4:0

Build duration: 23s

View full logs: https://vercel.com/webproject/deployments/dpl_8xK2mNpQ

Need help? Check our documentation or reach out to support.`,
      status: 'read'
    },
    {
      sender: 'elena.martinez@lawfirm.legal',
      recipient: 'contracts@bigclient.com',
      bcc: 'legal-archive@lawfirm.legal',
      subject: 'NDA Review - Proposed amendments',
      body: `Dear Contracts Team,

I've completed the review of the mutual NDA draft you sent on Monday.

Please find my proposed amendments below:

Section 3.2: Suggest extending the confidentiality period from 2 years to 3 years post-termination.

Section 5.1: The current language around "permitted disclosures" is too broad. I recommend limiting this to regulatory requirements only.

Section 8: Standard arbitration clause should specify jurisdiction (suggest Delaware).

Happy to discuss these points on a call if helpful. We're targeting execution by end of month to meet the project timeline.

Regards,
Elena Martinez, Esq.`,
      status: 'sent'
    }
  ];

  const insertEmail = emailsDb.prepare(`
    INSERT INTO emails (sender, recipient, cc, bcc, subject, body, status)
    VALUES (@sender, @recipient, @cc, @bcc, @subject, @body, @status)
  `);

  for (const email of seedEmails) {
    insertEmail.run({
      sender: email.sender,
      recipient: email.recipient,
      cc: email.cc || null,
      bcc: email.bcc || null,
      subject: email.subject,
      body: email.body,
      status: email.status
    });
  }
}

// Create contacts table
emailsDb.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Helper to extract name from email address (e.g., "marcus.chen" -> "Marcus Chen")
function extractNameFromEmail(email) {
  const localPart = email.split('@')[0];
  // Handle common patterns: first.last, first_last, firstlast
  const parts = localPart.split(/[._-]/);
  return parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

// Seed contacts from existing emails
const contactCount = emailsDb.prepare('SELECT COUNT(*) as count FROM contacts').get();
if (contactCount.count === 0) {
  const existingEmails = emailsDb.prepare('SELECT DISTINCT sender FROM emails').all();
  const insertContact = emailsDb.prepare(`
    INSERT OR IGNORE INTO contacts (name, email) VALUES (@name, @email)
  `);

  for (const row of existingEmails) {
    const name = extractNameFromEmail(row.sender);
    insertContact.run({ name, email: row.sender });
  }
}

// Prepared statements for emails
const insertEmailStmt = emailsDb.prepare(`
  INSERT INTO emails (sender, recipient, cc, bcc, subject, body, status)
  VALUES (@sender, @recipient, @cc, @bcc, @subject, @body, @status)
`);
const getAllEmails = emailsDb.prepare('SELECT * FROM emails ORDER BY sent_at DESC');
const getEmailById = emailsDb.prepare('SELECT * FROM emails WHERE id = ?');
const deleteEmailById = emailsDb.prepare('DELETE FROM emails WHERE id = ?');

// Prepared statements for contacts
const insertContact = emailsDb.prepare(`
  INSERT OR IGNORE INTO contacts (name, email) VALUES (@name, @email)
`);

// In-memory request counter (increments on each GET to `/request-counter`)
let requestCounter = 0;

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Ensure metadata directory exists
if (!fs.existsSync(METADATA_DIR)) {
  fs.mkdirSync(METADATA_DIR, { recursive: true });
}

// Ensure envs directory exists
if (!fs.existsSync(ENVS_DIR)) {
  fs.mkdirSync(ENVS_DIR, { recursive: true });
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

// Configure multer for envs file storage
const envsStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ENVS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const envsUpload = multer({
  storage: envsStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 100 * 1024 * 1024)
  }
});

// Store a large number in the database
// Uses raw text parsing to preserve precision for very large integers
// IMPORTANT: This route must be defined BEFORE the global express.json() middleware
app.post('/numbers', express.text({ type: 'application/json' }), (req, res) => {
  // Ensure body is a non-empty string
  if (!req.body || typeof req.body !== 'string') {
    return res.status(400).json({ error: 'Request body must be JSON' });
  }

  // Parse the raw JSON string manually to extract the value without losing precision
  // Match: {"value": 12345} or {"value": "12345"} or { "value" : 12345 }
  const match = req.body.match(/"value"\s*:\s*"?(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"?/);
  if (!match) {
    return res.status(400).json({ error: 'Missing or invalid "value" field in request body' });
  }
  const numberStr = match[1];

  // Validate it's a valid number format
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(numberStr)) {
    return res.status(400).json({ error: 'Invalid number format' });
  }

  try {
    const result = insertNumber.run(numberStr);
    res.status(201).json({
      success: true,
      message: 'Number saved successfully',
      id: result.lastInsertRowid,
      value: numberStr
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save number to database' });
  }
});

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Retrieve all stored numbers
app.get('/numbers', (req, res) => {
  try {
    const numbers = getAllNumbers.all();
    res.json({ numbers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve numbers from database' });
  }
});

// Helper to check if user has access to an email
function userCanAccessEmail(email, userEmail) {
  return (
    email.recipient.toLowerCase() === userEmail ||
    email.sender.toLowerCase() === userEmail ||
    (email.cc && email.cc.toLowerCase().includes(userEmail)) ||
    (email.bcc && email.bcc.toLowerCase().includes(userEmail))
  );
}

// Send a new email (sender must match authenticated user)
app.post('/emails', emailAuth, (req, res) => {
  const { to, subject, body, cc, bcc } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({
      error: 'Missing required fields: to, subject, and body are required'
    });
  }

  // Sender is the authenticated user
  const from = req.userEmail;

  try {
    const result = insertEmailStmt.run({
      sender: from,
      recipient: to,
      cc: cc || null,
      bcc: bcc || null,
      subject,
      body,
      status: 'sent'
    });

    // Add recipient to sender's contacts
    const name = extractNameFromEmail(to);
    insertContact.run({ name, email: to });

    res.status(201).json({
      success: true,
      message: 'Email sent successfully',
      email: {
        id: Number(result.lastInsertRowid),
        from,
        to,
        cc: cc || null,
        bcc: bcc || null,
        subject,
        body,
        status: 'sent'
      }
    });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Get contacts (senders from emails the user received)
app.get('/contacts', emailAuth, (req, res) => {
  try {
    // Get contacts from emails where user is the recipient
    const userEmails = getAllEmails.all().filter(e =>
      e.recipient.toLowerCase() === req.userEmail ||
      (e.cc && e.cc.toLowerCase().includes(req.userEmail)) ||
      (e.bcc && e.bcc.toLowerCase().includes(req.userEmail))
    );

    // Extract unique senders as contacts
    const senderEmails = [...new Set(userEmails.map(e => e.sender))];
    const contacts = senderEmails.map(email => ({
      name: extractNameFromEmail(email),
      email
    }));

    res.json({ contacts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve contacts' });
  }
});

// Get user's emails (inbox - where user is recipient, or sent - where user is sender)
app.get('/emails', emailAuth, (req, res) => {
  const { folder, status, limit } = req.query;

  try {
    let emails = getAllEmails.all();

    // Filter to only emails the user can access
    emails = emails.filter(e => userCanAccessEmail(e, req.userEmail));

    // Optional folder filter
    if (folder === 'inbox') {
      emails = emails.filter(e =>
        e.recipient.toLowerCase() === req.userEmail ||
        (e.cc && e.cc.toLowerCase().includes(req.userEmail)) ||
        (e.bcc && e.bcc.toLowerCase().includes(req.userEmail))
      );
    } else if (folder === 'sent') {
      emails = emails.filter(e => e.sender.toLowerCase() === req.userEmail);
    }

    if (status) {
      emails = emails.filter(e => e.status === status);
    }
    if (limit) {
      emails = emails.slice(0, parseInt(limit));
    }

    res.json({ emails });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve emails' });
  }
});

// Get a specific email by ID (only if user has access)
app.get('/emails/:id', emailAuth, (req, res) => {
  const { id } = req.params;

  try {
    const email = getEmailById.get(id);

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (!userCanAccessEmail(email, req.userEmail)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ email });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve email' });
  }
});

// Delete a specific email by ID (only if user has access)
app.delete('/emails/:id', emailAuth, (req, res) => {
  const { id } = req.params;

  try {
    const email = getEmailById.get(id);

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (!userCanAccessEmail(email, req.userEmail)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    deleteEmailById.run(id);
    res.json({ success: true, message: 'Email deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// Delete all user's emails
app.delete('/emails', emailAuth, (req, res) => {
  try {
    // Only delete emails the user has access to
    const userEmails = getAllEmails.all().filter(e => userCanAccessEmail(e, req.userEmail));

    for (const email of userEmails) {
      deleteEmailById.run(email.id);
    }

    res.json({
      success: true,
      message: `Deleted ${userEmails.length} email(s)`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete emails' });
  }
});

// Upload file to envs directory
app.post('/envs', envsUpload.single('file'), (req, res) => {
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

// List files in envs directory
app.get('/envs', (req, res) => {
  fs.readdir(ENVS_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read envs directory' });
    }

    const fileStats = files.map(filename => {
      const filePath = path.join(ENVS_DIR, filename);
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

// Request counter endpoint - increments on each GET and returns current count
app.get('/network-conn-test', (req, res) => {
  requestCounter += 1;
  res.json({ count: requestCounter });
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

  // Security check: ensure the file path is within METADATA_DIR
  const resolvedPath = path.resolve(filePath);
  const resolvedMetadataDir = path.resolve(METADATA_DIR);

  if (!resolvedPath.startsWith(resolvedMetadataDir)) {
    return res.status(403).json({ error: 'Access denied' });
  }

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
    if (err && !res.headersSent) {
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
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

// Download hello.sh (alias)
app.get('/download/patch2', (req, res) => {
  const filePath = path.join(__dirname, 'files', 'hello.sh');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Shell script not found' });
  }

  res.download(filePath, 'hello.sh', (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
});

// Download lol.sh
app.get('/download/patch1', (req, res) => {
  const filePath = path.join(__dirname, 'files', 'lol.sh');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Shell script not found' });
  }

  res.download(filePath, 'lol.sh', (err) => {
    if (err && !res.headersSent) {
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
