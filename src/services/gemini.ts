import { GoogleGenAI, Type } from '@google/genai';
import { ENV } from '../config/env.js';
import { getWIBDateString } from '../utils/timezone.js';
import { sendProcessLogToAdmin } from '../utils/errorAlert.js';

export interface ParsedTransaction {
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  category: string;
  description: string | null;
  wallet: 'CASH' | 'BANK' | 'E_WALLET';
  financial_pillar: 'NEEDS' | 'WANTS' | 'SAVINGS';
  date: string;
  is_transfer_proof?: boolean;
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      enum: ['EXPENSE', 'INCOME'],
      description: 'Transaction type: EXPENSE or INCOME',
    },
    amount: {
      type: Type.NUMBER,
      description: 'Numeric amount without currency symbols or dots',
    },
    category: {
      type: Type.STRING,
      description: 'Category name (e.g. Makanan & Minuman, Transportasi, Belanja, Tagihan, Gaji, Transfer)',
    },
    description: {
      type: Type.STRING,
      description: 'Short transaction description',
    },
    wallet: {
      type: Type.STRING,
      enum: ['CASH', 'BANK', 'E_WALLET'],
      description: 'Payment wallet used: E_WALLET for GoPay/OVO/Dana/QRIS, BANK for Transfer/BCA/Mandiri/ATM, CASH for cash',
    },
    financial_pillar: {
      type: Type.STRING,
      enum: ['NEEDS', 'WANTS', 'SAVINGS'],
      description: 'Financial 50/30/20 pillar: NEEDS for basic living expenses/groceries/fuel/rent, WANTS for lifestyle/dining out/entertainment, SAVINGS for investments/deposits/emergency fund',
    },
    date: {
      type: Type.STRING,
      description: 'Date formatted YYYY-MM-DD',
    },
    is_transfer_proof: {
      type: Type.BOOLEAN,
      description: 'Set to true if this image is a bank transfer receipt / e-wallet transfer proof / QRIS payment receipt / M-banking success screen (bukti transfer/pembayaran). Set to false if it is a shopping receipt / nota belanja.',
    },
  },
  required: ['type', 'amount', 'category', 'description', 'wallet', 'financial_pillar', 'date', 'is_transfer_proof'],
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`API Call Timed Out after ${ms}ms`));
    }, ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

function getGeminiInstances(): GoogleGenAI[] {
  const raw = ENV.GEMINI_API_KEY || '';
  const keys = raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured in Environment Variables.');
  }

  return keys.map((key) => new GoogleGenAI({ apiKey: key }));
}

async function executeWithKeyFallback<T>(
  fn: (ai: GoogleGenAI, modelName: string) => Promise<T>,
  preferredModels: string[] = ['gemini-3.6-flash', 'gemini-2.0-flash'],
  timeoutPerAttemptMs: number = 9000
): Promise<{ result: T; durationMs: number; modelUsed: string }> {
  const instances = getGeminiInstances();
  const errors: string[] = [];
  const overallStart = Date.now();

  for (let i = 0; i < instances.length; i++) {
    for (const modelName of preferredModels) {
      const attemptStart = Date.now();
      try {
        const res = await withTimeout(fn(instances[i], modelName), timeoutPerAttemptMs);
        const durationMs = Date.now() - attemptStart;
        console.log(`[GEMINI SUCCESS] Model: ${modelName}, Key: ${i + 1}, Duration: ${durationMs}ms`);
        return { result: res, durationMs, modelUsed: modelName };
      } catch (error: any) {
        const attemptDuration = Date.now() - attemptStart;
        const errMsg = error?.message || String(error);
        errors.push(`[Key ${i + 1} | ${modelName} | ${attemptDuration}ms]: ${errMsg}`);
        console.warn(`[GEMINI FALLBACK] Key ${i + 1}, Model ${modelName} failed after ${attemptDuration}ms: ${errMsg}. Trying next model/key...`);
      }
    }
  }

  const overallDuration = Date.now() - overallStart;
  const primaryError = errors[0] || 'Unknown Gemini error';
  throw new Error(`Gemini API call failed for all keys/models after ${overallDuration}ms. Primary error: ${primaryError}`);
}

