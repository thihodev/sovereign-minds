# Báo cáo cân bằng

Phiên bản 19/10/2026 · luật v0.2 (`src/rules.ts`, `src/engine.ts` ở commit `f34c5a1`) · bot mới trong `src/ai/bot.ts`.

Báo cáo này đo xem bộ luật hiện tại vận hành ra sao khi mọi quốc gia chơi **có tính toán**, rồi đề xuất sửa luật kèm con số. Mọi số liệu do `tools/simulate.ts` sinh ra từ engine thật. Các khối nằm giữa dấu `<!-- simulate… -->` được công cụ ghi đè mỗi lần chạy lại; phần chữ còn lại là phân tích viết tay.

Mỗi vấn đề được gắn nhãn:

- **[LUẬT]**: con số hoặc cơ chế trong bộ luật gây ra nó; bot nào, AI nào cũng sẽ gặp.
- **[THẾ GIỚI]**: do sinh bản đồ (`worldgen.ts`).
- **[ENGINE]**: engine làm khác với bộ luật, hoặc là lỗi nhỏ.
- **[BOT]**: do bot chơi chưa giỏi; không nên sửa luật vì nó.

## 1. Tóm tắt

1. **Dân số bùng nổ, không có trần.** Một người chơi biết tính có 1.242 dân trung bình ở lượt 500 (cao nhất 1.590), 19,5 điểm định cư và hơn 100 lều mỗi nước, giữ 187 ô (khoảng 60% đất liền của bản đồ có chủ). Tăng 4% mỗi lượt cộng dồn, chỗ ở thì rẻ và không giới hạn, giới hạn ô lại tăng theo dân số. **[LUẬT]**
2. **Cây phát minh hết quá sớm.** Cả 35/35 nước vào Đồ Đá Mới (trung vị lượt 90) và học xong cả 18 phát minh gốc vào khoảng lượt 118. Sau đó, khi không có trọng tài duyệt phát minh mở, gần 400 lượt không còn gì để nghiên cứu. **[LUẬT]**
3. **Đói, ổn định và nội loạn gần như không còn ý nghĩa.** Mỗi nước chỉ có trung bình 0,4 lượt đói trong cả ván, ổn định đứng ở 98–100 suốt ván, 0 nội loạn. **[LUẬT]**, kèm một phần **[BOT]**: AI thật sẽ đói nhiều hơn bot.
4. **Chiến tranh rẻ nhưng vô nghĩa.** Có 14 cuộc chiến trong 5 thế giới. Bên tấn công thắng 54/54 trận, mỗi trận được 1 ô, nhưng bên công thường chết nhiều người hơn bên thủ. Không cuộc chiến nào thay đổi cục diện. **[LUẬT]**, kèm **[BOT]**: bot chỉ đánh nước yếu hơn nhiều.
5. **Thời điểm gặp nhau phụ thuộc số quốc gia.** Với 7 nước, lần gặp đầu là lượt 3 (trung vị). Với 4 nước là lượt 97. **[LUẬT]** + **[THẾ GIỚI]**
6. **Điểm khai sinh chưa công bằng.** Một số nước khởi đầu ở rừng rậm, không có thú săn (nên không có da) và không có gỗ hoặc đá. Không có da thì không dựng được lều. Không có lều thì không vượt được 25 dân, mà định cư lại cần 30 dân, nên nước đó kẹt ở 25 dân cho tới khi buôn được da. **[THẾ GIỚI]** + **[LUẬT]**

Năm đề xuất quan trọng nhất (chi tiết và số đo ở mục 5):

1. Giới hạn lều theo từng trung tâm (thủ đô hoặc điểm định cư), ví dụ 3 lều mỗi trung tâm.
2. Định cư đắt và chậm hơn: cần 40–60 dân, cách các trung tâm ≥ 6 ô, chỉ +10 chỗ ở, trả bằng hàng không hư (gỗ, đá) thay vì lương thực.
3. Tăng dân theo đường cong logistic, và giới hạn ô tăng theo căn bậc hai của dân số, để cắt vòng phản hồi dân → đất → lương thực → dân.
4. Chi phí RP tăng theo độ sâu (khoảng ×(1 + d/2)), và cần có nội dung sau cây gốc (một con đường tới đồ đồng không phụ thuộc trọng tài).
5. Chiến tranh phải có giá và có kết quả: giới hạn quân theo mặt trận, bên thủ có lợi thế thật, chiến thắng đem lại thứ đáng giá (kho, tù binh, cống nạp).

## 2. Đo cái gì, đo thế nào

### Công cụ

```bash
# Báo cáo đầy đủ của luật hiện tại (khối "simulate" bên dưới)
node --disable-warning=ExperimentalWarning tools/simulate.ts \
  --seeds nguyen-dia-1,nguyen-dia-2,nguyen-dia-3,nguyen-dia-4,nguyen-dia-5 --ticks 500 --nations 7 --out docs/BALANCE.md
# Thử một thay đổi luật mà không sửa file luật (chỉ đổi bảng trong bộ nhớ của tiến trình)
node --disable-warning=ExperimentalWarning tools/simulate.ts --seeds … --ticks 500 --nations 7 \
  --variant housing-capped --brief --out docs/BALANCE.md
```

`tools/simulate.ts` tạo thế giới chỉ có bot bằng `createWorld`, chạy `step` qua từng lượt, rồi ghi lại theo lượt và theo quốc gia: dân số, lương thực, ổn định, số ô, phát minh, kỷ nguyên, số chết đói/rét/dịch, nội loạn, lần gặp đầu tiên, hiệp ước, giao dịch, chiến tranh (ai đánh ai, tỷ lệ dân lúc tuyên chiến, trận thắng, ô chiếm, thương vong), trận đánh, điểm định cư, lỗi kiểm toán sổ cái, ms/lượt của engine và của bot, các mốc thời gian (lều đầu tiên, định cư đầu tiên, 50/100/500 dân, Đồ Đá Mới, xong cây gốc) và các hành động bị từ chối. `--variant` áp một thay đổi luật lên các bảng trong `rules.ts` **ngay trong tiến trình**, không sửa file nào, để ước lượng tác dụng của đề xuất trước khi ai đó viết luật. `--json` xuất số liệu thô.

Lưu ý: ms/lượt đo trên máy đang chạy song song nhiều mô phỏng, nên chỉ để so sánh tương đối.

### Bot

Bot (`src/ai/bot.ts`) gửi đúng JSON mà một AI gửi, và là tất định với cùng (world, nation, rand). Mỗi lượt nó:

- **Ăn đủ:** đặt mục tiêu sản lượng khoảng 120% nhu cầu, cao hơn khi kho mỏng hoặc khi đang để dành cho một điểm định cư. Nó chia lao động theo năng suất thật của từng nguồn: săn có công cụ, đánh cá, ruộng, hái, săn không công cụ. Mỗi nguồn bị giới hạn bởi lượng tái sinh của đất mình.
- **Nghiên cứu** theo lộ trình P2 → P1 → P3 → P7 → P8 (lều) → P4 (định cư) → P6 → P10 → P14/P15 (Đồ Đá Mới) → phần còn lại. Nếu bị cô lập trên một vùng đất đã thám hiểm hết, nó ưu tiên thuyền (P16) ngay sau lều.
- **Chỗ ở:** dựng lều khi dân gần chạm mái và đất đủ nuôi thêm 10 người. Nó để dành da, bện dây từ sợi, giữ gỗ. Khi đủ 30 dân và có tổ-chức, nó lập điểm định cư ở chỗ đất tốt trong tầm nhìn, sau khi đã bỏ bớt ô để không vượt giới hạn mới.
- **Công trình:** xưởng (thêm xưởng khi có nhiều thợ săn), hố trữ, ruộng khi đất hoang không đủ, chuồng, bàn thờ, lò gốm, hàng rào khi có láng giềng mạnh chưa ký ước.
- **Công cụ:** giữ đủ công cụ đá cho mọi thợ săn, cử thêm người khai đá khi thiếu, rèn lưỡi đá, giáo (khi có chiến tranh), áo da (ở vùng có mùa đông), rìu.
- **Mỏ:** dùng vai `mine` khi thấy quặng; nếu không thì đào muối để bán.
- **Đất:** khai hoang ô tốt nhất kề lãnh thổ, ưu tiên thứ mình thiếu (đá, gỗ, đá lửa, đất trồng). Khi chạm giới hạn ô, nó đổi ô nghèo nhất lấy ô có thứ mình thiếu. Khi vượt giới hạn, nó bỏ bớt ô.
- **Thám hiểm** từ ô biên về hướng còn nhiều đất chưa biết nhất, đi theo đúng đường mà đoàn thám hiểm của engine sẽ đi.
- **Ngoại giao:** ký bất tương xâm với láng giềng, đổi hàng dư lấy hàng thiếu theo giá chuẩn (`GOOD_VALUE`), nhận các đề nghị công bằng.
- **Chiến tranh:** thỉnh thoảng (5% mỗi lượt khi đủ điều kiện, cách nhau ít nhất 80 lượt) tuyên chiến với một láng giềng **sát biên** chưa ký ước mà dân số (theo tình báo) dưới 60% dân mình. Nó dồn 30% lao động làm chiến binh, mỗi lượt đánh ô địch yếu nhất kề đất mình, rồi giảng hòa sau khoảng 4 lượt. Bên bị đánh đưa 25% lao động ra thủ và xin hòa ngay.
- **Phát minh mở:** thỉnh thoảng nộp một đơn nhỏ có căn cứ (+10% một vai, từ hai tiên quyết đã có). Không có trọng tài nên đơn nằm chờ, mỗi nước một đơn.

