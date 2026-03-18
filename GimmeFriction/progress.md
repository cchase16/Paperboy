Original prompt: please build a tiny web server to test this site

- Confirmed the project is a single `Index.html` file plus `GMFAudio/*` assets.
- Confirmed the page fetches `GMFAudio/Jukebox.xml`, so the server must serve static files with at least HTML, XML, and MP3 content types.
- Swapped the server implementation to a dependency-free Node static server in `serve.mjs`, with `serve.ps1` acting as the PowerShell entrypoint.
- TODO: Keep using `serve.ps1` for local smoke tests whenever asset-loading behavior changes.
