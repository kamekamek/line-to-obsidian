import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as line from '@line/bot-sdk';
import express from 'express';
import cors from 'cors';
import { Request, Response } from 'express';
import { onRequest } from 'firebase-functions/v2/https';

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
        await handleRegistration(userId);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: '登録が完了しました。これからメモを送ると自動的にObsidianに同期できるようになります。',
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
 * ユーザー登録処理
 * @param lineUserId LINE UserID
 */
async function handleRegistration(lineUserId: string): Promise<void> {
  try {
    // ユニークなマッピングIDを生成
    const mappingId = admin.firestore().collection('mappings').doc().id;
    
    // マッピング情報をFirestoreに保存
    await db.collection('mappings').doc(mappingId).set({
      lineUserId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    functions.logger.info(`User registered: ${lineUserId} with mapping ID: ${mappingId}`);
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

// Firebase 2nd Gen用のエクスポート
export const api = onRequest({ region: 'asia-northeast1' }, app); 

// 開発環境と本番環境で分岐
// 本番環境（Cloud Run）のみでポートリッスンを行う
if (process.env.NODE_ENV !== 'development' && process.env.K_SERVICE) {
  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
} 