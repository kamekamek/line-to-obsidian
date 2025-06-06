# その他

このドキュメントには、他のカテゴリに分類されない補足情報、メモ、検討事項などを記述します。

例:
- 将来的な拡張機能のアイデア
- 開発中に発生した問題とその解決策
- 参考にしたドキュメントや記事へのリンク

## トラブルシューティング

### レイテンシの問題

Firebase Functions V2へ移行した際に一時的なレイテンシの問題が発生することがあります。以下の対策で改善できます：

1. **メモリ設定の増加**
   - 関数のメモリ設定を増やすことでパフォーマンスが向上します
   - 例: `memory: '512MiB'`に設定

2. **コールドスタートの影響**
   - 初回または長時間未使用の関数呼び出し時にはコールドスタートが発生し、レスポンスが遅くなります
   - 定期的な呼び出しで関数を温かい状態に保つか、有料版ではminInstancesを設定できます

3. **一時的な問題**
   - Firebase Functionsのデプロイ直後や地域的な問題でレイテンシが発生することがあります
   - しばらく待つか、再デプロイすることで解決することがあります

### タイムゾーンの問題

Firebase FunctionsとObsidianプラグイン間でタイムゾーンの不一致が発生することがあります：

1. **問題の症状**
   - LINEメッセージ送信時間とObsidianノートのCreatedタイムスタンプに不一致がある
   - 例: 日本時間5/5 8:00に送信したメモが5/4 23:00として登録される（9時間の差）

2. **原因**
   - Firebase Functionsは標準でUTC時間を使用
   - クライアント側（Obsidian）はローカルタイムゾーン（日本ならJST）を使用

3. **解決策**
   - Firebase側: createdAtタイムスタンプにタイムゾーン情報を追加する
   - クライアント側: タイムスタンプを適切に変換してローカルタイムで表示する

4. **実装方法**
   - サーバー側（Firebase）でタイムスタンプをISO文字列として保存し、タイムゾーン情報を含める
   - クライアント側で`new Date()`使用時にタイムゾーンを考慮した変換を行う

## その他の設定

## Cloud Schedulerによるクリーンアップジョブの設定

クリーンアップ機能を定期的に実行するために、Cloud Schedulerを設定します。以下の2つのジョブを設定することで、データベースを自動的にメンテナンスします。

### 1. 同期済みメモのクリーンアップ (毎日実行)

このジョブは、30日以上経過した同期済みメモを自動的に削除します。

1. Google Cloud Consoleで「Cloud Scheduler」ページに移動
2. 「ジョブを作成」をクリック
3. 以下の情報を入力:
   - 名前: `cleanup-synced-notes-daily`
   - 説明: `古い同期済みメモを毎日クリーンアップする`
   - 頻度: `0 0 * * *` (毎日0時に実行)
   - タイムゾーン: `Asia/Tokyo`
   - ターゲット:
     - タイプ: `HTTP`
     - URL: `https://asia-northeast1-[PROJECT_ID].cloudfunctions.net/cleanupSynced`
     - HTTP メソッド: `GET`
     - ヘッダー: 不要
   - リトライ設定: 
     - リトライ回数: `3`
     - 最大リトライ時間: `600s`
4. 「作成」をクリック

### 2. 古い接続コードのクリーンアップ (毎月実行)

このジョブは、90日以上経過した接続コードを自動的に削除します。

1. Google Cloud Consoleで「Cloud Scheduler」ページに移動
2. 「ジョブを作成」をクリック
3. 以下の情報を入力:
   - 名前: `cleanup-connection-codes-monthly`
   - 説明: `古い接続コードを毎月クリーンアップする`
   - 頻度: `0 0 1 * *` (毎月1日0時に実行)
   - タイムゾーン: `Asia/Tokyo`
   - ターゲット:
     - タイプ: `HTTP`
     - URL: `https://asia-northeast1-[PROJECT_ID].cloudfunctions.net/cleanupOldConnectionCodes`
     - HTTP メソッド: `GET`
     - ヘッダー: 不要
   - リトライ設定: 
     - リトライ回数: `3`
     - 最大リトライ時間: `600s`
4. 「作成」をクリック

### 3. 古いマッピング情報のクリーンアップ (毎月実行)

このジョブは、90日以上経過した古いマッピング情報を自動的に削除します。

1. Google Cloud Consoleで「Cloud Scheduler」ページに移動
2. 「ジョブを作成」をクリック
3. 以下の情報を入力:
   - 名前: `cleanup-old-mappings-monthly`
   - 説明: `古いマッピング情報を毎月クリーンアップする`
   - 頻度: `0 0 1 * *` (毎月1日0時に実行)
   - タイムゾーン: `Asia/Tokyo`
   - ターゲット:
     - タイプ: `HTTP`
     - URL: `https://asia-northeast1-[PROJECT_ID].cloudfunctions.net/cleanupOldMappings`
     - HTTP メソッド: `GET`
     - ヘッダー: 不要
   - リトライ設定: 
     - リトライ回数: `3`
     - 最大リトライ時間: `600s`
4. 「作成」をクリック

## 注意事項

- `[PROJECT_ID]` は実際のFirebaseプロジェクトIDに置き換えてください。
- これらのジョブを設定する前に、対応するCloud Functions (`cleanupSynced`、`cleanupOldConnectionCodes`、`cleanupOldMappings`) がデプロイされていることを確認してください。
- 必要に応じて実行頻度を調整できます。例えば、メモ量が多い場合は同期済みメモのクリーンアップをより頻繁に実行するなど。
- これらのジョブを正しく構成するには、Firebaseプロジェクトに対する適切な権限が必要です。