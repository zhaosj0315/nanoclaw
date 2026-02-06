import * as lark from '@larksuiteoapi/node-sdk';
import fs from 'fs';
import path from 'path';
import { 
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
    // 初始化事件分发器
    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        const { message, sender } = data;
        if (!message || !sender) return;

        // 忽略机器人自己的消息
        if (sender.sender_type === 'bot') return;

        let content = '';
        try {
          const parsedContent = JSON.parse(message.content);
          content = parsedContent.text || '';
        } catch (e) {
          content = message.content;
        }

        const msg: NewMessage = {
          id: message.message_id,
          chat_jid: `lark@${message.chat_id}`,
          sender: sender.sender_id?.open_id || 'unknown',
          sender_name: 'Lark User',
          content: content,
          timestamp: new Date(parseInt(message.create_time)).toISOString(),
          from_me: false,
        };

        await this.onMessageCallback(msg);
      },
    });

    // --- 修正：长连接模式启动参数 ---
    this.wsClient = new lark.WSClient({
      appId: LARK_APP_ID,
      appSecret: LARK_APP_SECRET,
      logger: logger as any,
    });

    // eventDispatcher 需要传递给 start 方法，而不是构造函数
    await this.wsClient.start({
      eventDispatcher: eventDispatcher
    });

    logger.info('✓ Lark Long-Connection (WebSocket) started successfully');
    logger.info('  No public URL or domain required.');
  }

  async sendMessage(chatJid: string, text: string, options: { filePath?: string, quoted?: any } = {}) {
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

      if (text) {
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