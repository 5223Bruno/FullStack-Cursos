// backend_completo_merged.js
// Versão mesclada: mantém funcionalidades originais, corrige bugs, adiciona segurança e fluxos seguros.
// DEBUG: ative somente em desenvolvimento (não deixe true em produção)
const DEBUG = false;

// -----------------
// Firebase config
// -----------------
// Sua apiKey já incluída (se quiser, substitua os outros campos com os valores do seu projeto)
const firebaseConfig = {
  apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es",
  authDomain: "SEU_PROJECT.firebaseapp.com",
  projectId: "SEU_PROJECT",
  storageBucket: "SEU_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Initialize Firebase safely if SDK present
try {
  if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
    firebase.initializeApp(firebaseConfig);
    if (DEBUG) console.log('Firebase inicializado', firebaseConfig.projectId);
  }
} catch (err) {
  if (DEBUG) console.error('Erro ao inicializar Firebase:', err);
}

// -----------------
// Utilities / fixes
// -----------------

// Console guard (already used by replacing console.log calls in code)
function safeLog(...args) {
  if (typeof DEBUG !== 'undefined' && DEBUG) console.log(...args);
}

// Build Hotmart link: prefer course.hotmartId or course.productId; return null if missing
function buildHotmartLink(course) {
  const id = course && (course.hotmartId || course.productId) ? (course.hotmartId || course.productId) : null;
  if (!id) return null;
  return `https://pay.hotmart.com/${encodeURIComponent(id)}`;
}

// Unified delete helper: reauth if needed, fallback to credential prompt
async function deleteAccountFor(user = null) {
  const target = user || (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);
  if (!target) throw new Error('Nenhum usuário logado para deletar');

  try {
    await target.delete();
    safeLog('Usuário deletado:', target.uid || '(unknown uid)');
    return;
  } catch (err) {
    safeLog('Erro ao deletar (inicial):', err);
    if (err && err.code === 'auth/requires-recent-login') {
      // reauth via popup (Google) first
      try {
        if (typeof firebase === 'undefined') throw new Error('Firebase não disponível');
        const provider = new firebase.auth.GoogleAuthProvider();
        await firebase.auth().currentUser.reauthenticateWithPopup(provider);
        await firebase.auth().currentUser.delete();
        safeLog('Deletado após reauth popup');
        return;
      } catch (popupErr) {
        safeLog('Popup reauth falhou:', popupErr);
        // fallback: email/password credential prompt
        const email = firebase.auth().currentUser && firebase.auth().currentUser.email;
        if (email) {
          const password = prompt('Por favor, insira sua senha para reautenticar e permitir exclusão da conta:');
          if (!password) throw new Error('Senha não fornecida para reautenticação');
          const credential = firebase.auth.EmailAuthProvider.credential(email, password);
          try {
            await firebase.auth().currentUser.reauthenticateWithCredential(credential);
            await firebase.auth().currentUser.delete();
            safeLog('Deletado após reauth com credencial');
            return;
          } catch (credErr) {
            throw new Error('Reautenticação falhou: ' + (credErr.message || credErr));
          }
        }
        throw new Error('Reautenticação necessária, não foi possível via popup/credencial');
      }
    }
    throw err;
  }
}

// -----------------
// Course system (preserva lógica original, mas com segurança)
// -----------------
const CourseSystem = (() => {
  async function searchCourses(query) {
    try {
      if (typeof firebase === 'undefined' || !firebase.firestore) return [];
      const db = firebase.firestore();
      const q = query ? query.trim() : '';
      // keep original behavior: list courses ordered by title, limit to a reasonable amount
      const snapshot = await db.collection('courses').orderBy('title').limit(50).get();
      const results = [];
      snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
      return results.filter(c => !q || (c.title && c.title.toLowerCase().includes(q.toLowerCase())));
    } catch (e) {
      safeLog('Erro em searchCourses:', e);
      return [];
    }
  }

  return { searchCourses };
})();

// -----------------
// Frontend init: safe, non-blocking
// -----------------
document.addEventListener('DOMContentLoaded', () => {
  try {
    const searchInput = document.getElementById('courseSearch');
    const resultsEl = document.getElementById('courseResults');

    async function renderResults(list) {
      if (!resultsEl) return;
      resultsEl.innerHTML = '';
      if (!list || !list.length) { resultsEl.innerHTML = '<p>Nenhum curso encontrado.</p>'; return; }
      list.forEach(course => {
        const item = document.createElement('div');
        item.className = 'course-item';
        const a = document.createElement('a');
        const link = buildHotmartLink(course);
        a.href = link || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = course.title || 'Curso sem título';
        if (!link) a.classList.add('disabled-buy');
        item.appendChild(a);
        resultsEl.appendChild(item);
      });
    }

    if (searchInput) {
      let timeout = null;
      searchInput.addEventListener('input', async (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
          const q = e.target.value;
          const list = await CourseSystem.searchCourses(q);
          await renderResults(list);
        }, 300);
      });
    }
  } catch (err) {
    safeLog('Erro no init do frontend:', err);
  }
});

// Export helpers to window for debugging if needed (only in dev)
if (typeof window !== 'undefined' && typeof DEBUG !== 'undefined' && DEBUG) {
  window.__deleteAccountFor = deleteAccountFor;
  window.__buildHotmartLink = buildHotmartLink;
}
