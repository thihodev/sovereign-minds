# Nhật ký thay đổi

Mọi thay đổi đáng kể của Sovereign Minds. Số mục (§) trỏ tới `docs/RULES.md`.

## v0.37

- **0.37.1, bản đồ 3D dễ dùng hơn:**
  - **Khung nhìn:** toàn cảnh căn giữa và vừa khít phần màn hình không bị bảng che, như bản 2D. Camera chỉ đặt vị trí khi khung 3D đã hiện, trước đây có lúc bắt đầu sát mặt đất.
  - **Tên:** tên các nước, điểm định cư, trại man di, kỳ quan không còn đè lên nhau. Tên quan trọng hơn (thủ đô) được giữ, tên đè lên thì tạm ẩn.
  - **Rê chuột:** ô dưới con trỏ có viền trắng.
  - **Nút mới:** **N** quay về hướng Bắc; **⤓** nhìn thẳng từ trên xuống, bấm lần nữa để nghiêng lại.
  - **Phím tắt:** mũi tên hay WASD để di chuyển, Q/E để xoay, R về hướng Bắc, T nhìn từ trên xuống, Enter chọn ô giữa màn hình, +/−/0 để phóng to, thu nhỏ, xem toàn cảnh.
  - **Mức phóng to** hiện đúng trong chế độ 3D.
  - **Chỉ còn giao diện tối:** bỏ nút đổi sáng/tối; trang luôn dùng giao diện tối.

- **Hai sáng kiến của các quốc gia được đưa vào game (§6.6):**
  - **Thảo dược đồng:** mỗi ô đồng cỏ và đồi có 10–20 thảo dược, tái sinh 2% mỗi lượt; người hái lượm mang về; thế giới cũ được thêm khi tải. Dân thảo nguyên có thuốc mà không cần rừng.
  - **Vườn thảo dược:** cần Trồng trọt, 5 sợi, 6 công; xây trên đất ấm cách trung tâm tối đa 2 ô, tối đa 2 vườn mỗi trung tâm; mỗi vườn tự cho 0,5 thảo dược mỗi lượt.
  - AI biết luật mới; lời cố vấn gợi ý trồng vườn khi thiếu thuốc, mức quan trọng khi có dịch gần.

## v0.36

- **Kho làng (§6.5), sáng kiến đầu tiên của các AI được đưa vào game** (Văn Phong, lượt 888, chấp thuận một phần):
  - mỗi trung tâm một kho;
  - cất 10% lương thực dư, tối đa 100 mỗi kho, không hư;
  - tự mở cứu đói khi thiếu ăn;
  - điểm định cư bị cắt đường có kho thì bất mãn tăng chậm một nửa;
  - AI biết luật mới; lời cố vấn gợi ý xây kho khi lương thực ít hay có điểm định cư bị cắt đường.
- **0.36.1, điều khoản và thương lượng trong tổng kết chiến tranh:**
  - **Hòa ước của mỗi cuộc chiến:**
    - số hiệu, bên đề nghị;
    - thời hạn, trạng thái: còn hiệu lực, hết hạn, bị ai xé bỏ, hay tan vỡ vì sao (tranh chấp biên giới, xô xát dẫn tới chiến tranh, một bên không còn…);
    - cống nạp: ai nộp ai, bao nhiêu mỗi lượt, đã nộp đủ bao nhiêu lượt, thiếu bao nhiêu;
    - nhượng đất, bồi thường theo điểm.
  - **Thương lượng giữa hai nước khi đang đánh nhau:** mọi đề nghị hòa kèm điều khoản, thư và cử chỉ, và lúc ký. Trước đây thư bị xóa sau mỗi lượt và đề nghị chỉ giữ 2 lượt; giờ chúng được ghi lại theo cuộc chiến (40 dòng gần nhất).

## v0.35

- **Phần thưởng sáng kiến là một trí tuệ (§10.7):** sáng kiến được các vị thần nhận thì nước đề xuất có thêm một AI bộ trưởng.
  - Nước tự chọn lĩnh vực qua `mind`; bộ trưởng có AP riêng mỗi lượt.
  - Phụng sự 10 lượt (nhận một phần: 5 lượt), thêm 10 lượt khi ý tưởng được đưa vào game.
  - Nằm ngoài số ghế bộ trưởng, nên nước nhỏ cũng có.
- **Đề xuất sáng kiến miễn phí (0 AP).**
- **AI dễ thấy hơn:**
  - mục `gods_reward_for_ideas` luôn có trong quan sát: phần thưởng, chi phí, khi nào được đề xuất;
  - luật nói rõ phần thưởng trí tuệ;
  - lời cố vấn nhắc ở mức quan trọng, cứ 5 lượt một lần, với nước 30 lượt chưa đề xuất.
- Tab Triều đình đánh dấu trí tuệ thưởng sáng kiến và lượt nó rời đi.
- **0.35.1:** duyệt sáng kiến ngay trong **Sổ sáng kiến**: nút Chấp thuận / Một phần / Bác bỏ và ô lời phán, kèm lĩnh vực trí tuệ nước đó xin. Lời giải thích phần thưởng ở Hộp thư nhắc tới trí tuệ AI.

## v0.34

- **0.34.2, bản đồ 3D dễ nhìn hơn:**
  - **Đường:** vẽ theo cây nhánh từ các trung tâm như bản 2D, không còn mạng tam giác chồng chéo. Đường bỏ hoang trên đất vô chủ không vẽ ở 3D.
  - **Địa hình:** phẳng hơn, ít bậc hơn nên đồng bằng liền một mảng. Núi nhỏ và dịu màu; bỏ các khối trên đồi và sa mạc. Rừng thưa hơn, cây chỉ hiện khi nhìn gần.
  - **Lãnh thổ:** tô màu cờ đậm hơn, thêm dải màu cờ chạy dọc biên giới trên mặt đất, viền cao hơn. Chọn một nước thì các nước khác chỉ xám nhẹ, không tối cả bản đồ.
  - **Thị trấn và nhãn:** mỗi điểm định cư có một mảng sân màu cờ, nhà to hơn. Tên các nước, thủ đô, điểm định cư to hơn, có nền tối.
  - **Camera:** góc nhìn mặc định cao hơn.
  - **Sửa lỗi:** bật 3D hai lần cùng lúc (trang tự khôi phục và bấm nút) từng tạo hai bản đồ chồng lên nhau, khiến tên các nước hiện đôi.

