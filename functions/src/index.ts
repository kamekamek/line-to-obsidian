import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as line from '@line/bot-sdk';
import express from 'express';
import cors from 'cors';
import { Request, Response } from 'express';
// ユーティリティのインポート
import { encryptMessage, decryptMessage } from './utils/encryption';
import { safeLog, sanitizeLogData } from './utils/logging';
import { executeWithRetry, getUserFriendlyErrorMessage } from './utils/error-handling';
import { checkIpRateLimit } from './utils/rate-limit';

// Firebaseの初期化
admin.initializeApp();
const db = admin.firestore();

// LINE Bot設定を環境変数から取得
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'dummy_token_for_testing',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'dummy_secret_for_testing',
};

// LINE Bot設定のログ記録（デバッグ用）
logger.info('LINE Bot config initialized', {
  hasToken: !!config.channelAccessToken,
  hasSecret: !!config.channelSecret,
  isProduction: process.env.NODE_ENV === 'production'
});

// LINEクライアントの初期化（エミュレータ環境でも動作するように）
let lineClient: line.Client | any;
try {
  logger.info('Initializing LINE client with config', {
    hasToken: !!config.channelAccessToken,
    hasSecret: !!config.channelSecret,
    tokenFirstChars: config.channelAccessToken ? config.channelAccessToken.substring(0, 5) + '...' : 'none',
    tokenLength: config.channelAccessToken ? config.channelAccessToken.length : 0
  });

  if (!config.channelAccessToken || config.channelAccessToken === 'dummy_token_for_testing') {
    throw new Error('LINE Channel Access Token is not properly configured');
  }

  lineClient = new line.Client(config);

  // テスト用の簡易メッセージ送信
  /*
  // 実際のリクエストではなくログのみ出力する場合はコメントアウトを外す
  lineClient.pushMessage('testuser', {
    type: 'text',
    text: 'LINE Client test message'
  }).then(() => {
    logger.info('Test LINE message sent successfully');
  }).catch(err => {
    logger.warn('Test LINE message failed', err);
  });
  */

  logger.log('LINE Client initialized successfully');
} catch (error) {
  logger.error('LINE Client initialization failed', {
    error: error,
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
    errorName: error instanceof Error ? error.name : 'Unknown error type'
  });

  // モッククライアントを作成
  lineClient = {
    replyMessage: async (replyToken: string, message: any) => {
      logger.info('[MOCK] LINE message reply called', { replyToken, message });
      logger.warn('Using mock LINE client - message will not be sent to LINE');
      return Promise.resolve(null);
    },
    pushMessage: async (userId: string, message: any) => {
      logger.info('[MOCK] LINE push message called', { userId, message });
      logger.warn('Using mock LINE client - message will not be sent to LINE');
      return Promise.resolve(null);
    }
  };
  logger.warn('Using mock LINE client instead of real client');
}

// Express アプリケーションのセットアップ
const app = express();
app.use(cors());
app.use(express.json());

// メインアプリケーションのルート
app.get('/', (req: Request, res: Response) => {
  res.status(200).send('LINE to Obsidian API is running!');
});

/**
 * LINE Webhookエンドポイント
 * メッセージを受信して処理する
 */
app.post('/lineWebhook', async (req: Request, res: Response) => {
  logger.info('lineWebhook function called');

  try {
    // 署名検証
    const signature = req.headers['x-line-signature'] as string;
    if (!signature) {
      logger.error('Missing LINE signature');
      res.status(401).send('Missing signature');
      return;
    }

    // リクエストボディをJSON文字列に変換
    const requestBody = JSON.stringify(req.body);
    logger.info('Request body', { body: requestBody.substring(0, 100) + '...' });

    // 署名検証をスキップする（テスト用）
    if (process.env.NODE_ENV === 'production') {
      if (!line.validateSignature(requestBody, config.channelSecret, signature)) {
        logger.error('Invalid LINE signature');
        res.status(401).send('Invalid signature');
        return;
      }
    } else {
      logger.warn('Skipping signature verification in non-production environment');
    }

    // すぐに200 OKを返す（タイムアウト防止のため最優先）
    res.status(200).send('OK');

    // 以降の処理はバックグラウンドで実行
    const events: line.WebhookEvent[] = req.body.events || [];
    logger.info(`Processing ${events.length} events`);

    // 各イベントを非同期で処理（結果を待たない）
    events.forEach(event => {
      processEvent(event).catch(err => {
        logger.error(`Event processing error for event: ${JSON.stringify(event)}`, err);
      });
    });

    return; // 明示的に関数を終了する
  } catch (error) {
    logger.error('Error in webhook handler:', error);
    // まだレスポンスを送信していない場合のみ
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
    return; // 明示的に関数を終了する
  }
});

