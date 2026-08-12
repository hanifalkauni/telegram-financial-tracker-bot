import { createClient } from '@supabase/supabase-js';
import { ENV } from '../config/env.js';

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_KEY) {
  console.warn('[SUPABASE] Warning: SUPABASE_URL or SUPABASE_KEY is missing.');
}

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);

export interface UserRecord {
  id: number;
  telegram_id: number;
  name: string | null;
  is_activated: boolean;
  is_admin: boolean;
  trial_transactions_left: number;
  active_until: string | null;
  monthly_budget: number | null;
  ratio_needs: number;
  ratio_wants: number;
  ratio_savings: number;
  activated_at: string | null;
  created_at: string;
}

export interface ConfirmationCodeRecord {
  id: string;
  code: string;
  duration_days: number | null;
  created_by: number | null;
  created_at: string;
  is_used: boolean;
  used_by: number | null;
  used_at: string | null;
}

export interface TransactionRecord {
  id: string;
  user_id: number;
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  category: string;
  description: string | null;
  wallet: 'CASH' | 'BANK' | 'E_WALLET';
  financial_pillar: 'NEEDS' | 'WANTS' | 'SAVINGS';
  transaction_date: string;
  created_at: string;
}

export interface RecurringTransactionRecord {
  id: string;
  user_id: number;
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  category: string;
  description: string;
  wallet: 'CASH' | 'BANK' | 'E_WALLET';
  financial_pillar: 'NEEDS' | 'WANTS' | 'SAVINGS';
  due_day: number;
  is_active: boolean;
  created_at: string;
}
