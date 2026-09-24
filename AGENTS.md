# drink-ordering-cf（專案藍圖）

> 跨 Agent 通用規則。每次開工先讀本檔與 `handoff.md`。Claude Code 透過 `CLAUDE.md` 載入。

## 專案簡介

以 `drink-ordering-gh` 為來源的獨立飲料訂購系統副本。保留原有五家店的頁面、菜單、圖片與看板，前端改由 Cloudflare Workers 靜態資產提供，後端以 Worker API 和 D1 儲存訂單。

## 關鍵時程

目前無固定時程。

## 目標與路線圖

- [x] 複製前端素材並移除 Firebase 依賴
- [x] 建立 Cloudflare Worker API 與 D1 遷移檔
- [x] 驗證本機訂單與主揪人流程
- [x] 建立正式 D1、設定密鑰、部署 Worker
- [ ] 取得正式網址後補上 OG 絕對網址與新版分享 QR Code

## 資料夾結構

```text
drink-ordering-cf/
├─ public/             # 從來源專案複製並改接 API 的前端
│  ├─ images/          # 圖片素材與原圖（不含來源網站的舊 QR Code）
│  ├─ index.html       # 首頁
│  ├─ shop.html        # 訂購頁
│  ├─ shop.js          # Cloudflare API 用戶端與看板
│  ├─ menu_data.js     # 前後端共用菜單與價格
│  └─ styles.css
├─ worker/index.js     # Cloudflare Worker API
├─ migrations/         # D1 資料表遷移
├─ tools/build.mjs     # 靜態資產建置
├─ wrangler.jsonc      # Worker、靜態資產、D1 binding
├─ package.json
├─ README.md
├─ AGENTS.md           # 本檔：長期規則
├─ handoff.md          # 下一次工作的交接檔，不進 git
└─ CLAUDE.md           # Claude Code 橋接
```

## 專案專屬規則

- `drink-ordering-gh` 是來源專案，這個副本不得回寫來源資料夾或連到來源 Firebase 專案。
- 菜單與價格以 `public/menu_data.js` 為準；Worker 必須重新驗證品項、尺寸與價格，不能信任瀏覽器傳來的價格。
- 訂單擁有權由 Worker 簽章的 HttpOnly Cookie 判定，管理員憑證只存在 HttpOnly Cookie 與 D1 中的雜湊值。前端按鈕顯示不是授權邊界。
- `SESSION_SECRET` 與 `ADMIN_PASSWORD_HASH` 只放 Cloudflare secret 或本機忽略的 `.dev.vars`，不可進 git。
- D1 結構變更一律新增遷移檔，不修改已套用的遷移。
- 本專案的 D1 與原 Firebase 訂單彼此獨立，不自動搬移既有訂單。
- 訂單姓名會顯示在公開看板；正式使用時只填班級代號或暱稱，不儲存學生真名。

## 同步層級（依初始化進度更新）

| 層級 | 平台 | 位置 | 讀取時機 |
|------|------|------|---------|
| L1 | 本地（GDrive） | `AGENTS.md`＋`handoff.md`＋`CLAUDE.md` | 每個 session |
| L2 | GitHub | `changyiwu/drink-ordering-cf`（私有） | 指定時 |
| L3 | Obsidian | `drink-ordering-cf/專案工作流程.md` | 有需要時 |

## 三個檔案的職責（依「時效性」分家，不是依「詳細程度」）

| 檔案 | 時效 | 寫入方式 | 放什麼 |
|------|------|---------|--------|
| `handoff.md` | 下一個 session | 每次收工整份重寫 | 做到哪、下一步、暫時問題 |
| `AGENTS.md` | 長期有效 | 規則變動時才改 | 目標、路線圖、常設規則、結構 |
| Obsidian／`git log` | 歷史 | 持續追加 | 決策與變更原因 |

驗收標準：刪除 `handoff.md` 不應損失長期有效的資訊。

## 工作約定

- 每次開工先讀 `handoff.md`，收工更新 `handoff.md`。
- `handoff.md` 不進 git；跨電腦靠雲端硬碟同步。
- 修改共用檔案前先讀最新內容；只提交本次任務相關檔案。
- 回應與文件使用繁體中文，Windows 指令優先使用 PowerShell。
- 雲端部署、正式 D1 遷移與遠端資料操作須確認作用目標與目前授權。
