# 要件定義
LINE公式アカウント:
  - Webhookでユーザーメモを受信
  - "#登録 <トークン>"メッセージでユーザー登録
ユーザー管理:
  - コレクション: mappings/{token} → { lineUserId }
  - トークンによるプラグインインスタンス⇔LINEユーザーID紐付け
メモ保存:
  - コレクション: notes/{lineUserId}/items/{noteId}
  - フィールド:
      created: Timestamp     # 受信日時
      content: string       # メモ本文
      tags: string[]        # 将来のハッシュタグ対応
      synced: boolean       # 同期済みフラグ
同期トリガー:
  - Obsidian同期ボタン押下時
  - GET /syncNotes?token=<token>&since=<timestamp> で未同期メモ取得
同期後クリーンアップ:
  - 取得済メモをDELETEまたはsynced=trueで即削除
セキュリティ:
  - LINE署名検証(@line/bot-sdk)
  - HTTPS必須・Bearerトークン認証

# 実現計画
1. Firebaseプロジェクト作成&Blazeプラン有効化
2. Firestoreコレクション設計
   - mappings/{token}
   - notes/{lineUserId}/items/{noteId}
3. Cloud Functions実装
   a. lineWebhook (HTTPトリガー)
      - 署名検証
      - "#登録"でmappings更新
      - テキストメモをnotesに保存
   b. syncNotes (HTTPトリガー)
      - mappingsからlineUserId取得
      - notesからsynced==falseかつcreated>sinceのメモ取得
      - レスポンス後にDELETEまたはsynced=true更新
   c. cleanupSynced (onSchedule)
      - 定期的にsynced=trueの古いメモを一括削除
4. Obsidianプラグイン開発
   - 設定画面: endpoint, token, folder, lastSync
   - 同期コマンド: requestUrl() → .md作成 → lastSync更新
5. テスト&検証
   - Webhook受信動作確認
   - 同期API取得→Vault書込み→クリーンアップ検証
6. ドキュメント整備&Community Store申請
