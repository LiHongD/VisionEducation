'use strict';
const ruleLegacyWorkspace=teacherWorkspaceHTML,ruleLegacyRefresh=refreshTeacher;
teacherWorkspaceHTML=function(data){return ruleLegacyWorkspace(data)+`<section class="rule-assessment" id="rule-teacher-section"><div class="rule-assessment-header"><div><span class="rule-kicker">ANGLE RULES / 角度规则自动检验</span><h2>学生的规则，经得起新样本吗？</h2></div><button onclick="refreshRuleTeacher()">刷新规则收件</button></div><p class="rule-note">接收“量势成规”中提交的马步、弓步角度规则。每次提交均由教师端使用固定关键点验证集计算，保存独立规则和逐样本结果。</p><div id="ruleTeacherSummary"></div><div class="rule-teacher-actions"><input id="ruleTeacherSearch" aria-label="搜索规则提交学生" placeholder="搜索姓名、组名或学号"><label><input id="ruleLatestOnly" type="checkbox" checked> 仅看每位学生最新一次</label></div><div id="ruleTeacherInbox" class="rule-table-scroll">正在读取规则…</div></section>`;};
refreshTeacher=async function(...args){await ruleLegacyRefresh(...args);if(document.getElementById('rule-teacher-section'))await refreshRuleTeacher();};
let ruleTeacherEntries=[],ruleTeacherRequest=0;
function renderRuleInbox(){
  const host=document.getElementById('ruleTeacherInbox');if(!host)return;const R=RuleReport,search=(document.getElementById('ruleTeacherSearch')?.value||'').trim().toLowerCase(),latest=document.getElementById('ruleLatestOnly')?.checked;
  let rows=ruleTeacherEntries.filter(r=>(r.display_name+' '+r.student_number).toLowerCase().includes(search));
  if(latest){const seen=new Set();rows=rows.filter(r=>{if(seen.has(r.member_id))return false;seen.add(r.member_id);return true;});}
  host.innerHTML=rows.length?`<table class="rule-table"><thead><tr><th>学生 / 学号</th><th>总正确率</th><th>覆盖率</th><th>宏 F1</th><th>冲突 / 未匹配 / 不足</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${R.esc(r.display_name)}</b><br><small>${R.esc(r.student_number||'未填学号')}</small></td><td><b>${R.pct(r.metrics.accuracy)}</b> · ${r.correct}/${r.total}</td><td>${R.pct(r.metrics.coverage)}</td><td>${r.metrics.macroF1.toFixed(3)}</td><td>${r.metrics.counts.conflict} / ${r.metrics.counts.unmatched} / ${r.metrics.counts.insufficient}</td><td>${dateLabel(r.created_at)}</td><td><button data-rule-review="${r.id}">规则与检验详情</button></td></tr>`).join('')}</tbody></table>`:'<div class="rule-empty">'+(ruleTeacherEntries.length?'没有符合搜索条件的规则。':'还未收到规则。学生在“把动作特征，写成角度规则”下方点击“提交规则并检验”后，会出现在这里。')+'</div>';
  for(const button of host.querySelectorAll('[data-rule-review]'))button.onclick=()=>openRuleReview(button.dataset.ruleReview);
}
async function refreshRuleTeacher(){
  const host=document.getElementById('ruleTeacherInbox'),summary=document.getElementById('ruleTeacherSummary'),id=selectedClass,epoch=requestEpoch;if(!host||!id)return;const serial=++ruleTeacherRequest;
  try{const [d,board]=await Promise.all([api('rules/inbox?'+new URLSearchParams({classId:id})),api('rules/board?'+new URLSearchParams({classId:id}))]);if(serial!==ruleTeacherRequest||id!==selectedClass||epoch!==requestEpoch||!host.isConnected)return;ruleTeacherEntries=d.entries;
    summary.innerHTML=`<p class="rule-membership">已收 <b>${d.entries.length}</b> 次规则 · <b>${new Set(d.entries.map(e=>e.member_id)).size}</b> 位学生 / 小组 · 统一验证集 <b>${d.benchmark.total}</b> 个样本（马步、弓步）</p><section class="rule-live-board"><span class="rule-kicker">LIVE CLASSROOM / 班级实时排名</span><h3>班级实时成绩榜</h3><p class="rule-board-sync">● 已同步 ${new Date(board.updatedAt).toLocaleTimeString('zh-CN',{hour12:false})} · 每 5 秒自动更新</p>${RuleReport.boardHTML(board)}</section><h3>规则提交与检验记录</h3>`;
    document.getElementById('ruleTeacherSearch').oninput=renderRuleInbox;document.getElementById('ruleLatestOnly').onchange=renderRuleInbox;renderRuleInbox();
  }catch(e){if(serial===ruleTeacherRequest&&host.isConnected)host.innerHTML='<p class="rule-status error">'+RuleReport.esc(e.message)+'</p>';}
}
async function openRuleReview(id){
  let dialog=document.getElementById('ruleReviewDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='ruleReviewDialog';dialog.className='rule-review-dialog';document.body.append(dialog);}
  dialog.innerHTML='<div class="rule-review-head"><h2>正在读取规则快照…</h2><button class="rule-review-close" aria-label="关闭规则检验">×</button></div>';dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
  const classId=selectedClass,epoch=requestEpoch;dialog.dataset.entryId=id;
  try{const d=await api('rules/'+encodeURIComponent(id)+'?teacher=1');if(!dialog.open||dialog.dataset.entryId!==id||classId!==selectedClass||epoch!==requestEpoch)return;const r=d.entry,R=RuleReport;
    dialog.innerHTML=`<div class="rule-review-head"><div><span class="rule-kicker">教师端保存的规则与评测快照</span><h2>${R.esc(r.display_name)} · 马步 / 弓步规则</h2></div><button class="rule-review-close" aria-label="关闭规则检验">×</button></div><p class="rule-note">${R.esc(r.student_number)} · ${dateLabel(r.created_at)} · 记录 ${R.esc(r.id.slice(0,8))}</p>${R.html(r)}<div class="rule-downloads"><button id="ruleDownloadRules">下载学生规则 JSON</button><button id="ruleDownloadEvaluation">下载完整检验报告</button></div><details><summary>学生提交的规则原文与动作对应</summary><pre class="rule-rule-json">${R.esc(JSON.stringify({mapping:r.mapping,rules:r.rules},null,2))}</pre></details>`;
    dialog.querySelector('.rule-review-close').onclick=()=>dialog.close();document.getElementById('ruleDownloadRules').onclick=()=>R.download({...r.rules,assessment_mapping:r.mapping},'学生角度规则-'+r.id+'.json');document.getElementById('ruleDownloadEvaluation').onclick=()=>R.download({entry:r,benchmark:d.benchmark},'角度规则检验报告-'+r.id+'.json');
  }catch(e){dialog.innerHTML='<p class="rule-status error">'+RuleReport.esc(e.message)+'</p><button onclick="this.closest(\'dialog\').close()">关闭</button>';}
}
setInterval(()=>{if(!document.hidden&&portal==='teacher'&&document.getElementById('ruleTeacherInbox'))refreshRuleTeacher();},5000);
if(portal==='teacher'&&document.getElementById('teacherWorkspace'))refreshTeacher();
