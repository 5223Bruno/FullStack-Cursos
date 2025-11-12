// backend_completo_final.js
// Versão final gerada pelo assistente — contém medidas de segurança e helpers.
// DEBUG: ative apenas em desenvolvimento
const DEBUG = false; // set to true for local debugging (do NOT enable in production)

// Firebase config (insira os outros campos do seu projeto caso necessite)
const firebaseConfig = {
  apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es",
  authDomain: "SEU_PROJECT.firebaseapp.com",
  projectId: "SEU_PROJECT",
  storageBucket: "SEU_PROJECT.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Inicializa Firebase se necessário
if (typeof firebase !== 'undefined' && (!firebase.apps || !firebase.apps.length)) {
  firebase.initializeApp(firebaseConfig);
  if (DEBUG) console.log('Firebase inicializado', firebaseConfig.projectId);
}

// Helper: build Hotmart link — retorna null se não houver hotmartId
function buildHotmartLink(course) {
  const id = (course && course.hotmartId) ? course.hotmartId : null;
  if (!id) return null;
  return `https://pay.hotmart.com/${encodeURIComponent(id)}`;
}

// Unified delete helper that handles reauthentication when needed.
async function deleteAccountFor(user = null) {
  const target = user || (firebase && firebase.auth && firebase.auth().currentUser);
  if (!target) throw new Error('Nenhum usuário logado para deletar');

  try {
    await target.delete();
    if (DEBUG) console.log('Usuário deletado:', target.uid || '(unknown uid)');
    return;
  } catch (err) {
    if (DEBUG) console.log('Erro ao deletar (tentando reauth):', err);
    if (err && err.code === 'auth/requires-recent-login') {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await (firebase.auth().currentUser).reauthenticateWithPopup(provider);
        await (firebase.auth().currentUser).delete();
        if (DEBUG) console.log('Deletado após reauth popup');
        return;
      } catch (popupErr) {
        if (DEBUG) console.log('Popup reauth falhou:', popupErr);
        const email = firebase.auth().currentUser && firebase.auth().currentUser.email;
        if (email) {
          const password = prompt('Por favor, insira sua senha para reautenticar e permitir exclusão da conta:');
          if (password) {
            const credential = firebase.auth.EmailAuthProvider.credential(email, password);
            try {
              await (firebase.auth().currentUser).reauthenticateWithCredential(credential);
              await (firebase.auth().currentUser).delete();
              if (DEBUG) console.log('Deletado após reauth com credencial');
              return;
            } catch (credErr) {
              throw new Error('Reautenticação falhou: ' + (credErr.message || credErr));
            }
          } else throw new Error('Senha não fornecida para reautenticação');
        }
        throw new Error('Reautenticação necessária, mas não foi possível reautenticar via popup/credencial');
      }
    }
    throw err;
  }
}

// Sistema de cursos simples (exemplo)
const CourseSystem = (() => {
  async function searchCourses(query) {
    if (typeof firebase === 'undefined') return [];
    const db = firebase.firestore();
    const q = query ? query.trim() : '';
    const snapshot = await db.collection('courses').orderBy('title').limit(20).get();
    const results = [];
    snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results.filter(c => !q || (c.title && c.title.toLowerCase().includes(q.toLowerCase())));
  }
  return { searchCourses };
})();

// Inicialização básica do frontend
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('courseSearch');
  const resultsEl = document.getElementById('courseResults');

  async function renderResults(list) {
    resultsEl.innerHTML = '';
    if (!list.length) { resultsEl.innerHTML = '<p>Nenhum curso encontrado.</p>'; return; }
    list.forEach(course => {
      const a = document.createElement('a');
      a.href = buildHotmartLink(course) || '#';
      if (!course.hotmartId) a.classList.add('disabled-buy');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = course.title || 'Curso sem título';
      const li = document.createElement('div');
      li.className = 'course-item';
      li.appendChild(a);
      resultsEl.appendChild(li);
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
});
