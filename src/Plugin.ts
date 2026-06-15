import { Plugin, WorkspaceWindow } from 'obsidian';
import { UrlSettingsTab } from './PluginSettingsTab';

interface PluginSettings {
  imageUrl: string;
  opacity: number;
  bluriness: string;
  inputContrast: boolean;
  position: string;
}

export const DEFAULT_SETTINGS: Partial<PluginSettings> = {
  imageUrl: 'protocol://domain.tld/path/to/image.png',
  opacity: 0.3,
  bluriness: 'low',
  inputContrast: false,
  position: 'center',
};

export default class BackgroundPlugin extends Plugin {
  settings: PluginSettings;
  private readonly workspaceBackgroundClass = 'obsidian-editor-background-workspace';
  private readonly backgroundDocuments = new Set<Document>();

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new UrlSettingsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.UpdateBackground(document));
    this.app.workspace.on('window-open', (win: WorkspaceWindow) => this.UpdateBackground(win.doc));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.UpdateBackground();
  }

  onunload() {
    this.backgroundDocuments.forEach((doc) => this.clearBackground(doc));
    this.backgroundDocuments.clear();
  }

  UpdateBackground(doc: Document = activeDocument) {
    this.registerBackgroundDocument(doc);
    doc.body.classList.add(this.workspaceBackgroundClass);
    const image = `url('${this.settings.imageUrl}')`;
    const opacity = `${this.settings.opacity}`;
    const filter = `blur(${this.settings.bluriness})`;
    doc.body.style.setProperty('--obsidian-workspace-background-contract', 'v1');
    doc.body.style.setProperty('--obsidian-workspace-background-image', image);
    doc.body.style.setProperty('--obsidian-workspace-background-opacity', opacity);
    doc.body.style.setProperty('--obsidian-workspace-background-filter', filter);
    doc.body.style.setProperty('--obsidian-workspace-background-position', this.settings.position);
    doc.body.style.setProperty('--obsidian-workspace-background-size', 'cover');
    doc.body.style.setProperty('--obsidian-workspace-background-repeat', 'no-repeat');
    doc.body.style.setProperty('--obsidian-workspace-background-blend-mode', 'overlay');
    doc.body.style.setProperty('--obsidian-editor-background-image', image);
    doc.body.style.setProperty('--obsidian-editor-background-opacity', opacity);
    doc.body.style.setProperty('--obsidian-editor-background-bluriness', filter);
    doc.body.style.setProperty('--obsidian-editor-background-input-contrast', this.settings.inputContrast ? '#ffffff17' : 'none');
    doc.body.style.setProperty('--obsidian-editor-background-line-padding', this.settings.inputContrast ? '1rem' : '0');
    doc.body.style.setProperty('--obsidian-editor-background-position', this.settings.position);
  }

  private clearBackground(doc: Document) {
    doc.body.classList.remove(this.workspaceBackgroundClass);
    doc.body.style.removeProperty('--obsidian-workspace-background-contract');
    doc.body.style.removeProperty('--obsidian-workspace-background-image');
    doc.body.style.removeProperty('--obsidian-workspace-background-opacity');
    doc.body.style.removeProperty('--obsidian-workspace-background-filter');
    doc.body.style.removeProperty('--obsidian-workspace-background-position');
    doc.body.style.removeProperty('--obsidian-workspace-background-size');
    doc.body.style.removeProperty('--obsidian-workspace-background-repeat');
    doc.body.style.removeProperty('--obsidian-workspace-background-blend-mode');
    doc.body.style.removeProperty('--obsidian-editor-background-image');
    doc.body.style.removeProperty('--obsidian-editor-background-opacity');
    doc.body.style.removeProperty('--obsidian-editor-background-bluriness');
    doc.body.style.removeProperty('--obsidian-editor-background-input-contrast');
    doc.body.style.removeProperty('--obsidian-editor-background-line-padding');
    doc.body.style.removeProperty('--obsidian-editor-background-position');
  }

  private registerBackgroundDocument(doc: Document) {
    this.backgroundDocuments.add(doc);
  }
}
