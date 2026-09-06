# Keyboard Shortcuts

## Navigation

| Key                             | Action                    |
| ------------------------------- | ------------------------- |
| `Space`, `→`, `↓`, `PageDown`   | Next slide                |
| `←`, `↑`, `PageUp`, `Backspace` | Previous slide            |
| `Home`                          | First slide               |
| `End`                           | Last slide                |
| `G`                             | Go to slide (type number) |

## Stage Controls

| Key | Action                          |
| --- | ------------------------------- |
| `F` | Toggle fullscreen for the stage |

## Editor Window

| Key | Action                                   |
| --- | ---------------------------------------- |
| `E` | Toggle edit mode                         |
| `R` | Reload the deck                          |
| `T` | Toggle app theme (light/dark UI chrome)  |
| `P` | Toggle viewer window (viewing mode only) |
| `B` | Toggle break overlay (viewing mode only) |

## Search & Command Palette

| Key                                          | Action                 |
| -------------------------------------------- | ---------------------- |
| `/` or `?` or `Ctrl+Shift+F` (`Cmd+Shift+F`) | Full-text slide search |
| `Ctrl+K` (`Cmd+K`)                           | Command palette        |

Note: the browser's own `Ctrl+F` find bar is not intercepted; use `/` or
`Ctrl+Shift+F` for the in-app slide search.

## Edit Mode — Structural

| Key                                       | Action                                   |
| ----------------------------------------- | ---------------------------------------- |
| `Ctrl+S` (`Cmd+S`)                        | Save changes                             |
| `Alt+N`                                   | New slide (opens layout picker)          |
| `Alt+D`                                   | Duplicate current slide                  |
| `Alt+Backspace`                           | Delete current slide (with confirmation) |
| `Alt+Shift+↑`                             | Move slide up                            |
| `Alt+Shift+↓`                             | Move slide down                          |
| `Ctrl+Z` (`Cmd+Z`)                        | Undo                                     |
| `Ctrl+Shift+Z` / `Ctrl+Y` (`Cmd+Shift+Z`) | Redo                                     |

## Edit Mode — Insert Content

| Key           | Action                                            |
| ------------- | ------------------------------------------------- |
| `Alt+I`       | Insert image                                      |
| `Alt+T`       | Insert text block                                 |
| `Alt+L`       | Open layout picker for current slide              |
| `Alt+A`       | Toggle column resize handles                      |
| `Alt+M`       | Toggle Mermaid helper panel                       |
| `Alt+Shift+T` | Toggle current slide's theme (`theme:` directive) |
| `Alt+S`       | Toggle slide styles panel                         |

## Notes

- `B` (break) and `P` (present) are disabled in edit mode — the break is for the presenter view, and the presenter window is only useful when presenting.
- The presenter panel includes a **Break length** dropdown (5–15 minutes, default 10). When a break is started, the break slide shows the time you'll return.
- `Alt+` is used for new slide and duplicate (instead of `Ctrl+N` / `Ctrl+D`) because those `Ctrl` combinations are reserved by the browser.
- All edit-mode shortcuts are discoverable in the **Format** dropdown and in the right-click context menu on slide thumbnails.
- There are two distinct theme toggles: `T` toggles the global **app theme** (UI chrome), while `Alt+Shift+T` toggles the current **slide's theme** (`theme:` directive).
