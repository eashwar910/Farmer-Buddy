import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecordings() {
  const { data, error } = await supabase.from('recordings').select('*');
  if (error) {
    console.error("Error fetching recordings:", error);
    return;
  }
  console.log(`Found ${data.length} recordings`);
  const shiftsCount = {};
  for (const r of data) {
    const key = `${r.shift_id}-${r.employee_id}`;
    if (!shiftsCount[key]) shiftsCount[key] = 0;
    shiftsCount[key]++;
  }
  console.log("Chunks per shift-employee:", shiftsCount);
  console.dir(data.slice(0, 3), { depth: null });
}

checkRecordings();
