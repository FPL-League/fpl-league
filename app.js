// ==========================================================================
// FPL Ultimate Market, Packs and Economy - Core Application JS
// ==========================================================================

// --- SEED ADMIN CREATION ---
const DEFAULT_ADMIN = {
    username: "admin",
    nickname: "Sistem Yöneticisi",
    password: "admin123",
    role: "admin",
    coins: 99999,
    inventory: []
};

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDkT0xcXXf5S_bD-Dz4LFjM-_kU5qNenuA",
    authDomain: "fpl-league-23188.firebaseapp.com",
    projectId: "fpl-league-23188",
    storageBucket: "fpl-league-23188.firebasestorage.app",
    messagingSenderId: "992402043869",
    appId: "1:992402043869:web:5b19e1d0e3b99b8ff7bc34",
    measurementId: "G-XGMGQ5CG64",
    databaseURL: "https://fpl-league-23188-default-rtdb.firebaseio.com" 
};

// If firebase is defined, initialize it
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
}
const db = typeof firebase !== 'undefined' ? firebase.database() : null;

// --- APP STATE CONTAINER ---
let state = {
    users: [DEFAULT_ADMIN], // Failsafe so admin can login instantly before Firebase loads
    teams: [],
    players: [],
    matches: [],
    marketListings: [],
    tradeOffers: [],
    chatMessages: [],
    news: [],
    posts: [],
    bets: [],
    currentUser: null,
    currentWeek: 1,
    isLoaded: false,
    selectedDraftSlot: null,
    draftSquad: {
        kaleci: null,
        defans: null,
        orta_saha_1: null,
        orta_saha_2: null,
        forvet: null
    }
};

// --- RANDOM NAMES GENERATOR FOR PACKS ---
const PACK_NAMES_FIRST = ["Gökhan", "Arda", "Can", "Kerem", "Emre", "Barış", "Yunus", "Semih", "Cenk", "Hakan", "Ferdi", "Mert", "Okan", "Uğur", "Burak", "Taylan", "İrfan", "Ahmet", "Mehmet"];
const PACK_NAMES_LAST = ["Kaya", "Çelik", "Yılmaz", "Demir", "Öztürk", "Şahin", "Yıldız", "Aydın", "Özdemir", "Arslan", "Kılıç", "Doğan", "Bulut", "Güneş", "Erdoğan", "Aslan", "Köse"];

// --- INIT APP ---
window.onload = function() {
    loadDatabase();
    initNavigation();
    initAuthHandlers();
    initMarketHandlers();
    initChatHandlers();
    initEventHandlers();
    
    // Initial Render
    renderAll();
};

// --- DATABASE LOAD / SAVE ---
function loadDatabase() {
    // Session auth restore (always local)
    const session = localStorage.getItem("fpl_session");
    if (session) {
        state.currentUser = JSON.parse(session);
        state.draftSquad = state.currentUser.draftSquad || { kaleci: null, defans: null, orta_saha_1: null, orta_saha_2: null, forvet: null };
    } else {
        state.draftSquad = { kaleci: null, defans: null, orta_saha_1: null, orta_saha_2: null, forvet: null };
    }
    
    // Offline-first: Restore full state from local cache immediately so UI doesn't block
    const cachedState = localStorage.getItem("fpl_full_state");
    if (cachedState) {
        try {
            const parsed = JSON.parse(cachedState);
            state.users = parsed.users || [];
            state.teams = parsed.teams || [];
            state.players = parsed.players || [];
            state.matches = parsed.matches || [];
            state.marketListings = parsed.marketListings || [];
            state.tradeOffers = parsed.tradeOffers || [];
            state.chatMessages = parsed.chatMessages || [];
            state.news = parsed.news || [];
            state.posts = parsed.posts || [];
            state.bets = parsed.bets || [];
            state.currentWeek = parsed.currentWeek || 1;
            state.isLoaded = true;
            // No need to call renderAll here since window.onload calls it right after loadDatabase
        } catch (e) {
            console.error("Local cache invalid", e);
        }
    }

    if (db) {
        db.ref('fpl_state').on('value', (snapshot) => {
            const data = snapshot.val();
            state.isLoaded = true;
            if (data && data.users && data.users.length > 0) {
                state.users = data.users || [];
                state.teams = data.teams || [];
                state.players = data.players || [];
                state.matches = data.matches || [];
                state.marketListings = data.marketListings || [];
                state.tradeOffers = data.tradeOffers || [];
                state.chatMessages = data.chatMessages || [];
                state.news = data.news || [];
                state.posts = data.posts || [];
                state.bets = data.bets || [];
                state.currentWeek = data.currentWeek || 1;

                // ONE-TIME CLEANUP: migrate base64 avatars from Firebase to localStorage
                // (don't call saveDatabase here to avoid circular write)
                state.users.forEach(u => {
                    if (u.avatar && u.avatar.startsWith('data:')) {
                        localStorage.setItem(`fpl_avatar_${u.username}`, u.avatar);
                        // Keep avatar in state for sync; do not delete
                    }
                });
                state.players.forEach(p => {
                    if (p.avatar && p.avatar.startsWith('data:')) {
                        localStorage.setItem(`fpl_avatar_${p.username}`, p.avatar);
                        // Keep avatar in state for sync; do not delete
                    }
                });

                // Sync current user reference
                if (state.currentUser) {
                    const freshUser = state.users.find(u => u.username === state.currentUser.username);
                    if (freshUser) {
                        state.currentUser = { ...freshUser, draftSquad: state.draftSquad };
                        if (state.currentUser.username === 'admin') state.currentUser.role = 'admin';
                        const localAvatar = localStorage.getItem(`fpl_avatar_${state.currentUser.username}`);
                        if (localAvatar) state.currentUser.avatar = localAvatar;
                    } else {
                        state.currentUser = null;
                        localStorage.removeItem("fpl_session");
                    }
                }
                
                // Restore avatars: use Firebase avatar if present, otherwise fallback to localStorage
                state.players.forEach(p => {
                    if (!p.avatar) {
                        const a = localStorage.getItem(`fpl_avatar_${p.username}`);
                        if (a) p.avatar = a;
                    }
                });
                state.users.forEach(u => {
                    if (!u.avatar) {
                        const a = localStorage.getItem(`fpl_avatar_${u.username}`);
                        if (a) u.avatar = a;
                    }
                });
                
                // Migrate: ensure all players have value fields
                state.players.forEach(p => {
                    if (p.value === undefined) {
                        p.value = 100;
                        p.valueHistory = [{ week: 1, value: 100 }];
                    }
                    if (!p.valueHistory) p.valueHistory = [{ week: 1, value: p.value || 100 }];
                });

                // Auto-migration: if we found avatars in localStorage that Firebase
                // didn't have, push them to Firebase ONCE so other devices can see them.
                let avatarsMigrated = false;
                state.users.forEach(u => {
                    if (u.avatar && !(data.users.find(du => du.username === u.username) || {}).avatar) {
                        avatarsMigrated = true;
                    }
                });
                state.players.forEach(p => {
                    if (p.avatar && !(data.players.find(dp => dp.id === p.id) || {}).avatar) {
                        avatarsMigrated = true;
                    }
                });
                if (avatarsMigrated) {
                    console.log("Avatarlar localStorage'dan Firebase'e taşınıyor...");
                    db.ref('fpl_state/users').set(state.users);
                    db.ref('fpl_state/players').set(state.players);
                }

            } else {
                // Firebase is empty - try to restore from localStorage cache first
                const cachedState = localStorage.getItem("fpl_full_state");
                if (cachedState) {
                    try {
                        const parsed = JSON.parse(cachedState);
                        state.users = parsed.users || [];
                        state.teams = parsed.teams || [];
                        state.players = parsed.players || [];
                        state.matches = parsed.matches || [];
                        state.marketListings = parsed.marketListings || [];
                        state.tradeOffers = parsed.tradeOffers || [];
                        state.chatMessages = parsed.chatMessages || [];
                        state.news = parsed.news || [];
                        state.posts = parsed.posts || [];
                        state.bets = parsed.bets || [];
                        state.currentWeek = parsed.currentWeek || 1;
                        console.log("Restored state from localStorage cache!");
                        // Restore avatars from localStorage before writing to Firebase
                        state.users.forEach(u => {
                            if (!u.avatar) {
                                const a = localStorage.getItem(`fpl_avatar_${u.username}`);
                                if (a) u.avatar = a;
                            }
                        });
                        state.players.forEach(p => {
                            if (!p.avatar) {
                                const a = localStorage.getItem(`fpl_avatar_${p.username}`);
                                if (a) p.avatar = a;
                            }
                        });
                        // Write full state WITH avatars back to Firebase
                        db.ref('fpl_state').set({
                            users: state.users,
                            teams: state.teams,
                            players: state.players,
                            matches: state.matches,
                            marketListings: state.marketListings,
                            tradeOffers: state.tradeOffers,
                            chatMessages: state.chatMessages,
                            news: state.news || [],
                            posts: state.posts || [],
                            bets: state.bets || [],
                            currentWeek: state.currentWeek
                        });
                    } catch(e) {
                        console.error("Cache restore failed", e);
                    }
                }
            }
            
            // Set current week failsafe
            const playedMatches = state.matches.filter(m => m.played);
            if (playedMatches.length > 0) {
                const lastWeek = Math.max(...playedMatches.map(m => m.week));
                const maxMatchWeek = Math.max(...state.matches.map(m => m.week));
                state.currentWeek = Math.min(lastWeek + 1, maxMatchWeek);
            } else {
                state.currentWeek = 1;
            }

            renderAll();
        });
    }
}

function saveDatabase() {
    if (state.currentUser) {
        state.currentUser.draftSquad = state.draftSquad;
        const uIdx = state.users.findIndex(u => u.username === state.currentUser.username);
        if (uIdx !== -1) {
            state.users[uIdx] = { ...state.currentUser };
        } else {
            state.users.push(state.currentUser);
        }
        localStorage.setItem("fpl_session", JSON.stringify(state.currentUser));
    } else {
        localStorage.removeItem("fpl_session");
    }
    
    // Save full state copy to local storage for instant loads (strip avatars, stored separately)
    const stripAv = (arr) => (arr || []).map(item => { const c = {...item}; delete c.avatar; return c; });
    const stateToCache = {
        users: stripAv(state.users),
        teams: state.teams,
        players: stripAv(state.players),
        matches: state.matches,
        marketListings: state.marketListings,
        tradeOffers: state.tradeOffers,
        chatMessages: state.chatMessages,
        news: state.news,
        posts: state.posts,
        bets: state.bets,
        currentWeek: state.currentWeek
    };
    try {
        localStorage.setItem("fpl_full_state", JSON.stringify(stateToCache));
    } catch (e) {
        console.warn("Could not save full state to local storage (quota exceeded?)", e);
    }

    if (db) {
        // Before writing to Firebase, ensure avatars from localStorage are in state
        state.users.forEach(u => {
            if (!u.avatar) {
                const a = localStorage.getItem(`fpl_avatar_${u.username}`);
                if (a) u.avatar = a;
            }
        });
        state.players.forEach(p => {
            if (!p.avatar && p.username) {
                const a = localStorage.getItem(`fpl_avatar_${p.username}`);
                if (a) p.avatar = a;
            }
        });
        
        // Write full state including avatars to Firebase for cross-device sync
        db.ref('fpl_state').set({
            users: state.users,
            teams: state.teams,
            players: state.players,
            matches: state.matches,
            marketListings: state.marketListings,
            tradeOffers: state.tradeOffers,
            chatMessages: state.chatMessages,
            news: state.news || [],
            posts: state.posts || [],
            bets: state.bets || [],
            currentWeek: state.currentWeek
        });
    }
}

function resetToDefault() {
    state.users = [DEFAULT_ADMIN];
    state.teams = [];
    state.players = [];
    state.matches = [];
    state.marketListings = [];
    state.tradeOffers = [];
    state.chatMessages = [];
    state.currentUser = null;
    state.draftSquad = { kaleci: null, defans: null, orta_saha_1: null, orta_saha_2: null, forvet: null };
    saveDatabase();
}

// --- DAILY LIMITS HELPER ---
function checkAndIncrementLimit(limitKey, maxCount, limitName) {
    if (state.currentUser.username === 'admin') return true;

    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    
    if (!state.currentUser[limitKey]) {
        state.currentUser[limitKey] = { count: 0, lastReset: now };
    }
    
    if (now - state.currentUser[limitKey].lastReset > cooldown) {
        state.currentUser[limitKey].count = 0;
        state.currentUser[limitKey].lastReset = now;
    }
    
    if (state.currentUser[limitKey].count >= maxCount) {
        const diff = cooldown - (now - state.currentUser[limitKey].lastReset);
        const hrs = Math.floor(diff / (3600 * 1000));
        const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        alert(`Günlük ${limitName} limitinize (${maxCount}) ulaştınız! Kalan süre: ${hrs} saat ${mins} dakika.`);
        return false;
    }
    
    state.currentUser[limitKey].count++;
    saveDatabase();
    return true;
}

// --- PLAYER UTILS ---
function getTeamName(teamId) {
    if (!teamId) return "Serbest Oyuncu";
    const team = state.teams.find(t => t.id === teamId);
    return team ? team.name : "Serbest Oyuncu";
}

function getTeamShort(teamId) {
    if (!teamId) return "FR";
    const team = state.teams.find(t => t.id === teamId);
    return team ? team.shortName : "FR";
}

function getTeamLogo(teamId) {
    const team = state.teams.find(t => t.id === teamId);
    if (team && team.logo) {
        return `<img src="${team.logo}" alt="${team.name}" class="team-logo-inline">`;
    }
    // Default fallback icon
    return `<i class="fa-solid fa-shield-halved team-logo-inline"></i>`;
}

function getPlayerOVR(player) {
    const r = player.ratings;
    if (player.position === "kaleci") {
        return Math.round((r.pac + r.sho + r.pas + r.dri + r.def + r.phy) / 6);
    }
    if (player.position === "forvet") {
        return Math.round(r.sho * 0.4 + r.pac * 0.3 + r.dri * 0.2 + r.pas * 0.1);
    }
    if (player.position === "orta_saha") {
        return Math.round(r.pas * 0.35 + r.dri * 0.25 + r.pac * 0.15 + r.sho * 0.15 + r.phy * 0.1);
    }
    if (player.position === "defans") {
        return Math.round(r.def * 0.45 + r.phy * 0.3 + r.pac * 0.15 + r.pas * 0.1);
    }
    return 70;
}

function getCardClass(ovr) {
    if (ovr >= 82) return "gold";
    if (ovr >= 70) return "silver";
    return "bronze";
}

// --- AUTH LOGIC ---
function initAuthHandlers() {
    const tabLogin = document.getElementById("tab-login-btn");
    const tabRegister = document.getElementById("tab-register-btn");
    const formLogin = document.getElementById("login-form");
    const formRegister = document.getElementById("register-form");

    tabLogin.onclick = () => {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        formLogin.classList.remove("hidden");
        formRegister.classList.add("hidden");
    };

    tabRegister.onclick = () => {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        formRegister.classList.remove("hidden");
        formLogin.classList.add("hidden");
        
        const teamSelect = document.getElementById("register-team");
        if (teamSelect) {
            teamSelect.innerHTML = `<option value="">Serbest Oyuncu (Takımsız)</option>` + 
                state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
        }
    };

    formLogin.onsubmit = (e) => {
        e.preventDefault();
        const inputStr = document.getElementById("login-username").value.trim().toLowerCase();
        const pass = document.getElementById("login-password").value;

        // Allow login by exact username or exact nickname (case-insensitive)
        const user = state.users.find(u => 
            (u.username.toLowerCase() === inputStr || (u.nickname && u.nickname.toLowerCase() === inputStr)) 
            && u.password === pass
        );
        
        if (user) {
            state.currentUser = user;
            saveDatabase();
            formLogin.reset();
            renderAll();
            
            if (user.role === 'admin') {
                switchTab("admin");
            } else {
                switchTab("dashboard");
            }
        } else {
            alert("Hatalı Oyun İçi ID veya şifre!");
        }
    };

    formRegister.onsubmit = async (e) => {
        e.preventDefault();
        const uid = document.getElementById("register-username").value.trim().toLowerCase();
        const nickname = document.getElementById("register-nickname").value.trim();
        const position = document.getElementById("register-position").value;
        const pass = document.getElementById("register-password").value;
        const fileInput = document.getElementById("register-avatar");
        const selectedTeamId = document.getElementById("register-team") ? document.getElementById("register-team").value : "";

        if (state.users.some(u => u.username === uid)) {
            alert("Bu Oyun İçi ID zaten kayıtlı!");
            return;
        }
        
        const submitBtn = formRegister.querySelector('button[type="submit"]');
        submitBtn.innerText = "Hesap Oluşturuluyor...";
        submitBtn.disabled = true;
        
        let avatarUrl = "";
        if (fileInput.files && fileInput.files[0]) {
            avatarUrl = await processImageUpload(fileInput.files[0]);
        }

        // New players start at 70 OVR (main card)
        const mainPlayer = {
            id: "p_" + uid,
            username: uid,
            name: nickname,
            teamId: selectedTeamId,
            position: position,
            avatar: avatarUrl,
            ratings: { pac: 70, sho: 70, pas: 70, dri: 70, def: 70, phy: 70 },
            goals: 0,
            assists: 0,
            yellowCards: 0,
            saves: 0,
            tackles: 0,
            redCards: 0,
            value: 100,
            valueHistory: [{ week: 1, value: 100 }]
        };

        // Auto-generate 5 starting 70 OVR players for draft completeness
        // Positions needed: kaleci, defans, orta_saha, orta_saha, forvet
        const starterPositions = ["kaleci", "defans", "orta_saha", "orta_saha", "forvet"];
        const starterNames = {
            kaleci: "Yasin Kurt",
            defans: "Kaan Sert",
            orta_saha: ["Deniz Yıldız", "Mert Soylu"],
            forvet: "Umut Golcü"
        };
        let starterIds = [mainPlayer.id];

        state.players.push(mainPlayer);

        let midCount = 0;
        starterPositions.forEach((pos, idx) => {
            // Skip the chosen main player position if they already chose it, or just give 5 distinct backup cards
            let name = "";
            if (pos === "orta_saha") {
                name = starterNames.orta_saha[midCount];
                midCount++;
            } else {
                name = starterNames[pos];
            }

            const starterPlayer = {
                id: `p_starter_${uid}_${idx}`,
                username: uid,
                name: `${name} (Starter)`,
                teamId: "",
                position: pos,
                ratings: { pac: 70, sho: 70, pas: 70, dri: 70, def: 70, phy: 70 },
                goals: 0,
                assists: 0,
                yellowCards: 0,
                saves: 0,
                tackles: 0,
                redCards: 0,
                value: 100,
                valueHistory: [{ week: 1, value: 100 }]
            };
            state.players.push(starterPlayer);
            starterIds.push(starterPlayer.id);
        });

        const newUser = {
            username: uid,
            nickname: nickname,
            password: pass,
            avatar: avatarUrl,
            role: "player",
            coins: 250, // Starts with 250 Coins
            inventory: starterIds,
            createdAt: Date.now()
        };

        state.users.push(newUser);
        state.currentUser = newUser;
        
        // Save avatar to dedicated localStorage key to keep Firebase payload small
        if (avatarUrl) {
            localStorage.setItem(`fpl_avatar_${uid}`, avatarUrl);
        }
        
        // Strip avatars from state objects before saving to Firebase
        state.currentUser.avatar = avatarUrl; // keep in memory for current session
        
        saveDatabase();
        formRegister.reset();
        submitBtn.innerText = "Kayıt Ol ve Kartını Oluştur";
        submitBtn.disabled = false;
        
        alert("Kayıt başarılı! 5 adet başlangıç oyuncusu ve 250 FPL Coin hesabınıza eklendi. Hesabınız yeni açıldığı için ilk 24 saat boyunca Ultimate Team modları (Draft & Market) kilitli kalacaktır.");
        renderAll();
        switchTab("dashboard");
    };
}

window.logout = function() {
    state.currentUser = null;
    localStorage.removeItem("fpl_session");
    state.draftSquad = { kaleci: null, defans: null, orta_saha_1: null, orta_saha_2: null, forvet: null };
    renderAll();
    switchTab("dashboard");
};

// --- DYNAMIC RENDERING ---
function renderAll() {
    renderAuthStatusBar();
    renderWidgets();
    renderDashboard();
    renderStandings();
    renderFixtures();
    renderPlayers();
    renderStatsPage();
    renderDraft();
    renderAdminPanel();
    renderMarket();
    renderChat();
    
    // Toggle Admin sidebar visibility
    const adminBtn = document.getElementById("sidebar-admin-btn");
    if (adminBtn) {
        if (state.currentUser && state.currentUser.role === 'admin') {
            adminBtn.classList.remove("hidden");
        } else {
            adminBtn.classList.add("hidden");
        }
    }

    // Toggle Coin Display
    const coinWidget = document.getElementById("top-coin-widget");
    if (coinWidget) {
        if (state.currentUser) {
            coinWidget.classList.remove("hidden");
            const coinDisplay = document.getElementById("user-coins-display");
            if (coinDisplay) {
                coinDisplay.innerText = state.currentUser.username === 'admin' ? "Sonsuz" : state.currentUser.coins;
            }
        } else {
            coinWidget.classList.add("hidden");
        }
    }
}

