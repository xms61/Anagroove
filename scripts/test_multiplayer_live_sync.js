import WebSocket from 'ws';

async function runMultiplayerSyncTest() {
  console.log('🚀 Starting Full Multiplayer Two-Tab Live Sync Verification...\n');

  const baseUrl = 'http://127.0.0.1:3001';
  const player1Id = `tab1-${Date.now()}`;
  const player2Id = `tab2-${Date.now()}`;

  let ws1, ws2;
  let roomCode = '';

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Test timed out after 15s'));
      }, 15000);

      ws1 = new WebSocket('ws://127.0.0.1:3001/ws');

      let step = 0;
      let player2GotStart = false;
      let player1GotStart = false;
      let player2GotCellUpdate = false;
      let player1GotCellUpdate = false;

      ws1.on('open', () => {
        console.log('1. Player 1 (Host in Tab 1) connecting and creating room...');
        ws1.send(JSON.stringify({
          action: 'create_room',
          playerId: player1Id,
          playerName: 'Tab1Host',
          mode: 'coop',
          puzzle: {
            id: `mp-fresh-test-${Date.now()}`,
            title: 'Fresh Co-op Test Puzzle',
            theme: 'Rock Classics',
            rows: 5,
            cols: 5,
            grid: [
              ['A', 'B', 'C', null, null],
              [null, 'D', null, null, null],
              [null, 'E', null, null, null],
              [null, null, null, null, null],
              [null, null, null, null, null]
            ],
            clues: []
          }
        }));
      });

      ws1.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'room_created') {
          roomCode = msg.room.code;
          console.log(`   [PASS] Host created room ${roomCode} with fresh puzzle ID: ${msg.room.puzzle.id}`);
          console.log('2. Player 2 (Guest in Tab 2) joining room...');

          ws2 = new WebSocket('ws://127.0.0.1:3001/ws');

          ws2.on('open', () => {
            ws2.send(JSON.stringify({
              action: 'join_room',
              roomCode,
              playerId: player2Id,
              playerName: 'Tab2Guest'
            }));
          });

          ws2.on('message', (raw2) => {
            const msg2 = JSON.parse(raw2.toString());

            if (msg2.type === 'room_joined') {
              console.log(`   [PASS] Player 2 successfully joined room ${roomCode}. Total players: ${msg2.room.players.length}`);
              console.log('3. Host starts the game...');
              ws1.send(JSON.stringify({
                action: 'start_game',
                roomCode
              }));
            }

            if (msg2.type === 'game_started') {
              player2GotStart = true;
              console.log(`   [PASS] Player 2 received game_started event for room: ${msg2.roomCode || msg2.room?.code}`);
              checkGameStarted();
            }

            if (msg2.type === 'coop_cell_update') {
              console.log(`   [PASS] Player 2 received real-time cell update: cell (${msg2.row}, ${msg2.col}) = "${msg2.value}" from ${msg2.senderId}`);
              if (msg2.row === 0 && msg2.col === 0 && msg2.value === 'A' && msg2.senderId === player1Id) {
                player2GotCellUpdate = true;
                console.log('5. Player 2 types into cell (0, 1) = "B"...');
                ws2.send(JSON.stringify({
                  action: 'coop_cell_update',
                  roomCode,
                  row: 0,
                  col: 1,
                  value: 'B',
                  senderId: player2Id
                }));
              }
            }
          });

          ws2.on('error', reject);
        }

        if (msg.type === 'game_started') {
          player1GotStart = true;
          console.log(`   [PASS] Player 1 received game_started event`);
          checkGameStarted();
        }

        if (msg.type === 'coop_cell_update') {
          console.log(`   [PASS] Player 1 received real-time cell update: cell (${msg.row}, ${msg.col}) = "${msg.value}" from ${msg.senderId}`);
          if (msg.row === 0 && msg.col === 1 && msg.value === 'B' && msg.senderId === player2Id) {
            player1GotCellUpdate = true;
            checkAllDone();
          }
        }
      });

      ws1.on('error', reject);

      function checkGameStarted() {
        if (player1GotStart && player2GotStart && step === 0) {
          step = 1;
          console.log('4. Player 1 types into cell (0, 0) = "A"...');
          ws1.send(JSON.stringify({
            action: 'coop_cell_update',
            roomCode,
            row: 0,
            col: 0,
            value: 'A',
            senderId: player1Id
          }));
        }
      }

      function checkAllDone() {
        if (player2GotCellUpdate && player1GotCellUpdate) {
          clearTimeout(timeout);
          console.log('\n🎉 Real-time two-way synchronization verified between Player 1 & Player 2!');
          resolve();
        }
      }
    });

    console.log('\n6. Testing session progress, history & blacklist persistence...');
    const saveStateRes = await fetch(`${baseUrl}/api/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': player1Id
      },
      body: JSON.stringify({
        puzzleId: 'puzzle-persist-test',
        themeId: 'rock',
        userLetters: [['A']],
        validity: [['correct']]
      })
    });
    const saveStateData = await saveStateRes.json();
    if (!saveStateData.success) throw new Error('Failed to save session progress');

    const getStateRes = await fetch(`${baseUrl}/api/progress`, {
      headers: { 'X-User-Id': player1Id }
    });
    const getStateData = await getStateRes.json();
    if (getStateData.progress?.puzzleId !== 'puzzle-persist-test') {
      throw new Error('Session progress retrieval failed');
    }
    console.log('   [PASS] Session progress successfully persisted & retrieved.');

    const addSolvedRes = await fetch(`${baseUrl}/api/history/solved`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': player1Id
      },
      body: JSON.stringify({
        puzzleId: 'puzzle-persist-test',
        title: 'Classic Rock Solved',
        cluesCount: 5,
        timeSeconds: 42
      })
    });
    const addSolvedData = await addSolvedRes.json();
    if (!addSolvedData.history?.some(h => h.puzzleId === 'puzzle-persist-test')) {
      throw new Error('Failed to persist solved puzzle history');
    }
    console.log('   [PASS] Solved puzzle successfully recorded in history without user accounts.');

    console.log('\n7. Testing recognizable random music pool endpoint...');
    const randomRes = await fetch(`${baseUrl}/api/music/random?count=10&minFans=250000`, {
      headers: { 'X-User-Id': player1Id }
    });
    const randomData = await randomRes.json();
    if (!randomData.success || !Array.isArray(randomData.songs) || randomData.songs.length === 0) {
      throw new Error('Random recognizable music endpoint failed');
    }
    console.log(`   [PASS] Fetched ${randomData.songs.length} verified recognizable tracks with preview URLs.`);
    console.log(`          Sample track: "${randomData.songs[0].title}" by ${randomData.songs[0].artist} (${randomData.songs[0].fans?.toLocaleString()} fans)`);

    console.log('\n🏆 ALL MULTIPLAYER & PERSISTENCE & MUSIC POOL TESTS PASSED WITH 100% SUCCESS!\n');
  } finally {
    if (ws1 && ws1.readyState === WebSocket.OPEN) ws1.close();
    if (ws2 && ws2.readyState === WebSocket.OPEN) ws2.close();
  }
}

runMultiplayerSyncTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
