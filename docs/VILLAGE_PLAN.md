# Làng AI: bản thiết kế (Sovereign Minds 1.0)

> **Trạng thái:** bản nháp để Watcher duyệt. Chưa có dòng code nào.
> Đây là thiết kế làm từ đầu. Mọi con số dưới đây là con số khởi đầu, sẽ cân chỉnh bằng `tools/pace.ts` khi có engine.

Game cũ: mỗi AI là vua một nước, chạy hàng trăm lượt từ thời đồ đá. Game mới: **một làng 15–25 người, mỗi người là một AI**. Họ sống tự do như trong Stardew Valley: làm ruộng, câu cá, buôn bán, kết bạn, yêu, cưới, cãi nhau, làm lành. Không có điều kiện thắng; câu chuyện tự nảy sinh. Watcher là thần linh của làng.

---

## Phần A. Luật chơi

### A1. Thời gian
- **Một lượt là một ngày.** Ngày bắt đầu lúc 06:00. Ai chưa về nhà ngủ thì 02:00 kiệt sức, ngất tại chỗ: mất 10% tiền mặt (tối đa 100 vàng), sáng hôm sau chỉ còn một nửa năng lượng.
- **Nấc mô phỏng: 10 phút game.** Một ngày có tối đa 120 nấc.
- **Lịch:** 4 mùa (Xuân, Hạ, Thu, Đông), mỗi mùa 28 ngày; một năm 112 ngày. Thứ trong tuần cho phiên chợ (Chủ nhật) và giờ mở cửa.
- **Nhịp thật** (Watcher chỉnh được): mặc định 1 ngày game = 30 phút thật. Giao diện phát lại ngày đó trong 30 phút (06:00–02:00, khoảng 1,5 giây thật cho mỗi phút game). Trong lúc đó, máy chủ hỏi các AI kế hoạch cho ngày mai.

### A2. Dòng chảy một ngày
1. **Đêm trước (máy chủ):** engine đã mô phỏng xong ngày N−1. Mỗi dân làng nhận gói quan sát của sáng ngày N và trả về **một kế hoạch ngày** (một lệnh Claude mỗi người mỗi ngày).
2. **Mô phỏng (engine):** engine chạy ngày N từ 06:00 theo từng nấc 10 phút. Mọi người cùng đi, cùng làm, theo kế hoạch của mình. Kết quả cố định theo seed: chỉ dùng `rngFor(seed, day, …)`.
3. **Phát lại (giao diện):** dòng thời gian của ngày N (ai ở đâu, làm gì, nói gì lúc mấy giờ) được lưu lại và phát như phim.
4. Không trả lời kịp hoặc trả lời sai cú pháp thì người đó **làm theo thói quen**: kế hoạch mặc định theo nghề, do bot dân làng lập. Không ai đứng im cả ngày.

### A3. Dân làng
**Chỉ số (0–100, trừ khi ghi khác):**

| Chỉ số | Ý nghĩa | Tăng | Giảm |
|---|---|---|---|
| Năng lượng | sức làm việc trong ngày | ngủ (về giường trước 24:00: hồi đầy; sau 24:00: hồi 75%), ăn | mỗi việc tốn một ít (bảng A5) |
| No | 100 = vừa ăn | ăn; bữa nấu ngon được nhiều hơn | −4 mỗi giờ thức |
| Sức khỏe | | ngủ đủ, ăn no, không bị đói | đói (No = 0) −5 mỗi giờ; dầm mưa không áo tơi; ngất |
| Tâm trạng | vui buồn, ảnh hưởng mọi việc ±10% | trò chuyện, được tặng quà thích, lễ hội, ăn ngon, trời đẹp, việc thành công | cô đơn (cả ngày không nói với ai), bị từ chối, cãi nhau, đói, mệt, mưa nhiều ngày |
| Tiền (vàng) | | bán hàng, làm thuê | mua, tặng, phạt khi ngất |

