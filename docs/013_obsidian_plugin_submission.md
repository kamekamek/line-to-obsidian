# Obsidianプラグイン申請手順 (現在のリポジトリ構造を維持)

## 前提条件
- GitHubアカウント
- 完成したObsidianプラグイン
- プラグインのリポジトリが公開されていること

## 現在のリポジトリ構造を維持する場合の申請手順

### 1. リポジトリの整理と必要ファイルの確認

現在のリポジトリ構造（Firebase FunctionsとObsidianプラグインが混在）を維持したまま申請することも可能です。参考として[onikun94/line_to_obsidian](https://github.com/onikun94/line_to_obsidian)では、バックエンド（Cloudflare Workers）とObsidianプラグインを単一のリポジトリで管理しています。

**リポジトリのルートに必要なファイル**:
- `manifest.json` (プラグイン情報)
- `main.js` (コンパイル済みのプラグインコード)
- `styles.css` (必要な場合)
- `README.md` (説明書)
- `versions.json` (バージョン互換性情報)
- `LICENSE` (ライセンス情報)

Firebase Functionsのコードは `functions/` ディレクトリに維持したままで問題ありません。

### 2. README.mdの充実

READMEは特に重要です。以下の内容を含める必要があります：

```md
# LINE to Obsidian

ObsidianとLINEを連携させるプラグインです。LINEからメッセージを送信すると、Obsidianのノートとして保存されます。

## 重要なセキュリティとプライバシーについて

**このプラグインは、LINEとObsidianを連携させるためにFirebase Functionsを利用します。**

* 送信されたメッセージはサーバー上で処理されますが、同期完了後は削除されます
* プライバシーに配慮した設計ですが、機密性の高い情報の送信は避けることを強く推奨します
* LINEのメッセージはFirebase Functionsを通じて処理され、Obsidianに転送されます

## 機能

* LINEで送信したメッセージを自動的にObsidianのノートとして保存
* テキスト、画像、その他のメディアに対応
* 定期的な同期機能

## セットアップ方法

### 1. Obsidianプラグインのインストール
(...インストール手順...)

### 2. Firebase環境の設定（開発者向け）
プラグインを使用するだけなら、この設定は不要です。独自のFirebase環境を構築したい場合：
1. Firebaseプロジェクトを作成
2. LINE Messaging APIの設定
3. Firebase Functionsのデプロイ
詳細は「functions/README.md」を参照してください。

(... その他の内容 ...)
```

### 3. リリースの作成

1. GitHubリポジトリの「Releases」セクションで新しいリリースを作成
2. タグをバージョン番号と一致させる (例: `1.0.0`)
3. `manifest.json`のバージョン番号と一致していることを確認
4. リリースにはビルド済みの`main.js`が含まれていることを確認

### 4. 申請手順

1. [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)リポジトリをフォーク

2. フォークした`community-plugins.json`ファイルに以下の形式でプラグイン情報を追加:
   ```json
   {
     "id": "line-to-obsidian",
     "name": "LINE to Obsidian",
     "author": "Nagare Kameno",
     "description": "LINEのメッセージをWebhookで受信し、Obsidianのノートとして同期するプラグイン",
     "repo": "あなたのGitHubユーザー名/リポジトリ名"
   }
   ```

3. プルリクエストを作成
   - PRのタイトルは「Add plugin: LINE to Obsidian」などわかりやすいものに
   - 説明には、プラグインの概要、ユースケース、特別な設定要件などを記載

4. レビュー待ち
   - Obsidianチームがプラグインをレビュー
   - 修正依頼があれば対応

## 注意点と対応方法

1. **プライバシーとデータ処理**: バックエンド部分（Firebase Functions）がユーザーデータを処理することから、プライバシーポリシーと情報の取り扱い方法を明示的に説明する必要があります。

2. **コード整理**: レビュー前に以下を確認してください：
   - 不要なコメントやデバッグコードの削除
   - セキュリティリスクとなるトークンや鍵が含まれていないか確認
   - 機能の範囲が明確に定義されているか

3. **セキュリティ考慮事項**:
   - LINE Webhookのエンドポイントは適切に保護されているか
   - ユーザー認証の仕組みは安全か
   - データの保存期間とポリシーが明確か

4. **ドキュメント**:
   - 必要に応じてFunctionsのREADMEも更新
   - セットアップ手順を明確に
   - ユーザー向けと開発者向けの説明を区別 