# Nhật ký thay đổi

Mọi thay đổi đáng kể của Sovereign Minds. Số mục (§) trỏ tới `docs/RULES.md`.

## v0.6 (đang làm)

- **Lãnh thổ liên thông (§2.7):** hàng chỉ về được kho theo một lối: đi bộ qua đất của mình tối đa 6 ô, đường sá, hoặc đường thủy giữa hai bến thuyền.
  - Điểm định cư không có lối về thủ đô bị cô lập (sau 10 lượt ân hạn): đất của nó chỉ nộp 70%, bất mãn +2 mỗi lượt.
  - Đất xa trung tâm, không có đường, chỉ nộp 90%. Dân làm ô gần nhà trước.
  - AI thấy lối về thủ đô của từng điểm định cư; cố vấn chỉ đường cần làm. Hồ sơ quốc gia ghi 🛤 / ⛵ / 🚶 / ✗ cô lập.
  - **Lập điểm định cư là mở đường về:** `found_settlement` tự đặt và trả gỗ cho một đường mòn từ mạng đường tới điểm mới (1 gỗ mỗi ô). Thiếu gỗ thì không lập được.
- **Biên giới sống (§7.9):** láng giềng có đất giáp nhau giờ luôn tương tác.
  - Mỗi cặp có mức căng thẳng tăng theo độ dài đường biên, giảm nhờ hiệp ước, buôn bán và chung ngôn ngữ.
  - Sự cố biên giới (săn trộm, đốn gỗ lấn đất, xô xát làm chết người, dân vượt biên) cho bên bị hại chính nghĩa để tuyên chiến. Căng thẳng từ 70 thành tranh chấp: cả hai bên có chính nghĩa và mất ổn định.
  - Chợ biên giới tự đổi hàng dư lấy hàng thiếu mỗi lượt, tính là một lần buôn.
  - AI thấy láng giềng, căng thẳng, sự cố trong gói trạng thái, và cố vấn gợi ý cách xử lý. Bot ưu tiên ký bất tương xâm với biên giới căng.
  - Thẻ quan hệ trong mục Ngoại giao hiện ⚡ căng thẳng.
- **Khung bám theo tiến trình thật:**
  - Tiên quyết của khung giờ là **năng lực**, có được từ bất kỳ phát minh nào. Nước đã tự phát minh ra luyện đồng thì học Rèn sắt ngay, không phải học lại khung.
  - Khung mà một nước đã có đủ năng lực thì ẩn với nước đó.
  - Hai khung đổi tên để khỏi trùng với phát minh các nước đã tạo: "Nấu đồng từ quặng", "Rèn sắt từ quặng".
  - Cây phát minh vẽ khung bằng viền chấm, có nhãn "khung", và nối với phát minh cung cấp năng lực bằng nét đứt.
- **Chỉ tiêu nhịp độ (`tools/pace.ts`):** chạy nhiều thế giới bot và báo ✓/✗ theo các chỉ tiêu:
  - lượt đầu tiên vào Đồ Đá Mới 50–160, vào Đồ Đồng 150–380
  - dân trung vị lượt 300: 100–300; điểm định cư trung vị 1–5
  - tối đa 1 nước diệt vong, tối đa 4 nước ly khai
  - tốc độ dưới 90 ms mỗi lượt, sổ cái khớp

  Bảy seed đều đạt.
- **Sửa nạn đói:** thiếu ăn nhẹ không còn chặn hết số sinh. Số trẻ bù cho người chết bằng (phần lương thực được ăn)². Trước đây vài lượt thiếu ăn nhẹ liên tiếp có thể đưa một nước 50 dân về 0.
- **Tài liệu luật:** đồng bộ với v0.6; bỏ luật "3 người trong 2 lượt" chưa từng có trong engine; nói rõ một lượt gộp những gì xảy ra trong một thập kỷ.
- **Khung phát minh của thế giới mở (§5.6):** 24 phát minh sẵn có (K1–K24, từ Lò nung nhiệt cao, Luyện đồng, Chữ viết… tới Máy hơi nước, Điện, Hàng không, Tên lửa), mỗi cái cho một năng lực ở cổng kỷ nguyên.
  - Giá gấp 1,5 lần một phát minh tự tạo cùng độ sâu, nên phát minh do các nước tự tạo vẫn rẻ và mạnh hơn. Nhưng thế giới không bao giờ kẹt hẳn.
  - Bot giờ cũng lên được Đồ Đồng.
- **Cố vấn (§8.2):** gói trạng thái của mỗi nước mở đầu bằng `advice`, do engine tính từ chính luật: điều gì đang chặn họ và làm gì được ngay, kèm con số.
  - Ví dụ: hết chỗ ở thì mở thêm bằng cách nào, thiếu gì để lập định cư hay sang kỷ nguyên mới, thiếu nước, vượt giới hạn đất, bất mãn, đang hạn chế sinh khi dân ít, chưa nghiên cứu gì.
  - Hồ sơ quốc gia hiện phần cố vấn này. Prompt rút gọn phần nguy hiểm vì `threats` đã có số liệu.
