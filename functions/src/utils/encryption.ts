import * as crypto from 'crypto';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';

// 暗号化キーの保存先コレクション
const ENCRYPTION_KEYS_COLLECTION = 'encryption_keys';

/**
 * ユーザーごとの暗号化キーを取得または生成する
 * @param userId ユーザーID
 * @returns 暗号化キー（Buffer）
 */
export async function getOrCreateEncryptionKey(userId: string): Promise<Buffer> {
  try {
    const db = admin.firestore();
    const keyDoc = await db.collection(ENCRYPTION_KEYS_COLLECTION).doc(userId).get();
    
    if (keyDoc.exists) {
      // 既存のキーを返す
      const data = keyDoc.data();
      if (data && data.key) {
        return Buffer.from(data.key, 'base64');
      }
    }
    
    // 新しいキーを生成
    const newKey = crypto.randomBytes(32); // AES-256用の32バイトキー
    
    // キーをFirestoreに保存
    await db.collection(ENCRYPTION_KEYS_COLLECTION).doc(userId).set({
      key: newKey.toString('base64'),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return newKey;
  } catch (error) {
    logger.error('Encryption key error:', error);
    throw new Error('暗号化キーの取得または生成に失敗しました');
  }
}

/**
 * ユーザーの暗号化キーを取得する
 * @param userId ユーザーID
 * @returns 暗号化キー（Buffer）
 */
export async function getEncryptionKey(userId: string): Promise<Buffer> {
  try {
    const db = admin.firestore();
    const keyDoc = await db.collection(ENCRYPTION_KEYS_COLLECTION).doc(userId).get();
    
    if (!keyDoc.exists) {
      throw new Error('暗号化キーが見つかりません');
    }
    
    const data = keyDoc.data();
    if (!data || !data.key) {
      throw new Error('暗号化キーのデータが不正です');
    }
    
    return Buffer.from(data.key, 'base64');
  } catch (error) {
    logger.error('Encryption key retrieval error:', error);
    throw new Error('暗号化キーの取得に失敗しました');
  }
}

/**
 * メッセージを暗号化する
 * @param message 暗号化するメッセージ
 * @param userId ユーザーID
 * @returns 暗号化されたデータ（IV:暗号文:認証タグ の形式）
 */
export async function encryptMessage(message: string, userId: string): Promise<string> {
  try {
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
  } catch (error) {
    logger.error('Message encryption error:', error);
    throw new Error('メッセージの暗号化に失敗しました');
  }
}

/**
 * 暗号化されたメッセージを復号する
 * @param encryptedData 暗号化されたデータ（IV:暗号文:認証タグ の形式）
 * @param userId ユーザーID
 * @returns 復号されたメッセージ
 */
export async function decryptMessage(encryptedData: string, userId: string): Promise<string> {
  try {
    const [ivBase64, encryptedText, authTagBase64] = encryptedData.split(':');
    
    if (!ivBase64 || !encryptedText || !authTagBase64) {
      throw new Error('暗号化データの形式が不正です');
    }
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const encryptionKey = await getEncryptionKey(userId);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Message decryption error:', error);
    throw new Error('メッセージの復号に失敗しました');
  }
}