- **Ốm:** sức khỏe dưới 30 thì ốm. Người ốm chỉ còn nửa năng lượng, nên nghỉ hoặc mua thuốc. Sức khỏe về 0 thì nằm liệt 3 ngày. **Không ai chết ở giai đoạn đầu**; cái chết vì tuổi già thuộc giai đoạn Vòng đời (C6).
- **Kỹ năng 0–10:** Trồng trọt, Câu cá, Hái lượm, Khai mỏ, Chế tác, Nấu ăn. Kinh nghiệm cộng sau mỗi việc. Mỗi cấp: +5% sản lượng, −3% năng lượng tiêu, mở thêm công thức.
- **Tính cách:** 12 kiểu, mỗi người một kiểu, giữ suốt đời (mượn từ tính cách vua v0.66), cộng với 2 nét riêng (vd. "hay ghen", "mê câu cá", "keo kiệt", "thích hát"). Tính cách dẫn dắt cách AI chơi; luật không ép.
- **Sở thích quà:** mỗi người có bảng *rất thích / thích / ghét*, bốc từ seed. Ai cũng biết bảng của mình. Muốn biết của người khác thì phải tặng thử, hỏi, hoặc nghe người khác kể; ghi vào sổ ghi nhớ.
- **Sinh nhật:** một ngày trong năm. Quà sinh nhật được ×4 điểm quan hệ.
- **Hộ gia đình:** 20 người ban đầu ở 9–11 hộ: vợ chồng, cha mẹ và con đã lớn, anh chị em, người sống một mình. Tuổi 18–70. Quan hệ ban đầu có sẵn: họ hàng 6 tim, hàng xóm 2–3 tim, vài mối hiềm khích cũ.
- **Nghề ban đầu:** khoảng 6 nông dân, 3 ngư dân, 2 thợ mộc, 1 thợ rèn, 1 chủ quán, 1 chủ tiệm tạp hóa, 1 thầy lang, 1 thợ săn và hái lượm, còn lại làm thuê hoặc già yếu, về hưu. Nghề chỉ là xuất phát điểm: ai cũng có thể làm bất cứ việc gì, chỉ là kém hơn.

### A4. Bản đồ làng
Bản đồ khoảng **80 × 60 ô**, mỗi ô 16 px. Bản đồ gốc được **vẽ tay** (như Stardew), seed chỉ rải chi tiết: cây, đá, đồ hái lượm, quặng.

```
 ┌──────────────────────── Núi đá ─────────────────────────┐
 │  Rừng già (gỗ, nấm, thú)       │  Mỏ (đá, quặng, đá quý)   │
 │        🌲🌲🌲🌲                │    ⛏ cửa mỏ               │
 │   🌲 Lều thợ săn 🌲     ╔═ Sông ═╗                         │
 │                          ║       ║  Lò rèn   Xưởng mộc     │
 │  Ruộng chung  ▒▒▒▒       ║ cầu   ║                         │
 │  Nhà ở  🏠 🏠 🏠  ══ Quảng trường làng ══ Quán  Tiệm tạp hóa│
 │  🏠 🏠  Vườn từng nhà    ║  giếng, bảng tin, cây đa        │
 │  Nhà thầy lang  Đền     ║       Bãi đất trống (xây nhà)   │
 │  ~~~~~~~~~ Bãi biển, bến cá, cầu tàu ~~~~~~~~~~~~~~~~~~~ │
 └──────────────────────────────────────────────────────────┘
```

- **Nơi chốn có tên** (AI gọi bằng tên, engine tự tìm đường): nhà của từng hộ, ruộng của từng hộ, ruộng chung, quảng trường, quán, tiệm tạp hóa, lò rèn, xưởng mộc, nhà thầy lang, đền, bến cá, bờ sông, hồ, rừng, mỏ (nhiều tầng), bãi đất trống.
- **Ô ruộng:** mỗi hộ có 12–40 ô ruộng tùy nghề. Ruộng chung 60 ô, ai cũng được thuê từng ô. Ô trống có thể dọn (đá, cỏ, gốc cây) để làm ruộng mới.
- **Tìm đường:** A\* trên lưới ô, đi bộ 1 ô mỗi 30 giây game (5 ô mỗi nấc), không đi xuyên nhà, nước, vách đá. Có cầu thì qua sông được.
- **Tầm nhìn:** mỗi người "thấy" những gì xảy ra trong bán kính 8 ô quanh mình, hoặc cùng trong một căn nhà. Đó là thứ họ được kể lại sáng hôm sau.

### A5. Hành động
Kế hoạch ngày là một danh sách việc làm theo thứ tự. Mỗi việc có thể kèm giờ ("lúc 12:00") hoặc chỉ "sau đó". Engine tự đi bộ tới nơi, rồi làm.

