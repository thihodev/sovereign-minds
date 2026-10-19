# Báo cáo cân bằng

Phiên bản 19/10/2026 · luật v0.3 (`src/rules.ts`, `src/engine.ts`, `src/diplomacy.ts`) · bot trong `src/ai/bot.ts`.

Báo cáo này đo xem bộ luật vận hành ra sao khi mọi quốc gia chơi **có tính toán**. Bản trước (luật v0.2) tìm ra ba vấn đề lớn: dân số không có trần, cây phát minh hết quá sớm, chiến tranh không bao giờ quyết định được gì. Luật v0.3 sửa chúng; báo cáo này so trước và sau, và ghi lại những gì còn lại. Mọi số liệu do `tools/simulate.ts` sinh ra từ engine thật. Các khối nằm giữa dấu `<!-- simulate… -->` được công cụ ghi đè mỗi lần chạy lại; phần chữ còn lại là phân tích viết tay.

Mỗi vấn đề được gắn nhãn:

- **[LUẬT]**: con số hoặc cơ chế trong bộ luật gây ra nó; bot nào, AI nào cũng sẽ gặp.
- **[THẾ GIỚI]**: do sinh bản đồ (`worldgen.ts`).
- **[ENGINE]**: engine làm khác với bộ luật, hoặc là lỗi nhỏ.
- **[BOT]**: do bot chơi chưa giỏi; không nên sửa luật vì nó.

## 1. Tóm tắt

Mục tiêu của đợt cân bằng: một mùa 500 lượt phải kể được một câu chuyện. Bộ lạc lớn dần thành vài trăm người qua nhiều điểm định cư, bước vào Đồ Đá Mới ở khoảng lượt 80–160, cây gốc còn việc để học tới nửa sau mùa, đói và nội loạn hiếm nhưng có thật, và chiến tranh thỉnh thoảng đổi được bản đồ.

Trước và sau, cùng 5 seed (`nguyen-dia-1` … `nguyen-dia-5`) × 500 lượt × 7 quốc gia bot:

| Chỉ số | Mục tiêu | v0.2 | v0.3 |
| --- | --- | --- | --- |
| Dân mỗi nước ở lượt 500: TB (trung vị; thấp–cao) | 120–450 | 1.242 (1.386; 275–1.590) | **186** (184; 25–363) |
| Chỗ ở TB ở lượt 500 | — | 1.269 | 209 |
| Điểm định cư mỗi nước | — | 19,5 | 4,4 |
| Ô mỗi nước ở lượt 500 | — | 188 | 35 |
| Lều đầu tiên (trung vị) | — | lượt 35 | lượt 62 |
| Điểm định cư đầu tiên (trung vị) | — | lượt 78 | lượt 128 |
| Dân ≥ 100 (trung vị) | — | lượt 108 | lượt 213 |
| Vào Đồ Đá Mới (trung vị) | lượt 80–160 | lượt 90 (35/35) | **lượt 156** (34/35) |
| Xong cả 18 phát minh gốc | phần lớn sau lượt ~250 | lượt 118 (32/35) | **lượt 257** (30/35; chỉ 14 nước xong trước lượt 250, 5 nước không xong) |
| Số lượt có nạn đói mỗi nước | hiếm, khác 0 | 0,4 | 0,4 |
| Nội loạn mỗi nước | hiếm, khác 0 | 0 | **0,2** (7 lần, ở 3 nước bành trướng quá đà) |
| Ổn định TB ở lượt 500 | — | 98 | 79 |
| Chết dịch mỗi nước (cả ván) | — | 1.718 | 253 |
| Chiến tranh · trận bên công thắng · ô chiếm | — | 14 · 54/54 · 54 | 6 · 11/24 · 11 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | thỉnh thoảng | 0 · 0 · 0 · 0 | **4 · 1 · 3 · 0** |
| ms mỗi lượt: engine / bot | nhỏ | 12,8 / 5,8 | 7,5 / 2,3 |
| Lỗi kiểm toán sổ cái | 0 | 0 | 0 |

Kết luận:

1. **Dân số có trần.** Chỗ ở giờ gắn với trung tâm: thủ đô chứa tối đa 55 người (25 tự nhiên + 3 lều), mỗi điểm định cư thêm tối đa 40 (10 + 3 lều). Điểm định cư đắt hơn (50 dân, 25 gỗ/đá, cách ≥ 6 ô) và nhiều điểm định cư làm mất ổn định. Kết quả: 186 dân TB, 31/35 nước nằm trong khoảng 120–450. Dân vẫn tăng đều tới cuối mùa (98 ở lượt 250, 186 ở lượt 500), không còn bùng nổ.
2. **Cây gốc kéo dài qua nửa mùa.** Giá tăng theo độ sâu và RP giảm dần theo số người nghiên cứu. Đồ Đá Mới ở lượt 156, xong cây gốc ở lượt 257. Phát minh d = 1 vẫn rẻ nên bộ lạc 20 người khởi đầu như cũ, chỉ chậm hơn: lều đầu tiên ở lượt 62 thay vì 35.
3. **Chiến tranh tốn kém, nhưng có lúc quyết định.** Bên thủ có lợi thế sân nhà, nên bên công chỉ thắng 11/24 trận thay vì 54/54. Khi thắng thì được nhiều thứ: đất, kho lương (15% mỗi ô, 50% khi chiếm trung tâm), tù binh, và cống nạp khi bên thua xin hòa. Ví dụ ở `nguyen-dia-1`, Mureen (174 dân) đánh Talodi (96 dân) trong 6 lượt: thắng 6/6 trận, chiếm 6 ô và một điểm định cư, rồi Talodi nộp 17 lương thực mỗi lượt trong 20 lượt. Cũng seed đó, Lizali (248 dân) đánh Mureen (172 dân) và thua cả 5 trận.
4. **Ổn định có trọng lượng.** Điểm định cư thứ 4 trở đi làm ổn định −1 mỗi lượt. Nước nào bành trướng quá đà (6–8 điểm định cư) sẽ trượt dần tới nội loạn, và đánh trận kém đi vì ổn định nhân vào sức chiến đấu.
5. **Còn lại:** điểm khai sinh không công bằng **[THẾ GIỚI]**. 1/35 nước (7 nước) và 7/20 nước (4 nước) kẹt ở 25–35 dân suốt mùa, vì đất không có gỗ, đá hay thú để dựng lều, mà lại bị cô lập nên không buôn được. Với 4 nước, lần gặp đầu ở lượt 152 và không có chiến tranh nào. Xem mục 7.

## 2. Đo cái gì, đo thế nào

### Công cụ

```bash
# Báo cáo đầy đủ của luật hiện tại (khối "simulate" bên dưới)
node --disable-warning=ExperimentalWarning tools/simulate.ts \
  --seeds nguyen-dia-1,nguyen-dia-2,nguyen-dia-3,nguyen-dia-4,nguyen-dia-5 --ticks 500 --nations 7 --out docs/BALANCE.md
# Cùng luật, 4 nước (khối "simulate:n4")
node --disable-warning=ExperimentalWarning tools/simulate.ts --seeds … --ticks 500 --nations 4 --tag n4 --brief --out docs/BALANCE.md
# Một biến thể có sẵn, hoặc chỉnh bất kỳ con số nào của luật (chỉ trong bộ nhớ của tiến trình, không sửa file)
node --disable-warning=ExperimentalWarning tools/simulate.ts --seeds … --variant rp-flat --brief --out docs/BALANCE.md
node --disable-warning=ExperimentalWarning tools/simulate.ts --seeds … --set GROWTH.rate=0.06,WAR.home=0.3 --brief
```

`tools/simulate.ts` tạo thế giới chỉ có bot bằng `createWorld`, chạy `step` qua từng lượt, rồi ghi lại theo lượt và theo quốc gia: dân số, lương thực, ổn định, số ô, phát minh, kỷ nguyên, số chết đói/rét/dịch, nội loạn, lần gặp đầu tiên, hiệp ước, giao dịch, trận đánh, điểm định cư, lỗi kiểm toán sổ cái, ms/lượt của engine và của bot, các mốc thời gian (lều đầu tiên, định cư đầu tiên, 50/100/500 dân, Đồ Đá Mới, xong cây gốc) và các hành động bị từ chối. Với mỗi cuộc chiến, nó ghi ai đánh ai, tỷ lệ dân lúc tuyên chiến, trận thắng, ô chiếm, số trận có chiến lợi phẩm, trung tâm thất thủ, thương vong và kết cục (hòa, hòa kèm cống nạp, diệt vong).

Các con số của luật mới là trường của các object xuất ra từ `src/rules.ts`: `GROWTH`, `HOUSING`, `TILES`, `RESEARCH`, `SETTLEMENT`, `WAR`, `SPOILAGE` (và `EVENTS`). `--variant` áp một biến thể có tên, `--set OBJ.field=số` chỉnh từng con số, `--tag` đặt tên khối khi ghi vào file, `--json` xuất số liệu thô. Tất cả chỉ đổi bảng trong bộ nhớ của tiến trình, không sửa file nào.

