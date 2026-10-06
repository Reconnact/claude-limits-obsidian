const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// the page the plugin rewrites comes from a real claude-limits clone
const REPO = process.env.CLAUDE_LIMITS_REPO || path.join(process.env.HOME, 'claude-limits');

class Plugin {
  constructor(app, data) { this.app = app; this.data = data; }
  async loadData() { return this.data; }
  registerView(type, make) { this.make = make; }
  addRibbonIcon() {}
  addCommand() {}
  registerObsidianProtocolHandler() {}
  registerMarkdownCodeBlockProcessor(language, process) { this.blocks = { language, process }; }
}
class MarkdownRenderChild {
  constructor(containerEl) { this.containerEl = containerEl; }
}
class ItemView {
  constructor(leaf) {
    this.app = leaf.app;
    this.contentEl = {
      style: {}, empty() {},
      createEl: () => (this.frame = { addEventListener() {}, dataset: {} }),
    };
  }
}
const Platform = { isDesktopApp: true };
const load = Module._load;
Module._load = (req, ...rest) => req === 'obsidian' ? { Plugin, ItemView, MarkdownRenderChild, Platform } : load(req, ...rest);
const ClaudeLimits = require('../main.js');

function vault(files) {
  return { vault: { adapter: {
    list: async dir => ({ files: Object.keys(files).filter(f => f.startsWith(dir + '/')) }),
    read: async p => { if (!(p in files)) throw new Error(`no ${p}`); return files[p]; },
  } } };
}
function copy(folder) {
  return {
    [`${folder}/index.html`]: fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'),
    [`${folder}/limits.js`]: fs.readFileSync(path.join(REPO, 'limits.js'), 'utf8'),
    [`${folder}/hw.js`]: 'S.push({"ts":1});',
  };
}
async function page(folder, data) {
  return render(vault(copy(folder)), data);
}
async function render(app, data) {
  const plugin = new ClaudeLimits(app, data);
  await plugin.onload();
  const view = plugin.make({ app });
  await view.show();
  return { doc: view.frame.srcdoc, files: view.frame.files };
}

test('the page loads its scripts from the shim, not from app://', async () => {
  const { doc, files } = await page('claude-limits', null);
  assert.ok(!doc.includes('<script src="limits.js"></script>'));
  assert.ok(doc.includes('frameElement.files'));
  assert.equal(files['hw.js'], 'S.push({"ts":1});');
});

test('the query comes in without location.search', async () => {
  const { doc } = await page('claude-limits', null);
  assert.ok(!doc.includes('new URLSearchParams(location.search)'));
  assert.ok(doc.includes('new URLSearchParams(frameElement.dataset.query)'));
  assert.ok(!doc.includes('history.replaceState'));
});

test('the folder comes from data.json', async () => {
  const { files } = await page('_claude/claude-limits', { folder: '_claude/claude-limits' });
  assert.equal(files['hw.js'], 'S.push({"ts":1});');
});

// a data folder on disk, with a snapshot the vault copy does not have
function dataDir() {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'claude-limits-'));
  fs.writeFileSync(path.join(dir, 'hw.js'), 'S.push({"ts":2});');
  fs.writeFileSync(path.join(dir, '.hw-tally.jsonl'), '{}');
  return dir;
}

test('on the Mac the page and data come from the clone and the data folder', async () => {
  const { doc, files } = await render(vault({}), { folder: 'claude-limits', repo: REPO, dataDir: dataDir() });
  assert.equal(files['hw.js'], 'S.push({"ts":2});');
  assert.ok(doc.includes('new URLSearchParams(frameElement.dataset.query)'));
  assert.ok(!('.hw-tally.jsonl' in files));
});

test('a clone as ~/… is found under this account\'s home', async () => {
  const home = process.env.HOME;
  process.env.HOME = path.dirname(REPO);
  try {
    const { files } = await render(vault({}), { repo: `~/${path.basename(REPO)}`, dataDir: dataDir() });
    assert.equal(files['hw.js'], 'S.push({"ts":2});');
  } finally { process.env.HOME = home; }
});

