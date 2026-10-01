const { Plugin, ItemView, MarkdownRenderChild, Platform, debounce } = require('obsidian');

const VIEW = 'claude-limits';

// Obsidian blocks every script an iframe loads from app://, so the page arrives whole in srcdoc.
// Its loader appends a <script src> per file; this hands it the file's text from the frame instead.
const shim = `<script>
document.head.append = function (el) {
  const text = frameElement.files[el.src.split('/').pop().split('?')[0]];
  el.removeAttribute('src');
  if (text !== undefined) el.text = text;
  Element.prototype.append.call(this, el);
  setTimeout(text === undefined ? el.onerror : el.onload);
};
</script>`;

// the page is short until its data has loaded and it has drawn, so the scroll is set back only then
const drawn = `<script>{
const render = Limits.render;
Limits.render = (...args) => { render(...args); frameElement.dispatchEvent(new Event('draw')); };
}</script>`;

// srcdoc never reads the files again, and they change after every Claude Code turn:
// new data goes to the running page, a new page or limits.js loads it anew
function watch(component, plugin, show, update) {
  const page = debounce(show, 1000, true);
  const data = debounce(update, 1000, true);
  const changed = name => {
    if (name === 'index.html' || name === 'limits.js') page();
    else if (name?.endsWith('.js')) data();
  };
  if (plugin.repo) {
    for (const dir of [plugin.dataDir, plugin.repo]) {
      const watcher = require('fs').watch(dir, (e, name) => changed(name));
      component.register(() => watcher.close());
    }
  } else {
    component.registerEvent(plugin.app.vault.on('modify', file => {
      if (file.path.startsWith(`${plugin.folder}/`)) changed(file.name);
    }));
  }
}

class LimitsView extends ItemView {
  constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
  getViewType() { return VIEW; }
  getDisplayText() { return 'Claude limits'; }
  getIcon() { return 'gauge'; }
  async onOpen() {
    watch(this, this.plugin, () => this.show(this.query), () => this.plugin.feed(this.frame));
    await this.show();
  }

  async show(query = 'reset=countdown') {
    this.query = query;
    const y = this.frame?.contentWindow?.scrollY;
    const { doc, files } = await this.plugin.page();

    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    const frame = this.frame = this.contentEl.createEl('iframe', { attr: { style: 'display:block;width:100%;height:100%;border:0' } });
    frame.dataset.query = query;
    frame.files = files;
    frame.addEventListener('load', () => frame.contentDocument.addEventListener('click', e => {
      const a = e.target.closest('nav a[href]');
      if (a) this.query = frame.dataset.query = a.getAttribute('href').slice(1);
    }));
    if (y) frame.addEventListener('draw', () => frame.contentWindow.scrollTo(0, y), { once: true });
    frame.srcdoc = doc;
  }
}

// the parts of the page a code block can show, by the word for them in the block
const PARTS = { tiles: '.tiles', chart: 'figure', table: '.projects' };

// A code block claude-limits in a note, one key: value per line:
//   range: 7d            the chart's range: 5h, 1d, 7d, 30d or all
//   show: tiles, chart   the parts it shows, of tiles, chart and table
//   by: agent            the table's split, as on the page
// What the page does not know, it takes its default for; a block without a part it knows shows tiles and chart.
function options(source) {
  const o = {};
  for (const line of source.split('\n')) {
    const [key, ...value] = line.split(':');
    o[key.trim()] = value.join(':').trim();
  }
  const query = new URLSearchParams({ reset: 'countdown', days: (o.range || '7d').replace(/d$/, '') });
  if (o.by) query.set('by', o.by);
  let show = (o.show || '').split(/[\s,]+/).filter(part => Object.hasOwn(PARTS, part));
  if (!show.length) show = ['tiles', 'chart'];
  const css = [
    // a button would redraw the block, but the note keeps what the block says
    '.navs, #split { display: none; }',
    ...Object.keys(PARTS).filter(part => !show.includes(part)).map(part => `${PARTS[part]} { display: none; }`),
    // the frame takes the page's height, so the page takes none from the frame
    'body { min-height: 0; }',
    'main { width: 100%; padding: 0; }',
    ...show.includes('tiles') ? [] : ['.controls { margin-top: 0; }'],
  ];
  return { query: query.toString(), css: css.join('\n') };
}

class LimitsBlock extends MarkdownRenderChild {
  constructor(el, plugin, source) { super(el); this.plugin = plugin; this.options = options(source); }
  onload() {
    watch(this, this.plugin, () => this.show(), () => this.plugin.feed(this.frame));
    this.show();
  }

  async show() {
    const { query, css } = this.options;
    const { doc, files } = await this.plugin.page();

    this.containerEl.empty();
    const frame = this.frame = this.containerEl.createEl('iframe', { attr: { style: 'display:block;width:100%;border:0' } });
    frame.dataset.query = query;
    frame.files = files;
    // as tall as what the page shows, also when new data changes it
    frame.addEventListener('load', () => {
      const main = frame.contentDocument.querySelector('main');
      new frame.contentWindow.ResizeObserver(() => { frame.style.height = `${main.offsetHeight}px`; }).observe(main);
    });
    // the chart's height follows the frame's on the page, which here follows the chart's: it takes its smallest
    frame.srcdoc = doc.replace(/clamp\(([^,()]+),[^()]*vh[^()]*\)/g, '$1') + `<style data-block>\n${css}\n</style>\n`;
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
    this.registerMarkdownCodeBlockProcessor(VIEW, (source, el, ctx) => ctx.addChild(new LimitsBlock(el, this, source)));
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

  // the page whole, for a frame's srcdoc, with the files its loader asks the frame for
  async page() {
    const { page, files } = await this.read();
    const doc = page
      .replace('<script src="limits.js"></script>', () => `${shim}<script>${files['limits.js']}</script>${drawn}`)
      // srcdoc has no query string, so the range, reset, line and theme come from the frame, where a click keeps them for the next reload
      .replaceAll('new URLSearchParams(location.search)', 'new URLSearchParams(frameElement.dataset.query)')
      // about:srcdoc takes no other URL
      .replace("history.replaceState(null, '', a.href);", '');
    return { doc, files };
  }

  // new data to a running page; a page still loading reads the new files itself
  async feed(frame) {
    frame.files = (await this.read()).files;
    frame.contentWindow?.refresh?.();
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
