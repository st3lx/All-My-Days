// app.js - Interactive audio visualization with multiple styles including WebGL Aurora

document.addEventListener("DOMContentLoaded", () => {
  // ----- DOM elements -----
  const audioInput = document.getElementById("audioFile");
  const canvas = document.getElementById("visualizer");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const progressBar = document.getElementById("progressBar");
  const timeDisplay = document.getElementById("timeDisplay");
  const fileLabel = document.getElementById("fileLabel");

  if (!canvas) {
    console.error("Canvas element #visualizer not found.");
    return;
  }

  const ctx2d = canvas.getContext("2d");

  // ----- Audio / Analyser state -----
  let audio = null;
  let audioCtx = null;
  let sourceNode = null;
  let analyser = null;
  let dataArray = null;
  let bufferLength = 0;
  let isAudioPlaying = false;

  // ----- Canvas / drawing state -----
  let animationId = null;
  let currentStyle = "florr"; // default to Florr
  let auroraGL = null;
  let getBands = null;
  
  // Style-specific state variables
  let particles = [];
  let lastTime = 0;
  let hueRotation = 0;

  // ----- Recording state -----
  let mediaRecorder = null;
  let recordingChunks = [];
  let lastRecordingBlob = null;

  // ----- Utilities -----
  function dprSizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || Math.min(window.innerWidth * 0.95, 1000);
    const cssHeight = canvas.clientHeight || 500;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    if (ctx2d) ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearCanvas() {
    if (ctx2d) {
      ctx2d.fillStyle = "#000015";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function updateProgress() {
    if (!audio || isNaN(audio.duration)) return;
    
    const percent = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = percent + '%';
    
    timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  }

  // ----- Audio setup -----
  function setupAudioFromFile(file) {
    if (audio) {
      try { audio.pause(); } catch {}
      if (sourceNode && audioCtx) {
        try { sourceNode.disconnect(); } catch {}
      }
      audio = null;
      isAudioPlaying = false;
    }

    audio = new Audio(URL.createObjectURL(file));
    audio.crossOrigin = "anonymous";
    audio.loop = false;

    // Update file label
    if (fileLabel && file) {
      fileLabel.textContent = file.name;
    }

    // Set up progress tracking
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', () => {
      progressBar.style.width = '0%';
      timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
    });

    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    sourceNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    getBands = createBandEnergiesGetter(analyser, dataArray);

    audio.addEventListener("ended", () => {
      isAudioPlaying = false;
      stopBtn.click();
    });
    
    // Auto-start visualization when file is selected
    startBtn.click();
  }

  // ----- Visualization styles -----
  
  // 1. Florr (Flower) style
  function renderFlorr() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Create a flower-like visualization
    const centerX = cw / 2;
    const centerY = ch / 2;
    const maxRadius = Math.min(cw, ch) * 0.4;
    
    ctx2d.lineWidth = 2;
    
    // Draw petals based on frequency data
    const petalCount = 12;
    for (let i = 0; i < petalCount; i++) {
      const angle = (i * 2 * Math.PI) / petalCount;
      const freqIndex = Math.floor(i * bufferLength / petalCount);
      const v = dataArray[freqIndex] / 255;
      
      const petalLength = maxRadius * (0.5 + v * 0.5);
      const petalWidth = maxRadius * 0.1 * (0.7 + v * 0.3);
      
      const x1 = centerX + Math.cos(angle) * (maxRadius * 0.2);
      const y1 = centerY + Math.sin(angle) * (maxRadius * 0.2);
      const x2 = centerX + Math.cos(angle) * petalLength;
      const y2 = centerY + Math.sin(angle) * petalLength;
      
      // Draw petal
      ctx2d.beginPath();
      ctx2d.moveTo(x1, y1);
      ctx2d.quadraticCurveTo(
        centerX + Math.cos(angle) * (petalLength * 0.5) + Math.cos(angle + Math.PI/2) * petalWidth,
        centerY + Math.sin(angle) * (petalLength * 0.5) + Math.sin(angle + Math.PI/2) * petalWidth,
        x2, y2
      );
      ctx2d.quadraticCurveTo(
        centerX + Math.cos(angle) * (petalLength * 0.5) + Math.cos(angle - Math.PI/2) * petalWidth,
        centerY + Math.sin(angle) * (petalLength * 0.5) + Math.sin(angle - Math.PI/2) * petalWidth,
        x1, y1
      );
      
      const hue = (i / petalCount) * 360;
      ctx2d.fillStyle = `hsla(${hue}, 80%, 60%, ${0.6 + v * 0.4})`;
      ctx2d.fill();
      
      // Draw center circle
      ctx2d.beginPath();
      ctx2d.arc(centerX, centerY, maxRadius * 0.15, 0, Math.PI * 2);
      ctx2d.fillStyle = `hsla(60, 80%, 60%, ${0.8})`;
      ctx2d.fill();
    }
  }

  // 2. Aurora style (WebGL)
  // In your app.js, replace the renderAurora function with this:
function renderAurora() {
  // Create a WebGL canvas if it doesn't exist
  let glCanvas = document.getElementById("webgl-canvas");
  if (!glCanvas) {
    glCanvas = document.createElement("canvas");
    glCanvas.id = "webgl-canvas";
    glCanvas.style.position = "absolute";
    glCanvas.style.top = canvas.offsetTop + "px";
    glCanvas.style.left = canvas.offsetLeft + "px";
    glCanvas.style.zIndex = "1";
    glCanvas.width = canvas.width;
    glCanvas.height = canvas.height;
    document.querySelector("main").appendChild(glCanvas);
  }
  
  // Position and size the WebGL canvas to match the 2D canvas
  const rect = canvas.getBoundingClientRect();
  glCanvas.style.width = canvas.style.width;
  glCanvas.style.height = canvas.style.height;
  glCanvas.width = canvas.width;
  glCanvas.height = canvas.height;
  
  // Initialize WebGL for Aurora if needed
  if (!auroraGL && getBands) {
    auroraGL = initAuroraGL(glCanvas, getBands, {});
  }
  
  // Render the Aurora
  if (auroraGL) {
    auroraGL();
  }
  
  // Hide the WebGL canvas when switching to other styles
  document.querySelectorAll(".styleBtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const style = e.target.getAttribute("data-style");
      if (style !== "aurora" && glCanvas) {
        glCanvas.style.display = "none";
      } else if (glCanvas) {
        glCanvas.style.display = "block";
      }
    });
  });
}

  // 3. Storm style
  function renderStorm() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Storm background
    const gradient = ctx2d.createLinearGradient(0, 0, 0, ch);
    gradient.addColorStop(0, "#0a0a2a");
    gradient.addColorStop(1, "#1a1a40");
    ctx2d.fillStyle = gradient;
    ctx2d.fillRect(0, 0, cw, ch);
    
    // Lightning effect based on audio energy
    const energy = dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);
    if (energy > 0.7 && Math.random() < 0.1) {
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx2d.lineWidth = 2 + Math.random() * 3;
      ctx2d.beginPath();
      const startX = Math.random() * cw;
      ctx2d.moveTo(startX, 0);
      
      for (let y = 10; y < ch; y += 10 + Math.random() * 20) {
        const xVar = 20 + Math.random() * 30;
        ctx2d.lineTo(startX - xVar + Math.random() * xVar * 2, y);
      }
      ctx2d.stroke();
    }
    
    // Rain drops
    ctx2d.strokeStyle = "rgba(150, 150, 255, 0.6)";
    for (let i = 0; i < 100; i++) {
      const x = (i * 13) % cw;
      const speed = 5 + (i % 5);
      const y = ((Date.now() / 20) * speed) % ch;
      ctx2d.beginPath();
      ctx2d.moveTo(x, y);
      ctx2d.lineTo(x - 1, y + 8);
      ctx2d.stroke();
    }
    
    // Storm intensity visualization
    const stormIntensity = energy * 0.8;
    for (let i = 0; i < 30; i++) {
      const freqIndex = Math.floor(i * bufferLength / 30);
      const v = dataArray[freqIndex] / 255;
      
      const x = Math.random() * cw;
      const y = Math.random() * ch;
      const radius = 1 + v * 10 * stormIntensity;
      
      ctx2d.beginPath();
      ctx2d.arc(x, y, radius, 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(100, 100, 255, ${0.2 + v * 0.5})`;
      ctx2d.fill();
    }
  }

  // 4. StarryNight style
  function renderStarryNight() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Dark blue background for space
    ctx2d.fillStyle = "#000020";
    ctx2d.fillRect(0, 0, cw, ch);
    
    // Create stars if needed
    if (particles.length === 0 || particles.length < 200) {
      particles = [];
      for (let i = 0; i < 200; i++) {
        particles.push({
          x: Math.random() * cw,
          y: Math.random() * ch,
          size: Math.random() * 2 + 0.5,
          speed: Math.random() * 0.5 + 0.1,
          brightness: Math.random() * 0.5 + 0.5
        });
      }
    }
    
    // Draw and update stars
    const energy = dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);
    
    particles.forEach(star => {
      // Twinkle effect based on audio
      const twinkle = 0.7 + Math.sin(Date.now() / 1000 + star.x * 0.1) * 0.3 * energy;
      
      ctx2d.beginPath();
      ctx2d.arc(star.x, star.y, star.size * (0.8 + energy * 0.5), 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(255, 255, 255, ${star.brightness * twinkle * 0.8})`;
      ctx2d.fill();
      
      // Move stars slowly
      star.y += star.speed * (1 + energy * 0.5);
      if (star.y > ch) {
        star.y = 0;
        star.x = Math.random() * cw;
      }
    });
    
    // Shooting stars occasionally
    if (Math.random() < 0.01 * energy) {
      const startX = Math.random() * cw;
      const length = 50 + Math.random() * 100;
      
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(startX, 0);
      ctx2d.lineTo(startX - length / 4, length);
      ctx2d.stroke();
    }
    
    // Add some larger "special" stars that pulse with the beat
    for (let i = 0; i < 5; i++) {
      const freqIndex = Math.floor(i * bufferLength / 5);
      const v = dataArray[freqIndex] / 255;
      
      const x = (i + 1) * cw / 6;
      const y = ch / 2;
      const size = 3 + v * 10;
      
      ctx2d.beginPath();
      ctx2d.arc(x, y, size, 0, Math.PI * 2);
      
      // Create gradient for special stars
      const gradient = ctx2d.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, `hsl(${i * 72}, 100%, 90%)`);
      gradient.addColorStop(1, `hsl(${i * 72}, 100%, 50%, 0.3)`);
      
      ctx2d.fillStyle = gradient;
      ctx2d.fill();
    }
  }

  // 5. Mask style (previously Hacker)
  function renderMask() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Dark background
    ctx2d.fillStyle = "#001100";
    ctx2d.fillRect(0, 0, cw, ch);
    
    // Matrix-like code rain
    const chars = "01ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz$%#@!*&";
    const fontSize = 14;
    ctx2d.font = `${fontSize}px monospace`;
    
    // Calculate columns based on font size
    const cols = Math.floor(cw / fontSize);
    
    // Draw falling characters
    for (let i = 0; i < cols; i++) {
      const freqIndex = Math.floor(i * bufferLength / cols);
      const v = dataArray[freqIndex] / 255;
      
      // Vary the number of characters in this column based on frequency
      const charCount = Math.floor(5 + v * 15);
      
      for (let j = 0; j < charCount; j++) {
        const yPos = ((Date.now() / 30) + j * fontSize) % (ch + fontSize * 5);
        const char = chars[Math.floor(Math.random() * chars.length)];
        
        // Fade out as they fall
        const alpha = 1 - (yPos / ch);
        
        // Highlight the first character in each column
        if (j === 0) {
          ctx2d.fillStyle = `rgba(0, 255, 0, ${alpha})`;
        } else {
          ctx2d.fillStyle = `rgba(0, 200, 0, ${alpha * 0.7})`;
        }
        
        ctx2d.fillText(char, i * fontSize, yPos);
      }
    }
    
    // Pulse effect based on overall volume
    const energy = dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);
    if (energy > 0.5) {
      ctx2d.strokeStyle = `rgba(0, 255, 0, ${0.2 + energy * 0.3})`;
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.arc(cw/2, ch/2, 50 + energy * 100, 0, Math.PI * 2);
      ctx2d.stroke();
    }
  }

  // 6. Galaxy style
  function renderGalaxy() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Space background
    ctx2d.fillStyle = "#000010";
    ctx2d.fillRect(0, 0, cw, ch);
    
    // Create galaxy center
    const centerX = cw / 2;
    const centerY = ch / 2;
    
    // Draw spiral arms
    const armCount = 4;
    const energy = dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);
    
    for (let arm = 0; arm < armCount; arm++) {
      const angleOffset = (arm * 2 * Math.PI) / armCount;
      
      for (let i = 0; i < 200; i++) {
        const distance = 10 + i * 2;
        const angle = angleOffset + (i * 0.05) + (Date.now() / 5000) * (0.5 + energy * 0.5);
        
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        
        const size = 1 + (i % 3);
        const alpha = 0.2 + (i / 200) * 0.8;
        
        ctx2d.beginPath();
        ctx2d.arc(x, y, size, 0, Math.PI * 2);
        
        // Vary star colors slightly
        const hue = 240 + Math.sin(angle) * 30;
        ctx2d.fillStyle = `hsla(${hue}, 70%, 80%, ${alpha})`;
        ctx2d.fill();
      }
    }
    
    // Add central bulge with pulse effect
    const pulse = 0.8 + Math.sin(Date.now() / 500) * 0.2 * energy;
    const gradient = ctx2d.createRadialGradient(centerX, centerY, 0, centerX, centerY, 80 * pulse);
    gradient.addColorStop(0, "rgba(255, 255, 200, 0.8)");
    gradient.addColorStop(1, "rgba(200, 200, 100, 0)");
    
    ctx2d.beginPath();
    ctx2d.arc(centerX, centerY, 80 * pulse, 0, Math.PI * 2);
    ctx2d.fillStyle = gradient;
    ctx2d.fill();
    
    // Add some random stars in the background
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * cw;
      const y = Math.random() * ch;
      const size = Math.random() * 1.5;
      const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      
      // Fade stars near the center
      const alpha = Math.min(1, distFromCenter / 100) * 0.8;
      
      ctx2d.beginPath();
      ctx2d.arc(x, y, size, 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx2d.fill();
    }
  }

  // 7. Quantum style
  function renderQuantum() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Dark background
    ctx2d.fillStyle = "#000015";
    ctx2d.fillRect(0, 0, cw, ch);
    
    // Draw quantum particles
    const particleCount = 50;
    const energy = dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);
    
    // Initialize particles if needed
    if (particles.length === 0) {
      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * cw,
          y: Math.random() * ch,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          size: Math.random() * 4 + 1,
          connections: []
        });
      }
    }
    
    // Update and draw particles
    particles.forEach((p, i) => {
      // Move particles
      p.x += p.vx * (0.5 + energy * 0.5);
      p.y += p.vy * (0.5 + energy * 0.5);
      
      // Bounce off walls
      if (p.x < 0 || p.x > cw) p.vx *= -1;
      if (p.y < 0 || p.y > ch) p.vy *= -1;
      
      // Draw particle
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx2d.fillStyle = `hsl(${i * 10 + hueRotation}, 100%, 60%)`;
      ctx2d.fill();
      
      // Draw connections to nearby particles
      p.connections = [];
      particles.forEach((other, j) => {
        if (i !== j) {
          const dx = p.x - other.x;
          const dy = p.y - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 100) {
            p.connections.push({ target: j, strength: 1 - dist / 100 });
            
            ctx2d.beginPath();
            ctx2d.moveTo(p.x, p.y);
            ctx2d.lineTo(other.x, other.y);
            ctx2d.strokeStyle = `hsla(${i * 10 + hueRotation}, 100%, 50%, ${0.2 * (1 - dist / 100)})`;
            ctx2d.lineWidth = 1;
            ctx2d.stroke();
          }
        }
      });
    });
    
    // Rotate hues over time
    hueRotation = (hueRotation + 1) % 360;
    
    // Add wave interference patterns
    const time = Date.now() / 1000;
    for (let i = 0; i < 5; i++) {
      const freqIndex = Math.floor(i * bufferLength / 5);
      const v = dataArray[freqIndex] / 255;
      
      ctx2d.beginPath();
      for (let x = 0; x < cw; x += 10) {
        const y = ch/2 + Math.sin(x * 0.02 + time * (1 + i)) * 30 * v;
        if (x === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.strokeStyle = `hsla(${180 + i * 36}, 100%, 60%, ${0.3 + v * 0.4})`;
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
    }
  }

  // 8. Aqua style
  function renderAqua() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Ocean gradient background
    const gradient = ctx2d.createLinearGradient(0, 0, 0, ch);
    gradient.addColorStop(0, "#004466");
    gradient.addColorStop(1, "#001122");
    ctx2d.fillStyle = gradient;
    ctx2d.fillRect(0, 0, cw, ch);
    
    // Draw water waves
    const time = Date.now() / 1000;
    const energy = dataArray.reduce((sum, val) => sum + val, 0) / (bufferLength * 255);
    
    // Surface waves
    ctx2d.beginPath();
    for (let x = 0; x <= cw; x += 5) {
      const y = ch * 0.3 + Math.sin(x * 0.02 + time) * 10 * energy;
      if (x === 0) ctx2d.moveTo(x, y);
      else ctx2d.lineTo(x, y);
    }
    ctx2d.lineTo(cw, ch);
    ctx2d.lineTo(0, ch);
    ctx2d.closePath();
    ctx2d.fillStyle = "rgba(0, 100, 200, 0.4)";
    ctx2d.fill();
    
    // Bubbles
    for (let i = 0; i < 30; i++) {
      const freqIndex = Math.floor(i * bufferLength / 30);
      const v = dataArray[freqIndex] / 255;
      
      const x = (i * 40) % cw;
      const y = ch - ((Date.now() / 50 + i * 20) % (ch * 0.7));
      const size = 2 + v * 8;
      
      ctx2d.beginPath();
      ctx2d.arc(x, y, size, 0, Math.PI * 2);
      ctx2d.fillStyle = `rgba(255, 255, 255, ${0.2 + v * 0.5})`;
      ctx2d.fill();
      
      // Add highlight to bubbles
      ctx2d.beginPath();
      ctx2d.arc(x - size/3, y - size/3, size/4, 0, Math.PI * 2);
      ctx2d.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx2d.fill();
    }
    
    // Light rays from surface
    for (let i = 0; i < 5; i++) {
      const x = (i + 1) * cw / 6;
      const angle = -Math.PI/4 + (Math.random() - 0.5) * 0.2;
      const length = 100 + Math.random() * 100;
      
      ctx2d.beginPath();
      ctx2d.moveTo(x, ch * 0.3);
      ctx2d.lineTo(
        x + Math.cos(angle) * length,
        ch * 0.3 + Math.sin(angle) * length
      );
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
    }
    
    // Fish or other sea creatures
    for (let i = 0; i < 3; i++) {
      const freqIndex = Math.floor(i * bufferLength / 3);
      const v = dataArray[freqIndex] / 255;
      
      const x = (Date.now() / 20 + i * 100) % (cw + 50) - 25;
      const y = ch * 0.5 + Math.sin(x * 0.05) * 30;
      
      // Draw simple fish shape
      ctx2d.fillStyle = `hsl(${30 + i * 60}, 80%, 50%)`;
      ctx2d.beginPath();
      ctx2d.ellipse(x, y, 15 + v * 10, 8 + v * 5, 0, 0, Math.PI * 2);
      ctx2d.fill();
      
      // Tail
      ctx2d.beginPath();
      ctx2d.moveTo(x - 15, y);
      ctx2d.lineTo(x - 25, y - 10);
      ctx2d.lineTo(x - 25, y + 10);
      ctx2d.closePath();
      ctx2d.fill();
    }
  }

  // 9. Bars style
  function renderBars() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    const barCount = 64;
    const barWidth = cw / barCount;
    
    for (let i = 0; i < barCount; i++) {
      const v = dataArray[Math.floor(i * bufferLength / barCount)] / 255;
      const barHeight = v * ch * 0.8;
      const hue = 240 - Math.round(v * 160);
      ctx2d.fillStyle = `hsl(${hue}, 70%, ${40 + v * 30}%)`;
      const x = i * barWidth;
      ctx2d.fillRect(x, ch - barHeight, Math.max(barWidth - 1, 1), barHeight);
    }
  }

  // 10. Waveform style
  function renderWaveform() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteTimeDomainData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    
    ctx2d.lineWidth = 2;
    ctx2d.strokeStyle = '#0ff';
    ctx2d.beginPath();
    
    const sliceWidth = cw / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * ch / 2;
      
      if (i === 0) {
        ctx2d.moveTo(x, y);
      } else {
        ctx2d.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx2d.stroke();
  }

  // 11. Circle style
  function renderCircle() {
    dprSizeCanvas();
    clearCanvas();
    
    analyser.getByteFrequencyData(dataArray);
    const cw = canvas.width;
    const ch = canvas.height;
    const centerX = cw / 2;
    const centerY = ch / 2;
    const radius = Math.min(cw, ch) * 0.4;
    
    ctx2d.lineWidth = 2;
    
    for (let i = 0; i < bufferLength; i++) {
      const angle = (i * 2 * Math.PI) / bufferLength;
      const v = dataArray[i] / 255;
      const barHeight = v * radius * 0.5;
      
      const x1 = centerX + Math.cos(angle) * radius;
      const y1 = centerY + Math.sin(angle) * radius;
      const x2 = centerX + Math.cos(angle) * (radius + barHeight);
      const y2 = centerY + Math.sin(angle) * (radius + barHeight);
      
      const hue = (i / bufferLength) * 360;
      ctx2d.strokeStyle = `hsl(${hue}, 80%, 60%)`;
      
      ctx2d.beginPath();
      ctx2d.moveTo(x1, y1);
      ctx2d.lineTo(x2, y2);
      ctx2d.stroke();
    }
  }

  // 12. Manim style (placeholder)
  function renderManim() {
    dprSizeCanvas();
    clearCanvas();
    // Add your Manim style implementation here
  }

  // 13. Bounce+Neon Pulse style (placeholder)
  function renderBounce() {
    dprSizeCanvas();
    clearCanvas();
    // Add your Bounce+Neon Pulse style implementation here
  }

  // 14. Waves style (placeholder)
  function renderWaves() {
    dprSizeCanvas();
    clearCanvas();
    // Add your Waves style implementation here
  }

  // 15. Metropolis style (placeholder)
  function renderMetro() {
    dprSizeCanvas();
    clearCanvas();
    // Add your Metropolis style implementation here
  }

  // 16. Firework style (placeholder)
  function renderFire(){
    dprSizeCanvas();
    clearCanvas();
    // Add your Firework style implementation here
  }

  // 17. Rain style (placeholder)
  function renderRain() {
    dprSizeCanvas();
    clearCanvas();
    // Add your Rain style implementation here
  }

