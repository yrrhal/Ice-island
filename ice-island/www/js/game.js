
const { Engine, World, Bodies, Body, Events, Sleeping } = Matter;
let engine, world, ctx, width, height, renderCanvas;
let balls=[], obstacles=[], hexObstacles=[], rockObstacles=[], finalObstacle=null;
let bucketWalls=[], bucketBounds=[];
let bucketCounts=[0,0,0,0,0], bucketVolumes=[0,0,0,0,0];
// نظام جديد: وسط 40→70، جانبي 50→65، أطراف 60→60
const BASE_BUCKET_NEEDS=[60,50,40,50,60];
const BASE_BUCKET_POINTS=[60,65,70,65,60];
let bucketNeeds=BASE_BUCKET_NEEDS.slice();
let bucketPoints=BASE_BUCKET_POINTS.slice();

// ===== نظام صعوبة المراحل (جديد) — كل 3 مراحل ترفع درجة تحدٍ جديدة، بحد أقصى معقول =====
function getLevelDifficulty(level){
  const tier = Math.max(0, Math.floor((level-1)/3));
  return {
    tier,
    needMult: Math.min(1.6, 1 + tier*0.10),      // كؤوس تحتاج كمية أكبر تدريجيًا
    speedMult: Math.min(2.0, 1 + tier*0.14),     // العقبات تتحرك أسرع
    gravityBonus: Math.min(0.10, tier*0.015),    // جاذبية أعلى قليلًا لتحدٍ إضافي خفيف
    extraObstacles: Math.min(3, Math.floor(tier/2))
  };
}
function applyLevelDifficulty(){
  const diff = getLevelDifficulty(currentLevel);
  bucketNeeds = BASE_BUCKET_NEEDS.map(n => Math.round(n * diff.needMult));
  bucketPoints = BASE_BUCKET_POINTS.slice();
  if(typeof world !== 'undefined' && world) world.gravity.y = 0.62 + diff.gravityBonus;
  return diff;
}
let bucketFilled=[false,false,false,false,false];
let pourX=0.5, totalBalls=0, maxBalls=200, stars=0, currentLevel=1, gameWon=false;
let isPouring=false, pourInterval=null, currentBallType='normal';
let heavyIcedActive=false, heavyIcedRemaining=0, fireActive=false, fireRemaining=0, ironActive=false, ironRemaining=0;
let steamParticles=[];
let lastStarMilestone=0, lastGiftMilestone=0;
let soundEnabled=true, musicEnabled=true, audioCtx=null, masterGain=null, musicInterval=null, musicNodes=[];
let cardAction=null, selectedBuckets=[];
let dailyPrediction={date:null, idx:null, used:false};
let gunEffects={normal:0, fire:0, ice:0}; // تأثير البنادق على السكب - يحفظ التقدم
let extraPredictAvailable=0, starBoosterUntil=0;
let inventory={coins:1500, stars:0, normalBalls:100, iceBalls:20, fireBalls:20, ironBalls:0, guns:{normal:0, fire:0, ice:0}, cards:{double:2, merge:1, redo:1, extra:1}, lastFreeClaim:0, musicUnlocked:false};

let mp3Sounds={};
function initAudio(){
  if(audioCtx) return;
  try{
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    masterGain=audioCtx.createGain(); masterGain.gain.value=0.8; masterGain.connect(audioCtx.destination);
    mp3Sounds={
      pour: document.getElementById('audio-pour'),
      hit: document.getElementById('audio-hit'),
      split: document.getElementById('audio-split'),
      melt: document.getElementById('audio-melt'),
      win: document.getElementById('audio-win'),
      coin: document.getElementById('audio-coin'),
      iron: document.getElementById('audio-iron'),
      bg: document.getElementById('audio-bg'),
      slide: document.getElementById('audio-slide'),
      paper: document.getElementById('audio-paper')
    };
    Object.values(mp3Sounds).forEach(a=>{ if(a) a.volume=0.6; });
    if(mp3Sounds.bg) mp3Sounds.bg.volume=0.25;
    if(mp3Sounds.iron) mp3Sounds.iron.volume=0.9;
  }catch(e){}
}
function playSound(type, vol=0.18){
  if(!soundEnabled) return;
  if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  try{
    let audioEl=null;
    switch(type){
      case 'pour': audioEl=mp3Sounds.pour; break;
      case 'bucket_hit': audioEl=mp3Sounds.hit; break;
      case 'split': audioEl=mp3Sounds.split; break;
      case 'melt': audioEl=mp3Sounds.melt; break;
      case 'win': audioEl=mp3Sounds.win; break;
      case 'coin': case 'buy': case 'gift': case 'click': audioEl=mp3Sounds.coin; break;
      case 'gun': audioEl=mp3Sounds.coin; break;
      case 'iron_break': audioEl=mp3Sounds.iron; break;
    }
    if(audioEl){
      audioEl.currentTime=0;
      audioEl.volume = type==='iron_break' ? 0.9 : (type==='win' ? 0.7 : vol);
      let p=audioEl.play();
      if(p) p.catch(()=>{ playOscSound(type, vol); });
      if(type==='win'){ setTimeout(()=>{ if(mp3Sounds.coin){ mp3Sounds.coin.currentTime=0; mp3Sounds.coin.volume=0.5; mp3Sounds.coin.play().catch(()=>{}); } }, 300); }
      if(type==='iron_break'){ setTimeout(()=>{ if(mp3Sounds.split){ mp3Sounds.split.currentTime=0; mp3Sounds.split.volume=0.85; mp3Sounds.split.play().catch(()=>{}); } }, 90); }
      return;
    }
    playOscSound(type, vol);
  }catch(e){ playOscSound(type, vol); }
}
function playOscSound(type, vol=0.18){
  if(!audioCtx) return;
  try{
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(masterGain||audioCtx.destination);
    let freq=440, dur=0.35, wave='sine';
    switch(type){
      case 'pour': freq=320+Math.random()*80; dur=0.15; break;
      case 'bucket_hit': freq=520+Math.random()*120; vol*=1.2; wave='triangle'; dur=0.25; break;
      case 'split': freq=700+Math.random()*200; wave='square'; dur=0.3; break;
      case 'melt': freq=220+Math.random()*60; wave='sawtooth'; dur=0.4; break;
      case 'win': freq=660; dur=0.8; break;
      case 'gun': freq=180+Math.random()*40; wave='square'; dur=0.2; break;
      case 'coin': freq=880; dur=0.4; break;
      case 'click': freq=600; dur=0.1; break;
      case 'activate': freq=500; dur=0.3; break;
      case 'deactivate': freq=300; dur=0.2; break;
      case 'predict': freq=750; dur=0.5; break;
      case 'gift': freq=900; dur=0.6; break;
      case 'card': freq=650; dur=0.3; break;
      case 'buy': freq=800; dur=0.35; break;
      case 'error': freq=150; wave='sawtooth'; dur=0.3; break;
      case 'iron_break': freq=100; wave='sawtooth'; dur=0.6; vol=0.9; break;
    }
    osc.type=wave; osc.frequency.value=freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+dur);
    osc.start(); osc.stop(audioCtx.currentTime+dur);
  }catch(e){}
}
function playBackgroundMusic(){
  if(!musicEnabled) return;
  try{
    if(mp3Sounds.bg){
      mp3Sounds.bg.volume=0.25; mp3Sounds.bg.loop=true;
      mp3Sounds.bg.play().catch(()=>{});
    } else if(audioCtx && inventory.musicUnlocked){
      if(musicInterval) clearInterval(musicInterval);
      const notes=[261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
      const pattern=[0,2,4,5,7,5,4,2, 0,1,3,5,6,5,3,1];
      let idx=0;
      musicInterval=setInterval(()=>{
        if(!musicEnabled||!audioCtx) return;
        try{
          const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
          osc.connect(gain); gain.connect(masterGain);
          osc.type='sine'; osc.frequency.value=notes[pattern[idx%pattern.length]]*0.5;
          gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+1.2);
          osc.start(); osc.stop(audioCtx.currentTime+1.2); idx++;
        }catch(e){}
      }, 600);
    }
  }catch(e){}
}
let lastSlidePlay=0;
function playSlideSound(){
  let now=Date.now(); if(now-lastSlidePlay<80) return; lastSlidePlay=now;

  if(!soundEnabled) return;
  let distance = Math.abs(pourX - 0.5);
  playOscSlide(distance);
}
function playOscSlide(distance){
  if(!audioCtx) return;
  if(audioCtx.state==='suspended') audioCtx.resume();
  try{
    const osc=audioCtx.createOscillator(), gain=audioCtx.createGain(), filter=audioCtx.createBiquadFilter();
    filter.type='lowpass'; filter.frequency.value=800 + distance*1200;
    osc.connect(filter); filter.connect(gain); gain.connect(masterGain||audioCtx.destination);
    osc.type='triangle';
    // انزلاق خفيف: 180Hz وسط, 520Hz أطراف
    osc.frequency.value=220 + distance*720; // انزلاق أوضح
    let vol = 0.18 + distance*0.55; // أعلى ليُسمع بوضوح v5.0
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.22);
    osc.start(); osc.stop(audioCtx.currentTime+0.22);
  }catch(e){}
}
function playPaperSound(){
  if(!soundEnabled) return;
  if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
  try{
    if(mp3Sounds.paper){
      mp3Sounds.paper.currentTime=0;
      mp3Sounds.paper.volume=0.55;
      mp3Sounds.paper.play().catch(()=>{ playOscSound('click',0.15); });
    }
    // أيضا نغمة ورق خفيفة بالأوسيليتور
    if(audioCtx){
      const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
      osc.connect(gain); gain.connect(masterGain||audioCtx.destination);
      osc.type='sine'; osc.frequency.value=900;
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.15);
      osc.start(); osc.stop(audioCtx.currentTime+0.15);
    }
  }catch(e){}
}

function stopBackgroundMusic(){ 
  try{ if(mp3Sounds.bg) mp3Sounds.bg.pause(); }catch(e){}
  if(musicInterval){ clearInterval(musicInterval); musicInterval=null; } 
}

function init(){
  const c=document.getElementById('game-container');
  width=c.clientWidth; height=c.clientHeight;
  engine=Engine.create({enableSleeping:true}); world=engine.world; world.gravity.y=0.62;
  renderCanvas=document.createElement('canvas'); renderCanvas.width=width; renderCanvas.height=height;
  document.getElementById('canvas-wrapper').appendChild(renderCanvas);
  ctx=renderCanvas.getContext('2d');
  loadInventory(); loadPrediction();
  applyLevelDifficulty();
  createWalls(); createObstaclesUltimate(); createBuckets(); createBucketsUI();
  Events.on(engine,'collisionStart', handleCollisions);
  Engine.run(engine);
  (function loop(){ updateObstaclesMovement(); handleBucketLogic(); requestAnimationFrame(loop); })();
  requestAnimationFrame(renderLoop);
  startFreeTimer(); updatePourIndicator(); updateAllUI();
  if(inventory.musicUnlocked && musicEnabled) playBackgroundMusic();
}

