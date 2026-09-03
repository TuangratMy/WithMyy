/* ════ PAGE 6 — GORGEOUS PUZZLE (INSTANT SNAP FIX) ════ */

(function () {
  let video, canvas, ctx;
  let hands;
  let isCapturing = true;
  let capturedImage = null;
  let puzzlePieces = [];
  let gridSlots = [];
  let draggedPiece = null;
  let isPinching = false;
  let isGameComplete = false;

  // Frame Boundaries
  let frameBox = { x: 0, y: 0, width: 0, height: 0, active: false };

  // Track Pinch state to trigger snap instantly on initial pinch down
  let wasPinchingLastFrame = false;

  window.initGorgeousPuzzle = function () {
    video = document.getElementById('p6-video');
    canvas = document.getElementById('p6-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    setupMediaPipe();
    resetGame();
  };

  function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function resetGame() {
    isCapturing = true;
    capturedImage = null;
    puzzlePieces = [];
    gridSlots = [];
    draggedPiece = null;
    isGameComplete = false;
    wasPinchingLastFrame = false;

    const hint = document.getElementById('p6-snap-hint');
    if (hint) {
      hint.style.display = 'block';
      hint.innerText = 'Make L-shapes with hands to frame, then pinch thumb & index to Instant Snap!';
    }
  }

  function setupMediaPipe() {
    if (typeof Hands === 'undefined') return;

    hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    hands.onResults(onResults);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
        .then((stream) => {
          if (video) {
            video.srcObject = stream;
            video.play();
          }
          requestAnimationFrame(processVideoFrame);
        })
        .catch((err) => console.error(err));
    }
  }

  async function processVideoFrame() {
    if (video && video.readyState >= 2) {
      await hands.send({ image: video });
    }
    requestAnimationFrame(processVideoFrame);
  }

  function onResults(results) {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Mirrored Video
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const handLandmarks = results.multiHandLandmarks || [];

    if (isCapturing) {
      detectLShapeAndSnap(handLandmarks);
      drawFrameOverlay();
    } else {
      handlePuzzleInteraction(handLandmarks);
      drawPuzzleBoard();
    }
  }

  /* ── 1. L-SHAPE DETECT & INSTANT SNAP ── */
  function detectLShapeAndSnap(landmarksList) {
    let indexTips = [];
    let thumbTips = [];
    let isPinchingDetected = false;

    landmarksList.forEach((landmarks) => {
      const indexTip = { x: (1 - landmarks[8].x) * canvas.width, y: landmarks[8].y * canvas.height };
      const thumbTip = { x: (1 - landmarks[4].x) * canvas.width, y: landmarks[4].y * canvas.height };

      indexTips.push(indexTip);
      thumbTips.push(thumbTip);

      // Distance between Thumb and Index Tip
      const dist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
      if (dist < 45) {
        isPinchingDetected = true;
      }
    });

    // 1. Calculate Crop Box from L-Shape Gestures
    if (indexTips.length >= 2) {
      // Two hands detected -> Draw frame between hands
      const minX = Math.min(indexTips[0].x, indexTips[1].x, thumbTips[0].x, thumbTips[1].x);
      const maxX = Math.max(indexTips[0].x, indexTips[1].x, thumbTips[0].x, thumbTips[1].x);
      const minY = Math.min(indexTips[0].y, indexTips[1].y, thumbTips[0].y, thumbTips[1].y);
      const maxY = Math.max(indexTips[0].y, indexTips[1].y, thumbTips[0].y, thumbTips[1].y);

      const size = Math.max(maxX - minX, maxY - minY, 180);
      frameBox = { x: minX, y: minY, width: size, height: size, active: true };
    } else if (indexTips.length === 1) {
      // Single hand detected -> Box around single hand L-shape
      const size = 260;
      frameBox = {
        x: Math.max(10, Math.min(canvas.width - size - 10, indexTips[0].x - 40)),
        y: Math.max(10, Math.min(canvas.height - size - 10, indexTips[0].y - 40)),
        width: size,
        height: size,
        active: true
      };
    } else {
      // Default Center Box
      const defaultSize = Math.min(canvas.width, canvas.height) * 0.45;
      frameBox = {
        x: (canvas.width - defaultSize) / 2,
        y: (canvas.height - defaultSize) / 2,
        width: defaultSize,
        height: defaultSize,
        active: false
      };
    }

    // 2. INSTANT SNAP TRIGGER (Snap Immediately as soon as fingers touch)
    if (isPinchingDetected && !wasPinchingLastFrame) {
      triggerInstantSnap();
    }
    wasPinchingLastFrame = isPinchingDetected;
  }

  function drawFrameOverlay() {
    ctx.strokeStyle = frameBox.active ? '#277f53' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(frameBox.x, frameBox.y, frameBox.width, frameBox.height);
    ctx.setLineDash([]);
  }

  function triggerInstantSnap() {
    // Flash Effect
    const flash = document.getElementById('p6-flash');
    if (flash) {
      flash.style.opacity = '1';
      setTimeout(() => flash.style.opacity = '0', 100);
    }

    // Capture Canvas Image inside Frame
    const offCanvas = document.createElement('canvas');
    offCanvas.width = frameBox.width;
    offCanvas.height = frameBox.height;
    const offCtx = offCanvas.getContext('2d');

    offCtx.drawImage(
      canvas,
      frameBox.x, frameBox.y, frameBox.width, frameBox.height,
      0, 0, frameBox.width, frameBox.height
    );

    capturedImage = offCanvas;
    isCapturing = false;

    generatePuzzleGrid();

    const hint = document.getElementById('p6-snap-hint');
    if (hint) {
      hint.innerText = 'Pinch thumb & index to pick up and drag puzzle pieces!';
    }
  }

  /* ── 2. PUZZLE GENERATION (3x3 = 9 PIECES) ── */
  function generatePuzzleGrid() {
    puzzlePieces = [];
    gridSlots = [];

    const rows = 3;
    const cols = 3;
    const pieceSize = frameBox.width / cols;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        gridSlots.push({
          id: r * cols + c,
          x: frameBox.x + c * pieceSize,
          y: frameBox.y + r * pieceSize,
          size: pieceSize,
          filled: false
        });
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pCanvas = document.createElement('canvas');
        pCanvas.width = pieceSize;
        pCanvas.height = pieceSize;
        const pCtx = pCanvas.getContext('2d');

        pCtx.drawImage(
          capturedImage,
          c * pieceSize, r * pieceSize, pieceSize, pieceSize,
          0, 0, pieceSize, pieceSize
        );

        const spawnSide = Math.random() > 0.5 ? 'left' : 'right';
        const rx = spawnSide === 'left'
          ? Math.random() * Math.max(10, frameBox.x - pieceSize - 20)
          : frameBox.x + frameBox.width + 20 + Math.random() * Math.max(10, canvas.width - frameBox.x - frameBox.width - pieceSize - 20);
        const ry = Math.random() * (canvas.height - pieceSize - 60) + 30;

        puzzlePieces.push({
          id: r * cols + c,
          img: pCanvas,
          x: Math.max(10, Math.min(canvas.width - pieceSize - 10, rx)),
          y: Math.max(10, Math.min(canvas.height - pieceSize - 10, ry)),
          size: pieceSize,
          isLocked: false
        });
      }
    }
  }

  /* ── 3. PINCH DRAG & DROP INTERACTION ── */
  function handlePuzzleInteraction(landmarksList) {
    if (landmarksList.length === 0) {
      draggedPiece = null;
      isPinching = false;
      return;
    }

    const landmarks = landmarksList[0];
    const indexTip = { x: (1 - landmarks[8].x) * canvas.width, y: landmarks[8].y * canvas.height };
    const thumbTip = { x: (1 - landmarks[4].x) * canvas.width, y: landmarks[4].y * canvas.height };

    const pinchX = (indexTip.x + thumbTip.x) / 2;
    const pinchY = (indexTip.y + thumbTip.y) / 2;
    const distance = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);

    const currentlyPinching = distance < 45;

    if (currentlyPinching) {
      if (!isPinching) {
        draggedPiece = puzzlePieces.find((p) =>
          !p.isLocked &&
          pinchX >= p.x && pinchX <= p.x + p.size &&
          pinchY >= p.y && pinchY <= p.y + p.size
        );
      }

      if (draggedPiece) {
        draggedPiece.x = pinchX - draggedPiece.size / 2;
        draggedPiece.y = pinchY - draggedPiece.size / 2;
      }
      isPinching = true;
    } else {
      if (draggedPiece) {
        const slot = gridSlots.find((s) => s.id === draggedPiece.id);
        if (slot) {
          const distToSlot = Math.hypot(
            (draggedPiece.x + draggedPiece.size / 2) - (slot.x + slot.size / 2),
            (draggedPiece.y + draggedPiece.size / 2) - (slot.y + slot.size / 2)
          );

          if (distToSlot < slot.size * 0.6) {
            draggedPiece.x = slot.x;
            draggedPiece.y = slot.y;
            draggedPiece.isLocked = true;
            slot.filled = true;
            checkVictory();
          }
        }
      }
      draggedPiece = null;
      isPinching = false;
    }

    ctx.fillStyle = currentlyPinching ? '#e74c3c' : '#277f53';
    ctx.beginPath();
    ctx.arc(pinchX, pinchY, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPuzzleBoard() {
    gridSlots.forEach((slot) => {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(slot.x, slot.y, slot.size, slot.size);
    });

    puzzlePieces.forEach((p) => {
      ctx.drawImage(p.img, p.x, p.y, p.size, p.size);

      ctx.strokeStyle = p.isLocked ? '#277f53' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = p.isLocked ? 3 : 1.5;
      ctx.strokeRect(p.x, p.y, p.size, p.size);
    });
  }

  function checkVictory() {
    const allLocked = puzzlePieces.every((p) => p.isLocked);
    if (allLocked && !isGameComplete) {
      isGameComplete = true;
      const hint = document.getElementById('p6-snap-hint');
      if (hint) {
        hint.innerText = '🎉 Gorgeous Puzzle Completed! ✨';
      }
    }
  }

})();