test('the phone reads the vault copy, whatever data.json says', async () => {
  Platform.isDesktopApp = false;
  try {
    const { files } = await page('claude-limits', { folder: 'claude-limits', repo: REPO, dataDir: dataDir() });
    assert.equal(files['hw.js'], 'S.push({"ts":1});');
  } finally { Platform.isDesktopApp = true; }
});

// a claude-limits code block in a note, drawn from the vault copy
async function block(source) {
  const plugin = new ClaudeLimits(vault(copy('claude-limits')), null);
  await plugin.onload();
  assert.equal(plugin.blocks.language, 'claude-limits');
  let child;
  const el = { empty() {}, createEl: () => ({ addEventListener() {}, dataset: {}, style: {} }) };
  plugin.blocks.process(source, el, { addChild: c => { child = c; } });
  await child.show();
  return { doc: child.frame.srcdoc, query: new URLSearchParams(child.frame.dataset.query) };
}
// the style a block adds to the page, and the parts of the page it leaves out
const style = doc => doc.split('<style data-block>')[1] ?? '';
const hidden = doc => ['.tiles', 'figure', '.projects'].filter(part => style(doc).includes(`${part} { display: none`));

test('a block without options shows the tiles and the chart of the past week, without buttons', async () => {
  const { doc, query } = await block('');
  assert.equal(query.get('days'), '7');
  assert.deepEqual(hidden(doc), ['.projects']);
  assert.ok(style(doc).includes('.navs, #split { display: none'));
});

test('a block takes the range, the parts it shows and the split of the table', async () => {
  const { doc, query } = await block('range: 30d\nshow: tiles, table\nby: agent');
  assert.equal(query.get('days'), '30');
  assert.equal(query.get('by'), 'agent');
  assert.deepEqual(hidden(doc), ['figure']);
});

test('a range reaches the page in its own words', async () => {
  for (const [range, days] of [['5h', '5h'], ['1d', '1'], ['all', 'all']])
    assert.equal((await block(`range: ${range}`)).query.get('days'), days);
});

test('a part the block does not know is left out, and with none it knows the block shows tiles and chart', async () => {
  assert.deepEqual(hidden((await block('show: chart, gauges')).doc), ['.tiles', '.projects']);
  assert.deepEqual(hidden((await block('show: gauges')).doc), ['.projects']);
});

// .x a class in the page, #x an id, a tag its opening tag; the parser adds html, head and body itself
const found = (page, selector) =>
  selector[0] === '.' ? new RegExp(`class="([^"]* )?${selector.slice(1)}( [^"]*)?"`).test(page)
  : selector[0] === '#' ? page.includes(`id="${selector.slice(1)}"`)
  : ['html', 'head', 'body'].includes(selector) || new RegExp(`<${selector}[\\s>]`).test(page);

test('the page still has every part a block hides or restyles', async () => {
  // between them the two blocks write every rule a block has
  const docs = await Promise.all(['', 'show: table'].map(async source => (await block(source)).doc));
  const selectors = new Set(docs.flatMap(doc => [...style(doc).matchAll(/^([^{]+)\{/gm)].flatMap(rule => rule[1].split(',').map(s => s.trim()))));
  const page = docs[0].split('<style data-block>')[0];
  assert.deepEqual([...selectors].filter(selector => !found(page, selector)), []);
});

test('the chart in a block keeps its height, since the frame takes the height of what it shows', async () => {
  assert.doesNotMatch((await block('')).doc, /clamp\([^)]*vh/);
});

test('the view keeps the buttons and the chart height of the page', async () => {
  const { doc } = await page('claude-limits', null);
  assert.deepEqual(hidden(doc), []);
  assert.equal(style(doc), '');
  assert.match(doc, /clamp\([^)]*vh/);
});