// ----- Aurora GL system -----
function initAuroraGL(canvas, getBandEnergies, options = {}) {
  const gl = canvas.getContext("webgl");
  if (!gl) { 
    console.error("WebGL not supported"); 
    return null; 
  }

  const DPR = window.devicePixelRatio || 1;
  const pixelRatio = options.pixelRatio || DPR;

  const vsSource = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision highp float;
    varying vec2 v_uv;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec4 u_bands; // energies for 4 bands (0..1)
    uniform float u_speed;
    uniform float u_saturation;
    uniform float u_starDensity;
    uniform float u_starSize;
    uniform float u_glow; // global glow intensity

    // --------------------------
    // 2D Simplex / Classic noise
    // Ashima / IQ style (small, efficient)
    // --------------------------
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                          0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                         -0.577350269189626,  // -1.0 + 2.0 * C.x
                          0.024390243902439); // 1.0/41.0
      vec2 i = floor(v + dot(v, C.yy) );
      vec2 x0 = v - i + dot(i, C.xx);

      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;

      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                      + i.x + vec3(0.0, i1.x, 1.0 ));

      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m; m = m*m;

      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;

      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

      vec3 g;
      g.x  = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    // hash for star pattern
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    // hue to rgb (somewhat soft)
    vec3 h2rgb(float h, float s, float v) {
      h = fract(h);
      float i = floor(h * 6.0);
      float f = h * 6.0 - i;
      float p = v * (1.0 - s);
      float q = v * (1.0 - f * s);
      float t = v * (1.0 - (1.0 - f) * s);
      vec3 col;
      if (i == 0.0) col = vec3(v,t,p);
      else if (i == 1.0) col = vec3(q,v,p);
      else if (i == 2.0) col = vec3(p,v,t);
      else if (i == 3.0) col = vec3(p,q,v);
      else if (i == 4.0) col = vec3(t,p,v);
      else col = vec3(v,p,q);
      return col;
    }

    void main() {
      vec2 uv = v_uv;
      vec2 p = uv * u_resolution.xy / min(u_resolution.x, u_resolution.y);

      // base sky
      vec3 sky = vec3(0.01, 0.02, 0.03);

      // time warp and scale
      float t = u_time * u_speed * 0.2;

      // We'll create 4 layered curtains
      vec3 accum = vec3(0.0);

      // parameters per-band
      for (int b = 0; b < 4; b++) {
        float bandEnergy = u_bands[b]; // 0..1
        // horizontal scale for noise and vertical displacement
        float scale = mix(0.6, 2.5, float(b) * 0.3);
        float yShift = float(b) * 0.12; // vertical offset per band
        float bandSpeed = mix(0.4, 1.6, float(b) * 0.4);

        // sample noise - create vertical curtain by sampling noise with uv.x + time
        float nx = uv.x * scale * 3.0;
        float ny = uv.y * 1.5 - yShift * 2.0 + t * bandSpeed;
        float n = snoise(vec2(nx + float(b)*10.0, ny));

        // create a curtain mask: stronger near some y position influenced by n
        float center = 0.55 + n * 0.25; // center y of curtain
        float width = 0.25 + bandEnergy * 0.5; // width of curtain
        float mask = smoothstep(center + width, center + width*0.2, uv.y) - smoothstep(center - width*0.2, center - width, uv.y);
        // soften edges by additional noise
        mask *= smoothstep(0.0, 1.0, bandEnergy*1.5 + snoise(vec2(nx*0.5 + 3.0, ny*0.5))*0.6);

        // color per-band (hue choices; map band index to a palette)
        float baseHue = 0.0;
        if (b == 0) baseHue = 0.48; // greenish
        if (b == 1) baseHue = 0.78; // purple-blue
        if (b == 2) baseHue = 0.12; // golden
        if (b == 3) baseHue = 0.58; // cyan

        float hue = baseHue + (n * 0.08) + (bandEnergy * 0.06);
        float sat = 0.6 * u_saturation + 0.2;
        float val = 0.25 + bandEnergy * 0.85;

        vec3 col = h2rgb(hue, sat, val);
        // multiply by mask and bandEnergy (so quiet bands are dim)
        vec3 contribution = col * mask * (0.25 + bandEnergy*1.5);

        // add subtle vertical glow (w wider)
        float glowMask = exp(-abs(uv.y - center) * 8.0) * 0.5;
        accum += contribution * (1.0 + glowMask * u_glow);
      }

      // Stars: low-density hashed dots with slow twinkle
      float star = 0.0;
      // bias density with u_starDensity
      vec2 starCell = floor(uv * u_resolution.xy / 40.0);
      float h = hash21(starCell * 0.123 + vec2(u_time * 0.02));
      if (h < u_starDensity) {
        // twinkle via per-cell sine
        float tw = 0.5 + 0.5 * sin(hash21(starCell) * 343.2 + u_time * 0.8);
        float dx = fract(uv.x * u_resolution.x / 40.0) - 0.5;
        float dy = fract(uv.y * u_resolution.y / 40.0) - 0.5;
        float d = sqrt(dx*dx + dy*dy);
        float s = smoothstep(u_starSize * 0.6, 0.0, d) * tw;
        star += s;
      }

      // combine sky + aurora + stars (additive)
      vec3 color = sky + accum;
      color += vec3(star * 1.2);

      // tone mapping and gamma
      color = 1.0 - exp(-color * vec3(1.2)); // simple tonemap
      color = pow(color, vec3(0.95)); // gamma

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  // Create shader program
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vsSource);
  gl.compileShader(vertexShader);
  
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fsSource);
  gl.compileShader(fragmentShader);
  
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.useProgram(program);
  
  // Create a quad that covers the entire screen
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  
  const positionAttributeLocation = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(positionAttributeLocation);
  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
  
  // Get uniform locations
  const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
  const timeUniformLocation = gl.getUniformLocation(program, "u_time");
  const bandsUniformLocation = gl.getUniformLocation(program, "u_bands");
  const speedUniformLocation = gl.getUniformLocation(program, "u_speed");
  const saturationUniformLocation = gl.getUniformLocation(program, "u_saturation");
  const starDensityUniformLocation = gl.getUniformLocation(program, "u_starDensity");
  const starSizeUniformLocation = gl.getUniformLocation(program, "u_starSize");
  const glowUniformLocation = gl.getUniformLocation(program, "u_glow");
  
  // Set default uniform values
  gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
  gl.uniform1f(speedUniformLocation, options.speed || 1.0);
  gl.uniform1f(saturationUniformLocation, options.saturation || 1.0);
  gl.uniform1f(starDensityUniformLocation, options.starDensity || 0.02);
  gl.uniform1f(starSizeUniformLocation, options.starSize || 0.2);
  gl.uniform1f(glowUniformLocation, options.glow || 0.5);
  
  let startTime = Date.now();
  
  // Return render function
  return function render() {
    dprSizeCanvas();
    
    // Update canvas size if needed
    if (canvas.width !== gl.canvas.width || canvas.height !== gl.canvas.height) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
    }
    
    // Update time
    const currentTime = (Date.now() - startTime) / 1000;
    gl.uniform1f(timeUniformLocation, currentTime);
    
    // Update bands
    if (getBandEnergies) {
      const bands = getBandEnergies();
      gl.uniform4f(bandsUniformLocation, bands[0], bands[1], bands[2], bands[3]);
    }
    
    // Render
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

