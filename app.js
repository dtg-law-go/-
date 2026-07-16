(() => {
"use strict";
const cfg=window.DTG_CONFIG||{};
if(!cfg.SUPABASE_URL||cfg.SUPABASE_URL.includes("YOUR_PROJECT")||!cfg.SUPABASE_ANON_KEY||cfg.SUPABASE_ANON_KEY.includes("YOUR_")){
  document.body.innerHTML='<main style="font-family:Malgun Gothic;padding:40px"><h1>Supabase 설정이 필요합니다.</h1><p><code>config.js</code>에 프로젝트 URL과 publishable/anon key를 입력하세요.</p></main>';
  return;
}
const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
const $=s=>document.querySelector(s);
let session=null,profile=null,petitions=[],activeDetail=null,busy=false;
const isAdmin=()=>profile?.role==="admin";
const esc=(v="")=>String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const fmt=v=>new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(v));
function toast(t){const e=$("#toast");e.textContent=t;e.classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add("hidden"),2600)}
function openM(id){$("#"+id).classList.remove("hidden");document.body.style.overflow="hidden";setTimeout(()=>$("#"+id).querySelector("input,textarea,select,button:not(.x)")?.focus(),0)}
function closeM(id){$("#"+id).classList.add("hidden");if(!document.querySelector(".modal:not(.hidden)"))document.body.style.overflow=""}
function errorMessage(e){console.error(e);return e?.message||"오류가 발생했습니다."}