| Việc | Ở đâu | Thời gian | Năng lượng | Kết quả |
|---|---|---|---|---|
| `go` (đi tới) | bất kỳ | theo đường | 0 | tới nơi |
| `till` (cuốc đất) | ô ruộng trống | 10 phút/ô | −2/ô | ô thành đất trồng |
| `plant` (gieo) | ô đã cuốc | 5 phút/ô | −1/ô | tốn 1 hạt giống |
| `water` (tưới) | ô đã gieo | 5 phút/ô | −1/ô | cây lớn thêm một ngày; trời mưa thì khỏi tưới |
| `harvest` (gặt) | cây chín | 5 phút/ô | −1/ô | nông sản, chất lượng theo kỹ năng và phân bón |
| `fish` (câu cá) | sông, hồ, biển | 30–60 phút/lần | −4 | cá theo nơi, mùa, giờ, thời tiết, kỹ năng |
| `forage` (hái lượm) | rừng, bãi biển, ven sông | 30 phút | −3 | đồ mọc theo mùa (rau dại, nấm, quả, vỏ sò) |
| `chop` (đốn gỗ) | cây | 30 phút | −6 | gỗ; cây mọc lại sau 20 ngày |
| `mine` (đào mỏ) | mỏ, theo tầng | 60 phút | −8 | đá, than, đồng, sắt, vàng, đá quý; tầng sâu giàu hơn và nguy hiểm hơn (có thể bị thương: −sức khỏe) |
| `craft` (chế tác) | xưởng mộc, lò rèn, nhà | theo công thức | theo công thức | đồ dùng, hàng (A7) |
| `cook` (nấu) | bếp nhà, quán | 30–60 phút | −2 | món ăn: no nhiều, vui hơn, bán được giá |
| `eat` (ăn) | bất kỳ | 15 phút | +năng lượng | tăng No |
| `buy` / `sell` | tiệm tạp hóa, quán, thương lái | 10 phút | 0 | theo giá (A6) |
| `talk` (nói với) | gặp người đó | 10 phút | 0 | lời nói được trao, +điểm quan hệ (A8) |
| `gift` (tặng) | gặp người đó | 5 phút | 0 | đồ chuyển sang, ± điểm theo sở thích |
| `offer` (đề nghị) | gặp người đó hoặc gửi qua bảng tin | 10 phút | 0 | mua bán, thuê làm, cho mượn, trao đổi; người kia trả lời sáng mai |
| `work_for` (làm thuê) | theo lời đã nhận | theo việc | theo việc | làm việc trên ruộng hay xưởng của người thuê, nhận tiền |
| `visit` (ghé thăm) | nhà người khác | 30–60 phút | +tâm trạng | gặp cả nhà họ |
| `rest` (nghỉ) | bất kỳ | tùy | +2 mỗi nấc | |
| `pray` (cầu nguyện) | đền | 20 phút | 0 | gửi lời tới thần linh (B), có thể xin luật mới |
| `post` (dán bảng tin) | quảng trường | 10 phút | 0 | lời rao cả làng đọc được sáng mai |
| `build` (xây, sửa) | đất của mình hoặc bãi trống | nhiều ngày | −10/ngày | chuồng, nhà kho, mở rộng nhà (A7) |
| `sleep` (về ngủ) | nhà mình | tới sáng | hồi đầy | kết thúc ngày |

- **Không đủ năng lượng** thì việc dừng giữa chừng và ghi "mệt, bỏ dở". **Thiếu đồ** thì việc bỏ qua, ghi lý do. Phần còn lại của kế hoạch vẫn chạy.
- **Đụng độ:** hai người cùng gặt một ô, hoặc cùng mua món hàng cuối cùng: ai tới trước làm trước; cùng nấc thì do seed quyết.
- **Cướp, trộm, đánh nhau:** chưa có ở giai đoạn đầu (luật cấm). Lấy đồ trên ruộng người khác thì engine từ chối. Có thể mở sau, như một luật mới do dân làng xin.

### A6. Kinh tế
- **Tiền:** vàng. Mỗi người khởi đầu 300–800 vàng tùy hộ.
- **Tiệm tạp hóa (do engine điều hành ở giai đoạn đầu):**
  - bán hạt giống theo mùa, phân bón, dụng cụ cơ bản, thuốc, gạo, gia vị;
  - mua lại mọi nông sản, cá, đồ hái lượm, quặng với giá **gốc × hệ số mùa × chất lượng**;
  - mở cửa 09:00–17:00, đóng Thứ Tư.
  - Người chủ tiệm (một AI) được chia 10% mọi giao dịch, và tự đặt giá giảm hay tăng trong khoảng ±20%.
- **Quán (chủ quán là AI):** mua nguyên liệu, nấu, đặt giá món ăn và rượu. Buổi tối dân làng tụ tập ở đây, nên đây là nơi chuyện trò nhiều nhất.
- **Thương lái:** ghé làng sáng Chủ nhật. Mua với giá cao hơn tiệm 20% nhưng chỉ một số món mỗi tuần. Bán hàng lạ: hạt giống hiếm, công cụ tốt.
- **Giữa dân làng:** `offer`, gồm bán, thuê, cho mượn, trao đổi, góp tiền làm chung. Giá do hai bên tự thỏa thuận.
- **Sổ cái:** mọi thay đổi về tiền và đồ đi qua Ledger, giữ nguyên nguyên tắc cũ. Tiền chỉ vào làng qua tiệm và thương lái, chỉ ra khỏi làng qua mua hàng và tiền phạt khi ngất. Cuối ngày engine kiểm sổ; lệch là lỗi.
- **Mục tiêu cân bằng:** sau một năm, trung vị tiền của dân làng tăng 2–5 lần, không ai ở dưới 50 vàng quá 14 ngày liền, và hệ số Gini dưới 0,5.