- **0.34.1, bản đồ 3D (Three.js):** nút **3D** cạnh nút phóng to chuyển giữa bản đồ 2D và 3D (trình duyệt nhớ lựa chọn).
  - **Địa hình:** mỗi ô là một khối lục giác cao theo độ cao thật. Đồi nhô lên, núi có đỉnh (tuyết trên đỉnh cao), Tường Băng là vách trắng. Biển nông và sâu có sóng; sông chảy theo thung lũng. Rừng, rừng lá kim, rừng rậm có cây.
  - **Lãnh thổ:** đất tô màu cờ, viền thấp theo biên giới. Mặt trận giữa hai nước đang đánh nhau là dải sọc vàng đen, có khói ở chỗ vừa giao tranh. Bấm một nước thì các nước khác tối đi.
  - **Làng, thị trấn, thành phố:** cụm nhà mái màu cờ lớn dần theo cấp đô thị; thủ đô có lâu đài và cờ bay trong gió.
  - **Công trình:** ruộng, chuồng có gia súc, bến thuyền, cảng, bến cá, ruộng muối, đền, bàn thờ, hàng rào, giếng, chợ, lò gốm, bãi chế tác; công trình đang xây có giàn giáo. Đường sá đổi màu theo cấp; đường biển nhạt trên mặt nước.
  - **Vật chuyển động:** người đi làm từ trung tâm ra chỗ làm, thuyền đánh cá ra khơi, thuyền neo ở bến, đoàn buôn đi theo đường thật (xe bò trên bộ, thuyền buồm trên nước).
  - **Khác:** trại man di, kỳ quan, mạch giàu; tên các nước, thủ đô, điểm định cư hiện rõ và tự ẩn khi ở xa.
  - **Sự kiện của lượt:** hiện ngay trên ô (vòng sáng, chữ bay lên, lửa và khói khi đánh nhau). Bấm một tin trong bản tin thì camera bay tới đó.
  - **Điều khiển:** kéo để di chuyển, chuột phải hoặc hai ngón để xoay và nghiêng, lăn để phóng to, nhấp đúp để bay tới ô. Bấm ô thì mở khung Chi tiết như bản 2D. Lớp phủ mối đe dọa và tài nguyên vẫn dùng được.
  - **Hiệu năng:** Three.js đóng gói sẵn trong `web/vendor/three` (giấy phép MIT), chỉ tải khi bật 3D. Bóng đổ chỉ tính lại khi bản đồ đổi; trên điện thoại thì tắt bóng đổ.
- **Sửa lỗi:** điểm định cư của nước đã diệt vong, hay nằm trên đất đã mất, không còn hiện trên bản đồ.

- **Các tầng lớp xã hội (§4.15):** nông dân, thợ thủ công, thương nhân, tăng lữ và học giả, quan lại, binh lính.
  - Mỗi tầng lớp có mức hài lòng đi theo điều họ muốn: đủ ăn, thuế, việc làm, buôn bán, đền thờ, lương bằng tiền, thắng trận.
  - Hài lòng thì làm việc tốt hơn. Bất bình thì mất ổn định. Dưới 15 thì đình công (việc của họ giảm 30%; quan lại đình công thì chỉ thu được nửa thuế).
  - Lệnh `grant` chi tiền ngân khố để ban ơn một tầng lớp.
  - AI thấy `classes`: quy mô, mức hài lòng, mức đang hướng tới và lý do.
  - Hồ sơ quốc gia có mục Các tầng lớp; khung Chi tiết báo tầng lớp đang bất bình hay đình công.
- Bot dùng ngân khố đầy để ban ơn tầng lớp kém hài lòng nhất. Bot thua trận cầm cự vài lượt rồi mới xin hòa, trừ khi bị đánh tan.

## v0.33

- **Làng, thị trấn, thành phố (§2.13):** mỗi trung tâm lớn lên theo dân, công trình và đường về thủ đô của tỉnh nó.
  - Thị trấn và thành phố nộp tiền cho ngân khố, đẩy nhanh nghiên cứu và chế tác.
  - Lệnh `city_focus` đặt trọng tâm cho từng nơi: thương mại, học thuật, thủ công, tín ngưỡng, đồn trú.
  - AI thấy `towns`: cấp, trọng tâm, điều còn thiếu để lên cấp.
- **Khung Chi tiết của Watcher** có dòng tóm tắt ngân khố (tiền, thu chi mỗi lượt, thuế), hoàng tộc (thông gia) và các thị trấn, thành phố. Không cần mở hồ sơ.
  - Điểm định cư mang biểu tượng 🏘/🏙.
  - Tab Tỉnh ghi cấp và điều kiện lên cấp.

## v0.32

