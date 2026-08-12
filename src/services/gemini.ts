import { GoogleGenAI, Type } from '@google/genai';
import { ENV } from '../config/env.js';
import { getWIBDateString } from '../utils/timezone.js';

export interface ParsedTransaction {
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  category: string;
  description: string;
  wallet: 'CASH' | 'BANK' | 'E_WALLET';
  financial_pillar: 'NEEDS' | 'WANTS' | 'SAVINGS';
  date: string;
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
      description: 'Category name (e.g. Makanan & Minuman, Transportasi, Belanja, Tagihan, Gaji)',
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
  },
  required: ['type', 'amount', 'category', 'description', 'wallet', 'financial_pillar', 'date'],
};

function getGeminiInstances(): GoogleGenAI[] {
  const raw = ENV.GEMINI_API_KEY || '';
  const keys = raw.split(',').map((k) => k.trim()).filter((k) => k.length > 0);

  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured in Environment Variables.');
  }

  return keys.map((key) => new GoogleGenAI({ apiKey: key }));
}

async function executeWithKeyFallback<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const instances = getGeminiInstances();
  let lastError: any = null;

  for (let i = 0; i < instances.length; i++) {
    try {
      return await fn(instances[i]);
    } catch (error: any) {
      console.warn(`[GEMINI KEY FALLBACK] Key ${i + 1}/${instances.length} rate limited or failed: ${error?.message || error}. Trying next key...`);
      lastError = error;
    }
  }

  throw lastError || new Error('All configured Gemini API keys failed.');
}

export async function parseTransactionFromText(text: string): Promise<ParsedTransaction> {
  const currentDateStr = getWIBDateString();
  const prompt = `Anda adalah asisten AI keuangan pribadi. Ekstrak data transaksi dari teks berikut ke dalam format JSON sesuai schema.
Tanggal Hari Ini: ${currentDateStr} (WIB UTC+7). Jika pengguna tidak menyebutkan tanggal spesifik, gunakan tanggal hari ini (${currentDateStr}).

Input Teks Pengguna: "${text}"`;

  return executeWithKeyFallback(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error('Gemini returned an empty response.');
    }

    return JSON.parse(rawJson) as ParsedTransaction;
  });
}

export async function parseTransactionFromImage(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<ParsedTransaction> {
  const currentDateStr = getWIBDateString();
  const prompt = `Anda adalah OCR & vision parser AI keuangan. Ekstrak total nominal belanja, kategori, deskripsi, metode pembayaran, dan tanggal dari foto struk/nota belanja ini ke dalam format JSON terstruktur.
Tanggal Hari Ini: ${currentDateStr} (WIB UTC+7). Jika tanggal tidak terdeteksi di struk, gunakan ${currentDateStr}.`;

  return executeWithKeyFallback(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error('Gemini OCR returned an empty response.');
    }

    return JSON.parse(rawJson) as ParsedTransaction;
  });
}

export async function generateAIInsight(summaryData: string): Promise<string> {
  const prompt = `Anda adalah seorang Penasihat Keuangan Profesional (*AI Financial Advisor*). Berikan 3 rekomendasi ringkas, konkret, dan aksi nyata berdasarkan data ringkasan pengeluaran pengguna bulan ini berikut:

${summaryData}

Format jawaban dalam bentuk pesan Telegram dengan emoji yang menarik dan mudah dibaca. Maksimal 3 poin rekomendasi.`;

  return executeWithKeyFallback(async (ai) => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });

    return response.text || 'Tidak dapat menghasilkan insight finansial saat ini.';
  });
}
