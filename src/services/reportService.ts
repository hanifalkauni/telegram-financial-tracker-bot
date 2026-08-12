import { supabase, TransactionRecord, UserRecord } from '../db/supabase.js';
import { formatRupiah, getWIBMonthRange, getWIBWeekRange } from '../utils/timezone.js';

export interface RekapReport {
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  healthScoreText: string;
  walletBreakdown: { CASH: number; BANK: number; E_WALLET: number };
  pillarBreakdown: { NEEDS: number; WANTS: number; SAVINGS: number };
  categoryBreakdown: Array<{ category: string; amount: number; percentage: number }>;
  userBudget: number | null;
  budgetPercentage: number | null;
}

export async function getRekapReport(userId: number, rangeType: 'MONTH' | 'WEEK' | 'CUSTOM', customStart?: string, customEnd?: string): Promise<RekapReport> {
  let startDate = '';
  let endDate = '';

  if (rangeType === 'MONTH') {
    const range = getWIBMonthRange();
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (rangeType === 'WEEK') {
    const range = getWIBWeekRange();
    startDate = range.startDate;
    endDate = range.endDate;
  } else if (customStart && customEnd) {
    startDate = customStart;
    endDate = customEnd;
  }

  // Fetch transactions for user within date range
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate);

  const txList = (transactions as TransactionRecord[]) || [];

  let totalIncome = 0;
  let totalExpense = 0;

  const walletBreakdown = { CASH: 0, BANK: 0, E_WALLET: 0 };
  const pillarBreakdown = { NEEDS: 0, WANTS: 0, SAVINGS: 0 };
  const categoryMap = new Map<string, number>();

  txList.forEach((t) => {
    const amount = Number(t.amount);
    if (t.type === 'INCOME') {
      totalIncome += amount;
    } else {
      totalExpense += amount;

      // Category breakdown for expense
      const currentCatAmount = categoryMap.get(t.category) || 0;
      categoryMap.set(t.category, currentCatAmount + amount);

      // Wallet breakdown
      if (t.wallet in walletBreakdown) {
        walletBreakdown[t.wallet] += amount;
      }

      // Pillar breakdown
      if (t.financial_pillar in pillarBreakdown) {
        pillarBreakdown[t.financial_pillar] += amount;
      }
    }
  });

  const netBalance = totalIncome - totalExpense;

  // Calculate Health Score
  let healthScoreText = '🟢 SEHAT (Tabungan Sehat)';
  if (totalIncome > 0) {
    const savingsRatio = (netBalance / totalIncome) * 100;
    if (savingsRatio >= 20) {
      healthScoreText = `🟢 SEHAT (Tabungan ${Math.round(savingsRatio)}%)`;
    } else if (savingsRatio >= 0) {
      healthScoreText = `🟡 WASPADA (Sisa Saldo Mepet ${Math.round(savingsRatio)}%)`;
    } else {
      healthScoreText = `🔴 DEFISIT (Pengeluaran Membengkak)`;
    }
  } else if (totalExpense > 0) {
    healthScoreText = `🔴 DEFISIT (Pengeluaran Tanpa Pemasukan)`;
  }

  // Category breakdown list
  const categoryBreakdown: Array<{ category: string; amount: number; percentage: number }> = [];
  categoryMap.forEach((amt, cat) => {
    const pct = totalExpense > 0 ? (amt / totalExpense) * 100 : 0;
    categoryBreakdown.push({ category: cat, amount: amt, percentage: Math.round(pct) });
  });
  categoryBreakdown.sort((a, b) => b.amount - a.amount);

  // User budget calculation
  const { data: userRecord } = await supabase.from('users').select('monthly_budget').eq('id', userId).single();
  const userBudget = userRecord?.monthly_budget ? Number(userRecord.monthly_budget) : null;
  const budgetPercentage = userBudget && userBudget > 0 ? Math.round((totalExpense / userBudget) * 100) : null;

  return {
    startDate,
    endDate,
    totalIncome,
    totalExpense,
    netBalance,
    healthScoreText,
    walletBreakdown,
    pillarBreakdown,
    categoryBreakdown,
    userBudget,
    budgetPercentage,
  };
}

export function formatRekapMessage(report: RekapReport, user: UserRecord): string {
  let catText = 'Belum ada pengeluaran.';
  if (report.categoryBreakdown.length > 0) {
    catText = report.categoryBreakdown.map((c) => `• ${c.category} : ${formatRupiah(c.amount)} (${c.percentage}%)`).join('\n');
  }

  const needsPct = report.totalExpense > 0 ? Math.round((report.pillarBreakdown.NEEDS / report.totalExpense) * 100) : 0;
  const wantsPct = report.totalExpense > 0 ? Math.round((report.pillarBreakdown.WANTS / report.totalExpense) * 100) : 0;
  const savingsPct = report.totalIncome > 0 ? Math.round((report.netBalance / report.totalIncome) * 100) : 0;

  const budgetText = report.userBudget ? `${formatRupiah(report.totalExpense)} / ${formatRupiah(report.userBudget)} (${report.budgetPercentage}%)` : 'Belum diatur (/budget)';

  return `📊 <b>Rekap Keuangan (${report.startDate} s/d ${report.endDate})</b>
━━━━━━━━━━━━━━━━━━━
🏥 <b>Kesehatan</b>   : ${report.healthScoreText}
📥 <b>Pemasukan</b>   : ${formatRupiah(report.totalIncome)}
📤 <b>Pengeluaran</b> : ${formatRupiah(report.totalExpense)}
💰 <b>Saldo Net</b>   : ${formatRupiah(report.netBalance)}

⚖️ <b>Rasio Keuangan (Target: ${user.ratio_needs}/${user.ratio_wants}/${user.ratio_savings}):</b>
• 🏠 NEEDS   : ${formatRupiah(report.pillarBreakdown.NEEDS)} (${needsPct}% / Target ${user.ratio_needs}%)
• 🍿 WANTS   : ${formatRupiah(report.pillarBreakdown.WANTS)} (${wantsPct}% / Target ${user.ratio_wants}%)
• 🏦 SAVINGS : ${formatRupiah(report.netBalance)} (${savingsPct}% / Target ${user.ratio_savings}%)

💳 <b>Rincian Per Dompet:</b>
• 💵 Cash     : ${formatRupiah(report.walletBreakdown.CASH)}
• 🏦 Bank     : ${formatRupiah(report.walletBreakdown.BANK)}
• 📱 E-Wallet : ${formatRupiah(report.walletBreakdown.E_WALLET)}

📊 <b>Breakdown Pengeluaran:</b>
${catText}

🎯 <b>Status Budget</b>: ${budgetText}
━━━━━━━━━━━━━━━━━━━`;
}
