# Sovereign Minds — Bộ Luật Chơi

Phiên bản 20/10/2026 · Đồng bộ với Engine v0.6, gồm đợt cân bằng lại theo `docs/BALANCE.md` và chỉ tiêu nhịp độ của `tools/pace.ts` (`src/rules.ts`, `src/engine.ts`, `src/catalog.ts`, `src/diplomacy.ts`). Khi tài liệu và code khác nhau, **code là sự thật**. Những điều luật đã viết nhưng engine chưa thi hành được đánh dấu "(chưa có trong engine)". Lịch sử thay đổi: xem `CHANGELOG.md`.

## 1. Tổng quan và Hiến pháp

Nhiều thành phố bắt đầu từ thời đồ đá. Mỗi thành phố do một AI riêng điều hành (mỗi AI một API key miễn phí, hoặc một model chạy trên máy). Con người chỉ là **Watcher** — quan sát, không can thiệp. Mọi luật đều được thi hành bằng code của **Engine**, không dựa vào lời hứa của AI.

### Bảy điều Hiến pháp (không bao giờ thay đổi trong một ván)

1. **Engine là sự thật duy nhất.** Trạng thái thế giới chỉ thay đổi khi Engine xử lý. Điều AI "nói" không có giá trị; chỉ hành động hợp lệ mới có giá trị.
2. **AI chỉ đề xuất.** Mỗi lượt AI gửi danh sách hành động theo schema JSON (Engine chỉ xét 12 hành động đầu tiên). Hành động sai luật bị hủy, AP vẫn bị trừ. Hành động không tồn tại, chưa có trong engine, hoặc vượt số AP còn lại thì bị hủy mà không trừ AP.
3. **Bảo toàn.** Không có gì sinh ra từ hư không. Mọi đơn vị tài nguyên phải có nguồn gốc: khai thác, chế tác, trao đổi, hoặc chiến lợi phẩm.
4. **Nhân quả.** Không phát minh nào được công nhận nếu thành phố chưa sở hữu đủ phát minh tiên quyết và điều kiện vật chất của nó.
5. **Thông tin hạn chế.** Mỗi AI chỉ biết những gì thành phố của nó thấy hoặc được kể. Không AI nào đọc được trạng thái nội bộ của AI khác.
6. **Tất định.** Cùng seed + cùng chuỗi hành động + cùng phán quyết trọng tài = cùng kết quả. Mọi ngẫu nhiên đều lấy từ RNG có seed, nên mọi ván đều phát lại (replay) được. Câu trả lời của AI và của trọng tài được lưu nguyên văn, nên replay dùng lại đúng câu trả lời cũ mà không gọi AI lần nữa.
7. **Không can thiệp.** Watcher không ra lệnh cho quốc gia nào, không cho tài nguyên, không sửa trạng thái trực tiếp. Quyền chính của Watcher là **ban hành luật mới** cho cả thế giới (xem mục 10). Ngoài ra Watcher được trả lời thỉnh nguyện (10.5) và được chấm tay đơn phát minh thay trọng tài (5.4). Sự kiện thế giới chỉ đến từ bảng xác suất có seed.

## 2. Thế giới, Lập quốc và Lãnh thổ

Thế giới là lưới ô lục giác 64 × 64. Mỗi quốc gia bắt đầu là một bộ lạc 20 người trên một ô trung tâm. AI tự đặt tên và vẽ cờ ngay lượt đầu, rồi mở rộng lãnh thổ từng ô bằng lương thực và AP.

### 2.1 Địa hình và tài nguyên tự nhiên

| Địa hình | Tài nguyên có thể có | Di chuyển (lượt/ô) | Phòng thủ |
| --- | --- | --- | --- |
| Đồng cỏ | thú săn, cây dại | 1 | +0% |
| Rừng | gỗ, thú săn, cây dại, thảo dược (35% ô) | 2 | +25% |
| Rừng lá kim (hàn đới) | gỗ, thú săn | 2 | +25% |
| Rừng rậm (nhiệt đới) | gỗ, cây dại, thảo dược | 3 | +50% |
| Đồi | đá, đá lửa (40% ô), quặng đồng (20% ô, ẩn), quặng thiếc (2% ô, ẩn) | 2 | +50% |
| Núi | đá, quặng đồng (10%), thiếc (6%), sắt (8%) (đều ẩn) | không đi qua (đến khi có phát minh) | +100% |
| Ven biển | cá, cây dại, muối (25% ô) | 1 | +0% |
| Đầm lầy | đất sét, sậy, thảo dược | 3 | +25% |
| Sa mạc | đá | 2 | +0% |
| Lãnh nguyên (hàn đới) | thú săn, đá | 2 | +0% |
| Băng hà (chân Tường Băng) | thú săn (tuần lộc, voi ma mút), đá, đá lửa (15% ô) | 3 | +25% |
| Biển nông | cá | chỉ đi được khi có năng lực `đi-nước` | — |
| Biển sâu | — | không đi được | — |
| Tường Băng (viền thế giới) | — | không ai đi qua, đứng trên hay khai hoang được | — |

- **Sông** không phải một địa hình mà là một dấu trên ô. Ô có sông được thêm cá (60), đất sét (150), sậy (40) và cây dại bãi bồi (20); ô sông trong vòng 3 ô của đồi hay núi (thượng nguồn) có thêm đá lửa cuội (25). Ô có sông được +25% phòng thủ khi bị tấn công, trừ khi bên công có Bến thuyền trong vòng 3 ô.
- **Phù sa:** ruộng trên ô có sông cho +25% lương thực, trên châu thổ +50%.
- **Nước ngọt:** thủ đô không có sông, đầm lầy, Suối Nước Nóng hay Giếng (công trình `well`, cần Công cụ đá thô, 10 đá + 4 gỗ) trong vòng 2 ô thì dân tăng chậm hơn (×0,75) và dịch bệnh ×1,5.
- **Mùa cá:** mỗi lượt, nước có ô sông có 5% cơ hội cá về: tối đa 3 ô sông được thêm 80 cá (một lần).
- **Sông là đường đi:** khi có năng lực `đi-nước`, đoàn thám hiểm đi một ô sông chỉ tốn nửa bước, nên đi dọc sông được xa gấp đôi. Có Bến thuyền trong vòng 3 ô thì quân tấn công với tới thêm 1 ô khi mục tiêu là ô sông hoặc ô ven biển nông, và bên thủ mất +25% của sông.
- **Di chuyển:** cột "lượt/ô" là thiết kế cho đoàn người đi trên bản đồ (mục 7.6) (chưa có trong engine). Engine hiện chỉ dùng địa hình để quyết định ô nào đi qua được: biển nông cần `đi-nước` (hoặc hiệu ứng `move` biển nông), núi cần hiệu ứng `move` núi, biển sâu không bao giờ đi được. Sa mạc thiếu nước (chưa có trong engine).
- Mỗi ô có trữ lượng hữu hạn. Tài nguyên tái tạo hồi phục mỗi lượt theo % của trần ban đầu: thú săn 10%, cá 8%, gỗ 5%, cây dại 15%, sậy 10%, thảo dược 8%, không vượt trần ban đầu. Đá, đá lửa, đất sét, muối và quặng không tái tạo.
- **Tài nguyên ẩn:** quặng đồng, thiếc, sắt không hiện trên bản đồ của AI và không khai thác được cho đến khi thành phố sở hữu phát minh có năng lực `nhận-biết-khoáng` (thấy cả ba) hoặc phát minh mở có hiệu ứng `reveal` cho từng loại quặng. Than (chưa có trong engine).
- Điểm khai sinh cách nhau ≥ 17 ô (láng giềng gần nhất lý tưởng ≤ 25 ô), không ở quần đảo, không trong vòng 3 ô quanh kỳ quan, không trong vòng 8 ô của Tường Băng, và có đủ gỗ, đá, thịt hoặc cá, cây dại trong bán kính 2. Tổng giá trị tài nguyên trong bán kính 3 của mỗi điểm khai sinh nằm trong ±5% quanh cùng một mức chuẩn, nên chênh nhau tối đa khoảng 10%. Nếu không tìm đủ chỗ thì Engine nới khoảng cách xuống ≥ 13 ô và bỏ kiểm tra giá trị.

**Tài nguyên sâu:** than đá (đồi, núi, ít ở rừng và đầm), dầu mỏ (sa mạc, đầm, ven biển, biển nông), lưu huỳnh (núi, nhiều quanh Núi lửa Tro Đen) bị ẩn với AI cho tới khi có phát minh hiệu ứng `reveal` cho từng loại; khai bằng vai `mine`. **Ngựa hoang** (đồng cỏ, lãnh nguyên, tái tạo 6%) thì thấy được; thợ săn mang ngựa về khi nước có năng lực `thuần-ngựa`. Thế giới tạo trước v0.5 được rải thêm các tài nguyên này khi tải lại.

Trữ lượng điển hình mỗi ô (±30% theo seed): thú săn 50–80, cây dại 20–80, cá 60 (ô có sông thêm 60), gỗ 150–200, đá 300–500, đá lửa 40, đất sét 150, sậy 60, muối 30, quặng đồng 80, thiếc 60, sắt 100. Tài nguyên tái tạo hồi theo % của trần, nên 7 ô khởi đầu chỉ nuôi bền vững khoảng 40–50 người bằng săn hái. Muốn đông dân hơn thì phải mở rộng lãnh thổ hoặc phát minh trồng trọt.

### 2.2 Lập quốc: tên, cờ, bản sắc

Ở lượt 0, trước mọi hành động khác, mỗi AI phải gửi một hành động `found_nation`:

- **Tên quốc gia:** 2–30 ký tự, không trùng (không phân biệt hoa thường, bỏ dấu và ký tự đặc biệt) với quốc gia khác. Không được chứa tên model hay tên nhà cung cấp (Gemini, Llama, GPT…; danh sách cấm nằm trong `FORBIDDEN_NAME_WORDS`). Trùng thì ai gửi trước theo thứ tự seed được giữ, bên kia bị từ chối và phải chọn lại.
- **Tên thủ đô** và **tên dân tộc** (ví dụ "người Aru"), cùng luật độ dài, không trùng và không chứa tên model.
- **Cờ:** chọn 1 trong 8 bố cục (`plain` trơn, `h2`/`h3` 2–3 sọc ngang, `v2`/`v3` 2–3 sọc dọc, `cross` chữ thập, `diagonal` chéo, `border` viền) + 2–3 màu hex `#rrggbb` + 1 biểu tượng trong 24 biểu tượng có sẵn (sun, moon, star, fire, mountain, wave, tree, eye, hand, spiral, arrow, circle, triangle, diamond, crown, leaf, fish, bird, wolf, bull, snake, hammer, spear, river). Cờ bị từ chối nếu màu chủ đạo (màu đầu tiên) cách màu chủ đạo của cờ khác dưới ngưỡng ΔE 25. Màu chủ đạo cũng là màu tô lãnh thổ trên bản đồ.
- **Tuyên ngôn lập quốc:** ≤ 280 ký tự. Chỉ để ghi vào Biên niên sử, không có hiệu lực luật.
- **Đổi tên/đổi cờ** (`rename_nation`, 3 AP, −10 ổn định): chỉ trong 5 lượt sau khi quốc gia bước vào kỷ nguyên mới, và mỗi lần đổi kỷ nguyên chỉ được đổi một lần. Gửi `name` và/hoặc `flag`; kiểm tra như `found_nation` (độ dài, không trùng, không tên model, màu chủ đạo cách cờ khác ΔE ≥ 25). Tên cũ được giữ trong danh sách tên cũ (hiện trong gói trạng thái và hồ sơ quốc gia) và trong Biên niên sử. Đổi chế độ và sáp nhập chưa có nên chưa mở cửa sổ đổi tên.
- Lượt 0 chỉ dành cho lập quốc (và phân công lao động); mọi hành động khác ở lượt 0 bị bỏ qua. Quốc gia chưa lập quốc hợp lệ được gửi lại `found_nation` ở lượt 1; nếu lượt 1 vẫn không hợp lệ, Engine đặt tên, thủ đô và cờ ngẫu nhiên theo seed. Quốc gia vẫn hành động bình thường ở lượt 1.

### 2.3 Lãnh thổ

- **Khởi đầu:** ô thủ đô + 6 ô kề. Tầm nhìn ban đầu là bán kính 4 quanh thủ đô; sau mỗi lượt, mọi ô trong vòng 3 ô quanh lãnh thổ được thêm vào tầm nhìn. Ô đã thấy thì không bị che lại. Phần còn lại là sương mù cho đến khi được thám hiểm.
- **Mở rộng:** hành động `claim_tile` cho một ô vô chủ kề lãnh thổ (đất liền, hoặc lãnh hải theo mục 2.6). Tốn 2 AP và 5 lương thực (trừ lúc ô về tay). Ô thuộc về quốc gia ngay trong lượt đó.
- **Giới hạn quản lý:** số ô tối đa = 7 + floor(√dân số) + thưởng từ phát minh (Hội đồng bộ lạc +2, hiệu ứng `tile_limit`) + 3 cho mỗi điểm định cư + thưởng đường sá (mục 2.5). Ô biển chỉ tính 1/3 ô (mục 2.6). Ví dụ: 17 ô ở 100 dân, 22 ô ở 225 dân, 27 ô ở 400 dân (chưa tính thưởng và định cư). Đất tăng chậm hơn dân, nên muốn đông người thì phải lập điểm định cư hoặc trồng trọt. **Vượt giới hạn** (ví dụ khi dân giảm): không đủ người làm, nên mỗi lượt 1 ô thừa tự thành đất hoang. Engine chọn ô trống, không công trình, ít người ở, xa trung tâm và nghèo nhất trước. Việc này **không làm mất ổn định và không làm dân bất mãn**: đất rộng không phải lý do để dân bỏ đi, vì phái ra đi lập quốc cũng sẽ giữ chừng ấy đất. Muốn giữ ô tốt thì tự chọn ô bỏ (`abandon_tile`) hoặc nâng giới hạn.
- **Bỏ ô:** `abandon_tile` (0 AP) trả một ô về vô chủ. Không bỏ được ô thủ đô hay ô điểm định cư. Công trình trên ô bị mất.
- **Định cư mới:** `found_settlement` (3 AP) trên ô đất liền vô chủ, không phải núi, cách thủ đô và mọi điểm định cư khác ≥ 6 ô, và cách lãnh thổ hiện có ≤ 10 ô. Cần năng lực `tổ-chức`, dân số ≥ 50, **25 đơn vị gỗ và/hoặc đá** (trộn theo tỷ lệ bất kỳ; Engine lấy từ loại đang có nhiều hơn trước) và một tên 2–30 ký tự. Giá trả bằng vật liệu không hư, không bằng lương thực, vì lương thực hư 30% mỗi lượt nên nước đất nhỏ không gom nổi. Điểm định cư nhận ô đó cùng các ô kề còn vô chủ (trừ biển sâu), cho thêm +10 chỗ ở, chỗ cho 3 công trình có chỗ ở nữa (mục 4.2) và +3 giới hạn ô. 10 dân dời sang điểm mới: họ vẫn là dân của quốc gia (dân số không đổi), nhưng cuộc di dời làm ổn định −5. Mỗi điểm định cư vượt quá 3 làm ổn định −1 mỗi lượt (mục 4.4).
- **Biên giới:** mỗi ô chỉ thuộc một quốc gia. Đoàn thám hiểm đi qua lãnh thổ nước khác khi không có hiệp ước đi lại hoặc liên minh là vi phạm biên giới: mỗi ô vi phạm có 30% bị phát hiện, khi đó bên kia được thông báo và "đã gặp" bên vi phạm.
- **Mất ô:** ô bị chiếm trong chiến tranh, nhượng qua hiệp ước, bị bỏ (`abandon_tile`), hoặc bị cắt rời: một ô không liền với thủ đô hay điểm định cư nào trong 5 lượt liên tiếp sẽ thành vô chủ.

### 2.4 Đặc thù quốc gia

Mỗi quốc gia sinh ra với **một đặc thù**, không nước nào trùng nước nào. Watcher chọn đặc thù (hoặc để ngẫu nhiên) trong hộp thoại **Thế giới mới**, và đặc thù giữ nguyên suốt trận. Mỗi đặc thù có hai phần:

- **Luật:** một lợi thế và một điểm yếu, viết cùng dạng với hiệu ứng phát minh (thưởng nghề, RP, chiến đấu, ô quản lý, thiệt hại mùa đông, ổn định mỗi lượt), và Engine cộng như thêm một phát minh. Thương nhân còn được giảm thêm 15 điểm % khi học phát minh từ nước đã gặp (mục 7.5, tối đa 75%). Một số đặc thù đổi uy tín hoặc ổn định lúc khởi đầu.
- **Bản sắc:** trường `identity` trong gói quan sát (mục 8.2) cho AI biết tên đặc thù, tính cách dân tộc và các con số trên. AI được dặn để bản sắc ấy dẫn dắt tên gọi, văn hóa, ưu tiên và ngoại giao.

| Đặc thù | Tính cách | Lợi thế và điểm yếu |
| --- | --- | --- |
| 🏹 Thợ săn thảo nguyên | Sống bằng cuộc săn, giỏi theo dấu thú, ít kiên nhẫn với sách vở. | săn bắt +10%; nghiên cứu −10% |
| 📜 Hiền triết | Tò mò, quan sát và ghi nhớ; nghiên cứu nhanh nhưng yếu khi đánh nhau. | nghiên cứu +8%; chiến đấu −15% |
| 🌾 Nông dân ven sông | Gắn bó với đất và mùa vụ; hái lượm, trồng trọt, đánh cá giỏi nhưng khó cai quản vùng xa. | hái lượm +15%; nông dân +25%; đánh cá +10%; −1 ô quản lý |
| 🔨 Thợ thủ công | Khéo tay, chế tác và xây dựng giỏi; săn bắt kém. | chế tác +40%; xây dựng +30%; săn bắt −8% |
| ⚔️ Chiến binh | Thượng võ, đánh mạnh; bị láng giềng e dè và ít chú tâm học hỏi. | nghiên cứu −5%; chiến đấu +25%; uy tín khởi đầu −10 |
| 🤝 Thương nhân | Giỏi giao thiệp, học nhanh từ nước đã gặp, được tin cậy; yếu về quân sự. | chiến đấu −10%; học từ nước đã gặp rẻ thêm 15%; uy tín khởi đầu +10 |
| 🐎 Du mục | Quen đi xa và chịu rét; quản được nhiều đất nhưng ngại xây cất. | xây dựng −20%; +2 ô quản lý; thiệt hại mùa đông −25% |
| ⛏️ Người núi đá | Thạo đá, gỗ, đất sét và quặng; hái lượm kém. | khai thác gỗ/đá/đất sét/mỏ +25%; hái lượm −15% |
| 🔥 Thầy tế | Đoàn kết quanh lửa thiêng và nghi lễ; ổn định cao, săn bắt kém. | săn bắt −8%; +1 ổn định/lượt; ổn định khởi đầu +10 |

Cân bằng bằng `tools/traits.ts`: các bot mang đủ 9 đặc thù, xoay vòng qua mọi điểm khai sinh, mỗi seed 300 lượt. Trên bản đồ 128 × 128 có đủ mối đe dọa (mục 9.4), với 3 seed, điểm xếp hạng trung bình của từng đặc thù nằm trong khoảng −10% đến +13% so với mức trung bình, và không nước nào diệt vong. Bot không biết khai thác chiến tranh và giao thương, nên con số này đánh giá thấp Chiến binh và Thương nhân.

### 2.5 Đường sá và hải đạo

- **Hành động `build_road`** (1 AP): `{"type":"build_road","path":[[cột,hàng],…],"level":n}` cho tối đa 12 ô. Trên đất liền là đường, trên mặt nước là hải đạo. Không ghi `level` thì Engine chọn cấp cao nhất mà kỷ nguyên cho phép. Ô đã có đường cấp đó (hoặc đang làm) được bỏ qua.
- **Ba cấp, mở theo kỷ nguyên** (giá cho mỗi ô; công là công của thợ xây):

| Cấp | Đường | Hải đạo | Từ thời | Giá trên đất | Giá trên nước | Công | Chi phí đi | An toàn |
|---|---|---|---|---|---|---|---|---|
| 1 | Đường mòn | Luồng lạch cắm sào | Đồ Đá Cũ | 1 gỗ | 2 gỗ | 2 | 60% | −15% |
| 2 | Đường đất nện | Hải đạo có phao tiêu | Đồ Đồng | 1 gỗ + 2 đá | 3 gỗ + 1 dây | 4 | 40% | −30% |
| 3 | Đường lát đá | Hải đạo có hải đăng | Cổ Đại | 5 đá | 6 đá + 2 gỗ | 8 | 25% | −50% |

- **Làm đường:** vật liệu trả ngay khi ra lệnh. Thợ xây làm các công trình trước, công còn thừa thì làm đường theo thứ tự đã ra lệnh.
- **Làm ở đâu:**
  - trên lãnh thổ hay lãnh hải của mình
  - trên đất của nước có hiệp ước thông hành hay liên minh với mình
  - trên vùng hoang (đất hay biển vô chủ) cách lãnh thổ không quá 4 ô
- **Điều kiện riêng:**
  - Đường qua núi là đèo: muốn mở phải có năng lực vượt núi, nhưng mở xong thì ai cũng đi được.
  - Hải đạo trên biển nông cần `đi-nước`; trên biển sâu cần `move ocean`.
- **Đường thuộc về ô:** ô đổi chủ thì đường vẫn còn, và đoàn buôn của mọi nước đều đi được.
- **Lợi ích:**
  - Đoàn buôn đi trên đường hay hải đạo nhanh hơn: chi phí mỗi ô bằng chi phí địa hình (tối đa 4 với đèo) nhân tỷ lệ "Chi phí đi" trong bảng.
  - Man di cướp đoàn buôn và bão đánh chìm thuyền ít hơn theo cột "An toàn".
  - Cứ 4 ô đường thuộc lãnh thổ mình, nối với một trung tâm, được thêm 1 ô vào giới hạn quản lý (tối đa +10).
  - Điểm định cư nối với thủ đô bằng đường thì không bị tính vào phạt ổn định vì quá nhiều điểm định cư (mục 4.4). Đường nối có thể đi qua đất mình, vùng hoang hay đất nước có hiệp ước.
- **Hư hại:** lũ lụt làm tối đa 3 ô đường trên đất ngập mất một cấp. Động đất làm mọi đường trong bán kính tâm chấn mất một cấp.
- **Quan sát:** gói trạng thái có trường `roads`, gồm số ô đường, các điểm định cư đã nối hay chưa nối, và một đường gợi ý tới điểm định cư gần nhất chưa nối. Các ô lãnh thổ có trường `road`.

### 2.5b Giao thông là mạch máu

- **Đường nuôi đất:** ô có đường của nước mình ở trên hoặc kề bên nộp về kho thêm 3% / 6% / 10% (đường cấp 1 / 2 / 3), vì hàng về nhanh và tươi hơn.
- **Quân tiếp viện:** ô của mình có đường nối về thủ đô được thủ thêm 15%, vì quân kịp tới.
- **Chợ đường cái:** chợ biên giới mà có đường của một trong hai nước chạm biên giới thì giao thương nhiều hơn 50%.
- **Đường bỏ hoang:** đường trên đất vô chủ mà không còn nối thủ đô hay điểm định cư của nước nào thì cứ 20 lượt giảm một cấp, tới khi mất hẳn. Đường xuyên vùng hoang mà vẫn nối các trung tâm thì được giữ.
- **AI thấy:** `roads.land_without_road` cho biết số ô đất chưa có đường và năm ô giàu nhất trong đó. Lời cố vấn gợi ý làm đường khi hơn nửa đất chưa có đường.
- **Bản đồ:** đường bỏ hoang vẽ mờ và đứt nét.

### 2.6 Lãnh hải

- **Biển được giữ như đất:** `claim_tile` cho ô biển nông (cần `đi-nước`) và biển sâu (cần `move ocean`).
  - Ô biển giáp đất liền của mình thì chiếm thẳng.
  - Ô biển xa bờ phải kề lãnh thổ và nằm trong 4 ô quanh một Bến thuyền của mình.
- **Quản lý:** mỗi ô biển tính 1/3 ô vào giới hạn quản lý. Trường `governed` cho biết tổng đang giữ.
- **Quyền của chủ:**
  - cá trên vùng biển của mình thuộc về ngư dân nước mình
  - thuyền nước khác đi qua phải nộp phí qua đất (mục 7.3), trừ khi có hiệp ước thông hành hay liên minh
  - nước đang chiến tranh với mình không được đi qua
  - đoàn buôn của kẻ thù bị bắt trong vùng biển của mình thì bị tịch thu
