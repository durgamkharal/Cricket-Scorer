
let state = {};
let history = []; 

const NUM_PLAYERS = () => +document.getElementById('players-per-side').value || 11;

function buildPlayerInputs(teamId, count) {
  const grid = document.getElementById(`team-${teamId}-players`);
  grid.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const def = teamId === 'a'
      
    const d = document.createElement('div');
    d.innerHTML = `<input type="text" placeholder="Player ${i}" value="${def[i-1]||''}">`;
    grid.appendChild(d);
  }
}

document.getElementById('players-per-side').addEventListener('change', () => {
  const n = NUM_PLAYERS();
  buildPlayerInputs('a', n);
  buildPlayerInputs('b', n);
});

buildPlayerInputs('a', 11);
buildPlayerInputs('b', 11);

function getPlayers(teamId) {
  const grid = document.getElementById(`team-${teamId}-players`);
  return Array.from(grid.querySelectorAll('input')).map((inp, i) => ({
    name: inp.value.trim() || `Player ${i+1}`,
    runs: 0, balls: 0, fours: 0, sixes: 0, out: false
  }));
}

function startMatch() {
  const totalOvers = +document.getElementById('total-overs').value || 20;
  const tossWinner = document.getElementById('toss-winner').value;
  const tossDecision = document.getElementById('toss-decision').value;

  let battingTeam, bowlingTeam;
  if ((tossWinner === 'A' && tossDecision === 'bat') || (tossWinner === 'B' && tossDecision === 'bowl')) {
    battingTeam = 'A'; bowlingTeam = 'B';
  } else {
    battingTeam = 'B'; bowlingTeam = 'A';
  }

  const nameA = document.getElementById('team-a-name').value.trim() || 'Team A';
  const nameB = document.getElementById('team-b-name').value.trim() || 'Team B';

  state = {
    totalOvers,
    teamA: { name: nameA, players: getPlayers('a'), bowlers: {} },
    teamB: { name: nameB, players: getPlayers('b'), bowlers: {} },
    innings: 1,
    battingTeam, // 'A' or 'B'
    // live match data (reset each innings)
    runs: 0, wickets: 0,
    balls: 0, // legal balls
    extras: { wd: 0, nb: 0, lb: 0, b: 0 },
    oversHistory: [], // array of over arrays
    currentOver: [], // balls this over
    strikerId: null, nonStrikerId: null,
    currentBowlerId: null,
    fallOfWickets: [],
    inn2: null // second innings state
  };

  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('match-screen').style.display = 'block';

  updateHeader();
  openOpenerModal();
}

function battingPlayers() {
  return state.battingTeam === 'A' ? state.teamA.players : state.teamB.players;
}
function bowlingPlayers() {
  return state.battingTeam === 'A' ? state.teamB.players : state.teamA.players;
}
function battingTeamObj() {
  return state.battingTeam === 'A' ? state.teamA : state.teamB;
}
function bowlingTeamObj() {
  return state.battingTeam === 'A' ? state.teamB : state.teamA;
}
function overs(balls) {
  return `${Math.floor(balls/6)}.${balls%6}`;
}
function rr(runs, balls) {
  if (!balls) return '0.00';
  return (runs / (balls/6)).toFixed(2);
}


let selectedOpeners = [];

function openOpenerModal() {
  selectedOpeners = [];
  const list = document.getElementById('opener-list');
  list.innerHTML = '';
  battingPlayers().forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'player-opt';
    d.textContent = p.name;
    d.dataset.idx = i;
    d.onclick = () => toggleOpener(d, i);
    list.appendChild(d);
  });
  document.getElementById('opening-overlay').classList.remove('hidden');
}

function toggleOpener(el, idx) {
  if (selectedOpeners.includes(idx)) {
    selectedOpeners = selectedOpeners.filter(x => x !== idx);
    el.classList.remove('selected');
  } else if (selectedOpeners.length < 2) {
    selectedOpeners.push(idx);
    el.classList.add('selected');
  }
}

function confirmOpeners() {
  if (selectedOpeners.length < 2) { alert('Select 2 openers'); return; }
  state.strikerId = selectedOpeners[0];
  state.nonStrikerId = selectedOpeners[1];
  document.getElementById('opening-overlay').classList.add('hidden');
  openBowlerModal('Start of innings. Select opening bowler.', false);
}


