## Task 7 Report

### Status
DONE

### Commits
（提交後補入 git log --oneline 79c6e21..HEAD）

### Files Updated
- 1.docs/02-棕地專案/交付實作文件/README.md: 在最後 `---` 之後新增「已通過授權重考 ＋ 考試中心及格分修正 ＋ 訓練計畫 Modal 雙欄（2026-07）」小節與表格；最後更新日期改為 2026-07-08
- 1.docs/00-專案總覽/專案使用說明.md: §4.2 報到區塊補入授權重考限制說明與及格分說明；§4.3 第 6 條重考規則改為區分「未通過直接重考 / 已通過需授權」
- 1.docs/00-專案總覽/角色與權限管理架構說明.md: §6.2 功能代碼範例末尾加入 `btn:exam:authorize-retake` 說明
- 1.docs/00-專案總覽/資料庫結構分析/education_training_db_結構分析.md: `exam_records` 表加入 `retake_authorized` 欄位；`job_titles` 之前插入 `exam_retake_authorizations` 新表；ER 圖加入 `exam_records ||--o{ exam_retake_authorizations` 關聯
- 1.docs/系統測試/20260707_系統驗證測試記錄.md: 末尾 append T1–T15 測試案例表格