- **Chiến tranh thật (§7.4b):** trước đây chiến tranh bùng ra (thường do 3 vụ xô xát biên giới) rồi kết thúc bằng hòa ước sau 1–2 lượt: không trận nào, không ai chết, không ai thắng. Giờ chiến tranh có giá.
  - **Giao tranh biên giới:** mỗi lượt chiến tranh, ở nơi hai nước giáp nhau, quân hai bên tự đánh nhau, không cần lệnh `attack`. Mỗi bên đưa một nửa chiến binh và dân quân ở mặt trận đó. Bên yếu hơn mất 10–20% số người ra trận (ít nhất 1), bên mạnh hơn mất 3–8%. Bên mạnh gấp đôi đẩy lùi biên giới, chiếm một ô (không bao giờ là trung tâm). Không có chiến binh thì dân quân chết thay.
  - **Điểm chiến tranh:** thắng giao tranh +1, thắng trận hay đột kích +2, chiếm ô +3, chiếm trung tâm +10, mỗi người địch chết +0,25.
  - **Hòa bình có giá:**
    - không được hòa trắng trong 5 lượt đầu; muốn dừng sớm, hòa ước phải có cống nạp đáng ≥ 5 mỗi lượt trong ≥ 10 lượt, hoặc nhượng ít nhất 1 ô;
    - khi ký hòa mà một bên dẫn ≥ 8 điểm, bên thua bồi thường ngay 1,2% mọi thứ trong kho (kể cả tiền) cho mỗi điểm dẫn, tối đa 35%, và 1 ô biên giới cho mỗi 12 điểm, tối đa 3 ô;
    - hòa trắng không ai thắng làm bên tuyên chiến mất 4 ổn định.
  - **Mỏi mệt:** bên kém ≥ 4 điểm mất 1 ổn định và thêm 1 bất mãn mỗi lượt, ngay từ lượt đầu.
  - **AI thấy:** mục `wars` có điểm, số chết, số ô chiếm, số ô mặt trận, giá của hòa bình nếu ký ngay, và các ô đáng đánh. Có thêm luật bằng tiếng Anh và lời cố vấn.
  - **Watcher thấy:** bảng Tổng kết các cuộc chiến có điểm chiến tranh, số lần giao tranh biên giới, số chết (trận và giao tranh) và kết cục hòa ước: ai thắng, bồi thường gì, nhượng mấy ô, hay hòa trắng. Giao tranh biên giới hiện trên bản đồ.
  - **Bot:** bên phòng thủ cũng tấn công khi có cửa thắng. Bot cầu hòa đúng luật mới, trả bằng tiền hoặc lương thực, hoặc nhượng ô khi đang thua.
  - **Công cụ `tools/pace.ts`:** từ lượt 300, ngay khi có hai nước giáp nhau, hai nước có biên giới dài nhất phải vào một cuộc chiến. Hai chỉ tiêu mới kiểm tra cuộc chiến đó: số lượt và số người chết. Thế giới không có hai nước nào giáp nhau thì hai chỉ tiêu này không áp dụng.
- **Sửa lỗi:**
  - Ô nhượng trong hiệp ước giờ chuyển cả công trình trên ô.
  - Số chết vì xô xát được ghi vào đúng cuộc chiến, không ghi nhầm vào cuộc chiến của đồng minh.

## v0.31

- **Hoàng tộc và hôn nhân (§4.14):** người trị vì vẫn là chính AI. Mỗi nước có một hoàng tộc với hoàng tử, công chúa.
  - Gả sang triều nước khác kèm hồi môn (`royal_marriage`, `accept_marriage`).
  - Hai nước thành thông gia trong 40 lượt: biên giới dịu đi, không thuế quan.
  - Tuyên chiến với thông gia: mất uy tín và ổn định.
  - Hồ sơ quốc gia có mục Hoàng tộc; lời cố vấn gợi ý kết thông gia với láng giềng đang căng.
- **Sửa lỗi:** hai hằng số chiến tranh (`independenceAfter`, `unprovokedPenalty`) bị nằm trong một dòng chú thích.
  - Tuyên chiến không chính nghĩa làm uy tín thành NaN (lưu thành `null`).
  - Chư hầu tuyên bố độc lập được ngay.
  - Uy tín hỏng trong save cũ được đặt lại 30 khi tải.

## v0.30

- **Ngân khố, thuế và công trình công cộng (§4.13):** mỗi nước có ngân khố bằng tiền (`coin`), và mọi hoạt động kinh tế đi qua đó.
  - **Nguồn thu:**
    - thuế sản xuất trên giá trị dân làm ra;
    - thuế chợ biên giới;
    - thuế quan trên hàng nhập, do ngân khố nước gửi hàng trả;
    - phí qua đất trả bằng tiền;
    - thu nhập của công trình công cộng: Chợ (mới), Bến thuyền, Cảng, và đường sá.
  - **Khoản chi:**
    - lương quan lại trả bằng tiền trước;
    - ngân khố tự mua gỗ, đá và vật liệu thường còn thiếu khi xây công trình hay làm đường;
    - lệnh `invest` thuê nhân công cho công trình đang xây, hoặc nuôi học giả cho nghiên cứu.
  - Lệnh `tax` định thuế sản xuất và thuế quan. Thuế nặng làm mất ổn định, thuế nhẹ được dân quý. Đồng minh và chư hầu không đánh thuế quan nhau. Kho tiền đầy quá 150 thì thất thoát dần.
  - Phát minh tự đề xuất có thể tạo công trình công cộng mới có thu nhập.
  - **AI thấy:** mục `treasury` (tiền, thuế suất, sổ thu chi lượt trước, thuế quan của các nước quen), luật bằng tiếng Anh, và lời cố vấn.
  - **Watcher thấy:** mục Ngân khố trong hồ sơ quốc gia, với sổ thu chi.
  - Bot xây chợ và dùng tiền dư thuê thợ.

## v0.29

- **Danh nhân (§4.12):** dân sống tốt sinh ra học giả, danh tướng, đại thương gia, thợ cả, nhà tiên tri, nhà thám hiểm.
  - Mỗi danh nhân phụng sự 4–7 lượt và mang một tác dụng riêng.
  - Nước giàu hơn có thể mời danh nhân của láng giềng bằng lễ vật (`invite_great`).
  - Hồ sơ quốc gia có mục Danh nhân; lời cố vấn gợi ý khi có người đáng mời.
- Người trị vì vẫn là chính AI quản lý quốc gia; không có nhân vật vua riêng.

## v0.28

