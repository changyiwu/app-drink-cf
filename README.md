# 作伙喝飲料 Cloudflare 版

以 `drink-ordering-gh` 為基礎的獨立副本。前端沿用原頁面與五家店菜單；Cloudflare Workers 提供靜態頁面與 API，D1 保存訂單。資料不與來源專案的 Firebase 共用。

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

以 Node 產生隨機值與密碼雜湊，勿把結果提交：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').createHash('sha256').update('你自己選的長密碼').digest('hex'))"
```

初始化本機資料庫並啟動：

```powershell
npm run db:local
npm run dev
```

開啟 `http://localhost:8787/`。本機 Wrangler 使用獨立 D1，不會讀寫正式資料庫。

## 正式部署準備

1. 用 `npx wrangler whoami` 確認帳號。
2. 建立亞太區 D1，將真實 `database_id` 寫入 `wrangler.jsonc`。
3. 以 `npx wrangler secret put SESSION_SECRET` 和 `npx wrangler secret put ADMIN_PASSWORD_HASH` 設定正式環境；密碼值不可寫入檔案或聊天。
4. 套用正式 D1 遷移：`npx wrangler d1 migrations apply drink-ordering-cf --remote`。
5. `npm run build` 後使用 `npx wrangler deploy`。

正式資源建立、資料表變更與部署各步要確認目標帳號及授權。`wrangler.jsonc` 目前的全零資料庫 ID 是本機開發佔位值，不可直接用於正式部署。

## 權限與資料

- 看板公開顯示同店訂單與填寫的名稱；請使用暱稱或班級代號。
- 每位訪客可刪除自己瀏覽器建立的訂單；Cookie 遺失後，需由主揪人處理。
- 主揪人登入後可刪任何訂單、清除單店訂單。登入有每 IP 15 分鐘 5 次失敗限制。
- 前端每 5 秒更新訂單。
- 菜單與價格由後端依 `public/menu_data.js` 驗證，瀏覽器送來的價格不被採用。

## 尚待正式網址

為避免分享至舊版 GitHub Pages，已移除舊 QR Code 與 OG 絕對網址。正式部署後應補上新網址並重新產生 QR Code。
