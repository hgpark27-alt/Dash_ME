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
firebase.auth().signInAnonymously().catch(function(err){
  console.error("Firebase 익명 로그인 실패", err);
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
