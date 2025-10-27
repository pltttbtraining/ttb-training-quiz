// app.js
const express = require('express');
const http = require('http');
const { nanoid } = require('nanoid');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

app.use(express.static('public'));

// In-memory rooms store (for demo/prototype)
const rooms = {}; // { roomCode: { hostId, players: {}, settings: {}, questions: [], state } }

// Utility to generate 6-digit room codes
function makeRoomCode() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

// Basic question bank generated from product data (can expand)
const PRODUCT_QUESTIONS = {
  "Smart Bonus 10/5": [
    { qId: nanoid(), type: 'mcq', q: "ระยะเวลาคุ้มครองของ Smart Bonus 10/5 คือกี่ปี?", options: ["5 ปี","10 ปี","14 ปี","15 ปี"], a: "10 ปี", level:1 },
    { qId: nanoid(), type: 'mcq', q: "Smart Bonus ให้เงินคืนระหว่างสัญญาปีใดบ้าง?", options: ["ปีที่ 2,4,6,8","ปีที่ 1-4","ปีที่ 5-10","ปีที่ 2-6"], a: "ปีที่ 2,4,6,8", level:2 },
    { qId: nanoid(), type: 'mcq', q: "Smart Bonus เหมาะกับลูกค้ากลุ่มใด?", options: ["วัยทำงาน/First Jobber","ต้องการคุ้มครองสูงสุด","นักลงทุนระยะยาว","ต้องการลดความเสี่ยงอัตราแลกเปลี่ยน"], a: "วัยทำงาน/First Jobber", level:1 }
  ],
  "Happy Retire 90/5": [
    { qId: nanoid(), type: 'mcq', q: "Happy Retire 90/5 เหมาะกับกลุ่มใด?", options: ["วางแผนเกษียณ","First Jobber","เด็กนักเรียน","ผู้รับบำนาญเท่านั้น"], a: "วางแผนเกษียณ", level:1 },
    { qId: nanoid(), type: 'mcq', q: "จุดเด่นเรื่องลดหย่อนภาษีของ Happy Retire สูงสุดเท่าไหร่/ปี?", options: ["100,000","150,000","200,000","250,000"], a: "200,000", level:2 },
    { qId: nanoid(), type: 'mcq', q: "เมื่อลูกค้าต้องการรายได้บำนาญเป็นประจำ ควรอธิบาย:", options: ["บำนาญปกติ 15% ของทุนประกันภัย","เงินปันผลรับรอง","ไม่มีบำนาญ","จ่ายครั้งเดียว"], a: "บำนาญปกติ 15% ของทุนประกันภัย", level:2 }
  ],
  "Money Saver 14/6": [
    { qId: nanoid(), type: 'mcq', q: "Money Saver เป็นแบบมีหรือไม่มีเงินปันผล?", options: ["มีเงินปันผล","ไม่มีเงินปันผล (Non-Par)","ขึ้นกับตลาด","ขึ้นกับบริษัท"], a: "ไม่มีเงินปันผล (Non-Par)", level:1 },
    { qId: nanoid(), type: 'mcq', q: "ระยะเวลาชำระเบี้ยของ Money Saver คือกี่ปี?", options: ["5 ปี","6 ปี","10 ปี","14 ปี"], a: "6 ปี", level:1 },
    { qId: nanoid(), type: 'mcq', q: "ลูกค้ารายได้สูงต้องการผลตอบแทนแน่นอน แนะนำอย่างไร?", options: ["แนะนำ Money Saver","แนะนำ Index-linked เท่านั้น","แนะนำตัดความเสี่ยง","ไม่แนะนำเลย"], a: "แนะนำ Money Saver", level:3 }
  ],
  "Global Index 15/5 Plus": [
    { qId: nanoid(), type: 'mcq', q: "Global Index ใช้อ้างอิงดัชนีใด?", options: ["Eastspring Global Diversified Multi Asset Index","SET Index","S&P 500","ไม่มีดัชนี"], a: "Eastspring Global Diversified Multi Asset Index", level:2 },
    { qId: nanoid(), type: 'mcq', q: "ความเสี่ยงสำคัญที่ต้องอธิบายคืออะไร?", options: ["อัตราแลกเปลี่ยนและดัชนี","ไม่มีความเสี่ยง","ความเสี่ยงจากบริษัทเท่านั้น","ความเสี่ยงด้านอาชีพ"], a: "อัตราแลกเปลี่ยนและดัชนี", level:2 },
    { qId: nanoid(), type: 'mcq', q: "การจ่ายเงินคืนระหว่างสัญญาเป็นอย่างไร?", options: ["ทุก 2 ปี 2.5% ของทุน","ไม่มีเงินคืน","ทุกปี 1%","เมื่อหมดสัญญา"], a: "ทุก 2 ปี 2.5% ของทุน", level:2 }
  ]
};