- **Mỗi lượt phải ra ít nhất một lệnh (§3.2):**
  - Trả lời không có lệnh thì nước đó được hỏi lại một lần, kèm lời khuyên của cố vấn.
  - Từ lượt thứ hai liên tiếp không ra lệnh: −2 ổn định mỗi lượt.
  - Bot luôn có ít nhất một lệnh.
- **Phát minh trùng tự xử lý:**
  - Engine tự nhận ra đơn trùng ngay khi nộp, không cần AI: cùng tên nói khác đi, cùng năng lực và hiệu ứng, hoặc mô tả giống mà làm cùng việc.
  - Đơn trùng được ghi "Trùng với X · không thêm mới", và nước đó tự chuyển sang nghiên cứu phát minh đã có.
  - Trọng tài Claude chấm tối đa 4 đơn mỗi lần gọi và thấy năng lực, hiệu ứng của các phát minh giống nhau để so trùng tốt hơn.
  - Mục Phát minh ghi rõ khi nào trọng tài chấm, và lý do đơn còn chờ.
- **Sắc lệnh luật (§10.3):** Watcher đổi thật các con số trong luật (khoảng 30 luật về định cư, chỗ ở, đất, dân số, kỷ nguyên, giao thương, chiến tranh, thiên tai) từ tab Sắc lệnh → Đổi luật.
  - Engine áp dụng từ lượt sau. Sắc lệnh và giá trị mới hiện trong biên niên.
  - Luật mà các AI nhận được dựng lại theo con số mới.
  - Chat Claude biết các luật chỉnh được và giá trị hiện tại.
  - Sắc lệnh văn bản vẫn có, và ghi rõ là engine không tự thi hành.
- **Sửa luật dân số:**
  - Thiếu nước, thảo dược và y học giờ chỉ ảnh hưởng tốc độ tăng dân, không làm dân co dần nữa.
  - "Hạn chế sinh" chỉ giảm nhẹ phần sinh bù cho người chết (×0,9), phần tăng thêm thì giảm mạnh (×0,4).
  - Trước bản sửa này, một nước nhỏ không có nước ngọt mà lại hạn chế sinh có thể chết dần.
- **Sổ sinh tử mỗi lượt:** mỗi nước nhận một dòng "Dân số A → B: +sinh, −tuổi già, −chết vì …, −bỏ đi, +tới".
  - DB lưu sổ này (cột `detail` của `nation_stats`) và toàn bộ nhật ký engine từng lượt của mỗi nước (bảng `nation_log`).
- **Chat Claude hiểu thế giới hơn:**
  - Đọc luật đầy đủ mà các nước nhận.
  - Thấy dân theo tuổi và giới, phong tục, bất mãn, chỗ ở của từng nước, lịch sử dân số cùng sổ sinh tử 40 lượt gần nhất, và các phái xin ly khai.
  - Khi câu hỏi nêu tên một nước (và "lượt N"), Chat Claude nhận thêm nhật ký engine từng lượt của nước đó.
- **Công cụ `tools/history.ts "<quốc gia>" [từ] [tới]`:** xem lịch sử một nước theo từng lượt: dân, lương thực, ổn định, đất, sinh tử, hành động AI gửi, nhật ký engine, biên niên, và bản chụp mỗi 10 lượt cho giai đoạn trước v0.6.
- **Ly khai:** khi một phái đòi ra đi, dải tin trên bản đồ báo "xin ly khai, chờ bạn duyệt"; biên niên ghi thêm chỗ để duyệt.
- **Sông:** AI thấy con sông gần nhất mình đã thấy và các ô cần chiếm để tới đó (`nearest_river`).
- **Bất mãn và ly khai (§4.5).**
  - Cai trị kém (ổn định thấp, nạn đói, nội loạn, đất quá rộng) làm bất mãn tăng dần. Tới 100, một phái 20–35% dân xin bỏ đi lập quốc riêng trên đất trống.
  - **Watcher duyệt trong mục Thỉnh nguyện** và chọn model, effort (hoặc bot) cho quốc gia mới. Nước mới kế thừa người, kho, phát minh, kỷ nguyên, đặc thù và phong tục, rồi tự đặt tên và cờ ở lượt đầu.
  - Nếu không được duyệt, phái đó xin sang định cư ở một nước quen biết; nước đó nhận bằng `accept_migrants`. Không ai nhận thì họ quay về trong uất ức.
  - Hồ sơ quốc gia có thanh bất mãn và nguồn gốc ly khai.