function createBandEnergiesGetter(analyser, dataArray) {
  return function() {
    analyser.getByteFrequencyData(dataArray);
    
    // Divide frequency data into 4 bands
    const bandSize = Math.floor(dataArray.length / 4);
    const bands = [];
    
    for (let i = 0; i < 4; i++) {
      let sum = 0;
      for (let j = 0; j < bandSize; j++) {
        sum += dataArray[i * bandSize + j] / 255;
      }
      bands.push(sum / bandSize);
    }
    
    return bands;
  };
}

// ----- Animation loop -----
function animate() {
  if (!isAudioPlaying) return;
  
  animationId = requestAnimationFrame(animate);
  
  switch(currentStyle) {
    case "florr":
      renderFlorr();
      break;
    case "aurora":
      renderAurora();
      break;
    case "storm":
      renderStorm();
      break;
    case "star":
      renderStarryNight();
      break;
    case "mask":
      renderMask();
      break;
    case "galaxy":
      renderGalaxy();
      break;
    case "quantum":
      renderQuantum();
      break;
    case "aqua":
      renderAqua();
      break;
    case "bars":
      renderBars();
      break;
    case "waveform":
      renderWaveform();
      break;
    case "circle":
      renderCircle();
      break;
    case "manim":
      renderManim();
      break;
    case "bounce":
      renderBounce();
      break;
    case "waves":
      renderWaves();
      break;
    case "metro":
      renderMetro();
      break;
    case "fire":
      renderFire();
      break;
    case "rain":
      renderRain();
      break;
    default:
      renderFlorr();
  }
}

