import * as functions from 'firebase-functions/v1';
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
  channelAccessToken: functions.config().line?.channel_access_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: functions.config().line?.channel_secret || process.env.LINE_CHANNEL_SECRET || '',
};

// LINEクライアントの初期化
const lineClient = new line.Client(config);

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
  console.log('lineWebhook function called');
  // 署名検証
  const signature = req.headers['x-line-signature'] as string;
  if (!signature || !line.validateSignature(JSON.stringify(req.body), config.channelSecret, signature)) {
    functions.logger.error('Invalid signature');
    res.status(401).send('Invalid signature');
    return;
  }

  try {
    const events: line.WebhookEvent[] = req.body.events;
    
    // 各イベントを処理
    await Promise.all(events.map(async (event) => {
      // メッセージイベントのみ処理
      if (event.type !== 'message' || event.message.type !== 'text') {
        return;
      }

      const { text } = event.message;
      const { userId } = event.source;

      if (!userId) {
        functions.logger.error('User ID not found');
        return;
      }

      // "#登録" コマンドの処理
      if (text.trim() === '#登録') {
        const mappingId = await handleRegistration(userId);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: `登録が完了しました。これからメモを送ると自動的にObsidianに同期できるようになります。\n\nあなたの認証トークンは: ${mappingId}\n\nこのトークンをObsidianプラグインの設定画面に入力してください。`,
        });
        return;
      }

      // 通常のメッセージをメモとして保存
      await saveNote(userId, text);
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'メモを保存しました。Obsidianプラグインで同期するとノートとして表示されます。',
      });
    }));

    res.status(200).send('OK');
  } catch (error) {
    functions.logger.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

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
    
    functions.logger.info(`Connection code created: ${shortCode} for project: ${projectId}`);
    return shortCode;
  } catch (error) {
    functions.logger.error('Connection code creation error:', error);
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
    
    functions.logger.info(`User registered: ${lineUserId} with mapping ID: ${mappingId} and connection code: ${connectionCode}`);
    return mappingId;
  } catch (error) {
    functions.logger.error(`Registration error for user ${lineUserId}:`, error);
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
    
    functions.logger.info(`Note saved for user: ${lineUserId}`);
  } catch (error) {
    functions.logger.error(`Note saving error for user ${lineUserId}:`, error);
    throw error;
  }
}

/**
 * メモ同期API
 * Obsidianプラグインからの呼び出しに対応
 */
app.get('/syncNotes', async (req: Request, res: Response) => {
  console.log('syncNotes function called', req.method, req.query);
  
  // 認証チェック
  const authHeader = req.headers.authorization;
  console.log('Authorization header:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized');
    return;
  }

  // Bearerトークンの検証は行わないが、形式だけチェック
  // const _token = authHeader.split('Bearer ')[1];

  try {
    // トークンからLineUserIdを取得
    // トークンパラメータは認証トークンではなく、mappingIdとして使用
    const mappingId = req.query.token as string || '';
    console.log('MappingId from token param:', mappingId);
    
    if (!mappingId) {
      res.status(400).send('Missing token parameter');
      return;
    }

    // マッピング情報を取得して認証
    const mappingDoc = await db.collection('mappings').doc(mappingId).get();
    if (!mappingDoc.exists) {
      res.status(404).send('Mapping not found');
      return;
    }

    const mappingData = mappingDoc.data();
    if (!mappingData) {
      res.status(500).send('Internal Server Error');
      return;
    }

    const lineUserId = mappingData.lineUserId;
    console.log('Found lineUserId:', lineUserId);

    // タイムスタンプフィルタ用のsinceパラメータを処理
    let sinceTimestamp = null;
    if (req.query.since) {
      sinceTimestamp = new Date(Number(req.query.since as string));
      console.log('Since timestamp:', sinceTimestamp);
    }

    // 未同期のメモを取得
    let notesQuery = db.collection('notes')
      .where('lineUserId', '==', lineUserId)
      .where('synced', '==', false);
    
    if (sinceTimestamp) {
      notesQuery = notesQuery.where('createdAt', '>=', sinceTimestamp);
    }

    const notesSnapshot = await notesQuery.get();
    console.log('Found notes count:', notesSnapshot.size);
    
    // レスポンス用のデータを構築
    const notes = notesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        content: data.text,
        created: data.createdAt ? data.createdAt.toDate().getTime() : Date.now(),
      };
    });

    // 同期済みフラグを更新
    const batch = db.batch();
    notesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { synced: true });
    });
    await batch.commit();

    // JSON形式でレスポンス
    res.status(200).json(notes);
  } catch (error) {
    console.error('Error syncing notes:', error);
    functions.logger.error('Error syncing notes:', error);
    if (error instanceof Error) {
      res.status(500).send(`Internal Server Error: ${error.message}`);
    } else {
      res.status(500).send('An unexpected error occurred during sync.');
    }
  }
});

