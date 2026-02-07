import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

export interface MediaInfo {
  type: 'audio' | 'image' | 'document';
  description: string;
  metadata?: any;
}

/**
 * 核心媒体分析器：在 AI 介入前预先探测文件内容，确保流程透明且不崩溃
 */
export async function analyzeMedia(filePath: string): Promise<MediaInfo | null> {
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  
  logger.info({ filePath }, '--- [MEDIA ANALYSIS START] ---');

  try {
    // 1. 处理音频消息 (OGG/MP3/WAV)
    if (ext === '.ogg' || ext === '.wav' || ext === '.mp3') {
      logger.info('Analyzing Audio via ffprobe...');
      // 修复：使用更稳健的命令和字符串处理，避免换行符引发的解析错误
      const probe = execSync(`ffprobe -v error -show_entries format=duration,bit_rate -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf-8' });
      const parts = probe.trim().split(/\s+/);
      const duration = parts[0];
      const bitrate = parts[1];
      
      const info: MediaInfo = {
        type: 'audio',
        description: `这是一段时长约为 ${Math.round(Number(duration))} 秒的语音消息。`,
        metadata: { duration, bitrate }
      };
      
      logger.info({ info }, '[MEDIA ANALYSIS RESULT] Audio metadata extracted');
      return info;
    }

    // 2. 处理图片消息
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      logger.info('Analyzing Image via Native OCR...');
      
      let ocrText = '';
      try {
        // 调用 macOS 原生 OCR (Vision Framework)
        ocrText = execSync(`python3 src/native-ocr.py "${filePath}"`, { encoding: 'utf-8' }).trim();
      } catch (err) {
        logger.warn({ err }, 'Native OCR failed, falling back to stats only');
      }

      const stats = fs.statSync(filePath);
      const info: MediaInfo = {
        type: 'image',
        description: ocrText 
          ? `这是一张图片，包含以下 OCR 文本内容：\n--- START OCR ---\n${ocrText}\n--- END OCR ---`
          : `这是一张大小为 ${(stats.size / 1024).toFixed(1)} KB 的图片文件（未识别到文字）。`,
      };
      
      logger.info({ ocrTextLength: ocrText.length }, '[MEDIA ANALYSIS RESULT] Image analyzed');
      return info;
    }

  } catch (err) {
    logger.error({ err, filePath }, '[MEDIA ANALYSIS FAILED]');
  }

  return null;
}