// ----- Event listeners -----
audioInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    // Update file label with the selected file name
    fileLabel.textContent = e.target.files[0].name;
    setupAudioFromFile(e.target.files[0]);
  }
});

startBtn.addEventListener("click", () => {
  if (!audio) return;
  
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  
  audio.play();
  isAudioPlaying = true;
  
  if (!animationId) {
    animate();
  }
});

stopBtn.addEventListener("click", () => {
  if (audio) {
    audio.pause();
    isAudioPlaying = false;
  }
  
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  // Clear canvas when stopped
  clearCanvas();
});

// Style selection buttons
document.querySelectorAll(".styleBtn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    const style = e.target.getAttribute("data-style");
    
    // Remove selected class from all buttons
    document.querySelectorAll(".styleBtn").forEach(b => {
      b.classList.remove("selected");
    });
    
    // Add selected class to clicked button
    e.target.classList.add("selected");
    
    // Change current style
    currentStyle = style;
    
    // Reset particles for styles that use them
    if (style === "star" || style === "quantum") {
      particles = [];
    }
    
     // Handle WebGL canvas visibility
    const glCanvas = document.getElementById("webgl-canvas");
    if (glCanvas) {
      if (style === "aurora") {
        glCanvas.style.display = "block";
      } else {
        glCanvas.style.display = "none";
      }
    }
    
    // Reinitialize WebGL for Aurora if needed
    if (style === "aurora") {
      auroraGL = null;
    }
  });
});

