const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
const envPath = path.join(__dirname, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const newAppointments = [
  // 3/9 (月)
  { name: "数藤将美(スドウ)", phone: "080-0000-0101", date: "2026-03-09", time: "12:00", memo: "実費診療" },
  { name: "(ナカシマ)", phone: "080-0000-0102", date: "2026-03-09", time: "13:30", memo: "" },
  { name: "(オカモト)", phone: "080-0000-0103", date: "2026-03-09", time: "16:00", memo: "" },
  { name: "松本智之(マツモト)", phone: "080-0000-0104", date: "2026-03-09", time: "16:30", memo: "実費診療" },
  { name: "(コウチ ミリア)", phone: "080-0000-0105", date: "2026-03-09", time: "17:30", memo: "" },
  { name: "宝本夢菜(ユラ)", phone: "080-0000-0106", date: "2026-03-09", time: "18:00", memo: "実費診療" },
  { name: "(マツモト)", phone: "080-0000-0107", date: "2026-03-09", time: "18:30", memo: "" },
  { name: "八田由紀(ハッタ)", phone: "080-0000-0108", date: "2026-03-09", time: "19:00", memo: "" },
  { name: "和田健吾(ワダ)", phone: "080-0000-0109", date: "2026-03-09", time: "19:00", memo: "実費診療" },
  { name: "(フジカワ)", phone: "080-0000-0110", date: "2026-03-09", time: "19:30", memo: "" },
  { name: "新開はる(シンカイ)", phone: "080-0000-0111", date: "2026-03-09", time: "19:30", memo: "" },
  { name: "(キタヤマ)", phone: "080-0000-0112", date: "2026-03-09", time: "20:30", memo: "" },
  { name: "受谷匠(ウケヤ)", phone: "080-0000-0113", date: "2026-03-09", time: "20:30", memo: "" },
  { name: "(イワシ)", phone: "080-0000-0114", date: "2026-03-09", time: "21:00", memo: "" },
  { name: "大久保良(オオクボ)", phone: "080-0000-0115", date: "2026-03-09", time: "21:30", memo: "" },
  { name: "マスダタケル", phone: "080-0000-0116", date: "2026-03-09", time: "22:30", memo: "実費診療" },
  { name: "(コバヤシ)", phone: "080-0000-0117", date: "2026-03-09", time: "22:30", memo: "実費診療" },

  // 3/10 (火)
  { name: "佐藤広文(サトウ)", phone: "080-0000-0118", date: "2026-03-10", time: "13:00", memo: "実費診療" },
  { name: "(オカダメイ)", phone: "080-0000-0119", date: "2026-03-10", time: "14:30", memo: "実費診療" },
  { name: "(オカモトラナ)", phone: "080-0000-0120", date: "2026-03-10", time: "15:30", memo: "" },
  { name: "(ヨシダリツキ)", phone: "080-0000-0121", date: "2026-03-10", time: "16:30", memo: "" },
  { name: "松浦拓登(タクト)", phone: "080-0000-0122", date: "2026-03-10", time: "17:00", memo: "" },
  { name: "富永紋加(アヤカ)", phone: "080-0000-0123", date: "2026-03-10", time: "18:00", memo: "" },
  { name: "新開はるか(シンカイ)", phone: "080-0000-0124", date: "2026-03-10", time: "18:30", memo: "実費診療" },
  { name: "(モリモトタクヤ)", phone: "080-0000-0125", date: "2026-03-10", time: "19:30", memo: "" },
  { name: "宇川直人(ウカワ)", phone: "080-0000-0126", date: "2026-03-10", time: "20:30", memo: "実費診療" },
  { name: "山内蒼太(ヤマウチ)", phone: "080-0000-0127", date: "2026-03-10", time: "21:30", memo: "" },
  { name: "榊剛太郎(コウタロウ)", phone: "080-0000-0128", date: "2026-03-10", time: "22:30", memo: "" },

  // 3/12 (木)
  { name: "阿部浩二(アベ)", phone: "080-0000-0129", date: "2026-03-12", time: "11:30", memo: "実費診療" },
  { name: "(オカモトラナ)", phone: "080-0000-0130", date: "2026-03-12", time: "15:00", memo: "" },
  { name: "(ササキショウヘイ)", phone: "080-0000-0131", date: "2026-03-12", time: "16:30", memo: "実費診療" },
  { name: "杉原凰(スギハラ)", phone: "080-0000-0132", date: "2026-03-12", time: "17:30", memo: "" },
  { name: "(トミナガマナカ)", phone: "080-0000-0133", date: "2026-03-12", time: "18:00", memo: "" },
  { name: "和田健吾(ワダ)", phone: "080-0000-0134", date: "2026-03-12", time: "18:30", memo: "" },
  { name: "松浦拓登(タクト)", phone: "080-0000-0135", date: "2026-03-12", time: "19:00", memo: "" },
  { name: "林琉乃介(ハヤシ)", phone: "080-0000-0136", date: "2026-03-12", time: "19:30", memo: "" },
  { name: "(コウチミリア)", phone: "080-0000-0137", date: "2026-03-12", time: "20:00", memo: "" },
  { name: "北條智美(ホウジョウ)", phone: "080-0000-0138", date: "2026-03-12", time: "20:30", memo: "" },
  { name: "三村莉子(ミムラ)", phone: "080-0000-0139", date: "2026-03-12", time: "21:00", memo: "" },
  { name: "大久保良治(オオクボ)", phone: "080-0000-0140", date: "2026-03-12", time: "21:30", memo: "" },
  { name: "(ナカシマヨウコウ)", phone: "080-0000-0141", date: "2026-03-12", time: "22:00", memo: "" },

  // 3/13 (金)
  { name: "(キング)", phone: "080-0000-0142", date: "2026-03-13", time: "12:00", memo: "実費診療" },
  { name: "松本智之(マツモト)", phone: "080-0000-0143", date: "2026-03-13", time: "16:30", memo: "" },
  { name: "富永紋加(アヤカ)", phone: "080-0000-0144", date: "2026-03-13", time: "18:00", memo: "" },
  { name: "宝本夢菜(ユラ)", phone: "080-0000-0145", date: "2026-03-13", time: "18:30", memo: "" },
  { name: "数藤清治(スドウ)", phone: "080-0000-0146", date: "2026-03-13", time: "19:00", memo: "" },
  { name: "新開はるか(シンカイ)", phone: "080-0000-0147", date: "2026-03-13", time: "19:30", memo: "実費診療" },
  { name: "(ウカワヒロト)", phone: "080-0000-0148", date: "2026-03-13", time: "20:30", memo: "実費診療" },
  { name: "(フジカワヒロト)", phone: "080-0000-0149", date: "2026-03-13", time: "22:00", memo: "" },
  { name: "(モリモトタクヤ)", phone: "080-0000-0150", date: "2026-03-13", time: "22:30", memo: "" },

  // 3/14 (土)
  { name: "平井唯人(ユイト)", phone: "080-0000-0151", date: "2026-03-14", time: "10:00", memo: "" },
  { name: "野口和紅(ワコ)", phone: "080-0000-0152", date: "2026-03-14", time: "12:00", memo: "実費診療" },
  { name: "多田真也(タダ)", phone: "080-0000-0153", date: "2026-03-14", time: "15:00", memo: "" },
  { name: "日下春美(クサカ)", phone: "080-0000-0154", date: "2026-03-14", time: "16:30", memo: "実費診療" },
  { name: "平井そうた(ソウタ)", phone: "080-0000-0155", date: "2026-03-14", time: "18:00", memo: "" },

  // 3/16 (月) - 3/21 (土) From the other partial images
  { name: "数藤将美", phone: "080-0000-0161", date: "2026-03-16", time: "12:00", memo: "実費診療" },
  { name: "(アモウミ)", phone: "080-0000-0162", date: "2026-03-16", time: "13:00", memo: "実費診療" },
  { name: "八田由紀", phone: "080-0000-0163", date: "2026-03-16", time: "19:00", memo: "実費診療" },
  { name: "(ドウタニ)", phone: "080-0000-0164", date: "2026-03-16", time: "20:00", memo: "実費診療" },
  { name: "大久保良", phone: "080-0000-0165", date: "2026-03-16", time: "21:00", memo: "実費診療" },
  
  { name: "佐藤広文(サトウ)", phone: "080-0000-0166", date: "2026-03-17", time: "13:00", memo: "実費診療" },
  { name: "(ハセ)", phone: "080-0000-0167", date: "2026-03-17", time: "19:00", memo: "実費診療" },
  { name: "宇川直人(ウカワ)", phone: "080-0000-0168", date: "2026-03-17", time: "20:00", memo: "実費診療" },
  { name: "山内蒼太(ヤマウチ)", phone: "080-0000-0169", date: "2026-03-17", time: "21:00", memo: "実費診療" },
  { name: "マスダタケル", phone: "080-0000-0170", date: "2026-03-17", time: "22:00", memo: "実費診療" },

  { name: "佐藤広文(サトウ)", phone: "080-0000-0171", date: "2026-03-19", time: "13:00", memo: "実費診療" },
  { name: "中村俊章(ナカムラ)", phone: "080-0000-0172", date: "2026-03-19", time: "17:00", memo: "実費診療" },
  { name: "(マスダタケル)", phone: "080-0000-0173", date: "2026-03-19", time: "18:00", memo: "実費診療" },
  { name: "藤森大樹(ヒロキ)", phone: "080-0000-0174", date: "2026-03-19", time: "19:00", memo: "実費診療" },
  { name: "北條智美(ホウジョウ)", phone: "080-0000-0175", date: "2026-03-19", time: "20:00", memo: "実費診療" },
  { name: "三村莉子(ミムラ)", phone: "080-0000-0176", date: "2026-03-19", time: "20:30", memo: "実費診療" },
  { name: "大久保良治(オオクボ)", phone: "080-0000-0177", date: "2026-03-19", time: "21:00", memo: "実費診療" },

  { name: "岸田典子(キシダ)", phone: "080-0000-0156", date: "2026-03-21", time: "10:00", memo: "実費診療" },
  { name: "岩野高士(イワノ)", phone: "080-0000-0157", date: "2026-03-21", time: "11:00", memo: "実費診療" },
  { name: "野口和紅(ワコ)", phone: "080-0000-0158", date: "2026-03-21", time: "12:00", memo: "実費診療" },
  { name: "日下春美(クサカ)", phone: "080-0000-0159", date: "2026-03-21", time: "16:30", memo: "実費診療" },
  { name: "(ヨヤクニッシン)", phone: "080-0000-0160", date: "2026-03-21", time: "18:00", memo: "実費診療" },
];

async function run() {
  console.log('Clearing old mocked data and importing new AirRESERVE data...');
  
  // Wipe all customer accounts starting with 080-0000 to be safe
  const { error: delCustErr } = await supabase
    .from('customers')
    .delete()
    .like('phone', '080-0000-%');
    
  if (delCustErr) {
    console.warn('Customer delete error:', delCustErr.message);
  }

  for (const apt of newAppointments) {
    // 1. Create Customer
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .insert({ name: apt.name, phone: apt.phone })
      .select()
      .single();

    if (customerError) {
      console.error('Error creating customer:', apt.name, customerError.message);
      continue;
    }

    // 2. Create Appointment
    const startTimeStr = `${apt.date}T${apt.time}:00+09:00`;
    const startDate = new Date(startTimeStr);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000); // 30 mins later
    
    // Check if the time implies an overlapped generic memo vs specific
    const memoToInsert = apt.memo ? apt.memo : 'AirRESERVEからの移行';
    
    const { error: aptError } = await supabase
      .from('appointments')
      .insert({
        customer_id: customerData.id,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'confirmed',
        memo: memoToInsert,
        is_first_visit: false
      });

    if (aptError) {
      console.error('Error creating appointment:', apt.name, aptError.message);
    } else {
      console.log(`✅ Imported: ${apt.name} on ${apt.date} at ${apt.time}`);
    }
  }
  
  console.log('Finished import.');
}

run();