async function loadProfile(){
 profile=null;
 if(!session?.user)return;
 const {data,error}=await db.from("profiles").select("id,email,student_id,name,cohort,role").eq("id",session.user.id).maybeSingle();
 if(error)throw error; profile=data;
}
function updateAuthUI(){
 const logged=!!session;
 $("#authOpenBtn").classList.toggle("hidden",logged);
 $("#logoutBtn").classList.toggle("hidden",!logged);
 $("#petitionOpenBtn").classList.toggle("hidden",!logged);
 $("#userBadge").classList.toggle("hidden",!logged);
 if(logged)$("#userBadge").textContent=profile?`${profile.name} (${profile.student_id})${isAdmin()?" · 관리자":""}`:session.user.email;
 $("#archiveOpenBtn").classList.toggle("hidden",!isAdmin());
 document.querySelectorAll(".admin-control").forEach(e=>e.classList.toggle("hidden",!isAdmin()));
 $("#adminNoticeCard").classList.toggle("hidden",!isAdmin());
}
async function loadNotices(){
 const {data,error}=await db.rpc("get_visible_notices");
 if(error)throw error;
 const map=Object.fromEntries((data||[]).map(n=>[n.notice_key,n.content]));
 ["top","notice1","notice2","notice3","guide","admin"].forEach(k=>{const el=$("#"+(k==="top"?"topNotice":k==="admin"?"adminNotice":k));if(el)el.textContent=map[k]||""});
}
async function loadPetitions(){
 $("#loading").classList.remove("hidden");$("#empty").classList.add("hidden");
 const {data,error}=await db.rpc("get_public_petitions");
 if(error)throw error;
 petitions=data||[]; renderPetitions();$("#loading").classList.add("hidden");$("#empty").classList.toggle("hidden",petitions.length>0);
}
function filtered(){
 const q=$("#searchInput").value.trim().toLowerCase(),sort=$("#sortSelect").value;
 let a=petitions.filter(p=>!q||p.title.toLowerCase().includes(q)||p.content.toLowerCase().includes(q));
 return [...a].sort((x,y)=>sort==="oldest"?new Date(x.created_at)-new Date(y.created_at):sort==="recommend"?y.recommendation_count-x.recommendation_count:new Date(y.created_at)-new Date(x.created_at));
}
function renderPetitions(){
 const list=filtered();$("#countLabel").textContent=`게시된 안건 ${petitions.length}건`;
 $("#petitionGrid").innerHTML=list.map(p=>{
  const met=p.recommendation_count>=20,progress=Math.min(100,p.recommendation_count/20*100);
  return `<article class="card"><div class="card-top"><div class="badges"><span class="badge ${met?"met":"progress"}">${met?"추천 요건 충족":"추천 진행 중"}</span><span class="badge ${esc(p.status)}">${esc(p.status)}</span></div><span class="date">${esc(fmt(p.created_at))}</span></div>
  <h3>${esc(p.title)}</h3><p class="preview">${esc(p.content)}</p>${p.admin_reply?`<div class="reply-preview">관리자 답변: ${esc(p.admin_reply)}</div>`:""}
  <div class="recommend-box"><div class="recommend-row"><span>추천 현황</span><span>${p.recommendation_count} / 20명</span></div><div class="bar"><span style="width:${progress}%"></span></div></div>
  <div class="card-actions"><button class="btn outline" data-action="detail" data-id="${p.id}">전체보기</button><button class="btn primary" data-action="recommend" data-id="${p.id}">추천하기</button>
  ${isAdmin()?`<div class="admin-actions"><button class="btn outline wide" data-action="people" data-id="${p.id}">발의자 및 추천인 정보</button><button class="btn outline" data-action="manage" data-id="${p.id}">상태·답변 관리</button><button class="btn danger" data-action="private" data-id="${p.id}">비공개 처리</button></div>`:""}</div></article>`;
 }).join("");
}
function showDetail(id){
 const p=petitions.find(x=>x.id===id);if(!p)return;activeDetail=id;
 $("#detailContent").innerHTML=`<span class="badge ${esc(p.status)}">${esc(p.status)}</span><h2>${esc(p.title)}</h2><div class="detail-meta"><span>발의일 ${esc(fmt(p.created_at))}</span><span>추천인 ${p.recommendation_count}명</span></div><div class="detail-body">${esc(p.content)}</div><div class="reply-box"><h3>관리자 답변</h3>${esc(p.admin_reply||"아직 등록된 관리자 답변이 없습니다.")}</div>`;
 openM("detailModal");
}
async function showPeople(id){
 if(!isAdmin())return;
 const [{data:p,error:pe},{data:r,error:re}]=await Promise.all([
  db.rpc("get_petition_proposer",{target_petition:id}),
  db.rpc("get_petition_recommenders",{target_petition:id})
 ]);
 if(pe)throw pe;if(re)throw re;
 const proposer=p?.[0];
 $("#peopleContent").innerHTML=`<h3>발의자</h3><div class="people-table"><table><thead><tr><th>학번</th><th>이름</th><th>기수</th><th>이메일</th></tr></thead><tbody><tr><td>${esc(proposer?.student_id||"")}</td><td>${esc(proposer?.name||"")}</td><td>${esc(proposer?.cohort||"")}</td><td>${esc(proposer?.email||"")}</td></tr></tbody></table></div><h3>추천인 (${r?.length||0}명)</h3><div class="people-table"><table><thead><tr><th>학번</th><th>이름</th><th>기수</th><th>추천 시각</th></tr></thead><tbody>${(r||[]).map(x=>`<tr><td>${esc(x.student_id)}</td><td>${esc(x.name)}</td><td>${esc(x.cohort)}</td><td>${esc(fmt(x.recommended_at))}</td></tr>`).join("")||'<tr><td colspan="4">추천인이 없습니다.</td></tr>'}</tbody></table></div>`;
 openM("peopleModal");
}
function showManage(id){
 const p=petitions.find(x=>x.id===id);if(!p||!isAdmin())return;
 const f=$("#manageForm");f.petition_id.value=id;f.status.value=p.status;f.admin_reply.value=p.admin_reply||"";openM("manageModal");
}
async function loadArchive(){
 const {data,error}=await db.from("petitions").select("id,title,content,created_at,status").eq("is_private",true).order("created_at",{ascending:false});
 if(error)throw error;
 $("#archiveContent").innerHTML=(data||[]).map(p=>`<div class="archive-item"><h3>${esc(p.title)}</h3><p>${esc(p.content)}</p><div class="archive-actions"><button class="btn outline" data-action="restore" data-id="${p.id}">공개 복구</button><button class="btn danger" data-action="delete" data-id="${p.id}">영구 삭제</button></div></div>`).join("")||"<p>비공개 안건이 없습니다.</p>";
 openM("archiveModal");
}
async function refresh(){await Promise.all([loadNotices(),loadPetitions()]);updateAuthUI()}

document.addEventListener("click",async e=>{
 const close=e.target.closest("[data-close]");if(close){closeM(close.dataset.close);return}
 const edit=e.target.closest("[data-edit-notice]");if(edit&&isAdmin()){const key=edit.dataset.editNotice;const current=$("#"+(key==="admin"?"adminNotice":key==="top"?"topNotice":key)).textContent;const f=$("#noticeForm");f.notice_key.value=key;f.content.value=current;openM("noticeModal");return}
 const a=e.target.closest("[data-action]");if(!a)return;
 try{
  const {action,id}=a.dataset;
  if(action==="detail")showDetail(id);
  if(action==="recommend"){if(!session)return openM("authModal");$("#recommendPetitionId").value=id;openM("recommendModal")}
  if(action==="people")await showPeople(id);
  if(action==="manage")showManage(id);
  if(action==="private"){$("#privatePetitionId").value=id;openM("privateModal")}
  if(action==="restore"){const {error}=await db.from("petitions").update({is_private:false}).eq("id",id);if(error)throw error;await loadArchive();await loadPetitions();toast("다시 공개했습니다.")}
  if(action==="delete"){$("#deletePetitionId").value=id;openM("deleteModal")}
 }catch(err){toast(errorMessage(err))}
});
$("#authOpenBtn").onclick=()=>openM("authModal");
$("#petitionOpenBtn").onclick=()=>openM("petitionModal");
$("#archiveOpenBtn").onclick=()=>loadArchive().catch(e=>toast(errorMessage(e)));
$("#logoutBtn").onclick=async()=>{await db.auth.signOut();toast("로그아웃했습니다.")};
$("#loginTab").onclick=()=>{$("#loginTab").classList.add("active");$("#signupTab").classList.remove("active");$("#loginForm").classList.remove("hidden");$("#signupForm").classList.add("hidden")};
$("#signupTab").onclick=()=>{$("#signupTab").classList.add("active");$("#loginTab").classList.remove("active");$("#signupForm").classList.remove("hidden");$("#loginForm").classList.add("hidden")};
$("#searchInput").oninput=renderPetitions;$("#sortSelect").onchange=renderPetitions;

