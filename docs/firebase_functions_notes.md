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

## 将来の展望

将来的にNodeランタイムのアップグレードが必要な場合（現在はNode.js 18）、V2への移行を再検討する必要があります。その際は：

1. ポートリスニングを正しく設定
2. Cloud Run環境向けの最適化を検討
3. メモリやCPUリソースの調整が可能

## 参考リンク

- [Firebase Functions V2 ドキュメント](https://firebase.google.com/docs/functions/beta)
- [Cloud Run 関数の概要](https://cloud.google.com/functions/docs/concepts/execution-environment)
- [Firebase Functions V2への移行ガイド](https://firebase.google.com/docs/functions/migrate-to-v2) 