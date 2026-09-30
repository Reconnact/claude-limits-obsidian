# claude-limits for Obsidian

**Your Claude plan limits, right where your notes are.** The [claude-limits](https://github.com/Reconnact/claude-limits) page as a view inside Obsidian: the 5-hour window, the weekly limit and the weekly Fable limit, with their history. On the Mac, and on the iPhone from a Home Screen icon.

![The claude-limits page in an Obsidian tab: three tiles for the 5-hour, weekly and Fable limits, a chart of the past week below](docs/obsidian.jpg)

- **On your phone.** Your vault's sync carries the page and its data along, so the phone shows what the Mac recorded.
- **One tap away.** A gauge icon in the ribbon, the command `Claude limits: Open`, and the link `obsidian://claude-limits` for a Home Screen icon.
- **Nothing extra to run.** A Claude Code hook copies the page into the vault after every turn.

This is an add-on. [claude-limits](https://github.com/Reconnact/claude-limits) records the limits and draws the page, and brings the menu bar item. Set it up first.

## Setup

Needs [claude-limits](https://github.com/Reconnact/claude-limits) set up on the Mac, Obsidian, and `jq`.

```sh
git clone https://github.com/Reconnact/claude-limits-obsidian.git ~/claude-limits-obsidian
~/claude-limits-obsidian/install "<path to your vault>"
```

Then restart Obsidian. Under Settings → Community plugins, turn on *Claude limits*.

`install` takes two options:

- `--repo <path>`: where claude-limits is cloned, default `~/claude-limits`
- `--folder <folder>`: the vault folder for the page and its data, default `claude-limits`

Run it again at any time. With several vaults, run it once per vault.

### What `install` changes

- copies the plugin into `<vault>/.obsidian/plugins/claude-limits/` and adds it to the vault's plugin list
- adds a `Stop` hook to `~/.claude/settings.json` and keeps a backup in `settings.json.bak`

## How it works

- after every Claude Code turn, the hook runs `copy`. It puts the page and the data files into the vault folder, each only when newer. It also updates the plugin
- Obsidian blocks scripts that an iframe loads from `app://`, so the plugin builds the page into one `srcdoc`, scripts inline
- the vault's sync moves the folder to the phone

## On the phone

1. The vault has to reach the phone, either way works:
   - **Obsidian Sync:** on the phone, under Settings → Sync, turn on *Installed community plugins*, *Active community plugin list*, and under Selective sync *Other types*. Without *Other types* the `.html` and `.js` files never arrive, and the view stays dark
   - **iCloud Drive:** a vault in `iCloud Drive/Obsidian` brings everything along
2. In Obsidian on the phone, under Settings → Community plugins: turn off restricted mode, then turn on *Claude limits*.
3. A Home Screen icon: in the Shortcuts app, make a new shortcut with the action *Open URLs* and the URL `obsidian://claude-limits`. With several vaults, use `obsidian://claude-limits?vault=<vault name>`. Then Share → *Add to Home Screen*.

The page on the phone is as new as the last Claude Code turn on the Mac, plus the time sync takes.

## Updates

```sh
git -C ~/claude-limits-obsidian pull
```

The next turn copies the new plugin into the vault. Obsidian loads it after a restart.

## Uninstall

- remove the `Stop` hook that runs `claude-limits-obsidian/copy` from `~/.claude/settings.json`
- delete `<vault>/.obsidian/plugins/claude-limits/` and the vault folder

## Test

```sh
make test
```

Needs `jq`, `node` and a claude-limits clone (`CLAUDE_LIMITS_REPO`, default `~/claude-limits`).

## License

MIT