Thời gian ms/lượt ở mục 1 đo khi chạy riêng một mô phỏng. Các khối biến thể ở mục 6 chạy song song 7 mô phỏng một lúc, nên ms/lượt của chúng cao hơn và chỉ để so sánh tương đối.

### Bot

Bot (`src/ai/bot.ts`) gửi đúng JSON mà một AI gửi, và là tất định với cùng (world, nation, rand). Mỗi lượt nó:

- **Ăn đủ:** đặt mục tiêu sản lượng khoảng 120% nhu cầu, cao hơn khi kho mỏng. Nó chia lao động theo năng suất thật của từng nguồn: săn có công cụ, đánh cá, ruộng, hái, săn không công cụ. Mỗi nguồn bị giới hạn bởi lượng tái sinh của đất mình.
- **Nghiên cứu** theo lộ trình P2 → P1 → P3 → P7 → P8 (lều) → P4 (định cư) → P6 → P10 → P14/P15 (Đồ Đá Mới) → phần còn lại. Nếu bị cô lập trên một vùng đất đã thám hiểm hết, nó ưu tiên thuyền (P16) ngay sau lều.
- **Chỗ ở:** dựng lều khi dân gần chạm mái, đất đủ nuôi thêm 10 người và trung tâm còn chỗ cho lều. Chỉ khi các trung tâm đã đủ 3 lều và dân gần kín (cách mái ≤ 12%), nó mới lập điểm định cư ở chỗ đất tốt trong tầm nhìn. Trong lúc chờ, nó cử thêm người đốn gỗ và khai đá để gom 25 gỗ/đá. Từ điểm định cư thứ 4, nó chỉ lập thêm khi ổn định ≥ 50.
- **Công trình, công cụ, mỏ, đất, thám hiểm, phát minh mở:** như bản trước. Khi bỏ bớt ô, nó không bao giờ bỏ ô ở mặt trận.
- **Ngoại giao:** ký bất tương xâm với láng giềng không yếu hơn mình. Với láng giềng yếu, 85% trường hợp nó từ chối ràng buộc tay mình. Nó đổi hàng dư lấy hàng thiếu theo giá chuẩn (`GOOD_VALUE`), ưu tiên bạn hàng mà nó đã thấy đất có thứ mình thiếu, và nhận các đề nghị công bằng.
- **Chiến tranh:** con mồi là láng giềng chưa ký ước, cách đất mình ≤ 4 ô, có dân (theo tình báo) ≤ 70% dân mình; mỗi nước chỉ gây chiến cách nhau ít nhất 80 lượt. Trước khi tuyên chiến, nó khai hoang về phía con mồi cho tới khi mặt trận rộng ít nhất 3 ô, rồi tuyên chiến (10% mỗi lượt). Khi đánh, nó dồn 30% lao động làm chiến binh, rồi chia họ ra tối đa 3 ô, mỗi ô không quá trần mặt trận. Nó chỉ đánh khi ước tính quân mỗi ô hơn 1,15 lần quân thủ dàn trên mặt trận đã nhân lợi thế sân nhà và địa hình; nếu không, nó khai hoang thêm để nới rộng mặt trận. Nó nhắm trung tâm khi đã giữ đủ 4 ô kề, rồi tới vành quanh thủ đô, rồi chỗ đất yếu nhất. Nó giảng hòa sau 8 lượt hoặc sau 3 trận thua. Bên bị đánh đưa 25% lao động ra thủ và xin hòa mỗi lượt; khi đã mất đất, nó xin hòa kèm cống nạp lương thực (5% nhu cầu ăn cho mỗi ô đã mất, tối đa 20% nhu cầu, trong 20 lượt). Bên công nhận hòa có cống nạp ngay, còn hòa suông thì phải sau 4 lượt.

Chạy 5 seed × 500 lượt × 7 nước không có lỗi kiểm toán nào. Chỉ 1 hành động bị từ chối trong 17.500 lượt-quốc gia.

### Giới hạn của phép đo

- Bot không phải LLM. Nó chơi đều, không quên, không nói dối, nên **trần** tăng trưởng nó đạt được cao hơn những gì AI thật thường đạt. Nhưng trần là thứ luật phải chặn, vì sớm muộn sẽ có một AI tìm ra.
- Không có trọng tài nên không có phát minh mở nào được duyệt: không ai chạm được Cổng Đồ Đồng.
- Bot chỉ gây chiến với nước yếu hơn rõ rệt, chỉ dùng `attack` (không đột kích, không liên minh, không chư hầu), nên số liệu chiến tranh là một mẫu hẹp của những gì AI thật có thể làm.

## 3. Kết quả với luật v0.3

Mốc thời gian điển hình (trung vị của 35 quốc gia, 5 seed × 7 nước):

| Mốc | v0.2 | v0.3 |
| --- | --- | --- |
| Lều đầu tiên (chỗ ở > 25) | 35 | 62 |
| 50 dân | 70 | 109 |
| Điểm định cư đầu tiên | 78 | 128 |
| Đồ Đá Mới | 90 | 156 |
| 100 dân | 108 | 213 |
| Xong cả 18 phát minh gốc | 118 | 257 |
| 500 dân | 192 | không nước nào |
| Lượt 500 | 1.242 dân, 188 ô, 19,5 điểm định cư | 186 dân, 35 ô, 4,4 điểm định cư |

Số liệu đầy đủ (tổng hợp, chuỗi theo lượt, các cuộc chiến, chi tiết từng seed):

