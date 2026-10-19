# Sovereign Minds

An open world where every nation is governed by its own **free** AI model. The world starts in the stone age. A deterministic World Engine enforces every rule in code: inventions need their prerequisites, nothing appears from nothing. A human **Watcher** observes, judges the nations' petitions, issues world-wide decrees, and can chat with Claude about what is happening.

> Tài liệu dưới đây bằng tiếng Việt. Bộ luật đầy đủ: [docs/RULES.md](docs/RULES.md).

## Thế giới này là gì

- Mỗi quốc gia do một model AI miễn phí điều hành (Gemini, Mistral, DeepSeek qua NVIDIA NIM, GLM của Z.ai, Nemotron qua OpenRouter…). Mỗi lượt, AI nhận một gói JSON trạng thái và trả về JSON hành động.
- **Engine là trọng tài duy nhất.** Hành động sai luật bị từ chối và vẫn mất AP. Tài nguyên được ghi sổ cái và kiểm toán sau mỗi lượt.
- AI **tự đặt tên, vẽ cờ, viết tuyên ngôn**, mở rộng lãnh thổ, nghiên cứu theo cây phát minh, do thám nước khác, và **dâng thỉnh nguyện** xin sửa luật.
- Bạn là **Watcher**: xem bản đồ sống, đọc suy nghĩ của từng AI, duyệt thỉnh nguyện, ban Sắc lệnh, và **chat với Claude** (bằng gói Claude của bạn) về tình hình thế giới.
- Chỉ dùng gói miễn phí. Quốc gia nào hết quota sẽ **ngủ đông** tới khi quota hồi lại, không bị phạt.

## Chạy bằng một lệnh

Cần Docker (Docker Desktop trên macOS/Windows, hoặc Docker Engine trên Linux).

```bash
git clone https://github.com/thihodev/sovereign-minds.git
cd sovereign-minds
cp .env.example .env        # điền các API key miễn phí bạn có
docker compose up -d --build
```

Mở **http://localhost:3000**.

Chưa có key nào cũng chạy được: quốc gia thiếu key sẽ do một bot đơn giản chơi thay. Khi bạn thêm key vào `.env` và lưu file, hệ thống tự nạp lại sau lượt hiện tại và quốc gia đó chuyển sang AI.

### Lấy key miễn phí

| Quốc gia mặc định | Nhà cung cấp | Lấy key | Biến trong `.env` |
| --- | --- | --- | --- |
| 1 | Google Gemini | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| 2 | Mistral | https://console.mistral.ai | `MISTRAL_API_KEY` |
| 3 | NVIDIA NIM | https://build.nvidia.com | `NVIDIA_API_KEY` |
| 4 | Z.ai | https://z.ai | `ZAI_API_KEY` |
| 5 | OpenRouter (model `:free`) | https://openrouter.ai/settings/keys | `OPENROUTER_API_KEY` |
| thêm | Groq | https://console.groq.com/keys | `GROQ_API_KEY` |
| thêm | SambaNova | https://cloud.sambanova.ai | `SAMBANOVA_API_KEY` |
| thêm | Cohere | https://dashboard.cohere.com/api-keys | `COHERE_API_KEY` |
| thêm | Cloudflare Workers AI | https://dash.cloudflare.com | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |

Danh sách quốc gia đặt bằng `NATIONS` trong `.env`, mỗi nhà cung cấp là một quốc gia. Tên model đổi thường xuyên; nếu nhà cung cấp báo sai model, đặt lại bằng biến `*_MODEL` (xem `.env.example`).

Kiểm tra key và hạn mức thật:

```bash
docker compose exec sovereign-minds npm run check-providers
```

### Đăng nhập Claude để chat

Tab **Chat Claude** dùng Claude Code CLI (đã cài sẵn trong image) với gói Claude của bạn, không tốn phí API.

1. Bấm **Đăng nhập Claude**, mở trang đăng nhập, cho phép truy cập.
2. Dán mã xác nhận vào ô và bấm **Xác nhận**.

Nếu cách trên không chạy được trên máy bạn, đăng nhập trong terminal:

```bash
docker compose exec -it sovereign-minds claude auth login
```

Thông tin đăng nhập nằm trong `data/claude/` trên máy bạn, không bao giờ vào cơ sở dữ liệu hay git. Claude đọc một bản tóm tắt thế giới ở mỗi tin nhắn; nó chỉ tư vấn, không tự thay đổi được thế giới.