Chạy 5 seed × 500 lượt × 7 nước không có lỗi kiểm toán nào. Chỉ 41 hành động bị từ chối trong 17.500 lượt-quốc gia (0,23%), đa số là hai nước khai hoang cùng một ô trong cùng lượt.

### Giới hạn của phép đo

- Bot không phải LLM. Nó chơi đều, không quên, không nói dối, nên **trần** tăng trưởng nó đạt được cao hơn những gì AI thật thường đạt. Nhưng trần là thứ luật phải chặn, vì sớm muộn sẽ có một AI tìm ra.
- Không có trọng tài nên không có phát minh mở nào được duyệt: không ai chạm được Cổng Đồ Đồng.
- Bot chỉ đánh nước yếu hơn nhiều, nên số liệu chiến tranh nghiêng về phía bên công.

## 3. Kết quả với luật hiện tại

Mốc thời gian điển hình (trung vị của 35 quốc gia, 5 seed × 7 nước):

| Mốc | Lượt |
| --- | --- |
| Lều đầu tiên (chỗ ở > 25) | 35 |
| 50 dân | 70 |
| Điểm định cư đầu tiên | 78 |
| Đồ Đá Mới (35/35 nước) | 90 |
| 100 dân | 108 |
| Xong cả 18 phát minh gốc (32/35 nước) | 118 |
| 500 dân (32/35 nước) | 192 |
| Lượt 500: 1.242 dân, 187 ô, 19,5 điểm định cư, khoảng 100 lều mỗi nước | 500 |

Số liệu đầy đủ (tổng hợp, chuỗi theo lượt, các cuộc chiến, chi tiết từng seed):

<!-- simulate:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `base` (luật hiện tại, không đổi gì); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 1,242.5 / 1386 / 275 / 1590 |
| Chỗ ở cuối ván: trung bình / cao nhất | 1,268.7 / 1590 |
| Vượt chỗ ở tự nhiên 25 | 35/35, trung vị lượt 36 |
| Lều đầu tiên xây xong | 35/35, trung vị lượt 35 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 77.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 35/35, trung vị lượt 70 · 35/35, trung vị lượt 108 · 32/35, trung vị lượt 192 |
| Vào Đồ Đá Mới | 35/35, trung vị lượt 90 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 32/35, trung vị lượt 117.5 |
| Phát minh cây gốc trung bình cuối ván | 17.8 |
| Định cư mới trung bình mỗi nước | 19.5 |
| Ô trung bình cuối ván | 187.6 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 2.7 / 122 / 1,718.2 |
| Số lượt có nạn đói mỗi nước (TB) | 0.4 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 82.2 / 87.8 / 10.8 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 14 · 54/54 · 54 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 12.8 / 5.8 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 34.8 | 39.9 | 10.5 | 5.7 | 99.9 | 20 | 0 |
| 100 | 91.7 | 99.1 | 25.5 | 11.9 | 99.9 | 138 | 5.2 |
| 150 | 249.1 | 254.6 | 61.9 | 16.6 | 99.8 | 2,142 | 6 |
| 200 | 454.6 | 460.6 | 103.4 | 17.5 | 99.5 | 5,218 | 6.6 |
| 250 | 611.1 | 614.9 | 126.1 | 17.8 | 99.7 | 7,858 | 6.8 |
| 300 | 734.3 | 745.7 | 138.1 | 17.8 | 99.2 | 9,776 | 7 |
| 350 | 870.3 | 881 | 150.7 | 17.8 | 99.2 | 11,503 | 7 |
| 400 | 1,003.2 | 1,009.3 | 163.2 | 17.8 | 99.7 | 12,868 | 7 |
| 450 | 1,127.5 | 1,143.6 | 177.3 | 17.8 | 99.2 | 14,501 | 7 |
| 500 | 1,242.5 | 1,268.7 | 187.6 | 17.8 | 98.1 | 15,595 | 7 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Thương vong công / thủ |
| --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Lizali → Somuso | 153–157 | 310 : 173 | 3/3 | 3 | 18 / 25 |
| `nguyen-dia-2` | Endi → Lololi | 239–245 | 810 : 440 | 4/4 | 4 | 68 / 109 |
| `nguyen-dia-2` | Kaliso → Ruka | 348–354 | 1020 : 515 | 4/4 | 4 | 60 / 65 |
| `nguyen-dia-2` | Endi → Ruka | 350–354 | 1093 : 505 | 3/3 | 3 | 94 / 46 |
| `nguyen-dia-2` | Endi → Ruka | 466–470 | 1490 : 669 | 3/3 | 3 | 110 / 110 |
| `nguyen-dia-2` | Zakare → Ruka | 483–489 | 1320 : 725 | 5/5 | 5 | 164 / 84 |
| `nguyen-dia-3` | Taloar → Kaar | 199–205 | 495 : 143 | 1/1 | 1 | 12 / 9 |
| `nguyen-dia-3` | Endion → Rutaka | 241–247 | 740 : 25 | 5/5 | 5 | 70 / 5 |
| `nguyen-dia-3` | Taloar → Kaar | 312–316 | 910 : 510 | 3/3 | 3 | 78 / 87 |
| `nguyen-dia-3` | Endion → Rutaka | 493–499 | 1480 : 290 | 5/5 | 5 | 147 / 75 |
| `nguyen-dia-4` | Dilo → Reen | 259–265 | 605 : 160 | 5/5 | 5 | 65 / 43 |
| `nguyen-dia-5` | Armu → Mure | 301–307 | 935 : 245 | 5/5 | 5 | 106 / 63 |
| `nguyen-dia-5` | Ruonmi → Mure | 442–446 | 1250 : 625 | 3/3 | 3 | 76 / 106 |
| `nguyen-dia-5` | Kataar → Tave | 490–496 | 1500 : 315 | 5/5 | 5 | 165 / 76 |

## Chi tiết từng seed

### Seed `nguyen-dia-1`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 15.2 ms/lượt engine + 6.6 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lion | 1235 (1235) | 1235 | 182 | 18 | 135 | 36 / 124 | 18 | 5 xưởng, 94 lều, 2 hố, 1 chuồng, 1 ruộng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 219 / 2499 | 0/0 |
| Solita | 1340 (1340) | 1340 | 214 | 18 | 93 | 33 / 78 | 25 | 5 xưởng, 94 lều, 1 ruộng, 2 hố, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 115 / 2033 | 0/0 |
| Talodi | 929 (1275) | 1285 | 166 | 18 | 90 | 33 / 74 | 18 | 5 xưởng, 99 lều, 1 ruộng, 1 chuồng, 2 hố, 1 lò, 1 bàn thờ, 1 rào | 76 (60) | 0 / 95 / 1908 | 0/0 |
| Somuso | 1120 (1120) | 1120 | 149 | 18 | 87 | 32 / 65 | 11 | 5 xưởng, 93 lều, 1 ruộng, 1 chuồng, 1 lò, 2 hố, 1 rào, 1 bàn thờ | 100 (60) | 0 / 86 / 2072 | 0/3 |
| Redi | 1515 (1515) | 1515 | 244 | 18 | 81 | 40 / 77 | 28 | 6 xưởng, 2 hố, 107 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 100 (60) | 0 / 108 / 2806 | 0/0 |
| Mureen | 1385 (1385) | 1385 | 206 | 18 | 74 | 42 / 53 | 20 | 6 xưởng, 2 hố, 106 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 100 (60) | 0 / 151 / 2160 | 0/0 |
| Lizali | 1415 (1415) | 1415 | 198 | 18 | 90 | 60 / 68 | 16 | 5 xưởng, 2 hố, 115 lều, 1 chuồng, 1 ruộng, 1 bàn thờ, 1 rào, 1 lò | 100 (60) | 5 / 0 / 920 | 3/0 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 32.3 | 35 | 36.4 | 9.6 | 5.4 | 100 | 20 | 0 |
| 100 | 7 | 82.9 | 126 | 87.1 | 23.1 | 11.9 | 100 | 54 | 6 |
| 150 | 7 | 250.3 | 349 | 257.1 | 64.3 | 17.6 | 100 | 2,006 | 7 |
| 200 | 7 | 448.4 | 625 | 448.6 | 102.9 | 18 | 100 | 5,544 | 7 |
| 250 | 7 | 614.1 | 845 | 617.9 | 124.7 | 18 | 99.7 | 8,494 | 7 |
| 300 | 7 | 742.9 | 935 | 755.7 | 136.4 | 18 | 99.1 | 10,768 | 7 |
| 350 | 7 | 883.6 | 1085 | 895.7 | 150.7 | 18 | 99.4 | 12,751 | 7 |
| 400 | 7 | 1,014 | 1225 | 1,030 | 165.6 | 18 | 98.9 | 14,141 | 7 |
| 450 | 7 | 1,168.3 | 1355 | 1,173.6 | 178.4 | 18 | 99.4 | 16,030 | 7 |
| 500 | 7 | 1,277 | 1515 | 1,327.9 | 194.1 | 18 | 96.6 | 18,076 | 7 |

- Gặp gỡ: lần đầu ở lượt 2, tổng 23 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 84 non_aggression, 1 peace. Giao dịch: 38. Chiến tranh: 1 (+0 đồng minh tham chiến). Trận: 3.
- Định cư mới: 136. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 73.
- Hành động bị từ chối nhiều nhất: 1× `build: Ô xây dựng phải thuộc lãnh thổ của bạn`; 1× `found_settlement: Phải là ô đất liền vô chủ, không phải núi`; 1× `claim_tile: Talodi giành được ô này cùng lượt`; 1× `claim_tile: Lizali giành được ô này cùng lượt`; 1× `claim_tile: Somuso giành được ô này cùng lượt`.