<!-- simulate:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `base` (luật hiện tại, không đổi gì); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 185.9 / 184 / 25 / 363 |
| Chỗ ở cuối ván: trung bình / cao nhất | 209 / 375 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 63 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 62 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 127.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 34/35, trung vị lượt 108.5 · 34/35, trung vị lượt 213 · 0/35 |
| Vào Đồ Đá Mới | 34/35, trung vị lượt 156 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 30/35, trung vị lượt 257 |
| Phát minh cây gốc trung bình cuối ván | 17.8 |
| Định cư mới trung bình mỗi nước | 4.4 |
| Ô trung bình cuối ván | 34.9 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.9 / 5.3 / 253.3 |
| Số lượt có nạn đói mỗi nước (TB) | 0.4 |
| Nội loạn mỗi nước (TB) | 0.2 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 28.6 / 89.8 / 4.8 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 6 · 11/24 · 11 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | 4 · 1 · 3 · 0 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 7.5 / 2.3 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.9 | 25 | 11.7 | 3.9 | 99.9 | 15 | 0 |
| 100 | 46.1 | 49 | 15 | 6.5 | 99.8 | 28 | 0 |
| 150 | 63.2 | 67.3 | 17.8 | 8.9 | 99.9 | 38 | 3.4 |
| 200 | 80.5 | 89 | 20.9 | 12.5 | 99.9 | 187 | 4.6 |
| 250 | 98.2 | 112.7 | 24 | 15.1 | 99.9 | 677 | 5.6 |
| 300 | 117.8 | 133.3 | 26.5 | 16.8 | 99.7 | 1,153 | 6.4 |
| 350 | 138.5 | 154.7 | 29.2 | 17.4 | 98.7 | 1,614 | 6.6 |
| 400 | 149.3 | 169 | 30.4 | 17.7 | 95.6 | 1,799 | 6.6 |
| 450 | 166.2 | 188.7 | 32.6 | 17.8 | 91.1 | 2,129 | 6.8 |
| 500 | 185.9 | 209 | 34.9 | 17.8 | 79.1 | 2,352 | 6.8 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Trận có chiến lợi phẩm | Thương vong công / thủ | Kết cục |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Lizali → Somuso | 277–280 | 178 : 88 | 1/2 | 1 | 1 | 5 / 3 | hòa, Somuso nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-1` | Mureen → Talodi | 387–393 | 174 : 96 | 6/6 | 6 (1 trung tâm) | 6 | 12 / 11 | hòa, Talodi nộp 17 lương thực/lượt × 20 |
| `nguyen-dia-1` | Lizali → Mureen | 444–447 | 248 : 172 | 0/5 | 0 | 0 | 31 / 5 | hòa |
| `nguyen-dia-2` | Zakare → Ruka | 406–411 | 236 : 137 | 2/5 | 2 | 2 | 18 / 5 | hòa |
| `nguyen-dia-3` | Taloar → Kaar | 394–398 | 261 : 119 | 0/4 | 0 | 0 | 15 / 3 | hòa |
| `nguyen-dia-3` | Mivedi → Taloar | 465–468 | 241 : 147 | 2/2 | 2 | 2 | 3 / 6 | hòa, Taloar nộp 13 lương thực/lượt × 20 |

## Chi tiết từng seed

### Seed `nguyen-dia-1`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 8.8 ms/lượt engine + 2.8 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lion | 109 (111) | 115 | 25 | 18 | 302 | 59 / 302 | 2 | 1 xưởng, 7 lều, 1 chuồng, 2 hố, 1 bàn thờ, 1 ruộng, 1 lò | 100 (60) | 0 / 1 / 173 | 0/0 |
| Solita | 127 (136) | 145 | 29 | 18 | 209 | 58 / 356 | 3 | 1 xưởng, 9 lều, 1 ruộng, 1 chuồng, 1 lò, 2 hố, 1 bàn thờ | 100 (60) | 0 / 1 / 151 | 0/0 |
| Talodi | 116 (165) | 185 | 31 | 18 | 169 | 64 / 180 | 4 | 1 xưởng, 12 lều, 1 ruộng, 1 chuồng, 1 lò, 2 hố, 1 rào, 1 bàn thờ | 95 (60) | 0 / 4 / 212 | 0/6 |
| Somuso | 224 (224) | 205 | 35 | 18 | 168 | 64 / 140 | 4 | 1 xưởng, 14 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 5 / 302 | 1/1 |
| Redi | 187 (187) | 195 | 34 | 18 | 144 | 62 / 121 | 4 | 1 xưởng, 2 hố, 13 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 100 (60) | 0 / 2 / 345 | 0/0 |
| Mureen | 219 (219) | 225 | 38 | 18 | 118 | 65 / 95 | 5 | 1 xưởng, 2 hố, 15 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 95 (60) | 0 / 6 / 364 | 11/0 |
| Lizali | 163 (252) | 265 | 39 | 18 | 143 | 99 / 129 | 6 | 2 xưởng, 2 hố, 18 lều, 1 chuồng, 1 bàn thờ, 1 ruộng, 1 rào, 1 lò | 12 (1) | 5 / 0 / 194 | 1/6 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 25 | 25 | 25 | 11.9 | 3.9 | 100 | 14 | 0 |
| 100 | 7 | 41.6 | 55 | 45 | 14.9 | 6.9 | 100 | 26 | 0 |
| 150 | 7 | 60.3 | 96 | 65 | 18.1 | 9 | 100 | 36 | 3 |
| 200 | 7 | 77.7 | 114 | 83.6 | 20.6 | 11.9 | 100 | 129 | 5 |
| 250 | 7 | 88.7 | 150 | 102.1 | 22.4 | 14.4 | 100 | 545 | 6 |
| 300 | 7 | 96.9 | 158 | 113.6 | 24 | 16.3 | 100 | 833 | 6 |
| 350 | 7 | 116.3 | 208 | 130.7 | 26.1 | 17.1 | 99.3 | 1,176 | 7 |
| 400 | 7 | 123 | 198 | 142.1 | 27 | 17.9 | 97 | 1,282 | 7 |
| 450 | 7 | 140.3 | 228 | 160.7 | 29.7 | 18 | 92 | 1,908 | 7 |
| 500 | 7 | 163.6 | 224 | 190.7 | 33 | 18 | 86 | 2,306 | 7 |

- Gặp gỡ: lần đầu ở lượt 2, tổng 17 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 30 non_aggression, 3 peace. Giao dịch: 124. Chiến tranh: 3 (+0 đồng minh tham chiến). Trận: 13.
- Định cư mới: 29. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 117.

### Seed `nguyen-dia-2`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 7.5 ms/lượt engine + 2.3 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Taru | 184 (231) | 235 | 37 | 18 | 143 | 62 / 123 | 5 | 1 xưởng, 2 hố, 16 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 83 (60) | 0 / 17 / 308 | 0/0 |
| Endi | 209 (273) | 265 | 41 | 18 | 111 | 59 / 84 | 6 | 2 xưởng, 2 hố, 18 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 70 (60) | 0 / 13 / 321 | 0/0 |
| Lololi | 179 (180) | 185 | 34 | 18 | 206 | 61 / 206 | 4 | 1 xưởng, 2 hố, 12 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 5 / 235 | 0/0 |
| Kaliso | 226 (226) | 235 | 39 | 18 | 111 | 59 / 85 | 5 | 1 xưởng, 2 hố, 16 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 91 (60) | 0 / 7 / 293 | 0/0 |
| Zakare | 260 (267) | 275 | 43 | 17 | 208 | 62 / 170 | 6 | 2 xưởng, 19 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 rào | 18 (18) | 0 / 9 / 130 | 2/3 |
| Kaha | 243 (264) | 275 | 42 | 18 | 148 | 63 / 124 | 6 | 2 xưởng, 2 hố, 19 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 58 (58) | 0 / 9 / 237 | 0/0 |
| Ruka | 133 (149) | 155 | 29 | 18 | 252 | 193 / 253 | 3 | 1 xưởng, 10 lều, 1 chuồng, 2 hố, 1 ruộng, 1 lò, 1 bàn thờ, 1 rào | 100 (60) | 19 / 0 / 187 | 3/2 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 25 | 25 | 25 | 11.9 | 3.9 | 99.4 | 17 | 0 |
| 100 | 7 | 48 | 66 | 52.1 | 15.1 | 6.6 | 99.9 | 30 | 0 |
| 150 | 7 | 66.4 | 102 | 72.1 | 17.6 | 9.7 | 100 | 41 | 4 |
| 200 | 7 | 94.6 | 137 | 99.3 | 22.7 | 14.1 | 100 | 372 | 4 |
| 250 | 7 | 112 | 146 | 130.7 | 26.1 | 16.3 | 100 | 1,147 | 6 |
| 300 | 7 | 139.9 | 172 | 156.4 | 29.7 | 17.6 | 99.6 | 1,618 | 7 |
| 350 | 7 | 162.3 | 193 | 180.7 | 32.7 | 17.9 | 99.6 | 2,148 | 7 |
| 400 | 7 | 184.3 | 229 | 195 | 34.7 | 17.9 | 96.6 | 2,343 | 7 |
| 450 | 7 | 200.9 | 241 | 219.3 | 36.3 | 17.9 | 91.9 | 2,652 | 7 |
| 500 | 7 | 204.9 | 260 | 232.1 | 37.9 | 17.9 | 74.3 | 2,820 | 7 |

- Gặp gỡ: lần đầu ở lượt 6, tổng 15 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 37 non_aggression, 1 peace. Giao dịch: 67. Chiến tranh: 1 (+0 đồng minh tham chiến). Trận: 5.
- Định cư mới: 35. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 110.

### Seed `nguyen-dia-3`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 7.4 ms/lượt engine + 2.3 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rutaka | 177 (181) | 185 | 34 | 18 | 145 | 64 / 121 | 4 | 1 xưởng, 2 hố, 12 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 rào, 1 lò | 100 (60) | 0 / 12 / 335 | 0/0 |
| Hami | 103 (103) | 105 | 25 | 18 | 404 | 62 / 404 | 2 | 1 xưởng, 2 hố, 6 lều, 1 ruộng, 1 bàn thờ, 1 chuồng, 1 lò | 100 (60) | 0 / 3 / 72 | 0/0 |
| Kaar | 250 (428) | 375 | 49 | 18 | 265 | 62 / 265 | 8 | 2 xưởng, 27 lều, 1 ruộng, 2 hố, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 20 (2) | 0 / 9 / 162 | 4/0 |
| Endion | 201 (201) | 205 | 35 | 18 | 115 | 56 / 89 | 4 | 1 xưởng, 14 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 7 / 283 | 0/0 |
| Mien | 221 (221) | 225 | 38 | 17 | 145 | 56 / 97 | 5 | 2 xưởng, 15 lều, 1 chuồng, 2 hố, 1 bàn thờ, 1 ruộng, 1 rào | 65 (60) | 0 / 8 / 435 | 0/0 |
| Taloar | 261 (281) | 285 | 42 | 18 | 138 | 57 / 82 | 6 | 2 xưởng, 20 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 lò, 1 rào | 17 (1) | 0 / 10 / 132 | 0/6 |
| Mivedi | 363 (363) | 295 | 46 | 18 | 131 | 56 / 84 | 6 | 2 xưởng, 21 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 lò, 1 rào | 32 (32) | 0 / 0 / 350 | 2/0 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 24.9 | 25 | 25 | 11.4 | 4 | 100 | 16 | 0 |
| 100 | 7 | 51.3 | 65 | 55 | 16.4 | 6.7 | 99.4 | 33 | 0 |
| 150 | 7 | 69.3 | 95 | 72.1 | 18.9 | 9 | 100 | 42 | 5 |
| 200 | 7 | 87.7 | 121 | 95 | 22.1 | 13.1 | 100 | 82 | 5 |
| 250 | 7 | 110.1 | 169 | 125 | 25.7 | 15.7 | 99.4 | 841 | 5 |
| 300 | 7 | 140.1 | 197 | 152.1 | 29 | 17 | 99 | 1,436 | 6 |
| 350 | 7 | 155.7 | 220 | 169.3 | 30.9 | 17.7 | 97.4 | 1,775 | 6 |
| 400 | 7 | 155.7 | 251 | 183.6 | 32.1 | 17.7 | 86.9 | 1,876 | 6 |
| 450 | 7 | 180.1 | 265 | 205 | 34.9 | 17.9 | 79.9 | 2,072 | 7 |
| 500 | 7 | 225.1 | 363 | 239.3 | 38.4 | 17.9 | 62 | 2,398 | 7 |

- Gặp gỡ: lần đầu ở lượt 3, tổng 14 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 27 non_aggression, 2 peace. Giao dịch: 73. Chiến tranh: 2 (+0 đồng minh tham chiến). Trận: 6.
- Định cư mới: 35. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 114.
- Hành động bị từ chối nhiều nhất: 1× `build: Ô xây dựng phải thuộc lãnh thổ của bạn`.

### Seed `nguyen-dia-4`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 6.9 ms/lượt engine + 2.1 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reen | 140 (152) | 165 | 29 | 18 | 213 | 63 / 215 | 3 | 1 xưởng, 11 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 2 / 311 | 0/0 |
| Dilo | 188 (188) | 195 | 34 | 18 | 172 | 60 / 270 | 4 | 1 xưởng, 13 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 rào, 1 lò | 100 (60) | 0 / 4 / 167 | 0/0 |
| Mumi | 160 (167) | 185 | 33 | 18 | 279 | 61 / 303 | 4 | 1 xưởng, 12 lều, 1 ruộng, 1 chuồng, 2 hố, 1 lò, 1 bàn thờ | 100 (60) | 0 / 3 / 161 | 0/0 |
| Dika | 255 (255) | 265 | 42 | 18 | 121 | 65 / 96 | 6 | 1 xưởng, 2 hố, 18 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 25 (25) | 0 / 11 / 294 | 0/0 |
| Veen | 197 (245) | 265 | 40 | 18 | 170 | 67 / 149 | 6 | 2 xưởng, 18 lều, 2 hố, 1 chuồng, 1 ruộng, 1 lò, 1 bàn thờ | 41 (41) | 0 / 7 / 307 | 0/0 |
| Rehave | 137 (184) | 195 | 32 | 18 | 164 | 68 / 126 | 4 | 1 xưởng, 13 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 lò | 100 (60) | 0 / 12 / 381 | 0/0 |
| Loenha | 166 (177) | 185 | 33 | 18 | 147 | 65 / 90 | 4 | 1 xưởng, 12 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 0 / 269 | 0/0 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 25 | 25 | 25 | 11.9 | 4 | 100 | 15 | 0 |
| 100 | 7 | 45.9 | 60 | 47.9 | 14.7 | 6.1 | 99.9 | 25 | 0 |
| 150 | 7 | 63.9 | 109 | 66.4 | 18.1 | 8.4 | 99.4 | 37 | 2 |
| 200 | 7 | 71.4 | 124 | 82.1 | 20.1 | 11.4 | 100 | 147 | 5 |
| 250 | 7 | 90.7 | 131 | 105 | 23 | 14.7 | 100 | 347 | 6 |
| 300 | 7 | 112.3 | 160 | 122.1 | 25.6 | 16.9 | 100 | 914 | 7 |
| 350 | 7 | 138.6 | 187 | 153.6 | 29.6 | 17.9 | 98.7 | 1,671 | 7 |
| 400 | 7 | 150.6 | 205 | 176.4 | 31.4 | 18 | 99.3 | 2,007 | 7 |
| 450 | 7 | 166.6 | 227 | 197.9 | 33.7 | 18 | 95.7 | 2,474 | 7 |
| 500 | 7 | 177.6 | 255 | 207.9 | 34.7 | 18 | 80.9 | 2,607 | 7 |

- Gặp gỡ: lần đầu ở lượt 2, tổng 12 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 24 non_aggression. Giao dịch: 114. Chiến tranh: 0 (+0 đồng minh tham chiến). Trận: 0.
- Định cư mới: 31. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 120.

### Seed `nguyen-dia-5`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 7 ms/lượt engine + 2.2 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kaon | 181 (181) | 185 | 34 | 18 | 145 | 64 / 121 | 4 | 1 xưởng, 2 hố, 12 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 3 / 282 | 0/0 |
| Tave | 164 (164) | 175 | 33 | 17 | 261 | 65 / 261 | 4 | 1 xưởng, 11 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ | 96 (60) | 1 / 2 / 156 | 0/0 |
| Armu | 170 (224) | 235 | 36 | 18 | 195 | 65 / 164 | 5 | 1 xưởng, 16 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 67 (60) | 0 / 6 / 406 | 0/0 |
| Ruonmi | 153 (153) | 155 | 30 | 18 | 221 | 64 / 202 | 3 | 1 xưởng, 10 lều, 2 hố, 1 chuồng, 1 ruộng, 1 lò, 1 bàn thờ | 100 (60) | 0 / 0 / 224 | 0/0 |
| Kakadi | 198 (214) | 225 | 38 | 17 | 113 | 62 / 87 | 5 | 2 xưởng, 2 hố, 15 lều, 1 ruộng, 1 chuồng, 1 bàn thờ | 87 (60) | 0 / 8 / 407 | 0/0 |
| Kataar | 216 (216) | 225 | 38 | 18 | 113 | 55 / 119 | 5 | 1 xưởng, 2 hố, 15 lều, 1 ruộng, 1 bàn thờ, 1 lò, 1 chuồng, 1 rào | 95 (60) | 0 / 0 / 241 | 0/0 |
| Mure | 25 (25) | 25 | 6 | 16 | — | — / — | 0 | 1 xưởng, 1 ruộng, 2 hố, 1 chuồng, 1 bàn thờ, 1 lò | 100 (60) | 6 / 0 / 39 | 0/0 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 24.4 | 25 | 25 | 11.3 | 3.9 | 100 | 15 | 0 |
| 100 | 7 | 44 | 63 | 45 | 14 | 6.4 | 100 | 27 | 0 |
| 150 | 7 | 56.3 | 113 | 60.7 | 16.4 | 8.6 | 100 | 35 | 3 |
| 200 | 7 | 71 | 108 | 85 | 18.7 | 12 | 99.7 | 202 | 4 |
| 250 | 7 | 89.6 | 132 | 100.7 | 22.6 | 14.6 | 100 | 504 | 5 |
| 300 | 7 | 99.7 | 161 | 122.1 | 24.1 | 16.4 | 100 | 962 | 6 |
| 350 | 7 | 119.6 | 171 | 139.3 | 26.9 | 16.6 | 98.7 | 1,301 | 6 |
| 400 | 7 | 133 | 217 | 147.9 | 26.7 | 16.9 | 98.1 | 1,489 | 6 |
| 450 | 7 | 143 | 207 | 160.7 | 28.6 | 17.3 | 96.3 | 1,541 | 6 |
| 500 | 7 | 158.1 | 216 | 175 | 30.7 | 17.4 | 92.1 | 1,629 | 6 |

- Gặp gỡ: lần đầu ở lượt 8, tổng 10 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 19 non_aggression. Giao dịch: 71. Chiến tranh: 0 (+0 đồng minh tham chiến). Trận: 0.
- Định cư mới: 26. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 112.

<!-- simulate:end -->

### Với 4 quốc gia

<!-- simulate:n4:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `base` (luật hiện tại, không đổi gì); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 4 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 4 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 20/20 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 124.6 / 149 / 25 / 226 |
| Chỗ ở cuối ván: trung bình / cao nhất | 142 / 235 |
| Vượt chỗ ở tự nhiên 25 | 19/20, trung vị lượt 63 |
| Lều đầu tiên xây xong | 19/20, trung vị lượt 62 |
| Điểm định cư đầu tiên | 13/20, trung vị lượt 140 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 13/20, trung vị lượt 102 · 13/20, trung vị lượt 205 · 0/20 |
| Vào Đồ Đá Mới | 13/20, trung vị lượt 161 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 16/20, trung vị lượt 239.5 |
| Phát minh cây gốc trung bình cuối ván | 17.3 |
| Định cư mới trung bình mỗi nước | 2.8 |
| Ô trung bình cuối ván | 27.2 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 1.9 / 4.5 / 206.8 |
| Số lượt có nạn đói mỗi nước (TB) | 1.1 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 152.5 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 4 / 11 / 0 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 0 · 0/0 · 0 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | 0 · 0 · 0 · 0 |
| Đơn phát minh mở mỗi seed (TB) | 4 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 16.3 / 3.3 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.8 | 25 | 11.8 | 3.9 | 100 | 15 | 0 |
| 100 | 40.1 | 41.5 | 12.8 | 5.8 | 100 | 26 | 0 |
| 150 | 50.2 | 53.5 | 15.4 | 8 | 99.9 | 32 | 1 |
| 200 | 65.2 | 72.5 | 19 | 11.3 | 99.7 | 44 | 2.2 |
| 250 | 82.2 | 91.5 | 21.4 | 14.2 | 100 | 644 | 2.4 |
| 300 | 92.9 | 106.5 | 23.3 | 15.5 | 99.9 | 1,069 | 2.4 |
| 350 | 101.5 | 118 | 24.6 | 15.8 | 99.2 | 1,342 | 2.6 |
| 400 | 111.9 | 124 | 25.5 | 16.3 | 98.3 | 1,425 | 2.6 |
| 450 | 115.2 | 131 | 25.8 | 16.9 | 96.6 | 1,532 | 2.6 |
| 500 | 124.6 | 142 | 27.2 | 17.3 | 94.6 | 1,724 | 2.6 |

### Các cuộc chiến

Không có cuộc chiến nào.

<!-- simulate:n4:end -->

Với 4 nước trên bản đồ 64×64, láng giềng gần nhất thường cách 19–34 ô. Lần gặp đầu rơi vào lượt 152 (trung vị theo seed; v0.2 đo ở 300 lượt là lượt 97, nhưng khi đó đất mỗi nước rộng gấp 5 lần nên chạm nhau sớm hơn). Không có cuộc chiến nào, vì không nước nào có láng giềng trong vòng 4 ô. Dân TB 125 (trung vị 149) vẫn trong khoảng mục tiêu, nhưng 7/20 nước kẹt ở 25–35 dân suốt mùa: chúng không có gỗ hoặc da để dựng lều, và không gặp ai để buôn (mục 4.6).

## 4. Vấn đề của v0.2 và v0.3 xử lý ra sao

### 4.1 Dân số không có trần **[LUẬT]** · đã sửa

v0.2: tăng 4% mỗi lượt cộng dồn. Lều không giới hạn số lượng. Định cư rẻ (30 dân, 20 lương thực, +15 chỗ ở, không mất ai), nên bot lập một điểm mỗi 5 lượt. Giới hạn ô = 7 + dân/10, nên cứ 10 dân lại có thêm một ô nuôi được 10 dân: một vòng phản hồi dương chỉ dừng khi bản đồ hết đất. Kết quả là 1.242 dân TB và 100 lều mỗi nước.

v0.3 cắt vòng phản hồi ở ba chỗ:

- **Chỗ ở theo trung tâm:** tối đa 3 công trình có chỗ ở mỗi trung tâm. Thủ đô chứa tối đa 55 người, mỗi điểm định cư thêm tối đa 40.
- **Điểm định cư đắt và chậm:** 50 dân, 25 gỗ và/hoặc đá, cách các trung tâm ≥ 6 ô, +10 chỗ ở, ổn định −5 khi dời dân, và −1 ổn định mỗi lượt cho mỗi điểm vượt quá 3. Bot lập trung bình 4,4 điểm (v0.2: 19,5), điểm đầu tiên ở lượt 128.
- **Đất tăng chậm hơn dân:** giới hạn ô = 7 + ⌊√dân⌋ + thưởng + 3 mỗi điểm định cư. Ô TB ở lượt 500 là 35 (v0.2: 188).

Tăng dân logistic (8% × (1 − dân/chỗ ở)) làm dân tiến dần về mái thay vì đâm thẳng vào đó, nên dịch bệnh (gấp đôi khi > 80 dân) giữ dân ở dưới mái một chút: 186 dân trên 209 chỗ ở. Biến thể `growth-4` (hệ số 4% như v0.2) cho 148 dân: hệ số này là núm chỉnh chính cho quy mô cuối mùa. Biến thể `tents-4` (4 lều mỗi trung tâm) lại cho ít dân hơn (176), vì bot lập ít điểm định cư hơn (3,2) khi mỗi trung tâm đã chứa được nhiều hơn.

### 4.2 Nhịp phát minh so với một mùa 500 lượt **[LUẬT]** · đã sửa

v0.2: RP tỷ lệ thuận với số người nghiên cứu, giá cố định. Đồ Đá Mới ở lượt 90, xong cây gốc ở lượt 118, rồi gần 400 lượt không còn gì để học.

v0.3: N người làm ra N^0,85 RP. Giá nhân (1 + 0,75 × (d − 1)), nên d = 1 giữ nguyên giá, d = 2 nhân 1,75, d = 3 nhân 2,5. Cả cây gốc tốn 2.115 RP (v0.2: 1.040). Đồ Đá Mới ở lượt 156, xong cây gốc ở lượt 257, và 21/35 nước chưa xong ở lượt 250. Biến thể `rp-flat` (nghiên cứu như v0.2 trên các luật mới còn lại) đưa Đồ Đá Mới về lượt 85 và xong cây gốc ở lượt 128, tức là phần lớn độ dài mùa đến từ luật nghiên cứu, không phải từ dân ít đi.

Các đường cong đã thử, cùng 5 seed (đo bằng `--set` trước khi hoàn thiện phần chiến tranh của bot, nên có thể lệch vài lượt so với khối chính):

| Đường cong (`RESEARCH`) | Lều đầu | Đồ Đá Mới | Xong cây gốc |
| --- | --- | --- | --- |
| N^0,8; × (1 + 0,5 (d − 1)) | 57 | 143 | 227 |
| N^0,8; × (1 + 0,75 (d − 1)) | 67 | 165 | 264 |
| N^0,7; × (1 + 0,5 (d − 1)) | 66 | 170 | 275 |
| N^0,8; × (1 + (d − 1)) | 72 | 178 | 293 |
| N^0,8; d ≤ 2 giá gốc, d = 3 × 2,5 | 58 | 134 | 234 |
| **N^0,85; × (1 + 0,75 (d − 1))** (chọn) | 62 | 156 | 257 |

Đề xuất ban đầu "× (1 + d/2) từ d ≥ 2" nhân d = 2 lên gấp đôi, nên đẩy Đồ Đá Mới (P10, P14 đều có d = 2) ra ngoài lượt 160. Nhân chỉ d = 3 thì cây gốc vẫn xong quá sớm, vì 7 phát minh d = 2 chiếm phần lớn giá. Đường cong được chọn là đường duy nhất trong bảng giữ được cả hai mục tiêu.

Phần sau cây gốc vẫn chỉ có phát minh mở, mà phát minh mở cần trọng tài (mục 7).

### 4.3 Đói, tồn kho và ổn định **[LUẬT]** + **[BOT]** · sửa một phần

- **Đói** vẫn hiếm (0,4 lượt mỗi nước, ở 4/35 nước), đúng như mục tiêu. AI thật sẽ đói nhiều hơn bot.
- **Ổn định** giờ có thứ kéo xuống: dời dân lập điểm định cư (−5), mỗi điểm định cư vượt quá 3 (−1 mỗi lượt), cộng với thua trận và mệt mỏi chiến tranh. Ổn định TB ở lượt 500 là 79 (v0.2: 98). 7 lần nội loạn rơi vào 3 nước có 6–8 điểm định cư; một trong số đó (Lizali, `nguyen-dia-1`) vừa bành trướng quá đà vừa thua 6 trận. Biến thể `no-sprawl` (bỏ phạt −1 mỗi lượt) trả ổn định về 99,9 và 0 nội loạn. Bàn thờ, Nghi lễ, Suối Nước Nóng và hiệu ứng ổn định của phát minh mở giờ có giá trị thật.
- **Gốm** giờ có công dụng: mỗi món trong kho giảm hư lương thực 0,5 điểm %, tối đa 5 điểm %.
- **Hư hỏng 30% mỗi lượt** vẫn khiến tích trữ lương thực vô ích. Vì vậy giá điểm định cư trả bằng gỗ và đá (không hư), không bằng lương thực.
- **Phụ phẩm** (xương, sợi, da) vẫn chất đống. Giờ chúng ít nhất là chiến lợi phẩm khi chiếm trung tâm.

### 4.4 Chiến tranh có đáng không? **[LUẬT]** + **[BOT]** · đã sửa

v0.2: bên công thắng 54/54 trận, mỗi trận được đúng 1 ô và không gì khác, bên công thường chết nhiều hơn bên thủ, và cả hai hồi lại sau 2–3 lượt.

v0.3:

- **Mặt trận:** mỗi ô bị đánh chỉ nhận tối đa 5 + 5 × (số ô của bên công kề nó) chiến binh trong một lượt. Không còn chuyện dồn cả đạo quân 30% lao động vào một ô.
- **Lợi thế sân nhà:** sức bên thủ × (1 + 0,5 + địa hình + hàng rào + sông). Dân quân (10% lao động, nửa sức) luôn ra trận cùng chiến binh. Cả hai dàn đều trên mọi ô biên giới giáp kẻ thù, nên biên giới hẹp thì dễ giữ, biên giới dài thì mỏng. Kết quả: 10 người đánh 10 người trên đất trống của họ, cùng ổn định, không vũ khí, thì bên thủ luôn thắng dù may rủi thế nào; bên công phải đông hơn khoảng 1,5–2 lần trên mỗi ô.
- **Thắng thì được nhiều:** chiếm ô thì thu 15% mỗi loại hàng trong kho của bên thua (tối đa 5 đơn vị mỗi chiến binh), chiếm trung tâm thì thu 50%. Tù binh là 50% số người bên thủ tử trận (v0.2: 20%). Thủ đô hay điểm định cư thất thủ khi bên công giữ 4 ô đất liền kề nó (v0.2: phải bao vây kín). Bên thua thường mua hòa bằng cống nạp.

Trong 5 seed có 6 cuộc chiến: bên công thắng 11/24 trận, chiếm 11 ô và 1 điểm định cư; 4 cuộc chiến mang về chiến lợi phẩm, 3 cuộc kết thúc bằng cống nạp, 3 cuộc hòa suông (2 trong số đó bên công thua mọi trận). Biến thể `no-home` (bỏ lợi thế sân nhà và trần mặt trận) đưa tỷ lệ thắng lên 25/26, tức là hai luật này là thứ biến chiến tranh từ "chắc thắng" thành "có giá".

Chưa thủ đô nào thất thủ trong 5 seed: bot dừng sau 8 lượt và nhận cống nạp ngay khi bên kia xin. Luật thì có, được kiểm tra trong `test/balance.test.ts` (giữ 3/4 ô kề thì chưa thất thủ, 4/4 thì thất thủ, nước không còn điểm định cư thì diệt vong). Một AI thật quyết đánh tới cùng sẽ làm được.

### 4.5 Gặp gỡ và thám hiểm **[LUẬT]** + **[THẾ GIỚI]** · chưa sửa

Vẫn như v0.2: với 7 nước, lần gặp đầu ở lượt 3. Với 4 nước, lượt 152 (v0.3), vì đất mỗi nước giờ nhỏ hơn nhiều nên các nước khó thấy nhau hơn. Đề xuất R7 của bản trước (đoàn thám hiểm 8 ô mỗi lượt, khoảng cách khai sinh 14–24 ô bất kể số nước) vẫn đúng, và giờ quan trọng hơn: không gặp nhau thì không buôn, không đánh.

### 4.6 Điểm khai sinh không công bằng **[THẾ GIỚI]** · nặng hơn

Một vùng rừng rậm có thể "đủ điểm" khai sinh mà không có gỗ khai thác được, không đá, không thú. v0.2 cứu các nước này bằng điểm định cư rẻ (30 dân, trả bằng lương thực). v0.3 đòi 50 dân và 25 gỗ/đá, nên chúng kẹt ở 25–35 dân, trừ khi buôn được. Định cư trả bằng "gỗ và/hoặc đá" thay vì cả hai (20 gỗ + 5 đá) đã cứu được các nước chỉ thiếu một trong hai: trước khi đổi, khoảng 9/35 nước dừng ở 25–55 dân; sau khi đổi còn 1/35. Với 4 nước thì 7/20 nước vẫn kẹt, vì chúng thiếu cả hai và không gặp ai để buôn. Cách sửa đúng nằm ở `worldgen.ts`: bán kính 2 quanh mỗi điểm khai sinh phải có thú, gỗ, và đá hoặc đá lửa (R8).

### 4.7 Engine khác bộ luật, lỗi nhỏ **[ENGINE]** · đã sửa

- `ROLE_NAME` có vai `mine` ("khai mỏ").
- Đầu `step()`: nhánh báo đơn trùng giờ kiểm tra `p.inventionId` (do `applyRuling` đặt) thay vì so `p.status === "duplicate"` sau khi TypeScript đã thu hẹp kiểu. `tsc --strict` không còn báo lỗi ở `src/`.
- Gốm có công dụng (mục 4.3).
- Đếm (P18): engine trước đây ngầm giảm thêm 5 điểm % hư hỏng, còn luật ghi "sức chứa kho +20%" và mô tả trong `rules.ts` ghi "tình báo chính xác gấp đôi". Giờ cả ba thống nhất: +1 AP, sai số ước lượng tình báo giảm một nửa.
- Kỷ nguyên không lùi (đã sửa trên `main` trước đợt này).

### 4.8 Điểm yếu của bot **[BOT]**, không phải lý do để sửa luật

- Bot không dùng liên minh, gián điệp, đột kích, chư hầu hay thỉnh nguyện. Nó không đánh tới thủ đô.
- Bot không quản lý ổn định ngoài một quy tắc: không lập điểm định cư thứ 4 trở đi khi ổn định < 50. Nó không biết bỏ bớt điểm định cư hay ưu tiên Nghi lễ khi ổn định trượt, nên vài nước nội loạn lặp lại.
- Khi hết cây gốc, mọi lao động thừa đi hái lượm, nên lương thực tồn kho cuối ván vẫn lớn (TB 2.352).

## 5. Luật đã đổi trong v0.3

| Luật | v0.2 | v0.3 | Ở đâu |
| --- | --- | --- | --- |
| Công trình có chỗ ở | không giới hạn | tối đa 3 mỗi trung tâm (thủ đô + mỗi điểm định cư); chỉ tính các công trình trong trần | `HOUSING.perCentre`, RULES §4.2 |
| Tăng dân | +4% (tối thiểu 1) | +⌊dân × 8% × (1 − dân/chỗ ở)⌋, tối thiểu 1 | `GROWTH`, §4.2 |
| Giới hạn ô | 7 + dân/10 + thưởng + 3/điểm định cư | 7 + ⌊√dân⌋ + thưởng + 3/điểm định cư | `TILES`, §2.3 |
| Điểm định cư: điều kiện | 30 dân, 20 lương thực, cách trung tâm ≥ 4 ô | 50 dân, 25 gỗ và/hoặc đá (loại nhiều hơn trả trước), cách trung tâm ≥ 6 ô | `SETTLEMENT`, §2.3 |
| Điểm định cư: lợi ích | +15 chỗ ở, +3 giới hạn ô | +10 chỗ ở, chỗ cho 3 lều, +3 giới hạn ô | §2.3 |
| Điểm định cư: giá ổn định | không | −5 khi lập (10 người dời đi, vẫn là dân của nước); −1 mỗi lượt cho mỗi điểm vượt quá 3 | §2.3, §4.4 |
| RP mỗi lượt | N người → N RP | N người → N^0,85 RP | `RESEARCH.exponent`, §5.5 |
| Giá phát minh | RP gốc | RP gốc × (1 + 0,75 × (d − 1)), cả cây gốc và phát minh mở | `RESEARCH`, §5.2, §5.3 |
| Mặt trận | không giới hạn | tối đa 5 + 5 × (số ô của bên công kề ô bị đánh) chiến binh mỗi ô mỗi lượt | `WAR.frontBase/frontPerTile`, §7.4 |
| Bên thủ | × (1 + địa hình + hàng rào + sông); chia quân theo số trận; dân quân chỉ khi hết chiến binh | thêm +0,5 sân nhà; dân quân luôn ra trận; dàn đều trên mọi ô biên giới giáp kẻ thù | `WAR.home`, §7.4 |
| Chiến lợi phẩm khi chiếm | không | ô: 15% mỗi loại hàng (≤ 5 đơn vị/chiến binh); trung tâm: 50% | `WAR.lootShare/centreLoot`, §7.4 |
| Tù binh | 20% số chết bên thủ | 50% | `WAR.prisoners`, §7.4 |
| Trung tâm thất thủ | khi bị bao vây kín | khi bên công giữ 4 ô đất liền kề (hoặc tất cả, nếu ít hơn 4) | `WAR.centreFallsAt`, §7.4 |
| Gốm | không công dụng | mỗi món trong kho −0,5 điểm % hư lương thực, tối đa −5 | `SPOILAGE`, §4.1 |
| Đếm (P18) | +1 AP, −5 điểm % hư hỏng (ẩn), tình báo chính xác hơn | +1 AP, sai số tình báo giảm một nửa | §5.2 |

Những đề xuất của bản trước **chưa** làm: R7 (gặp gỡ không phụ thuộc số nước), R8 (điểm khai sinh công bằng), một con đường tới Đồ Đồng không cần trọng tài, và công dụng lớn cho xương, sợi, da.

## 6. Độ nhạy: mỗi luật đóng góp gì

Mỗi khối dưới đây chạy luật v0.3 với đúng một thay đổi, cùng 5 seed × 500 lượt × 7 nước.

### `rp-flat`: nghiên cứu như v0.2

<!-- simulate:rp-flat:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `rp-flat` (nghiên cứu như v0.2: RP tỷ lệ thuận số người, giá không nhân theo độ sâu); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 213.9 / 191 / 35 / 624 |
| Chỗ ở cuối ván: trung bình / cao nhất | 235 / 335 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 37 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 36 |
| Điểm định cư đầu tiên | 33/35, trung vị lượt 75 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 34/35, trung vị lượt 68 · 34/35, trung vị lượt 156.5 · 3/35, trung vị lượt 485 |
| Vào Đồ Đá Mới | 34/35, trung vị lượt 84.5 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 31/35, trung vị lượt 128 |
| Phát minh cây gốc trung bình cuối ván | 17.8 |
| Định cư mới trung bình mỗi nước | 5.1 |
| Ô trung bình cuối ván | 37.3 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 4.2 / 7.5 / 336.3 |
| Số lượt có nạn đói mỗi nước (TB) | 0.3 |
| Nội loạn mỗi nước (TB) | 1.2 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 36 / 76.6 / 4.2 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 4 · 16/21 · 16 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | 4 · 1 · 4 · 0 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 18.5 / 5.7 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 35.1 | 39.3 | 12.9 | 5.7 | 99.9 | 20 | 0 |
| 100 | 62 | 67 | 18.1 | 11.7 | 99.9 | 43 | 5.4 |
| 150 | 85.1 | 95.3 | 21.7 | 16.7 | 100 | 602 | 6 |
| 200 | 107.3 | 121 | 25.2 | 17.4 | 100 | 1,088 | 6.2 |
| 250 | 127.2 | 145.3 | 28.1 | 17.7 | 99.7 | 1,473 | 6.6 |
| 300 | 143.7 | 163 | 30 | 17.8 | 97.5 | 1,829 | 6.6 |
| 350 | 161.2 | 183 | 32 | 17.8 | 93.7 | 2,193 | 6.6 |
| 400 | 173.5 | 196.4 | 33.4 | 17.8 | 84.5 | 2,292 | 6.6 |
| 450 | 195.9 | 217.9 | 35.3 | 17.8 | 73.9 | 2,472 | 6.6 |
| 500 | 213.9 | 235 | 37.3 | 17.8 | 57 | 2,520 | 6.8 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Trận có chiến lợi phẩm | Thương vong công / thủ | Kết cục |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Somuso → Talodi | 377–383 | 240 : 88 | 1/3 | 1 | 1 | 8 / 2 | hòa, Talodi nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-1` | Talodi → Somuso | 482–490 | 714 : 139 | 13/13 | 13 (1 trung tâm) | 13 | 16 / 24 | hòa, Somuso nộp 20 lương thực/lượt × 20 |
| `nguyen-dia-2` | Ruka → Zakare | 434–437 | 268 : 178 | 1/2 | 1 | 1 | 5 / 4 | hòa, Zakare nộp 8 lương thực/lượt × 20 |
| `nguyen-dia-2` | Endi → Kaha | 485–488 | 522 : 276 | 1/3 | 1 | 1 | 9 / 8 | hòa, Kaha nộp 12 lương thực/lượt × 20 |

