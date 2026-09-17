import WebSocket from 'ws';

async function testAll() {
  console.log('🧪 Starting SpotySpice Feature Verification Tests...\n');

  const testUserId = `test-user-${Date.now()}`;
  const baseUrl = 'http://127.0.0.1:3001';

  // 1. Test Server Health
  console.log('1. Testing Backend API Health...');
  const healthRes = await fetch(`${baseUrl}/api/health`, { headers: { 'X-User-Id': testUserId } });
  const health = await healthRes.json();
  if (health.status !== 'ok') throw new Error('Health check failed');
  console.log('   [PASS] Backend API is live & healthy.');

  // 2. Test Anonymous Session Progress Persistence
  console.log('\n2. Testing Anonymous Progress Persistence (No Accounts)...');
  const dummyGrid = [['T', 'I', 'M'], ['B', 'E', 'R']];
  const dummyVal = [['correct', 'correct', 'correct'], ['correct', 'correct', 'correct']];

  await fetch(`${baseUrl}/api/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
    body: JSON.stringify({
      puzzleId: 'puzzle-test-101',
      themeId: 'rock',
      userLetters: dummyGrid,
      validity: dummyVal
    })
  });

  const getProgressRes = await fetch(`${baseUrl}/api/progress`, {
    headers: { 'X-User-Id': testUserId }
  });
  const savedData = await getProgressRes.json();
  if (savedData.progress?.puzzleId !== 'puzzle-test-101' || savedData.progress?.userLetters[0][0] !== 'T') {
    throw new Error('Progress persistence mismatch');
  }
  console.log('   [PASS] Progress successfully saved and retrieved server-side without account.');

  // 3. Test Blacklist API
  console.log('\n3. Testing Server Blacklist Sync...');
  await fetch(`${baseUrl}/api/blacklist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': testUserId },
    body: JSON.stringify({ name: 'Nickelback', type: 'artist' })
  });

  const blRes = await fetch(`${baseUrl}/api/blacklist`, { headers: { 'X-User-Id': testUserId } });
  const blData = await blRes.json();
  if (!blData.blacklist.some(b => b.name === 'Nickelback')) {
    throw new Error('Blacklist failed to persist');
  }
  console.log('   [PASS] Blacklist successfully added and persisted server-side.');

  // 4. Test WebSocket Multiplayer Room
  console.log('\n4. Testing Real-time Multiplayer WebSocket Room...');
  await new Promise((resolve, reject) => {
    const ws1 = new WebSocket('ws://127.0.0.1:3001/ws');
    let roomCode = '';

    ws1.on('open', () => {
      ws1.send(JSON.stringify({
        action: 'create_room',
        playerId: testUserId,
        playerName: 'HostTester',
        mode: 'coop',
        puzzle: { id: 'p1', rows: 5, cols: 5, clues: [] }
      }));
    });

    ws1.on('message', (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.type === 'room_created') {
        roomCode = data.room.code;
        console.log(`   [PASS] Room created with code: ${roomCode}`);

        // Client 2 joins room
        const ws2 = new WebSocket('ws://127.0.0.1:3001/ws');
        ws2.on('open', () => {
          ws2.send(JSON.stringify({
            action: 'join_room',
            roomCode,
            playerId: 'player-2-guest',
            playerName: 'GuestTester'
          }));
        });

        ws2.on('message', (raw2) => {
          const data2 = JSON.parse(raw2.toString());
          if (data2.type === 'room_joined') {
            console.log(`   [PASS] Player 2 joined room ${roomCode} successfully.`);
            ws1.close();
            ws2.close();
            resolve();
          }
        });
      }
    });

    ws1.on('error', reject);
  });

  console.log('\n🎉 ALL 4 FEATURE TEST SUITES PASSED FLAWLESSLY!\n');
}

testAll().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
