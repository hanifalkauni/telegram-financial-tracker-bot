# Telegram AI Financial Tracker Bot

🤖 AI-powered personal financial assistant bot for Telegram built with Node.js, TypeScript, Telegraf.js, Google Gemini API (`gemini-2.5-flash`), and Supabase PostgreSQL.

---

## ⚡ Features

- **AI Natural Text & OCR Vision Parsing**: Extract expenses and income automatically from natural Indonesian text or receipt images.
- **Visual Financial Health Score**: Real-time spending health indicators (🟢 Healthy, 🟡 Warning, 🔴 Deficit).
- **Customizable Financial Ratio (50/30/20)**: Track Needs, Wants, and Savings ratio according to user preference (`/ratio`).
- **Payment Wallet Tracking**: Automatically categorizes transactions by Cash, Bank, or E-Wallet.
- **AI Financial Advisor**: Get 3 actionable financial recommendations on-demand (`/insight`).
- **Recurring Monthly Bills**: Manage fixed monthly expenses (`/rutin`).
- **Data Export**: Export monthly financial reports to CSV/Excel format (`/export`).
- **Stateless Vercel Serverless Architecture**: Fast, scalable serverless function deployment.

---

## 🚀 Quick Setup & Deployment

### 1. Database Setup (Supabase)
Execute the SQL migration script located in `src/db/schema.sql` inside your Supabase SQL Editor to create the required tables (`users`, `confirmation_codes`, `transactions`, `recurring_transactions`).

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your credentials:
```env
BOT_TOKEN=your_telegram_bot_token
ADMIN_BOT_TOKEN=your_admin_bot_token
TELEGRAM_SECRET_TOKEN=your_secret_token
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_key
ADMIN_MASTER_CODE=your_master_admin_code
```

### 3. Deploy to Vercel
1. Connect this repository to Vercel.
2. Set Environment Variables in Vercel project settings.
3. Deploy and configure Telegram Webhook:
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-app.vercel.app/api/webhook&secret_token=<YOUR_SECRET_TOKEN>`

---

## 📄 License
[MIT](LICENSE)
