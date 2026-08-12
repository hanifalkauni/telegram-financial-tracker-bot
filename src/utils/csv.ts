import { stringify } from 'csv-stringify/sync';
import { TransactionRecord } from '../db/supabase.js';
import { formatRupiah } from './timezone.js';

export function generateCSVBuffer(transactions: TransactionRecord[]): Buffer {
  const records = transactions.map((t) => [
    t.transaction_date,
    t.type,
    formatRupiah(t.amount),
    t.category,
    t.description || '-',
    t.wallet,
    t.financial_pillar,
  ]);

  const csvString = stringify(records, {
    header: true,
    columns: ['Tanggal', 'Tipe', 'Nominal', 'Kategori', 'Deskripsi', 'Dompet', 'Pilar Keuangan'],
  });

  return Buffer.from(csvString, 'utf-8');
}
