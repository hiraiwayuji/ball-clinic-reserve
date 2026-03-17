# Ball Clinic Dashboard Launcher
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Clinic Dashboard Startup System" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$PROJECT_DIR = "c:\Users\hirai\OneDrive\デスクトップ\antigravity\ball-clinic-reserve"
Set-Location $PROJECT_DIR

Write-Host "[1/3] Loading environment variables..."
if (Test-Path ".env.local") {
    Get-Content ".env.local" | ForEach-Object {
        if ($_ -match "^\s*([^#\s][^=]*)\s*=\s*(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # Remove optional quotes
            if ($value -match "^`"(.*)`"$") { $value = $matches[1] }
            elseif ($value -match "^'(.*)'$") { $value = $matches[1] }
            
            [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
            Write-Host "Loaded: $name" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "Warning: .env.local not found." -ForegroundColor Yellow
}

Write-Host "[2/3] Starting the server (npm run dev)..."
# Start the server in a new window with inherited environment variables
Start-Process cmd -ArgumentList "/k chcp 65001 & npm run dev"

Write-Host "[3/3] Please wait for 15 seconds for initialization..."
Start-Sleep -Seconds 15

Write-Host "Opening the dashboard in the browser..."
Start-Process "http://localhost:3000/admin/dashboard"

Write-Host ""
Write-Host "Startup process completed." -ForegroundColor Green
Write-Host "Keep the server window open to maintain the system."
Write-Host "You can close this launcher window now."
Start-Sleep -Seconds 5
