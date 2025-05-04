import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as line from '@line/bot-sdk';
import express from 'express';
import cors from 'cors';
import { Request, Response } from 'express';

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
    await db.collection('notes').add({
      lineUserId,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      synced: false,
    });
    
    logger.info(`Note saved for user: ${lineUserId}`);
  } catch (error) {
    logger.error(`Note saving error for user ${lineUserId}:`, error);
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
    secrets: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET']
  }, 
  async (req: Request, res: Response) => {
    // 簡易的なヘルスチェック処理
    if (req.method === 'GET') {
      res.status(200).send('LINE to Obsidian Webhook is running!');
      return;
    }
    
    // POSTリクエスト以外は処理しない
    if (req.method !== 'POST') {
      logger.info('非POSTリクエスト受信', { method: req.method });
      res.status(405).send('Method Not Allowed');
      return;
    }
    
    // 受信ログ
    logger.info('Webhook received', {
      method: req.method,
      path: req.path,
      headers: JSON.stringify(req.headers)
    });
    
    try {
      // リクエストボディをJSON文字列に変換
      const requestBody = JSON.stringify(req.body);
      logger.info('Request body', { body: requestBody.substring(0, 100) + '...' });
      
      // 署名検証の実行
      const signature = req.headers['x-line-signature'] as string;
      if (!signature) {
        logger.error('Missing LINE signature');
        
        // 開発環境では署名がなくても処理を続行
        if (process.env.NODE_ENV === 'production') {
          res.status(401).send('Missing signature');
          return;
        } else {
          logger.warn('Skipping signature verification in development environment');
        }
      } else {
        // 署名検証
        try {
          const isValid = line.validateSignature(requestBody, config.channelSecret, signature);
          if (!isValid) {
            logger.error('Invalid LINE signature');
            
            // 開発環境では署名検証に失敗しても処理を続行
            if (process.env.NODE_ENV === 'production') {
              res.status(401).send('Invalid signature');
              return;
            } else {
              logger.warn('Invalid signature, but continuing in development environment');
            }
          } else {
            logger.info('Signature verification successful');
          }
        } catch (signError) {
          logger.error('Error during signature verification', { 
            error: signError,
            errorMessage: signError instanceof Error ? signError.message : 'Unknown error'
          });
          
          // 開発環境ではエラーがあっても処理を続行
          if (process.env.NODE_ENV === 'production') {
            res.status(401).send('Signature verification error');
            return;
          } else {
            logger.warn('Signature verification error, but continuing in development environment');
          }
        }
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
    memory: '512MiB'
  },
  async (req: Request, res: Response) => {
    logger.info('syncNotes function called', { method: req.method, query: req.query });
    
    // CORS設定
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // OPTIONSリクエスト（プリフライトリクエスト）への応答
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    // 認証チェック
    const authHeader = req.headers.authorization;
    logger.info('Authorization header:', { authHeader });
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).send('Unauthorized: Authorization header missing or invalid');
      return;
    }

    try {
      // トークンからLineUserIdを取得（URLクエリパラメータまたはAuthorizationヘッダーから）
      const authTokenFromQuery = req.query.authToken as string || '';
      const authTokenFromHeader = authHeader.substring(7); // 'Bearer ' の後の部分
      
      const mappingId = authTokenFromQuery || authTokenFromHeader;
      logger.info('MappingId from params:', { mappingId });
      
      if (!mappingId) {
        res.status(400).send('Missing authentication token parameter');
        return;
      }

      // マッピング情報を取得して認証
      const mappingDoc = await db.collection('mappings').doc(mappingId).get();
      if (!mappingDoc.exists) {
        res.status(404).send('Mapping not found: The authentication token is invalid');
        return;
      }

      const mappingData = mappingDoc.data();
      if (!mappingData) {
        res.status(500).send('Internal Server Error: Failed to fetch mapping data');
        return;
      }

      const lineUserId = mappingData.lineUserId;
      logger.info('Found lineUserId:', { lineUserId });

      // タイムスタンプフィルタ用のsinceパラメータを処理
      let sinceTimestamp = null;
      if (req.query.since) {
        sinceTimestamp = new Date(Number(req.query.since as string));
        logger.info('Since timestamp:', { sinceTimestamp });
      }

      // 未同期のメモを取得
      let notesQuery = db.collection('notes')
        .where('lineUserId', '==', lineUserId);
      
      if (sinceTimestamp) {
        notesQuery = notesQuery.where('createdAt', '>=', sinceTimestamp);
      }

      const notesSnapshot = await notesQuery.get();
      logger.info('Found notes count:', { count: notesSnapshot.size });
      
      // レスポンス用のデータを構築
      const notes = notesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          text: data.text,
          timestamp: data.createdAt ? data.createdAt.toDate().getTime() : Date.now(),
        };
      });

      // 同期済みフラグを更新
      if (notes.length > 0) {
        const batch = db.batch();
        notesSnapshot.docs.forEach(doc => {
          batch.update(doc.ref, { synced: true });
        });
        await batch.commit();
      }

      // JSON形式でレスポンス
      res.status(200).json({
        success: true,
        notes: notes
      });
    } catch (error) {
      logger.error('Error syncing notes:', error);
      if (error instanceof Error) {
        res.status(500).send(`Internal Server Error: ${error.message}`);
      } else {
        res.status(500).send('An unexpected error occurred during sync.');
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
    memory: '256MiB'
  },
  async (req: Request, res: Response) => {
    logger.info('cleanupSynced function called');
    
    try {
      // 30日以上前の同期済みメモを取得
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      const oldNotesSnapshot = await db.collection('notes')
        .where('synced', '==', true)
        .where('createdAt', '<', cutoffDate)
        .get();
      
      if (oldNotesSnapshot.empty) {
        logger.info('No old synced notes to cleanup');
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
      logger.info(message);
      res.status(200).send(message);
    } catch (error) {
      logger.error('Error cleaning up synced notes:', error);
      if (error instanceof Error) {
        res.status(500).send(`Error cleaning up synced notes: ${error.message}`);
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