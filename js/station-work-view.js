// Device conversation evidence only. No XP, autonomous dispatch or synthetic progress.
const jobs = new Map();
let draftMode = '';
export function initWorkControls() {
  const toggle = document.getElementById('cas-draft-mode');
  const textarea = document.getElementById('cas-textarea');
  toggle?.addEventListener('click', () => {
    draftMode = draftMode==='draft' ? '' : 'draft';
    toggle.setAttribute('aria-pressed', String(draftMode==='draft'));
    document.getElementById('cas-propose-draft')?.setAttribute('aria-pressed','false');
    toggle.textContent = draftMode ? 'Draft mode on' : 'Create draft';
    document.getElementById('cas-work-help').textContent = draftMode
      ? 'Describe the draft. Send creates a local Markdown result with a receipt.'
      : 'Talk with Cas, create a local draft, or inspect verified work. Publishing and external task execution need their own capability.';
    textarea?.focus();
  });
  document.getElementById('cas-propose-draft')?.addEventListener('click',()=>{
    draftMode=draftMode==='plan'?'':'plan';
    toggle.setAttribute('aria-pressed','false');toggle.textContent='Create draft';
    document.getElementById('cas-propose-draft').setAttribute('aria-pressed',String(draftMode==='plan'));
    document.getElementById('cas-work-help').textContent=draftMode==='plan'?'Describe the draft. Send prepares a proposal for your approval before generation.':'Talk with Cas or create a local draft.';
    textarea?.focus();
  });
  document.getElementById('cas-inspect-work')?.addEventListener('click', () => {
    if (textarea.value.trim()) {
      document.getElementById('cas-work-help').textContent = 'Your unsent message is preserved. Send or clear it before inspecting work.';
      return;
    }
    textarea.value = '/work';
    document.getElementById('cas-composer').requestSubmit();
  });
  setInterval(render, 5000);
}
export function workMessage(text) {
  if (!text) return '';
  return draftMode && !text.startsWith('/') ? '/'+draftMode+' ' + text : text;
}
export function observeWork(item) {
  if (!item?.id) return;
  if (item.message === '/work' && item.status === 'completed') {
    try {
      const text = item.reply.split('\n\n[Brain memory')[0];
      for (const job of JSON.parse(text).jobs || []) jobs.set(job.id, {...job, observed:Date.now()});
    } catch {}
  } else if (/^\/(draft|request|plan) /.test(item.message || '')) {
    const draft = item.message.startsWith('/draft ');
    const receipt = (item.reply || '').match(new RegExp('\\[Draft completed: ' + item.id + '; SHA256 ([a-f0-9]{64})\\. Saved locally; no publication\\.\\]'));
    const state = receipt ? 'completed' : item.status === 'failed' ? 'failed'
      : item.status === 'queued' ? 'requested' : item.status === 'running' && draft ? 'running'
      : item.status === 'completed' && !draft ? 'needs_approval' : 'unknown';
    jobs.set(item.id, {id:item.id, request:item.message.replace(/^\/\w+ /,''), state,
      project:item.message.startsWith('/request ')?'Station requests':'Station drafts',
      owner:'This device / Station host', observed:Date.now(),
      reason:receipt ? 'Host verified local draft' : draft ? 'Observed from Station request status' : 'Execution capability and owner need review',
      next_action:receipt ? 'Review the saved draft in the conversation' : 'Inspect the request and its latest evidence',
      evidence:receipt ? [{sha256:receipt[1]}] : []});
  } else if (item.message==='/verify station' && item.status==='completed') {
    try {
      const result=JSON.parse(item.reply.split('\n\n[Brain memory')[0]);
      jobs.set(item.id,{id:item.id,request:'Verify Station frontend',state:result.state,owner:'This device / Station host',observed:Date.now(),reason:result.report.limits,next_action:'Inspect the saved verification report',evidence:[{sha256:result.receipt_sha256}]});
    } catch {}
  } else if ((item.message || '').startsWith('/approve ')) {
    const identity=item.message.slice(9).trim();
    const prior=jobs.get(identity);
    if(prior){
      const receipt=(item.reply || '').match(new RegExp('\\[Draft completed: '+identity+'; SHA256 ([a-f0-9]{64})'));
      if(receipt)jobs.set(identity,{...prior,state:'completed',observed:Date.now(),reason:'Approved draft saved and verified',next_action:'Review the result in the approval exchange',exchange_id:item.id,evidence:[{sha256:receipt[1]}]});
      else if(item.status==='running')jobs.set(identity,{...prior,state:'running',observed:Date.now()});
    }
  }
  render();
}
function render() {
  const container = document.getElementById('station-work-list');
  if (!container) return;
  container.replaceChildren();
  const current = [...jobs.values()].map(job => ({...job,
    state:job.state==='running' && Date.now()-job.observed>20000 ? 'unknown' : job.state}));
  if (!current.length) container.textContent = 'No verified Station jobs in this device conversation yet.';
  for (const job of current.slice(-10).reverse()) {
    const card=document.createElement('article');card.className='station-work-card';card.dataset.state=job.state;
    const title=document.createElement('strong');title.textContent=job.state.replaceAll('_',' ') + ' · ' + job.request;
    const detail=document.createElement('p');detail.textContent=job.reason + '. ' + job.next_action;
    const source=document.createElement('small');source.textContent='Owner: ' + job.owner + ' · Observed ' + new Date(job.observed).toLocaleTimeString();
    const inspect=document.createElement('button');inspect.type='button';inspect.textContent='Inspect request';
    inspect.addEventListener('click',()=>{document.querySelector('#station-nav [data-tab="cas"]')?.click();document.getElementById('cas-msg-'+(job.exchange_id || job.id))?.scrollIntoView({block:'center'});});
    card.append(title,detail,source,inspect);container.append(card);
    if(job.state==='needs_approval' && job.project==='Station drafts'){
      const approve=document.createElement('button');approve.type='button';approve.textContent='Approve this local draft';
      approve.addEventListener('click',()=>{
        const input=document.getElementById('cas-textarea');if(input.value.trim())return;
        input.value='/approve '+job.id;document.getElementById('cas-composer').requestSubmit();
      });card.append(approve);
    }
    if(job.state==='needs_approval' && job.project==='Station presentation changes' && job.review && job.evidence?.[0]?.sha256){
      const review=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Review exact local change';
      const scope=document.createElement('p');scope.textContent='Applies one reviewed presentation file locally. Publication remains separate.';
      const changes=document.createElement('pre');changes.textContent=job.review.summary+'\n\n'+job.review.edits.map(edit=>edit.path+'\nBEFORE:\n'+edit.old+'\nAFTER:\n'+edit.new).join('\n\n');
      const apply=document.createElement('button');apply.type='button';apply.textContent='Apply this reviewed local change';
      apply.addEventListener('click',()=>{
        const input=document.getElementById('cas-textarea');if(input.value.trim())return;
        input.value='/apply-station '+job.id+' '+job.evidence[0].sha256;document.getElementById('cas-composer').requestSubmit();
      });review.append(summary,scope,changes,apply);card.append(review);
    }
  }
  window.dispatchEvent(new CustomEvent('station-work-observed',{detail:current}));
}
