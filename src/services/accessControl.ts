import { supabase, UserRecord } from '../db/supabase.js';
import { ENV } from '../config/env.js';

export interface UserAccessState {
  user: UserRecord;
  canProcess: boolean;
  statusType: 'ADMIN' | 'ACTIVE_SUBSCRIBER' | 'FREE_TRIAL' | 'EXPIRED';
  message?: string;
}

export async function getOrCreateUser(telegramId: number, name?: string): Promise<UserRecord> {
  const { data: existing } = await supabase.from('users').select('*').eq('telegram_id', telegramId).single();

  if (existing) {
    if (name && existing.name !== name) {
      await supabase.from('users').update({ name }).eq('telegram_id', telegramId);
    }
    return existing as UserRecord;
  }

  // Create new user with 5 free trial transactions
  const { data: newUser, error } = await supabase
    .from('users')
    .insert([
      {
        telegram_id: telegramId,
        name: name || 'User',
        is_activated: false,
        is_admin: false,
        trial_transactions_left: 5,
        active_until: null,
      },
    ])
    .select('*')
    .single();

  if (error || !newUser) {
    throw new Error(`Failed to register user in Supabase: ${error?.message}`);
  }

  return newUser as UserRecord;
}

export async function checkUserAccess(telegramId: number, name?: string): Promise<UserAccessState> {
  const user = await getOrCreateUser(telegramId, name);

  // 1. Admin Status
  if (user.is_admin) {
    return { user, canProcess: true, statusType: 'ADMIN' };
  }

  // 2. Active Subscription
  if (user.is_activated) {
    if (user.active_until === null) {
      // Lifetime subscription
      return { user, canProcess: true, statusType: 'ACTIVE_SUBSCRIBER' };
    }
    const expiryDate = new Date(user.active_until);
    if (expiryDate > new Date()) {
      return { user, canProcess: true, statusType: 'ACTIVE_SUBSCRIBER' };
    }
  }

  // 3. Free Trial Mode
  if (user.trial_transactions_left > 0) {
    return { user, canProcess: true, statusType: 'FREE_TRIAL' };
  }

  // 4. Expired Trial & Subscription
  return {
    user,
    canProcess: false,
    statusType: 'EXPIRED',
    message: `🎁 **Masa Free Trial 5 Transaksi Gratis Anda Telah Habis**\n\nUntuk membuka akses penuh tanpa batas, silakan masukkan **Kode Konfirmasi Berlangganan** dari Admin, atau ketik /subscribe untuk menghubungi Admin.`,
  };
}

export async function redeemMasterCode(user: UserRecord): Promise<string> {
  await supabase
    .from('users')
    .update({
      is_activated: true,
      is_admin: true,
      active_until: null,
      activated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  return `🎉 **Selamat! Anda telah terverifikasi sebagai Admin Seumur Hidup!**\n\n👑 Untuk mengelola sistem & menerima laporan error/tiket langganan, silakan buka **Admin Bot** dan tekan tombol /start 1 kali.`;
}

export async function redeemConfirmationCode(user: UserRecord, codeInput: string): Promise<string> {
  const cleanCode = codeInput.trim().toUpperCase();

  const { data: codeRecord } = await supabase
    .from('confirmation_codes')
    .select('*')
    .eq('code', cleanCode)
    .eq('is_used', false)
    .single();

  if (!codeRecord) {
    return `⚠️ Kode Konfirmasi \`${cleanCode}\` tidak ditemukan atau sudah pernah digunakan. Ketik /subscribe untuk meminta kode ke Admin.`;
  }

  let newActiveUntil: string | null = null;

  if (codeRecord.duration_days && codeRecord.duration_days > 0) {
    const now = new Date();
    // If current subscription is still active, extend from active_until
    let baseDate = now;
    if (user.active_until && new Date(user.active_until) > now) {
      baseDate = new Date(user.active_until);
    }
    baseDate.setDate(baseDate.getDate() + codeRecord.duration_days);
    newActiveUntil = baseDate.toISOString();
  }

  // Update Code Status
  await supabase
    .from('confirmation_codes')
    .update({
      is_used: true,
      used_by: user.id,
      used_at: new Date().toISOString(),
    })
    .eq('id', codeRecord.id);

  // Update User Status
  await supabase
    .from('users')
    .update({
      is_activated: true,
      active_until: newActiveUntil,
      activated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  const durationText = newActiveUntil
    ? `s/d ${new Date(newActiveUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Seumur Hidup (Lifetime)';

  return `🎉 **Kode Konfirmasi Berhasil Diaktivasi!**\n\n✅ Status Akun: Berlangganan Aktif\n📅 Masa Aktif: ${durationText}\n\nTerima kasih telah berlangganan Financial Tracker Bot!`;
}
