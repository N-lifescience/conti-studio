# 콘티 작업실(교사판) — 작업 규칙

- 화면은 빌드 없는 정적 HTML·JS. GitHub Pages(N-lifescience/conti-studio)로 배포한다.
- 엔의 유튜브 작업실(youtube/conti, server.py)과 같은 콘티 형식을 쓴다. backend.js 의 ServerBackend 는 그 서버용.
- 고친 뒤 `node --test tests/` 를 돌린다. innerHTML 은 쓰지 않는다(h() 로 만든다).
- 사용자용 한국어 문구는 `/Volumes/T7/AGENTS.md`의 한국어 UI 규칙을 따른다.
- 학생 데이터, 개인정보, 인증, 외부 API를 건드리기 전에 `/Volumes/T7/Projects/_workspace-rules/dorms-ready.md`를 읽고 따른다.
