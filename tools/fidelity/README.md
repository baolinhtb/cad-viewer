# Bộ đo độ giống — hồ sơ mố so với `assets/02. BTC- mo_2.dwg`

Đo xem hồ sơ `ho_so_mo_m1` sinh ra giống bản vẽ gốc đến đâu, từng tờ, và theo
dõi điểm qua từng vòng làm. Chỉ dùng thứ đã có trong repo và trên máy (CLI của
app, Chrome, libredwg-web, TypeScript, PIL, numpy) — **không thêm dependency**.

## Chạy

```bash
# Một lần: CLI của app (renderer dùng để vẽ cả gốc lẫn bản sinh)
node_modules/.bin/nx run @mlightcad/cad-simple-viewer-cli:build

# Toàn bộ: trích gốc (khi cần) → sinh → render → chấm
node tools/fidelity/run.mjs [--extract] [--label "ghi chú vòng này"] [--out <thư mục>]
```

Kết quả (mặc định `/workspace/cadview-shots/mo2/`, **ngoài repo**):

| Tệp                             | Nội dung                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `<tờ>-goc.png`, `<tờ>-sinh.png` | Tờ A3 ở 10 px/mm giấy (4200×2970)                                                                          |
| `<tờ>-diff.png`                 | đỏ = chỉ gốc có, xanh = chỉ bản sinh có, xám = trùng (dung sai 0,2 mm); khung xanh dương = vùng chấm pixel |
| `<tờ>-canh-nhau.png`            | gốc · sinh · khác, kèm điểm                                                                                |
| `diem.json`                     | điểm 5 thành phần, chi tiết màu, kiểm kê, chẩn đoán                                                        |
| `diem-history.jsonl`            | mỗi lần chạy một dòng                                                                                      |
| `work/`                         | DXF gốc, **bản sao chuẩn hoá**, DXF sinh, ảnh render thô, thời gian từng bước                              |

Phần chạy được trong CI (không cần trình duyệt):
`pnpm jest packages/cad-template-plugin/__tests__/fidelity` — chấm kiểm kê,
chữ, kích thước so với kiểm kê gốc đã commit và **không cho tụt** dưới
`fidelity-baseline.json`. Ghi mốc mới có chủ ý:
`FIDELITY_OUT=<dir> FIDELITY_WRITE_BASELINE=1 node_modules/.bin/jest packages/cad-template-plugin/__tests__/fidelity`.

## Các bước

1. **`extract-orig.mjs`** — DWG → DXF (libredwg-web), rồi:
   - **bản sao chuẩn hoá** `work/mo2.normalized.dxf`: chữ TCVN3/VNI giải mã sang
     Unicode bằng chính `acTpDecodeVnText` của SDK (nạp qua `vntext.mjs`), font
     .Vn đổi sang Arial — vì renderer không giải mã TCVN3; nội dung paper space
     của từng tờ được chép vào block `FIDELITY_<tờ>` và chèn vào model ×100 ở xa
     bản vẽ (renderer chỉ vẽ model qua `pngout`). Tệp gốc không bị đụng.
   - **kiểm kê rút gọn** `packages/cad-template-plugin/__tests__/fidelity/mo2-inventory.json`
     (~130 KB, commit): mỗi tờ — histogram (loại, màu, linetype, lineweight hiệu
     dụng), chữ (chuỗi đã giải mã, vị trí, cao, họ font), kích thước (hai điểm
     đo, chữ hiển thị, biến kiểu). Toạ độ: **mm giấy tính từ góc dưới trái tờ A3**
     (`FR A3`); đối tượng model đi qua viewport của tờ (1:100).
2. **Spec jest** dựng hồ sơ với tham số mặc định vào một `AcDbDatabase`, lập
   kiểm kê cùng định dạng (`__tests__/helpers/fidelityInventory.ts`), chấm 3
   thành phần không cần pixel, ghi `gen.dxf` + manifest cửa sổ.
3. **`render.mjs`** — `cad-simple-viewer-cli` (Chrome headless + three-renderer
   của app), lệnh `pngout` với cửa sổ và số pixel cụ thể; một phiên trình duyệt
   cho mọi ảnh. Gốc: ảnh paper của tờ + ảnh cửa sổ viewport dán vào đúng khung
   viewport. Sinh: vùng A3 tính từ góc dưới trái tờ sinh, ở tỉ lệ của tờ.
4. **`score.py`** — điểm pixel và ĐIỂM cuối.

## Công thức (mỗi tờ)

Mực = điểm ảnh có kênh màu > 40 trên nền đen. Vùng chấm pixel = vùng hình
(x 25–410, y 35–292 mm giấy), **trừ hộp chữ của cả hai bên** (chữ chấm riêng).
`dil(A)` = A nở 2 px.

```
P = |G ∩ dil(O)| / |G|    R = |O ∩ dil(G)| / |O|    F1 = 2PR/(P+R)
S_hinh = F1 trên mực đơn sắc
S_mau  = Σ_c w_c · F1_c   — c: màu ACI gần nhất (bảng của @mlightcad/common), w_c: tỉ lệ mực gốc
S_kiem = 1 − ½·Σ_k |n_O(k) − n_G(k)| / Σ_k n_O(k),  k = (loại, màu, linetype, lineweight) — không xét tên layer
S_chu  = số chữ ghép 1–1 (cùng chuỗi so không phân biệt hoa thường, lệch ≤ 1 mm, cao ±5 %, cùng họ font) / max(n_O, n_G)
S_dim  = Σ điểm cặp / max(n_O, n_G); cặp = hai điểm đo lệch ≤ 0,5 mm;
         điểm cặp = 0,4 + 0,3·[cùng chữ hiển thị] + 0,3·(tỉ lệ biến kiểu trùng:
         DIMTXT, DIMASZ, DIMEXO, DIMEXE, DIMGAP — so kích thước hiệu dụng
         = biến × DIMSCALE —, DIMTAD, DIMCLRD/E/T)

ĐIỂM = 0,35·S_hinh + 0,15·S_mau + 0,15·S_kiem + 0,20·S_chu + 0,15·S_dim
```

Mục tiêu từng tờ: S_hinh ≥ 0,98; S_mau ≥ 0,97; S_chu, S_dim ≥ 0,98; ĐIỂM ≥ 0,97.

## Chưa chấm được (ghi rõ, không giấu)

- **Bảng OLE** (thống kê thép, khối lượng, bảng cao độ, bảng thông số) là ảnh
  Excel nhúng; renderer không vẽ OLE nên ảnh gốc không có chúng, và kiểm kê
  không có chữ của chúng. Sẽ chấm từ GĐ5 bằng ảnh WMF đối chiếu.
- **Khung tên `FR A3`** là xref thiếu trong DWG: vùng khung/dải tên nằm ngoài
  vùng chấm pixel; chữ tiêu đề, số tờ vẫn chấm qua S_chu.
- Đường DWG → DXF của libredwg có thể sót vài đối tượng (đã biết: block
  `*U540` lồng trong `*E549`); `extract-orig` in số đối tượng từng tờ để đối chiếu.
- DIMSCALE không so riêng: kiểu `_33_` lưu kích thước đã nhân (`dimscale 1`,
  `dimtxt 150` thay cho `100 × 1,5`) vì bộ dựng dim của data-model bỏ qua
  DIMSCALE; hình và bản in như nhau. DIMFXL/DIMFXLON (đường gióng cố định,
  bật trong D100) data-model không có — khác biệt không tránh được.
- Biến kiểu kích thước lấy từ DIMSTYLE + ghi đè DSTYLE trong XDATA của từng dim;
  biến không có ở đó thì không so.
