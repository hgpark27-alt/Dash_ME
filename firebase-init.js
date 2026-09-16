/* Firebase 프로젝트 설정 (manage.html / list.html / view.html 공용)
   - Firebase Auth는 화면에 노출되지 않는 익명 로그인으로 항상 자동 처리한다.
   - 화면에 보이는 아이디/비밀번호 입력은 Firestore의 config/gate 문서 값과
     클라이언트에서 단순 대조하는 "앱 접근 자물쇠"이며, Firebase 로그인과는 무관하다. */
var firebaseConfig = {
  apiKey: "AIzaSyDu9d4ZgGPce2Dg-iMEHW_-SbMMNCmo9-M",
  authDomain: "dashme-pnl.firebaseapp.com",
  projectId: "dashme-pnl",
  storageBucket: "dashme-pnl.firebasestorage.app",
  messagingSenderId: "538136012438",
  appId: "1:538136012438:web:fd524b51a5262b4fec84b7"
};
firebase.initializeApp(firebaseConfig);
/* 로컬(IndexedDB) 캐시 활성화 — 한 번 받은 버전 데이터는 다음 방문 때
   네트워크 재다운로드 없이 즉시 뜬다. 대용량 버전(청크 여러 개)일수록
   효과가 크다. 여러 탭에서 동시에 열면 캐시 소유권 문제로 실패할 수
   있어 실패해도 그냥 무시(캐시 없이 매번 네트워크로 받는 것과 동일). */
firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(function(err){
  console.warn("오프라인 캐시 활성화 실패(무시 가능):", err.code);
});
/* onAuthStateChanged로 기존 세션 복원을 먼저 기다린 뒤, 세션이 전혀 없을 때만
   새로 익명 로그인한다 — 매번 무조건 호출하면 이미 로그인된 상태에서도
   불필요한 네트워크 왕복(약 300ms)이 매 페이지 로드마다 발생한다. */
firebase.auth().onAuthStateChanged(function(user){
  if (!user){
    firebase.auth().signInAnonymously().catch(function(err){
      console.error("Firebase 익명 로그인 실패", err);
    });
  }
});

var APP_GATE_KEY = "dashGateOk";

function dashIsUnlocked(){
  try { return localStorage.getItem(APP_GATE_KEY) === "1"; } catch(e){ return false; }
}
function dashSetUnlocked(){
  try { localStorage.setItem(APP_GATE_KEY, "1"); } catch(e){}
}

/* 로그인이 안 되어 있으면 login.html(별도 페이지)로 이동시키고,
   이미 로그인돼 있으면 onUnlocked()를 바로 실행한다. */
function appGate(onUnlocked){
  if (dashIsUnlocked()){ onUnlocked(); return; }
  var here = location.pathname.split("/").pop() + location.search;
  location.href = "login.html?next=" + encodeURIComponent(here);
}
