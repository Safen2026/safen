const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const dummyPhone = '+2348000000099';
  const dummyPassword = 'SafenSecurePassword2026!';

  console.log('Testing signUp...');
  const res2 = await supabase.auth.signUp({
    phone: dummyPhone,
    password: dummyPassword,
    options: { data: { full_name: 'Test User' } },
  });
  console.log('SignUp Response:', res2.error ? res2.error.message : 'Success');
  
  if (!res2.error) {
    console.log('Testing signInWithPassword...');
    const res1 = await supabase.auth.signInWithPassword({
      phone: dummyPhone,
      password: dummyPassword,
    });
    console.log('SignIn Response:', res1.error ? res1.error.message : 'Success');
    if (res1.data.session) {
      console.log('Session acquired! It works for new users!');
    }
  }
}

test();
