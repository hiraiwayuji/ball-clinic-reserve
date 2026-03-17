import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const envVars: any = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=["']?(.*?)["']?$/);
  if (match) envVars[match[1]] = match[2].trim();
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001';

async function diagnose() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('--- Diagnosis Report ---');
  
  // 1. Check Row Existence
  const { data: row, error: rErr } = await supabase
    .from('clinic_settings')
    .select('*')
    .eq('id', DEFAULT_CLINIC_ID)
    .single();
    
  if (rErr) {
    console.error('Row Fetch Error:', rErr.message);
  } else {
    console.log('Row found. Columns available in result:', Object.keys(row));
  }

  // 2. Test specific column update
  console.log('--- Testing specific updates ---');
  const updates = [
    { clinic_name: 'Test ' + Date.now() },
    { tiktok_url: 'https://tiktok.com/test' }
  ];

  for (const update of updates) {
    console.log(`Trying update with keys: ${Object.keys(update)}`);
    const { error, status, statusText } = await supabase
      .from('clinic_settings')
      .update(update)
      .eq('id', DEFAULT_CLINIC_ID);
      
    if (error) {
      console.error(`Update Error (${Object.keys(update)}):`, error.message, status, statusText);
    } else {
      console.log(`Update allegedly successful (${Object.keys(update)}). Status: ${status}`);
    }
  }

  // 3. Current month targets
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
  const { data: target, error: tErr } = await supabase
    .from('clinic_targets')
    .select('*')
    .eq('clinic_id', DEFAULT_CLINIC_ID)
    .eq('month', monthStr);

  if (tErr) console.error('Target Fetch Error:', tErr.message);
  else console.log('Current Target Row:', target);
}

diagnose();