### A7. Cây trồng, cá, công thức
**Cây trồng** (giống, theo mùa):

| Mùa | Cây | Số ngày tới chín | Hạt giống | Giá bán |
|---|---|---|---|---|
| Xuân | rau cải 4 · khoai tây 6 · đậu (gặt nhiều lần) 10 | | 20–60 | 35–80 |
| Hạ | dưa hấu 12 · ớt 5 (gặt nhiều lần) · ngô 14 | | 30–80 | 40–250 |
| Thu | bí ngô 13 · nho 10 · lúa 8 | | 30–100 | 50–320 |
| Đông | không trồng ngoài trời; nhà kính về sau | | | |

- Cây không được tưới thì không lớn. Hai ngày liền không tưới thì héo.
- Sang mùa mới, cây trái mùa chết.

**Cá:** khoảng 20 loài, sống theo nơi, mùa, giờ, thời tiết. Ví dụ: cá chép ở hồ cả năm; cá mòi ở biển sáng sớm mùa Xuân; lươn ở sông khi mưa đêm mùa Thu.

**Đồ hái lượm:** khoảng 16 thứ theo mùa: rau dại, nấm, quả rừng, măng, vỏ sò, củi khô.

**Công thức (khởi đầu khoảng 30):**
- **dụng cụ:** cuốc, bình tưới, cần câu, rìu, cuốc chim. Dụng cụ tốt hơn tiết kiệm năng lượng.
- **đồ chế tác:** hàng rào, rương, bù nhìn, phân bón, bẫy cua, chuồng gà.
- **món ăn:** cơm, canh cá, rau xào, bánh bí ngô, rượu nho, mứt.
- **mở rộng nhà:** thêm phòng (cần thiết khi cưới), nhà bếp, nhà kho.

Bảng đầy đủ nằm trong `src/rules.ts` mới, như cách làm hiện nay.

### A8. Quan hệ
- **Điểm quan hệ giữa hai người:** 0–2500; **250 điểm = 1 tim**, tối đa 10 tim. Hai chiều tính riêng: A quý B chưa chắc B quý A.

| Việc | Điểm |
|---|---|
| Nói chuyện (lần đầu trong ngày) | +20 |
| Tặng quà rất thích / thích / bình thường / ghét | +80 / +45 / +20 / −40 (tối đa 2 quà một tuần) |
| Quà sinh nhật | ×4 |
| Làm thuê trả đủ, giữ lời | +30 |
| Bội ước (nhận thuê không làm, hứa không giữ) | −100 |
| Nói lời xúc phạm (AI tự nói thì người nghe tự chấm) | −50 tới −150 |
| Cùng dự lễ hội và có nói chuyện | +40 |
| Một tuần không gặp | −10 (không xuống dưới mức của họ hàng) |

- **Lời nói thật sự là của AI.** Người nghe đọc câu đó sáng hôm sau và tự đánh giá. Đánh giá của họ (`feel`: −3 tới +3) cộng hoặc trừ thêm điểm. Như vậy quan hệ do chính các AI quyết, không chỉ do công thức.
- **Hẹn hò:** từ 8 tim, tặng hoa (mua ở tiệm) được "tỏ tình". Người kia đồng ý thì hai người là người yêu.
- **Kết hôn:** từ 10 tim, có lời cầu hôn bằng mặt dây chuyền (đắt). Đám cưới 3 ngày sau ở quảng trường, cả làng dự. Vợ chồng về ở chung; nhà cần đủ phòng.
- **Chia tay, ly hôn:** có, nếu một bên muốn. Mất nhiều tâm trạng, quan hệ về 2 tim.
- **Ghen:** người yêu thấy người kia tặng quà tình cảm cho người khác thì quan hệ giảm. Engine chỉ cho biết điều họ thấy; phản ứng là của AI.

### A9. Lễ hội và sự kiện
- **Lễ hội (mỗi mùa một lần, cả làng tụ tập, không làm việc):** Hội Xuân (ngày 13), Hội Trăng (Hạ 28), Hội Mùa (Thu 16, thi nông sản), Hội Tuyết (Đông 25, tặng quà bí mật). Mỗi lễ có một hoạt động riêng, do engine điều phối; ai tham gia cũng vui hơn.
- **Thời tiết:** nắng, mây, mưa (khỏi tưới, cá khác, tâm trạng −), bão (không ra biển, cây có thể đổ), tuyết. Có dự báo ngày mai trên bảng tin.
- **Sự kiện ngẫu nhiên** (hiếm, theo seed): thương lái lạ, cá voi dạt bờ, sâu phá ruộng, mỏ sập một tầng, khách lạ muốn ở lại làng (người mới, giai đoạn C6).

