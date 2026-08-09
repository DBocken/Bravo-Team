import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const pg=await b.newPage({viewport:{width:1400,height:900}});
const errs=[];pg.on('pageerror',e=>errs.push('PAGE: '+(e.stack||String(e))));
pg.on('console',m=>{if(m.type()==='error')errs.push('CONS: '+m.text())});
await pg.goto('file:///tmp/claude-0/-home-user-Bravo-Team/03764c82-032c-5658-9b24-a58d97b3e006/scratchpad/bravo-field-console.html',{waitUntil:'load'});
await pg.waitForTimeout(800);
for(const seed of [3,7,11,42]){
  await pg.evaluate(s=>{document.querySelector('#selSeed').value=String(s);
    document.querySelector('#btnNew').click();
    const bs=[...document.querySelectorAll('#briefing button')];
    bs.find(x=>/deploy the bravo/i.test(x.textContent)).click()},seed);
  await pg.waitForTimeout(1200);
  const res=await pg.evaluate(()=>{
    const D=window._dbg,caught=[];
    const rnd=(n)=>Math.floor(Math.random()*n);
    for(let step=0;step<260&&!D.sim.over;step++){
      try{
        const acts=[...document.querySelectorAll('#acts button')];
        const roll=Math.random();
        if(roll<0.45){ // tap a random nearby tile via the real handler
          const sq=D.sim.squad.filter(s=>s.mobile());
          if(!sq.length)break;
          const u=sq[rnd(sq.length)];
          D.sel(u.name);
          const p=[u.pos[0]+rnd(9)-4,u.pos[1]+rnd(9)-4];
          D.tap([Math.max(0,Math.min(23,p[0])),Math.max(0,Math.min(17,p[1]))]);
        }else if(roll<0.85&&acts.length>1){ // press a random action button
          const b2=acts[rnd(acts.length-1)];
          if(!b2.disabled)b2.textContent.includes('▾')?null:b2.click();
        }else{ const be=document.querySelector('#btnEnd');if(be)be.click(); }
        // close any modal that opened
        const m=document.querySelector('#modal');
        if(m&&m.classList.contains('on')){
          const cb=[...m.querySelectorAll('button')].pop();if(cb)cb.click()}
      }catch(e){caught.push('STEP '+step+': '+(e.stack||e.message));break}
    }
    return {round:D.sim.round,over:D.sim.over,outcome:D.sim.outcome,caught,
      acts:document.querySelector('#acts').children.length};});
  console.log('seed',seed,JSON.stringify(res));
  if(res.caught.length||errs.length)break;
  // back to briefing if debrief modal is up
  await pg.evaluate(()=>{const m=document.querySelector('#modal');
    if(m&&m.classList.contains('on')){const b2=[...m.querySelectorAll('button')][0];if(b2)b2.click()}});
  await pg.waitForTimeout(400)}
console.log('ERRS',JSON.stringify(errs.slice(0,4),null,1));
await b.close();
