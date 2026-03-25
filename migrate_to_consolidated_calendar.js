
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Basic env loading
function getEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    const content = fs.readFileSync(envPath, 'utf8');
    const url = content.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
    const key = content.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
    return { url, key };
  } catch (e) {
    console.error('Error loading .env.local:', e.message);
    process.exit(1);
  }
}

const { url, key } = getEnv();
const supabase = createClient(url, key);

const RED_OLD_MATCHES = [
  { date: '2026-04-05', time: '15:10', title: 'RED OLD vs 徳島SFC50', description: '※3/20から変更' },
  { date: '2026-05-10', time: '15:20', title: 'RED OLD vs Z団', description: '会場: TSV人工' },
  { date: '2026-05-17', time: '11:10', title: 'RED OLD vs 鳴門クラブ', description: '会場: 山川総合' },
  { date: '2026-05-24', time: '13:30', title: 'RED OLD vs 応神・鴨島FC', description: '会場: 南岸第3' },
  { date: '2026-06-07', time: '17:10', title: 'RED OLD vs T-C-O-SC', description: '会場: 上桜' },
  { date: '2026-06-28', time: '15:50', title: 'RED OLD vs 吉野倶楽部', description: '会場: 山川総合' },
  { date: '2026-09-27', time: '11:10', title: 'RED OLD vs REBORN', description: '会場: 山川総合' },
  { date: '2026-11-01', time: '14:40', title: 'RED OLD vs 阿南シニアフットボールクラブ', description: '会場: あわぎん (※11/8から変更)' },
  { date: '2026-11-29', time: '14:40', title: 'RED OLD vs SCRATCH+(スクラッチプラス)', description: '会場: 山川総合' },
  { date: '2026-12-20', time: '14:40', title: 'RED OLD vs RE BORN', description: '会場: 山川総合' },
  { date: '2027-01-10', time: '11:30', title: 'RED OLD vs 徳島市シニアサッカークラブ', description: '会場: TSV人工' },
  { date: '2027-01-17', time: '12:20', title: 'RED OLD vs 鳴門 Rizort', description: '会場: 山川総合' },
];

async function migrate() {
  const calendarId = '76p83beb';
  
  console.log('Checking existing events...');
  const { data: existing } = await supabase
    .from('calendar_events')
    .select('title')
    .eq('calendar_id', calendarId);
    
  if (existing && existing.length > 0) {
    console.log(`Found ${existing.length} existing events for ${calendarId}. Skipping migration to avoid duplicates.`);
    return;
  }

  console.log('Migrating match data...');
  const events = RED_OLD_MATCHES.map(m => {
    const start = `${m.date}T${m.time}:00+09:00`;
    // Approximate end time (+1.5 hours)
    const [h, min] = m.time.split(':').map(Number);
    const endDate = new Date(`${m.date}T${m.time}:00+09:00`);
    endDate.setMinutes(endDate.getMinutes() + 90);
    const end = endDate.toISOString();

    return {
      calendar_id: calendarId,
      title: m.title,
      description: m.description,
      start_time: start,
      end_time: end,
      is_all_day: false,
      color: '#ef4444', // Red for matches
      member_name: '試合',
      is_recurring: false
    };
  });

  const { error } = await supabase
    .from('calendar_events')
    .insert(events);

  if (error) {
    console.error('Migration error:', error.message);
  } else {
    console.log('Successfully migrated match data.');
  }
}

migrate();
