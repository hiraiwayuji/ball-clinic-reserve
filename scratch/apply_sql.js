const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// .env.localから設定を取得
function getEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  const url = content.match(/NEXT_PUBLIC_SUPABASE_URL="(.*)"/)[1];
  const key = content.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
  return { url, key };
}

async function applySql() {
  const { url, key } = getEnv();
  // Service Role Keyを使用して管理用クライアントを作成
  const supabase = createClient(url, key);

  console.log('Applying SQL to Supabase...');
  
  // postgres関数（rpc）経由で実行を試みる
  // 注: Supabaseにはデフォルトで arbitrary SQL を実行するRPCはないことが多いため、
  // もしCLIが使えない場合は、一旦この変更をGitHubにプッシュしてVercelの再デプロイ（マイグレーション自動実行）に期待するか、
  // ユーザーに実行を依頼する必要があります。
  
  // しかし、今回は「至急」とのことなので、まずRPCの `exec_sql` が存在するか試してみます。
  const { error } = await supabase.rpc('exec_sql', { 
    sql_query: 'ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE;' 
  });

  if (error) {
    console.log('RPC execution failed (exec_sql might not exist). error:', error.message);
    console.log('Manual intervention or CLI push might be needed.');
  } else {
    console.log('Successfully applied SQL via RPC.');
  }
}

applySql();
