# プロジェクト構成

このプロジェクトは、以下のコンポーネントで構成されます。

## 1. Obsidianプラグイン

```
obsidian-plugin/
├── src/
│   ├── main.ts               # プラグインのメインエントリーポイント
│   ├── server/              # ローカルサーバー関連
│   │   ├── localServer.ts   # HTTPサーバーの実装
│   │   └── handlers.ts      # リクエストハンドラー
│   ├── types/              # 型定義
│   │   ├── settings.ts     # 設定の型定義
│   │   └── messages.ts     # メッセージの型定義
│   └── utils/              # ユーティリティ関数
│       ├── auth.ts         # 認証関連
│       └── file.ts         # ファイル操作関連
├── styles.css              # スタイルシート
├── manifest.json           # プラグイン情報
├── package.json           # 依存関係
└── tsconfig.json         # TypeScript設定
```

### 主要ファイルの役割

#### main.ts
- プラグインのライフサイクル管理
- 設定画面の実装
- ローカルサーバーの起動/停止
- ファイル保存ロジック

#### server/localServer.ts
- ローカルHTTPサーバーの実装
- ポート管理
- リクエスト受付とルーティング
- エラーハンドリング

#### server/handlers.ts
- Webhook受信処理
- メッセージのパース
- 認証チェック
- レスポンス生成

## 2. Cloudflare Workersプロキシ

```
cloudflare-worker/
├── src/
│   ├── index.ts           # Workerのエントリーポイント
│   ├── line.ts           # LINE署名検証
│   └── proxy.ts          # プロキシロジック
├── wrangler.toml         # Worker設定
└── package.json         # 依存関係
```

### 主要ファイルの役割

#### index.ts
- リクエスト受付
- エラーハンドリング
- レスポンス返却

#### line.ts
- LINE Webhookの署名検証
- メッセージバリデーション

#### proxy.ts
- ローカルサーバーへの転送ロジック
- リトライ処理
- エラー処理

## 3. ドキュメント (`docs/`)

```
docs/
├── 000_overview.md          # プロジェクト概要
├── 000_new_architecture.md  # 新アーキテクチャ設計
├── 001_pages.md            # UI設計
├── 002_api.md              # API仕様
├── 003_structure.md        # プロジェクト構成（本文書）
├── 011_test_plan.md        # テスト計画
├── 013_obsidian_plugin_submission.md  # プラグイン提出ガイド
└── 014_privacy_security.md  # プライバシーとセキュリティ
```

## 4. ルートディレクトリ

- `README.md`: プロジェクトの説明と使用方法
- `.gitignore`: Git除外設定
- その他の設定ファイル

## コードの責務分離

### 1. プラグイン層
- Obsidian APIとの統合
- ユーザーインターフェース
- 設定管理
- ファイルシステム操作

### 2. サーバー層
- HTTPリクエスト処理
- 認証・認可
- エラーハンドリング
- メッセージバリデーション

### 3. プロキシ層
- LINE Webhook受信
- 署名検証
- メッセージ転送
- エラー処理

## 開発ガイドライン

1. **コード品質**
   - TypeScriptの厳格モード使用
   - ESLintによるコード品質管理
   - Prettierによるコードフォーマット

2. **セキュリティ**
   - 入力値の適切なバリデーション
   - 認証トークンの安全な管理
   - エラーメッセージでの機密情報漏洩防止

3. **エラーハンドリング**
   - 適切なエラーログ
   - ユーザーフレンドリーなエラーメッセージ
   - 障害時の適切な回復処理

4. **テスト**
   - ユニットテストの作成
   - 統合テストの実施
   - エッジケースの考慮

## ビルドとデプロイ

1. **プラグイン**
   ```bash
   npm install
   npm run build
   ```

2. **Cloudflare Workers**
   ```bash
   cd cloudflare-worker
   npm install
   wrangler publish
   ```

## 開発環境のセットアップ

1. Node.js環境の準備
2. 開発ツールのインストール
3. 依存関係のインストール
4. 環境変数の設定

詳細な手順は`README.md`を参照してください。