$("#loginForm").onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const f=new FormData(e.currentTarget);const {error}=await db.auth.signInWithPassword({email:f.get("email").trim(),password:f.get("password")});if(error)throw error;closeM("authModal");toast("로그인했습니다.")}catch(err){toast(errorMessage(err))}finally{busy=false}};
$("#signupForm").onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const f=new FormData(e.currentTarget),email=f.get("email").trim().toLowerCase();if(!email.endsWith("@dtg.hs.kr"))throw new Error("동탄국제고 학교 이메일만 가입할 수 있습니다.");const {data,error}=await db.auth.signUp({email,password:f.get("password"),options:{data:{student_id:f.get("student_id").trim(),name:f.get("name").trim(),cohort:f.get("cohort").trim()}}});if(error)throw error;toast(data.session?"가입과 로그인이 완료되었습니다.":"가입되었습니다. 학교 이메일 인증을 확인하세요.");e.currentTarget.reset()}catch(err){toast(errorMessage(err))}finally{busy=false}};
$("#petitionForm").onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const f=new FormData(e.currentTarget);const {error}=await db.from("petitions").insert({title:f.get("title").trim(),content:f.get("content").trim(),proposer_id:session.user.id});if(error)throw error;e.currentTarget.reset();closeM("petitionModal");await loadPetitions();toast("안건이 게시되었습니다.")}catch(err){toast(errorMessage(err))}finally{busy=false}};
$("#recommendConfirmBtn").onclick=async()=>{if(busy)return;busy=true;try{const petition_id=$("#recommendPetitionId").value;const {error}=await db.from("recommendations").insert({petition_id,user_id:session.user.id});if(error){if(error.code==="23505")throw new Error("이미 이 안건을 추천했습니다.");throw error}closeM("recommendModal");await loadPetitions();toast("추천이 반영되었습니다.")}catch(err){toast(errorMessage(err))}finally{busy=false}};
$("#manageForm").onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const f=new FormData(e.currentTarget);const {error}=await db.from("petitions").update({status:f.get("status"),admin_reply:f.get("admin_reply").trim()||null,answered_at:f.get("admin_reply").trim()?new Date().toISOString():null}).eq("id",f.get("petition_id"));if(error)throw error;closeM("manageModal");await loadPetitions();toast("저장했습니다.")}catch(err){toast(errorMessage(err))}finally{busy=false}};
$("#privateConfirmBtn").onclick=async()=>{if(busy)return;busy=true;try{const {error}=await db.from("petitions").update({is_private:true}).eq("id",$("#privatePetitionId").value);if(error)throw error;closeM("privateModal");await loadPetitions();toast("비공개 처리했습니다.")}catch(err){toast(errorMessage(err))}finally{busy=false}};
$("#deleteConfirmBtn").onclick=async()=>{if(busy)return;busy=true;try{const {error}=await db.from("petitions").delete().eq("id",$("#deletePetitionId").value);if(error)throw error;closeM("deleteModal");await loadArchive();toast("영구 삭제했습니다.")}catch(err){toast(errorMessage(err))}finally{busy=false}};
$("#noticeForm").onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const f=new FormData(e.currentTarget);const {error}=await db.from("notices").update({content:f.get("content").trim(),updated_by:session.user.id}).eq("notice_key",f.get("notice_key"));if(error)throw error;closeM("noticeModal");await loadNotices();toast("공지를 수정했습니다.")}catch(err){toast(errorMessage(err))}finally{busy=false}};

db.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;try{await loadProfile();updateAuthUI();await loadNotices();renderPetitions()}catch(e){toast(errorMessage(e))}});
(async()=>{try{const {data}=await db.auth.getSession();session=data.session;await loadProfile();updateAuthUI();await refresh()}catch(e){$("#loading").textContent="데이터를 불러오지 못했습니다.";toast(errorMessage(e))}})();
})();