function createWalls(){
  const o={isStatic:true, render:{visible:false}, friction:0.12, restitution:0.38};
  World.add(world,[Bodies.rectangle(-15,height/2,30,height*3,o), Bodies.rectangle(width+15,height/2,30,height*3,o), Bodies.rectangle(width/2,-15,width*3,30,o)]);
}
function createObstaclesUltimate(){
  const diff = getLevelDifficulty(currentLevel);
  obstacles.forEach(o=>{ try{World.remove(world,o);}catch(e){} });
  hexObstacles.forEach(o=>{ try{World.remove(world,o);}catch(e){} });
  rockObstacles.forEach(o=>{ try{World.remove(world,o);}catch(e){} });
  if(finalObstacle) try{World.remove(world,finalObstacle);}catch(e){}
  obstacles=[]; hexObstacles=[]; rockObstacles=[]; finalObstacle=null;
  const cx=width/2, mountainY=295;
  let mountain=Bodies.polygon(cx,mountainY,3,62,{isStatic:true, restitution:0.16, friction:0.52, angle:Math.PI, chamfer:{radius:6}, render:{fillStyle:'#d0e8ff'}, label:'mountain_obstacle'});
  mountain.isIceObstacle=true; mountain.meltProgress=0; mountain.meltTimeRemaining=0; mountain.isMelting=false; mountain.renderScale=1; mountain.baseX=cx; mountain.baseY=mountainY; mountain.baseAngle=Math.PI; mountain.moveRange=0; mountain.moveSpeed=0; mountain.movePhase=0;
  World.add(world,mountain); obstacles.push(mountain);
  const hexY=mountainY-95;
  [cx-90,cx,cx+90].forEach((x,idx)=>{
    let hex=Bodies.polygon(x,hexY,6,24,{isStatic:true, restitution:0.72, friction:0.04, chamfer:{radius:3}, render:{fillStyle:'#a0d8ff'}, label:'snowflake_obstacle'});
    hex.circleRadius=24; hex.baseX=x; hex.baseY=hexY; hex.baseAngle=0; hex.moveRange=38+idx*6; hex.moveSpeed=(0.009+idx*0.0035)*diff.speedMult; hex.movePhase=idx*2.1; hex.isHex=true; hex.isIceObstacle=true; hex.meltProgress=0; hex.meltTimeRemaining=0; hex.isMelting=false; hex.renderScale=1;
    World.add(world,hex); hexObstacles.push(hex); obstacles.push(hex);
  });
  const rockY=mountainY+125;
  [cx-110,cx-35,cx+35,cx+110].forEach((x,idx)=>{
    let rock=Bodies.rectangle(x,rockY,36,10,{isStatic:true, restitution:0.38, friction:0.22, angle:(Math.random()-0.5)*0.18, chamfer:{radius:3}, render:{fillStyle:'#7ec8e3'}, label:'ice_rock_obstacle'});
    rock.baseX=x; rock.baseY=rockY; rock.moveRange=28+idx*7; rock.moveSpeed=(0.008+idx*0.0028)*diff.speedMult; rock.movePhase=idx*1.7+0.5; rock.isRock=true; rock.isIceObstacle=true; rock.meltProgress=0; rock.meltTimeRemaining=0; rock.isMelting=false; rock.renderScale=1;
    World.add(world,rock); rockObstacles.push(rock); obstacles.push(rock);
  });
  const finalY=height-225; // أبعد للأعلى 30px إضافية عن الكؤوس - v5.1 - بدون كلمة FINAL
  let final=Bodies.rectangle(cx,finalY,90,12,{isStatic:true, restitution:0.55, friction:0.08, chamfer:{radius:4}, render:{fillStyle:'#5dade2'}, label:'final_ice_obstacle'});
  final.baseX=cx; final.baseY=finalY; final.moveRange=85; final.moveSpeed=0.012*diff.speedMult; final.movePhase=3.14; final.isFinal=true; final.isIceObstacle=true; final.meltProgress=0; final.meltTimeRemaining=0; final.isMelting=false; final.renderScale=1;
  World.add(world,final); finalObstacle=final; obstacles.push(final);
  let s1=Bodies.rectangle(78,380,68,10,{isStatic:true, angle:0.58, restitution:0.14, friction:0.012, chamfer:{radius:4}, render:{fillStyle:'#b0e0ff'}, label:'slope_obstacle'});
  let s2=Bodies.rectangle(width-78,380,68,10,{isStatic:true, angle:-0.58, restitution:0.14, friction:0.012, chamfer:{radius:4}, render:{fillStyle:'#b0e0ff'}, label:'slope_obstacle'});
  World.add(world,[s1,s2]); obstacles.push(s1,s2);
  // ===== عقبات إضافية للمراحل الأصعب (جديد) =====
  for(let i=0;i<diff.extraObstacles;i++){
    const ex = cx + (i%2===0 ? -1:1) * (140 + i*22);
    const ey = mountainY + 40 + i*30;
    let extra = Bodies.polygon(ex, ey, 5, 20, {isStatic:true, restitution:0.6, friction:0.05, chamfer:{radius:3}, render:{fillStyle:'#8fd0f5'}, label:'hard_ice_obstacle'});
    extra.baseX=ex; extra.baseY=ey; extra.baseAngle=0; extra.moveRange=45+i*10; extra.moveSpeed=(0.011+i*0.003)*diff.speedMult; extra.movePhase=i*1.9;
    extra.isHex=true; extra.isIceObstacle=true; extra.meltProgress=0; extra.meltTimeRemaining=0; extra.isMelting=false; extra.renderScale=1;
    World.add(world, extra); hexObstacles.push(extra); obstacles.push(extra);
  }
}
function updateObstaclesMovement(){
  let time=Date.now()*0.001;
  hexObstacles.forEach(obs=>{
    let newX=obs.baseX + Math.sin(time*obs.moveSpeed*60 + obs.movePhase)*obs.moveRange;
    Body.setPosition(obs,{x:newX, y:obs.baseY});
    Body.setAngle(obs, obs.baseAngle + Math.sin(time*0.8 + obs.movePhase)*0.15);
    if(obs.isMelting){
      let d=1/60; obs.meltTimeRemaining-=d;
      if(obs.meltTimeRemaining<=0){ obs.meltProgress=Math.max(0, obs.meltProgress - d*0.5); if(obs.meltProgress<=0){ obs.isMelting=false; obs.meltProgress=0; } }
      else obs.meltProgress=Math.max(0, obs.meltProgress - d*0.12);
      obs.renderScale=1 - obs.meltProgress*0.65;
    }
  });
  rockObstacles.forEach(obs=>{
    let newX=obs.baseX + Math.sin(time*obs.moveSpeed*60 + obs.movePhase)*obs.moveRange;
    Body.setPosition(obs,{x:newX, y:obs.baseY});
    if(obs.isMelting){ let d=1/60; obs.meltTimeRemaining-=d; if(obs.meltTimeRemaining<=0){ obs.meltProgress=Math.max(0, obs.meltProgress - d*0.5); if(obs.meltProgress<=0) obs.isMelting=false; } else obs.meltProgress=Math.max(0, obs.meltProgress - d*0.12); obs.renderScale=1 - obs.meltProgress*0.65; }
  });
  if(finalObstacle){
    let newX=finalObstacle.baseX + Math.sin(time*finalObstacle.moveSpeed*60 + finalObstacle.movePhase)*finalObstacle.moveRange;
    Body.setPosition(finalObstacle,{x:newX, y:finalObstacle.baseY});
    Body.setAngle(finalObstacle, Math.sin(time*0.6 + finalObstacle.movePhase)*0.25);
    if(finalObstacle.isMelting){ let d=1/60; finalObstacle.meltTimeRemaining-=d; if(finalObstacle.meltTimeRemaining<=0){ finalObstacle.meltProgress=Math.max(0, finalObstacle.meltProgress - d*0.5); if(finalObstacle.meltProgress<=0) finalObstacle.isMelting=false; } else finalObstacle.meltProgress=Math.max(0, finalObstacle.meltProgress - d*0.12); finalObstacle.renderScale=1 - finalObstacle.meltProgress*0.6; }
  }
}
function createBuckets(){
  bucketWalls.forEach(w=>{ try{World.remove(world,w);}catch(e){} }); bucketWalls=[]; bucketBounds=[];
  const num=5, wallThick=7, gap=0, usable=width-4;
  const innerW=Math.floor((usable - (num+1)*wallThick - (num-1)*gap)/num);
  const bucketH=110, bucketY=height-140;
  for(let i=0;i<=num;i++){
    let x=2+wallThick/2 + i*(innerW+wallThick+gap); if(i===num) x=width-2-wallThick/2;
    let wall=Bodies.rectangle(x,bucketY,wallThick,bucketH+26,{isStatic:true, restitution:0.32, friction:0.30, chamfer:{radius:1}, render:{fillStyle:'#4a8abf'}, label:'bucket_wall_'+i});
    World.add(world,wall); bucketWalls.push(wall);
  }
  let fullBottom=Bodies.rectangle(width/2, bucketY+bucketH/2+4, width, wallThick+2,{isStatic:true, restitution:0.10, friction:0.50, render:{fillStyle:'#2a6a8f'}, label:'bucket_full_bottom'});
  World.add(world,fullBottom); bucketWalls.push(fullBottom);
  for(let i=0;i<num;i++){
    let leftX=2+wallThick/2 + i*(innerW+wallThick+gap);
    let centerX=leftX+wallThick/2+innerW/2;
    bucketBounds.push({index:i, xMin:leftX+wallThick/2+2, xMax:leftX+wallThick/2+innerW-2, yMin:bucketY-bucketH/2+12, yMax:bucketY+bucketH/2, yEntry:bucketY-bucketH/2-4, centerX:centerX, bucketY:bucketY, innerW:innerW, leftWallX:leftX, rightWallX:leftX+innerW+wallThick+gap});
  }
  // ^ ملاصق تماما للكؤوس بدون أي فراغ - متداخل مع قمة الكأس - v5.6 ULTRA CLOSE
  for(let i=0;i<=num;i++){
    let wallX=2+wallThick/2 + i*(innerW+wallThick+gap); if(i===num) wallX=width-2-wallThick/2;
    let cupTop = bucketY - bucketH/2 + 12;
    let topY = cupTop + 4; // ملاصق جدا - داخل الكأس 4px - أقرب ما يمكن - v5.7
    let leftPart=Bodies.rectangle(wallX-4, topY, 10, 5,{isStatic:true, angle:-0.65, restitution:0.22, friction:0.06, chamfer:{radius:1}, render:{fillStyle:'#7dd8ff'}, label:'bucket_guide'});
    let rightPart=Bodies.rectangle(wallX+4, topY, 10, 5,{isStatic:true, angle:0.65, restitution:0.22, friction:0.06, chamfer:{radius:1}, render:{fillStyle:'#7dd8ff'}, label:'bucket_guide'});
    World.add(world,[leftPart,rightPart]); bucketWalls.push(leftPart,rightPart);
  }
}
function createBucketsUI(){
  const ui=document.getElementById('buckets-ui'); ui.innerHTML='';
  for(let i=0;i<5;i++){
    let d=document.createElement('div'); d.className='bucket-ui'; d.id='bucket-ui-'+i;
    let need=bucketNeeds[i], pts=bucketPoints[i];
    d.innerHTML=`<div class="bucket-label">${String.fromCharCode(65+i)}</div><div class="bucket-count" id="b${i}">0.0</div><div class="bucket-need" id="need${i}">/${need}</div><div class="bucket-mult">${pts}⭐</div><div id="v${i}" style="font-size:5px;color:#a8e6ff">0ml</div>`;
    ui.appendChild(d);
  }
}
function handleBucketLogic(){
  balls.forEach(ball=>{
    if(ball.isRemoved) return;
    let vel=Math.hypot(ball.velocity.x, ball.velocity.y);
    if(ball.bucketIndex!==null && vel<0.12){ ball.sleepCounter=(ball.sleepCounter||0)+1; if(ball.sleepCounter>20) Sleeping.set(ball,true); } else ball.sleepCounter=0;
    if(vel<0.09 && ball.bucketIndex===null){ ball.stuckTime=(ball.stuckTime||0)+1; if(ball.stuckTime>38){ Body.setVelocity(ball,{x:(Math.random()-0.5)*3.4 + (Math.random()>0.5?1.7:-1.7), y:-0.7-Math.random()}); ball.stuckTime=0; } } else if(ball.bucketIndex===null) ball.stuckTime=0;
    if(!ball.counted && ball.position.y > bucketBounds[0].yEntry && ball.position.y < bucketBounds[0].yMax+20){
      let idx=getBucketIndexByX(ball.position.x);
      if(idx!==null){
        let b=bucketBounds[idx];
        if(ball.position.x>=b.xMin && ball.position.x<=b.xMax){
          ball.counted=true; ball.bucketIndex=idx;
          if(ball.ballType==='sand'||ball.ballType==='water'){ let ml=ball.volumeMl||10; bucketVolumes[idx]+=ml; bucketCounts[idx]+=ml/100; }
          else {
            let cv=1; if(ball.ballType==='small') cv=0.5; if(ball.ballType==='large') cv=1.5; if(ball.ballType==='ice'){ let baseR=7, curR=ball.circleRadius||baseR; cv=Math.max(0.12, curR/baseR); } bucketCounts[idx]+=cv; bucketVolumes[idx]+= (ball.circleRadius||5)*2;
          }
          // فور دخول الكرة يزداد العدد - v5.1
          document.getElementById('b'+idx).textContent=bucketCounts[idx].toFixed(1);
          document.getElementById('need'+idx).textContent='/'+bucketNeeds[idx];
          document.getElementById('v'+idx).textContent=bucketVolumes[idx].toFixed(0)+'ml';
          let inCups=bucketCounts.reduce((a,b)=>a+b,0);
          document.getElementById('in-cups').textContent=inCups.toFixed(1);
          document.getElementById('match-check').textContent=`YES ✓ ${inCups.toFixed(1)}/${totalBalls}`;
          highlightBucket(idx); playSound('bucket_hit',0.18); checkWinCondition(idx);
        }
      }
    }
    if(ball.position.y>height+80 && ball.bucketIndex===null){ try{World.remove(world,ball);}catch(e){} ball.isRemoved=true; }
  });
  balls=balls.filter(b=>!b.isRemoved);
}
function handleCollisions(event){
  event.pairs.forEach(pair=>{
    const aL=pair.bodyA.label||'', bL=pair.bodyB.label||'';
    const isBallA=aL.includes('_ball'), isBallB=bL.includes('_ball');
    if(!isBallA&&!isBallB) return;
    const ball=isBallA?pair.bodyA:pair.bodyB; const other=isBallA?pair.bodyB:pair.bodyA; const otherL=isBallA?bL:aL;
    if(ball.isRemoved) return;
    const isBucket=otherL.includes('bucket_'); const isIce=other.isIceObstacle;
    if(ball.ballType==='ice' && isIce && !isBucket && !otherL.includes('_ball')){ if((ball.circleRadius||7)>=2.5 && !ball.justSplit && balls.length<260) splitIceBallUltimate(ball,other,pair.collision); }
    if(ball.ballType==='fire' && isIce && !isBucket && !otherL.includes('_ball')) meltIceObstacleUltimate(other,ball,pair.collision);
    if(ball.ballType==='iron' && isIce && !isBucket){ other.meltProgress=Math.min(0.95,(other.meltProgress||0)+0.55); other.isMelting=true; other.meltTimeRemaining=2; other.renderScale=1-other.meltProgress*0.65; playSound('iron_break',0.9); if(typeof Effects!=='undefined') Effects.screenShake(); }
  });
}
function splitIceBallUltimate(ball, obstacle, collision){
  if(ball.ballType!=='ice'||ball.isRemoved||(ball.circleRadius||7)<2.5||ball.justSplit) return;
  let normal=collision&&collision.normal?collision.normal:{x:(Math.random()-0.5), y:-1};
  let impactAngle=Math.atan2(normal.y, normal.x);
  let a1=impactAngle+Math.PI/2+(Math.random()-0.5)*0.4, a2=impactAngle-Math.PI/2+(Math.random()-0.5)*0.4;
  let curR=ball.circleRadius||7, newR=Math.max(2.3, curR*0.65);
  let impactSpeed=Math.hypot(ball.velocity.x, ball.velocity.y);
  let splitSpeed=Math.max(1.2, impactSpeed*0.6+0.8);
  for(let i=0;i<2;i++){
    let ang=i===0?a1:a2;
    const nb=Bodies.circle(ball.position.x+Math.cos(ang)*newR*0.8, ball.position.y+Math.sin(ang)*newR*0.8, newR,{restitution:0.36+Math.random()*0.08, friction:0.012, frictionAir:0.0035, frictionStatic:0.07, density:0.0032, sleepThreshold:12, label:'ice_ball'});
    nb.isRemoved=false; nb.stuckTime=0; nb.counted=false; nb.bucketIndex=null; nb.sleepCounter=0; nb.ballType='ice'; nb.splitLevel=(ball.splitLevel||0)+1; nb.volumeMl=(ball.volumeMl||10)*0.48; nb.justSplit=true;
    setTimeout(()=>{ if(nb) nb.justSplit=false; },150);
    Body.setVelocity(nb,{x:Math.cos(ang)*splitSpeed + ball.velocity.x*0.25, y:Math.sin(ang)*splitSpeed + ball.velocity.y*0.15 -0.3});
    World.add(world,nb); balls.push(nb);
  }
  try{World.remove(world,ball);}catch(e){} ball.isRemoved=true; playSound('split',0.15);
  for(let i=0;i<4;i++) steamParticles.push({x:ball.position.x+(Math.random()-0.5)*12,y:ball.position.y+(Math.random()-0.5)*12,vy:-0.6-Math.random()*0.6,life:0.5,maxLife:0.5,alpha:1,isIceShard:true,radius:1+Math.random()*1.5});
}
function meltIceObstacleUltimate(obstacle, fireBall, collision){
  if(!obstacle.isIceObstacle) return;
  let rFire=fireBall.circleRadius||6.5, rIce=obstacle.circleRadius||18;
  let normal=collision&&collision.normal?collision.normal:{x:0,y:1};
  let cosTheta=Math.abs(normal.y);
  let contactArea=Math.PI*rFire*rIce*cosTheta/(rFire+rIce+5); contactArea=Math.max(2,Math.min(30,contactArea));
  let deltaT=800, hCoeff=0.12, dt=1/60; let heatEnergy=hCoeff*contactArea*deltaT*dt; let massMelted=heatEnergy/(2.09*10+334);
  let meltInc=Math.max(0.18,Math.min(0.38,massMelted*12+contactArea*0.008));
  obstacle.isMelting=true; obstacle.meltProgress=Math.min(0.95,(obstacle.meltProgress||0)+meltInc); obstacle.meltTimeRemaining=(obstacle.meltTimeRemaining||0)+2; obstacle.renderScale=1-obstacle.meltProgress*0.65;
  for(let i=0;i<Math.floor(contactArea/4)+3;i++) steamParticles.push({x:obstacle.position.x,y:obstacle.position.y,vy:-0.6-Math.random()*0.8,life:0.7,maxLife:0.7,alpha:1,radius:1.2+Math.random()*1.3});
  playSound('melt',0.13);
}
function renderLoop(){
  ctx.clearRect(0,0,width,height);
  [...hexObstacles, ...rockObstacles].forEach(obs=>{
    if(obs.broken) return;
    ctx.save(); ctx.translate(obs.position.x, obs.position.y); ctx.rotate(obs.angle);
    let scale=obs.renderScale!==undefined?obs.renderScale:(1-(obs.meltProgress||0)*0.6); scale=Math.max(0.25,scale);
    if(obs.isHex){
      let baseR=obs.circleRadius||24, r=baseR*scale, melt=obs.meltProgress||0, alpha=1-melt*0.55;
      ctx.fillStyle=`rgba(${160+melt*95}, ${216+melt*20}, 255, ${alpha})`;
      ctx.strokeStyle=`rgba(255,255,255,${0.9-melt*0.6})`; ctx.lineWidth=1.3*scale; ctx.beginPath();
      for(let j=0;j<6;j++){ let ang=(j/6)*Math.PI*2, rVar=r*(1 - melt*0.15*Math.sin(j*2)); let x=Math.cos(ang)*rVar, y=Math.sin(ang)*rVar; if(j==0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {
      let w=36*scale, h=10*scale, melt=obs.meltProgress||0;
      ctx.fillStyle=`rgba(${126+melt*80}, ${200+melt*30}, ${227+melt*20}, ${1-melt*0.5})`;
      ctx.strokeStyle=`rgba(255,255,255,${0.6-melt*0.4})`; ctx.lineWidth=0.8;
      ctx.fillRect(-w/2,-h/2,w,h); ctx.strokeRect(-w/2,-h/2,w,h);
    }
    ctx.restore();
  });
  if(finalObstacle && !finalObstacle.broken){
    ctx.save(); ctx.translate(finalObstacle.position.x, finalObstacle.position.y); ctx.rotate(finalObstacle.angle);
    let scale=finalObstacle.renderScale||(1-(finalObstacle.meltProgress||0)*0.6); let w=90*scale, h=12*scale, melt=finalObstacle.meltProgress||0;
    // بدون كلمة FINAL - v5.1
    ctx.fillStyle=melt>0?`rgba(100,200,255,${1-melt*0.5})`:'#5dade2'; ctx.strokeStyle='#2ecc71'; ctx.lineWidth=2;
    ctx.fillRect(-w/2,-h/2,w,h); ctx.strokeRect(-w/2,-h/2,w,h); ctx.restore();
  }
  obstacles.forEach(obs=>{ if(obs.broken||obs.isHex||obs.isRock||obs.isFinal) return; ctx.save(); ctx.translate(obs.position.x, obs.position.y); ctx.rotate(obs.angle); if(obs.label&&obs.label.includes('mountain')){ ctx.fillStyle='#d0e8ff'; ctx.beginPath(); ctx.moveTo(0,-58); ctx.lineTo(62,42); ctx.lineTo(-62,42); ctx.closePath(); ctx.fill(); ctx.strokeStyle='#7ec8e3'; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.font='6px Arial'; ctx.fillText('▼ مثلث',-14,0); } else { ctx.fillStyle=obs.render.fillStyle||'#7ec8e3'; ctx.fillRect(-35,-5,70,10); } ctx.restore(); });
  bucketWalls.forEach(w=>{ 
    ctx.save(); ctx.translate(w.position.x,w.position.y); ctx.rotate(w.angle); 
    ctx.fillStyle=w.render.fillStyle||'#4a8abf'; 
    if(w.label&&w.label.includes('bottom')) ctx.fillRect(-width/2,-3,width,6); 
    else if(w.label&&w.label.includes('guide')){
      // شكل ^ مطابق للصورة المرفقة تماما - جزأين مائلين فوق الجدار
      ctx.fillStyle='#7dd8ff';
      ctx.fillRect(-5,-2.5,10,5);
      ctx.strokeStyle='rgba(125,216,255,0.8)'; ctx.lineWidth=0.5; ctx.strokeRect(-5,-2.5,10,5);
    } else ctx.fillRect(-3,-36,6,76); 
    ctx.restore(); 
  });
  steamParticles.forEach((p,i)=>{ p.y+=p.vy; p.life-=0.016; p.alpha=p.life/p.maxLife; if(p.life<=0){ steamParticles.splice(i,1); return; } ctx.save(); ctx.globalAlpha=p.alpha*0.65; ctx.fillStyle=p.isIceShard?'rgba(180,220,255,0.9)':'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p.x,p.y,p.radius||2,0,Math.PI*2); ctx.fill(); ctx.restore(); });
  if(steamParticles.length>140) steamParticles.splice(0,steamParticles.length-140);
  balls.forEach(ball=>{
    if(ball.isRemoved) return;
    ctx.beginPath(); let r=ball.circleRadius||5.6; ctx.arc(ball.position.x, ball.position.y, r,0,Math.PI*2);
    if(ball.bucketIndex!==null){
      const cols=['#2ecc71','#3498db','#e67e22','#f1c40f','#9b59b6'];
      if(ball.ballType==='fire') ctx.fillStyle='#ff6b35'; else if(ball.ballType==='ice') ctx.fillStyle='#7dd8ff'; else if(ball.ballType==='iron') ctx.fillStyle='#4a5a6a'; else ctx.fillStyle=cols[ball.bucketIndex]||'#88ff88';
    } else {
      if(ball.ballType==='fire'){ ctx.fillStyle='#ff6b35'; ctx.shadowColor='#ff6b35'; ctx.shadowBlur=8; }
      else if(ball.ballType==='ice'){ ctx.fillStyle='#7dd8ff'; ctx.shadowColor='#7dd8ff'; ctx.shadowBlur=5; }
      else if(ball.ballType==='iron'){ ctx.fillStyle='#3a4a5a'; ctx.shadowColor='#2c3e50'; ctx.shadowBlur=3; }
      else ctx.fillStyle='#ff6b9d';
    }
    ctx.fill();
    if(ball.ballType==='iron'){ ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(ball.position.x - r*0.25, ball.position.y - r*0.25, r*0.35, 0, Math.PI*2); ctx.fill(); }
    ctx.shadowBlur=0; ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.lineWidth=0.8; ctx.stroke();
    if(ball.ballType==='ice'){ ctx.fillStyle='white'; ctx.font=(r*0.7)+'px Arial'; ctx.fillText('❄',ball.position.x-r*0.4, ball.position.y+r*0.25); }
    else if(ball.ballType==='fire'){ ctx.fillStyle='white'; ctx.font=(r*0.6)+'px Arial'; ctx.fillText('🔥',ball.position.x-r*0.4, ball.position.y+r*0.25); }
    else if(ball.ballType==='iron'){ ctx.fillStyle='white'; ctx.font=(r*0.5)+'px Arial'; ctx.fillText('⚙️',ball.position.x-r*0.35, ball.position.y+r*0.22); }
  });
  requestAnimationFrame(renderLoop);
}
function getBucketIndexByX(x){ for(let i=0;i<bucketBounds.length;i++){ let b=bucketBounds[i]; if(x>=b.xMin&&x<=b.xMax) return i; } return null; }
function highlightBucket(idx){ let el=document.getElementById('bucket-ui-'+idx); if(el){ el.classList.add('highlight'); setTimeout(()=>el.classList.remove('highlight'),400); } }

// نظام النجوم الجديد
function checkWinCondition(idx){
  if(bucketFilled[idx]||gameWon) return;
  if(bucketCounts[idx]>=bucketNeeds[idx]){
    bucketFilled[idx]=true; document.getElementById('bucket-ui-'+idx).classList.add('filled');
    if(!gameWon){
      gameWon=true;
      let basePoints=bucketPoints[idx]; // 70 وسط, 65 جانبي, 60 أطراف
      let starsEarned=basePoints;
      let isBoosterActive = starBoosterUntil > Date.now();
      if(isBoosterActive) starsEarned*=2;
      // توقع يومي
      let predictBonus=false;
      if(dailyPrediction && dailyPrediction.idx===idx && dailyPrediction.date===getTodayStr()){
        starsEarned*=2; predictBonus=true;
      }
      stars+=starsEarned; inventory.stars+=starsEarned; inventory.coins+=starsEarned*2;
      playSound('win',0.5);
      let cupName=String.fromCharCode(65+idx);
      let desc = idx===2 ? 'وسط C 40 كرة → 70⭐' : (idx===1||idx===3 ? `جانبي ${cupName} 50→65⭐` : `طرفي ${cupName} 60→60⭐`);
      document.getElementById('win-text').innerHTML=`امتلأ الوعاء ${cupName}!<br>${desc}<br>${bucketCounts[idx].toFixed(1)}/${bucketNeeds[idx]} كرة`;
      document.getElementById('win-stars').textContent=`⭐ +${starsEarned} | 🪙 +${starsEarned*2} | Lv ${currentLevel}→${currentLevel+1}`;
      let bonusEl=document.getElementById('win-predict-bonus');
      if(predictBonus){ bonusEl.style.display='block'; bonusEl.textContent=`🔮 توقع صحيح! النجوم ×2!`; playSound('gift',0.4); }
      else if(isBoosterActive){ bonusEl.style.display='block'; bonusEl.textContent=`⭐ مضاعف نشط!`; }
      else bonusEl.style.display='none';
      document.getElementById('win-modal').style.display='flex';
      if(typeof Effects!=='undefined') Effects.confettiBurst();
      checkStarMilestones(); checkGiftMilestones(); saveInventory(); updateAllUI(); savePredictionWin(idx);
    }
  }
}
function checkStarMilestones(){ let m=Math.floor(stars/1000), last=Math.floor(lastStarMilestone/1000); if(m>last){ let diff=m-last; inventory.normalBalls+=diff*50; maxBalls+=diff*50; showCardUsed(`🎉 ${diff*1000} نجمة! +${diff*50} كرة`); lastStarMilestone=stars; playSound('coin',0.3); } }
function checkGiftMilestones(){ let m=Math.floor(stars/5000), last=Math.floor(lastGiftMilestone/5000); if(m>last){ lastGiftMilestone=stars; document.getElementById('gift-content').textContent=['🧊 30 جليدية','🔥 30 نارية','⚙️ 20 حديدية','🃏 3 Double'][Math.floor(Math.random()*4)]; document.getElementById('gift-box').style.display='flex'; playSound('gift',0.4); } }
function updateCountsUI(){ for(let i=0;i<5;i++){ document.getElementById('b'+i).textContent=bucketCounts[i].toFixed(1); document.getElementById('need'+i).textContent='/'+bucketNeeds[i]; document.getElementById('v'+i).textContent=bucketVolumes[i].toFixed(0)+'ml'; } let inCups=bucketCounts.reduce((a,b)=>a+b,0); document.getElementById('in-cups').textContent=inCups.toFixed(1); let active=balls.filter(b=>!b.counted&&!b.isRemoved).length; document.getElementById('active-count').textContent=active; document.getElementById('match-check').textContent=`YES ✓ ${inCups.toFixed(1)}/${totalBalls}`; }
function getTotalRemaining(){ return inventory.normalBalls+inventory.iceBalls+inventory.fireBalls+inventory.ironBalls; }
function updateAllUI(){
  let rem=getTotalRemaining(), perc=maxBalls>0?Math.round((rem/maxBalls)*100):0;
  document.getElementById('vessel-fill').style.width=perc+'%';
  document.getElementById('vessel-label').textContent=`${rem}/${maxBalls} - ${perc}%`;
  document.getElementById('coins').textContent=inventory.coins; document.getElementById('stars').textContent=inventory.stars; document.getElementById('level').textContent=currentLevel;
  document.getElementById('total-count').textContent=totalBalls; document.getElementById('bag-total').textContent=rem;
  document.getElementById('shop-coins').textContent=inventory.coins; document.getElementById('shop-stars').textContent=inventory.stars;
  document.getElementById('gun-count').textContent=inventory.guns.normal+inventory.guns.fire+inventory.guns.ice;
  document.getElementById('gun-btn').style.display=(inventory.guns.normal+inventory.guns.fire+inventory.guns.ice>0)?'block':'none';
  // ايقونات جانبية - النقطة 3
  document.getElementById('inv-c-normal').textContent=inventory.normalBalls;
  document.getElementById('inv-c-ice').textContent=inventory.iceBalls;
  document.getElementById('inv-c-fire').textContent=inventory.fireBalls;
  document.getElementById('inv-c-iron').textContent=inventory.ironBalls;
  document.getElementById('inv-c-guns').textContent=inventory.guns.normal+inventory.guns.fire+inventory.guns.ice;
  document.getElementById('inv-c-cards').textContent=Object.values(inventory.cards).reduce((a,b)=>a+b,0);
  // تفعيل الايقونات - النقطة 4
  const iceEl=document.getElementById('inv-ice'), fireEl=document.getElementById('inv-fire'), ironEl=document.getElementById('inv-iron');
  iceEl.classList.toggle('disabled', inventory.iceBalls<5);
  fireEl.classList.toggle('disabled', inventory.fireBalls<5);
  ironEl.classList.toggle('disabled', inventory.ironBalls<5);
  iceEl.classList.toggle('active', heavyIcedActive);
  fireEl.classList.toggle('active', fireActive);
  ironEl.classList.toggle('active', ironActive);
  // توقع
  updatePredictStatus();
  updateCountsUI();
}
function updatePourIndicator(){ let el=document.getElementById('pour-indicator'); if(!el) return; el.style.left=(pourX*65+17.5)+'%'; let pos='وسط'; if(pourX<0.2) pos='يسار جداً'; else if(pourX<0.4) pos='يسار'; else if(pourX>0.8) pos='يمين جداً'; else if(pourX>0.6) pos='يمين'; document.getElementById('pour-pos-text').textContent=pos; }
function getTodayStr(){ return new Date().toISOString().split('T')[0]; }
function loadPrediction(){ try{ let d=localStorage.getItem('ice_predict_v43'); if(d){ let o=JSON.parse(d); dailyPrediction=o.prediction||{date:null,idx:null,used:false}; extraPredictAvailable=o.extra||0; starBoosterUntil=o.booster||0; } }catch(e){} }
function savePrediction(){ try{ localStorage.setItem('ice_predict_v43', JSON.stringify({prediction:dailyPrediction, extra:extraPredictAvailable, booster:starBoosterUntil})); }catch(e){} }
function savePredictionWin(winIdx){ /* يبقى التوقع مستخدم لليوم */ }
function updatePredictStatus(){
  let el=document.getElementById('predict-status');
  let today=getTodayStr();
  if(dailyPrediction.date===today && dailyPrediction.idx!==null){
    el.textContent=`توقعت ${String.fromCharCode(65+dailyPrediction.idx)}`;
    el.style.color='#ffeb3b';
  } else {
    el.textContent='لم تتوقع'; el.style.color='white';
  }
  if(starBoosterUntil>Date.now()){
    let mins=Math.ceil((starBoosterUntil-Date.now())/60000);
    el.textContent+=` | ⭐×2 ${mins}د`;
  }
}
function canPredictToday(){
  let today=getTodayStr();
  if(dailyPrediction.date!==today) return true;
  if(extraPredictAvailable>0) return true;
  return false;
}
function openPredictModal(){
  if(!canPredictToday()){
    showCardUsed('🔮 توقعت اليوم بالفعل! اشتر توقع إضافي من المتجر');
    playSound('error',0.2); return;
  }
  const sel=document.getElementById('predict-select'); sel.innerHTML=''; selectedBuckets=[];
  for(let i=0;i<5;i++){
    let b=document.createElement('button'); 
    let need=bucketNeeds[i], pts=bucketPoints[i];
    b.innerHTML=`${String.fromCharCode(65+i)}<br><span style="font-size:7px">${need}→${pts}⭐</span>`;
    b.onclick=()=>{ selectedBuckets=[i]; document.querySelectorAll('#predict-select button').forEach(x=>x.classList.remove('selected')); b.classList.add('selected'); document.getElementById('predict-info').textContent=`توقعت الكأس ${String.fromCharCode(65+i)} - إذا فاز، النجوم ×2`; };
    sel.appendChild(b);
  }
  document.getElementById('predict-info').textContent='اختر كأس واحد';
  document.getElementById('predict-modal').style.display='flex'; playSound('predict',0.2);
}
function confirmPredict(){
  if(selectedBuckets.length!==1){ UIModal.alert('اختر كأس'); return; }
  let today=getTodayStr();
  if(dailyPrediction.date===today && extraPredictAvailable>0){ extraPredictAvailable--; }
  dailyPrediction={date:today, idx:selectedBuckets[0], used:true};
  savePrediction(); document.getElementById('predict-modal').style.display='none';
  showCardUsed(`🔮 توقعت الكأس ${String.fromCharCode(65+dailyPrediction.idx)}! إذا صح، النجوم ×2`); playSound('coin',0.3); updateAllUI();
}

function createBall(forcedType=null){
  if(balls.filter(b=>!b.counted).length>=280){ showCardUsed('⚠️ كثير كرات!'); return null; }
  // تأثير البنادق على نوع الكرة المسكوبة
  let rem=getTotalRemaining(); if(rem<=0&&!forcedType){ UIModal.alert('الحقيبة فارغة!'); openShop(); return null; }
  let bt=forcedType||currentBallType;
  if(!forcedType){
    if(heavyIcedActive&&heavyIcedRemaining>0) bt='ice';
    else if(fireActive&&fireRemaining>0) bt='fire';
    else if(ironActive&&ironRemaining>0) bt='iron';
  }
  if(bt==='ice'&&inventory.iceBalls<=0&&!forcedType&&!heavyIcedActive) bt='normal';
  if(bt==='fire'&&inventory.fireBalls<=0&&!forcedType&&!fireActive) bt='normal';
  if(bt==='iron'&&inventory.ironBalls<=0&&!forcedType&&!ironActive) bt='normal';
  if(bt==='normal'&&inventory.normalBalls<=0){ if(inventory.iceBalls>0) bt='ice'; else if(inventory.fireBalls>0) bt='fire'; else if(inventory.ironBalls>0) bt='iron'; else return null; }
  let x=pourX*(width*0.65)+width*0.175, y=58;
  let radius=5.6, density=0.0012, rest=0.56, fric=0.055, heavy=false;
  if(bt==='ice'){ radius=7; density=0.0032; rest=0.38; fric=0.015; }
  else if(bt==='fire'){ radius=6.5; density=0.0022; rest=0.42; fric=0.04; }
  else if(bt==='iron'){ radius=10.5; density=0.022; rest=0.04; fric=0.38; heavy=true; }
  let frictionAirVal=heavy?(bt==='iron'?0.0012:0.002):0.0055;
  let frictionStaticVal=heavy?(bt==='iron'?0.45:0.22):0.14;
  const ball=Bodies.circle(x,y,radius,{restitution:rest, friction:fric, frictionAir:frictionAirVal, frictionStatic:frictionStaticVal, density:density, sleepThreshold:12, label:bt+'_ball'});
  ball.isRemoved=false; ball.stuckTime=0; ball.counted=false; ball.bucketIndex=null; ball.sleepCounter=0; ball.isHeavy=heavy; ball.ballType=bt; ball.splitLevel=0; ball.volumeMl=10; ball.justSplit=false;
  Body.setVelocity(ball,{x:(Math.random()-0.5)*(heavy?0.35:0.65), y:0.12});
  World.add(world,ball); balls.push(ball); totalBalls++;
  if(!forcedType){
    if(bt==='ice'){ if(heavyIcedActive){ heavyIcedRemaining--; document.getElementById('heavy-count').textContent=heavyIcedRemaining; if(heavyIcedRemaining<=0){ heavyIcedActive=false; document.getElementById('heavy-indicator').style.display='none'; } } inventory.iceBalls=Math.max(0,inventory.iceBalls-1); if(inventory.iceBalls<5 && heavyIcedActive){ heavyIcedActive=false; document.getElementById('heavy-indicator').style.display='none'; showCardUsed('🧊 انتهت الجليدية'); } }
    else if(bt==='fire'){ if(fireActive){ fireRemaining--; document.getElementById('fire-count').textContent=fireRemaining; if(fireRemaining<=0){ fireActive=false; document.getElementById('fire-indicator').style.display='none'; } } inventory.fireBalls=Math.max(0,inventory.fireBalls-1); if(inventory.fireBalls<5 && fireActive){ fireActive=false; document.getElementById('fire-indicator').style.display='none'; showCardUsed('🔥 انتهت النارية'); } }
    else if(bt==='iron'){ if(ironActive){ ironRemaining--; document.getElementById('iron-count').textContent=ironRemaining; if(ironRemaining<=0){ ironActive=false; document.getElementById('iron-indicator').style.display='none'; } } inventory.ironBalls=Math.max(0,inventory.ironBalls-1); if(inventory.ironBalls<5 && ironActive){ ironActive=false; document.getElementById('iron-indicator').style.display='none'; showCardUsed('⚙️ انتهت الحديدية'); } }
    else if(bt==='normal') inventory.normalBalls=Math.max(0,inventory.normalBalls-1);
  }
  updateAllUI(); saveInventory(); playSound(bt==='fire'?'pour':(heavy?'pour':'pour'),0.12); return ball;
}
function startPour(){ 
  if(isPouring||gameWon) return; 
  if(!audioCtx) initAudio(); 
  isPouring=true; document.getElementById('pour-btn').classList.add('pouring'); 
  let interval=110;
  if(gunEffects.normal>0) interval=70;
  else if(gunEffects.fire>0) interval=85;
  else if(gunEffects.ice>0) interval=90;
  pourInterval=setInterval(()=>{
    createBall();
    if(gunEffects.normal>0 && Math.random()<0.35){ createBall('normal'); }
    if(gunEffects.fire>0 && Math.random()<0.15){ let fb=createBall('fire'); if(fb) Body.setVelocity(fb,{x:(Math.random()-0.5)*2, y:3}); }
    if(gunEffects.ice>0 && Math.random()<0.2){ let ib=createBall('ice'); if(ib) ib.circleRadius*=1.12; }
  },interval); 
  playSound('pour',0.1); 
}
function stopPour(){ isPouring=false; clearInterval(pourInterval); document.getElementById('pour-btn').classList.remove('pouring'); }
function resetLevel(){
  applyLevelDifficulty();
  bucketCounts=[0,0,0,0,0]; bucketVolumes=[0,0,0,0,0]; bucketFilled=[false,false,false,false,false]; gameWon=false;
  balls.forEach(b=>{ try{World.remove(world,b);}catch(e){} }); balls=[]; totalBalls=0;
  document.querySelectorAll('.bucket-ui').forEach(el=>el.classList.remove('filled','highlight'));
  document.getElementById('win-modal').style.display='none'; createObstaclesUltimate(); updateAllUI();
}
function nextLevel(){
  currentLevel++;
  resetLevel();
  const diff = getLevelDifficulty(currentLevel);
  const label = diff.tier>0 ? `مستوى ${currentLevel} 🔥 صعوبة ×${diff.tier+1}` : `مستوى ${currentLevel}`;
  showCardUsed(label);
  playSound('coin',0.2);
}
function activateHeavyIced(){
  if(inventory.iceBalls<5){ playSound('error',0.2); showCardUsed('❌ لا يوجد جليدية كافية (تحتاج 5)'); return; }
  if(heavyIcedActive){ heavyIcedActive=false; document.getElementById('heavy-indicator').style.display='none'; showCardUsed('🧊 إلغاء الجليدي'); playSound('deactivate',0.2); return; }
  heavyIcedActive=true; heavyIcedRemaining=10; fireActive=false; ironActive=false;
  document.getElementById('heavy-indicator').style.display='block'; document.getElementById('fire-indicator').style.display='none'; document.getElementById('iron-indicator').style.display='none';
  document.getElementById('heavy-count').textContent=heavyIcedRemaining;
  showCardUsed('🧊 تفعيل جليدي x10 - اضغط الايقونة مرة أخرى للإلغاء'); playSound('activate',0.25); updateAllUI();
}
function activateFire(){
  if(inventory.fireBalls<5){ playSound('error',0.2); showCardUsed('❌ لا يوجد نارية'); return; }
  if(fireActive){ fireActive=false; document.getElementById('fire-indicator').style.display='none'; showCardUsed('🔥 إلغاء الناري'); playSound('deactivate',0.2); return; }
  fireActive=true; fireRemaining=10; heavyIcedActive=false; ironActive=false;
  document.getElementById('fire-indicator').style.display='block'; document.getElementById('heavy-indicator').style.display='none'; document.getElementById('iron-indicator').style.display='none';
  document.getElementById('fire-count').textContent=fireRemaining;
  showCardUsed('🔥 تفعيل ناري x10'); playSound('activate',0.25); updateAllUI();
}
function activateIron(){
  if(inventory.ironBalls<5){ playSound('error',0.2); showCardUsed('❌ لا يوجد حديدية'); return; }
  if(ironActive){ ironActive=false; document.getElementById('iron-indicator').style.display='none'; showCardUsed('⚙️ إلغاء الحديدي'); playSound('deactivate',0.2); return; }
  ironActive=true; ironRemaining=10; heavyIcedActive=false; fireActive=false;
  document.getElementById('iron-indicator').style.display='block'; document.getElementById('heavy-indicator').style.display='none'; document.getElementById('fire-indicator').style.display='none';
  document.getElementById('iron-count').textContent=ironRemaining;
  showCardUsed('⚙️ تفعيل حديدي ثقيل x10'); playSound('activate',0.25); updateAllUI();
}
function randomizeBoard(){
  const cost = 100;
  const doRandomize = () => {
    if(inventory.coins >= cost) inventory.coins -= cost;
    createObstaclesUltimate(); saveInventory(); updateAllUI(); showCardUsed('🎲 لوحة جديدة!'); playSound('coin',0.2);
  };
  if(inventory.coins < cost){
    UIModal.confirm('رصيدك غير كافٍ (100 كوين). إعادة توزيع اللوحة مجانًا؟', doRandomize);
  } else {
    doRandomize();
  }
}
function openShop(){ document.getElementById('shop-modal').style.display='block'; updateAllUI(); playSound('click',0.15); }
function closeShop(){ document.getElementById('shop-modal').style.display='none'; }
function saveInventory(){ try{ localStorage.setItem('ice_island_v43', JSON.stringify({inventory, stars, currentLevel, maxBalls, lastStarMilestone, lastGiftMilestone, extraPredictAvailable, starBoosterUntil, gunEffects, dailyPrediction})); }catch(e){} }
function loadInventory(){ 
  try{ 
    let d=localStorage.getItem('ice_island_v43'); 
    if(!d) d=localStorage.getItem('ice_island_v44')||localStorage.getItem('ice_island_v41')||localStorage.getItem('ice_island_v4'); 
    if(d){ 
      let o=JSON.parse(d); 
      if(o.inventory){ inventory={...inventory, ...o.inventory}; if(!inventory.guns) inventory.guns={normal:0,fire:0,ice:0}; if(!inventory.guns.ice) inventory.guns.ice=0; } 
      stars=o.stars||0; currentLevel=o.currentLevel||1; maxBalls=o.maxBalls||200; 
      lastStarMilestone=o.lastStarMilestone||0; lastGiftMilestone=o.lastGiftMilestone||0; 
      if(o.gunEffects) gunEffects=o.gunEffects; 
      if(o.extraPredictAvailable) extraPredictAvailable=o.extraPredictAvailable;
      if(o.starBoosterUntil) starBoosterUntil=o.starBoosterUntil;
      if(o.dailyPrediction) dailyPrediction=o.dailyPrediction;
      inventory.stars=stars; 
    } 
  }catch(e){ console.log('load error',e); } 
}


// إصلاح صوت الشراء - تشغيل صوت القطار عند كل ضغطة زر شراء + توحيد صوت الكليك
document.addEventListener('click', (e)=>{
  if(e.target.classList.contains('shop-buy-btn') || e.target.closest('.shop-buy-btn')){
    try{
      const trainSound = document.getElementById('audio-purchase-train');
      if(trainSound){
        trainSound.currentTime=0; trainSound.volume=0.5; trainSound.loop=false;
        trainSound.play().catch(()=>{});
        setTimeout(()=>{ try{trainSound.pause();}catch(e){} }, 2500);
      }
      // صوت كليك واحد موحد
      playSound('click',0.12);
    }catch(e){}
  }
});

function buyItem(type){
  let cost=0, ok=false;
  switch(type){
    case 'normal_100': cost=100; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.normalBalls+=100; maxBalls+=100; ok=true; } break;
    case 'normal_250': cost=220; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.normalBalls+=250; maxBalls+=250; ok=true; } break;
    case 'ice_20': cost=250; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.iceBalls+=20; ok=true; } break;
    case 'ice_50': cost=550; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.iceBalls+=50; ok=true; } break;
    case 'fire_20': cost=300; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.fireBalls+=20; ok=true; } break;
    case 'fire_50': cost=650; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.fireBalls+=50; ok=true; } break;
    case 'iron_15': cost=350; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.ironBalls+=15; ok=true; } break;
    case 'iron_40': cost=800; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.ironBalls+=40; ok=true; } break;
    case 'mix_30': cost=900; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.normalBalls+=30; inventory.iceBalls+=30; inventory.fireBalls+=30; inventory.ironBalls+=30; maxBalls+=30; ok=true; } break;
    case 'gun_normal': cost=180; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.guns.normal++; gunEffects.normal+=5; ok=true; } break;
    case 'gun_fire': cost=280; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.guns.fire++; gunEffects.fire+=5; ok=true; } break;
    case 'gun_ice': cost=320; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.guns.ice++; gunEffects.ice+=5; ok=true; } break;
    case 'usd_099': case 'usd_499': case 'usd_999': case 'usd_1999': case 'usd_4999': case 'usd_9999':
      IAPManager.purchase(type); return false; // تُدار الآن بالكامل عبر IAPManager (راجع js/iap.js)
    case 'double': cost=200; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.cards.double++; ok=true; } break;
    case 'merge': cost=250; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.cards.merge++; ok=true; } break;
    case 'redo_card': cost=150; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.cards.redo++; ok=true; } break;
    case 'extra_ball': cost=300; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.cards.extra++; ok=true; } break;
    case 'music_pack': cost=400; if(inventory.coins>=cost){ inventory.coins-=cost; inventory.musicUnlocked=true; ok=true; } break;
  }
  if(ok){
    saveInventory(); updateAllUI();
    showCardUsed('✅ تم الشراء!');
  } else if(cost>0){
    showCardUsed('❌ كوين غير كافٍ');
  }
  return ok;
}



