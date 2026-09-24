param(
  [switch]$Rotate
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  if (-not (Test-Path -LiteralPath '.\wrangler.jsonc')) {
    throw '找不到 wrangler.jsonc；請從本專案執行。'
  }

  if (-not $Rotate) {
    Write-Host '本程式只供首次設定。若正式站已有 SESSION_SECRET，重新設定會使既有訪客失去訂單刪除權；要刻意輪替時才加 -Rotate。'
    $existing = & npx wrangler secret list --format json 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw '無法讀取 Worker 的密鑰清單；請確認已先部署 Worker 且 Wrangler 已登入。'
    }
    if (($existing -join "`n") -match 'SESSION_SECRET|ADMIN_PASSWORD_HASH') {
      throw 'Worker 已有正式密鑰；本程式已停止，未輪替任何密鑰。'
    }
  }

  $securePassword = Read-Host '請輸入至少 16 字元的主揪人密碼（不會顯示）' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ($password.Length -lt 16) { throw '主揪人密碼至少需要 16 字元。' }
    $hashBytes = [System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($password))
    $passwordHash = [Convert]::ToHexString($hashBytes).ToLowerInvariant()
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $password = $null
    $securePassword.Dispose()
  }

  $sessionSecret = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
  $payload = @{ SESSION_SECRET = $sessionSecret; ADMIN_PASSWORD_HASH = $passwordHash } | ConvertTo-Json -Compress
  $payload | npx wrangler secret bulk --name drink-ordering-cf
  if ($LASTEXITCODE -ne 0) { throw '上傳正式密鑰失敗。' }
  Write-Host '已設定 SESSION_SECRET 與 ADMIN_PASSWORD_HASH；密碼與雜湊未寫入專案檔案。'
} finally {
  $payload = $null
  $passwordHash = $null
  $sessionSecret = $null
  Pop-Location
}
