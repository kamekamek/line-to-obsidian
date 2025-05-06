import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface LineToObsidianSettings {
	apiEndpoint: string;
	projectId: string;  // Firebase プロジェクトID
	shortCode: string;  // LINE登録時に提供された短縮コード
	authToken: string;
	syncFolderPath: string;
	lastSync: number | null;
	syncedNoteIds: string[];
}

const DEFAULT_SETTINGS: LineToObsidianSettings = {
	apiEndpoint: '',
	projectId: 'line-obsidian-notes-sync', // 中央サーバーのプロジェクトID
	shortCode: '',
	authToken: '',
	syncFolderPath: 'LINE Memos',
	lastSync: null,
	syncedNoteIds: []
}

export default class LineToObsidianPlugin extends Plugin {
	settings: LineToObsidianSettings;

	async onload() {
		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon('turtle', 'Sync LINE Memos', (evt: MouseEvent) => {
			this.syncNotes();
		});
		ribbonIconEl.addClass('line-to-obsidian-ribbon-class');

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('LINE Sync');

		this.addCommand({
			id: 'sync-line-memos',
			name: 'Sync LINE Memos',
			callback: () => {
				this.syncNotes();
			}
		});

		this.addSettingTab(new LineToObsidianSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async syncNotes() {
		if (!this.settings.shortCode) {
			new Notice('接続コードが設定されていません。');
			return;
		}

		if (!this.settings.authToken) {
			new Notice('認証トークンが設定されていません。');
			return;
		}

		try {
			new Notice('LINE メモの同期を開始します...');

			// エンドポイントURLの構築
			let apiUrl = '';

			try {
				// プロジェクトIDを設定から読み込み
				const projectId = this.settings.projectId || 'line-obsidian-notes-sync';
				const resolveEndpointUrl = `https://asia-northeast1-${projectId}.cloudfunctions.net/resolveEndpoint?code=${encodeURIComponent(this.settings.shortCode)}`;

				const response = await fetch(resolveEndpointUrl);

				if (!response.ok) {
					throw new Error(`短縮コードからエンドポイントの解決に失敗しました: ${response.status} ${response.statusText}`);
				}

				const data = await response.json();

				if (!data.success || !data.endpoint) {
					throw new Error('無効な接続コードです。正しいコードを入力してください。');
				}

				apiUrl = data.endpoint;
			} catch (resolveError) {
				console.error('エンドポイント解決エラー:', resolveError);
				throw new Error(`接続コードからのエンドポイント解決に失敗しました: ${resolveError.message}`);
			}

			// APIリクエストの本体
			const response = await fetch(`${apiUrl}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.settings.authToken}`
				},
				body: JSON.stringify({
					lastSyncTimestamp: this.settings.lastSync || 0
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('エラーレスポンス本文:', errorText);
				throw new Error(`APIリクエストが失敗しました: ${response.status} ${response.statusText} - ${errorText}`);
			}

			const responseText = await response.text();

			let data;
			try {
				data = JSON.parse(responseText);
			} catch (parseError) {
				console.error('JSONパースエラー:', parseError);
				throw new Error(`APIレスポンスのパースに失敗しました: ${parseError.message}, 受信データ: ${responseText.substring(0, 100)}...`);
			}

			// レスポンス形式の判定（配列形式または新形式）
			let notesArray = [];
			if (Array.isArray(data)) {
				notesArray = data.map(item => ({
					id: item.id,
					text: item.content || item.text || '',
					timestamp: item.created || item.timestamp || Date.now()
				}));
			} else if (data.success && Array.isArray(data.notes)) {
				notesArray = data.notes;
			} else {
				console.error('APIエラー応答:', data);
				throw new Error(`同期エラー: ${data.error || '不明なエラーが発生しました'}`);
			}

			if (notesArray.length === 0) {
				new Notice('新しいLINEメモはありません。');
				return;
			}

			// 同期フォルダの作成（なければ）
			const folderPath = this.settings.syncFolderPath || 'LINE Memos';

			try {
				await this.createFolderIfNotExists(folderPath);
			} catch (error) {
				console.error('フォルダ作成エラー:', error);
				throw new Error(`同期フォルダの作成に失敗しました: ${error.message}`);
			}

			// 新しいノートの作成
			let successCount = 0;
			const updatedNoteIds = [...this.settings.syncedNoteIds];

			for (const note of notesArray) {
				try {
					// タイムスタンプをJST(Asia/Tokyo)に変換
					const timestamp = new Date(note.timestamp || Date.now());
					// JSTでのフォーマット用の日付文字列を生成（9時間追加）
					const jstTimestamp = new Date(timestamp.getTime() + 9 * 60 * 60 * 1000);
					const dateStr = jstTimestamp.toISOString().split('T')[0];
					const textPreview = note.text.substring(0, 10).replace(/[\\/:*?"<>|]/g, '_');
					const fileName = `${dateStr} ${textPreview}.md`;

					// ファイルパス
					const filePath = `${folderPath}/${fileName}`;

					// ファイル内容（タイムスタンプはそのままISOフォーマットで保存）
					const content = `---
created: ${timestamp.toISOString()}
source: LINE
---

<!-- note_id: ${note.id} -->

${note.text}`;

					// ノートの作成
					await this.app.vault.create(filePath, content);

					// 同期済みIDリストに追加
					if (note.id && !updatedNoteIds.includes(note.id)) {
						updatedNoteIds.push(note.id);
					}

					successCount++;
				} catch (noteError) {
					console.error('ノート作成エラー:', noteError, note);
					// 個別のエラーは続行するため、throwしない
				}
			}

			// 設定を更新
			this.settings.lastSync = Date.now();
			this.settings.syncedNoteIds = updatedNoteIds;
			await this.saveSettings();

			new Notice(`${successCount}件のLINEメモを同期しました。`);

		} catch (error) {
			console.error('同期エラー:', error);
			new Notice(`同期中にエラーが発生しました: ${error.message}`);
		}
	}

	formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');
		const seconds = date.getSeconds().toString().padStart(2, '0');
		const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

		// UUID部分を生成して追加（短縮版）
		const uuid = this.generateShortUUID();

		return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}-${uuid}`;
	}

	/**
	 * 短縮版のUUIDを生成
	 * @returns ファイル名に適した短いランダム文字列
	 */
	generateShortUUID(): string {
		// ランダムな16進数文字列を生成（8文字）
		return Math.random().toString(36).substring(2, 10);
	}

	/**
	 * フォルダが存在しない場合は作成するヘルパーメソッド
	 * @param folderPath フォルダのパス
	 * @throws エラー: フォルダ作成に失敗した場合
	 */
	async createFolderIfNotExists(folderPath: string): Promise<void> {
		const normalizedPath = this.normalizePath(folderPath);
		if (!(await this.app.vault.adapter.exists(normalizedPath))) {
			await this.app.vault.createFolder(normalizedPath);
		}
	}

	/**
	 * パスを正規化するヘルパーメソッド
	 * @param path 正規化する生のパス文字列
	 * @returns 安全に正規化されたパス
	 * @throws エラー: 無効な文字やパストラバーサル試行を検出した場合
	 */
	normalizePath(path: string): string {
		// 不正な文字を含むパスを拒否
		const invalidCharsRegex = /[<>:"\\|?*\x00-\x1F]/g;
		if (invalidCharsRegex.test(path)) {
			throw new Error('パスに無効な文字が含まれています');
		}

		// パスを分解して各セグメントを検証
		const segments = path.split('/').filter(segment => segment.length > 0);

		// 上位ディレクトリ参照（..）を含むセグメントを検出して拒否
		const hasParentDirRef = segments.some(segment =>
			segment === '..' ||
			segment.startsWith('../') ||
			segment.endsWith('/..') ||
			segment.includes('/../')
		);

		if (hasParentDirRef) {
			throw new Error('パスに上位ディレクトリ参照（..）が含まれています');
		}

		// 現在のディレクトリ参照（.）を含むセグメントを除去
		const cleanSegments = segments.filter(segment => segment !== '.');

		// 安全なパスを再構築
		let safePath = cleanSegments.join('/');

		// 末尾のスラッシュを除去
		safePath = safePath.replace(/\/+$/g, '');

		// 空のパスの場合はデフォルト値を返す
		return safePath.length > 0 ? safePath : 'LINE Memos';
	}

	formatDateWithId(date: Date, id: string): string {
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		const hours = date.getHours().toString().padStart(2, '0');
		const minutes = date.getMinutes().toString().padStart(2, '0');
		const seconds = date.getSeconds().toString().padStart(2, '0');
		const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

		return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}-${id}`;
	}
}

class LineToObsidianSettingTab extends PluginSettingTab {
	plugin: LineToObsidianPlugin;

	constructor(app: App, plugin: LineToObsidianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.addClass('line-to-obsidian-settings');
		containerEl.createEl('h2', {text: 'LINE to Obsidian 設定'});

		const apiSettingDiv = containerEl.createDiv('api-settings');
		apiSettingDiv.createEl('h3', {text: '接続設定'});

		// 短縮コード設定（唯一の接続方法として表示）
		new Setting(apiSettingDiv)
			.setName('接続コード')
			.setDesc('LINEボットから提供された接続コードを入力してください。')
			.addText(text => text
				.setPlaceholder('例: ABC123')
				.setValue(this.plugin.settings.shortCode)
				.onChange(async (value) => {
					this.plugin.settings.shortCode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Authentication Token')
			.setDesc('LINEで #登録 コマンドを実行して取得した認証トークン。')
			.addText(text => text
				.setPlaceholder('認証トークンを入力')
				.setValue(this.plugin.settings.authToken)
				.onChange(async (value) => {
					this.plugin.settings.authToken = value;
					await this.plugin.saveSettings();
				}));

		// 詳細設定セクション
		const advancedSettingDiv = containerEl.createDiv('advanced-settings');
		advancedSettingDiv.createEl('h3', {text: '詳細設定'});

		new Setting(containerEl)
			.setName('Sync Folder Path')
			.setDesc('同期したメモを保存するObsidian Vault内のフォルダパス。')
			.addText(text => text
				.setPlaceholder('LINE Memos')
				.setValue(this.plugin.settings.syncFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.syncFolderPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Last Sync Timestamp')
			.setDesc('最後に同期した日時。')
			.addText(text => {
				const value = this.plugin.settings.lastSync
					? new Date(this.plugin.settings.lastSync).toLocaleString()
					: '未同期';
				text.setValue(value)
					.setDisabled(true);
			});

		new Setting(containerEl)
			.setName('手動同期')
			.setDesc('今すぐLINEメモを同期します。')
			.addButton(button => button
				.setButtonText('Sync Now')
				.setCta()
				.setClass('line-to-obsidian-sync-button')
				.onClick(async () => {
					await this.plugin.syncNotes();
					this.display(); // 最終同期時間を更新するために画面を再描画
				}));
	}
}
