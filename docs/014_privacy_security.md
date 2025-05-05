# プライバシー保護とセキュリティ強化計画

このドキュメントでは、LINE to Obsidianプラグインのプライバシー保護とセキュリティを強化するための詳細な計画を記述します。

## 1. 現状の課題

### 1.1 プライバシーに関する課題

1. **メッセージの平文保存**:
   - LINEから送信されたメッセージがFirestoreに平文で保存されている
   - ログにメッセージ内容が記録される可能性がある

2. **データ保持期間**:
   - 同期完了後のデータ削除が確実に行われているか不明確
   - 古いデータのクリーンアップポリシーが不十分

3. **ユーザーデータの管理**:
   - ユーザーが自分のデータを削除する手段が限られている
   - データ利用に関する明確なポリシーが不足

### 1.2 セキュリティに関する課題

1. **認証の脆弱性**:
   - 単純なBearer認証トークンに依存
   - トークンの有効期限や更新メカニズムがない

2. **DDoS脆弱性**:
   - Webhook URLに対するレート制限が不十分
   - 大量リクエストによるサービス妨害の可能性

3. **署名検証の緩さ**:
   - 開発環境では署名検証をスキップする実装がある
   - 本番環境でも署名検証が不十分な可能性

4. **Firestoreセキュリティ**:
   - セキュリティルールの厳格さが不十分
   - 不正アクセスのリスクが残る

## 2. プライバシー保護強化計画

### 2.1 データ暗号化の実装

#### 実装方針
1. **保存時の暗号化**:
   ```typescript
   // 暗号化関数
   async function encryptMessage(message: string, userId: string): Promise<string> {
     // ユーザーごとに一意の暗号化キーを生成（または取得）
     const encryptionKey = await getOrCreateEncryptionKey(userId);
     
     // AES-GCM暗号化を使用
     const iv = crypto.randomBytes(16);
     const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
     
     let encrypted = cipher.update(message, 'utf8', 'base64');
     encrypted += cipher.final('base64');
     
     // 認証タグを取得
     const authTag = cipher.getAuthTag();
     
     // IV、暗号文、認証タグを結合して返す
     return iv.toString('base64') + ':' + encrypted + ':' + authTag.toString('base64');
   }
   
   // 復号関数
   async function decryptMessage(encryptedData: string, userId: string): Promise<string> {
     const [ivBase64, encryptedText, authTagBase64] = encryptedData.split(':');
     
     const iv = Buffer.from(ivBase64, 'base64');
     const authTag = Buffer.from(authTagBase64, 'base64');
     const encryptionKey = await getEncryptionKey(userId);
     
     const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
     decipher.setAuthTag(authTag);
     
     let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
     decrypted += decipher.final('utf8');
     
     return decrypted;
   }
   ```

2. **Firestoreスキーマの更新**:
   ```typescript
   // 暗号化されたメモの保存
   async function saveEncryptedNote(lineUserId: string, text: string): Promise<void> {
     const encryptedText = await encryptMessage(text, lineUserId);
     
     await db.collection('notes').add({
       lineUserId,
       encryptedText,  // 平文の代わりに暗号化テキストを保存
       isEncrypted: true,  // 暗号化フラグ
       createdAt: admin.firestore.FieldValue.serverTimestamp(),
       synced: false,
     });
   }
   ```

3. **syncNotes関数の更新**:
   ```typescript
   // 暗号化されたメモの取得と復号
   const encryptedNotes = await db.collection('notes')
     .where('lineUserId', '==', lineUserId)
     .where('synced', '==', false)
     .where('createdAt', '>', new Date(since))
     .get();
   
   const decryptedNotes = await Promise.all(encryptedNotes.docs.map(async doc => {
     const data = doc.data();
     let text = data.text;
     
     // 暗号化されている場合は復号
     if (data.isEncrypted && data.encryptedText) {
       text = await decryptMessage(data.encryptedText, lineUserId);
     }
     
     return {
       id: doc.id,
       text,
       timestamp: data.createdAt.toDate().getTime()
     };
   }));
   ```

### 2.2 ログマスキングの実装

1. **ログ出力関数の作成**:
   ```typescript
   function safeLog(level: string, message: string, data?: any): void {
     // センシティブデータをマスキング
     const sanitizedData = sanitizeLogData(data);
     logger[level](message, sanitizedData);
   }
   
   function sanitizeLogData(data: any): any {
     if (!data) return data;
     
     const sensitiveKeys = ['text', 'content', 'message', 'body', 'encryptedText'];
     const result = {...data};
     
     for (const key of sensitiveKeys) {
       if (result[key] && typeof result[key] === 'string') {
         // 最初の数文字だけ表示し、残りをマスク
         const preview = result[key].substring(0, 3);
         result[key] = `${preview}...（マスク）`;
       }
     }
     
     return result;
   }
   ```