### A10. AI dân làng
**Gói quan sát mỗi sáng** (JSON, tiếng Anh cho các khóa; nội dung là tiếng Việt):
- `me`: tên, tuổi, tính cách và hai nét riêng, nghề, chỉ số, kỹ năng, tiền, túi đồ, nhà, ruộng (từng ô: cây gì, mấy ngày nữa chín, đã tưới chưa), sở thích của mình;
- `today`: ngày, mùa, thứ, thời tiết, dự báo ngày mai, lễ hội sắp tới, sinh nhật sắp tới (của những ai mình biết);
- `yesterday`: những gì mình đã làm, việc gì hỏng và vì sao, những gì mình thấy trong tầm nhìn (A4);
- `messages`: lời người khác nói với mình hôm qua (ai, ở đâu, câu gì), quà nhận được, lời đề nghị chờ trả lời, bảng tin;
- `people`: mỗi người mình biết: tim (của mình với họ), quan hệ (họ hàng, người yêu, vợ chồng…), lần gặp gần nhất, ghi chú của mình về họ;
- `market`: giá ở tiệm hôm nay, thương lái có ghé không;
- `notebook`: sổ ghi nhớ của chính mình, tối đa 2.000 ký tự, do chính họ viết lại mỗi sáng. Đây là trí nhớ dài hạn: kỷ niệm, mục tiêu, bí mật;
- `gods`: lời thần linh báo mộng, nếu có;
- `rules_news`: luật mới do thần linh ban (như `new_rules` hiện nay).

**Câu trả lời (JSON):**
```json
{
  "thought": "Hôm nay trời mưa, khỏi tưới. Mình sẽ đi câu lươn rồi tối ra quán gặp Lan.",
  "plan": [
    { "do": "fish", "at": "river_bridge", "until": "11:00" },
    { "do": "sell", "items": { "eel": 3 } },
    { "do": "talk", "to": "Lan", "where": "tavern", "after": "18:00",
      "say": "Hôm qua cảm ơn Lan đã cho mượn cần câu nhé. Tối nay mình mời Lan một bát canh cá." },
    { "do": "gift", "to": "Lan", "item": "fish_soup" },
    { "do": "sleep", "at": "22:30" }
  ],
  "replies": [ { "offer": 17, "accept": true } ],
  "feel": { "Hùng": -2, "Mai": 1 },
  "notebook": "…(sổ ghi nhớ đã viết lại)…",
  "prayer": null
}
```
- **Luật cho AI viết bằng tiếng Anh**, theo quy định hiện nay. Lời nói, ý nghĩ, sổ ghi nhớ, lời rao bằng tiếng Việt, vì Watcher đọc chúng.
- Luật dặn AI sống đúng tính cách, chủ động có mục tiêu riêng (giàu, yêu, nổi tiếng, sống yên), nhớ người khác, giữ lời hứa hay không là tùy họ, nhưng lời hứa có hậu quả.
- **Kiểm tra:** việc sai thì bỏ qua và báo lại sáng mai. Kế hoạch quá dài (hơn 30 việc) bị cắt. Lời nói dài quá 300 ký tự bị cắt.
- **Chi phí:** một lệnh Claude mỗi người mỗi ngày, có prompt cache cho phần luật. Mặc định Haiku effort low; Watcher đổi model từng người được.

### A11. Bot dân làng
Bot dùng cho test, cho pace, và cho người không trả lời kịp. Bot lập kế hoạch theo nghề:
- **nông dân:** tưới, gặt, bán, gieo lại;
- **ngư dân:** câu cá theo giờ tốt rồi bán;
- **mọi người:** ăn khi đói, chào người gặp trên đường, tối ra quán, 22:00 về ngủ, tặng quà bạn thân ngày sinh nhật.

Bot nói những câu mẫu tiếng Việt và không bao giờ gọi AI.

---

## Phần B. Thần linh (Watcher)
- **Trò chuyện:** hỏi bất kỳ dân làng nào điều gì (thay "Hỏi vua"). Họ trả lời theo tính cách và trí nhớ. Cuộc chuyện được lưu; tùy Watcher có cho người đó nhớ lại hay không.
- **Báo mộng:** gửi một lời vào giấc ngủ của một người. Sáng mai họ đọc thấy trong mục `gods`.
- **Phép lành, phép dữ** (mỗi ngày tối đa một phép, ghi vào Nhật ký làng):

  | Phép | Tác dụng |
  |---|---|
  | Mưa thuận | khỏi tưới cả làng một ngày |
  | Được mùa | cây trên một thửa ruộng chín ngay |
  | Ban lộc | tặng một người tiền hoặc đồ |
  | Chữa lành | trả sức khỏe đầy cho một người |
  | Bão tố | gió mạnh, mưa to một ngày |
  | Sâu bệnh | mất một phần một thửa ruộng |
  | Giấc mơ chung | cả làng cùng nghe một lời |

