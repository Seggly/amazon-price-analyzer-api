// Simple Confetti Function
console.log('Confetti script loaded');

window.createConfetti = function(canvas, colors) {
    console.log('createConfetti called with:', { canvasWidth: canvas.width, canvasHeight: canvas.height, colors });
    const ctx = canvas.getContext('2d');
    const particles = [];
    const particleCount = 100;
    
    // Create particles
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        radius: Math.random() * 4 + 1,
        density: Math.random() * 30 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 2 + 1,
        opacity: 1
      });
    }
  
    // Animation
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2, false);
        ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.opacity})`;
        ctx.fill();
  
        // Move particle
        p.y -= p.speed;
        p.opacity -= 0.01;
  
        // Remove particle if it's gone
        if (p.opacity <= 0) {
          particles.splice(i, 1);
          i--;
        }
      }
  
      if (particles.length > 0) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.remove();
      }
    }
  
    animate();
  };