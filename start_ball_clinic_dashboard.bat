@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo [LOG] 起動準備中...
echo [LOG] サーバーを開始しています (npm run dev)
start cmd /k "npm run dev"
echo [LOG] サーバーの準備が整うまで10秒待機しています...
ping 127.0.0.1 -n 11 > nul
echo [LOG] ブラウザでダッシュボードを表示します
start http://localhost:3000/admin/dashboard
echo [LOG] 起動完了
exit
