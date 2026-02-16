# create-glanceway-source

Scaffold a [Glanceway](https://glanceway.app) source with full build/test tooling and AI-assisted development support.

## Quick Start

```bash
npm create glanceway-source
```

Or with a source name:

```bash
npm create glanceway-source my-source
```

You'll be prompted for:

- **Display name** — shown in Glanceway
- **Description** — brief summary of what the source does
- **Author** — your name or handle
- **Author URL** — optional link (e.g., GitHub profile)
- **Category** — Developer, News, Social, Finance, Entertainment, Productivity, or Other

Non-interactive mode (all flags required):

```bash
npm create glanceway-source my-source \
  --name "My Source" \
  --description "Fetches items from Example API" \
  --author myname \
  --author-url "https://github.com/myname" \
  --category Developer
```

## Developing with AI

The scaffolded project includes a `CLAUDE.md` file with the full Glanceway API reference, source lifecycle documentation, and coding conventions. To use it with [Claude Code](https://claude.com/claude-code):

1. `cd` into your scaffolded project
2. Run `claude` to start Claude Code
3. `CLAUDE.md` is automatically read, giving Claude full context about the Glanceway Source API

Example prompts:

- "Fetch the top posts from Hacker News and emit them as items"
- "Check my service's status and emit an item when its status changes"
- "Ask AI to ask me a philosophical question every day and emit the question as an item"

## Building & Testing

```bash
cd my-source
npm install

# Build: compiles source, creates dist/latest.gwsrc
npm run build

# Test: executes source with mock API, validates emitted items
npm run test

# Pass config values for testing
npm run test -- --config API_TOKEN=xxx --config USERNAME=yyy
```

The `dist/latest.gwsrc` file is the importable source package.

## Importing into Glanceway

1. Open **Glanceway**
2. Go to **Sources**
3. Click **Import from file**
4. Select `dist/latest.gwsrc`

## Submitting to glanceway-sources

To share your source with the community, [open an issue](https://github.com/glanceway/glanceway-sources/issues) on glanceway-sources with a link to your project repository.