- **Sáng kiến của các quốc gia (§10.7):** một vòng khép kín để chính các AI làm thế giới sâu hơn.
  - Thỉnh nguyện loại `sáng kiến`, có `kind` và mô tả cụ thể; đề xuất sơ sài bị từ chối.
  - Được duyệt thì thưởng một lần: uy tín, ổn định, cảm hứng cho nghiên cứu, điểm sáng tạo trong xếp hạng.
  - **Sổ sáng kiến** trong tab Thỉnh nguyện: chờ duyệt, đã duyệt chờ làm, đã đưa vào game; nút "Xuất cho Claude Code"; nút "Đã đưa vào game" để vinh danh nước đề xuất (+15 uy tín, +40 điểm xếp hạng).
  - Mọi nước thấy các sáng kiến đã được nhận (`gods_adopted_ideas`); lời cố vấn nhắc nước lâu chưa góp ý.

## v0.27

- **0.27.1, thuyền trên bản đồ:** ngư dân ngoài khơi chèo thuyền từ bến hay cảng ra biển, thả lưới rồi về; ngư dân ở ô ven biển ra ô nước sát bờ; trên sông có thuyền độc mộc; thuyền trong kho neo ở bến và cảng. Thuyền mang màu cờ của nước đó.
- **Tiêu chuẩn sống (§4.11):** mỗi kỷ nguyên dân đòi hỏi thêm nhu cầu, từ đủ ăn, chỗ ở, nước ngọt tới quần áo, công cụ, gốm, muối, rồi xa xỉ phẩm, đền thờ, thuốc, đường sá, đồ kim loại, chữ viết, buôn bán, hàng đa dạng, năng lượng, y tế.
  - Mức sống cao: nghiên cứu tối đa +8%, ổn định +1. Mức sống thấp: bất mãn +1.
  - Từ Đồ Sắt, cổng kỷ nguyên cần mức sống tối thiểu.
  - AI thấy từng nhu cầu và cách đáp ứng; lời cố vấn nêu những thứ còn thiếu; hồ sơ quốc gia có mục Mức sống.

## v0.26

- **Tổng kết chiến tranh đúng hơn:**
  - mỗi nước khi chết được ghi số phận (bị nước nào chiếm, nhập lại nước gốc, hay tự sụp đổ vì đói và dân bỏ đi);
  - bảng tổng kết không còn gán "diệt vong" cho một cuộc chiến mà nước đó không thua; nó ghi "bị X tiêu diệt", "bị Y tiêu diệt (ngoài cuộc chiến này)" hay "tự sụp đổ (…)";
  - có dòng người chết vì xô xát trước chiến tranh.
- **Máu đòi máu:** bên mạnh hơn mới tuyên chiến. Nước nhỏ không còn bị ép đánh láng giềng mạnh hơn; nó giữ chính nghĩa.
- **Bấm một nước** (bảng quốc gia, danh sách, hồ sơ) thì bản đồ tối đi trừ lãnh thổ nước đó, và viền nước đó sáng lên.

## v0.25

- **Sông là sự sống và đáng để giành (§2.1):**
  - ô ven sông có thêm cá, lúa hoang, sậy;
  - ruộng ven sông +50%, ruộng châu thổ +100%; mỗi ô sông thêm 2 gia đình;
  - hai nước láng giềng cùng giữ một con sông thì biên giới căng thêm mỗi lượt (tranh chấp nguồn nước);
  - AI thấy `rivers_contested` và được cố vấn; bot nhắm vào đất ven sông của nước yếu.
- **0.25.2, tổng kết chiến tranh:** Ngoại giao → Chiến sự có thêm mục "Tổng kết các cuộc chiến", gồm cả cuộc **đã kết thúc**.
  - Mỗi cuộc chiến: thời gian, số trận, kết cục (đang diễn ra, kết thúc bằng hòa ước, nước nào diệt vong).
  - Bảng so sánh hai bên: trận thắng, người chết, ô chiếm được, trung tâm chiếm được, đột kích thành công, ô bị mất. Bên chịu thiệt hơn tô đỏ.
  - Nút tới nơi giao tranh gần nhất.
- **0.25.1, vùng chiến sự:**
  - mặt trận (biên giới giữa hai nước đang chiến tranh) vẽ vạch vàng đen nhấp nháy, tâm mặt trận có huy hiệu ⚔;
  - chip "⚔ N cuộc chiến" trên thanh trên bấm được: một cuộc chiến thì bay tới mặt trận và phát lại các trận gần nhất, nhiều cuộc thì mở danh sách;
  - trong Ngoại giao → Chiến sự, mỗi cuộc chiến có nút "Xem mặt trận", và mỗi trận đánh bấm được để bay tới và xem lại.
- **Bảng model AI:** trọng tài hiện là **một** dòng, kèm danh sách dự phòng. Trước đây mỗi nhà cung cấp dự phòng bị hiện thành một trọng tài riêng, dù mỗi đơn chỉ có một trọng tài chấm.

## v0.24

- **Tên tiếng Việt (§2.2):**
  - mọi tên người và nơi chốn mới (nước, thủ đô, dân tộc, điểm định cư, quan chức, đổi tên) phải là âm tiết tiếng Việt;
  - bot và engine tự sinh tên Việt (Bình Sơn, Trần Minh…);
  - tên cũ giữ nguyên, đổi bằng sắc lệnh đổi tên.
- **Dời đô (§2.3):**
  - `move_capital` dời thủ đô về một điểm định cư (30 gỗ/đá, −8 ổn định, 30 lượt một lần), thủ đô cũ thành điểm định cư;
  - AI thấy `capital_move` để so các nơi; lời cố vấn gợi ý dời về nơi có sông khi thủ đô thiếu nước ngọt.

## v0.23

- **Thú nuôi và thuần hóa (§6.4):**
  - thú hoang (sói, dê núi, bò rừng, lợn rừng, gà rừng) trên bản đồ; có Thuần dưỡng thì thợ săn bắt sống về nuôi;
  - đàn sinh sôi trong sức chứa (đồng cỏ, trung tâm, chuồng), nông dân rảnh chăn đàn, đàn cho thịt, sữa, lông, da;
  - chó giúp săn, bò kéo cày, ngựa ra trận như vũ khí;
  - lệnh `cull` giết thịt lấy lương thực;
  - AI thấy `herds` và có lời cố vấn; Watcher có mục Đàn gia súc và lớp bản đồ thú hoang.
