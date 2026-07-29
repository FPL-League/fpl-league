const state = {
    currentWeek: 1,
    players: [
        { id: 'p1', teamId: 't1', position: 'forvet', goals: 0, assists: 0, saves: 0, tackles: 0, yellowCards: 0, redCards: 0, value: 100, valueHistory: [{week: 1, value: 100}] }
    ],
    matches: [
        { id: 'm1', homeTeam: 't1', awayTeam: 't2', week: 1 }
    ]
};

function updateMatchValues(match, statLogs) {
    const allPlayersInMatch = state.players.filter(p => p.teamId === match.homeTeam || p.teamId === match.awayTeam);
    console.log('Players in match:', allPlayersInMatch.length);
    
    const pStats = {};
    allPlayersInMatch.forEach(p => {
        pStats[p.id] = { goals: 0, assists: 0, saves: 0, tackles: 0, yellows: 0, reds: 0, matchPoints: 0 };
    });
    
    statLogs.forEach(log => {
        if (!pStats[log.playerId]) return;
        const s = pStats[log.playerId];
        if (log.type === 'goal') s.goals += log.count;
        if (log.type === 'assist') s.assists += log.count;
        if (log.type === 'save') s.saves += log.count;
        if (log.type === 'tackle') s.tackles += log.count;
        if (log.type === 'yellow') s.yellows += log.count;
        if (log.type === 'red') s.reds += log.count;
        if (log.type === 'match_points') s.matchPoints = log.count;
    });

    const currentWeek = match.week || state.currentWeek || 1;

    Object.keys(pStats).forEach(pid => {
        const p = state.players.find(x => x.id === pid);
        if (!p) return;
        const s = pStats[pid];
        
        let valueChange = 0;
        
        valueChange += s.goals * 30;
        valueChange += s.assists * 20;
        if (p.position === 'kaleci') valueChange += s.saves * 5;
        if (p.position === 'defans') valueChange += s.tackles * 3;
        
        if (s.matchPoints >= 1000) valueChange += 100;
        else if (s.matchPoints >= 500) valueChange += 50;
        else if (s.matchPoints >= 300) valueChange += 30;
        else if (s.matchPoints >= 100) valueChange += 10;
        
        if (s.matchPoints < 100 && s.matchPoints > 0) valueChange -= 50;
        
        if (p.position === 'forvet' && s.goals === 0) valueChange -= 25;
        if (p.position === 'orta_saha' && s.assists === 0) valueChange -= 20;
        if (p.position === 'kaleci' && s.saves < 3) valueChange -= 40;
        if (p.position === 'defans' && s.tackles < 8) valueChange -= 25;
        
        valueChange -= s.yellows * 5;
        valueChange -= s.reds * 10;
        
        console.log('Value change for', pid, 'is', valueChange);
        p.value = Math.max(10, (p.value || 100) + valueChange);
        
        if (!p.valueHistory) p.valueHistory = [{ week: 1, value: 100 }];
        const lastEntry = p.valueHistory[p.valueHistory.length - 1];
        if (lastEntry.week === currentWeek) {
            lastEntry.value = p.value;
        } else {
            p.valueHistory.push({ week: currentWeek, value: p.value });
        }
    });
}

updateMatchValues(state.matches[0], [{ playerId: 'p1', type: 'goal', count: 1 }]);
console.log('Final value:', state.players[0].value);