- **Thôn xóm (§4.2):** dân sống rải rác trên đất. Mỗi ô đất cho thêm 1–3 chỗ ở tùy địa hình (thêm 1 nếu có sông), tối đa 40 + 20 mỗi kỷ nguyên. Mở rộng đất giờ nâng trần dân số, phá vòng kẹt "trần 40 dân, cần 50 để định cư". Hồ sơ quốc gia chia chỗ ở theo nguồn.
- **Dân cư theo tuổi và giới, gia đình (§4.2).**
  - Dân được đếm theo 4 nhóm tuổi × 2 giới. Mỗi lượt cả nhóm lên một bậc tuổi; người già qua đời vì tuổi già.
  - Số sinh phụ thuộc số phụ nữ trưởng thành và việc có đủ bạn đời.
  - Trẻ sơ sinh tử vong; y học và thảo dược cứu được một phần.
  - Trẻ em ăn ít hơn và chưa làm việc; người già dạy nghề và giữ tri thức.
  - Đói, rét, dịch bệnh làm trẻ em và người già chết trước. Trận mạc làm chiến binh chết.
  - **Phong tục do AI chọn** (`family_policy`): khuyến khích, tự nhiên hay hạn chế sinh; chỉ đàn ông hay mọi người lớn ra trận.
  - Năng lực `hôn-nhân` từ phát minh tăng số sinh và ổn định.
  - Tù binh và dân di cư chuyển sang nước khác theo cả gia đình.
  - Hồ sơ quốc gia có tháp dân số, số hộ, số người có thể ra trận và số sinh, tử lượt trước.
  - Engine không cài vai trò theo giới: hai giới làm việc như nhau, chỉ có việc sinh con là khác.
- **Đường sá và hải đạo (§2.5).**
  - Hành động mới `build_road`, ba cấp mở theo kỷ nguyên: đường mòn, đường đất nện, đường lát đá. Trên mặt nước tương ứng là luồng lạch, hải đạo có phao tiêu, hải đạo có hải đăng.
  - Vật liệu trả ngay khi ra lệnh; thợ xây làm bằng công còn thừa sau các công trình.
  - Đường được làm qua vùng hoang gần nhà và qua đất của nước có hiệp ước. Đường qua núi là đèo.
  - **Lợi ích:** đoàn buôn đi nhanh và an toàn hơn; đường nối trung tâm nâng giới hạn ô; điểm định cư nối với thủ đô không còn bị tính phạt ổn định.
  - Lũ lụt và động đất làm đường xuống cấp.
- **Lãnh hải (§2.6).**
  - Giữ được cả biển nông lẫn biển sâu. Ô biển xa bờ phải nằm trong tầm 4 ô của một bến thuyền.
  - Mỗi ô biển tính 1/3 ô vào giới hạn quản lý.
  - Chủ vùng biển thu phí thuyền đi qua, chặn thuyền của kẻ thù, giữ cá trên vùng biển của mình.
  - Đánh chiếm ô biển cần thuyền. Bão trên biển sâu nhiều gấp đôi.
- **AI và bot:**
  - AI quốc gia thấy mạng đường của mình và một đường gợi ý tới điểm định cư chưa nối.
  - Bot tự nối các điểm định cư bằng đường và giữ vùng biển ven bờ.
- **Bản đồ:** vẽ đường (nâu, đậm dần theo cấp) và hải đạo (nét đứt, có hải đăng). Thẻ ô cho biết đường và lãnh hải; hồ sơ quốc gia có mục "Đường sá & lãnh hải".
- **Giao diện dạng tab:**
  - Các bảng Ngoại giao, Phát minh, Biên niên, Thống kê và hồ sơ quốc gia chia thành tab con, có số đếm trên tab.
  - Biên niên có bộ lọc theo loại sự kiện.

## v0.5

- **Thế giới mở: 10 kỷ nguyên (§5.6).**
  - Từ Đồ Đá Cũ tới Nguyên Tử. Mỗi cổng đòi các năng lực chung của thế giới (luyện-sắt, chữ-viết, thép, in-ấn, máy-hơi-nước, điện, tên-lửa…), số dân, điểm định cư và tài nguyên.
  - Các nước tự đề xuất phát minh để nhận các năng lực đó, và trọng tài kiểm tra từng bước.
  - **Thưởng theo kỷ nguyên:** trần thưởng nghề cao hơn, thêm ô quản lý, RP, nhà ở, chỗ quan chức, AP; công trình do các nước phát minh lớn dần theo kỷ nguyên.
  - **Giá phát minh** giữ nguyên tới độ sâu 8, rồi tăng tuyến tính, để kỷ nguyên muộn vẫn với tới được.
- **Hiệu ứng mới mở theo kỷ nguyên:** tăng dân, vận tải, thám hiểm xa, tầm đánh, y học, thêm quan chức, thêm nhà ở, vượt đại dương. Hiệu ứng `reveal` mở rộng sang than, lưu huỳnh, dầu.
- **Tài nguyên mới:** than đá, dầu mỏ, lưu huỳnh (ẩn) và ngựa hoang. Thế giới cũ được rải thêm khi tải lại.
- **Triều đình (§4.6):**
  - Bổ nhiệm bá tước, đại tướng, thượng thư nông, đại học sĩ, tổng quản thương, tổng công trình, trưởng đoàn thám hiểm. Mỗi người tự làm việc mỗi lượt (khai hoang, khởi công ruộng, chọn nghiên cứu, thám hiểm…) và cho thưởng theo lĩnh vực.
  - Có tay nghề, lương, lòng trung thành, có thể đào ngũ. AI thấy triều đình của mình trong gói trạng thái; Watcher xem trong hồ sơ quốc gia.