// نظام أصوات محسن من ألعاب مشابهة - بحث وكلاء فرعيين - توافق 100% مع الغاية
const newSounds = {
  predict: document.getElementById('audio-predict-new'),
  activate: document.getElementById('audio-activate-new'),
  pour: document.getElementById('audio-pour-new'),
  iron_break: document.getElementById('audio-iron-break-new'),
  purchase: document.getElementById('audio-purchase-success-new'),
  cozy: document.getElementById('audio-cozy-cafe-new')
};

function playNewSound(type){
  try{
    let el = null;
    switch(type){
      case 'predict': el = newSounds.predict; break;
      case 'activate': el = newSounds.activate; break;
      case 'pour': el = newSounds.pour; break;
      case 'iron_break': el = newSounds.iron_break; break;
      case 'purchase': el = newSounds.purchase; break;
      case 'cozy': el = newSounds.cozy; break;
    }
    if(el){
      el.currentTime=0;
      el.volume = type==='cozy' ? 0.28 : type==='predict' ? 0.65 : 0.55;
      if(type==='cozy') el.loop=true;
      el.play().catch(()=>{});
      if(type!=='cozy') setTimeout(()=>{ try{el.pause();}catch(e){} }, type==='predict'?1800: type==='activate'?1200 : 800);
      return true;
    }
  }catch(e){}
  return false;
}

