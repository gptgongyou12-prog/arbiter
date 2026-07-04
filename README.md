<div align="center">

# 🎵 arbiter

### AI-powered music streaming with one-tap YouTube imports.

Build your own private music library, pull in anything from YouTube in a single tap,
and let AI curate, recommend, and translate — all from a fast, installable web app.

<sub>🇺🇸 **English** · <a href="README.ko.md">🇰🇷 한국어</a></sub>

<br/>

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa&logoColor=white)
![AI](https://img.shields.io/badge/AI-NVIDIA%20NIM-76B900?logo=nvidia&logoColor=white)
![Status](https://img.shields.io/badge/status-launching%20soon-orange)

<br/>

<img src="docs/lyrics-translate.png" width="820" alt="arbiter — synced lyrics with one-tap translation"/>

</div>

---

**arbiter** is a music platform for people who want a real streaming experience over
*their own* collection — without the ads or tracking of the big services. A private,
Spotify-style player that also happens to be one of the fastest ways to save music from
YouTube, and the smartest way to rediscover what you already have.

<br/>

## 🤖 AI, front and center

arbiter uses **NVIDIA NIM** models (embeddings + LLM) to make your library feel alive —
not a static folder of files, but something you can *talk to*.

| | |
|---|---|
| 🪄 **Natural-language curation** | Just describe a vibe — *"something for a rainy night"*, *"hype songs for the gym"* — and arbiter searches your own library semantically, then an LLM hand-picks the tracks that actually fit. Add them to your queue or save as a playlist in one tap. |
| 🎯 **Similar-song recommendations** | Every track gets a semantic embedding, so "find songs like this one" works across your entire collection — by mood and meaning, not just genre tags. |
| 🌐 **Lyrics translation** | Translate any song's lyrics with one tap. For **time-synced (LRC) lyrics**, arbiter strips the timestamps, translates line-by-line, and re-attaches them — so the *translation stays perfectly in sync* and scrolls with the music. |

<div align="center">
<table>
<tr>
<td width="33%"><img src="docs/ai-curate.png" alt="Natural-language curation"/><br/><sub><b>🪄 Describe a vibe → arbiter builds the queue</b></sub></td>
<td width="33%"><img src="docs/similar-songs.png" alt="Similar-song recommendations"/><br/><sub><b>🎯 Semantic "more like this"</b></sub></td>
<td width="33%"><img src="docs/lyrics-translate.png" alt="Time-synced lyrics translation"/><br/><sub><b>🌐 In-sync line-by-line translation</b></sub></td>
</tr>
</table>
</div>

> Your library stays private — only the minimal text needed for a given request is ever
> sent to the AI model.

<br/>

## 📥 YouTube, the easy way

arbiter is built around the idea that saving music should take **one tap**, not a
download-manager workflow.

- **🎬 Single-video import** — paste a link (or search inside the app) and the audio is
  fetched, transcoded, waveformed, and added to your library automatically.
- **📋 Full-playlist import** — drop a YouTube playlist URL and import the whole thing in
  the background, with live progress.
- **✂️ Timeline splitting** — got a one-hour mix or an album uploaded as a single video?
  arbiter reads the timestamps and **splits it into individual tracks**, each tagged and
  ready to play.
- **📡 Background jobs** — every import runs in the background with a live progress banner,
  so you can keep browsing while it works.

<div align="center">
<table>
<tr>
<td width="50%"><img src="docs/youtube-import.png" alt="YouTube import — search"/><br/><sub><b>🎬 Search & import in one tap</b></sub></td>
<td width="50%"><img src="docs/timeline-split.png" alt="Timeline splitting"/><br/><sub><b>✂️ A one-hour mix, auto-split into tracks</b></sub></td>
</tr>
</table>
</div>

<br/>

## 🎵 Everything else

<table>
<tr>
<td width="50%" valign="top">

**Library & playback**
- Projects → tracks → versions structure
- Gapless queue, play-next, shuffle & loop
- Waveform display & cover art
- Full-text search across your library

**Lyrics**
- Auto-fetch from iTunes / LRCLIB
- Time-synced (LRC) or plain lyrics
- Manual editing & per-track timing offset

</td>
<td width="50%" valign="top">

**Sharing & multi-user**
- Invite others to your library
- Share projects or individual tracks
- Fine-grained edit / download permissions

**Offline & portable**
- ✈️ Airplane-mode caching (Cache API)
- 📦 One-click ZIP export (folder structure preserved)
- 📱 Installable PWA with iOS background playback,
  Media Session controls & push notifications

</td>
</tr>
</table>

<br/>

## 🚀 Launching soon

arbiter is coming as a **hosted platform** — no setup, no server to run. Just sign in on
any device and start listening. A subscription plan is on the way, with a public launch
coming soon.

<br/>

## 🧱 Built with

- **Backend** — Go 1.26, standard-library HTTP router, SQLite (via `sqlc`)
- **Frontend** — React + Vite, TanStack Router, built with Bun, Tailwind CSS, Motion
- **Media** — FFmpeg transcoding, `yt-dlp` for imports, Web Audio waveforms
- **AI** — NVIDIA NIM (`nv-embedqa-e5-v5` embeddings + Qwen3 LLM)

<br/>

## 🗺️ Roadmap

- [x] AI curation, recommendations & lyrics translation
- [x] YouTube single / playlist / timeline-split imports
- [x] Offline caching & ZIP export
- [ ] **Public launch + subscription plan** *(in progress)*
- [ ] Collaborative playlists
- [ ] Richer mobile gestures

<br/>

## 👤 About

**arbiter is designed and built entirely solo by a 15-year-old (9th-grade) developer from
South Korea** — backend, frontend, AI integration, infrastructure, and design, all of it.

It started as a personal project to stream a private music collection, and grew into a
full-featured platform — now heading toward a public, hosted launch.

<br/>

<div align="center">

*Made with ⌨️, 🎧, and a lot of late nights.*

</div>