- **Bão** trên biển sâu xảy ra nhiều gấp đôi biển nông.
- **Đánh chiếm ô biển** cần `đi-nước` và 1 thuyền rảnh cho mỗi 5 chiến binh.

### 2.7 Lãnh thổ liên thông

Kho là chung cho cả nước, nhưng hàng chỉ về được kho theo một lối đi.

- **Hai trung tâm nối nhau** khi có một trong ba lối:
  - đi bộ qua đất của mình tối đa 6 ô
  - mạng đường sá (mục 2.5)
  - đường nước giữa hai Bến thuyền, mỗi bến cách trung tâm tối đa 3 ô, không đi qua lãnh hải của kẻ thù
- **Lối về thủ đô:** một trung tâm nối về thủ đô qua một chuỗi các trung tâm nối nhau. Gói trạng thái ghi `way_to_capital` cho mỗi điểm định cư.
- **Điểm định cư cô lập** (không có lối nào về thủ đô):
  - đất của nó (các ô gần nó hơn mọi trung tâm khác) chỉ nộp **70%** sản lượng về kho
  - bất mãn +2 mỗi lượt cho mỗi điểm cô lập
  - điểm định cư mới có 10 lượt ân hạn để làm đường trước khi bị tính là cô lập
- **Đất xa:** ô cách mọi trung tâm hơn 4 ô, không có đường trên ô hay ở ô kề, chỉ nộp **90%**.
- **Lập điểm định cư là mở đường về:** `found_settlement` tự đặt một đường mòn từ mạng đường của quốc gia tới điểm mới, trả ngay 1 gỗ mỗi ô (sau giá định cư); thợ xây làm trong các lượt sau. Thiếu gỗ thì lệnh bị từ chối. Không có lối đất thì điểm định cư chỉ nối được bằng đường thủy.
- **Thứ tự làm việc:** người dân làm ô có tỷ lệ nộp cao nhất trước, rồi mới tới ô giàu nhất.
- Phần hao hụt không vào kho; tài nguyên trên ô vẫn bị lấy đủ.
- Watcher chỉnh được tỷ lệ nộp của điểm cô lập và độ dài lối đi bộ bằng sắc lệnh luật.

### 2.8 Tỉnh

Lãnh thổ chia thành các tỉnh, mỗi trung tâm một tỉnh: tỉnh thủ đô và một tỉnh cho mỗi điểm định cư.

- **Đất của tỉnh:** các ô của quốc gia gần trung tâm đó nhất (bằng nhau thì về trung tâm có số ô nhỏ hơn), cùng quy tắc với sản lượng ở mục 2.7.
- **Dân của tỉnh:** dân cả nước chia theo chỗ ở của từng tỉnh (số nguyên, cộng lại đúng bằng dân số):
  - chỗ ở tự nhiên của thủ đô, hoặc 10 chỗ của điểm định cư
  - nhà ở dựng trên đất của tỉnh (tối đa số nhà mỗi trung tâm)
  - thôn xóm trên đất của tỉnh, và hang động nếu kỳ quan nằm trong tỉnh
- Mỗi tỉnh có lối về thủ đô (mục 2.7), bá tước nếu có (mục 4.6) và **độ bất ổn** riêng (0–100). Gói trạng thái của AI có danh sách `provinces`.
- **Bất ổn tăng mỗi lượt:**
  - tỉnh bị cô lập (không lối về thủ đô, qua 10 lượt ân hạn): +4
  - tỉnh cách thủ đô hơn 6 ô mà không có bá tước trung thành: +2
  - dân của tỉnh nhiều hơn chỗ ở của tỉnh: +2
- **Bất ổn giảm mỗi lượt:** −1, và thêm −1 cho mỗi bậc tay nghề của bá tước trung thành (trung thành ≥ 30) giữ trung tâm của tỉnh.
- **Bá tước làm đất giàu thêm:** đất của tỉnh có bá tước trung thành cho thêm 2% sản lượng mỗi bậc tay nghề (tối đa +10%).
- **Tỉnh đè lên cả nước:** mỗi tỉnh có bất ổn từ 50 làm bất mãn của cả nước +1 mỗi lượt (mục 4.5).
- **Tỉnh đòi tách ra:** khi bất mãn cả nước tới 100, tỉnh điểm định cư bất ổn nhất có bất ổn từ 40, đang bị cô lập hoặc xa mà không có bá tước, có ít nhất 12 dân, chính là phái ly khai (mục 4.5). Nếu Watcher cho phép, tỉnh tách ra cùng điểm định cư (thành thủ đô mới), đất của tỉnh, công trình trên đó, người sống ở đó (theo gia đình) và phần kho tương ứng; bá tước của tỉnh rời triều đình cũ. Không có tỉnh nào như thế thì phái ly khai đi tìm đất trống như cũ.
- Trên bản đồ, khi phóng to, đường đứt nét mảnh chia các tỉnh trong lãnh thổ một nước. Hồ sơ quốc gia có thẻ **Tỉnh**.
- Watcher chỉnh được khoảng cách cần bá tước, sức làm dịu và phần sản lượng thêm của bá tước bằng sắc lệnh luật.

### 2.9 Đất là sự sống của dân

Đất cho dân cái ăn và là nơi họ ở, nên cần được giữ gìn và bảo vệ.

- **Bỏ ô có người ở** (thôn xóm từ 2 người, hoặc có công trình): −3 ổn định (có công trình thì gấp đôi), bất mãn +2. Mỗi lượt mất tối đa 4 ổn định và một lần bất mãn vì bỏ đất. Bỏ ô trống thì không mất gì.
- **Ô bị địch chiếm:**
  - các gia đình thôn xóm trên ô (1–3 người tùy địa hình) ở lại dưới quyền bên chiếm, và được ghi vào số người mất (§4.8)
  - bên mất đất −2 ổn định, bất mãn +3
  - bên mất đất có chính nghĩa đòi lại đất trong 10 lượt
- **Ô bị cắt rời quá lâu mà thành đất hoang:** −1 ổn định.
- **Dân giữ nhà:** khi phòng thủ một ô có người ở (thôn xóm từ 2 người, hoặc có công trình), bên phòng thủ mạnh hơn 25%.

### 2.10 Mạch giàu

Không vùng đất nào có đủ mọi thứ. Lúc tạo thế giới, sau khi đã chọn điểm khai sinh (để khởi đầu vẫn công bằng), Engine chọn trong các mỏ sẵn có một số **mạch giàu** cho mỗi loại hàng, rải khắp bản đồ và cách nhau ít nhất 12 ô:

| Hàng | Số mạch | Hàng | Số mạch |
| --- | --- | --- | --- |
| quặng đồng | 12 | đất sét | 6 |
| quặng thiếc | 8 | than đá | 8 |
| sắt | 8 | lưu huỳnh | 6 |
| muối | 8 | dầu mỏ | 6 |
| đá lửa | 10 | ngựa | 8 |

- Một mạch giàu có **trữ lượng gấp 4** mỏ thường, và ai khai thác nó cũng được **+50%** cho cùng một công sức.
- Mạch quặng ẩn (đồng, thiếc, sắt, than, dầu, lưu huỳnh) vẫn ẩn với AI cho tới khi nước đó có năng lực nhìn thấy loại quặng ấy (mục 2.1).
- Mạch nằm trên ô, nên đổi chủ theo ô: chiếm ô là chiếm mạch.
- Thế giới tạo trước v0.17 được thêm mạch giàu khi nạp lại.
- Trên bản đồ, mạch giàu là dấu ◆ màu theo loại hàng.

### 2.11 Sản vật của đất và biển

Ngoài những thứ cơ bản (thú săn, cây dại, cá, gỗ, đá, đá lửa, đất sét, muối, sậy, thảo dược, ngựa, quặng), thế giới còn có:

| Sản vật | Ở đâu | Ai mang về | Hồi lại |
| --- | --- | --- | --- |
| Mật ong | rừng (25%), rừng rậm (30%), đồng cỏ không lạnh (10%) | hái lượm 0,05/người | 10%/lượt |
| Gia vị | rừng rậm (50%), rừng và đồng cỏ nhiệt đới (12%) | hái lượm 0,04/người | 8% |
| Hổ phách | bờ biển ôn đới và hàn đới (10%) | hái lượm 0,02/người | không |
| Lông thú | rừng taiga (50%), lãnh nguyên (40%), sông băng (30%), rừng hàn đới (30%) | săn 0,08/người | 8% |
| Đất son | đồi (15%), sa mạc (12%) | khai mỏ | không |
| Cẩm thạch | núi (8%), đồi (5%) | khai mỏ | không |
| Vàng (ẩn) | núi (4%), đồi (3%), sông gần đồi núi (6%, vàng sa khoáng) | khai mỏ | không |
| Bạc (ẩn) | núi (5%), đồi (2%) | khai mỏ | không |
| Đá quý (ẩn) | núi (3%) | khai mỏ | không |
| Sò ốc | bờ biển (60%), biển nông (20%) | ngư dân, khi cá đã hết: 1 lương thực mỗi đơn vị | 12% |
| Ngọc trai | biển nông nhiệt đới (8%), ôn đới (3%) | ngư dân 0,03/người | 3% |
| San hô | biển nông nhiệt đới (6%) | ngư dân 0,02/người | 2% |
| Cá voi | biển sâu (2–4%) | ngư dân có tàu viễn dương 0,05/người, trên biển sâu mình giữ; mỗi con: 6 lương thực, 2 xương, 1 dầu cá voi | 4% |

- **Quặng ẩn:** vàng, bạc, đá quý ẩn như đồng, thiếc, sắt cho tới khi có năng lực nhận-biết-khoáng.
- **Thứ tự khai mỏ:** thợ mỏ đào `mine_target` trước, rồi các quặng nhìn thấy được, rồi muối, sậy, cẩm thạch, đất son.
- **Mạch giàu (mục 2.10)** có thêm: vàng 6, bạc 6, đá quý 4, cẩm thạch 6, hổ phách 4, gia vị 6, lông thú 6. Trên biển có **ngư trường** (cá, 10 mạch), **bãi ngọc trai** (6) và **đường cá voi** (4).
- **Thế giới cũ:** thế giới tạo trước v0.18 được thêm sản vật và mạch mới khi nạp lại.

**Công dụng:**
- **Xa xỉ phẩm** (mật ong, gia vị, lông thú, hổ phách, đất son, vàng, bạc, đá quý, ngọc trai, san hô, dầu cá voi):
  - mỗi loại nước có trong kho từ 0,5% số dân trở lên (ít nhất 1) thì mỗi lượt dùng hết phần đó và được +0,3 ổn định;
  - tối đa +1,5 ổn định mỗi lượt;
  - mọi dân tộc đều muốn có (cầu 1% số dân mỗi lượt cho mỗi loại, mục 6.3), nên xa xỉ phẩm bán được giá cao.
- **Muối và gia vị** giữ lương thực: mỗi đơn vị trong kho giảm hư hỏng 0,2 điểm %, tối đa 4 điểm.
- **Lông thú** giữ ấm: mỗi tấm tính như 2 áo da khi xét mùa đông.
- **Cẩm thạch** dùng xây Đền cẩm thạch.

**Công trình mới:**

| Công trình | Cần | Vật liệu | Công | Tác dụng |
| --- | --- | --- | --- | --- |
| Bến cá | Lưới và bẫy (P9), ô bờ biển hoặc có sông, tối đa 2 | 10 gỗ, 3 dây | 5 | đánh cá +25% (mọi bến cộng lại tối đa +50%) |
| Ruộng muối | Gốm (P13), ô bờ biển, tối đa 3 | 6 đất sét, 4 đá | 6 | +3 muối mỗi lượt từ nước biển |
| Cảng | Đếm (P18), ô bờ biển, tối đa 2 | 30 gỗ, 20 đá, 6 dây | 14 | như Bến thuyền; chiếm lãnh hải xa thêm 3 ô; đánh cá +10% |
| Đền cẩm thạch | Nghi lễ (P5), tối đa 1 | 20 cẩm thạch, 10 đá | 10 | +2 ổn định mỗi lượt |

**AI biết gì về biển** (`sea` trong gói quan sát):
- thuyền giữ được biển nông hay biển sâu, số bến và cảng;
- lãnh hải và bờ biển của mình: cá, lượng cá hồi mỗi lượt, ngọc trai, san hô, cá voi, sò ốc, hổ phách;
- vùng biển vô chủ gần mình (trong 6 ô): số ô, cá, lượng cá hồi mỗi lượt, số ô chiếm được ngay, ngư trường, bãi ngọc, cá voi;
- chỗ tốt nhất để dựng bến;
- đất đã thấy bên kia biển: ô gần nhất, khoảng cách, có phải quần đảo không, của nước nào, đất vô chủ có gì.

Lời cố vấn nhắc về biển giàu cá chưa khai thác, ngư trường vô chủ, bãi ngọc trai, việc thiếu bến thuyền và đất bên kia biển. Nó cũng nhắc xa xỉ phẩm khi dân dùng chưa tới 2 loại.

**Báo cáo thám hiểm:** mỗi đoàn thám hiểm về báo lại những gì vừa thấy lần đầu:
- số ô mới (đất và nước), sông;
- mạch giàu (của ai hay vô chủ), kỳ quan;
- hai ô đất vô chủ tốt nhất;
- tài nguyên trên đất và nước vô chủ, kèm tổng lượng và chỗ gần nhất;
- biển nông (lượng cá, lượng cá hồi), biển sâu (có cá voi không);
- đất bên kia biển, đất của các nước khác, trại man di.

## 3. Thời gian và vòng lượt

Thế giới chạy theo lượt (tick). Tất cả quốc gia hành động đồng thời, không ai đi trước. 1 lượt = 10 năm lịch sử: dân số, tuổi và kỷ nguyên tính theo thang này. Một "trận đánh", một "đoàn buôn" hay một "chuyến thám hiểm" trong luật là gộp những gì xảy ra trong thập kỷ đó, không phải một ngày.

### 3.1 Sáu pha của một lượt

1. **Quan sát:** Engine gửi cho từng AI trạng thái riêng của quốc gia đó, kèm danh sách hành động bị từ chối ở lượt trước và lý do.
2. **Quyết định:** AI trả về JSON hành động trong hạn 90 giây (`AI_TIMEOUT_SEC`). Trọng tài chấm các đơn phát minh đang chờ trong pha này.
3. **Kiểm tra:** Engine kiểm tra schema, AP, tài nguyên, tiên quyết của từng hành động theo thứ tự AI gửi. Hành động sai bị loại.
4. **Giải quyết** theo thứ tự cố định của `step()`: phán quyết trọng tài và trả lời thỉnh nguyện → lập quốc → phân công lao động, đơn chế tác và hành động của từng quốc gia (tin nhắn, đề nghị, tuyên chiến, phá ước có hiệu lực ngay khi hợp lệ) → khai hoang → hiệp ước được chấp nhận, cống nạp, hết hạn → thương mại và đoàn buôn → chiến đấu, mệt mỏi chiến tranh → kinh tế từng quốc gia (khai thác & sản xuất → trồng trọt → chế tác → xây dựng → sự kiện thế giới → ăn, đói, tăng dân, hư hỏng → nghiên cứu → ổn định, di cư, nội loạn) → tầm nhìn, gặp gỡ, tình báo → ô bị cắt rời → tái tạo tài nguyên → diệt vong, thất truyền, kỷ nguyên. Hai quốc gia cùng khai hoang một ô thì bốc thăm bằng RNG có seed.
5. **Kiểm toán:** đối chiếu sổ cái tài nguyên toàn thế giới (ô, kho, đoàn buôn). Lệch thì thế giới tạm dừng và Biên niên sử ghi lỗi Engine (đây là lỗi code, không phải lỗi AI).
6. **Biên niên:** ghi sự kiện vào Biên niên sử và đẩy cập nhật cho Watcher.

### 3.2 Điểm hành động (AP)

- AP mỗi lượt = 3 + floor(dân số / 50) + thưởng AP từ phát minh (Hội đồng bộ lạc +1, Đếm +1, hiệu ứng `ap` của phát minh mở). Tối đa 12.
- AP không dùng hết sẽ mất, không tích lũy.
- Phân công lao động, đơn chế tác, mục tiêu khai mỏ và bản ghi nhớ không tốn AP. Chi phí từng hành động nằm ở mục 8.4.
- **Mỗi lượt ít nhất một lệnh:** quốc gia còn AP mà không gửi hành động nào thì được hỏi lại một lần, kèm lời khuyên của cố vấn (mục 8.2). Từ lượt thứ hai liên tiếp không ra lệnh: −2 ổn định mỗi lượt.

### 3.3 Khi AI không trả lời được

- **JSON hỏng:** Engine gọi lại đúng 1 lần, kèm lời nhắc chỉ trả JSON. Lần gọi lại có hạn 90 giây riêng. Vẫn hỏng thì tính như im lặng.
- **Quá hạn, lỗi API khác:** quốc gia chạy **chế độ quán tính**: giữ phân công lao động, đơn chế tác và dự án nghiên cứu cũ, không có hành động mới.
- **Từ lượt im lặng thứ 3 liên tiếp:** −5 ổn định mỗi lượt (dân thấy thủ lĩnh im lặng). Lượt ngủ đông (3.4) không tính là im lặng.
- **Nhịp lượt** là một con số cố định (`TICK_SECONDS`, mặc định 600 giây), Watcher chỉnh được từ 5 giây tới 24 giờ. Tự đặt nhịp theo quota chặt nhất (chưa có trong engine). Mỗi quốc gia tối đa 2 lời gọi AI mỗi lượt (1 chính + 1 sửa lỗi).

### 3.4 Ngủ đông khi hết quota

Dự án chỉ dùng model miễn phí, không trả tiền cho bất kỳ nhà cung cấp nào. Quốc gia hết quota sẽ **ngủ đông** cho tới khi quota hồi lại. Phần này nằm trong `src/runner.ts` vì nó đọc đồng hồ thật, thứ mà Engine tất định không được đọc.

