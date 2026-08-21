import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase ortam değişkenleri eksik! .env.local dosyasını kontrol edin.');
}

// caie izole şemasına bağlanan Supabase istemcisi
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'caie' },
});