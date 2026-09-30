const { Plugin, ItemView, Platform, debounce } = require('obsidian');

const VIEW = 'claude-limits';

// Obsidian blocks every script an iframe loads from app://, so the page arrives whole in srcdoc.
// Its loader appends a <script src> per file; this hands it the file's text instead.
const shim = files => `<script>
const FILES = ${JSON.stringify(files).replace(/</g, '\\u003c')};
document.head.append = function (el) {
  const text = FILES[el.src.split('/').pop()];
  el.removeAttribute('src');
  if (text !== undefined) el.text = text;
  Element.prototype.append.call(this, el);
  setTimeout(text === undefined ? el.onerror : el.onload);
};
</script>`;

class LimitsView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW; }
  getDisplayText() { return 'Claude limits'; }
  getIcon() { return 'gauge'; }
  async onOpen() {
    // srcdoc never reads the files again, and they change after every Claude Code turn
    const refresh = debounce(() => this.show(this.query), 1000, true);
    const { plugin } = this;
    if (plugin.repo) {
      for (const dir of [plugin.dataDir, plugin.repo]) {
        const watcher = require('fs').watch(dir, (e, name) => {
          if (name?.endsWith('.js') || name === 'index.html') refresh();
        });
        this.register(() => watcher.close());
      }
    } else {
      this.registerEvent(this.app.vault.on('modify', file => {
        if (file.path.startsWith(`${plugin.folder}/`)) refresh();
      }));
    }
    await this.show();
  }

  async show(query = 'reset=countdown') {
    this.query = query;
    const { page, files } = await this.plugin.read();
    const doc = page
      .replace('<script src="limits.js"></script>', () => `${shim(files)}<script>${files['limits.js']}</script>`)
      // srcdoc has no query string, so the range, reset, line and theme come in here
      .replaceAll('new URLSearchParams(location.search)', () => `new URLSearchParams(${JSON.stringify(query)})`);

    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    const frame = this.contentEl.createEl('iframe', { attr: { style: 'display:block;width:100%;height:100%;border:0' } });
    frame.addEventListener('load', () => frame.contentDocument.addEventListener('click', e => {
      const a = e.target.closest('nav a[href]');
      if (!a) return;
      e.preventDefault();
      this.show(a.getAttribute('href').slice(1));
    }));
    frame.srcdoc = doc;
  }
}

module.exports = class ClaudeLimits extends Plugin {
  async onload() {
    // data.json is written by install
    const data = await this.loadData() || {};
    this.folder = data.folder || 'claude-limits';
    // the Mac reads the clone and the data folder, the phone only has their copy in the vault;
    // the clone is kept as ~/…, since Obsidian Sync carries data.json to every macOS account
    if (Platform.isDesktopApp && data.repo && data.dataDir) {
      this.repo = data.repo.replace(/^~(?=\/|$)/, require('os').homedir());
      this.dataDir = data.dataDir;
    }
    this.registerView(VIEW, leaf => new LimitsView(leaf, this));
    this.addRibbonIcon('gauge', 'Claude limits', () => this.open());
    this.addCommand({ id: 'open', name: 'Open', callback: () => this.open() });
    this.registerObsidianProtocolHandler('claude-limits', () => this.open());
  }

  async read() {
    const files = {};
    if (this.repo) {
      const { readdir, readFile } = require('fs').promises;
      const path = require('path');
      for (const name of await readdir(this.dataDir))
        if (name.endsWith('.js')) files[name] = await readFile(path.join(this.dataDir, name), 'utf8');
      files['limits.js'] = await readFile(path.join(this.repo, 'limits.js'), 'utf8');
      return { files, page: await readFile(path.join(this.repo, 'index.html'), 'utf8') };
    }
    const { adapter } = this.app.vault;
    for (const path of (await adapter.list(this.folder)).files)
      if (path.endsWith('.js')) files[path.split('/').pop()] = await adapter.read(path);
    return { files, page: await adapter.read(`${this.folder}/index.html`) };
  }

  async open() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (leaf) await leaf.view.show();
    else {
      leaf = this.app.workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }
};