/**
 * イベント処理関数（バックグラウンド処理用）
 */
async function processEvent(event: line.WebhookEvent): Promise<void> {
  try {
    // メッセージイベントのみ処理
    if (event.type !== 'message' || event.message.type !== 'text') {
      logger.info('Event is not a text message', { eventType: event.type });
      return;
    }

    const { text } = event.message;
    const { userId } = event.source;
    const replyToken = event.replyToken;

    logger.info('Processing message event', { text, userId, replyToken });

    if (!userId) {
      logger.error('User ID not found');
      return;
    }

    // "#登録" コマンドの処理
    if (text.trim() === '#登録') {
      logger.info('Processing registration command');

      try {
        const mappingId = await handleRegistration(userId);
        logger.info('Registration successful', { mappingId, userId });

        // マッピング情報を取得して短縮コードを取得
        const mappingDoc = await db.collection('mappings').doc(mappingId).get();
        const mappingData = mappingDoc.data();
        const connectionCode = mappingData?.connectionCode || '';

        const responseMessage = {
          type: 'text',
          text: `登録が完了しました。これからメモを送ると自動的にObsidianに同期できるようになります。\n\n接続コード: ${connectionCode}\n認証トークン: ${mappingId}\n\nObsidianプラグインの設定画面で接続コードと認証トークンを入力してください。`,
        };

        logger.info('Sending registration response', {
          connectionCode,
          mappingId,
          replyToken,
          responseMessage: JSON.stringify(responseMessage)
        });

        // 応答処理をtry-catchで囲む
        try {
          await lineClient.replyMessage(replyToken, responseMessage);
          logger.info('Registration response sent successfully');
        } catch (replyError) {
          logger.error('Failed to send LINE reply message', {
            error: replyError,
            errorMessage: replyError instanceof Error ? replyError.message : 'Unknown error',
            responseMessage: JSON.stringify(responseMessage)
          });
        }

        return;
      } catch (regError) {
        logger.error('Error in registration process', regError);
        throw regError;
      }
    }

    // 通常のメッセージをメモとして保存
    logger.info('Saving note', { userId, textLength: text.length });
    await saveNote(userId, text);

    logger.info('Sending save confirmation');
    try {
      await lineClient.replyMessage(replyToken, {
        type: 'text',
        text: 'メモを保存しました。Obsidianプラグインで同期するとノートとして表示されます。',
      });
      logger.info('Save confirmation sent successfully');
    } catch (replyError) {
      logger.error('Failed to send save confirmation', {
        error: replyError,
        errorMessage: replyError instanceof Error ? replyError.message : 'Unknown error'
      });
    }
  } catch (error) {
    logger.error(`Error processing event ${event.type}:`, error);
    throw error; // 上位の処理で捕捉できるようにエラーを再スロー
  }
}

/**
 * 短縮コード生成関数
 * @returns 生成された短縮コード
 */
function generateShortCode(): string {
  // 6文字のランダム英数字コードを生成
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const length = 6;

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters.charAt(randomIndex);
  }

  return result;
}

/**
 * 短縮コード生成と保存処理
 * @returns 生成された短縮コード
 */
async function createConnectionCode(): Promise<string> {
  try {
    // プロジェクトIDを取得
    const projectId = process.env.GCLOUD_PROJECT || '';

    // 短縮コードを生成
    let shortCode = generateShortCode();
    let attempts = 0;
    const maxAttempts = 5;

    // コードの重複チェックと再生成（必要に応じて）
    while (attempts < maxAttempts) {
      const codeDoc = await db.collection('connection_codes').doc(shortCode).get();
      if (!codeDoc.exists) {
        break;
      }
      shortCode = generateShortCode();
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error('短縮コードの生成に失敗しました。');
    }

    // Firestoreに保存
    await db.collection('connection_codes').doc(shortCode).set({
      projectId,
      projectName: 'LINE to Obsidian Sync',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: null,  // 有効期限なし（必要に応じて設定可能）
    });

    logger.info(`Connection code created: ${shortCode} for project: ${projectId}`);
    return shortCode;
  } catch (error) {
    logger.error('Connection code creation error:', error);
    throw error;
  }
}

