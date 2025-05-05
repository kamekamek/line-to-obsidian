import { Request, Response } from 'express';
import { logger } from 'firebase-functions';

// IPアドレスごとのリクエスト数を追跡
const ipRequestCounts = new Map<string, { count: number, timestamp: number }>();

/**
 * IPベースのレート制限をチェック
 * @param req リクエストオブジェクト
 * @param res レスポンスオブジェクト
 * @returns 制限内の場合はtrue、制限超過の場合はfalse
 */
export function checkIpRateLimit(req: Request, res: Response): boolean {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分間
  const maxRequests = 100; // 1分間に許可するリクエスト数
  
  // IPアドレスのリクエスト情報を取得または初期化
  const ipData = ipRequestCounts.get(ip as string) || { count: 0, timestamp: now };
  
  // 時間枠をリセット
  if (now - ipData.timestamp > windowMs) {
    ipData.count = 0;
    ipData.timestamp = now;
  }
  
  // リクエスト数をインクリメント
  ipData.count++;
  ipRequestCounts.set(ip as string, ipData);
  
  // 制限を超えた場合は429エラーを返す
  if (ipData.count > maxRequests) {
    logger.warn(`Rate limit exceeded for IP: ${ip}`);
    res.status(429).send('Too Many Requests');
    return false;
  }
  
  return true;
}

// 定期的にIPリクエストカウントをクリーンアップ（メモリリーク防止）
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分間
  
  for (const [ip, data] of ipRequestCounts.entries()) {
    if (now - data.timestamp > windowMs * 5) { // 5分以上経過したエントリを削除
      ipRequestCounts.delete(ip);
    }
  }
}, 10 * 60 * 1000); // 10分ごとにクリーンアップ