<!-- simulate:rp-flat:end -->

Đồ Đá Mới ở lượt 85 và xong cây gốc ở lượt 128, gần như v0.2. Dân cao hơn (214, nước lớn nhất 624) vì lều và Hội đồng đến sớm, và nội loạn nhiều hơn (1,2 mỗi nước) vì các nước lập điểm định cư sớm và nhiều.

### `no-home`: bỏ lợi thế sân nhà và trần mặt trận

<!-- simulate:no-home:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `no-home` (bỏ lợi thế sân nhà và giới hạn mặt trận); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 186 / 188 / 25 / 342 |
| Chỗ ở cuối ván: trung bình / cao nhất | 209.3 / 375 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 63 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 62 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 127.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 34/35, trung vị lượt 108.5 · 34/35, trung vị lượt 213 · 0/35 |
| Vào Đồ Đá Mới | 34/35, trung vị lượt 156 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 31/35, trung vị lượt 258 |
| Phát minh cây gốc trung bình cuối ván | 17.9 |
| Định cư mới trung bình mỗi nước | 4.4 |
| Ô trung bình cuối ván | 34.8 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.9 / 5.3 / 253.3 |
| Số lượt có nạn đói mỗi nước (TB) | 0.4 |
| Nội loạn mỗi nước (TB) | 0.1 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 28.6 / 93 / 5.2 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 5 · 25/26 · 24 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | 5 · 2 · 5 · 0 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 18.4 / 5.4 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.9 | 25 | 11.7 | 3.9 | 99.9 | 15 | 0 |
| 100 | 46.1 | 49 | 15 | 6.5 | 99.8 | 28 | 0 |
| 150 | 63.2 | 67.3 | 17.8 | 8.9 | 99.9 | 38 | 3.4 |
| 200 | 80.5 | 89 | 20.9 | 12.5 | 99.9 | 187 | 4.6 |
| 250 | 98.2 | 112.7 | 24 | 15.1 | 99.9 | 677 | 5.6 |
| 300 | 117.7 | 133.3 | 26.5 | 16.9 | 99.7 | 1,183 | 6.4 |
| 350 | 138.5 | 154.7 | 29.2 | 17.5 | 98.7 | 1,667 | 6.6 |
| 400 | 149.1 | 169 | 30.5 | 17.7 | 95.4 | 1,877 | 6.6 |
| 450 | 167.3 | 188.1 | 32.6 | 17.8 | 90.9 | 2,240 | 6.8 |
| 500 | 186 | 209.3 | 34.8 | 17.9 | 78.1 | 2,427 | 6.8 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Trận có chiến lợi phẩm | Thương vong công / thủ | Kết cục |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Lizali → Somuso | 277–280 | 178 : 88 | 4/4 | 4 | 4 | 6 / 6 | hòa, Somuso nộp 8 lương thực/lượt × 20 |
| `nguyen-dia-1` | Mureen → Talodi | 387–393 | 174 : 96 | 8/8 | 8 (1 trung tâm) | 8 | 17 / 23 | hòa, Talodi nộp 15 lương thực/lượt × 20 |
| `nguyen-dia-2` | Zakare → Ruka | 406–409 | 236 : 137 | 5/5 | 5 | 5 | 8 / 13 | hòa, Ruka nộp 12 lương thực/lượt × 20 |
| `nguyen-dia-3` | Taloar → Kaar | 394–397 | 261 : 119 | 3/4 | 3 | 3 | 10 / 10 | hòa, Kaar nộp 10 lương thực/lượt × 20 |
| `nguyen-dia-3` | Mivedi → Taloar | 465–470 | 241 : 148 | 5/5 | 4 (1 trung tâm) | 4 | 15 / 28 | hòa, Taloar nộp 18 lương thực/lượt × 20 |