- **Trọng tài** biết về các kỷ nguyên và năng lực chung; **bot** cũng lập triều đình.

## v0.4

- **Mọi quốc gia chơi bằng tài khoản Claude đã đăng nhập** (Claude Code CLI, gói Pro/Max, không cần API key). Mỗi nước chọn model (Haiku, Sonnet) và effort (low … max); đổi được giữa trận trong hồ sơ quốc gia. Trọng tài và Sử gia cũng mặc định dùng Claude (Sử gia: Haiku, effort low). Nhà cung cấp miễn phí vẫn dùng được qua `NATIONS`, `JUDGE_PROVIDERS` và `HISTORIAN_PROVIDER=auto`.
- **Đặc thù quốc gia (§2.4):** 9 đặc thù, mỗi đặc thù có một lợi thế và một điểm yếu thật trong luật, cộng với tính cách mà AI đọc mỗi lượt (trường `identity`). Đã cân bằng bằng `tools/traits.ts`.
- **Hộp thoại Thế giới mới:** chọn seed, số quốc gia (2–8), nhịp lượt, rồi đặc thù, model và effort cho từng nước. Thế giới cũ được sao lưu vào `data/backups/`. Lần cài mới, thế giới chờ Watcher chọn rồi mới chạy.
- **Chung một gói Claude:** tối đa `CLAUDE_CONCURRENCY` (mặc định 2) lệnh `claude` chạy cùng lúc. Khi hết giới hạn gói hoặc Claude chưa đăng nhập, cả thế giới chờ (không nước nào đi trước). Câu trả lời đã nhận được giữ lại cho lần chạy tiếp, để không hỏi lại và không tốn thêm lượt gói. Đăng nhập từ web xong thì thế giới chạy tiếp ngay.
- Đăng nhập Claude từ web chạy được trên macOS khi không dùng Docker (dùng `pty` của Python thay cho `script`).
- Nhịp lượt mặc định 20 phút.
- **Bản đồ 128 × 128** (gấp 4 lần), bao quanh bởi **Tường Băng** dày 3–6 ô: không ai vượt qua hay khai hoang được. Chân tường là **băng hà** (tuần lộc, voi ma mút, đá), trong vòng 4 ô có **gió băng** (mùa đông thường và chết nhiều hơn, kể cả ở nhiệt đới). Sông, kỳ quan, điểm khai sinh và vùng hoang tăng theo kích thước. Điểm khai sinh phải có cây dại (để làm sợi, dây, lều) và xa Tường Băng. Thế giới 64 × 64 đã lưu được tự sao lưu vào `data/backups/`, rồi chờ tạo thế giới mới.
- **Mối đe dọa mới (§9.4):**
  - **thú dữ:** độ nguy hiểm theo địa hình và theo khoảng cách tới vùng hoang; tấn công thợ săn, người hái lượm, đoàn thám hiểm
  - **6 bộ lạc man di** ở vùng hoang: lớn dần, cướp phá nước từ 40 dân trở lên trong tầm 16 ô; có thể đẩy lui, hoặc đánh tan bằng hành động mới `clear_wild`
  - **lũ lụt** và **động đất** (trước đây chỉ có trong luật, giờ đã có trong engine)
  - **gió băng**
- **Thảo dược:** tài nguyên mới ở rừng rậm, đầm lầy và một số khu rừng; người hái lượm mang về; đủ thảo dược thì dịch bệnh chết ít đi một nửa.
- **Báo cáo đe dọa và tài nguyên** (`src/threats.ts`):
  - **AI** nhận `threats`, `resources`, `hordes` trong gói trạng thái mỗi lượt, chỉ gồm những gì nước đó thấy được.
  - **Watcher** xem bản đầy đủ trong khung chi tiết, thẻ quốc gia và hồ sơ quốc gia.
  - **Bản đồ** có lớp phủ cho mối đe dọa (tổng hợp, thú dữ, man di, lũ lụt, giá rét) và cho trữ lượng từng tài nguyên; trại man di được vẽ trên bản đồ và liệt kê ở tab Ngoại giao.
- Bot giữ đủ chiến binh khi có man di ở gần.
- **Sông thực tế hơn (§2.1):**
  - **tài nguyên ven sông:** sậy, cây dại bãi bồi, đá lửa cuội ở thượng nguồn
  - **phù sa:** ruộng ven sông +25%, ở châu thổ +50%
  - **nước ngọt:** thủ đô xa sông thì tăng dân chậm và dịch nhiều hơn; công trình **Giếng** mới
  - **mùa cá:** thỉnh thoảng có thêm cá trên các ô sông
  - **sông là đường đi:** có thuyền thì thám hiểm dọc sông xa gấp đôi; có **Bến thuyền** thì quân vượt sông (mất lợi thế sông của bên thủ) và với xa thêm 1 ô
