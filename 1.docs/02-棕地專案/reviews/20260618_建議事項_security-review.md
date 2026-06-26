# 教育訓練建議事項實作（Wave 0～5）— Security Review

**審查範圍**：commit `3e80df7~1..34e053f`（Wave 0 ～ Wave 5，含 QR 方案 A、受課對象 UX、NAS 儲存層／Audit／考卷遷移、教材庫、排程備份、行動 UI）
**審查重點**（依實作計畫 §Wave 6 指定）：NAS 密碼傳遞、audit 完整性、QR 殘留 token 端點、受課對象權限
**方法**：針對重點範圍逐檔讀碼比對既有安全模式，僅回報本次變更**新增**之高可信度漏洞

---

# Vuln 1: Path Traversal（任意檔案讀取）：`backend/app/routers/exam.py:360-373`

* Severity: **High**
* Category: `path_traversal`
* Confidence: 9/10
* Description：`GET /admin/exams/materials/preview/{year}/{plan_id}/{filename}` 端點中，路徑參數 `year`（`str`）未經任何驗證或淨化，直接傳入 `_exam_rel_path(year, plan_id, safe)` 組成 NAS 相對路徑，再交給 `storage.SmbStorage._unc()`。對照同檔案中的 `filename` 參數，所有讀寫端點皆會先呼叫 `_safe_filename()`（阻擋 `..`、`/`、`\`），但 `year` 完全沒有對應防護；`_unc()` 本身也只做 `strip("/\\")` 與 `/`→`\` 轉換，**不會**移除路徑中的 `..` 區段。攻擊者只需持有 `menu:exam` 權限（此權限廣泛授予「考卷工坊」一般使用者，非僅系統管理員），即可將 `year` 改為 `..`、`..%2F..` 等序列，使最終 UNC 路徑跳出 `MATERIALS_ROOT` 範圍，讀取 SMB 共享內其他目錄之任意檔案（如其他年度／計畫考卷、甚至共享根目錄下的其他資料）。
* Exploit Scenario：已登入且具 `menu:exam` 權限之使用者（多數出題承辦人員皆有此權限），直接呼叫：
  `GET /admin/exams/materials/preview/../../somewhere/secret.txt/1/x.txt`
  （或以 `..%2f..%2f` URL-encode 變化規避前端路由限制），伺服器以考卷 service 帳號（`EXAM_SMB_*`，非當前使用者帳號）對 NAS 發起讀取，回傳的檔案內容會被當作考卷 TXT 解碼後原樣回傳給呼叫者，造成跨計畫／跨年度甚至跨目錄之未授權檔案讀取。
* Recommendation：對 `year` 套用與 `filename` 相同等級的白名單驗證（例如僅允許 `^\d{4}$` 或既有 `TrainingPlan.year` 格式之數字字串），並比對請求中的 `plan_id` 是否真的對應到該 `year`（直接以 `plan.year` 覆寫，比照 `list_materials`/`delete_material` 既有作法，不採信前端傳入值）。更穩健的修法是讓 `_unc()` 在組路徑後額外檢查正規化結果仍位於 `root` 之下（例如以 `os.path.normpath` 檢查不含逸出之 `..` 區段），作為縱深防禦。

---

## 其他重點確認（非新增漏洞，列入紀錄）

以下四項為計畫 §Wave 6 指定之重點檢查項目，逐一確認結果如下（皆**非**本次新增之高可信度漏洞，故未列入上方正式 Vuln 清單）：

1. **NAS 密碼傳遞**：教材 interactive 模式密碼僅透過 HTTPS body／form 傳遞，`nas_session.py` 將密碼僅存於程序記憶體（`Dict[token, (creds, expiry)]`），token 以 `secrets.token_urlsafe(32)` 產生（不可猜測），不寫入 DB／日誌；排程備份密碼以 `cryptography.fernet`（`crypto.py`）加密後存 DB，金鑰來自環境變數且未設定時拒絕運作（不會靜默存明文）。`backup.py` 的 `GET /admin/backup/config` 僅回傳 `has_password: bool`，未回傳明文或密文。確認**無洩漏路徑**。
2. **Audit 完整性**：`record_file_transfer()` 對教材／考卷之上傳／下載／刪除皆有寫入，欄位含 `emp_id`、`client_ip`、`nas_username`、`status`；但**取消上傳（cancel）目前無對應稽核**（前端 `AbortController` 中止後，後端僅留下 `failed` 或無紀錄），此為計畫文件中已揭露之已知限制（Wave 3 報告已記錄，非本次新發現），建議後續補一個輕量 cancel 回報端點，但不構成資安漏洞。
3. **QR 殘留 token 端點**（`/auth/login/qrcode/{token}` GET/POST）：比對變更前後程式碼，本次僅新增 `deprecated=True` 標記與文件字串，**核心邏輯（含驗證碼 `"0000"` 開發後門、不檢查 `is_used` 允許多人使用）皆為既有程式碼，非本次引入**，依審查準則排除既有問題之回報。唯一新增行為是 `/admin/qrcode/login/generate` 改為產生固定登入頁 URL（不含 token/UUID），降低了該端點本身可被預先設計繞過的攻擊面，屬安全性提升而非新風險。
4. **受課對象權限**：`exam_center.py` 的 `_can_view_emp_id()`、`_resolve_personal_target_emp_id()`、`check_in_attendance()` 本次變更皆為**收斂**（新增停用帳號檢查、`get_scope_emp_ids(..., active_only=True)`、報到資格改為「受課單位 ∪ 個人受課對象」之正確聯集判斷），屬權限修正非引入新漏洞；`training.py` 受課單位／個人受課對象之預設規則調整亦僅影響資料寫入邏輯，未發現授權繞過路徑。

**額外確認點（教材庫 `menu:exam` 無部門範圍過濾）**：`teaching_materials.py` 之列表／下載／批次下載／修改／刪除端點未套用 per-department `resolve_data_scope`，任何持有 `menu:exam` 權限者可存取所有部門教材，此與既有「考卷工坊」「題庫」端點之既有存取模式（同樣全域、無部門範圍）一致，屬延續既有設計慣例，非本波新引入之存取控制缺口；計畫文件已將此列為**已知設計決策**並提交本次審查確認，建議列為未來可選強化項目（非阻擋上線要件）。

---

## 結論

本次審查僅發現 **1 項 High 信心度漏洞**（`exam.py` 考卷預覽端點 `year` 路徑參數缺乏淨化造成路徑穿越），建議在合併前修復。其餘三項指定重點（NAS 密碼傳遞、Audit、QR 殘留端點）與受課對象權限邏輯經比對皆無新增高可信度漏洞。