/**
 * ユーザー登録処理
 * @param lineUserId LINE UserID
 * @returns mappingId 生成されたマッピングID
 */
async function handleRegistration(lineUserId: string): Promise<string> {
  try {
    // 既存のマッピングを検索
    const existingMappingsQuery = await db.collection('mappings')
      .where('lineUserId', '==', lineUserId)
      .get();

    // 既存のマッピングを削除（バッチ処理）
    if (!existingMappingsQuery.empty) {
      const batch = db.batch();
      existingMappingsQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      logger.info(`Deleted ${existingMappingsQuery.size} existing mappings for user: ${lineUserId}`);
    }

    // ユニークなマッピングIDを生成
    const mappingId = admin.firestore().collection('mappings').doc().id;

    // 短縮コードを生成（接続用）
    const connectionCode = await createConnectionCode();

    // マッピング情報をFirestoreに保存
    await db.collection('mappings').doc(mappingId).set({
      lineUserId,
      connectionCode,  // 短縮コードへの参照を追加
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`User registered: ${lineUserId} with mapping ID: ${mappingId} and connection code: ${connectionCode}`);
    return mappingId;
  } catch (error) {
    logger.error(`Registration error for user ${lineUserId}:`, error);
    throw error;
  }
}

/**
 * メモの保存処理
 * @param lineUserId LINE UserID
 * @param text メモ内容
 */
async function saveNote(lineUserId: string, text: string): Promise<void> {
  try {
    // メッセージを暗号化
    const encryptedText = await encryptMessage(text, lineUserId);

    // Firestoreに保存
    await db.collection('notes').add({
      lineUserId,
      encryptedText,  // 平文の代わりに暗号化テキストを保存
      isEncrypted: true,  // 暗号化フラグ
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      synced: false,
    });

    safeLog('info', `Note saved for user: ${lineUserId}`, { textLength: text.length });
  } catch (error) {
    safeLog('error', `Note saving error for user ${lineUserId}`, error);
    throw error;
  }
}

// V2形式でエンドポイントをエクスポート
// 注: Firebase Functions V2ではExpressアプリをリッスンさせる必要はない

// ポートリッスン設定（本番環境でのみリッスン）
// Firebase Functions V2では不要なのでコメントアウト
/*
const port = parseInt(process.env.PORT || '8080', 10);
// NODE_ENV=productionの場合のみリッスンする（デプロイ時やテスト時はリッスンしない）
if (process.env.NODE_ENV === 'production') {
  app.listen(port, '0.0.0.0', () => {
    logger.info(`Server listening on port ${port}`);
  });
}
*/

// LINE Webhook
export const lineWebhook = onRequest(
  {
    region: 'asia-northeast1',
    cors: true,
    timeoutSeconds: 60,
    maxInstances: 10,
    memory: '256MiB',
    secrets: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET'],
    // レート制限の追加（コメントアウト - V2形式では対応していない）
    /* rateLimit: {
      maxConcurrentRequests: 50,
      maxRequestsPerMinute: 300,
    } */
  },
  async (req: Request, res: Response) => {
    // 簡易的なヘルスチェック処理
    if (req.method === 'GET') {
      res.status(200).send('LINE to Obsidian Webhook is running!');
      return;
    }

    // POSTリクエスト以外は処理しない
    if (req.method !== 'POST') {
      safeLog('info', '非POSTリクエスト受信', { method: req.method });
      res.status(405).send('Method Not Allowed');
      return;
    }

    // IPベースのレート制限チェック
    if (!checkIpRateLimit(req, res)) {
      return; // レート制限超過の場合は処理を終了
    }

    // 受信ログ
    safeLog('info', 'Webhook received', {
      method: req.method,
      path: req.path,
      headers: sanitizeLogData(req.headers)
    });

    try {
      // リクエストボディをJSON文字列に変換
      const requestBody = JSON.stringify(req.body);
      safeLog('info', 'Request body received', { bodyLength: requestBody.length });

      // 署名検証の実行（厳格化）
      const signature = req.headers['x-line-signature'] as string;
      if (!signature) {
        safeLog('error', 'Missing LINE signature');
        res.status(401).send('Missing signature');
        return;
      }

      // 署名検証（開発環境でもスキップしない）
      try {
        const isValid = line.validateSignature(requestBody, config.channelSecret, signature);
        if (!isValid) {
          safeLog('error', 'Invalid LINE signature');
          res.status(401).send('Invalid signature');
          return;
        }
        safeLog('info', 'Signature verification successful');
      } catch (signError) {
        safeLog('error', 'Error during signature verification', {
          error: signError,
          errorMessage: signError instanceof Error ? signError.message : 'Unknown error'
        });
        res.status(401).send('Signature verification error');
        return;
      }

      // 即座に200 OKレスポンスを返す（重要）
      res.status(200).send('OK');

      // 以降の処理はバックグラウンドで実行
      const events: line.WebhookEvent[] = req.body.events || [];
      logger.info(`Processing ${events.length} events`);

      // リクエストの内容をログに表示（デバッグ用）
      if (events.length > 0) {
        logger.info('Event details', {
          firstEvent: JSON.stringify(events[0]),
          eventTypes: events.map(e => e.type).join(', ')
        });
      }

      // 各イベントを非同期で処理（結果を待たない）
      for (const event of events) {
        try {
          logger.info(`Processing event of type: ${event.type}`);
          await processEvent(event);
          logger.info(`Successfully processed event: ${event.type}`);
        } catch (err) {
          logger.error(`Event processing error for event: ${JSON.stringify(event)}`, err);
        }
      }

    } catch (error) {
      logger.error('Error processing webhook', error);
      // レスポンスがまだ送信されていない場合のみエラーレスポンスを返す
      if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
      }
    }
  }
);

