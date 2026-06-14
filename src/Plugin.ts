import { Notice, Plugin, WorkspaceWindow } from 'obsidian';
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
  private readonly workspaceBackgroundClass = 'obsidian-editor-background-workspace-prototype';
  private readonly backgroundDocuments = new Set<Document>();
  private lastPointer: { doc: Document; x: number; y: number } | null = null;

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new UrlSettingsTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.UpdateBackground(document));
    this.app.workspace.on('window-open', (win: WorkspaceWindow) => this.UpdateBackground(win.doc));
    this.addCommand({
      id: 'copy-background-point-diagnostics',
      name: 'Copy background point diagnostics',
      callback: () => this.copyBackgroundPointDiagnostics(),
    });
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
    doc.body.style.setProperty('--obsidian-editor-background-image', `url('${this.settings.imageUrl}')`);
    doc.body.style.setProperty('--obsidian-editor-background-opacity', `${this.settings.opacity}`);
    doc.body.style.setProperty('--obsidian-editor-background-bluriness', `blur(${this.settings.bluriness})`);
    doc.body.style.setProperty('--obsidian-editor-background-input-contrast', this.settings.inputContrast ? '#ffffff17' : 'none');
    doc.body.style.setProperty('--obsidian-editor-background-line-padding', this.settings.inputContrast ? '1rem' : '0');
    doc.body.style.setProperty('--obsidian-editor-background-position', this.settings.position);
  }

  private clearBackground(doc: Document) {
    doc.body.classList.remove(this.workspaceBackgroundClass);
    doc.body.style.removeProperty('--obsidian-editor-background-image');
    doc.body.style.removeProperty('--obsidian-editor-background-opacity');
    doc.body.style.removeProperty('--obsidian-editor-background-bluriness');
    doc.body.style.removeProperty('--obsidian-editor-background-input-contrast');
    doc.body.style.removeProperty('--obsidian-editor-background-line-padding');
    doc.body.style.removeProperty('--obsidian-editor-background-position');
  }

  private registerBackgroundDocument(doc: Document) {
    if (this.backgroundDocuments.has(doc)) {
      return;
    }

    this.backgroundDocuments.add(doc);
    this.registerDomEvent(
      doc,
      'pointermove',
      (event: PointerEvent) => {
        this.lastPointer = {
          doc,
          x: event.clientX,
          y: event.clientY,
        };
      },
      { passive: true, capture: true }
    );
  }

  private async copyBackgroundPointDiagnostics() {
    const diagnostics = this.createBackgroundPointDiagnostics();
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      new Notice('Background point diagnostics copied');
    } catch (error) {
      new Notice(`Failed to copy background diagnostics: ${this.errorMessage(error)}`);
    }
  }

  private createBackgroundPointDiagnostics() {
    const point = this.lastPointer ?? this.fallbackPoint(activeDocument);
    const doc = point.doc;
    const win = doc.defaultView;
    const elements = typeof doc.elementsFromPoint === 'function'
      ? doc.elementsFromPoint(point.x, point.y)
      : [];

    return {
      kind: 'background-point-diagnostics-v1',
      createdAt: new Date().toISOString(),
      point: {
        x: point.x,
        y: point.y,
        viewportWidth: win?.innerWidth ?? null,
        viewportHeight: win?.innerHeight ?? null,
      },
      body: this.describeElement(doc.body),
      bodyBefore: this.describePseudoElement(doc.body, '::before'),
      bodyAfter: this.describePseudoElement(doc.body, '::after'),
      bodyVariables: this.collectVariables(doc.body),
      activeElement: this.describeElement(doc.activeElement),
      selection: this.describeSelection(doc),
      elementsFromPoint: elements.slice(0, 24).map((element, index) => ({
        index,
        element: this.describeElement(element),
        before: this.describePseudoElement(element, '::before'),
        after: this.describePseudoElement(element, '::after'),
      })),
      containingElements: this.collectContainingElements(doc, point.x, point.y),
    };
  }

  private fallbackPoint(doc: Document) {
    const win = doc.defaultView;
    return {
      doc,
      x: Math.round((win?.innerWidth ?? 0) / 2),
      y: Math.round((win?.innerHeight ?? 0) / 2),
    };
  }

  private describeElement(element: Element | null) {
    if (!element) {
      return null;
    }

    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      selector: this.elementPath(element),
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: this.className(element),
      rect: this.rect(rect),
      backgroundColor: style?.backgroundColor ?? null,
      backgroundImage: style?.backgroundImage ?? null,
      color: style?.color ?? null,
      opacity: style?.opacity ?? null,
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      position: style?.position ?? null,
      zIndex: style?.zIndex ?? null,
      pointerEvents: style?.pointerEvents ?? null,
      filter: style?.filter ?? null,
      backdropFilter: this.backdropFilter(style),
      mixBlendMode: style?.mixBlendMode ?? null,
      boxShadow: style?.boxShadow ?? null,
      outline: style?.outline ?? null,
      border: style?.border ?? null,
    };
  }

  private describePseudoElement(element: Element | null, pseudoElement: '::before' | '::after') {
    if (!element) {
      return null;
    }

    const style = element.ownerDocument.defaultView?.getComputedStyle(element, pseudoElement);
    if (!style) {
      return null;
    }

    return {
      pseudoElement,
      content: style.content,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      backgroundPosition: style.backgroundPosition,
      backgroundSize: style.backgroundSize,
      backgroundRepeat: style.backgroundRepeat,
      opacity: style.opacity,
      display: style.display,
      position: style.position,
      inset: {
        top: style.top,
        right: style.right,
        bottom: style.bottom,
        left: style.left,
      },
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      filter: style.filter,
      backdropFilter: this.backdropFilter(style),
      mixBlendMode: style.mixBlendMode,
      boxShadow: style.boxShadow,
    };
  }

  private collectVariables(element: Element | null) {
    if (!element) {
      return {};
    }

    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const names = [
      '--obsidian-editor-background-image',
      '--obsidian-editor-background-opacity',
      '--obsidian-editor-background-bluriness',
      '--obsidian-editor-background-input-contrast',
      '--obsidian-editor-background-line-padding',
      '--obsidian-editor-background-position',
      '--obsidian-editor-background-workspace-surface',
      '--obsidian-editor-background-workspace-chrome',
      '--obsidian-editor-background-workspace-border',
      '--background-primary',
      '--background-secondary',
      '--background-primary-alt',
      '--background-modifier-border',
      '--active-line-bg',
    ];
    const variables: Record<string, string> = {};

    names.forEach((name) => {
      variables[name] = style?.getPropertyValue(name).trim() ?? '';
    });

    return variables;
  }

  private collectContainingElements(doc: Document, x: number, y: number) {
    return Array.from(doc.querySelectorAll('*'))
      .filter((element) => this.rectContainsPoint(element.getBoundingClientRect(), x, y))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          area: Math.round(rect.width * rect.height),
          element: this.describeElement(element),
          before: this.describePseudoElement(element, '::before'),
          after: this.describePseudoElement(element, '::after'),
        };
      })
      .sort((left, right) => {
        return left.area - right.area;
      })
      .slice(0, 80);
  }

  private rectContainsPoint(rect: DOMRect, x: number, y: number) {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  private describeSelection(doc: Document) {
    const selection = doc.defaultView?.getSelection();
    if (!selection) {
      return null;
    }

    return {
      type: selection.type,
      isCollapsed: selection.isCollapsed,
      rangeCount: selection.rangeCount,
      anchorNode: this.describeNode(selection.anchorNode),
      focusNode: this.describeNode(selection.focusNode),
    };
  }

  private describeNode(node: Node | null) {
    if (!node) {
      return null;
    }

    if (node instanceof Element) {
      return this.describeElement(node);
    }

    const parent = node.parentElement;
    return {
      nodeType: node.nodeType,
      nodeName: node.nodeName,
      textPreview: node.textContent?.slice(0, 80) ?? null,
      parent: this.describeElement(parent),
    };
  }

  private elementPath(element: Element) {
    const parts: string[] = [];
    let current: Element | null = element;

    while (current && parts.length < 8) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += `#${current.id}`;
      }
      const className = this.className(current);
      if (className) {
        part += `.${className.split(/\s+/).filter(Boolean).slice(0, 5).join('.')}`;
      }
      parts.unshift(part);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  private className(element: Element) {
    return typeof element.className === 'string' ? element.className : '';
  }

  private rect(rect: DOMRect) {
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  private backdropFilter(style: CSSStyleDeclaration | undefined) {
    if (!style) {
      return null;
    }

    return (
      style.getPropertyValue('backdrop-filter') ||
      style.getPropertyValue('-webkit-backdrop-filter') ||
      null
    );
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