- **Giao thương theo đường thật (§7.3, `src/routes.ts`):**
  - **đường bộ:** đi chậm theo độ khó địa hình, cần người khuân vác (5 đơn vị/người, họ không làm việc ở nhà)
  - **đường thủy:** theo sông và biển nông, cần Bến thuyền và hàng **thuyền** mới (15 đơn vị/thuyền), nhanh hơn và lương thực ít hư hơn
  - **phí qua đất người khác:** nước thứ ba không có hiệp ước đi lại thì thu 10%; đất của kẻ thù thì đường không đi qua
  - **rủi ro dọc đường:** man di chặn cướp, bão biển, bị tịch thu khi chiến tranh nổ ra
  - **AI thấy trước** từng con đường (`trade_road`) và các đoàn buôn đang đi; **bản đồ** vẽ đoàn buôn ⛵/🐂 trượt dọc con đường thật
- **Phát minh trên giao diện:** đơn đã quyết thu gọn còn một dòng; hiệu ứng, câu trả lời của AI và tin tình báo hiện bằng chữ thay vì JSON (nguyên văn vẫn xem được).
- **Một engine cho mỗi thế giới** (`data/world.db.lock`) và **Ctrl+C tắt ngay** (giải phóng cổng tức thì); trước đây hai engine có thể cùng ghi một `world.db` và làm hỏng nó.
- Điểm khai sinh phải có đủ thức ăn trên chính 7 ô khởi đầu.
- **Hoạt ảnh trên bản đồ:**
  - **người tí hon** màu cờ đi lại giữa làng và nơi làm việc (bãi săn, rừng, mỏ, bến cá, ruộng, công trường, biên giới), có biểu tượng nghề trên ô
  - **sự kiện của lượt vừa rồi** được phát lại ngay chỗ nó xảy ra: người chết (kèm nguyên nhân), sinh thêm, xây xong, phát minh, khai hoang, đường đoàn thám hiểm, man di kéo tới cướp hoặc bị đẩy lui, trận đánh, lũ, động đất, mùa đông, dịch, di cư…
  - **dải tin** phía trên bản đồ: bấm một tin để bay tới chỗ đó và xem lại; nút "Phát lại lượt"; ô "Hoạt ảnh" để tắt
  - Engine ghi vị trí từng sự kiện (`src/fx.ts`) chỉ để vẽ, không ảnh hưởng luật hay tính tất định.

## v0.3

