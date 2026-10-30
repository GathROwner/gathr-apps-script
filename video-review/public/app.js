import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {humanChoice,choiceLabels,needsReview,presentation,publication,inGathR,filtered,waiting} from './review-ui.js';
const app=initializeApp({apiKey:'AIzaSyDlTVz1oAxaYgBQVupUFmhgWd1CLAmu2Xs',authDomain:'gathr-m1.firebaseapp.com',projectId:'gathr-m1'});
const auth=getAuth(app);let candidates=[],filter='attention',nextCursor=null,automatic=false;const blobs=[],drafts=new Map(),listingDrafts=new Map();
const $=id=>document.getElementById(id),status=text=>{$('status').textContent=text;},base=new URL('./',location.href);
async function api(path,options={}){
 const token=await auth.currentUser.getIdToken(),r=await fetch(new URL(path,base),{...options,headers:{Authorization:`Bearer ${token}`,...options.headers}});
 if(!r.ok){let msg;try{msg=(await r.json()).error;}catch{}throw Error(msg||`Request failed (${r.status})`);}return r;
}
function node(tag,text,className){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;}
async function load(more=false){
 const p=await(await api(`api/candidates${more&&nextCursor?'?after='+nextCursor:''}`)).json();
 candidates=more?[...new Map([...candidates,...p.candidates].map(c=>[c.id,c])).values()]:p.candidates;nextCursor=p.nextCursor;automatic=p.automaticPublication===true;render();$('more').hidden=!nextCursor;
 $('note').textContent=`${candidates.length} clips loaded · ${automatic?'Clear matches are added automatically':'Automatic attachment is paused'} · Refresh for new results`;
 status(p.health.workerAt?`Last worker check: ${new Date(p.health.workerAt).toLocaleString()}`:'New clips will appear after a completed parse.');
}
$('more').onclick=async()=>{try{await load(true);}catch(e){status(e.message);}};
$('refresh').onclick=async()=>{$('refresh').disabled=true;try{await load();}catch(e){status(e.message);}finally{$('refresh').disabled=false;}};
function render(){
 document.querySelectorAll('video').forEach(v=>v.pause());blobs.splice(0).forEach(URL.revokeObjectURL);$('cards').replaceChildren();$('summary').replaceChildren();
 for(const [match,label]of[[inGathR,'In GathR'],[needsReview,'Needs review'],[filtered,'Filtered out'],[waiting,'Waiting']]){
  const n=candidates.filter(match).length,s=node('div',null,'stat');s.append(node('strong',String(n)),node('span',label));$('summary').append(s);
 }
 const list=candidates.filter(c=>filter==='all'||filter==='attention'&&needsReview(c)||filter==='attached'&&inGathR(c)||filter==='rejected'&&filtered(c)||filter==='waiting'&&waiting(c));
 if(!list.length){$('cards').append(node('p','No clips in this view. Use “Filtered out” or “All clips” to inspect other results.','empty'));return;}
 for(const c of list){
  const view=presentation(c),card=node('article',null,'review'),visual=node('div',null,'visual'),detail=node('div',null,'details');
  const pub=publication(c),chosenPath=listingDrafts.get(c.id)||c.humanJudgment?.listingPath||c.reviewedListingPath;
  const shownListing=c.publishedListings?.[0]||c.listings?.find(l=>pub?.paths?.includes(l.path))||c.listings?.find(l=>l.path===chosenPath)||(c.listings?.length===1?c.listings[0]:null);
  if(c.object&&Date.parse(c.expiresAt)>Date.now()){
   const play=node('button','▶  Watch clip','play');play.setAttribute('aria-label',`Watch ${shownListing?.title||'source video'}`);
   play.onclick=async()=>{play.disabled=true;play.textContent='Loading clip…';try{
    const r=await api(`api/candidates/${c.id}/media`),blob=URL.createObjectURL(await r.blob());blobs.push(blob);document.querySelectorAll('video').forEach(v=>v.pause());
    const video=node('video');video.controls=true;video.playsInline=true;video.src=blob;visual.replaceChildren(video);await video.play().catch(()=>{});
   }catch(e){visual.replaceChildren(node('p',e.message,'unavailable'));}};visual.append(play);
  }else visual.append(node('p',c.state==='queued'?'Waiting for download and review. This clip has not failed.':c.state==='processing'?'Preparing this clip.':c.state==='expired'?'Private preview expired. The original post is still linked.':c.reasons?.includes('clip_over_90_seconds')?'This clip exceeds the 90-second review limit. Open the original post to watch it. This is not a content rejection.':'No playable preview was retrieved. Open the original post to inspect the video. This is not a content rejection.','unavailable'));
  const captionTitle=c.caption?.split('\n').find(t=>/[a-zA-Z]{4}/.test(t))?.slice(0,130);
  detail.append(node('span',view.badge,`badge ${inGathR(c)?'attached':c.state}`),node('h2',(shownListing?.title||captionTitle||(c.listings?.length>1?'Choose the matching event or special':'Source post video')).slice(0,150)));
  detail.append(node('p',[shownListing?.venue,c.durationSeconds?`${Math.round(c.durationSeconds)} sec`:null,c.hasAudio===true?'Sound available':c.hasAudio===false?'No audio track':null,c.importedFrom?'Saved comparison':null].filter(Boolean).join(' · '),'meta'));
  if(pub){const block=node('div',null,`publication ${inGathR(c)?'publication-live':''}`);block.append(node('p',inGathR(c)?'AVAILABLE IN GATHR':'ATTACHMENT STATUS','label'),node('p',inGathR(c)?(pub.reason?.startsWith('Automatically')?pub.reason:'This video is available on the matching GathR listing.'):pub.reason,'reason'));for(const l of c.publishedListings||[])block.append(node('p',[l.title,l.date,l.time].filter(Boolean).join(' · '),'hint'));detail.append(block);}
  detail.append(node('p',view.waiting?'REVIEW STATUS':'USEFULNESS','label'),node('p',view.waiting?view.reason:view.title,'verdict'),node('p',view.waiting?'Refresh to see progress.':view.reason,'reason'));
  if(!view.waiting){
   detail.append(node('p','LISTING MATCH','label'),node('p',view.listing,'verdict'),node('p',view.listingReason,'reason'));
   if(!inGathR(c)&&c.state==='held'&&view.reviewReasons.length)detail.append(node('p',view.reviewReasons.join(' '),'hint'));
   if(c.audioNotes?.includes('no_speech_detected'))detail.append(node('p','Audio note: no speech detected. This is not a rejection reason; you can listen to the music or other sounds.','audio-note'));
  }
  detail.append(node('span',view.waiting?'No decision yet':c.route==='terra_escalated'?'Luna + independent Terra review':c.luna?'Reviewed by Luna':'Content review not completed','route'));
  const source=node('p'),link=node('a','Open original post ↗');link.href=c.sourcePage;link.target='_blank';link.rel='noopener noreferrer';source.append(link);detail.append(source);
  const more=node('details');more.append(node('summary','Review details & source post'));
  for(const [label,a]of [["Luna’s review",c.luna],["Terra’s independent review",c.terra]])if(a){
   more.append(node('p',label,'label'),node('p',a.content?.reason||a.reasoning,'reason'));
   for(const conflict of a.listing?.conflicts||a.scheduleConflicts||[])more.append(node('p',`Possible ${conflict.field} conflict: ${conflict.evidence}`,'reason'));
  }
  if(c.caption)more.append(node('p','SOURCE POST','label'),node('p',c.caption.slice(0,1600),'reason'));more.append(node('p',`Private playback expires ${new Date(c.expiresAt).toLocaleDateString()}.`,'hint'));detail.append(more);
  if(c.revision){
   detail.append(node('p','YOUR DECISION','label'));const notes=node('textarea');notes.placeholder='Optional notes';notes.maxLength=2000;notes.value=drafts.get(c.id)??c.humanJudgment?.notes??'';notes.oninput=()=>drafts.set(c.id,notes.value);notes.setAttribute('aria-label','Your review notes');detail.append(notes);
   let listingSelect=null;
   if((c.listings||[]).length>1&&!inGathR(c)){const label=node('label','Which listing does this clip promote?','listing-choice');listingSelect=node('select');listingSelect.setAttribute('aria-label','Matching listing');const placeholder=node('option','Choose the matching event or special');placeholder.value='';listingSelect.append(placeholder);for(const l of c.listings){const opt=node('option',[l.title,l.date,l.time,l.venue].filter(Boolean).join(' · '));opt.value=l.path;listingSelect.append(opt);}listingSelect.value=listingDrafts.get(c.id)||c.humanJudgment?.listingPath||c.reviewedListingPath||'';listingSelect.onchange=()=>listingDrafts.set(c.id,listingSelect.value);label.append(listingSelect);detail.append(label);}
   const actions=node('div',null,'actions'),selected=humanChoice(c.humanJudgment),saved=node('p',selected?`Your saved decision: ${choiceLabels[selected]}.`:automatic?'Clear matches are added automatically. Use these buttons for exceptions.':'Automatic attachment is paused. Your decisions are still saved.','saved');
   for(const [value,label,choice]of [['use_video','Use this video','use'],['dont_use_video','Don’t use this video','dont_use'],['unsure','Not sure','unsure']]){
    const button=node('button',label,`choice-${choice}`);button.setAttribute('aria-pressed',String(selected===choice));
    button.onclick=async()=>{if(value==='use_video'&&listingSelect&&!listingSelect.value){saved.textContent='Choose the matching listing above first.';return;}actions.querySelectorAll('button').forEach(b=>b.disabled=true);try{
     const listingPath=listingSelect?.value||'';const result=await(await api(`api/candidates/${c.id}/judgment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({judgment:value,notes:notes.value,revision:c.revision,...(listingPath?{listingPath}:{})})})).json();
     c.humanJudgment={judgment:value,choice,notes:notes.value,...(listingPath?{listingPath}:{})};drafts.delete(c.id);listingDrafts.delete(c.id);actions.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));saved.textContent=result.automaticPublication?value==='use_video'?'Saved. A confirmed match will be added automatically; no follow-up message is needed.':value==='dont_use_video'?'Saved. The worker will stop using this clip.':'Saved. This clip will wait for your decision.':`Saved: ${label}. Automatic attachment is paused.`;
    }catch(e){saved.textContent=e.message;}finally{actions.querySelectorAll('button').forEach(b=>b.disabled=false);}};actions.append(button);
   }detail.append(actions,saved);
  }card.append(visual,detail);$('cards').append(card);
 }
}
$('loginform').onsubmit=async e=>{e.preventDefault();status('Signing in…');try{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);$('password').value='';}catch{status('Could not sign in. Check your GathR email and password.');}};
$('signout').onclick=()=>signOut(auth);
$('filters').onclick=e=>{if(!e.target.dataset.filter)return;filter=e.target.dataset.filter;document.querySelectorAll('#filters button').forEach(b=>b.classList.toggle('selected',b===e.target));render();};
onAuthStateChanged(auth,async user=>{$('login').hidden=!!user;$('refresh').hidden=!user;$('signout').hidden=!user;$('inbox').hidden=!user;if(user){try{await load();}catch(e){status(e.message);}}else{document.querySelectorAll('video').forEach(v=>v.pause());$('cards').replaceChildren();candidates=[];drafts.clear();listingDrafts.clear();blobs.splice(0).forEach(URL.revokeObjectURL);status('');}});
