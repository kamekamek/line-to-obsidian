#!/bin/bash

# Firebase Functions V2へのデプロイスクリプト

# ビルド実行
echo "Building functions..."
npm run build

# 環境変数を設定
# 注: 初回は以下のコマンドでLINE Bot API認証情報を設定する必要があります
# firebase functions:secrets:set LINE_CHANNEL_ACCESS_TOKEN
# firebase functions:secrets:set LINE_CHANNEL_SECRET

# V2関数のみをデプロイ
echo "Deploying V2 functions..."
firebase deploy --only functions:lineWebhookV2,functions:syncNotesV2,functions:cleanupSyncedV2,functions:resolveEndpointV2

echo "Deployment completed!" 