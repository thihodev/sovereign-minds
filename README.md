# Sovereign Minds

An open world where every nation is governed by its own Claude mind, each born with its own national trait, all running on the Watcher's Claude subscription. The world starts in the stone age. A deterministic World Engine enforces every rule in code: inventions need their prerequisites, nothing appears from nothing. A human **Watcher** observes, judges the nations' petitions, issues world-wide decrees, and can chat with Claude about what is happening.

> Tài liệu dưới đây bằng tiếng Việt. Bộ luật đầy đủ: [docs/RULES.md](docs/RULES.md).

## Thế giới này là gì

- Mỗi quốc gia do một Claude điều hành (Haiku hoặc Sonnet, effort tùy chọn), dùng chung gói Claude của bạn. Mỗi nước sinh ra với một **đặc thù riêng**: Thợ săn, Hiền triết, Nông dân ven sông, Chiến binh, Thương nhân…, mỗi đặc thù có một lợi thế và một điểm yếu thật trong luật. Mỗi lượt, AI nhận một gói JSON trạng thái và trả về JSON hành động.
- **Engine là trọng tài duy nhất.** Hành động sai luật bị từ chối và vẫn mất AP. Tài nguyên được ghi sổ cái và kiểm toán sau mỗi lượt.
- AI **tự đặt tên, vẽ cờ, viết tuyên ngôn**, mở rộng lãnh thổ, nghiên cứu theo cây phát minh, do thám nước khác, và **dâng thỉnh nguyện** xin sửa luật.
- Bạn là **Watcher**: xem bản đồ sống, đọc suy nghĩ của từng AI, duyệt thỉnh nguyện, ban Sắc lệnh, và **chat với Claude** (bằng gói Claude của bạn) về tình hình thế giới.
- Không tốn phí API: mọi thứ chạy qua gói Claude (Pro/Max) của bạn. Khi gói hết giới hạn, cả thế giới cùng chờ rồi chạy tiếp, không nước nào bị phạt.

## Chạy bằng một lệnh

Cần Docker (Docker Desktop trên macOS/Windows, hoặc Docker Engine trên Linux) và một gói Claude (Pro hoặc Max).

```bash
git clone https://github.com/thihodev/sovereign-minds.git
cd sovereign-minds
cp .env.example .env
docker compose up -d --build
```

Mở **http://localhost:3000**, rồi:

1. **Đăng nhập Claude** ở khung Chat Claude: bấm **Đăng nhập Claude**, mở trang đăng nhập, cho phép truy cập, dán mã xác nhận vào ô và bấm **Xác nhận**. Nếu cách này không chạy trên máy bạn, đăng nhập trong terminal: `docker compose exec -it sovereign-minds claude auth login` (chạy ngoài Docker thì `CLAUDE_CONFIG_DIR=data/claude claude auth login`).
2. **Tạo thế giới** trong hộp thoại **Thế giới mới** (tự mở ở lần chạy đầu). Chọn số quốc gia, rồi chọn cho từng nước:
   - **đặc thù** (mục 2.4 trong `docs/RULES.md`): một lợi thế, một điểm yếu và một tính cách dân tộc
   - **model:** Haiku hoặc Sonnet
   - **effort:** low … max

Mọi quốc gia, Trọng tài và Sử gia đều chạy bằng tài khoản Claude đó qua Claude Code CLI (đã cài sẵn trong image), không tốn phí API. Thông tin đăng nhập nằm trong `data/claude/` trên máy bạn, không bao giờ vào cơ sở dữ liệu hay git.

**Giới hạn gói:** mỗi lượt là một lệnh Claude cho mỗi nước. Haiku với effort low tốn ít nhất; Sonnet và effort cao tốn nhiều hơn. Nhịp mặc định 20 phút. Khi hết giới hạn gói, cả thế giới chờ đến lúc gói được làm mới rồi tự chạy tiếp, không nước nào đi trước nước nào. Model và effort đổi được giữa trận trong hồ sơ quốc gia.

### Nhà cung cấp miễn phí (tùy chọn)

