# クリーンアップ計画

## 削除対象ファイル

以下のファイルは新アーキテクチャに関連しないため削除します：

1. Firebase関連:
   - `006_db.md` (Firestore設計)
   - `012_firebase_guide.md` (Firebase実装ガイド)
   - `firebase_functions_notes.md` (Firebase Functions V1/V2の注意点)
   - `firebase_v2_migration.md` (Firebase V2移行手順)

2. 古いインフラ構成:
   - `007_infra.md` (古いインフラ構成)

## 保持するファイル

以下のファイルは更新して保持します：

1. コア設計:
   - `000_overview.md` (更新済み)
   - `000_new_architecture.md` (新規作成済み)
   - `001_pages.md` (UIは依然として必要)
   - `002_api.md` (更新済み)
   - `003_structure.md` (要更新)

2. その他の重要文書:
   - `011_test_plan.md` (要更新)
   - `013_obsidian_plugin_submission.md`
   - `014_privacy_security.md`

## 移行手順

1. 上記の削除対象ファイルをバックアップ
2. ファイルを削除
3. 残りのファイルを更新して新アーキテクチャに対応
4. 必要に応じて新しいドキュメントを追加

## 注意事項

- 削除前に重要な情報が新しいドキュメントに反映されているか確認
- Git履歴は保持（将来の参照用）
- 更新が必要なファイルは段階的に対応