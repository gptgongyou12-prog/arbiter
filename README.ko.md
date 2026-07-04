<div align="center">

# 🎵 arbiter

### 내 음악을, AI와 유튜브 원탭으로.

광고도 추적도 없이, 진짜 스트리밍처럼 즐기는 나만의 음악.<br/>
유튜브에서 원탭으로 담고, AI가 골라주고 추천하고 번역까지. 폰에 설치하면 끝.

<sub>🇰🇷 **한국어** · <a href="README.md">🇺🇸 English</a></sub>

<br/>

![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa&logoColor=white)
![AI](https://img.shields.io/badge/AI-NVIDIA%20NIM-76B900?logo=nvidia&logoColor=white)
![Status](https://img.shields.io/badge/상태-출시%20예정-orange)

<br/>

<img src="docs/lyrics-translate.png" width="820" alt="arbiter — 싱크 가사 원탭 번역"/>

</div>

---

**arbiter**는 *내* 컬렉션을 진짜 스트리밍처럼 즐기고 싶은 사람을 위한 음악 플랫폼입니다.
대형 서비스의 광고도 추적도 없이 — 광고 없는 나만의 스포티파이. 게다가 유튜브에서 음악
담기가 이렇게 빠른 앱은 없고, 이미 가진 음악을 다시 발견하는 데 이만한 게 없습니다.

<br/>

## 🤖 AI, 전면에

arbiter는 **NVIDIA NIM** 모델(임베딩 + LLM)로 라이브러리를 '말이 통하는' 존재로 만듭니다.
그냥 파일이 쌓인 폴더가 아니라, *말을 걸 수 있는* 음악 서재.

| | |
|---|---|
| 🪄 **자연어 큐레이션** | 그냥 분위기를 적으세요 — *"비 오는 밤에 어울리는 곡"*, *"운동할 때 신나는 거"*. arbiter가 내 라이브러리를 의미 기반으로 뒤진 뒤, LLM이 진짜 어울리는 곡만 골라냅니다. 큐에 넣거나 플레이리스트로 저장, 전부 한 탭. |
| 🎯 **유사곡 추천** | 모든 곡에 의미 임베딩이 붙습니다. 그래서 "이 곡이랑 비슷한 거 찾아줘"가 장르 태그가 아니라 **분위기와 결**로 통합니다. |
| 🌐 **가사 번역** | 한 탭이면 어떤 가사든 번역. 특히 **싱크(LRC) 가사**는 타임태그를 떼어내 한 줄씩 번역하고 다시 붙여서 — *번역본도 음악에 맞춰 그대로 흐릅니다.* |

<div align="center">
<table>
<tr>
<td width="33%"><img src="docs/ai-curate.png" alt="자연어 큐레이션"/><br/><sub><b>🪄 분위기만 적으면 큐가 채워진다</b></sub></td>
<td width="33%"><img src="docs/similar-songs.png" alt="유사곡 추천"/><br/><sub><b>🎯 결이 비슷한 곡을 알아서</b></sub></td>
<td width="33%"><img src="docs/lyrics-translate.png" alt="싱크 가사 번역"/><br/><sub><b>🌐 한 줄씩, 싱크 유지 번역</b></sub></td>
</tr>
</table>
</div>

> 라이브러리는 비공개로 유지됩니다 — 각 요청에 꼭 필요한 최소한의 텍스트만 AI 모델로
> 전송됩니다.

<br/>

## 📥 유튜브, 제일 쉽게

음악 담기는 다운로드 매니저와의 씨름이 아니라 **원탭**이어야 한다 — 그 생각으로 만들었습니다.

- **🎬 단일 영상** — 링크를 붙여넣거나(앱 안에서 검색도 가능) 하면, 오디오 추출·트랜스코딩·
  파형 생성까지 자동으로 끝나고 라이브러리에 쏙 들어갑니다.
- **📋 플레이리스트 통째로** — 유튜브 플레이리스트 URL 하나로 전체를 백그라운드에서 가져오고,
  진행률도 실시간으로 보여줍니다.
- **✂️ 타임라인 분할** — 한 시간짜리 믹스나 통짜로 올라온 앨범 영상? 타임스탬프를 읽어서
  **곡별로 쪼개줍니다.** 태그까지 붙여 바로 재생 가능.
- **📡 백그라운드 잡** — 모든 임포트는 상단 진행 배너와 함께 백그라운드에서 돌아갑니다.
  그동안 계속 둘러봐도 됩니다.

<div align="center">
<table>
<tr>
<td width="50%"><img src="docs/youtube-import.png" alt="유튜브 임포트 — 검색"/><br/><sub><b>🎬 검색해서 원탭 임포트</b></sub></td>
<td width="50%"><img src="docs/timeline-split.png" alt="타임라인 분할"/><br/><sub><b>✂️ 한 시간 믹스가 곡별로 착착</b></sub></td>
</tr>
</table>
</div>

<br/>

## 🎵 그 외 전부

<table>
<tr>
<td width="50%" valign="top">

**라이브러리 & 재생**
- 프로젝트 → 트랙 → 버전 구조
- 끊김 없는 큐, 다음에 재생, 셔플 & 반복
- 파형 표시 & 커버 아트
- 라이브러리 전체 검색

**가사**
- iTunes / LRCLIB 자동 검색
- 싱크(LRC) 또는 일반 가사
- 직접 편집 & 곡별 타이밍 보정

</td>
<td width="50%" valign="top">

**공유 & 멀티 유저**
- 다른 사람을 내 라이브러리에 초대
- 프로젝트 또는 개별 트랙 공유
- 편집 / 다운로드 권한 세분화

**오프라인 & 휴대성**
- ✈️ 비행기 모드 캐싱 (Cache API)
- 📦 원클릭 ZIP 내보내기 (폴더 구조 그대로)
- 📱 설치형 PWA — iOS 백그라운드 재생,
  미디어 세션 컨트롤 & 푸시 알림

</td>
</tr>
</table>

<br/>

## 🚀 출시 예정

arbiter는 **호스팅 플랫폼**으로 찾아옵니다 — 설치도, 굴릴 서버도 필요 없이. 어느 기기에서든
로그인하고 바로 재생하세요. 월 구독 플랜과 함께 정식 출시를 준비하고 있습니다.

<br/>

## 🧱 무엇으로 만들었나

- **백엔드** — Go 1.26, 표준 라이브러리 HTTP 라우터, SQLite(`sqlc`)
- **프론트엔드** — React + Vite, TanStack Router, Bun 빌드, Tailwind CSS, Motion
- **미디어** — FFmpeg 트랜스코딩, `yt-dlp` 임포트, Web Audio 파형
- **AI** — NVIDIA NIM (`nv-embedqa-e5-v5` 임베딩 + Qwen3 LLM)

<br/>

## 🗺️ 로드맵

- [x] AI 큐레이션 · 추천 · 가사 번역
- [x] 유튜브 단일 / 플레이리스트 / 타임라인 분할 임포트
- [x] 오프라인 캐싱 & ZIP 내보내기
- [ ] **정식 출시 + 월 구독 플랜** *(진행 중)*
- [ ] 협업 플레이리스트
- [ ] 더 풍부한 모바일 제스처

<br/>

## 👤 만든 사람

**arbiter는 대한민국의 중학교 3학년(만 15세) 개발자가 혼자 설계하고 만들었습니다** —
백엔드, 프론트엔드, AI 연동, 인프라, 디자인까지 전부 다.

내 음악 컬렉션을 스트리밍하려고 시작한 개인 프로젝트가, 어느새 제대로 된 플랫폼이 됐습니다.
이제 정식 호스팅 출시를 향해 가고 있습니다.

<br/>

<div align="center">

*⌨️ 와 🎧, 그리고 수많은 밤들로 만들었습니다.*

</div>