// メモ同期API
export const syncNotes = onRequest(
  {
    region: 'asia-northeast1',
    cors: true,
    timeoutSeconds: 60,
    memory: '512MiB',
    // レート制限の追加（コメントアウト - V2形式では対応していない）
    /* rateLimit: {
      maxConcurrentRequests: 30,
      maxRequestsPerMinute: 200,
    } */
  },
  async (req: Request, res: Response) => {
    safeLog('info', 'syncNotes function called', { method: req.method, query: sanitizeLogData(req.query) });

    // CORS設定
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // OPTIONSリクエスト（プリフライトリクエスト）への応答
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // IPベースのレート制限チェック
    if (!checkIpRateLimit(req, res)) {
      return; // レート制限超過の場合は処理を終了
    }

    // 認証チェック
    const authHeader = req.headers.authorization;
    safeLog('info', 'Authorization header received', { hasAuth: !!authHeader });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const errorMessage = getUserFriendlyErrorMessage({ code: 'auth/invalid-token' });
      res.status(401).send(errorMessage);
      return;
    }

    try {
      // トークンからLineUserIdを取得（URLクエリパラメータまたはAuthorizationヘッダーから）
      const authTokenFromQuery = req.query.authToken as string || '';
      const authTokenFromHeader = authHeader.substring(7); // 'Bearer ' の後の部分

      const mappingId = authTokenFromQuery || authTokenFromHeader;
      safeLog('info', 'MappingId received', { hasMapping: !!mappingId });

      if (!mappingId) {
        const errorMessage = getUserFriendlyErrorMessage({ code: 'auth/invalid-token' });
        res.status(400).send(errorMessage);
        return;
      }

      // マッピング情報を取得して認証（リトライ機能付き）
      let mappingDoc;
      try {
        mappingDoc = await executeWithRetry(
          () => db.collection('mappings').doc(mappingId).get(),
          {
            maxRetries: 3,
            initialDelayMs: 500,
            maxDelayMs: 5000,
            backoffFactor: 2
          }
        );
      } catch (retryError) {
        safeLog('error', 'Failed to fetch mapping after retries', { error: retryError });
        const errorMessage = getUserFriendlyErrorMessage({ code: 'firestore/not-found' });
        res.status(500).send(errorMessage);
        return;
      }

      if (!mappingDoc.exists) {
        safeLog('error', 'Mapping not found', { mappingId });
        const errorMessage = getUserFriendlyErrorMessage({ code: 'auth/invalid-token' });
        res.status(404).send(errorMessage);
        return;
      }

      const mappingData = mappingDoc.data();
      if (!mappingData) {
        safeLog('error', 'Mapping data is empty', { mappingId });
        const errorMessage = getUserFriendlyErrorMessage({ code: 'default' });
        res.status(500).send(errorMessage);
        return;
      }

      const lineUserId = mappingData.lineUserId;
      safeLog('info', 'Found lineUserId', { hasUserId: !!lineUserId });

      // タイムスタンプフィルタ用のsinceパラメータを処理
      let sinceTimestamp = null;
      if (req.query.since) {
        try {
          sinceTimestamp = new Date(Number(req.query.since as string));
          if (isNaN(sinceTimestamp.getTime())) {
            throw new Error('Invalid timestamp');
          }
          safeLog('info', 'Since timestamp processed', { timestamp: sinceTimestamp.toISOString() });
        } catch (dateError) {
          safeLog('warn', 'Invalid since parameter, using null instead', {
            since: req.query.since,
            error: dateError
          });
          sinceTimestamp = null;
        }
      }

      // 未同期のメモを取得
      let notesQuery = db.collection('notes')
        .where('lineUserId', '==', lineUserId);

      if (sinceTimestamp) {
        notesQuery = notesQuery.where('createdAt', '>=', sinceTimestamp);
      }

      const notesSnapshot = await notesQuery.get();
      safeLog('info', 'Found notes count', { count: notesSnapshot.size });

      // レスポンス用のデータを構築（暗号化されたメモを復号）
      const notes = await Promise.all(notesSnapshot.docs.map(async doc => {
        const data = doc.data();
        let text = '';

        // 暗号化されている場合は復号
        if (data.isEncrypted && data.encryptedText) {
          try {
            text = await decryptMessage(data.encryptedText, lineUserId);
          } catch (decryptError) {
            safeLog('error', 'Failed to decrypt note', {
              noteId: doc.id,
              error: decryptError
            });
            // 復号に失敗した場合はエラーメッセージを表示
            text = '【復号化に失敗しました】';
          }
        } else if (data.text) {
          // 旧形式（暗号化されていない）の場合はそのまま使用
          text = data.text;
        }

        return {
          id: doc.id,
          text,
          timestamp: data.createdAt ? data.createdAt.toDate().getTime() : Date.now(),
        };
      }));

      // 同期済みフラグを更新
      if (notes.length > 0) {
        const batch = db.batch();
        notesSnapshot.docs.forEach(doc => {
          // 同期後即時削除オプションが有効な場合は削除
          if (process.env.IMMEDIATE_DELETE_AFTER_SYNC === 'true') {
            batch.delete(doc.ref);
          } else {
            batch.update(doc.ref, {
              synced: true,
              syncedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        });
        await batch.commit();

        safeLog('info', `Processed ${notes.length} notes after sync`, {
          deleteMode: process.env.IMMEDIATE_DELETE_AFTER_SYNC === 'true' ? 'immediate' : 'flag'
        });
      }

      // JSON形式でレスポンス
      res.status(200).json({
        success: true,
        notes: notes
      });
    } catch (error) {
      safeLog('error', 'Error syncing notes', { error });

      // ユーザーフレンドリーなエラーメッセージを生成
      const friendlyMessage = getUserFriendlyErrorMessage(error);

      if (error instanceof Error) {
        res.status(500).json({
          success: false,
          error: friendlyMessage,
          errorCode: error.name || 'UnknownError'
        });
      } else {
        res.status(500).json({
          success: false,
          error: friendlyMessage,
          errorCode: 'UnknownError'
        });
      }
    }
  }
);

// クリーンアップ処理
export const cleanupSynced = onRequest(
  {
    region: 'asia-northeast1',
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
    // スケジュール設定（コメントアウト - V2形式では対応していない）
    /* schedule: {
      schedule: 'every 24 hours',
      region: 'asia-northeast1',
      timeZone: 'Asia/Tokyo'
    } */
  },
  async (req: Request, res: Response) => {
    safeLog('info', 'cleanupSynced function called');

    try {
      // 30日以上前の同期済みメモを取得
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      // リトライ機能付きでクエリを実行
      const oldNotesSnapshot = await executeWithRetry(
        () => db.collection('notes')
          .where('synced', '==', true)
          .where('createdAt', '<', cutoffDate)
          .get(),
        {
          maxRetries: 3,
          initialDelayMs: 1000,
          maxDelayMs: 10000,
          backoffFactor: 2
        }
      );

      if (oldNotesSnapshot.empty) {
        safeLog('info', 'No old synced notes to cleanup');
        res.status(200).send('No old synced notes to cleanup');
        return;
      }

      // 一括削除
      const batch = db.batch();
      oldNotesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      const message = `Cleaned up ${oldNotesSnapshot.size} old synced notes`;
      safeLog('info', message, { count: oldNotesSnapshot.size });
      res.status(200).send(message);
    } catch (error) {
      safeLog('error', 'Error cleaning up synced notes', { error });

      // ユーザーフレンドリーなエラーメッセージを生成
      const friendlyMessage = getUserFriendlyErrorMessage(error);

      if (error instanceof Error) {
        res.status(500).send(friendlyMessage);
      } else {
        res.status(500).send('An unexpected error occurred during cleanup.');
      }
    }
  }
);

// エンドポイント解決関数
export const resolveEndpoint = onRequest(
  {
    region: 'asia-northeast1',
    cors: true,
    timeoutSeconds: 30,
    memory: '512MiB'
  },
  async (req: Request, res: Response) => {
    logger.info('resolveEndpoint function called', { method: req.method, query: req.query });

    // CORS設定
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    // OPTIONSリクエスト（プリフライトリクエスト）への応答
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    // GETメソッドのみ受け付ける
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed: GETメソッドのみ受け付けています');
      return;
    }

    const code = req.query.code as string;

    if (!code) {
      res.status(400).json({
        success: false,
        error: 'Connection code is required'
      });
      return;
    }

    try {
      // Firestoreから短縮コードを検索
      const codeDoc = await db.collection('connection_codes').doc(code).get();

      if (!codeDoc.exists) {
        res.status(404).json({
          success: false,
          error: 'Invalid connection code'
        });
        return;
      }

      const codeData = codeDoc.data();
      if (!codeData) {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch connection code data'
        });
        return;
      }

      const projectId = codeData.projectId;

      // エンドポイントURLを生成して返す
      res.status(200).json({
        success: true,
        endpoint: `https://asia-northeast1-${projectId}.cloudfunctions.net/syncNotes`,
        projectName: codeData.projectName || 'LINE to Obsidian Sync'
      });
    } catch (error) {
      logger.error('Error resolving endpoint:', error);

      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

// 古い接続コードのクリーンアップ
export const cleanupOldConnectionCodes = onRequest(
  {
    region: 'asia-northeast1',
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB'
  },
  async (req: Request, res: Response) => {
    logger.info('cleanupOldConnectionCodes function called');

    try {
      // 90日以上前の接続コードを取得
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const oldCodesSnapshot = await db.collection('connection_codes')
        .where('createdAt', '<', cutoffDate)
        .get();

      if (oldCodesSnapshot.empty) {
        logger.info('No old connection codes to cleanup');
        res.status(200).send('No old connection codes to cleanup');
        return;
      }

      // 一括削除
      const batch = db.batch();
      oldCodesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      const message = `Cleaned up ${oldCodesSnapshot.size} old connection codes`;
      logger.info(message);
      res.status(200).send(message);
    } catch (error) {
      logger.error('Error cleaning up old connection codes:', error);
      if (error instanceof Error) {
        res.status(500).send(`Error cleaning up old connection codes: ${error.message}`);
      } else {
        res.status(500).send('An unexpected error occurred during cleanup.');
      }
    }
  }
);

// 古いマッピング情報のクリーンアップ
export const cleanupOldMappings = onRequest(
  {
    region: 'asia-northeast1',
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB'
  },
  async (req: Request, res: Response) => {
    logger.info('cleanupOldMappings function called');

    try {
      // 90日以上前のマッピング情報を取得
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);

      const oldMappingsSnapshot = await db.collection('mappings')
        .where('createdAt', '<', cutoffDate)
        .get();

      if (oldMappingsSnapshot.empty) {
        logger.info('No old mappings to cleanup');
        res.status(200).send('No old mappings to cleanup');
        return;
      }

      // 一括削除
      const batch = db.batch();
      oldMappingsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      const message = `Cleaned up ${oldMappingsSnapshot.size} old mappings`;
      logger.info(message);
      res.status(200).send(message);
    } catch (error) {
      logger.error('Error cleaning up old mappings:', error);
      if (error instanceof Error) {
        res.status(500).send(`Error cleaning up old mappings: ${error.message}`);
      } else {
        res.status(500).send('An unexpected error occurred during cleanup.');
      }
    }
  }
);