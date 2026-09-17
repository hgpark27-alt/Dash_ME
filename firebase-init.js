/* Firebase 설정 (manage.html / index.html / view.html 공용)
   - Realtime Database 사용(더미 데이터 단계 — 인증 없이 즉시 읽고 쓴다).
   - 기존 게임 프로젝트(thegoodgame-3b670)의 이미 만들어진 무료 RTDB 인스턴스를
     경로만 분리해서(salesDashboard/...) 재사용한다. 실데이터가 들어가면
     별도 프로젝트/인증 방식으로 다시 분리하는 것을 검토해야 한다.
   - 화면에 보이는 아이디/비밀번호는 DB의 salesDashboard/config/gate 값과
     클라이언트에서 단순 대조하는 "앱 접근 자물쇠"일 뿐이다. */
var firebaseConfig = {
  apiKey: "AIzaSyAk2XHcSiKQyWXImGZGfA-kXSI5pwEqtoU",
  authDomain: "thegoodgame-3b670.firebaseapp.com",
  databaseURL: "https://thegoodgame-3b670-default-rtdb.firebaseio.com",
  projectId: "thegoodgame-3b670",
  storageBucket: "thegoodgame-3b670.firebasestorage.app",
  messagingSenderId: "321525181369",
  appId: "1:321525181369:web:10e533051aa3149e89e468"
};
firebase.initializeApp(firebaseConfig);

var DASH_ROOT = "salesDashboard";
function dashRef(path){
  return firebase.database().ref(DASH_ROOT + (path ? "/" + path : ""));
}

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