### Seed `nguyen-dia-2`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 12.1 ms/lượt engine + 5.4 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Taru | 1327 (1505) | 1515 | 208 | 18 | 81 | 35 / 74 | 24 | 6 xưởng, 113 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 88 (60) | 0 / 361 / 1745 | 0/0 |
| Endi | 1386 (1580) | 1590 | 232 | 18 | 62 | 33 / 50 | 27 | 6 xưởng, 2 hố, 116 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 86 (60) | 0 / 182 / 1938 | 10/0 |
| Lololi | 450 (450) | 450 | 123 | 18 | 93 | 34 / 72 | 23 | 2 xưởng, 8 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò | 100 (60) | 0 / 58 / 672 | 0/4 |
| Kaliso | 1480 (1480) | 1480 | 220 | 18 | 90 | 36 / 80 | 21 | 11 xưởng, 114 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 rào, 1 lò | 100 (60) | 0 / 134 / 1578 | 4/0 |
| Zakare | 1380 (1380) | 1380 | 191 | 18 | 97 | 36 / 116 | 15 | 6 xưởng, 113 lều, 1 ruộng, 1 chuồng, 2 hố, 1 lò, 1 bàn thờ, 1 rào | 100 (60) | 0 / 134 / 585 | 5/0 |
| Kaha | 1495 (1495) | 1495 | 220 | 18 | 86 | 35 / 71 | 24 | 6 xưởng, 2 hố, 111 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 96 (60) | 0 / 173 / 1301 | 0/0 |
| Ruka | 682 (725) | 725 | 53 | 14 | 159 | 134 / 173 | 2 | 1 xưởng, 1 chuồng, 67 lều, 2 hố, 1 rào, 1 bàn thờ | 96 (60) | 45 / 0 / 876 | 0/15 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 35.9 | 42 | 39.3 | 10.1 | 5.6 | 99.7 | 21 | 0 |
| 100 | 7 | 96 | 189 | 105.7 | 27.7 | 13 | 99.9 | 232 | 6 |
| 150 | 7 | 260.4 | 420 | 264.3 | 65.6 | 16.6 | 100 | 2,145 | 6 |
| 200 | 7 | 498.6 | 710 | 498.6 | 115.1 | 17.4 | 100 | 5,133 | 7 |
| 250 | 7 | 617 | 820 | 617.9 | 126.7 | 17.4 | 100 | 8,090 | 7 |
| 300 | 7 | 746.4 | 990 | 746.4 | 140.1 | 17.4 | 100 | 9,952 | 7 |
| 350 | 7 | 860.7 | 1065 | 872.1 | 151.1 | 17.4 | 99.3 | 11,682 | 7 |
| 400 | 7 | 996.4 | 1270 | 996.4 | 161.1 | 17.4 | 100 | 12,461 | 7 |
| 450 | 7 | 1,106.1 | 1365 | 1,120.7 | 174.4 | 17.4 | 98.3 | 13,346 | 7 |
| 500 | 7 | 1,171.4 | 1495 | 1,233.6 | 178.1 | 17.4 | 95.1 | 14,165 | 7 |

- Gặp gỡ: lần đầu ở lượt 6, tổng 27 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 87 non_aggression, 6 peace. Giao dịch: 140. Chiến tranh: 5 (+0 đồng minh tham chiến). Trận: 19.
- Định cư mới: 136. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 61.
- Hành động bị từ chối nhiều nhất: 3× `treaty: Đang chiến tranh: chỉ đề nghị được hiệp ước hòa bình (peace)`; 3× `claim_tile: Ruka giành được ô này cùng lượt`; 2× `build: Ô xây dựng phải thuộc lãnh thổ của bạn`; 2× `claim_tile: Kaha giành được ô này cùng lượt`; 2× `claim_tile: Kaliso giành được ô này cùng lượt`.

### Seed `nguyen-dia-3`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 13.6 ms/lượt engine + 6.4 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rutaka | 275 (290) | 290 | 38 | 18 | 273 | 248 / 310 | 1 | 2 xưởng, 2 hố, 3 ruộng, 1 bàn thờ, 1 lò, 25 lều, 2 chuồng, 1 rào | 97 (60) | 41 / 16 / 293 | 0/10 |
| Hami | 1290 (1290) | 1290 | 206 | 18 | 89 | 37 / 73 | 23 | 5 xưởng, 2 hố, 92 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 163 / 2156 | 0/0 |
| Kaar | 1040 (1040) | 1040 | 136 | 17 | 151 | 33 / 162 | 9 | 4 xưởng, 88 lều, 1 ruộng, 1 chuồng, 1 rào, 2 hố, 1 bàn thờ | 100 (60) | 0 / 74 / 860 | 0/4 |
| Endion | 1500 (1500) | 1500 | 234 | 18 | 72 | 33 / 56 | 25 | 6 xưởng, 110 lều, 1 ruộng, 2 hố, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 122 / 1768 | 10/0 |
| Mien | 1460 (1460) | 1460 | 223 | 18 | 82 | 33 / 63 | 23 | 6 xưởng, 109 lều, 1 chuồng, 1 ruộng, 2 hố, 1 bàn thờ, 1 rào, 1 lò | 100 (60) | 0 / 162 / 2616 | 0/0 |
| Taloar | 1500 (1500) | 1500 | 228 | 18 | 81 | 35 / 95 | 23 | 6 xưởng, 113 lều, 1 ruộng, 1 chuồng, 2 hố, 1 rào, 1 lò, 1 bàn thờ | 100 (60) | 0 / 114 / 657 | 4/0 |
| Mivedi | 1590 (1590) | 1590 | 251 | 18 | 76 | 34 / 58 | 29 | 6 xưởng, 113 lều, 1 ruộng, 1 chuồng, 1 lò, 2 hố, 1 bàn thờ, 1 rào | 100 (60) | 0 / 0 / 2178 | 0/0 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 34.9 | 42 | 39.3 | 10.7 | 6.3 | 100 | 21 | 0 |
| 100 | 7 | 85.7 | 135 | 94.3 | 24.9 | 11.9 | 99.9 | 51 | 5 |
| 150 | 7 | 221 | 360 | 225 | 54.7 | 15.6 | 100 | 1,692 | 5 |
| 200 | 7 | 406.1 | 640 | 406.4 | 94.3 | 17.6 | 100 | 3,991 | 6 |
| 250 | 7 | 578.1 | 880 | 579.3 | 122.1 | 17.7 | 100 | 6,182 | 6 |
| 300 | 7 | 701.7 | 1020 | 720 | 135.1 | 17.7 | 98.9 | 8,157 | 7 |
| 350 | 7 | 849.1 | 1180 | 857.1 | 147.3 | 17.7 | 99.1 | 9,313 | 7 |
| 400 | 7 | 963.6 | 1225 | 975.7 | 158.6 | 17.7 | 99.7 | 10,514 | 7 |
| 450 | 7 | 1,095.1 | 1440 | 1,107.1 | 172.3 | 17.9 | 100 | 12,779 | 7 |
| 500 | 7 | 1,236.4 | 1590 | 1,238.6 | 188 | 17.9 | 99.6 | 13,718 | 7 |

- Gặp gỡ: lần đầu ở lượt 3, tổng 26 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 75 non_aggression, 4 peace. Giao dịch: 72. Chiến tranh: 4 (+0 đồng minh tham chiến). Trận: 14.
- Định cư mới: 133. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 71.
- Hành động bị từ chối nhiều nhất: 4× `claim_tile: Endion giành được ô này cùng lượt`; 2× `claim_tile: Rutaka giành được ô này cùng lượt`; 1× `research: Lãnh thổ chưa có điều kiện vật chất cho Gốm`; 1× `found_settlement: Phải là ô đất liền vô chủ, không phải núi`; 1× `claim_tile: Mien giành được ô này cùng lượt`.

### Seed `nguyen-dia-4`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 12.8 ms/lượt engine + 5.9 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Reen | 775 (775) | 775 | 97 | 18 | 211 | 186 / 194 | 4 | 5 xưởng, 2 hố, 1 ruộng, 69 lều, 1 bàn thờ, 1 rào, 1 lò, 1 chuồng | 100 (60) | 0 / 110 / 1121 | 0/5 |
| Dilo | 1275 (1275) | 1275 | 196 | 18 | 115 | 33 / 99 | 20 | 5 xưởng, 95 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 141 / 1629 | 5/0 |
| Mumi | 1235 (1235) | 1235 | 173 | 18 | 111 | 32 / 116 | 14 | 5 xưởng, 100 lều, 1 ruộng, 1 chuồng, 1 lò, 2 hố, 1 bàn thờ, 1 rào | 100 (60) | 0 / 148 / 1716 | 0/0 |
| Dika | 1555 (1555) | 1555 | 242 | 18 | 84 | 40 / 76 | 26 | 6 xưởng, 2 hố, 114 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 188 / 1648 | 0/0 |
| Veen | 1530 (1575) | 1555 | 222 | 18 | 96 | 36 / 84 | 26 | 6 xưởng, 114 lều, 2 hố, 1 chuồng, 1 ruộng, 1 bàn thờ, 1 lò, 1 rào | 98 (60) | 0 / 144 / 1942 | 0/0 |
| Rehave | 1467 (1545) | 1555 | 223 | 18 | 81 | 35 / 61 | 26 | 6 xưởng, 114 lều, 1 ruộng, 1 chuồng, 2 hố, 1 lò, 1 bàn thờ | 98 (60) | 0 / 247 / 3111 | 0/0 |
| Loenha | 1410 (1410) | 1410 | 213 | 18 | 83 | 33 / 80 | 23 | 6 xưởng, 104 lều, 1 ruộng, 1 chuồng, 2 hố, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 0 / 2889 | 0/0 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 35.4 | 42 | 39.3 | 10.4 | 5.6 | 100 | 19 | 0 |
| 100 | 7 | 92.1 | 170 | 98.6 | 25.1 | 10.9 | 100 | 46 | 4 |
| 150 | 7 | 256.4 | 410 | 258.6 | 62.3 | 16.7 | 100 | 2,199 | 6 |
| 200 | 7 | 450.7 | 635 | 477.1 | 102.7 | 17.6 | 98 | 5,671 | 6 |
| 250 | 7 | 631.4 | 815 | 639.3 | 128.3 | 18 | 99.4 | 8,617 | 7 |
| 300 | 7 | 772.6 | 975 | 776.4 | 144.4 | 18 | 99.7 | 10,612 | 7 |
| 350 | 7 | 911.4 | 1145 | 922.1 | 157 | 18 | 99.1 | 12,299 | 7 |
| 400 | 7 | 1,062.9 | 1295 | 1,065 | 168.7 | 18 | 99.7 | 13,632 | 7 |
| 450 | 7 | 1,165.6 | 1475 | 1,212.9 | 186.4 | 18 | 98.9 | 15,730 | 7 |
| 500 | 7 | 1,321 | 1555 | 1,337.1 | 195.1 | 18 | 99.4 | 17,071 | 7 |