- Trọng tài mặc định là **Claude Sonnet 5.5** qua tài khoản Claude của Watcher (`JUDGE_PROVIDERS` bắt đầu bằng `claude`, đổi model bằng `JUDGE_CLAUDE_MODEL`). Claude chưa đăng nhập hoặc bị giới hạn thì Engine tạm dùng các nhà cung cấp miễn phí phía sau, và thử lại Claude sau 15 phút.
- Điểm khai sinh công bằng hơn: mỗi điểm phải có đủ gỗ (≥150), đá (≥150) và thịt hoặc cá (≥80) trong bán kính 2; khi chọn bộ điểm khai sinh, ưu tiên láng giềng gần nhất trong khoảng 12–18 ô. Với 4 quốc gia: 20/20 vào Đồ Đá Mới (trước là 13/20), không còn nước kẹt ở 25–35 dân (trước là 7/20).
- Sửa theo rà soát luật ↔ code: thưởng nghề và công cụ tự phát minh có tác dụng với nông dân, chế tác, xây dựng, nghiên cứu và chiến binh; vũ khí mất theo thương vong, rìu mòn; giữ ô biển nông cần `đi-nước`; kỷ nguyên không lùi; nghiên cứu tự bắt đầu chỉ khi đủ điều kiện vật chất; hai đơn cùng tên duyệt cùng lượt được gộp; chặn giả mạo mệnh lệnh trong đơn phát minh và thỉnh nguyện; đồng minh chia sẻ tầm nhìn; uy tín công khai; tuyên chiến không chính nghĩa −5 uy tín; quyết định duyệt tay của Watcher không mất khi khởi động lại; `move` chỉ nhận biển nông và núi; chỗ chế tác của công trình mở tính điểm.
- Xếp hạng tính ở Engine theo độ sâu phát minh (src/ranking.ts).
- Sử gia AI, gián điệp ra tay (phá hoại, đánh cắp công nghệ, kích động), đổi tên sau khi sang kỷ nguyên.
- **Cân bằng lại cho một mùa 500 lượt** (đo bằng `tools/simulate.ts`, chi tiết và bảng trước/sau trong `docs/BALANCE.md`; `RULES_VERSION` 0.3):
  - **Chỗ ở (§4.2):** mỗi trung tâm (thủ đô, mỗi điểm định cư) tối đa 3 công trình có chỗ ở (Lều, công trình mở); `build` vượt trần bị từ chối, và chỉ các công trình trong trần được tính.
  - **Tăng dân logistic (§4.2):** +floor(dân × 8% × (1 − dân/chỗ ở)), tối thiểu 1 (trước đây 4% cố định).
  - **Giới hạn ô (§2.3):** 7 + floor(√dân) + thưởng + 3 mỗi điểm định cư (trước đây 7 + dân/10).
  - **Định cư (§2.3):** cần 50 dân (trước đây 30), cách các trung tâm ≥ 6 ô (trước đây 4), trả 25 gỗ và/hoặc đá, loại nhiều hơn trả trước (trước đây 20 lương thực), +10 chỗ ở (trước đây +15); 10 người dời đi vẫn là dân của nước nhưng ổn định −5; mỗi điểm định cư vượt quá 3 làm ổn định −1 mỗi lượt (§4.4).
  - **Nghiên cứu (§5.5):** N người làm ra N^0,85 RP; giá phát minh × (1 + 0,75 × (d − 1)) theo độ sâu, cho cả cây gốc và phát minh mở (cây gốc 2.115 RP thay vì 1.040).
  - **Chiến tranh (§7.4):** mặt trận tối đa 5 + 5 × số ô của bên công kề ô bị đánh; bên thủ +50% lợi thế sân nhà, dân quân (10% lao động, nửa sức) luôn ra trận cùng chiến binh, lực lượng thủ dàn đều trên mọi ô biên giới giáp kẻ thù; chiếm ô thì thu 15% kho của bên thua (tối đa 5 đơn vị mỗi chiến binh), chiếm trung tâm thì thu 50%; tù binh 50% số người bên thủ tử trận (trước đây 20%); thủ đô và điểm định cư thất thủ khi bên công giữ 4 ô đất liền kề (trước đây phải bao vây kín).
  - **Gốm (§4.1):** mỗi món gốm trong kho giảm hư lương thực 0,5 điểm %, tối đa 5 điểm %.
  - **Sửa nhỏ:** `ROLE_NAME` có vai `mine` ("khai mỏ"); bỏ phép so sánh chết sau `applyRuling` ở đầu `step()`; Đếm (P18) chỉ còn +1 AP và sai số tình báo giảm một nửa, như mô tả trong luật (bỏ −5 điểm % hư hỏng ẩn trong engine).
  - **Bot:** dựng đủ lều trước khi lập điểm định cư, gom gỗ/đá cho định cư, không lập điểm định cư thứ 4 trở đi khi ổn định < 50; mở mặt trận rộng ≥ 3 ô trước khi tuyên chiến, chia quân theo trần mặt trận và chỉ đánh khi ước tính thắng, giữ đất ở mặt trận; bên thua đất xin hòa kèm cống nạp lương thực; tìm bạn hàng có đất chứa thứ mình thiếu; làm gốm (giữ tới 10 món).
  - **`tools/simulate.ts`:** các tham số trên là trường của object xuất khẩu (`GROWTH`, `HOUSING`, `TILES`, `RESEARCH`, `SETTLEMENT`, `WAR`, `SPOILAGE`), chỉnh được bằng `--variant` hoặc `--set OBJ.field=số`; `--tag` để ghi nhiều khối (ví dụ chạy 4 nước); bảng chiến tranh có chiến lợi phẩm, trung tâm thất thủ và kết cục (hòa, cống nạp, diệt vong).
  - **System prompt (§8.1)** nêu các con số mới.

## v0.2 — 19/10/2026

Commit `1aa9f78` (phát minh mở, ngoại giao, chiến tranh), `f34c5a1` (nhà cung cấp Ollama/custom, sửa lỗi), sau đó Sử gia AI, hoạt động gián điệp và đổi tên quốc gia.

### Thêm mới

