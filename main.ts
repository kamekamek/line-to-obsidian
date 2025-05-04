import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

interface LineToObsidianSettings {
	apiEndpoint: string;
	authToken: string;
	syncFolderPath: string;
	lastSync: number | null;
}

const DEFAULT_SETTINGS: LineToObsidianSettings = {
	apiEndpoint: '',
	authToken: '',
	syncFolderPath: 'LINE Memos',
	lastSync: null
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
				url += `?token=${encodeURIComponent(this.settings.authToken)}&since=${this.settings.lastSync}`;
			} else {
				url += `?token=${encodeURIComponent(this.settings.authToken)}`;
			}

			const response = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.settings.authToken}`,
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`APIリクエストが失敗しました: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();
			
			if (!data || !Array.isArray(data)) {
				throw new Error('APIからの応答が不正です。');
			}

			if (!(await this.app.vault.adapter.exists(this.settings.syncFolderPath))) {
				await this.app.vault.createFolder(this.settings.syncFolderPath);
			}

			let successCount = 0;
			for (const note of data) {
				try {
					const timestamp = new Date(note.created);
					const fileName = `${this.settings.syncFolderPath}/${this.formatDate(timestamp)}.md`;
					await this.app.vault.create(fileName, note.content);
					successCount++;
				} catch (e) {
					console.error(`メモの保存に失敗しました: ${e}`);
				}
			}

			this.settings.lastSync = Date.now();
			await this.saveSettings();

			new Notice(`${successCount}件のLINEメモを同期しました。`);
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
		
		return `${year}${month}${day}${hours}${minutes}${seconds}`;
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
				.setDisabled(false)
				.inputEl.type = 'password');
				
		const passwordField = containerEl.querySelector('input[type="password"]');
		if (passwordField) {
			passwordField.addEventListener('change', async (e: Event) => {
				const target = e.target as HTMLInputElement;
				this.plugin.settings.authToken = target.value;
				await this.plugin.saveSettings();
			});
		}

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