function renderAuthStatusBar() {
    const bar = document.getElementById("auth-status-bar");
    if (state.currentUser) {
        const coinText = state.currentUser.username === 'admin' ? "Sonsuz" : state.currentUser.coins;
        const avatarImg = state.currentUser.avatar && state.currentUser.avatar.trim().length > 5 ? `<img src="${state.currentUser.avatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border: 2px solid var(--accent-neon);" onerror="this.outerHTML='<i class=\\'fa-solid fa-user-circle\\'></i>'">` : `<i class="fa-solid fa-user-circle"></i>`;
        
        bar.innerHTML = `
            <div class="auth-user-card" style="cursor: pointer;" onclick="openProfileEditModal()" title="Profili Düzenle">
                ${avatarImg}
                <div>
                    <span class="auth-username">${state.currentUser.nickname} (💰 ${coinText})</span>
                    <span class="auth-role-badge">${state.currentUser.role}</span>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); logout()">Çıkış Yap</button>
            </div>
        `;
    } else {
        bar.innerHTML = `
            <button class="btn btn-primary btn-sm" onclick="showAuthScreen()">Oturum Aç / Kayıt Ol</button>
        `;
    }
}

window.showAuthScreen = function() {
    document.querySelectorAll(".content-section").forEach(sec => sec.classList.remove("active"));
    document.getElementById("auth-screen").classList.add("active");
    
    document.getElementById("current-page-title").innerText = "Giriş Paneli";
    document.getElementById("current-page-subtitle").innerText = "İşlem yapmak için giriş yapın.";
};

function renderWidgets() {
    const standings = calculateStandings();
    const topTeamWidget = document.getElementById("top-team-widget");
    if (topTeamWidget) {
        if (standings.length > 0) {
            topTeamWidget.innerText = standings[0].name;
        } else {
            topTeamWidget.innerText = "-";
        }
    }
    
    const topScorerWidget = document.getElementById("top-scorer-widget");
    if (topScorerWidget) {
        const topScorer = [...state.players].sort((a, b) => b.goals - a.goals)[0];
        if (topScorer && topScorer.goals > 0) {
            topScorerWidget.innerText = `${topScorer.name} (${topScorer.goals})`;
        } else {
            topScorerWidget.innerText = "-";
        }
    }
}

function renderDashboard() {
    const dashboardMatchesContainer = document.getElementById("dashboard-matches");
    const miniStandingsBody = document.getElementById("dashboard-standings-body");
    
    if (!state.isLoaded) {
        dashboardMatchesContainer.innerHTML = `<p class="text-muted text-center" style="grid-column: span 3; padding: 1.5rem 0;"><i class="fa-solid fa-spinner fa-spin"></i> Sunucudan veriler yükleniyor...</p>`;
        miniStandingsBody.innerHTML = `<tr><td colspan="5" class="text-muted text-center"><i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...</td></tr>`;
        return;
    }

    // Latest matches list
    const latestMatches = [...state.matches].filter(m => m.played).slice(-3).reverse();
    
    if (latestMatches.length === 0) {
        dashboardMatchesContainer.innerHTML = `<p class="text-muted text-center" style="grid-column: span 3; padding: 1.5rem 0;">Henüz oynanmış lig maçı bulunmuyor.</p>`;
    } else {
        dashboardMatchesContainer.innerHTML = latestMatches.map(m => `
            <div class="match-item">
                <div class="match-team home">
                    <span>${getTeamName(m.homeTeam)}</span>
                    ${getTeamLogo(m.homeTeam)}
                </div>
                <div class="match-score-center">
                    <span class="scores">${m.played ? m.homeScore + ' - ' + m.awayScore : '-'}</span>
                    <span class="week-info">${m.week}. Hafta</span>
                </div>
                <div class="match-team away">
                    ${getTeamLogo(m.awayTeam)}
                    <span>${getTeamName(m.awayTeam)}</span>
                </div>
            </div>
        `).join("");
    }

    // Mini Standings
    const standings = calculateStandings().slice(0, 3);
    
    if (standings.length === 0) {
        miniStandingsBody.innerHTML = `<tr><td colspan="5" class="text-muted text-center">Takım eklenmedi</td></tr>`;
    } else {
        miniStandingsBody.innerHTML = standings.map((t, idx) => `
            <tr>
                <td><span class="rank-badge">${idx + 1}</span></td>
                <td><div class="team-name-cell">${t.name}</div></td>
                <td>${t.played}</td>
                <td>${t.gd > 0 ? '+' + t.gd : t.gd}</td>
                <td style="color: var(--accent-neon); font-weight: bold;">${t.pts}</td>
            </tr>
        `).join("");
    }

    // Leaders
    const scorers = [...state.players].sort((a, b) => b.goals - a.goals)[0];
    const assistants = [...state.players].sort((a, b) => b.assists - a.assists)[0];

    const topScorerDiv = document.getElementById("dashboard-top-scorer");
    if (scorers && scorers.goals > 0) {
        topScorerDiv.innerHTML = `
            <div>
                <span class="leader-name">${scorers.name}</span>
                <span class="leader-sub">${getTeamName(scorers.teamId)}</span>
            </div>
            <span class="leader-val">${scorers.goals} Gol</span>
        `;
    } else {
        topScorerDiv.innerHTML = `<span class="text-muted">Gol atan yok</span>`;
    }

    const topAssistantDiv = document.getElementById("dashboard-top-assistant");
    if (assistants && assistants.assists > 0) {
        topAssistantDiv.innerHTML = `
            <div>
                <span class="leader-name">${assistants.name}</span>
                <span class="leader-sub">${getTeamName(assistants.teamId)}</span>
            </div>
            <span class="leader-val">${assistants.assists} Asist</span>
        `;
    } else {
        topAssistantDiv.innerHTML = `<span class="text-muted">Asist yapan yok</span>`;
    }

    // UT Leaders
    const utPlayers = state.players.filter(p => p.isUTCard);
    const utScorer = [...utPlayers].sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
    const utAssistant = [...utPlayers].sort((a, b) => (b.assists || 0) - (a.assists || 0))[0];
    const utKeeper = [...utPlayers].sort((a, b) => (b.saves || 0) - (a.saves || 0))[0];

    const topUtScorerDiv = document.getElementById("dashboard-ut-scorer");
    if (topUtScorerDiv) {
        if (utScorer && utScorer.goals > 0) {
            topUtScorerDiv.innerHTML = `
                <div>
                    <span class="leader-name">${utScorer.name}</span>
                    <span class="leader-sub">${utScorer.username} Sahibi</span>
                </div>
                <span class="leader-val">${utScorer.goals} Gol</span>
            `;
        } else {
            topUtScorerDiv.innerHTML = `<span class="text-muted">Gol atan yok</span>`;
        }
    }

    const topUtAssistantDiv = document.getElementById("dashboard-ut-assistant");
    if (topUtAssistantDiv) {
        if (utAssistant && utAssistant.assists > 0) {
            topUtAssistantDiv.innerHTML = `
                <div>
                    <span class="leader-name">${utAssistant.name}</span>
                    <span class="leader-sub">${utAssistant.username} Sahibi</span>
                </div>
                <span class="leader-val">${utAssistant.assists} Asist</span>
            `;
        } else {
            topUtAssistantDiv.innerHTML = `<span class="text-muted">Asist yapan yok</span>`;
        }
    }

    const topUtKeeperDiv = document.getElementById("dashboard-ut-keeper");
    if (topUtKeeperDiv) {
        if (utKeeper && utKeeper.saves > 0) {
            topUtKeeperDiv.innerHTML = `
                <div>
                    <span class="leader-name">${utKeeper.name}</span>
                    <span class="leader-sub">${utKeeper.username} Sahibi</span>
                </div>
                <span class="leader-val">${utKeeper.saves} Kurtarış</span>
            `;
        } else {
            topUtKeeperDiv.innerHTML = `<span class="text-muted">Kurtarış yapan yok</span>`;
        }
    }
}

window.openTeamDetailModal = function(teamId) {
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;

    document.getElementById("team-detail-name").innerText = team.name;
    document.getElementById("team-detail-logo").src = team.logo || 'https://via.placeholder.com/50';

    const teamPlayers = state.players.filter(p => p.teamId === teamId).sort((a, b) => getPlayerOVR(b) - getPlayerOVR(a));

    const benchContainer = document.getElementById("team-detail-bench");
    if (teamPlayers.length > 0) {
        benchContainer.innerHTML = teamPlayers.map((p, idx) => `
            <div style="background: var(--surface-light); padding: 0.8rem; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid ${idx < 5 ? 'var(--accent-gold)' : 'var(--text-muted)'};">
                <div style="display: flex; flex-direction: column;">
                    <strong style="font-size: 1.1rem;">${idx + 1}. ${p.name}</strong>
                    <small class="text-muted" style="text-transform: uppercase;">Mevki: ${p.position}</small>
                </div>
                <div style="color: var(--accent-gold); font-weight: bold; font-size: 1.3rem;">${getPlayerOVR(p)} OVR</div>
            </div>
        `).join("");
    } else {
        benchContainer.innerHTML = `<p class="text-muted">Bu takımda henüz oyuncu bulunmuyor.</p>`;
    }

    document.getElementById("team-detail-modal").classList.remove("hidden");
};

window.closeTeamDetailModal = function() {
    document.getElementById("team-detail-modal").classList.add("hidden");
};

function calculateStandings() {
    const standings = state.teams.map(t => ({
        id: t.id,
        name: t.name,
        short: t.short,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        gs: 0,
        ga: 0,
        gd: 0,
        pts: 0,
        recent: []
    }));

    const sortedMatches = [...state.matches].filter(m => m.played).sort((a, b) => a.week - b.week);

    sortedMatches.forEach(m => {
        const home = standings.find(t => t.id === m.homeTeam);
        const away = standings.find(t => t.id === m.awayTeam);

        if (home && away) {
            home.played++;
            away.played++;
            home.gs += m.homeScore;
            home.ga += m.awayScore;
            away.gs += m.awayScore;
            away.ga += m.homeScore;

            if (m.homeScore > m.awayScore) {
                home.w++; home.pts += 3; home.recent.push('W');
                away.l++; away.recent.push('L');
            } else if (m.homeScore < m.awayScore) {
                away.w++; away.pts += 3; away.recent.push('W');
                home.l++; home.recent.push('L');
            } else {
                home.d++; home.pts += 1; home.recent.push('D');
                away.d++; away.pts += 1; away.recent.push('D');
            }
        }
    });

    standings.forEach(t => {
        t.gd = t.gs - t.ga;
        t.recent = t.recent.slice(-5);
    });

    return standings.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gs - a.gs;
    });
}

function renderStandings() {
    const standingsBody = document.getElementById("standings-body");
    
    if (!state.isLoaded) {
        standingsBody.innerHTML = `<tr><td colspan="12" class="text-muted text-center"><i class="fa-solid fa-spinner fa-spin"></i> Sunucudan puan durumu yükleniyor...</td></tr>`;
        return;
    }

    const standings = calculateStandings();
    
    if (standings.length === 0) {
        standingsBody.innerHTML = `<tr><td colspan="12" class="text-muted text-center">Takım oluşturulmadı. Lütfen Yönetici Paneli'nden takım ekleyin.</td></tr>`;
        return;
    }

    standingsBody.innerHTML = standings.map((t, idx) => `
        <tr>
            <td><span class="rank-badge">${idx + 1}</span></td>
            <td>
                <div class="team-name-cell">
                    ${getTeamLogo(t.id)}
                    <span>${t.name}</span>
                    <button class="btn btn-secondary btn-sm" onclick="openTeamDetailModal('${t.id}')" style="margin-left: 10px; padding: 2px 8px; font-size: 0.8rem; background: rgba(255,255,255,0.1); border:none;"><i class="fa-solid fa-magnifying-glass"></i> İncele</button>
                </div>
            </td>
            <td>${t.played}</td>
            <td>${t.w}</td>
            <td>${t.d}</td>
            <td>${t.l}</td>
            <td>${t.gs}</td>
            <td>${t.ga}</td>
            <td>${t.gd > 0 ? '+' + t.gd : t.gd}</td>
            <td style="color: var(--accent-neon); font-weight: 800;">${t.pts}</td>
            <td>
                <div class="form-indicators">
                    ${t.recent.map(res => {
                        const cl = res === 'W' ? 'win' : (res === 'D' ? 'draw' : 'loss');
                        return `<span class="form-dot ${cl}" title="${res === 'W' ? 'Galibiyet' : (res === 'D' ? 'Beraberlik' : 'Mağlubiyet')}"></span>`;
                    }).join("")}
                </div>
            </td>
        </tr>
    `).join("");
}

function renderFixtures() {
    document.getElementById("current-week-display").innerText = `${state.currentWeek}. Hafta`;
    const container = document.getElementById("fixtures-container");
    
    if (!state.isLoaded) {
        container.innerHTML = `<p class="text-muted text-center" style="grid-column: span 2;"><i class="fa-solid fa-spinner fa-spin"></i> Fikstür yükleniyor...</p>`;
        return;
    }
    
    const weekMatches = state.matches.filter(m => m.week === state.currentWeek);
    
    if (weekMatches.length === 0) {
        container.innerHTML = `<p class="text-muted text-center" style="grid-column: span 2;">Bu hafta için eklenmiş maç bulunmuyor.</p>`;
        return;
    }

    container.innerHTML = weekMatches.map(m => {
        const scoreText = m.played ? `${m.homeScore} - ${m.awayScore}` : "VS";
        const statusText = m.played ? `<span class="badge" style="background: rgba(255,255,255,0.1); color: var(--text-muted); padding: 4px 10px; border-radius: 20px; font-size: 0.75rem;">Bitti</span>` : `<span class="badge" style="background: rgba(0, 245, 212, 0.15); color: var(--accent-neon); padding: 4px 10px; border-radius: 20px; font-size: 0.75rem;">Oynanmadı</span>`;
        
        return `
            <div class="card" style="margin-bottom: 0;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 15px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <div style="text-align: right; flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 10px; font-weight: 700;">
                            <span>${getTeamName(m.homeTeam)}</span>
                            ${getTeamLogo(m.homeTeam)}
                        </div>
                        <div style="width: 80px; text-align: center; font-size: 1.3rem; font-weight: 800; color: var(--accent-neon);">
                            ${scoreText}
                        </div>
                        <div style="text-align: left; flex: 1; display: flex; align-items: center; justify-content: flex-start; gap: 10px; font-weight: 700;">
                            ${getTeamLogo(m.awayTeam)}
                            <span>${getTeamName(m.awayTeam)}</span>
                        </div>
                    </div>
                    <div>${statusText}</div>
                </div>
            </div>
        `;
    }).join("");
}

function renderPlayers(filter = "all", searchQuery = "") {
    const container = document.getElementById("players-cards-container");
    
    if (!state.isLoaded) {
        container.innerHTML = `<p class="text-muted" style="grid-column: span 4; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Oyuncu veritabanı yükleniyor...</p>`;
        return;
    }
    
    // Only display players who are associated with registered users, excluding UT cards, starter cards, and seeded AI mock users
    const mockUsernames = ['ahmet10', 'mehmet8', 'can7', 'berk1', 'oguz9'];
    let filtered = state.players.filter(p => 
        p.username && 
        p.username !== 'admin' && 
        !mockUsernames.includes(p.username) &&
        !p.isUTCard && 
        !p.id.includes('_pack_') && 
        !p.id.includes('_starter_')
    );

    if (filter !== "all") {
        filtered = filtered.filter(p => p.position === filter);
    }
    if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(query) || getTeamName(p.teamId).toLowerCase().includes(query));
    }

    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-muted" style="grid-column: span 4;">Kayıtlı lisanslı oyuncu bulunamadı.</p>`;
        return;
    }

    container.innerHTML = filtered.map(p => {
        const ovr = getPlayerOVR(p);
        const cardClass = getCardClass(ovr);
        return createFutCardHTML(p, ovr, cardClass);
    }).join("");
}

function createFutCardHTML(player, ovr, cardClass) {
    const isGK = player.position === "kaleci";
    return `
        <div class="fut-card ${cardClass}">
            <div class="card-top">
                <div class="card-rating-section">
                    <span class="card-rating">${ovr}</span>
                    <span class="card-pos">${player.position === "orta_saha" ? "ORT" : player.position.slice(0, 3)}</span>
                </div>
                <div>
                    ${getTeamLogo(player.teamId)}
                </div>
            </div>
            <div class="card-avatar">
                ${player.avatar && player.avatar.trim().length > 5 ? `<img src="${player.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.outerHTML='<i class=\\'fa-solid fa-user-ninja\\'></i>'">` : `<i class="fa-solid fa-user-ninja"></i>`}
            </div>
            <div class="card-name" title="${player.name}">${player.name}</div>
            <div class="card-team-name">${getTeamName(player.teamId)}</div>
            <div class="card-stats">
                <div class="card-stat-item">
                    <span class="card-stat-label">${isGK ? 'REF' : 'PAC'}</span>
                    <span class="card-stat-val">${player.ratings.pac}</span>
                </div>
                <div class="card-stat-item">
                    <span class="card-stat-label">${isGK ? 'DIV' : 'SHO'}</span>
                    <span class="card-stat-val">${player.ratings.sho}</span>
                </div>
                <div class="card-stat-item">
                    <span class="card-stat-label">${isGK ? 'HAN' : 'PAS'}</span>
                    <span class="card-stat-val">${player.ratings.pas}</span>
                </div>
                <div class="card-stat-item">
                    <span class="card-stat-label">${isGK ? 'KIC' : 'DRI'}</span>
                    <span class="card-stat-val">${player.ratings.dri}</span>
                </div>
                <div class="card-stat-item">
                    <span class="card-stat-label">${isGK ? 'POS' : 'DEF'}</span>
                    <span class="card-stat-val">${player.ratings.def}</span>
                </div>
                <div class="card-stat-item">
                    <span class="card-stat-label">${isGK ? 'SPD' : 'PHY'}</span>
                    <span class="card-stat-val">${player.ratings.phy}</span>
                </div>
            </div>
            <div class="card-footer-stats">
                <span>⚽ ${player.goals}</span>
                <span>🎯 ${player.assists}</span>
                <span>⭐ ${player.matchRating || '-'}</span>
            </div>
            <div style="text-align:center; padding: 4px 0 2px;">
                <span style="font-size:0.75rem; color: var(--accent-neon); font-weight:bold;">💰 ${formatValue(getPlayerValue(player))} ₺</span>
            </div>
            <div style="text-align:center; padding: 2px 0 6px;">
                <button class="btn btn-sm" onclick="openPlayerProfileModal('${player.id}')" style="font-size:0.7rem; padding:2px 10px; background: rgba(255,255,255,0.1); border:1px solid var(--accent-gold); color: var(--accent-gold); border-radius:6px; cursor:pointer;">📊 Profil</button>
            </div>
        </div>
    `;
}

// --- PLAYER VALUE SYSTEM ---
function getPlayerValue(player) {
    return player.value || 100;
}