<!-- simulate:no-home:end -->

Bên công thắng 25/26 trận, giống v0.2. Chiến lợi phẩm và thất thủ vẫn có, nhưng chiến tranh trở lại "chắc thắng".

### `no-sprawl`: bỏ phạt ổn định cho điểm định cư thứ 4 trở đi

<!-- simulate:no-sprawl:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `no-sprawl` (bỏ phạt ổn định cho điểm định cư thứ 4 trở đi); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 183.6 / 179 / 25 / 373 |
| Chỗ ở cuối ván: trung bình / cao nhất | 205 / 415 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 63 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 62 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 127.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 34/35, trung vị lượt 108.5 · 34/35, trung vị lượt 213 · 0/35 |
| Vào Đồ Đá Mới | 34/35, trung vị lượt 156 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 30/35, trung vị lượt 257 |
| Phát minh cây gốc trung bình cuối ván | 17.8 |
| Định cư mới trung bình mỗi nước | 4.3 |
| Ô trung bình cuối ván | 34.5 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.9 / 5.2 / 253.3 |
| Số lượt có nạn đói mỗi nước (TB) | 0.4 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 28.2 / 89.2 / 4 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 6 · 13/20 · 13 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | 6 · 2 · 5 · 0 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 18.2 / 5.5 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.9 | 25 | 11.7 | 3.9 | 99.9 | 15 | 0 |
| 100 | 46.1 | 49 | 15 | 6.5 | 99.8 | 28 | 0 |
| 150 | 63.2 | 67.3 | 17.8 | 8.9 | 99.9 | 38 | 3.4 |
| 200 | 80.5 | 89 | 20.9 | 12.5 | 99.9 | 187 | 4.6 |
| 250 | 98.2 | 112.7 | 24 | 15.1 | 99.9 | 677 | 5.6 |
| 300 | 117.8 | 133.3 | 26.5 | 16.8 | 100 | 1,153 | 6.4 |
| 350 | 138.5 | 154.7 | 29.2 | 17.4 | 99.9 | 1,614 | 6.6 |
| 400 | 149.5 | 169 | 30.4 | 17.7 | 99.9 | 1,804 | 6.6 |
| 450 | 166.3 | 184.7 | 32.4 | 17.8 | 99.8 | 2,161 | 6.8 |
| 500 | 183.6 | 205 | 34.5 | 17.8 | 99.9 | 2,440 | 6.8 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Trận có chiến lợi phẩm | Thương vong công / thủ | Kết cục |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Lizali → Somuso | 277–280 | 178 : 88 | 1/2 | 1 | 1 | 5 / 3 | hòa, Somuso nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-1` | Mureen → Talodi | 387–393 | 174 : 96 | 6/6 | 6 (1 trung tâm) | 6 | 12 / 11 | hòa, Talodi nộp 17 lương thực/lượt × 20 |
| `nguyen-dia-1` | Lizali → Mureen | 444–447 | 248 : 172 | 2/5 | 2 (1 trung tâm) | 2 | 20 / 10 | hòa |
| `nguyen-dia-2` | Zakare → Ruka | 406–409 | 236 : 137 | 1/2 | 1 | 1 | 5 / 4 | hòa, Ruka nộp 6 lương thực/lượt × 20 |
| `nguyen-dia-3` | Taloar → Kaar | 394–397 | 261 : 119 | 1/3 | 1 | 1 | 8 / 4 | hòa, Kaar nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-4` | Dika → Reen | 476–479 | 226 : 110 | 2/2 | 2 | 2 | 3 / 4 | hòa, Reen nộp 10 lương thực/lượt × 20 |