// In your app.js, replace the setupProgressBarDragging function with this:
// In your app.js, replace the setupProgressBarDragging function with this:
function setupProgressBarDragging() {
  const progressContainer = document.querySelector(".progress-container");
  const progressBar = document.getElementById("progressBar");
  const progressHandle = document.getElementById("progressHandle");
  
  if (!progressContainer || !progressBar || !progressHandle) return;
  
  let isDragging = false;
  
  // Function to update audio position based on click/drag position
  function setAudioPosition(clientX) {
    if (!audio || isNaN(audio.duration)) return;
    
    const rect = progressContainer.getBoundingClientRect();
    const clickPosition = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = clickPosition * audio.duration;
    
    audio.currentTime = newTime;
    updateProgress();
  }
  
  // Mouse events for desktop
  progressContainer.addEventListener("mousedown", (e) => {
    isDragging = true;
    setAudioPosition(e.clientX);
  });
  
  progressHandle.addEventListener("mousedown", (e) => {
    isDragging = true;
    e.stopPropagation(); // Prevent triggering the container event
  });
  
  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      setAudioPosition(e.clientX);
    }
  });
  
  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
  
  // Touch events for mobile
  progressContainer.addEventListener("touchstart", (e) => {
    isDragging = true;
    setAudioPosition(e.touches[0].clientX);
  });
  
  progressHandle.addEventListener("touchstart", (e) => {
    isDragging = true;
    e.stopPropagation();
  });
  
  document.addEventListener("touchmove", (e) => {
    if (isDragging) {
      setAudioPosition(e.touches[0].clientX);
    }
  });
  
  document.addEventListener("touchend", () => {
    isDragging = false;
  });
  
  // Prevent dragging from selecting text
  document.addEventListener("selectstart", (e) => {
    if (isDragging) {
      e.preventDefault();
    }
  });
}
setupProgressBarDragging();
// Then, call the function once at the end of your DOMContentLoaded event listener
// Remove the recursive call inside setupProgressBarDragging()