function formatValue(val) {
    if (val >= 1000) return (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'M';
    return val + 'K';
}

function updateMatchValues(match, statLogs) {
    // Only process players in the match lineup (if lineup exists)
    let allPlayersInMatch;
    if (match.lineup && match.lineup.length > 0) {
        allPlayersInMatch = state.players.filter(p => match.lineup.includes(p.id));
    } else {
        // Fallback: all team players (old behavior)
        allPlayersInMatch = state.players.filter(p => p.teamId === match.homeTeam || p.teamId === match.awayTeam);
    }
    
    // Process stats per player for this match
    const pStats = {};
    allPlayersInMatch.forEach(p => {
        pStats[p.id] = { goals: 0, assists: 0, saves: 0, tackles: 0, yellows: 0, reds: 0, matchPoints: 0, matchRating: 0 };
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
        if (log.type === 'match_rating') s.matchRating = log.count;
    });

    const currentWeek = match.week || state.currentWeek || 1;

    Object.keys(pStats).forEach(pid => {
        const p = state.players.find(x => x.id === pid);
        if (!p) return;
        const s = pStats[pid];
        
        // Check if this player had any stat entry in this match
        const hasStats = statLogs.some(log => log.playerId === pid);
        
        let valueChange = 0;
        
        // Positive contributions (apply to all)
        valueChange += s.goals * 30;
        valueChange += s.assists * 20;
        if (p.position === 'kaleci') valueChange += s.saves * 5;
        if (p.position === 'defans') valueChange += s.tackles * 3;
        
        // Match points rewards (apply to all with entries)
        if (s.matchPoints >= 1000) valueChange += 100;
        else if (s.matchPoints >= 500) valueChange += 50;
        else if (s.matchPoints >= 300) valueChange += 30;
        else if (s.matchPoints >= 100) valueChange += 10;
        
        // Negative penalties: ONLY for players who have at least one stat entry (i.e. they played)
        if (hasStats) {
            if (s.matchPoints < 100 && s.matchPoints > 0) valueChange -= 50;
            if (p.position === 'forvet' && s.goals === 0) valueChange -= 25;
            if (p.position === 'orta_saha' && s.assists === 0) valueChange -= 20;
            if (p.position === 'kaleci' && s.saves < 3) valueChange -= 40;
            if (p.position === 'defans' && s.tackles < 8) valueChange -= 25;
        }
        
        valueChange -= s.yellows * 5;
        valueChange -= s.reds * 10;
        // Update player's latest match rating
        if (s.matchRating > 0) {
            p.matchRating = s.matchRating;
        }
        
        p.value = Math.max(10, (p.value || 100) + valueChange);
        
        // Add to history
        if (!p.valueHistory) p.valueHistory = [{ week: 1, value: 100 }];
        const lastEntry = p.valueHistory[p.valueHistory.length - 1];
        if (lastEntry.week === currentWeek) {
            lastEntry.value = p.value;
        } else {
            p.valueHistory.push({ week: currentWeek, value: p.value });
        }
    });
}

window.recalculateAllHistoricalValues = function() {
    // 1. Reset all players to 100K and week 1
    state.players.forEach(p => {
        p.value = 100;
        p.valueHistory = [{ week: 1, value: 100 }];
    });
    
    // 2. Sort all matches by week
    const sortedMatches = [...state.matches].filter(m => m.played).sort((a, b) => a.week - b.week);
    
    // 3. Re-apply updateMatchValues chronologically
    sortedMatches.forEach(m => {
        if (m.statLogs && m.statLogs.length > 0) {
            updateMatchValues(m, m.statLogs);
        } else {
            updateMatchValues(m, []); // Apply empty stats (which causes penalties)
        }
    });
    
    saveDatabase();
    alert("Tüm değerler maç geçmişine göre yeniden hesaplandı!");
    renderAll();
};

// --- PLAYER PROFILE MODAL ---
window.openPlayerProfileModal = function(playerId) {
    const p = state.players.find(pl => pl.id === playerId);
    if (!p) return;
    
    document.getElementById('pp-player-name').innerHTML = `<i class="fa-solid fa-id-card"></i> ${p.name}`;
    document.getElementById('pp-id').innerText = p.id;
    
    const posNames = { kaleci: 'KALECİ', defans: 'DEFANS', orta_saha: 'ORTA SAHA', forvet: 'FORVET' };
    document.getElementById('pp-position').innerText = posNames[p.position] || p.position;
    document.getElementById('pp-ovr').innerText = getPlayerOVR(p);
    document.getElementById('pp-value').innerText = formatValue(getPlayerValue(p)) + ' ₺';
    
    // Stats
    document.getElementById('pp-goals').innerText = p.goals || 0;
    document.getElementById('pp-assists').innerText = p.assists || 0;
    document.getElementById('pp-saves').innerText = p.saves || 0;
    document.getElementById('pp-tackles').innerText = p.tackles || 0;
    document.getElementById('pp-yellows').innerText = p.yellowCards || 0;
    document.getElementById('pp-reds').innerText = p.redCards || 0;
    
    // Value History Table
    const history = p.valueHistory || [];
    const tbody = document.getElementById('pp-history-body');
    if (history.length > 0) {
        tbody.innerHTML = history.map((h, idx) => {
            const prev = idx > 0 ? history[idx - 1].value : 100;
            const diff = h.value - prev;
            const diffStr = diff > 0 ? `<span style="color: var(--accent-neon);">+${diff}K</span>` : diff < 0 ? `<span style="color: #ff4d6d;">${diff}K</span>` : `<span style="color: var(--text-muted);">0</span>`;
            return `<tr style="border-bottom: 1px solid var(--surface-light);"><td style="padding:0.4rem;">Hafta ${h.week}</td><td style="text-align:right; padding:0.4rem; font-weight:bold;">${formatValue(h.value)} ₺</td><td style="text-align:right; padding:0.4rem;">${diffStr}</td></tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="3" style="color: var(--text-muted); padding:0.4rem; text-align:center;">Henüz değer geçmişi yok.</td></tr>';
    }
    
    drawValueChart(history);
    document.getElementById('player-profile-modal').classList.remove('hidden');
};

window.closePlayerProfileModal = function() {
    document.getElementById('player-profile-modal').classList.add('hidden');
};

// --- IMAGE UPLOAD HELPER ---
function processImageUpload(file) {
    return new Promise((resolve, reject) => {
        if (!file) return resolve("");
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxSize = 250;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.7)); // compress to 70% quality jpeg
            };
            img.onerror = () => resolve("");
            img.src = e.target.result;
        };
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
    });
}

// --- PROFILE EDIT MODAL ---
window.openProfileEditModal = function() {
    if (!state.currentUser) return;
    document.getElementById("edit-avatar").value = ""; // Reset file input
    document.getElementById("profile-edit-modal").classList.remove("hidden");
};

window.closeProfileEditModal = function() {
    document.getElementById("profile-edit-modal").classList.add("hidden");
};

document.addEventListener("DOMContentLoaded", () => {
    const editForm = document.getElementById("profile-edit-form");
    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            if (!state.currentUser) return;
            
            const fileInput = document.getElementById("edit-avatar");
            let newAvatar = state.currentUser.avatar; // Keep old if not changed
            if (fileInput.files && fileInput.files[0]) {
                const submitBtn = editForm.querySelector('button[type="submit"]');
                submitBtn.innerText = "Yükleniyor...";
                submitBtn.disabled = true;
                
                newAvatar = await processImageUpload(fileInput.files[0]);
                
                submitBtn.innerText = "Kaydet";
                submitBtn.disabled = false;
            }
            
            state.currentUser.avatar = newAvatar;
            
            // Save avatar to its own localStorage key (keeps Firebase payload small)
            if (newAvatar) {
                localStorage.setItem(`fpl_avatar_${state.currentUser.username}`, newAvatar);
            } else {
                localStorage.removeItem(`fpl_avatar_${state.currentUser.username}`);
            }
            
            // Also update the main player card if exists
            const myPlayer = state.players.find(p => p.username === state.currentUser.username && !p.id.includes("_starter_") && !p.id.includes("_pack_"));
            if (myPlayer) {
                myPlayer.avatar = newAvatar;
            }
            
            saveDatabase();
            closeProfileEditModal();
            renderAll();
        };
    }
});

function drawValueChart(history) {
    const canvas = document.getElementById('pp-value-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    canvas.width = canvas.offsetWidth * 2 || 1300;
    canvas.height = 400;
    
    const w = canvas.width;
    const h = canvas.height;
    const pad = { top: 30, right: 30, bottom: 40, left: 70 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    
    ctx.clearRect(0, 0, w, h);
    
    if (!history || history.length === 0) return;
    
    const values = history.map(h => h.value);
    const weeks = history.map(h => h.week);
    const minVal = Math.max(0, Math.min(...values) - 20);
    const maxVal = Math.max(...values) + 20;
    const valRange = maxVal - minVal || 1;
    
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = pad.top + (plotH / 5) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        
        const labelVal = maxVal - (valRange / 5) * i;
        ctx.fillStyle = '#aaa';
        ctx.font = '20px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(labelVal) + 'K', pad.left - 10, y + 6);
    }
    
    const getX = (idx) => pad.left + (plotW / Math.max(1, values.length - 1)) * idx;
    const getY = (val) => pad.top + plotH - ((val - minVal) / valRange) * plotH;
    
    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0.02)');
    
    ctx.beginPath();
    ctx.moveTo(getX(0), h - pad.bottom);
    values.forEach((v, i) => ctx.lineTo(getX(i), getY(v)));
    ctx.lineTo(getX(values.length - 1), h - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    ctx.beginPath();
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    values.forEach((v, i) => {
        if (i === 0) ctx.moveTo(getX(i), getY(v));
        else ctx.lineTo(getX(i), getY(v));
    });
    ctx.stroke();
    
    values.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(getX(i), getY(v), 6, 0, Math.PI * 2);
        ctx.fillStyle = '#00ff88';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#aaa';
        ctx.font = '18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('H' + weeks[i], getX(i), h - pad.bottom + 25);
    });
}

// --- DRAFT WORKSPACE (Inventory Restricted) ---
function renderDraft() {
    const slots = [
        { id: "slot-gk", key: "kaleci", label: "KALECİ" },
        { id: "slot-def", key: "defans", label: "DEFANS" },
        { id: "slot-mid1", key: "orta_saha_1", label: "SOL ORTA" },
        { id: "slot-mid2", key: "orta_saha_2", label: "SAĞ ORTA" },
        { id: "slot-fwd", key: "forvet", label: "FORVET" }
    ];

    slots.forEach(slot => {
        const el = document.getElementById(slot.id);
        const player = state.draftSquad[slot.key];
        
        if (player) {
            const ovr = getPlayerOVR(player);
            const cardClass = getCardClass(ovr);
            el.className = "draft-slot filled";
            el.innerHTML = createFutCardHTML(player, ovr, cardClass);
        } else {
            el.className = "draft-slot";
            el.innerHTML = `
                <div class="slot-placeholder">
                    <i class="fa-solid fa-plus"></i>
                    <span>${slot.label}</span>
                </div>
            `;
        }
    });

    calculateDraftMetrics();
}

function openDraftSelection(slotKey, position) {
    if (!state.currentUser) {
        alert("Kadro kurmak için lütfen önce giriş yapın!");
        showAuthScreen();
        return;
    }

    state.selectedDraftSlot = slotKey;
    
    // EXCLUSIVE INVENTORY CHECK:
    // Only display players from state.currentUser.inventory matching position
    const myInv = state.currentUser.inventory || [];
    const selectedIds = Object.values(state.draftSquad).filter(p => p !== null).map(p => p.id);
    
    const candidates = state.players.filter(p => myInv.includes(p.id) && p.position === position && !selectedIds.includes(p.id));

    const selectionPanel = document.getElementById("draft-selection-panel");
    const candidatesContainer = document.getElementById("draft-candidates-container");
    
    if (candidates.length === 0) {
        alert("Envanterinizde bu pozisyona uygun boşta oyuncu bulunamadı! Mağaza'dan paket açabilir veya Transfer Pazarı'nı kontrol edebilirsiniz.");
        return;
    }

    selectionPanel.classList.remove("hidden");
    candidatesContainer.innerHTML = candidates.map(p => {
        const ovr = getPlayerOVR(p);
        const cardClass = getCardClass(ovr);
        return `
            <div onclick="selectDraftPlayer('${p.id}')">
                ${createFutCardHTML(p, ovr, cardClass)}
            </div>
        `;
    }).join("");

    selectionPanel.scrollIntoView({ behavior: 'smooth' });
}

function calculateDraftMetrics() {
    const squadArray = Object.values(state.draftSquad).filter(p => p !== null);
    
    const draftRatingEl = document.getElementById("draft-rating");
    const draftChemistryEl = document.getElementById("draft-chemistry");
    const draftChemBarEl = document.getElementById("draft-chem-bar");

    if (squadArray.length === 0) {
        if (draftRatingEl) draftRatingEl.innerText = "0";
        if (draftChemistryEl) draftChemistryEl.innerText = "0%";
        if (draftChemBarEl) draftChemBarEl.style.width = "0%";
        return;
    }

    const avgRating = Math.round(squadArray.reduce((acc, p) => acc + getPlayerOVR(p), 0) / squadArray.length);
    if (draftRatingEl) draftRatingEl.innerText = avgRating;

    // Chemistry: same team matching
    const teamCounts = {};
    squadArray.forEach(p => {
        if (p.teamId) {
            teamCounts[p.teamId] = (teamCounts[p.teamId] || 0) + 1;
        }
    });

    let maxMatch = 1;
    Object.values(teamCounts).forEach(cnt => {
        if (cnt > maxMatch) maxMatch = cnt;
    });

    const chemMap = { 1: 20, 2: 50, 3: 75, 4: 90, 5: 100 };
    const chem = chemMap[maxMatch] || 20;

    if (draftChemistryEl) draftChemistryEl.innerText = `${chem}%`;
    if (draftChemBarEl) draftChemBarEl.style.width = `${chem}%`;
}

window.selectDraftPlayer = function(playerId) {
    const player = state.players.find(p => p.id === playerId);
    if (player && state.selectedDraftSlot) {
        state.draftSquad[state.selectedDraftSlot] = player;
        document.getElementById("draft-selection-panel").classList.add("hidden");
        renderDraft();
    }
};

// --- DRAFT BATTLE SYSTEM ---
let battleSimulator = {
    isRunning: false,
    interval: null,
    homeScore: 0,
    awayScore: 0,
    currentMinute: 0,
    homePower: 0,
    awayPower: 0,
    opponentName: "",
    lastOpponentName: ""
};

window.closeBattleArena = function() {
    document.getElementById("battle-arena-panel").classList.add("hidden");
    if (battleSimulator.interval) {
        clearInterval(battleSimulator.interval);
    }
};

window.closeBattleResult = function() {
    document.getElementById("battle-result-overlay").classList.add("hidden");
};

function startBattle() {
    const squadArray = Object.values(state.draftSquad).filter(p => p !== null);
    if (squadArray.length < 5) {
        alert("Savaşa başlamak için 5 kişilik kadronuzu kurmalısınız!");
        return;
    }

    if (!checkAndIncrementLimit('dailyMatchLimit', 15, 'maç oynama')) return;

    document.getElementById("battle-arena-panel").classList.remove("hidden");
    document.getElementById("battle-arena-panel").scrollIntoView({ behavior: 'smooth' });

    const myRating = parseInt(document.getElementById("draft-rating").innerText);
    const myChem = parseInt(document.getElementById("draft-chemistry").innerText);

    battleSimulator.homePower = Math.round(myRating + myChem * 0.15);

    // --- OPPONENT SELECTION SYSTEM ---
    // 1. Find other registered users (excluding current user, admin, and mock seeds) who have at least 5 inventory cards
    const mockUsernames = ['ahmet10', 'mehmet8', 'can7', 'berk1', 'oguz9'];
    let otherUsers = state.users.filter(u => u.username !== state.currentUser.username && u.username !== 'admin' && !mockUsernames.includes(u.username) && u.inventory && u.inventory.length >= 5);
    
    // Consecutiveness Check: Exclude last opponent if possible
    if (otherUsers.length > 1 && battleSimulator.lastOpponentName) {
        otherUsers = otherUsers.filter(u => `${u.nickname} Kadrosu` !== battleSimulator.lastOpponentName);
    }

    let opponentName = "";
    let opponentPower = 70;
    let opponentChem = 0;

    if (otherUsers.length > 0) {
        // Choose one of the real users
        const matchedUser = otherUsers[Math.floor(Math.random() * otherUsers.length)];
        opponentName = `${matchedUser.nickname} Kadrosu`;

        // Check if the matched user has a full draft squad set up
        const oppSquadArray = matchedUser.draftSquad ? Object.values(matchedUser.draftSquad).filter(p => p !== null) : [];
        if (oppSquadArray.length === 5) {
            // Calculate actual rating and chem
            const matchedOvr = Math.round(oppSquadArray.reduce((acc, p) => acc + getPlayerOVR(p), 0) / 5);
            
            const teamCounts = {};
            oppSquadArray.forEach(p => {
                if (p.teamId) teamCounts[p.teamId] = (teamCounts[p.teamId] || 0) + 1;
            });
            let maxMatch = 1;
            Object.values(teamCounts).forEach(cnt => { if (cnt > maxMatch) maxMatch = cnt; });
            const chemMap = { 1: 20, 2: 50, 3: 75, 4: 90, 5: 100 };
            opponentChem = chemMap[maxMatch] || 20;

            opponentPower = Math.round(matchedOvr + opponentChem * 0.15);
        } else {
            // User hasn't set up full squad yet
            opponentPower = 70;
            opponentChem = 0;
        }
    } else {
        // Fallback: Pick a randomized AI team name (avoiding consecutive matches)
        const AI_NAMES = ["Simülasyon FC", "Neon Arena FC", "Cihangir Gücü", "Kurtlar United", "Karaköy Gücü", "Beyoğlu FK", "Kadıköy All-Stars", "Boğaziçi FC"];
        let candidates = AI_NAMES;
        if (battleSimulator.lastOpponentName) {
            candidates = AI_NAMES.filter(n => n !== battleSimulator.lastOpponentName);
        }
        opponentName = candidates[Math.floor(Math.random() * candidates.length)];
        opponentPower = 70 + Math.floor(Math.random() * 20); // 70-90 OVR
        opponentChem = 50 + Math.floor(Math.random() * 50); // 50-100 Chem for AI
    }

    battleSimulator.opponentName = opponentName;
    battleSimulator.lastOpponentName = opponentName;
    battleSimulator.awayPower = opponentPower;

    document.getElementById("battle-home-squad-name").innerText = `${state.currentUser.nickname} Kadrosu`;
    document.getElementById("battle-home-indicator").innerText = `Güç: ${myRating} | Kimya: ${myChem}%`;

    document.getElementById("battle-away-squad-name").innerText = opponentName;
    document.getElementById("battle-away-indicator").innerText = `Güç: ${opponentPower} | Kimya: ${opponentChem}%`;

    battleSimulator.homeScore = 0;
    battleSimulator.awayScore = 0;
    battleSimulator.currentMinute = 0;
    document.getElementById("battle-score-board").innerText = "0 - 0";
    
    const narrationBox = document.getElementById("battle-narration");
    narrationBox.innerHTML = `<p class="narration-item match-start">⚔️ FPL Battle Arena Hazır! Rakip: ${opponentName}. Simülasyonu başlatın.</p>`;
    
    initMatchEngine();
}

function initMatchEngine() {
    const container = document.getElementById("me-players");
    if (!container) return;
    container.innerHTML = "";
    
    const homePos = [{ x: 10, y: 50 }, { x: 25, y: 50 }, { x: 40, y: 30 }, { x: 40, y: 70 }, { x: 45, y: 50 }];
    const awayPos = [{ x: 90, y: 50 }, { x: 75, y: 50 }, { x: 60, y: 30 }, { x: 60, y: 70 }, { x: 55, y: 50 }];

    // Get player names from draft squad (draftSquad stores player objects directly)
    const draftSlots = ['kaleci','defans','orta_saha_1','orta_saha_2','forvet'];

    homePos.forEach((p, i) => {
        const dot = document.createElement("div");
        dot.className = "me-player-dot me-player-home";
        dot.style.left = p.x + "%";
        dot.style.top = p.y + "%";
        dot.innerText = i+1;
        dot.id = "me-h-" + i;
        // Add player name label
        const label = document.createElement("div");
        label.className = "me-player-label";
        const squadPlayer = state.draftSquad ? state.draftSquad[draftSlots[i]] : null;
        label.innerText = squadPlayer && squadPlayer.name ? squadPlayer.name.split(' ').pop() : ['GK','DEF','MF','MF','FW'][i];
        dot.appendChild(label);
        container.appendChild(dot);
    });

    awayPos.forEach((p, i) => {
        const dot = document.createElement("div");
        dot.className = "me-player-dot me-player-away";
        dot.style.left = p.x + "%";
        dot.style.top = p.y + "%";
        dot.innerText = i+1;
        dot.id = "me-a-" + i;
        // Add player name label
        const label = document.createElement("div");
        label.className = "me-player-label";
        label.innerText = ['GK','DEF','MF','MF','FW'][i];
        dot.appendChild(label);
        container.appendChild(dot);
    });
    
    const ball = document.getElementById("me-ball");
    if (ball) {
        ball.style.left = "50%";
        ball.style.top = "50%";
    }
}

function updateMatchEngine(homeAttacking, isGoal, homeScored) {
    const clamp = (v) => Math.max(5, Math.min(95, v));
    
    let homeTargetX, awayTargetX;
    if (homeAttacking) {
        homeTargetX = 60 + Math.random()*20; // Home attacks right
        awayTargetX = 70 + Math.random()*15; // Away defends right
    } else {
        homeTargetX = 15 + Math.random()*15; // Home defends left
        awayTargetX = 20 + Math.random()*20; // Away attacks left
    }

    if (isGoal) {
        if (homeScored) {
            homeTargetX = 85;
            awayTargetX = 90;
        } else {
            homeTargetX = 10;
            awayTargetX = 15;
        }
    }

    for (let i = 0; i < 5; i++) {
        let hd = document.getElementById("me-h-" + i);
        let ad = document.getElementById("me-a-" + i);
        
        if (i === 0) {
            // Goalkeepers stay in their penalty areas
            if (hd) {
                let cy = parseFloat(hd.style.top) || 50;
                hd.style.left = clamp(5 + Math.random()*5) + "%"; // 5-10%
                hd.style.top = clamp(cy + (Math.random()*20 - 10)) + "%"; // slight vertical movement
            }
            if (ad) {
                let cy = parseFloat(ad.style.top) || 50;
                ad.style.left = clamp(90 + Math.random()*5) + "%"; // 90-95%
                ad.style.top = clamp(cy + (Math.random()*20 - 10)) + "%"; // slight vertical movement
            }
        } else {
            // Field players move dynamically
            if (hd) {
                let cx = parseFloat(hd.style.left) || 25;
                let cy = parseFloat(hd.style.top) || 50;
                hd.style.left = clamp(cx + (homeTargetX - cx)*0.5 + (Math.random()*20 - 10)) + "%";
                hd.style.top = clamp(cy + (Math.random()*40 - 20)) + "%";
            }
            if (ad) {
                let cx = parseFloat(ad.style.left) || 75;
                let cy = parseFloat(ad.style.top) || 50;
                ad.style.left = clamp(cx + (awayTargetX - cx)*0.5 + (Math.random()*20 - 10)) + "%";
                ad.style.top = clamp(cy + (Math.random()*40 - 20)) + "%";
            }
        }
    }
    
    const ball = document.getElementById("me-ball");
    if (!ball) return;
    
    if (isGoal) {
        if (homeScored) {
            ball.style.left = "98%";
            ball.style.top = (45 + Math.random()*10) + "%";
        } else {
            ball.style.left = "2%";
            ball.style.top = (45 + Math.random()*10) + "%";
        }
    } else {
        if (homeAttacking) {
            ball.style.left = (homeTargetX + Math.random()*15) + "%";
            ball.style.top = (20 + Math.random()*60) + "%";
        } else {
            ball.style.left = (awayTargetX - Math.random()*15) + "%";
            ball.style.top = (20 + Math.random()*60) + "%";
        }
    }
}

function runSimulation() {
    if (battleSimulator.interval) {
        clearInterval(battleSimulator.interval);
    }

    const narrationBox = document.getElementById("battle-narration");
    narrationBox.innerHTML += `<p class="narration-item match-start">⏱️ Düdük çaldı ve Battle başladı!</p>`;
    narrationBox.scrollTop = narrationBox.scrollHeight;

    const mySquad = state.draftSquad;
    const homePower = battleSimulator.homePower;
    const awayPower = battleSimulator.awayPower;

    battleSimulator.interval = setInterval(() => {
        battleSimulator.currentMinute += 5;
        
        if (battleSimulator.currentMinute > 90) {
            clearInterval(battleSimulator.interval);
            // End of match
            let coinsEarned = 10;
            let resultTitle = "";
            let resultTitleColor = "";
            
            if (battleSimulator.homeScore > battleSimulator.awayScore) {
                resultTitle = "KAZANDINIZ!";
                resultTitleColor = "var(--accent-neon)";
                coinsEarned = 30;
            } else if (battleSimulator.homeScore < battleSimulator.awayScore) {
                resultTitle = "KAYBETTİNİZ!";
                resultTitleColor = "#ff4d6d";
                coinsEarned = 10;
            } else {
                resultTitle = "BERABERLİK!";
                resultTitleColor = "var(--accent-gold)";
                coinsEarned = 20;
            }

            // Award coins (admin has infinite coins, so do not add/modify)
            if (state.currentUser.username !== 'admin') {
                state.currentUser.coins += coinsEarned;
            }
            saveDatabase();
            renderAll();

            // Display Visual Battle Result Overlay
            const overlay = document.getElementById("battle-result-overlay");
            const titleEl = document.getElementById("battle-result-title");
            const coinsEl = document.getElementById("battle-result-coins");

            if (overlay && titleEl && coinsEl) {
                titleEl.innerText = resultTitle;
                titleEl.style.color = resultTitleColor;
                titleEl.style.textShadow = `0 0 20px ${resultTitleColor}`;
                
                if (state.currentUser.username === 'admin') {
                    coinsEl.innerText = `💰 Sınırsız Bakiye Aktif`;
                } else {
                    coinsEl.innerText = `💰 +${coinsEarned} FPL Coins`;
                }
                
                overlay.classList.remove("hidden");
                document.getElementById("battle-arena-panel").classList.add("hidden");
            }
            return;
        }

        const eventChance = Math.random();
        if (eventChance > 0.45) {
            const attackPowerRatio = homePower / (homePower + awayPower);
            const homeAttacking = Math.random() < attackPowerRatio;

            if (homeAttacking) {
                const goalChance = Math.random();
                if (goalChance > 0.65) {
                    battleSimulator.homeScore++;
                    document.getElementById("battle-score-board").innerText = `${battleSimulator.homeScore} - ${battleSimulator.awayScore}`;
                    
                    const scorerName = mySquad.forvet ? mySquad.forvet.name : "Forvet";
                    if (mySquad.forvet) {
                        mySquad.forvet.goals = (mySquad.forvet.goals || 0) + 1;
                        // Random assist to midfielders
                        if (Math.random() > 0.4) {
                            const mids = [];
                            if (mySquad.orta_saha_1) mids.push(mySquad.orta_saha_1);
                            if (mySquad.orta_saha_2) mids.push(mySquad.orta_saha_2);
                            if (mids.length > 0) {
                                const assister = mids[Math.floor(Math.random() * mids.length)];
                                assister.assists = (assister.assists || 0) + 1;
                            }
                        }
                    }
                    
                    narrationBox.innerHTML += `
                        <p class="narration-item home-event">
                            ⚽ ${battleSimulator.currentMinute}'. Dakika: SİZİN GOLÜNÜZ! Kadronuz harika paslaştı ve ${scorerName} bitirdi!
                        </p>
                    `;
                    updateMatchEngine(true, true, true);
                } else {
                    narrationBox.innerHTML += `
                        <p class="narration-item">
                            ❌ ${battleSimulator.currentMinute}'. Dakika: Kadronuz şut şansı buldu ancak kaleci kurtardı.
                        </p>
                    `;
                    updateMatchEngine(true, false, false);
                }
            } else {
                const goalChance = Math.random();
                if (goalChance > 0.70) {
                    battleSimulator.awayScore++;
                    document.getElementById("battle-score-board").innerText = `${battleSimulator.homeScore} - ${battleSimulator.awayScore}`;
                    narrationBox.innerHTML += `
                        <p class="narration-item away-event">
                            ⚽ ${battleSimulator.currentMinute}'. Dakika: RAKİP GOL! Rakip forvet defansın arkasına kaçtı ve golü attı.
                        </p>
                    `;
                    updateMatchEngine(false, true, false);
                } else {
                    const keeperName = mySquad.kaleci ? mySquad.kaleci.name : "Kaleci";
                    if (mySquad.kaleci) {
                        mySquad.kaleci.saves = (mySquad.kaleci.saves || 0) + 1;
                    }
                    narrationBox.innerHTML += `
                        <p class="narration-item">
                            🧤 ${battleSimulator.currentMinute}'. Dakika: Rakip tehlikeli geldi ama kaleciniz ${keeperName} topu çeldi!
                        </p>
                    `;
                    updateMatchEngine(false, false, false);
                }
            }
            narrationBox.scrollTop = narrationBox.scrollHeight;
        }
    }, 1000);
}

// --- FPL MAĞAZA & PACKS ---
window.openPack = function(packType) {
    try {
        if (!state.currentUser) {
            alert("Paket açmak için önce giriş yapmalısınız!");
            showAuthScreen();
            return;
        }

        const priceMap = { gold: 550, silver: 300, bronze: 150 };
        const price = priceMap[packType];

        if (state.currentUser.username !== 'admin' && state.currentUser.coins < price) {
            alert("Yetersiz FPL Coins! Battle yaparak coin toplayabilirsiniz.");
            return;
        }

        // Determine target OVR range
        let minOVR = 70, maxOVR = 75;
        if (packType === 'gold') { minOVR = 80; maxOVR = 99; }
        else if (packType === 'silver') { minOVR = 75; maxOVR = 80; }

        // Pick only from players who are registered user accounts in state.players (excluding starter players, mock seeds, and already packed UT cards)
        const mockUsernames = ['ahmet10', 'mehmet8', 'can7', 'berk1', 'oguz9'];
        let candidates = state.players.filter(p => p.username && p.username !== 'admin' && !p.id.includes('_starter_') && !mockUsernames.includes(p.username) && !p.isUTCard);
        
        // Fallback: Eski veri tabanından kalan oyuncuları da dahil et (ama starter olanları ve mock olanları yine de ele)
        if (candidates.length === 0) {
            candidates = state.players.filter(p => p.id !== 'p_admin' && !p.id.includes('_starter_') && !mockUsernames.includes(p.username) && !p.isUTCard);
        }

        // Filter candidates by OVR if possible, otherwise fallback to any candidate
        let pool = candidates.filter(p => {
            const ovr = getPlayerOVR(p);
            return ovr >= minOVR && ovr <= maxOVR;
        });

        // Filter out players if the user already has 2 copies of them
        const userInvPlayers = (state.currentUser.inventory || []).map(invId => state.players.find(p => p.id === invId)).filter(Boolean);
        pool = pool.filter(p => {
            const count = userInvPlayers.filter(invP => invP.name === p.name).length;
            return count < 2; // Allow maximum of 2 copies
        });

        if (pool.length === 0) {
            alert(`Bu paketin rating sınırlarında veya envanter limitinize (aynı adamdan en fazla 2 kopya) takılmayan oyuncu kalmadı!`);
            return;
        }

        // Select random player card from pool
        const selectedTemplate = pool[Math.floor(Math.random() * pool.length)];
        if (!selectedTemplate) {
            alert("Oyuncu şablonu seçilemedi.");
            return;
        }

        // Create a cloned player card safely
        const ratings = selectedTemplate.ratings || { pac: 70, sho: 70, pas: 70, dri: 70, def: 70, phy: 70 };
        const newPlayer = {
            id: "p_pack_" + (selectedTemplate.username || "user") + "_" + Date.now(),
            username: selectedTemplate.username || "",
            name: selectedTemplate.name || "İsimsiz Oyuncu",
            teamId: "", // free
            position: selectedTemplate.position || "orta_saha",
            ratings: JSON.parse(JSON.stringify(ratings)),
            goals: 0,
            assists: 0,
            yellowCards: 0,
            saves: 0,
            isUTCard: true // Separate Ultimate Team player tag
        };

        // Deduct coins ONLY for non-admin accounts
        if (state.currentUser.username !== 'admin') {
            state.currentUser.coins -= price;
        }

        // Add to main players database
        state.players.push(newPlayer);
        
        // Add to current user's inventory
        if (!state.currentUser.inventory) state.currentUser.inventory = [];
        state.currentUser.inventory.push(newPlayer.id);

        saveDatabase();
        renderAll();

        // Trigger visual reveal overlay
        const revealScreen = document.getElementById("pack-reveal-screen");
        const innerCard = document.getElementById("revealed-card-inner");

        if (revealScreen && innerCard) {
            innerCard.innerHTML = createFutCardHTML(newPlayer, getPlayerOVR(newPlayer), getCardClass(getPlayerOVR(newPlayer)));
            
            // Reset animation to play it every time a pack is opened
            innerCard.style.animation = 'none';
            void innerCard.offsetWidth; // Force DOM reflow
            innerCard.style.animation = 'spinReveal 2.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

            revealScreen.classList.remove("hidden");
        } else {
            alert("Kart açılış ekranı öğeleri bulunamadı!");
        }
    } catch (error) {
        alert("Paket açılırken hata oluştu: " + error.message);
        console.error(error);
    }
};

window.openDailyPack = function() {
    try {
        if (!state.currentUser) {
            alert("Paket açmak için önce giriş yapmalısınız!");
            showAuthScreen();
            return;
        }

        const now = Date.now();
        const lastOpen = state.currentUser.lastDailyPackOpen || 0;
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours

        if (state.currentUser.username !== 'admin' && (now - lastOpen < cooldown)) {
            const diff = cooldown - (now - lastOpen);
            const hrs = Math.floor(diff / (3600 * 1000));
            const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
            alert(`Bu paketi zaten açtınız! Tekrar açmak için kalan süre: ${hrs} saat ${mins} dakika.`);
            return;
        }

        // Daily Pack: OVR 70 to 99 range
        const minOVR = 70, maxOVR = 99;
        const mockUsernames = ['ahmet10', 'mehmet8', 'can7', 'berk1', 'oguz9'];
        let candidates = state.players.filter(p => p.username && p.username !== 'admin' && !p.id.includes('_starter_') && !mockUsernames.includes(p.username) && !p.isUTCard);
        
        if (candidates.length === 0) {
            candidates = state.players.filter(p => p.id !== 'p_admin' && !p.id.includes('_starter_') && !mockUsernames.includes(p.username) && !p.isUTCard);
        }

        let pool = candidates.filter(p => {
            const ovr = getPlayerOVR(p);
            return ovr >= minOVR && ovr <= maxOVR;
        });

        // Filter out players if the user already has 2 copies of them
        const userInvPlayers = (state.currentUser.inventory || []).map(invId => state.players.find(p => p.id === invId)).filter(Boolean);
        pool = pool.filter(p => {
            const count = userInvPlayers.filter(invP => invP.name === p.name).length;
            return count < 2; // Allow maximum of 2 copies
        });

        if (pool.length === 0) {
            alert("Günlük paketten çıkarılabilecek veya envanter limitinize takılmayan kayıtlı bir oyuncu hesabı bulunamadı!");
            return;
        }

        const selectedTemplate = pool[Math.floor(Math.random() * pool.length)];
        const ratings = selectedTemplate.ratings || { pac: 70, sho: 70, pas: 70, dri: 70, def: 70, phy: 70 };
        const newPlayer = {
            id: "p_pack_" + (selectedTemplate.username || "user") + "_" + Date.now(),
            username: selectedTemplate.username || "",
            name: selectedTemplate.name || "Günlük Oyuncu",
            teamId: "",
            position: selectedTemplate.position || "orta_saha",
            ratings: JSON.parse(JSON.stringify(ratings)),
            goals: 0,
            assists: 0,
            yellowCards: 0,
            saves: 0,
            isUTCard: true
        };

        // Record cooldown timestamp
        state.currentUser.lastDailyPackOpen = now;

        state.players.push(newPlayer);
        if (!state.currentUser.inventory) state.currentUser.inventory = [];
        state.currentUser.inventory.push(newPlayer.id);

        saveDatabase();
        renderAll();

        const revealScreen = document.getElementById("pack-reveal-screen");
        const innerCard = document.getElementById("revealed-card-inner");

        if (revealScreen && innerCard) {
            innerCard.innerHTML = createFutCardHTML(newPlayer, getPlayerOVR(newPlayer), getCardClass(getPlayerOVR(newPlayer)));
            innerCard.style.animation = 'none';
            void innerCard.offsetWidth;
            innerCard.style.animation = 'spinReveal 2.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
            revealScreen.classList.remove("hidden");
        }
    } catch (error) {
        alert("Günlük paket açılırken hata oluştu: " + error.message);
    }
};

window.spinDailyWheel = function() {
    try {
        if (!state.currentUser) {
            alert("Şans çarkını çevirmek için önce giriş yapmalısınız!");
            showAuthScreen();
            return;
        }

        const now = Date.now();
        const lastSpin = state.currentUser.lastDailySpin || 0;
        const cooldown = 24 * 60 * 60 * 1000;

        if (state.currentUser.username !== 'admin' && (now - lastSpin < cooldown)) {
            const diff = cooldown - (now - lastSpin);
            const hrs = Math.floor(diff / (3600 * 1000));
            const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
            alert(`Bugünlük çarkı çevirdiniz! Kalan süre: ${hrs} saat ${mins} dakika.`);
            return;
        }

        const btn = document.getElementById("daily-spin-btn");
        const reel = document.getElementById("spin-reel-value");
        if (!btn || !reel) return;

        btn.disabled = true;
        
        // Define reward options (equal ratio: 25% each)
        const prizes = [50, 100, 150, 200];
        const winAmount = prizes[Math.floor(Math.random() * prizes.length)];

        // Visual spinning effect animation
        let count = 0;
        const interval = setInterval(() => {
            reel.innerText = prizes[Math.floor(Math.random() * prizes.length)] + " 💰";
            count++;
            if (count > 12) {
                clearInterval(interval);
                reel.innerText = winAmount + " 💰";
                reel.style.transform = "scale(1.2)";
                
                setTimeout(() => {
                    reel.style.transform = "scale(1)";
                    if (state.currentUser.username !== 'admin') {
                        state.currentUser.coins += winAmount;
                    }
                    state.currentUser.lastDailySpin = now;
                    saveDatabase();
                    renderAll();
                    alert(`Tebrikler! Çarktan ${winAmount} FPL Coins kazandınız!`);
                    btn.disabled = false;
                }, 400);
            }
        }, 100);

    } catch (error) {
        alert("Çark çevrilirken hata oluştu: " + error.message);
    }
};

window.closePackReveal = function() {
    document.getElementById("pack-reveal-screen").classList.add("hidden");
};

// --- FPL MARKET PLACEMENTS & ACTION ---
function initMarketHandlers() {
    const marketTabs = document.querySelectorAll(".market-tab-btn");
    marketTabs.forEach(btn => {
        btn.onclick = () => {
            marketTabs.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const targetTabId = btn.getAttribute("data-tab");
            document.querySelectorAll(".market-sub-section").forEach(sec => sec.classList.add("hidden"));
            document.getElementById(targetTabId).classList.remove("hidden");
        };
    });

    // Form: Sell Player
    document.getElementById("market-sell-form").onsubmit = (e) => {
        e.preventDefault();
        if (!state.currentUser) return;
        
        if (!checkAndIncrementLimit('dailySellLimit', 3, 'oyuncu satma')) return;

        const pId = document.getElementById("sell-player-select").value;
        const price = parseInt(document.getElementById("sell-price-input").value);

        if (!pId) return;

        // Check if player is already listed
        if (state.marketListings.some(x => x.playerId === pId)) {
            alert("Bu oyuncu zaten satış pazarında!");
            return;
        }

        // Add listing
        const newListing = {
            id: "list_" + Date.now(),
            seller: state.currentUser.username,
            playerId: pId,
            price: price
        };

        // Remove player from active draft selections so they aren't drafted while sold
        for (let k in state.draftSquad) {
            if (state.draftSquad[k] && state.draftSquad[k].id === pId) {
                state.draftSquad[k] = null;
            }
        }

        state.marketListings.push(newListing);
        saveDatabase();
        renderAll();
        alert("Oyuncu satış pazarında listelendi.");
    };

    // Form: Trade Offer Send
    document.getElementById("market-trade-form").onsubmit = (e) => {
        e.preventDefault();
        if (!state.currentUser) return;

        if (!checkAndIncrementLimit('dailyTradeLimit', 3, 'takas teklifi yapma')) return;

        const receiver = document.getElementById("trade-select-user").value;
        const myP = document.getElementById("trade-my-player").value;
        const targetP = document.getElementById("trade-target-player").value;

        if (!receiver || !myP || !targetP) return;

        const newTrade = {
            id: "trade_" + Date.now(),
            sender: state.currentUser.username,
            receiver: receiver,
            senderPlayerId: myP,
            receiverPlayerId: targetP,
            status: "pending"
        };

        state.tradeOffers.push(newTrade);
        saveDatabase();
        renderAll();
        alert("Takas teklifiniz karşı tarafa iletildi!");
        document.getElementById("market-trade-form").reset();
    };
}

function renderMarket() {
    if (!state.currentUser) {
        document.getElementById("transfer-market-list").innerHTML = `<tr><td colspan="7" class="text-center text-muted">Lütfen Pazar menüsünü kullanmak için oturum açın.</td></tr>`;
        document.getElementById("sell-player-select").innerHTML = `<option value="">Önce giriş yapın</option>`;
        document.getElementById("my-listings-body").innerHTML = `<tr><td colspan="3" class="text-center text-muted">Önce giriş yapın</td></tr>`;
        return;
    }

    // 1. Render Transfer listings
    const marketTable = document.getElementById("transfer-market-list");
    const activeListings = state.marketListings;

    if (activeListings.length === 0) {
        marketTable.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Şu an pazarda satılık oyuncu bulunmuyor.</td></tr>`;
    } else {
        marketTable.innerHTML = activeListings.map(lst => {
            const p = state.players.find(x => x.id === lst.playerId);
            if (!p) return "";
            const ovr = getPlayerOVR(p);
            
            return `
                <tr>
                    <td><div class="team-logo-small">${ovr}</div></td>
                    <td><strong>${p.name}</strong></td>
                    <td>${p.position.toUpperCase()}</td>
                    <td>${ovr}</td>
                    <td>${lst.seller}</td>
                    <td style="color: var(--accent-gold); font-weight:800;">💰 ${lst.price}</td>
                    <td>
                        ${lst.seller === state.currentUser.username ? `
                            <small class="text-muted">Senin Kartın</small>
                        ` : `
                            <button class="btn btn-primary btn-sm" onclick="buyPlayerFromMarket('${lst.id}')">Satın Al</button>
                        `}
                    </td>
                </tr>
            `;
        }).join("");
    }

    // 2. Fill User Sell Player Select Options
    const sellSelect = document.getElementById("sell-player-select");
    const myInv = state.currentUser.inventory || [];
    // Filter out players already listed
    const unlistedMyPlayers = state.players.filter(p => myInv.includes(p.id) && !state.marketListings.some(x => x.playerId === p.id));
    sellSelect.innerHTML = `<option value="">Envanterinden Seçin</option>` + unlistedMyPlayers.map(p => `<option value="${p.id}">${p.name} (${getPlayerOVR(p)} OVR - ${p.position})</option>`).join("");

    // 3. Render Active Listings Owned by User
    const myListingsBody = document.getElementById("my-listings-body");
    const myListings = state.marketListings.filter(x => x.seller === state.currentUser.username);
    if (myListings.length === 0) {
        myListingsBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Yayında olan bir ilanın bulunmuyor.</td></tr>`;
    } else {
        myListingsBody.innerHTML = myListings.map(lst => {
            const p = state.players.find(x => x.id === lst.playerId);
            return `
                <tr>
                    <td><strong>${p ? p.name : "Bilinmeyen"}</strong></td>
                    <td style="color: var(--accent-gold);">💰 ${lst.price}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="cancelListing('${lst.id}')">İptal</button></td>
                </tr>
            `;
        }).join("");
    }

    // 4. Fill Trade Receivers (Other users)
    const tradeUserSelect = document.getElementById("trade-select-user");
    const mockUsernames = ['ahmet10', 'mehmet8', 'can7', 'berk1', 'oguz9'];
    const otherUsers = state.users.filter(u => u.username !== state.currentUser.username && u.username !== 'admin' && !mockUsernames.includes(u.username));
    tradeUserSelect.innerHTML = `<option value="">Kullanıcı Seçin</option>` + otherUsers.map(u => `<option value="${u.username}">${u.nickname}</option>`).join("");

    // Fill My Player options for Trade
    const tradeMyP = document.getElementById("trade-my-player");
    tradeMyP.innerHTML = `<option value="">Kendi Oyuncunu Seç</option>` + unlistedMyPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join("");

    // Bind receiver select change to fetch their unlisted inventory
    tradeUserSelect.onchange = () => {
        const receiverUsername = tradeUserSelect.value;
        const targetPSelect = document.getElementById("trade-target-player");
        if (!receiverUsername) {
            targetPSelect.innerHTML = `<option value="">Önce kullanıcı seçin</option>`;
            return;
        }

        const receiverObj = state.users.find(u => u.username === receiverUsername);
        if (receiverObj) {
            const recInv = receiverObj.inventory || [];
            // Target player must also not be currently listed on the transfer market
            const receiverPlayers = state.players.filter(p => recInv.includes(p.id) && !state.marketListings.some(x => x.playerId === p.id));
            targetPSelect.innerHTML = `<option value="">Almak İstediğiniz Oyuncu</option>` + receiverPlayers.map(p => `<option value="${p.id}">${p.name} (${getPlayerOVR(p)} OVR)</option>`).join("");
        }
    };

    // 5. Render Incoming Trade Offers
    const tradesList = document.getElementById("incoming-trades-list");
    const myIncomingTrades = state.tradeOffers.filter(x => x.receiver === state.currentUser.username && x.status === "pending");

    if (myIncomingTrades.length === 0) {
        tradesList.innerHTML = `<p class="text-muted text-center" style="padding: 1.5rem 0;">Gelen aktif takas teklifi bulunmuyor.</p>`;
    } else {
        tradesList.innerHTML = myIncomingTrades.map(tr => {
            const senderName = state.users.find(u => u.username === tr.sender)?.nickname || tr.sender;
            const senderP = state.players.find(p => p.id === tr.senderPlayerId);
            const myP = state.players.find(p => p.id === tr.receiverPlayerId);

            if (!senderP || !myP) return "";

            return `
                <div class="trade-offer-card">
                    <div class="trade-offer-header">
                        <span>Gönderen: ${senderName}</span>
                    </div>
                    <div class="trade-offer-body">
                        <div>
                            <small class="text-muted">Vereceği Kart:</small><br>
                            <span>${senderP.name} (${getPlayerOVR(senderP)} OVR)</span>
                        </div>
                        <div class="trade-arrow"><i class="fa-solid fa-right-left"></i></div>
                        <div>
                            <small class="text-muted">İstediği Kartın:</small><br>
                            <span>${myP.name} (${getPlayerOVR(myP)} OVR)</span>
                        </div>
                    </div>
                    <div class="trade-offer-actions">
                        <button class="btn btn-secondary btn-sm" onclick="declineTrade('${tr.id}')">Reddet</button>
                        <button class="btn btn-primary btn-sm" onclick="acceptTrade('${tr.id}')">Kabul Et</button>
                    </div>
                </div>
            `;
        }).join("");
    }
}

window.buyPlayerFromMarket = function(listingId) {
    if (!state.currentUser) return;
    
    if (!checkAndIncrementLimit('dailyBuyLimit', 3, 'oyuncu alma')) return;

    const lst = state.marketListings.find(x => x.id === listingId);
    if (!lst) return;

    if (state.currentUser.coins < lst.price) {
        alert("Bu oyuncuyu satın almak için yeterli FPL Coin bakiyeniz yok!");
        return;
    }

    // Deduct coins from buyer
    state.currentUser.coins -= lst.price;

    // Add coins to seller
    const sellerUser = state.users.find(u => u.username === lst.seller);
    if (sellerUser) {
        sellerUser.coins += lst.price;
    }

    // Swap inventory ownerships
    // Remove from seller inventory
    if (sellerUser) {
        sellerUser.inventory = sellerUser.inventory.filter(id => id !== lst.playerId);
    }
    // Add to buyer inventory
    if (!state.currentUser.inventory) state.currentUser.inventory = [];
    state.currentUser.inventory.push(lst.playerId);

    // Remove listing
    state.marketListings = state.marketListings.filter(x => x.id !== listingId);

    saveDatabase();
    renderAll();
    alert("Oyuncu başarıyla satın alındı ve envanterinize eklendi!");
};

window.cancelListing = function(listingId) {
    state.marketListings = state.marketListings.filter(x => x.id !== listingId);
    saveDatabase();
    renderAll();
    alert("Satış ilanı başarıyla iptal edildi.");
};

window.acceptTrade = function(tradeId) {
    const tr = state.tradeOffers.find(x => x.id === tradeId);
    if (!tr) return;

    const senderUser = state.users.find(u => u.username === tr.sender);
    const receiverUser = state.currentUser; // matching tr.receiver

    if (!senderUser || !receiverUser) return;

    // Validate that users still own their players and they are not listed
    const senderHasPlayer = senderUser.inventory.includes(tr.senderPlayerId) && !state.marketListings.some(x => x.playerId === tr.senderPlayerId);
    const receiverHasPlayer = receiverUser.inventory.includes(tr.receiverPlayerId) && !state.marketListings.some(x => x.playerId === tr.receiverPlayerId);

    if (!senderHasPlayer || !receiverHasPlayer) {
        alert("Takas teklifindeki oyuncular envanterlerde bulunmuyor ya da transfer pazarında listelenmiş!");
        tr.status = "declined";
        saveDatabase();
        renderAll();
        return;
    }

    // Swap inventories
    senderUser.inventory = senderUser.inventory.filter(id => id !== tr.senderPlayerId);
    senderUser.inventory.push(tr.receiverPlayerId);

    receiverUser.inventory = receiverUser.inventory.filter(id => id !== tr.receiverPlayerId);
    receiverUser.inventory.push(tr.senderPlayerId);

    // Clear active drafts if swapped
    for (let k in state.draftSquad) {
        if (state.draftSquad[k] && state.draftSquad[k].id === tr.receiverPlayerId) {
            state.draftSquad[k] = null;
        }
    }

    tr.status = "accepted";
    // Also remove the completed trade from offers list to keep clean
    state.tradeOffers = state.tradeOffers.filter(x => x.id !== tradeId);

    saveDatabase();
    renderAll();
    alert("Takas başarıyla tamamlandı!");
};

window.declineTrade = function(tradeId) {
    state.tradeOffers = state.tradeOffers.filter(x => x.id !== tradeId);
    saveDatabase();
    renderAll();
    alert("Takas teklifi reddedildi.");
};

// --- ADMIN PANEL SUBTABS ---
function initAdminSubTabs() {
    const tabBtns = document.querySelectorAll(".admin-tab-btn");
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const targetTabId = btn.getAttribute("data-tab");
            document.querySelectorAll(".admin-sub-section").forEach(sec => sec.classList.add("hidden"));
            document.getElementById(targetTabId).classList.remove("hidden");
        };
    });
}

function renderAdminPanel() {
    initAdminSubTabs();

    // 1. Fill Fixture Teams
    const fixtureHome = document.getElementById("fixture-home");
    const fixtureAway = document.getElementById("fixture-away");
    
    const teamOptionsHTML = `<option value="">Takım Seçin</option>` + state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
    fixtureHome.innerHTML = teamOptionsHTML;
    fixtureAway.innerHTML = teamOptionsHTML;

    // 2. Fill Match Selector
    const matchSelect = document.getElementById("admin-select-match");
    const unplayedMatches = state.matches.filter(m => !m.played);
    
    if (unplayedMatches.length === 0) {
        matchSelect.innerHTML = `<option value="">Bütün fikstür maçları oynandı</option>`;
        document.getElementById("admin-home-label").innerText = "Ev Sahibi";
        document.getElementById("admin-away-label").innerText = "Deplasman";
    } else {
        matchSelect.innerHTML = unplayedMatches.map(m => `
            <option value="${m.id}">${m.week}. Hafta: ${getTeamShort(m.homeTeam)} vs ${getTeamShort(m.awayTeam)}</option>
        `).join("");
        
        updateAdminMatchLabels();
    }


    // 3. Fill Player Edit Selector
    const editPlayerSelect = document.getElementById("edit-select-player");
    const mockUsernames = ['ahmet10', 'mehmet8', 'can7', 'berk1', 'oguz9'];
    const nonUTPlayers = state.players.filter(p => !p.isUTCard && !p.id.includes('_pack_') && !p.id.includes('_starter_') && !mockUsernames.includes(p.username));
    editPlayerSelect.innerHTML = `<option value="">Oyuncu Seçin</option>` + nonUTPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join("");

    // 4. Fill Team list inside Player Edit
    const editPlayerTeam = document.getElementById("edit-player-team");
    editPlayerTeam.innerHTML = `<option value="">Serbest Oyuncu</option>` + state.teams.map(t => `<option value="${t.id}">${t.name}</option>`).join("");

    // 5. Render Users Table
    const usersTable = document.getElementById("admin-users-table-body");
    usersTable.innerHTML = state.users.map(u => `
        <tr>
            <td><strong>${u.username}</strong></td>
            <td>${u.nickname}</td>
            <td><span class="auth-role-badge" style="background:${u.role === 'admin' ? 'rgba(123, 44, 191, 0.25)' : 'rgba(255,255,255,0.05)'}; color:${u.role === 'admin' ? '#9d4edd' : '#fff'};">${u.role}</span></td>
            <td>
                ${u.username === 'admin' ? '<small class="text-muted">Ana Yönetici Değiştirilemez</small>' : `
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="toggleUserRole('${u.username}')">Rolü Değiştir</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteUserAccount('${u.username}')"><i class="fa-solid fa-user-slash"></i> Hesabı Sil</button>
                    </div>
                `}
            </td>
        </tr>
    `).join("");

    // 6. Render Fixture Management List
    renderAdminFixturesList();

    // 7. Render Teams Management List
    renderAdminTeamsList();
}

function renderAdminTeamsList() {
    const container = document.getElementById("admin-teams-list");
    if (!container) return;

    if (state.teams.length === 0) {
        container.innerHTML = `<tr><td colspan="4" class="text-muted text-center" style="padding:1.5rem 0;">Kayıtlı takım bulunmuyor.</td></tr>`;
        return;
    }

    container.innerHTML = state.teams.map(t => {
        const teamPlayers = state.players.filter(p => p.teamId === t.id);
        return `
            <tr>
                <td><strong>${t.shortName}</strong></td>
                <td>${t.name}</td>
                <td><span class="auth-role-badge" style="background: rgba(123,44,191,0.15); color: #9d4edd;">${teamPlayers.length} Oyuncu</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="editTeamDetails('${t.id}')"><i class="fa-solid fa-pen-to-square"></i> Düzenle</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteTeam('${t.id}')"><i class="fa-solid fa-trash"></i> Sil</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

window.editTeamDetails = function(teamId) {
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;

    document.getElementById("edit-modal-team-id").value = team.id;
    document.getElementById("edit-modal-team-name").value = team.name;
    document.getElementById("edit-modal-team-short").value = team.shortName || '';
    
    document.getElementById("team-edit-modal").classList.remove("hidden");
};

window.closeTeamEditModal = function() {
    document.getElementById("team-edit-modal").classList.add("hidden");
    document.getElementById("team-edit-form").reset();
};

function renderAdminFixturesList() {
    const container = document.getElementById("admin-fixtures-list");
    if (!container) return;

    if (state.matches.length === 0) {
        container.innerHTML = `<tr><td colspan="5" class="text-muted text-center" style="padding:1.5rem 0;">Fikstürde henüz maç bulunmuyor.</td></tr>`;
        return;
    }

    const sortedMatches = [...state.matches].sort((a, b) => a.week - b.week);

    container.innerHTML = sortedMatches.map(m => {
        const homeName = getTeamName(m.homeTeam);
        const awayName = getTeamName(m.awayTeam);
        const scoreText = m.played ? `${m.homeScore} - ${m.awayScore}` : "Oynanmadı";
        
        return `
            <tr>
                <td><strong>${m.week}. Hafta</strong></td>
                <td>${homeName}</td>
                <td>${awayName}</td>
                <td><span class="auth-role-badge" style="background: rgba(255,255,255,0.05); color: var(--accent-neon);">${scoreText}</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary btn-sm" onclick="editMatchFixture('${m.id}')"><i class="fa-solid fa-pen-to-square"></i> Düzenle</button>
                        ${m.played ? `<button class="btn btn-secondary btn-sm" onclick="resetMatchScore('${m.id}')"><i class="fa-solid fa-rotate-left"></i> Sıfırla</button>` : ''}
                        <button class="btn btn-danger btn-sm" onclick="deleteMatchFixture('${m.id}')"><i class="fa-solid fa-trash"></i> Sil</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function revertMatchStats(match) {
    if (!match.statLogs || match.statLogs.length === 0) return;
    
    match.statLogs.forEach(log => {
        const p = state.players.find(x => x.id === log.playerId);
        if (p && log.stats) {
            if (log.stats.goals) p.goals = Math.max(0, (p.goals || 0) - log.stats.goals);
            if (log.stats.assists) p.assists = Math.max(0, (p.assists || 0) - log.stats.assists);
            if (log.stats.saves) p.saves = Math.max(0, (p.saves || 0) - log.stats.saves);
            if (log.stats.tackles) p.tackles = Math.max(0, (p.tackles || 0) - log.stats.tackles);
            if (log.stats.yellowCards) p.yellowCards = Math.max(0, (p.yellowCards || 0) - log.stats.yellowCards);
            if (log.stats.redCards) p.redCards = Math.max(0, (p.redCards || 0) - log.stats.redCards);

            if (p.ratings && log.ratings) {
                if (log.ratings.sho) p.ratings.sho -= log.ratings.sho;
                if (log.ratings.pas) p.ratings.pas -= log.ratings.pas;
                if (log.ratings.pac) p.ratings.pac -= log.ratings.pac;
                if (log.ratings.def) p.ratings.def -= log.ratings.def;
                if (log.ratings.phy) p.ratings.phy -= log.ratings.phy;
                if (log.ratings.dri) p.ratings.dri -= log.ratings.dri;
            }
        }
    });
    match.statLogs = [];
}

window.deleteMatchFixture = function(matchId) {
    if (confirm("Bu maçı fikstürden kalıcı olarak silmek istediğinizden emin misiniz? (Tüm girilen oyuncu istatistikleri ve reyting artışları da geri alınacaktır!)")) {
        const match = state.matches.find(m => m.id === matchId);
        if (match) revertMatchStats(match);
        
        state.matches = state.matches.filter(m => m.id !== matchId);
        saveDatabase();
        renderAll();
        alert("Maç ve ilgili istatistikler başarıyla silindi!");
    }
};

window.resetMatchScore = function(matchId) {
    if (confirm("Bu maçın girilen skorunu sıfırlayıp oynanmadı olarak işaretlemek istiyor musunuz? (Girilen oyuncu istatistikleri de geri alınacaktır!)")) {
        const match = state.matches.find(m => m.id === matchId);
        if (match) {
            revertMatchStats(match);
            match.played = false;
            match.homeScore = 0;
            match.awayScore = 0;
            saveDatabase();
            renderAll();
            alert("Maç skoru ve istatistikler sıfırlandı!");
        }
    }
};

window.editMatchFixture = function(matchId) {
    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;

    // Prompt for new week
    const newWeekStr = prompt(`Yeni Hafta Numarasını Girin (Şu anki: ${match.week}):`, match.week);
    if (newWeekStr === null) return;
    const newWeek = parseInt(newWeekStr);
    if (isNaN(newWeek) || newWeek < 1) {
        alert("Geçersiz hafta numarası!");
        return;
    }

    // Prompt for Home Score (if already played)
    if (match.played) {
        const newHomeStr = prompt(`Yeni Ev Sahibi Skorunu Girin (Şu anki: ${match.homeScore}):`, match.homeScore);
        if (newHomeStr === null) return;
        const newAwayStr = prompt(`Yeni Deplasman Skorunu Girin (Şu anki: ${match.awayScore}):`, match.awayScore);
        if (newAwayStr === null) return;

        const newHomeScore = parseInt(newHomeStr);
        const newAwayScore = parseInt(newAwayStr);

        if (!isNaN(newHomeScore) && !isNaN(newAwayScore)) {
            match.homeScore = newHomeScore;
            match.awayScore = newAwayScore;
        }
    }

    match.week = newWeek;
    saveDatabase();
    renderAll();
    alert("Maç bilgileri başarıyla güncellendi!");
};

window.toggleUserRole = function(username) {
    const userIndex = state.users.findIndex(u => u.username === username);
    if (userIndex !== -1) {
        state.users[userIndex].role = state.users[userIndex].role === 'admin' ? 'player' : 'admin';
        saveDatabase();
        renderAll();
    }
};

window.deleteUserAccount = function(username) {
    if (username === 'admin') return;
    if (confirm(`"${username}" isimli kullanıcının hesabını ve envanterindeki tüm kartları silmek istediğinizden emin misiniz?`)) {
        // Remove from state.users
        state.users = state.users.filter(u => u.username !== username);
        // Remove their players from state.players list
        state.players = state.players.filter(p => p.username !== username);
        // Remove their market listings
        state.marketListings = state.marketListings.filter(x => x.seller !== username);
        // Remove active trade offers involving them
        state.tradeOffers = state.tradeOffers.filter(x => x.sender !== username && x.receiver !== username);

        saveDatabase();
        renderAll();
        alert("Kullanıcı ve ilişkili tüm oyuncu verileri başarıyla silindi!");
    }
};

function updateAdminMatchLabels() {
    const matchSelect = document.getElementById("admin-select-match");
    const matchId = matchSelect.value;
    const match = state.matches.find(m => m.id === matchId);

    if (match) {
        document.getElementById("admin-home-label").innerText = getTeamName(match.homeTeam);
        document.getElementById("admin-away-label").innerText = getTeamName(match.awayTeam);
        
        document.getElementById("home-scorers-list").innerHTML = "";
        document.getElementById("away-scorers-list").innerHTML = "";
        
        document.getElementById("home-scorers-title").innerText = `${getTeamShort(match.homeTeam)} Katkıları`;
        document.getElementById("away-scorers-title").innerText = `${getTeamShort(match.awayTeam)} Katkıları`;
        
        // Populate lineup checkboxes
        renderLineupCheckboxes(match.homeTeam, 'lineup-home-list', 'lineup-home-title', match);
        renderLineupCheckboxes(match.awayTeam, 'lineup-away-list', 'lineup-away-title', match);
    }
}

function renderLineupCheckboxes(teamId, containerId, titleId, match) {
    const container = document.getElementById(containerId);
    const titleEl = document.getElementById(titleId);
    if (!container) return;
    
    const teamName = getTeamName(teamId);
    if (titleEl) titleEl.innerText = `${teamName} Kadrosu`;
    
    const teamPlayers = state.players.filter(p => p.teamId === teamId && !p.isUTCard && !p.id.includes('_pack_') && !p.id.includes('_starter_'));
    
    if (teamPlayers.length === 0) {
        container.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">Bu takımda oyuncu yok</p>';
        return;
    }
    
    const posOrder = { 'kaleci': 0, 'defans': 1, 'orta_saha': 2, 'forvet': 3 };
    teamPlayers.sort((a, b) => (posOrder[a.position] || 9) - (posOrder[b.position] || 9));
    
    const posLabels = { 'kaleci': 'GK', 'defans': 'DEF', 'orta_saha': 'MF', 'forvet': 'FW' };
    
    container.innerHTML = teamPlayers.map(p => `
        <label style="display:flex;align-items:center;gap:8px;padding:4px 8px;margin:2px 0;border-radius:6px;cursor:pointer;background:var(--surface-light);font-size:0.85rem;" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background='var(--surface-light)'">
            <input type="checkbox" class="lineup-checkbox" value="${p.id}" data-team="${teamId}" checked style="width:16px;height:16px;accent-color:var(--accent-neon);">
            <span style="color:var(--text-muted);font-size:0.7rem;width:24px;">${posLabels[p.position] || '?'}</span>
            <span style="color:white;font-weight:600;">${p.name}</span>
            <span style="color:var(--accent-gold);font-size:0.75rem;margin-left:auto;">${getPlayerOVR(p)}</span>
        </label>
    `).join("");
}

function addStatRow(teamSide) {
    const matchId = document.getElementById("admin-select-match").value;
    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;

    const teamId = teamSide === 'home' ? match.homeTeam : match.awayTeam;
    const listContainer = document.getElementById(teamSide === 'home' ? "home-scorers-list" : "away-scorers-list");

    const teamPlayers = state.players.filter(p => p.teamId === teamId && !p.isUTCard && !p.id.includes('_pack_') && !p.id.includes('_starter_'));

    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `
        <select class="stat-player" required style="width: 130px;">
            <option value="">Oyuncu Seç</option>
            ${teamPlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join("")}
        </select>
        <select class="stat-type" style="width: 100px;">
            <option value="goal">Gol</option>
            <option value="assist">Asist</option>
            <option value="save">Kurtarış</option>
            <option value="tackle">Müdahale</option>
            <option value="yellow">Sarı Kart</option>
            <option value="red">Kırmızı Kart</option>
            <option value="match_points">Fantezi Puanı (Örn: 100, 300)</option>
            <option value="match_rating">Maç Reytingi (Örn: 8.2)</option>
        </select>
        <input type="number" step="0.1" class="stat-count" value="1" min="-100" max="2000" style="width: 60px;" title="Adet / Miktar">
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
    `;
    listContainer.appendChild(row);
}

// --- DYNAMIC RATINGS FORMULA ---
function applyDynamicRatings(playerId, type, count = 1) {
    const p = state.players.find(x => x.id === playerId);
    if (!p) return null;

    const r = p.ratings;
    // Helper function to safely apply changes and track the actual diff
    const applyDiff = (statName, currentVal, change) => {
        const newVal = Math.max(10, Math.min(99, currentVal + change));
        return newVal - currentVal; // Returns the actual delta applied
    };

    let changes = {
        playerId,
        type,
        count,
        stats: { goals: 0, assists: 0, saves: 0, tackles: 0, yellowCards: 0, redCards: 0 },
        ratings: { sho: 0, pas: 0, pac: 0, def: 0, phy: 0, dri: 0 }
    };

    for (let i = 0; i < count; i++) {
        if (type === "goal") {
            p.goals++;
            changes.stats.goals++;
            if (Math.random() < 0.40) {
                const diff = applyDiff('sho', r.sho, 1);
                r.sho += diff;
                changes.ratings.sho += diff;
            }
        } else if (type === "assist") {
            p.assists++;
            changes.stats.assists++;
            if (Math.random() < 0.40) {
                const diff = applyDiff('pas', r.pas, 1);
                r.pas += diff;
                changes.ratings.pas += diff;
            }
        } else if (type === "save") {
            p.saves = (p.saves || 0) + 1;
            changes.stats.saves++;
            if (Math.random() < 0.35) {
                if (p.position === 'kaleci') {
                    const diff = applyDiff('pac', r.pac, 1);
                    r.pac += diff;
                    changes.ratings.pac += diff;
                } else {
                    const diff = applyDiff('def', r.def, 1);
                    r.def += diff;
                    changes.ratings.def += diff;
                }
            }
        } else if (type === "tackle") {
            p.tackles = (p.tackles || 0) + 1;
            changes.stats.tackles++;
            if (Math.random() < 0.35) {
                const diff = applyDiff('def', r.def, 1);
                r.def += diff;
                changes.ratings.def += diff;
            }
        } else if (type === "yellow") {
            p.yellowCards++;
            changes.stats.yellowCards++;
            const diff = applyDiff('phy', r.phy, -1);
            r.phy += diff;
            changes.ratings.phy += diff;
        } else if (type === "red") {
            // Note: Since red cards don't have a count tracking on the player object currently, we treat it as an implicit property or just track ratings.
            // But we can track it in changes for completeness if we add p.redCards later.
            p.redCards = (p.redCards || 0) + 1;
            changes.stats.redCards++;
            const diffPhy = applyDiff('phy', r.phy, -2);
            r.phy += diffPhy;
            changes.ratings.phy += diffPhy;
            const diffDef = applyDiff('def', r.def, -1);
            r.def += diffDef;
            changes.ratings.def += diffDef;
        }
    }
    return changes;
}

// --- EVENTS ---
function initEventHandlers() {
    document.getElementById("prev-week-btn").onclick = () => {
        if (state.currentWeek > 1) {
            state.currentWeek--;
            renderFixtures();
        }
    };
    
    document.getElementById("next-week-btn").onclick = () => {
        const maxWeek = Math.max(...state.matches.map(m => m.week));
        if (state.currentWeek < maxWeek) {
            state.currentWeek++;
            renderFixtures();
        }
    };

    const filterButtons = document.querySelectorAll(".filter-controls .btn");
    filterButtons.forEach(btn => {
        btn.onclick = () => {
            filterButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const filterValue = btn.getAttribute("data-filter");
            const searchVal = document.getElementById("player-search").value;
            renderPlayers(filterValue, searchVal);
        };
    });

    document.getElementById("player-search").oninput = (e) => {
        const activeFilterBtn = document.querySelector(".filter-controls .btn.active");
        const filterVal = activeFilterBtn ? activeFilterBtn.getAttribute("data-filter") : "all";
        renderPlayers(filterVal, e.target.value);
    };

    document.getElementById("slot-gk").onclick = () => openDraftSelection("kaleci", "kaleci");
    document.getElementById("slot-def").onclick = () => openDraftSelection("defans", "defans");
    document.getElementById("slot-mid1").onclick = () => openDraftSelection("orta_saha_1", "orta_saha");
    document.getElementById("slot-mid2").onclick = () => openDraftSelection("orta_saha_2", "orta_saha");
    document.getElementById("slot-fwd").onclick = () => openDraftSelection("forvet", "forvet");

    document.getElementById("reset-draft-btn").onclick = () => {
        state.draftSquad = { kaleci: null, defans: null, orta_saha_1: null, orta_saha_2: null, forvet: null };
        document.getElementById("draft-selection-panel").classList.add("hidden");
        renderDraft();
    };

    document.getElementById("start-battle-btn").onclick = () => startBattle();
    document.getElementById("run-simulation-btn").onclick = () => runSimulation();

    document.getElementById("add-home-stat-row").onclick = () => addStatRow('home');
    document.getElementById("add-away-stat-row").onclick = () => addStatRow('away');

    document.getElementById("admin-select-match").onchange = () => updateAdminMatchLabels();

    document.getElementById("admin-add-match-form").onsubmit = (e) => {
        e.preventDefault();
        const week = parseInt(document.getElementById("fixture-week").value);
        const home = document.getElementById("fixture-home").value;
        const away = document.getElementById("fixture-away").value;

        if (home === away) {
            alert("Bir takım kendisiyle karşılaşamaz!");
            return;
        }

        const newMatch = {
            id: "m_" + Date.now(),
            week,
            homeTeam: home,
            awayTeam: away,
            homeScore: null,
            awayScore: null,
            played: false
        };

        state.matches.push(newMatch);
        saveDatabase();

        document.getElementById("admin-add-match-form").reset();
        alert("Maç fikstüre eklendi.");
        renderAll();
    };

    document.getElementById("admin-add-team-form").onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById("team-name-input").value.trim();
        const sName = document.getElementById("team-short-input").value.trim().toUpperCase();
        const logoFile = document.getElementById("team-logo-input").files[0];

        if (state.teams.some(t => t.name.toLowerCase() === name.toLowerCase() || t.shortName === sName)) {
            alert("Bu takım veya kısaltma zaten mevcut!");
            return;
        }

        let logoBase64 = null;
        if (logoFile) {
            try {
                logoBase64 = await resizeImageToBase64(logoFile, 150, 150);
            } catch (err) {
                alert("Logo işlenirken bir hata oluştu.");
                return;
            }
        }

        const newTeam = {
            id: "t_" + Date.now(),
            name,
            shortName: sName,
            logo: logoBase64,
            form: []
        };

        state.teams.push(newTeam);
        saveDatabase();

        document.getElementById("admin-add-team-form").reset();
        alert("Yeni takım başarıyla oluşturuldu.");
        renderAll();
    };

    document.getElementById("team-edit-form").onsubmit = async (e) => {
        e.preventDefault();
        const teamId = document.getElementById("edit-modal-team-id").value;
        const name = document.getElementById("edit-modal-team-name").value.trim();
        const sName = document.getElementById("edit-modal-team-short").value.trim().toUpperCase();
        const logoFile = document.getElementById("edit-modal-team-logo").files[0];

        const team = state.teams.find(t => t.id === teamId);
        if (!team) return;

        // Check for duplicates (excluding current team)
        if (state.teams.some(t => t.id !== teamId && (t.name.toLowerCase() === name.toLowerCase() || t.shortName === sName))) {
            alert("Bu takım veya kısaltma başka bir takımda zaten mevcut!");
            return;
        }

        let logoBase64 = team.logo; // Keep old logo if no new file is uploaded
        if (logoFile) {
            try {
                logoBase64 = await resizeImageToBase64(logoFile, 150, 150);
            } catch (err) {
                alert("Logo işlenirken bir hata oluştu.");
                return;
            }
        }

        team.name = name;
        team.shortName = sName;
        team.logo = logoBase64;

        saveDatabase();
        renderAll();
        closeTeamEditModal();
        alert("Takım bilgileri başarıyla güncellendi!");
    };

    document.getElementById("admin-edit-player-form").onsubmit = (e) => {
        e.preventDefault();
        const pId = document.getElementById("edit-select-player").value;
        const teamId = document.getElementById("edit-player-team").value;
        const position = document.getElementById("edit-player-position").value;

        const player = state.players.find(p => p.id === pId);
        if (player) {
            player.teamId = teamId;
            player.position = position;
            saveDatabase();
            alert("Oyuncu detayları başarıyla güncellendi.");
            renderAll();
        }
    };

    document.getElementById("admin-match-form").onsubmit = (e) => {
        e.preventDefault();
        
        const matchId = document.getElementById("admin-select-match").value;
        const homeScore = parseInt(document.getElementById("admin-home-score").value);
        const awayScore = parseInt(document.getElementById("admin-away-score").value);

        if (!matchId) return;

        const matchIndex = state.matches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
            state.matches[matchIndex].homeScore = homeScore;
            state.matches[matchIndex].awayScore = awayScore;
            state.matches[matchIndex].played = true;

            // Save lineup (checked players only)
            const lineupCheckboxes = document.querySelectorAll(".lineup-checkbox:checked");
            const lineup = [];
            lineupCheckboxes.forEach(cb => lineup.push(cb.value));
            state.matches[matchIndex].lineup = lineup;

            const statRows = document.querySelectorAll(".stat-row");
            let statLogs = [];
            statRows.forEach(row => {
                const playerId = row.querySelector(".stat-player").value;
                const type = row.querySelector(".stat-type").value;
                const count = parseFloat(row.querySelector(".stat-count").value) || 1;
                
                if (playerId) {
                    if (type === "match_points" || type === "match_rating") {
                        statLogs.push({ playerId, type, count });
                    } else {
                        const changes = applyDynamicRatings(playerId, type, count);
                        if (changes) statLogs.push(changes);
                    }
                }
            });
            state.matches[matchIndex].statLogs = statLogs;
            
            updateMatchValues(state.matches[matchIndex], statLogs);

            saveDatabase();
            
            document.getElementById("admin-match-form").reset();
            document.getElementById("home-scorers-list").innerHTML = "";
            document.getElementById("away-scorers-list").innerHTML = "";

            renderAll();
            switchTab("standings");
        }
    };

    document.getElementById("recalc-values-btn").onclick = () => {
        if (confirm("Geçmişteki tüm maçları inceleyerek oyuncu değerlerini baştan sona yeniden hesaplamak istiyor musunuz?")) {
            recalculateAllHistoricalValues();
        }
    };

    document.getElementById("reset-system-btn").onclick = () => {
        if (confirm("Tüm veri tabanını sıfırlamak istediğinize emin misiniz?")) {
            resetToDefault();
            loadDatabase();
            renderAll();
            switchTab("dashboard");
        }
    };
}

// --- NAVIGATION & TABS ---
function initNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const target = item.getAttribute("data-target");
            switchTab(target);
        });
    });
}

function isAccountLocked() {
    if (!state.currentUser) return false;
    if (state.currentUser.username === 'admin') return false; // Admin bypass
    const created = state.currentUser.createdAt || 0;
    const elapsed = Date.now() - created;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return elapsed < twentyFourHours;
}

function getLockoutRemainingTime() {
    if (!state.currentUser) return "";
    const created = state.currentUser.createdAt || 0;
    const remainingMs = (24 * 60 * 60 * 1000) - (Date.now() - created);
    if (remainingMs <= 0) return "";
    const hours = Math.floor(remainingMs / (3600 * 1000));
    const minutes = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
    return `${hours} saat ${minutes} dakika`;
}

window.switchTab = function(targetSectionId) {
    // 24 Hour Lockout verification
    if ((targetSectionId === 'draft' || targetSectionId === 'market') && isAccountLocked()) {
        alert(`Hesabınız yeni oluşturuldu! Ultimate Team (Draft & Mağaza) özelliklerini kullanabilmek için kaydolduktan sonra en az 24 saat geçmelidir.\n\nKalan süre: ${getLockoutRemainingTime()}`);
        return; // Block navigation
    }

    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("data-target") === targetSectionId) {
            btn.classList.add("active");
        }
    });

    document.querySelectorAll(".content-section").forEach(sec => {
        sec.classList.remove("active");
    });
    const targetSection = document.getElementById(targetSectionId);
    if (targetSection) {
        targetSection.classList.add("active");
    }

    const titleEl = document.getElementById("current-page-title");
    const subEl = document.getElementById("current-page-subtitle");
    
    switch (targetSectionId) {
        case "dashboard":
            titleEl.innerText = "FPL Market Portal";
            subEl.innerText = "Ligdeki son gelişmelere genel bir bakış.";
            break;
        case "standings":
            titleEl.innerText = "Puan Durumu";
            subEl.innerText = "Oynanan maçlar sonrası güncel lig sıralaması.";
            break;
        case "fixtures":
            titleEl.innerText = "Fikstür & Sonuçlar";
            subEl.innerText = "Haftalık maç programları ve skor tabloları.";
            break;
        case "players":
            titleEl.innerText = "Lisanslı Oyuncu Kartları";
            subEl.innerText = "FPL'de kayıtlı olan tüm kullanıcıların reyting kartları.";
            break;
        case "stats":
            titleEl.innerText = "Detaylı İstatistikler";
            subEl.innerText = "Tüm ligin oyuncu istatistikleri ve krallık yarışları.";
            break;
        case "draft":
            titleEl.innerText = "Altın Draft & Battle";
            subEl.innerText = "Kendi envanterinizden 5 kişilik kadro kurun ve savaşa katılın.";
            break;
        case "market":
            titleEl.innerText = "Mağaza & Pazar";
            subEl.innerText = "Paket açın, oyuncu alın/satın veya diğer oyuncularla takas yapın.";
            break;
        case "chat":
            titleEl.innerText = "Canlı Sohbet";
            subEl.innerText = "Ligdeki diğer oyuncularla gerçek zamanlı mesajlaşın.";
            break;
        case "admin":
            titleEl.innerText = "Yönetici Konsolu";
            subEl.innerText = "Sadece admin yetkisi olanların erişebileceği ayarlar.";
            break;
        case "news":
            titleEl.innerText = "Haberler";
            subEl.innerText = "Lig ile ilgili en son gelişmeler ve duyurular.";
            renderNews();
            break;
        case "social":
            titleEl.innerText = "Sosyal Akış (X)";
            subEl.innerText = "Lig topluluğuyla düşüncelerinizi paylaşın.";
            renderSocial();
            break;
        case "betting":
            titleEl.innerText = "Bahis Merkezi";
            subEl.innerText = "Bahise açık maçlara coin yatırın, doğru tahmin = 2x kazanç!";
            renderBetting();
            break;
        case "guesswho":
            titleEl.innerText = "Ben Kimim?";
            subEl.innerText = "Gerçek futbolcuları ipuçlarından tahmin edin.";
            initGuessWho();
            break;
    }
};

// --- IMAGE HELPER ---
function resizeImageToBase64(file, maxWidth = 150, maxHeight = 150) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/webp", 0.8));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

// --- STATS PAGE ---
function renderStatsPage() {
    const listGoals = document.getElementById("stats-list-goals");
    if (!listGoals) return;

    const generateStatHTML = (players, statKey) => {
        const sorted = [...players].filter(p => (p[statKey] || 0) > 0).sort((a, b) => (b[statKey] || 0) - (a[statKey] || 0)).slice(0, 10);
        if (sorted.length === 0) return `<p class="text-muted text-center" style="font-size: 0.9rem;">Henüz veri yok</p>`;
        
        return sorted.map((p, index) => {
            let logoHtml = "";
            if (p.teamId) {
                const t = state.teams.find(x => x.id === p.teamId);
                if (t && t.logo) logoHtml = `<img src="${t.logo}" alt="logo" style="width: 24px; height: 24px; object-fit: contain; margin-left: 8px;">`;
            }
            return `
            <div class="stat-item">
                <div class="stat-rank">${index + 1}.</div>
                ${logoHtml}
                <div class="stat-name" style="flex: 1; margin-left: 8px; font-weight: 600;">${p.name} <small style="color: rgba(255,255,255,0.4); font-weight: normal; font-size: 0.8rem;">(${p.username})</small></div>
                <div class="stat-val" style="font-weight: 800; font-size: 1.1rem; color: var(--accent-gold);">${p[statKey]}</div>
            </div>
            `;
        }).join("");
    };

    // Only fixture players (exclude UT cards)
    const fixturePlayers = state.players.filter(p => !p.isUTCard);
    document.getElementById("stats-list-goals").innerHTML = generateStatHTML(fixturePlayers, 'goals');
    document.getElementById("stats-list-assists").innerHTML = generateStatHTML(fixturePlayers, 'assists');
    document.getElementById("stats-list-saves").innerHTML = generateStatHTML(fixturePlayers, 'saves');
    document.getElementById("stats-list-tackles").innerHTML = generateStatHTML(fixturePlayers, 'tackles');
    document.getElementById("stats-list-yellow").innerHTML = generateStatHTML(fixturePlayers, 'yellowCards');
    document.getElementById("stats-list-red").innerHTML = generateStatHTML(fixturePlayers, 'redCards');
}

// --- LIVE CHAT ---
function initChatHandlers() {
    const chatForm = document.getElementById("chat-input-form");
    if (!chatForm) return;
    
    chatForm.onsubmit = (e) => {
        e.preventDefault();
        if (!state.currentUser) {
            alert("Sohbet edebilmek için giriş yapmalısınız.");
            return;
        }
        
        const input = document.getElementById("chat-input-text");
        const msg = input.value.trim();
        if (!msg) return;
        
        const newMsg = {
            id: "msg_" + Date.now(),
            sender: state.currentUser.username,
            nickname: state.currentUser.nickname,
            text: msg,
            time: Date.now()
        };
        
        state.chatMessages.push(newMsg);
        
        // Keep only last 50 messages to save space
        if (state.chatMessages.length > 50) {
            state.chatMessages = state.chatMessages.slice(state.chatMessages.length - 50);
        }
        
        saveDatabase();
        input.value = "";
        
        // Render immediately locally
        renderChat();
    };
}

function renderChat() {
    const container = document.getElementById("chat-messages-container");
    if (!container) return;
    
    if (!state.chatMessages || state.chatMessages.length === 0) {
        container.innerHTML = `<p class="text-muted text-center" style="margin-top: 2rem;">Henüz hiç mesaj yok. İlk mesajı siz gönderin!</p>`;
        return;
    }
    
    const myUsername = state.currentUser ? state.currentUser.username : null;
    
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    
    container.innerHTML = state.chatMessages.map(m => {
        const isMe = m.sender === myUsername;
        const canDelete = isMe || isAdmin;
        const cls = isMe ? "sent" : "received";
        const timeStr = new Date(m.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        
        return `
            <div class="chat-msg ${cls}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <span class="chat-sender">${m.nickname}</span>
                    ${canDelete ? `<button onclick="deleteChatMessage('${m.id}')" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; padding:0; font-size:0.8rem;"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
                <span class="chat-text">${m.text}</span>
                <span class="chat-time">${timeStr}</span>
            </div>
        `;
    }).join("");
    
    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
}

window.deleteChatMessage = function(msgId) {
    if (!confirm("Bu mesajı silmek istediğinize emin misiniz?")) return;
    state.chatMessages = state.chatMessages.filter(m => m.id !== msgId);
    saveDatabase();
    renderChat();
};

// ==========================================================================
// V4.0 MEGA UPDATE - NEW FEATURES
// ==========================================================================

// --- DELETE TEAM ---
window.deleteTeam = function(teamId) {
    const team = state.teams.find(t => t.id === teamId);
    if (!team) return;
    if (!confirm(`"${team.name}" takımını ve tüm oyuncularının takım bağlantısını silmek istediğinizden emin misiniz?`)) return;
    
    // Remove team assignment from players
    state.players.forEach(p => {
        if (p.teamId === teamId) p.teamId = null;
    });
    
    // Remove matches involving this team
    state.matches = state.matches.filter(m => m.homeTeam !== teamId && m.awayTeam !== teamId);
    
    // Remove the team
    state.teams = state.teams.filter(t => t.id !== teamId);
    
    saveDatabase();
    renderAll();
    alert(`"${team.name}" takımı başarıyla silindi!`);
};

// --- NEWS SYSTEM ---
function renderNews() {
    const container = document.getElementById("news-container");
    if (!container) return;
    
    // Show admin form if admin
    const adminForm = document.getElementById("news-admin-form");
    if (adminForm) {
        if (state.currentUser && state.currentUser.role === 'admin') {
            adminForm.classList.remove("hidden");
        } else {
            adminForm.classList.add("hidden");
        }
    }
    
    if (!state.news || state.news.length === 0) {
        container.innerHTML = `<p class="text-muted text-center" style="margin-top:2rem;">Henüz haber yayınlanmadı.</p>`;
        return;
    }
    
    const sorted = [...state.news].sort((a, b) => b.time - a.time);
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    container.innerHTML = sorted.map(n => `
        <div style="background:var(--surface-dark);border-radius:16px;overflow:hidden;border:1px solid var(--border-color);transition:transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
            ${n.image ? `<div style="position:relative;"><img src="${n.image}" alt="${n.title}" style="width:100%;max-height:280px;object-fit:cover;"></div>` : ''}
            <div style="padding:1.2rem;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:0.6rem;">
                    <i class="fa-solid fa-newspaper" style="color:var(--accent-neon);font-size:0.75rem;"></i>
                    <span style="color:var(--accent-neon);font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Haber</span>
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:auto;"><i class="fa-regular fa-calendar"></i> ${new Date(n.time).toLocaleDateString('tr-TR')} ${new Date(n.time).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                <h3 style="margin:0 0 0.6rem 0;color:white;font-size:1.2rem;font-weight:700;line-height:1.3;">${n.title}</h3>
                <p style="color:rgba(255,255,255,0.7);line-height:1.6;font-size:0.95rem;margin:0;">${n.description}</p>
            </div>
            ${isAdmin ? `<div style="padding:0 1.2rem 1rem;"><button class="btn btn-danger btn-sm" onclick="deleteNews('${n.id}')"><i class="fa-solid fa-trash"></i> Sil</button></div>` : ''}
        </div>
    `).join("");
}

function initNewsHandlers() {
    const btn = document.getElementById("news-publish-btn");
    if (!btn) return;
    btn.onclick = async () => {
        if (!state.currentUser || state.currentUser.role !== 'admin') { alert("Sadece admin haber yayınlayabilir!"); return; }
        const title = document.getElementById("news-title-input").value.trim();
        const fileInput = document.getElementById("news-image-input");
        const desc = document.getElementById("news-desc-input").value.trim();
        if (!title || !desc) { alert("Başlık ve açıklama zorunludur!"); return; }
        
        let imageData = '';
        if (fileInput && fileInput.files && fileInput.files[0]) {
            imageData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsDataURL(fileInput.files[0]);
            });
        }
        
        state.news.push({ id: "news_" + Date.now(), title, image: imageData, description: desc, time: Date.now() });
        saveDatabase();
        document.getElementById("news-title-input").value = "";
        fileInput.value = "";
        document.getElementById("news-desc-input").value = "";
        renderNews();
        alert("Haber yayınlandı!");
    };
}

window.deleteNews = function(newsId) {
    if (!confirm("Bu haberi silmek istediğinize emin misiniz?")) return;
    state.news = state.news.filter(n => n.id !== newsId);
    saveDatabase();
    renderNews();
};

// --- SOCIAL FEED (X Clone) ---
function renderSocial() {
    const container = document.getElementById("social-feed-container");
    if (!container) return;
    
    if (!state.posts || state.posts.length === 0) {
        container.innerHTML = `<p class="text-muted text-center" style="margin-top:1rem;">Henüz gönderi yok. İlk paylaşımı siz yapın!</p>`;
        return;
    }
    
    const sorted = [...state.posts].sort((a, b) => b.time - a.time);
    const isAdmin = state.currentUser && state.currentUser.role === 'admin';
    
    container.innerHTML = sorted.map(p => {
        const likes = p.likes || [];
        const dislikes = p.dislikes || [];
        const comments = p.comments || [];
        const isLiked = state.currentUser && likes.includes(state.currentUser.username);
        const isDisliked = state.currentUser && dislikes.includes(state.currentUser.username);
        
        const commentsHtml = comments.map(c => `
            <div style="background:rgba(0,0,0,0.2); padding:0.5rem; border-radius:8px; margin-top:0.5rem; font-size:0.85rem;">
                <strong style="color:var(--accent-blue);">${c.nickname}</strong>: <span style="color:var(--text-light);">${c.text}</span>
            </div>
        `).join("");
        
        return `
        <div style="background:var(--surface-dark);border-radius:12px;padding:1rem;border:1px solid var(--border-color);margin-bottom:1rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                <div>
                    <strong style="color:var(--accent-blue);">${p.nickname}</strong>
                    <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px;">@${p.sender}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="color:var(--text-muted);font-size:0.75rem;">${new Date(p.time).toLocaleDateString('tr-TR')} ${new Date(p.time).toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}</span>
                    ${isAdmin ? `<button class="btn btn-danger btn-sm" onclick="deletePost('${p.id}')" style="padding:2px 6px;font-size:0.7rem;"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            </div>
            <p style="margin:0;color:rgba(255,255,255,0.9);line-height:1.5;">${p.text}</p>
            <div style="margin-top:0.5rem;display:flex;gap:1rem;">
                <button class="btn btn-secondary btn-sm" onclick="likePost('${p.id}')" style="padding:2px 8px;font-size:0.8rem;background:transparent;border:1px solid var(--border-color);"><i class="fa-solid fa-heart" style="color:${isLiked ? '#ff4d6d' : 'var(--text-muted)'}"></i> ${likes.length}</button>
                <button class="btn btn-secondary btn-sm" onclick="dislikePost('${p.id}')" style="padding:2px 8px;font-size:0.8rem;background:transparent;border:1px solid var(--border-color);"><i class="fa-solid fa-thumbs-down" style="color:${isDisliked ? '#ff9f1c' : 'var(--text-muted)'}"></i> ${dislikes.length}</button>
            </div>
            
            <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem;">
                ${commentsHtml}
                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                    <input type="text" id="comment-input-${p.id}" placeholder="Yorum yaz..." style="flex:1; padding:0.4rem; border-radius:6px; border:1px solid var(--border-color); background:rgba(0,0,0,0.3); color:white; font-size:0.85rem;" onkeypress="if(event.key==='Enter') addComment('${p.id}')">
                    <button class="btn btn-primary btn-sm" onclick="addComment('${p.id}')" style="padding:0.4rem 0.8rem; font-size:0.85rem;">Gönder</button>
                </div>
            </div>
        </div>
        `;
    }).join("");
}

function initSocialHandlers() {
    const btn = document.getElementById("social-post-btn");
    if (!btn) return;
    btn.onclick = () => {
        if (!state.currentUser) { alert("Gönderi paylaşmak için giriş yapmalısınız!"); return; }
        const input = document.getElementById("social-post-input");
        const text = input.value.trim();
        if (!text) return;
        
        state.posts.push({
            id: "post_" + Date.now(),
            sender: state.currentUser.username,
            nickname: state.currentUser.nickname,
            text: text,
            time: Date.now(),
            likes: [],
            dislikes: [],
            comments: []
        });
        saveDatabase();
        input.value = "";
        renderSocial();
    };
}

window.deletePost = function(postId) {
    if (!confirm("Bu gönderiyi silmek istediğinize emin misiniz?")) return;
    state.posts = state.posts.filter(p => p.id !== postId);
    saveDatabase();
    renderSocial();
};

window.likePost = function(postId) {
    if (!state.currentUser) { alert("Beğenmek için giriş yapmalısınız!"); return; }
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.likes) post.likes = [];
    if (!post.dislikes) post.dislikes = [];
    
    const idx = post.likes.indexOf(state.currentUser.username);
    if (idx === -1) {
        post.likes.push(state.currentUser.username);
        // Remove from dislikes if liked
        const dIdx = post.dislikes.indexOf(state.currentUser.username);
        if (dIdx !== -1) post.dislikes.splice(dIdx, 1);
    } else {
        post.likes.splice(idx, 1);
    }
    saveDatabase();
    renderSocial();
};

window.dislikePost = function(postId) {
    if (!state.currentUser) { alert("Beğenmemek için giriş yapmalısınız!"); return; }
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.likes) post.likes = [];
    if (!post.dislikes) post.dislikes = [];
    
    const idx = post.dislikes.indexOf(state.currentUser.username);
    if (idx === -1) {
        post.dislikes.push(state.currentUser.username);
        // Remove from likes if disliked
        const lIdx = post.likes.indexOf(state.currentUser.username);
        if (lIdx !== -1) post.likes.splice(lIdx, 1);
    } else {
        post.dislikes.splice(idx, 1);
    }
    saveDatabase();
    renderSocial();
};

window.addComment = function(postId) {
    if (!state.currentUser) { alert("Yorum yapmak için giriş yapmalısınız!"); return; }
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    
    const post = state.posts.find(p => p.id === postId);
    if (!post) return;
    if (!post.comments) post.comments = [];
    
    post.comments.push({
        id: "comment_" + Date.now(),
        sender: state.currentUser.username,
        nickname: state.currentUser.nickname,
        text: text,
        time: Date.now()
    });
    
    saveDatabase();
    renderSocial();
};

// --- BETTING SYSTEM ---
function renderBetting() {
    const container = document.getElementById("betting-matches-container");
    if (!container) return;
    
    // Find matches that admin opened for betting
    const bettableMatches = state.matches.filter(m => m.bettingOpen);
    
    if (bettableMatches.length === 0) {
        container.innerHTML = `<p class="text-muted text-center" style="margin-top:2rem;">Şu anda bahise açık maç bulunmuyor. Admin tarafından açılmasını bekleyin.</p>`;
        return;
    }
    
    container.innerHTML = bettableMatches.map(m => {
        const homeName = getTeamName(m.homeTeam);
        const awayName = getTeamName(m.awayTeam);
        const homelogo = getTeamLogo(m.homeTeam);
        const awaylogo = getTeamLogo(m.awayTeam);
        const myBet = state.bets.find(b => b.matchId === m.id && state.currentUser && b.username === state.currentUser.username);
        
        let statusHTML = '';
        const isAdmin = state.currentUser && state.currentUser.role === 'admin';
        
        if (m.played) {
            // Match is finished, show result
            const result = m.homeScore > m.awayScore ? 'home' : (m.homeScore < m.awayScore ? 'away' : 'draw');
            const resultText = result === 'home' ? homeName + ' Kazandı' : result === 'away' ? awayName + ' Kazandı' : 'Beraberlik';
            
            let betDetailHTML = '';
            if (myBet) {
                const betPredText = myBet.prediction === 'home' ? homeName : myBet.prediction === 'away' ? awayName : 'Beraberlik';
                const isWin = myBet.prediction === result;
                
                betDetailHTML = `
                <div style="margin-top:0.8rem;padding:0.8rem;border-radius:10px;border:2px solid ${isWin ? 'var(--accent-neon)' : '#ff4d6d'};background:${isWin ? 'rgba(0,255,136,0.08)' : 'rgba(255,77,109,0.08)'};">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                        <div>
                            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Bahsiniz</div>
                            <div style="font-weight:bold;color:${isWin ? 'var(--accent-neon)' : '#ff4d6d'};">${isWin ? '✅' : '❌'} ${betPredText}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">Yatırılan</div>
                            <div style="font-weight:bold;color:var(--accent-gold);">${myBet.amount} Coin</div>
                        </div>
                    </div>
                    ${isWin ? (myBet.collected ? 
                        `<div style="text-align:center;margin-top:0.6rem;"><span style="color:var(--accent-neon);font-weight:bold;"><i class="fa-solid fa-circle-check"></i> ${myBet.amount * 2} Coin alındı!</span></div>` :
                        `<div style="text-align:center;margin-top:0.6rem;"><button class="btn btn-sm" onclick="collectBet('${myBet.id}')" style="background:linear-gradient(135deg,#00ff88,#00cc6a);color:black;font-weight:bold;padding:8px 20px;font-size:0.95rem;"><i class="fa-solid fa-hand-holding-dollar"></i> Parayı Al (${myBet.amount * 2} Coin)</button></div>`) 
                    : `<div style="text-align:center;margin-top:0.5rem;color:#ff4d6d;font-size:0.85rem;">Bahsinizi kaybettiniz</div>`}
                </div>`;
            }
            
            statusHTML = `<div style="text-align:center;padding:0.6rem;background:rgba(0,255,136,0.1);border-radius:8px;margin-top:0.5rem;">
                <div style="font-size:1.3rem;font-weight:800;">${m.homeScore} - ${m.awayScore}</div>
                <div style="color:var(--accent-gold);font-size:0.85rem;margin-top:2px;">${resultText}</div>
            </div>${betDetailHTML}`;
        } else if (m.matchStarted) {
            // Match is in progress - betting locked
            statusHTML = `<div style="text-align:center;padding:0.8rem;background:rgba(255,165,0,0.15);border-radius:8px;margin-top:0.5rem;border:1px solid rgba(255,165,0,0.3);">
                <i class="fa-solid fa-futbol fa-spin" style="color:orange;margin-right:6px;"></i>
                <strong style="color:orange;">Maç Oynanıyor!</strong>
                ${myBet ? '<br><span style="color:#9d4edd;font-size:0.85rem;">Bahsiniz: ' + (myBet.prediction === 'home' ? homeName : myBet.prediction === 'away' ? awayName : 'Beraberlik') + ' - ' + myBet.amount + ' Coin</span>' : '<br><span style="color:var(--text-muted);font-size:0.85rem;">Bahis süresi kapandı</span>'}
            </div>`;
        } else if (myBet) {
            statusHTML = `<div style="text-align:center;padding:0.5rem;background:rgba(123,44,191,0.15);border-radius:8px;margin-top:0.5rem;">
                <span style="color:#9d4edd;">Bahsiniz: ${myBet.prediction === 'home' ? homeName : myBet.prediction === 'away' ? awayName : 'Beraberlik'} - ${myBet.amount} Coin</span>
            </div>`;
        } else {
            statusHTML = `
            <div style="display:flex;gap:0.5rem;margin-top:0.8rem;flex-wrap:wrap;">
                <select id="bet-pred-${m.id}" style="flex:1;padding:0.5rem;background:var(--surface-light);color:white;border:1px solid var(--border-color);border-radius:8px;">
                    <option value="home">${homeName} Kazanır</option>
                    <option value="draw">Beraberlik</option>
                    <option value="away">${awayName} Kazanır</option>
                </select>
                <input type="number" id="bet-amount-${m.id}" placeholder="Coin" min="10" max="500" value="50" style="width:80px;padding:0.5rem;background:var(--surface-light);color:white;border:1px solid var(--border-color);border-radius:8px;">
                <button class="btn btn-primary btn-sm" onclick="placeBet('${m.id}')"><i class="fa-solid fa-coins"></i> Bahis Yap</button>
            </div>`;
        }
        
        // Admin: Match Started button
        let adminBtns = '';
        if (isAdmin && !m.played && m.bettingOpen) {
            adminBtns = `<div style="margin-top:0.5rem;text-align:center;">
                ${!m.matchStarted ? `<button class="btn btn-sm" onclick="startMatch('${m.id}')" style="background:orange;color:black;font-weight:bold;"><i class="fa-solid fa-play"></i> Maç Başladı</button>` : `<span style="color:orange;font-size:0.85rem;"><i class="fa-solid fa-circle-check"></i> Maç başlatıldı</span>`}
            </div>`;
        }
        
        return `
        <div style="background:var(--surface-dark);border-radius:12px;padding:1.2rem;border:1px solid var(--border-color);">
            <div style="text-align:center;color:var(--text-muted);font-size:0.8rem;margin-bottom:0.5rem;">${m.week}. Hafta</div>
            <div style="display:flex;justify-content:space-around;align-items:center;">
                <div style="text-align:center;">${homelogo}<div style="margin-top:4px;font-weight:600;">${homeName}</div></div>
                <div style="font-size:1.5rem;font-weight:800;color:var(--accent-gold);">VS</div>
                <div style="text-align:center;">${awaylogo}<div style="margin-top:4px;font-weight:600;">${awayName}</div></div>
            </div>
            ${statusHTML}
            ${adminBtns}
        </div>`;
    }).join("");
}

window.startMatch = function(matchId) {
    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;
    if (!confirm("Maçı başlatmak istediğinize emin misiniz? Bahisler kilitlenecek!")) return;
    match.matchStarted = true;
    saveDatabase();
    renderBetting();
    renderAll();
    alert("Maç başlatıldı! Bahisler kilitlendi. ⚽");
};

window.collectBet = function(betId) {
    if (!state.currentUser) return;
    const bet = state.bets.find(b => b.id === betId);
    if (!bet || bet.collected) { alert("Bu bahis zaten tahsil edildi!"); return; }
    if (bet.username !== state.currentUser.username) { alert("Bu bahis size ait değil!"); return; }
    
    // Verify the bet actually won
    const match = state.matches.find(m => m.id === bet.matchId);
    if (!match || !match.played) { alert("Maç henüz bitmedi!"); return; }
    
    const result = match.homeScore > match.awayScore ? 'home' : (match.homeScore < match.awayScore ? 'away' : 'draw');
    if (bet.prediction !== result) { alert("Bu bahisi kaybettiniz, para alınamaz!"); return; }
    
    // Give 2x coins
    const user = state.users.find(u => u.username === state.currentUser.username);
    if (user) {
        user.coins = (user.coins || 0) + (bet.amount * 2);
        state.currentUser.coins = user.coins;
    }
    bet.collected = true;
    
    saveDatabase();
    renderBetting();
    renderAll();
    alert("🎉 Tebrikler! " + (bet.amount * 2) + " Coin hesabınıza eklendi!");
};
window.placeBet = function(matchId) {
    if (!state.currentUser) { alert("Bahis yapmak için giriş yapmalısınız!"); return; }
    
    // Check if match started
    const matchCheck = state.matches.find(m => m.id === matchId);
    if (matchCheck && matchCheck.matchStarted) { alert("Maç başladı! Artık bahis yapılamaz."); return; }
    
    const predEl = document.getElementById("bet-pred-" + matchId);
    const amountEl = document.getElementById("bet-amount-" + matchId);
    if (!predEl || !amountEl) return;
    
    const prediction = predEl.value;
    const amount = parseInt(amountEl.value);
    
    if (isNaN(amount) || amount < 10 || amount > 500) { alert("Bahis miktarı 10-500 arasında olmalıdır!"); return; }
    
    const user = state.users.find(u => u.username === state.currentUser.username);
    if (!user || (user.coins || 0) < amount) { alert("Yeterli coin'iniz yok!"); return; }
    
    // Already bet?
    if (state.bets.find(b => b.matchId === matchId && b.username === state.currentUser.username)) {
        alert("Bu maça zaten bahis yaptınız!"); return;
    }
    
    user.coins -= amount;
    state.currentUser.coins = user.coins;
    
    state.bets.push({
        id: "bet_" + Date.now(),
        matchId: matchId,
        username: state.currentUser.username,
        prediction: prediction,
        amount: amount,
        resolved: false
    });
    
    saveDatabase();
    renderBetting();
    renderAll();
    alert("Bahis yapıldı! İyi şanslar! 🎲");
};

// Resolve bets when a match is played
function resolveBetsForMatch(matchId) {
    const match = state.matches.find(m => m.id === matchId);
    if (!match || !match.played) return;
    
    const result = match.homeScore > match.awayScore ? 'home' : (match.homeScore < match.awayScore ? 'away' : 'draw');
    
    state.bets.filter(b => b.matchId === matchId && !b.resolved).forEach(b => {
        b.resolved = true;
        if (b.prediction === result) {
            const user = state.users.find(u => u.username === b.username);
            if (user) {
                user.coins = (user.coins || 0) + (b.amount * 2);
                if (state.currentUser && state.currentUser.username === b.username) {
                    state.currentUser.coins = user.coins;
                }
            }
        }
    });
    saveDatabase();
}

// Admin: Toggle betting on a match
window.toggleBetting = function(matchId) {
    const match = state.matches.find(m => m.id === matchId);
    if (!match) return;
    match.bettingOpen = !match.bettingOpen;
    saveDatabase();
    renderAll();
    alert(match.bettingOpen ? "Maç bahise açıldı!" : "Maç bahise kapatıldı!");
};

// --- GUESS WHO GAME ---
const GUESSWHO_PLAYERS = [
    { name: "Gianluigi Buffon", hints: ["İtalya milli takımında 176 maça çıktım", "Parma'dan Juventus'a transfer oldum", "Kaleci pozisyonunda oynuyorum", "2006 Dünya Kupası'nı kazandım", "40 yaşından sonra bile üst düzey oynadım"] },
    { name: "Karim Benzema", hints: ["Lyon altyapısından çıktım", "Fransa milli takımından uzun süre uzak kaldım", "2022 Ballon d'Or sahibiyim", "Real Madrid'de 14 sezon oynadım", "Suudi Arabistan'a transfer oldum"] },
    { name: "Paolo Maldini", hints: ["Kariyerim boyunca sadece bir kulüpte oynadım", "Babam da aynı kulüpte oynamıştı", "Sol bek ve stoper olarak oynadım", "5 kez Şampiyonlar Ligi kazandım", "AC Milan efsanesiyim"] },
    { name: "Xavi Hernandez", hints: ["La Masia'da yetiştim", "Tiki-taka'nın mimarlarından biriyim", "İspanya ile 2010 Dünya Kupası'nı kazandım", "Al-Sadd'da oynadım", "Barcelona'nın teknik direktörü oldum"] },
    { name: "Zlatan Ibrahimovic", hints: ["İsveçli bir futbolcuyum", "11 farklı kulüpte oynadım", "Taekwondo siyah kuşak sahibiyim", "Kendimi aslan olarak tanımlarım", "Akriobatik golleriyle ünlüyüm"] },
    { name: "Andrea Pirlo", hints: ["Brescia'da kariyerime başladım", "Regista pozisyonunda oynadım", "2006 Dünya Kupası'nı kazandım", "Panenka penaltılarımla ünlüyüm", "AC Milan ve Juventus'ta oynadım"] },
    { name: "Samuel Eto'o", hints: ["Kamerun milli takımı kaptanıydım", "Barcelona'da 3 sezon oynadım", "Inter Milan'da üçlü kazandım", "Afrika'nın en iyi futbolcusu seçildim", "Mallorca'da yıldızlaştım"] },
    { name: "Didier Drogba", hints: ["Fildişi Sahili'ndenim", "Marsilya'dan transfer oldum", "Şampiyonlar Ligi finalinde penaltı attım", "Chelsea efsanesiyim", "Final maçlarında gol atmasıyla ünlüyüm"] },
    { name: "Fabio Cannavaro", hints: ["2006 Ballon d'Or'u kazanan tek defans oyuncusuyum", "İtalyan milli takımıyla Dünya Kupası kazandım", "Real Madrid'de oynadım", "Napoli altyapısından geldim", "1.76m boyuyla stoperlere meydan okudum"] },
    { name: "Ryan Giggs", hints: ["Kariyerim boyunca tek bir kulüpte oynadım", "Sol kanatta oynardım", "Premier League'de 13 şampiyonluk kazandım", "Galli bir futbolcuyum", "963 maçla kulüp rekoru kırdım"] },
    { name: "Philipp Lahm", hints: ["Alman milli takımı kaptanıydım", "Hem sağ bek hem orta saha oynadım", "2014 Dünya Kupası'nı kaldırdım", "Bayern Münih'te tüm kariyerimi geçirdim", "30 yaşında milli takımı bıraktım"] },
    { name: "Raul Gonzalez", hints: ["Real Madrid'in en genç golcüsüydüm", "Şampiyonlar Ligi'nde uzun süre gol rekorunu elinde tuttum", "İspanyol bir forvetim", "7 numarayı giydim", "Schalke 04'te de oynadım"] },
    { name: "George Best", hints: ["Kuzey İrlandalı bir futbolcuyum", "Manchester United efsanesiyim", "1968 Ballon d'Or sahibiyim", "Saha dışı yaşantısıyla da gündem oldum", "El Beatle lakabıyla tanındım"] },
    { name: "Marco van Basten", hints: ["Hollandalı bir forvetim", "1988 Avrupa Şampiyonası finalinde vole gol attım", "3 kez Ballon d'Or kazandım", "AC Milan'da oynadım", "Sakatlık yüzünden 28 yaşında emekli oldum"] },
    { name: "Socrates", hints: ["Brezilyalı bir orta saha oyuncusuyum", "Doktor diplomam var", "Corinthians Demokrasisi hareketinin lideriyim", "Topuk paslarımla ünlüyüm", "1982 Dünya Kupası'nda Brezilya'nın yıldızıydım"] },
    { name: "Ferenc Puskas", hints: ["Macar bir futbolcuyum", "Real Madrid'de de oynadım", "84 maçta 83 gol attım", "FIFA en iyi gol ödülüne adım verildi", "Galloping Major lakabıyla tanındım"] },
    { name: "Roberto Carlos", hints: ["Sol ayağımla inanılmaz frikik golleri attım", "Fransa'ya karşı fizik kurallarını çiğneyen gol attım", "Real Madrid'de 11 sezon oynadım", "Brezilyalı bir sol bekiyim", "2002 Dünya Kupası şampiyonuyum"] },
    { name: "Cafu", hints: ["Brezilyalı bir sağ bekiyim", "2 Dünya Kupası finali kazandım", "Roma ve AC Milan'da oynadım", "Pendolino lakabıyla tanındım", "Milli takımda en çok forma giyen oyuncuyum"] },
    { name: "Gheorghe Hagi", hints: ["Romanya'nın en büyük futbolcusuyum", "Galatasaray'da efsane oldum", "Real Madrid ve Barcelona'da da oynadım", "Karpatların Maradonası lakabım var", "Sol ayağımla harika goller attım"] },
    { name: "Jay-Jay Okocha", hints: ["Nijeryalı bir futbolcuyum", "Bolton Wanderers'ın efsanesiyim", "PSG'de oynadım", "O kadar iyi ki adımı iki kere söylerler", "Dribling ve frikik uzmanıyım"] }
];

let gwState = { currentPlayer: null, hintIndex: 0, score: 0, questionNum: 1, usedPlayers: [] };

function initGuessWho() {
    // 24 hour cooldown check
    if (state.currentUser) {
        const lastPlayed = state.currentUser.lastGuessWho || 0;
        const elapsed = Date.now() - lastPlayed;
        const cooldown = 24 * 60 * 60 * 1000;
        if (elapsed < cooldown && !gwState.currentPlayer) {
            const remaining = cooldown - elapsed;
            const hrs = Math.floor(remaining / (3600 * 1000));
            const mins = Math.floor((remaining % (3600 * 1000)) / (60 * 1000));
            const area = document.getElementById("gw-hint-area");
            if (area) area.innerHTML = `<div style="text-align:center;padding:2rem;"><h3 style="color:var(--accent-gold);">⏰ Bekleme Süresi</h3><p>Bu oyunu günde 1 kez oynayabilirsiniz.</p><p style="color:var(--accent-blue);font-size:1.3rem;font-weight:bold;">${hrs} saat ${mins} dakika kaldı</p></div>`;
            return;
        }
    }
    
    if (!gwState.currentPlayer || gwState.questionNum > 10) {
        gwState = { currentPlayer: null, hintIndex: 0, score: 0, questionNum: 1, usedPlayers: [] };
    }
    if (!gwState.currentPlayer) pickNewGWPlayer();
    renderGWHints();
    
    const guessBtn = document.getElementById("gw-guess-btn");
    const skipBtn = document.getElementById("gw-skip-btn");
    const input = document.getElementById("gw-guess-input");
    
    if (guessBtn) guessBtn.onclick = () => makeGuess();
    if (skipBtn) skipBtn.onclick = () => skipGW();
    if (input) input.onkeydown = (e) => { if (e.key === 'Enter') makeGuess(); };
}

function pickNewGWPlayer() {
    const available = GUESSWHO_PLAYERS.filter(p => !gwState.usedPlayers.includes(p.name));
    if (available.length === 0) {
        gwState.usedPlayers = [];
        return pickNewGWPlayer();
    }
    gwState.currentPlayer = available[Math.floor(Math.random() * available.length)];
    gwState.hintIndex = 0;
    gwState.usedPlayers.push(gwState.currentPlayer.name);
}

function renderGWHints() {
    const area = document.getElementById("gw-hint-area");
    const scoreEl = document.getElementById("gw-score");
    const qnumEl = document.getElementById("gw-question-num");
    const resultEl = document.getElementById("gw-result");
    
    if (!area || !gwState.currentPlayer) return;
    
    if (gwState.questionNum > 10) {
        // Save 24h cooldown when game finishes
        if (state.currentUser) {
            const user = state.users.find(u => u.username === state.currentUser.username);
            if (user) { 
                user.lastGuessWho = Date.now(); 
                state.currentUser.lastGuessWho = Date.now(); 
                saveDatabase(); 
            }
        }
        area.innerHTML = `<div style="text-align:center;"><h3 style="color:var(--accent-gold);">🏆 Oyun Bitti!</h3><p>Toplam Skor: <strong>${gwState.score}</strong>/10</p><p style="color:var(--text-muted);font-size:0.9rem;">Kazanılan Coin: <strong style="color:var(--accent-neon);">${gwState.score * 10}</strong></p><p style="color:var(--accent-blue);font-size:0.85rem;">Bir sonraki oyun 24 saat sonra açılacak.</p></div>`;
        return;
    }
    
    const hintsToShow = gwState.currentPlayer.hints.slice(0, gwState.hintIndex + 1);
    area.innerHTML = `<h4 style="color:var(--accent-gold);margin-bottom:1rem;">🔍 İpuçları:</h4>` +
        hintsToShow.map((h, i) => `<div style="padding:0.5rem;margin-bottom:0.3rem;background:var(--surface-light);border-radius:8px;border-left:3px solid var(--accent-blue);"><strong>${i+1}.</strong> ${h}</div>`).join("");
    
    if (scoreEl) scoreEl.textContent = gwState.score;
    if (qnumEl) qnumEl.textContent = gwState.questionNum;
    if (resultEl) resultEl.innerHTML = "";
}

function makeGuess() {
    const input = document.getElementById("gw-guess-input");
    const resultEl = document.getElementById("gw-result");
    if (!input || !gwState.currentPlayer) return;
    
    const guess = input.value.trim().toLowerCase();
    if (!guess) return;
    
    const correct = gwState.currentPlayer.name.toLowerCase();
    
    if (guess === correct || correct.includes(guess) && guess.length > 3) {
        gwState.score++;
        if (resultEl) resultEl.innerHTML = `<div style="background:rgba(0,255,136,0.15);padding:1rem;border-radius:8px;text-align:center;"><strong style="color:var(--accent-neon);">✅ Doğru! ${gwState.currentPlayer.name}</strong></div>`;
        
        // Give coins (10 per correct)
        if (state.currentUser) {
            const user = state.users.find(u => u.username === state.currentUser.username);
            if (user) { user.coins = (user.coins || 0) + 10; state.currentUser.coins = user.coins; saveDatabase(); }
        }
        
        setTimeout(() => { gwState.questionNum++; pickNewGWPlayer(); input.value = ""; renderGWHints(); }, 1500);
    } else {
        // Wrong - show next hint or reveal
        if (gwState.hintIndex < gwState.currentPlayer.hints.length - 1) {
            gwState.hintIndex++;
            if (resultEl) resultEl.innerHTML = `<div style="background:rgba(255,77,109,0.15);padding:0.5rem;border-radius:8px;text-align:center;"><span style="color:#ff4d6d;">❌ Yanlış! Bir ipucu daha açıldı.</span></div>`;
            renderGWHints();
        } else {
            if (resultEl) resultEl.innerHTML = `<div style="background:rgba(255,77,109,0.15);padding:1rem;border-radius:8px;text-align:center;"><strong style="color:#ff4d6d;">❌ Cevap: ${gwState.currentPlayer.name}</strong></div>`;
            setTimeout(() => { gwState.questionNum++; pickNewGWPlayer(); input.value = ""; renderGWHints(); }, 2000);
        }
    }
    input.value = "";
}

function skipGW() {
    const resultEl = document.getElementById("gw-result");
    if (resultEl && gwState.currentPlayer) {
        resultEl.innerHTML = `<div style="background:rgba(255,165,0,0.15);padding:0.5rem;border-radius:8px;text-align:center;"><span style="color:orange;">⏭️ Pas! Cevap: ${gwState.currentPlayer.name}</span></div>`;
    }
    setTimeout(() => { gwState.questionNum++; pickNewGWPlayer(); document.getElementById("gw-guess-input").value = ""; renderGWHints(); }, 1500);
}

window.resetGW = function() {
    // Save cooldown timestamp
    if (state.currentUser) {
        const user = state.users.find(u => u.username === state.currentUser.username);
        if (user) { user.lastGuessWho = Date.now(); state.currentUser.lastGuessWho = Date.now(); saveDatabase(); }
    }
    gwState = { currentPlayer: null, hintIndex: 0, score: 0, questionNum: 1, usedPlayers: [] };
    initGuessWho();
};

// --- PLAYER BADGES ---
function getPlayerBadges(player) {
    const badges = [];
    
    // League champion badge
    const standings = calculateStandings ? null : null;
    // Calculate standings inline
    const teamStandings = state.teams.map(t => {
        let pts = 0;
        state.matches.filter(m => m.played).forEach(m => {
            if (m.homeTeam === t.id) { if (m.homeScore > m.awayScore) pts += 3; else if (m.homeScore === m.awayScore) pts += 1; }
            if (m.awayTeam === t.id) { if (m.awayScore > m.homeScore) pts += 3; else if (m.homeScore === m.awayScore) pts += 1; }
        });
        return { id: t.id, pts };
    }).sort((a, b) => b.pts - a.pts);
    
    if (player.teamId && teamStandings.length > 0 && teamStandings[0].id === player.teamId && teamStandings[0].pts > 0) {
        badges.push({ icon: "👑", text: "Lig Lideri", color: "#ffd700" });
    }
    
    // Goal king
    const maxGoals = Math.max(...state.players.map(p => p.goals || 0));
    if ((player.goals || 0) > 0 && player.goals === maxGoals) {
        badges.push({ icon: "⚽", text: "Gol Kralı", color: "#00ff88" });
    }
    
    // Assist king
    const maxAssists = Math.max(...state.players.map(p => p.assists || 0));
    if ((player.assists || 0) > 0 && player.assists === maxAssists) {
        badges.push({ icon: "🎯", text: "Asist Kralı", color: "#4dabf7" });
    }
    
    // Top value
    const maxValue = Math.max(...state.players.map(p => p.value || 100));
    if ((player.value || 100) >= maxValue && maxValue > 100) {
        badges.push({ icon: "💎", text: "En Değerli", color: "#9d4edd" });
    }
    
    // Top OVR
    const maxOvr = Math.max(...state.players.map(p => getPlayerOVR(p)));
    if (getPlayerOVR(player) >= maxOvr) {
        badges.push({ icon: "🌟", text: "En Yüksek OVR", color: "#ffc078" });
    }
    
    return badges;
}

// --- WEEKLY TOP PLAYER WIDGET ---
function getWeeklyTopPlayer(week) {
    // Find match stats for this week with highest match_points
    const weekMatches = state.matches.filter(m => m.week === week && m.played && m.statLogs);
    let bestPlayer = null;
    let bestPoints = 0;
    let bestRating = 0;
    
    weekMatches.forEach(m => {
        (m.statLogs || []).forEach(log => {
            const pts = (log.stats && log.stats.match_points) || 0;
            const rating = (log.stats && log.stats.match_rating) || 0;
            if (pts > bestPoints || (pts === bestPoints && rating > bestRating)) {
                bestPoints = pts;
                bestRating = rating;
                const p = state.players.find(x => x.id === log.playerId);
                if (p) bestPlayer = { ...p, weekPoints: pts, weekRating: rating };
            }
        });
    });
    
    return bestPlayer;
}

function renderWeeklyTopPlayerWidget() {
    const container = document.getElementById("weekly-top-player-widget");
    if (!container) return;
    
    const currentWeek = state.currentWeek || 1;
    const topPlayer = getWeeklyTopPlayer(currentWeek);
    
    if (!topPlayer) {
        container.innerHTML = `<p class="text-muted" style="font-size:0.9rem;">Bu hafta henüz veri yok</p>`;
        return;
    }
    
    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;">
            <div style="background:linear-gradient(135deg,var(--accent-gold),#ff6b6b);width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">⭐</div>
            <div>
                <div style="font-weight:700;font-size:1.1rem;">${topPlayer.name}</div>
                <div style="color:var(--text-muted);font-size:0.85rem;">${topPlayer.weekPoints} Puan | Rating: ${topPlayer.weekRating}</div>
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <button class="btn btn-secondary btn-sm" onclick="changeWeeklyWidget(-1)" style="padding:2px 8px;">&laquo; Önceki</button>
            <span style="color:var(--accent-gold);font-weight:bold;">${currentWeek}. Hafta</span>
            <button class="btn btn-secondary btn-sm" onclick="changeWeeklyWidget(1)" style="padding:2px 8px;">Sonraki &raquo;</button>
        </div>
    `;
}

let weeklyWidgetWeek = null;
window.changeWeeklyWidget = function(direction) {
    if (weeklyWidgetWeek === null) weeklyWidgetWeek = state.currentWeek || 1;
    weeklyWidgetWeek += direction;
    if (weeklyWidgetWeek < 1) weeklyWidgetWeek = 1;
    
    const topPlayer = getWeeklyTopPlayer(weeklyWidgetWeek);
    const container = document.getElementById("weekly-top-player-widget");
    if (!container) return;
    
    if (!topPlayer) {
        container.innerHTML = `<p class="text-muted" style="font-size:0.9rem;">${weeklyWidgetWeek}. hafta verisi yok</p>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <button class="btn btn-secondary btn-sm" onclick="changeWeeklyWidget(-1)" style="padding:2px 8px;">&laquo; Önceki</button>
            <span style="color:var(--accent-gold);font-weight:bold;">${weeklyWidgetWeek}. Hafta</span>
            <button class="btn btn-secondary btn-sm" onclick="changeWeeklyWidget(1)" style="padding:2px 8px;">Sonraki &raquo;</button>
        </div>`;
        return;
    }
    
    container.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;">
            <div style="background:linear-gradient(135deg,var(--accent-gold),#ff6b6b);width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">⭐</div>
            <div>
                <div style="font-weight:700;font-size:1.1rem;">${topPlayer.name}</div>
                <div style="color:var(--text-muted);font-size:0.85rem;">${topPlayer.weekPoints} Puan | Rating: ${topPlayer.weekRating}</div>
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <button class="btn btn-secondary btn-sm" onclick="changeWeeklyWidget(-1)" style="padding:2px 8px;">&laquo; Önceki</button>
            <span style="color:var(--accent-gold);font-weight:bold;">${weeklyWidgetWeek}. Hafta</span>
            <button class="btn btn-secondary btn-sm" onclick="changeWeeklyWidget(1)" style="padding:2px 8px;">Sonraki &raquo;</button>
        </div>
    `;
};

// --- PLAYER PROFILE ENHANCEMENT (Badges + Win %) ---
const _origOpenPlayerProfile = window.openPlayerProfileModal;
window.openPlayerProfileModal = function(playerId) {
    if (typeof _origOpenPlayerProfile === 'function') {
        _origOpenPlayerProfile(playerId);
    }
    
    // Add badges
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;
    
    const badges = getPlayerBadges(player);
    const nameEl = document.getElementById("pp-player-name");
    if (nameEl && badges.length > 0) {
        const badgeHTML = badges.map(b => `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.08);padding:3px 10px;border-radius:20px;font-size:0.75rem;border:1px solid ${b.color};color:${b.color};margin-left:6px;">${b.icon} ${b.text}</span>`).join("");
        nameEl.innerHTML = `<i class="fa-solid fa-id-card"></i> ${player.name} ${badgeHTML}`;
    }
    
    // Add win percentage
    if (player.teamId) {
        const teamMatches = state.matches.filter(m => m.played && (m.homeTeam === player.teamId || m.awayTeam === player.teamId));
        const wins = teamMatches.filter(m => {
            if (m.homeTeam === player.teamId) return m.homeScore > m.awayScore;
            return m.awayScore > m.homeScore;
        }).length;
        const winPct = teamMatches.length > 0 ? Math.round((wins / teamMatches.length) * 100) : 0;
        
        // Add win % to the info cards area
        const ppValue = document.getElementById("pp-value");
        if (ppValue && ppValue.parentElement && ppValue.parentElement.parentElement) {
            const existing = document.getElementById("pp-win-pct-card");
            if (existing) existing.remove();
            
            const winCard = document.createElement("div");
            winCard.id = "pp-win-pct-card";
            winCard.style.cssText = "flex:1;min-width:140px;background:var(--surface-dark);border-radius:12px;padding:1rem;text-align:center;";
            winCard.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;">Kazanma %</div><div style="font-size:1.5rem;font-weight:bold;color:var(--accent-blue);">%${winPct}</div>`;
            ppValue.parentElement.parentElement.appendChild(winCard);
        }
    }
};

// --- ADD BETTING TOGGLE TO ADMIN FIXTURES ---
const _origRenderAdminFixtures = renderAdminFixturesList;
function renderAdminFixturesListV2() {
    _origRenderAdminFixtures();
    // Add betting toggle buttons
    const container = document.getElementById("admin-fixtures-list");
    if (!container) return;
    
    const rows = container.querySelectorAll("tr");
    const sortedMatches = [...state.matches].sort((a, b) => a.week - b.week);
    
    rows.forEach((row, idx) => {
        if (sortedMatches[idx]) {
            const m = sortedMatches[idx];
            const actionsDiv = row.querySelector("div");
            if (actionsDiv && !actionsDiv.querySelector(".bet-toggle-btn")) {
                const betBtn = document.createElement("button");
                betBtn.className = "btn btn-sm bet-toggle-btn";
                betBtn.style.cssText = m.bettingOpen ? "background:var(--accent-neon);color:black;" : "background:rgba(255,255,255,0.05);color:var(--text-muted);";
                betBtn.innerHTML = m.bettingOpen ? '<i class="fa-solid fa-dice"></i> Bahis Açık' : '<i class="fa-solid fa-dice"></i> Bahis Kapalı';
                betBtn.onclick = () => toggleBetting(m.id);
                actionsDiv.appendChild(betBtn);
            }
        }
    });
}

// Override original
window.renderAdminFixturesList = renderAdminFixturesListV2;

// --- INIT NEW FEATURES ---
const _origRenderAll = window.renderAll || function() {};

// Patch renderAll if it exists
function patchRenderAll() {
    const originalRA = window.renderAll;
    if (!originalRA) return;
    
    window.renderAll = function() {
        originalRA();
        // Render new features
        try { renderWeeklyTopPlayerWidget(); } catch(e) {}
    };
}

// Init on DOMContentLoaded
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(() => {
        initNewsHandlers();
        initSocialHandlers();
        patchRenderAll();
        
        // Add weekly widget to dashboard if not exists
        const dashboardSection = document.getElementById("dashboard");
        if (dashboardSection && !document.getElementById("weekly-top-player-widget")) {
            const widget = document.createElement("div");
            widget.className = "card mt-4";
            widget.innerHTML = `
                <div class="card-header"><h4><i class="fa-solid fa-star"></i> Haftanın Oyuncusu</h4></div>
                <div id="weekly-top-player-widget" style="padding:1rem;"></div>
            `;
            // Insert at beginning of dashboard
            dashboardSection.insertBefore(widget, dashboardSection.children[1] || null);
            renderWeeklyTopPlayerWidget();
        }
    }, 1000);
});
