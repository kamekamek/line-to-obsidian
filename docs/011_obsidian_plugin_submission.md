# Obsidianプラグイン申請手順

## 前提条件
- GitHubアカウント
- 完成したObsidianプラグイン
- プラグインのリポジトリが公開されていること

## 申請前の準備

### 1. リポジトリを整理する
現在のLINE to Obsidianプラグインは、Firebase Functionsとプラグイン本体が混在しています。プラグイン申請のためには、**プラグイン専用のリポジトリ**を作成する必要があります。

**新しいリポジトリに含めるべきファイル**:
- `main.js` (コンパイル済みのプラグインコード)
- `main.ts` (ソースコード)
- `manifest.json` (プラグイン情報)
- `styles.css` (必要な場合)
- `README.md` (説明書)
- `LICENSE` (ライセンス情報)
- ビルドに必要な設定ファイル (package.json, tsconfig.json など)

### 2. リリースを作成する
1. GitHubリポジトリの「Releases」セクションで新しいリリースを作成
2. タグをバージョン番号と一致させる (例: `1.0.0`)
3. `manifest.json`のバージョン番号と一致していることを確認
4. リリースにはビルド済みの`main.js`が含まれていることを確認

### 3. README.mdを充実させる
以下の内容を含めることをお勧めします:
- プラグインの概要と機能説明
- インストール方法
- 使用方法
- Firebase Functionsの設定方法への参照
- スクリーンショットや使用例

## 申請手順

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

5. 承認後
   - プラグインがObsidianの公式プラグイン一覧に掲載
   - フォーラムのshowcaseセクションやDiscordの#updatesチャンネルで発表可能

## 現状からの対応方法

1. まず、現在のプロジェクトからObsidianプラグイン部分だけを抽出した新しいリポジトリを作成
   - 必要なファイル: main.ts, main.js, manifest.json, styles.css など

2. Firebase Functions部分は別のリポジトリとして管理するか、現在のリポジトリを維持

3. プラグインのREADME.mdには、Firebase Functionsの設定が必要であることを明記し、そのリポジトリへのリンクを追加

4. 上記の申請手順に従ってObsidianプラグインを申請

## 注意点
- プラグインはObsidianユーザーが簡単に使えるよう、十分なドキュメントを提供すること
- セキュリティに関する配慮が必要（特にFirebaseとの連携部分）
- 個人情報の取り扱いについての説明を明記すること 