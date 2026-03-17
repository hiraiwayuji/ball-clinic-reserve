const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) envVars[match[1]] = match[2].trim();
});
const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);
supabase.from('appointments').select('start_time, end_time, customers(name)').gte('start_time', '2026-03-15T10:00:00Z').lt('start_time', '2026-03-16T15:00:00Z').neq('status', 'cancelled').order('start_time', { ascending: true }).then(r => {
  fs.writeFileSync('march16_db.json', JSON.stringify(r.data, null, 2));
  console.log("Wrote to march16_db.json");
});
