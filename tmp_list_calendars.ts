
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Environment variables missing');
  process.exit(1);
}

const supabase = createClient(url, key);

async function listCalendars() {
  const { data, error } = await supabase.from('calendars').select('*');
  if (error) {
    console.error('Error fetching calendars:', error);
    return;
  }
  console.log('Calendars:', JSON.stringify(data, null, 2));
}

listCalendars();
