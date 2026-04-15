$SourceDir = "c:\dev\ball-clinic-reserve"
$DestDir = "$SourceDir\接骨院システム_配布用（これをギガファイルやUSBへ）"

Write-Host "パッケージの作成を開始します..." -ForegroundColor Cyan

if (Test-Path $DestDir) { Remove-Item -Recurse -Force $DestDir }
New-Item -ItemType Directory -Path $DestDir | Out-Null

$FilesToCopy = @(
    "src", "public", "supabase", "components.json", "next.config.ts", "next-env.d.ts",
    "package.json", "package-lock.json", "postcss.config.mjs", "tsconfig.json", "eslint.config.mjs", "tailwind.config.ts"
)

foreach ($item in $FilesToCopy) {
    if (Test-Path "$SourceDir\$item") {
        Copy-Item -Path "$SourceDir\$item" -Destination "$DestDir\$item" -Recurse -Force
    }
}

Write-Host "✅ プログラム本体のコピー完了 (重いnode_modules等は排除済み)" -ForegroundColor Green

# Create .env.local.template
$envTemplate = @"
# ==========================================
# 相手の先生用の設定ファイルです
# アカウントを作成後、以下の [] の中を書き換えてください（「.env.local」に名前を変更してください）
# ==========================================

NEXT_PUBLIC_SUPABASE_URL="https://[ここに相手のSupabase文字列].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[ここに相手のanonキー]"
SUPABASE_SERVICE_ROLE_KEY="[ここに相手のservice_roleキー]"

LINE_CHANNEL_ACCESS_TOKEN="[ここに相手のLINEアクセストークン]"
LINE_CHANNEL_SECRET="[ここに相手のLINEチャネルシークレット]"
NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL="[相手のLINE友達追加URL]"

GEMINI_API_KEY="[相手のGemini APIキー]"
"@
Set-Content -Path "$DestDir\.env.local.template(名前を.env.localに変更して入力).txt" -Value $envTemplate -Encoding UTF8

Write-Host "✅ 空のパスワード設定ファイル（テンプレ）作成完了" -ForegroundColor Green

# Create 1_初期セットアップ.bat
$setupBat = @"
@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ==========================================
echo    接骨院システム 初期セットアップ
echo ==========================================
echo インターネットから必要な部品(node_modules)をダウンロードします。
echo そのまま数分間お待ちください...
echo.
call npm install
echo.
echo セットアップが完了しました。
echo この画面を閉じて、「2_接骨院ダッシュボード起動.bat」を押してください。
pause
"@
Set-Content -Path "$DestDir\1_初回のみクリック（初期セットアップ）.bat" -Value $setupBat -Encoding Default

# Create 2_接骨院ダッシュボード起動.bat
$startBat = @"
@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0start_dash.ps1"
"@
Set-Content -Path "$DestDir\2_接骨院ダッシュボード起動.bat" -Value $startBat -Encoding Default

# Create start_dash.ps1 (Modified for dynamic path so it works on any PC)
$startPs1 = @"
# Ball Clinic Dashboard Launcher (Dist Version)
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  接骨院ダッシュボード 起動システム" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

`$PROJECT_DIR = `$PSScriptRoot
Set-Location `$PROJECT_DIR

Write-Host "[1/3] サーバーを起動しています (npm run dev)..."
Start-Process cmd -ArgumentList "/k chcp 65001 & npm run dev"

Write-Host "[2/3] 準備ができるまで15秒ほどお待ちください..."
Start-Sleep -Seconds 15

Write-Host "[3/3] ブラウザでダッシュボードを開き..."
Start-Process "http://localhost:3000/admin/dashboard"

Write-Host ""
Write-Host "起動処理が完了しました。" -ForegroundColor Green
Write-Host "この起動ウィンドウは閉じても大丈夫です。"
Start-Sleep -Seconds 5
"@
Set-Content -Path "$DestDir\start_dash.ps1" -Value $startPs1 -Encoding UTF8

Write-Host "✅ 起動ツール・セットアップツールの作成完了" -ForegroundColor Green

# Merge SQL migrations
$sqlDest = "$DestDir\3_【重要】Supabaseにコピペする用(初回のみ).sql"
Get-ChildItem -Path "$SourceDir\supabase\migrations\*.sql" | Sort-Object Name | Get-Content | Out-File -FilePath $sqlDest -Encoding UTF8

Write-Host "✅ データベース構築用SQLの自動結合完了" -ForegroundColor Green

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " お渡し用パッケージの作成が完了しました！" -ForegroundColor Cyan
Write-Host " フォルダの場所: $DestDir"
Write-Host " このフォルダをZIPで圧縮してギガファイル便等でお渡しください。" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
