# 콘티 작업실 — AI용 안내

선생님이 콘티 작업실(https://n-lifescience.github.io/conti-studio/)에서 고친 콘티를 읽고, 콘티대로 영상을 만드는 AI(Claude Code·Codex·Gemini CLI 등)를 위한 문서다.
선생님은 영상 폴더를 열어 컷마다 화면을 보고 고친다. 렌더(영상 만들기)는 AI가 한다.

## 영상 폴더

```
<영상 폴더>/
  script/<id>.json          대본: 줄 목록
  conti/<id>.json           콘티: 컷 목록 (선생님이 고치는 파일)
  conti/<id>-timeline.json  줄마다 실제 시각(나레이션 녹음 뒤)
  conti/.history/<id>/      저장할 때마다 남는 이전 판(건드리지 않는다)
  media/                    그림·영상·캐릭터(chars/)·배경
  stills/<id>/L001.jpg …    줄마다 정지 화면(선생님 확인용, AI가 만든다)
  audio/tts/<id>-narration.wav  TTS 작업실 나레이션(있으면)
```

`<id>` 는 영문·숫자(`V1`, `S1`)다. 경로는 콘티의 `paths` 가 정하고, 비어 있으면 위 기본값을 쓴다.
`paths` 의 `{id}` 는 콘티 id 로 바뀐다. 예전 프로젝트는 `public: "video/public"`, `timeline: "video/src/data/{id}-timeline.json"` 일 수 있다.

## 파일 형식

### script/<id>.json

```json
[{ "n": 1, "display": "오늘은 효모가 설탕을 먹으면 무엇이 나오는지 알아볼 거예요.", "role": "narrator" },
 { "n": 2, "display": "풍선 속에는 무엇이 들어 있을까요?", "role": "viewer" }]
```

`role` 은 `narrator`(나레이션) 또는 `viewer`(질문하는 목소리). `section`·`sectionTitle` 을 두면 화면에서 단락 제목이 된다.

### conti/<id>.json

```jsonc
{
  "conti": 1, "id": "V1", "title": "효모 발효 실험", "shape": "wide",   // wide 1920×1080, tall 1080×1920
  "promise": "이 영상의 목표 한 줄", "thumb": "media/cover.jpg",
  "paths": { "script": "script/{id}.json", "timeline": "conti/{id}-timeline.json", "public": "media", "stills": "stills/{id}" },
  "bgm": [ { "src": "bgm/calm.mp3", "from": 1, "to": 6, "volume": 0.4 } ],
  "lineEdits": { "3": { "display": "고친 대사", "was": "원래 대사" } },
  "cuts": [
    { "id": "c1", "from": 1, "kind": "photo", "bg": "lab/bottle.jpg",
      "els": [ { "t": "label", "text": "**효모** + 설탕", "pos": [960, 160], "at": 1.2, "color": "yellow", "size": 64 } ],
      "plan": "사람이 읽는 화면 설명", "memo": "선생님 부탁", "status": "ok | fix | (빈칸)" }
  ]
}
```

- 컷 하나는 시작 줄 `from` 부터 다음 컷 앞 줄까지다. `from: 3.5` 는 3번 줄 가운데에서 바뀐다.
- `kind`: `grid`(노트 바탕) `photo`(사진 바탕, `bg`) `mascot`(캐릭터, `who`) `burst`(강조 글자, `text`) `doc`(자료 카드) `dark` `black`.
- 그림 경로: `bg` 는 `media/bg/<값>.jpg`, 값에 `/` 가 있으면 `media/<값>.jpg`, 확장자가 붙어 있으면 `media/<값>` 그대로. `who` 는 `media/chars/<값>.png`. `img.src`·`vid.src` 는 `media/` 기준 경로.
- 요소 `els[].t`: `label` `say`(말풍선) `card` `stamp` `tile` `type`(타자) `img` `vid` `arrow` `x` `o` `q` `count` `bars` `ring` `zoombox`.
  공통 값 `pos:[x,y]`(화면 픽셀, 가운데 기준), `at`(나오는 줄 번호, 소수 가능), `size`(글자 크기). `img`·`vid` 는 `h`(높이), `vid` 는 `from`(영상 몇 초부터).
- 글씨의 `**두 별표**` 는 강조색, 줄바꿈은 화면에서도 줄바꿈이다.

### conti/<id>-timeline.json

```json
{ "source": "TTS 작업실", "audio": "audio/tts/V1-narration.wav", "duration": 41.2,
  "lines": [ { "n": 1, "start": 0.0, "end": 3.1 }, { "n": 2, "start": 3.4, "end": 6.0 } ] }
```

없으면 작업실이 글자 수로 길이를 어림한다(`estimated: true` 인 타임라인도 어림으로 본다).

## 할 일

### 1. 콘티 만들기

- **대본이 있을 때**: 줄마다 `script` 를 쓰고, 화면이 바뀌는 곳마다 컷을 둔다. 컷마다 `plan` 에 무엇을 보여 줄지 한 줄로 적는다.
- **수업·활동 영상(촬영본)이 있을 때**: 파일을 `media/` 에 두고, 말소리를 받아써서 줄로 만들거나 선생님이 준 나레이션을 줄로 쓴다.
  장면마다 `vid` 요소(`src`, `from` = 그 장면이 시작하는 초)로 컷을 만든다. 학생 얼굴·이름·명찰이 보이는 곳은 `memo` 에 적고 선생님께 묻는다.
- 그림이 필요하면 `media/` 에 넣고 경로를 쓴다. 남의 저작물은 출처와 라이선스를 `plan` 이나 별도 파일에 남긴다.

### 2. 선생님이 고친 콘티 반영하기

선생님이 "콘티를 고쳤어, 반영해 줘" 라고 하면:

1. `status: "fix"` 인 컷과 `memo` 가 있는 컷을 모두 읽고 화면을 고친다. 반영한 컷은 `memo` 를 비우고 `status` 를 빈칸으로 돌린다.
2. `lineEdits` 가 있으면 `script` 의 `display` 를 고친 글로 바꾸고 `lineEdits` 를 비운다. 이미 녹음했다면 그 줄을 다시 녹음해야 한다고 알린다(TTS 작업실에서 그 줄만 다시 뽑으면 된다).
3. 선생님이 화면에서 끌어 옮긴 `pos`, 바꾼 그림, 고친 글씨는 그대로 쓴다.
4. 고친 뒤 정지 화면(`stills/<id>/L###.jpg`, 각 줄이 끝나는 순간의 화면)을 다시 만들면 선생님이 바로 확인할 수 있다.

### 3. 나레이션 (TTS 작업실)

[TTS 작업실](https://github.com/N-lifescience/tts-studio)은 선생님 목소리로 대본을 읽는 무료 앱이다.
작업실의 「대사 내보내기」 글을 TTS 작업실에 넣어 녹음하고, 내보내기 폴더를 「TTS 결과 불러오기」로 고르면
`conti/<id>-timeline.json` 과 `audio/tts/<id>-narration.wav` 가 생긴다. 렌더할 때 이 소리와 시각을 쓴다.
TTS 작업실은 한 줄 안의 문장(. ? !)을 조각으로 나누고, 작업실은 그 조각들을 다시 줄로 묶는다.

### 4. 영상 만들기

- 권장: [Remotion](https://www.remotion.dev) — 컷을 장면 하나로, 요소를 `at` 줄 시각에 나타나게 그린다. 컷의 사람용 칸(`id`·`plan`·`memo`·`status`)만 떼면 장면 값이 된다.
- 간단히: ffmpeg — 컷마다 배경 그림이나 영상 조각을 컷 길이만큼 이어 붙이고 나레이션을 깐다. 글씨는 자막이나 그림으로 얹는다.
- 결과는 `out/` 에 둔다(작업실은 `out/` 을 읽지 않는다).

## 지킬 것

- `conti/.history/` 는 지우거나 고치지 않는다.
- 선생님이 고친 값을 다른 값으로 바꾸지 않는다. 바꿔야 하면 `memo` 에 이유를 남기고 묻는다.
- 학생 개인정보(얼굴·이름·학번·목소리)는 학교 동의 범위 안에서만 쓰고, 공개 영상에서는 가린다.
