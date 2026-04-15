$root = "c:\dev\ball-clinic-reserve"

# 1. フォルダと言語の両方を含むファイル内容の全置換
Write-Host "Replacing strings in files..."
$targetExtensions = @("*.tsx", "*.ts", "*.js", "*.json", "*.md", "*.css", "*.sql")
$files = Get-ChildItem -Path $root -Include $targetExtensions -Recurse -File -Exclude "node_modules", ".next"

foreach ($file in $files) {
    try {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($null -eq $content) { continue }

        $original = $content
        # 置換マップ (優先順位: 経営軍師, 軍師, STRATEGIST, Strategist, strategist)
        $content = $content.Replace("経営軍師", "AI秘書")
        $content = $content.Replace("軍師", "AI秘書")
        $content = $content.Replace("STRATEGIST", "SECRETARY")
        $content = $content.Replace("Strategist", "Secretary")
        $content = $content.Replace("strategist", "secretary")

        if ($original -ne $content) {
            Set-Content $file.FullName $content -Encoding UTF8
            Write-Host "Updated: $($file.FullName)"
        }
    } catch {
        Write-Warning "Failed to process: $($file.FullName)"
    }
}

# 2. ファイル名・フォルダ名の変更 (深い階層から順に処理)
Write-Host "Renaming files and folders..."
$items = Get-ChildItem -Path $root -Recurse | Where-Object { $_.Name -like "*strategist*" } | Sort-Object FullName -Descending

foreach ($item in $items) {
    try {
        $newName = $item.Name -replace "strategist", "secretary"
        Rename-Item -Path $item.FullName -NewName $newName -ErrorAction Stop
        Write-Host "Renamed: $($item.FullName) -> $newName"
    } catch {
        Write-Warning "Failed to rename: $($item.FullName)"
    }
}

Write-Host "Rebranding complete!"
