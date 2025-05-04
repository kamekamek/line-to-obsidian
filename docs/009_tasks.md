# 開発タスクリスト

`REQUIREMENT.md` の実現計画に基づき、主要な開発タスクをリストアップします。

## フェーズ1: バックエンド構築 (Firebase)

-   [ ] Firebaseプロジェクト作成と設定
    -   [ ] プロジェクト作成
    -   [ ] Blazeプラン有効化
    -   [ ] Firestoreデータベース作成
-   [ ] Firestoreコレクション設計とセキュリティルール設定
    -   [ ] `mappings` コレクション設計・ルール設定
    -   [ ] `notes` コレクション設計・ルール設定
-   [ ] Cloud Functions実装 (`functions/`)
    -   [ ] 開発環境セットアップ (TypeScript, npm, Firebase CLI)
    -   [ ] `lineWebhook` 関数の実装
        -   [ ] LINE SDK (`@line/bot-sdk`) 導入
        -   [ ] 署名検証ロジック実装
        -   [ ] `#登録` メッセージ処理 (Firestore `mappings` 書き込み)
        -   [ ] テキストメモ保存処理 (Firestore `notes` 書き込み)
        -   [ ] エラーハンドリングとロギング
    -   [ ] `syncNotes` 関数の実装
        -   [ ] Bearerトークン認証ロジック実装
        -   [ ] `mappings` から `lineUserId` 取得ロジック
        -   [ ] `notes` から未同期メモ取得クエリ (sinceパラメータ対応)
        -   [ ] JSONレスポンス生成
        -   [ ] 同期後処理 (`synced` 更新 or 削除)
        -   [ ] エラーハンドリングとロギング
    -   [ ] `cleanupSynced` 関数の実装
        -   [ ] 定期実行トリガー設定 (Cloud Scheduler)
        -   [ ] 古い同期済みメモの削除ロジック
        -   [ ] エラーハンドリングとロギング
-   [ ] Cloud Functionsデプロイと動作確認
    -   [ ] 環境変数設定 (LINEチャネルシークレット等)
    -   [ ] 各関数のデプロイ
    -   [ ] Postman等でのエンドポイントテスト

## フェーズ2: フロントエンド構築 (Obsidian Plugin)

-   [ ] Obsidianプラグイン開発環境セットアップ (`obsidian-sample-plugin/`)
    -   [ ] テンプレートからの初期化
    -   [ ] 依存関係インストール (npm)
-   [ ] 設定画面の実装 (`main.ts`)
    -   [ ] API Endpoint URL入力フィールド
    -   [ ] Authentication Token入力フィールド (パスワード形式)
    -   [ ] Sync Folder Path入力フィールド
    -   [ ] Last Sync Timestamp表示 (読み取り専用)
    -   [ ] 設定値の保存・読み込みロジック
-   [ ] 同期コマンドの実装 (`main.ts`)
    -   [ ] コマンドパレットへの登録
    -   [ ] 設定画面への「Sync Now」ボタン追加
    -   [ ] `syncNotes` API呼び出しロジック (fetch API)
        -   [ ] Bearerトークン付与
        -   [ ] `since` パラメータ付与 (lastSync利用)
    -   [ ] レスポンス解析 (JSON)
    -   [ ] メモデータのMarkdownファイル書き込みロジック (Obsidian API `vault.create`)
        -   [ ] ファイル名生成ルール
        -   [ ] 指定フォルダへの保存
    -   [ ] `lastSync` タイムスタンプ更新ロジック
    -   [ ] エラーハンドリングとユーザー通知 (Obsidian API `Notice`)
-   [ ] プラグインビルドとローカルテスト

## フェーズ3: テストとドキュメント

-   [ ] 統合テスト
    -   [ ] LINEメッセージ送信 → Firestore保存 → Obsidian同期 → ファイル生成 の一連の流れを確認
    -   [ ] 境界値テスト（sinceパラメータ、大量データなど）
    -   [ ] エラーケーステスト
-   [ ] ドキュメント整備 (`docs/`)
    -   [ ] 各ドキュメントの最終確認と更新
    -   [ ] README.md の作成 (使い方、セットアップ手順など)
-   [ ] (任意) Community Store申請準備

## フェーズ4: その他

-   [ ] コードリファクタリング
-   [ ] パフォーマンスチューニング (必要に応じて)