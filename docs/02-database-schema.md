# Module 2: Database Schema & Migration SQL

## 1. Database Schema Specifications (Supabase PostgreSQL)

### Table: `users`
- `id` (BIGINT, Primary Key, Generated)
- `telegram_id` (BIGINT, Unique, Not Null)
- `name` (VARCHAR, Nullable)
- `is_activated` (BOOLEAN, Default `FALSE`)
- `is_admin` (BOOLEAN, Default `FALSE`)
- `trial_transactions_left` (INTEGER, Default `5`) -> *Kuota transaksi gratis trial (default 5x)*
- `active_until` (TIMESTAMPTZ, Nullable) -> *Tanggal berakhir masa langganan (NULL = Lifetime/Unlimited)*
- `monthly_budget` (NUMERIC, Nullable) -> *Batas budget bulanan pengguna*
- `ratio_needs` (INTEGER, Default `50`) -> *Target rasio Kebutuhan Pokok (%)*
- `ratio_wants` (INTEGER, Default `30`) -> *Target rasio Keinginan/Gaya Hidup (%)*
- `ratio_savings` (INTEGER, Default `20`) -> *Target rasio Tabungan/Investasi (%)*
- `activated_at` (TIMESTAMPTZ, Nullable)
- `created_at` (TIMESTAMPTZ, Default NOW())

### Table: `confirmation_codes`
- `id` (UUID, Primary Key, Default `gen_random_uuid()`)
- `code` (VARCHAR(10), Unique, Not Null)
- `duration_days` (INTEGER, Nullable, Default `30`) -> *Durasi aktif (hari). Jika NULL atau 0 = Masa aktif seumur hidup (Lifetime)*
- `created_by` (BIGINT, Foreign Key -> `users.id`)
- `created_at` (TIMESTAMPTZ, Default NOW())
- `is_used` (BOOLEAN, Default `FALSE`)
- `used_by` (BIGINT, Nullable, Foreign Key -> `users.id`)
- `used_at` (TIMESTAMPTZ, Default NOW())

### Table: `transactions`
- `id` (UUID, Primary Key, Default `gen_random_uuid()`)
- `user_id` (BIGINT, Foreign Key -> `users.id`)
- `type` (VARCHAR, Not Null) -> `'EXPENSE'` | `'INCOME'`
- `amount` (NUMERIC, Not Null)
- `category` (VARCHAR, Not Null)
- `description` (TEXT, Nullable)
- `wallet` (VARCHAR, Default `'CASH'`) -> `'CASH'` | `'BANK'` | `'E_WALLET'`
- `financial_pillar` (VARCHAR(20), Default `'NEEDS'`) -> `'NEEDS'` | `'WANTS'` | `'SAVINGS'`
- `transaction_date` (DATE, Not Null)
- `created_at` (TIMESTAMPTZ, Default NOW())

### Table: `recurring_transactions`
- `id` (UUID, Primary Key, Default `gen_random_uuid()`)
- `user_id` (BIGINT, Foreign Key -> `users.id`)
- `type` (VARCHAR, Not Null) -> `'EXPENSE'` | `'INCOME'`
- `amount` (NUMERIC, Not Null)
- `category` (VARCHAR, Not Null)
- `description` (TEXT, Not Null)
- `wallet` (VARCHAR, Default `'BANK'`) -> `'CASH'` | `'BANK'` | `'E_WALLET'`
- `financial_pillar` (VARCHAR(20), Default `'NEEDS'`) -> `'NEEDS'` | `'WANTS'` | `'SAVINGS'`
- `due_day` (INTEGER, Not Null) -> *Tanggal jatuh tempo bulanan (1 - 31)*
- `is_active` (BOOLEAN, Default `TRUE`)
- `created_at` (TIMESTAMPTZ, Default NOW())

---

## 2. SQL DDL Migration Script

```sql
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

-- Indexing for Query Performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_confirmation_codes_code ON confirmation_codes(code);
CREATE INDEX IF NOT EXISTS idx_recurring_user_due ON recurring_transactions(user_id, due_day);
```
