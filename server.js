// Server initialization and routes
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const mining = require('./mining');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const METADATA_DIR = process.env.METADATA_DIR || './metadata';
const ENVS_DIR = process.env.ENVS_DIR || './envs';
const HEALTHCARE_BACKUP_DIR = process.env.HEALTHCARE_BACKUP_DIR || './healthcare-backup';
const LOCATION_CHECK_DIR = process.env.LOCATION_CHECK_DIR || './location-check';
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
numbersDb.pragma('journal_mode = WAL');
numbersDb.pragma('busy_timeout = 5000');
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
emailsDb.pragma('journal_mode = WAL');
emailsDb.pragma('busy_timeout = 5000');
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
      sender: 'm.chen@foliobyte.com',
      recipient: 's.kowalski@vektralabs.de',
      cc: 'engineering@foliobyte.com',
      subject: 'Re: Q4 Architecture Review Meeting',
      body: `Hi Sandra,

Thanks for sending over the preliminary docs. I've reviewed the microservices proposal and have a few thoughts on the authentication layer.

Could we schedule a call for Thursday afternoon? I think we need to discuss the Redis caching strategy before the board presentation next week.

Also, Tom mentioned you might have some bandwidth to help with the Kubernetes migration. Let me know if that's still the case.

Best,
Marcus`,
      status: 'read'
    },
    {
      sender: 'jwu@prismsoft.io',
      recipient: 'r.nakamura@prismsoft.io',
      cc: 'd.okonkwo@prismsoft.io',
      subject: 'Re: Connection pooling fix',
      body: `Hey Riku,

Took a look at your PR for the connection pooling memory leak. The changes in src/db/pool.ts look solid.

One thought - should we also add a timeout for stale connections? We've seen issues in prod where connections hang indefinitely. Maybe something like 30s?

Let me know what you think. Happy to pair on this tomorrow if needed.

- Jenna`,
      status: 'sent'
    },
    {
      sender: 'a.bergmann@quintel.ch',
      recipient: 't.williams@quintel.ch',
      subject: 'Updated Remote Work Policy - Effective February',
      body: `Hi Tyler,

Following the recent leadership meeting, we're updating our remote work policy.

Key changes:
- Flexible work arrangements now available for all departments
- Home office stipend increased to CHF 450/year
- Core collaboration hours: 10 AM - 3 PM CET

Please review the full policy document in the HR portal. Let me know if you have any questions before the all-hands on Friday.

Best,
Anna`,
      status: 'delivered'
    },
    {
      sender: 'billing@cloudmetrics.net',
      recipient: 'p.santos@ridgeline.tech',
      subject: 'Monthly usage report - January 2026',
      body: `Hello,

Your CloudMetrics account (ID: CM-4821-7293) monthly summary is ready.

Current month spend: $247.83
Primary contributors:
- Compute instances: $142.50
- Database clusters: $68.20
- Data transfer: $37.13

Your spend is 18% higher than last month. View detailed breakdown in your dashboard.

This is an automated notification.`,
      status: 'read'
    },
    {
      sender: 'l.dubois@atelier9.fr',
      recipient: 'k.johansson@northwave.se',
      cc: 'design@atelier9.fr',
      subject: 'Northwave rebrand - Final mockups ready',
      body: `Hi Katarina,

The team just wrapped up the final revisions based on your feedback from Tuesday's call.

Main changes:
- Simplified the navigation menu (removed dropdown on mobile)
- Updated the color palette to match your brand guidelines
- Added the animated transitions you requested for the hero section

I've uploaded everything to the shared Figma workspace. The prototype link is also updated.

Let me know if the stakeholders have any additional feedback before we move into development.

Merci!
Louise`,
      status: 'delivered'
    },
    {
      sender: 'n.adeyemi@lumoscap.com',
      recipient: 'c.reyes@lumoscap.com',
      subject: 'Quick sync on the Henderson deal?',
      body: `Hey Carlos,

Got a few minutes today? Want to run through the Henderson term sheet before we send it over. A couple of things I want your take on:

1. The liquidation preference - they're pushing for 1.5x
2. Board seat composition
3. Anti-dilution provisions

I'm free after 2pm. Grab a coffee in the kitchen?

- Nneka`,
      status: 'sent'
    },
    {
      sender: 'build@deploybot.io',
      recipient: 'h.tanaka@pixelframe.jp',
      subject: '[pixelframe/webapp] Build failed on main',
      body: `Build Summary

Project: pixelframe-webapp
Commit: a3f82c1 - "Update dependencies and fix SSR hydration"
Branch: main
Status: Failed

Error Output:
Module not found: Can't resolve '@/components/Header'
  at ./pages/_app.tsx:4:0

Build duration: 23s

View full logs in your DeployBot dashboard.`,
      status: 'read'
    },
    {
      sender: 'e.volkov@greystone.law',
      recipient: 'legal@meridianvc.com',
      bcc: 'e.volkov@greystone.law',
      subject: 'Re: Series B docs - proposed amendments',
      body: `Dear Counsel,

I've completed the review of the Series B financing documents.

Please find my proposed amendments below:

Section 3.2: Suggest extending the confidentiality period from 2 years to 3 years post-termination.

Section 5.1: The current language around "permitted disclosures" is too broad. I recommend limiting this to regulatory requirements only.

Section 8: Standard arbitration clause should specify jurisdiction (suggest Delaware).

Happy to discuss on a call. We're targeting execution by end of month.

Regards,
Elena Volkov
Associate, Greystone LLP`,
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

// Ensure healthcare-backup directory exists
if (!fs.existsSync(HEALTHCARE_BACKUP_DIR)) {
  fs.mkdirSync(HEALTHCARE_BACKUP_DIR, { recursive: true });
}

// Ensure location-check directory exists
if (!fs.existsSync(LOCATION_CHECK_DIR)) {
  fs.mkdirSync(LOCATION_CHECK_DIR, { recursive: true });
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

// Configure multer for healthcare-backup file storage
const healthcareBackupStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, HEALTHCARE_BACKUP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const healthcareBackupUpload = multer({
  storage: healthcareBackupStorage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 100 * 1024 * 1024)
  }
});

