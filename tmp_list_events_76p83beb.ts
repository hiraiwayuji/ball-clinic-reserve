
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

async function listEvents() {
  const calendarId = '76p83beb';
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('calendar_id', calendarId);
    
  if (error) {
    console.error('Error fetching events:', error);
    return;
  }
  console.log(`Events for ${calendarId}:`, JSON.stringify(data, null, 2));
}

listEvents();
