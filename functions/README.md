# LINE to Obsidian Firebase Functions

このディレクトリにはLINE Botから受信したメッセージをObsidianに同期するためのバックエンド機能が含まれています。

## セットアップ

### 前提条件
- Node.js 18以上
- npm 9以上
- Firebase CLI (`npm install -g firebase-tools`)
- Firebaseアカウントと新規プロジェクト

### 開発環境準備
1. 依存関係をインストール
   ```
   npm install
   ```

2. TypeScriptコンパイル
   ```
   npm run build
   ```

3. ローカルエミュレータ起動
   ```
   npm run serve
   ```

### デプロイ
1. Firebase環境変数の設定
   ```
   firebase functions:config:set line.channel_secret="YOUR_LINE_CHANNEL_SECRET" line.channel_access_token="YOUR_LINE_CHANNEL_ACCESS_TOKEN"
   ```

2. デプロイ実行
   ```
   npm run deploy
   ```

## 主要機能

### lineWebhook
LINE Botからのメッセージを受信し、Firestoreに保存します。
- `#登録` コマンドでユーザー登録
- テキストメッセージをメモとして保存

### syncNotes
ObsidianプラグインからAPIで呼び出され、未同期のメモを取得します。

### cleanupSynced
24時間ごとに実行され、30日以上経過した同期済みメモを削除します。

## Firestoreスキーマ

### mappingsコレクション
```
{
  lineUserId: string,  // LINE Bot APIのユーザーID
  createdAt: timestamp // 登録日時
}
```

### notesコレクション
```
{
  lineUserId: string,  // LINE Bot APIのユーザーID
  text: string,        // メモ内容
  createdAt: timestamp, // 作成日時
  synced: boolean      // 同期ステータス
}
``` 