import { MarkdownView, Plugin, WorkspaceWindow, normalizePath } from 'obsidian';
import { UrlSettingsTab } from './PluginSettingsTab';

interface PluginSettings {
  imageUrl: string;
  darkImageUrl: string;
  opacity: number;
  bluriness: string;
  inputContrast: boolean;
  position: string;
  size: string;
  excludedPaths: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  imageUrl: '',
  darkImageUrl: '',
  opacity: 0.3,
  bluriness: '5px',
  inputContrast: false,
  position: 'center',
  size: 'cover',
  excludedPaths: '',
};

// Pre-1.4.0 the default URL was a bogus placeholder and blur was stored as a word.
const LEGACY_PLACEHOLDER_URL = 'protocol://domain.tld/path/to/image.png';
const LEGACY_BLUR_LEVELS: Record<string, string> = { off: '0px', low: '5px', high: '15px' };

// The fork keeps a single whole-window owner on body::before. The workspace
// contract is the stable surface other local plugins may read; the editor
// variables are kept for compatibility with older CSS and dependent integrations.
const WORKSPACE_CSS_PROPERTIES = [
  '--obsidian-workspace-background-contract',
  '--obsidian-workspace-background-image',
  '--obsidian-workspace-background-opacity',
  '--obsidian-workspace-background-filter',
  '--obsidian-workspace-background-position',
  '--obsidian-workspace-background-size',
  '--obsidian-workspace-background-repeat',
  '--obsidian-workspace-background-blend-mode',
];

const EDITOR_CSS_PROPERTIES = [
  '--obsidian-editor-background-image',
  '--obsidian-editor-background-opacity',
  '--obsidian-editor-background-bluriness',
  '--obsidian-editor-background-input-contrast',
  '--obsidian-editor-background-line-padding',
  '--obsidian-editor-background-position',
  '--obsidian-editor-background-size',
];

const EXCLUDED_CLASS = 'editor-background-excluded';

export default class BackgroundPlugin extends Plugin {
  settings: PluginSettings;
  private readonly workspaceBackgroundClass = 'obsidian-editor-background-workspace';
  private readonly backgroundDocuments = new Set<Document>();

  async onload() {
    await this.loadSettings();
    this.updateBackground(document);

    this.addSettingTab(new UrlSettingsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.updateBackground(document));
    this.registerEvent(
      this.app.workspace.on('window-open', (win: WorkspaceWindow) => this.updateBackground(win.doc))
    );
    // Re-evaluate when the theme changes, so a dark-theme image can swap in.
    this.registerEvent(this.app.workspace.on('css-change', () => this.updateAllBackgrounds()));
    // Re-evaluate exclusions when the layout or the active leaf changes.
    this.registerEvent(this.app.workspace.on('layout-change', () => this.applyExclusions()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.applyExclusions()));
  }

  onunload() {
    this.backgroundDocuments.forEach((doc) => this.clearBackground(doc));
    this.backgroundDocuments.clear();
    this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
      leaf.view.containerEl.removeClass(EXCLUDED_CLASS);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    if (this.settings.imageUrl === LEGACY_PLACEHOLDER_URL) {
      this.settings.imageUrl = '';
    }

    if (this.settings.bluriness in LEGACY_BLUR_LEVELS) {
      this.settings.bluriness = LEGACY_BLUR_LEVELS[this.settings.bluriness];
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.updateAllBackgrounds();
  }

  private updateAllBackgrounds() {
    this.backgroundDocuments.forEach((doc) => this.updateBackground(doc));
    this.applyExclusions();
  }

  updateBackground(doc: Document = activeDocument) {
    this.registerBackgroundDocument(doc);
    doc.body.classList.add(this.workspaceBackgroundClass);

    const isDarkTheme = doc.body.hasClass('theme-dark');
    const darkUrl = this.settings.darkImageUrl.trim();
    const url = (isDarkTheme && darkUrl.length > 0 ? darkUrl : this.settings.imageUrl).trim();
    const image = url.length > 0 ? `url('${url.replace(/'/g, "\\'")}')` : 'none';
    const opacity = `${this.settings.opacity}`;
    const filter = `blur(${this.settings.bluriness})`;

    doc.body.style.setProperty('--obsidian-workspace-background-contract', 'v1');
    doc.body.style.setProperty('--obsidian-workspace-background-image', image);
    doc.body.style.setProperty('--obsidian-workspace-background-opacity', opacity);
    doc.body.style.setProperty('--obsidian-workspace-background-filter', filter);
    doc.body.style.setProperty('--obsidian-workspace-background-position', this.settings.position);
    doc.body.style.setProperty('--obsidian-workspace-background-size', this.settings.size);
    doc.body.style.setProperty('--obsidian-workspace-background-repeat', 'no-repeat');
    doc.body.style.setProperty('--obsidian-workspace-background-blend-mode', 'overlay');

    doc.body.style.setProperty('--obsidian-editor-background-image', image);
    doc.body.style.setProperty('--obsidian-editor-background-opacity', opacity);
    doc.body.style.setProperty('--obsidian-editor-background-bluriness', filter);
    doc.body.style.setProperty('--obsidian-editor-background-input-contrast', this.settings.inputContrast ? '#ffffff17' : 'none');
    doc.body.style.setProperty('--obsidian-editor-background-line-padding', this.settings.inputContrast ? '1rem' : '0');
    doc.body.style.setProperty('--obsidian-editor-background-position', this.settings.position);
    doc.body.style.setProperty('--obsidian-editor-background-size', this.settings.size);
  }

  private clearBackground(doc: Document) {
    doc.body.classList.remove(this.workspaceBackgroundClass);
    [...WORKSPACE_CSS_PROPERTIES, ...EDITOR_CSS_PROPERTIES].forEach((property) =>
      doc.body.style.removeProperty(property)
    );
  }

  private registerBackgroundDocument(doc: Document) {
    this.backgroundDocuments.add(doc);
  }

  applyExclusions() {
    const prefixes = this.settings.excludedPaths
      .split('\n')
      .map((path) => path.trim())
      .filter((path) => path.length > 0)
      .map((path) => normalizePath(path));

    this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;

      const path = view.file?.path ?? '';
      const excluded = path.length > 0
        && prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
      view.containerEl.toggleClass(EXCLUDED_CLASS, excluded);
    });
  }
}
