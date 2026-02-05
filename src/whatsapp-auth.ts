/**
 * WhatsApp Authentication Script
 *
 * Run this during setup to authenticate with WhatsApp.
 * Supports QR code and Pairing Code (requires phone number).
 *
 * Usage: 
 *   QR Mode: npx tsx src/whatsapp-auth.ts
 *   Pairing Mode: npx tsx src/whatsapp-auth.ts 861234567890
 */
import fs from 'fs';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';

const AUTH_DIR = './store/auth';

const logger = pino({
  level: 'warn',
});

async function authenticate(): Promise<void> {
  const phoneNumber = process.argv[2]; // Optional phone number for pairing code
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  if (state.creds.registered) {
    console.log('✓ Already authenticated with WhatsApp');
    console.log('  To re-authenticate, delete the store/auth folder and run again.');
    process.exit(0);
  }

  console.log('Starting WhatsApp authentication...');
  if (phoneNumber) {
    console.log(`> Pairing mode for: ${phoneNumber}`);
  } else {
    console.log('> QR Code mode');
  }
  console.log('');

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['NanoClaw', 'Chrome', '1.0.0'],
  });

  if (phoneNumber && !state.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log('====================================');
        console.log('  YOUR PAIRING CODE:');
        console.log(`  > ${code} <`);
        console.log('====================================');
        console.log('How to use:');
        console.log('1. Open WhatsApp -> Settings -> Linked Devices');
        console.log('2. Tap "Link a Device" -> "Link with phone number instead"');
        console.log(`3. Enter the code above on your phone.`);
      } catch (err: any) {
        console.error('Failed to request pairing code:', err.message);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !phoneNumber) {
      console.log('Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      if (reason === DisconnectReason.loggedOut) {
        console.log('\n✗ Logged out. Delete store/auth and try again.');
        process.exit(1);
      } else {
        console.log('\n✗ Connection failed. Please try again.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      console.log('\n✓ Successfully authenticated with WhatsApp!');
      console.log('  Credentials saved to store/auth/');
      setTimeout(() => process.exit(0), 1000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

authenticate().catch((err) => {
  console.error('Authentication failed:', err.message);
  process.exit(1);
});