- Gặp gỡ: lần đầu ở lượt 2, tổng 20 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 81 non_aggression, 1 peace. Giao dịch: 43. Chiến tranh: 1 (+0 đồng minh tham chiến). Trận: 5.
- Định cư mới: 139. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 80.
- Hành động bị từ chối nhiều nhất: 2× `claim_tile: Dilo giành được ô này cùng lượt`; 1× `build: Ô xây dựng phải thuộc lãnh thổ của bạn`; 1× `found_settlement: Phải là ô đất liền vô chủ, không phải núi`; 1× `claim_tile: Rehave giành được ô này cùng lượt`.

### Seed `nguyen-dia-5`

7 quốc gia, 500 lượt. Còn sống: 7. Thời gian: 10.4 ms/lượt engine + 4.7 ms/lượt bot. Lỗi kiểm toán: 0.

| Quốc gia | Dân (đỉnh) | Chỗ ở | Ô | Phát minh | Đồ Đá Mới từ lượt | Lều đầu / định cư đầu | Định cư | Công trình | Ổn định (thấp nhất) | Chết đói / rét / dịch | Trận thắng/thua |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kaon | 1530 (1530) | 1530 | 243 | 18 | 86 | 36 / 81 | 27 | 6 xưởng, 110 lều, 2 hố, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 266 / 2121 | 0/0 |
| Tave | 315 (315) | 315 | 70 | 17 | 118 | 33 / 120 | 10 | 2 xưởng, 14 lều, 1 chuồng, 2 hố, 1 bàn thờ, 1 ruộng | 100 (60) | 0 / 20 / 572 | 0/5 |
| Armu | 1465 (1465) | 1465 | 211 | 18 | 93 | 36 / 79 | 28 | 5 xưởng, 102 lều, 1 ruộng, 1 chuồng, 2 hố, 1 lò, 1 bàn thờ, 1 rào | 100 (60) | 0 / 174 / 2546 | 5/0 |
| Ruonmi | 1420 (1420) | 1420 | 225 | 18 | 97 | 35 / 92 | 25 | 6 xưởng, 102 lều, 1 chuồng, 1 ruộng, 2 hố, 1 rào, 1 lò, 1 bàn thờ | 100 (60) | 0 / 212 / 2273 | 3/0 |
| Kakadi | 1510 (1510) | 1510 | 223 | 18 | 67 | 38 / 47 | 25 | 6 xưởng, 2 hố, 111 lều, 1 ruộng, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 154 / 2614 | 0/0 |
| Kataar | 1530 (1530) | 1530 | 231 | 18 | 66 | 30 / 47 | 23 | 6 xưởng, 116 lều, 2 ruộng, 2 hố, 1 chuồng, 1 bàn thờ, 1 lò, 1 rào | 100 (60) | 0 / 0 / 1902 | 5/0 |
| Mure | 675 (675) | 675 | 76 | 18 | 197 | 171 / — | 0 | 1 xưởng, 65 lều, 3 ruộng, 2 chuồng, 1 lò, 1 rào, 2 hố, 1 bàn thờ | 100 (60) | 4 / 0 / 432 | 0/8 |

| Lượt | Sống | Dân TB | Dân max | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Đồ Đá Mới |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 7 | 20 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 7 | 35.4 | 44 | 45 | 11.4 | 5.4 | 100 | 20 | 0 |
| 100 | 7 | 102 | 197 | 110 | 26.7 | 12.1 | 100 | 307 | 5 |
| 150 | 7 | 257.4 | 460 | 267.9 | 62.7 | 16.4 | 98.9 | 2,668 | 6 |
| 200 | 7 | 469 | 685 | 472.1 | 102.1 | 16.9 | 99.4 | 5,748 | 7 |
| 250 | 7 | 614.6 | 815 | 620 | 128.6 | 17.9 | 99.4 | 7,905 | 7 |
| 300 | 7 | 708 | 950 | 730 | 134.1 | 17.9 | 98.3 | 9,391 | 7 |
| 350 | 7 | 846.4 | 1090 | 857.9 | 147.6 | 17.9 | 98.9 | 11,468 | 7 |
| 400 | 7 | 979.3 | 1240 | 979.3 | 162.1 | 17.9 | 100 | 13,590 | 7 |
| 450 | 7 | 1,102.3 | 1400 | 1,103.6 | 174.9 | 17.9 | 99.4 | 14,621 | 7 |
| 500 | 7 | 1,206.4 | 1530 | 1,206.4 | 182.7 | 17.9 | 100 | 14,946 | 7 |

- Gặp gỡ: lần đầu ở lượt 8, tổng 22 lần "thấy nhau" (một chiều).
- Hiệp ước đã ký: 67 non_aggression, 5 peace. Giao dịch: 146. Chiến tranh: 3 (+0 đồng minh tham chiến). Trận: 13.
- Định cư mới: 138. Đơn phát minh mở: 7. Phát minh "lần đầu tiên trên thế giới": 18.
- Cổng kỷ nguyên (world.eraGates): Đồ Đá Mới ở lượt 65, Đồ Đá Cũ ở lượt 202.
- Hành động bị từ chối nhiều nhất: 5× `claim_tile: Ruonmi giành được ô này cùng lượt`; 1× `found_settlement: Phải là ô đất liền vô chủ, không phải núi`; 1× `claim_tile: Armu giành được ô này cùng lượt`.

<!-- simulate:end -->

## 4. Vấn đề

### 4.1 Dân số không có trần **[LUẬT]**

Cơ chế: tăng 4% mỗi lượt (`GROWTH_RATE`), nghĩa là gấp đôi sau khoảng 18 lượt, miễn là còn chỗ ở và còn dư 20% lương thực. Chỗ ở lại rất rẻ:

- **Lều** (6 gỗ, 4 da, 2 dây, 4 công) cho +10 chỗ và không giới hạn số lượng. Lượt 500 mỗi nước có 90–115 lều.
- **Định cư** chỉ tốn 20 lương thực và 3 AP. Nó cho +15 chỗ ở, +3 giới hạn ô và 7 ô mới, mà không mất người nào. RULES §2.3 viết "cần 10 dân di cư", nhưng engine chỉ kiểm tra dân ≥ 30. Bot giỏi lập một điểm mới mỗi 5 lượt.
- **Giới hạn ô** = 7 + dân/10 + 3 × số điểm định cư. Mỗi ô tái sinh khoảng 10 lương thực/lượt (cây dại 15%, thú 10%, cá 8% của trần), tức nuôi được khoảng 10 người. Vì vậy cứ thêm 10 dân lại được thêm một ô nuôi 10 dân: một vòng phản hồi dương chỉ dừng khi bản đồ hết đất.

Dịch bệnh là cái phanh duy nhất: 1.718 người chết dịch mỗi nước trong cả ván. Nhưng nó chỉ lấy khoảng 0,6% dân mỗi lượt (4% khả năng, 10–20% dân), trong khi dân tăng 4%. Mùa đông giết 122 người mỗi nước. Đói gần như bằng 0.

Hệ quả: các con số khác trong luật (AP tối đa 12 ở 450 dân, ước lượng tình báo "nhỏ/vừa/lớn", dịch bệnh tăng gấp đôi trên 80 dân) đều được thiết kế cho quy mô vài chục tới vài trăm người, nhưng ván thật chạy ở quy mô hàng nghìn.

### 4.2 Nhịp phát minh so với một mùa 500 lượt **[LUẬT]**

RP mỗi lượt tỷ lệ thuận với số người nghiên cứu, mà số người này tỷ lệ với dân số, trong khi giá RP thì cố định (15–120). Ở 100 dân, khoảng 30 người nghiên cứu học xong P14 (120 RP) trong 4 lượt. Kết quả: Đồ Đá Mới ở lượt 90, hết cây gốc ở lượt 118. Từ đó tới lượt 500, thứ duy nhất còn lại là phát minh mở, mà phát minh mở phụ thuộc hoàn toàn vào trọng tài. Chính bot cũng chỉ cho người nghiên cứu ra hái lượm, vì không còn gì để học.

Thử nghiệm cho thấy chỉ nhân giá **phẳng** thì không ổn: `rp-x3` (×3 mọi phát minh) đẩy lều đầu tiên từ lượt 35 lên 124, vì 20 người đầu tiên học rất chậm, mà vẫn xong cây gốc ở lượt 242. Nhân theo **độ sâu** (`rp-depth`, ×(1 + d)) cũng làm lều chậm tới lượt 124, vì P8 có độ sâu 3. Kết luận: phát minh nông (P1–P3, P7, P8) nên giữ rẻ; phát minh sâu nên đắt dần; và năng suất nghiên cứu nên giảm dần theo số người (xem đề xuất R4).

