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

## V2移行プロジェクトメモ

Firebase Functions V1からV2への移行作業における注意点と実践的な対応方法をまとめます。

### 1. V2移行時の主な変更点

1. **インポート構文と関数定義方法の変更**
   - V1: `import * as functions from 'firebase-functions'`
   - V2: `import { onRequest } from 'firebase-functions/v2/https'`

2. **ロガーの参照変更**
   - V1: `functions.logger.info()`
   - V2: `logger.info()`（`import { logger } from 'firebase-functions'`）

3. **Expressアプリケーション連携方法**
   - V1: 単にExpressアプリをハンドラとして渡す
   - V2: **重要** - `app.listen(port, '0.0.0.0', () => {})`でポートリッスンが必要

### 2. 移行時のよくある問題と対処法

#### コンテナ起動のヘルスチェック失敗

```
Container Healthcheck failed. The user-provided container failed to start and listen on the port...
```

この問題は主にExpressアプリケーションが正しくポートをリッスンしていない場合に発生します。

**解決策：**
```typescript
// V2では必須
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  logger.info(`Server listening on port ${port}`);
});

export const myFunction = onRequest({ region: 'asia-northeast1' }, app);
```

#### 環境変数の取得方法の変更

- V1では`functions.config().xxx`で設定を取得
- V2では`process.env.XXX`を使用

**解決策：**
```typescript
// V1
const config = {
  key: functions.config().service?.key || '',
};

// V2
const config = {
  key: process.env.SERVICE_KEY || '',
};
```

#### 関数のタイムアウト設定

V2では明示的にタイムアウトを設定する必要がある場合があります。

**解決策：**
```typescript
export const functionName = onRequest({
  region: 'asia-northeast1',
  timeoutSeconds: 60,  // 明示的にタイムアウトを設定
}, handler);
```

### 3. デュアルデプロイ戦略

移行時は「V2」サフィックスを付けた関数を作成し、既存のV1関数と並行してデプロイすることをお勧めします。

```typescript
// V1関数はそのまま維持
export const myFunction = functions.region('asia-northeast1').https.onRequest(handler);

// V2関数は別名で追加
export const myFunctionV2 = onRequest({ region: 'asia-northeast1' }, handler);
```

これにより、問題発生時に素早くロールバック可能になります。

### 4. ロギングの強化

V2への移行時には、より詳細なログを出力することで問題のデバッグが容易になります。

```typescript
// 構造化ロギングを活用
logger.info('Function called', { 
  method: req.method, 
  query: req.query,
  path: req.path,
  timestamp: new Date().toISOString()
});
```

### 5. エミュレーターでのテスト重要性

V2関数の動作はエミュレーターでも十分テスト可能ですが、実環境とは若干の違いがあります。

```bash
# エミュレーター起動
firebase emulators:start

# 特定の関数だけテスト
firebase emulators:start --only functions
```

エミュレーターログを注意深く観察し、コンテナの起動と終了についての情報を確認しましょう。

### 6. デプロイ後の検証

デプロイ後は必ずcurlやPostmanなどで各エンドポイントを検証します。

```bash
# 基本的な動作確認
curl https://asia-northeast1-[PROJECT_ID].cloudfunctions.net/functionNameV2

# 認証が必要な場合
curl -H "Authorization: Bearer TOKEN" https://asia-northeast1-[PROJECT_ID].cloudfunctions.net/functionNameV2
```

これらの対策を講じることで、V2移行時の問題を最小限に抑え、スムーズな移行が可能になります。 