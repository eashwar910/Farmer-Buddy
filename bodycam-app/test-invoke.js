const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://bkwrixhpykvcdpkvezsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrd3JpeGhweWt2Y2Rwa3ZlenNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzI4MTksImV4cCI6MjA4NjU0ODgxOX0.wJN3U-_8WvsT8YLAfBuUQA230o0rE5bWARfBO0f1j_E';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'test_fake_user123@bodycam.app',
    password: 'password123'
  });
  
  let validSession = signInData?.session;

  if (signInError) {
    console.error('Login error:', signInError.message);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: 'test_fake_user123@bodycam.app',
      password: 'password123'
    });
    console.log('Signup user:', !!signUpData?.user);
    if (signUpError) {
        console.error('Signup error:', signUpError.message);
    }
    validSession = signUpData?.session;
  }
  
  if (!validSession) {
    console.error('No session obtained');
    return;
  }
  
  console.log('Token length:', validSession.access_token.length);

  // Now invoke the function
  const rawResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-livekit-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${validSession.access_token}`
    },
    body: JSON.stringify({ shiftId: 'test-shift-id' })
  });
  
  console.log('STATUS:', rawResponse.status);
  const text = await rawResponse.text();
  console.log('BODY:', text);
}
run();