### 4.3 Đói, tồn kho và ổn định **[LUẬT]** + **[BOT]**

- **Đói** gần như không xảy ra với người chơi biết tính: 0,4 lượt đói mỗi nước cả ván, 2,7 người chết đói mỗi nước. Thời điểm nguy hiểm duy nhất là 30 lượt đầu, khi chưa có công cụ, chưa nấu chín và kho chỉ có 40. AI thật dễ đói hơn **[BOT]**, nhưng về mặt luật thì đất đai luôn dư sức nuôi người, trừ khi bị giới hạn ô chặn lại.
- **Hư hỏng 30%/lượt** khiến tích trữ vô ích. Nó còn làm mọi chi phí trả bằng lương thực trở nên khó gom khi đất nhỏ. Trong thử nghiệm `season`, định cư cần 60 lương thực và ở seed `nguyen-dia-3` không nước nào lập nổi điểm định cư nào, vì kho cứ hư mất trước khi đủ.
- **Ổn định** đứng ở 98–100 suốt ván, vì chỉ cần còn dư lương thực là +1 mỗi lượt, và không có gì kéo nó xuống. Bàn thờ, Nghi lễ (P5), Suối Nước Nóng và mệt mỏi chiến tranh (−1/lượt) vì thế đều không có tác dụng. Có 0 nội loạn trong cả 35 quốc gia.
- **Phụ phẩm không có chỗ dùng:** xương (hàng nghìn), da (hàng trăm) và sợi (hàng nghìn) chất đống. Đó là nguyên liệu mà các phát minh mở có thể dùng tới, nhưng hiện tại không có công thức nào tiêu thụ chúng ở quy mô lớn.

### 4.4 Chiến tranh có đáng không? **[LUẬT]** + **[BOT]**

Trong 5 seed × 500 lượt có 14 cuộc chiến (bot chỉ đánh láng giềng sát biên có dân dưới 60% dân mình):

- Bên công thắng **54/54 trận**. Mỗi trận thắng chiếm đúng 1 ô. Thủ đô chỉ thất thủ khi bị bao vây kín, nên không nước nào bị diệt.
- Thương vong bên công thường **ngang hoặc cao hơn** bên thủ. Ví dụ: Zakare → Ruka mất 164 người để giết 84 người và lấy 5 ô; Endi → Lololi mất 68 người để giết 109 người và lấy 4 ô. Lý do: bên công đưa đội quân rất lớn (30% lao động) ra đánh, và luật trừ 5–15% quân của bên thắng.
- Phần được là 1–5 ô, tương đương khoảng 10–50 lương thực/lượt. Phần mất là vài chục tới hơn trăm dân và 30% sức lao động trong 4–6 lượt. Với tốc độ tăng 4%/lượt, cả hai bên hồi lại sau 2–3 lượt. **Chiến tranh rẻ, an toàn và không đổi được gì.** Nó không đáng để toan tính, mà cũng chẳng gây hại gì.
- Bên thủ không bao giờ thắng một trận nào, kể cả khi có đồi, sông hay hàng rào, vì quân công đông gấp 4–10 lần. Luật không giới hạn số quân trên một mặt trận.
- Mệt mỏi chiến tranh (−1 ổn định/lượt sau 5 lượt) không có tác dụng, vì ổn định luôn ở mức 100.

### 4.5 Gặp gỡ và thám hiểm **[LUẬT]** + **[THẾ GIỚI]**

Một đoàn thám hiểm đi 16 ô rồi về ngay trong 1 lượt, và nhìn thấy 2 ô quanh đường đi. Với 7 nước trên bản đồ 64×64, láng giềng gần nhất cách 16–30 ô (trung vị 18), nên lần gặp đầu tiên là **lượt 3** (trung vị). Với 4 nước, láng giềng gần nhất cách 19–34 ô (trung vị 32) và lần gặp đầu tiên là **lượt 97** (đo riêng: 5 seed × 300 lượt × 4 nước). Như vậy cùng một bộ luật cho ra hai trò chơi rất khác nhau tùy số người chơi: hoặc ngoại giao từ lượt đầu, hoặc gần trăm lượt cô lập. Giai đoạn "cử chỉ trước khi có ngôn ngữ chung" hầu như không kéo dài, vì 10 lần giao dịch là đủ để có ngôn ngữ chung.

### 4.6 Điểm khai sinh không công bằng **[THẾ GIỚI]** + **[LUẬT]**

Điểm khai sinh được cân bằng theo tổng `tileValue` trong bán kính 3, trong đó cây dại và gỗ tính ngang thú săn. Vì vậy một vùng rừng rậm có thể "đủ điểm" mà không có con thú nào. Không có thú thì không có da, không có da thì không có lều, và định cư thì cần 30 dân, cao hơn mức 25 chỗ ở tự nhiên. Nước đó kẹt ở 25 dân cho tới khi gặp ai đó để mua da. Ví dụ: Rutaka (seed `nguyen-dia-3`) dựng lều đầu tiên ở lượt 248 (trung vị là 35) và còn bị đánh 2 lần. Trong thế giới thử `bot-growth` với 4 nước, hai nước rừng rậm bị cô lập kẹt ở 25 dân sau 200 lượt.

### 4.7 Engine khác bộ luật, lỗi nhỏ **[ENGINE]**

- Kỷ nguyên có thể **lùi lại**: dân tụt dưới 50 vì dịch thì nước đó về lại Đồ Đá Cũ, và `world.eraGates` ghi thêm mục "Đồ Đá Cũ ở lượt …" (thấy ở seed `nguyen-dia-3`, lượt 202). Có lẽ chỉ nên ghi cổng khi tiến lên.
- RULES §2.3 viết định cư "cần 10 dân di cư", nhưng engine không chuyển hay trừ ai. Luật nên nói rõ 10 người này có rời khỏi chỗ ở cũ hay không.
- `tsc --strict` báo hai lỗi có sẵn: `ROLE_NAME` trong `rules.ts` thiếu vai `mine`; và `engine.ts:338` so sánh `p.status === "duplicate"` sau khi kiểu đã bị thu hẹp (nhánh này không bao giờ chạy).
- Gốm (P13) chỉ là hàng hóa, không giảm hư hỏng như bảng 6.1 mô tả. Hố trữ không có "kho +50". P18 trong engine giảm 5% hư hỏng, trong khi `rules.ts` mô tả "tình báo chính xác gấp đôi" và RULES.md mô tả "sức chứa kho +20%".

### 4.8 Điểm yếu của bot **[BOT]**, không phải lý do để sửa luật

- Bot không dùng liên minh, gián điệp, đột kích, cống nạp, chư hầu hay thỉnh nguyện. Nó chỉ đánh nước yếu hơn nhiều, nên số liệu chiến tranh nghiêng về bên công.
- Bot đọc một số thứ ngoài gói quan sát (danh sách đề nghị, chiến tranh, hiệp ước của chính mình), nhưng không đọc kho hay suy nghĩ của nước khác. Riêng quyết định gây chiến dựa vào ước lượng tình báo, giống một AI.
- Đổi hàng một món lấy một món theo giá chuẩn, xin tối đa 8 đơn vị mỗi lần, nên giai đoạn đầu có ít giao dịch.
- Khi hết thứ để nghiên cứu, mọi lao động thừa đi hái lượm, nên lương thực tồn kho cuối ván rất lớn (TB 15.000). Con số này không có ý nghĩa cân bằng.
- Mỗi nước chỉ xây khoảng 1 ruộng: đất hoang đủ nuôi nên không cần trồng trọt. Đây vừa là lựa chọn của bot vừa là một phát hiện về luật: khi đất còn rộng, nông nghiệp không có lợi thế gì.
- Lập điểm định cư mỗi 5 lượt là lối chơi "khai thác luật". LLM thật có thể không làm vậy, nên ván thật có thể tăng chậm hơn. Nhưng luật nên chặn lối chơi này, chứ không nên trông vào việc AI không nghĩ ra.

## 5. Đề xuất sửa luật

Các biến thể dưới đây chỉ đổi bảng số trong bộ nhớ khi chạy `tools/simulate.ts --variant`, không sửa luật. Cùng 5 seed × 500 lượt × 7 nước:

| Biến thể | Dân cuối ván TB (thấp–cao) | Vượt 25 chỗ ở | Lều đầu (lượt) | Định cư đầu (lượt) | Đồ Đá Mới: số nước, trung vị lượt | Xong cây gốc (trung vị lượt) | Định cư/nước | Chết dịch/nước | Nước kẹt ≤ 35 dân |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `base` | 1242 (275–1590) | 35/35 | 35 | 78 | 35/35, 90 | 118 (32/35) | 19.5 | 1718 | 0 |
| `tent-max4` | 355 (25–515) | 34/35 | 35 | 78 | 34/35, 90 | 124 (31/35) | 19.8 | 748 | 1 |
| `settle-hard` | 1018 (55–1395) | 35/35 | 35 | 132 | 35/35, 97 | 147 (30/35) | 11.6 | 1234 | 0 |
| `housing-capped` | 177 (105–245) | 35/35 | 35 | 165 | 35/35, 98 | 185 (33/35) | 11.5 | 350 | 0 |
| `rp-x3` | 980 (25–1645) | 34/35 | 124 | 179 | 34/35, 211 | 242 (31/35) | 19.8 | 1068 | 1 |
| `rp-depth` | 1014 (110–1660) | 35/35 | 124 | 173 | 35/35, 199 | 240 (32/35) | 20.0 | 1145 | 0 |
| `season` | 145 (24–265) | 33/35 | 116 | 269 | 31/35, 266 | 310 (22/35) | 8.6 | 184 | 4 |