<!-- simulate:no-sprawl:end -->

Ổn định TB ở lượt 500 là 99,9 và không có nội loạn nào: không có luật này thì ổn định lại không có trọng lượng.

### `tents-4`: 4 công trình có chỗ ở mỗi trung tâm

<!-- simulate:tents-4:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `tents-4` (4 công trình có chỗ ở mỗi trung tâm thay vì 3); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 176 / 181 / 25 / 287 |
| Chỗ ở cuối ván: trung bình / cao nhất | 197 / 295 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 63 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 62 |
| Điểm định cư đầu tiên | 33/35, trung vị lượt 133 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 33/35, trung vị lượt 98 · 33/35, trung vị lượt 215 · 0/35 |
| Vào Đồ Đá Mới | 33/35, trung vị lượt 147 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 29/35, trung vị lượt 255 |
| Phát minh cây gốc trung bình cuối ván | 17.8 |
| Định cư mới trung bình mỗi nước | 3.2 |
| Ô trung bình cuối ván | 30.7 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.9 / 4.9 / 250.8 |
| Số lượt có nạn đói mỗi nước (TB) | 0.4 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 21.8 / 89.2 / 3 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 5 · 12/15 · 12 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | 5 · 0 · 5 · 0 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 18.1 / 5.1 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.9 | 25 | 11.7 | 3.9 | 99.9 | 15 | 0 |
| 100 | 46.5 | 51.3 | 14.9 | 6.5 | 99.8 | 28 | 0 |
| 150 | 65.7 | 71.3 | 17.6 | 9 | 100 | 40 | 3.4 |
| 200 | 83.1 | 90.4 | 20.3 | 12.6 | 100 | 232 | 4.8 |
| 250 | 98.8 | 111.3 | 22.3 | 15 | 100 | 705 | 5.6 |
| 300 | 116.4 | 131.6 | 24.2 | 16.3 | 99.9 | 1,100 | 6.2 |
| 350 | 134.2 | 152.1 | 26.3 | 17 | 99.8 | 1,432 | 6.4 |
| 400 | 146.4 | 164.4 | 27.2 | 17.6 | 99.7 | 1,708 | 6.6 |
| 450 | 161.7 | 181 | 29 | 17.8 | 99.7 | 2,052 | 6.6 |
| 500 | 176 | 197 | 30.7 | 17.8 | 99.2 | 2,325 | 6.6 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Trận có chiến lợi phẩm | Thương vong công / thủ | Kết cục |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Lizali → Somuso | 277–280 | 179 : 96 | 1/2 | 1 | 1 | 5 / 3 | hòa, Somuso nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-1` | Lizali → Somuso | 409–416 | 213 : 110 | 2/4 | 2 | 2 | 9 / 6 | hòa, Somuso nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-3` | Taloar → Kaar | 394–397 | 243 : 67 | 4/4 | 4 | 4 | 6 / 4 | hòa, Kaar nộp 6 lương thực/lượt × 20 |
| `nguyen-dia-4` | Dika → Reen | 476–479 | 218 : 115 | 2/2 | 2 | 2 | 5 / 4 | hòa, Reen nộp 10 lương thực/lượt × 20 |
| `nguyen-dia-5` | Armu → Kaon | 344–347 | 191 : 128 | 3/3 | 3 | 3 | 4 / 7 | hòa, Kaon nộp 16 lương thực/lượt × 20 |