- **Phát minh làm ra được gì:**
  - tab con **Sản phẩm** trong Phát minh: mọi công thức và công trình, phát minh cần có, nước nào đang làm được hay đã xây;
  - Sổ phát minh mô tả đủ công thức (nguyên liệu → sản phẩm) và công trình (vật liệu, tác dụng);
  - AI thấy `invention_hints` (hàng mình có mà chưa công thức nào dùng) và được nhắc nên phát minh ra sản phẩm thật, không chỉ "+10% một nghề".
- **Bộ trưởng AI:** Watcher **ban thẳng** bộ trưởng trong tab Triều đình của một nước còn ghế trống, không cần chờ nước đó xin.
- **0.23.1:** chip **🧠 N AI** trên thanh trên; bấm vào mở bảng mọi model AI đang chạy (quốc gia, bộ trưởng, trọng tài, sử gia), gom theo model, kèm effort, trạng thái và số lệnh gọi mỗi lượt.
- **Sửa:** tên quan không còn lặp chức ("Bá tước Bá tước Đá Phong").

## v0.22

- **Một nước sụp đổ (§7.4):**
  - trước đây dân còn sống biến mất và đất thành đất hoang;
  - giờ 1/5 chạy nạn sang nước yên ổn nhất mà họ quen, số còn lại thành dân của nước thắng;
  - đất, công trình và kho còn lại về tay nước thắng; nước thắng −3 ổn định;
  - AI của nước sụp đổ không còn được gọi.
  - **0.22.1:** ghi chú trận đánh báo đúng phần kho thu được khi một nước sụp đổ (bản 0.22.0 lỡ push kèm một test hỏng vì chỗ này).

## v0.21

- **Dân số và ổn định:**
  - không mở được lễ hội khi kho dưới 1,5 lượt ăn;
  - lễ hội +10 ổn định (trước là +5); truyền giáo trong nước +2 ổn định mỗi lượt và giữ lại một nửa số người định bỏ đi vì bất ổn;
  - dân chỉ bỏ đi vì bất ổn khi ổn định dưới 10, mỗi lượt 3% (trước là dưới 15, 5%);
  - phạt "mất lòng tin" chỉ tính mỗi 3 lượt một lần;
  - lời cố vấn về nạn đói nêu cách cụ thể và dặn không mở lễ hội lúc đói.
- **Giao thông là mạch máu (§2.5b):**
  - ô có đường cạnh hoặc trên nó cho sản lượng về kho thêm 3/6/10%;
  - ô nối đường về thủ đô được thủ thêm 15%;
  - chợ biên giới có đường chạm tới giao thương nhiều hơn 50%;
  - đường bỏ hoang (không còn nối trung tâm nào) xuống cấp dần mỗi 20 lượt;
  - AI thấy đất nào thiếu đường, lời cố vấn gợi ý làm đường.

## v0.20

- **0.20.2:** đường trên đất vô chủ (đất đã mất hoặc thành hoang, đường vẫn ở lại) vẽ mờ, mảnh và đứt nét như đường bỏ hoang. Chú giải bản đồ có thêm mục đường.
- **Sửa (0.20.1):** đường sá không còn bị đứt khúc. Mỗi cụm ô đường liền nhau được vẽ thành một cây liền mạch, kể cả đường không chạm trung tâm hay làm dở, và mọi trung tâm chạm cụm đều được nối vào.
- **Cải tổ giao diện:**
  - **Thanh điều hướng dọc** bên trái thay hàng tab, và thanh trên gọn còn một dòng, nên bản đồ rộng hơn.
  - **Bảng quốc gia** luôn hiện: dân số, thanh ổn định, biểu tượng cảnh báo (chiến tranh, dịch, thiếu ăn, dân bỏ đi, sắp ly khai). Bấm vào là bay tới nước đó và mở hồ sơ.
  - **Bản tin lượt** thay cho bức tường chip phủ bản đồ: gom theo quốc gia, tin xấu lên trước, có màu, bấm là bay tới. Bản tin vẫn còn sau khi tải lại trang.
  - Hai thẻ nổi tự gập khi khung bên cạnh mở.
  - **Bản đồ dễ đọc hơn:**
    - nhãn không đè nhau, tên thủ đô trên nền tối và vẽ trên người đi lại;
    - đường sá thành nhánh thay cho lưới tam giác;
    - lãnh thổ ít gạch chéo hơn;
    - công trình và mạch giàu chỉ hiện khi phóng gần.
- **Đất rộng không còn là lý do bỏ đi (§2.3, §4.5).** Ô vượt giới hạn quản lý không còn trừ ổn định hay tăng bất mãn, và phái ly khai không còn kêu "đất quá rộng". Thay vào đó, mỗi lượt 1 ô thừa (trống, xa, nghèo nhất) tự thành đất hoang.
- **Máu đòi máu (§7.9):** 3 vụ xô xát chết người trong 10 lượt thì biên giới thành chiến tranh. Bên mất nhiều người hơn tuyên chiến, với chính nghĩa. Hòa bình, liên minh hoặc chư hầu ngăn được. Lời cố vấn báo trước một vụ.

## v0.19

- **Phản bội và thù địch (§4.5).** Nước tách ra là kẻ phản bội.
  - Cho tới khi ký hòa bình hoặc làm chư hầu, hai nước **thù địch**: không buôn bán, không chợ biên giới, căng thẳng biên giới không dưới 40.
  - Mọi hiệp ước bằng hữu cũ bị hủy, kể cả với những nước đã tách ra từ trước.
  - Nước gốc đánh kẻ phản bội mạnh hơn 10%. Lấy lại đất thì dân hả hê; mất đất vào tay kẻ phản bội thì thêm nhục.
  - Hai nước luôn biết nhau và chung ngôn ngữ.
  - AI, lời cố vấn và UI (quan hệ "thù địch" màu cam) đều nắm rõ.
