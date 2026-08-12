import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  ADMIN_BOT_TOKEN: process.env.ADMIN_BOT_TOKEN || process.env.BOT_TOKEN || '',
  TELEGRAM_SECRET_TOKEN: process.env.TELEGRAM_SECRET_TOKEN || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_KEY || '',
  ADMIN_MASTER_CODE: process.env.ADMIN_MASTER_CODE || 'MASTERADMIN123',
};

export function validateEnv() {
  const required = ['BOT_TOKEN', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`[WARNING] Missing environment variables: ${missing.join(', ')}`);
  }
}
