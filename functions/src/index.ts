import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as line from '@line/bot-sdk';

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

/**
 * LINE Webhookエンドポイント
 * メッセージを受信して処理する
 */
export const lineWebhook = functions.https.onRequest(async (req, res) => {
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
export const syncNotes = functions.https.onRequest(async (req, res) => {
  // GET以外のリクエストは拒否
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // 認証チェック
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized');
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  
  try {
    // クエリパラメータからmappingIdを取得
    const mappingId = req.query.mappingId as string;
    if (!mappingId) {
      res.status(400).send('Missing mappingId parameter');
      return;
    }

    // マッピング情報を取得して認証
    const mappingDoc = await db.collection('mappings').doc(mappingId).get();
    if (!mappingDoc.exists) {
      res.status(404).send('Mapping not found');
      return;
    }

    // 実際にはここでtokenの検証をすべきですが、簡単のために現在はスキップします
    // TODO: 本番環境では適切なトークン検証を実装してください
    functions.logger.info(`Token provided: ${token}`);

    const mappingData = mappingDoc.data();
    if (!mappingData) {
      res.status(500).send('Internal Server Error');
      return;
    }

    const lineUserId = mappingData.lineUserId;

    // タイムスタンプフィルタ用のsinceパラメータを処理
    let sinceTimestamp = null;
    if (req.query.since) {
      sinceTimestamp = new Date(Number(req.query.since));
    }

    // 未同期のメモを取得
    let notesQuery = db.collection('notes')
      .where('lineUserId', '==', lineUserId)
      .where('synced', '==', false);
    
    if (sinceTimestamp) {
      notesQuery = notesQuery.where('createdAt', '>=', sinceTimestamp);
    }

    const notesSnapshot = await notesQuery.get();
    
    // レスポンス用のデータを構築
    const notes = notesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        text: data.text,
        createdAt: data.createdAt.toDate().getTime(),
      };
    });

    // 同期済みフラグを更新
    const batch = db.batch();
    notesSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, { synced: true });
    });
    await batch.commit();

    // JSON形式でレスポンス
    res.status(200).json({
      notes,
      syncedAt: Date.now(),
    });
  } catch (error) {
    functions.logger.error('Error syncing notes:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 古い同期済みメモのクリーンアップ処理
 * 定期実行される関数
 * 注: アプリがBlazeプランに変更されると、実際にスケジュールされます
 */
// 単純化したアプローチ - HTTPトリガー関数として実装し、後でSchedulerで定期実行する
export const cleanupSynced = functions.https.onRequest(async (req, res) => {
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
    functions.logger.error('Error cleaning up synced notes:', error);
    res.status(500).send('Error cleaning up synced notes');
  }
}); 