let selectedBowlerId = null;

function openBowlerModal(reason, allowSameBowler = false) {
  selectedBowlerId = null;
  document.getElementById('bowler-reason').textContent = reason || 'Select bowler for this over.';
  const list = document.getElementById('next-bowler-list');
  list.innerHTML = '';
  bowlingPlayers().forEach((p, i) => {
    // bowler can't bowl consecutive overs (unless only 1 bowler available)
    const isCurrent = i === state.currentBowlerId;
    const isBlocked = !allowSameBowler && isCurrent && bowlingPlayers().length > 1;
    const bowlerStats = getBowlerStats(i);
    const d = document.createElement('div');
    d.className = 'player-opt' + (isBlocked ? ' disabled' : '');
    d.innerHTML = `<b>${p.name}</b><br><small style="color:var(--muted)">${bowlerStats.o}ov ${bowlerStats.r}r ${bowlerStats.w}w</small>`;
    d.dataset.idx = i;
    if (!isBlocked) d.onclick = () => selectBowler(d, i);
    list.appendChild(d);
  });
  document.getElementById('new-bowler-overlay').classList.remove('hidden');
}

function selectBowler(el, idx) {
  document.querySelectorAll('#next-bowler-list .player-opt').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  selectedBowlerId = idx;
}

function confirmBowler() {
  if (selectedBowlerId === null) { alert('Select a bowler'); return; }
  state.currentBowlerId = selectedBowlerId;
  document.getElementById('new-bowler-overlay').classList.add('hidden');
  updateUI();
}

function changeBowler() {
  openBowlerModal('Change bowler.', false);
}

function getBowlerStats(idx) {
  const bowlerMap = bowlingTeamObj().bowlers;
  if (!bowlerMap[idx]) bowlerMap[idx] = { balls: 0, runs: 0, wickets: 0, maidens: 0 };
  const b = bowlerMap[idx];
  const legalBalls = b.balls;
  const fullOvers = Math.floor(legalBalls / 6);
  const partial = legalBalls % 6;
  return {
    o: `${fullOvers}.${partial}`,
    r: b.runs,
    w: b.wickets,
    m: b.maidens,
    eco: legalBalls ? (b.runs / (legalBalls/6)).toFixed(1) : '—'
  };
}


let selectedNewBatsman = null;
let wicketContext = null; // who got out

function openNewBatsmanModal(outIdx) {
  wicketContext = outIdx;
  selectedNewBatsman = null;
  document.getElementById('next-batsman-reason').textContent =
    `${battingPlayers()[outIdx].name} is out. Select the next batsman.`;
  const list = document.getElementById('next-batsman-list');
  list.innerHTML = '';
  battingPlayers().forEach((p, i) => {
    if (p.out) return;
    if (i === state.strikerId || i === state.nonStrikerId) return;
    const d = document.createElement('div');
    d.className = 'player-opt';
    d.textContent = p.name;
    d.dataset.idx = i;
    d.onclick = () => { document.querySelectorAll('#next-batsman-list .player-opt').forEach(x => x.classList.remove('selected')); d.classList.add('selected'); selectedNewBatsman = i; };
    list.appendChild(d);
  });
  if (!list.children.length) {
    endInnings();
    return;
  }
  document.getElementById('new-batsman-overlay').classList.remove('hidden');
}

function confirmBatsman() {
  if (selectedNewBatsman === null) { alert('Select next batsman'); return; }
  state.strikerId = selectedNewBatsman;
  document.getElementById('new-batsman-overlay').classList.add('hidden');
  updateUI();
}


function saveState() {
  history.push(JSON.parse(JSON.stringify(state)));
  if (history.length > 30) history.shift();
}