/**
 * 古い同期済みメモのクリーンアップ処理
 * 定期実行される関数
 * 注: アプリがBlazeプランに変更されると、実際にスケジュールされます
 */
// 単純化したアプローチ - HTTPトリガー関数として実装し、後でSchedulerで定期実行する
app.get('/cleanupSynced', async (req: Request, res: Response) => {
  console.log('cleanupSynced function called');
  
  try {
    // 30日以上前の同期済みメモを取得
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    
    const oldNotesSnapshot = await db.collection('notes')
      .where('synced', '==', true)
      .where('createdAt', '<', cutoffDate)
      .get();
    
    if (oldNotesSnapshot.empty) {
      functions.logger.info('No old synced notes to cleanup');
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
    functions.logger.info(message);
    res.status(200).send(message);
  } catch (error) {
    console.error('Error cleaning up synced notes:', error);
    functions.logger.error('Error cleaning up synced notes:', error);
    if (error instanceof Error) {
      res.status(500).send(`Error cleaning up synced notes: ${error.message}`);
    } else {
      res.status(500).send('An unexpected error occurred during cleanup.');
    }
  }
});

// Firebase Functions v1形式でエンドポイントを個別にエクスポート
export const lineWebhook = functions.region('asia-northeast1').https.onRequest(async (req: Request, res: Response) => {
  // POSTメソッドのみ受け付ける
  if (req.method === 'POST') {
    console.log('lineWebhook function called');
    // 署名検証
    const signature = req.headers['x-line-signature'] as string;
    if (!signature || !line.validateSignature(JSON.stringify(req.body), config.channelSecret, signature)) {
      functions.logger.error('Invalid signature');
      res.status(401).send('Invalid signature');
      return;
    }

    try {
      const events: line.WebhookEvent[] = req.body.events;
      
      // 各イベントを処理
      await Promise.all(events.map(async (event) => {
        // メッセージイベントのみ処理
        if (event.type !== 'message' || event.message.type !== 'text') {
          return;
        }

        const { text } = event.message;
        const { userId } = event.source;

        if (!userId) {
          functions.logger.error('User ID not found');
          return;
        }

        // "#登録" コマンドの処理
        if (text.trim() === '#登録') {
          const mappingId = await handleRegistration(userId);
          
          // マッピング情報を取得して短縮コードを取得
          const mappingDoc = await db.collection('mappings').doc(mappingId).get();
          const mappingData = mappingDoc.data();
          const connectionCode = mappingData?.connectionCode || '';
          
          await lineClient.replyMessage(event.replyToken, {
            type: 'text',
            text: `登録が完了しました。これからメモを送ると自動的にObsidianに同期できるようになります。\n\n接続コード: ${connectionCode}\n認証トークン: ${mappingId}\n\nObsidianプラグインの設定画面で接続コードと認証トークンを入力してください。`,
          });
          return;
        }

        // 通常のメッセージをメモとして保存
        await saveNote(userId, text);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'メモを保存しました。Obsidianプラグインで同期するとノートとして表示されます。',
        });
      }));

      res.status(200).send('OK');
    } catch (error) {
      functions.logger.error('Error processing webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(405).send('Method Not Allowed: POSTメソッドのみ受け付けています');
  }
});

export const syncNotes = functions.region('asia-northeast1').https.onRequest(async (req: Request, res: Response) => {
  console.log('syncNotes function called', req.method, req.query);
  
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
  console.log('Authorization header:', authHeader);
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized: Authorization header missing or invalid');
    return;
  }

  try {
    // トークンからLineUserIdを取得（URLクエリパラメータまたはAuthorizationヘッダーから）
    const authTokenFromQuery = req.query.authToken as string || '';
    const authTokenFromHeader = authHeader.substring(7); // 'Bearer ' の後の部分
    
    const mappingId = authTokenFromQuery || authTokenFromHeader;
    console.log('MappingId from params:', mappingId);
    
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
    console.log('Found lineUserId:', lineUserId);

    // タイムスタンプフィルタ用のsinceパラメータを処理
    let sinceTimestamp = null;
    if (req.query.since) {
      sinceTimestamp = new Date(Number(req.query.since as string));
      console.log('Since timestamp:', sinceTimestamp);
    }

    // 未同期のメモを取得
    let notesQuery = db.collection('notes')
      .where('lineUserId', '==', lineUserId);
    
    // 同期フラグで絞り込み（オプション）
    // .where('synced', '==', false);
    
    if (sinceTimestamp) {
      notesQuery = notesQuery.where('createdAt', '>=', sinceTimestamp);
    }

    const notesSnapshot = await notesQuery.get();
    console.log('Found notes count:', notesSnapshot.size);
    
    // レスポンス用のデータを構築
    const notes = notesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        content: data.text,
        created: data.createdAt ? data.createdAt.toDate().getTime() : Date.now(),
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
    res.status(200).json(notes);
  } catch (error) {
    console.error('Error syncing notes:', error);
    functions.logger.error('Error syncing notes:', error);
    if (error instanceof Error) {
      res.status(500).send(`Internal Server Error: ${error.message}`);
    } else {
      res.status(500).send('An unexpected error occurred during sync.');
    }
  }
});