- **Tín ngưỡng (§4.10):**
  - `mission` truyền giáo trong nước: giảm bất mãn và bất ổn tỉnh, tăng sinh nở;
  - `mission` truyền giáo ra nước ngoài: kéo người theo đạo về nước mình;
  - `festival` lễ hội: tăng ổn định, mùa cưới tăng sinh nở;
  - lời cố vấn gợi ý khi dân bỏ đi hay bất mãn cao; bot cũng dùng.
- **Sửa thông báo sai:** xô xát ở biên giới không còn hiện "⚔ thua trận".
  - UI ghi "🤜 xô xát biên giới với X (không phải chiến tranh)", và người chết vì xô xát có nguyên nhân riêng thay vì bị tính là "man di".
  - Trận đánh thật ghi rõ thắng hay thua khi đánh nước nào.

## v0.18

- **Sản vật của đất và biển (§2.11).**
  - Tài nguyên mới trên đất: mật ong, gia vị, lông thú, hổ phách, đất son, cẩm thạch, vàng, bạc, đá quý (ba thứ cuối ẩn như quặng).
  - Tài nguyên mới dưới biển: sò ốc, ngọc trai, san hô, cá voi (cho dầu cá voi).
  - Hái lượm mang về mật ong, gia vị, hổ phách; săn mang về lông thú; ngư dân mò ngọc trai và san hô, nhặt sò ốc khi hết cá, và săn cá voi khi có tàu viễn dương. Thợ mỏ đào vàng, bạc, đá quý, cẩm thạch, đất son.
  - Mạch giàu mới, kể cả trên biển: ngư trường, bãi ngọc trai, đường cá voi.
- **Công dụng:**
  - xa xỉ phẩm có trong kho được dùng hết dần, mỗi loại +0,3 ổn định mỗi lượt (tối đa +1,5), và được giá cao trên thị trường;
  - muối và gia vị giữ lương thực lâu hơn; lông thú giữ ấm như áo da.
- **Công trình mới:** Bến cá, Ruộng muối, Cảng (chiếm lãnh hải xa hơn), Đền cẩm thạch.
- **AI hiểu biển:**
  - khối `sea` trong gói quan sát: lãnh hải, bờ biển, biển vô chủ gần, ngư trường, chỗ dựng bến, đất bên kia biển;
  - `luxuries`: xa xỉ phẩm đang dùng;
  - lời cố vấn về biển và xa xỉ phẩm;
  - mỗi đoàn thám hiểm về báo lại những gì đã thấy.
- **Watcher:**
  - mục Biển và xa xỉ phẩm trong tab Kinh tế;
  - lớp bản đồ cho mọi sản vật;
  - dấu ◆ cho các mạch mới;
  - nhật ký AI dịch mọi lệnh và giá trị sang tiếng Việt (bổ nhiệm quan, làm đường, phong tục…), và đường đi hiện là chuỗi ô.
- **Hiệu năng:** vòng hồi tài nguyên chỉ duyệt những tài nguyên ô đó có. Mỗi lượt nhanh hơn khoảng 30%.

## v0.17

- **Mạch giàu (§2.10).** Mỗi loại hàng (đồng, thiếc, sắt, muối, đá lửa, đất sét, than, lưu huỳnh, dầu, ngựa) có 6–12 mạch rải khắp bản đồ, cách nhau ≥ 12 ô. Mỗi mạch có trữ lượng gấp 4 và cho +50% khi khai thác. Chiếm ô là chiếm mạch. Bản đồ đánh dấu ◆. Thế giới cũ được thêm mạch khi nạp lại.
- **Giá cả (§6.3).** Giá thế giới (tính bằng lương thực) = giá chuẩn × √(cầu ÷ cung), từ ×0,25 tới ×4. Cầu là thứ đã dùng hoặc cần cho công thức; cung là thứ làm ra cộng kho. Mỗi nước còn có giá riêng, cho biết nó thiếu hay dư gì. Chợ biên giới và bot đổi hàng theo giá này. Đề nghị trao đổi kèm `worth`.
- **Đặc sản, thế mạnh, chỗ thiếu (§7.10).**
  - AI thấy `market`: đặc sản, phát minh và hàng hiếm của mình, chỗ thiếu kèm nước giàu thứ đó, hàng dư, mạch gần (tự do hay của láng giềng), và các nước khác giàu gì, giỏi gì, thiếu gì.
  - Lời cố vấn chỉ cách có thứ còn thiếu: mua, ký cống nạp, chiếm mạch tự do, hoặc chiếm mạch của láng giềng khi có chính nghĩa.
  - Bot quý ô có mạch, và ưu tiên đánh nước yếu có mạch sát biên giới.
- **Watcher:** Ngoại giao → **Thị trường** (giá thế giới, bảng đặc sản và chỗ thiếu của từng nước); mục "Đặc sản & thị trường" trong tab Kinh tế; chú thích ◆ trên bản đồ.

## v0.16

- **Sắc lệnh đổi tên có hiệu lực (§10.6).** Trước đây sắc lệnh văn bản như "đổi mọi tên sang tiếng Việt" chỉ được báo cho AI, rồi bị quên.
  - Loại sắc lệnh mới **Đổi tên**, có thời hạn (mặc định 10 lượt). Sắc lệnh văn bản có chữ "đổi tên" cũng tự thành loại này, và "trong N lượt" đặt thời hạn.
  - Trong thời hạn, `rename_nation` miễn phí cho mọi nước, đổi được cả dân tộc và thủ đô. Lệnh mới `rename` đổi tên thủ đô, điểm định cư hay quan chức.
  - Mỗi lượt, AI thấy `gods_rename_order` với danh sách tên chưa đổi, và lời cố vấn nhắc khẩn.
  - Hết hạn mà chưa đổi tên nào: −10 uy tín, −5 ổn định. Bot tuân lệnh bằng cách đổi tên thủ đô.
  - Mọi sắc lệnh văn bản được nhắc lại trong lời cố vấn 10 lượt sau khi có hiệu lực.

