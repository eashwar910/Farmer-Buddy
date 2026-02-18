import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkwrixhpykvcdpkvezsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrd3JpeGhweWt2Y2Rwa3ZlenNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzI4MTksImV4cCI6MjA4NjU0ODgxOX0.wJN3U-_8WvsT8YLAfBuUQA230o0rE5bWARfBO0f1j_E';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
