const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, set } = require('firebase/database');
const crypto = require('crypto');

const firebaseConfig = {
    apiKey: 'AIzaSyDkT0xcXXf5S_bD-Dz4LFjM-_kU5qNenuA',
    authDomain: 'fpl-league-23188.firebaseapp.com',
    projectId: 'fpl-league-23188',
    storageBucket: 'fpl-league-23188.firebasestorage.app',
    messagingSenderId: '992402043869',
    appId: '1:992402043869:web:5b19e1d0e3b99b8ff7bc34',
    databaseURL: 'https://fpl-league-23188-default-rtdb.firebaseio.com'
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function migratePasswords() {
    const usersRef = ref(db, 'fpl_state/users');
    const snapshot = await get(usersRef);
    
    if (!snapshot.exists()) {
        console.log('Firebase kullanıcı verisi bulunamadı.');
        process.exit(0);
    }
    
    const users = snapshot.val();
    let modified = 0;
    
    for (let u of users) {
        if (u && u.password && u.password.length < 64) { 
            // Uzunluğu 64 karakterden kısaysa hash değildir (sha256 = 64 hex karakter)
            u.password = crypto.createHash('sha256').update(u.password).digest('hex');
            modified++;
        }
    }
    
    if (modified > 0) {
        await set(usersRef, users);
        console.log(`${modified} adet kullanıcının şifresi SHA-256 formatında şifrelendi.`);
    } else {
        console.log('Güncellenecek şifre bulunamadı (hepsi zaten şifrelenmiş).');
    }
    
    process.exit(0);
}

migratePasswords().catch(e => { console.error(e); process.exit(1); });