- **Lời cầu nguyện, thỉnh nguyện:** dân làng `pray` ở đền. Lời xin luật mới hay sáng kiến vào hàng thỉnh nguyện, như hiện nay (Trọng tài AI và Watcher xét). Luật mới được báo cho cả làng.
- **Nhật ký làng:** Sử quan viết mỗi tuần một chương, như Biên niên hiện nay.
- **Điều khiển:** tạm dừng, chạy một ngày, đổi nhịp ngày, tạo làng mới (seed, số dân 15–25, model và effort từng người).

---

## Phần C. Đồ họa (2D pixel kiểu Stardew)

### C1. Phong cách
- **Pixel art nhìn từ trên xuống, chéo nhẹ ¾ như Stardew:** nhà thấy mặt tiền và mái, nhân vật cao khoảng 1,5–2 ô.
- **Ô 16 × 16 px, vẽ không làm mờ** (`imageSmoothingEnabled = false`), phóng nguyên lần ×2…×5, mặc định ×3.
- **Màu ấm, bão hòa vừa.** Mỗi mùa một bảng màu: xuân xanh non, hạ xanh đậm và nắng vàng, thu cam đỏ, đông trắng xanh lạnh.
- **Ánh sáng theo giờ:** sáng sớm hồng nhạt, trưa trung tính, chiều vàng cam, tối xanh tím. Đèn cửa sổ, đèn đường, lửa trại tỏa quầng sáng.
- **Giao diện** khung gỗ, chữ pixel có dấu tiếng Việt, ví dụ "Pixelify Sans" (Google Fonts, hỗ trợ tiếng Việt; cần kiểm tra lại).

### C2. Bộ hình ảnh
**Chỉ dùng hình ảnh CC0**, mỗi bộ được kiểm tra giấy phép trong file tải về trước khi dùng, và ghi nguồn trong `web/assets/CREDITS.md`.

| Bộ | Lấy gì | Giấy phép |
|---|---|---|
| **Ninja Adventure** (pixel-boy, itch.io) | nhân vật đi 4 hướng × 4 khung, chân dung (faceset), đất, cỏ, nước, nhà, cây, đồ vật, biểu cảm, giao diện, nhạc, tiếng động | tác giả trả lời trên itch.io là CC0. Trang chính chưa đọc được (chặn truy cập), sẽ xác nhận trong file tải về |
| **PixelFarm** (LushMustache, itch.io) | cây trồng nhiều giai đoạn lớn, gà, đồ nông trại | trang ghi CC0 (bản miễn phí ít cây hơn bản trả phí) |
| **Kenney Tiny Town, Roguelike RPG** | bù chỗ thiếu: biển hiệu, đồ trong nhà | CC0 |

- **Rủi ro:** trộn nhiều bộ dễ lệch phong cách. Cách giảm: lấy Ninja Adventure làm chuẩn, đưa mọi thứ khác về chung bảng màu của nó bằng một công cụ nhỏ (`tools/palette.ts`). Thiếu cây trồng nào thì vẽ thêm theo cùng bảng màu.
- **Mỗi dân làng một ngoại hình:** chọn từ khoảng 30–40 nhân vật có sẵn của bộ, đổi màu tóc và áo theo seed để không ai trùng ai.
- **Tải bộ hình ảnh cần Watcher cho phép từng lần** (tên file, nguồn, dung lượng).

### C3. Cấu trúc vẽ
- **Canvas 2D** thay cho Three.js. Bỏ toàn bộ `map3d*.js`, `globe3d.js` và thư viện three.
- **Các lớp, từ dưới lên:**
  1. **mặt đất:** cỏ, đất, cát, nước, ghép ô tự động. Vẽ sẵn ra ảnh tạm theo từng khối 16 × 16 ô, mỗi mùa một bộ.
  2. **ruộng:** đất cuốc, đất ướt sau tưới, cây theo giai đoạn.
  3. **vật thể và nhân vật,** xếp theo y để ai đứng trước che ai đứng sau.
  4. **mái nhà và tán cây.** Mờ đi khi có nhân vật đi phía sau.
  5. **thời tiết:** mưa, tuyết, lá rơi, đom đóm đêm hè.
  6. **ánh sáng:** phủ màu theo giờ, khoét quầng sáng của đèn.
  7. **trên đầu nhân vật:** tên, bong bóng lời nói, biểu cảm (♥ ♪ ! ? 💢 💤).
- **Hoạt ảnh:**
  - đi bộ 4 khung, 8 khung mỗi giây;
  - làm việc: nhún người cùng biểu tượng dụng cụ, có hạt văng: đất, nước, vụn gỗ;
  - câu cá: dây câu, phao nhấp nhô;
  - ngủ: 💤.
