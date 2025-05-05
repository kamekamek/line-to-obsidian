import { logger } from 'firebase-functions';

/**
 * エラーコードとユーザーフレンドリーなメッセージのマッピング
 */
export const errorMessages: Record<string, string> = {
  'auth/invalid-token': '認証トークンが無効です。LINEで再度「#登録」コマンドを実行して新しいトークンを取得してください。',
  'firestore/not-found': 'メモが見つかりませんでした。LINEで新しいメモを送信してみてください。',
  'network/timeout': 'サーバーとの通信がタイムアウトしました。インターネット接続を確認して再試行してください。',
  'line/webhook-error': 'LINEサーバーとの通信に問題が発生しました。しばらく待ってから再試行してください。',
  'encryption/key-error': '暗号化キーの取得に失敗しました。セキュリティ上の理由により、LINEで再度「#登録」コマンドを実行してください。',
  'encryption/decrypt-error': 'メッセージの復号に失敗しました。セキュリティ上の理由により、LINEで再度メッセージを送信してください。',
  'default': '予期しないエラーが発生しました。問題が続く場合は、開発者にお問い合わせください。'
};

/**
 * エラーコードからユーザーフレンドリーなメッセージを取得
 * @param error エラーオブジェクト
 * @returns ユーザーフレンドリーなエラーメッセージ
 */
export function getUserFriendlyErrorMessage(error: any): string {
  // エラーコードを取得
  const errorCode = error.code || 
                   (error.message && error.message.includes('timeout') ? 'network/timeout' : 'default');
  
  // マッピングからメッセージを取得、なければデフォルトメッセージ
  return errorMessages[errorCode] || errorMessages['default'];
}

/**
 * 再試行可能なエラーかどうかを判定
 * @param error エラーオブジェクト
 * @returns 再試行可能な場合はtrue
 */
export function isRetryableError(error: any): boolean {
  // ネットワークエラー、タイムアウト、一時的なサーバーエラーなど
  return (
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNREFUSED' ||
    (error.response && (error.response.status === 429 || error.response.status === 503)) ||
    (error.message && (
      error.message.includes('timeout') ||
      error.message.includes('network') ||
      error.message.includes('connection')
    ))
  );
}

/**
 * 再試行可能な関数を実行
 * @param fn 実行する関数
 * @param options 再試行オプション
 * @returns 関数の実行結果
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number,
    initialDelayMs: number,
    maxDelayMs: number,
    backoffFactor: number
  }
): Promise<T> {
  let retries = 0;
  let delay = options.initialDelayMs;
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      
      // 最大再試行回数を超えた場合はエラーをスロー
      if (retries > options.maxRetries) {
        logger.error(`Max retries (${options.maxRetries}) exceeded:`, error);
        throw error;
      }
      
      // 一時的なエラーでない場合は再試行しない
      if (!isRetryableError(error)) {
        logger.error('Non-retryable error:', error);
        throw error;
      }
      
      // 待機時間を計算（指数バックオフ）
      delay = Math.min(delay * options.backoffFactor, options.maxDelayMs);
      
      logger.info(`Retrying operation (${retries}/${options.maxRetries}) after ${delay}ms delay`);
      
      // 待機
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