2. **既存ログの置き換え**:
   ```typescript
   // 変更前
   logger.info('Request body', { body: requestBody.substring(0, 100) + '...' });
   
   // 変更後
   safeLog('info', 'Request body received', { bodyLength: requestBody.length });
   ```

### 2.3 データ削除の確認と強化

1. **同期後の即時削除確認**:
   ```typescript
   // 同期後の削除処理を確実に実行
   async function markNotesAsSynced(noteIds: string[]): Promise<void> {
     const batch = db.batch();
     
     for (const noteId of noteIds) {
       // 削除オプションが有効な場合は削除、そうでなければフラグ更新
       if (IMMEDIATE_DELETE_AFTER_SYNC) {
         batch.delete(db.collection('notes').doc(noteId));
       } else {
         batch.update(db.collection('notes').doc(noteId), { 
           synced: true,
           syncedAt: admin.firestore.FieldValue.serverTimestamp()
         });
       }
     }
     
     await batch.commit();
     logger.info(`Processed ${noteIds.length} notes after sync`);
   }
   ```

2. **クリーンアップジョブの強化**:
   ```typescript
   // 定期的なクリーンアップジョブ
   export const cleanupData = onSchedule({
     schedule: 'every 24 hours',
     region: 'asia-northeast1',
     memory: '256MiB',
   }, async (context) => {
     try {
       // 1. 同期済みメモの削除（30日以上経過）
       const oldSyncedNotes = await db.collection('notes')
         .where('synced', '==', true)
         .where('syncedAt', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
         .get();
       
       // バッチ処理で削除
       const noteBatch = db.batch();
       oldSyncedNotes.docs.forEach(doc => {
         noteBatch.delete(doc.ref);
       });
       await noteBatch.commit();
       
       // 2. 古い接続コードの削除（90日以上経過）
       // 3. 未使用マッピングの削除（180日以上未使用）
       
       logger.info('Cleanup completed', {
         deletedNotes: oldSyncedNotes.size,
         // その他の削除数
       });
     } catch (error) {
       logger.error('Cleanup error:', error);
     }
   });
   ```

## 3. セキュリティ強化計画

### 3.1 DDoS対策の実装

1. **レート制限の設定**:
   ```typescript
   // Firebase Functions V2の設定でレート制限を追加
   export const lineWebhook = onRequest(
     { 
       region: 'asia-northeast1',
       cors: true,
       timeoutSeconds: 60,
       maxInstances: 10,
       memory: '256MiB',
       secrets: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET'],
       // レート制限の追加
       rateLimit: {
         maxConcurrentRequests: 50,
         maxRequestsPerMinute: 300,
       }
     }, 
     async (req, res) => {
       // 既存の処理
     }
   );
   ```

2. **IPベースのレート制限（追加対策）**:
   ```typescript
   // IPアドレスごとのリクエスト数を追跡
   const ipRequestCounts = new Map<string, { count: number, timestamp: number }>();
   
   // リクエスト処理前にIPベースのレート制限をチェック
   function checkIpRateLimit(req: Request, res: Response): boolean {
     const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
     const now = Date.now();
     const windowMs = 60 * 1000; // 1分間
     const maxRequests = 100; // 1分間に許可するリクエスト数
     
     // IPアドレスのリクエスト情報を取得または初期化
     const ipData = ipRequestCounts.get(ip) || { count: 0, timestamp: now };
     
     // 時間枠をリセット
     if (now - ipData.timestamp > windowMs) {
       ipData.count = 0;
       ipData.timestamp = now;
     }
     
     // リクエスト数をインクリメント
     ipData.count++;
     ipRequestCounts.set(ip, ipData);
     
     // 制限を超えた場合は429エラーを返す
     if (ipData.count > maxRequests) {
       res.status(429).send('Too Many Requests');
       return false;
     }
     
     return true;
   }
   ```

### 3.2 LINE署名検証の厳格化

1. **署名検証の強化**:
   ```typescript
   // 開発環境でもスキップしない厳格な署名検証
   function validateLineSignature(req: Request, res: Response): boolean {
     const signature = req.headers['x-line-signature'] as string;
     if (!signature) {
       logger.error('Missing LINE signature');
       res.status(401).send('Missing signature');
       return false;
     }
     
     const requestBody = JSON.stringify(req.body);
     
     try {
       const isValid = line.validateSignature(requestBody, config.channelSecret, signature);
       if (!isValid) {
         logger.error('Invalid LINE signature');
         res.status(401).send('Invalid signature');
         return false;
       }
       
       return true;
     } catch (error) {
       logger.error('Signature verification error:', error);
       res.status(401).send('Signature verification error');
       return false;
     }
   }
   ```

### 3.3 認証の強化

