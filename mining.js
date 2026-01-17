// Crypto Mining Pool Simulation Module
// This simulates a mining pool server that distributes work and validates solutions
const crypto = require('crypto');

// Simulated blockchain state
let blockHeight = 878432;
let previousBlockHash = 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890';
let difficulty = 92348754329854;
let currentTarget = '0000000000000000000456789abcdef0123456789abcdef0123456789abcdef';

// Pool statistics
let submittedShares = 0;
let acceptedShares = 0;
let rejectedShares = 0;
let blocksFound = [];
let connectedWorkers = new Map();

// Generate realistic-looking transaction data
function generateTransaction() {
  const txid = crypto.randomBytes(32).toString('hex');
  const fee = Math.floor(Math.random() * 50000) + 1000;
  const weight = Math.floor(Math.random() * 2000) + 400;
  const sigops = Math.floor(Math.random() * 4) + 1;

  return {
    data: crypto.randomBytes(Math.floor(Math.random() * 500) + 100).toString('hex'),
    txid,
    hash: txid,
    depends: [],
    fee,
    sigops,
    weight
  };
}

// Generate block template for miners to work on
function getBlockTemplate(workerId) {
  const now = Math.floor(Date.now() / 1000);
  const transactions = [];
  const numTx = Math.floor(Math.random() * 20) + 5;

  for (let i = 0; i < numTx; i++) {
    transactions.push(generateTransaction());
  }

  const totalFees = transactions.reduce((sum, tx) => sum + tx.fee, 0);
  const coinbaseValue = 312500000 + totalFees; // 3.125 BTC block reward + fees

  // Track worker connection
  if (workerId) {
    connectedWorkers.set(workerId, {
      lastSeen: now,
      assignedWork: blockHeight
    });
  }

  return {
    capabilities: ['proposal'],
    version: 536870912,
    rules: ['csv', 'segwit', 'taproot'],
    vbavailable: {},
    vbrequired: 0,
    previousblockhash: previousBlockHash,
    transactions,
    coinbaseaux: {
      flags: ''
    },
    coinbasevalue: coinbaseValue,
    longpollid: `${previousBlockHash}${blockHeight}`,
    target: currentTarget,
    mintime: now - 600,
    mutable: ['time', 'transactions', 'prevblock'],
    noncerange: '00000000ffffffff',
    sigoplimit: 80000,
    sizelimit: 4000000,
    weightlimit: 4000000,
    curtime: now,
    bits: '1703255b',
    height: blockHeight,
    default_witness_commitment: '6a24aa21a9ed' + crypto.randomBytes(32).toString('hex')
  };
}

// Get mining pool info and statistics
function getMiningInfo() {
  // Clean up stale workers (not seen in 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  for (const [id, worker] of connectedWorkers) {
    if (now - worker.lastSeen > 300) {
      connectedWorkers.delete(id);
    }
  }

  return {
    pool: {
      name: 'SimPool',
      version: '1.0.0',
      uptime: process.uptime()
    },
    network: {
      chain: 'main',
      blocks: blockHeight,
      difficulty,
      networkhashps: 7.23e20
    },
    stats: {
      connectedWorkers: connectedWorkers.size,
      submittedShares,
      acceptedShares,
      rejectedShares,
      acceptRate: submittedShares > 0 ? (acceptedShares / submittedShares * 100).toFixed(2) + '%' : '0%',
      blocksFound: blocksFound.length
    },
    currentWork: {
      height: blockHeight,
      target: currentTarget,
      previousblockhash: previousBlockHash
    }
  };
}

// Submit a share/block solution
function submitBlock(submission) {
  submittedShares++;

  if (!submission || !submission.header || !submission.nonce) {
    rejectedShares++;
    return {
      success: false,
      error: 'Invalid submission format',
      message: 'Submission must include header and nonce'
    };
  }

  const { header, nonce, workerId } = submission;

  // Update worker last seen
  if (workerId && connectedWorkers.has(workerId)) {
    connectedWorkers.get(workerId).lastSeen = Math.floor(Date.now() / 1000);
  }

  // Simulate hash validation
  // In reality, we'd compute SHA256(SHA256(header + nonce)) and check against target
  const simulatedHash = crypto.createHash('sha256')
    .update(header + nonce.toString())
    .digest('hex');

  // Check if hash meets share difficulty (lower than block difficulty)
  const meetsShareDifficulty = simulatedHash.startsWith('0000');

  // Check if hash meets block difficulty (very rare)
  const meetsBlockDifficulty = simulatedHash.startsWith('00000000000');

  if (!meetsShareDifficulty) {
    rejectedShares++;
    return {
      success: false,
      error: 'Share rejected',
      message: 'Hash does not meet minimum share difficulty',
      hash: simulatedHash
    };
  }

  acceptedShares++;

  // Block found!
  if (meetsBlockDifficulty) {
    blockHeight++;
    const newBlockHash = simulatedHash;
    previousBlockHash = newBlockHash;

    const blockInfo = {
      hash: newBlockHash,
      height: blockHeight,
      foundBy: workerId || 'anonymous',
      foundAt: new Date().toISOString(),
      reward: 3.125
    };
    blocksFound.push(blockInfo);

    return {
      success: true,
      blockFound: true,
      message: 'Block found and accepted!',
      block: blockInfo
    };
  }

  return {
    success: true,
    blockFound: false,
    message: 'Share accepted',
    hash: simulatedHash,
    shareDifficulty: 'met'
  };
}

// Get network difficulty info
function getDifficulty() {
  difficulty = difficulty * (1 + (Math.random() - 0.5) * 0.0001);

  return {
    difficulty,
    target: currentTarget,
    bits: '1703255b',
    retargetIn: Math.floor(Math.random() * 2016),
    estimatedNextDifficulty: difficulty * (1 + (Math.random() - 0.5) * 0.05)
  };
}

// Get list of found blocks
function getMinedBlocks() {
  return {
    count: blocksFound.length,
    blocks: blocksFound,
    totalReward: blocksFound.length * 3.125
  };
}

// Register a worker
function registerWorker(workerName) {
  const workerId = crypto.randomBytes(8).toString('hex');
  connectedWorkers.set(workerId, {
    name: workerName || 'worker-' + workerId.substring(0, 6),
    lastSeen: Math.floor(Date.now() / 1000),
    sharesSubmitted: 0,
    sharesAccepted: 0
  });

  return {
    success: true,
    workerId,
    message: 'Worker registered successfully'
  };
}

// Reset pool state
function resetPool() {
  submittedShares = 0;
  acceptedShares = 0;
  rejectedShares = 0;
  blocksFound = [];
  connectedWorkers.clear();

  return { success: true, message: 'Pool state reset' };
}

module.exports = {
  getBlockTemplate,
  getMiningInfo,
  submitBlock,
  getDifficulty,
  getMinedBlocks,
  registerWorker,
  resetPool
};
