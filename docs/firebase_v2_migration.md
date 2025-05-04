# Firebase Functions V2への移行手順

## 概要

本プロジェクトでは、Firebase Functions V1からV2（Cloud Run関数）への移行を段階的に行います。このドキュメントでは、移行の手順と注意点について説明します。

## 移行のポイント

### 1. コード変更の概要

- インポート文の変更
  - V1: `import * as functions from 'firebase-functions'`
  - V2: `import { onRequest } from 'firebase-functions/v2/https'`と`import { logger } from 'firebase-functions'`

- 関数エクスポート形式
  - V1: `export const funcName = functions.region('region').https.onRequest()`
  - V2: `export const funcName = onRequest({ region: 'region' }, callback)`

- Express連携時の変更点
  - V2ではポートリスニングが必要: `app.listen(port, '0.0.0.0', () => {})`

### 2. 環境変数設定

V2では環境変数の設定方法が変わりました。以下の手順で設定します。

```bash
# シークレットの設定
firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
firebase functions:secrets:set LINE_CHANNEL_SECRET

# 確認
firebase functions:secrets:list
```

### 3. デプロイ方法

V1とV2の関数を共存させるため、関数名にV2サフィックスを付けて区別します。

```bash
# V2関数のみをデプロイ
firebase deploy --only functions:lineWebhookV2,functions:syncNotesV2,functions:cleanupSyncedV2,functions:resolveEndpointV2
```

または、付属のデプロイスクリプトを使用します：

```bash
chmod +x ./functions/deploy-v2.sh
./functions/deploy-v2.sh
```

## テスト手順

1. エミュレーターでの動作確認
```bash
firebase emulators:start
```

2. ローカルでのエンドポイントテスト
```bash
curl http://localhost:5001/[PROJECT_ID]/asia-northeast1/syncNotesV2
```

3. 段階的移行
   - まずはV2関数をデプロイし、動作確認
   - 問題がなければ、クライアント側を更新してV2関数を使用するように変更
   - 完全に移行できたら、V1関数を削除

## よくある問題と対処法

### 1. コンテナヘルスチェック失敗

エラーメッセージ:
```
Container Healthcheck failed. The user-provided container failed to start and listen on the port defined provided by the PORT=8080 environment variable
```

対処法:
- Expressアプリが正しくポートをリッスンしているか確認 (`app.listen(port, '0.0.0.0', ...)`)
- デプロイ前に必ずエミュレーターでテスト

### 2. 環境変数関連のエラー

エラーメッセージ:
```
Error: Missing required environment variables
```

対処法:
- シークレットが正しく設定されているか確認 (`firebase functions:secrets:list`)
- コード内で環境変数の存在チェックを実装

### 3. タイムアウト関連の問題

V2関数ではデフォルトのタイムアウト設定が変わることがあります。

対処法:
- 明示的にタイムアウト設定を指定: `onRequest({ timeoutSeconds: 60, ... })`

## ロールバック手順

問題が発生した場合は、以下の手順でV1関数に戻すことができます：

1. クライアント側で元のエンドポイントを使用するよう設定を戻す
2. 必要に応じてV1関数の再デプロイ: `firebase deploy --only functions:lineWebhook,functions:syncNotes,functions:cleanupSynced,functions:resolveEndpoint`

## 参考リンク

- [Firebase Functions V2 ドキュメント](https://firebase.google.com/docs/functions/beta)
- [Cloud Run 関数の概要](https://cloud.google.com/functions/docs/concepts/execution-environment)
- [Firebase Functions V2への移行ガイド](https://firebase.google.com/docs/functions/migrate-to-v2) 