<!-- simulate:tents-4:end -->

### `growth-4`: hệ số tăng dân 4% thay vì 8%

<!-- simulate:growth-4:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `growth-4` (tăng dân logistic với hệ số 4% (như v0.2) thay vì 8%); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 147.7 / 142 / 25 / 271 |
| Chỗ ở cuối ván: trung bình / cao nhất | 186.4 / 305 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 63 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 62 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 127.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 34/35, trung vị lượt 108.5 · 33/35, trung vị lượt 207 · 0/35 |
| Vào Đồ Đá Mới | 34/35, trung vị lượt 156 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 31/35, trung vị lượt 266 |
| Phát minh cây gốc trung bình cuối ván | 17.9 |
| Định cư mới trung bình mỗi nước | 3.9 |
| Ô trung bình cuối ván | 31.9 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.9 / 3.7 / 220.6 |
| Số lượt có nạn đói mỗi nước (TB) | 0.4 |
| Nội loạn mỗi nước (TB) | 0.1 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 25 / 85.6 / 6.6 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 8 · 20/33 · 20 |
| Chiến tranh có kết quả: chiến lợi phẩm · trung tâm thất thủ · hòa kèm cống nạp · diệt vong | 7 · 0 · 6 · 0 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 18.2 / 5.3 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.9 | 25 | 11.7 | 3.9 | 99.9 | 15 | 0 |
| 100 | 46.1 | 49 | 15 | 6.5 | 99.8 | 28 | 0 |
| 150 | 63.2 | 67.3 | 17.8 | 8.9 | 99.9 | 38 | 3.4 |
| 200 | 79.5 | 89 | 20.8 | 12.5 | 99.9 | 180 | 4.6 |
| 250 | 93.8 | 110.7 | 23.6 | 15.1 | 99.9 | 654 | 5.4 |
| 300 | 106.5 | 126.7 | 25.3 | 16.8 | 100 | 1,092 | 6.2 |
| 350 | 124.5 | 143.9 | 27.7 | 17.4 | 99.3 | 1,465 | 6.4 |
| 400 | 126.4 | 156.7 | 28.7 | 17.7 | 96.7 | 1,551 | 6.4 |
| 450 | 139.9 | 170.4 | 30.5 | 17.8 | 94.1 | 1,814 | 6.8 |
| 500 | 147.7 | 186.4 | 31.9 | 17.9 | 87.2 | 2,044 | 6.8 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Trận có chiến lợi phẩm | Thương vong công / thủ | Kết cục |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Lizali → Somuso | 277–280 | 178 : 88 | 1/2 | 1 | 1 | 5 / 3 | hòa, Somuso nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-2` | Zakare → Ruka | 406–409 | 232 : 134 | 1/2 | 1 | 1 | 5 / 4 | hòa, Ruka nộp 6 lương thực/lượt × 20 |
| `nguyen-dia-2` | Endi → Lololi | 466–469 | 206 : 109 | 5/6 | 5 | 5 | 7 / 10 | hòa, Lololi nộp 9 lương thực/lượt × 20 |
| `nguyen-dia-3` | Mien → Rutaka | 261–265 | 179 : 101 | 5/9 | 5 | 5 | 21 / 7 | hòa |
| `nguyen-dia-3` | Taloar → Kaar | 394–398 | 257 : 111 | 0/4 | 0 | 0 | 13 / 3 | hòa |
| `nguyen-dia-3` | Mivedi → Taloar | 465–468 | 220 : 111 | 1/1 | 1 | 1 | 1 / 3 | hòa, Taloar nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-3` | Endion → Mien | 478–481 | 158 : 101 | 1/2 | 1 | 1 | 3 / 4 | hòa, Mien nộp 5 lương thực/lượt × 20 |
| `nguyen-dia-4` | Rehave → Loenha | 391–397 | 147 : 92 | 6/7 | 6 | 6 | 8 / 7 | hòa, Loenha nộp 13 lương thực/lượt × 20 |