// Also update the updateProgress function to handle the progress handle:
function updateProgress() {
  if (!audio || isNaN(audio.duration)) return;
  
  const percent = (audio.currentTime / audio.duration) * 100;
  progressBar.style.width = percent + '%';
  
  // Update the handle position
  const progressHandle = document.getElementById("progressHandle");
  if (progressHandle) {
    progressHandle.style.left = percent + '%';
  }
  
  timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
}

// Set default style button as selected on page load
document.addEventListener("DOMContentLoaded", () => {
  const defaultStyleBtn = document.querySelector('.styleBtn[data-style="florr"]');
  if (defaultStyleBtn) {
    defaultStyleBtn.classList.add("selected");
  }
  
  // Initialize canvas size
  dprSizeCanvas();
  clearCanvas();
});

// Download functionality
downloadBtn.addEventListener("click", () => {
  if (!canvas) return;
  
  try {
    const dataURL = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = `visualization-${new Date().toISOString().slice(0, 19)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    console.error("Error downloading image:", e);
  }
});

// AI Assistant (placeholder)
document.getElementById("aiSubmit").addEventListener("click", () => {
  const input = document.getElementById("aiInput").value;
  const response = document.getElementById("aiResponse");
  
  if (input.trim() === "") {
    response.textContent = "Please enter a description of how you want the visuals to change.";
    return;
  }
  
  response.textContent = "AI adjustment feature coming soon!";
});

// Handle window resize
window.addEventListener("resize", () => {
  dprSizeCanvas();
});

  const defaultStyleBtn = document.querySelector('.styleBtn[data-style="florr"]');
  if (defaultStyleBtn) {
    defaultStyleBtn.classList.add("selected");
  }
  
  // Initialize canvas size
  dprSizeCanvas();
  clearCanvas();
});