Ý nghĩa các biến thể:

- `tent-max4`: mỗi nước tối đa 4 lều.
- `settle-hard`: định cư cần 60 dân và 60 lương thực, cách các trung tâm ≥ 6 ô, chỉ +10 chỗ ở.
- `housing-capped`: gộp `tent-max4` và `settle-hard`.
- `rp-x3`: RP của cả 18 phát minh gốc ×3.
- `rp-depth`: RP × (1 + độ sâu).
- `season`: gộp `housing-capped` và `rp-depth`.

**R1. Giới hạn lều theo trung tâm.** **[LUẬT]** Ví dụ tối đa 3 lều cho mỗi trung tâm (thủ đô hoặc điểm định cư). Muốn có thêm chỗ ở thì phải mở rộng ra điểm định cư mới. Engine hiện chỉ có `max` tính cho cả nước, nên `tent-max4` là phép thử gần đúng: dân lượt 500 giảm từ 1.242 xuống 355, chết dịch giảm từ 1.718 xuống 748 mỗi nước, trong khi Đồ Đá Mới vẫn tới ở lượt 90 với 34/35 nước. Cái giá phải trả: nước nào kẹt sẵn (ở đây là 1 nước rừng rậm) càng khó thoát.

**R2. Định cư đắt và chậm hơn, trả bằng hàng không hư.** **[LUẬT]** Đề xuất: cần ≥ 40–60 dân, cách các trung tâm ≥ 6 ô, chỉ +10 chỗ ở, giá 20 gỗ + 10 đá + 20 lương thực, và (tùy chọn) 10 người thật sự rời đi để giữ trung tâm mới. `settle-hard` giảm số điểm định cư từ 19,5 xuống 11,6 mỗi nước, đẩy điểm đầu tiên từ lượt 78 lên 132. Gộp với R1 (`housing-capped`), dân lượt 500 là 105–245, tất cả 35/35 nước vẫn vào Đồ Đá Mới (trung vị lượt 98), không nước nào kẹt, và chết dịch chỉ còn 350. Đây là quy mô hợp lý cho một bộ lạc thời đồ đá mới. **Không nên** đòi 60 lương thực: với hư hỏng 30%/lượt, nước đất nhỏ không bao giờ gom đủ (xem 4.3).

**R3. Tăng dân logistic, giới hạn ô theo căn bậc hai.** **[LUẬT]** Đề xuất: tăng = 4% × (1 − dân/chỗ ở), tối thiểu 1. Giới hạn ô = 7 + ⌊2·√dân⌋ + 2 mỗi điểm định cư, nghĩa là 27 ô ở 100 dân, 47 ô ở 400 dân, 70 ô ở 1.000 dân, thay cho 17, 47 và 107 như hiện tại. Mục đích là cắt vòng dân → đất → lương thực → dân ở quy mô lớn, để trồng trọt (ruộng không cạn) trở thành con đường duy nhất để đông dân. Công cụ chưa đo được R3 vì `GROWTH_RATE` và `TILE_LIMIT_BASE` là hằng số nguyên thủy. Nếu chuyển chúng thành trường của một object (ví dụ `GROWTH.rate`, `TILES.base`), `--variant` sẽ thử được ngay.

**R4. Nhịp phát minh theo độ sâu, và có việc để làm sau cây gốc.** **[LUẬT]** Giữ rẻ các phát minh d ≤ 2. Nhân giá theo (1 + d/2) cho d ≥ 3, tức là P8, P11, P15–P18. Đồng thời cho RP giảm dần theo số người: RP = 3 × số người nghiên cứu^0,7, hoặc giá × (1 + dân/200). `rp-depth` (nhân mạnh hơn, ×(1 + d)) dời Đồ Đá Mới từ lượt 90 sang 199 và xong cây gốc từ 118 sang 240, nhưng làm lều chậm tới lượt 124. Khi gộp với R1 + R2 (`season`), nó quá chậm: 4 nước kẹt, chỉ 22/35 nước xong cây gốc. Vì vậy nên dùng mức ×(1 + d/2), không nhân P8. Ngoài ra, cần một con đường tới đồ đồng không phụ thuộc trọng tài, ví dụ thêm vào cây gốc một phát minh d4–d5 cho `nhận-biết-khoáng` và `nhiệt-cao` với giá cao. Nếu không, khi trọng tài hết quota, cả thế giới đứng yên từ khoảng lượt 120–240.

**R5. Chiến tranh có giá và có kết quả.** **[LUẬT]** Đề xuất:

- Quân đánh một ô tối đa = 5 + 5 × số ô của bên công kề ô đó. Bên thủ được cộng dân quân của chính ô đó.
- Thắng thì cướp được một phần kho, như đột kích, và bắt thêm tù binh.
- Mệt mỏi chiến tranh tính bằng dân, không bằng ổn định (vì ổn định đang luôn đầy).
- Chiếm thủ đô khi đã chiếm ≥ 4/6 ô kề, thay vì phải bao vây kín.

Mục tiêu là để bên thủ biết phòng ngự thì có cơ hội thắng, và để chiến tranh có thể thay đổi bản đồ. Hiện tại chiến tranh là 1 ô mỗi trận, và bên công luôn thắng nhưng chết nhiều hơn.

Các đề xuất khác, xếp theo mức ưu tiên:

- **R6. Ổn định có trọng lượng.** **[LUẬT]** Chỉ +1 khi dư ≥ 20%. Ổn định tự trôi về 50 (−1/lượt khi > 70). Trừ −1 cho mỗi 100 dân vượt 100 nếu chưa có `ghi-chép`, và −1 cho mỗi điểm định cư vượt 3. Khi đó bàn thờ, nghi lễ, Suối Nước Nóng và mệt mỏi chiến tranh mới có ý nghĩa, và nước bành trướng quá nhanh sẽ có nguy cơ nội loạn.
- **R7. Gặp gỡ không phụ thuộc số nước.** **[LUẬT]** + **[THẾ GIỚI]** Đoàn thám hiểm đi tối đa 8 ô mỗi lượt (hoặc là một đoàn tồn tại qua nhiều lượt như RULES §7.6 mô tả). Khoảng cách giữa các điểm khai sinh nên nằm trong 14–24 ô, bất kể số nước, để lần gặp đầu rơi vào khoảng lượt 15–40.
- **R8. Điểm khai sinh công bằng.** **[THẾ GIỚI]** Bán kính 2 quanh mỗi điểm khai sinh phải có thú săn, gỗ, và đá hoặc đá lửa. Hoặc hạ yêu cầu dân của định cư xuống ≤ chỗ ở tự nhiên (25), để không nước nào bị khóa chỉ vì thiếu da.
- **R9. Kỷ nguyên không lùi** **[ENGINE]**, hoặc nếu có lùi thì không ghi vào `eraGates`. Bổ sung công dụng cho phụ phẩm (xương, da, sợi), ví dụ áo da hoặc lều tiêu thêm da, hay một công trình bằng xương. Sửa các chỗ engine khác bộ luật nêu ở 4.7.

## 6. Thử nghiệm các biến thể

Các khối dưới đây là bản tóm tắt do `tools/simulate.ts --variant … --brief` sinh ra (5 seed × 500 lượt × 7 nước, cùng seed với khối luật hiện tại).

### `tent-max4`

