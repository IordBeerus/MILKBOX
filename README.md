<div align="center">

<img src="SiteIcon.png" width="260" alt="MILKBOX logo">

# MILKBOX

Personal media library for movies, TV shows, anime, and manga.

</div>

## Features

- Movies and TV show library
- Anime section powered by TMDB
- Manga catalog with covers and metadata
- MangaDex chapter reader with real page images
- Free To Watch titles
- Trending titles
- Home recommendations based on your My List and quick genre exploration
- Streaming titles
- In-theater movies
- My List
- Custom controls for direct video URLs and uploaded video files
- Uploaded TV episodes
- About:Blank opener
- Custom themes and backgrounds
- Tab title, favicon, and logo customization
- Local browser storage for personal settings and library data

## Requirements

- Node.js 20.19 or newer
- pnpm

## Installation

```bash
pnpm i
```

Create a `.env` file from `.env.example` and add one TMDB credential: `TMDB_API_KEY` (the shorter v3 API key) or `TMDB_ACCESS_TOKEN` (the v4 Read Access Token). MangaDex uses `MANGADEX_ACCESS_TOKEN`.

```bash
cp .env.example .env
```

The `.env` file is ignored by Git. Keep it local and never commit it.

Start the App
```
pnpm start
```
Then open:
```
http://localhost:3000
```
The app should be opened through the local server instead of opening index.html directly. The local server is required for the MangaDex proxy and manga chapter reader.

## Install as an App

Open MILKBOX in a browser that supports installing web apps and choose **Install MILKBOX** from the browser menu. In supported browsers, the **Install** button is also available in **Settings → General**. On iPhone or iPad, use **Share → Add to Home Screen**.

Deployed sites must use HTTPS for app installation; `localhost` is supported for local development. MILKBOX uses a network-only service worker to enable Chrome's in-app installation prompt without caching site content. The installed app requires an internet connection.

## Blocking Pop-up Ads

MILKBOX includes built-in, app-level protection for pop-ups opened by MILKBOX; no extension or userscript installation is needed for that protection. Website code cannot provide AdGuard's browser-wide protection: browsers isolate cross-origin playback frames and other websites from MILKBOX.


## Render Deployment

Use the included `render.yaml` to create the web service. In the Render
dashboard, set `TMDB_API_KEY` or `TMDB_ACCESS_TOKEN` under Environment before
opening the site. Without one of these variables, no live catalog titles can
be loaded.

APIs
MILKBOX uses external services for live content:

TMDB for movies, TV shows, anime, trending titles, streaming information, and theater listings
Tenrai for manga metadata and covers
MangaDex for manga chapters and readable page images
API availability depends on the external services and their rate limits.

## Embedding movies and series

The player selector keeps the existing playback providers and adds the
Milkbox API player and direct/uploaded video options. Existing providers
continue to use their embedded players. Choose Milkbox Player to use MILKBOX's
native video controls with a configured authorized playback API. TMDB and
IMDb IDs identify titles but do not supply video; configure an API that accepts
these IDs and returns a direct, browser-playable video URL.

Set `MILKBOX_PLAYBACK_API_URL` and (if required) `MILKBOX_PLAYBACK_API_KEY`
in `.env`. The key is sent from the server as a Bearer token and is never
exposed to browser JavaScript. Restart MILKBOX after changing the environment.

`milkbox-player.js` exposes `window.MilkboxPlayer` for embedding a movie or a
series episode in an element on a page served by MILKBOX. Include the player
script, then call `embed`:

```html
<div id="player" style="width: 100%; aspect-ratio: 16 / 9"></div>
<script src="/milkbox-player.js"></script>
<script>
  MilkboxPlayer.embed({
    target: '#player',
    id: 'tt0133093',
    idType: 'imdb',
    type: 'movie'
  }).catch(console.error);
</script>
```

To play a series episode:

```js
MilkboxPlayer.embed({
  target: '#player',
  id: '1399',
  idType: 'tmdb',
  type: 'tv',
  season: 2,
  episode: 4,
  title: 'My Series'
}).catch(console.error);
```

### `MilkboxPlayer.embed(options)`

Returns a promise that resolves to the custom player element. Once the
playback API returns a valid URL, the target's contents are replaced with the
Milkbox video player. The player supports direct video sources accepted by the
browser (for example, MP4 and WebM; HLS support depends on the browser).
Invalid input, an unavailable API, or a failed lookup rejects the promise.

| Option | Required | Description |
| --- | --- | --- |
| `target` | Yes | An HTML element or CSS selector for the player container. |
| `id` | Yes | A positive integer TMDB ID or an IMDb ID in `tt1234567` format. |
| `idType` | No | `tmdb` (default) or `imdb`. |
| `type` | Yes | `movie` or `tv` (`tv` means a series). |
| `season` | No | Positive season number for `tv`; defaults to `1`. |
| `episode` | No | Positive episode number for `tv`; defaults to `1`. |
| `title` | No | Accessible player title; defaults to the API title or “Movie player” / “Series player”. |

### Playback API contract

MILKBOX calls the configured `MILKBOX_PLAYBACK_API_URL` as a GET request,
appending these query parameters:

| Parameter | Description |
| --- | --- |
| `id` | TMDB numeric ID or IMDb `tt` ID, as supplied to `embed`. |
| `idType` | `tmdb` or `imdb`. |
| `type` | `movie` or `tv`. |
| `season` | Requested season (series only; movies send `1`). |
| `episode` | Requested episode (series only; movies send `1`). |

If `MILKBOX_PLAYBACK_API_KEY` is set, the server sends
`Authorization: Bearer <key>`. The API must return JSON with a direct
browser-playable media URL:

```json
{
  "url": "https://media.example/watch/authorized-signed-url.mp4",
  "title": "Optional title"
}
```

`title` is optional. `url` must use HTTP or HTTPS and should be a direct media
file or manifest URL, not another provider's embed page. The adapter rejects
responses without a valid URL and reports API/network errors to the caller.
For example, if the configured endpoint is `https://media.example/resolve`,
MILKBOX will request
`https://media.example/resolve?id=tt0133093&idType=imdb&type=movie&season=1&episode=1`.
The API must be licensed/authorized to provide the requested media.

The client-side `MilkboxPlayer.resolvePlayback(options)` method accepts the
same media options as `embed` (without `target` or `title`) and resolves to
the configured API's `{ url, title }` response without mounting the player.

An API URL/key is not configured by default. Without one, playback resolution
returns an explicit configuration error; TMDB credentials alone cannot supply
video.

Manga Reader
Select a manga card to open the reader. The reader finds the matching MangaDex title, loads available chapters, and retrieves real chapter pages through the local server proxy.

Some manga may not have readable chapters available on MangaDex.

## Data Storage
User settings, custom library items, themes, and preferences are stored locally in the browser using localStorage.

No personal library data is stored in the project repository.

## Project Structure
```
.
├── app.js
├── index.html
├── styles.css
├── server.js
├── library.json
├── package.json
└── pnpm-lock.yaml
```

Disclaimer
MILKBOX is intended for personal media organization and playback. Content availability depends on the external services and sources used by the application.
