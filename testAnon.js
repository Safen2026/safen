const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log('Testing Anonymous SignIn...');
  const res = await supabase.auth.signInAnonymously();
  console.log('Anon Response:', res.error ? res.error.message : 'Success');
  if (!res.error) {
    console.log('User created:', res.data.user?.id);
  }
}

test();
