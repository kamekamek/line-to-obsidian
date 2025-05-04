# 技術スタックとインフラ

このプロジェクトで使用される主要な技術スタックとインフラストラクチャについて説明します。

## バックエンド (Firebase)

- **Cloud Functions for Firebase:**
  - **役割:** サーバーレスバックエンドロジックの実行環境。
  - **言語:** TypeScript (推奨) または JavaScript。
  - **主な機能:** LINE Webhook処理、同期API (`syncNotes`)、定期クリーンアップ (`cleanupSynced`)。
  - **トリガー:** HTTPトリガー、Cloud Schedulerトリガー。
- **Firestore:**
  - **役割:** NoSQLデータベースとして、ユーザーマッピング情報とメモデータを格納。
  - **データモデル:** `docs/006_db.md` を参照。
  - **プラン:** Blazeプラン（従量課金）が必要（Cloud Functionsの外部ネットワークアクセス、Cloud Scheduler利用のため）。
- **Cloud Scheduler:**
  - **役割:** `cleanupSynced` 関数を定期的に実行するためのスケジューラ。
- **Firebase Hosting:**
  - **役割:** (将来的に) 静的な管理画面などをホスティングする場合に利用可能性あり。現時点では必須ではない。

## フロントエンド (Obsidian Plugin)

- **Obsidian API:**
  - **役割:** Obsidianの機能（設定画面、コマンド、ファイルシステムアクセスなど）を利用するためのAPI。
  - **言語:** TypeScript。
- **開発環境:**
  - **ビルドツール:** esbuild (Obsidianプラグイン開発で一般的)。
  - **パッケージ管理:** npm。
  - **UIフレームワーク:** Obsidian標準のUIコンポーネント、または必要に応じてReact/Svelte等 (現時点では不要)。

## 外部サービス・ライブラリ

- **LINE Messaging API:**
  - **役割:** LINE公式アカウントを通じてメッセージの送受信を行うためのAPI。
  - **Webhook:** LINEプラットフォームからのイベント通知を受信。
- **@line/bot-sdk:**
  - **役割:** LINE Messaging APIをNode.js環境で容易に扱うための公式SDK。
  - **主な利用箇所:** 署名検証、メッセージ応答など。

## セキュリティ

- **LINE署名検証:** WebhookリクエストがLINEプラットフォームから送信されたことを確認。
- **HTTPS:** Cloud FunctionsのエンドポイントはデフォルトでHTTPS。
- **Bearerトークン認証:** 同期API (`syncNotes`) へのアクセス制御。
- **Firestoreセキュリティルール:** データベースへのアクセス権を適切に設定（例: 認証されたユーザーのみ書き込み可能など）。