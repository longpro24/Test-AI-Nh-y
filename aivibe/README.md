# 🚀 AIVibe Backend — Hướng Dẫn Cài Đặt

## Yêu Cầu
- Node.js >= 18 ([nodejs.org](https://nodejs.org))
- Tài khoản Replicate ([replicate.com](https://replicate.com))

---

## ⚡ Chạy Nhanh (3 bước)

### Bước 1 — Cài packages
```bash
npm install
```

### Bước 2 — Cài API Key
Mở file `.env` và thay dòng này:
```
REPLICATE_API_KEY=r8_xxxxxxxxxxxxxxxxxxxx
```
→ Paste API key thật của bạn từ replicate.com vào

### Bước 3 — Chạy server
```bash
npm start
```

Mở trình duyệt: **http://localhost:3000**

---

## 📁 Cấu Trúc Thư Mục
```
aivibe/
├── server.js          ← Backend chính
├── .env               ← API keys & config
├── package.json
├── public/            ← Copy file aivibe-complete.html vào đây
│   └── index.html
├── uploads/           ← File upload tạm (tự tạo)
└── outputs/           ← Video output (tự tạo)
```

---

## 🔗 Kết Nối Frontend với Backend

Mở file `aivibe-complete.html`, thêm đoạn này vào thẻ `<script>`:

```javascript
const API_BASE = 'http://localhost:3000/api';

// Override hàm doLogin để gọi backend thật
async function doLogin() {
  const email = document.getElementById('loginEmail').value;
  const pwd = document.getElementById('loginPwd').value;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pwd })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
    state.coins = data.user.coins;
    loginSuccess(data.user.name);
  }
}

// Override hàm startGenerate để gọi backend thật
async function startGenerate() {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', state.uploadedFile);
  formData.append('model', state.selectedModel);
  formData.append('prompt', document.getElementById('promptInput').value);

  const res = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const { jobId } = await res.json();

  // Poll trạng thái mỗi 2 giây
  const interval = setInterval(async () => {
    const statusRes = await fetch(`${API_BASE}/job/${jobId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const job = await statusRes.json();
    if (job.status === 'done') {
      clearInterval(interval);
      document.getElementById('resultPreview').src = job.outputUrl;
      finishGenerate();
    } else if (job.status === 'failed') {
      clearInterval(interval);
      showToast('error', 'Tạo video thất bại: ' + job.error);
    }
  }, 2000);
}
```

---

## 💰 Tích Hợp Thanh Toán Thật

### MoMo
1. Đăng ký tại [developers.momo.vn](https://developers.momo.vn)
2. Lấy `partnerCode`, `accessKey`, `secretKey`
3. Điền vào file `.env`
4. Dùng ngrok để có public URL cho webhook:
   ```bash
   npx ngrok http 3000
   ```

### VNPay
1. Đăng ký tại [sandbox.vnpayment.vn](https://sandbox.vnpayment.vn)
2. Lấy `tmnCode` và `hashSecret`
3. Điền vào file `.env`

---

## 🌐 Deploy Lên Internet (miễn phí)

### Render.com (dễ nhất)
1. Push code lên GitHub
2. Vào [render.com](https://render.com) → New Web Service
3. Kết nối repo GitHub
4. Thêm biến môi trường `REPLICATE_API_KEY`
5. Deploy tự động!

### Railway.app
```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway variables set REPLICATE_API_KEY=r8_xxx
```

---

## 🔑 API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/register` | Đăng ký |
| GET | `/api/user/me` | Thông tin user |
| POST | `/api/generate` | Tạo video AI |
| GET | `/api/job/:id` | Trạng thái job |
| GET | `/api/history` | Lịch sử video |
| POST | `/api/wallet/topup` | Nạp coin |
| POST | `/api/test-key` | Test API key |

---

## 💡 Tips

- **Test nhanh không cần Replicate**: Giữ nguyên frontend, server tự mock kết quả
- **Lỗi CORS**: Đảm bảo `npm install cors` đã chạy
- **File quá lớn**: Điều chỉnh `limits.fileSize` trong server.js
- **Hết credit Replicate**: Nạp tại replicate.com/account/billing