// Socket.IO events
io.on('connection', socket => {
  console.log('conn', socket.id);

  // Create room (host)
  socket.on('createRoom', ({ hostName }) => {
    const roomCode = makeRoomCode();
    rooms[roomCode] = {
      hostId: socket.id,
      hostName: hostName || 'Host',
      players: {}, // { socketId: {name, score} }
      settings: { products: [], level:1 },
      questions: [],
      state: 'idle', // idle | running | finished
      currentIndex: -1
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, hostName: rooms[roomCode].hostName });
    console.log('room created', roomCode);
  });

  // Join room (player)
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    if (!rooms[roomCode]) {
      socket.emit('errorMsg', 'ไม่พบห้องนี้');
      return;
    }
    rooms[roomCode].players[socket.id] = { name: playerName || 'Player', score: 0 };
    socket.join(roomCode);

    // inform host & players
    io.to(roomCode).emit('roomUpdate', {
      roomCode,
      hostName: rooms[roomCode].hostName,
      players: Object.values(rooms[roomCode].players)
    });
  });

  // Host sets settings (select products + level)
  socket.on('setSettings', ({ roomCode, products, level }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    room.settings.products = products;
    room.settings.level = level || 1;

    // Build question list from product selection and level
    const chosenQs = [];
    products.forEach(p => {
      const bank = PRODUCT_QUESTIONS[p] || [];
      bank.forEach(q => { if (q.level <= level) chosenQs.push(q); });
    });

    // shuffle chosenQs
    for (let i = chosenQs.length -1; i>0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [chosenQs[i], chosenQs[j]] = [chosenQs[j], chosenQs[i]];
    }
    room.questions = chosenQs;
    room.currentIndex = -1;
    io.to(roomCode).emit('settingsSaved', { products, level, totalQuestions: chosenQs.length });
  });

  // Host starts game
  socket.on('startGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    if (room.questions.length === 0) {
      socket.emit('errorMsg', 'ไม่มีคำถามในห้องนี้ — กรุณาเลือกสินค้า/ระดับความยาก');
      return;
    }
    room.state = 'running';
    room.currentIndex = -1;
    io.to(roomCode).emit('gameStarted');
    nextQuestion(roomCode);
  });

  // Next question (host or auto)
  socket.on('nextQuestion', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    nextQuestion(roomCode);
  });

  // Player answer
  socket.on('submitAnswer', ({ roomCode, qId, answer }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;
    const currentQ = room.questions[room.currentIndex];
    if (!currentQ || currentQ.qId !== qId) return;

    // score: correct = +100; early bonus based on time provided by client (optional)
    const correct = currentQ.a === answer;
    if (correct) player.score += 100;
    // mark answered to avoid duplicate scoring (simple)
    player.answered = player.answered || {};
    if (!player.answered[qId]) player.answered[qId] = { answer, correct };
    // update leaderboard
    io.to(roomCode).emit('leaderboard', { players: mapPlayers(room) });
    // send acknowledgment to player
    socket.emit('answerResult', { correct, correctAnswer: currentQ.a });
  });

  // End game
  socket.on('endGame', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.hostId) return;
    room.state = 'finished';
    io.to(roomCode).emit('gameEnded', { leaderboard: mapPlayers(room) });
  });

  // disconnect
  socket.on('disconnect', () => {
    // remove from any rooms
    for (const code of Object.keys(rooms)) {
      const r = rooms[code];
      if (r.hostId === socket.id) {
        // end room for demo
        io.to(code).emit('errorMsg', 'Host disconnected — ห้องปิดการใช้งาน');
        delete rooms[code];
      } else if (r.players[socket.id]) {
        delete r.players[socket.id];
        io.to(code).emit('roomUpdate', {
          roomCode: code,
          hostName: r.hostName,
          players: Object.values(r.players)
        });
      }
    }
  });
});

// helper to send next question
function nextQuestion(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.currentIndex++;
  if (room.currentIndex >= room.questions.length) {
    room.state = 'finished';
    io.to(roomCode).emit('gameEnded', { leaderboard: mapPlayers(room) });
    return;
  }
  // reset answered markers
  Object.values(room.players).forEach(p => p.answered = {});
  const q = room.questions[room.currentIndex];
  io.to(roomCode).emit('question', {
    qId: q.qId,
    index: room.currentIndex+1,
    total: room.questions.length,
    q: q.q,
    options: q.options,
    timer: 25 // seconds
  });
  // Optionally auto-end question after timer (server-side)
  setTimeout(() => {
    // send correct answer and update scoreboard (no extra scoring)
    io.to(roomCode).emit('reveal', { qId: q.qId, correctAnswer: q.a, leaderboard: mapPlayers(room) });
  }, 25000 + 200); // reveal slightly after timeout
}

function mapPlayers(room) {
  return Object.values(room.players).map(p => ({ name: p.name, score: p.score }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on', PORT));
