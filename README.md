# 作伙喝飲料 Cloudflare 版

以 `app-drink-fb` 為基礎的獨立副本。前端沿用原頁面與五家店菜單；Cloudflare Workers 提供靜態頁面與 API，D1 保存訂單。資料不與來源專案的 Firebase 共用。

正式網址：<https://app-drink-cf.changyiwu.workers.dev/>

## 本機開發

需要 Node.js 20 以上。安裝依賴：

```powershell
npm ci
```

建立忽略版控的 `.dev.vars`：

```text
SESSION_SECRET=<至少 32 位元組的隨機字串>
ADMIN_PASSWORD_HASH=<主揪人密碼的 SHA-256 小寫十六進位雜湊>
```

以 Node 產生本機示範用的隨機值與密碼雜湊，勿把結果提交。正式環境請使用下方互動腳本，避免密碼留在命令歷史：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').createHash('sha256').update('你自己選的密碼').digest('hex'))"
```

初始化本機資料庫並啟動：

```powershell
npm run db:local
npm run dev
```

開啟 `http://localhost:8787/`。本機 Wrangler 使用獨立 D1，不會讀寫正式資料庫。

## 正式部署準備

1. 用 `npx wrangler whoami` 確認帳號。
2. 本專案的正式 D1 已建立於 APAC，ID 已寫入 `wrangler.jsonc`。
3. 套用正式 D1 遷移：`npx wrangler d1 migrations apply app-drink-cf --remote`。
4. `npm run build` 後由使用者執行 `npx wrangler deploy`。若終端機視窗會立刻關閉，可在檔案總管雙擊 `tools/deploy-interactive.cmd`；它會執行同一指令並停在結果畫面。首次部署至密鑰設定完成前，API 會回覆 503。
5. 由使用者在互動終端執行 `./tools/set-production-secrets.ps1`，或在檔案總管雙擊 `tools/secrets-interactive.cmd`，輸入至少 8 字元的主揪人密碼（建議使用不易猜的隨機組合）；腳本會透過已登入的 Wrangler 憑證一次上傳兩個 Cloudflare secrets，並向 Cloudflare 回查名稱。不輸出或儲存密碼。重新執行會輪替 `SESSION_SECRET`，使既有訪客的訂單 Cookie 失效，因此腳本預設會拒絕更新已存在的密鑰。
6. 用 `npx wrangler secret list` 確認兩個密鑰名稱，再驗證網站的下單與主揪人流程。

正式資源建立、資料表變更與部署各步要確認目標帳號及授權。密碼本身請存進自己的密碼管理器，不要貼進對話或提交到 Git。

## 權限與資料

- 看板公開顯示同店訂單與填寫的名稱；請使用暱稱或班級代號。
- 每位訪客可刪除自己瀏覽器建立的訂單；Cookie 遺失後，需由主揪人處理。
- 主揪人登入後可刪任何訂單、清除單店訂單。登入有每 IP 15 分鐘 5 次失敗限制。
- 前端每 5 秒更新訂單。
- 送單限制為同一訪客每 15 分鐘最多 30 筆、同一來源 IP 最多 120 筆。
- 菜單與價格由後端依 `public/menu_data.js` 驗證，瀏覽器送來的價格不被採用。

## 分享網址與 QR Code

首頁、五家店的分享入口與 `shop.html` 已使用正式網址的 OG 標籤。`public/images/qr_home.svg` 連到正式首頁。若未來網址改變，先更新七個 HTML 檔的 OG／canonical 與首頁分享文字，再重新產生 QR Code：

```powershell
uv run --no-project --with qrcode python tools/generate-qr.py https://新的正式網址/
```

最後執行 `npm run check`，並由使用者再次部署，使靜態資產更新到正式站。