1. **JWTトークンの実装**:
   ```typescript
   // JWTトークン生成
   function generateJwtToken(lineUserId: string): string {
     const payload = {
       sub: lineUserId,
       iat: Math.floor(Date.now() / 1000),
       exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30日間有効
     };
     
     return jwt.sign(payload, JWT_SECRET_KEY, { algorithm: 'HS256' });
   }
   
   // JWTトークン検証
   function verifyJwtToken(token: string): { valid: boolean, lineUserId?: string } {
     try {
       const decoded = jwt.verify(token, JWT_SECRET_KEY) as { sub: string };
       return { valid: true, lineUserId: decoded.sub };
     } catch (error) {
       logger.error('JWT verification error:', error);
       return { valid: false };
     }
   }
   ```

2. **トークン更新メカニズム**:
   ```typescript
   // トークン更新エンドポイント
   export const refreshToken = onRequest(
     {
       region: 'asia-northeast1',
       cors: true,
     },
     async (req, res) => {
       try {
         const oldToken = req.headers.authorization?.split('Bearer ')[1];
         if (!oldToken) {
           res.status(401).json({ success: false, error: 'Missing token' });
           return;
         }
         
         // 古いトークンを検証
         const { valid, lineUserId } = verifyJwtToken(oldToken);
         if (!valid || !lineUserId) {
           res.status(401).json({ success: false, error: 'Invalid token' });
           return;
         }
         
         // 新しいトークンを生成
         const newToken = generateJwtToken(lineUserId);
         
         res.status(200).json({
           success: true,
           token: newToken,
         });
       } catch (error) {
         logger.error('Token refresh error:', error);
         res.status(500).json({ success: false, error: 'Internal server error' });
       }
     }
   );
   ```

## 4. エラーハンドリングの改善

### 4.1 ユーザーフレンドリーなエラーメッセージ

1. **エラーメッセージのマッピング**:
   ```typescript
   // エラーコードとユーザーフレンドリーなメッセージのマッピング
   const errorMessages = {
     'auth/invalid-token': '認証トークンが無効です。LINEで再度「#登録」コマンドを実行して新しいトークンを取得してください。',
     'firestore/not-found': 'メモが見つかりませんでした。LINEで新しいメモを送信してみてください。',
     'network/timeout': 'サーバーとの通信がタイムアウトしました。インターネット接続を確認して再試行してください。',
     'line/webhook-error': 'LINEサーバーとの通信に問題が発生しました。しばらく待ってから再試行してください。',
     'default': '予期しないエラーが発生しました。問題が続く場合は、開発者にお問い合わせください。'
   };
   
   // エラーコードからユーザーフレンドリーなメッセージを取得
   function getUserFriendlyErrorMessage(error: any): string {
     const errorCode = error.code || 'default';
     return errorMessages[errorCode] || errorMessages['default'];
   }
   ```

### 4.2 再試行メカニズム

1. **再試行ロジックの実装**:
   ```typescript
   // 再試行可能な関数を実行
   async function executeWithRetry<T>(
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
           throw error;
         }
         
         // 一時的なエラーでない場合は再試行しない
         if (!isRetryableError(error)) {
           throw error;
         }
         
         // 待機時間を計算（指数バックオフ）
         delay = Math.min(delay * options.backoffFactor, options.maxDelayMs);
         
         // 待機
         await new Promise(resolve => setTimeout(resolve, delay));
       }
     }
   }
   
   // 再試行可能なエラーかどうかを判定
   function isRetryableError(error: any): boolean {
     // ネットワークエラー、タイムアウト、一時的なサーバーエラーなど
     return (
       error.code === 'ECONNRESET' ||
       error.code === 'ETIMEDOUT' ||
       error.code === 'ECONNREFUSED' ||
       (error.response && (error.response.status === 429 || error.response.status === 503))
     );
   }
   ```

## 5. 実装計画

### 5.1 優先順位

1. **最優先（セキュリティクリティカル）**:
   - LINE署名検証の厳格化
   - ログマスキングの実装
   - DDoS対策の実装

2. **高優先（プライバシー保護）**:
   - データ暗号化の実装
   - 同期後の即時削除確認
   - ユーザーフレンドリーなエラーメッセージ

3. **中優先（機能強化）**:
   - JWTトークンの実装
   - クリーンアップジョブの強化
   - 再試行メカニズム

### 5.2 テスト計画

1. **セキュリティテスト**:
   - 署名検証のバイパス試行
   - 不正なトークンでのアクセス試行
   - レート制限の有効性確認

2. **プライバシーテスト**:
   - 暗号化・復号の正確性確認
   - ログ出力のマスキング確認
   - データ削除の確実性確認

3. **機能テスト**:
   - エラー発生時のユーザー体験確認
   - 再試行メカニズムの動作確認
   - トークン更新の動作確認

### 5.3 ドキュメント計画

1. **プライバシーポリシーの作成**
2. **セキュリティ対策の説明資料**
3. **エラー対応ガイド**
4. **開発者向け実装ガイド**