## v0.15

- **Bộ trưởng AI cho nước lớn (§4.9):** một quốc gia được thêm một "trí tuệ" (một model AI) quản một lĩnh vực:
  - **Mốc:** 1 bộ trưởng ở 500 dân, 2 ở 1.000, 3 ở 2.000, 4 ở 4.000. Dân tụt dưới 90% mốc thì bộ trưởng mới nhất rời ghế.
  - **Năm lĩnh vực**, mỗi lĩnh vực một bộ trưởng:
    - kinh tế: lao động, chế tác, xây dựng, đường, chiếm đất
    - quân sự: đánh, đột kích, dẹp man di; không được tuyên chiến hay giảng hòa
    - ngoại giao: thư, buôn bán, hiệp ước, nhận dân, cách ly
    - học thuật: nghiên cứu, đề xuất phát minh
    - nội vụ: quan chức, phong tục
  - Mỗi bộ trưởng có **AP riêng** (3 + 1 cho mỗi 1.000 dân, tối đa 8) và chỉ được ra lệnh trong lĩnh vực của mình. Vua luôn đi trước: lệnh của vua thắng nếu hai bên trùng việc.
  - **Cách có bộ trưởng:** nước đủ dân dùng `request_minister` (1 AP) để xin. Watcher duyệt trong mục **Thỉnh nguyện**, chọn model và effort (hoặc bot).
  - Mỗi lượt, bộ trưởng được gọi song song với vua, với prompt và gói trạng thái riêng của lĩnh vực đó. Vua thấy bộ trưởng đã làm gì lượt trước.
  - Cố vấn báo khi đủ điều kiện xin, và còn bao nhiêu dân nữa tới mốc kế tiếp.
  - Tab Triều đình có mục "Bộ trưởng AI", có nút bãi nhiệm.

## v0.14

- **Đất là sự sống (§2.9):**
  - Bỏ ô có người ở làm dân mất lòng; đất bị chiếm mang theo các gia đình sống trên đó, và cho bên mất chính nghĩa đòi lại trong 10 lượt.
  - Ô có người ở được phòng thủ mạnh hơn 25%.
  - Prompt dặn AI giữ đất và sẵn sàng đánh để giữ.
- **Nước tách ra không thể hợp tác với nước gốc (§4.5):** không liên minh, thông hành hay bất tương xâm; nước gốc luôn có chính nghĩa để đòi lại; biên giới căng gấp 1,5 lần; thủ đô nước tách ra rơi vào tay nước gốc thì cả nước nhập trở lại.
- **Cân bằng:**
  - Người đi theo phái ly khai hoặc mất theo đất bị chiếm không tính vào ngưỡng cảnh báo "dân bỏ đi". Trước đây điều này gây vòng xoáy: ly khai, rồi bất mãn, rồi lại ly khai.
  - Bot không còn đổi đất có người ở mỗi lượt.
  - Mục tiêu "lượt vào Đồ Đồng" trong `tools/pace.ts` nới thành 140–420, vì phụ thuộc may rủi có mỏ đồng.
- **Bảng Chi tiết:** công trình gộp theo loại, kèm số lượng (Ruộng ×17).

## v0.13

- **AI thấy toàn bộ lịch sử nước mình (§8.2):**
  - **Biên niên quốc gia:** do Engine tự ghi từ ngày lập quốc, không tốn lượt AI. Mỗi 10 lượt là một chương một dòng: dân, lương thực, ổn định, đất, và 5 sự kiện quan trọng nhất. Chương cũ được gộp dần, nên 1.000 lượt vẫn gọn trong khoảng 20 dòng.
  - Thế giới đang chạy được dựng lại biên niên từ dữ liệu đã lưu khi khởi động.
  - Lượt gần đây tăng từ 6 lên **10**, mỗi lượt một dòng gồm lệnh ✓/✗ và chuyện đã xảy ra.
  - Prompt dặn đọc biên niên và các lượt gần đây trước khi ra lệnh.
- **Gói trạng thái gọn hơn:** lãnh thổ, công trình và phát minh viết mỗi mục một dòng. Ở một ván 600 lượt, gói trạng thái khoảng 29.500 ký tự (trước 33.500) mà vẫn chứa toàn bộ lịch sử.
- Hồ sơ quốc gia, tab Nhật ký AI, hiện đúng biên niên mà AI đọc.

## v0.12

- **Giữ dân là trách nhiệm đầu tiên (§4.8):**
  - Mọi lần dân bỏ đi đều được ghi lại: bao nhiêu người, sang nước nào, vì sao (bất ổn, ganh tị với nước giàu hơn, vượt biên, phái bất mãn, ly khai).
  - Trong 10 lượt mà hơn 3% dân bỏ đi thì mỗi lượt −1 ổn định, uy tín giảm dần, và bảng xếp hạng trừ 0,5 điểm cho mỗi người đã đi.
  - Prompt nói rõ đây là bổn phận đầu tiên của triều đình. AI thấy `people_leaving`; cố vấn chỉ nguyên nhân và cách giữ dân. Hồ sơ quốc gia có mục "Dân bỏ đi".
- **AI thấy các lượt gần đây của mình:** mỗi lượt có lệnh đã ra (✓ hay ✗ kèm lý do), chuyện đã xảy ra, dân, lương thực, ổn định; kèm suy nghĩ lượt trước. Prompt dặn đọc các mục này trước khi quyết định để giữ mạch kế hoạch.

## v0.11

- **Tranh chấp biên giới không còn bị hiệp ước chặn mãi:**
  - Căng thẳng từ 70 trở lên liên tục 5 lượt thì hiệp ước bất tương xâm, hòa bình và thông hành giữa hai nước tan vỡ. Liên minh và chư hầu vẫn giữ.
  - Có chính nghĩa (tranh chấp, sự cố biên giới, bắt được gián điệp) thì xé hiệp ước không mất uy tín.
  - Cố vấn nói rõ hiệp ước nào đang chặn chiến tranh và còn bao lâu nữa thì tan vỡ.
