/**
 * WhatsApp Authentication Script with Retry Logic
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
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  if (state.creds.registered) {
    console.log('✓ Already authenticated with WhatsApp');
    process.exit(0);
  }

  console.log('Starting WhatsApp authentication...\n');

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['NanoClaw Desktop', 'Desktop', '1.0.0'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('Scan this QR code with WhatsApp:\n');
      console.log('  1. Open WhatsApp on your phone');
      console.log('  2. Tap Settings → Linked Devices → Link a Device');
      console.log('  3. Point your camera at the QR code below\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const reason = (lastDisconnect?.error as any)?.output?.statusCode;
      console.log(`\nConnection closed. Reason: ${reason}`);

      if (reason === DisconnectReason.loggedOut) {
        console.log('✗ Logged out. Delete store/auth and try again.');
        process.exit(1);
      } else if (reason === 515) {
        console.log(
          '✗ Error 515: Rate limited or server issue. Wait 5 minutes and try again.',
        );
        process.exit(1);
      } else {
        console.log('✗ Connection failed. Please try again.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      console.log('\n✓ Successfully authenticated with WhatsApp!');
      setTimeout(() => process.exit(0), 1000);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

authenticate().catch((err) => {
  console.error('Authentication failed:', err.message);
  process.exit(1);
});
