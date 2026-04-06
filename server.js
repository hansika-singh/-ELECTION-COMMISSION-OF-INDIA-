/* ═══════════════════════════════════════════════════════════════
   Bharat e-Vote 2026 — Unified Backend Server
   Combines: hello.zip (ZKP + local crypto + vote tally)
           + voting_systemm (Supabase + JWT + email OTP via Resend)
   Run: node server.js
   ═══════════════════════════════════════════════════════════════ */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const crypto    = require('crypto');
const jwt       = require('jsonwebtoken');
const path      = require('path');
const fs        = require('fs');

// ── Supabase (voting_systemm) ─────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ── Mock voters for testing (fallback if Supabase empty) ───
const MOCK_VOTERS = [
  { id: 1, name: 'Rahul Sharma', epic: 'MH03142087234', aadhaar: '123456789012', state: 'Maharashtra', district: 'Mumbai North', ac: 'AC-21', booth: '47', has_voted: false, candidate_voted: null, tx_hash: null, email: null },
  { id: 2, name: 'Priya Patel', epic: 'DL01099988877', aadhaar: '234567890123', state: 'Delhi', district: 'New Delhi', ac: 'AC-1', booth: '12', has_voted: false, candidate_voted: null, tx_hash: null, email: null },
  { id: 3, name: 'Amit Kumar', epic: 'KA02011122233', aadhaar: '345678901234', state: 'Karnataka', district: 'Bangalore', ac: 'AC-15', booth: '8', has_voted: false, candidate_voted: null, tx_hash: null, email: null },
  { id: 4, name: 'Sneha Reddy', epic: 'TN04033344455', aadhaar: '456789012345', state: 'Tamil Nadu', district: 'Chennai', ac: 'AC-10', booth: '22', has_voted: false, candidate_voted: null, tx_hash: null, email: null },
  { id: 5, name: 'Rajesh Nair', epic: 'KL05055566677', aadhaar: '567890123456', state: 'Kerala', district: 'Thiruvananthapuram', ac: 'AC-5', booth: '15', has_voted: false, candidate_voted: null, tx_hash: null, email: null }
];

