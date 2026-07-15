const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const dummyEmail = 'testuser123@safen.app';
  const dummyPassword = 'SafenSecurePassword2026!';

  console.log('Testing signUp with Email...');
  const res2 = await supabase.auth.signUp({
    email: dummyEmail,
    password: dummyPassword,
  });
  console.log('SignUp Response:', res2.error ? res2.error.message : 'Success');

  if (!res2.error) {
    console.log('Testing signIn...');
    const res1 = await supabase.auth.signInWithPassword({
      email: dummyEmail,
      password: dummyPassword,
    });
    console.log('SignIn Response:', res1.error ? res1.error.message : 'Success');
  }
}

test();
