import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as line from '@line/bot-sdk';
import express from 'express';
import cors from 'cors';
import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v2';

// Firebaseの初期化
admin.initializeApp();
const db = admin.firestore();

// LINE Bot設定を環境変数から取得
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'dummy_token_for_testing',
  channelSecret: process.env.LINE_CHANNEL_SECRET || 'dummy_secret_for_testing',
};

// LINEクライアントの初期化
const lineClient = new line.Client(config);

// Express アプリケーションのセットアップ
const app = express();
app.use(cors());
app.use(express.json());

// ポートリスニングを追加（V2では必要）
const port = process.env.PORT ? parseInt(process.env.PORT) : 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});

// メインアプリケーションのルート
app.get('/', (req: Request, res: Response) => {
  res.status(200).send('LINE to Obsidian API is running!');
});

// V2形式での関数エクスポート
export const lineWebhookV2 = onRequest({ region: 'asia-northeast1' }, app);
export const syncNotesV2 = onRequest({ region: 'asia-northeast1' }, app);
export const cleanupSyncedV2 = onRequest({ region: 'asia-northeast1' }, app);

/**
 * LINE Webhookエンドポイント
 * メッセージを受信して処理する
 */
app.post('/lineWebhook', async (req: Request, res: Response) => {
  console.log('lineWebhook function called');
  // 署名検証
  const signature = req.headers['x-line-signature'] as string;
  if (!signature || !line.validateSignature(JSON.stringify(req.body), config.channelSecret, signature)) {
    logger.error('Invalid signature');
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
        logger.error('User ID not found');
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
    logger.error('Error processing webhook:', error);
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

    // JSON形式でレスポンス（新しい形式）
    res.status(200).json({
      success: true,
      notes: notes
    });
  } catch (error) {
    console.error('Error syncing notes:', error);
    logger.error('Error syncing notes:', error);
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
    console.error('Error cleaning up synced notes:', error);
    logger.error('Error cleaning up synced notes:', error);
    if (error instanceof Error) {
      res.status(500).send(`Error cleaning up synced notes: ${error.message}`);
    } else {
      res.status(500).send('An unexpected error occurred during cleanup.');
    }
  }
}); 