<!-- simulate:tent-max4:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `tent-max4` (mỗi quốc gia tối đa 4 lều); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 354.9 / 380 / 25 / 515 |
| Chỗ ở cuối ván: trung bình / cao nhất | 361.3 / 515 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 36 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 35 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 77.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 34/35, trung vị lượt 69.5 · 33/35, trung vị lượt 110 · 2/35, trung vị lượt 232 |
| Vào Đồ Đá Mới | 34/35, trung vị lượt 89.5 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 31/35, trung vị lượt 124 |
| Phát minh cây gốc trung bình cuối ván | 17.8 |
| Định cư mới trung bình mỗi nước | 19.8 |
| Ô trung bình cuối ván | 103.3 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.3 / 32.3 / 748 |
| Số lượt có nạn đói mỗi nước (TB) | 0.2 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 78.8 / 81.2 / 4.6 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 6 · 23/23 · 23 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 10 / 4.8 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 34.8 | 39.9 | 10.5 | 5.7 | 99.9 | 20 | 0 |
| 100 | 86.5 | 92.6 | 24.7 | 11.9 | 99.9 | 131 | 5.2 |
| 150 | 201.3 | 203.7 | 57 | 16.5 | 100 | 1,772 | 6 |
| 200 | 312.9 | 317 | 90.5 | 17.5 | 99.6 | 3,839 | 6.4 |
| 250 | 354.3 | 356.3 | 102.6 | 17.8 | 99.7 | 5,039 | 6.8 |
| 300 | 354.8 | 359.1 | 103.1 | 17.8 | 99.5 | 5,244 | 6.8 |
| 350 | 356.8 | 360 | 103 | 17.8 | 99.6 | 5,305 | 6.8 |
| 400 | 359.5 | 361.3 | 103.9 | 17.8 | 99.8 | 5,271 | 6.8 |
| 450 | 355.9 | 361.3 | 103.8 | 17.8 | 99.4 | 5,302 | 6.8 |
| 500 | 354.9 | 361.3 | 103.3 | 17.8 | 99.1 | 5,251 | 6.8 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Thương vong công / thủ |
| --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-3` | Taloar → Kaar | 468–472 | 425 : 215 | 3/3 | 3 | 20 / 34 |
| `nguyen-dia-4` | Dilo → Reen | 197–203 | 305 : 37 | 5/5 | 5 | 37 / 10 |
| `nguyen-dia-4` | Dilo → Reen | 389–395 | 365 : 140 | 5/5 | 5 | 33 / 33 |
| `nguyen-dia-4` | Dika → Reen | 399–405 | 470 : 136 | 2/2 | 2 | 22 / 15 |
| `nguyen-dia-5` | Armu → Ruonmi | 269–273 | 485 : 236 | 3/3 | 3 | 27 / 32 |
| `nguyen-dia-5` | Kataar → Tave | 490–496 | 440 : 230 | 5/5 | 5 | 53 / 55 |

<!-- simulate:tent-max4:end -->

### `settle-hard`

<!-- simulate:settle-hard:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `settle-hard` (định cư cần 60 dân, 60 lương thực, cách các trung tâm ≥ 6 ô, chỉ +10 chỗ ở); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 1,017.9 / 1176 / 55 / 1395 |
| Chỗ ở cuối ván: trung bình / cao nhất | 1,038.4 / 1405 |
| Vượt chỗ ở tự nhiên 25 | 35/35, trung vị lượt 36 |
| Lều đầu tiên xây xong | 35/35, trung vị lượt 35 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 131.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 35/35, trung vị lượt 70 · 34/35, trung vị lượt 131 · 31/35, trung vị lượt 249 |
| Vào Đồ Đá Mới | 35/35, trung vị lượt 97 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 30/35, trung vị lượt 146.5 |
| Phát minh cây gốc trung bình cuối ván | 17.9 |
| Định cư mới trung bình mỗi nước | 11.6 |
| Ô trung bình cuối ván | 142.7 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.3 / 87.3 / 1,233.8 |
| Số lượt có nạn đói mỗi nước (TB) | 0.2 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 71.2 / 55.2 / 10.8 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 14 · 54/54 · 54 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 10.5 / 4.3 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 34.9 | 39.3 | 10.5 | 5.7 | 99.9 | 20 | 0 |
| 100 | 67.5 | 70.1 | 15.3 | 10.7 | 100 | 60 | 4 |
| 150 | 151.5 | 155 | 34.4 | 14.9 | 100 | 967 | 5.2 |
| 200 | 276.9 | 280.4 | 59.4 | 17.1 | 99.6 | 2,870 | 6.4 |
| 250 | 397.2 | 400.1 | 76.6 | 17.7 | 99.9 | 4,915 | 6.8 |
| 300 | 513.8 | 520.1 | 90.9 | 17.8 | 99.5 | 6,620 | 6.8 |
| 350 | 638.3 | 647.6 | 102.9 | 17.8 | 99.3 | 8,341 | 7 |
| 400 | 767.1 | 772.1 | 116.5 | 17.8 | 99.7 | 9,960 | 7 |
| 450 | 887 | 905.6 | 131 | 17.8 | 98.7 | 11,517 | 7 |
| 500 | 1,017.9 | 1,038.4 | 142.7 | 17.9 | 98.6 | 13,089 | 7 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Thương vong công / thủ |
| --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Redi → Lion | 174–178 | 385 : 121 | 3/3 | 3 | 25 / 22 |
| `nguyen-dia-1` | Mureen → Talodi | 190–194 | 374 : 115 | 3/3 | 3 | 30 / 15 |
| `nguyen-dia-1` | Mureen → Talodi | 298–302 | 725 : 405 | 3/3 | 3 | 39 / 60 |
| `nguyen-dia-2` | Zakare → Ruka | 269–275 | 525 : 195 | 5/5 | 5 | 57 / 49 |
| `nguyen-dia-2` | Kaliso → Lololi | 275–281 | 695 : 165 | 5/5 | 5 | 79 / 48 |
| `nguyen-dia-2` | Kaliso → Lololi | 464–468 | 1235 : 148 | 3/3 | 3 | 75 / 20 |
| `nguyen-dia-3` | Rutaka → Hami | 347–351 | 413 : 55 | 3/3 | 3 | 22 / 7 |
| `nguyen-dia-3` | Endion → Hami | 493–497 | 1295 : 55 | 3/3 | 3 | 92 / 10 |
| `nguyen-dia-4` | Dika → Reen | 189–195 | 465 : 25 | 5/5 | 5 | 50 / 5 |
| `nguyen-dia-4` | Dika → Dilo | 324–330 | 835 : 189 | 5/5 | 5 | 72 / 54 |
| `nguyen-dia-4` | Dika → Dilo | 437–441 | 1205 : 445 | 3/3 | 3 | 50 / 65 |
| `nguyen-dia-4` | Reen → Dilo | 443–447 | 655 : 388 | 3/3 | 3 | 36 / 57 |
| `nguyen-dia-5` | Armu → Mure | 269–275 | 545 : 78 | 5/5 | 5 | 55 / 21 |
| `nguyen-dia-5` | Armu → Mure | 445–451 | 1075 : 565 | 5/5 | 5 | 109 / 123 |

<!-- simulate:settle-hard:end -->

### `housing-capped`

<!-- simulate:housing-capped:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `housing-capped` (tối đa 4 lều và định cư khó (gộp tent-max4 + settle-hard)); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 177.2 / 175 / 105 / 245 |
| Chỗ ở cuối ván: trung bình / cao nhất | 179.9 / 245 |
| Vượt chỗ ở tự nhiên 25 | 35/35, trung vị lượt 36 |
| Lều đầu tiên xây xong | 35/35, trung vị lượt 35 |
| Điểm định cư đầu tiên | 35/35, trung vị lượt 165 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 35/35, trung vị lượt 70 · 35/35, trung vị lượt 191 · 0/35 |
| Vào Đồ Đá Mới | 35/35, trung vị lượt 98 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 33/35, trung vị lượt 185 |
| Phát minh cây gốc trung bình cuối ván | 17.9 |
| Định cư mới trung bình mỗi nước | 11.5 |
| Ô trung bình cuối ván | 60.6 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 0.3 / 10.5 / 349.5 |
| Số lượt có nạn đói mỗi nước (TB) | 0.2 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 72.6 / 55.2 / 1 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 1 · 5/5 · 5 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 9.4 / 4.1 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 34.9 | 39.3 | 10.5 | 5.7 | 99.9 | 20 | 0 |
| 100 | 55.8 | 56.7 | 13.8 | 10.3 | 100 | 45 | 4 |
| 150 | 89.3 | 91 | 26.9 | 13.8 | 100 | 528 | 5.2 |
| 200 | 129.8 | 131.9 | 41.1 | 16.6 | 100 | 1,197 | 6.4 |
| 250 | 165.4 | 166.7 | 55.4 | 17.7 | 100 | 2,058 | 7 |
| 300 | 174.1 | 176.7 | 59.5 | 17.9 | 99.9 | 2,462 | 7 |
| 350 | 177 | 179.3 | 60.3 | 17.9 | 99.9 | 2,638 | 7 |
| 400 | 179.1 | 179.9 | 60.9 | 17.9 | 100 | 2,645 | 7 |
| 450 | 177.4 | 179.9 | 60.7 | 17.9 | 99.8 | 2,669 | 7 |
| 500 | 177.2 | 179.9 | 60.6 | 17.9 | 99.9 | 2,646 | 7 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Thương vong công / thủ |
| --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-5` | Armu → Mure | 285–291 | 235 : 105 | 5/5 | 5 | 23 / 28 |

<!-- simulate:housing-capped:end -->

### `rp-x3`