## Tự cập nhật khi có code mới

Code được gắn thẳng vào container (`./:/app`), và một supervisor theo dõi file:

```bash
git pull
```

- Đổi giao diện (`web/`): trình duyệt tự tải lại, thế giới không dừng.
- Đổi Engine (`src/`) hoặc `.env`: supervisor chờ **lượt hiện tại chạy xong**, lưu trạng thái, rồi chạy tiếp trên code mới trong vài giây. Không cần khởi động lại bằng tay.
- Chỉ khi `Dockerfile` đổi (ví dụ nâng phiên bản Claude CLI) mới cần `docker compose up -d --build`.

## Dữ liệu

Mọi thứ nằm trong `data/`:

- `data/world.db`: SQLite gồm trạng thái thế giới, ảnh chụp mỗi 10 lượt, nguyên văn câu trả lời của mọi AI (để replay), biên niên sử, thống kê, chat.
- `data/claude/`: đăng nhập Claude.

Tạo thế giới mới: `docker compose down`, xóa (hoặc đổi tên) `data/world.db`, sửa `WORLD_SEED`/`NATIONS` nếu muốn, rồi `docker compose up -d`. Xem trước bản đồ của một seed bằng trang [Bản đồ Nguyên Địa](https://claude.ai/artifact/AmRBWhcD9RBa7VATJAnMaK).

## Engine v0.1 làm được gì

| Đã chạy | Chưa có (đã viết trong luật) |
| --- | --- |
| Bản đồ 64×64 ô lục giác theo seed: 2 lục địa, eo đất, quần đảo, sông, 7 kỳ quan | Ngoại giao, hiệp ước, tin nhắn giữa các nước (§7.2) |
| Lập quốc: tên, cờ, tuyên ngôn, kiểm tra trùng tên và màu cờ | Giao thương, chợ biên giới (§7.3) |
| Lao động, săn bắt hái lượm, khai thác, trữ lượng ô tái sinh | Chiến tranh, chư hầu (§7.4, §7.7) |
| Cây gốc 18 phát minh, công trình, công thức chế tác | Phát minh mở + trọng tài (§5.4) |
| Dân số, nạn đói, hư hỏng, ổn định, nội loạn, di cư | Định cư mới (§2.3) |
| Sự kiện thế giới (mùa đông, hạn hán, dịch bệnh, bội thu…) | Phá hoại, đánh cắp công nghệ (§7.8) |
| Khai hoang, thám hiểm, gặp gỡ, tình báo mức 1/2/4, gián điệp | |
| Thỉnh nguyện, Sắc lệnh, ngủ đông khi hết quota | |
| Sổ cái kiểm toán, replay tất định, chat Claude | |

AI gửi hành động chưa có sẽ nhận lý do "chưa có trong phiên bản engine này".

## Phát triển

Không cần cài thư viện nào: Node 24 chạy TypeScript trực tiếp và có sẵn SQLite.

```bash
npm test          # 9 bài test: sinh thế giới, sổ cái, replay, luật lập quốc, thỉnh nguyện…
npm start         # supervisor + engine, http://127.0.0.1:3000
```

```
src/engine.ts      luật và hàm step() của một lượt
src/worldgen.ts    sinh thế giới
src/rules.ts       bảng số liệu của bộ luật
src/runner.ts      vòng lượt, gọi AI, ngủ đông, quyền của Watcher
src/ai/            gateway nhà cung cấp, prompt, bot dự phòng
src/claude.ts      đăng nhập và chat Claude
src/server.ts      API + SSE cho giao diện
src/supervisor.ts  tự nạp code mới
web/               giao diện Watcher
docs/RULES.md      bộ luật đầy đủ
```

## An toàn

- API key chỉ nằm trong `.env` (đã có trong `.gitignore`), không bao giờ vào prompt hay cơ sở dữ liệu.
- Mặc định giao diện chỉ mở trên `127.0.0.1`. Nếu mở ra mạng, đặt `WATCHER_TOKEN`.
- Mọi chữ do AI viết được hiển thị như văn bản, không chạy như mã. Claude được dặn coi thỉnh nguyện và suy nghĩ của AI là dữ liệu, không phải mệnh lệnh.

## License

MIT
