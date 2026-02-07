import * as lark from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';
import { 
  DATA_DIR,
  LARK_APP_ID, 
  LARK_APP_SECRET 
} from './config.js';
import { logger } from './logger.js';
import { NewMessage } from './types.js';

export class LarkConnector {
  private client: lark.Client;
  private wsClient: lark.WSClient | null = null;

  constructor(private onMessageCallback: (msg: NewMessage) => Promise<void>) {
    this.client = new lark.Client({
      appId: LARK_APP_ID,
      appSecret: LARK_APP_SECRET,
      disableTokenCache: false,
    });
  }

  async start() {
    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        const { message, sender } = data;
        if (!message || !sender) return;
        if (sender.sender_type === 'bot') return;

        const messageId = message.message_id;
        const msgType = (message as any).msg_type;
        const chatId = message.chat_id.trim();
        let content = '';
        let attachments: string[] = [];

        try {
          const parsedContent = JSON.parse(message.content);
          
          if (msgType === 'text') {
            content = parsedContent.text || '';
          } else if (msgType === 'image') {
            content = '[IMAGE]';
            await this.downloadResource(messageId, parsedContent.image_key, 'image', `image_${messageId}.jpg`);
          } else if (msgType === 'audio') {
            content = '[AUDIO]';
            await this.downloadResource(messageId, parsedContent.file_key, 'file', `voice_${messageId}.ogg`);
          } else if (msgType === 'media') {
            content = '[VIDEO]';
            await this.downloadResource(messageId, parsedContent.file_key, 'file', `video_${messageId}.mp4`);
          } else if (msgType === 'file') {
            const fileName = parsedContent.file_name || 'file';
            content = `[DOCUMENT: ${fileName}]`;
            await this.downloadResource(messageId, parsedContent.file_key, 'file', `doc_${messageId}_${fileName}`);
          }
        } catch (e) {
          logger.error({ e, messageId }, 'Failed to parse Lark message content');
          content = message.content;
        }

        const msg: NewMessage = {
          id: messageId,
          chat_jid: `lark@${chatId}`,
          sender: sender.sender_id?.open_id || 'unknown',
          sender_name: 'Lark User',
          content: content,
          timestamp: new Date(parseInt(message.create_time)).toISOString(),
          from_me: false,
        };

        await this.onMessageCallback(msg);
      },
    });

    this.wsClient = new lark.WSClient({
      appId: LARK_APP_ID,
      appSecret: LARK_APP_SECRET,
      logger: logger as any,
    });

    await this.wsClient.start({ eventDispatcher });
    logger.info('✓ Lark Long-Connection (WebSocket) started successfully with Multimodal Support');
  }

  private async downloadResource(messageId: string, fileKey: string, type: 'image' | 'file', targetName: string) {
    const mediaDir = path.join(DATA_DIR, 'media');
    if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
    const targetPath = path.join(mediaDir, targetName);

    try {
      logger.info({ messageId, type, targetName }, 'Downloading Lark resource...');
      const response = await this.client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type: type },
      });

      // response is a stream in the Lark Node.js SDK for this endpoint
      const writer = fs.createWriteStream(targetPath);
      // @ts-ignore
      response.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          logger.info({ targetPath }, 'Lark resource saved');
          resolve(targetPath);
        });
        writer.on('error', (err) => {
          logger.error({ err, messageId }, 'Failed to write Lark resource');
          reject(err);
        });
      });
    } catch (err) {
      logger.error({ err, messageId }, 'Failed to download Lark resource');
    }
  }

  async sendMessage(chatJid: string, text: string, options: { filePath?: string, ptt?: boolean, quoted?: any } = {}) {
    const chatId = chatJid.replace('lark@', '');
    
    try {
      if (options.filePath && fs.existsSync(options.filePath)) {
        const ext = path.extname(options.filePath).toLowerCase();
        
        if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
          const imageKey = await this.uploadImage(options.filePath);
          if (imageKey) {
            await this.client.im.message.create({
              params: { receive_id_type: 'chat_id' },
              data: {
                receive_id: chatId,
                msg_type: 'image',
                content: JSON.stringify({ image_key: imageKey }),
              },
            });
          }
        } else {
          const fileKey = await this.uploadFile(options.filePath);
          if (fileKey) {
            await this.client.im.message.create({
              params: { receive_id_type: 'chat_id' },
              data: {
                receive_id: chatId,
                msg_type: 'file',
                content: JSON.stringify({ file_key: fileKey }),
              },
            });
          }
        }
      }

      if (text && !text.includes('__SILENT_FINISH__')) {
        await this.client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text: text }),
          },
        });
      }
    } catch (err) {
      logger.error({ err, chatJid }, 'Failed to send Lark message');
    }
  }

  private async uploadImage(filePath: string): Promise<string | null> {
    try {
      const response = await this.client.im.image.create({
        data: {
          image_type: 'message',
          image: fs.createReadStream(filePath),
        },
      });
      return response?.image_key || null;
    } catch (err) {
      logger.error({ err, filePath }, 'Lark image upload failed');
      return null;
    }
  }

  private async uploadFile(filePath: string): Promise<string | null> {
    try {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      let fileType: "pdf" | "stream" | "opus" | "mp4" | "doc" | "xls" | "ppt" = "stream";
      
      if (ext === 'pdf') fileType = "pdf";
      else if (ext === 'doc' || ext === 'docx') fileType = "doc";
      else if (ext === 'xls' || ext === 'xlsx') fileType = "xls";
      else if (ext === 'ppt' || ext === 'pptx') fileType = "ppt";
      else if (ext === 'mp4') fileType = "mp4";
      else if (ext === 'opus') fileType = "opus";

      const response = await this.client.im.file.create({
        data: {
          file_type: fileType,
          file_name: path.basename(filePath),
          file: fs.createReadStream(filePath),
        },
      });
      return response?.file_key || null;
    } catch (err) {
      logger.error({ err, filePath }, 'Lark file upload failed');
      return null;
    }
  }
}