// استبدال الأصوات القديمة بالجديدة مع الحفاظ على التوافق
const originalPlaySound = window.playSound;
window.playSound = function(type, vol){
  // أصوات تم تحسينها من ألعاب مشابهة
  if(type==='predict'){
    if(playNewSound('predict')) return;
  }
  if(type==='activate'){
    if(playNewSound('activate')) return;
  }
  if(type==='pour'){
    if(playNewSound('pour')) return;
  }
  if(type==='iron_break'){
    if(playNewSound('iron_break')) return;
  }
  // للأصوات الأخرى استخدم الأصلي مع تحسين
  try{ originalPlaySound(type, vol); }catch(e){}
};

// تحديث صوت القطار ليكون نجاح شراء بهيج متسارع
document.addEventListener('click', (e)=>{
  if(e.target.classList.contains('shop-buy-btn') || e.target.closest('.shop-buy-btn')){
    try{
      const el = document.getElementById('audio-purchase-success-new');
      if(el){
        el.currentTime=0; el.volume=0.6; el.play().catch(()=>{});
      } else {
        const old = document.getElementById('audio-purchase-train');
        if(old){ old.currentTime=0; old.volume=0.5; old.play().catch(()=>{}); setTimeout(()=>{try{old.pause();}catch(e){}},2500); }
      }
    }catch(e){}
  }
});