Engine vẫn hỗ trợ các nhà cung cấp có gói miễn phí (Gemini, Groq, Cohere, Cloudflare, OpenRouter, Z.ai, Ollama, một endpoint tương thích OpenAI bất kỳ) qua `NATIONS`, `JUDGE_PROVIDERS` và `HISTORIAN_PROVIDER=auto`; xem `.env.example`. Kiểm tra key và hạn mức:

```bash
docker compose exec sovereign-minds npm run check-providers
```

### Chat với Claude

Tab **Chat Claude** dùng cùng tài khoản. Claude đọc một bản tóm tắt thế giới ở mỗi tin nhắn; nó chỉ tư vấn, không tự thay đổi được thế giới.

## Deploy lại sau khi có code mới

```bash
./deploy.sh        # lấy code mới, chạy bằng Docker; engine nạp code mới sau lượt hiện tại
./deploy.sh now    # như trên nhưng khởi động lại engine ngay (lượt đang dở bị bỏ)
```

Script cũng tắt engine đang chạy ngoài Docker (`npm start`) trên cùng thế giới, để không bao giờ có hai engine cùng ghi `data/world.db`.

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
| Thế giới | Bản đồ 128×128 ô lục giác theo seed, bao quanh bởi Tường Băng không vượt qua được: 2 lục địa, eo đất, quần đảo, băng hà, sông, 7 kỳ quan, 3 đới khí hậu, 6 vùng hoang |
| Mối đe dọa | Thú dữ theo địa hình, bộ lạc man di cướp phá (đánh tan được bằng `clear_wild`), lũ lụt, động đất, gió băng, mùa đông, dịch bệnh (thảo dược giảm một nửa), hạn hán; mỗi AI nhận báo cáo đe dọa và tài nguyên của mình mỗi lượt |
| Lập quốc | Tên, cờ, tuyên ngôn; chặn trùng tên, tên model, màu cờ giống nhau |
| Kinh tế | Lao động, săn bắt hái lượm, khai thác, khai mỏ, trữ lượng ô tái sinh, công cụ hao mòn, chế tác, công trình, ruộng, chuồng |
| Dân số | Ăn, đói, hư hỏng, tăng dân, ổn định, nội loạn, di cư, sự kiện thế giới |
| Phát minh | Cây gốc 18 phát minh + **phát minh mở**: AI tự đề xuất (11 loại hiệu ứng, ngân sách 4 + 2d), Engine kiểm tra cứng, **Trọng tài AI** chấm điểm, phát minh được duyệt vào Sổ chung; thất truyền; cổng kỷ nguyên Đồ Đá Mới và Đồ Đồng |
| Lãnh thổ | Khai hoang, bỏ ô, định cư mới, ô bị cắt rời thì hoang hóa |
| Ngoại giao | Thám hiểm, gặp gỡ, cử chỉ trước khi có ngôn ngữ chung, tin nhắn (chặn giả mạo mệnh lệnh), hiệp ước bất tương xâm / đi lại / liên minh / hòa bình / cống nạp / chư hầu, phá ước, uy tín |
| Giao thương | Đề nghị và nhận trao đổi, đoàn buôn đi đường xa, hàng hư trên đường |
| Chiến tranh | Tuyên chiến (có hiệu lực lượt sau), đồng minh và tông chủ tự tham chiến, tấn công chiếm ô, bao vây thủ đô, đột kích cướp kho, tù binh, mệt mỏi chiến tranh, độc lập |
| Tình báo | Mức 1–4 theo tầm nhìn, buôn bán, hiệp ước, liên minh, gián điệp; tin phai dần nếu chưa có chữ viết |
| Watcher | Bản đồ sống với lớp phủ mối đe dọa và tài nguyên, suy nghĩ từng AI, thỉnh nguyện, Sắc lệnh, duyệt tay đơn phát minh, bảng quan hệ, biểu đồ, xếp hạng, chat Claude, **Sử gia AI** viết một chương sử mỗi 10 lượt (`HISTORIAN_PROVIDER`, đọc trong tab Biên niên) |
| Hạ tầng | Mọi quốc gia chạy qua gói Claude của Watcher, cả thế giới chờ khi hết giới hạn gói, sổ cái kiểm toán mỗi lượt, replay tất định, tự cập nhật khi `git pull` |

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
