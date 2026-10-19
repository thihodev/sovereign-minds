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

| Vai mặc định | Nhà cung cấp | Lấy key | Biến trong `.env` |
| --- | --- | --- | --- |
| Quốc gia 1 | Google Gemini (project **không** gắn thanh toán) | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| Quốc gia 2 | Z.ai (GLM Flash, Trung Quốc) | https://z.ai/manage-apikey/apikey-list | `ZAI_API_KEY` |
| Quốc gia 3 | OpenRouter (model `:free`, ví dụ `dots-studio/dots-3-note-preview:free` của rednote) | https://openrouter.ai/settings/keys | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| Quốc gia 4 | SambaNova (bỏ qua bước thanh toán) | https://cloud.sambanova.ai/apis | `SAMBANOVA_API_KEY` |
| Quốc gia 5 | Cohere (Trial key) | https://dashboard.cohere.com/api-keys | `COHERE_API_KEY` |
| Quốc gia 6 | Cloudflare Workers AI (token mẫu "Workers AI") | https://dash.cloudflare.com/profile/api-tokens | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Trọng tài | **Claude Sonnet 5.5** qua tài khoản Claude bạn đăng nhập (tab Chat Claude); Groq và các nhà cung cấp miễn phí khác làm dự phòng | — | `JUDGE_PROVIDERS=claude,groq,…` |
| Sử gia | Groq | https://console.groq.com/keys | `GROQ_API_KEY` |

Không dùng: Mistral (gói miễn phí không bật được API key, đòi nâng cấp), NVIDIA NIM (bắt xác minh số điện thoại, có nơi không nhận được OTP).

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

## Engine làm được gì

| Hệ thống | Đã chạy |
| --- | --- |
| Thế giới | Bản đồ 64×64 ô lục giác theo seed: 2 lục địa, eo đất, quần đảo, sông, 7 kỳ quan, 3 đới khí hậu |
| Lập quốc | Tên, cờ, tuyên ngôn; chặn trùng tên, tên model, màu cờ giống nhau |
| Kinh tế | Lao động, săn bắt hái lượm, khai thác, khai mỏ, trữ lượng ô tái sinh, công cụ hao mòn, chế tác, công trình, ruộng, chuồng |
| Dân số | Ăn, đói, hư hỏng, tăng dân, ổn định, nội loạn, di cư, sự kiện thế giới |
| Phát minh | Cây gốc 18 phát minh + **phát minh mở**: AI tự đề xuất (11 loại hiệu ứng, ngân sách 4 + 2d), Engine kiểm tra cứng, **Trọng tài AI** chấm điểm, phát minh được duyệt vào Sổ chung; thất truyền; cổng kỷ nguyên Đồ Đá Mới và Đồ Đồng |
| Lãnh thổ | Khai hoang, bỏ ô, định cư mới, ô bị cắt rời thì hoang hóa |
| Ngoại giao | Thám hiểm, gặp gỡ, cử chỉ trước khi có ngôn ngữ chung, tin nhắn (chặn giả mạo mệnh lệnh), hiệp ước bất tương xâm / đi lại / liên minh / hòa bình / cống nạp / chư hầu, phá ước, uy tín |
| Giao thương | Đề nghị và nhận trao đổi, đoàn buôn đi đường xa, hàng hư trên đường |
| Chiến tranh | Tuyên chiến (có hiệu lực lượt sau), đồng minh và tông chủ tự tham chiến, tấn công chiếm ô, bao vây thủ đô, đột kích cướp kho, tù binh, mệt mỏi chiến tranh, độc lập |
| Tình báo | Mức 1–4 theo tầm nhìn, buôn bán, hiệp ước, liên minh, gián điệp; tin phai dần nếu chưa có chữ viết |
| Watcher | Bản đồ sống, suy nghĩ từng AI, thỉnh nguyện, Sắc lệnh, duyệt tay đơn phát minh, bảng quan hệ, biểu đồ, xếp hạng, chat Claude, **Sử gia AI** viết một chương sử mỗi 10 lượt (`HISTORIAN_PROVIDER`, đọc trong tab Biên niên) |
| Hạ tầng | Ngủ đông khi hết quota, sổ cái kiểm toán mỗi lượt, replay tất định, tự cập nhật khi `git pull` |

Chưa có: phá hoại và đánh cắp công nghệ bằng gián điệp (§7.8), đổi tên quốc gia (§2.2).

## Phát triển

Không cần cài thư viện nào: Node 24 chạy TypeScript trực tiếp và có sẵn SQLite.

Chạy thử không cần key, với một nhà cung cấp giả lập trả lời như AI (thỉnh thoảng cố tình báo hết quota hoặc trả sai định dạng):

```bash
node tools/mock-provider.ts &
CUSTOM_BASE_URL=http://127.0.0.1:4010/v1 OLLAMA_BASE_URL=http://127.0.0.1:4010/v1 \
  NATIONS=custom,custom,custom,bot JUDGE_PROVIDERS=ollama TICK_SECONDS=5 npm start
```

Dùng model chạy trên máy (Ollama) cho quốc gia hoặc trọng tài: đặt `OLLAMA_BASE_URL` và thêm `ollama` vào `NATIONS` hoặc `JUDGE_PROVIDERS`.

```bash
npm test          # 41 bài test: sinh thế giới, sổ cái, replay, phát minh mở, ngoại giao, giao thương, chiến tranh, định cư, Sử gia…
npm start         # supervisor + engine, http://127.0.0.1:3000
```

```
src/engine.ts      luật và hàm step() của một lượt
src/catalog.ts     phát minh mở: danh mục hiệu ứng, ngân sách, độ sâu, phán quyết
src/diplomacy.ts   tin nhắn, hiệp ước, giao thương, chiến tranh
src/worldgen.ts    sinh thế giới
src/rules.ts       bảng số liệu của bộ luật
src/runner.ts      vòng lượt, gọi AI, ngủ đông, quyền của Watcher
src/ai/            gateway nhà cung cấp, prompt, trọng tài, bot dự phòng
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