// تحديث موسيقى المقهى الدافئ - Bossa Nova محسنة
(function(){
  const oldCafe = document.getElementById('audio-bg-type2');
  const newCafe = document.getElementById('audio-cozy-cafe-new');
  if(oldCafe && newCafe){
    // استبدال المصدر بصوت أفضل - gentle piano ambient 114998 - أكثر دفئا من acoustic-breeze
    const mt = document.querySelector('#music-types-dropdown .music-type-btn[data-type="2"]');
    if(mt) mt.textContent = '☕ مقهى دافئ محسن - Gentle Piano 114998';
  }
})();

// صوت كليك جديد محمل من الإنترنت للقوائم المنسدلة - Pixabay UI Click 43196 - royalty free
(function(){
  const dropdownClickAudio = document.getElementById('audio-dropdown-click');
  function playDropdownClick(){
    try{
      if(!dropdownClickAudio) return;
      dropdownClickAudio.currentTime=0;
      dropdownClickAudio.volume=0.55;
      dropdownClickAudio.play().catch(()=>{});
    }catch(e){}
  }
  
  // عند الضغط على القوائم المنسدلة ومحتوياتها
  const dropdowns = ['balls-toggle','options-toggle','music-toggle','balls-dropdown','options-dropdown','music-types-dropdown'];
  dropdowns.forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('click', (e)=>{
        // لا تشغل إذا كان زر الشراء (له صوته الخاص)
        if(e.target.closest('.shop-buy-btn')) return;
        playDropdownClick();
      });
    }
  });
  
  // محتويات القوائم - الأزرار داخلها
  document.querySelectorAll('#balls-dropdown .inv-item, #options-dropdown .btn-ctrl, #music-types-dropdown .btn-ctrl').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      playDropdownClick();
    });
  });
  
  // اجعل playSound يدعم النوع الجديد dropdown
  window.playDropdownClick = playDropdownClick;
})();

