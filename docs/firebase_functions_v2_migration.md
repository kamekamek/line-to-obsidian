# Firebase Functions v2移行チェックリスト

## 1. 準備作業
- [ ] 現在のFunctions実装を確認し、V1からV2への変換が必要な箇所をリストアップ
- [ ] テスト用Firebaseプロジェクトの作成（または既存のテスト環境の確認）
- [ ] ローカル開発環境のセットアップ確認（Node.jsバージョン、Firebase CLIなど）
- [ ] 依存関係の確認とアップデート（package.jsonの確認）

## 2. コード変換
- [ ] インポート文の変更（`firebase-functions/v2`への変更）
- [ ] 関数定義の変更（`onRequest`形式への変更）
- [ ] リージョン設定の修正（`region: 'asia-northeast1'`形式への変更）
- [ ] Expressアプリケーションの場合、ポートリスニングの追加
```typescript
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});
```
- [ ] 環境変数の設定方法の見直し

## 3. ローカルテスト
- [ ] エミュレータでの動作確認
```
firebase emulators:start --only functions
```
- [ ] 各エンドポイントのローカルテスト（`lineWebhook`, `syncNotes`, `cleanupSynced`など）
- [ ] エラーハンドリングの確認
- [ ] ログ出力の確認

## 4. テスト環境へのデプロイ
- [ ] テスト環境の選択
```
firebase use [テスト環境のプロジェクト名]
```
- [ ] 1つの関数のみを先にデプロイ
```
firebase deploy --only functions:[関数名]
```
- [ ] デプロイログの確認（エラーがないか）
- [ ] コンテナのヘルスチェック結果の確認

## 5. テスト環境での検証
- [ ] 各エンドポイントのリクエスト/レスポンステスト
- [ ] パフォーマンスの確認（コールドスタート時間など）
- [ ] エラー発生時のログ確認方法の準備
- [ ] 長時間実行や負荷テスト（必要に応じて）

## 6. 問題対応
- [ ] コンテナヘルスチェック失敗時の対応策
  - [ ] ポートリスニング設定の確認
  - [ ] ネットワークインターフェース設定の確認（`0.0.0.0`でリッスンしているか）
  - [ ] リソース制限の調整（メモリ/CPU）
- [ ] 環境固有の問題に対する対応策の準備

## 7. 本番移行準備
- [ ] テスト環境での全関数のデプロイと検証
- [ ] ロールバック計画の作成（問題発生時にV1に戻す手順）
- [ ] 移行スケジュールの作成
- [ ] ドキュメントの更新（変更点、新しい設定方法など）

## 8. 本番デプロイ
- [ ] 本番環境の選択
```
firebase use [本番環境のプロジェクト名]
```
- [ ] 段階的デプロイ（リスクの低い関数から）
- [ ] デプロイ後の動作確認
- [ ] モニタリングの強化（一定期間）

## 9. 事後評価
- [ ] パフォーマンス評価（V1との比較）
- [ ] コスト評価
- [ ] 今後の最適化ポイントの特定

## V1からV2への変換例

### HTTPSトリガー関数
**V1:**
```typescript
export const functionName = functions.region('asia-northeast1').https.onRequest((req, res) => {
  // 処理
});
```

**V2:**
```typescript
import { onRequest } from 'firebase-functions/v2/https';

export const functionName = onRequest({ region: 'asia-northeast1' }, (req, res) => {
  // 処理
});
```

### Expressアプリケーション
**V1:**
```typescript
export const api = functions.region('asia-northeast1').https.onRequest(app);
```

**V2:**
```typescript
import { onRequest } from 'firebase-functions/v2/https';

const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});

export const api = onRequest({ region: 'asia-northeast1' }, app);
```

### 環境変数の設定
**V1:**
```typescript
functions.config().myservice.key
```

**V2:**
```typescript
process.env.MYSERVICE_KEY
```

## トラブルシューティング

### よくある問題と解決策

1. **コンテナヘルスチェック失敗**
   - 症状: `Container Healthcheck failed`
   - 解決策: ポートリスニングが正しく設定されているか確認

2. **起動時エラー**
   - 症状: `Container called exit(1)`
   - 解決策: ログを確認し、起動時の例外を特定して修正

3. **タイムアウト**
   - 症状: 関数の実行が長すぎる
   - 解決策: タイムアウト設定を調整 `{ timeoutSeconds: 540 }`

## 参考資料
- [Firebase Functions V2 ドキュメント](https://firebase.google.com/docs/functions/get-started)
- [Cloud Run 関数のトラブルシューティング](https://cloud.google.com/run/docs/troubleshooting)
- [Firebase CLI リファレンス](https://firebase.google.com/docs/cli)
- [Firebase Functions V2への移行ガイド](https://firebase.google.com/docs/functions/migrate-to-v2) 