<!-- simulate:growth-4:end -->

## 7. Còn lại và đề xuất tiếp

1. **R8, điểm khai sinh công bằng [THẾ GIỚI]:** bán kính 2 quanh mỗi điểm khai sinh phải có thú, gỗ, và đá hoặc đá lửa. Đây là nguyên nhân duy nhất khiến một số nước kẹt ở 25–35 dân, nhất là khi có 4 nước.
2. **R7, gặp gỡ không phụ thuộc số nước [LUẬT] + [THẾ GIỚI]:** với đất nhỏ hơn, 4 nước gặp nhau ở lượt 152 và không đánh nhau lần nào.
3. **Sau cây gốc:** từ khoảng lượt 250, cây gốc hết với nhiều nước, và không có trọng tài thì không còn gì để học. Nên thêm vào cây gốc một con đường d4–d5 tới `nhận-biết-khoáng` và `nhiệt-cao`, giá cao, để cuối mùa có Cổng Đồ Đồng.
4. **Ổn định:** phạt bành trướng (−1 mỗi điểm vượt 3) là đủ để có nội loạn hiếm. Nếu AI thật bành trướng nhanh hơn bot, có thể cần hạ xuống −1 cho mỗi 2 điểm vượt, hoặc để Ký hiệu (`ghi-chép`) nâng số điểm định cư miễn phí lên 4.
5. **Chiến tranh:** nếu cần nhiều thủ đô thất thủ hơn, chỉ cần hạ `WAR.centreFallsAt` xuống 3. Nhưng nên quan sát AI thật trước, vì bot dừng ở lượt thứ 8.