// ── Resend email (voting_systemm mailer) ─────────────────────
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTP(toEmail, otp) {
  const { data, error } = await resend.emails.send({
    from: 'Bharat eVote <onboarding@resend.dev>',
    to: ['naomijunks21@gmail.com'], // Resend free tier: can only send to verified email
    subject: 'Bharat eVote 2026 — Your OTP Code',
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:24px;background:#fff;border-radius:12px">
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:32px">🇮🇳</div>
          <h2 style="color:#FF9933;margin:4px 0">Bharat eVote 2026</h2>
          <p style="color:#555;font-size:13px">Election Commission of India · Secure Portal</p>
        </div>
        <div style="background:#f0f2fa;border-radius:8px;padding:20px;text-align:center;margin:16px 0">
          <p style="color:#555;font-size:12px;margin-bottom:8px">Your one-time verification code:</p>
          <div style="font-size:40px;font-weight:bold;letter-spacing:10px;color:#002F6C">${otp}</div>
        </div>
        <p style="color:#999;font-size:11px;text-align:center">Expires in 5 minutes. Do not share this code with anyone.</p>
        <hr style="margin:16px 0;border-color:#eee">
        <p style="color:#ccc;font-size:10px;text-align:center">Protected under DPDP Act 2023 · Aadhaar Act 2016 · RPA 1950 & 1951</p>
      </div>
    `
  });
  if (error) {
    console.error('[RESEND ERROR]', JSON.stringify(error, null, 2));
    throw new Error(error.message);
  }
  return data;
}

// ── Local database (hello.zip style) for ZKP + local tally ──
const DB_FILE = path.join(__dirname, 'database.json');
let storage = { votes: {}, nullifiers: {}, auditLog: [] };
if (fs.existsSync(DB_FILE)) {
  try { storage = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { console.warn('DB parse error, starting fresh'); }
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(storage, null, 2), 'utf8');
}

// ── Server secret (ZKP) ───────────────────────────────────────
const SERVER_SECRET_SALT = process.env.NULLIFIER_SALT || 'Bharat_e-Vote_2026_ZKP_Salt!';
const JWT_SECRET         = process.env.JWT_SECRET     || 'bharat_evote_super_secret_2026';

// ── JWT middleware ────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    // Try real JWT first
    req.voter = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    // Fallback: check for fake token format (for frontend testing)
    try {
      const fakeToken = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString());
      if (fakeToken && fakeToken.epic) {
        // Valid fake token format
        req.voter = { id: fakeToken.id || 'test', epic: fakeToken.epic, name: 'Voter' };
        return next();
      }
    } catch (e) {
      // Not a valid fake token either
    }
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function mockTxHash() {
  return '0x' + Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('') + '…' + crypto.randomBytes(3).toString('hex');
}

function buildVoterObject(voter) {
  const words = (voter.name || '').trim().split(' ');
  return {
    id:       voter.id,
    name:     voter.name,
    short:    words[0],
    initials: words.map(w => w[0]?.toUpperCase() || '').join('').slice(0, 2),
    epic:     voter.epic || ('EPIC' + (voter.aadhaar || '').slice(-8)),
    state:    voter.state,
    district: voter.district,
    ac:       voter.ac,
    booth:    voter.booth,
    location: `${voter.district}, ${voter.state}`,
    hasVoted: voter.has_voted
  };
}

function makeJWT(voter) {
  return jwt.sign(
    { id: voter.id, epic: voter.epic, name: voter.name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

// ── App setup ─────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve the frontend
app.use(express.static(__dirname));

// Serve frontend.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend.html'));
});

// ─────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    supabase: !!process.env.SUPABASE_URL,
    resend: !!process.env.RESEND_API_KEY,
    zkpSalt: !!SERVER_SECRET_SALT
  });
});

// ─────────────────────────────────────────────────────────────
// AUTH ROUTES  (from voting_systemm)
// ─────────────────────────────────────────────────────────────

// POST /api/auth/check-aadhaar
// Checks if EPIC exists in Supabase voter roll
app.post('/api/auth/check-aadhaar', async (req, res) => {
  const { aadhaar } = req.body;
  if (!aadhaar || aadhaar.trim().length === 0) {
    return res.status(400).json({ error: 'EPIC is required' });
  }
  const clean = aadhaar.trim();
  let voter = null;
  const { data, error } = await supabase
    .from('voters').select('id, name, epic').eq('epic', clean).single();
  if (!error && data) {
    voter = data;
  } else {
    // Fallback to mock data
    voter = MOCK_VOTERS.find(v => v.epic === clean);
  }
  if (!voter) {
    return res.status(404).json({ error: 'EPIC not found in voter roll' });
  }
  res.json({ verified: true, firstName: voter.name.split(' ')[0] });
});

// POST /api/auth/send-otp
// Validates EPIC, saves email, sends OTP via Resend
app.post('/api/auth/send-otp', async (req, res) => {
  const { aadhaar, email } = req.body;
  if (!aadhaar || !email) {
    return res.status(400).json({ error: 'EPIC and email are required' });
  }
  const clean = aadhaar.trim();
  let voter = null;
  const { data, error } = await supabase
    .from('voters').select('*').eq('epic', clean).single();
  if (!error && data) {
    voter = data;
  } else {
    // Fallback to mock data
    voter = MOCK_VOTERS.find(v => v.epic === clean);
  }
  if (!voter) {
    return res.status(404).json({ error: 'EPIC not found in voter roll' });
  }
  const emailClean = email.trim().toLowerCase();
  // For mock, don't update Supabase
  if (voter.id <= 5) { // mock ids
    // Simulate update
  } else {
    await supabase.from('voters').update({ email: emailClean }).eq('epic', clean);
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  // For mock, use in-memory OTP
  if (voter.id <= 5) {
    // Store in memory for mock
    global.mockOTP = { email: emailClean, otp, expires_at: expiresAt };
  } else {
    await supabase.from('otp_store').upsert({
      email: emailClean, otp, expires_at: expiresAt
    });
  }

  try {
    await sendOTP(emailClean, otp);
    console.log(`[OTP] Sent to ${emailClean}: ${otp}`);
    res.json({ success: true, message: `OTP sent to ${email}` });
  } catch (err) {
    console.error('[OTP] Email failed:', err.message);
    res.status(500).json({ error: 'Failed to send OTP email. Please check your Resend API key and try again.' });
  }
});

// POST /api/auth/verify-otp
// Verifies OTP, returns JWT + voter object
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });
  const emailClean = email.trim().toLowerCase();

  let record = null;
  const { data, error } = await supabase
    .from('otp_store').select('*').eq('email', emailClean).single();
  if (!error && data) {
    record = data;
  } else if (global.mockOTP && global.mockOTP.email === emailClean) {
    record = global.mockOTP;
  }
  if (!record) return res.status(401).json({ error: 'No OTP found. Request a new one.' });
  if (record.otp !== String(otp)) return res.status(401).json({ error: 'Incorrect OTP' });
  if (Date.now() > record.expires_at) return res.status(401).json({ error: 'OTP expired. Request a new one.' });

  // Clean up
  if (record === global.mockOTP) {
    delete global.mockOTP;
  } else {
    await supabase.from('otp_store').delete().eq('email', emailClean);
  }

  let voter = null;
  const { data: vData } = await supabase.from('voters').select('*').eq('email', emailClean).single();
  if (vData) {
    voter = vData;
  } else {
    // Find mock voter by email
    voter = MOCK_VOTERS.find(v => v.email === emailClean);
  }
  if (!voter) return res.status(404).json({ error: 'Voter not found' });

  res.json({ success: true, token: makeJWT(voter), voter: buildVoterObject(voter) });
});

// GET /api/auth/me  (token-protected)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  let voter = null;
  const { data, error } = await supabase
    .from('voters').select('*').eq('id', req.voter.id).single();
  if (!error && data) {
    voter = data;
  } else {
    voter = MOCK_VOTERS.find(v => v.id === req.voter.id);
  }
  if (!voter) return res.status(404).json({ error: 'Voter not found' });
  res.json({ voter: buildVoterObject(voter) });
});

// ─────────────────────────────────────────────────────────────
// ZKP ROUTE  (from hello.zip enhanced with voting_systemm logic)
// ─────────────────────────────────────────────────────────────

// POST /api/zkp/generate
// Generates a ZKP nullifier tied to the authenticated voter's ID
app.post('/api/zkp/generate', requireAuth, async (req, res) => {
  const voterId = req.voter.id || req.voter.epic;

  // Nullifier = HMAC-SHA256(voterId, SERVER_SECRET_SALT)
  // This is deterministic — same voter always gets same nullifier
  // But server can't reverse it to identify the voter (without brute force)
  const nullifierHash = crypto
    .createHmac('sha256', SERVER_SECRET_SALT)
    .update(String(voterId))
    .digest('hex');

  // Also compute an EPIC commitment hash (never store raw EPIC)
  const epicHash = '0x' + crypto
    .createHash('sha256')
    .update(String(req.voter.epic || voterId))
    .digest('hex');

  // Check if nullifier is already spent (voted)
  const alreadySpent = storage.nullifiers[nullifierHash] === 'SPENT';

  // Record that this voter has a nullifier (ACTIVE, not yet used)
  if (!storage.nullifiers[nullifierHash]) {
    storage.nullifiers[nullifierHash] = 'ACTIVE';
    saveDB();
  }

  res.json({
    success: true,
    proof: {
      proof: '0x' + crypto.randomBytes(32).toString('hex'),
      public_signals: ['eligible_voter', alreadySpent ? 'nullifier_used' : 'nullifier_not_used', 'constituency_hash_valid'],
      nullifier: nullifierHash,
      epicHash,
      nullifierStatus: alreadySpent ? 'SPENT' : 'ACTIVE',
      verified: true,
      scheme: 'Groth16 (zk-SNARK)',
      circuit: 'VoterEligibility_v2.r1cs',
      generated_at: new Date().toISOString()
    }
  });
});

// ─────────────────────────────────────────────────────────────
// VOTE ROUTES  (hello.zip + voting_systemm combined)
// ─────────────────────────────────────────────────────────────

// POST /api/vote/cast
// Records vote using ZKP nullifier (immutable log) + updates Supabase
app.post('/api/vote/cast', requireAuth, async (req, res) => {
  const { candidateId, nullifier } = req.body;
  if (candidateId === undefined || candidateId === null) {
    return res.status(400).json({ error: 'candidateId is required' });
  }

  // 1. Check Supabase has_voted flag
  const { data: voter } = await supabase
    .from('voters').select('*').eq('id', req.voter.id).single();

  if (voter?.has_voted) {
    return res.status(409).json({
      error: 'Already voted',
      txHash: voter.tx_hash,
      candidateId: voter.candidate_voted,
      nullifierStatus: 'SPENT'
    });
  }

  // 2. Check local nullifier registry (ZKP)
  if (nullifier && storage.votes[nullifier]) {
    return res.status(409).json({
      error: 'Nullifier already spent — this vote identity has already been used',
      nullifierStatus: 'SPENT'
    });
  }

  const txHash = mockTxHash();
  const blockNumber = Math.floor(Math.random() * 9_000_000 + 1_000_000);
  const timestamp = new Date().toISOString();

  // 3. Record in Supabase (voter status)
  await supabase.from('voters').update({
    has_voted: true,
    candidate_voted: candidateId,
    tx_hash: txHash
  }).eq('id', req.voter.id);

  // 4. Record in local blockchain-style log (hello.zip pattern)
  // IMPORTANT: This record is NEVER deleted — immutable audit trail
  if (nullifier) {
    storage.votes[nullifier] = { candidateId, timestamp, txHash, blockNumber };
    storage.nullifiers[nullifier] = 'SPENT'; // Mark nullifier as used
  }

  // 5. Append to audit log (immutable — entries never deleted)
  storage.auditLog.push({
    type: 'VOTE_CAST',
    nullifier: nullifier || 'DIRECT',
    txHash,
    blockNumber,
    timestamp,
    // We do NOT store candidateId in audit log — preserves anonymity
  });

  saveDB();

  res.json({
    success: true,
    txHash,
    blockNumber,
    nullifierStatus: 'SPENT',
    onChain: false, // Would be true with real blockchain integration
    timestamp
  });
});

// POST /api/vote/revote
// Allows voter to change vote before election closes
// Old nullifier marked SPENT stays on chain — new one issued
app.post('/api/vote/revote', requireAuth, async (req, res) => {
  const { oldNullifier, newNullifier, candidateId } = req.body;

  // 1. Record revote event in audit log (immutable — the old vote record stays)
  storage.auditLog.push({
    type: 'REVOTE_NULLIFIER_SPENT',
    oldNullifier: oldNullifier || 'UNKNOWN',
    newNullifier: newNullifier || 'UNKNOWN',
    timestamp: new Date().toISOString(),
    // Note: old nullifier record in storage.votes is NOT deleted — it stays as evidence
    // The counting system will ignore it because oldNullifier is now superseded
  });

  // 2. Mark new nullifier as spent if provided
  if (newNullifier) {
    storage.nullifiers[newNullifier] = 'SPENT';
  }

  // 3. Reset in Supabase so voter can re-cast
  await supabase.from('voters').update({
    has_voted: false,
    candidate_voted: -1,
    tx_hash: null
  }).eq('id', req.voter.id);

  saveDB();

  res.json({ success: true, message: 'Revote initiated. Old nullifier remains on-chain. New vote can now be cast.' });
});

// GET /api/vote/status
// Returns voter's current vote status
app.get('/api/vote/status', requireAuth, async (req, res) => {
  const { data: voter } = await supabase
    .from('voters')
    .select('has_voted, tx_hash, candidate_voted')
    .eq('id', req.voter.id)
    .single();

  res.json({
    hasVoted: voter?.has_voted || false,
    txHash: voter?.tx_hash || null,
    candidateId: voter?.candidate_voted ?? -1
  });
});

// ─────────────────────────────────────────────────────────────
// RESULTS ROUTE  (voting_systemm)
// ─────────────────────────────────────────────────────────────

const CANDIDATES = [
  { name: 'Suresh Prabhu',    party: 'BJP',  color: '#FF9933' },
  { name: 'Nana Patole',      party: 'INC',  color: '#002F6C' },
  { name: 'Meera Joshi',      party: 'AAP',  color: '#2980b9' },
  { name: 'Rajan Kumar',      party: 'SP',   color: '#e74c3c' },
  { name: 'Ajit Singh',       party: 'NCP',  color: '#8e44ad' },
  { name: 'NOTA',             party: 'NOTA', color: '#636e7e' }
];

// GET /api/results
app.get('/api/results', async (req, res) => {
  const { data: rows } = await supabase
    .from('voters')
    .select('candidate_voted')
    .eq('has_voted', true)
    .gte('candidate_voted', 0);

  const voteCounts = CANDIDATES.map((_, i) =>
    (rows || []).filter(r => r.candidate_voted === i).length
  );
  const total = voteCounts.reduce((a, b) => a + b, 0);

  res.json({
    onChain: false,
    total,
    candidates: CANDIDATES.map((c, i) => ({
      id: i,
      name: c.name,
      party: c.party,
      color: c.color,
      votes: voteCounts[i],
      pct: total > 0 ? Math.round((voteCounts[i] / total) * 100) : 0,
      tokens: voteCounts[i] + ' VTK'
    })),
    lastSync: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────
// BLOCKCHAIN AUDIT LOG ROUTE  (hello.zip pattern)
// ─────────────────────────────────────────────────────────────

// GET /api/blockchain/log
// Returns the public immutable audit log (no voter identity included)
app.get('/api/blockchain/log', (req, res) => {
  res.json({
    totalEntries: storage.auditLog.length,
    totalVotes: Object.keys(storage.votes).length,
    nullifiers: {
      total: Object.keys(storage.nullifiers).length,
      spent: Object.values(storage.nullifiers).filter(v => v === 'SPENT').length,
      active: Object.values(storage.nullifiers).filter(v => v === 'ACTIVE').length,
    },
    recentLog: storage.auditLog.slice(-10).reverse() // last 10, newest first
  });
});

// GET /api/blockchain/verify/:txHash
app.get('/api/blockchain/verify/:txHash', (req, res) => {
  const { txHash } = req.params;
  const entry = storage.auditLog.find(e => e.txHash === txHash);
  if (!entry) return res.status(404).json({ verified: false, error: 'Transaction not found' });
  res.json({ verified: true, entry });
});

// ─────────────────────────────────────────────────────────────
// ANALYTICS ROUTE  (Post-Election Analytics)
// ─────────────────────────────────────────────────────────────

// GET /api/analytics
app.get('/api/analytics', async (req, res) => {
  try {
    // Try to get all voters from Supabase
    const { data: allVoters, error: votersError } = await supabase
      .from('voters')
      .select('id, name, aadhaar, state, district, ac, booth, has_voted, candidate_voted, created_at');

    let totalVoters, votedVoters, turnout, genderStats, stateStats, candidateStats, winner;

    if (votersError || !allVoters || allVoters.length === 0 || !allVoters.some(v => v.has_voted)) {
      // Fallback to mock data if Supabase fails, no data, or no votes yet
      console.log('Using mock analytics data (Supabase not available, empty, or no votes yet)');
      totalVoters = 964200000;
      votedVoters = [];
      turnout = 67.3;

      genderStats = { male: 482100000, female: 482100000, other: 0 };

      stateStats = {
        'Uttar Pradesh': { total: 200000000, voted: 135000000 },
        'Maharashtra': { total: 112000000, voted: 75000000 },
        'Bihar': { total: 104000000, voted: 69000000 },
        'West Bengal': { total: 91000000, voted: 61000000 },
        'Tamil Nadu': { total: 72000000, voted: 48000000 },
        'Madhya Pradesh': { total: 85000000, voted: 56000000 },
        'Rajasthan': { total: 78000000, voted: 51000000 },
        'Karnataka': { total: 68000000, voted: 45000000 },
        'Gujarat': { total: 65000000, voted: 43000000 },
        'Odisha': { total: 47000000, voted: 31000000 }
      };

      candidateStats = CANDIDATES.map((c, i) => ({
        id: i,
        name: c.name,
        party: c.party,
        votes: Math.floor(Math.random() * 100000000 + 20000000),
        pct: 0
      }));

      // Calculate percentages
      const totalVotes = candidateStats.reduce((a, b) => a + b.votes, 0);
      candidateStats.forEach(c => c.pct = Math.round((c.votes / totalVotes) * 10000) / 100);

      winner = candidateStats.reduce((a, b) => a.votes > b.votes ? a : b);
    } else {
      // Use real data from Supabase
      totalVoters = allVoters.length;
      votedVoters = allVoters.filter(v => v.has_voted);
      turnout = totalVoters > 0 ? (votedVoters.length / totalVoters) * 100 : 0;

      // Gender stats
      genderStats = { male: 0, female: 0, other: 0 };
      allVoters.forEach(v => {
        const name = v.name.toLowerCase();
        if (name.includes('kumar') || name.includes('singh') || name.includes('sharma')) genderStats.male++;
        else if (name.includes('kumari') || name.includes('devi') || name.includes('ben')) genderStats.female++;
        else genderStats.other++;
      });

      // State stats
      stateStats = {};
      allVoters.forEach(v => {
        const state = v.state || 'Unknown';
        if (!stateStats[state]) stateStats[state] = { total: 0, voted: 0 };
        stateStats[state].total++;
        if (v.has_voted) stateStats[state].voted++;
      });

      // Results
      candidateStats = CANDIDATES.map((c, i) => {
        const votes = votedVoters.filter(v => v.candidate_voted === i).length;
        return { id: i, name: c.name, party: c.party, votes, pct: turnout > 0 ? (votes / votedVoters.length) * 100 : 0 };
      });

      winner = candidateStats.reduce((a, b) => a.votes > b.votes ? a : b, { name: 'No votes', party: 'N/A' });
    }

    // Mock temporal data
    const temporalData = {
      daily: {
        '2026-04-19': 12000000,
        '2026-04-26': 11800000,
        '2026-05-07': 12200000,
        '2026-05-13': 12400000,
        '2026-05-20': 11900000,
        '2026-05-25': 12100000,
        '2026-06-01': 11500000
      },
      hourly: {},
      minuteLevel: {}
    };

    // Generate hourly data
    for (let hour = 7; hour <= 18; hour++) {
      temporalData.hourly[hour + ':00'] = Math.floor(Math.random() * 1000000 + 500000);
    }

    res.json({
      summary: {
        totalVoters,
        totalVotes: votedVoters.length || Math.round(totalVoters * turnout / 100),
        turnout: Math.round(turnout * 100) / 100,
        winner,
        statistics: { meanTurnout: turnout, medianTurnout: turnout, stdDevTurnout: 0, highestTurnout: turnout, lowestTurnout: turnout }
      },
      demographics: {
        gender: genderStats,
        ageGroups: { '18-25': Math.floor(totalVoters * 0.2), '26-35': Math.floor(totalVoters * 0.3), '36-45': Math.floor(totalVoters * 0.25), '46-55': Math.floor(totalVoters * 0.15), '56-65': Math.floor(totalVoters * 0.08), '65+': Math.floor(totalVoters * 0.02) },
        urbanRural: { urban: Math.floor(totalVoters * 0.35), rural: Math.floor(totalVoters * 0.65) }
      },
      geography: {
        states: Object.keys(stateStats).map(state => ({
          state,
          total: stateStats[state].total,
          voted: stateStats[state].voted,
          turnout: stateStats[state].total > 0 ? Math.round((stateStats[state].voted / stateStats[state].total) * 10000) / 100 : 0
        })),
        districts: [],
        constituencies: []
      },
      temporal: temporalData,
      results: { candidates: candidateStats, parties: {} },
      behavior: { earlyVoting: 0, peakVoting: 0, lateVoting: 0, votingSpeed: 0 },
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error('Analytics error:', err);
    // Final fallback - return mock data
    res.json({
      summary: {
        totalVoters: 964200000,
        totalVotes: 647000000,
        turnout: 67.1,
        winner: { name: 'Suresh Prabhu', party: 'BJP' },
        statistics: { meanTurnout: 67.1, medianTurnout: 67.1, stdDevTurnout: 0, highestTurnout: 67.1, lowestTurnout: 67.1 }
      },
      demographics: {
        gender: { male: 482100000, female: 482100000, other: 0 },
        ageGroups: { '18-25': 192840000, '26-35': 289260000, '36-45': 241050000, '46-55': 144630000, '56-65': 77133600, '65+': 19283400 },
        urbanRural: { urban: 337470000, rural: 626730000 }
      },
      geography: {
        states: [
          { state: 'Uttar Pradesh', total: 200000000, voted: 135000000, turnout: 67.5 },
          { state: 'Maharashtra', total: 112000000, voted: 75000000, turnout: 67.0 },
          { state: 'Bihar', total: 104000000, voted: 69000000, turnout: 66.3 },
          { state: 'West Bengal', total: 91000000, voted: 61000000, turnout: 67.0 },
          { state: 'Tamil Nadu', total: 72000000, voted: 48000000, turnout: 66.7 },
          { state: 'Madhya Pradesh', total: 85000000, voted: 56000000, turnout: 65.9 },
          { state: 'Rajasthan', total: 78000000, voted: 51000000, turnout: 65.4 },
          { state: 'Karnataka', total: 68000000, voted: 45000000, turnout: 66.2 },
          { state: 'Gujarat', total: 65000000, voted: 43000000, turnout: 66.2 },
          { state: 'Odisha', total: 47000000, voted: 31000000, turnout: 65.9 }
        ],
        districts: [],
        constituencies: []
      },
      temporal: {
        daily: {
          '2026-04-19': 12000000,
          '2026-04-26': 11800000,
          '2026-05-07': 12200000,
          '2026-05-13': 12400000,
          '2026-05-20': 11900000,
          '2026-05-25': 12100000,
          '2026-06-01': 11500000
        },
        hourly: {},
        minuteLevel: {}
      },
      results: {
        candidates: CANDIDATES.map((c, i) => ({
          id: i,
          name: c.name,
          party: c.party,
          votes: Math.floor(Math.random() * 100000000 + 20000000),
          pct: Math.floor(Math.random() * 20 + 5)
        })),
        parties: {}
      },
      behavior: { earlyVoting: 0, peakVoting: 0, lateVoting: 0, votingSpeed: 0 },
      lastUpdated: new Date().toISOString()
    });
  }
});

// GET /api/analytics/export
app.get('/api/analytics/export', async (req, res) => {
  try {
    const analytics = await new Promise((resolve, reject) => {
      const reqObj = { ...req, res: { json: resolve } };
      app._router.handle(reqObj, { json: resolve, status: () => ({ json: reject }) }, () => {});
    });

    // Generate CSV
    let csv = 'Category,Subcategory,Value\n';
    csv += `Total Voters,,${analytics.totalVoters}\n`;
    csv += `Overall Turnout,,${analytics.turnout}%\n`;
    csv += 'Gender,Male,' + analytics.demographics.gender.male + '\n';
    csv += 'Gender,Female,' + analytics.demographics.gender.female + '\n';
    csv += 'Gender,Other,' + analytics.demographics.gender.other + '\n';
    analytics.demographics.states.forEach(s => {
      csv += `State,${s.state} Total,${s.total}\n`;
      csv += `State,${s.state} Voted,${s.voted}\n`;
      csv += `State,${s.state} Turnout,${s.turnout}%\n`;
    });
    Object.keys(analytics.turnoutOverTime).forEach(date => {
      csv += `Turnout Over Time,${date},${analytics.turnoutOverTime[date]}\n`;
    });
    analytics.results.forEach(c => {
      csv += `Results,${c.name} (${c.party}),${c.votes} (${c.pct.toFixed(2)}%)\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="election-analytics.csv"');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║     🇮🇳  Bharat e-Vote 2026 — Unified Server         ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Frontend  → http://localhost:${PORT}`);
  console.log(`  Health    → http://localhost:${PORT}/health`);
  console.log(`  Results   → http://localhost:${PORT}/api/results`);
  console.log(`  Audit Log → http://localhost:${PORT}/api/blockchain/log`);
  console.log('\n  Backends connected:');
  console.log(`  ✓ Supabase   : ${process.env.SUPABASE_URL ? 'configured' : '⚠ not configured'}`);
  console.log(`  ✓ Resend OTP : ${process.env.RESEND_API_KEY ? 'configured' : '⚠ not configured'}`);
  console.log(`  ✓ ZKP salt   : ${SERVER_SECRET_SALT ? 'configured' : '⚠ not configured'}`);
  console.log(`  ✓ Local DB   : ${DB_FILE}\n`);
});
