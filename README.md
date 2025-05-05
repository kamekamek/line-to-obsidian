# LINE to Obsidian プラグイン

LINE to Obsidianは、LINEチャットで送信したメッセージをObsidianのノートとして自動的に同期するためのプラグインです。

![LINEメモ同期デモ](https://github.com/kamekamek/line-to-obsidian/raw/master/images/demo.gif)

- LINEで素早くメモを記録
- ObsidianのSecond Brainに自動的に同期
- マークダウン形式でメモを保存

## 機能

- LINEアプリからObsidianへのシームレスなメモ同期
- Firebaseバックエンドによる安全なデータ連携
- 認証トークンによるセキュリティ保護
- 同期フォルダのカスタマイズ
- 自動的なファイル名生成とコンテンツ保存

## スクリーンショット

| 設定画面 | 同期されたメモ | LINE Botとのやり取り |
|--------|-------------|-------------------|
| ![設定画面](https://github.com/kamekamek/line-to-obsidian/raw/master/images/settings.png) | ![同期メモ](https://github.com/kamekamek/line-to-obsidian/raw/master/images/synced_notes.png) | ![LINE Bot](https://github.com/kamekamek/line-to-obsidian/raw/master/images/line_chat.png) |

## セットアップ手順

### 前提条件

- Obsidian（バージョン0.15.0以上）
- Firebase プロジェクト（Firestore, Cloud Functions）
- LINE Developer アカウント

### インストール

#### Obsidianプラグインの導入

1. Obsidianの設定（Settings）を開く
2. 「サードパーティプラグイン（Community plugins）」を選択
3. 「LINE to Obsidian」を検索
4. 「インストール」をクリックし、その後「有効化」する

または、手動インストール：

1. プラグインファイル（`main.js`, `manifest.json`, `styles.css`）をダウンロード
2. Obsidianのプラグインフォルダ（`<vault>/.obsidian/plugins/line-to-obsidian/`）に配置
3. Obsidianを再起動し、設定からプラグインを有効化

#### Firebase バックエンドの設定

1. [Firebase Console](https://console.firebase.google.com/)で新しいプロジェクトを作成
2. Firestoreデータベースを作成（Blazeプラン必須）
3. Cloud Functionsを有効化
4. GitHubリポジトリから`functions`フォルダをダウンロード
5. 以下のコマンドでデプロイ:
   ```bash
   cd functions
   npm install
   firebase login
   firebase deploy --only functions
   ```

#### LINE Bot の設定

1. [LINE Developers Console](https://developers.line.biz/)で新しいプロバイダーとチャネル（Messaging API）を作成
2. Webhookを有効化し、URLを設定（例: `https://asia-northeast1-<project-id>.cloudfunctions.net/lineWebhook`）
3. 応答メッセージを無効化（推奨）
4. チャネルアクセストークン（長期）を発行し保存

5. 以下のコマンドでLINE Bot設定をFirebaseに登録:
   ```bash
   firebase functions:config:set line.channel_secret="YOUR_CHANNEL_SECRET" line.channel_access_token="YOUR_CHANNEL_ACCESS_TOKEN"
   firebase deploy --only functions
   ```

### プラグインの設定

1. Obsidianのプラグイン設定で「LINE to Obsidian」を開く
2. 以下の情報を入力:
   - 接続コード: LINE Botから受け取ったコード（登録手順参照）
   - 認証トークン: LINE Botから受け取ったトークン（登録手順参照）
   - 同期フォルダパス: メモを保存するフォルダ（例: `LINE Memos`）
3. 設定を保存

## 使い方

### 初期登録

1. LINEアプリでBot公式アカウントを友だち追加
2. Botに「#登録」と送信
3. Botから返信される接続コードと認証トークンをメモ
4. Obsidianプラグイン設定画面で接続コードと認証トークンを入力

### メモの作成と同期

1. LINEチャットでBotにテキストメッセージを送信
2. Obsidianで以下のいずれかの方法で同期を実行:
   - コマンドパレットから「LINE to Obsidian: Sync Memos」を選択
   - リボンアイコン（サイドバー）をクリック
   - 設定画面の「Sync Now」ボタンをクリック
3. 同期が完了すると、指定したフォルダにメモが作成されます

### メモの整理

- 同期されたメモは自動的に日付とプレビューを含むファイル名で作成
- メモには作成日時やソース情報を含むYAMLフロントマターが付加
- 通常のObsidianノートと同様に編集、タグ付け、リンクが可能

## よくある質問（FAQ）

### Q: LINEメッセージが同期されません
A: 以下を確認してください：
- LINE BotのWebhook URLが正しく設定されているか
- 接続コードと認証トークンが正確に入力されているか
- Firebase Functionsが正常に動作しているか（Firebaseコンソールでログを確認）

### Q: 同期したメモが重複して作成されます
A: 同期タイムスタンプが正しく更新されていない可能性があります。一度同期した後に設定を開き、Last Sync Timestampが更新されているか確認してください。

### Q: ファイル名の形式を変更できますか？
A: 現在のバージョンでは設定からの変更はできませんが、ソースコードを修正することで可能です。`main.ts`の`syncNotes`関数内でファイル名生成ロジックを編集してください。

### Q: 画像やファイルも同期できますか？
A: 現在のバージョンではテキストメッセージのみ対応しています。画像やファイル添付は将来のアップデートで検討しています。

## セキュリティとプライバシーに関する重要事項

このプラグインは、LINEとObsidianを連携させるためにFirebase Functionsをバックエンドとして利用します。そのため、以下のプライバシーとデータ処理に関する重要な情報をご確認ください：

- **データの処理と保存**: 
  - LINEから送信されたメッセージは一時的にFirebaseサーバー上で処理されます
  - 同期が完了すると、サーバー上のメッセージデータは自動的に削除されます
  - すべてのデータはFirebaseのセキュリティルールによって保護されています

- **プライバシー配慮**: 
  - LINEのユーザーIDとObsidianプラグインの認証は1対1で厳密に管理されています
  - 第三者がメッセージにアクセスすることはできません
  - 機密性の高い情報や個人情報の送信は避けることを強く推奨します

- **認証と安全性**:
  - 接続コードと認証トークンによる二段階の認証システムを採用
  - すべてのAPIリクエストはBearer認証トークンで保護
  - 古い接続情報は定期的に自動クリーンアップされます

- **データの所有権**:
  - 同期されたメッセージはあなたのObsidian Vault内にのみ保存されます
  - サーバー上のデータは同期後に削除され、長期保存されることはありません
  - このプラグインはユーザーの統計情報やメタデータを収集しません

当プラグインはプライバシーを重視し、必要最小限のデータ処理のみを行うよう設計されていますが、インターネットを介したデータの送受信には常に一定のリスクが伴うことをご理解ください。

## バックエンド構成

このプラグインは以下のコンポーネントで構成されています:

1. **LINEボット**: メッセージを受け取り、Webhookを通じてFirebaseに送信
2. **Firebase Cloud Functions**:
   - `lineWebhook`: LINEからのメッセージを受信し、Firestoreに保存
   - `syncNotes`: ObsidianプラグインからのAPI呼び出しに応答、未同期メモを提供
   - `cleanupSynced`: 古い同期済みメモを定期的に削除
   - `cleanupOldConnectionCodes`: 古い接続コードを削除
   - `cleanupOldMappings`: 古いマッピング情報を削除
3. **Firestore**: メモデータとマッピング情報を保存

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

[GitHub](https://github.com/kamekamek) | [Twitter](https://twitter.com/kamekamek)
