const { Plugin, ItemView } = require('obsidian');

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
  async onOpen() { await this.show(); }

  async show(query = 'reset=countdown') {
    const { adapter } = this.app.vault;
    const DIR = this.plugin.folder;
    const files = {};
    for (const path of (await adapter.list(DIR)).files)
      if (path.endsWith('.js')) files[path.split('/').pop()] = await adapter.read(path);
    const page = (await adapter.read(`${DIR}/index.html`))
      .replace('<script src="limits.js"></script>', () => `${shim(files)}<script>${files['limits.js']}</script>`)
      // srcdoc has no query string, so the range and reset come in here
      .replace('new URLSearchParams(location.search)', () => `new URLSearchParams(${JSON.stringify(query)})`);

    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    const frame = this.contentEl.createEl('iframe', { attr: { style: 'display:block;width:100%;height:100%;border:0' } });
    frame.addEventListener('load', () => frame.contentDocument.addEventListener('click', e => {
      const a = e.target.closest('nav a[href]');
      if (!a) return;
      e.preventDefault();
      this.show(a.getAttribute('href').slice(1));
    }));
    frame.srcdoc = page;
  }
}

module.exports = class ClaudeLimits extends Plugin {
  async onload() {
    // data.json is written by install
    this.folder = (await this.loadData())?.folder || 'claude-limits';
    this.registerView(VIEW, leaf => new LimitsView(leaf, this));
    this.addRibbonIcon('gauge', 'Claude limits', () => this.open());
    this.addCommand({ id: 'open', name: 'Open', callback: () => this.open() });
    this.registerObsidianProtocolHandler('claude-limits', () => this.open());
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
