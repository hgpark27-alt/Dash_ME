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

/* authGate 마크업이 있는 페이지에서 호출.
   이미 통과했었거나(로컬 저장) 이번에 통과하면 onUnlocked()를 실행한다. */
function appGate(onUnlocked){
  var gate = document.getElementById("authGate");
  var already = false;
  try { already = localStorage.getItem(APP_GATE_KEY) === "1"; } catch(e){}
  if (already){
    if (gate) gate.hidden = true;
    onUnlocked();
    return;
  }
  if (!gate){ onUnlocked(); return; }
  gate.hidden = false;

  var idInput = document.getElementById("authId");
  var pwInput = document.getElementById("authPw");
  var errBox = document.getElementById("authError");
  var btn = document.getElementById("authSubmitBtn");

  function tryUnlock(){
    errBox.hidden = true;
    firebase.firestore().collection("config").doc("gate").get().then(function(doc){
      var data = doc.data() || {};
      if (idInput.value.trim() === data.id && pwInput.value === data.pw){
        try { localStorage.setItem(APP_GATE_KEY, "1"); } catch(e){}
        gate.hidden = true;
        onUnlocked();
      } else {
        errBox.textContent = "아이디 또는 비밀번호가 올바르지 않습니다.";
        errBox.hidden = false;
      }
    }).catch(function(err){
      errBox.textContent = "확인 중 오류가 발생했습니다: " + err.message;
      errBox.hidden = false;
    });
  }
  btn.addEventListener("click", tryUnlock);
  pwInput.addEventListener("keydown", function(e){ if (e.key === "Enter") tryUnlock(); });
}
