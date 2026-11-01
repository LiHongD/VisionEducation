(function(){
  'use strict';
  const $=id=>document.getElementById(id),R=globalThis.RuleReport;
  let member=null,busy=false,epoch=0,lastEntry=null,previousRules='',previousToken='',mapping={horse:'horse',bow:'bow'};
  let boardPending=null,boardSerial=0,boardToken='';
  const boardPanel=document.createElement('section');boardPanel.className='rule-live-board';boardPanel.setAttribute('aria-labelledby','rule-board-title');
  boardPanel.innerHTML='<div class="rule-assessment-header"><div><span class="rule-kicker">LIVE CLASSROOM / 一起检验，一起进步</span><h3 id="rule-board-title">班级实时成绩榜</h3></div><button class="quiet" id="rule-refresh-board">刷新成绩榜</button></div><p class="rule-board-sync" id="rule-board-sync" role="status">每 5 秒自动更新，提交后立即刷新。</p><div id="rule-live-board-content"><p class="rule-note">加入课堂后，可以查看其他小组成绩与当前排名。</p></div>';
  $('rule-submit-result').before(boardPanel);
  const mapKey='actionlab-rule-mapping:'+(new URLSearchParams(location.search).get('draft')||'actionlab-wushu-v2');
  try{mapping=JSON.parse(localStorage.getItem(mapKey))||mapping;}catch{}
  function identity(){try{const value=JSON.parse(localStorage.getItem('actionlab-member-v1'));return value?.token&&value?.member?.id?value:null;}catch{return null;}}
  function status(message,error=false){$('rule-submit-status').textContent=message;$('rule-submit-status').classList.toggle('error',error);}
  async function call(path,options={}){const response=await fetch('/api/classroom/rules'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','X-Classroom-Token':member?.token||'',...options.headers}});const data=await response.json();if(!response.ok)throw Error(data.error||'规则提交失败，请重试。');return data;}
  function updateMapping(){
    const rules=ActionStudio.getRules(),encoded=JSON.stringify(rules);if(encoded===previousRules)return;previousRules=encoded;
    for(const id of ['horse','bow']){const select=$('rule-map-'+id);select.innerHTML='<option value="">请选择对应的动作</option>'+rules.actions.filter(a=>a.enabled).map(a=>`<option value="${R.esc(a.id)}">${R.esc(a.name)}</option>`).join('');select.value=mapping[id]||'';}
  }
  function sources(b){$('rule-benchmark-info').innerHTML=`固定验证集：马步、弓步共 <b>${b.total}</b> 张真实图片的关键点，最低点置信度 ${b.keypointThreshold}。<details class="rule-benchmark-source"><summary>数据来源与计分方法</summary><p>${R.esc(b.description)} 仅评估所选择的两个动作，其他动作不计入此次检验。更多细节见随包的《角度规则评测设计》。</p><ul>${b.sources.map(s=>`<li><a href="${R.esc(s.pageUrl)}" target="_blank" rel="noopener noreferrer">${R.esc(s.title)}</a>（来源需联网查看；评测无需联网）</li>`).join('')}</ul></details>`;}
  async function refresh(){
    updateMapping();member=identity();const token=member?.token||'';previousToken=token;const current=++epoch;
    $('rule-submit-identity').innerHTML=member?`提交至 <b>${R.esc(member.classroom.name)}</b> · ${R.esc(member.member.display_name)}`:'尚未加入课堂。请先在主页面的“我的课堂”中凭课堂码加入，再回到这里提交。';
    $('rule-submit-button').disabled=!member||busy;
    refreshBoard();
    if(!member){$('rule-submit-history').innerHTML='<p class="rule-note">规则可继续编辑和导出；加入课堂后即可提交教师检验。</p>';return;}
    try{const data=await call('/mine');if(current!==epoch)return;sources(data.benchmark);$('rule-submit-history').innerHTML=data.entries.length?`<h3>我的提交记录</h3><div class="rule-table-scroll"><table class="rule-table"><thead><tr><th>提交时间</th><th>正确率</th><th>覆盖率</th><th>操作</th></tr></thead><tbody>${data.entries.map(e=>`<tr><td>${new Date(e.created_at).toLocaleString('zh-CN')}</td><td>${R.pct(e.metrics.accuracy)} · ${e.correct}/${e.total}</td><td>${R.pct(e.metrics.coverage)}</td><td><button data-own-rule="${e.id}">查看这次结果</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="rule-note">还未提交规则。每次提交会保存一份快照，之后修改规则不会改动已有结果。</p>';
      for(const button of $('rule-submit-history').querySelectorAll('[data-own-rule]'))button.onclick=async()=>{button.disabled=true;try{const d=await call('/'+button.dataset.ownRule);show(d.entry);}catch(e){status(e.message,true);}finally{button.disabled=false;}};
    }catch(e){if(current===epoch)status(e.message,true);}
  }
  function show(entry){lastEntry=entry;$('rule-submit-result').innerHTML='<h3>教师端已完成自动检验</h3><p class="rule-note">提交快照：'+R.esc(new Date(entry.created_at).toLocaleString('zh-CN'))+' · '+R.esc(entry.id.slice(0,8))+'。以下结果对应这次提交，继续编辑不会改变已有结果。</p>'+R.html(entry);$('rule-download-report').hidden=false;}
  for(const id of ['horse','bow'])$('rule-map-'+id).onchange=e=>{mapping[id]=e.target.value;try{localStorage.setItem(mapKey,JSON.stringify(mapping));}catch{}};
  $('rule-submit-button').onclick=async()=>{
    member=identity();if(!member){await refresh();return;}
    if(!mapping.horse||!mapping.bow||mapping.horse===mapping.bow){status('请分别选择马步和弓步对应的两个不同动作。',true);return;}
    busy=true;$('rule-submit-button').disabled=true;status('正在将规则提交教师端，并使用统一验证集计算…');
    try{const data=await call('',{method:'POST',body:JSON.stringify({rules:ActionStudio.getRules(),mapping})});show(data.entry);status('✓ 已收到服务器回执。规则与结果已保存，教师端可以查看。');refreshBoard(true);await refresh();}
    catch(e){status(e.message+' 本地规则已保留。',true);}finally{busy=false;$('rule-submit-button').disabled=!identity();}
  };
  $('rule-refresh-mine').onclick=refresh;$('rule-download-report').onclick=()=>lastEntry&&R.download(lastEntry,'角度规则检验-'+lastEntry.id+'.json');
  async function refreshBoard(force=false){
    const current=identity(),token=current?.token||'';
    if(token!==boardToken){boardPending?.abort();boardPending=null;boardSerial++;boardToken=token;$('rule-live-board-content').innerHTML='<p class="rule-note">'+(token?'正在读取班级成绩…':'加入课堂后，可以查看其他小组成绩与当前排名。')+'</p>';$('rule-board-sync').textContent='每 5 秒自动更新，提交后立即刷新。';}
    $('rule-refresh-board').disabled=!token;
    if(!token)return;
    if(boardPending&&!force)return;
    boardPending?.abort();const controller=new AbortController(),serial=++boardSerial;boardPending=controller;
    const timeout=setTimeout(()=>controller.abort(),8000);
    try{const response=await fetch('/api/classroom/rules/board',{credentials:'same-origin',headers:{'X-Classroom-Token':token},signal:controller.signal}),data=await response.json();if(!response.ok)throw Error(data.error||'无法读取成绩。');if(serial!==boardSerial||identity()?.token!==token)return;$('rule-live-board-content').innerHTML=R.boardHTML(data);$('rule-board-sync').textContent='● 已同步 '+new Date(data.updatedAt).toLocaleTimeString('zh-CN',{hour12:false})+' · 每 5 秒自动更新';$('rule-board-sync').classList.remove('error');}
    catch(e){if(serial===boardSerial){$('rule-board-sync').textContent='成绩同步失败，显示上次结果；5 秒后重试，或点击刷新。';$('rule-board-sync').classList.add('error');}}
    finally{clearTimeout(timeout);if(serial===boardSerial)boardPending=null;}
  }
  $('rule-refresh-board').onclick=()=>refreshBoard(true);
  setInterval(()=>{if(!document.hidden&&!$('rules-page').classList.contains('hidden'))refreshBoard();},5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshBoard();});
  addEventListener('focus',refresh);addEventListener('storage',e=>{if(e.key==='actionlab-member-v1')refresh();});
  setInterval(()=>{if(document.hidden)return;updateMapping();if((identity()?.token||'')!==previousToken){$('rule-submit-result').innerHTML='';$('rule-download-report').hidden=true;lastEntry=null;refresh();}},1500);
  fetch('/api/classroom/rules/benchmark').then(r=>r.json()).then(d=>sources(d.benchmark)).catch(()=>{});refresh();
})();
