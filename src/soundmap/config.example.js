// ============================================================================
// Shanghai Sound Map — site configuration TEMPLATE.
// Copy to config.js and fill in the values, then run tests/check_soundmap.py.
//
// These values are public by design (static hosting): the Supabase anon key is
// a public key, and the AMap key is restricted by its domain whitelist in the
// AMap console. The Supabase SERVICE key must NEVER appear in this folder
// (tests/check_soundmap.py fails the build if it does — it lives only in the
// gitignored scripts/.env).
// ============================================================================
window.SOUNDMAP_CONFIG = {
  // AMap console (lbs.amap.com) -> 应用管理 -> your Web端 (JS API) key
  AMAP_KEY: 'YOUR_AMAP_KEY',
  // The 安全密钥 shown next to the key (mandatory for keys issued after 2021-12)
  AMAP_SECURITY_CODE: 'YOUR_AMAP_SECURITY_CODE',
  // Supabase dashboard -> gear (Project Settings) -> Data API -> Project URL.
  // BARE origin only — no trailing slash, no /rest/v1/ (supabase-js appends
  // /rest/v1/ itself; including it yields https://host/rest/v1//rest/v1/...)
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY'
};