function addBall(value) {
  saveState();

  const bwlMap = bowlingTeamObj().bowlers;
  if (!bwlMap[state.currentBowlerId]) bwlMap[state.currentBowlerId] = { balls: 0, runs: 0, wickets: 0, maidens: 0 };
  const bowler = bwlMap[state.currentBowlerId];

  if (value === 'W') {
    // wicket
    const outBatter = battingPlayers()[state.strikerId];
    outBatter.balls++;
    outBatter.out = true;
    state.runs += 0;
    bowler.balls++;
    bowler.wickets++;
    state.balls++;
    state.wickets++;
    state.currentOver.push('W');
    state.fallOfWickets.push({ score: state.runs, wicket: state.wickets, over: overs(state.balls), batsman: outBatter.name });
    checkOverEnd();
    if (state.wickets < battingPlayers().length - 1 && state.wickets < battingPlayers().length) {
      openNewBatsmanModal(state.strikerId);
    } else {
      endInnings();
    }
  } else {
    // runs
    const batter = battingPlayers()[state.strikerId];
    batter.runs += value;
    batter.balls++;
    if (value === 4) batter.fours++;
    if (value === 6) batter.sixes++;
    state.runs += value;
    bowler.balls++;
    bowler.runs += value;
    state.balls++;
    state.currentOver.push(value);
    // rotate strike on odd runs
    if (value % 2 === 1) rotateStrike();
    checkOverEnd();
    updateUI();
  }
}

function addExtra(type) {
  saveState();
  const bwlMap = bowlingTeamObj().bowlers;
  if (!bwlMap[state.currentBowlerId]) bwlMap[state.currentBowlerId] = { balls: 0, runs: 0, wickets: 0, maidens: 0 };
  const bowler = bwlMap[state.currentBowlerId];

  // Wide / No Ball: 1 run penalty, doesn't count as legal ball
  if (type === 'Wd' || type === 'Nb') {
    state.runs += 1;
    bowler.runs += 1;
    state.extras[type === 'Wd' ? 'wd' : 'nb']++;
    state.currentOver.push(type);
    // No Ball gives free hit but we just track ball here, doesn't consume a delivery
    // Wide doesn't consume delivery
  }
  // Leg Bye / Bye: run off the bat but bowler doesn't get charged
  if (type === 'Lb' || type === 'B') {
    const runPrompt = prompt('How many leg byes / byes?', '1');
    const r = +runPrompt || 1;
    state.runs += r;
    state.extras[type === 'Lb' ? 'lb' : 'b'] += r;
    state.balls++;
    bowler.balls++;
    state.currentOver.push(`${type}${r}`);
    if (r % 2 === 1) rotateStrike();
    checkOverEnd();
  }
  updateUI();
}

function rotateStrike() {
  [state.strikerId, state.nonStrikerId] = [state.nonStrikerId, state.strikerId];
}

function checkOverEnd() {
  if (state.balls > 0 && state.balls % 6 === 0) {
    // over complete
    state.oversHistory.push([...state.currentOver]);
    // maiden check
    const bwlMap = bowlingTeamObj().bowlers;
    const bowler = bwlMap[state.currentBowlerId];
    const overRuns = state.currentOver.filter(b => typeof b === 'number').reduce((a,b) => a+b, 0);
    if (overRuns === 0 && !state.currentOver.includes('W')) {
      bowler.maidens++;
    }
    state.currentOver = [];
    // rotate strike at end of over
    rotateStrike();

    const overNum = state.balls / 6;
    flashOver(`End of Over ${overNum} — ${overRuns} runs`);

    // check if match over
    if (state.balls / 6 >= state.totalOvers) {
      endInnings();
      return;
    }
    // ask for new bowler
    openBowlerModal(`Over ${overNum} complete. Select next bowler.`);
  }
}

function undoLast() {
  if (!history.length) return;
  state = history.pop();
  updateUI();
}


function endInnings() {
  if (state.innings === 1) {
    // save first innings score
    const firstTeam = state.battingTeam;
    const inn1Score = state.runs;
    const inn1Wickets = state.wickets;
    const inn1Balls = state.balls;

    document.getElementById('result-banner').classList.remove('hidden');
    document.getElementById('result-text').textContent = `End of 1st Innings — ${battingTeamObj().name}: ${inn1Score}/${inn1Wickets}`;
    document.getElementById('result-sub').textContent = `Target: ${inn1Score + 1} runs`;
    document.getElementById('result-banner').querySelector('button').onclick = () => startSecondInnings(firstTeam, inn1Score);
    updateUI();
  } else {
    // match over
    showFinalResult();
  }
}

