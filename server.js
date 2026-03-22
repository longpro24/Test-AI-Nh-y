/**
 * AIVibe Backend Server
 * Node.js + Express + Replicate API
 * 
 * Chạy: node server.js
 * Port: http://localhost:3000
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public'));        // Serve frontend HTML
app.use('/outputs', express.static('outputs')); // Serve generated files

// Upload config — lưu file vào thư mục uploads/
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // max 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/wav'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Tạo thư mục cần thiết
['uploads','outputs','public'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ═══════════════════════════════════════
// REPLICATE MODELS MAP
// ═══════════════════════════════════════
const MODELS = {
  // AI Nhảy / Dance
  dance: {
    id: 'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',
    cost: 2,
    buildInput: (filePath, opts) => ({
      input_image: filePath,
      video_length: '14_frames_with_svd',
      sizing_strategy: 'maintain_aspect_ratio',
      motion_bucket_id: opts.motion || 127,
      fps_id: 6,
    })
  },

  // Lip Sync
  lipsync: {
    id: 'devxpy/cog-wav2lip:8d65e3f4f4298520e079198b493c25adfc43c058ffec924f2aefc8010ed25eef',
    cost: 3,
    buildInput: (filePath, opts) => ({
      face: filePath,
      audio: opts.audioPath || filePath,
      pads: '0 10 0 0',
      smooth: true,
    })
  },

  // Face Swap
  face: {
    id: 'yan-ops/face-swap:d887eded4b2edd0253e3e1b6049b7cb680f8afcf37a05d5bcfc0bbc0c8f8ad95',
    cost: 3,
    buildInput: (filePath, opts) => ({
      target_image: filePath,
      swap_image: opts.swapPath || filePath,
    })
  },

  // Upscale Video
  upscale: {
    id: 'nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b',
    cost: 2,
    buildInput: (filePath, opts) => ({
      image: filePath,
      scale: opts.scale || 4,
      face_enhance: true,
    })
  },

  // Edit Image (Stable Diffusion)
  edit: {
    id: 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    cost: 1,
    buildInput: (filePath, opts) => ({
      image: filePath,
      prompt: opts.prompt || 'enhance, high quality',
      prompt_strength: 0.5,
      num_inference_steps: 30,
    })
  },

  // Text to Speech
  tts: {
    id: 'suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787',
    cost: 1,
    buildInput: (filePath, opts) => ({
      prompt: opts.prompt || 'Xin chào, đây là AIVibe!',
      text_temp: 0.7,
      waveform_temp: 0.7,
    })
  },

  // Outfit / Trang phục
  outfit: {
    id: 'cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d3f0c30f',
    cost: 3,
    buildInput: (filePath, opts) => ({
      human_img: filePath,
      garm_img: opts.garmentPath || filePath,
      garment_des: opts.prompt || 'stylish outfit',
    })
  },
};

// ═══════════════════════════════════════
// IN-MEMORY USER DB (thay bằng DB thật sau)
// ═══════════════════════════════════════
const users = new Map();
const jobs  = new Map();

function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, { id: userId, coins: 85, jobs: [] });
  }
  return users.get(userId);
}

// ═══════════════════════════════════════
// ROUTES — AUTH
// ═══════════════════════════════════════

// Đăng nhập / đăng ký đơn giản (dùng email làm user ID)
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Thiếu thông tin' });

  const userId = Buffer.from(email).toString('base64');
  const user = getUser(userId);

  res.json({
    success: true,
    token: userId,          // Production: dùng JWT
    user: {
      id: userId,
      name: email.split('@')[0],
      email,
      coins: user.coins,
      plan: 'creator',
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { firstName, email, password, referral } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Thiếu thông tin' });

  const userId = Buffer.from(email).toString('base64');
  const user = getUser(userId);
  user.coins = 95; // 10 coin bonus đăng ký mới

  res.json({
    success: true,
    token: userId,
    user: { id: userId, name: firstName || email.split('@')[0], email, coins: user.coins, plan: 'starter' }
  });
});

// ═══════════════════════════════════════
// ROUTES — USER
// ═══════════════════════════════════════
app.get('/api/user/me', auth, (req, res) => {
  const user = getUser(req.userId);
  res.json({ ...user, plan: 'creator' });
});

app.get('/api/user/coins', auth, (req, res) => {
  res.json({ coins: getUser(req.userId).coins });
});

// ═══════════════════════════════════════
// ROUTES — GENERATE VIDEO (Core)
// ═══════════════════════════════════════
app.post('/api/generate', auth, upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
  { name: 'swap', maxCount: 1 },
  { name: 'garment', maxCount: 1 },
]), async (req, res) => {

  const { model: modelKey, prompt, ratio, quality } = req.body;
  const user = getUser(req.userId);
  const modelCfg = MODELS[modelKey];

  // Validate
  if (!modelCfg) return res.status(400).json({ error: 'Model không hợp lệ' });
  if (user.coins < modelCfg.cost) return res.status(402).json({ error: 'Không đủ coin', coins: user.coins, required: modelCfg.cost });
  if (!req.files?.file?.[0]) return res.status(400).json({ error: 'Vui lòng upload file' });

  const mainFile   = req.files.file[0];
  const audioFile  = req.files?.audio?.[0];
  const swapFile   = req.files?.swap?.[0];
  const garmentFile= req.files?.garment?.[0];

  // Đọc file thành base64 data URL (Replicate nhận data URL hoặc public URL)
  const toDataUrl = (file) => {
    if (!file) return null;
    const data = fs.readFileSync(file.path).toString('base64');
    return `data:${file.mimetype};base64,${data}`;
  };

  // Trừ coin ngay
  user.coins -= modelCfg.cost;

  // Tạo job ID
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const job = {
    id: jobId, userId: req.userId, model: modelKey,
    status: 'processing', cost: modelCfg.cost,
    createdAt: new Date().toISOString(),
    outputUrl: null, error: null,
  };
  jobs.set(jobId, job);
  user.jobs.unshift(jobId);

  // Trả về job ID ngay — client poll status
  res.json({ jobId, status: 'processing', coins: user.coins });

  // Xử lý async
  processJob(job, modelCfg, {
    mainFile, audioFile, swapFile, garmentFile,
    prompt, toDataUrl,
  }).catch(err => {
    job.status = 'failed';
    job.error = err.message;
    // Hoàn coin nếu lỗi
    user.coins += modelCfg.cost;
    console.error('Job failed:', err.message);
  });
});

async function processJob(job, modelCfg, { mainFile, audioFile, swapFile, garmentFile, prompt, toDataUrl }) {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY });

  const input = modelCfg.buildInput(toDataUrl(mainFile), {
    prompt,
    audioPath: toDataUrl(audioFile),
    swapPath:  toDataUrl(swapFile),
    garmentPath: toDataUrl(garmentFile),
  });

  console.log(`🚀 Running model: ${modelCfg.id.split(':')[0]}`);
  const output = await replicate.run(modelCfg.id, { input });

  // output có thể là URL string hoặc array
  const outputUrl = Array.isArray(output) ? output[0] : output;

  // Download output về server
  if (outputUrl && typeof outputUrl === 'string' && outputUrl.startsWith('http')) {
    const ext = outputUrl.includes('.mp4') ? '.mp4' : outputUrl.includes('.wav') ? '.wav' : '.png';
    const outPath = path.join('outputs', job.id + ext);
    const fetch = (await import('node-fetch')).default;
    const resp = await fetch(outputUrl);
    const buffer = await resp.buffer();
    fs.writeFileSync(outPath, buffer);
    job.outputUrl = `/outputs/${job.id}${ext}`;
  } else {
    job.outputUrl = outputUrl;
  }

  job.status = 'done';
  console.log(`✅ Job done: ${job.id}`);

  // Cleanup upload files
  [mainFile, audioFile, swapFile, garmentFile].forEach(f => {
    if (f && fs.existsSync(f.path)) fs.unlinkSync(f.path);
  });
}

// ═══════════════════════════════════════
// ROUTES — JOB STATUS (polling)
// ═══════════════════════════════════════
app.get('/api/job/:jobId', auth, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.userId !== req.userId) return res.status(404).json({ error: 'Không tìm thấy job' });
  res.json(job);
});

// ═══════════════════════════════════════
// ROUTES — HISTORY
// ═══════════════════════════════════════
app.get('/api/history', auth, (req, res) => {
  const user = getUser(req.userId);
  const history = user.jobs.map(jid => jobs.get(jid)).filter(Boolean);
  res.json({ jobs: history });
});

// ═══════════════════════════════════════
// ROUTES — WALLET / COIN
// ═══════════════════════════════════════

// Mô phỏng thanh toán thành công (Production: webhook từ MoMo/VNPay)
app.post('/api/wallet/topup', auth, (req, res) => {
  const { package: pkg } = req.body;
  const packages = {
    '50':  { coins: 50,  price: 10000, bonus: 0   },
    '120': { coins: 120, price: 20000, bonus: 20  },
    '300': { coins: 300, price: 50000, bonus: 50  },
    '700': { coins: 700, price: 100000, bonus: 200 },
  };
  const chosen = packages[pkg];
  if (!chosen) return res.status(400).json({ error: 'Gói không hợp lệ' });

  const user = getUser(req.userId);
  const total = chosen.coins + chosen.bonus;
  user.coins += total;

  res.json({ success: true, added: total, coins: user.coins, message: `Nạp thành công ${total} coin!` });
});

// MoMo webhook (production)
app.post('/api/webhook/momo', (req, res) => {
  const { resultCode, extraData, amount } = req.body;
  if (resultCode === 0) {
    // Thanh toán thành công
    const userId = extraData; // truyền userId vào extraData khi tạo payment
    const user = getUser(userId);
    const coinsToAdd = Math.floor(amount / 200); // 200đ = 1 coin
    user.coins += coinsToAdd;
    console.log(`✅ MoMo payment: ${amount}đ → +${coinsToAdd} coin cho user ${userId}`);
  }
  res.json({ message: 'ok' });
});

// VNPay webhook (production)
app.get('/api/webhook/vnpay-return', (req, res) => {
  const { vnp_ResponseCode, vnp_Amount, vnp_TxnRef } = req.query;
  if (vnp_ResponseCode === '00') {
    console.log(`✅ VNPay thanh toán thành công: ${vnp_Amount / 100}đ`);
    res.redirect('/?payment=success');
  } else {
    res.redirect('/?payment=failed');
  }
});

// ═══════════════════════════════════════
// ROUTES — TEST API KEY
// ═══════════════════════════════════════
app.post('/api/test-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'Thiếu API key' });
  try {
    const replicate = new Replicate({ auth: apiKey });
    await replicate.models.get('stability-ai', 'stable-diffusion');
    res.json({ valid: true, message: 'API key hợp lệ ✅' });
  } catch (err) {
    res.status(401).json({ valid: false, message: 'API key không hợp lệ ❌' });
  }
});

// ═══════════════════════════════════════
// MIDDLEWARE — AUTH (đơn giản)
// ═══════════════════════════════════════
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  req.userId = token; // Production: verify JWT
  next();
}

// ═══════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════╗
  ║     AIVibe Backend Server      ║
  ╠════════════════════════════════╣
  ║  🚀 http://localhost:${PORT}     ║
  ║  🤖 Replicate API: ${process.env.REPLICATE_API_KEY ? '✅ OK' : '❌ Chưa set'}   ║
  ╚════════════════════════════════╝
  
  📡 API Endpoints:
     POST /api/auth/login
     POST /api/auth/register
     POST /api/generate
     GET  /api/job/:jobId
     GET  /api/history
     POST /api/wallet/topup
     POST /api/test-key
  `);
});

module.exports = app;
