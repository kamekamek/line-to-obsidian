# 開発タスクリスト

`REQUIREMENT.md` の実現計画に基づき、主要な開発タスクをリストアップします。

## フェーズ1: バックエンド構築 (Firebase)

-   [x] Firebaseプロジェクト作成と設定
    -   [x] プロジェクト作成
    -   [x] Blazeプラン有効化
    -   [x] Firestoreデータベース作成
    -   [x] Firebase CLI初期化（Firestore, Functions, Emulators）
-   [x] Firestoreコレクション設計とセキュリティルール設定
    -   [x] `mappings` コレクション設計・ルール設定
    -   [x] `notes` コレクション設計・ルール設定
-   [x] Cloud Functions実装 (`functions/`)
    -   [x] 開発環境セットアップ (TypeScript, npm, Firebase CLI)
    -   [x] `lineWebhook` 関数の実装
        -   [x] LINE SDK (`@line/bot-sdk`) 導入
        -   [x] 署名検証ロジック実装
        -   [x] `#登録` メッセージ処理 (Firestore `mappings` 書き込み)
        -   [x] テキストメモ保存処理 (Firestore `notes` 書き込み)
        -   [x] エラーハンドリングとロギング
    -   [x] `syncNotes` 関数の実装
        -   [x] Bearerトークン認証ロジック実装
        -   [x] `mappings` から `lineUserId` 取得ロジック
        -   [x] `notes` から未同期メモ取得クエリ (sinceパラメータ対応)
        -   [x] JSONレスポンス生成
        -   [x] 同期後処理 (`synced` 更新 or 削除)
        -   [x] エラーハンドリングとロギング
    -   [x] `cleanupSynced` 関数の実装
        -   [x] 定期実行トリガー設定 (HTTP関数として実装)
        -   [x] 古い同期済みメモの削除ロジック
        -   [x] エラーハンドリングとロギング
-   [x] Cloud Functionsデプロイと動作確認
    -   [x] 環境変数設定 (LINEチャネルシークレット等)
    -   [x] 各関数のデプロイ
    -   [x] Postman等でのエンドポイントテスト

## フェーズ2: フロントエンド構築 (Obsidian Plugin)

-   [ ] Obsidianプラグイン開発環境セットアップ (`obsidian-sample-plugin/`)
    -   [ ] テンプレートからの初期化
    -   [ ] 依存関係インストール (npm)
-   [x] 設定画面の実装 (`main.ts`)
    -   [x] API Endpoint URL入力フィールド
    -   [x] Authentication Token入力フィールド (パスワード形式)
    -   [x] Sync Folder Path入力フィールド
    -   [x] Last Sync Timestamp表示 (読み取り専用)
    -   [x] 設定値の保存・読み込みロジック
-   [x] 同期コマンドの実装 (`main.ts`)
    -   [x] コマンドパレットへの登録
    -   [x] 設定画面への「Sync Now」ボタン追加
    -   [x] `syncNotes` API呼び出しロジック (fetch API)
        -   [x] Bearerトークン付与
        -   [x] `since` パラメータ付与 (lastSync利用)
    -   [x] レスポンス解析 (JSON)
    -   [x] メモデータのMarkdownファイル書き込みロジック (Obsidian API `vault.create`)
        -   [x] ファイル名生成ルール
        -   [x] 指定フォルダへの保存
    -   [x] `lastSync` タイムスタンプ更新ロジック
    -   [x] エラーハンドリングとユーザー通知 (Obsidian API `Notice`)
-   [ ] プラグインビルドとローカルテスト

## フェーズ2.5: 課題修正 (優先度高)

-   [ ] [必須] ファイル名衝突の修正 (ミリ秒やUUID等で一意性を保証 / 関連: `008_core.md` のファイル名生成ルール, `main.ts`)
-   [ ] [必須] Path Traversal 脆弱性の対策 (パス正規化・検証 / 関連: `main.ts`)
-   [ ] [必須] `lastSync` 更新ロジック修正 (失敗時は更新しない、APIデータ基準のタイムスタンプ使用 / 関連: `main.ts`)
-   [ ] [推奨] APIエラーハンドリング詳細化 (関連: `main.ts`)
-   [ ] [推奨] 個別ノート保存失敗時の通知改善 (関連: `main.ts`)
-   [ ] [任意] セキュリティ: 認証トークンの保存方法検討

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