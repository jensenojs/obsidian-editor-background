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
  private readonly workspaceBackgroundClass = 'obsidian-editor-background-workspace';
  private readonly backgroundDocuments = new Set<Document>();
  private lastPointer: { doc: Document; x: number; y: number } | null = null;
  private traceInProgress = false;
  private clickCaptureEnabled = false;
  private clickCaptureDocument: Document | null = null;
  private clickCaptureCleanups: Array<() => void> = [];
  private clickCaptureSequence = 0;
  private clickCaptureCopyInFlight = false;
  private clickCapturePendingText: string | null = null;
  private lastClickCaptureText: string | null = null;
  private clickCaptureCopyFailureCount = 0;

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
    this.addCommand({
      id: 'copy-background-trace-diagnostics',
      name: 'Copy background trace diagnostics',
      callback: () => this.copyBackgroundTraceDiagnostics(),
    });
    this.addCommand({
      id: 'toggle-background-click-capture-diagnostics',
      name: 'Toggle background click capture diagnostics',
      callback: () => this.toggleBackgroundClickCaptureDiagnostics(),
    });
    this.addCommand({
      id: 'copy-current-background-click-capture-diagnostics',
      name: 'Copy current background click capture diagnostics',
      callback: () => this.copyCurrentBackgroundClickCaptureDiagnostics(),
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
    this.stopBackgroundClickCaptureDiagnostics();
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

  private async copyBackgroundTraceDiagnostics() {
    if (this.traceInProgress) {
      new Notice('Background trace is already recording');
      return;
    }

    const doc = activeDocument;
    const durationMs = 2000;
    new Notice(`Recording background trace for ${durationMs / 1000}s`);

    try {
      const diagnostics = await this.recordBackgroundTrace(doc, durationMs);
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      new Notice('Background trace diagnostics copied');
    } catch (error) {
      new Notice(`Failed to copy background trace: ${this.errorMessage(error)}`);
    }
  }

  private toggleBackgroundClickCaptureDiagnostics() {
    if (this.clickCaptureEnabled) {
      this.stopBackgroundClickCaptureDiagnostics();
      new Notice('Background click capture stopped');
      return;
    }

    this.startBackgroundClickCaptureDiagnostics(activeDocument);
  }

  private startBackgroundClickCaptureDiagnostics(doc: Document) {
    this.stopBackgroundClickCaptureDiagnostics();
    this.registerBackgroundDocument(doc);

    const win = doc.defaultView ?? window;
    this.clickCaptureEnabled = true;
    this.clickCaptureDocument = doc;
    this.clickCaptureSequence = 0;
    this.clickCaptureCopyFailureCount = 0;

    const capture = (reason: string, event?: Event) => {
      this.copyBackgroundClickCaptureDiagnostics(reason, event);
    };

    const docEvents = ['pointerdown', 'pointerup', 'click', 'focusin', 'focusout', 'mouseover'];
    docEvents.forEach((type) => {
      const listener = (event: Event) => capture(`document:${type}`, event);
      doc.addEventListener(type, listener, { capture: true, passive: true });
      this.clickCaptureCleanups.push(() => doc.removeEventListener(type, listener, { capture: true }));
    });

    const windowEvents = ['focus', 'blur'];
    windowEvents.forEach((type) => {
      const listener = (event: Event) => capture(`window:${type}`, event);
      win.addEventListener(type, listener, true);
      this.clickCaptureCleanups.push(() => win.removeEventListener(type, listener, true));
    });

    const visibilityListener = (event: Event) => capture('document:visibilitychange', event);
    doc.addEventListener('visibilitychange', visibilityListener, { capture: true });
    this.clickCaptureCleanups.push(() => {
      doc.removeEventListener('visibilitychange', visibilityListener, { capture: true });
    });

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.target instanceof Element)) {
        capture('mutation');
      }
    });
    observer.observe(doc.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    this.clickCaptureCleanups.push(() => observer.disconnect());

    const intervalId = win.setInterval(() => capture('interval'), 300);
    this.clickCaptureCleanups.push(() => win.clearInterval(intervalId));

    capture('start');
    new Notice('Background click capture started. Clipboard will keep the latest capture.');
  }

  private stopBackgroundClickCaptureDiagnostics() {
    this.clickCaptureCleanups.forEach((cleanup) => cleanup());
    this.clickCaptureCleanups = [];
    this.clickCaptureEnabled = false;
    this.clickCaptureDocument = null;
    this.clickCapturePendingText = null;
    this.clickCaptureCopyInFlight = false;
  }

  private async copyCurrentBackgroundClickCaptureDiagnostics() {
    if (this.lastClickCaptureText) {
      await navigator.clipboard.writeText(this.lastClickCaptureText);
      new Notice('Latest background click capture copied');
      return;
    }

    const diagnostics = this.createBackgroundClickCaptureDiagnostics(activeDocument, 'manual-copy');
    await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    new Notice('Current background click capture copied');
  }

  private copyBackgroundClickCaptureDiagnostics(reason: string, event?: Event) {
    const doc = this.clickCaptureDocument ?? activeDocument;
    const diagnostics = this.createBackgroundClickCaptureDiagnostics(doc, reason, event);
    const text = JSON.stringify(diagnostics, null, 2);
    this.lastClickCaptureText = text;
    this.writeLatestClickCaptureToClipboard(text);
  }

  private writeLatestClickCaptureToClipboard(text: string) {
    if (this.clickCaptureCopyInFlight) {
      this.clickCapturePendingText = text;
      return;
    }

    this.clickCaptureCopyInFlight = true;
    navigator.clipboard
      .writeText(text)
      .catch((error) => {
        this.clickCaptureCopyFailureCount += 1;
        if (this.clickCaptureCopyFailureCount <= 2) {
          new Notice(`Failed to copy background capture: ${this.errorMessage(error)}`);
        }
      })
      .finally(() => {
        this.clickCaptureCopyInFlight = false;
        const pending = this.clickCapturePendingText;
        this.clickCapturePendingText = null;
        if (pending && this.clickCaptureEnabled) {
          this.writeLatestClickCaptureToClipboard(pending);
        }
      });
  }

  private createBackgroundClickCaptureDiagnostics(doc: Document, reason: string, event?: Event) {
    return {
      kind: 'background-click-capture-diagnostics-v1',
      createdAt: new Date().toISOString(),
      sequence: this.clickCaptureSequence++,
      reason,
      event: event ? this.describeTraceEvent(doc, Date.now(), event) : null,
      body: this.describeElement(doc.body),
      bodyBefore: this.describePseudoElement(doc.body, '::before'),
      bodyAfter: this.describePseudoElement(doc.body, '::after'),
      backgroundOwners: this.collectBackgroundOwners(doc),
      bodyVariables: this.collectVariables(doc.body),
      focus: this.collectFocusState(doc),
      workspace: this.collectWorkspaceState(doc),
      stablePoints: this.collectTracePoints(doc),
      pointStacks: this.collectTracePoints(doc).map((point) => this.describeCompactPointStack(doc, point)),
      visibleDarkLayers: this.collectCompactVisibleDarkLayers(doc),
    };
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
      backgroundOwners: this.collectBackgroundOwners(doc),
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
      visibleDarkLayers: this.collectVisibleDarkLayers(doc),
    };
  }

  private recordBackgroundTrace(doc: Document, durationMs: number): Promise<unknown> {
    this.traceInProgress = true;
    const win = doc.defaultView ?? window;
    const startedAt = Date.now();
    const events: unknown[] = [];
    const samples: unknown[] = [];
    const maxEvents = 160;
    const maxSamples = 80;
    const cleanups: Array<() => void> = [];

    const pushEvent = (event: unknown) => {
      if (events.length < maxEvents) {
        events.push(event);
      }
    };

    const capture = (reason: string, event?: Event) => {
      if (samples.length >= maxSamples) {
        return;
      }

      samples.push(this.createTraceSample(doc, startedAt, reason, event));
    };

    const scheduleCapture = (reason: string, event?: Event) => {
      capture(reason, event);
      win.requestAnimationFrame(() => capture(`${reason}:raf1`, event));
      win.setTimeout(() => capture(`${reason}:t+80`, event), 80);
    };

    const trackedEvents = ['pointerdown', 'pointerup', 'click', 'focusin', 'focusout', 'mouseover'];
    trackedEvents.forEach((type) => {
      const listener = (event: Event) => {
        pushEvent(this.describeTraceEvent(doc, startedAt, event));
        scheduleCapture(`event:${type}`, event);
      };
      doc.addEventListener(type, listener, { capture: true, passive: true });
      cleanups.push(() => doc.removeEventListener(type, listener, { capture: true }));
    });

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.slice(0, 20).forEach((mutation) => {
        pushEvent(this.describeMutation(startedAt, mutation));
      });
      capture('mutation');
    });
    mutationObserver.observe(doc.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
    cleanups.push(() => mutationObserver.disconnect());

    capture('start');

    const intervalId = win.setInterval(() => {
      capture('interval');
    }, 100);
    cleanups.push(() => win.clearInterval(intervalId));

    return new Promise((resolve) => {
      win.setTimeout(() => {
        capture('end');
        cleanups.forEach((cleanup) => cleanup());
        this.traceInProgress = false;
        resolve({
          kind: 'background-trace-diagnostics-v1',
          createdAt: new Date().toISOString(),
          durationMs,
          body: this.describeElement(doc.body),
          bodyBefore: this.describePseudoElement(doc.body, '::before'),
          bodyAfter: this.describePseudoElement(doc.body, '::after'),
          backgroundOwners: this.collectBackgroundOwners(doc),
          bodyVariables: this.collectVariables(doc.body),
          stablePoints: this.collectTracePoints(doc),
          initialVisibleDarkLayers: this.collectCompactVisibleDarkLayers(doc),
          events,
          samples,
          finalVisibleDarkLayers: this.collectCompactVisibleDarkLayers(doc),
        });
      }, durationMs);
    });
  }

  private createTraceSample(doc: Document, startedAt: number, reason: string, event?: Event) {
    return {
      elapsedMs: Date.now() - startedAt,
      reason,
      event: event ? this.describeTraceEvent(doc, startedAt, event) : null,
      focus: this.collectFocusState(doc),
      workspace: this.collectWorkspaceState(doc),
      points: this.collectTracePoints(doc).map((point) => this.describeCompactPointStack(doc, point)),
    };
  }

  private collectTracePoints(doc: Document) {
    const win = doc.defaultView;
    const viewportWidth = win?.innerWidth ?? 0;
    const viewportHeight = win?.innerHeight ?? 0;
    const points: Array<{ label: string; x: number; y: number; source: string }> = [];

    const pushPoint = (label: string, x: number, y: number, source: string) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) {
        return;
      }
      const exists = points.some((point) => point.label === label);
      if (!exists) {
        points.push({ label, x: Math.round(x), y: Math.round(y), source });
      }
    };

    if (this.lastPointer?.doc === doc) {
      pushPoint('last-pointer', this.lastPointer.x, this.lastPointer.y, 'last pointermove');
    }

    this.pushElementRelativePoints(doc, points, 'main-markdown', [
      '.workspace-split.mod-root .markdown-source-view',
      '.workspace-split.mod-root .markdown-reading-view',
      '.workspace-split.mod-root .cm-contentContainer',
    ], [
      ['left-rail-upper', 0.06, 0.28],
      ['left-rail-center', 0.06, 0.5],
      ['left-inner-upper', 0.14, 0.28],
      ['left-inner-center', 0.14, 0.5],
      ['upper-left', 0.25, 0.28],
      ['upper-center', 0.5, 0.28],
      ['upper-right', 0.75, 0.28],
      ['center', 0.5, 0.5],
    ]);
    this.pushElementRelativePoints(doc, points, 'left-sidebar', [
      '.mod-left-split .workspace-leaf-content',
      '.mod-left-split .view-content',
    ], [
      ['center', 0.5, 0.5],
      ['lower-center', 0.5, 0.78],
    ]);
    this.pushElementCenterPoint(doc, points, 'right-sidebar', [
      '.mod-right-split .workspace-leaf-content',
      '.mod-right-split .view-content',
    ]);
    this.pushElementCenterPoint(doc, points, 'opencode-pane', [
      '[data-type="opencode-view"]',
      '.opencode-container',
      '.opencode-iframe-container',
    ]);

    pushPoint('window-center', viewportWidth / 2, viewportHeight / 2, 'viewport center');

    return points.slice(0, 18);
  }

  private pushElementRelativePoints(
    doc: Document,
    points: Array<{ label: string; x: number; y: number; source: string }>,
    labelPrefix: string,
    selectors: string[],
    fractions: Array<[string, number, number]>
  ) {
    const element = this.largestVisibleElement(doc, selectors);
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    fractions.forEach(([label, xFraction, yFraction]) => {
      const pointLabel = `${labelPrefix}:${label}`;
      const exists = points.some((point) => point.label === pointLabel);
      if (!exists) {
        points.push({
          label: pointLabel,
          x: Math.round(rect.left + rect.width * xFraction),
          y: Math.round(rect.top + rect.height * yFraction),
          source: this.elementPath(element),
        });
      }
    });
  }

  private pushElementCenterPoint(
    doc: Document,
    points: Array<{ label: string; x: number; y: number; source: string }>,
    label: string,
    selectors: string[]
  ) {
    const element = this.largestVisibleElement(doc, selectors);
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const exists = points.some((point) => point.label === label);
    if (!exists) {
      points.push({
        label,
        x: Math.round(x),
        y: Math.round(y),
        source: this.elementPath(element),
      });
    }
  }

  private largestVisibleElement(doc: Document, selectors: string[]) {
    const win = doc.defaultView;
    const bounds = {
      left: 0,
      top: 0,
      right: win?.innerWidth ?? 0,
      bottom: win?.innerHeight ?? 0,
    };

    return selectors
      .flatMap((selector) => Array.from(doc.querySelectorAll(selector)))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const visibleRect = this.intersectRect(rect, bounds);
        return {
          element,
          area: visibleRect.width * visibleRect.height,
        };
      })
      .filter((sample) => sample.area > 0)
      .sort((left, right) => right.area - left.area)[0]?.element ?? null;
  }

  private describeCompactPointStack(
    doc: Document,
    point: { label: string; x: number; y: number; source: string }
  ) {
    const elements = typeof doc.elementsFromPoint === 'function'
      ? doc.elementsFromPoint(point.x, point.y)
      : [];

    return {
      point,
      elements: elements.slice(0, 8).map((element, index) => ({
        index,
        element: this.describeCompactElement(element),
        before: this.describeCompactPseudoElement(element, '::before'),
        after: this.describeCompactPseudoElement(element, '::after'),
      })),
    };
  }

  private collectBackgroundOwners(doc: Document) {
    const ownerSelectors: Array<[string, string]> = [
      ['body', 'body'],
      ['app-container', '.app-container'],
      ['horizontal-main-container', '.horizontal-main-container'],
      ['workspace', '.workspace'],
    ];

    return ownerSelectors.map(([label, selector]) => {
      const element = selector === 'body' ? doc.body : doc.querySelector(selector);
      return {
        label,
        selector,
        element: this.describeCompactElement(element),
        before: this.describeCompactPseudoElement(element, '::before'),
        after: this.describeCompactPseudoElement(element, '::after'),
        children: element
          ? Array.from(element.children)
              .slice(0, 10)
              .map((child) => this.describeCompactElement(child))
          : [],
      };
    });
  }

  private describeTraceEvent(doc: Document, startedAt: number, event: Event) {
    const target = event.target instanceof Element ? event.target : null;
    const pointerEvent = event instanceof PointerEvent || event instanceof MouseEvent ? event : null;
    return {
      elapsedMs: Date.now() - startedAt,
      type: event.type,
      target: this.describeElement(target),
      point: pointerEvent
        ? {
            x: Math.round(pointerEvent.clientX),
            y: Math.round(pointerEvent.clientY),
            button: pointerEvent.button,
            buttons: pointerEvent.buttons,
          }
        : null,
      focus: this.collectFocusState(doc),
    };
  }

  private describeMutation(startedAt: number, mutation: MutationRecord) {
    return {
      elapsedMs: Date.now() - startedAt,
      type: 'mutation',
      attributeName: mutation.attributeName,
      target: mutation.target instanceof Element ? this.describeElement(mutation.target) : null,
    };
  }

  private collectFocusState(doc: Document) {
    return {
      documentHasFocus: doc.hasFocus(),
      activeElement: this.describeElement(doc.activeElement),
      selection: this.describeSelection(doc),
    };
  }

  private collectWorkspaceState(doc: Document) {
    return {
      bodyClass: doc.body.className,
      activeWorkspaceTabs: Array.from(doc.querySelectorAll('.workspace-tabs.mod-active'))
        .slice(0, 8)
        .map((element) => this.describeElement(element)),
      activeLeafContents: Array.from(doc.querySelectorAll('.workspace-leaf-content[data-type], .workspace-leaf-content'))
        .filter((element) => element.closest('.mod-active') || element.classList.contains('mod-active'))
        .slice(0, 12)
        .map((element) => this.describeElement(element)),
      focusedEditors: Array.from(doc.querySelectorAll('.cm-focused'))
        .slice(0, 8)
        .map((element) => this.describeElement(element)),
      activeLines: Array.from(doc.querySelectorAll('.cm-line.cm-active'))
        .slice(0, 8)
        .map((element) => this.describeElement(element)),
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
      overflow: style?.overflow ?? null,
      transform: style?.transform ?? null,
      isolation: style?.isolation ?? null,
    };
  }

  private describeCompactElement(element: Element | null) {
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
      opacity: style?.opacity ?? null,
      display: style?.display ?? null,
      visibility: style?.visibility ?? null,
      position: style?.position ?? null,
      zIndex: style?.zIndex ?? null,
      pointerEvents: style?.pointerEvents ?? null,
      filter: style?.filter ?? null,
      backdropFilter: this.backdropFilter(style),
      mixBlendMode: style?.mixBlendMode ?? null,
      transform: style?.transform ?? null,
      isolation: style?.isolation ?? null,
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

  private describeCompactPseudoElement(element: Element | null, pseudoElement: '::before' | '::after') {
    if (!element) {
      return null;
    }

    const style = element.ownerDocument.defaultView?.getComputedStyle(element, pseudoElement);
    if (!style || style.content === 'none') {
      return null;
    }

    return {
      pseudoElement,
      content: style.content,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      opacity: style.opacity,
      display: style.display,
      position: style.position,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      filter: style.filter,
      backdropFilter: this.backdropFilter(style),
      mixBlendMode: style.mixBlendMode,
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
      '--obsidian-workspace-background-contract',
      '--obsidian-workspace-background-image',
      '--obsidian-workspace-background-opacity',
      '--obsidian-workspace-background-filter',
      '--obsidian-workspace-background-position',
      '--obsidian-workspace-background-size',
      '--obsidian-workspace-background-repeat',
      '--obsidian-workspace-background-blend-mode',
      '--obsidian-editor-background-workspace-surface',
      '--obsidian-editor-background-workspace-chrome',
      '--obsidian-editor-background-workspace-chrome-active',
      '--obsidian-editor-background-workspace-border',
      '--obsidian-workspace-background-surface',
      '--obsidian-workspace-background-chrome',
      '--obsidian-workspace-background-chrome-active',
      '--obsidian-workspace-background-border',
      '--obsidian-workspace-background-active-line',
      '--obsidian-workspace-background-selection',
      '--obsidian-workspace-background-row-highlight',
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

  private collectVisibleDarkLayers(doc: Document) {
    const win = doc.defaultView;
    const viewportWidth = win?.innerWidth ?? 0;
    const viewportHeight = win?.innerHeight ?? 0;
    const viewportRect = {
      left: 0,
      top: 0,
      right: viewportWidth,
      bottom: viewportHeight,
    };

    return Array.from(doc.querySelectorAll('*'))
      .map((element) => {
        const style = element.ownerDocument.defaultView?.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visibleRect = this.intersectRect(rect, viewportRect);
        const color = this.parseRgbColor(style?.backgroundColor ?? '');
        return {
          color,
          visibleArea: Math.round(visibleRect.width * visibleRect.height),
          element: this.describeElement(element),
          before: this.describePseudoElement(element, '::before'),
          after: this.describePseudoElement(element, '::after'),
        };
      })
      .filter((sample) => {
        return (
          sample.visibleArea >= 600 &&
          sample.color !== null &&
          sample.color.alpha >= 0.08 &&
          this.luminance(sample.color) <= 80
        );
      })
      .sort((left, right) => {
        return left.visibleArea - right.visibleArea;
      })
      .slice(0, 80);
  }

  private collectCompactVisibleDarkLayers(doc: Document) {
    const win = doc.defaultView;
    const viewportWidth = win?.innerWidth ?? 0;
    const viewportHeight = win?.innerHeight ?? 0;
    const viewportRect = {
      left: 0,
      top: 0,
      right: viewportWidth,
      bottom: viewportHeight,
    };

    return Array.from(doc.querySelectorAll('*'))
      .map((element) => {
        const style = element.ownerDocument.defaultView?.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const visibleRect = this.intersectRect(rect, viewportRect);
        const color = this.parseRgbColor(style?.backgroundColor ?? '');
        return {
          color,
          visibleArea: Math.round(visibleRect.width * visibleRect.height),
          element: this.describeCompactElement(element),
        };
      })
      .filter((sample) => {
        return (
          sample.visibleArea >= 600 &&
          sample.color !== null &&
          sample.color.alpha >= 0.08 &&
          this.luminance(sample.color) <= 80
        );
      })
      .sort((left, right) => {
        return left.visibleArea - right.visibleArea;
      })
      .slice(0, 24);
  }

  private intersectRect(
    rect: DOMRect,
    bounds: { left: number; top: number; right: number; bottom: number }
  ) {
    const left = Math.max(rect.left, bounds.left);
    const top = Math.max(rect.top, bounds.top);
    const right = Math.min(rect.right, bounds.right);
    const bottom = Math.min(rect.bottom, bounds.bottom);
    return {
      left,
      top,
      right,
      bottom,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };
  }

  private parseRgbColor(value: string) {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) {
      return null;
    }

    const parts = match[1].split(',').map((part) => part.trim());
    if (parts.length < 3) {
      return null;
    }

    const red = Number(parts[0]);
    const green = Number(parts[1]);
    const blue = Number(parts[2]);
    const alpha = parts.length >= 4 ? Number(parts[3]) : 1;

    if ([red, green, blue, alpha].some((part) => Number.isNaN(part))) {
      return null;
    }

    return { red, green, blue, alpha };
  }

  private luminance(color: { red: number; green: number; blue: number }) {
    return 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue;
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