<!-- simulate:rp-x3:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `rp-x3` (RP của 18 phát minh cây gốc ×3); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 980.3 / 1100 / 25 / 1645 |
| Chỗ ở cuối ván: trung bình / cao nhất | 1,001.3 / 1645 |
| Vượt chỗ ở tự nhiên 25 | 34/35, trung vị lượt 124.5 |
| Lều đầu tiên xây xong | 34/35, trung vị lượt 123.5 |
| Điểm định cư đầu tiên | 34/35, trung vị lượt 178.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 34/35, trung vị lượt 177 · 33/35, trung vị lượt 211 · 30/35, trung vị lượt 308 |
| Vào Đồ Đá Mới | 34/35, trung vị lượt 211 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 31/35, trung vị lượt 242 |
| Phát minh cây gốc trung bình cuối ván | 17.9 |
| Định cư mới trung bình mỗi nước | 19.8 |
| Ô trung bình cuối ván | 162.5 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 1.4 / 72.3 / 1,067.5 |
| Số lượt có nạn đói mỗi nước (TB) | 0.6 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 57.2 / 77.6 / 5.8 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 9 · 29/29 · 29 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 10.2 / 4.2 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.8 | 25 | 9 | 2.8 | 99.9 | 15 | 0 |
| 100 | 28.5 | 30.1 | 9.4 | 4.6 | 100 | 16 | 0 |
| 150 | 56.1 | 59 | 15.6 | 6.4 | 100 | 31 | 0.8 |
| 200 | 126.3 | 129.3 | 32 | 9.7 | 99.9 | 666 | 2.8 |
| 250 | 267.3 | 272.7 | 63.9 | 13.7 | 99.8 | 2,301 | 5 |
| 300 | 437.4 | 446.6 | 97.8 | 16 | 99.2 | 5,187 | 6 |
| 350 | 605.4 | 613.3 | 125 | 16.7 | 99.4 | 8,152 | 6.4 |
| 400 | 732.6 | 739 | 139.1 | 17.4 | 99.6 | 10,056 | 6.8 |
| 450 | 854.3 | 868.3 | 151.9 | 17.8 | 99.4 | 11,825 | 6.8 |
| 500 | 980.3 | 1,001.3 | 162.5 | 17.9 | 98.5 | 13,230 | 6.8 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Thương vong công / thủ |
| --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-2` | Endi → Kaha | 289–293 | 905 : 329 | 3/3 | 3 | 59 / 56 |
| `nguyen-dia-2` | Kaliso → Ruka | 366–370 | 1045 : 332 | 3/3 | 3 | 80 / 50 |
| `nguyen-dia-2` | Endi → Kaha | 397–401 | 1245 : 680 | 3/3 | 3 | 94 / 93 |
| `nguyen-dia-2` | Zakare → Lololi | 426–430 | 880 : 270 | 3/3 | 3 | 61 / 46 |
| `nguyen-dia-3` | Hami → Kaar | 496–— | 1155 : 90 | 3/3 | 3 | 79 / 11 |
| `nguyen-dia-3` | Mien → Rutaka | 498–— | 1185 : 25 | 1/1 | 1 | 29 / 1 |
| `nguyen-dia-4` | Dika → Dilo | 399–403 | 1180 : 590 | 3/3 | 3 | 56 / 106 |
| `nguyen-dia-4` | Dilo → Reen | 461–467 | 720 : 176 | 5/5 | 5 | 92 / 43 |
| `nguyen-dia-5` | Kakadi → Tave | 352–358 | 1210 : 595 | 5/5 | 5 | 129 / 126 |

<!-- simulate:rp-x3:end -->

### `rp-depth`

<!-- simulate:rp-depth:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `rp-depth` (RP cây gốc × (1 + độ sâu): P1 40, P8 100, P14 360, P18 400); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 1,014.3 / 1119 / 110 / 1660 |
| Chỗ ở cuối ván: trung bình / cao nhất | 1,037.6 / 1660 |
| Vượt chỗ ở tự nhiên 25 | 35/35, trung vị lượt 125 |
| Lều đầu tiên xây xong | 35/35, trung vị lượt 124 |
| Điểm định cư đầu tiên | 35/35, trung vị lượt 173 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 35/35, trung vị lượt 170 · 35/35, trung vị lượt 200 · 31/35, trung vị lượt 295 |
| Vào Đồ Đá Mới | 35/35, trung vị lượt 199 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 32/35, trung vị lượt 240 |
| Phát minh cây gốc trung bình cuối ván | 17.7 |
| Định cư mới trung bình mỗi nước | 20 |
| Ô trung bình cuối ván | 168 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 1.5 / 77.3 / 1,145.4 |
| Số lượt có nạn đói mỗi nước (TB) | 0.6 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 62.8 / 95 / 11.6 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 15 · 58/58 · 58 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 10.3 / 4.4 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.9 | 25 | 9 | 3.6 | 99.9 | 15 | 0 |
| 100 | 30.3 | 32.6 | 10 | 5 | 100 | 17 | 0 |
| 150 | 64.3 | 66.9 | 17.5 | 7.1 | 100 | 38 | 0.8 |
| 200 | 152.6 | 157.9 | 38.4 | 10.3 | 99.8 | 821 | 4 |
| 250 | 303.5 | 308 | 71.2 | 14.3 | 99.7 | 2,772 | 5.4 |
| 300 | 481.3 | 490.9 | 106.3 | 16.3 | 99.2 | 5,814 | 6.2 |
| 350 | 638.9 | 647 | 129.4 | 17 | 99.4 | 8,605 | 6.6 |
| 400 | 765.6 | 770.7 | 142.5 | 17.5 | 99.7 | 10,288 | 6.8 |
| 450 | 888.1 | 902.6 | 156.3 | 17.5 | 99.4 | 11,938 | 6.8 |
| 500 | 1,014.3 | 1,037.6 | 168 | 17.7 | 98.4 | 13,419 | 7 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Thương vong công / thủ |
| --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-1` | Lizali → Somuso | 209–213 | 305 : 150 | 3/3 | 3 | 18 / 22 |
| `nguyen-dia-1` | Redi → Lion | 302–306 | 825 : 354 | 3/3 | 3 | 51 / 63 |
| `nguyen-dia-1` | Solita → Lion | 357–363 | 690 : 412 | 5/5 | 5 | 62 / 96 |
| `nguyen-dia-2` | Endi → Taru | 239–245 | 655 : 405 | 3/3 | 3 | 40 / 54 |
| `nguyen-dia-2` | Endi → Kaha | 350–356 | 1128 : 690 | 5/5 | 5 | 135 / 196 |
| `nguyen-dia-2` | Kaliso → Ruka | 424–428 | 1095 : 485 | 3/3 | 3 | 58 / 39 |
| `nguyen-dia-2` | Zakare → Lololi | 426–430 | 935 : 225 | 3/3 | 3 | 55 / 27 |
| `nguyen-dia-2` | Endi → Kaha | 466–472 | 1525 : 1040 | 5/5 | 5 | 184 / 262 |
| `nguyen-dia-3` | Mien → Endion | 264–270 | 555 : 270 | 5/5 | 5 | 62 / 66 |
| `nguyen-dia-3` | Taloar → Kaar | 427–433 | 980 : 150 | 4/4 | 4 | 71 / 28 |
| `nguyen-dia-3` | Hami → Rutaka | 496–— | 1155 : 640 | 3/3 | 3 | 68 / 106 |
| `nguyen-dia-4` | Rehave → Mumi | 307–313 | 745 : 420 | 5/5 | 5 | 72 / 112 |
| `nguyen-dia-4` | Dika → Dilo | 399–403 | 1230 : 525 | 3/3 | 3 | 74 / 91 |
| `nguyen-dia-4` | Dilo → Reen | 407–413 | 550 : 90 | 5/5 | 5 | 54 / 22 |
| `nguyen-dia-5` | Kataar → Tave | 283–287 | 789 : 460 | 3/3 | 3 | 40 / 86 |

<!-- simulate:rp-depth:end -->

### `season`

<!-- simulate:season:begin -->
_Sinh bởi `tools/simulate.ts` — biến thể `season` (gộp housing-capped + RP cây gốc × (1 + độ sâu)); seeds: `nguyen-dia-1`, `nguyen-dia-2`, `nguyen-dia-3`, `nguyen-dia-4`, `nguyen-dia-5`; 500 lượt; 7 quốc gia bot._

## Tổng hợp (5 seed × 500 lượt × 7 quốc gia)

| Chỉ số | Giá trị |
| --- | --- |
| Quốc gia còn sống cuối ván | 35/35 |
| Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất | 145.3 / 155 / 24 / 265 |
| Chỗ ở cuối ván: trung bình / cao nhất | 148.1 / 265 |
| Vượt chỗ ở tự nhiên 25 | 33/35, trung vị lượt 117 |
| Lều đầu tiên xây xong | 33/35, trung vị lượt 116 |
| Điểm định cư đầu tiên | 26/35, trung vị lượt 268.5 |
| Dân ≥ 50 / ≥ 100 / ≥ 500 | 31/35, trung vị lượt 196 · 26/35, trung vị lượt 319 · 0/35 |
| Vào Đồ Đá Mới | 31/35, trung vị lượt 266 |
| Seed có ít nhất một nước Đồ Đá Mới | 5/5 |
| Xong cả cây gốc (18 phát minh) | 22/35, trung vị lượt 309.5 |
| Phát minh cây gốc trung bình cuối ván | 16 |
| Định cư mới trung bình mỗi nước | 8.6 |
| Ô trung bình cuối ván | 48.4 |
| Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB) | 1.9 / 6.3 / 184 |
| Số lượt có nạn đói mỗi nước (TB) | 0.9 |
| Nội loạn mỗi nước (TB) | 0 |
| Lượt gặp gỡ đầu tiên (trung vị theo seed) | 3 |
| Hiệp ước / giao dịch / trận mỗi seed (TB) | 34.8 / 83.2 / 1.6 |
| Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được | 2 · 8/8 · 8 |
| Đơn phát minh mở mỗi seed (TB) | 7 |
| Thời gian: engine / bot (ms mỗi lượt, TB) | 9.3 / 3.6 |
| Lỗi kiểm toán sổ cái | 0 |

| Lượt | Dân TB | Chỗ ở TB | Ô TB | Phát minh TB | Ổn định TB | Lương thực TB | Số nước Đồ Đá Mới (TB/seed) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 20 | 25 | 7 | 0 | 60 | 40 | 0 |
| 50 | 24.9 | 25 | 9 | 3.6 | 99.9 | 15 | 0 |
| 100 | 30.5 | 32.4 | 9.8 | 5 | 100 | 17 | 0 |
| 150 | 42.1 | 42.7 | 12 | 6.4 | 100 | 28 | 0.8 |
| 200 | 52.6 | 53.6 | 14.7 | 8.1 | 99.7 | 35 | 1.6 |
| 250 | 73.5 | 74.7 | 21.3 | 10.1 | 100 | 293 | 2.4 |
| 300 | 93.4 | 94.7 | 28.4 | 11.9 | 99.9 | 685 | 4.4 |
| 350 | 116.1 | 117 | 36.6 | 13.6 | 100 | 1,122 | 5.6 |
| 400 | 134.3 | 135.3 | 43.6 | 14.8 | 99.9 | 1,425 | 5.8 |
| 450 | 141.9 | 144.7 | 47.2 | 15.5 | 99.6 | 1,719 | 6.2 |
| 500 | 145.3 | 148.1 | 48.4 | 16 | 99.7 | 1,865 | 6.2 |

### Các cuộc chiến

| Seed | Bên tuyên chiến → bên bị đánh | Lượt | Dân lúc tuyên chiến | Trận thắng/tổng | Ô chiếm | Thương vong công / thủ |
| --- | --- | --- | --- | --- | --- | --- |
| `nguyen-dia-2` | Endi → Kaliso | 239–243 | 177 : 97 | 3/3 | 3 | 14 / 15 |
| `nguyen-dia-5` | Armu → Mure | 445–451 | 225 : 95 | 5/5 | 5 | 27 / 23 |

<!-- simulate:season:end -->