export function encodeCompactTx(tx: ParsedTransaction): string {
  const typeChar = tx.type === 'INCOME' ? 'I' : 'E';
  const walletChar = tx.wallet === 'E_WALLET' ? 'E' : tx.wallet === 'BANK' ? 'B' : 'C';
  const pillarChar = tx.financial_pillar === 'WANTS' ? 'W' : tx.financial_pillar === 'SAVINGS' ? 'S' : 'N';
  const dateCompact = (tx.date || getWIBDateString()).replace(/-/g, '');
  const categoryShort = (tx.category || 'Umum').replace(/\|/g, '').slice(0, 14);
  const descShort = (tx.description || '').replace(/\|/g, '').slice(0, 12);

  return `${typeChar}|${tx.amount}|${walletChar}|${pillarChar}|${dateCompact}|${categoryShort}|${descShort}`;
}

export function decodeCompactTx(compactStr: string): ParsedTransaction {
  if (compactStr.startsWith('{') || compactStr.length > 60) {
    try {
      const jsonStr = Buffer.from(compactStr, 'base64').toString('utf-8');
      return JSON.parse(jsonStr);
    } catch {}
  }

  const [typeChar, amountStr, walletChar, pillarChar, dateCompact, category, description] = compactStr.split('|');

  const type = typeChar === 'I' ? 'INCOME' : 'EXPENSE';
  const wallet = walletChar === 'E' ? 'E_WALLET' : walletChar === 'B' ? 'BANK' : 'CASH';
  const financial_pillar = pillarChar === 'W' ? 'WANTS' : pillarChar === 'S' ? 'SAVINGS' : 'NEEDS';

  let date = getWIBDateString();
  if (dateCompact && dateCompact.length === 8) {
    const year = dateCompact.slice(0, 4);
    const month = dateCompact.slice(4, 6);
    const day = dateCompact.slice(6, 8);
    date = `${year}-${month}-${day}`;
  }

  return {
    type,
    amount: parseFloat(amountStr) || 0,
    wallet,
    financial_pillar,
    date,
    category: category || 'Umum',
    description: description || null,
  };
}

export async function parseTransactionFromText(text: string): Promise<ParsedTransaction> {
  const currentDateStr = getWIBDateString();
  const prompt = `Anda adalah asisten AI keuangan pribadi. Ekstrak data transaksi dari teks berikut ke dalam format JSON:
{
  "type": "EXPENSE" atau "INCOME",
  "amount": angka nominal tanpa simbol Rp atau titik,
  "category": "nama kategori (misal: Transfer, Makanan & Minuman, Tagihan, Belanja, Umum)",
  "description": "deskripsi singkat",
  "wallet": "CASH" atau "BANK" atau "E_WALLET",
  "financial_pillar": "NEEDS" atau "WANTS" atau "SAVINGS",
  "date": "YYYY-MM-DD",
  "is_transfer_proof": false
}
Tanggal Hari Ini: ${currentDateStr} (WIB UTC+7). Jika pengguna tidak menyebutkan tanggal spesifik, gunakan tanggal hari ini (${currentDateStr}).
Input Teks Pengguna: "${text}"
Jawab HANYA dengan JSON valid.`;

  const { result, durationMs, modelUsed } = await executeWithKeyFallback(
    async (ai, modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error('Gemini returned an empty response.');
      }

      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned) as ParsedTransaction;

      return {
        type: parsed.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        amount: Number(parsed.amount) || 0,
        category: parsed.category || 'Umum',
        description: parsed.description || null,
        wallet: parsed.wallet === 'E_WALLET' ? 'E_WALLET' : parsed.wallet === 'CASH' ? 'CASH' : 'BANK',
        financial_pillar: parsed.financial_pillar === 'WANTS' ? 'WANTS' : parsed.financial_pillar === 'SAVINGS' ? 'SAVINGS' : 'NEEDS',
        date: parsed.date || currentDateStr,
        is_transfer_proof: Boolean(parsed.is_transfer_proof),
      } as ParsedTransaction;
    },
    ['gemini-3.6-flash', 'gemini-2.0-flash'],
    9000
  );

  sendProcessLogToAdmin(
    'Teks Transaksi',
    durationMs,
    `Model: <code>${modelUsed}</code> | Input: "${text.slice(0, 35)}${text.length > 35 ? '...' : ''}"`
  ).catch(() => {});

  return result;
}