// توحيد صوت الكليك لجميع الأزرار - صوت واحد فقط غير مزعج
(function(){
  const originalPlaySound = window.playSound;
  let lastClickTime = 0;
  window.playSound = function(type, vol){
    // إذا كليك متكرر بسرعة، تجاهل
    if(type==='click'){
      const now = Date.now();
      if(now - lastClickTime < 150) return;
      lastClickTime = now;
      vol = 0.10; // صوت واحد خفيف موحد
    }
    try{ originalPlaySound(type, vol); }catch(e){}
  };
})();


function claimFree(){
  let now=Date.now();
  if(now-inventory.lastFreeClaim>=12*60*60*1000){ inventory.normalBalls+=200; maxBalls+=200; inventory.lastFreeClaim=now; saveInventory(); updateAllUI(); showCardUsed('🎁 200 كرة مجانية!'); playSound('gift',0.3); }
  else showCardUsed('⏰ انتظر 12 ساعة');
}
function useCard(type){
  if(type==='redo'){ if(inventory.cards.redo<=0){ UIModal.alert('لا يوجد'); return; } inventory.cards.redo--; resetLevel(); saveInventory(); showCardUsed('🃏 Redo!'); updateAllUI(); playSound('card',0.2); return; }
  if(type==='extra'){ if(inventory.cards.extra<=0){ UIModal.alert('لا يوجد'); return; } inventory.cards.extra--; maxBalls+=20; inventory.normalBalls+=20; saveInventory(); updateAllUI(); showCardUsed('🃏 Extra +20'); playSound('card',0.2); return; }
  if(type==='double'||type==='merge'){
    if(inventory.cards[type]<=0){ UIModal.alert('لا يوجد '+type); return; }
    cardAction=type;
    document.getElementById('card-modal-title').textContent=type==='double'?'🃏 Double - اختر كأس للمضاعفة':'🃏 Merge - اختر كأسين للدمج';
    document.getElementById('card-modal-desc').textContent=type==='double'?'سيتم مضاعفة الكرات في هذا الكأس':'جمع كأسين في الأول';
    const sel=document.getElementById('bucket-select'); sel.innerHTML=''; selectedBuckets=[];
    for(let i=0;i<5;i++){ let b=document.createElement('button'); b.textContent=String.fromCharCode(65+i)+` (${bucketCounts[i].toFixed(1)})`; b.onclick=()=>toggleBucketSelect(i,b); sel.appendChild(b); }
    document.getElementById('card-modal').style.display='flex'; playSound('card',0.2);
  }
}
function toggleBucketSelect(idx,btn){
  if(cardAction==='double'){ selectedBuckets=[idx]; document.querySelectorAll('#bucket-select button').forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); }
  else { if(selectedBuckets.includes(idx)){ selectedBuckets=selectedBuckets.filter(v=>v!==idx); btn.classList.remove('selected'); } else { if(selectedBuckets.length>=2){ UIModal.alert('كأسين فقط'); return; } selectedBuckets.push(idx); btn.classList.add('selected'); } }
}
function confirmCard(){
  if(cardAction==='double'&&selectedBuckets.length===1){ let idx=selectedBuckets[0]; bucketCounts[idx]*=2; bucketVolumes[idx]*=2; inventory.cards.double--; showCardUsed(`🃏 Double! كأس ${String.fromCharCode(65+idx)} = ${bucketCounts[idx].toFixed(1)}`); }
  else if(cardAction==='merge'&&selectedBuckets.length===2){ let t=selectedBuckets[0], s=selectedBuckets[1]; bucketCounts[t]+=bucketCounts[s]; bucketVolumes[t]+=bucketVolumes[s]; bucketCounts[s]=0; bucketVolumes[s]=0; inventory.cards.merge--; showCardUsed(`🃏 Merge! ${String.fromCharCode(65+s)}→${String.fromCharCode(65+t)}`); }
  else { UIModal.alert('اختيار خاطئ'); return; }
  document.getElementById('card-modal').style.display='none'; saveInventory(); updateCountsUI(); checkWinCondition(selectedBuckets[0]); playSound('card',0.25);
}
function showCardUsed(txt){ let el=document.getElementById('card-used'); el.textContent=txt; el.style.display='block'; setTimeout(()=>el.style.display='none',3000); }
function startFreeTimer(){
  setInterval(()=>{
    let now=Date.now(), rem=12*60*60*1000 - (now-inventory.lastFreeClaim); let str='جاهز!';
    if(rem>0){ let h=Math.floor(rem/3600000), m=Math.floor((rem%3600000)/60000); str=`${h}h ${m}m`; }
    let el=document.getElementById('free-timer'); if(el) el.textContent=str;
  },1000);
}
function fireGun(){
  let tot=inventory.guns.normal+inventory.guns.fire+inventory.guns.ice;
  if(tot<=0){ playSound('error',0.2); UIModal.alert('لا يوجد بنادق'); return; }
  let type='normal';
  if(inventory.guns.ice>0) { type='ice'; inventory.guns.ice--; gunEffects.ice=Math.max(0,gunEffects.ice-1); }
  else if(inventory.guns.fire>0) { type='fire'; inventory.guns.fire--; gunEffects.fire=Math.max(0,gunEffects.fire-1); }
  else { inventory.guns.normal--; gunEffects.normal=Math.max(0,gunEffects.normal-1); }
  let cnt=5;
  let inter=setInterval(()=>{
    if(cnt<=0){ clearInterval(inter); return; }
    let x=pourX*(width*0.65)+width*0.175;
    let rad=type==='ice'?7: (type==='fire'?7:6);
    let dens=type==='ice'?0.0032: (type==='fire'?0.004:0.006);
    let ball=Bodies.circle(x,62, rad, {restitution:0.3, friction:0.02, frictionAir:0.001, density:dens, label:(type==='ice'?'ice':type==='fire'?'fire':'iron')+'_ball'});
    ball.ballType=type==='ice'?'ice':type==='fire'?'fire':'iron'; ball.isRemoved=false; ball.counted=false; ball.bucketIndex=null;
    Body.setVelocity(ball,{x:(Math.random()-0.5)*0.3, y:6+Math.random()*2});
    World.add(world,ball); balls.push(ball); totalBalls++;
    cnt--;
  },80);
  playSound('gun',0.35); saveInventory(); updateAllUI(); showCardUsed(type==='ice'?'🧊 بندقية جليدية!':type==='fire'?'🔥 بندقية نارية!':'🔫 بندقية!');
}

