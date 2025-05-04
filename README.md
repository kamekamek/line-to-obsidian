# LINE to Obsidian プラグイン

LINE to Obsidianは、LINEチャットで送信したメッセージをObsidianのノートとして自動的に同期するためのプラグインです。

- LINEで素早くメモを記録
- ObsidianのSecond Brainに自動的に同期
- マークダウン形式でメモを保存

## 機能

- LINEアプリからObsidianへのシームレスなメモ同期
- Firebaseバックエンドによる安全なデータ連携
- 認証トークンによるセキュリティ保護
- 同期フォルダのカスタマイズ
- 自動的なファイル名生成とコンテンツ保存

## セットアップ手順

### 前提条件

- Obsidian（バージョン0.15.0以上）
- Firebase プロジェクト（Firestore, Cloud Functions）
- LINE Developer アカウント

### インストール

1. プラグインファイル（`main.js`, `manifest.json`, `styles.css`）をダウンロード
2. Obsidianのプラグインフォルダ（`<vault>/.obsidian/plugins/line-to-obsidian/`）に配置
3. Obsidianを再起動し、設定からプラグインを有効化

### 設定

1. LINE Botを設定し、Webhook URLをFirebase Cloud Functionsに設定
2. Obsidianのプラグイン設定で以下を入力:
   - API Endpoint URL: Firebase Cloud FunctionsのURLを入力
   - Authentication Token: 認証用トークンを設定
   - Sync Folder Path: メモを保存するフォルダパスを指定

## 使い方

1. LINEチャットでボットに「#登録」と送信して連携を開始
2. 通常のテキストメッセージをボットに送信（これがメモとして保存されます）
3. Obsidianでプラグインの同期機能を実行:
   - コマンドパレットから「Sync LINE Memos」を選択
   - リボンアイコンをクリック
   - 設定画面の「Sync Now」ボタンをクリック
4. 指定したフォルダにLINEで送信したメモが同期されます

## バックエンド構成

このプラグインは以下のコンポーネントで構成されています:

1. **LINEボット**: メッセージを受け取り、Webhookを通じてFirebaseに送信
2. **Firebase Cloud Functions**:
   - `lineWebhook`: LINEからのメッセージを受信し、Firestoreに保存
   - `syncNotes`: ObsidianプラグインからのAPI呼び出しに応答、未同期メモを提供
   - `cleanupSynced`: 古い同期済みメモを定期的に削除
3. **Firestore**: メモデータとマッピング情報を保存

## セキュリティ

- すべてのデータはFirebase Authenticationで保護
- Obsidianプラグインと同期APIはBearer認証トークンで保護
- LINEユーザーIDとObsidianユーザーのマッピングは1対1で厳密に管理

## 開発者向け情報

### ビルド方法

```bash
# 依存関係のインストール
npm install

# 開発モード（自動コンパイル）
npm run dev

# プロダクションビルド
npm run build
```

### フォルダ構成

- `/functions`: Firebase Cloud Functions実装
- `/main.ts`: Obsidianプラグインのメインコード
- `/docs`: ドキュメント

## ライセンス

MIT

## 作者

Nagare Kameno
