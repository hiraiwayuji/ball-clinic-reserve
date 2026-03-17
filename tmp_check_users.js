const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkUsers() {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, line_user_id')
    .not('line_user_id', 'is', null);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Users with LINE ID:', JSON.stringify(data, null, 2));
  }
}

checkUsers();
