---
'@mlightcad/cad-template-plugin': patch
---

Hồ sơ mố 0.3.0: `bMatDuong` co giãn được (hai mép mặt đường ở mặt chính dời ∓ΔbMatDuong/2). Khi chỉ cho `bMatDuong`, `tao_ho_so_mo`/`sua_ho_so_mo` tự suy `bBe = bThan = bMatDuong + 2 × 350` (lề cố định như M1) và `aCocNgang = bBe − 2D`, `aCocDoc = lBe − 2D` khi không truyền; mọi giá trị suy ra trả về `data.suyRa`. Kiểm `road_outside_wall` theo lề tối thiểu 350 mm và nêu `bBe` đề xuất.
