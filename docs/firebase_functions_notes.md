# Firebase Functions V1とV2の違いに関するメモ

## 開発背景

本プロジェクトでは当初Firebase Functions V2（Cloud Run関数）を使用しようとしましたが、デプロイ時に問題が発生したため、V1形式に変更しました。

## V1とV2の主な違い

### 1. デプロイモデル
- **V1**: 従来の関数実行環境
- **V2**: Cloud Run上で実行（コンテナベース）

### 2. コード実装の違い
- **V1**:
  ```typescript
  export const functionName = functions.region('asia-northeast1').https.onRequest((req, res) => {
    // 処理
  });
  ```
- **V2**:
  ```typescript
  import { onRequest } from 'firebase-functions/v2/https';
  
  export const functionName = onRequest({ region: 'asia-northeast1' }, (req, res) => {
    // 処理
  });
  ```

### 3. Express.jsアプリケーションとの統合
- **V1**: 直接Expressアプリをハンドラに渡すことができる
  ```typescript
  export const api = functions.region('asia-northeast1').https.onRequest(app);
  ```
- **V2**: ポートリスニングの設定が必要
  ```typescript
  // 必要なコード
  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
  
  export const api = onRequest({ region: 'asia-northeast1' }, app);
  ```

## 本プロジェクトでの対応

当初V2形式を試みましたが、以下のエラーが発生しました：
```
Container Healthcheck failed. The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable
```

解決策として、以下の2つのアプローチがありました：

1. V2形式を使用し、ポートリスニングを追加する
2. V1形式に戻す

本プロジェクトでは安定性と確実性を重視し、V1形式を採用しました。

### 現在の実装方針

- 各エンドポイントごとに独立したCloud Functionsを実装
- `lineWebhook`, `syncNotes`, `cleanupSynced` としてそれぞれデプロイ
- アクセスパスは自動的に設定（例: `/syncNotes`）

## 一般的なV2デプロイ問題と対処法

V2（Cloud Run関数）でよく発生する問題と対処法をまとめます。特に以下のエラーが発生した場合の対応策です：

```
Container called exit(1)
Default STARTUP TCP probe failed [...] consecutively for container "worker" on port 8080
```

これらのエラーは、コンテナが起動直後に終了し、Cloud Runのスタートアッププローブがポート8080での接続を検出できないことを示しています。

### 1. アプリケーションの即時クラッシュ（exit(1)）

#### 可能性のある原因：
- **依存モジュールの読み込み失敗**: npm installの実行漏れやモジュール不足
- **エントリポイントの誤り**: package.jsonのmain設定やDockerfileのCMD/ENTRYPOINTの誤設定

#### 対策：
- `firebase emulators:start --only functions`を実行し、例外スタックトレースを確認
- Dockerコンテナを手動起動し、ログを確認

### 2. ポート未リッスンによるプローブ失敗

#### 可能性のある原因：
- **環境変数PORT非対応**: 固定ポート指定やローカルホストのみのリッスン
- **ネットワークインターフェース誤設定**: 127.0.0.1でのみリッスンし、外部からアクセス不可

#### 対策：
- Expressアプリの場合は、明示的にインターフェースとポートを指定：
  ```javascript
  const port = process.env.PORT || 8080;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Listening on ${port}`);
  });
  ```
- Firebase Functions V2では`onRequest()`を使用して自動バインド

### 3. コンテナイメージの互換性問題

#### 可能性のある原因：
- **プラットフォーム・アーキテクチャ不整合**: ARM/x86_64のミスマッチ

#### 対策：
- Cloud Buildでマルチプラットフォーム対応のビルドを設定
- `docker buildx build --platform=linux/amd64`でAMD64イメージを生成

### 4. その他の考慮点

- **起動時間の最適化**: 初期化処理を軽量化
- **ファイルシステムの文字コード**: UTF-8を使用
- **環境変数/Secretsの設定確認**
- **Cloud Runリソース制限の調整**: CPUやメモリ不足による終了を防止

## 将来の展望

将来的にNodeランタイムのアップグレードが必要な場合（現在はNode.js 18）、V2への移行を再検討する必要があります。その際は：

1. ポートリスニングを正しく設定
2. Cloud Run環境向けの最適化を検討
3. メモリやCPUリソースの調整が可能

## 参考リンク

- [Firebase Functions V2 ドキュメント](https://firebase.google.com/docs/functions/beta)
- [Cloud Run 関数の概要](https://cloud.google.com/functions/docs/concepts/execution-environment)
- [Firebase Functions V2への移行ガイド](https://firebase.google.com/docs/functions/migrate-to-v2) 