- **Công trình hiện rõ hơn (§6.1):**
  - **Bản đồ:** mỗi công trình có biểu tượng trên ô của nó (⛺ lều, 🌾 ruộng, 🔨 bãi chế tác, ⚓ bến thuyền, …). Công trình đang xây có giàn giáo 🏗 và vòng tiến độ vàng; công trình bị phá hoại có dấu gạch đỏ.
  - **Hồ sơ quốc gia có tab Công trình:** cách xây; danh sách đang xây (thanh tiến độ, số công còn lại, ước tính số lượt nữa xong theo số thợ xây); đường đang làm; công trình đã xong gộp theo loại, có nút ↗ tới ô; danh mục "Có thể xây" kèm vật liệu, số công, tác dụng và giới hạn.
  - Thẻ ô hiện tiến độ của công trình trên ô. Nhật ký quốc gia ghi "Khởi công X ở (cột, hàng): cần N công xây".

## v0.10

- **Thịnh vượng và tự tôn dân tộc (§4.7).**
  - **Điểm thịnh vượng 0–100**, gồm 4 phần, mỗi phần tối đa 25:
    - lương thực: đủ điểm khi kho có 2 lượt ăn
    - hàng hóa mỗi người: mỗi loại hàng tính tối đa 2 đơn vị giá trị mỗi người
    - chỗ ở: đủ điểm khi còn 15% chỗ trống
    - sức khỏe và yên bình: trừ dần theo các đợt đói, dịch, rét, chiến tranh
  - **So với trung bình các nước quen biết:**
    - Hơn từ 10 điểm: **dân tung hô**: ổn định +1 và bất mãn −2 mỗi lượt, uy tín tăng dần.
    - Kém từ 10 điểm: **dân ganh tị**: bất mãn tăng (tối đa +3 mỗi lượt), và các gia đình có thể bỏ sang nước giàu hơn, ưu tiên nước giáp biên.
  - Thịnh vượng tính vào bảng xếp hạng.
  - Prompt dạy AI tinh thần tự tôn: dân xét triều đình qua việc họ sống thế nào so với láng giềng, và tài nguyên là để phục vụ dân. AI thấy điểm của mình và ước lượng điểm của các nước quen biết; cố vấn chỉ phần yếu nhất cần nâng.
  - Hồ sơ quốc gia có thanh thịnh vượng và phần so sánh với các nước khác.
- **Chú thích ký hiệu** trong mục Ngoại giao → Quan hệ: màu cờ, quan hệ, 🤝 số lần buôn, ⚡ căng thẳng biên giới, 🦠 dịch, 🚧 cách ly.

## v0.9

- **Tỉnh (§2.8):** mỗi trung tâm (thủ đô, mỗi điểm định cư) là một tỉnh.
  - **Đất và dân:** đất của tỉnh là các ô gần trung tâm đó nhất. Dân chia theo chỗ ở của từng tỉnh.
  - **Lòng dân 0–100:**
    - tăng khi tỉnh cô lập (+4), xa thủ đô quá 6 ô mà không có bá tước trung thành (+2), hoặc dân đông hơn chỗ ở (+2)
    - giảm 1 mỗi lượt, giảm thêm theo tay nghề của bá tước
  - **Bá tước trung thành:** đất tỉnh làm ra thêm 2% mỗi bậc tay nghề (tối đa +10%).
  - Mỗi tỉnh có lòng dân từ 50 trở lên làm bất mãn cả nước +1 mỗi lượt.
  - **Ly khai theo tỉnh:** tỉnh bất mãn nhất (cô lập, hoặc xa mà không có bá tước) thành phái ly khai. Được duyệt thì nó tách ra làm nước mới, mang theo điểm định cư, đất, công trình, dân sống ở đó và phần kho tương ứng. Không có tỉnh nào hợp thì phái ly khai đi tìm đất mới như trước.
  - AI thấy danh sách tỉnh và lý do lòng dân xấu đi. Cố vấn gợi ý bổ nhiệm bá tước hoặc làm đường. Bot đặt bá tước vào tỉnh bất ổn nhất.
  - Hồ sơ quốc gia có tab **Tỉnh**. Khi phóng to, bản đồ vẽ ranh giới tỉnh bằng nét đứt mảnh.

## v0.8

- **Dịch lây giữa các nước, và cách ly (§9.5).**
  - Một nước có dịch thì lây được trong 2 lượt:
    - sang láng giềng giáp đất: 25%
    - sang nước có đoàn buôn qua lại: 15%
    - sang nước cùng họp chợ biên giới: 15%

    Khả năng lây giảm theo y học của nước nhận. Sau đợt dịch có 3 lượt miễn nhiễm.
  - **Hành động `quarantine` (1 AP, 1–5 lượt; 0 lượt để kết thúc sớm):**
    - không nhận và không truyền dịch
    - chợ biên giới tạm đóng, không buôn bán, đoàn buôn tới phải chờ ở biên giới
    - căng thẳng với mọi láng giềng +2 mỗi lượt, ổn định −1 mỗi lượt
    - nước đang có dịch mà tự cách ly được +1 uy tín mỗi lượt
  - AI thấy tình trạng dịch của mình và dịch đang ở gần (`plague_nearby`); cố vấn gợi ý khi nào nên cách ly. Bot tự cách ly khi láng giềng có dịch mà mình ít y học.
  - Bản đồ vẽ đường lây dịch 🦠, dải tin báo "dịch lan từ X sang Y". Hồ sơ quốc gia có nhãn đang có dịch / đang cách ly.
  - Vắc-xin để các nước tự phát minh, qua hiệu ứng y học.

## v0.7


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
- **Dân đi lại trên bản đồ** chỉ trên đất của nước mình hoặc theo đường bộ; đi giữa các vùng tách rời thì men theo đường.

## v0.6

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