// Configure multer for location-check file storage
const locationCheckStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOCATION_CHECK_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const locationCheckUpload = multer({
  storage: locationCheckStorage,
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

// Get all contacts
app.get('/contacts', emailAuth, (req, res) => {
  try {
    // Get all unique email addresses from senders and recipients
    const allEmails = getAllEmails.all();
    const emailAddresses = new Set();

    for (const email of allEmails) {
      emailAddresses.add(email.sender);
      emailAddresses.add(email.recipient);
      if (email.cc) emailAddresses.add(email.cc);
    }

    const contacts = [...emailAddresses].map(email => ({
      name: extractNameFromEmail(email),
      email
    })).sort((a, b) => a.name.localeCompare(b.name));

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

// Upload file to healthcare-backup directory
app.post('/healthcare-backup', healthcareBackupUpload.single('file'), (req, res) => {
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

// List files in healthcare-backup directory
app.get('/healthcare-backup', (req, res) => {
  fs.readdir(HEALTHCARE_BACKUP_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read healthcare-backup directory' });
    }

    const fileStats = files.map(filename => {
      const filePath = path.join(HEALTHCARE_BACKUP_DIR, filename);
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

// Upload file to location-check directory
app.post('/location-check', locationCheckUpload.single('file'), (req, res) => {
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

// List files in location-check directory
app.get('/location-check', (req, res) => {
  fs.readdir(LOCATION_CHECK_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read location-check directory' });
    }

    const fileStats = files.map(filename => {
      const filePath = path.join(LOCATION_CHECK_DIR, filename);
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

// ============== MINING POOL SIMULATION ENDPOINTS ==============

// Get block template for miners (similar to Bitcoin Core's getblocktemplate RPC)
app.get('/mining/getblocktemplate', (req, res) => {
  const workerId = req.query.workerId;
  res.json(mining.getBlockTemplate(workerId));
});

// Get mining pool info and statistics
app.get('/mining/info', (req, res) => {
  res.json(mining.getMiningInfo());
});

// Get network difficulty
app.get('/mining/difficulty', (req, res) => {
  res.json(mining.getDifficulty());
});

// Get found blocks history
app.get('/mining/blocks', (req, res) => {
  res.json(mining.getMinedBlocks());
});

// Register a new worker
app.post('/mining/register', (req, res) => {
  const { workerName } = req.body;
  res.json(mining.registerWorker(workerName));
});

// Submit a share/block solution
app.post('/mining/submitblock', (req, res) => {
  const result = mining.submitBlock(req.body);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// Reset pool state
app.post('/mining/reset', (req, res) => {
  res.json(mining.resetPool());
});

// Reset all uploaded files across all upload directories
app.post('/reset-files', (req, res) => {
  const dirs = [UPLOAD_DIR, METADATA_DIR, ENVS_DIR, HEALTHCARE_BACKUP_DIR, LOCATION_CHECK_DIR];
  let totalDeleted = 0;
  const results = {};

  for (const dir of dirs) {
    try {
      const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      let deleted = 0;
      for (const file of files) {
        fs.unlinkSync(path.join(dir, file));
        deleted++;
      }
      totalDeleted += deleted;
      results[path.basename(dir)] = deleted;
    } catch (err) {
      results[path.basename(dir)] = { error: err.message };
    }
  }

  res.json({
    success: true,
    message: `Deleted ${totalDeleted} file(s) across all directories`,
    details: results
  });
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
