---
---

The abutment dossier's dimensions can now show numbers. The 0.3.0 generator copies the source drawing, whose dimensions carry symbols ("B Mố", "HB", "LC"…) instead of measurements, so a changed dimension kept its old symbol. A new `nhanKichThuoc` parameter keeps the symbols by default (`ky_hieu`), or shows the measurement (`so_do`) or both (`ca_hai`, "B Mố = 7700"); in the numeric modes the elevation tags show the SUB-020 elevations, following `caoDoDayBe`. The general sheets now name the abutment from `tenMo`. `DOSSIER_DIM_SYMBOLS` maps each symbol to the parameter it measures, checked by test under the stretch grid.