// أحداث
document.getElementById('left-btn').addEventListener('touchstart', e=>{ e.preventDefault(); if(!audioCtx) initAudio(); pourX=Math.max(0,pourX-0.07); updatePourIndicator(); playSound('click',0.08); });
document.getElementById('left-btn').addEventListener('mousedown', ()=>{ if(!audioCtx) initAudio(); pourX=Math.max(0,pourX-0.07); updatePourIndicator(); });
document.getElementById('right-btn').addEventListener('touchstart', e=>{ e.preventDefault(); if(!audioCtx) initAudio(); pourX=Math.min(1,pourX+0.07); updatePourIndicator(); playSound('click',0.08); });
document.getElementById('right-btn').addEventListener('mousedown', ()=>{ if(!audioCtx) initAudio(); pourX=Math.min(1,pourX+0.07); updatePourIndicator(); });
document.getElementById('pour-btn').addEventListener('touchstart', e=>{ e.preventDefault(); startPour(); });
document.getElementById('pour-btn').addEventListener('mousedown', startPour);
document.getElementById('pour-btn').addEventListener('touchend', e=>{ e.preventDefault(); stopPour(); });
document.getElementById('pour-btn').addEventListener('mouseup', stopPour);
document.getElementById('pour-btn').addEventListener('mouseleave', stopPour);
document.getElementById('redo-btn').onclick=()=>{ if(!audioCtx) initAudio(); if(inventory.cards.redo>0) useCard('redo'); else resetLevel(); playSound('click',0.15); };
document.getElementById('predict-btn').onclick=()=>{ if(!audioCtx) initAudio(); openPredictModal(); };
document.getElementById('board-btn').onclick=()=>{ if(!audioCtx) initAudio(); randomizeBoard(); };
document.getElementById('shop-btn').onclick=()=>{ if(!audioCtx) initAudio(); openShop(); };
document.getElementById('close-shop').onclick=closeShop;
document.getElementById('claim-free').onclick=claimFree;
document.getElementById('next-level').onclick=nextLevel;
document.getElementById('open-gift').onclick=()=>{
  document.getElementById('gift-box').style.display='none';
  let r=Math.random();
  if(r<0.3){ inventory.iceBalls+=30; inventory.fireBalls+=15; }
  else if(r<0.6){ inventory.cards.double+=2; inventory.cards.merge+=1; }
  else { inventory.normalBalls+=80; maxBalls+=80; }
  saveInventory(); updateAllUI(); showCardUsed('تم فتح الصندوق! 🎁'); playSound('gift',0.3);
};
document.getElementById('gun-btn').onclick=fireGun;
document.getElementById('card-confirm').onclick=confirmCard;
document.getElementById('card-cancel').onclick=()=>{ document.getElementById('card-modal').style.display='none'; };
document.getElementById('predict-confirm').onclick=confirmPredict;
document.getElementById('predict-cancel').onclick=()=>{ document.getElementById('predict-modal').style.display='none'; };
document.getElementById('sound-toggle').onclick=e=>{ if(!audioCtx) initAudio(); soundEnabled=!soundEnabled; e.target.textContent=soundEnabled?'🔊':'🔇'; showCardUsed(soundEnabled?'الصوت مفعل 🔊':'الصوت مكتوم'); playSound('click',0.15); };
document.getElementById('music-toggle').onclick=e=>{
  if(!audioCtx) initAudio();
  musicEnabled=!musicEnabled;
  e.target.textContent=musicEnabled?'🎵':'🔇';
  if(musicEnabled){ if(inventory.musicUnlocked) playBackgroundMusic(); else { inventory.musicUnlocked=true; playBackgroundMusic(); showCardUsed('🎵 موسيقى مفعلة - لحن جليدي'); } }
  else stopBackgroundMusic();
  showCardUsed(musicEnabled?'الموسيقى مفعلة 🎵':'الموسيقى مكتومة'); playSound('click',0.15);
};
document.getElementById('stats-btn').onclick=()=>{ if(!audioCtx) initAudio(); updateUserStatsModal(); document.getElementById('user-stats-modal').style.display='block'; playSound('click',0.15); };
document.getElementById('close-stats').onclick=()=>{ document.getElementById('user-stats-modal').style.display='none'; };
// تفعيل عبر الايقونات - النقطة 4
document.getElementById('inv-ice').onclick=()=>{ if(!audioCtx) initAudio(); activateHeavyIced(); };
document.getElementById('inv-fire').onclick=()=>{ if(!audioCtx) initAudio(); activateFire(); };
document.getElementById('inv-iron').onclick=()=>{ if(!audioCtx) initAudio(); activateIron(); };

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.shop-section').forEach(s=>s.classList.remove('active'));
    btn.classList.add('active'); document.getElementById('shop-'+btn.dataset.tab).classList.add('active'); playSound('click',0.1);
  };
});
document.querySelectorAll('.shop-buy-btn[data-buy]').forEach(btn=>{ btn.onclick=()=>{ if(!audioCtx) initAudio(); buyItem(btn.dataset.buy); }; });
window.addEventListener('resize', ()=>{
  let cont=document.getElementById('game-container');
  let nw=cont.clientWidth, nh=cont.clientHeight;
  if(Math.abs(nw-width)>20||Math.abs(nh-height)>20){ width=nw; height=nh; renderCanvas.width=width; renderCanvas.height=height; createBuckets(); createBucketsUI(); updatePourIndicator(); }
});
document.addEventListener('touchmove', e=>{ if(e.target.closest('#game-container') && !e.target.closest('#options-dropdown') && !e.target.closest('#balls-dropdown') && !e.target.closest('#inventory-icons')) e.preventDefault(); }, {passive:false});
function updateUserStatsModal(){
  document.getElementById('st-balls-detail').innerHTML=`عادية: ${inventory.normalBalls}<br>جليدية: ${inventory.iceBalls} (تنقسم)<br>نارية: ${inventory.fireBalls}<br>حديدية: ${inventory.ironBalls} (10.5px ثقيلة)<br>المتبقي: ${getTotalRemaining()}/${maxBalls}<br>مسكوبة: ${totalBalls} | نشطة: ${balls.filter(b=>!b.counted&&!b.isRemoved).length}`;
  document.getElementById('st-econ-detail').innerHTML=`كوين: ${inventory.coins}<br>نجوم: ${inventory.stars}<br>مستوى: ${currentLevel}<br><br>نظام النقاط الجديد:<br>وسط C (40 كرة) → 70⭐<br>B,D (50) →65⭐<br>A,E (60) →60⭐<br><br>توقع يومي: ${dailyPrediction.date===getTodayStr() ? 'توقعت '+String.fromCharCode(65+dailyPrediction.idx) : 'لم تتوقع'}<br>توقع إضافي: ${extraPredictAvailable}<br>مضاعف: ${starBoosterUntil>Date.now()? Math.ceil((starBoosterUntil-Date.now())/60000)+'د متبقي' : 'غير نشط'}`;
  document.getElementById('st-cards-detail').innerHTML=`Double: ${inventory.cards.double}<br>Merge: ${inventory.cards.merge}<br>Redo: ${inventory.cards.redo}<br>Extra: ${inventory.cards.extra}<br><br>بنادق:<br>عادية: ${inventory.guns.normal}<br>نارية: ${inventory.guns.fire}<br>جليدية: ${inventory.guns.ice}`;
  let bHtml=''; for(let i=0;i<5;i++){ let name=String.fromCharCode(65+i); bHtml+=`${name}: ${bucketCounts[i].toFixed(1)}/${bucketNeeds[i]} → ${bucketPoints[i]}⭐<br>`; } document.getElementById('st-buckets-detail').innerHTML=bHtml + `<br>موسيقى: ${inventory.musicUnlocked?'مفتوحة':'مقفلة (200🪙)'}<br>صوت: ${soundEnabled?'مفعل':'مكتوم'}<br>موسيقى: ${musicEnabled?'مفعلة':'مكتومة'}`;
}

// ===== منطق القوائم المنسدلة الجديدة - نقل مكاني فقط =====
(function(){
  const ballsToggle = document.getElementById('balls-toggle');
  const ballsDropdown = document.getElementById('balls-dropdown');
  const optionsToggle = document.getElementById('options-toggle');
  const optionsDropdown = document.getElementById('options-dropdown');
  
  function closeAll(){
    if(ballsDropdown) ballsDropdown.classList.remove('open');
    if(optionsDropdown) optionsDropdown.classList.remove('open');
    if(ballsToggle) ballsToggle.textContent = '🎱 الكرات ▼';
    if(optionsToggle) optionsToggle.textContent = '☰ الخيارات ▼';
  }
  
  if(ballsToggle && ballsDropdown){
    ballsToggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isOpen = ballsDropdown.classList.contains('open');
      closeAll();
      if(!isOpen){
        ballsDropdown.classList.add('open');
        ballsToggle.textContent = '🎱 الكرات ▲';
        if(typeof initAudio === 'function'){ if(!audioCtx) initAudio(); playSound('click',0.1); }
      }
    });
  }
  
  if(optionsToggle && optionsDropdown){
    optionsToggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isOpen = optionsDropdown.classList.contains('open');
      closeAll();
      if(!isOpen){
        optionsDropdown.classList.add('open');
        optionsToggle.textContent = '☰ الخيارات ▲';
        if(typeof initAudio === 'function'){ if(!audioCtx) initAudio(); playSound('click',0.1); }
      }
    });
  }
  
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('#balls-menu-wrapper') && !e.target.closest('#options-menu-wrapper')){
      closeAll();
    }
  });
  
  // عند استخدام أي زر داخل القائمة، لا تغلق تلقائيا لزر الصوت/الموسيقى
  // لكن اغلق بعد اختيار إجراء مثل إعادة أو لوحة
  ['redo-btn','board-btn','shop-btn','stats-btn','gun-btn'].forEach(id=>{
    const el = document.getElementById(id);
    if(el){
      el.addEventListener('click', ()=>{ setTimeout(closeAll, 300); });
    }
  });
})();


// إصلاح سكرول قائمة الخيارات - السماح بالسحب داخل القائمة
(function(){
  const fixScroll = (id)=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('touchstart', (e)=>{ e.stopPropagation(); }, {passive:true});
    el.addEventListener('touchmove', (e)=>{ e.stopPropagation(); }, {passive:true});
    el.addEventListener('touchend', (e)=>{ e.stopPropagation(); }, {passive:true});
  };
  fixScroll('options-dropdown');
  fixScroll('balls-dropdown');
  fixScroll('inventory-icons');
})();


// زر العودة للشاشة الرئيسية
(function(){
  const homeBtn = document.getElementById('home-btn');
  if(homeBtn){
    homeBtn.addEventListener('click', ()=>{
      if(!audioCtx && typeof initAudio === 'function') initAudio();
      if(typeof playSound === 'function') playSound('click',0.15);
      // إغلاق كل المودالات والقوائم
      document.querySelectorAll('#shop-modal, #card-modal, #win-modal, #gift-box, #predict-modal, #user-stats-modal').forEach(m=>{ m.style.display='none'; });
      document.querySelectorAll('#balls-dropdown, #options-dropdown').forEach(d=>{ d.classList.remove('open'); });
      // العودة للبداية - إعادة تحميل كامل للشاشة الرئيسية
      if(typeof resetLevel === 'function'){
        try{ resetLevel(); }catch(e){}
      }
      setTimeout(()=>{ location.reload(); }, 150);
    });
  }
})();


