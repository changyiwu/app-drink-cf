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

  $configPath = Join-Path $env:APPDATA 'xdg.config\.wrangler\config\default.toml'
  if (-not (Test-Path -LiteralPath $configPath)) { throw '找不到 Wrangler 登入資料；請先執行 npx wrangler login。' }
  $configText = [IO.File]::ReadAllText($configPath)
  $tokenMatch = [regex]::Match($configText, '(?m)^oauth_token\s*=\s*"([^"]+)"')
  if (-not $tokenMatch.Success) { throw '無法從 Wrangler 登入資料取得授權。' }
  $headers = @{ Authorization = 'Bearer ' + $tokenMatch.Groups[1].Value }
  $secretsUri = 'https://api.cloudflare.com/client/v4/accounts/30cb6bca91b0e5ad59b005b86c62752b/workers/scripts/drink-ordering-cf/secrets'

  if (-not $Rotate) {
    Write-Host '本程式只供首次設定。若正式站已有 SESSION_SECRET，重新設定會使既有訪客失去訂單刪除權；要刻意輪替時才加 -Rotate。'
    $existing = Invoke-RestMethod -Uri $secretsUri -Headers $headers -Method Get
    if (-not $existing.success) { throw '無法讀取 Worker 的密鑰清單。' }
    $existingNames = @($existing.result | Where-Object { $_ -and $_.PSObject.Properties['name'] } | ForEach-Object { $_.name })
    if ('SESSION_SECRET' -in $existingNames -or 'ADMIN_PASSWORD_HASH' -in $existingNames) {
      throw 'Worker 已有正式密鑰；本程式已停止，未輪替任何密鑰。'
    }
  }

  $securePassword = Read-Host '請輸入至少 8 字元的主揪人密碼（不會顯示）' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ($password.Length -lt 8) { throw '主揪人密碼至少需要 8 字元。' }
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $hashBytes = $sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($password))
      $passwordHash = [BitConverter]::ToString($hashBytes).Replace('-', '').ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $password = $null
    $securePassword.Dispose()
  }

  $randomBytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($randomBytes)
  } finally {
    $rng.Dispose()
  }
  $sessionSecret = [BitConverter]::ToString($randomBytes).Replace('-', '').ToLowerInvariant()
  $payload = @{ secrets = @{
    SESSION_SECRET = @{ name = 'SESSION_SECRET'; text = $sessionSecret; type = 'secret_text' }
    ADMIN_PASSWORD_HASH = @{ name = 'ADMIN_PASSWORD_HASH'; text = $passwordHash; type = 'secret_text' }
  } } | ConvertTo-Json -Depth 5 -Compress
  $result = Invoke-RestMethod -Uri ($secretsUri + '-bulk') -Headers $headers -Method Patch -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($payload))
  if (-not $result.success) { throw '上傳正式密鑰失敗。' }
  $confirmed = Invoke-RestMethod -Uri $secretsUri -Headers $headers -Method Get
  if (-not $confirmed.success) { throw '上傳後無法查詢 Cloudflare 密鑰清單。' }
  $confirmedNames = @($confirmed.result | Where-Object { $_ -and $_.PSObject.Properties['name'] } | ForEach-Object { $_.name })
  if ('SESSION_SECRET' -notin $confirmedNames -or 'ADMIN_PASSWORD_HASH' -notin $confirmedNames) {
    throw 'Cloudflare 尚未確認兩個正式密鑰；請保留此視窗並回報前面的 Wrangler 訊息。'
  }
  Write-Host '已設定 SESSION_SECRET 與 ADMIN_PASSWORD_HASH；密碼與雜湊未寫入專案檔案。'
} finally {
  $payload = $null
  $passwordHash = $null
  $sessionSecret = $null
  $headers = $null
  $configText = $null
  Pop-Location
}
