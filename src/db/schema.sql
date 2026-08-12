-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    name VARCHAR(255),
    is_activated BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    trial_transactions_left INTEGER DEFAULT 5,
    active_until TIMESTAMPTZ NULL,
    monthly_budget NUMERIC NULL,
    ratio_needs INTEGER DEFAULT 50 CHECK (ratio_needs >= 0 AND ratio_needs <= 100),
    ratio_wants INTEGER DEFAULT 30 CHECK (ratio_wants >= 0 AND ratio_wants <= 100),
    ratio_savings INTEGER DEFAULT 20 CHECK (ratio_savings >= 0 AND ratio_savings <= 100),
    activated_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Confirmation Codes Table
CREATE TABLE IF NOT EXISTS confirmation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) UNIQUE NOT NULL,
    duration_days INTEGER DEFAULT 30,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_used BOOLEAN DEFAULT FALSE,
    used_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ NULL
);

-- 3. Create Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
    amount NUMERIC(15, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT NULL,
    wallet VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (wallet IN ('CASH', 'BANK', 'E_WALLET')),
    financial_pillar VARCHAR(20) NOT NULL DEFAULT 'NEEDS' CHECK (financial_pillar IN ('NEEDS', 'WANTS', 'SAVINGS')),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Recurring Transactions Table
CREATE TABLE IF NOT EXISTS recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('EXPENSE', 'INCOME')),
    amount NUMERIC(15, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    wallet VARCHAR(20) NOT NULL DEFAULT 'BANK' CHECK (wallet IN ('CASH', 'BANK', 'E_WALLET')),
    financial_pillar VARCHAR(20) NOT NULL DEFAULT 'NEEDS' CHECK (financial_pillar IN ('NEEDS', 'WANTS', 'SAVINGS')),
    due_day INTEGER NOT NULL CHECK (due_day >= 1 AND due_day <= 31),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;

-- Indexing for Query Performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_confirmation_codes_code ON confirmation_codes(code);
CREATE INDEX IF NOT EXISTS idx_recurring_user_due ON recurring_transactions(user_id, due_day);
