const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const dummyPhone = '+2348000000099';
  const dummyPassword = 'SafenSecurePassword2026!';

  const res1 = await supabase.auth.signInWithPassword({
    phone: dummyPhone,
    password: dummyPassword,
  });

  if (res1.data.session) {
    console.log('Logged in as:', res1.data.user.id);
    const { data, error } = await supabase.from('profiles').select('id, full_name, phone').limit(50);
    console.log('All Profiles:', data);
  } else {
    console.log('Login failed:', res1.error);
  }
}

test();