export const cleanupSynced = functions.region('asia-northeast1').https.onRequest(async (req: Request, res: Response) => {
  // Functionsのパスはベースパスを含まないため、明示的なパスチェックは不要
  if (req.path === '/') {
    // GETメソッドのみ受け付ける
    if (req.method === 'GET') {
      console.log('cleanupSynced function called');
      
      try {
        // 30日以上前の同期済みメモを取得
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        
        const oldNotesSnapshot = await db.collection('notes')
          .where('synced', '==', true)
          .where('createdAt', '<', cutoffDate)
          .get();
        
        if (oldNotesSnapshot.empty) {
          functions.logger.info('No old synced notes to cleanup');
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
        functions.logger.info(message);
        res.status(200).send(message);
      } catch (error) {
        console.error('Error cleaning up synced notes:', error);
        functions.logger.error('Error cleaning up synced notes:', error);
        if (error instanceof Error) {
          res.status(500).send(`Error cleaning up synced notes: ${error.message}`);
        } else {
          res.status(500).send('An unexpected error occurred during cleanup.');
        }
      }
    } else {
      res.status(405).send('Method Not Allowed: GETメソッドのみ受け付けています');
    }
  } else {
    // 他のパスへのリクエストは404を返す
    res.status(404).send('Not Found');
  }
});

// 新しいエンドポイント解決関数を追加
export const resolveEndpoint = functions.region('asia-northeast1').https.onRequest(async (req: Request, res: Response) => {
  console.log('resolveEndpoint function called', req.method, req.query);
  
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
    console.error('Error resolving endpoint:', error);
    functions.logger.error('Error resolving endpoint:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}); 