- **Phát minh mở (§5):** quốc gia tự đề xuất phát minh bằng `propose_invention` (2 AP), với danh mục 11 loại hiệu ứng (`role_bonus`, `spoilage`, `recipe` kèm công cụ, `building`, `stability`, `ap`, `combat`, `move`, `reveal`, `research`, `tile_limit`) cộng tối đa 2 năng lực mới (3 điểm mỗi năng lực). Ngân sách sức mạnh 4 + 2d, RP = 15 × 1,4^d × (1 + điểm / 10) do Engine tính. Công thức mới tự định giá hàng theo đầu vào + công. Phát minh được duyệt vào Sổ chung với mã `X1`, `X2`…, người đề xuất được giảm 20% RP.
- **Trọng tài AI (§5.4):** mỗi đơn được một trọng tài chấm nhân quả, vật chất, vật lý (0–2 mỗi tiêu chí, cần ≥ 4 và vật lý > 0), có thể thêm tiên quyết, bỏ hiệu ứng, bỏ năng lực, hoặc báo trùng. Trọng tài chọn từ `JUDGE_PROVIDERS`, không bao giờ trùng nhà cung cấp với bên đề xuất, ưu tiên nhà cung cấp không điều hành quốc gia nào; tối đa `JUDGES_PER_TICK` lời gọi mỗi lượt; hết quota thì nghỉ ít nhất 15 phút. Phán quyết được lưu nguyên văn để replay. Watcher chấm tay được trong tab Phát minh.
- **Thất truyền (§5.5)** khi dân số mất quá nửa trong một lượt mà chưa có `ghi-chép`. **Cổng Đồ Đồng (§5.6):** `nhiệt-cao`, `nhận-biết-khoáng`, `chứa`, `luyện-đồng` + ô có quặng đồng.
- **Ngoại giao (§7.2):** 20 cử chỉ trước khi có ngôn ngữ chung (cả hai có `ghi-chép`, hoặc 10 lần giao thương), tin nhắn ≤ 500 ký tự có lọc giả mạo mệnh lệnh hệ thống (uy tín −15). Sáu loại hiệp ước: bất tương xâm, đi lại, liên minh, hòa bình, cống nạp, chư hầu; có thời hạn, cống phẩm, bên trả, nhượng ô. `treaty` / `accept_treaty` (đề nghị hết hạn sau 2 lượt), `break_treaty` (hiệu lực từ lượt sau, uy tín −20), giữ ước đến hết hạn +5, không nộp đủ cống −10.
- **Giao thương (§7.3):** `trade_offer` / `accept_trade`, giao ngay khi hai lãnh thổ cách ≤ 3 ô, xa hơn thì đi đoàn buôn tốc độ 8 ô/lượt; lương thực trên đường hư 30% mỗi lượt. Sổ cái kiểm toán cả hàng trên đường.
- **Chiến tranh (§7.4):** `declare_war` (giao tranh từ lượt sau), đồng minh và tông chủ của bên bị tấn công tự tham chiến; `attack` (chiếm ô, tầm 2 ô, 3 ô khi có `đi-nước`), `raid` (cướp kho, 5 đơn vị mỗi chiến binh, tối đa 30% mỗi loại); công thức sức mạnh có vũ khí, thưởng chiến đấu, ổn định, may rủi, địa hình, sông, hàng rào; dân quân khi không còn chiến binh; tù binh; thủ đô và điểm định cư chỉ thất thủ khi bị bao vây; mệt mỏi chiến tranh sau 5 lượt; `declare_independence` cho chư hầu sau 10 lượt.
- **Lan truyền tri thức (§7.5):** giảm 20% khi đã gặp, 40% khi giao thương ≥ 5 lần, 60% khi liên minh; chỉ lấy mức cao nhất.
- **Tình báo (§7.8):** mức 2 cũng đạt được khi đã giao thương ít nhất 1 lần; mức 3 khi có bất kỳ hiệp ước nào hoặc giao thương ≥ 5 lần; mức 4 khi liên minh (trước đây chỉ gián điệp).
- **Gián điệp ra tay (§7.8):** `sabotage` (xóa tiến độ công trình đang xây hoặc làm công trình đã xong mất tác dụng 3 lượt), `steal_tech` (giảm 50% RP cho một phát minh của họ, không cộng dồn với giảm giá khác), `incite` (ổn định của họ −5). Mỗi lần 2 AP, cần `ghi-chép` và gián điệp đang hoạt động, mỗi gián điệp một lần mỗi lượt, lượt ra tay cơ hội bị lộ nhân đôi.
- **Đổi tên quốc gia (§2.2):** `rename_nation` (3 AP, −10 ổn định) trong 5 lượt sau khi bước vào kỷ nguyên mới, một lần mỗi lần đổi kỷ nguyên; tên cũ được giữ lại.
- **Sử gia AI (§10.1):** mỗi `HISTORIAN_EVERY` lượt (mặc định 10) một AI trung lập viết một chương sử tiếng Việt từ Biên niên, đọc trong tab Biên niên và `/api/history`. Chọn bằng `HISTORIAN_PROVIDER` (mã nhà cung cấp, `claude`, hoặc `off`); không làm chậm vòng lượt và không ảnh hưởng replay.
- **Lãnh thổ (§2.3):** `found_settlement` (3 AP; cần `tổ-chức`, dân ≥ 30, 20 lương thực, cách các trung tâm ≥ 4 ô, cách lãnh thổ ≤ 10 ô): mỗi điểm định cư +15 chỗ ở và +3 giới hạn ô. `abandon_tile` (0 AP) để bỏ ô. Ô bị cắt rời khỏi mọi trung tâm 5 lượt thì hoang hóa.
- **Kinh tế:** vai **khai mỏ** (`mine`) và trường `mine_target` để chọn quặng nhìn thấy được, muối hoặc sậy; quặng ẩn chỉ khai được khi nhìn thấy. Tác dụng công trình thành dữ liệu (`effect`: chỗ ở, ổn định, hư hỏng, chỗ chế tác, phòng thủ, trồng trọt), nên công trình do phát minh mở tạo ra chạy cùng luật với công trình gốc; chỗ chế tác cộng từ mọi công trình. Công cụ mở hao mòn 1/10 mỗi lượt sử dụng.
- **Nhà cung cấp:** `ollama` (model chạy trên máy, không cần key, không quota) và `custom` (bất kỳ endpoint tương thích OpenAI). `tools/mock-provider.ts` giả lập quốc gia và trọng tài để chạy thử không cần key.
- **Watcher UI:** tab Phát minh có chấm tay, bảng quan hệ, chiến tranh, hiệp ước, trận đánh, biểu đồ, bảng xếp hạng; điểm định cư và trận đánh trên bản đồ.