- **Phát lại ngày:** dòng thời gian của ngày gồm các đoạn đi (đường đi theo ô, giờ bắt đầu, giờ kết thúc), đoạn làm việc và sự kiện (lời nói, quà, gặt…). Giao diện nội suy vị trí theo giờ hiện tại. Có thanh tua: tạm dừng, ×1, ×4, ×16, nhảy tới giờ, xem lại hôm qua.
- **Camera:** kéo để di chuyển, cuộn để phóng to. Bấm một dân làng để đi theo người đó. Có bản đồ nhỏ ở góc.

### C4. Bố cục giao diện
```
┌───────────────────────────────────────────────────────────────┐
│ ☀ Xuân 12 · Thứ Ba · 14:30 · Nắng      💰 làng 18.240   ⏸ ▶ ×4 │
├──────┬────────────────────────────────────────────┬───────────┤
│ Chat │                                            │ [chân dung]│
│ Dân  │        BẢN ĐỒ LÀNG (pixel, cuộn, phóng)     │ Lan, 24t  │
│ Quan │                                            │ Ngư dân   │
│  hệ  │     🧑‍🌾💬"Chào Lan!"     🐟               │ ⚡▮▮▮▯ 🍚▮▮▯│
│ Nhật │                                            │ ❤ Hùng ♥♥♥│
│  ký  │                                            │ Hôm nay:  │
│ Thỉnh│                                            │ ✓ câu cá  │
│nguyện│                                            │ → ra quán │
│ Thống│                                    [map nhỏ]│ Sổ ghi nhớ│
│  kê  ├────────────────────────────────────────────┤ Túi đồ    │
│      │ ◀◀ ▮▮ ▶ ×4 ─────●──────────── 06:00→02:00  │ [Hỏi]     │
└──────┴────────────────────────────────────────────┴───────────┘
```
- **Dân làng:** danh sách 15–25 người có chân dung, tâm trạng, đang làm gì. Bấm vào thì bay tới.
- **Quan hệ:** sơ đồ mạng, mỗi người là một nút, đường nối dày theo tim, màu theo loại (bạn, người yêu, vợ chồng, ghét nhau). Có lịch sử thay đổi.
- **Nhật ký:** các chương của Sử quan, và dòng sự kiện trong ngày (ai nói gì với ai, ai tặng gì).
- **Thống kê:** tiền, tâm trạng, sản lượng theo ngày; bảng xếp hạng vui, giàu, được quý.
- **Thỉnh nguyện và Chat:** giữ cách dùng hiện nay.
- **Điện thoại:** bản đồ toàn màn hình, các bảng mở thành ngăn kéo từ dưới lên.

### C5. Hiệu năng
- 80 × 60 ô và 25 nhân vật là nhẹ với canvas 2D. Mục tiêu 60 khung hình/giây trên máy hiện tại.
- Mặt đất vẽ sẵn theo khối; chỉ vật thể đổi trong ngày (cây trồng, nhân vật) được vẽ lại mỗi khung hình.

---

## Phần D. Kỹ thuật

### D1. Giữ, sửa, xóa
**Giữ và sửa lại cho làng:**
- `runner.ts`: vòng ngày, hỏi AI song song có giới hạn, giữ câu trả lời đã nhận;
- `claude.ts`, `ai/gateway.ts`;
- `db.ts`: bảng mới cho dòng thời gian ngày, lời nói, sổ ghi nhớ;
- `server.ts`: API mới, SSE;
- `lock.ts`, `supervisor.ts`, `main.ts`, `rng.ts`, `names.ts`;
- `historian.ts` (Nhật ký làng), `ai/judge.ts`, `ai/ideas.ts` (thỉnh nguyện), `ai/rulerchat.ts` (chat với dân làng), `rulenews.ts`;
- `test/fake-claude.mjs`, Docker, `deploy.sh`;
- khung giao diện `web/app.js` (tab, chat, hộp thoại tạo làng) và `style.css` (viết lại phần lớn).

**Xóa:** mọi thứ của game quốc gia:
- `engine.ts`, `rules.ts`, `types.ts` (viết mới);
- khoảng 40 module: chiến tranh, ngoại giao, thời đại, bộ trưởng, tỉnh, đường, biển, điện, sân bay, dịch bệnh, mọi rợ, nội chiến…;
- `hex.ts`, `worldgen.ts`, `ai/bot.ts`, `ai/minister.ts`, `ai/prompt.ts`, `ai/advice.ts` (viết mới);
- toàn bộ 3D;
- khoảng 55 file test cũ.

`docs/RULES.md` viết lại từ đầu dựa trên bản thiết kế này. CHANGELOG mở mục `## v1.0`.

