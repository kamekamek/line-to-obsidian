import { logger } from 'firebase-functions';

/**
 * センシティブデータをマスキングする
 * @param data マスキングするデータ
 * @returns マスキングされたデータ
 */
export function sanitizeLogData(data: any): any {
  if (!data) return data;
  
  // マスキング対象のキー
  const sensitiveKeys = ['text', 'content', 'message', 'body', 'encryptedText'];
  
  // オブジェクトの場合は再帰的に処理
  if (typeof data === 'object' && !Array.isArray(data)) {
    const result = { ...data };
    
    for (const key of Object.keys(result)) {
      // キーが完全一致または部分一致する場合
      if (sensitiveKeys.includes(key) || sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        if (typeof result[key] === 'string') {
          // 最初の数文字だけ表示し、残りをマスク
          const preview = result[key].substring(0, 3);
          result[key] = `${preview}...（マスク）`;
        }
      } else if (typeof result[key] === 'object') {
        // オブジェクトの場合は再帰的に処理
        result[key] = sanitizeLogData(result[key]);
      }
    }
    
    return result;
  }
  
  // 配列の場合は各要素を処理
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }
  
  // プリミティブ値はそのまま返す
  return data;
}

/**
 * 安全なログ出力関数
 * @param level ログレベル ('info', 'warn', 'error', 'debug')
 * @param message ログメッセージ
 * @param data 追加データ（オプション）
 */
export function safeLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: any): void {
  // センシティブデータをマスキング
  const sanitizedData = sanitizeLogData(data);
  
  // ログレベルに応じて出力
  switch (level) {
    case 'info':
      logger.info(message, sanitizedData);
      break;
    case 'warn':
      logger.warn(message, sanitizedData);
      break;
    case 'error':
      logger.error(message, sanitizedData);
      break;
    case 'debug':
      logger.debug(message, sanitizedData);
      break;
    default:
      logger.log(message, sanitizedData);
  }
}
