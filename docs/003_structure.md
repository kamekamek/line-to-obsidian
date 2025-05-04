# プロジェクト構成

このプロジェクトは、主に以下のコンポーネントで構成されます。

## 1. Firebase Cloud Functions (バックエンド)

- **役割:** LINEからのWebhook受信、メモのFirestoreへの保存、Obsidianプラグインへのデータ同期API提供、定期的なデータクリーンアップを担当します。
- **想定されるファイル構成 (例):**
  ```
  functions/
  ├── src/
  │   ├── index.ts         # Cloud Functionsのエントリーポイント
  │   ├── lineWebhook.ts   # LINE Webhook処理
  │   ├── syncNotes.ts     # 同期API処理
  │   ├── cleanupSynced.ts # クリーンアップ処理
  │   └── utils/           # 共通関数など
  ├── package.json
  ├── tsconfig.json
  └── .firebaserc
  ```

## 2. Obsidian Plugin (フロントエンド)

- **役割:** ユーザー設定の管理、同期APIの呼び出し、取得したメモのローカルVaultへの保存を担当します。
- **現在のファイル構成 (`obsidian-sample-plugin/`):**
  ```
  obsidian-sample-plugin/
  ├── main.ts          # プラグインのエントリーポイント、設定タブ、コマンド登録
  ├── manifest.json    # プラグイン情報
  ├── styles.css       # スタイルシート (必要に応じて)
  ├── esbuild.config.mjs # ビルド設定
  ├── package.json
  └── tsconfig.json
  ```

## 3. ドキュメント (`docs/`)

- **役割:** プロジェクトの設計、仕様、開発プロセスに関する情報を集約します。
- **ファイル構成:**
  ```
  docs/
  ├── 000_overview.md     # プロジェクト概要
  ├── 001_pages.md        # 画面設計 (Obsidian設定画面)
  ├── 002_api.md          # API仕様
  ├── 003_structure.md    # プロジェクト構成 (このファイル)
  ├── 004_techStack.md    # 技術スタック・インフラ
  ├── 005_research.md     # 調査事項
  ├── 006_db.md           # DB設計 (Firestore)
  ├── 007_infra.md        # (004に統合)
  ├── 008_core.md         # コアロジック
  ├── 009_tasks.md        # 開発タスク
  └── 010_other.md        # その他
  ```

## 4. ルートディレクトリ

- `REQUIREMENT.md`: プロジェクトの初期要件定義。
- `.gitignore`, etc.: プロジェクト全体の設定ファイル。