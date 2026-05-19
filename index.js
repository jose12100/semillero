
const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Configuración
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const paddle = {w:10, h:90, speed:6};
  const ballRadius = 8;
  let left = {x:20, y:(HEIGHT-90)/2, vy:0, score:0};
  let right = {x:WIDTH-20-10, y:(HEIGHT-90)/2, vy:0, score:0};
  let ball = {x:WIDTH/2, y:HEIGHT/2, vx:5, vy:3, r:ballRadius};
  let paused = false; let playing = true;
  let modeAI = false;
  let aiDifficulty = parseFloat(document.getElementById('aiRange').value);

  // DOM
  const scoreA = document.getElementById('scoreA');
  const scoreB = document.getElementById('scoreB');
  const modeLabel = document.getElementById('modeLabel');
  const toggleAI = document.getElementById('toggleAI');
  const toggleSoundBtn = document.getElementById('toggleSound');
  const aiRange = document.getElementById('aiRange');

  // WebAudio Setup
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = AudioContext ? new AudioContext() : null;
  let soundEnabled = true;
  let ambientGainNode = null;
  let ambientInterval = null;

  // Ensure audio starts only after user interaction (required by many browsers)
  function enableAudioOnInteraction() {
    if(!audioCtx) return;
    if(audioCtx.state === 'suspended') {
      const resume = () => {
        audioCtx.resume().then(() => {
          startAmbient();
        }).catch(()=>{});
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
      };
      window.addEventListener('pointerdown', resume);
      window.addEventListener('keydown', resume);
    } else {
      startAmbient();
    }
  }

  // Basic tone generator helper
  function playTone({freq=440, duration=0.08, type='sine', gain=0.05, when=0}) {
    if(!audioCtx || !soundEnabled) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime + when;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    o.start(now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.stop(now + duration + 0.02);
  }

  // Sonidos específicos
  function soundWall(){ playTone({freq:1200, duration:0.03, type:'sine', gain:0.03}); }
  function soundPaddle(){ 
    // pequeño arpegio para impacto
    playTone({freq:700, duration:0.04, type:'square', gain:0.045});
    playTone({freq:900, duration:0.03, type:'sawtooth', gain:0.02, when:0.03});
  }
  function soundScore(){
    // bajo golpe y nota alta
    playTone({freq:200, duration:0.18, type:'triangle', gain:0.05});
    playTone({freq:900, duration:0.22, type:'sine', gain:0.035, when:0.06});
  }

  // Ambient / música sencilla (bucle suave). Crea un bajo y una secuencia de notas periódica.
  function startAmbient(){
    if(!audioCtx || ambientInterval) return;
    ambientGainNode = audioCtx.createGain();
    ambientGainNode.gain.value = 0.03;
    ambientGainNode.connect(audioCtx.destination);

    // Small repeating ambient pattern (creates short tones every 350ms)
    const notes = [110,138.59,164.81,207.65]; // notas de una progresión
    let idx = 0;
    ambientInterval = setInterval(()=>{
      if(!soundEnabled) return;
      const freq = notes[idx % notes.length];
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = audioCtx.createGain();
      g.gain.value = 0.0001;
      o.connect(g); g.connect(ambientGainNode);
      const now = audioCtx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.04, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      o.start(now);
      o.stop(now + 0.3);
      idx++;
    }, 360);
  }

  function stopAmbient(){
    if(ambientInterval){ clearInterval(ambientInterval); ambientInterval = null; }
    if(ambientGainNode){ ambientGainNode.disconnect(); ambientGainNode = null; }
  }

  // Initialize audio context and ambient on first click/key
  if(audioCtx) enableAudioOnInteraction();

  // keyboard
  const keys = {};
  window.addEventListener('keydown', e=>{
    keys[e.key.toLowerCase()] = true;
    if(e.key === 'p' || e.key === 'P') { paused = !paused; }
    if(e.key === 'r' || e.key === 'R') { resetGame(); }
    if(e.key === 'd' || e.key === 'D') { toggleAImode(); }
    // resume audio on any key (some browsers)
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().then(startAmbient).catch(()=>{});
  });
  window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });

  function resetBall(direction){
    ball.x = WIDTH/2; ball.y = HEIGHT/2;
    const speed = 5 + Math.random() * 1.2;
    const angle = (Math.random() * Math.PI/3) - Math.PI/6;
    ball.vx = (direction || (Math.random()<0.5?1:-1)) * speed * Math.cos(angle);
    ball.vy = speed * Math.sin(angle);
  }

  function resetGame(){
    left.score = 0; right.score = 0; updateScores();
    resetBall((Math.random()<0.5?1:-1));
    paused = false; playing = true;
    if(soundEnabled) playTone({freq:330, duration:0.08, type:'square', gain:0.05});
  }

  function updateScores(){ scoreA.textContent = left.score; scoreB.textContent = right.score; }

  // IA simple
  function aiMove(){
    const predicted = ball.y;
    const center = right.y + paddle.h/2;
    const diff = predicted - center;
    right.vy = diff * aiDifficulty;
    right.y += right.vy;
    right.y = Math.max(0, Math.min(HEIGHT - paddle.h, right.y));
  }

  function clampPaddles(){
    left.y = Math.max(0, Math.min(HEIGHT - paddle.h, left.y));
    right.y = Math.max(0, Math.min(HEIGHT - paddle.h, right.y));
  }

  function update(){
    if(paused || !playing) return;

    // Controls left (W/S)
    if(keys['w']) left.y -= paddle.speed;
    if(keys['s']) left.y += paddle.speed;

    // Controls right or AI
    if(!modeAI){
      if(keys['arrowup']) right.y -= paddle.speed;
      if(keys['arrowdown']) right.y += paddle.speed;
    } else {
      aiMove();
    }

    clampPaddles();

    // Move ball
    ball.x += ball.vx; ball.y += ball.vy;

    // Top / bottom collision
    if(ball.y - ball.r < 0){ ball.y = ball.r; ball.vy *= -1; if(soundEnabled) soundWall(); }
    if(ball.y + ball.r > HEIGHT){ ball.y = HEIGHT - ball.r; ball.vy *= -1; if(soundEnabled) soundWall(); }

    // Left paddle collision
    if(ball.x - ball.r < left.x + paddle.w){
      if(ball.y > left.y && ball.y < left.y + paddle.h){
        ball.x = left.x + paddle.w + ball.r;
        ball.vx *= -1.06;
        const hitPos = (ball.y - (left.y + paddle.h/2)) / (paddle.h/2);
        ball.vy += hitPos * 3;
        if(soundEnabled) soundPaddle();
      }
    }

    // Right paddle collision
    if(ball.x + ball.r > right.x){
      if(ball.y > right.y && ball.y < right.y + paddle.h){
        ball.x = right.x - ball.r;
        ball.vx *= -1.06;
        const hitPos = (ball.y - (right.y + paddle.h/2)) / (paddle.h/2);
        ball.vy += hitPos * 3;
        if(soundEnabled) soundPaddle();
      }
    }

    // Score conditions
    if(ball.x + ball.r < 0){
      right.score += 1; updateScores(); if(soundEnabled) soundScore(); resetBall(1);
    }
    if(ball.x - ball.r > WIDTH){
      left.score += 1; updateScores(); if(soundEnabled) soundScore(); resetBall(-1);
    }

    // Win
    const WIN = 11;
    if(left.score >= WIN || right.score >= WIN){
      playing = false; paused = true;
      if(soundEnabled) playTone({freq:1200, duration:0.4, type:'square', gain:0.06});
    }
  }

  // Drawing
  function drawNet(){
    const gap = 18; const lineH = 12; const x = WIDTH/2 -1;
    ctx.fillStyle = 'rgba(55, 110, 45, 0.06)';
    for(let y=0;y<HEIGHT;y+=gap){ ctx.fillRect(x, y, 2, lineH); }
  }

  function draw(){
    ctx.clearRect(0,0,WIDTH,HEIGHT);

    // background gradient
    const g = ctx.createLinearGradient(0,0,0,HEIGHT);
    g.addColorStop(0,'rgba(9,12,25,0.6)'); g.addColorStop(1,'rgba(2,6,12,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0,0,WIDTH,HEIGHT);

    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
    for(let i=0;i<WIDTH;i+=24){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,HEIGHT); ctx.stroke(); }

    drawNet();

    // paddles
    ctx.fillStyle = '#8ff07e';
    roundRect(ctx, left.x, left.y, paddle.w, paddle.h, 6, true);
    roundRect(ctx, right.x, right.y, paddle.w, paddle.h, 6, true);

    // ball
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();

    // score center
    ctx.fillStyle = 'rgba(160, 153, 153, 0.12)'; ctx.font = '18px monospace'; ctx.textAlign='center';
    ctx.fillText(left.score + ' — ' + right.score, WIDTH/2, 28);

    // pause / end overlay
    if(paused){
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(WIDTH/2 - 220, HEIGHT/2 - 40, 440, 80);
      ctx.fillStyle = '#3bffce'; ctx.font = '20px Arial'; ctx.textAlign='center';
      if(!playing){
        const winner = left.score>right.score ? 'Jugador A gana!' : 'Jugador B gana!';
        ctx.fillText(winner + ' Presiona R para reiniciar', WIDTH/2, HEIGHT/2 + 8);
      } else {
        ctx.fillText('PAUSA - Presiona P para continuar', WIDTH/2, HEIGHT/2 + 8);
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r, fill){
    ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath(); if(fill) ctx.fill(); else ctx.stroke();
  }

  function loop(){ update(); draw(); requestAnimationFrame(loop); }

  // Mobile touch: tocar lado izquierdo/derecho para mover la paleta
  canvas.addEventListener('touchstart', e=>{
    const t = e.touches[0]; const rect = canvas.getBoundingClientRect();
    const x = t.clientX - rect.left; const y = t.clientY - rect.top;
    if(x < WIDTH/2) left.y = Math.max(0, Math.min(HEIGHT - paddle.h, y - paddle.h/2));
    else right.y = Math.max(0, Math.min(HEIGHT - paddle.h, y - paddle.h/2));
    // resume audio if needed
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().then(startAmbient).catch(()=>{});
  }, {passive:false});

  // Buttons and UI
  toggleAI.addEventListener('click', toggleAImode);
  toggleSoundBtn.addEventListener('click', ()=>{
    soundEnabled = !soundEnabled;
    toggleSoundBtn.textContent = 'Sonidos: ' + (soundEnabled ? 'ON' : 'OFF');
    if(!soundEnabled) stopAmbient();
    else {
      if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume().then(startAmbient).catch(()=>{});
      else startAmbient();
    }
  });
  aiRange.addEventListener('input', (e)=>{ aiDifficulty = parseFloat(e.target.value); });

  function toggleAImode(){
    modeAI = !modeAI;
    modeLabel.textContent = modeAI ? 'IA (derecha)' : '2 jugadores';
    toggleAI.textContent = modeAI ? 'Modo: IA' : 'Modo: 2 jugadores';
    // small feedback sound
    if(soundEnabled) playTone({freq:520, duration:0.06, type:'sine', gain:0.03});
  }

  // Small console helper
  window.__PINGPONG = {
    setAIDifficulty(v){ aiDifficulty = v; aiRange.value = v; console.log('aiDifficulty =',v); },
    toggleAI(){ toggleAImode(); },
    toggleSound(){ toggleSoundBtn.click(); }
  };

  // Init
  resetGame();
  loop();

  // Start ambient only after user interacts (or immediately if audio already running)
  if(audioCtx && audioCtx.state !== 'suspended') startAmbient(); 