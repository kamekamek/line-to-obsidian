# LINE to Obsidian

> LINEチャットで送信したメッセージをObsidianのノートとして自動的に同期するプラグイン

![LINEメモ同期デモ](https://github.com/kamekamek/line-to-obsidian/raw/master/images/demo.gif)

## 概要

このプラグインを使用すると、LINEアプリで送信したメッセージを自動的にObsidianのノートとして保存できます。モバイルでの素早いメモ取りとObsidianでの整理を組み合わせることで、効率的なナレッジマネジメントを実現します。

### 主な機能

- **シームレスな同期**: LINEで送信したメッセージをObsidianに自動同期
- **セキュアな連携**: Firebaseバックエンドと認証トークンによる安全なデータ転送
- **プライバシー保護**: 同期後のメッセージデータは自動削除
- **カスタマイズ**: 同期フォルダの指定、ファイル名形式のカスタマイズ
- **マークダウン対応**: メモはマークダウン形式で保存され、Obsidianの機能を最大限活用可能

### 必要条件

- Obsidian v0.15.0以上
- LINEアプリ（モバイルまたはデスクトップ）
- Firebase プロジェクト（バックエンド用）

## スクリーンショット

| 設定画面 | 同期されたメモ | LINE Botとのやり取り |
|--------|-------------|-------------------|
| ![設定画面](https://github.com/kamekamek/line-to-obsidian/raw/master/images/settings.png) | ![同期メモ](https://github.com/kamekamek/line-to-obsidian/raw/master/images/synced_notes.png) | ![LINE Bot](https://github.com/kamekamek/line-to-obsidian/raw/master/images/line_chat.png) |

## インストール方法

### コミュニティプラグインから（推奨）

1. Obsidianの設定（Settings）を開く
2. 「サードパーティプラグイン（Community plugins）」を選択
3. 「LINE to Obsidian」を検索
4. 「インストール」をクリックし、その後「有効化」する

### 手動インストール

1. [最新リリース](https://github.com/kamekamek/line-to-obsidian/releases/latest)から`main.js`, `manifest.json`, `styles.css`をダウンロード
2. Obsidianのプラグインフォルダ（`<vault>/.obsidian/plugins/line-memo-sync/`）に配置
   （**重要**: フォルダ名は必ず`line-memo-sync`にしてください）
3. Obsidianを再起動し、設定からプラグインを有効化

## セットアップ手順

このプラグインは、LINEとObsidianを連携させるためにFirebaseバックエンドとLINE Botを使用します。以下の手順でセットアップを完了させてください。

### 1. Firebase プロジェクトの設定

1. [Firebase Console](https://console.firebase.google.com/)で新しいプロジェクトを作成
2. Firestoreデータベースを作成（**注意**: Blazeプラン[従量課金]が必要）
3. Cloud Functionsを有効化
4. GitHubリポジトリから`functions`フォルダをダウンロード
5. 以下のコマンドでデプロイ:
   ```bash
   cd functions
   npm install
   firebase login
   firebase deploy --only functions
   ```

### 2. LINE Bot の設定

1. [LINE Developers Console](https://developers.line.biz/)にログイン
2. 新しいプロバイダーを作成（または既存のものを選択）
3. Messaging APIチャネルを作成
4. Webhookを有効化し、URLを設定:
   `https://asia-northeast1-<project-id>.cloudfunctions.net/lineWebhook`
5. 応答メッセージを無効化（推奨）
6. チャネルアクセストークン（長期）を発行
7. 以下のコマンドでLINE Bot設定をFirebaseに登録:
   ```bash
   firebase functions:config:set line.channel_secret="YOUR_CHANNEL_SECRET" line.channel_access_token="YOUR_CHANNEL_ACCESS_TOKEN"
   firebase deploy --only functions
   ```

### 3. プラグインの設定とLINE Botの登録

1. LINEアプリでBot公式アカウントを友だち追加
2. Botに「#登録」と送信
3. Botから返信される接続コードと認証トークンをメモ
4. Obsidianのプラグイン設定で「LINE to Obsidian」を開く
5. 以下の情報を入力:
   - 接続コード: LINE Botから受け取ったコード
   - 認証トークン: LINE Botから受け取ったトークン
   - 同期フォルダパス: メモを保存するフォルダ（例: `LINE Memos`）
6. 設定を保存

## 使い方

### メモの作成と同期

1. **メモの作成**: LINEチャットでBotにテキストメッセージを送信
2. **同期の実行**: Obsidianで以下のいずれかの方法で同期を実行:
   - コマンドパレットから「LINE to Obsidian: Sync Memos」を選択
   - リボンアイコン（サイドバー）をクリック
   - 設定画面の「Sync Now」ボタンをクリック
3. **結果の確認**: 同期が完了すると、指定したフォルダにメモが作成されます

### メモの活用

- メモは日付とプレビューを含むファイル名で作成されます
- 各メモには作成日時やソース情報を含むYAMLフロントマターが付加されます
- 通常のObsidianノートと同様に編集、タグ付け、リンクが可能です

## よくある質問（FAQ）

### 一般的な質問

#### Q: LINEメッセージが同期されません
A: 以下を確認してください：
- LINE BotのWebhook URLが正しく設定されているか
- 接続コードと認証トークンが正確に入力されているか
- Firebase Functionsが正常に動作しているか（Firebaseコンソールでログを確認）
- インターネット接続が安定しているか

#### Q: 同期したメモが重複して作成されます
A: 同期タイムスタンプが正しく更新されていない可能性があります。一度同期した後に設定を開き、Last Sync Timestampが更新されているか確認してください。

#### Q: 画像やファイルも同期できますか？
A: 現在のバージョンではテキストメッセージのみ対応しています。画像やファイル添付は将来のアップデートで検討しています。

### カスタマイズと拡張

#### Q: ファイル名の形式を変更できますか？
A: 現在のバージョンでは設定からの変更はできませんが、ソースコードを修正することで可能です。`main.ts`の`syncNotes`関数内でファイル名生成ロジックを編集してください。

#### Q: 複数のLINEアカウントを連携できますか？
A: 現在のバージョンでは1つのObsidianプラグインインスタンスに1つのLINEアカウントのみ連携可能です。複数のアカウントを使用したい場合は、別々のFirebaseプロジェクトを設定する必要があります。

## セキュリティとプライバシー

このプラグインは、ユーザーのプライバシーとデータセキュリティを最優先に設計されています。

### データの流れ

1. **送信**: LINEアプリからBotにメッセージを送信
2. **一時保存**: メッセージはFirebaseサーバーに暗号化して一時保存
3. **同期**: Obsidianプラグインが認証後にデータを取得
4. **削除**: 同期完了後、サーバー上のデータは自動削除

### セキュリティ対策

- **エンドツーエンドの保護**:
  - LINEからFirebaseへの通信はLINE公式APIで保護
  - FirebaseからObsidianへの通信はBearer認証トークンで保護
  - サーバー上のメッセージデータは暗号化して保存

- **認証システム**:
  - 接続コードと認証トークンによる二段階の認証
  - 古い接続情報は定期的に自動クリーンアップ

- **データ管理**:
  - 同期されたメッセージはあなたのObsidian Vault内にのみ保存
  - このプラグインはユーザーの統計情報やメタデータを収集しません

**注意**: インターネットを介したデータの送受信には常に一定のリスクが伴います。機密性の高い情報や個人情報の送信は避けることを推奨します。

## 技術情報

### システム構成

このプラグインは以下のコンポーネントで構成されています:

1. **LINEボット**: メッセージを受け取り、Webhookを通じてFirebaseに送信
2. **Firebase Cloud Functions**:
   - `lineWebhook`: LINEからのメッセージを受信し、Firestoreに保存
   - `syncNotes`: ObsidianプラグインからのAPI呼び出しに応答、未同期メモを提供
   - `cleanupSynced`: 古い同期済みメモを定期的に削除
   - `cleanupOldConnectionCodes`: 古い接続コードを削除
   - `cleanupOldMappings`: 古いマッピング情報を削除
3. **Firestore**: メモデータとマッピング情報を保存

```
+--------+    +---------------+    +------------------+    +----------+
|  LINE  | -> | Firebase Func | -> | Firestore DB     | <- | Obsidian |
| (Bot)  |    | (lineWebhook) |    | (messages/users) |    | Plugin   |
+--------+    +---------------+    +------------------+    +----------+
                                          ^                     |
                                          |                     v
                                   +---------------+    +------------------+
                                   | Firebase Func | <- | Obsidian Vault   |
                                   | (syncNotes)   |    | (Markdown Files) |
                                   +---------------+    +------------------+
```

### 制限事項と既知の問題

- 現在のバージョンではテキストメッセージのみ対応しています
- 同期は手動で実行する必要があります（自動同期は将来のアップデートで検討）
- Firebaseの無料プランでは使用できません（Blazeプラン[従量課金]が必要）
- 大量のメッセージを同期する場合、処理に時間がかかる場合があります

## 開発者向け情報

### ビルド方法

#### Obsidianプラグインのビルド

```bash
# 依存関係のインストール
npm install

# 開発モード（自動コンパイル・ホットリロード）
npm run dev

# プロダクションビルド
npm run build

# または直接esbuildを使用
node esbuild.config.mjs production
```

#### Firebase Functionsのビルド・デプロイ

```bash
# functionsディレクトリに移動
cd functions

# 依存関係のインストール
npm install

# TypeScriptのコンパイル
npm run build

# Firebaseへのデプロイ
firebase deploy --only functions

# 特定の関数のみデプロイ
firebase deploy --only functions:lineWebhook,functions:syncNotes
```

#### テスト方法

1. **Obsidianプラグインのテスト**:
   - ビルドされた`main.js`、`manifest.json`、`styles.css`を
   - Obsidianの`.obsidian/plugins/line-memo-sync/`ディレクトリにコピー
   - （注意: フォルダ名は必ず`line-memo-sync`にしてください。manifest.jsonのIDと一致する必要があります）
   - Obsidianを再起動し、プラグインを有効化

2. **Firebase Functionsのテスト**:
   ```bash
   # エミュレーターの起動
   cd functions
   npm run serve

   # 特定の関数のテスト（例：syncNotes）
   curl http://localhost:5001/[PROJECT_ID]/asia-northeast1/syncNotes
   ```

### フォルダ構成

- `/functions`: Firebase Cloud Functions実装
- `/main.ts`: Obsidianプラグインのメインコード
- `/docs`: ドキュメント
- `/styles.css`: プラグインのスタイル定義
- `/manifest.json`: プラグインのメタデータ
- `/esbuild.config.mjs`: ビルド設定

### 開発環境のセットアップ

1. **前提条件**:
   - Node.js 18以上
   - npm 9以上
   - Firebase CLI (`npm install -g firebase-tools`)
   - Obsidian開発環境

2. **リポジトリのクローン**:
   ```bash
   git clone https://github.com/kamekamek/line-to-obsidian.git
   cd line-to-obsidian
   npm install
   ```

3. **開発用Obsidianプラグインのセットアップ**:
   - Obsidianの開発者モードを有効化（設定 > サードパーティプラグイン > 開発者モード）
   - プロジェクトフォルダを`.obsidian/plugins/line-memo-sync/`にシンボリックリンク
     （注意: フォルダ名は必ず`line-memo-sync`にしてください。manifest.jsonのIDと一致する必要があります）
   - または、ビルド後のファイルを手動でコピー

4. **Firebase開発環境のセットアップ**:
   ```bash
   cd functions
   npm install
   firebase login
   firebase use --add
   # プロジェクトIDを選択
   ```

## ライセンスと貢献

このプラグインはMITライセンスの下で公開されています。バグ報告や機能リクエスト、プルリクエストは大歓迎です。

## 謝辞

- [Obsidian](https://obsidian.md/)チームの素晴らしいアプリケーション
- [LINE Developers](https://developers.line.biz/)の充実したAPI
- [Firebase](https://firebase.google.com/)の柔軟なバックエンドサービス
- このプラグインの開発に貢献してくださったすべての方々

## 今後の予定

- 複数デバイスでの同期状態の共有
- 画像やファイルの同期
- タグ機能の強化
- 双方向同期（Obsidianからの変更をLINEに反映）

## バグ報告と機能リクエスト

バグや機能リクエストは[GitHub Issues](https://github.com/kamekamek/line-to-obsidian/issues)でお願いします。

## ライセンス

MIT

## 作者

Nagare Kameno

[GitHub](https://github.com/kamekamek) | [Twitter](https://x.com/usagi_kamechan)
