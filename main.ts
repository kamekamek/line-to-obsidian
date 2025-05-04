import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface LineToObsidianSettings {
	apiEndpoint: string;
	authToken: string;
	syncFolderPath: string;
	lastSync: number | null;
	syncedNoteIds: string[];
}

const DEFAULT_SETTINGS: LineToObsidianSettings = {
	apiEndpoint: '',
	authToken: '',
	syncFolderPath: 'LINE Memos',
	lastSync: null,
	syncedNoteIds: []
}

export default class LineToObsidianPlugin extends Plugin {
	settings: LineToObsidianSettings;

	async onload() {
		await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon('lines-of-text', 'Sync LINE Memos', (evt: MouseEvent) => {
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
		if (!this.settings.apiEndpoint) {
			new Notice('API Endpoint URLが設定されていません。');
			return;
		}

		if (!this.settings.authToken) {
			new Notice('Authentication Tokenが設定されていません。');
			return;
		}

		try {
			new Notice('LINE メモの同期を開始します...');

			let url = this.settings.apiEndpoint;
			if (this.settings.lastSync) {
				url += `?authToken=${encodeURIComponent(this.settings.authToken)}&since=${this.settings.lastSync}`;
			} else {
				url += `?authToken=${encodeURIComponent(this.settings.authToken)}`;
			}

			console.log('Requesting URL:', url);

			let response;
			try {
				response = await fetch(url, {
					method: 'GET',
					mode: 'cors',
					headers: {
						'Authorization': `Bearer ${this.settings.authToken}`,
						'Content-Type': 'application/json'
					}
				});
			} catch (fetchError) {
				console.error('Fetch error:', fetchError);
				throw new Error(`ネットワークエラー: ${fetchError.message || 'APIサーバーに接続できません'}`);
			}

			console.log('Response status:', response.status, response.statusText);

			if (!response.ok) {
				const responseText = await response.text();
				console.error('Response body:', responseText);
				throw new Error(`APIリクエストが失敗しました: ${response.status} ${response.statusText} - ${responseText}`);
			}

			const data = await response.json();
			console.log('Response data:', data);
			
			if (!data || !Array.isArray(data)) {
				throw new Error('APIからの応答が不正です。');
			}

			let safePath = this.normalizePath(this.settings.syncFolderPath);
			if (!(await this.app.vault.adapter.exists(safePath))) {
				await this.app.vault.createFolder(safePath);
			}

			// APIレスポンスの詳細検証
			if (!data) {
				throw new Error('APIからの応答が空です。');
			}
			
			if (!Array.isArray(data)) {
				throw new Error('APIからの応答が配列形式ではありません。');
			}
			
			// 同期済みIDの配列がない場合は初期化
			if (!this.settings.syncedNoteIds) {
				this.settings.syncedNoteIds = [];
			}
			
			// 既存のファイルをマップに取得
			const existingFiles = new Map();
			const folderFiles = await this.app.vault.adapter.list(safePath);
			for (const file of folderFiles.files) {
				// ファイル名からIDを抽出（ファイル名は "YYYYMMDDhhmmssmmm-id.md" 形式）
				const match = file.split('/').pop()?.match(/-([a-zA-Z0-9]+)\.md$/);
				if (match && match[1]) {
					existingFiles.set(match[1], file);
				}
			}
			
			// 各ノートの構造検証
			for (const note of data) {
				if (!note.content) {
					console.warn('コンテンツがないノートをスキップします。');
				}
				if (!note.created || isNaN(new Date(note.created).getTime())) {
					console.warn('作成日が無効なノートをスキップします。');
				}
				if (!note.id) {
					console.warn('IDがないノートをスキップします。');
				}
			}
			
			// 安全なパスの取得と検証
			try {
				safePath = this.normalizePath(this.settings.syncFolderPath);
				if (!(await this.app.vault.adapter.exists(safePath))) {
					await this.app.vault.createFolder(safePath);
				}
			} catch (pathError) {
				console.error('パス処理エラー:', pathError);
				throw new Error(`同期フォルダのパスが無効です: ${pathError.message}`);
			}

			let successCount = 0;
			let updateCount = 0;
			let latestTimestamp = 0;
			let failedNotes = [];
			
			for (const note of data) {
				try {
					// IDがない場合はスキップ
					if (!note.id) {
						failedNotes.push({
							reason: 'IDがありません',
							content: note.content ? note.content.substring(0, 30) + '...' : 'コンテンツなし'
						});
						continue;
					}
					
					// 日付の検証
					if (!note.created || isNaN(new Date(note.created).getTime())) {
						failedNotes.push({
							reason: '無効な日付',
							content: note.content ? note.content.substring(0, 30) + '...' : 'コンテンツなし'
						});
						continue;
					}
					
					const timestamp = new Date(note.created);
					const noteTimestamp = timestamp.getTime();
					
					if (noteTimestamp > latestTimestamp) {
						latestTimestamp = noteTimestamp;
					}
					
					// 既に同期済みかチェック
					const isAlreadySynced = this.settings.syncedNoteIds.includes(note.id);
					const existingFilePath = existingFiles.get(note.id);
					
					// ファイル名生成と保存
					try {
						if (existingFilePath) {
							// 既存ファイルを更新
							await this.app.vault.adapter.write(existingFilePath, note.content || '');
							updateCount++;
							
							// 同期済みIDリストに追加（まだなければ）
							if (!isAlreadySynced) {
								this.settings.syncedNoteIds.push(note.id);
							}
						} else {
							// 新規ファイル作成
							const formattedDate = this.formatDateWithId(timestamp, note.id);
							const fileName = `${safePath}/${formattedDate}.md`;
							await this.app.vault.create(fileName, note.content || '');
							successCount++;
							
							// 同期済みIDリストに追加
							if (!isAlreadySynced) {
								this.settings.syncedNoteIds.push(note.id);
							}
						}
					} catch (fileError) {
						console.error(`ファイル作成エラー: ${fileError.message}`);
						failedNotes.push({
							reason: `ファイル作成エラー: ${fileError.message}`,
							content: note.content ? note.content.substring(0, 30) + '...' : 'コンテンツなし',
							date: timestamp.toLocaleString()
						});
					}
				} catch (e) {
					console.error(`メモ処理エラー: ${e.message}`);
					failedNotes.push({
						reason: `処理エラー: ${e.message}`,
						content: note.content ? note.content.substring(0, 30) + '...' : 'コンテンツなし'
					});
				}
			}
			
			// 失敗したノートがある場合の詳細ログ
			if (failedNotes.length > 0) {
				console.warn(`${failedNotes.length}件のノート保存に失敗:`, failedNotes);
				new Notice(`警告: ${failedNotes.length}件のノート保存に失敗しました。コンソールで詳細を確認できます。`);
			}

			if ((successCount > 0 || updateCount > 0) && latestTimestamp > 0) {
				this.settings.lastSync = latestTimestamp;
				try {
					await this.saveSettings();
				} catch (settingsError) {
					console.error('設定保存エラー:', settingsError);
					new Notice('警告: 同期タイムスタンプの保存に失敗しました。次回の同期で重複したノートが同期される可能性があります。');
				}
			}

			new Notice(`${successCount}件のLINEメモを同期し、${updateCount}件のメモを更新しました。`);
		} catch (error) {
			console.error('同期エラー:', error);
			new Notice(`同期エラー: ${error.message}`);
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
	 * パスを安全に正規化して検証する関数
	 * - 不正な文字（Windows禁止文字など）の検出
	 * - パストラバーサル攻撃の防止
	 * - 空パスに対するデフォルト値の提供
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
		containerEl.createEl('h2', {text: 'LINE to Obsidian 設定'});

		new Setting(containerEl)
			.setName('API Endpoint URL')
			.setDesc('同期に使用するCloud Functionsの syncNotes 関数のURL。')
			.addText(text => text
				.setPlaceholder('https://your-project.cloudfunctions.net/syncNotes')
				.setValue(this.plugin.settings.apiEndpoint)
				.onChange(async (value) => {
					this.plugin.settings.apiEndpoint = value;
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
				.onClick(async () => {
					await this.plugin.syncNotes();
					this.display(); // 最終同期時間を更新するために画面を再描画
				}));
	}
}
