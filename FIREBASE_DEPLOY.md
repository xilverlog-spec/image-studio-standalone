# Firebase Hosting 배포 가이드

## 1단계: Firebase 로그인
```powershell
firebase login
```
- 브라우저가 열립니다
- dxarchi01@gmail.com 으로 로그인
- "Allow" 클릭하여 권한 부여

## 2단계: Firebase 프로젝트 생성
- [Firebase Console](https://console.firebase.google.com) 접속
- "프로젝트 만들기" 클릭
- 프로젝트 이름: `image-studio-standalone`
- 나머지는 기본값으로 진행

## 3단계: Hosting 초기화 (첫 배포만)
```powershell
cd "C:\Users\unjin\OneDrive - SANGJI\바탕 화면\DX AI LAB\image-studio-standalone"
firebase init hosting
```
- 프로젝트 선택: `image-studio-standalone`
- Public directory: `dist` (엔터)
- Configure as single-page app: `y` (엔터)
- 나머지는 기본값

## 4단계: 배포 실행
```powershell
npm run build
firebase deploy
```

## 배포 완료!
배포 후 다음과 같은 URL이 제공됩니다:
```
https://image-studio-standalone-xxxxx.web.app
```

이 URL을 다른 PC에서 접근하면 바로 사용 가능합니다! 🚀

## 주의사항
- Backend API가 `localhost:5000`이므로 동시에 Backend도 실행 중이어야 함
- 또는 Backend도 클라우드(Heroku, Render 등)에 배포해야 함