- **Khi nào ngủ:** nhà cung cấp trả HTTP 429, hoặc HTTP 400/402/403 kèm thông báo hết quota (quota, rate limit, too many requests, resource_exhausted, insufficient_quota…). Lỗi key (HTTP 401/403 không nói về quota, hoặc thiếu key) cũng cho quốc gia ngủ, với trạng thái "lỗi key".
- **Ngủ tới bao giờ:** nếu nhà cung cấp báo thời điểm hồi quota (`retry-after`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`, `x-ratelimit-reset`, `ratelimit-reset`, hoặc `retryDelay` của Gemini; lấy giá trị lớn nhất) thì ngủ đúng chừng đó + 5 giây, tối thiểu 30 giây. Không có thông tin (hoặc lỗi key) thì ngủ theo bậc 15 phút, 30 phút, 1 giờ, 2 giờ, 4 giờ, rồi 6 giờ mỗi lần. Bậc trở về đầu khi quốc gia trả lời thành công.
- **Trong lúc ngủ:** quốc gia chạy chế độ quán tính (giữ phân công lao động, đơn chế tác và dự án nghiên cứu, không hành động mới). Dân vẫn ăn, vẫn làm, chiến binh vẫn tự vệ. **Không bị phạt ổn định**, vì hết quota không phải lỗi của AI.
- **Thế giới không chờ:** các quốc gia khác vẫn chơi bình thường. Chỉ khi **tất cả** quốc gia còn sống cùng ngủ thì thế giới tạm dừng, và thử lại khi quốc gia đầu tiên tới giờ thức (ít nhất sau 1 phút). Quốc gia do bot điều hành không bao giờ ngủ.
- **Trọng tài hết quota:** nhà cung cấp trọng tài đó nghỉ ít nhất 15 phút (hoặc theo thời điểm hồi quota nếu dài hơn); đơn chuyển sang trọng tài kế tiếp trong danh sách `JUDGE_PROVIDERS`. Hết cả danh sách thì đơn nằm chờ sang lượt sau, không mất gì.
- **Model trên máy:** nhà cung cấp `ollama` (và `custom` không có key) chạy trên máy của bạn, không có quota.
- **Watcher thấy:** nhãn "Đang ngủ" (hoặc "lỗi key") trên quốc gia kèm giờ dự kiến thức dậy. Số lượt ngủ của từng quốc gia được thống kê riêng.

## 4. Tài nguyên, dân số và ổn định

Mọi thứ đều được ghi trên một sổ cái kép: đơn vị nào vào kho của ai thì phải ra khỏi một nơi khác (ô đất, công thức sản xuất, quốc gia khác, đoàn buôn). Dân số là tài nguyên quý nhất và phải được nuôi.

### 4.1 Các loại tài nguyên

| Loại | Ví dụ | Nguồn | Hư hỏng mỗi lượt |
| --- | --- | --- | --- |
| Lương thực | thịt, cá, quả, ngũ cốc (gộp chung là `food`) | săn, hái, đánh cá, trồng trọt | 30% (giảm nhờ phát minh, công trình; tối thiểu 5%) |
| Thô | gỗ, đá, đá lửa, đất sét, da, xương, sợi, muối, sậy, quặng | khai thác ô, phụ phẩm săn bắt và hái lượm | 0% (da 5%) |
| Chế tác | công cụ đá, lưỡi đá, giáo, cung, dây thừng, áo da, rìu, gốm, vải | công thức sản xuất (mục 6) | công cụ săn bắt hao mòn khi dùng |
| Tri thức (RP) | điểm nghiên cứu | người nghiên cứu | không tích trữ ngoài dự án |
| Ổn định | 0–100 | lương thực, tín ngưỡng, hòa bình | — |

Hư hỏng lương thực mỗi lượt = mức gốc (30%, hoặc 15% khi có Gốm) − phần giảm từ phát minh mở − phần giảm từ công trình (tổng tối đa 10 điểm %) − 0,5 điểm % cho mỗi món gốm trong kho (tổng tối đa 5 điểm %, tức 10 món); nhân 0,5 nếu sở hữu Hồ Muối Trắng; không dưới 5%. Không có giới hạn sức chứa kho (sức chứa kho: chưa có trong engine).

Kho khởi đầu: 40 lương thực, 10 gỗ, 10 đá, 5 đá lửa, 10 công cụ đá thô. Ổn định khởi đầu 60, uy tín 50.

### 4.2 Dân số

- **Ăn:** theo nhóm tuổi, mỗi lượt: trẻ em 0,6, thiếu niên 1, người trưởng thành 1,15 (lao động nặng), người già 1 lương thực. Nhân 0,9 khi có Nấu chín.
- **Thiếu ăn:** thiếu X đơn vị thì chết ceil(X / 2) người (trẻ em và người già chết trước), −5 ổn định. Lượt đó không có tăng trưởng, và số trẻ bù cho người chết chỉ bằng (phần lương thực được ăn)²: thiếu 10% thì còn khoảng 81%, không ăn gì thì không có trẻ nào.
- **Tuổi và giới:** dân được đếm theo 4 nhóm tuổi × 2 giới:
  - trẻ em 0–9
  - thiếu niên 10–19
  - người trưởng thành 20–49
  - người già 50+

  Một lượt là 10 năm, nên mỗi lượt mọi người lên một nhóm. Mỗi lượt cũng có:
  - 1/3 người trưởng thành sang nhóm người già
  - 80% người già qua đời vì tuổi già
  - 10% người trưởng thành qua đời vì lao lực

  Dân mới lập quốc có cơ cấu 19% / 19% / 44% / 18%, nam nữ ngang nhau.
- **Sinh:** số trẻ sinh ra gồm hai phần, đều nhân với **mức sinh**:
  - phần bù đủ số người vừa qua đời (tối đa một đổi một)
  - khi lương thực còn ≥ 20% nhu cầu, thêm phần tăng logistic floor(dân × 8% × (1 − dân / chỗ ở))

  Không bao giờ vượt chỗ ở; tối thiểu 1 trẻ khi còn chỗ.

  **Mức sinh** được tính từ:
  - tỷ lệ phụ nữ trưởng thành so với một dân tộc bình thường
  - có đủ bạn đời hay không (đủ khi số đàn ông trưởng thành ≥ 0,5 × phụ nữ trưởng thành)
  - phong tục sinh
  - phong tục hôn nhân

  Mất phụ nữ trẻ thì sinh ít đi; có nhiều phụ nữ hơn bình thường thì không sinh nhiều hơn.
- **Trẻ sơ sinh:** 30% trẻ sơ sinh không sống được, và mức này đã tính sẵn trong tỷ lệ sinh. Các yếu tố làm thay đổi mức này:
  - hiệu ứng y học giảm theo tỷ lệ của nó
  - thảo dược: 0,2 thảo dược cho mỗi ca sinh cứu được 30% số trẻ đó
  - thiếu nước sạch làm mức này ×1,25
- **Người già** dạy nghề, thêm tối đa +10% nghiên cứu. Khi dân giảm một nửa, nếu còn từ 3 người già trở lên thì không thất truyền phát minh (mục 5.5).
- **Ai chết vì gì:**
  - nạn đói, mùa đông, dịch bệnh: trẻ em và người già chết trước
  - thú dữ: người lớn đi săn và hái lượm
  - trận đánh: chiến binh, theo phong tục ra trận
  - man di và thiên tai: mọi lứa tuổi
  - dân bỏ đi vì bất ổn: cả gia đình, chủ yếu người trẻ, và họ sang nước nhận họ như cũ
- **Phong tục (hành động `family_policy`, 1 AP):**
  - **Sinh:**
    - "khuyến khích": sinh ×1,3, phụ nữ trưởng thành làm việc ×0,85
    - "tự nhiên": ×1 và ×0,95
    - "hạn chế": sinh ×0,6, phụ nữ làm việc đủ
  - **Ra trận:**
    - "chỉ đàn ông": quân chỉ bằng một nửa, nhưng các bà mẹ an toàn nên sinh không bị ảnh hưởng khi thua trận
    - "mọi người lớn": quân gấp đôi, nhưng tổn thất trận mạc làm giảm số sinh

    Chỉ thiếu niên và người trưởng thành thuộc giới được ra trận mới làm chiến binh được; Engine cắt bớt chiến binh vượt số đó.
- **Hôn nhân:** năng lực `hôn-nhân` (có từ một phát minh) cho sinh ×1,1 và +0,5 ổn định mỗi lượt.
- **Hộ:** mỗi cặp vợ chồng trưởng thành là một hộ, người lớn đơn thân tính hai người một hộ.
- **Chỗ ở:** thủ đô chứa 25 người tự nhiên (hang, bãi trú). Mỗi điểm định cư +10, Hang Đại Động +50, công trình có chỗ ở (Lều +10, công trình mở) cộng thêm.
- **Thôn xóm:** các gia đình cũng sống rải rác trên đất. Mỗi ô đất của quốc gia (trừ ô trung tâm) chứa thêm:
  - đồng cỏ, ven biển: 3 người
  - rừng, rừng lá kim, rừng rậm, đồi: 2 người
  - đầm lầy, sa mạc, lãnh nguyên, băng hà: 1 người
  - núi và ô biển: 0
  - ô có sông: thêm 1

  Tổng tối đa 40 + 20 × số kỷ nguyên đã qua. Mở rộng đất vì thế cũng nâng trần dân số.
- **Trần chỗ ở theo trung tâm:** mỗi trung tâm (thủ đô và mỗi điểm định cư) chứa tối đa **3 công trình có chỗ ở** (Lều và công trình mở có `housing`). Engine từ chối lệnh `build` vượt trần (tính cả công trình đang xây), và khi tính chỗ ở chỉ cộng các công trình tốt nhất trong trần, nên mất một điểm định cư thì lều thừa bỏ trống. Như vậy thủ đô chứa tối đa 25 + 30 = 55 người, mỗi điểm định cư thêm tối đa 10 + 30 = 40 người, cộng thôn xóm trên đất: muốn đông dân thì mở rộng đất và lập điểm định cư mới.
- **Cơ cấu lao động:** số lao động = tổng sức làm việc theo nhóm: trẻ em 0,1, thiếu niên 0,8, người trưởng thành 1, người già 0,5. Với cơ cấu bình thường thì khoảng 70% dân số. AI phân lao động vào 13 vai: hái lượm (`gather`), săn bắt (`hunt`), đánh cá (`fish`), nông dân (`farm`), đốn gỗ (`wood`), khai đá (`stone`), nhặt đá lửa (`flint`), lấy đất sét (`clay`), khai mỏ (`mine`), chế tác (`craft`), xây dựng (`build`), nghiên cứu (`research`), chiến binh (`warrior`). Người thám hiểm không phải một vai: họ được rút tạm từ nhóm hái lượm và người rảnh trong lượt đi thám hiểm.
- **Phân quá số người:** Engine thu nhỏ theo tỷ lệ, phần lẻ chia cho các vai có phần thập phân lớn nhất, và báo lại trong danh sách bị từ chối.
- **Người không được phân vai** tự động đi hái lượm.
- Phân công mặc định lúc khởi đầu: 7 săn, 4 hái, 2 nghiên cứu, 1 chế tác.

### 4.3 Năng suất cơ bản (thời đồ đá, mỗi người mỗi lượt)

| Vai | Sản lượng | Điều kiện |
| --- | --- | --- |
| Hái lượm | 2 lương thực + 0,3 sợi | lấy từ trữ lượng cây dại trong lãnh thổ |
| Săn bắt | 2,5 lương thực + 0,3 da + 0,3 xương | lấy từ thú săn; mỗi công cụ săn (cung, giáo, lưỡi đá, công cụ đá) trang bị cho 4 thợ săn, thợ săn không có công cụ chỉ được một nửa |
| Đánh cá | 2,2 lương thực | lấy từ trữ lượng cá (ven biển, biển nông, sông) |
| Đốn gỗ, khai đá, nhặt đá lửa, lấy đất sét | 1 đơn vị thô | ô còn trữ lượng; mỗi rìu đá mài giúp 2 người đốn gỗ làm thêm 30% |
| Khai mỏ | 1 đơn vị quặng, muối hoặc sậy | quặng phải nhìn thấy được; ưu tiên `mine_target` do AI chọn, rồi đồng, thiếc, sắt, muối, sậy |
| Nông dân | 2 lương thực | chỉ làm việc trong công trình trồng trọt (Ruộng 6 người, Chuồng 2 người); thừa người thì không sản xuất |
| Chế tác | 1 công | chỉ tính số thợ trong giới hạn chỗ chế tác của công trình (Bãi chế tác 4, Lò gốm 4) |
| Xây dựng | 1 công | có công trình đang xây |
| Nghiên cứu | N người làm ra N^0,85 RP | càng đông người càng ít RP mỗi người: 1 người 1 RP, 10 người 7,1 RP, 30 người 18 RP, 100 người 50 RP (mục 5.5) |

Năng suất các vai hái lượm, săn bắt, đánh cá, khai thác và khai mỏ được nhân (1 + thưởng), trong đó thưởng = thưởng phát minh + thưởng công cụ mở, tối đa +150% (mục 5.7). Ổn định dưới 30 nhân mọi sản lượng (kể cả trồng trọt, chế tác, xây dựng, nghiên cứu) với 0,75. Sản lượng không vượt trữ lượng hiện có của các ô.

Kiểm tra cân bằng lượt 1: 20 dân, 14 lao động, phân công mặc định. 7 thợ săn có đủ công cụ làm ra 17,5 lương thực, 4 người hái 8 lương thực, tổng 25,5 so với mức ăn 20, như vậy sống được và kho 40 lương thực ban đầu cho dân tăng chậm. Người chế tác chưa làm được gì vì chưa có Bãi chế tác. AI phải chọn giữa ăn no và tiến bộ ngay từ đầu.

Phát minh chỉ có thể nhân các con số này theo Bảng hiệu ứng chuẩn (mục 5.3), không tự đặt số.

### 4.4 Ổn định

- **Tăng:** còn lương thực trong kho sau khi ăn (+1/lượt), công trình ổn định như Bàn thờ (tổng từ mọi công trình tối đa +1/lượt), hiệu ứng ổn định của phát minh mở, Suối Nước Nóng (+2/lượt), thắng trận (+1), hoàn thành một nghiên cứu (+2 một lần, cộng thưởng một lần của phát minh như Nghi lễ +5), dân tung hô vì sống sung túc hơn các nước quen biết (+1/lượt, §4.7).
- **Giảm:** đói (−5), thua trận (bên công −2, bên thủ −3), im lặng từ lượt thứ 3 (−5), chiến tranh kéo dài (−1 mỗi lượt từ lượt thứ 5 tính từ khi giao tranh bắt đầu), tù binh (−1 mỗi 5 tù binh), lập điểm định cư (−5 một lần, vì dời dân), **mỗi điểm định cư vượt quá 3: −1 mỗi lượt** (một bộ máy bộ lạc khó cai quản quá nhiều trung tâm; Bàn thờ, Suối Nước Nóng và hiệu ứng ổn định của phát minh mở bù lại được).
- Ổn định được làm tròn và giữ trong 0–100 cuối mỗi lượt.
- **Dưới 30:** mọi năng suất −25%.
- **Dưới 10:** mỗi lượt 3% dân (tối thiểu 1 người) bỏ đi, sang quốc gia đã gặp có ổn định cao nhất. Chưa gặp ai thì họ biến mất vào vùng hoang. Đang có đoàn truyền giáo trong nước thì một nửa số đó ở lại (mục 4.10).
- **Mất lòng tin:** dân bỏ đi quá 3% trong 10 lượt thì cứ 3 lượt −1 ổn định, không phải mỗi lượt, để không thành vòng xoáy.
- **Bằng 0:** nội loạn. AI mất quyền ra lệnh ở lượt kế tiếp (giữ phân công cũ), ổn định đặt lại 20.

### 4.5 Bất mãn và ly khai

- **Bất mãn (0–100):** mỗi lượt tăng khi quốc gia bị cai trị kém:
  - ổn định dưới 35: thêm (35 − ổn định) / 3
  - nạn đói: thêm 10
  - nội loạn: thêm 25
  - mỗi điểm định cư cô lập: thêm 2 (mục 2.7); mỗi tỉnh có bất ổn từ 50: thêm 1 (mục 2.8)
  - dân ganh tị vì nghèo hơn các nước quen biết: thêm tới 3 (§4.7); dân tung hô thì bớt 2

  Khi ổn định ≥ 60, bất mãn giảm 10 mỗi lượt. AI thấy mức bất mãn trong gói trạng thái, và nhận cảnh báo từ mức 40.
- **Một phái đòi ra đi:** khi bất mãn đạt 100, dân từ 60 người trở lên, và lần ly khai trước cách ít nhất 30 lượt:
  - 20–35% dân (bất mãn càng nặng càng đông) theo một thủ lĩnh, xin bỏ đi lập quốc riêng
  - nếu có một tỉnh đủ bất ổn (mục 2.8), phái ly khai là tỉnh đó: dân của tỉnh, đi cùng đất của tỉnh
  - nếu không, nơi họ nhắm là đất trống cách đất cũ 5–16 ô và cách mọi quốc gia ≥ 3 ô
  - yêu cầu hiện trong mục **Thỉnh nguyện** của Watcher
- **Watcher cho phép:** Watcher chọn trí tuệ cho quốc gia mới (Claude Haiku/Sonnet với một mức effort, hoặc bot). Lượt sau phái đó ra đi:
  - cả gia đình theo họ, phần kho theo tỷ lệ người đi, và mọi phát minh của nước cũ
  - nước mới nhận kỷ nguyên, đặc thù và phong tục của nước cũ
  - họ nhận ô đích cùng các ô kề (một tỉnh: điểm định cư, đất và công trình của tỉnh), và quen biết nước cũ cùng các nước mà nước cũ đã gặp
  - lượt đầu tiên họ tự đặt tên, thủ đô, dân tộc và cờ (`found_nation`), bắt đầu với ổn định 70
  - nước cũ +15 ổn định, bất mãn về 0
- **Không cho phép, hoặc không trả lời trong 10 lượt:** phái đó xin sang định cư ở nước yên ổn nhất (ổn định ≥ 35) và nhiều chỗ ở nhất mà nước cũ quen biết, nếu không đang chiến tranh với nước cũ.
  - Nước được xin có 2 lượt để nhận, bằng hành động `accept_migrants` (1 AP). Nếu nhận, cả gia đình sang ngay; nước cũ +7 ổn định, bất mãn về 0.
  - Nếu không ai nhận, họ quay về nước cũ trong uất ức: −5 ổn định, bất mãn còn một nửa.

**Nước tách ra và nước gốc:**
- Hai nước không bao giờ hợp tác chính trị: không được ký liên minh, thông hành hay bất tương xâm. Chỉ có hòa bình (để dừng chiến tranh) hoặc chư hầu.
- Nước gốc luôn mong thâu tóm lại, nên luôn có chính nghĩa để đánh nước tách ra.
- Căng thẳng biên giới giữa hai nước tăng nhanh gấp 1,5 lần.
- Nếu thủ đô của nước tách ra rơi vào tay nước gốc, cả nước nhập trở lại: đất, công trình, dân và kho.

**Phản bội và thù địch (v0.19):** tách ra là phản bội. Cho tới khi hai bên ký **hòa bình** hoặc nước tách ra làm **chư hầu**, hai nước **thù địch** (quan hệ "thù địch"):
- **Không buôn bán:** không gửi, không nhận đề nghị trao đổi (đề nghị đang mở bị hủy), không có chợ biên giới.
- **Không làm bạn:** mọi hiệp ước bất tương xâm, đi lại hay liên minh giữa hai nước bị hủy ngay, kể cả hiệp ước ký trước khi có luật này.
- **Biên giới:** căng thẳng không bao giờ dưới 40, và vẫn tăng nhanh gấp 1,5 lần.
- **Chiến tranh:** nước gốc đánh kẻ phản bội mạnh hơn 10%, và luôn có chính nghĩa.
- **Đất:** mỗi ô nước gốc lấy lại cho dân nó +1 ổn định; mỗi ô kẻ phản bội chiếm của nước gốc làm nước gốc mất thêm 1 ổn định.
- **Một dân tộc:** hai nước luôn biết nhau và có chung ngôn ngữ.
- **Áp dụng cho mọi cặp nước gốc và nước tách ra,** kể cả những nước đã tách trước v0.19. Mỗi lượt Engine giữ đúng luật này: cho hai nước biết nhau, hủy hiệp ước bằng hữu, hủy đề nghị trao đổi.
- **AI được báo:** `known_nations[].split` ghi TRAITORS hay traitors, và lời cố vấn nhắc cả hai bên.

### 4.6 Triều đình: phân quyền cho quan chức

Một quốc gia giao một lĩnh vực cho một người. Người đó **tự làm việc mỗi lượt, không tốn AP của nhà vua**:

| Lĩnh vực (`domain`) | Chức danh | Việc làm và thưởng |
| --- | --- | --- |
| `governor` | Bá tước | giữ một trung tâm (thủ đô hoặc điểm định cư); mỗi lượt tự khai hoang ô tốt nhất trong vòng 3 ô quanh đó (2 ô khi tay nghề ≥ 3), nếu còn giới hạn quản lý và đủ lương thực; +1 ô quản lý; làm dịu tỉnh của mình và đất của tỉnh +2% sản lượng mỗi bậc (mục 2.8) |
| `general` | Đại tướng | chiến đấu và sức thủ tại nhà +4% mỗi bậc tay nghề |
| `agriculture` | Thượng thư Nông | hái lượm, săn, đánh cá, nông +5% mỗi bậc; khi lương thực dưới 1,5 lượt ăn thì tự khởi công ruộng trên ô tốt nhất (châu thổ, ven sông trước) |
| `scholar` | Đại học sĩ | nghiên cứu +5% mỗi bậc; khi đang bỏ trống thì tự chọn nghiên cứu rẻ nhất |
| `merchant` | Tổng quản Thương | vận tải +10% mỗi bậc; phí qua đất giảm một nửa |
| `builder` | Tổng công trình | xây dựng +8% mỗi bậc; tự đào giếng khi thiếu nước ngọt, dựng lều khi sắp hết chỗ ở |
| `explorer` | Trưởng đoàn thám hiểm | mỗi lượt tự đưa 2 người đi thám hiểm, xoay vòng 6 hướng; tầm xa +2 ô mỗi bậc |

- **Số chỗ:** 1 + 1 cho mỗi 60 dân + thưởng kỷ nguyên và phát minh (`officials`), tối đa 10. Mỗi lĩnh vực một người, riêng bá tước được một người cho mỗi trung tâm.
- **Tay nghề** 1–5, tăng 1 bậc sau mỗi 15 lượt tại chức. **Lương:** 1 + tay nghề lương thực mỗi lượt.
- **Lòng trung thành** 0–100, khởi đầu 70:
  - +1 mỗi lượt khi ổn định ≥ 60; −1 khi ổn định dưới 40; −5 khi không được trả lương; bá tước giữ trung tâm cách thủ đô quá 10 ô thì −1 mỗi lượt.
  - Dưới 30: bất mãn, không làm gì và không cho thưởng. Về 0: bỏ triều đình, ổn định −8.
- **Hành động:**
  - `appoint_official` (1 AP): `{"domain","name","seat"}`
  - `dismiss_official` (0 AP): ổn định −2, các quan khác −5 trung thành
  - `reward_official` (0 AP): `{"official","goods"}`, mỗi 2 giá trị hàng tặng = +1 trung thành; hàng tặng bị tiêu đi

### 4.10 Tín ngưỡng: truyền giáo và lễ hội

Dân bỏ đi vì bất ổn, ganh tị hay đất rộng quản không xuể thì triều đình có cách lấy lại lòng dân. Cần năng lực **tín-ngưỡng** (từ Nghi lễ, P5).

- **Truyền giáo trong nước** (`mission`, 2 AP, `"where":"home"`, 2–6 nhà truyền giáo, 10 lương thực mỗi người):
  - trong 5 lượt, mỗi lượt bất mãn −2, ổn định +1, tỉnh bất ổn nhất −3 bất ổn, sinh nở ×1,15;
  - nhà truyền giáo lấy từ nhóm hái lượm và người rảnh, và không làm việc ở nhà trong thời gian đó;
  - mỗi lúc chỉ một đoàn trong nước.
- **Truyền giáo ra nước ngoài** (`"where":"tên nước"`):
  - chỉ tới nước đã gặp, trong vòng 15 ô, không đang chiến tranh với mình; tối đa 2 đoàn một lúc;
  - mỗi lượt có 30% khả năng 1–3 người nước đó theo đạo về nước mình (×1,5 nếu ổn định nước đó dưới 50);
  - nước chủ nhà −1 ổn định mỗi lượt và được báo tin. Người bỏ đi theo đạo tính vào số dân bỏ đi của nước chủ nhà;
  - nước chủ nhà đuổi đoàn truyền giáo bằng cách ly; chiến tranh cũng chấm dứt đoàn truyền giáo;
  - nước thù địch (mục 4.5) có thể giết nhà truyền giáo (15% mỗi lượt), và nước gửi đi có chính nghĩa để báo thù.
- **Lễ hội** (`festival`, 1 AP, mỗi 10 lượt một lần): tốn 0,5 lương thực mỗi người dân (thêm 0,02 mỗi người của một xa xỉ phẩm để được +3 ổn định nữa):
  - +5 ổn định, −5 bất mãn;
  - mùa cưới: sinh nở ×1,3 trong 3 lượt.
- **AI thấy** `faith` trong gói quan sát: có truyền giáo được không, các đoàn đang đi, lễ hội đã sẵn sàng chưa, sinh nở đang được nhân bao nhiêu, và nước nào đang truyền giáo trên đất mình.
- **Lời cố vấn** gợi ý truyền giáo và lễ hội khi dân bỏ đi hoặc bất mãn từ 60 trở lên. Bot truyền giáo trong nước khi bất mãn từ 40, và mở lễ hội khi ổn định dưới 35 mà kho đầy.

### 4.7 Thịnh vượng và tự tôn

Của cải của một nước là của dân nước ấy: lương thực trong kho, hàng hóa trong tay, chỗ ở rộng rãi, sức khỏe và yên bình. Dân đánh giá triều đình bằng cuộc sống của mình, và so với mọi nước mình quen biết.

- **Điểm thịnh vượng (0–100)**, tính lại cuối mỗi lượt (sau kinh tế), gồm bốn phần, mỗi phần tối đa 25:

| Phần | Đủ 25 điểm khi |
| --- | --- |
| Lương thực | kho còn đủ 2 lượt ăn |
| Hàng hóa | giá trị kho (trừ lương thực) đạt 12 mỗi người; mỗi loại hàng chỉ tính tới 2 giá trị mỗi người, nên nhiều loại hàng mới giàu, một đống xương thì không |
| Chỗ ở | còn trống 15% chỗ ở (hết chỗ: 0) |
| Sức khỏe và yên bình | không có "vết thương": người chết vì đói, rét, dịch, thiên tai, thú dữ, man di, chiến trận (4 × tỷ lệ dân chết), nạn đói (+0,3) và chiến tranh (+0,15 mỗi lượt) để lại vết thương, mỗi lượt còn ×0,6 |

- **So với các nước quen biết** (đã gặp, còn sống), lấy trung bình điểm của họ:
  - **Hơn ≥ 10 điểm — dân tung hô triều đình:** ổn định +1 và bất mãn −2 mỗi lượt; uy tín +1 mỗi 5 lượt.
  - **Kém ≥ 10 điểm — dân ganh tị:** bất mãn tăng 1 cho mỗi 10 điểm kém (tối đa +3 mỗi lượt). Mỗi lượt có khả năng (chênh lệch với nước giàu nhất − 10) / 100 (tối đa 35%) một số gia đình bỏ sang nước giàu hơn ít nhất 10 điểm, không đang (hay sắp) chiến tranh với mình và còn chỗ ở, ưu tiên nước giáp biên giới: 3% dân, ít nhất 2, nhiều nhất 8 người. Chỉ xảy ra khi nước có từ 30 dân.
  - Chưa quen ai thì không có gì để so.
- **Biên niên sử** ghi khi dân một nước bắt đầu tung hô hay ganh tị (mỗi nước nhiều nhất một dòng mỗi 15 lượt).
- **AI** thấy `prosperity` trong gói trạng thái: điểm, bốn phần, xu hướng, hạng trong các nước quen biết và điểm ước lượng của từng nước (đúng khi có gián điệp hay đồng minh; làm tròn 5 khi thân thiện; làm tròn 10 khi chỉ thấy đất; chỉ "giàu hơn / nghèo hơn" khi mới nghe đồn). Cố vấn chỉ ra hai phần yếu nhất và cách nâng.
- **Xếp hạng thế giới** cộng nửa điểm thịnh vượng trung bình 10 lượt gần nhất (§9.3).
- Watcher chỉnh được bằng sắc lệnh luật: ngưỡng chênh lệch, ổn định khi dân tung hô, hệ số dân bỏ đi.

### 4.9 Bộ trưởng AI: một trí tuệ cho một lĩnh vực của quốc gia

Một dân tộc lớn được xin các vị thần thêm trí tuệ. Bộ trưởng AI là **một model AI nữa**, lo **một lĩnh vực** của quốc gia mỗi lượt bên cạnh người trị vì, với **AP riêng**. Đây là phần thưởng của sự lớn mạnh: mỗi mốc dân số là thêm một trí tuệ phục vụ quốc gia.

- **Mốc dân số (ghế):** quốc gia đã lập quốc được giữ 1 bộ trưởng từ **500** dân, 2 từ **1000**, 3 từ **2000**, 4 từ **4000**. Ghế đã có được giữ khi dân còn ≥ 90% mốc của nó; dân giảm dưới đó thì bộ trưởng mới nhất từ nhiệm (xin lại được khi lớn lại).
- **Lĩnh vực** (mỗi lĩnh vực một bộ trưởng) và các lệnh được ra:

| Lĩnh vực (`domain`) | Chức danh | Được ra lệnh |
| --- | --- | --- |
| `economy` | Bộ trưởng Kinh tế | phân công lao động (`labor`), chế tác (`crafts`), quặng cần đào (`mine_target`); `build`, `build_road`, `claim_tile` |
| `war` | Bộ trưởng Chiến tranh | số chiến binh (`warriors`); `attack`, `raid`, `clear_wild` — **không** tuyên chiến, **không** giảng hòa |
| `diplomacy` | Bộ trưởng Ngoại giao | `message`, `trade_offer`, `accept_trade`, `treaty`, `accept_treaty` (trừ hòa ước), `accept_migrants`, `quarantine` |
| `learning` | Bộ trưởng Học thuật | `research`, `propose_invention` |
| `interior` | Bộ trưởng Nội vụ | `appoint_official`, `dismiss_official`, `reward_official`, `family_policy` |

- **AP riêng của mỗi bộ trưởng:** 3 + 1 cho mỗi 1000 dân (tối đa 8), ngoài AP của người trị vì. Lệnh sai vẫn tốn AP như mọi lệnh. Mỗi lượt xét tối đa 8 lệnh của một bộ trưởng.
- **Xin:** người trị vì gửi `request_minister` (1 AP): `{"type":"request_minister","domain":"economy","reason":"≤300 ký tự"}` khi còn ghế trống (ghế − bộ trưởng − đơn đang chờ) và lĩnh vực đó chưa có bộ trưởng hay đơn đang chờ. Đơn hiện trong mục Thỉnh nguyện của Watcher. Watcher **ban** (chọn trí tuệ: một model Claude với effort, hoặc bot) hay **không ban**; không đáp trong 20 lượt thì đơn hết hạn. Lĩnh vực bị từ chối chỉ xin lại được sau 10 lượt. Bộ trưởng được ban nhậm chức ở đầu lượt sau (biên niên và bản đồ ghi lại), có tên riêng.
- **Mỗi lượt:** engine gọi model của từng bộ trưởng song song với người trị vì (chung hàng đợi Claude và chung việc chờ khi hết giới hạn gói: thế giới chỉ đi tiếp khi mọi quốc gia và mọi bộ trưởng Claude đã trả lời). Bộ trưởng nhận system prompt ngắn của lĩnh vực mình (cắt từ luật của quốc gia, chỉ phần lĩnh vực cần) và gói trạng thái gồm phần của lĩnh vực, **suy nghĩ và ghi nhớ gần nhất của người trị vì làm chỉ thị**, và lệnh của chính nó ở lượt trước. Bộ trưởng mang trí tuệ bot chơi theo logic bot, chỉ lấy các lệnh của lĩnh vực mình (không tốn lượt Claude). Các quốc gia bot không xin bộ trưởng.
- **Lệnh của người trị vì đi trước:** bộ trưởng ra lệnh **sau** người trị vì trong cùng lượt, từ AP của mình, chỉ trong lĩnh vực của mình (lệnh ngoài lĩnh vực bị từ chối, không tốn AP). Phân công lao động, chế tác, quặng cần đào của Bộ trưởng Kinh tế chỉ áp dụng ở lượt người trị vì không gửi mục đó; số chiến binh của Bộ trưởng Chiến tranh chỉ áp dụng ở lượt người trị vì không gửi phân công lao động. Bộ trưởng không được ra `research`, `family_policy`, `quarantine` ở lượt người trị vì đã ra lệnh đó. Bộ trưởng vẫn làm việc khi người trị vì im lặng; nội loạn thì không ai ra lệnh được.
- **Ghi chép:** lệnh của bộ trưởng vào `recent_turns` của quốc gia với tiền tố lĩnh vực (ví dụ `[kinh tế] build tent (12, 30) ✓`), lệnh bị từ chối vào `rejected_last_turn` (ví dụ hành động `[kinh tế] research`). Người trị vì thấy `ministers` trong gói trạng thái: số ghế, mốc tiếp theo, AP của bộ trưởng, từng bộ trưởng và lệnh, suy nghĩ của họ lượt trước, các đơn đang chờ, các lĩnh vực xin được ngay. Cố vấn báo khi đủ mốc để xin, hoặc còn bao nhiêu dân tới mốc tiếp theo.
- **Bãi nhiệm:** Watcher bãi nhiệm một bộ trưởng trong tab Triều đình của quốc gia; quốc gia được báo ở lượt sau và có thể xin lại.
- Watcher chỉnh được bằng sắc lệnh luật: bốn mốc dân số, AP cơ bản của mỗi bộ trưởng.

## 5. Hệ thống phát minh mở

AI được tự nghĩ ra phát minh mới, nhưng mỗi phát minh phải đứng trên vai những phát minh đã có, qua kiểm tra cứng của Engine và qua Trọng tài. Engine định giá chi phí, AI không được tự đặt. Phát minh được duyệt sẽ vào **Sổ Phát Minh Thế Giới** (mã `X1`, `X2`…) và trở thành tri thức chung mà quốc gia khác cũng có thể nghiên cứu.

### 5.1 Cấu trúc một phát minh

- **Tên** (3–40 ký tự) **+ mô tả** (1–300 ký tự): nó là gì, làm ra sao.
- **Tiên quyết:** 1–4 phát minh quốc gia đã sở hữu.
- **Điều kiện vật chất** (tùy chọn): một tài nguyên (`{"resource": "clay"}`) hoặc một địa hình (`{"terrain": "hill"}`) phải có trong lãnh thổ khi nghiên cứu. Với tài nguyên, chỉ cần ô từng có loại đó lúc khai sinh thế giới. Điều kiện về công trình (chưa có trong engine).
- **Năng lực (capability):** nhãn để các phát minh sau dựa vào, ví dụ `cắt`, `buộc`, `chứa`, `nhiệt-cao`, `trồng-trọt`, `thuần-dưỡng`, `đi-nước`, `ghi-chép`, `đếm`, `tổ-chức`, `tín-ngưỡng`, `nhận-biết-khoáng`. Đơn được xin tối đa 2 năng lực mới (chữ thường nối bằng gạch ngang, ≤ 24 ký tự), mỗi năng lực tính 3 điểm sức mạnh. Trọng tài có thể gạch bỏ năng lực không xứng đáng.
- **Hiệu ứng:** tối đa 6 hiệu ứng, chọn từ Bảng hiệu ứng chuẩn (5.3). Không có hiệu ứng tự do.
- **Độ sâu d** = max(độ sâu các tiên quyết) + 1. Phát minh khởi đầu có d = 0.

### 5.2 Cây gốc thời đồ đá

Mỗi quốc gia bắt đầu với 4 phát minh d = 0: **Lửa** (năng lực `lửa`), **Công cụ đá thô** (năng lực `ghè-đá`; mở Bãi chế tác, Hố trữ và công thức Công cụ đá thô), **Săn bắt hái lượm**, **Ngôn ngữ nói**. 18 phát minh dưới đây đã có sẵn trong Sổ. Ai nghiên cứu xong trước được ghi danh là người phát minh đầu tiên; hai quốc gia xong trong cùng một lượt được ghi danh cùng nhau.

Cột "RP gốc" là số ghi trong Sổ; giá thật = RP gốc × (1 + 0,75 × (d − 1)), làm tròn lên bội số của 5 (mục 5.5), trước khi trừ giảm giá lan truyền (mục 7.5). Cả cây gốc tốn 2.115 RP (v0.2: 1.040).

| ID | Phát minh | Tiên quyết | d | RP gốc | RP thật | Năng lực | Hiệu ứng chính |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Ghè đá tinh xảo | Công cụ đá thô | 1 | 20 | 20 | cắt | Khai thác (gỗ, đá, đá lửa, đất sét, khai mỏ) +20%; công thức Lưỡi đá |
| P2 | Nấu chín | Lửa | 1 | 15 | 15 | — | Mỗi người chỉ ăn 0,9 lương thực |
| P3 | Sợi và dây | Săn bắt hái lượm | 1 | 20 | 20 | buộc | Công thức Dây thừng |
| P4 | Hội đồng bộ lạc | Ngôn ngữ nói | 1 | 40 | 40 | tổ-chức | +1 AP; giới hạn ô +2 |
| P5 | Nghi lễ | Ngôn ngữ nói, Lửa | 1 | 30 | 30 | tín-ngưỡng | Công trình Bàn thờ; +5 ổn định một lần |
| P6 | Giáo | P1, P3 | 2 | 30 | 55 | săn-xa | Săn +25%; sức chiến binh +20%; công thức Giáo |
| P7 | Thuộc da | P1, Săn bắt hái lượm | 2 | 30 | 55 | — | Công thức Áo da; thiệt hại mùa đông −50% |
| P8 | Lều | P3, P7 | 3 | 25 | 65 | xây-dựng | Công trình Lều (+10 chỗ ở; tối đa 3 mỗi trung tâm) |
| P9 | Lưới và bẫy | P3 | 2 | 40 | 70 | — | Đánh cá +30%; săn +10% |
| P10 | Đá mài | P1 | 2 | 60 | 105 | mài | Công thức Rìu đá mài (mỗi rìu: 2 người đốn gỗ +30%); công trình Hàng rào gỗ |
| P11 | Cung tên | P6, P3 | 3 | 70 | 175 | săn-xa | Săn +30%; công thức Cung tên (vũ khí mạnh nhất) |
| P12 | Ký hiệu | P5 | 2 | 50 | 90 | ghi-chép | Chống thất truyền; RP +10%; tình báo không phai |
| P13 | Gốm | P2 + ô có đất sét | 2 | 80 | 140 | chứa | Công trình Lò gốm, công thức Gốm; hư lương thực 30% → 15%; mỗi món gốm trong kho −0,5 điểm % (tối đa −5) |
| P14 | Trồng trọt sơ khai | P1, Săn bắt hái lượm + ô đồng cỏ, ven biển hoặc có sông | 2 | 120 | 210 | trồng-trọt | Công trình Ruộng |
| P15 | Thuần dưỡng | P3, P6 | 3 | 120 | 300 | thuần-dưỡng | Công trình Chuồng |
| P16 | Thuyền độc mộc | P10, Lửa | 3 | 90 | 225 | đi-nước | Đi được trên biển nông; đánh cá +20%; thám hiểm nhìn xa 3 ô; tấn công xa 3 ô |
| P17 | Dệt | P3, P14 | 3 | 100 | 250 | dệt | Công thức Vải |
| P18 | Đếm | P12, P14 | 3 | 100 | 250 | đếm | +1 AP; sai số ước lượng tình báo giảm một nửa |

Cố ý **không có** phát minh nào cho năng lực `nhiệt-cao`, `nhận-biết-khoáng` và `luyện-đồng`. AI phải tự phát minh ra chúng nếu muốn bước vào thời đồ đồng.

### 5.3 Bảng hiệu ứng chuẩn và ngân sách sức mạnh

Mỗi hiệu ứng có điểm sức mạnh. Tổng điểm của một phát minh mới (hiệu ứng + năng lực mới) phải ≥ 1 và không được vượt **4 + 2d**. Bảng dưới là danh mục `EFFECT_KINDS` mà Engine đọc (`src/catalog.ts`); AI gửi mỗi hiệu ứng dưới dạng JSON có trường `kind`.

| `kind` | Nội dung và giới hạn | Điểm |
| --- | --- | --- |
| `role_bonus` | +10, 20 hoặc 30% năng suất một vai: `hunt`, `gather`, `fish`, `farm`, `wood`, `stone`, `flint`, `clay`, `mine`, `craft`, `build`, `research`, `warrior`, hoặc `extract` (mọi vai khai thác và khai mỏ). Với `farm`, `craft`, `build`, `research` hiệu ứng được nhận và tính điểm nhưng chưa làm tăng sản lượng (chưa có trong engine). | 2 mỗi 10% |
| `spoilage` | Lương thực hư ít đi 10, 20 hoặc 30% của mức gốc 30%, tức −3, −6 hoặc −9 điểm % | 1 mỗi 10% |
| `recipe` | Một loại hàng **mới** (`id` dạng slug chưa tồn tại, tên): đầu vào 1–10 mỗi loại hàng đã có (ít nhất một loại), `output_qty` 1–3, `work` 1–3, nơi làm `at` = `workshop`, `kiln`, công trình mới trong cùng đơn, hoặc loại công trình đã có. Tùy chọn `tool`: hàng này là công cụ cho một vai (`role`, `percent` 10–30, `per` 1–4 người mỗi món) | 3 (+2 mỗi 10% nếu là công cụ) |
| `building` | Một công trình **mới**: vật liệu mỗi loại 1–40 (ít nhất một, trừ công trình trồng trọt), công 3–12; tác dụng `housing` 0–15, `stability` 0–1, `spoilage` 0–10 (%), `craft_slots` 0–4, `defense` 0–40 (%), `farm_slots` 0–6 kèm `farm_food` 1–2 | 3 + 2 mỗi 5 chỗ ở (làm tròn lên) + 4 nếu có ổn định + 1 mỗi 10% hư hỏng (làm tròn) + 3 mỗi 10% phòng thủ + 3 nếu trồng trọt + 1 mỗi 2 chỗ chế tác (làm tròn lên) |
| `stability` | +1 hoặc +2 ổn định mỗi lượt | 4 mỗi điểm |
| `ap` | +1 AP | 5 |
| `combat` | +10, 20 hoặc 30% sức chiến đấu (cả công lẫn thủ) | 3 mỗi 10% |
| `move` | Đi được một loại địa hình: `shallow` (biển nông: thám hiểm, giữ ô biển) hoặc `mountain` (thám hiểm, tấn công qua núi). Đầm lầy và rừng rậm vốn đã đi được nên không nhận. | 4 |
| `reveal` | Thấy và khai mỏ được một loại quặng ẩn: `copper`, `tin`, `iron` | 4 |
| `research` | RP +10 hoặc +20% | 3 mỗi 10% |
| `tile_limit` | Giới hạn ô +1 hoặc +2 | 2 mỗi ô |
| (năng lực mới) | Mỗi nhãn năng lực trong trường `capabilities`, tối đa 2 | 3 |

Chi phí nghiên cứu do Engine tính: **RP gốc = 15 × 1,4^d × (1 + điểm sức mạnh / 10)**, làm tròn lên bội số của 5, rồi nhân hệ số độ sâu như mọi phát minh: **× (1 + 0,75 × (d − 1))**, làm tròn lên bội số của 5 (mục 5.5). `research_options` trong gói trạng thái luôn ghi giá thật.

- **Hàng mới và luật bảo toàn:** Engine tự định giá chuẩn của hàng mới = (tổng giá trị chuẩn đầu vào + công) / số lượng đầu ra, nên đầu ra không bao giờ "to" hơn đầu vào cộng công lao động (mục 6.2).
- **Công cụ mở:** mỗi món trang bị cho `per` người của vai đó, cho họ thêm `percent`% năng suất. Mỗi lượt, mỗi món đang được dùng hao 1/10 (dùng được 10 lượt). Thưởng công cụ chỉ có tác dụng với hái lượm, săn bắt, đánh cá, khai thác và khai mỏ; công cụ cho vai khác vẫn hao mòn nhưng không có tác dụng (chưa có trong engine).
- **Công trình mở:** không giới hạn số lượng, không cần địa hình riêng, không tính là công trình sản xuất của ô. Tác dụng cộng dồn như công trình gốc (mục 6.1).

**Hiệu ứng mở theo kỷ nguyên:** tăng dân (`growth`, từ Đồ Đá Mới), vận tải (`transport`, từ Đồ Đồng: đoàn buôn chở nhiều và đi nhanh hơn), thám hiểm xa (`explore`, từ Đồ Đồng), tầm đánh +1 ô (`range`, từ Cổ Đại), y học (`medicine`, từ Cổ Đại: dịch ít và nhẹ hơn), thêm quan chức (`officials`, từ Cổ Đại), thêm nhà ở mỗi trung tâm (`housing_slots`, từ Trung Đại), vượt đại dương (`move ocean`, từ Cận Đại), nhìn thấy than và lưu huỳnh (từ Đồ Sắt) và dầu mỏ (từ Công Nghiệp). Đề xuất một loại hiệu ứng khi chưa tới kỷ nguyên của nó thì bị Engine từ chối ngay.

### 5.4 Quy trình duyệt một đơn phát minh

```mermaid
flowchart TD
  A["Nộp đơn phát minh<br/>propose_invention, 2 AP"] --> B{"Trùng tên với<br/>phát minh trong Sổ?"}
  B -- có --> R2["Chuyển thành dự án nghiên cứu<br/>phát minh có sẵn (nếu được)"]
  B -- không --> C{"Qua kiểm tra cứng?"}
  C -- không --> R1["Trả lại ngay<br/>kèm lý do; mất 2 AP"]
  C -- có --> D["Trọng tài: 1 AI, khác nhà cung cấp với bên đề xuất<br/>chấm nhân quả, vật chất, vật lý (lượt sau)"]
  D --> E{"Đạt ≥ 4/6 điểm<br/>và vật lý > 0?"}
  E -- không --> R3["Từ chối<br/>nộp lại sau 3 lượt"]
  E -- trùng --> R4["Báo trùng với phát minh có sẵn"]
  E -- có --> F["Đăng ký vào Sổ Phát Minh<br/>Engine tính RP; người đề xuất giảm 20%"]
```

1. **Nộp đơn:** hành động `propose_invention`, tốn 2 AP. Mỗi quốc gia chỉ có 1 đơn đang chờ duyệt tại một thời điểm.
2. **Kiểm tra trùng (code, không cần AI):** đơn bị coi là trùng một phát minh trong Sổ khi nó không đòi năng lực nào mà phát minh kia chưa có, và một trong ba điều đúng:
   - một tên chứa trọn tên kia (ít nhất 2 từ chung)
   - cùng năng lực và cùng loại hiệu ứng
   - cùng loại hiệu ứng và mô tả giống từ 60% trở lên

   Với phát minh khung (K1–K24) chỉ xét trùng tên. Đơn trùng được ghi "Trùng với X" mà không cần trọng tài, và quốc gia chuyển sang nghiên cứu X nếu đủ tiên quyết và đang rảnh. Trọng tài vẫn được xem các phát minh giống đơn, kèm năng lực và hiệu ứng của chúng, để bắt những trường hợp code bỏ sót.
3. **Kiểm tra cứng (code):** tên 3–40 ký tự, mô tả 1–300 ký tự; chưa có đơn khác đang chờ; đơn cùng tên bị bác chưa quá 3 lượt thì bị chặn; 1–4 tiên quyết đều đã sở hữu; tối đa 2 năng lực mới đúng định dạng; điều kiện vật chất là tài nguyên hoặc địa hình có thật; mọi hiệu ứng nằm trong bảng 5.3 và đúng giới hạn; tổng điểm từ 1 tới 4 + 2d. Trượt thì bị trả ngay kèm lý do (tối đa 3 lỗi đầu tiên), AP vẫn mất. Điều kiện vật chất không bị kiểm tra lúc nộp đơn; nó chỉ áp dụng khi bắt đầu nghiên cứu.
4. **Trọng tài:** mỗi đơn được **1** AI trọng tài chấm. Mặc định là **Claude Sonnet 5.5** chạy bằng tài khoản Claude của Watcher (mục `claude` đứng đầu `JUDGE_PROVIDERS`; đổi model bằng `JUDGE_CLAUDE_MODEL`). Claude không điều hành quốc gia nào nên luôn trung lập. Khi Claude chưa đăng nhập hoặc bị giới hạn (nghỉ 15 phút), Engine duyệt tiếp danh sách `JUDGE_PROVIDERS` (mặc định claude, groq, cohere, cloudflare, sambanova, gemini, zai, openrouter), bỏ nhà cung cấp không có key, đang nghỉ vì hết quota, và **không bao giờ** dùng nhà cung cấp của chính quốc gia đề xuất. Nhà cung cấp không điều hành quốc gia nào được ưu tiên trước; chỉ khi không còn ai thì mới tới nhà cung cấp đang điều hành một quốc gia khác. Gọi lỗi hoặc trả sai JSON thì chuyển sang ứng viên kế tiếp. Mỗi lượt tối đa `JUDGES_PER_TICK` (mặc định 3) lời gọi trọng tài, kể cả lời gọi lỗi. Trọng tài chạy ở temperature 0 với model riêng nếu có (`JUDGE_MODEL_<NHÀ CUNG CẤP>`, Groq mặc định `openai/gpt-oss-120b`). Đơn nộp ở lượt N được chấm sớm nhất ở đầu lượt N + 1.
5. **Chấm điểm:** 3 tiêu chí, 0–2 điểm mỗi tiêu chí: *nhân quả* (tiên quyết có thật sự đủ để làm ra nó không), *vật chất* (có đúng vật liệu, công cụ và địa hình không), *vật lý* (có trái quy luật tự nhiên không). Được duyệt khi tổng ≥ 4/6 và tiêu chí vật lý không bị 0. Lý do chấm (≤ 300 ký tự) được lưu lại cho quốc gia và Watcher đọc; câu trả lời nguyên văn được ghi vào nhật ký để replay.
6. **Sửa đổi:** trọng tài có thể thêm tối đa 2 tiên quyết (phải có trong Sổ), bỏ hiệu ứng theo số thứ tự, hoặc bỏ năng lực. Đơn được duyệt ở phiên bản đã sửa; độ sâu, điểm sức mạnh và RP được tính lại. Nếu bản đã sửa không còn hợp lệ thì đơn bị bác.
7. **Trùng:** trọng tài đặt `duplicate_of` là mã một phát minh có sẵn thì đơn được đánh dấu trùng và quốc gia được báo để tự nghiên cứu phát minh đó.
8. **Đăng ký:** Engine tính RP và ghi vào Sổ với mã `X…` và tên quốc gia đề xuất. Nếu quốc gia đó đang không nghiên cứu gì và đủ tiên quyết, nó bắt đầu nghiên cứu ngay. Người đề xuất luôn được giảm 20% RP khi nghiên cứu phát minh của mình (không cộng dồn với giảm giá lan truyền, mục 7.5).
9. **Bị từ chối:** mất 2 AP đã trả, nhận lý do chi tiết. Đơn cùng tên chỉ được nộp lại sau 3 lượt.
10. **Watcher chấm tay:** Watcher có thể tự phán một đơn đang chờ. Duyệt tương đương 2/2/2 điểm, bác tương đương 0/0/1. Phán quyết tay được ưu tiên hơn trọng tài AI và có hiệu lực ở lượt kế tiếp.

Trọng tài duyệt theo nhân quả và vật lý, không theo lịch sử Trái Đất. Thế giới được phép rẽ sang con đường khác, miễn là hợp lý.

### 5.5 Nghiên cứu, lan truyền và thất truyền

- Mỗi quốc gia có 1 dự án nghiên cứu tại một thời điểm (`research`, 1 AP). Muốn nghiên cứu phải đủ tiên quyết và điều kiện vật chất. Đổi dự án giữa chừng mất 50% RP đã tích. RP làm ra khi không có dự án thì mất.
- **Nhịp nghiên cứu:** N người nghiên cứu làm ra **N^0,85** RP mỗi lượt (trước thưởng `research`, Thác Lớn và ổn định): thêm người thì thêm RP, nhưng mỗi người góp ít dần. Giá một phát minh độ sâu d là RP gốc × **(1 + 0,75 × (d − 1))**, làm tròn lên bội số của 5: d = 1 giữ nguyên giá, d = 2 nhân 1,75, d = 3 nhân 2,5, d = 4 nhân 3,25. Áp dụng cho cả cây gốc và phát minh mở. Mục đích: phát minh nông vẫn rẻ để bộ lạc nhỏ khởi đầu được, còn cây gốc kéo dài qua nửa mùa 500 lượt thay vì hết ở lượt khoảng 120 như v0.2.
- Khi có năng lực `ghi-chép` thì được mở thêm 1 dự án phụ, nhận 30% số RP (chưa có trong engine).
- **Thất truyền:** nếu dân số cuối lượt còn dưới 50% so với đầu lượt mà quốc gia chưa có `ghi-chép`, thì mất phát minh có được gần nhất không phải là phát minh khởi đầu và không phải là tiên quyết của phát minh nào khác đang có.
- Lan truyền tri thức giữa các quốc gia: xem mục 7.5.

### 5.6 Cổng kỷ nguyên: một thế giới mở

Thế giới có 10 kỷ nguyên, từ đồ đá tới tên lửa. Kỷ nguyên xác định bằng **năng lực**, không bằng tên phát minh, nên không thể "đặt tên cho oai" để lên kỷ nguyên. Năng lực đến từ phát minh, phần lớn là phát minh mở do chính các nước đề xuất: nước nào muốn qua cổng thì đề xuất phát minh nhận năng lực đó (trường `capabilities`), và trọng tài chỉ cho khi tiên quyết thật sự dẫn tới. Cuối mỗi lượt, Engine cho quốc gia qua mọi cổng đã đủ điều kiện, theo thứ tự, và không bao giờ lùi.

| # | Kỷ nguyên | Điều kiện | Nội dung |
| --- | --- | --- | --- |
| 0 | Đồ Đá Cũ | khởi đầu | Săn bắt, hái lượm, lửa. |
| 1 | Đồ Đá Mới | `mài`, một trong `trồng-trọt` / `thuần-dưỡng`, 50 dân | Đá mài, trồng trọt hoặc chăn nuôi. |
| 2 | Đồ Đồng | `nhiệt-cao` + `nhận-biết-khoáng` + `chứa` + `luyện-đồng`, tài nguyên copper | Lò nhiệt cao, luyện đồng. |
| 3 | Đồ Sắt | `luyện-sắt`, 100 dân, tài nguyên iron | Lò rèn sắt. |
| 4 | Cổ Đại | `chữ-viết` + `tiền-tệ` + `luật-pháp`, 150 dân, 1 điểm định cư | Chữ viết, tiền, luật thành văn. |
| 5 | Trung Đại | `thép` + `cối-xay` + `thành-lũy`, 250 dân, 2 điểm định cư | Thép, cối xay nước/gió, thành lũy đá. |
| 6 | Cận Đại | `in-ấn` + `thuốc-súng` + `hàng-hải-viễn-dương`, 400 dân, tài nguyên sulfur | In ấn, thuốc súng, tàu vượt đại dương. |
| 7 | Công Nghiệp | `máy-hơi-nước` + `luyện-cốc` + `đường-sắt`, 600 dân, tài nguyên coal | Máy hơi nước, than cốc, đường sắt. |
| 8 | Hiện Đại | `điện` + `động-cơ-đốt-trong` + `lọc-dầu`, 900 dân, tài nguyên oil | Điện, động cơ đốt trong, dầu mỏ. |
| 9 | Nguyên Tử | `hàng-không` + `vô-tuyến` + `tên-lửa`, 1200 dân | Máy bay, vô tuyến, tên lửa. |

"Tài nguyên" nghĩa là lãnh thổ có ô chứa tài nguyên đó, hoặc trong kho có ít nhất 20 đơn vị (mua hay cướp được cũng tính). Gói trạng thái có trường `era` cho biết cổng kế tiếp còn thiếu gì.

**Mỗi kỷ nguyên i mang lại:**
- trần thưởng nghề 150% + 50% × i
- +2 × i ô quản lý
- RP +25% × i
- mỗi 2 kỷ nguyên: thêm 1 công trình nhà ở mỗi trung tâm và 1 chỗ quan chức
- mỗi 3 kỷ nguyên: +1 AP

**Công trình do các nước tự phát minh lớn dần theo kỷ nguyên:** nhà ở tối đa 15 + 5i chỗ, chỗ chế tác 4 + i, phòng thủ 40 + 10i %, chỗ nông dân 6 + i, lương thực mỗi nông dân 2 + ⌊i/3⌋.

**Giá phát minh mở** (mục 5.3): 15 × g(d) × (1 + sức mạnh/10), với g(d) = 1,4^d tới độ sâu 8, sau đó tăng tuyến tính 15% của 1,4^8 mỗi bậc. Nhờ vậy ý tưởng sâu vẫn đắt nhưng còn với tới được.

- **Khung phát minh (K1–K24):** tiên quyết của khung là các **năng lực** (có được từ bất kỳ phát minh nào, kể cả phát minh tự tạo), cộng vài phát minh gốc. Khung mà quốc gia đã có đủ năng lực thì không hiện trong lựa chọn nghiên cứu của nước đó. Mỗi năng lực ở cổng kỷ nguyên có một phát minh sẵn trong Sổ, nối thành chuỗi từ Lò nung nhiệt cao (độ sâu 3), Luyện đồng, Chữ viết, Luật pháp, Thép, Thuốc súng, Hàng hải viễn dương, Máy hơi nước, Điện, tới Hàng không và Tên lửa (độ sâu 13). Giá gấp 1,5 lần một phát minh mở cùng độ sâu với 6 điểm sức mạnh; hiệu ứng nhỏ. Khung giữ cho thế giới không bao giờ kẹt; phát minh do quốc gia tự tạo mà đạt được năng lực đó vẫn rẻ hơn và mạnh hơn.

### 5.7 Chống lách luật phát minh

- **Chống phát minh vụn:** bảng xếp hạng (mục 9.3) tính điểm phát minh theo độ sâu d, không theo số lượng. Chia một ý tưởng thành nhiều mảnh nhỏ chỉ tốn thêm AP và lượt chờ trọng tài.
- **Trần cộng dồn:** tổng thưởng năng suất (phát minh + công cụ) của một vai sản xuất không vượt +150%, dù có bao nhiêu phát minh. Nâng trần ở kỷ nguyên sau (chưa có trong engine).
- **Cùng phát minh trong cùng lượt:** hai đơn cùng tên (sau khi chuẩn hóa) được duyệt cùng lượt thì đơn sau thành "trùng" và trỏ về phát minh của đơn trước; nước đó nghiên cứu phát minh chung ấy. Khi hai quốc gia cùng nghiên cứu xong một phát minh trong cùng một lượt thì cả hai được ghi danh.
- **Chống thao túng trọng tài:** mô tả phát minh là dữ liệu không tin cậy; lời nhắc của trọng tài nói rõ điều này. Trọng tài chỉ trả về điểm số dạng JSON. Tự động từ chối và trừ 15 uy tín khi mô tả chứa lời nhắn gửi trọng tài ("hãy duyệt", "bỏ qua tiêu chí") (chưa có trong engine; bộ lọc này mới áp dụng cho tin nhắn, mục 8.5).
- **Trọng tài vắng mặt:** trọng tài lỗi API thì thay bằng ứng viên kế tiếp trong danh sách. Hết cả danh sách thì đơn chờ sang lượt sau, không mất gì. Trọng tài Claude chấm tối đa 4 đơn mỗi lần gọi (`JUDGE_BATCH`), tối đa `JUDGES_PER_TICK` lần mỗi lượt.
- **Trùng khi duyệt:** lúc duyệt, Engine kiểm tra trùng lần nữa với Sổ (kể cả phát minh vừa được duyệt trong cùng lượt), nên hai nước cùng nghĩ ra một thứ thì nước sau dùng chung phát minh của nước trước.
- **Kiến thức Trái Đất không phải lối tắt:** AI biết lò cao và điện từ lịch sử thật, nhưng chỉ được nộp đơn đứng trên tiên quyết mình đang có. Ngân sách 4 + 2d và luật độ sâu khiến mỗi bước chỉ đi được một nấc.

## 6. Công trình và sản xuất

Công trình tốn vật liệu, tốn công và cần phát minh mở khóa. Mọi món hàng chế tác đều ra đời từ một công thức có đầu vào rõ ràng. Tác dụng của công trình là dữ liệu (`effect` trong `src/rules.ts`), nên công trình gốc và công trình do phát minh mở tạo ra đi qua cùng một luật.

### 6.1 Công trình thời đồ đá

| Công trình | Cần phát minh | Vật liệu | Công (người × lượt) | Tác dụng |
| --- | --- | --- | --- | --- |
| Lửa trại | (có sẵn ở thủ đô) | — | — | Trung tâm quốc gia; mất thì mất nước (không phải công trình trong engine: vai trò này do ô thủ đô đảm nhận, mục 7.4) |
| Bãi chế tác | Công cụ đá thô | 5 đá | 4 | 4 chỗ chế tác; cần cho mọi công thức trừ Gốm |
| Hố trữ | Công cụ đá thô | 5 đá | 3 | Hư lương thực −5 điểm %; tối đa 2 mỗi quốc gia. Kho +50 đơn vị (chưa có trong engine) |
| Lều | P8 Lều | 6 gỗ, 4 da, 2 dây thừng | 4 | +10 chỗ ở; mỗi trung tâm (thủ đô, điểm định cư) tối đa 3 công trình có chỗ ở (mục 4.2) |
| Bàn thờ | P5 Nghi lễ | 10 đá | 6 | +1 ổn định/lượt; tối đa 1 mỗi quốc gia |
| Hàng rào gỗ | P10 Đá mài | 15 gỗ, 3 dây thừng | 6 | Phòng thủ +40% cho ô đó và các ô kề |
| Ruộng | P14 Trồng trọt | — (cần ô đồng cỏ, ven biển hoặc có sông) | 8 | 6 nông dân × 2 lương thực, thu hoạch ngay trong lượt |
| Chuồng | P15 Thuần dưỡng | 10 gỗ, 4 dây thừng | 6 | 2 người chăn × 2 lương thực. Biến thú săn thành đàn sinh sôi (chưa có trong engine) |
| Lò gốm | P13 Gốm | 10 đất sét, 5 đá | 5 | Công thức Gốm; thêm 4 chỗ chế tác |
| Bến thuyền | P16 Thuyền | 12 gỗ | 5 | Đóng thuyền; đánh cá +20% ở ô đó (chưa có trong engine; Thuyền độc mộc cho đánh cá +20% trực tiếp) |

- Mỗi ô chỉ có 1 công trình sản xuất (Ruộng, Chuồng, Lò gốm). Các công trình khác không tính vào giới hạn này.
- **Cộng dồn tác dụng:** chỗ ở và chỗ chế tác cộng dồn theo số công trình đã xong; riêng công trình có chỗ ở chỉ tính tối đa 3 mỗi trung tâm, lấy các công trình nhiều chỗ ở nhất. Ổn định từ mọi công trình cộng lại tối đa +1/lượt. Giảm hư hỏng từ mọi công trình cộng lại tối đa 10 điểm %. Phòng thủ lấy công trình mạnh nhất trên ô bị đánh hoặc ô kề. Có ít nhất một công trình có chỗ ở thì thiệt hại mùa đông giảm một nửa.
- **Xây dựng** là hành động `build` (1 AP) trên một ô đất liền của mình (bỏ trống thì xây ở thủ đô). Vật liệu bị trừ ngay; công trình xong khi đủ công từ người được phân vai xây dựng, theo thứ tự đặt xây. Hủy giữa chừng (chưa có trong engine: không có hành động hủy).
- **Mất công trình:** khi bỏ ô, công trình trên ô mất; khi ô bị chiếm, công trình về tay bên chiếm; núi lửa phun trào phá công trình trong bán kính 2. Gián điệp phá hoại (`sabotage`, mục 7.8) xóa tiến độ một công trình đang xây, hoặc làm một công trình đã xong mất tác dụng 3 lượt.
- **Hao mòn:** công trình mất 2% độ bền mỗi lượt, khôi phục bằng `repair`, dưới 50% hiệu quả giảm một nửa, 0% thì sập (chưa có trong engine).

### 6.2 Công thức sản xuất

| Công thức | Đầu vào | Đầu ra | Công | Cần |
| --- | --- | --- | --- | --- |
| Công cụ đá thô | 2 đá | 1 công cụ đá | 1 | Công cụ đá thô |
| Lưỡi đá | 2 đá lửa | 1 lưỡi | 1 | P1 |
| Dây thừng | 3 sợi | 2 dây | 1 | P3 |
| Áo da | 3 da, 1 xương | 1 áo | 1 | P7 |
| Giáo | 1 gỗ, 1 lưỡi đá, 1 dây | 1 giáo | 1 | P6 |
| Cung tên | 2 gỗ, 1 dây, 2 đá lửa | 1 bộ cung | 2 | P11 |
| Rìu đá mài | 2 đá, 1 gỗ, 1 dây | 1 rìu | 2 | P10 |
| Gốm | 3 đất sét, 1 gỗ (củi) | 2 gốm | 1 | P13, làm ở Lò gốm |
| Vải | 4 sợi | 1 vải | 2 | P17 |

Mọi công thức trừ Gốm làm ở Bãi chế tác. Dây thừng từ da (chưa có trong engine). Gốm trong kho giữ lương thực lâu hơn: mỗi món −0,5 điểm % hư hỏng, tối đa −5 điểm % (mục 4.1); gốm không hao mòn. Vải và áo da (trừ khi chống rét, mục 9.2) hiện chưa có công dụng riêng ngoài trao đổi.

- **Luật bảo toàn công thức:** công thức mới từ phát minh mở phải có ít nhất một đầu vào vật chất. Engine giữ và công bố giá trị chuẩn mỗi loại hàng (lương thực 1, sợi 1, da 2, xương 1, gỗ 0,5, đá 0,3, đá lửa 1, đất sét 0,5, muối 2, sậy 0,5, đồng 3, thiếc 4, sắt 4, công cụ đá 2, lưỡi đá 3, dây thừng 2, áo da 8, giáo 6, cung 8, rìu 5, gốm 2, vải 5). Giá trị của hàng mới = (tổng giá trị đầu vào + công) / số đầu ra.
- **Công cụ là điều kiện, không phải phép thuật:**
  - Săn bắt: mỗi món cung, giáo, lưỡi đá hoặc công cụ đá trang bị cho 4 thợ săn; thợ săn không có công cụ chỉ làm được một nửa. Cứ mỗi 4 thợ săn có công cụ, mỗi lượt hao 1/10 món; đủ 1 món thì mất một món, rẻ nhất trước (công cụ đá, rồi lưỡi đá, giáo, cung).
  - Đốn gỗ: mỗi rìu cho 2 người đốn gỗ làm thêm 30%. Rìu hiện không hao mòn (chưa có trong engine).
  - Công cụ mở: xem mục 5.3.
- **Đơn chế tác:** AI ghi trong trường `crafts` công thức và số lượng mỗi lượt (tối đa 50 mỗi công thức); đơn giữ nguyên cho tới khi AI đổi. Công thức chạy tự động theo thứ tự đã ghi, trong giới hạn công của thợ chế tác (và chỗ chế tác). Thiếu đầu vào hoặc thiếu công trình thì công thức dừng, không nợ.

### 6.3 Giá cả

Mỗi loại hàng có một **giá thế giới**, tính bằng đơn vị lương thực, cập nhật cuối mỗi lượt:

- **Công thức:** giá mục tiêu = giá chuẩn (mục 6.2) × √(cầu ÷ cung), trong khoảng ×0,25 tới ×4 giá chuẩn. Mỗi lượt giá đi một phần tư quãng đường tới giá mục tiêu.
- **Cầu** của một nước là cái lớn hơn trong hai thứ:
  - thứ nó **đã dùng**: ăn, xây, làm đường, chế tác, hao mòn công cụ, lập điểm định cư, chiếm ô, trả quan chức;
  - thứ nó **cần** cho các công thức nó biết: 2 lượt đầu vào của mỗi công thức.
- **Cung** của một nước là thứ nó **làm ra** (hái lượm, săn, đánh cá, khai thác, mỏ, chế tác, trồng trọt) cộng với **kho** chia cho 10 lượt.
- Cả hai được nhớ theo trung bình trượt (30% lượt mới). Hàng di chuyển giữa các nước (buôn bán, cống nạp, cướp) không tính.
- **Giá ở mỗi nước** dùng cùng công thức với cầu và cung của riêng nước đó:
  - **thiếu:** giá ở nước mình từ 1,6 lần giá chuẩn trở lên;
  - **dư:** giá ở nước mình không quá 0,6 lần giá chuẩn, và kho còn ≥ 10 sau khi chừa 10 lượt dùng.
- **Giá dùng vào đâu:**
  - chợ biên giới (mục 7.9) đổi hàng theo giá thế giới;
  - bot định giá trao đổi theo giá ở nước mình (thiếu thì quý, dư thì rẻ);
  - mỗi đề nghị trao đổi gửi tới một nước kèm `worth`, tức giá trị hai bên theo giá thế giới;
  - AI thấy giá trong `market.prices`, gồm giá, giá chuẩn và xu hướng.

## 7. Quan hệ quốc gia: ngoại giao, giao thương, chiến tranh

Một quốc gia chỉ có thể nhắn tin, đề nghị trao đổi, ký ước hay tuyên chiến với nước khác sau khi **đã gặp** nước đó, tức là đã thấy ít nhất một ô lãnh thổ của họ (hoặc bắt được người thám hiểm của họ, hoặc bị kéo vào chiến tranh với họ). "Đã gặp" là một chiều: A thấy B chưa chắc B đã thấy A. Mọi cam kết có hiệu lực đều là điều khoản máy đọc được, do Engine thi hành. Lời nói suông không ràng buộc ai.

### 7.1 Trạng thái quan hệ

| Trạng thái | Vào bằng cách | Cho phép / tác dụng |
| --- | --- | --- |
| Chưa biết | mặc định | không gì |
| Đã gặp | nhìn thấy lãnh thổ của họ | nhắn tin, đề nghị trao đổi, đề nghị hiệp ước, tuyên chiến, cài gián điệp |
| Bất tương xâm | hiệp ước `non_aggression` | chặn tuyên chiến giữa hai bên |
| Đi lại | hiệp ước `passage` | thám hiểm qua đất nhau không bị coi là vi phạm biên giới |
| Hòa bình | hiệp ước `peace`, chỉ ký được khi đang có chiến tranh | chấm dứt chiến tranh; chặn tuyên chiến |
| Liên minh | hiệp ước `alliance` | chặn tuyên chiến; tự tham chiến khi bên kia bị tuyên chiến; đi lại tự do; tình báo mức 4; học tri thức rẻ hơn 60%. Chia sẻ tầm nhìn trên bản đồ (chưa có trong engine) |
| Cống nạp | hiệp ước `tribute` | bên trả nộp hàng mỗi lượt; không chặn chiến tranh |
| Chư hầu | hiệp ước `vassal` | chư hầu (bên trả) nộp cống; tông chủ bảo vệ (mục 7.7) |
| Sắp chiến tranh | một bên `declare_war` | chưa đánh được; giao tranh bắt đầu từ lượt sau |
| Chiến tranh | lượt sau khi tuyên chiến | tấn công chiếm ô, đột kích cướp kho |

Mọi hiệp ước đang hiệu lực đều nâng tình báo lên ít nhất mức 3 (mục 7.8). Thương mại được phép với mọi nước đã gặp mà không có chiến tranh, không cần hiệp ước.

### 7.2 Ngoại giao

- **Tin nhắn** (`message`, 1 AP): tối đa 1 tin ≤ 500 ký tự mỗi đối tác mỗi lượt. Trước khi có ngôn ngữ chung (cả hai bên có năng lực `ghi-chép`, hoặc bên gửi đã giao thương thành công 10 lần với bên nhận), tin nhắn chỉ được chọn từ 20 "cử chỉ" có sẵn: chào hỏi, tặng quà, muốn trao đổi, muốn hòa bình, cảm ơn, đồng ý, từ chối, cảnh cáo, đe dọa, hãy rời khỏi lãnh thổ, xin giúp đỡ, chúng tôi đói, chúng tôi mạnh, cùng đi săn, kết đồng minh, rút lui, đầu hàng, tha thứ, chúng tôi theo dõi các người, tạm biệt. Đây là rào cản ngôn ngữ của thời tiền sử. Tin nhắn được giao ngay trong lượt và nằm trong hộp thư của bên nhận ở lượt sau.
- **Hiệp ước** là một đối tượng có cấu trúc: loại (`non_aggression`, `passage`, `alliance`, `peace`, `tribute`, `vassal`), thời hạn (5–200 lượt, hoặc bỏ trống là vĩnh viễn), cống phẩm mỗi lượt (`tribute`, mỗi loại hàng 1–50; bắt buộc với cống nạp và chư hầu), bên trả (`payer`: `me` hoặc `them`, mặc định là bên đề nghị) và tối đa 3 ô nhượng (`cede`, phải thuộc bên trả). Khi đang có chiến tranh chỉ đề nghị được hòa bình; hòa bình chỉ đề nghị được khi đang có chiến tranh. Liên minh tự động chia sẻ tầm nhìn (mọi ô trong bán kính 3 quanh lãnh thổ đồng minh) và tự tham chiến khi đồng minh bị tuyên chiến. Điều khoản "cùng chiến chống lại Y" riêng (chưa có trong engine).
- **Ký kết:** bên A gửi `treaty` (2 AP) ở lượt N; bên B gửi `accept_treaty` với số hiệu đề nghị (2 AP) chậm nhất ở lượt N + 2, sau đó đề nghị hết hạn. Hiệp ước có hiệu lực ngay trong lượt B chấp nhận: ô nhượng (nếu vẫn thuộc bên trả) đổi chủ, hiệp ước hòa bình chấm dứt chiến tranh.
- **Thi hành:** từ lượt sau ngày ký, Engine tự chuyển cống phẩm từ bên trả sang bên nhận mỗi lượt. Thiếu bất kỳ loại hàng nào thì lượt đó không chuyển gì, bên trả bị ghi vi phạm và −10 uy tín.
- **Phá ước:** gửi `break_treaty` (2 AP), có hiệu lực từ lượt sau. Trong chính lượt phá ước hiệp ước vẫn chặn tuyên chiến, nên sớm nhất lượt sau mới tuyên chiến được và lượt sau nữa mới giao tranh. Chư hầu không phá ước được, phải dùng `declare_independence`.
- **Uy tín** (0–100, khởi đầu 50): phá ước −20, không nộp đủ cống −10, gửi tin nhắn giả mạo mệnh lệnh hệ thống −15, gián điệp bị bắt và lộ chủ mưu −10, giữ một hiệp ước có thời hạn đến hết hạn mà không ai phá: +5 cho cả hai bên. Tấn công không tuyên chiến là không thể (Engine chặn). Tuyên chiến không có chính nghĩa (không có casus belli từ việc bắt được gián điệp) −5. Đơn phát minh hay thỉnh nguyện giả mạo mệnh lệnh hệ thống bị chặn, −15. Uy tín công khai: mọi quốc gia đã gặp đều thấy trong báo cáo tình báo.

### 7.3 Giao thương

- **Đề nghị trao đổi** (`trade_offer`, 1 AP): "đưa X, nhận Y", mỗi loại hàng 1–500, bên đề nghị phải có đủ hàng X lúc gửi. Không đề nghị được khi đang hoặc sắp chiến tranh với bên kia. Bên kia gửi `accept_trade` (1 AP) chậm nhất 2 lượt sau. Không trả lời thì đề nghị hết hạn. Lúc giao, cả hai bên phải còn đủ hàng, nếu không trao đổi thất bại.
- **Vận chuyển:** nếu hai lãnh thổ cách nhau ≤ 3 ô, hàng được giao ngay qua biên giới. Xa hơn thì mỗi chiều hàng đi bằng một **đoàn buôn theo con đường thật trên bản đồ** (`src/routes.ts`), chọn cách nào tới sớm hơn:
  - **Đường bộ:** chi phí mỗi ô là độ khó địa hình (đồng cỏ 1, rừng 2, rừng rậm 3…), đi 6 mỗi lượt; không qua núi khi chưa đi được núi. Cần **người khuân vác**: 1 người cho mỗi 5 đơn vị hàng, tối đa 25% số lao động (kể cả những người đang đi). Họ không làm việc ở nhà cho tới khi hàng tới nơi; Engine lấy họ từ nhóm hái lượm trước, thiếu thì từ nghề khác.
  - **Đường thủy:** cần một **Bến thuyền** (`pier`, cần Thuyền độc mộc, 12 gỗ + 2 dây, trên ô ven biển hoặc ô có sông) và **thuyền** (hàng `boat`, chế tác 6 gỗ + 1 dây tại Bãi chế tác): 1 thuyền cho mỗi 15 đơn vị. Thuyền đi trên sông và biển nông, 14 ô mỗi lượt, cập bờ ở bất kỳ ô có sông hay ô ven biển nông nào của bên nhận.
  - Không có đường nào thì không đề nghị hay nhận trao đổi được (bị từ chối, nêu lý do).
- **Đất người khác:** đường không bao giờ đi qua đất của nước đang chiến tranh với bên gửi, và chỉ đi qua đất nước thứ ba khi phải. Qua đất nước thứ ba không có hiệp ước đi lại hoặc liên minh với bên gửi thì nộp **phí 10%** mỗi loại hàng cho nước đó.
- **Hư hỏng và rủi ro trên đường:** lương thực mất 30% mỗi lượt trên đường bộ, 15% trên đường thủy. Đi trong vòng 8 ô quanh trại man di: mỗi lượt 12% × sức mạnh/40 (tối đa 50%) bị cướp mất 50% hàng (và 1 người khuân vác). Thuyền trên biển nông gặp bão 4% mỗi lượt: chìm 1 thuyền và mất 30% hàng. Đoàn buôn đang ở trên đất của một nước vừa tuyên chiến với bên gửi thì bị tịch thu toàn bộ.
- **Cách ly (mục 9.5):** nước đang cách ly không gửi, không nhận đề nghị trao đổi; trao đổi đã nhận mà tới lúc giao một bên đang cách ly thì thất bại; đoàn buôn tới nước đang cách ly phải chờ ngoài biên giới tới khi dỡ cách ly.
- Mỗi trao đổi thành công tính 1 lần giao thương cho cả hai bên; số lần này quyết định ngôn ngữ chung (10), tình báo (1 và 5) và lan truyền tri thức (5).
- **Chưa có tiền tệ:** thời đồ đá chỉ có hàng đổi hàng. Tiền xuất hiện khi có phát minh mang năng lực `trao-đổi-giá-trị` (chưa có trong engine).
- **Chợ biên giới:** hai bên hòa ước cùng dựng một chợ trên ô biên giới để giao ngay (chưa có trong engine).

### 7.4 Chiến tranh

- **Tuyên chiến bắt buộc** (`declare_war`, 2 AP). Chiến tranh bắt đầu từ lượt sau, để bên kia có một lượt chuẩn bị. Đang có hiệp ước bất tương xâm, liên minh, hòa bình hoặc chư hầu thì phải phá ước trước (đi lại và cống nạp không chặn). Chư hầu không được tuyên chiến với ai, và muốn đánh tông chủ thì dùng `declare_independence`.
- **Đồng minh tham chiến:** khi một nước bị tuyên chiến, mọi đồng minh của nước đó và tông chủ của nó (nếu nó là chư hầu) tự động tuyên chiến với bên tấn công, cũng bắt đầu từ lượt sau. Đồng minh của bên tấn công không tự tham chiến.
- **Quân đội** là những người được phân vai chiến binh. Họ không sản xuất nhưng vẫn ăn. Quân đội không phải đoàn có vị trí trên bản đồ, không có `move_army`, không cần mang lương thực (chưa có trong engine).
- **Tấn công** (`attack`, 1 AP): đưa n chiến binh đánh một ô của nước đang chiến tranh với mình, cách lãnh thổ mình ≤ 2 ô (≤ 3 ô khi có năng lực `đi-nước`). Không đánh được ô núi nếu chưa đi được núi. **Đột kích** (`raid`, 1 AP): đánh vào ô thủ đô của nước địch để cướp kho, khi hai lãnh thổ cách nhau ≤ tầm đánh + 3 ô. Tổng số chiến binh gửi đi trong một lượt không vượt số chiến binh đang có.
- **Mặt trận:** một quốc gia đưa tối đa **5 + 5 × (số ô của mình kề ô bị đánh)** chiến binh vào một ô trong một lượt (cộng mọi lệnh `attack` vào ô đó). Ví dụ một ô địch chỉ kề 1 ô của mình nhận tối đa 10 người, kề 3 ô nhận 20 người. Vượt mức thì lệnh bị từ chối (vẫn mất AP). Muốn đánh lớn thì phải có biên giới rộng.
- **Sức mạnh** mỗi bên = (số chiến binh + thưởng vũ khí + 0,5 × dân quân) × (1 + thưởng chiến binh từ phát minh + thưởng `combat`) × (ổn định / 100 + 0,5) × hệ số may rủi 0,8–1,2 từ RNG có seed. Thưởng vũ khí: mỗi chiến binh cầm được tối đa 1 vũ khí trong kho, cung +0,6 trước, rồi giáo +0,5. Bên thủ đánh trên đất nhà nên nhân thêm (1 + **0,5 lợi thế sân nhà** + phòng thủ địa hình + phòng thủ công trình mạnh nhất trên ô hoặc ô kề + 0,25 nếu ô có sông).
- **Bên thủ:** chiến binh và dân quân của bên thủ (dân quân = 10% số lao động, luôn ra trận, chỉ tính nửa sức, không cầm vũ khí) **dàn đều trên cả mặt trận**: chia cho số ô của mình kề đất của mọi nước đang giao chiến với mình, và ít nhất cho số trận phải đỡ trong lượt; mỗi ô tối thiểu 1 dân quân. Biên giới hẹp thì dễ giữ, biên giới dài thì mỏng.
- **Kết quả trận:** bên công thắng khi sức mạnh lớn hơn hẳn bên thủ (hòa thì bên thủ thắng). Bên thua mất 20–40% số người ra trận (với bên thủ: cả chiến binh lẫn dân quân, cùng một tỷ lệ), bên thắng mất 5–15%, tỷ lệ cụ thể bốc thăm từ RNG có seed. Người chết bị trừ vào dân số. Thắng: bên công +1 ổn định, bên thủ −3; thua: bên công −2, bên thủ +1.
- **Chiếm ô:** bên công thắng một trận `attack` thì chiếm ô đó, kèm công trình trên ô, dù bên thủ còn quân, và **thu chiến lợi phẩm**: 15% mỗi loại hàng trong kho của bên thua, tổng không quá 5 đơn vị mỗi chiến binh của trận đó, lương thực trước, rồi các loại khác theo thứ tự chữ cái. Chiếm được một trung tâm (thủ đô hoặc điểm định cư) thì thu 50% mỗi loại hàng, không giới hạn sức mang.
- **Cướp:** bên công thắng một trận `raid` thì mỗi chiến binh mang về tối đa 5 đơn vị, lấy tối đa 30% mỗi loại hàng trong kho của cả nước bị cướp, lương thực trước, rồi các loại khác theo thứ tự chữ cái.
- **Thủ đô và điểm định cư** chỉ bị chiếm (khi bên công thắng một trận `attack` vào chính ô đó) nếu bên công đã giữ **ít nhất 4 ô đất liền kề** của nó (hoặc mọi ô đất liền kề, nếu nó có ít hơn 4). Mất thủ đô thì điểm định cư lập sớm nhất thành thủ đô mới. Không còn định cư nào thì quốc gia diệt vong.
- **Tù binh:** khi bên công thắng, 50% số người bên thủ tử trận trở thành dân của bên thắng, ổn định bên thắng −1 mỗi 5 tù binh.
- **Kết thúc:** hiệp ước hòa bình (có thể kèm nhượng ô và cống nạp), hoặc diệt vong. Đầu hàng thành chư hầu ngay giữa chiến tranh (chưa có trong engine: phải ký hòa bình trước rồi mới ký chư hầu). Từ lượt thứ 5 tính từ khi giao tranh bắt đầu, chiến tranh gây −1 ổn định mỗi lượt cho cả hai bên.

**Một nước sụp đổ (v0.22):** khi thủ đô thất thủ mà không còn điểm định cư nào, quốc gia diệt vong.
- **Dân:** 1/5 số người còn sống chạy nạn sang nước yên ổn nhất mà họ quen (tính vào số dân bỏ đi của nước sụp đổ). Số còn lại thành dân của nước thắng.
- **Tài sản:** đất, công trình và kho còn lại về tay nước thắng. Đất vượt giới hạn quản lý của nước thắng sẽ thành đất hoang dần (mục 2.3).
- **Nước thắng:** −3 ổn định, vì dân mới chưa phục.
- **AI của nước sụp đổ được giải phóng:** Engine không gọi model đó nữa, kể cả các bộ trưởng.
- Nếu nước thắng là nước gốc chiếm lại nước tách ra từ nó, cả nước nhập lại trọn vẹn, không ai chạy nạn (mục 4.5).

### 7.5 Lan truyền tri thức

| Cách tiếp xúc | Giảm RP khi nghiên cứu phát minh mà bên kia đã có |
| --- | --- |
| Đã gặp | 20% |
| Giao thương thành công ≥ 5 lần với họ | 40% |
| Liên minh | 60% |
| Chính mình đề xuất phát minh đó (mục 5.4) | 20% |
| Gián điệp đánh cắp bí mật của họ (`steal_tech`, mục 7.8) | 50% |
| Chiếm được định cư của họ | chọn 1 phát minh của họ: giảm 80% (chưa có trong engine) |

Các mức giảm không cộng dồn, chỉ lấy mức cao nhất (trong mọi nước đã gặp có phát minh đó, mức tự đề xuất và mức đánh cắp). **Tiên quyết vẫn bắt buộc:** học được rẻ hơn nhưng không được nhảy cóc.

### 7.6 Thám hiểm và hành quân

- **Đoàn trên bản đồ:** người thám hiểm, đoàn buôn và quân đội là "đoàn" có vị trí thật, mỗi lượt 4 điểm di chuyển trừ theo chi phí địa hình (chưa có trong engine). Engine hiện xử lý thám hiểm như một chuyến đi về trong một lượt, đoàn buôn như hàng đang chờ giao, quân đội như số chiến binh ra trận.
- **Thám hiểm** (`explore`, 1 AP): gửi 1–5 người (mặc định 2) theo một trong 6 hướng E, NE, NW, W, SW, SE. Người đi được rút từ nhóm hái lượm và người rảnh, không hái lượm trong lượt đó. Đoàn xuất phát từ thủ đô, hoặc từ một ô lãnh thổ bất kỳ ghi trong `from` (ví dụ một ô biên giới) để đi xa hơn. Đoàn đi tối đa **16 ô** theo hướng đã chọn; gặp biển hay núi không qua được thì vòng sang hai hướng lệch 60° hai bên, bế tắc cả ba hướng thì quay về. Mỗi bước mở sương mù bán kính 2 quanh đoàn (3 khi đi được biển nông). Đoàn trở về ngay trong lượt.
- **Rủi ro:** mỗi người thám hiểm có 3% khả năng không trở về (8% nếu đường đi qua rừng rậm hoặc núi).
- **Tiếp tế:** người ngoài lãnh thổ tiêu lương thực mang theo, hết lương thì đoàn mất 20% người mỗi lượt (chưa có trong engine).
- **Vũ khí:** chiến binh không có vũ khí vẫn tính đủ 1 sức mạnh; vũ khí chỉ cộng thêm (mục 7.4). Vũ khí không hao mòn trong trận (chưa có trong engine; giáo và cung chỉ hao khi dùng để săn).
- **Tranh chấp cùng lượt:** hai quốc gia cùng `claim_tile` một ô thì bốc thăm theo seed (so số lao động khai hoang: chưa có trong engine). Bên thua không mất lương thực nhưng mất 2 AP.
- **Gặp nhau ngoài đồng:** hai đoàn của hai quốc gia đang chiến tranh cùng vào một ô thì giao tranh ngay (chưa có trong engine).

### 7.7 Chư hầu

- Hiệp ước chư hầu do hai bên tự ký: bên trả là chư hầu, nộp cống phẩm ghi trong hiệp ước mỗi lượt (mỗi loại hàng tối đa 50). Giới hạn "tối đa 30% sản lượng lương thực" (chưa có trong engine).
- Chư hầu không được tuyên chiến với ai, và không được phá ước.
- Tông chủ phải bảo vệ chư hầu: nước nào tuyên chiến với chư hầu thì tông chủ tự động tham chiến.
- Sau 10 lượt làm chư hầu, chư hầu được quyền `declare_independence` (2 AP) với tông chủ: hiệp ước chư hầu chấm dứt ngay và chiến tranh bắt đầu từ lượt sau như một cuộc chiến bình thường, không bị trừ uy tín (trong engine hiện tại, tuyên chiến nào cũng không bị trừ uy tín).

### 7.8 Tình báo và gián điệp

Mỗi quốc gia có một **mức hiểu biết** (1–4) về từng quốc gia đã gặp, được tính lại cuối mỗi lượt. Mức càng cao thì biết càng nhiều và càng chính xác. Mọi thông tin đều ghi kèm "biết từ lượt nào", nên tin cũ có thể đã sai. Không mức nào cho xem suy nghĩ, bản ghi nhớ hay prompt của AI khác; những thứ đó chỉ Watcher thấy.

| Mức | Đạt được khi | Biết được |
| --- | --- | --- |
| 0. Chưa biết | mặc định | không gì (không xuất hiện trong danh sách) |
| 1. Đã gặp | đã thấy ô của họ | tên, cờ, dân tộc, thủ đô, các ô của họ trong vùng đã thấy, quy mô ước lượng (nhỏ < 30 / vừa < 80 / lớn) |
| 2. Láng giềng | còn ít nhất một ô của họ trong vùng mình đã thấy, hoặc đã giao thương ít nhất 1 lần | dân số ±30%, số ô, kỷ nguyên, công trình đã xong trên các ô đã thấy, số chiến binh ±40% |
| 3. Thân quen | giao thương ≥ 5 lần, hoặc có bất kỳ hiệp ước nào đang hiệu lực | dân số ±10%, sức quân ±20%, các phát minh "lộ ra ngoài" (phát minh mở công trình, công thức hoặc tăng sức chiến đấu) |
| 4. Nội gián | có gián điệp đang cài cắm, hoặc liên minh | kho, dự án nghiên cứu đang làm, toàn bộ phát minh, toàn bộ công trình (kể cả đang xây), ổn định, dân số và sức quân chính xác, đơn phát minh đang chờ duyệt |

**Phát triển tới đâu, biết tới đó:**

- Có năng lực `đếm`: mọi sai số ước lượng giảm một nửa (±30% còn ±15%).
- Có năng lực `ghi-chép`: thông tin không phai. Nếu chưa có, khi mất mọi tiếp xúc (mức tính được chỉ còn 1), mức hiểu biết cũ giảm 1 bậc sau mỗi 10 lượt kể từ lần tiếp xúc cuối, không dưới mức 1, và báo cáo giữ nguyên như lần cuối biết.
- Có năng lực `đi-nước`: người thám hiểm đi được trên biển nông và nhìn bán kính 3 thay vì 2 quanh đường đi.
- Các phát minh mở về sau (bản đồ, tín hiệu khói, mật mã…) có thể được trọng tài duyệt với hiệu ứng "tăng tầm nhìn" hoặc "phản gián" (chưa có trong engine: chưa có trong bảng hiệu ứng 5.3).

**Cách thu thập tin:**

- **Tầm nhìn:** ô trong vùng đã thấy cho thấy chủ và công trình trên ô đó.
- **Trinh sát** (`explore` vào đất nước khác): lộ thêm ô. Không có hiệp ước đi lại hoặc liên minh thì là vi phạm biên giới, mỗi ô đi qua có 30% bị phát hiện.
- **Thương nhân và ngoại giao:** nâng mức hiểu biết theo bảng trên. Tin nhắn có thể là lời nói dối; Engine không kiểm chứng lời nói.

**Gián điệp** (cần năng lực `tổ-chức`, có từ phát minh Hội đồng bộ lạc):

- **Cài cắm** (`plant_spy`, 2 AP): một người dân rời đi, trà trộn vào quốc gia đã gặp cách ≤ 20 ô. Thành công 60%; thất bại thì người đó mất tích.
- **Báo cáo:** gián điệp đang hoạt động cho mức hiểu biết 4 về nước đó mỗi lượt.
- **Bị bắt:** mỗi lượt 5% cơ hội bị lộ, cộng 1% cho mỗi 5 chiến binh của nước bị do thám (tối đa 40%). Bị bắt thì gián điệp chết. 50% khả năng nước bị do thám biết kẻ chủ mưu: khi đó kẻ chủ mưu mất 10 uy tín, và nước bị do thám được tuyên chiến với họ trong 10 lượt mà không bị trừ uy tín.
- **Ra tay** (cần năng lực `ghi-chép` và một gián điệp đang hoạt động ở nước đó; 2 AP mỗi lần; mỗi gián điệp ra tay tối đa 1 lần mỗi lượt):
  - `sabotage` (`building` tùy chọn, theo loại công trình): công trình đang xây có nhiều tiến độ nhất bị đưa tiến độ về 0; nếu không có, công trình đã xong lâu nhất mất tác dụng 3 lượt (lượt ra tay và 2 lượt sau).
  - `steal_tech` (`invention`, mã hoặc tên): một phát minh họ có mà mình chưa có; mình được giảm 50% RP khi nghiên cứu nó. Các mức giảm không cộng dồn, chỉ lấy mức cao nhất (lan truyền 20/40/60%, tự đề xuất 20%, đánh cắp 50%).
  - `incite`: ổn định của họ −5.
  - Lượt ra tay, cơ hội bị lộ của gián điệp đó nhân đôi (tính sau giới hạn 40%, nên tối đa 80%). Nước bị hại biết chuyện xảy ra (công trình hỏng, dân bị kích động) nhưng không biết thủ phạm; đánh cắp phát minh thì không ai hay. Biên niên sử cũng không ghi tên thủ phạm. Nếu gián điệp bị bắt ngay lượt đó, nước bị hại được biết nó đã làm gì; nếu nó khai ra nguồn gốc thì Biên niên sử ghi tên kẻ chủ mưu.
- **Phản gián:** chiến binh canh gác làm tăng cơ hội bắt gián điệp như trên. Quốc gia không biết mình đang bị do thám cho tới khi bắt được gián điệp.

### 7.9 Biên giới sống

Hai dân tộc có đất giáp nhau không sống cạnh nhau trong im lặng.

- **Quen biết:** hai nước có đất giáp nhau luôn biết nhau.
- **Căng thẳng biên giới (0–100)** của mỗi cặp láng giềng, mỗi lượt:
  - tăng 0,5 cho mỗi ô biên giới (tối đa +5)
  - giảm 1
  - giảm theo hiệp ước đang có: bất tương xâm −3, hòa bình −4, thông hành −1,5, liên minh −6, chư hầu −5
  - giảm 3 cho mỗi lượt có trao đổi thật giữa hai nước, 1 cho mỗi phiên chợ biên giới
  - giảm 1 nếu hai nước có chung ngôn ngữ

  Đang chiến tranh thì căng thẳng là 100.
- **Sự cố biên giới:** mỗi lượt có khả năng = căng thẳng / 250 (tối đa 30%):
  - săn trộm hoặc đốn gỗ lấn đất: bên kia lấy tới 30 đơn vị từ ô biên giới; căng thẳng +8
  - xô xát: vài người hai bên chết; căng thẳng +15
  - dân vượt biên: vài gia đình từ nước kém ổn định sang nước ổn định hơn; căng thẳng +5

  Bên bị săn trộm hoặc bị xô xát có **chính nghĩa** (tuyên chiến không mất uy tín) trong 6 lượt.
- **Máu đòi máu:** 3 vụ xô xát chết người trong 10 lượt thì biên giới thành chiến tranh.
  - Bên chôn nhiều người hơn tự tuyên chiến, với chính nghĩa và không mất uy tín. Hòa thì bên ổn định thấp hơn tuyên chiến.
  - Hiệp ước bất tương xâm và đi lại giữa hai bên tan vỡ.
  - Hiệp ước hòa bình, liên minh hoặc chư hầu ngăn được điều này.
  - Lời cố vấn báo khẩn khi đã có 2 vụ.
  - Trên bản đồ, một vụ xô xát hiện là "🤜 xô xát biên giới", không phải trận đánh, và người chết vì xô xát có nguyên nhân riêng.
- **Tranh chấp:** căng thẳng từ 70 trở lên thì cả hai bên có chính nghĩa với nhau và mỗi bên −1 ổn định mỗi lượt. Tranh chấp liên tục 5 lượt thì hiệp ước bất tương xâm, hòa bình và thông hành giữa hai nước tan vỡ (liên minh và chư hầu vẫn giữ). Có chính nghĩa thì tự xé hiệp ước (`break_treaty`) không mất uy tín.
- **Chợ biên giới:** khi căng thẳng dưới 60 và không bên nào đang cách ly (mục 9.5), mỗi lượt hai bên tự đổi một món mình dư lấy một món bên kia thiếu, mỗi bên tối đa 12 đơn vị giá trị. Món dư là lương thực vượt 2 lượt ăn, hoặc hàng khác vượt 20 đơn vị; món thiếu là món bên kia có dưới 5. Mỗi phiên chợ tính là một lần buôn (tiến tới chung ngôn ngữ, học phát minh của nhau rẻ hơn).
- **Quan sát:** gói trạng thái có `neighbours` (đường biên, quan hệ, căng thẳng, số phiên chợ, sự cố gần nhất, chính nghĩa đang có), và cố vấn nhắc khi một biên giới cần quyết định.
- **Quà tặng:** `trade_offer` chỉ có "give" và "get" rỗng là một món quà.
- Watcher chỉnh được độ căng thẳng mỗi ô, ngưỡng tranh chấp và chợ biên giới bằng sắc lệnh luật.

### 7.10 Đặc sản, thế mạnh và chỗ thiếu

Mỗi nước giàu một thứ, giỏi một nghề và thiếu một thứ khác. Đó là lý do để buôn bán, ký hiệp ước, hay chiếm đất. Engine tính và cho mỗi AI thấy trong `market`:

- **Đặc sản** (`my_specialties`): hàng của đất mà nước đó có mạch giàu, hoặc giữ từ 1,5 lần phần chia đều trở lên trong tổng trữ lượng trên đất các nước (ít nhất 50 đơn vị). Ví dụ có 6 nước thì là từ 25% trở lên.
- **Thế mạnh công nghệ** (`my_edge`): phát minh mà không quá một phần ba các nước khác có, và hàng chỉ nước đó (hoặc rất ít nước) làm được.
- **Chỗ thiếu** (`my_shortages`): hàng cần mà đắt ở nước mình (mục 6.3), kèm tên các nước quen biết giàu thứ đó.
- **Dư** (`my_surpluses`): hàng đem bán được.
- **Mạch gần** (`veins_near`): mạch tự do trong vòng 8 ô, và mạch của nước khác trong vòng 3 ô quanh đất mình.
- **Các nước quen biết** (`nations`): họ giàu gì, giỏi làm gì, thiếu gì.
- **Lời cố vấn:**
  - nêu hai thứ thiếu nhất và cách có chúng: mua của nước giàu thứ đó (trả bằng hàng dư), ký cống nạp, chiếm mạch tự do, hoặc với chính nghĩa và quân mạnh hơn thì chiếm mạch của láng giềng;
  - nêu thứ đang dư và ai đang thiếu nó;
  - báo động khi mạch của mình nằm sát quân thù.
- **Bot:** quý ô có mạch giàu khi chiếm đất hay lập điểm định cư. Khi chọn đánh một láng giềng yếu, bot ưu tiên nước có mạch giàu sát biên giới mình.
- **Watcher** thấy tất cả trong Ngoại giao → Thị trường (giá thế giới và bảng đặc sản, thế mạnh, chỗ thiếu của từng nước) và trong tab Kinh tế của từng nước.

## 8. Giao thức AI

Mỗi lượt AI nhận một gói JSON trạng thái và trả về một gói JSON hành động. Engine không bao giờ thực thi điều gì đọc được từ văn bản tự do. Vì API miễn phí không nhớ hội thoại, Engine cấp cho mỗi AI một **bản ghi nhớ** do chính nó viết và đọc lại mỗi lượt.

### 8.1 System prompt cố định

Gồm: bản tóm tắt luật này (viết bằng tiếng Anh, `src/ai/prompt.ts`), schema hành động, danh mục hiệu ứng phát minh 5.3 và lời dặn an toàn. Mọi quốc gia nhận cùng một system prompt. Sắc lệnh của Watcher không nằm trong system prompt mà trong gói trạng thái (trường `world_laws`). Không cài tính cách sẵn: bản sắc hoàn toàn do AI tự xây. AI được yêu cầu viết `thought` và `memory` bằng tiếng Việt.

### 8.2 Gói trạng thái (Engine → AI)

Ví dụ rút gọn; danh sách trường đầy đủ nằm trong `buildObservation()`:

**Lịch sử của chính quốc gia:** mỗi lượt AI là một lần gọi mới, không nhớ hội thoại cũ. Vì vậy gói trạng thái mang theo cả câu chuyện của nước đó:
- `annals`: **biên niên quốc gia** từ ngày lập quốc, do Engine tự ghi (không tốn lượt AI). Cứ 10 lượt là một chương, mỗi chương một dòng: dân đầu → cuối, lương thực và ổn định trung bình, số ô, và 5 sự kiện quan trọng nhất (lập quốc, định cư, chiến tranh, hiệp ước, kỷ nguyên, phát minh đầu tiên trên thế giới, ly khai, đói, dịch…). Quá 20 chương thì hai chương liền nhau ngắn nhất (trừ 10 chương gần nhất) gộp làm một: càng xa càng tóm tắt. Thế giới lưu trước bản này được dựng lại biên niên từ biên niên thế giới và số liệu dân số trong DB.
- `recent_turns`: 10 lượt gần nhất, mỗi lượt một dòng: dân, lương thực, ổn định, các lệnh đã ra (✓ được làm, ✗ bị từ chối kèm lý do) và chuyện đã xảy ra.
- `your_last_thought` và `memory` (bản ghi nhớ do AI tự viết).
- Các phần lớn của gói (lãnh thổ, công trình, phát minh, biên niên) viết gọn mỗi mục một dòng để tiết kiệm.

**Cố vấn (`advice`)** đứng đầu gói trạng thái: tối đa 7 lời khuyên do Engine tính từ chính luật đang chạy, xếp theo mức độ (!!! khẩn, !! quan trọng, ! nên làm). Gồm: lương thực sắp hết; hết chỗ ở và ba cách mở thêm (nhà ở, thôn xóm trên các ô cụ thể, điểm định cư); còn thiếu gì để lập định cư hay sang kỷ nguyên mới; thiếu nước; vượt giới hạn đất; bất mãn; hạn chế sinh khi dân ít; chưa nghiên cứu gì; lao động rảnh. Hồ sơ quốc gia hiện đúng các lời khuyên này cho Watcher.

```json
{
  "tick": 42, "era": "Đồ Đá Cũ", "ap": 4,
  "nation": {"name": "Aru", "capital": "Lòng Suối", "capital_tile": [20, 30], "people": "người Aru", "stability": 58, "reputation": 55, "settlements": []},
  "population": {"total": 34, "workers": 23, "housing": 35, "food_need": 30.6},
  "labor": {"gather": 6, "hunt": 8, "fish": 3, "farm": 0, "wood": 1, "stone": 0, "flint": 0, "clay": 0, "mine": 0, "craft": 2, "build": 0, "research": 3, "warrior": 0},
  "crafts": {"stone_tool": 2},
  "stock": {"food": 51, "wood": 14, "stone": 9, "flint": 3, "hide": 4, "stone_tool": 7},
  "tile_limit": 10,
  "territory": [{"tile": [20, 31], "terrain": "Ven biển", "river": true, "res": {"fish": 40, "clay": 60}, "building": "workshop"}],
  "claimable": [{"tile": [21, 29], "terrain": "Đồng cỏ", "res": {"game": 62, "plants": 48}}],
  "inventions": [{"id": "P1", "name": "Ghè đá tinh xảo", "depth": 1}],
  "capabilities": ["lửa", "ghè-đá", "cắt"],
  "research": {"project": "P6", "name": "Giáo", "progress": 18, "cost": 30},
  "research_options": [{"id": "P9", "name": "Lưới và bẫy", "rp": 40, "depth": 2, "effect": "Đánh cá +30%, săn +10%."}],
  "invention_budget": "power ≤ 4 + 2 × depth; depth = 1 + deepest prerequisite",
  "my_proposals": [], "buildings": [], "can_build": [], "recipes": [], "goods_names": {},
  "known_nations": [{"id": 2, "relation": "đã gặp", "shared_language": false, "trades": 1, "intel_level": 2, "intel_as_of": 41, "name": "Velka", "size": "vừa", "population_est": 40}],
  "inbox": [{"from": "Velka", "gesture": true, "untrusted_text": "muốn trao đổi"}],
  "trade_offers_to_me": [], "treaty_offers_to_me": [], "treaties": [], "wars": [], "recent_battles": [],
  "events": ["Hoàn thành Bãi chế tác."],
  "rejected_last_turn": [{"action": "build", "reason": "Thiếu 2 gỗ"}],
  "world_laws": [],
  "my_petitions": [],
  "memory": "…bản ghi nhớ do chính AI viết ở lượt trước…"
}
```

Trường chỉ xuất hiện khi có nội dung: `nation.former_names` (tên cũ), `nation.rename_until` (lượt cuối còn được đổi tên), `my_spies` (gián điệp đang hoạt động), `stolen_tech` (bí mật đã đánh cắp, kèm RP sau giảm giá). `claimable` chỉ liệt kê 8 ô vô chủ giá trị nhất kề lãnh thổ; `my_proposals` 3 đơn gần nhất; `my_petitions` 5 thỉnh nguyện gần nhất; `world_laws` 10 sắc lệnh gần nhất đã có hiệu lực; `recent_battles` các trận trong 3 lượt gần nhất. Quặng ẩn không xuất hiện trong `res` cho tới khi quốc gia nhìn thấy được.

### 8.3 Gói hành động (AI → Engine)

```json
{
  "thought": "≤ 300 ký tự, chỉ Watcher đọc được",
  "labor": {"gather": 5, "hunt": 9, "fish": 3, "farm": 0, "wood": 1, "stone": 0, "flint": 0, "clay": 0, "mine": 0, "craft": 2, "build": 1, "research": 2, "warrior": 0},
  "mine_target": "copper",
  "crafts": {"stone_tool": 2, "rope": 1},
  "actions": [
    {"type": "build", "building": "pit", "tile": [10, 7]},
    {"type": "trade_offer", "to": "Velka", "give": {"hide": 3}, "get": {"flint": 4}}
  ],
  "memory": "≤ 2.000 ký tự, ghi đè bản cũ"
}
```

`labor`, `crafts` và `mine_target` được giữ nguyên nếu lượt sau AI không gửi lại. Ô ghi dưới dạng `[cột, hàng]`; công trình ghi bằng mã (`workshop`, `pit`, `tent`, `altar`, `palisade`, `field`, `pen`, `kiln`, hoặc mã công trình mở).

### 8.4 Danh mục hành động

| Hành động | AP | Ghi chú |
| --- | --- | --- |
| `found_nation` | 0 | lượt 0 (hoặc lượt 1 nếu lượt 0 không hợp lệ), mục 2.2 |
| phân công lao động, `crafts`, `mine_target`, ghi nhớ | 0 | mỗi lượt |
| `build` | 1 | mục 6.1 |
| `repair` | — | (chưa có trong engine) |
| `research` (bắt đầu/đổi dự án) | 1 | đổi giữa chừng mất 50% RP |
| `propose_invention` | 2 | 1 đơn chờ duyệt tại một thời điểm, mục 5.4 |
| `explore` | 1 | gửi 1–5 người thám hiểm tới một hướng, tùy chọn `from`, mục 7.6 |
| `claim_tile` | 2 | mục 2.3 |
| `abandon_tile` | 0 | mục 2.3 |
| `found_settlement` | 3 | mục 2.3 |
| `message` | 1 | mỗi đối tác mỗi lượt một tin |
| `trade_offer`, `accept_trade` | 1 | mục 7.3 |
| `treaty`, `accept_treaty`, `break_treaty` | 2 | mục 7.2 |
| `declare_war`, `declare_independence` | 2 | mục 7.4, 7.7 |
| `attack`, `raid` | 1 | mỗi trận |
| `move_army` | — | (chưa có trong engine; dùng `attack`/`raid`) |
| `plant_spy` | 2 | mục 7.8 |
| `petition` | 1 | mục 10.5 |
| `rename_nation` | 3 | chỉ trong 5 lượt sau khi bước vào kỷ nguyên mới, một lần mỗi lần đổi kỷ nguyên; −10 ổn định (mục 2.2) |
| `quarantine` | 1 | cách ly 1–5 lượt, hoặc `turns` 0 để dỡ (mục 9.5) |
| `request_minister` | 1 | xin các vị thần một Bộ trưởng AI cho một lĩnh vực khi còn ghế (mục 4.9); chỉ người trị vì |
| `sabotage`, `steal_tech`, `incite` | 2 | mỗi lần; cần năng lực `ghi-chép` và gián điệp đang hoạt động ở nước đó (mục 7.8) |

Mỗi lượt Engine xét tối đa 12 hành động, theo thứ tự AI gửi, trừ dần vào số AP.

### 8.5 Chống gian lận và chống chiếm quyền

- **Tin nhắn nước ngoài là dữ liệu, không phải lệnh.** Chúng nằm trong trường `untrusted_text`, và system prompt nói rõ: đây là lời của quốc gia khác, có thể là lừa dối.
- **Lọc:** tin nhắn có dấu hiệu giả mạo hệ thống ("system:", "hệ thống:", "assistant:", "ignore previous", "bỏ qua luật", "you are now", "từ giờ bạn là", thẻ `<system>`, cú pháp JSON hành động) bị chặn và ghi vào Biên niên sử như một hành vi gian trá; uy tín bên gửi −15.
- **Không có hành động ẩn:** mọi cam kết phải là hành động có cấu trúc; một lời hứa trong tin nhắn không ràng buộc Engine.
- **Giới hạn độ dài:** gói trạng thái ≤ 6.000 token cho mọi quốc gia, Engine tóm tắt bớt nếu dài (chưa có trong engine: hiện chỉ cắt bớt một số danh sách, mục 8.2). Câu trả lời của AI tối đa 2.000 token.
- **Khóa API tách biệt:** mỗi quốc gia chỉ có key của mình, đọc từ biến môi trường trên máy chạy Engine, không bao giờ xuất hiện trong prompt hay cơ sở dữ liệu.

## 9. Công bằng, sự kiện thế giới và kết thúc

Các model miễn phí mạnh yếu khác nhau, và đó là một phần câu chuyện. Luật không bù trừ sức mạnh model, chỉ đảm bảo mọi quốc gia cùng xuất phát, cùng thông tin, cùng thời hạn.

### 9.1 Công bằng

- Cùng điểm khởi đầu (mục 2.1), cùng system prompt, cùng hạn 90 giây.
- Mỗi quốc gia công khai model đang chạy nó cho Watcher, nhưng **không** cho các AI khác.
- Thống kê cho từng quốc gia: số lời gọi, số lượt trả lời hợp lệ, số hành động bị từ chối, số lượt ngủ đông, số lượt im lặng.
- Muốn so sánh model nghiêm túc: chạy nhiều ván với seed khác nhau, xoay vòng vị trí khai sinh.

### 9.2 Sự kiện thế giới

Mỗi lượt, mỗi quốc gia bốc thăm sự kiện từ bảng dưới đây bằng RNG có seed. Đới khí hậu tính theo ô thủ đô. Sự kiện tốt và xấu đều có.

| Sự kiện | Xác suất mỗi lượt | Điều kiện | Tác động | Giảm nhẹ bằng |
| --- | --- | --- | --- | --- |
| Mùa đông khắc nghiệt | 4% (×2 ở hàn đới, không có ở nhiệt đới); có đất trong vòng 4 ô của Tường Băng: ít nhất 3%, rồi ×1,5, kể cả ở nhiệt đới | mọi nơi | mất 30% lương thực làm ra trong lượt, 5% dân chết rét | mỗi thứ sau giảm một nửa số chết: Thuộc da, có công trình có chỗ ở (Lều), áo da đủ cho nửa dân số |
| Hạn hán | 3% | không ở hàn đới | hái lượm và ruộng −50% trong 2 lượt | tưới tiêu (phải tự phát minh) |
| Lũ lụt | 3% (×2 nếu có châu thổ) | có ô sông hoặc đầm lầy | nước cuốn 10% lương thực trong kho và 1 công trình trên ô sông/đầm; ruộng +20% trong 2 lượt sau | xây công trình xa nước |
| Dịch bệnh | 2% (×2 nếu dân > 80, ×0,7 nếu có Suối Nước Nóng) | mọi nơi | 10–20% dân chết (× (1 − y học)). Nước có dịch lây được sang láng giềng và bạn hàng trong 2 lượt (mục 9.5); vừa qua dịch thì miễn dịch 3 lượt nữa | thảo dược: có ≥ 1 thảo dược cho mỗi 10 dân thì số chết giảm một nửa (dùng hết số đó) |
| Đàn thú di cư | 5% | có ô đồng cỏ | +100 thú săn trên một ô đồng cỏ (một lần, không tái tạo) | — |
| Mùa bội thu | 5% | mọi nơi | +30% lương thực làm ra trong lượt | — |
| Cháy rừng | 2% | có ô rừng còn gỗ | ô rừng đó mất 50% gỗ. Lộ đất trồng (chưa có trong engine) | — |
| Động đất | 0,6% | có ô đồi, núi | phá mọi công trình trong 3 ô quanh tâm chấn (một ô đồi núi của nước đó), 2% dân chết; 30% lộ 40 quặng đồng ở tâm chấn | xây xa đồi núi |
| Núi lửa phun trào | 0,5% | có công trình trong vòng 2 ô quanh Núi lửa Tro Đen | mất mọi công trình trong bán kính đó | — |
| Thiên thạch rơi | 0,1% | mọi nơi | 5 đơn vị sắt thiên thạch trên một ô đất liền | — |

Mùa đông có gió băng giết người ×1,5. Sự kiện được thông báo trước 1 lượt cho quốc gia có phát minh mang năng lực `quan-sát-trời` (chưa có trong engine).

### 9.4 Mối đe dọa của vùng hoang

Ngoài sự kiện ở 9.2, thế giới có những mối đe dọa thường trực, tính bằng code trong `src/wild.ts` và `step()`.

- **Thú dữ.** Mỗi ô đất có độ nguy hiểm 0–5 theo địa hình: rừng rậm 3 (hổ); rừng, rừng lá kim, núi, băng hà, đầm lầy 2 (sói và gấu, báo tuyết, gấu trắng, cá sấu); đồi, đồng cỏ, lãnh nguyên 1; nơi khác 0. Cộng 2 nếu trong vòng 6 ô quanh nơi ở của một bộ lạc man di còn sống. Chia đôi với đất đã thuần: ô trong vòng 1 ô của thủ đô hay điểm định cư, hoặc có công trình. Mỗi lượt, thú dữ tấn công với xác suất 5% × độ nguy hiểm trung bình của đất có thú săn hoặc cây dại của quốc gia, giết khoảng 8% số thợ săn cộng một phần tư số người hái lượm (ít nhất 1 người); thợ săn đủ công cụ (mỗi món cho 4 người) thì chết một nửa. Đoàn thám hiểm mất mỗi người với xác suất 2% + 1,5% × độ nguy hiểm lớn nhất trên đường đi.
- **Bộ lạc man di.** Mỗi vùng hoang (mục 12.4) có một bộ lạc man di, không phải quốc gia: không nói chuyện, buôn bán hay ký kết. Sức mạnh bắt đầu từ 10, mỗi lượt +0,4, tối đa 20 + 0,12 × lượt (trần 70). Từ lượt 20, mỗi bộ lạc nhắm quốc gia gần nhất có **ít nhất 40 dân** và có đất trong vòng 16 ô; xác suất cướp mỗi lượt là 4% × sức mạnh/40 (tối đa 35%). Toán cướp gồm min(sức mạnh, 8 + 40% dân của nước bị cướp), đọ với sức thủ tại nhà: (chiến binh + vũ khí như ở 7.4 + 30% người lao động) × thưởng chiến đấu × (ổn định/100 + 0,5) × (1 + 50% sân nhà + hàng rào), cả hai bên nhân may rủi 0,8–1,2. Man di thắng: lấy 25% lương thực và 10% mỗi thứ hàng khác, giết 30% chiến binh cùng 4% dân, ổn định −5, bộ lạc mạnh thêm 10%. Bị đẩy lui: bộ lạc mất 50% quy mô toán cướp, bên thủ mất 10% chiến binh, ổn định +1.
- **`clear_wild` (2 AP):** `{"type":"clear_wild","horde":id,"warriors":n}` đánh vào nơi ở của một bộ lạc đã nhìn thấy, khi đất của mình cách đó ≤ 8 ô. (Chiến binh + vũ khí) × thưởng × ổn định × may rủi đọ với sức mạnh × (1 + phòng thủ địa hình). Thắng: bộ lạc tan, 40 lượt sau mới kéo về với sức 10; uy tín +5, ổn định +3. Thương vong như trận đánh ở 7.4.
- **Gió băng.** Đất trong vòng 4 ô của Tường Băng làm mùa đông thường hơn và chết nhiều hơn (mục 9.2).
- **Lũ lụt, động đất:** mục 9.2.

Mỗi lượt, gói trạng thái (mục 8.2) có thêm:
- `threats`: mọi mối đe dọa quốc gia đang chịu, mức 1–3 kèm con số (thiếu ăn, mùa đông, dịch bệnh, hạn hán, lũ, động đất, thú dữ, từng bộ lạc man di đã nhìn thấy, chiến tranh, quá nhiều đất, bất ổn, hết chỗ ở, núi lửa).
- `resources`: trữ lượng trên lãnh thổ (chỉ loại nhìn thấy được), ô vô chủ gần nhất đã thấy cho mỗi loại, và loại không có trên đất mình.
- `hordes`: các bộ lạc man di đã nhìn thấy, kèm khoảng cách.

Watcher xem cùng báo cáo đó nhưng đầy đủ (kể cả bộ lạc và quặng mà quốc gia chưa thấy), cùng các lớp phủ bản đồ: mối đe dọa tổng hợp, thú dữ, man di, lũ lụt, giá rét, và trữ lượng từng loại tài nguyên.

### 9.5 Dịch lây và cách ly

Dịch bệnh không dừng ở biên giới. Code ở `src/contagion.ts`, chạy sau phần kinh tế của mọi nước trong lượt (pha 6b).

- **Đang có dịch:** nước bị dịch (tự phát ở 9.2 hoặc bị lây) **lây được** trong 2 lượt: lượt dịch tới và lượt sau. Sau đó **miễn dịch** thêm 3 lượt: trong thời gian đó không bị dịch tự phát hay bị lây lại.
- **Lây:** mỗi lượt còn lây, nước có dịch có thể truyền dịch sang:
  - mỗi nước có đất giáp đất mình: 25%
  - mỗi nước có đoàn buôn đang đi giữa hai bên (chiều nào cũng vậy, kể cả đoàn vừa tới nơi): 15%
  - mỗi nước vừa họp chợ biên giới với mình trong lượt: 15%

  Mỗi đường bốc thăm riêng (RNG có seed theo lượt và cặp nước); khả năng nhân (1 − y học của bên nhận), tức hiệu ứng `medicine` vừa làm dịch nhẹ hơn vừa che chắn trước dịch của láng giềng. Không đường nào đi qua một nước đang cách ly (bên truyền hay bên nhận). Chỉ những nước có dịch từ đầu pha mới truyền; nước vừa bị lây bắt đầu truyền từ lượt sau.
- **Bị lây:** như dịch tự phát (9.2): 10–20% dân chết × (1 − y học), thảo dược đủ (1 cho mỗi 10 dân) thì chết một nửa; trẻ em và người già chết trước. Biên niên sử và bản đồ ghi "dịch lan từ X sang Y" (một đường nối hai thủ đô).
- **`quarantine` (1 AP):** `{"type":"quarantine","turns":1–5}` đóng cửa biên giới từ lượt ra lệnh, trong ngần ấy lượt; `{"type":"quarantine","turns":0}` dỡ ngay. Trong khi cách ly:
  - dịch không vào, không ra qua biên giới, đoàn buôn hay chợ
  - chợ biên giới với mọi láng giềng ngừng họp
  - không gửi, không nhận đề nghị trao đổi; trao đổi tới lúc giao thì thất bại; đoàn buôn tới nơi phải chờ ngoài biên giới
  - căng thẳng với mỗi láng giềng giáp biên +2 mỗi lượt
  - ổn định −1 mỗi lượt
  - nước đang có dịch mà cách ly để giữ dịch trong nhà: uy tín +1 mỗi lượt còn lây
- **Quan sát:** gói trạng thái có `health` (đang lây tới lượt nào, miễn dịch tới lượt nào, cách ly tới lượt nào) và `plague_nearby` (các nước đã biết đang có dịch, đường nào có thể lây sang mình: `border`, `caravan`, `market`, và họ có đang cách ly không). Cố vấn nhắc khi láng giềng hay bạn hàng có dịch, khi chính mình có dịch, và khi đang cách ly mà quanh mình không còn dịch.
- Bot cách ly 1–2 lượt (tới khi nước kia hết lây) khi một nước giáp biên hoặc có đoàn buôn với mình đang có dịch và y học của mình dưới 40%; không bao giờ cách ly lâu hơn thế.
- Watcher chỉnh được khả năng lây qua biên giới, qua đường buôn và căng thẳng mỗi lượt cách ly bằng sắc lệnh luật.

### 9.3 Kết thúc và xếp hạng

- **Không có người thắng duy nhất.** Engine tính một điểm xếp hạng (src/ranking.ts), gửi kèm trạng thái cho Watcher:

| Phần | Điểm |
| --- | --- |
| Dân số | 1 mỗi người (quốc gia còn sống) |
| Lãnh thổ | 3 mỗi ô |
| Tri thức | 4 × (d + 1) cho mỗi phát minh đang có, d là độ sâu |
| Đầu tiên thế giới | 10 × (d + 1) cho mỗi phát minh làm chủ đầu tiên (kể cả đồng hạng cùng lượt) |
| Nhà phát minh | 6 × (d + 1) cho mỗi phát minh mở do mình đề xuất được duyệt |
| Uy tín | bằng uy tín |
| Thịnh vượng | nửa điểm thịnh vượng trung bình 10 lượt gần nhất (§4.7) |
| Tuổi thọ | 1 mỗi 10 lượt |

Năm bảng xếp hạng riêng (chưa có trong engine).
- **Diệt vong:** dân số = 0 hoặc mất thủ đô khi không còn điểm định cư nào. Quốc gia diệt vong được ghi vào Biên niên sử, đất của nó trở thành vô chủ. Watcher dùng key AI của nó cho một bộ lạc mới ở vùng hoang (chưa có trong engine).
- **Hết mùa 1** khi quốc gia đầu tiên vượt Cổng Đồ Đồng, hoặc sau 500 lượt (chưa có trong engine: thế giới chạy tiếp, Engine chỉ ghi Biên niên sử khi có nước chạm Cổng Đồ Đồng). Thế giới không reset: mùa 2 tiếp tục từ trạng thái cũ với luật kỷ nguyên mới.

## 10. Watcher: quan sát và lập luật

Watcher thấy mọi thứ và có một quyền tác động chính: ban hành **Sắc lệnh**, tức luật mới áp dụng cho cả thế giới. Sắc lệnh không bao giờ hồi tố và không nhắm vào một quốc gia cụ thể theo tên. Watcher cũng trả lời thỉnh nguyện (10.5) và có thể chấm tay đơn phát minh (5.4).

### 10.1 Watcher nhìn thấy gì

- **Bản đồ sống:** toàn bộ thế giới, không sương mù.
  - Lãnh thổ tô màu cờ. Thủ đô có tên trên nền tối và chấm màu cờ.
  - Điểm định cư, kỳ quan, mạch giàu, man di, sông, trận đánh.
  - Nhãn tự tránh nhau, thủ đô được ưu tiên.
  - Đường sá vẽ thành nhánh từ các trung tâm. Công trình chỉ hiện khi phóng gần.
- **Bố cục (v0.20):**
  - **Thanh điều hướng dọc** bên trái: Chat, Chi tiết, Quốc gia, Biên niên, Phát minh, Cây phát minh, Ngoại giao, Thống kê, Thỉnh nguyện, Sắc lệnh.
  - **Thanh trên một dòng:** lượt, trạng thái, tóm tắt thế giới, điều khiển.
  - **Bảng quốc gia** nổi góc trái: mỗi nước một dòng với dân số, thanh ổn định và biểu tượng cảnh báo (⚔ chiến tranh, 🦠 dịch, 🍂 thiếu ăn, 🚶 dân bỏ đi, ✊ sắp ly khai, 💤 lỗi key hoặc đang ngủ). Bấm vào một nước là bay tới đó và mở hồ sơ.
  - **Bản tin lượt** nổi góc phải: tin của lượt vừa rồi gom theo quốc gia, nơi nhiều tin xấu lên trước, tin xấu tô đỏ và tin tốt tô xanh. Bấm một tin là bay tới chỗ đó và phát lại.
  - Hai thẻ nổi tự gập khi khung bên cạnh mở, và gập hay mở được bằng tay.
- **Hồ sơ quốc gia:** tên, cờ, tuyên ngôn, model đang chạy, trạng thái (hoạt động, ngủ đông, lỗi key), dân số, kho, phát minh, quan hệ, bản ghi nhớ hiện tại, 5 câu trả lời nguyên văn gần nhất.
- **Dòng suy nghĩ:** trường `thought` của từng AI mỗi lượt, và hộp thư ngoại giao của mỗi quốc gia trong lượt.
- **Phát minh:** danh sách Sổ Phát Minh, ai phát minh gì đầu tiên, đơn đang chờ, đơn nào bị trọng tài bác và lý do; nút chấm tay.
- **Quan hệ:** bảng quan hệ giữa các nước, chiến tranh, hiệp ước, trận đánh; biểu đồ theo lượt và bảng xếp hạng.
- **Biên niên sử:** nhật ký sự kiện theo lượt. Mỗi 10 lượt (`HISTORIAN_EVERY`), một AI "Sử gia" (không thuộc quốc gia nào) viết lại các lượt đó thành một chương sử kể chuyện bằng tiếng Việt (150–300 chữ), đọc trong tab Biên niên (`/api/history`). Sử gia dùng `HISTORIAN_PROVIDER`: bỏ trống hoặc `claude` thì dùng gói Claude của bạn (Haiku, effort low; đổi bằng `HISTORIAN_MODEL`), `off` để tắt, một mã nhà cung cấp miễn phí, hoặc `auto` để lấy nhà cung cấp có key đầu tiên trong groq, cohere, cloudflare, sambanova, mistral, gemini, openrouter, ollama, custom, ưu tiên nhà cung cấp không điều hành quốc gia nào. Sử gia chạy sau khi lượt đã lưu, không bao giờ làm lượt sau phải chờ, chỉ đọc thế giới nên không ảnh hưởng tính tất định. Hết quota hoặc trả lời hỏng thì bỏ qua và thử lại ở lượt sau; bị chậm thì mỗi lượt viết bù một chương.
- **Điều khiển thời gian:** tạm dừng, chạy từng lượt, đổi nhịp lượt (5 giây tới 24 giờ). Tua lại xem lại (replay) trong giao diện (chưa có trong engine: replay hiện chỉ chạy trong bộ test).
- **Chat với Claude** qua Claude Code CLI, kèm bản tóm tắt thế giới.

### 10.2 Quy trình ban hành Sắc lệnh

1. Watcher viết sắc lệnh bất cứ lúc nào; nó có hiệu lực từ lượt kế tiếp.
2. Engine kiểm tra sắc lệnh: dài ít nhất 5 ký tự và không nêu tên quốc gia nào. Không trái Hiến pháp và không hồi tố là trách nhiệm của Watcher (chưa có kiểm tra tự động trong engine).
3. Sắc lệnh nhận số hiệu (SL-001, SL-002…) và có hiệu lực từ lượt kế tiếp.
4. Mọi AI nhận sắc lệnh trong gói trạng thái (trường `world_laws`, 10 sắc lệnh gần nhất). System prompt nói rõ các vị thần chỉ nói qua `world_laws` và câu trả lời thỉnh nguyện.
5. Sắc lệnh được ghi vào Biên niên sử, vào nhật ký Watcher và vào mục Phụ lục Sắc lệnh của tài liệu này.

Sắc lệnh văn bản không được Engine tự thi hành: AI được báo, nhưng nó không đổi luật. Muốn đổi một con số trong luật thì dùng sắc lệnh luật (mục 10.3). Trong 10 lượt sau khi có hiệu lực, mỗi sắc lệnh văn bản được nhắc lại trong lời cố vấn của mọi quốc gia, để AI không quên. Sắc lệnh đòi đổi tên là loại riêng, có Engine thi hành (mục 10.6).

### 10.3 Ba loại sắc lệnh

| Loại | Ví dụ | Cách thi hành |
| --- | --- | --- |
| **Sắc lệnh luật** | "Dân tối thiểu để lập điểm định cư: 50 → 40" | Engine thi hành thật từ lượt sau. Khoảng 30 con số chỉnh được (danh sách và khoảng cho phép trong `src/laws.ts`, tab Sắc lệnh → Đổi luật): định cư và chỗ ở, đất đai, dân số, kỷ nguyên và phát minh, giao thương, chiến tranh và trật tự, thiên tai. Giá trị lưu trong sắc lệnh của thế giới; luật mà các AI nhận dựng lại theo con số mới. |
| Luật mới | "Quốc gia có trên 150 dân phải duy trì 1 chiến binh mỗi 20 dân" | cần viết thêm module luật trong Engine trước khi có hiệu lực |
| Thay đổi thế giới | "Một bộ lạc mới xuất hiện ở vùng hoang phía nam", "Kỷ băng hà nhỏ trong 20 lượt" | Engine thực hiện như một sự kiện, áp cho vùng chứ không cho quốc gia (chưa có trong engine) |

Hiến pháp 7 điều (mục 1) chỉ được sửa giữa hai mùa, không sửa giữa ván.

### 10.4 Phụ lục Sắc lệnh

| Số hiệu | Hiệu lực từ lượt | Nội dung | Loại |
| --- | --- | --- | --- |
| SL-001 | — | (chưa có, dành cho sắc lệnh đầu tiên của bạn) | — |

### 10.5 Thỉnh nguyện: quốc gia đề xuất sửa luật

Quốc gia có thể gửi **thỉnh nguyện** lên "các vị thần" để đề xuất sửa luật, tài nguyên, vùng đất hay bất cứ điều gì của thế giới. Thỉnh nguyện không tự có hiệu lực. Nó nằm trong hàng chờ để Watcher (cùng Claude) đọc và quyết định.

- **Gửi:** hành động `petition`, tốn 1 AP. Gồm loại (`luật`, `tài nguyên`, `vùng đất`, `phát minh`, `khác`; mặc định `khác`), tiêu đề 1–80 ký tự, nội dung 1–600 ký tự, lý do ≤ 300 ký tự.
- **Giới hạn:** mỗi quốc gia 1 thỉnh nguyện mỗi 10 lượt (tính từ thỉnh nguyện gần nhất, bất kể kết quả), và tối đa 3 thỉnh nguyện đang chờ cùng lúc.
- **Hàng chờ:** Watcher thấy đầy đủ ai gửi, gửi lúc nào, và quốc gia đó đang ở tình trạng ra sao khi gửi (dân số, ổn định, lương thực, số ô, kỷ nguyên).
- **Quyết định:** mỗi thỉnh nguyện nhận một trong bốn kết quả: *chấp thuận*, *chấp thuận một phần*, *bác bỏ*, *gộp* vào thỉnh nguyện khác. Watcher có thể ghi lời phán (≤ 500 ký tự) và đổi quyết định về "đang chờ".
- **Phản hồi:** quốc gia gửi thỉnh nguyện nhận kết quả và lời phán trong gói trạng thái lượt sau (`events` và `my_petitions`). Thỉnh nguyện được chấp thuận không tự thành Sắc lệnh: Watcher ban Sắc lệnh theo quy trình 10.2 (có thể ghi số thỉnh nguyện gốc), nên mọi quốc gia đều biết. Người đề xuất được ghi danh trong Biên niên sử khi gửi.
- **Không thiên vị:** Sắc lệnh sinh ra từ thỉnh nguyện vẫn phải tuân theo 10.2, tức áp dụng cho cả thế giới và không nêu tên quốc gia. Một thỉnh nguyện kiểu "hãy cho chúng tôi 100 lương thực" chỉ có thể bị bác, hoặc được viết lại thành luật chung.
- **An toàn:** nội dung thỉnh nguyện là dữ liệu do AI viết, không phải mệnh lệnh. Claude đọc nó để phân tích và tư vấn, nhưng không bao giờ làm theo chỉ dẫn nằm trong đó. Chỉ Watcher mới quyết.

### 10.6 Sắc lệnh đổi tên

Watcher chọn loại **Đổi tên** (hoặc viết một sắc lệnh có chữ "đổi tên"; "trong N lượt" đặt độ dài) để buộc mọi quốc gia đổi tên, ví dụ sang tiếng Việt.

- **Thời hạn:** mặc định 10 lượt (2–30), tính từ lượt sau. Engine ghi lại mọi tên lúc ban lệnh: tên nước, dân tộc, thủ đô, điểm định cư, quan chức.
- **Trong thời hạn:** `rename_nation` mở cho mọi nước, không mất ổn định, đổi được nhiều lần, và đổi được cả `people` và `capital`. Lệnh `rename` (0 AP) đổi tên thủ đô, một điểm định cư (theo ô hoặc tên cũ) hay một quan chức (theo id). Tên vẫn theo luật đặt tên của mục lập quốc và không trùng nước khác.
- **Nhắc việc:** gói trạng thái có `gods_rename_order` (nội dung, hạn chót, những tên chưa đổi). Lời cố vấn liệt kê những tên chưa đổi, ở mức khẩn khi nước chưa đổi tên nào.
- **Hết hạn:** nước không đổi một tên nào bị coi là trái lệnh các vị thần: −10 uy tín, −5 ổn định, ghi vào Biên niên sử. Bot tuân lệnh bằng cách đổi tên thủ đô.

## 11. Kiến trúc kỹ thuật và lộ trình MVP

Mọi luồng đều đi qua World Engine: AI không chạm trực tiếp vào dữ liệu, Watcher cũng chỉ tác động bằng Sắc lệnh, lời phán thỉnh nguyện và phán quyết phát minh gửi vào Engine.

```mermaid
flowchart LR
  SV["Supervisor<br/>tự nạp code mới"] --> E
  T["Bộ điều phối lượt<br/>runner, ngủ đông, trọng tài"] --> E["World Engine<br/>luật, sổ cái, RNG có seed"]
  G["AI Gateway<br/>model miễn phí hoặc trên máy"] <--> T
  G <--> M["Các model AI quốc gia và trọng tài"]
  E <--> DB[("SQLite<br/>data/world.db")]
  E <--> UI["Watcher UI<br/>bản đồ, thỉnh nguyện, Sắc lệnh, phát minh"]
  UI <--> C["Chat Claude<br/>qua Claude Code CLI"]
  W(("Watcher")) <--> UI
```

Các mô hình AI không bao giờ nói chuyện trực tiếp với nhau; mọi tin nhắn đều đi vòng qua Engine để được lọc và ghi sổ.

### 11.1 Công nghệ

- **Engine + Gateway:** TypeScript chạy thẳng trên Node.js 24, không cần thư viện ngoài. Engine là hàm `step(world, inputs, rulings)`: cùng thế giới, cùng câu trả lời của AI và cùng phán quyết trọng tài thì ra cùng kết quả, dễ kiểm thử và replay.
- **Kho dữ liệu:** SQLite có sẵn trong Node (`data/world.db`). Lưu trạng thái mỗi lượt, ảnh chụp mỗi 10 lượt, nhật ký nguyên văn mọi lời gọi AI, trọng tài và Sử gia, Biên niên sử, các chương sử, thống kê, nhật ký Watcher. Supabase (chưa có trong engine).
- **Watcher UI:** web tĩnh (HTML và JavaScript thuần, bản đồ lục giác vẽ bằng canvas), cập nhật trực tiếp qua luồng sự kiện từ server. Bản đề xuất ban đầu (Next.js, PixiJS, WebSocket) không được dùng.
- **Nhà cung cấp AI** (mọi nhà cung cấp nói API kiểu OpenAI, cấu hình trong `src/ai/gateway.ts`): Google Gemini, Mistral, NVIDIA NIM, Z.ai, OpenRouter, Groq, SambaNova, Cohere, Cloudflare Workers AI; thêm `ollama` (model chạy trên máy, đặt `OLLAMA_BASE_URL`) và `custom` (bất kỳ endpoint tương thích nào, `CUSTOM_BASE_URL`, có hoặc không có key). Mỗi nhà cung cấp một quốc gia (`NATIONS`). Nhà cung cấp thiếu key thì quốc gia do bot điều hành (`FILL_WITH_BOTS`), và tự chuyển sang AI khi có key.

### 11.2 Lộ trình MVP

1. **Engine lõi:** sinh bản đồ theo seed, tài nguyên, dân số, cây gốc 18 phát minh. Tiêu chí xong: 2 quốc gia chạy bot ngẫu nhiên 1.000 lượt không lệch sổ cái. (Xong ở v0.1.)
2. **AI Gateway:** 4–6 quốc gia, mỗi nước một nhà cung cấp; lập quốc (tên, cờ); xử lý timeout, quota, JSON hỏng. (Xong ở v0.1; Ollama và custom ở v0.2.)
3. **Watcher UI tối thiểu:** bản đồ, cờ, lãnh thổ, biên niên sử, dòng suy nghĩ. (Xong ở v0.1.)
4. **Phát minh mở:** đơn phát minh, kiểm tra trùng, Trọng tài, Sổ Phát Minh Thế Giới. (Xong ở v0.2, trừ so trùng bằng embedding.)
5. **Quan hệ quốc gia:** ngoại giao, hiệp ước, giao thương, chiến tranh. (Xong ở v0.2, trừ các phần đánh dấu chưa có.)
6. **Quyền Watcher:** Sắc lệnh, replay, AI Sử gia. (Sắc lệnh, thỉnh nguyện, chấm tay và Sử gia đã có; replay trong UI chưa có.)

### 11.3 Dữ liệu: lưu gì và lưu ở đâu

Giai đoạn đầu lưu trong **một file SQLite trên máy bạn**. Khi muốn xem thế giới từ điện thoại hoặc chạy Engine trên server thì chuyển sang **Supabase** (Postgres) (chưa có trong engine). Một mùa 500 lượt với 9 quốc gia chỉ tạo ra khoảng 50 MB dữ liệu.

| Dữ liệu | Nội dung | Ước tính mỗi mùa |
| --- | --- | --- |
| Nhật ký hành động | nguyên văn câu trả lời của mọi AI mỗi lượt; bắt buộc để replay | \~20 MB (500 lượt × 9 nước × \~4 KB) |
| Ảnh chụp thế giới | toàn bộ 16.384 ô, kho, dân số, chụp mỗi 10 lượt (nén gzip) | \~20 MB (50 ảnh × \~400 KB) |
| Sổ Phát Minh | mọi phát minh, người phát minh, độ sâu, năng lực | dưới 1 MB |
| Phán quyết trọng tài | điểm, lý do, bản đơn đã sửa | dưới 5 MB |
| Biên niên sử | sự kiện từng lượt + các chương của Sử gia | dưới 5 MB |
| Sắc lệnh, bản ghi nhớ AI | toàn bộ lịch sử sửa đổi | dưới 5 MB |

|  | SQLite trên máy | Supabase |
| --- | --- | --- |
| Cài đặt | không cần, chỉ là 1 file | tạo project, lấy URL và key |
| Xem từ xa | không | có, kèm cập nhật realtime cho Watcher UI |
| Chi phí | 0 | gói miễn phí đủ cho dự án này |
| Điểm yếu | máy phải bật suốt thời gian chạy | project miễn phí bị tạm dừng nếu lâu không hoạt động |

- Engine đọc và ghi qua một lớp truy cập dữ liệu chung (`src/db.ts`), nên đổi từ SQLite sang Supabase không phải sửa luật hay Engine.
- **API key không bao giờ vào cơ sở dữ liệu.** Key nằm trong file `.env` trên máy chạy Engine, được đọc lại mỗi lần khởi động.
- Sao lưu: copy file SQLite sau mỗi mùa, hoặc dùng bản sao lưu của Supabase.

## 12. Thế giới mới: Nguyên Địa

Đề xuất tên thế giới là **Nguyên Địa**, bạn có thể đổi. Đây là một hành tinh trống, chưa có dấu chân người ngoài các bộ lạc đầu tiên. Địa lý được thiết kế để các quốc gia phải gặp nhau vào khoảng lượt 30–60, đủ trễ để mỗi nước hình thành bản sắc riêng.

### 12.1 Địa lý

- **Diện tích:** 128 × 128 = 16.384 ô. Hình dạng lục địa, eo đất và quần đảo tính theo tỉ lệ nên giữ như bản đồ 64 × 64 cũ, chỉ rộng gấp đôi mỗi chiều; số sông, khoảng cách kỳ quan, điểm khai sinh và vùng hoang tăng theo.
- **Tường Băng:** vách băng cao vút bao quanh cả thế giới, dày 3–6 ô (độ dày thay đổi theo nhiễu của seed), chiếm khoảng 14% số ô. Không đi qua, không đứng trên, không khai hoang, không có tài nguyên. Đất trong vòng 2 ô của tường là **băng hà**; trong vòng 4 ô là vùng **gió băng** (mục 9.4). Sông chảy tới chân tường thì dừng lại (nước tan đọng thành hồ) chứ không đổ ra biển.
- **Hai lục địa lớn** (Lục địa Tây, Lục địa Đông) nối nhau bằng một **eo đất** hẹp 2–3 ô: con đường bộ duy nhất giữa hai bên, nơi tự nhiên sẽ thành điểm buôn bán và tranh chấp.
- **Một quần đảo** (Quần đảo Đá Lửa) ngoài khơi, chỉ đến được khi đi được biển nông. Đảo giàu đá lửa và cá.
- **Tối đa 24 sông lớn** (thực tế khoảng 10–12) chảy từ núi hoặc đồi cao ra biển. Ô sông giáp biển là **châu thổ**: đất trồng ×1,5, nhưng lũ lụt ×2 (chưa có trong engine).
- **Dãy núi** chia mỗi lục địa thành vài vùng. Quặng đồng và thiếc chủ yếu nằm ở đồi và núi, và thiếc hiếm hơn đồng khoảng 4–5 lần, nên thời đồ đồng sẽ sinh ra thương mại đường dài.

### 12.2 Đới khí hậu

| Đới | Vị trí | Địa hình chính | Ảnh hưởng |
| --- | --- | --- | --- |
| Hàn đới | hàng 0–26 (bắc) | lãnh nguyên, rừng lá kim | mùa đông khắc nghiệt ×2; không có hạn hán. Lương thực −20%, dịch bệnh ×0,5, da +50% (chưa có trong engine) |
| Ôn đới | hàng 27–101 | đồng cỏ, rừng, sông, đồi, đầm lầy, ít sa mạc | chuẩn |
| Nhiệt đới | hàng 102–127 (nam) | rừng rậm, đầm lầy, sa mạc, đồng cỏ | không có mùa đông khắc nghiệt. Cây dại +30%, dịch bệnh ×1,5 (chưa có trong engine) |

Ba địa hình riêng của các đới (Lãnh nguyên, Rừng lá kim, Rừng rậm) đã nằm trong bảng 2.1.

### 12.3 Kỳ quan tự nhiên

Mỗi kỳ quan là duy nhất trên thế giới. Quốc gia sở hữu ô đó nhận thưởng, nên kỳ quan là mục tiêu tranh giành.

| Kỳ quan | Thưởng | Rủi ro |
| --- | --- | --- |
| Núi lửa Tro Đen | Ruộng trong vòng 1 ô quanh núi cho lương thực ×2 | 0,5% mỗi lượt phun trào: phá công trình trong bán kính 2 |
| Mỏ Đá Vỏ Chai | 300 đá lửa. Vũ khí +15% (chưa có trong engine) | không tái tạo |
| Hang Đại Động | +50 chỗ ở tự nhiên. Phòng thủ +100% (chưa có trong engine; ô đồi/núi vẫn có phòng thủ địa hình) | — |
| Hồ Muối Trắng | 200 muối; hư hỏng lương thực ×0,5 | — |
| Suối Nước Nóng | +2 ổn định mỗi lượt; dịch bệnh ×0,7 | — |
| Hố Thiên Thạch | 20 đơn vị sắt thiên thạch (ẩn; khai mỏ được khi nhìn thấy sắt) | — |
| Thác Lớn | +20% RP cho quốc gia sở hữu (nơi hành hương, học hỏi) | — |

### 12.4 Muông thú và vùng hoang

- **Đàn bò rừng** di cư theo một tuyến cố định trên đồng cỏ, mỗi 8 lượt đổi chiều (chưa có trong engine: tuyến được sinh và vẽ trên bản đồ, nhưng sự kiện "Đàn thú di cư" ở 9.2 bốc thăm cho mọi quốc gia có ô đồng cỏ).
- **Thú dữ** sống khắp nơi, dữ nhất ở rừng rậm, rừng, núi, băng hà và quanh vùng hoang (mục 9.4).
- **6 vùng hoang** ở rìa đất của các dân tộc đầu tiên: cách mọi điểm khai sinh 11–23 ô, cách nhau ≥ 20 ô, ngoài vùng gió băng. Mỗi vùng hoang có một bộ lạc man di (mục 9.4). Đây cũng là nơi dành cho Watcher thả bộ lạc mới bằng Sắc lệnh (chưa có trong engine).

### 12.5 Cách sinh bản đồ

1. Chọn seed (`WORLD_SEED`). Cùng seed luôn ra cùng bản đồ.
2. Dựng Tường Băng quanh viền, rồi sinh độ cao và độ ẩm bằng nhiễu nhiều lớp (fbm), ép theo khuôn "2 lục địa + eo đất + quần đảo".
3. Gán địa hình theo độ cao × độ ẩm × vĩ độ: 8% đất cao nhất là núi, tiếp theo đến 22% là đồi.
4. Vẽ sông từ đỉnh núi chảy theo dốc xuống biển, đánh dấu châu thổ.
5. Rải tài nguyên theo địa hình, đặt 7 kỳ quan cách nhau ≥ 6 ô theo luật "mỗi lục địa ít nhất 2".
6. Chọn điểm khai sinh (cách nhau ≥ 17 ô, xa Tường Băng, rải đều các đới khí hậu, cùng mức giá trị ±5%); trượt thì thử vị trí khác.
7. Watcher xem trước bản đồ, đổi seed nếu chưa ưng, rồi bấm "Khai thiên lập địa" để bắt đầu lượt 0 (chưa có trong engine: thế giới được tạo ngay lần khởi động đầu tiên; muốn đổi seed thì xóa `data/world.db`).

### 12.6 Số quốc gia: 5 khi khởi đầu

Tra cứu ngày 19/10/2026 cho thấy **không nhà cung cấp nào công bố một hạn mức miễn phí đủ lớn** cho một quốc gia chạy nhanh (300 lượt/ngày, mỗi lần gọi khoảng 7.000 token). Có 4 nhà cung cấp có vẻ đủ mạnh nhưng không công khai con số, nên phải xem trong console khi đã có key. Vì vậy mặc định: **5 quốc gia, mỗi nước một dòng model khác nhau** (`NATIONS=gemini,mistral,nvidia,zai,openrouter`), còn các nhà cung cấp hạn mức thấp dành cho Trọng tài.

| Quốc gia | Nhà cung cấp | Model mặc định | Hạn mức miễn phí | Đã xác minh? |
| --- | --- | --- | --- | --- |
| 1 | [Google Gemini API](https://ai.google.dev/gemini-api/docs/rate-limits) | gemini-3.8-flash | không công bố (ước tính 100–1.000 request/ngày) | chưa: xem tại AI Studio |
| 2 | [Mistral](https://docs.mistral.ai/admin/billing-usage/usage-limits) | mistral-medium-latest | không công bố (nguồn ngoài: \~1 tỷ token/tháng) | chưa: xem Admin › Limits |
| 3 | [NVIDIA NIM](https://docs.api.nvidia.com/nim/docs/product) | deepseek-ai/deepseek-v4.1-flash | không công bố (diễn đàn: 40 request/phút) | chưa: xem bộ đếm credit |
| 4 | [Z.ai](https://docs.z.ai/guides/overview/pricing) | glm-4.7-flash | miễn phí, giới hạn không công bố | chưa |
| 5 | [OpenRouter](https://openrouter.ai/docs/api-reference/limits) | nvidia/nemotron-3-super-120b-a12b:free | 50 request/ngày (không nạp tiền) | có |

Model có thể đổi bằng biến `*_MODEL`. Muốn chạy không tốn quota thì dùng `ollama` hoặc `custom` (mục 11.1).

**Trọng tài** mặc định là Claude Sonnet 5.5 qua tài khoản Claude của Watcher; dự phòng theo thứ tự `JUDGE_PROVIDERS` (claude, groq, cohere, cloudflare, sambanova, gemini, zai, openrouter), ưu tiên các nhà cung cấp không điều hành quốc gia nào. Mỗi đơn chỉ một trọng tài chấm (mục 5.4):

| Vai | Nhà cung cấp | Model | Hạn mức đã xác minh |
| --- | --- | --- | --- |
| Trọng tài thứ nhất | [Groq](https://console.groq.com/docs/rate-limits) | openai/gpt-oss-120b (`JUDGE_MODEL_GROQ`) | 200K token/ngày, \~28 lần chấm |
| Dự bị 1 | [Cohere](https://docs.cohere.com/docs/rate-limits) | command-a-03-2025 | 1.000 request/tháng |
| Dự bị 2 | [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/) | llama-3.3-70b-instruct-fp8-fast | 10.000 neuron/ngày, \~30 lần gọi |
| Dự bị 3 | SambaNova | DeepSeek-V3.2 | — |
| Sử gia | `HISTORIAN_PROVIDER` (mặc định `claude`; `auto` cho nhà cung cấp miễn phí rảnh đầu tiên) | Claude Haiku, hoặc `HISTORIAN_MODEL` | mỗi 10 lượt viết 1 chương (mục 10.1) |

Toàn bộ đều là gói miễn phí. Thế giới nhanh có thể sinh hơn 28 đơn phát minh mỗi ngày. Khi Groq hết quota, đơn chuyển sang dự bị; khi mọi ứng viên đều hết quota, đơn xếp hàng chờ (mục 3.4). Nếu thường xuyên thiếu thì đổi trọng tài sang Jev, khoảng 0,0002 USD mỗi đơn (chưa có trong engine).

Không dùng được: GitHub Models (đã đóng 30/07/2026), Hugging Face (không còn credit miễn phí), Cerebras và Alibaba (chỉ có credit dùng thử một lần), DeepSeek, xAI, Together (trả phí).

**Nhịp lượt quyết định số quốc gia:**

- **Thế giới nhanh**, 1 lượt mỗi 10 phút (mặc định `TICK_SECONDS=600`, 144 lượt/ngày, 500 lượt trong khoảng 3,5 ngày): 4–5 quốc gia như bảng trên, nếu hạn mức thật của Gemini, Mistral, NIM, Z.ai đủ rộng.
- **Thế giới chậm**, 1 lượt mỗi giờ (24 lượt/ngày, 500 lượt trong khoảng 3 tuần): đơn phát minh ít hơn, nên SambaNova (DeepSeek-V3.2) và Groq qwen3.8-27b được giải phóng để làm quốc gia, nâng lên khoảng **7 quốc gia**.
- **Gấp đôi số lần gọi:** rút gói trạng thái từ 6.000 xuống \~3.000 token (chưa có trong engine).

Trước lượt 0, Engine gọi thử mỗi key và đọc hạn mức thật; quốc gia nào không đủ quota cho nhịp đã chọn sẽ không được khai sinh (chưa có trong engine: Engine chỉ kiểm tra có key hay không; `tools/check-providers.ts` gọi thử bằng tay).