export async function parseTransactionFromImage(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<ParsedTransaction> {
  const currentDateStr = getWIBDateString();
  const prompt = `Anda adalah OCR & vision parser AI keuangan. Analisis gambar ini. 
1. Tentukan apakah gambar ini adalah BUKTI TRANSFER BANK / E-WALLET / QRIS (is_transfer_proof: true), ATAU STRUK/NOTA BELANJAAN biasa (is_transfer_proof: false).
2. Ekstrak data transaksi ke dalam format JSON berikut:
{
  "type": "EXPENSE" atau "INCOME",
  "amount": nominal angka tanpa simbol Rp atau titik,
  "category": "nama kategori (misal: Transfer, Makanan & Minuman, Tagihan, Belanja, Umum)",
  "description": "deskripsi singkat transaksi",
  "wallet": "CASH" atau "BANK" atau "E_WALLET",
  "financial_pillar": "NEEDS" atau "WANTS" atau "SAVINGS",
  "date": "YYYY-MM-DD",
  "is_transfer_proof": true atau false
}
Tanggal Hari Ini: ${currentDateStr} (WIB UTC+7). Jika tanggal tidak terdeteksi, gunakan ${currentDateStr}.
Jawab HANYA dengan JSON valid.`;

  const { result, durationMs, modelUsed } = await executeWithKeyFallback(
    async (ai, modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBuffer.toString('base64'),
            },
          },
          prompt,
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const rawText = response.text;
      if (!rawText) {
        throw new Error('Gemini OCR returned an empty response.');
      }

      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned) as ParsedTransaction;

      return {
        type: parsed.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        amount: Number(parsed.amount) || 0,
        category: parsed.category || 'Umum',
        description: parsed.description || null,
        wallet: parsed.wallet === 'E_WALLET' ? 'E_WALLET' : parsed.wallet === 'CASH' ? 'CASH' : 'BANK',
        financial_pillar: parsed.financial_pillar === 'WANTS' ? 'WANTS' : parsed.financial_pillar === 'SAVINGS' ? 'SAVINGS' : 'NEEDS',
        date: parsed.date || currentDateStr,
        is_transfer_proof: Boolean(parsed.is_transfer_proof),
      } as ParsedTransaction;
    },
    ['gemini-3.6-flash', 'gemini-2.0-flash'],
    12000
  );

  const kbSize = (imageBuffer.length / 1024).toFixed(1);
  sendProcessLogToAdmin(
    'OCR Struk Foto',
    durationMs,
    `Model: <code>${modelUsed}</code> | Size: ${kbSize} KB`
  ).catch(() => {});

  return result;
}

export async function generateAIInsight(summaryData: string): Promise<string> {
  const prompt = `Anda adalah seorang Penasihat Keuangan Profesional (*AI Financial Advisor*). Berikan 3 rekomendasi ringkas, konkret, dan aksi nyata berdasarkan data ringkasan pengeluaran pengguna bulan ini berikut:

${summaryData}

Format jawaban dalam bentuk pesan Telegram dengan emoji yang menarik dan mudah dibaca. Maksimal 3 poin rekomendasi.`;

  const { result, durationMs, modelUsed } = await executeWithKeyFallback(
    async (ai, modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          temperature: 0.7,
        },
      });

      return response.text || 'Tidak dapat menghasilkan insight finansial saat ini.';
    },
    ['gemini-3.6-flash', 'gemini-2.0-flash'],
    9000
  );

  sendProcessLogToAdmin(
    'AI Financial Insight',
    durationMs,
    `Model: <code>${modelUsed}</code>`
  ).catch(() => {});

  return result;
}