// تأكيد تفعيل السكرول داخل قائمة الخيارات
(function(){
  const od = document.getElementById('options-dropdown');
  if(od){
    od.style.overflowY='scroll';
    od.addEventListener('touchstart', e=>{ e.stopImmediatePropagation(); }, {passive:false, capture:true});
    od.addEventListener('touchmove', e=>{ e.stopImmediatePropagation(); }, {passive:false, capture:true});
    // منع إغلاق القائمة عند السحب داخلها
    od.addEventListener('click', e=>{ e.stopPropagation(); });
  }
})();


// حل سكرول قائمة الخيارات - معالجة يدوية
(function(){
  const od = document.getElementById('options-dropdown');
  if(!od) return;
  let startY = 0;
  let startScrollTop = 0;
  od.addEventListener('touchstart', function(e){
    startY = e.touches[0].clientY;
    startScrollTop = od.scrollTop;
    e.stopPropagation();
  }, {passive:true});
  od.addEventListener('touchmove', function(e){
    const deltaY = e.touches[0].clientY - startY;
    // إذا القائمة قابلة للتمرير، اسمح بالتمرير الداخلي
    if(od.scrollHeight > od.clientHeight){
      e.stopPropagation();
      e.stopImmediatePropagation();
      // لا نمنع الافتراضي هنا حتى يعمل السكرول الطبيعي
    }
  }, {passive:true});
})();


// نظام أنواع الموسيقى المتنوعة - 3 أنواع + كتم

// نظام أنواع الموسيقى المتنوعة - 3 أنواع أصلية 100% بدون حقوق - مستوحاة من أشهر الألعاب اللوحية
// بحث عبر وكلاء فرعيين:
// - Catan, Carcassonne = folk قروسطي هادئ
// - Ticket to Ride = jazz ragtime قطارات
// - Azul, Wingspan, Everdell, Cascadia = cozy ambient cinematic
// جميع المقطوعات مولدة برمجياً عبر Web Audio API - تأليف أصلي - لا يوجد أي استخدام لموسيقى محمية
let currentMusicType = parseInt(localStorage.getItem('iceMusicType')||'1');
let musicNameMap = {
  1: {name:'قرية جليدية ❄️', game:'مستوحى من Catan و Carcassonne', desc:'Folk قروسطي هادئ - lute acoustic'},
  2: {name:'قطار سريع 🔥', game:'مستوحى من Ticket to Ride', desc:'Ragtime Jazz - عصر القطارات الذهبي'},
  3: {name:'غابة حالمة 🌌', game:'مستوحى من Wingspan و Azul و Everdell', desc:'Cozy Lofi Ambient - cinematic'}
};

function playMusicByType(type){
  currentMusicType = type;
  localStorage.setItem('iceMusicType', type);
  try{
    if(musicInterval) clearInterval(musicInterval);
    if(mp3Sounds.bg){ mp3Sounds.bg.pause(); mp3Sounds.bg.currentTime=0; }
  }catch(e){}
  if(!musicEnabled || !audioCtx) return;
  let notes, pattern, intervalMs, oscType, baseVol, detune;
  if(type===1){ 
    // النوع 1: قرية جليدية - Catan/Carcassonne - folk هادئ - 70 BPM
    // مستوحى من Thatched Villagers - Kevin MacLeod CC0 - لكن تأليف أصلي جديد
    notes=[261.63, 293.66, 329.63, 349.23, 392.00, 415.30, 440.00, 493.88, 523.25];
    pattern=[0,2,4,7,4,2,0,3, 5,3,2,0,2,4,5,7, 8,7,5,4,2,0,1,3, 0,0,4,4,7,7,8,5];
    intervalMs=550; oscType='sine'; baseVol=0.05; detune=0;
  } else if(type===2){
    // النوع 2: قطار سريع - Ticket to Ride - Ragtime Jazz - 120 BPM حماسي
    // مستوحى من Pixelland - 8bit Dixieland - لكن تأليف أصلي
    notes=[329.63, 369.99, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99, 880.00];
    pattern=[0,2,4,7,9,7,4,2, 1,3,5,8,10,8,5,3, 0,4,7,4,2,5,9,5, 2,6,8,10,8,6,4,2];
    intervalMs=320; oscType='triangle'; baseVol=0.055; detune=2;
  } else {
    // النوع 3: غابة حالمة - Azul/Wingspan/Everdell - Cozy Lofi Ambient 2025-2026 ترند
    // مستوحى من Cozy Games economy - 973M$ - Lo-fi chillhop - لكن تأليف أصلي
    notes=[220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88];
    pattern=[0,4,2,6,3,8,1,5, 4,2,6,0,7,3,5,1, 0,3,6,2,8,4,7,1];
    intervalMs=750; oscType='sine'; baseVol=0.04; detune=0;
  }
  let idx=0;
  musicInterval=setInterval(()=>{
    if(!musicEnabled||!audioCtx) return;
    try{
      const osc=audioCtx.createOscillator(), gain=audioCtx.createGain(), filter=audioCtx.createBiquadFilter();
      osc.connect(filter); filter.connect(gain); gain.connect(masterGain);
      osc.type=oscType; 
      osc.frequency.value=notes[pattern[idx%pattern.length]]*0.5;
      if(detune) osc.detune.value = (Math.random()-0.5)*detune;
      filter.type='lowpass'; filter.frequency.value=type===2?1800:1200;
      gain.gain.setValueAtTime(baseVol, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+(type===2?0.8:1.6));
      osc.start(); osc.stop(audioCtx.currentTime+(type===2?0.8:1.6)); idx++;
      // إضافة باس خفيف للنوع 2
      if(type===2 && idx%4===0){
        const bassOsc=audioCtx.createOscillator(), bassGain=audioCtx.createGain();
        bassOsc.connect(bassGain); bassGain.connect(masterGain);
        bassOsc.type='sine'; bassOsc.frequency.value=notes[pattern[(idx-1)%pattern.length]]*0.25;
        bassGain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        bassGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.6);
        bassOsc.start(); bassOsc.stop(audioCtx.currentTime+0.6);
      }
    }catch(e){}
  }, intervalMs);
}



// إصلاح شامل لنظام الموسيقى - تحميل وتشغيل فعلي
(function(){
  const mt = document.getElementById('music-toggle');
  const musicTypesDrop = document.getElementById('music-types-dropdown');
  const muteBtn = document.getElementById('music-mute-btn');
  if(!mt || !musicTypesDrop) return;
  
  // تنظيف شامل
  function stopAllMusic(){
    try{
      if(musicInterval){ clearInterval(musicInterval); musicInterval=null; }
      Object.values(mp3Sounds).forEach(a=>{ if(a && a.tagName==='AUDIO'){ try{a.pause(); a.currentTime=0;}catch(e){} }});
      ['audio-bg','audio-bg-type1','audio-bg-type2','audio-bg-type3'].forEach(id=>{
        const el=document.getElementById(id); if(el){ try{el.pause(); el.currentTime=0;}catch(e){} }
      });
    }catch(e){}
  }
  function ensureAudioReady(){
    if(!audioCtx) initAudio();
    if(audioCtx && audioCtx.state==='suspended'){ audioCtx.resume().catch(()=>{}); }
  }
  function playMusicByTypeFixed(type){
    ensureAudioReady();
    currentMusicType = type;
    localStorage.setItem('iceMusicType', type);
    stopAllMusic();
    if(!musicEnabled) return;
    let audioId = type===1?'audio-bg-type1': type===2?'audio-bg-type2':'audio-bg-type3';
    let audioEl = document.getElementById(audioId);
    if(audioEl){
      audioEl.volume=0.32; audioEl.loop=true; audioEl.currentTime=0;
      audioEl.play().then(()=>{ console.log('Playing '+audioId); }).catch(e=>{
        console.log('MP3 play failed, fallback', e);
        playProceduralFallbackFixed(type);
      });
    } else {
      playProceduralFallbackFixed(type);
    }
  }
  function playProceduralFallbackFixed(type){
    ensureAudioReady();
    if(!audioCtx || !masterGain) return;
    let notes, pattern, intervalMs, oscType, baseVol;
    if(type===1){ notes=[261.63,329.63,392,523.25]; pattern=[0,1,2,3,2,1,0,2]; intervalMs=500; oscType='sine'; baseVol=0.06; }
    else if(type===2){ notes=[329.63,440,523.25,659.25,880]; pattern=[0,2,4,2,1,3,0,2]; intervalMs=320; oscType='triangle'; baseVol=0.07; }
    else { notes=[220,293.66,349.23,440,523.25]; pattern=[0,2,1,3,2,4,0,1]; intervalMs=700; oscType='sine'; baseVol=0.05; }
    let idx=0;
    musicInterval=setInterval(()=>{
      if(!musicEnabled||!audioCtx) return;
      try{
        const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
        osc.connect(gain); gain.connect(masterGain);
        osc.type=oscType; osc.frequency.value=notes[pattern[idx%pattern.length]];
        gain.gain.setValueAtTime(baseVol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+1.2);
        osc.start(); osc.stop(audioCtx.currentTime+1.2); idx++;
      }catch(e){}
    }, intervalMs);
  }
  window.playMusicByType = playMusicByTypeFixed;
  window.playProceduralFallback = playProceduralFallbackFixed;
  window.stopAllMusic = stopAllMusic;
  window.playBackgroundMusic = function(){ if(musicEnabled) playMusicByTypeFixed(currentMusicType); };
  window.stopBackgroundMusic = stopAllMusic;

  const newMt = mt.cloneNode(true);
  mt.parentNode.replaceChild(newMt, mt);
  const mt2 = document.getElementById('music-toggle');
  mt2.onclick = (e)=>{
    e.stopPropagation();
    ensureAudioReady();
    const isOpen = musicTypesDrop.classList.contains('open');
    document.querySelectorAll('#balls-dropdown, #options-dropdown').forEach(d=>d.classList.remove('open'));
    if(!isOpen){
      musicTypesDrop.classList.add('open');
      musicTypesDrop.querySelectorAll('.music-type-btn').forEach(btn=>{
        btn.classList.toggle('active', parseInt(btn.dataset.type)===currentMusicType && musicEnabled);
      });
    } else {
      musicTypesDrop.classList.remove('open');
    }
  };
  musicTypesDrop.querySelectorAll('.music-type-btn').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      ensureAudioReady();
      const type = parseInt(btn.dataset.type);
      musicEnabled = true;
      document.getElementById('music-toggle').textContent='🎵';
      playMusicByTypeFixed(type);
      inventory.musicUnlocked = true;
      musicTypesDrop.querySelectorAll('.music-type-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const names = {1:'قرية جليدية ❄️',2:'قطار سريع 🔥',3:'غابة حالمة 🌌'};
      showCardUsed('🎵 '+names[type]+' يعمل الآن');
      setTimeout(()=>{ musicTypesDrop.classList.remove('open'); }, 500);
    };
  });
  muteBtn.onclick = (e)=>{
    e.stopPropagation();
    musicEnabled = false;
    stopAllMusic();
    document.getElementById('music-toggle').textContent='🔇';
    musicTypesDrop.querySelectorAll('.music-type-btn').forEach(b=>b.classList.remove('active'));
    showCardUsed('🔇 الموسيقى مكتومة');
    setTimeout(()=>{ musicTypesDrop.classList.remove('open'); }, 300);
  };
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('#music-types-dropdown') && !e.target.closest('#music-toggle')){
      musicTypesDrop.classList.remove('open');
    }
  });
})();


window.onload=init;