### Thay đổi

- **Thám hiểm (§7.6):** đi xa tới 16 ô (trước đây 8), vòng qua nước và núi sang hai hướng lệch 60° thay vì dừng lại, có thể xuất phát từ một ô lãnh thổ bất kỳ (`from`). `đi-nước` không còn cho đi xuyên núi (lỗi v0.1). Phát hiện vi phạm biên giới bỏ qua nước có hiệp ước đi lại hoặc liên minh.
- **Phạt vượt giới hạn ô (§2.3):** tối đa −10 ổn định mỗi lượt (trước đây −2 mỗi ô, không giới hạn), để quốc gia đang co lại không rơi vào vòng nội loạn chết người thấy trong mô phỏng 500 lượt.
- **Lan truyền tri thức:** trước đây chỉ có một mức 20% khi đã gặp.
- **Phân công mặc định:** 7 săn, 4 hái, 2 nghiên cứu, 1 chế tác (trước đây 9 săn, 2 hái).
- Bỏ hành động `repair` (công trình chưa hao mòn).
- `RULES_VERSION` 0.2; thế giới cũ được tự nâng cấp khi nạp (`migrate`).

### Sửa lỗi

- Phân công quá số lao động: phần lẻ trước đây chia theo thứ tự vai nên một người nghiên cứu duy nhất luôn bị thu về 0; nay chia cho phần thập phân lớn nhất.
- Thống kê số lượt trả lời hợp lệ (`stats.ok`) trước đây không được đếm.

### Tài liệu

- `docs/RULES.md` được đồng bộ với engine v0.2: mọi con số và cơ chế theo code, danh mục hiệu ứng thật ở §5.3, những phần chưa thi hành được đánh dấu "(chưa có trong engine)".
- Thêm `CHANGELOG.md`.

## v0.1 — 19/10/2026

Commit `32e1c7b`: bản đầu tiên của engine thế giới các quốc gia AI.

- **Thế giới (§2.1, §12):** bản đồ lục giác 64 × 64 theo seed: hai lục địa, eo đất, quần đảo, tối đa 8 sông, 7 kỳ quan, 3 đới khí hậu, điểm khai sinh công bằng ±10%, vùng hoang.
- **Lập quốc (§2.2):** tên, thủ đô, dân tộc, cờ (8 bố cục, 24 biểu tượng), tuyên ngôn; chặn trùng tên, tên model hoặc nhà cung cấp, màu cờ quá giống (ΔE < 25); tự đặt tên nếu AI không lập quốc.
- **Kinh tế (§4, §6):** 12 vai lao động, săn bắt hái lượm đánh cá, khai thác, trữ lượng ô tái sinh, công cụ săn bắt hao mòn, 9 công thức chế tác, 8 công trình, ruộng và chuồng.
- **Dân số và ổn định (§4):** ăn, đói, hư hỏng, tăng dân theo chỗ ở, ổn định, nội loạn, di cư; sự kiện thế giới (mùa đông, hạn hán, dịch bệnh, bội thu, đàn thú, cháy rừng, thiên thạch, núi lửa).
- **Phát minh (§5.2):** cây gốc 18 phát minh, cổng Đồ Đá Mới. Phát minh mở, ngoại giao, giao thương và chiến tranh có trong luật nhưng engine trả "chưa có".
- **Lãnh thổ:** khai hoang (`claim_tile`), giới hạn quản lý, thám hiểm 8 ô theo đường thẳng.
- **Tình báo (§7.8):** mức hiểu biết 1, 2, 4 theo tầm nhìn và gián điệp, sai số ước lượng, tin phai dần khi chưa có `ghi-chép`; `plant_spy`.
- **Watcher (§10):** thỉnh nguyện, Sắc lệnh (không được nêu tên quốc gia), bản đồ sống, dòng suy nghĩ, Biên niên sử, chat với Claude qua Claude Code CLI.
- **Hạ tầng (§3, §11):** sổ cái kép kiểm toán mỗi lượt, replay giống hệt từng byte, AI Gateway cho các nhà cung cấp miễn phí kiểu OpenAI, ngủ đông khi hết quota (theo `retry-after` hoặc bậc 15 phút tới 6 giờ), sửa JSON hỏng một lần, SQLite, supervisor tự nạp code mới sau `git pull`, `docker compose up`.