function startSecondInnings(firstBattingTeam, inn1Score) {
  // store first innings
  state.inn2 = {
    firstBattingTeam,
    inn1Score,
    inn1Wickets: state.wickets,
    inn1Balls: state.balls
  };

  // swap
  state.battingTeam = firstBattingTeam === 'A' ? 'B' : 'A';
  state.innings = 2;
  state.runs = 0; state.wickets = 0; state.balls = 0;
  state.extras = { wd: 0, nb: 0, lb: 0, b: 0 };
  state.oversHistory = []; state.currentOver = [];
  state.strikerId = null; state.nonStrikerId = null;
  state.currentBowlerId = null;
  state.fallOfWickets = [];
  // reset bowlers for second innings
  state.teamA.bowlers = {}; state.teamB.bowlers = {};

  document.getElementById('result-banner').classList.add('hidden');
  document.getElementById('innings-badge').textContent = '2nd Innings';

  // Update scoreboard to show 1st innings score on batting team side
  updateHeader();
  openOpenerModal();
}

function showFinalResult() {
  const inn2 = state.inn2;
  const target = inn2.inn1Score;
  let winner, detail;

  if (state.runs > target) {
    // chasing team wins
    const wicketsLeft = battingPlayers().length - 1 - state.wickets;
    winner = `${battingTeamObj().name} WIN`;
    detail = `by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
  } else if (state.runs === target) {
    winner = 'MATCH TIED!';
    detail = `Both teams scored ${target} runs`;
  } else {
    // first batting team wins
    const firstTeam = inn2.firstBattingTeam === 'A' ? state.teamA : state.teamB;
    winner = `${firstTeam.name} WIN`;
    const diff = target - state.runs;
    detail = `by ${diff} run${diff !== 1 ? 's' : ''}`;
  }

  document.getElementById('final-winner').textContent = winner;
  document.getElementById('final-detail').textContent = detail;
  document.getElementById('result-overlay').classList.remove('hidden');
}


function updateUI() {
  updateHeader();
  updateBattingTable();
  updateBowlingTable();
  updateFoW();
  updateBallsRow();
  updateOverLabel();
}

function updateHeader() {
  document.getElementById('sb-name-a').textContent = state.teamA.name;
  document.getElementById('sb-name-b').textContent = state.teamB.name;
  document.getElementById('batting-team-label').textContent = battingTeamObj().name;
  document.getElementById('bowling-team-label').textContent = bowlingTeamObj().name;

  // set scores
  const battingIsA = state.battingTeam === 'A';

  const batscore = `${state.runs}/${state.wickets}`;
  const batOvers = `${overs(state.balls)} ov`;
  const batExtras = extrasString();

  const showInn1 = state.innings === 2 && state.inn2;
  const inn1Label = showInn1 ? `${state.inn2.inn1Score}/${state.inn2.inn1Wickets} (${overs(state.inn2.inn1Balls)} ov)` : 'Yet to bat';
  const targetLabel = showInn1 ? `Target: ${state.inn2.inn1Score + 1}` : '';

  if (battingIsA) {
    document.getElementById('sb-score-a').textContent = batscore;
    document.getElementById('sb-overs-a').textContent = `${batOvers} • RR: ${rr(state.runs, state.balls)}`;
    document.getElementById('sb-extras-a').textContent = batExtras;
    document.getElementById('sb-score-b').textContent = showInn1 ? inn1Label : 'Yet to bat';
    document.getElementById('sb-overs-b').textContent = showInn1 ? targetLabel : '';
    document.getElementById('sb-extras-b').textContent = '';
  } else {
    document.getElementById('sb-score-b').textContent = batscore;
    document.getElementById('sb-overs-b').textContent = `${batOvers} • RR: ${rr(state.runs, state.balls)}`;
    document.getElementById('sb-extras-b').textContent = batExtras;
    document.getElementById('sb-score-a').textContent = showInn1 ? inn1Label : 'Yet to bat';
    document.getElementById('sb-overs-a').textContent = showInn1 ? targetLabel : '';
    document.getElementById('sb-extras-a').textContent = '';
  }
}

function extrasString() {
  const e = state.extras;
  const total = e.wd + e.nb + e.lb + e.b;
  return `Extras: ${total} (wd ${e.wd}, nb ${e.nb}, lb ${e.lb}, b ${e.b})`;
}

function updateBattingTable() {
  const tbody = document.getElementById('batting-tbody');
  tbody.innerHTML = '';
  battingPlayers().forEach((p, i) => {
    if (p.runs === 0 && p.balls === 0 && !p.out && i !== state.strikerId && i !== state.nonStrikerId) return;
    if (p.out && p.balls === 0) return; // ghost
    const sr = p.balls ? ((p.runs / p.balls) * 100).toFixed(0) : '—';
    const isStriker = i === state.strikerId;
    const isNonStriker = i === state.nonStrikerId;
    const nameClass = isStriker ? 'batsman-name on-strike' : 'batsman-name';
    const statusTxt = p.out ? '<span style="color:var(--red);font-size:0.7rem">OUT</span>' : (isStriker ? '' : (isNonStriker ? '<span style="font-size:0.65rem;color:var(--muted)">NS</span>' : ''));
    const srClass = !p.balls ? '' : (+sr >= 150 ? 'sr-good' : +sr >= 100 ? 'sr-ok' : 'sr-bad');
    tbody.innerHTML += `<tr>
      <td><span class="${nameClass}">${p.name}</span> ${statusTxt}</td>
      <td>${p.runs}</td><td>${p.balls}</td><td>${p.fours}</td><td>${p.sixes}</td>
      <td class="${srClass}">${sr}</td>
    </tr>`;
  });
}

function updateBowlingTable() {
  const tbody = document.getElementById('bowling-tbody');
  tbody.innerHTML = '';
  const bMap = bowlingTeamObj().bowlers;
  bowlingPlayers().forEach((p, i) => {
    if (!bMap[i]) return;
    const s = getBowlerStats(i);
    const isCurrent = i === state.currentBowlerId;
    tbody.innerHTML += `<tr>
      <td class="bowler-name" style="${isCurrent ? 'color:var(--amber)' : ''}">${p.name}${isCurrent ? ' ●' : ''}</td>
      <td>${s.o}</td><td>${s.m}</td><td>${s.r}</td><td>${s.w}</td><td>${s.eco}</td>
    </tr>`;
  });
}

function updateFoW() {
  const el = document.getElementById('fow-list');
  if (!state.fallOfWickets.length) { el.textContent = '—'; return; }
  el.textContent = state.fallOfWickets.map(f => `${f.wicket}-${f.score} (${f.batsman}, ${f.over} ov)`).join('  •  ');
}

function updateBallsRow() {
  const row = document.getElementById('balls-row');
  row.innerHTML = '';

  // show up to last 3 overs + current
  const allOvers = [...state.oversHistory.slice(-3), state.currentOver];

  allOvers.forEach((over, oi) => {
    if (oi > 0) {
      const gap = document.createElement('div');
      gap.className = 'ball-over-gap';
      row.appendChild(gap);
    }
    over.forEach(b => {
      const d = document.createElement('div');
      const cls = b === 'W' ? 'ball-W' : typeof b === 'number' ? `ball-${Math.min(b,6)}` : `ball-${b.replace(/[0-9]/,'')}`;
      d.className = `ball-dot ${cls}`;
      d.textContent = b === 0 ? '•' : b;
      row.appendChild(d);
    });
  });

  // this over runs
  const thisOverRuns = state.currentOver.filter(b => typeof b === 'number').reduce((a,b) => a+b, 0);
  document.getElementById('this-over-runs').textContent = thisOverRuns;

  // bowler name
  if (state.currentBowlerId !== null) {
    document.getElementById('current-bowler-name').textContent = bowlingPlayers()[state.currentBowlerId].name;
  }
}

function updateOverLabel() {
  const completedOvers = Math.floor(state.balls / 6);
  const ballInOver = state.balls % 6;
  const label = ballInOver > 0 ? `Over ${completedOvers + 1} · Ball ${ballInOver}` : `Over ${completedOvers + 1}`;
  document.getElementById('current-over-label').textContent = label;
}


function flashOver(msg) {
  const el = document.getElementById('over-flash');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}