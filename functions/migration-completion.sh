#!/bin/bash

# Firebase Functions V2完全移行スクリプト

echo "====== Firebase Functions V2 完全移行スクリプト ======"
echo "このスクリプトは以下の処理を行います："
echo "1. V2関数のリネーム（V2サフィックスを削除）"
echo ""

# V1関数削除はスキップ（既に存在しないため）
echo "V1関数削除をスキップします（既に存在しないため）。"

# V2関数のコードをバックアップ
echo "念のため、現在のコードをバックアップしています..."
BACKUP_DATE=$(date +%Y%m%d%H%M%S)
BACKUP_DIR="./backup_$BACKUP_DATE"
mkdir -p $BACKUP_DIR
cp src/indexV2.ts $BACKUP_DIR/

# indexV2.tsを編集して関数名からV2サフィックスを削除
echo "V2関数のコードを更新しています..."
sed -i '' 's/lineWebhookV2/lineWebhook/g' src/indexV2.ts
sed -i '' 's/syncNotesV2/syncNotes/g' src/indexV2.ts
sed -i '' 's/cleanupSyncedV2/cleanupSynced/g' src/indexV2.ts
sed -i '' 's/resolveEndpointV2/resolveEndpoint/g' src/indexV2.ts

# indexV2.tsをindex.tsにコピー
echo "更新したコードをindex.tsに適用しています..."
cp src/indexV2.ts src/index.ts

# デプロイ
echo "新しい関数をデプロイしています..."
firebase deploy --only functions:lineWebhook,functions:syncNotes,functions:cleanupSynced,functions:resolveEndpoint

if [ $? -ne 0 ]; then
  echo "新関数のデプロイに失敗しました。バックアップから復元して再試行してください。"
  exit 1
fi

echo "====== Firebase Functions V2 完全移行が完了しました ======"
echo "以下の関数がリネームされてデプロイされました："
echo "- lineWebhook (旧 lineWebhookV2)"
echo "- syncNotes (旧 syncNotesV2)"
echo "- cleanupSynced (旧 cleanupSyncedV2)"
echo "- resolveEndpoint (旧 resolveEndpointV2)"

exit 0 