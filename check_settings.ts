import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_CLINIC_ID = '00000000-0000-0000-0000-000000000001';

async function check() {
  console.log('--- Physical DB Check ---');
  
  const { data: settings, error: sErr } = await supabase
    .from('clinic_settings')
    .select('*')
    .eq('id', DEFAULT_CLINIC_ID);
    
  if (sErr) console.error('Settings Error:', sErr);
  else console.log('Clinic Settings:', JSON.stringify(settings, null, 2));

  const now = new Date();
  const monthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
  
  const { data: targets, error: tErr } = await supabase
    .from('clinic_targets')
    .select('*')
    .eq('clinic_id', DEFAULT_CLINIC_ID)
    .eq('month', monthStr);

  if (tErr) console.error('Targets Error:', tErr);
  else console.log('Clinic Targets:', JSON.stringify(targets, null, 2));
}

check();
