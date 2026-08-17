// src/lib/supabase/config.js
// ⬇⬇⬇ مقادیر Supabase خود را اینجا بگذار (از Project Settings → API)
// نکته: anon public key امن است و می‌تواند در گیت‌هاب باشد (با RLS محافظت می‌شود).
// هرگز کلید service_role (مخفی) را اینجا نگذار.
const HARDCODED_URL = 'https://vhxtkqawovcpniciozcx.supabase.co';        // ← Project URL
const HARDCODED_ANON = 'sb_publishable_eLSyI584_973Hac2sYHGNQ_G2X55nF4';  // ← publishable (anon) key

// در صورت استفاده از متغیرهای محیطی Vite، آن‌ها اولویت دارند.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || HARDCODED_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || HARDCODED_ANON;

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