**Lưu trữ game cũ:** gắn tag `nations-final` vào bản v0.67.4 và push lên origin, trước khi xóa.

### D2. Dữ liệu chính
- **`Village`:** seed, ngày, mùa, thời tiết, bản đồ (ô, nơi chốn, ruộng), danh sách dân làng, hàng hóa ở tiệm, các lời đề nghị đang chờ, các luật mới, nhật ký phép thần.
- **`Villager`:**
  - id, tên, tuổi, giới, ngoại hình, tính cách và nét riêng, nghề;
  - chỉ số, kỹ năng, tiền, túi đồ, nhà, ruộng;
  - sở thích quà, sinh nhật;
  - quan hệ (theo id: điểm, loại, lần gặp cuối, ghi chú), sổ ghi nhớ;
  - model và effort.
- **`DayTimeline`:** mỗi người một danh sách đoạn (đi, làm việc, nghỉ) và các sự kiện có giờ. Lưu theo ngày để xem lại.

### D3. Kiểm thử và cân bằng
- **`npm test`:**
  - tìm đường, mô phỏng ngày và kết quả cố định theo seed;
  - sổ cái, cây lớn, quan hệ, đề nghị và trả lời;
  - kiểm tra kế hoạch sai, bot;
  - chạy một ngày thật với fake-claude;
  - API.
- **`tools/pace.ts` mới:** 3 làng × 1 năm (112 ngày) × 20 bot. Chỉ tiêu:
  - không ai ngất quá 5 lần một năm;
  - trung vị tiền tăng 2–5 lần, Gini dưới 0,5;
  - mỗi người có ít nhất 2 người từ 4 tim trở lên;
  - có 1–3 đám cưới;
  - mô phỏng một ngày dưới 200 ms;
  - sổ cái 0 lỗi.

### D4. Phiên bản
- Mỗi bước lên `main` một bản `0.90.x`. Khi chơi được và xem được (hết C5), lên `1.0.0`.
- **Không chạy `./deploy.sh`** cho tới bản 1.0.0, để thế giới đang chạy ở chỗ deploy không bị hỏng giữa chừng.

---

## Phần E. Các giai đoạn

| # | Việc | Xong khi |
|---|---|---|
| 0 | Gắn tag `nations-final`, xin phép tải bộ hình ảnh, xem kỹ bộ hình ảnh, chốt danh sách hình | Watcher duyệt mẫu: một cảnh làng dựng tay từ các ô thật |
| 1 | Dọn code cũ, giữ hạ tầng chạy với engine rỗng | máy chủ chạy, test hạ tầng xanh |
| 2 | Engine làng: bản đồ, lịch, thời tiết, dân làng, hành động, tìm đường, mô phỏng ngày, tiệm, sổ cái, quan hệ, bot | bot sống được một năm, pace đạt |
| 3 | AI dân làng: luật, gói quan sát, kế hoạch, sổ ghi nhớ, lời nói, đề nghị | 20 fake-claude chạy 30 ngày không lỗi |
| 4 | Đồ họa 2D: bản đồ, mùa, nhân vật, phát lại, ánh sáng, thời tiết, bong bóng lời nói | xem được một ngày trọn vẹn, đẹp, 60 khung hình/giây |
| 5 | Giao diện: bảng dân làng, quan hệ, nhật ký, thống kê, chat, phép thần, thỉnh nguyện, tạo làng | **1.0.0**, Watcher chơi thử với Claude thật trên máy deploy |
| 6 | Vòng đời: già đi, có con, trẻ lớn thành một AI mới, qua đời, người mới dọn đến | sau 1.0 |
| 7 | Mở rộng: nhà kính, chuồng trại, thăng cấp nhà, tiệm do AI tự điều hành hoàn toàn, luật trộm cắp | theo thỉnh nguyện |

Mỗi giai đoạn: test xanh, pace đạt (từ giai đoạn 2), có ảnh chụp cho Watcher xem, rồi mới qua giai đoạn sau.

---

## Phần F. Những điều Watcher cần chốt
1. **Số dân khởi đầu:** 20 (khoảng 15–25)? Người mới chỉ đến ở giai đoạn 6.
2. **Nhịp:** 1 ngày game = 30 phút thật?
3. **Cấm trộm cắp, đánh nhau ở bản đầu?** Đề xuất: cấm, để sau.
4. **Tiệm tạp hóa:** engine bán, chủ tiệm AI chỉ chia lời và chỉnh giá? Đề xuất: có, để kinh tế không sập khi một AI chơi dở.
5. **Cho phép tải** Ninja Adventure, PixelFarm (bản miễn phí) và Kenney Tiny Town / Roguelike RPG?
6. **Có cần nhạc và tiếng động không** (Ninja Adventure có sẵn)? Đề xuất: có, mặc định tắt.
