# An LLM agent ascends in NetHack on its first try

A static page with the full recording of an AI agent's ascension in NetHack (18–19 October 2026): the terminal screen
after every key press and the key that was pressed, with a player and milestones.

- `index.html`, `style.css`, `player.js`: the page and the player (no build step, no dependencies).
- `data/meta.json`: frame count, chunk index and milestones; `data/c000.json.gz` … `c021.json.gz`: the frames (3.6 MB).

## Publish on GitHub Pages
1. Put the contents of this folder at the root of a repository (or in `docs/`).
2. Settings → Pages → Deploy from a branch → the branch and folder.

## View locally
The page loads its data with `fetch`, so open it through a web server, not as a file:

    python3 -m http.server 8000      # then open http://localhost:8000

A moment can be linked directly: `#f=<screen index>`, e.g. `#f=86150` (the offering on the Astral Plane).

## License
MIT (see `LICENSE`). NetHack itself is copyright the NetHack DevTeam and others, under the NetHack General Public
License; this repository holds only a recording of one game, not the game.
